import { useEffect, useState, useMemo } from 'react'
import { useStore } from '../store/useStore.js'
import { getAlerts } from '../api/apiService.js'
import { connect, getSocket } from '../api/realtimeService.js'

// ── Metadatos de tipos ────────────────────────────────────────────────────────

const TYPE_META = {
  STATE_ALERT:        { icon: '🚨', label: 'Alerta de movimiento',       color: 'var(--armed)',  cat: 'alert' },
  STATE_PURSUIT:      { icon: '🏃', label: 'Persecución activa',          color: 'var(--armed)',  cat: 'alert' },
  STATE_MOVING:       { icon: '🔄', label: 'En movimiento',               color: 'var(--orange)', cat: 'alert' },
  STATE_IDLE:         { icon: '✅', label: 'Sistema quieto',              color: 'var(--green)',  cat: 'alert' },
  ARM:                { icon: '🛡️', label: 'Armado',                     color: 'var(--blue)',   cat: 'command' },
  DISARM:             { icon: '🔓', label: 'Desarmado',                   color: 'var(--text2)', cat: 'command' },
  ENGINE_CUT:         { icon: '✂️', label: 'Motor cortado',              color: 'var(--orange)', cat: 'command' },
  ENGINE_RESTORE:     { icon: '⚡', label: 'Motor restaurado',            color: 'var(--green)',  cat: 'command' },
  SIREN_ON:           { icon: '🔔', label: 'Sirena activada',             color: 'var(--orange)', cat: 'command' },
  SIREN_OFF:          { icon: '🔕', label: 'Sirena apagada',              color: 'var(--text2)', cat: 'command' },
  PURSUIT_CONFIRM:    { icon: '🚨', label: 'Persecución confirmada',      color: 'var(--armed)',  cat: 'command' },
  ALERT_CMD:          { icon: '⚠️', label: 'Alerta remota',              color: 'var(--orange)', cat: 'command' },
  SENSITIVITY_CHANGE: { icon: '🎚️', label: 'Sensibilidad cambiada',     color: 'var(--text2)', cat: 'config' },
  GEOFENCE_ARM:       { icon: '📍', label: 'Modo parqueadero activado',   color: '#2196F3',      cat: 'geofence' },
  GEOFENCE_EXIT:      { icon: '🚨', label: 'Moto salió de geocerca',      color: 'var(--armed)',  cat: 'geofence' },
  RISK_ZONE_ENTER:    { icon: '⚠️', label: 'Entró a zona de riesgo',    color: 'var(--orange)', cat: 'risk' },
  RISK_ZONE_EXIT:     { icon: '✅', label: 'Salió de zona de riesgo',     color: 'var(--green)',  cat: 'risk' },
  ALERT_ACKNOWLEDGED: { icon: '👁️', label: 'Alerta revisada',           color: 'var(--text3)', cat: 'audit' },
}

const PLATFORM_LABEL = {
  app:               '📱 App',
  web:               '💻 Web',
  system:            '🤖 Sistema',
  monitoring_center: '🏢 Central',
}

const CATEGORIES = [
  { id: 'alert',    label: 'Alertas' },
  { id: 'command',  label: 'Comandos' },
  { id: 'config',   label: 'Configuración' },
  { id: 'geofence', label: 'Geocerca' },
  { id: 'risk',     label: 'Zonas de riesgo' },
  { id: 'audit',    label: 'Auditoría' },
]

