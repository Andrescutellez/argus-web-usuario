/**
 * @fileoverview Layout responsive — sidebar desktop / bottom nav móvil.
 * SVG icons propios (no emojis), aria-labels, touch targets 44px mínimo.
 */

import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom'
import { useStore } from '../../store/useStore.js'
import { getMeApi } from '../../api/apiService.js'
import { setGlobalCallbacks } from '../../api/realtimeService.js'
import { silentSubscribeIfGranted, requestAndSubscribe } from '../../api/webPushService.js'
import iconLight from '../../assets/icon_light.png'
import iconDark from '../../assets/icon_dark.png'

// ─── SVG Icons (inline, sin dependencias externas) ──────────────────────────
const IcLocation = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
  </svg>
)
const IcShield = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/>
  </svg>
)
const IcHistory = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/>
  </svg>
)
const IcSpeed = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M20.38 8.57l-1.23 1.85a8 8 0 01-.22 7.58H5.07A8 8 0 0115.58 6.85l1.85-1.23A10 10 0 003.35 19a2 2 0 001.72 1h13.85a2 2 0 001.74-1 10 10 0 00-.27-10.43zM10.59 15.41a2 2 0 002.83 0l5.66-8.49-8.49 5.66a2 2 0 000 2.83z"/>
  </svg>
)
const IcSettings = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96a7.2 7.2 0 00-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87a.48.48 0 00.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
  </svg>
)
const IcMoon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 3a9 9 0 109 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 01-4.4 2.26 5.403 5.403 0 01-3.14-9.8c-.44-.06-.9-.1-1.36-.1z"/>
  </svg>
)
const IcSun = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0a.996.996 0 000-1.41l-1.06-1.06zm1.06-12.37l-1.06 1.06a.996.996 0 000 1.41c.39.39 1.03.39 1.41 0l1.06-1.06a.996.996 0 000-1.41-.996.996 0 00-1.41 0zM7.05 18.36l-1.06 1.06a.996.996 0 000 1.41c.39.39 1.03.39 1.41 0l1.06-1.06a.996.996 0 000-1.41-.96.96 0 00-1.41 0z"/>
  </svg>
)
const IcLogout = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5-5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/>
  </svg>
)
const IcGroups = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
  </svg>
)
const IcGarage = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M19 9.3V4h-3v2.6L12 3 2 12h3v8h5v-5h4v5h5v-8h3L19 9.3zM17 18h-1v-5H8v5H7v-7.81l5-4.5 5 4.5V18z"/>
    <path d="M10 10h4v3h-4z"/>
  </svg>
)

const NAV = [
  { to: '/location',  Icon: IcLocation, label: 'Ubicación'   },
  { to: '/security',  Icon: IcShield,   label: 'Seguridad'   },
  { to: '/driving',   Icon: IcSpeed,    label: 'Conducción'  },
  { to: '/garage',    Icon: IcGarage,   label: 'Garage'      },
  { to: '/community', Icon: IcGroups,   label: 'Comunidades' },
  { to: '/history',   Icon: IcHistory,  label: 'Historial'   },
  { to: '/perfil',    Icon: IcSettings, label: 'Config'      },
]

const PAGE_TITLE = {
  '/location':  'Ubicación en tiempo real',
  '/security':  'Seguridad',
  '/history':   'Historial',
  '/driving':   'Conducción',
  '/garage':    'Garage',
  '/community': 'Comunidades',
  '/perfil':    'Configuración',
}

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < breakpoint)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < breakpoint)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [breakpoint])
  return isMobile
}

