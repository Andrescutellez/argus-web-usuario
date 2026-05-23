import { NavLink, Outlet, Navigate } from 'react-router-dom'
import { useStore } from '../../store/useStore.js'

const NAV = [
  { to: '/location',  icon: '📍', label: 'Ubicación'   },
  { to: '/security',  icon: '🛡️', label: 'Seguridad'   },
  { to: '/history',   icon: '📋', label: 'Historial'   },
  { to: '/driving',   icon: '🏎️', label: 'Conducción'  },
  { to: '/premium',   icon: '⭐', label: 'Premium'     },
  { to: '/perfil',    icon: '⚙️', label: 'Config'      },
]

export default function Layout() {
  const user     = useStore((s) => s.user)
  const deviceId = useStore((s) => s.deviceId)
  const logout   = useStore((s) => s.logout)
  const theme    = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)

  if (!user) return <Navigate to="/login" replace />
  if (!deviceId) return <Navigate to="/onboarding" replace />

  const isDark = theme === 'dark'

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--bg)' }}>

      {/* ── Sidebar ── */}
      <aside
        style={{
          width: 220,
          flexShrink: 0,
          background: 'var(--card)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Logo */}
        <div style={{
          padding: '20px 20px 16px',
          borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 32, height: 32,
              background: 'var(--blue)',
              borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, fontWeight: 700, color: '#fff',
            }}>A</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text1)', lineHeight: 1.1 }}>Argus</div>
              <div style={{ fontSize: 11, color: 'var(--text2)' }}>Secure</div>
            </div>
          </div>
          <div style={{
            marginTop: 10,
            padding: '6px 10px',
            background: 'var(--card-alt)',
            borderRadius: 8,
            border: '1px solid var(--border)',
            fontSize: 10,
            color: 'var(--text3)',
            fontFamily: 'monospace',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>{deviceId}</div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '10px 8px' }}>
          {NAV.map(({ to, icon, label }) => (
            <NavLink
              key={to}
              to={to}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 12px',
                borderRadius: 10,
                marginBottom: 2,
                fontSize: 14,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--blue)' : 'var(--text2)',
                background: isActive ? 'var(--blue-10)' : 'transparent',
                textDecoration: 'none',
                transition: 'all 0.15s',
                border: isActive ? '1px solid var(--blue-20)' : '1px solid transparent',
              })}
            >
              <span style={{ fontSize: 16 }}>{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Footer sidebar */}
        <div style={{
          padding: '12px 12px 16px',
          borderTop: '1px solid var(--border)',
        }}>
          {/* Toggle de tema */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 10px',
            borderRadius: 10,
            background: 'var(--card-alt)',
            border: '1px solid var(--border)',
            marginBottom: 10,
            cursor: 'pointer',
          }} onClick={() => setTheme(isDark ? 'light' : 'dark')}>
            <span style={{ fontSize: 13, color: 'var(--text2)' }}>
              {isDark ? '🌑 Oscuro' : '☀️ Claro'}
            </span>
            {/* Toggle switch */}
            <div style={{
              width: 36, height: 20,
              background: isDark ? 'var(--blue)' : 'var(--border)',
              borderRadius: 10,
              position: 'relative',
              transition: 'background 0.2s',
            }}>
              <div style={{
                width: 14, height: 14,
                background: '#fff',
                borderRadius: '50%',
                position: 'absolute',
                top: 3,
                left: isDark ? 19 : 3,
                transition: 'left 0.2s',
                boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
              }} />
            </div>
          </div>

          {/* Info usuario + logout */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 8px',
            borderRadius: 8,
          }}>
            <div style={{
              width: 30, height: 30,
              borderRadius: '50%',
              background: 'var(--blue-10)',
              border: '1px solid var(--blue-20)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700,
              color: 'var(--blue)',
              flexShrink: 0,
            }}>
              {(user.name ?? user.email)?.[0]?.toUpperCase()}
            </div>
            <span style={{
              flex: 1,
              fontSize: 11,
              color: 'var(--text2)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>{user.email}</span>
          </div>
          <button
            onClick={logout}
            style={{
              marginTop: 6,
              width: '100%',
              padding: '7px 0',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text2)',
              fontSize: 12,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--card-alt)'
              e.currentTarget.style.color = 'var(--text1)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'var(--text2)'
            }}
          >Cerrar sesión</button>
        </div>
      </aside>

      {/* ── Contenido principal ── */}
      <main style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <Outlet />
      </main>
    </div>
  )
}
