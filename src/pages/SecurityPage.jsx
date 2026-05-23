import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { getDeviceStatus, sendCommand } from '../api/apiService.js'

const STATE_META = {
  STATE_IDLE:    { label: 'Inactivo',       color: 'var(--text2)',  bg: 'var(--card-alt)' },
  STATE_MOVING:  { label: 'En movimiento',  color: 'var(--orange)', bg: 'var(--orange-10)' },
  STATE_ALERT:   { label: 'ALERTA',         color: 'var(--armed)',  bg: 'var(--armed-10)' },
  STATE_PURSUIT: { label: 'PERSECUCIÓN',    color: 'var(--red)',    bg: 'var(--armed-10)' },
}

// ── Componentes auxiliares ───────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 600, letterSpacing: '1.2px',
      color: 'var(--text3)', marginBottom: 10,
    }}>{children}</div>
  )
}

function Card({ children, style }) {
  return (
    <div style={{
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 14,
      ...style,
    }}>{children}</div>
  )
}

function InfoRow({ label, children, last }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 16px',
      borderBottom: last ? 'none' : '1px solid var(--border-sub)',
    }}>
      <span style={{ fontSize: 13, color: 'var(--text2)' }}>{label}</span>
      {children}
    </div>
  )
}

function CmdBtn({ label, icon, color, bg, border, loading, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        flex: 1, padding: '12px 16px',
        borderRadius: 12,
        border: `1px solid ${border || 'var(--border)'}`,
        background: bg || 'var(--card-alt)',
        color: color || 'var(--text1)',
        fontSize: 13, fontWeight: 600,
        cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.5 : 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        transition: 'opacity 0.15s',
      }}
    >
      {loading ? '…' : <>{icon && <span>{icon}</span>}{label}</>}
    </button>
  )
}

// ── Página principal ─────────────────────────────────────────────────────────