export default function Layout() {
  const user        = useStore((s) => s.user)
  const deviceId    = useStore((s) => s.deviceId)
  const logout      = useStore((s) => s.logout)
  const theme       = useStore((s) => s.theme)
  const setTheme    = useStore((s) => s.setTheme)
  const refreshUser = useStore((s) => s.refreshUser)
  const location    = useLocation()
  const isMobile    = useIsMobile()

  const [checking, setChecking] = useState(true)

  // ─── Estado permiso de notificaciones ───────────────────────────────────
  // 'default' = no preguntado aún → mostrar botón
  // 'granted' = activo → ocultar botón
  // 'denied'  = bloqueado por usuario → no mostrar nada
  const [notifPerm, setNotifPerm] = useState(() =>
    ('Notification' in window ? Notification.permission : 'denied')
  )

  // ─── Banner de robo cercano ─────────────────────────────────────────────
  const [nearbyBanner, setNearbyBanner] = useState(null)
  const nearbyTimerRef = useRef(null)

  useEffect(() => {
    setGlobalCallbacks(
      (data) => {
        setNearbyBanner(data)
        clearTimeout(nearbyTimerRef.current)
        nearbyTimerRef.current = setTimeout(() => setNearbyBanner(null), 15_000)
      },
      null, // secure:room_alert — web usuario no necesita responder por ahora
    )
    return () => {
      clearTimeout(nearbyTimerRef.current)
      setGlobalCallbacks(null, null)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) { setChecking(false); return }
    getMeApi()
      .then(({ data }) => {
        if (!data?.deviceIds) return
        if (data.token) localStorage.setItem('argus_token', data.token)
        refreshUser(data)
        // Si el permiso ya estaba concedido (sesión anterior), re-suscribir silenciosamente.
        // Si es 'default', el botón de campana en la UI pedirá el permiso con gesto del usuario.
        silentSubscribeIfGranted()
      })
      .catch(() => {})
      .finally(() => setChecking(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  async function handleEnableNotifs() {
    const result = await requestAndSubscribe()
    setNotifPerm(result)
  }

  if (!user)     return <Navigate to="/login" replace />
  if (checking)  return null
  if (!deviceId) return <Navigate to="/onboarding" replace />

  const isDark    = theme === 'dark'
  const pageTitle = PAGE_TITLE[location.pathname] ?? 'Argus'
  const navIcon   = isDark ? iconDark : iconLight

  // ─── Vista móvil ──────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div style={{ height: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>

        {/* Top App Bar */}
        <header role="banner" style={{
          height: 56, flexShrink: 0,
          background: 'var(--card)',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center',
          padding: '0 14px',
          position: 'sticky', top: 0, zIndex: 'var(--z-overlay)',
        }}>
          {/* Logo */}
          <div style={{
            width: 30, height: 30,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginRight: 10, flexShrink: 0,
          }}>
            <img src={navIcon} alt="Argus" style={{ width: 28, height: 28, objectFit: 'contain' }} />
          </div>

          <span style={{
            flex: 1, fontSize: 15, fontWeight: 700, color: 'var(--text1)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{pageTitle}</span>

          {/* Toggle tema */}
          <button
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            aria-label={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
            className="touch-target"
            style={{
              background: 'none', border: 'none',
              color: 'var(--text2)', borderRadius: 8,
            }}
          >{isDark ? <IcSun /> : <IcMoon />}</button>

          {/* Botón de notificaciones — solo visible si el permiso no está resuelto */}
          {notifPerm === 'default' && (
            <button
              onClick={handleEnableNotifs}
              aria-label="Activar notificaciones"
              className="touch-target"
              title="Activar notificaciones"
              style={{ background: 'none', border: 'none', color: 'var(--text2)', borderRadius: 8, position: 'relative' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
              </svg>
              {/* Punto naranja indicador */}
              <div style={{
                position: 'absolute', top: 6, right: 6,
                width: 7, height: 7, borderRadius: '50%',
                background: 'var(--accent)',
              }} />
            </button>
          )}

          {/* Logout */}
          <button
            onClick={logout}
            aria-label="Cerrar sesión"
            className="touch-target"
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: 8,
              color: 'var(--text2)',
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 11, padding: '0 10px',
            }}
          >
            <IcLogout />
            <span>Salir</span>
          </button>
        </header>

        {/* Contenido */}
        <main style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          <Outlet />
        </main>

        {/* Banner de robo cercano */}
        {nearbyBanner && (
          <div style={{
            position: 'fixed', top: 60, left: 8, right: 8,
            zIndex: 9999,
            background: '#b71c1c', borderRadius: 12,
            padding: '10px 14px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white" aria-hidden="true">
              <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
            </svg>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: '#fff', fontSize: 12 }}>Robo a {nearbyBanner.distanceKm ?? '?'} km</div>
              <div style={{ color: '#ffcdd2', fontSize: 11 }}>¿Puedes ayudar?</div>
            </div>
            <button
              onClick={() => { clearTimeout(nearbyTimerRef.current); setNearbyBanner(null) }}
              aria-label="Cerrar"
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', padding: 2, fontSize: 14 }}
            >✕</button>
          </div>
        )}

        {/* Bottom Navigation */}
        <nav role="navigation" aria-label="Navegación principal" style={{
          height: 64, flexShrink: 0,
          background: 'var(--card)',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          position: 'sticky', bottom: 0, zIndex: 'var(--z-overlay)',
        }}>
          {NAV.map(({ to, Icon, label }) => (
            <NavLink key={to} to={to} aria-label={label} style={({ isActive }) => ({
              flex: 1, minHeight: 44,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: 3, textDecoration: 'none',
              color: isActive ? 'var(--accent)' : 'var(--text3)',
              transition: 'color 0.15s',
              paddingBottom: 4, position: 'relative',
            })}>
              {({ isActive }) => (
                <>
                  {isActive && (
                    <div style={{
                      position: 'absolute', top: 0,
                      left: '30%', right: '30%',
                      height: 2.5,
                      background: 'var(--accent)',
                      borderRadius: '0 0 3px 3px',
                    }} />
                  )}
                  <Icon />
                  <span style={{ fontSize: 9, fontWeight: isActive ? 700 : 500, letterSpacing: '0.2px' }}>
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    )
  }

  // ─── Vista desktop ────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg)' }}>

      {/* Sidebar */}
      <aside role="complementary" style={{
        width: 220, flexShrink: 0,
        background: 'var(--card)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Logo */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 38, height: 38,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <img src={navIcon} alt="Argus" style={{ width: 36, height: 36, objectFit: 'contain' }} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text1)', lineHeight: 1.1 }}>Argus</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>Secure</div>
            </div>
          </div>
          <div className="font-mono" style={{
            marginTop: 10, padding: '6px 10px',
            background: 'var(--card-alt)', borderRadius: 8,
            border: '1px solid var(--border)',
            fontSize: 10, color: 'var(--text3)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{deviceId}</div>
        </div>

        {/* Nav links */}
        <nav role="navigation" aria-label="Navegación principal" style={{ flex: 1, padding: '10px 8px' }}>
          {NAV.map(({ to, Icon, label }) => (
            <NavLink key={to} to={to} aria-label={label} style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 10, marginBottom: 2,
              fontSize: 14, fontWeight: isActive ? 600 : 400,
              color: isActive ? 'var(--accent)' : 'var(--text2)',
              background: isActive ? 'var(--accent-10)' : 'transparent',
              textDecoration: 'none', transition: 'all 0.15s',
              border: isActive ? '1px solid var(--accent-20)' : '1px solid transparent',
            })}>
              <Icon />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Footer sidebar */}
        <div style={{ padding: '12px 12px 16px', borderTop: '1px solid var(--border)' }}>

          {/* Botón de notificaciones — solo si el permiso no está resuelto */}
          {notifPerm === 'default' && (
            <button
              onClick={handleEnableNotifs}
              aria-label="Activar notificaciones push"
              style={{
                width: '100%', marginBottom: 10,
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '9px 12px', borderRadius: 10,
                background: 'var(--accent-10)',
                border: '1px solid var(--accent-20)',
                color: 'var(--accent)', fontSize: 12, fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
              </svg>
              Activar notificaciones
            </button>
          )}

          {/* Toggle tema */}
          <button
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            aria-label={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
            style={{
              width: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '9px 12px', borderRadius: 10,
              background: 'var(--card-alt)', border: '1px solid var(--border)',
              marginBottom: 10,
              fontSize: 12, color: 'var(--text2)',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {isDark ? <IcMoon /> : <IcSun />}
              {isDark ? 'Oscuro' : 'Claro'}
            </span>
            {/* Toggle pill */}
            <div style={{
              width: 36, height: 20,
              background: isDark ? 'var(--accent)' : 'var(--border)',
              borderRadius: 10, position: 'relative', transition: 'background 0.2s',
            }}>
              <div style={{
                width: 14, height: 14, background: '#fff', borderRadius: '50%',
                position: 'absolute', top: 3,
                left: isDark ? 19 : 3, transition: 'left 0.2s',
                boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
              }} />
            </div>
          </button>

          {/* Usuario */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 8px', borderRadius: 8,
          }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              background: 'var(--accent-10)', border: '1px solid var(--accent-20)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, color: 'var(--accent)', flexShrink: 0,
            }}>
              {(user.name ?? user.email)?.[0]?.toUpperCase()}
            </div>
            <span style={{
              flex: 1, fontSize: 11, color: 'var(--text2)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{user.email}</span>
          </div>

          <button
            onClick={logout}
            aria-label="Cerrar sesión"
            style={{
              marginTop: 6, width: '100%', padding: '8px 0',
              borderRadius: 8, border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--text2)',
              fontSize: 12, display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: 6,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--armed-10)'
              e.currentTarget.style.color = 'var(--armed)'
              e.currentTarget.style.borderColor = 'var(--armed-20)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'var(--text2)'
              e.currentTarget.style.borderColor = 'var(--border)'
            }}
          >
            <IcLogout /> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Contenido principal */}
      <main style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <Outlet />
      </main>

      {/* Banner de robo cercano — visible en cualquier pestaña */}
      {nearbyBanner && (
        <div style={{
          position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, maxWidth: 480, width: 'calc(100% - 48px)',
          background: '#b71c1c', borderRadius: 14,
          padding: '12px 16px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'flex-start', gap: 12,
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="white" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }}>
            <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
          </svg>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, color: '#fff', fontSize: 13 }}>Robo reportado cerca de ti</div>
            <div style={{ color: '#ffcdd2', fontSize: 12, marginTop: 2 }}>
              A {(nearbyBanner.distanceKm ?? '?')} km de tu ubicación — ¿Puedes ayudar?
            </div>
          </div>
          <button
            onClick={() => { clearTimeout(nearbyTimerRef.current); setNearbyBanner(null) }}
            aria-label="Cerrar alerta"
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', padding: 2 }}
          >✕</button>
        </div>
      )}
    </div>
  )
}
