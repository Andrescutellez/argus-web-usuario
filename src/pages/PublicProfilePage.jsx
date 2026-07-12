import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getPublicProfile } from '../api/apiService.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Avatar({ name, avatarUrl, size = 72 }) {
  const initial = (name?.[0] ?? '?').toUpperCase()
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt="avatar"
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }}
      />
    )
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'var(--blue-10)', border: '2px solid var(--blue-20)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.4, fontWeight: 700, color: 'var(--blue)',
      flexShrink: 0,
    }}>{initial}</div>
  )
}

function Card({ children, style }) {
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 14, ...style,
    }}>{children}</div>
  )
}

function InfoRow({ icon, label, value, last }) {
  if (!value) return null
  return (
    <div style={{
      display: 'flex', alignItems: 'center', padding: '12px 16px',
      borderBottom: last ? 'none' : '1px solid var(--border-sub)', gap: 10,
    }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ fontSize: 13, color: 'var(--text2)', flex: 1 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text1)' }}>{value}</span>
    </div>
  )
}

// ─── Estado: cargando ─────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 80, gap: 16 }}>
      <div style={{
        width: 72, height: 72, borderRadius: '50%',
        background: 'var(--card)', border: '2px solid var(--border)',
        animation: 'pulse 1.4s ease-in-out infinite',
      }} />
      <div style={{ width: 120, height: 16, borderRadius: 8, background: 'var(--card)', animation: 'pulse 1.4s ease-in-out infinite' }} />
      <div style={{ width: 80, height: 12, borderRadius: 8, background: 'var(--card)', animation: 'pulse 1.4s ease-in-out 0.2s infinite' }} />
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  )
}

// ─── Estado: error ────────────────────────────────────────────────────────────

function ErrorState({ type, onBack }) {
  const isPrivate   = type === 'private'
  const isNotFound  = type === 'notfound'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 80, gap: 12, textAlign: 'center' }}>
      <div style={{ fontSize: 48 }}>{isPrivate ? '🔒' : '🏍️'}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text1)' }}>
        {isPrivate   ? 'Perfil privado'         :
         isNotFound  ? 'Usuario no encontrado'  :
                       'Error al cargar perfil'}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text3)', maxWidth: 260, lineHeight: 1.5 }}>
        {isPrivate  ? 'Este usuario ha configurado su perfil como privado.' :
         isNotFound ? 'El usuario que buscas no existe o fue eliminado.'   :
                      'Ocurrió un error inesperado. Intenta de nuevo.'}
      </div>
      <button
        onClick={onBack}
        style={{
          marginTop: 8, padding: '9px 20px', borderRadius: 10,
          border: '1px solid var(--border)', background: 'transparent',
          color: 'var(--text2)', fontSize: 13, cursor: 'pointer',
        }}
      >Volver</button>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function PublicProfilePage() {
  const { username }               = useParams()
  const navigate                   = useNavigate()
  const [profile,  setProfile]     = useState(null)
  const [status,   setStatus]      = useState('loading') // 'loading' | 'ok' | 'private' | 'notfound' | 'error'

  useEffect(() => {
    if (!username) { setStatus('notfound'); return }
    setStatus('loading')
    getPublicProfile(username)
      .then(({ data }) => { setProfile(data); setStatus('ok') })
      .catch(err => {
        const code = err?.response?.status
        if (code === 403) setStatus('private')
        else if (code === 404) setStatus('notfound')
        else setStatus('error')
      })
  }, [username])

  const displayLabel = profile?.display_name || profile?.username || '?'
  const joinDate     = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('es-CO', { year: 'numeric', month: 'long' })
    : null

  return (
    <div style={{ padding: 24, maxWidth: 580, background: 'var(--bg)', minHeight: '100vh' }}>

      {/* Botón volver */}
      <button
        onClick={() => navigate(-1)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'none', border: 'none', color: 'var(--text2)',
          fontSize: 13, cursor: 'pointer', padding: '0 0 20px',
        }}
      >
        ← Volver
      </button>

      {status === 'loading' && <LoadingState />}

      {(status === 'private' || status === 'notfound' || status === 'error') && (
        <ErrorState type={status} onBack={() => navigate(-1)} />
      )}

      {status === 'ok' && profile && (
        <>
          {/* Cabecera de perfil */}
          <Card style={{ padding: '24px 20px 20px', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 16 }}>
              <Avatar name={displayLabel} avatarUrl={profile.avatar_url} size={72} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                  fontSize: 18, fontWeight: 700, color: 'var(--text1)',
                }}>
                  {displayLabel}
                  {profile.argus_verified && (
                    <span title="Usuario verificado" style={{ fontSize: 14 }}>✓</span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 2 }}>
                  @{profile.username}
                </div>
                {joinDate && (
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
                    Miembro desde {joinDate}
                  </div>
                )}
              </div>
            </div>

            {/* Biografía */}
            {profile.bio && (
              <div style={{
                fontSize: 13, color: 'var(--text1)', lineHeight: 1.55,
                padding: '12px 0',
                borderTop: '1px solid var(--border-sub)',
              }}>
                {profile.bio}
              </div>
            )}
          </Card>

          {/* Info adicional */}
          {(profile.city) && (
            <Card style={{ marginBottom: 20 }}>
              <InfoRow icon="📍" label="Ciudad" value={profile.city} last />
            </Card>
          )}

          {/* Estado de cuenta */}
          {profile.social_status && profile.social_status !== 'ACTIVE' && (
            <div style={{
              padding: '10px 14px', borderRadius: 10,
              background: 'rgba(229,72,77,0.08)', border: '1px solid rgba(229,72,77,0.2)',
              fontSize: 12, color: '#E5484D', marginBottom: 20,
            }}>
              Cuenta {profile.social_status.toLowerCase()}
            </div>
          )}
        </>
      )}

      <div style={{ paddingBottom: 32 }} />
    </div>
  )
}