const PLATFORMS = [
  { id: 'device', label: '📡 Dispositivo' },
  { id: 'app',    label: '📱 App' },
  { id: 'web',    label: '💻 Web' },
  { id: 'system', label: '🤖 Sistema' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function eventLabel(a) {
  if (a.type === 'SENSITIVITY_CHANGE' && a.meta?.sensitivityLabel) {
    return `Sensibilidad → ${a.meta.sensitivityLabel}`
  }
  const m = TYPE_META[a.type]
  if ((a.type === 'RISK_ZONE_ENTER' || a.type === 'RISK_ZONE_EXIT') && a.meta?.localidad) {
    return `${m?.label} — ${a.meta.localidad}`
  }
  return m?.label ?? a.type
}

function eventActor(a) {
  if (a.source === 'device') return '📡 Dispositivo'
  if (a.source === 'system') return '🤖 Sistema'
  if (!a.actor?.userId) return null
  const plat  = PLATFORM_LABEL[a.actor.platform] ?? a.actor.platform ?? ''
  const email = a.actor.userEmail ?? ''
  return `${email}${plat ? ' · ' + plat : ''}`
}

function eventContext(a) {
  if ((a.type === 'GEOFENCE_ARM' || a.type === 'GEOFENCE_EXIT') && a.meta?.geofenceRadius) {
    return `Radio: ${a.meta.geofenceRadius} m`
  }
  if ((a.type === 'RISK_ZONE_ENTER' || a.type === 'RISK_ZONE_EXIT') && a.meta?.ari != null) {
    return `ARI ${a.meta.ari}`
  }
  return null
}

function getPlatformId(a) {
  if (a.source === 'device') return 'device'
  return a.actor?.platform ?? a.source ?? 'system'
}

// ── Chip de filtro ────────────────────────────────────────────────────────────

function FilterChip({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '5px 11px',
      borderRadius: 20,
      border: active ? '1px solid var(--orange)' : '1px solid var(--border)',
      background: active ? 'rgba(255,107,53,0.12)' : 'var(--card-alt)',
      color: active ? 'var(--orange)' : 'var(--text2)',
      fontSize: 12, fontWeight: active ? 600 : 400,
      cursor: 'pointer',
      transition: 'all 0.15s',
      whiteSpace: 'nowrap',
      flexShrink: 0,
    }}>{label}</button>
  )
}

// ── Fila de evento ────────────────────────────────────────────────────────────

