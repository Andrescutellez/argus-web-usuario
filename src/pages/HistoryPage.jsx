import { useEffect } from 'react'
import { useStore } from '../store/useStore.js'
import { getAlerts } from '../api/apiService.js'
import { connect, getSocket } from '../api/realtimeService.js'

const TYPE_META = {
  STATE_ALERT:   { label: 'Alerta de seguridad', color: 'var(--armed)',  bg: 'var(--armed-10)',  icon: '🔔' },
  STATE_PURSUIT: { label: 'Persecución',          color: 'var(--red)',    bg: 'var(--armed-10)',  icon: '🚨' },
  STATE_MOVING:  { label: 'En movimiento',        color: 'var(--orange)', bg: 'var(--orange-10)', icon: '⚡' },
  STATE_IDLE:    { label: 'Detenido',             color: 'var(--text2)',  bg: 'var(--card-alt)',  icon: '⏹' },
  ARM:           { label: 'Sistema armado',       color: 'var(--blue)',   bg: 'var(--blue-10)',   icon: '🛡️' },
  DISARM:        { label: 'Sistema desarmado',    color: 'var(--text2)',  bg: 'var(--card-alt)',  icon: '🔓' },
  ALERT_CMD:     { label: 'Alerta remota',        color: 'var(--armed)',  bg: 'var(--armed-10)',  icon: '📡' },
  ENGINE_CUT:    { label: 'Corte de motor',       color: 'var(--red)',    bg: 'var(--armed-10)',  icon: '✂️' },
}

function AlertRow({ alert }) {
  const meta = TYPE_META[alert.type] ?? { label: alert.type, color: 'var(--text2)', bg: 'var(--card-alt)', icon: '•' }
  const time = new Date(alert.timestamp)

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      padding: '14px 16px',
      borderBottom: '1px solid var(--border-sub)',
    }}>
      {/* Icono */}
      <div style={{
        width: 36, height: 36,
        borderRadius: '50%',
        background: meta.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16, flexShrink: 0,
      }}>{meta.icon}</div>

      {/* Contenido */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: meta.color }}>{meta.label}</span>
          <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>
            {time.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        {alert.message && (
          <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text2)' }}>{alert.message}</p>
        )}
        {alert.deviceId && (
          <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text3)', fontFamily: 'monospace' }}>
            {alert.deviceId}
          </p>
        )}
      </div>
    </div>
  )
}

export default function HistoryPage() {
  const { alerts, setAlerts, addAlert, deviceId } = useStore()

  useEffect(() => {
    getAlerts(deviceId, 100).then((r) => setAlerts(r.data)).catch(() => {})

    const handleAlert = (data) => { if (data.deviceId === deviceId) addAlert(data) }
    connect(null, null, handleAlert)
    return () => { getSocket()?.off('alert:new', handleAlert) }
  }, [deviceId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ padding: 24, maxWidth: 680, background: 'var(--bg)', minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text1)' }}>Historial</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text2)' }}>
          Eventos y alertas del dispositivo
        </p>
      </div>

      {/* Contador */}
      {alerts.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          marginBottom: 14,
        }}>
          <div style={{
            padding: '4px 10px',
            borderRadius: 20,
            background: 'var(--blue-10)',
            border: '1px solid var(--blue-20)',
            fontSize: 12, fontWeight: 600,
            color: 'var(--blue)',
          }}>{alerts.length} eventos</div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 12, color: 'var(--text3)',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)' }} />
            Tiempo real activo
          </div>
        </div>
      )}

      {/* Lista */}
      <div style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        overflow: 'hidden',
      }}>
        {alerts.length === 0 ? (
          <div style={{
            padding: '48px 20px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--text2)', fontWeight: 500 }}>
              Sin eventos registrados
            </p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text3)' }}>
              Los eventos del dispositivo aparecerán aquí
            </p>
          </div>
        ) : (
          <>
            {alerts.map((a) => (
              <AlertRow key={a._id ?? a.id} alert={a} />
            ))}
            {/* Footer */}
            <div style={{
              padding: '12px 16px',
              fontSize: 11,
              color: 'var(--text3)',
              textAlign: 'center',
              borderTop: '1px solid var(--border-sub)',
            }}>
              Mostrando los últimos {alerts.length} eventos · Historial completo en la app móvil
            </div>
          </>
        )}
      </div>
    </div>
  )
}
