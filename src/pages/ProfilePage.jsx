import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { getMotos } from '../api/apiService.js'
import api from '../api/apiService.js'

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 600, letterSpacing: '1.2px',
      color: 'var(--text3)', marginBottom: 10,
    }}>{children}</div>
  )
}

function Card({ children }) {
  return (
    <div style={{
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 14,
    }}>{children}</div>
  )
}

function InfoRow({ icon, label, value, last }) {
  if (!value) return null
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      padding: '12px 16px',
      borderBottom: last ? 'none' : '1px solid var(--border-sub)',
      gap: 10,
    }}>
      {icon && <span style={{ fontSize: 16 }}>{icon}</span>}
      <span style={{ fontSize: 13, color: 'var(--text2)', flex: 1 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text1)' }}>{value}</span>
    </div>
  )
}

export default function ProfilePage() {
  const { user, deviceId, logout, theme, setTheme } = useStore()
  const [motos, setMotos]     = useState([])
  const [plan, setPlan]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.allSettled([
      getMotos().then(({ data }) => setMotos(data)),
      api.get('/api/subscriptions/me').then(({ data }) => setPlan(data)),
    ]).finally(() => setLoading(false))
  }, [])

  const isDark  = theme === 'dark'
  const initial = (user?.email?.[0] ?? '?').toUpperCase()
  const planLabel = plan?.plan ?? 'FREEMIUM'
  const isPremium = planLabel === 'PREMIUM'

  return (
    <div style={{ padding: 24, maxWidth: 640, background: 'var(--bg)', minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text1)' }}>
          Perfil y configuración
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text2)' }}>
          Cuenta, moto y dispositivo Argus
        </p>
      </div>

      {/* ── Mi cuenta ── */}
      <SectionLabel>MI CUENTA</SectionLabel>
      <Card>
        <div style={{ padding: '16px 16px 14px', display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* Avatar */}
          <div style={{
            width: 48, height: 48,
            borderRadius: '50%',
            background: 'var(--blue-10)',
            border: '1px solid var(--blue-20)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, fontWeight: 700, color: 'var(--blue)',
            flexShrink: 0,
          }}>{initial}</div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 14, fontWeight: 600, color: 'var(--text1)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{user?.email}</div>
            <div style={{ marginTop: 4 }}>
              <span style={{
                display: 'inline-block',
                padding: '2px 8px',
                borderRadius: 6,
                fontSize: 11, fontWeight: 600,
                background: isPremium ? 'var(--blue-10)' : 'var(--card-alt)',
                border: isPremium ? '1px solid var(--blue-20)' : '1px solid var(--border)',
                color: isPremium ? 'var(--blue)' : 'var(--text3)',
              }}>{planLabel}</span>
            </div>
          </div>
        </div>
      </Card>

      <div style={{ marginBottom: 20 }} />

      {/* ── Apariencia ── */}
      <SectionLabel>APARIENCIA</SectionLabel>
      <Card>
        <div style={{
          padding: '14px 16px',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{
            width: 40, height: 40,
            borderRadius: 10,
            background: 'var(--blue-10)',
            border: '1px solid var(--blue-20)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20,
          }}>{isDark ? '🌑' : '☀️'}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text1)' }}>Modo oscuro</div>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>{isDark ? 'Activado' : 'Desactivado'}</div>
          </div>
          {/* Toggle switch */}
          <div
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            style={{
              width: 50, height: 28,
              borderRadius: 14,
              background: isDark ? 'var(--blue)' : 'var(--border)',
              position: 'relative',
              cursor: 'pointer',
              transition: 'background 0.22s',
              flexShrink: 0,
            }}
          >
            <div style={{
              width: 22, height: 22,
              borderRadius: '50%',
              background: '#fff',
              position: 'absolute',
              top: 3,
              left: isDark ? 25 : 3,
              transition: 'left 0.22s',
              boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
            }} />
          </div>
        </div>
      </Card>

      <div style={{ marginBottom: 20 }} />

      {/* ── Mi moto ── */}
      <SectionLabel>MI MOTO</SectionLabel>
      {loading ? (
        <Card>
          <div style={{ padding: '16px', fontSize: 13, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 16, height: 16, borderRadius: '50%',
              border: '2px solid var(--blue)',
              borderTopColor: 'transparent',
              animation: 'spin 0.8s linear infinite',
            }} />
            Cargando datos de la moto…
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </Card>
      ) : motos.length > 0 ? motos.map((moto) => (
        <Card key={moto.id}>
          <InfoRow icon="🏷️" label="Apodo"   value={moto.alias}  />
          <InfoRow icon="🪪" label="Placa"   value={moto.placa}  />
          <InfoRow icon="🏭" label="Marca"   value={moto.marca}  />
          <InfoRow icon="🏍️" label="Modelo"  value={moto.modelo} />
          <InfoRow icon="🎨" label="Color"   value={moto.color}  />
          <InfoRow icon="📅" label="Año"     value={moto.anio}   />
          <InfoRow
            icon="📡" label="Dispositivo Argus"
            value={moto.device_id ?? deviceId}
            last
          />
        </Card>
      )) : (
        <Card>
          <div style={{ padding: '24px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>🏍️</div>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text3)' }}>Sin moto registrada</p>
          </div>
        </Card>
      )}

      <div style={{ marginBottom: 20 }} />

      {/* ── Suscripción ── */}
      {plan && (
        <>
          <SectionLabel>SUSCRIPCIÓN</SectionLabel>
          <Card>
            <InfoRow icon="⭐" label="Plan activo" value={plan.plan} />
            <InfoRow icon="✓"  label="Estado"      value={plan.status} />
            {plan.expires_at && (
              <InfoRow
                icon="📅" label="Vence"
                value={new Date(plan.expires_at).toLocaleDateString('es-CO', {
                  year: 'numeric', month: 'long', day: 'numeric',
                })}
                last
              />
            )}
          </Card>
          <div style={{ marginBottom: 20 }} />
        </>
      )}

      {/* ── Cerrar sesión ── */}
      <SectionLabel>CUENTA</SectionLabel>
      <button
        onClick={logout}
        style={{
          width: '100%', padding: '13px 0',
          borderRadius: 14,
          border: '1px solid var(--border)',
          background: 'transparent',
          color: 'var(--text2)',
          fontSize: 14, fontWeight: 500,
          cursor: 'pointer',
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = 'var(--armed-10)'
          e.currentTarget.style.color = 'var(--armed)'
          e.currentTarget.style.borderColor = 'rgba(229,72,77,0.3)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = 'var(--text2)'
          e.currentTarget.style.borderColor = 'var(--border)'
        }}
      >Cerrar sesión</button>
    </div>
  )
}