function AlertRow({ alert: a }) {
  const meta    = TYPE_META[a.type]
  const icon    = meta?.icon ?? '📍'
  const color   = meta?.color ?? 'var(--text2)'
  const label   = eventLabel(a)
  const actor   = eventActor(a)
  const context = eventContext(a)
  const ackBy   = a.acknowledgedBy?.userEmail
    ? `${a.acknowledgedBy.userEmail}${a.acknowledgedBy.platform ? ' · ' + (PLATFORM_LABEL[a.acknowledgedBy.platform] ?? a.acknowledgedBy.platform) : ''}`
    : null
  const ts = a.timestamp ? new Date(a.timestamp) : null

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      padding: '12px 16px',
      borderBottom: '1px solid var(--border-sub)',
    }}>
      {/* Icono */}
      <div style={{
        width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16,
        opacity: a.acknowledged ? 0.65 : 1,
      }}>{icon}</div>

      {/* Contenido */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 600,
          color: a.acknowledged ? 'var(--text1)' : color,
          marginBottom: 2,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{label}</div>

        {actor && (
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 1 }}>{actor}</div>
        )}
        {context && (
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 1 }}>{context}</div>
        )}
        {ackBy && (
          <div style={{ fontSize: 10, color: 'var(--text3)', fontStyle: 'italic', marginBottom: 1 }}>
            Revisado por {ackBy}
          </div>
        )}
        <div style={{ fontSize: 10, color: 'var(--text3)' }}>
          {ts
            ? ts.toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
            : '—'}
        </div>
      </div>

      {/* Badge NUEVO */}
      {a.acknowledged === false && (
        <span style={{
          padding: '2px 7px', borderRadius: 4, flexShrink: 0,
          fontSize: 9, fontWeight: 700, letterSpacing: '0.5px',
          background: 'var(--armed-10)', color: 'var(--armed)',
          border: '1px solid rgba(229,72,77,0.3)', marginTop: 2,
        }}>NUEVO</span>
      )}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function HistoryPage() {
  const { deviceId } = useStore()

  const [all, setAll]               = useState([])
  const [loading, setLoading]       = useState(true)
  const [catFilter, setCatFilter]   = useState(new Set())      // vacío = todos
  const [platFilter, setPlatFilter] = useState(new Set())      // vacío = todos

  useEffect(() => {
    if (!deviceId) return
    setLoading(true)
    getAlerts(deviceId, 100)
      .then(({ data }) => setAll(Array.isArray(data) ? data : []))
      .catch(() => setAll([]))
      .finally(() => setLoading(false))

    const handleAlert = (data) => {
      if (data.deviceId === deviceId) setAll(prev => [data, ...prev].slice(0, 200))
    }
    connect(null, null, handleAlert)
    return () => { getSocket()?.off('alert:new', handleAlert) }
  }, [deviceId]) // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() => all.filter(a => {
    if (catFilter.size > 0) {
      const cat = TYPE_META[a.type]?.cat
      if (!catFilter.has(cat)) return false
    }
    if (platFilter.size > 0) {
      if (!platFilter.has(getPlatformId(a))) return false
    }
    return true
  }), [all, catFilter, platFilter])

  const toggleCat  = (id) => setCatFilter(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  const togglePlat = (id) => setPlatFilter(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  const clearAll   = () => { setCatFilter(new Set()); setPlatFilter(new Set()) }

  const hasFilter = catFilter.size > 0 || platFilter.size > 0

  return (
    <div style={{ padding: '20px 16px 40px', maxWidth: 680, margin: '0 auto', background: 'var(--bg)', minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text1)' }}>Historial</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text2)' }}>
          Trazabilidad completa — alertas, comandos y eventos del sistema
        </p>
      </div>

      {/* Filtros */}
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 14, padding: '12px 14px', marginBottom: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', letterSpacing: '0.8px' }}>
            FILTRAR POR TIPO
          </span>
          {hasFilter && (
            <button onClick={clearAll} style={{
              fontSize: 11, color: 'var(--orange)', background: 'none',
              border: 'none', cursor: 'pointer', padding: 0,
            }}>Limpiar filtros</button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {CATEGORIES.map(c => (
            <FilterChip key={c.id} label={c.label} active={catFilter.has(c.id)} onClick={() => toggleCat(c.id)} />
          ))}
        </div>

        <div style={{ margin: '10px 0 8px', borderTop: '1px solid var(--border-sub)' }} />

        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', letterSpacing: '0.8px', marginBottom: 8 }}>
          FILTRAR POR RESPONSABLE
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {PLATFORMS.map(p => (
            <FilterChip key={p.id} label={p.label} active={platFilter.has(p.id)} onClick={() => togglePlat(p.id)} />
          ))}
        </div>
      </div>

      {/* Contador */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{
          padding: '4px 10px', borderRadius: 20,
          background: 'var(--blue-10)', border: '1px solid var(--blue-20)',
          fontSize: 12, fontWeight: 600, color: 'var(--blue)',
        }}>
          {visible.length} evento{visible.length !== 1 ? 's' : ''}
          {hasFilter ? ' · filtrado' : ''}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text3)' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
          Tiempo real activo
        </div>
      </div>

      {/* Lista */}
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 14, overflow: 'hidden',
      }}>
        {loading ? (
          <div style={{ padding: '48px 20px', textAlign: 'center', fontSize: 13, color: 'var(--text3)' }}>
            Cargando historial…
          </div>
        ) : visible.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--text2)', fontWeight: 500 }}>
              {hasFilter ? 'Sin resultados para estos filtros' : 'Sin eventos registrados'}
            </p>
            {hasFilter && (
              <button onClick={clearAll} style={{
                marginTop: 10, fontSize: 12, color: 'var(--orange)',
                background: 'none', border: 'none', cursor: 'pointer',
              }}>Quitar filtros</button>
            )}
          </div>
        ) : (
          <>
            {visible.map((a) => <AlertRow key={a._id ?? a.id} alert={a} />)}
            <div style={{
              padding: '12px 16px', fontSize: 11, color: 'var(--text3)',
              textAlign: 'center', borderTop: '1px solid var(--border-sub)',
            }}>
              Mostrando {visible.length} de {all.length} eventos
            </div>
          </>
        )}
      </div>
    </div>
  )
}