export default function SecurityPage() {
  const { status, setStatus, deviceId, addAlert } = useStore()
  const [loading, setLoading]       = useState(false)
  const [cmdLoading, setCmdLoading] = useState(null)
  const [lastResult, setLastResult] = useState(null)

  const fetchStatus = async () => {
    try {
      const { data } = await getDeviceStatus(deviceId)
      setStatus(data)
    } catch { /* offline */ }
  }

  useEffect(() => {
    setLoading(true)
    fetchStatus().finally(() => setLoading(false))
    const iv = setInterval(fetchStatus, 15000)
    return () => clearInterval(iv)
  }, [deviceId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCommand = async (command) => {
    setCmdLoading(command)
    setLastResult(null)
    try {
      const { data } = await sendCommand(deviceId, command)
      setLastResult(data.delivered
        ? { ok: true, msg: `✓ Comando ${command} entregado al dispositivo` }
        : { ok: false, msg: `⚡ Dispositivo offline. Comando ${command} encolado.` }
      )
      addAlert({ id: Date.now(), type: command, timestamp: new Date().toISOString() })
    } catch {
      setLastResult({ ok: false, msg: '✗ Error de conexión con el servidor' })
    } finally {
      setCmdLoading(null)
    }
  }

  const connected  = status?.connected
  const armed      = status?.armed ?? false
  const stateMeta  = STATE_META[status?.state] ?? STATE_META.STATE_IDLE

  return (
    <div style={{
      padding: 24,
      maxWidth: 680,
      background: 'var(--bg)',
      minHeight: '100vh',
    }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text1)' }}>Seguridad</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text2)' }}>
          Control remoto del dispositivo Argus
        </p>
      </div>

      {/* ── Estado del dispositivo ── */}
      <SectionLabel>ESTADO DEL DISPOSITIVO</SectionLabel>
      <Card style={{ marginBottom: 20 }}>
        {loading ? (
          <div style={{ padding: 20, fontSize: 13, color: 'var(--text3)' }}>Cargando…</div>
        ) : (
          <>
            <InfoRow label="Conexión">
              <span style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 13, fontWeight: 600,
                color: connected ? 'var(--green)' : 'var(--text3)',
              }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: connected ? 'var(--green)' : 'var(--text3)' }} />
                {connected ? 'Conectado' : 'Offline'}
              </span>
            </InfoRow>

            <InfoRow label="Estado">
              <span style={{
                padding: '3px 10px', borderRadius: 6,
                fontSize: 12, fontWeight: 600,
                background: stateMeta.bg,
                color: stateMeta.color,
              }}>{stateMeta.label}</span>
            </InfoRow>

            <InfoRow label="Sistema">
              <span style={{
                padding: '3px 10px', borderRadius: 6,
                fontSize: 12, fontWeight: 700,
                background: armed ? 'var(--armed-10)' : 'var(--card-alt)',
                color: armed ? 'var(--armed)' : 'var(--text2)',
                border: `1px solid ${armed ? 'rgba(229,72,77,0.3)' : 'var(--border)'}`,
              }}>{armed ? '● Armado' : '○ Desarmado'}</span>
            </InfoRow>

            <InfoRow label="Última vez visto">
              <span style={{ fontSize: 13, color: 'var(--text1)' }}>
                {status?.lastSeen ? new Date(status.lastSeen).toLocaleString('es-PE') : '—'}
              </span>
            </InfoRow>

            <InfoRow label="Posición" last>
              <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text1)' }}>
                {status?.lat && status?.lon
                  ? `${status.lat.toFixed(5)}, ${status.lon.toFixed(5)}`
                  : '—'}
              </span>
            </InfoRow>
          </>
        )}
      </Card>

      {/* ── Comandos remotos ── */}
      <SectionLabel>COMANDOS REMOTOS</SectionLabel>
      <Card style={{ padding: 16, marginBottom: 20 }}>
        {/* Armar / Desarmar */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <CmdBtn
            label="Armar"
            icon="🛡️"
            color="#fff"
            bg="var(--blue)"
            border="transparent"
            loading={cmdLoading === 'ARM'}
            onClick={() => handleCommand('ARM')}
          />
          <CmdBtn
            label="Desarmar"
            icon="🔓"
            loading={cmdLoading === 'DISARM'}
            onClick={() => handleCommand('DISARM')}
          />
        </div>

        {/* Alarma / Motor */}
        <div style={{ display: 'flex', gap: 10 }}>
          <CmdBtn
            label="Activar alarma"
            icon="🔔"
            color="var(--armed)"
            bg="var(--armed-10)"
            border="rgba(229,72,77,0.3)"
            loading={cmdLoading === 'ALERT'}
            onClick={() => handleCommand('ALERT')}
          />
          <CmdBtn
            label="Cortar motor"
            icon="✂️"
            loading={cmdLoading === 'ENGINE_CUT'}
            onClick={() => handleCommand('ENGINE_CUT')}
          />
        </div>

        {/* Feedback */}
        {lastResult && (
          <div style={{
            marginTop: 12,
            padding: '10px 14px',
            borderRadius: 10,
            fontSize: 13,
            background: lastResult.ok ? 'var(--green-10)' : 'var(--armed-10)',
            border: `1px solid ${lastResult.ok ? 'rgba(63,185,80,0.3)' : 'rgba(229,72,77,0.3)'}`,
            color: lastResult.ok ? 'var(--green)' : 'var(--armed)',
          }}>{lastResult.msg}</div>
        )}
      </Card>

      {/* ── Confirmar robo ── */}
      <SectionLabel>EMERGENCIA</SectionLabel>
      <Card style={{
        padding: 20,
        borderColor: 'rgba(229,72,77,0.3)',
        background: 'var(--armed-10)',
      }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 28 }}>🚨</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--armed)', marginBottom: 4 }}>
              Confirmar robo en curso
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14, lineHeight: 1.5 }}>
              Activa GPS continuo y corte de motor automático.
              Solo usar si el robo está confirmado.
            </div>
            <button
              onClick={() => handleCommand('ENGINE_CUT')}
              disabled={!!cmdLoading}
              style={{
                width: '100%', padding: '11px 0',
                borderRadius: 10,
                border: '1px solid var(--armed)',
                background: 'transparent',
                color: 'var(--armed)',
                fontSize: 14, fontWeight: 700,
                cursor: cmdLoading ? 'not-allowed' : 'pointer',
                opacity: cmdLoading ? 0.5 : 1,
                letterSpacing: '0.5px',
              }}
            >CONFIRMAR PERSECUCIÓN</button>
          </div>
        </div>
      </Card>
    </div>
  )
}
