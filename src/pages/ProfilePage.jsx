import { useEffect, useState, useRef } from 'react'
import { useStore } from '../store/useStore.js'
import {
  getMotos, getMyProfile, updateMyProfile, changeUsername, checkUsername,
} from '../api/apiService.js'
import api from '../api/apiService.js'

// ─── Componentes auxiliares de layout ────────────────────────────────────────

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
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 14, ...style,
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

// Avatar con inicial o imagen
function Avatar({ name, avatarUrl, size = 56 }) {
  const initial = (name?.[0] ?? '?').toUpperCase()
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt="avatar"
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    )
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'var(--blue-10)', border: '1px solid var(--blue-20)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 700, color: 'var(--blue)',
      flexShrink: 0,
    }}>{initial}</div>
  )
}

// Toggle switch reutilizable
function Toggle({ value, onChange }) {
  return (
    <div onClick={() => onChange(!value)} style={{
      width: 50, height: 28, borderRadius: 14,
      background: value ? 'var(--blue)' : 'var(--border)',
      position: 'relative', cursor: 'pointer',
      transition: 'background 0.22s', flexShrink: 0,
    }}>
      <div style={{
        width: 22, height: 22, borderRadius: '50%', background: '#fff',
        position: 'absolute', top: 3,
        left: value ? 25 : 3,
        transition: 'left 0.22s',
        boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
      }} />
    </div>
  )
}

// Campo de texto editable inline
function EditField({ label, value, onChange, placeholder, multiline, maxLength }) {
  const inputStyle = {
    width: '100%', background: 'var(--card-alt)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '8px 12px', color: 'var(--text1)', fontSize: 13,
    fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none',
    resize: multiline ? 'vertical' : 'none',
  }
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.8px', color: 'var(--text3)', display: 'block', marginBottom: 6 }}>
        {label}
      </label>
      {multiline
        ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} maxLength={maxLength} rows={3} style={inputStyle} />
        : <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} maxLength={maxLength} style={inputStyle} />
      }
      {maxLength && (
        <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'right', marginTop: 3 }}>
          {value.length}/{maxLength}
        </div>
      )}
    </div>
  )
}

// ─── Sección de cambio de username ───────────────────────────────────────────

function UsernameEditor({ currentUsername, onChanged }) {
  const [open,       setOpen]       = useState(false)
  const [input,      setInput]      = useState('')
  const [checking,   setChecking]   = useState(false)
  const [available,  setAvailable]  = useState(null)  // null | true | false
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')
  const debounceRef  = useRef(null)

  function handleInput(val) {
    // Solo permitir caracteres válidos en tiempo real
    const clean = val.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30)
    setInput(clean)
    setAvailable(null)
    setError('')

    clearTimeout(debounceRef.current)
    if (clean.length >= 3) {
      setChecking(true)
      debounceRef.current = setTimeout(async () => {
        try {
          const res = await checkUsername(clean)
          setAvailable(res.data.available && res.data.valid)
        } catch {
          setAvailable(false)
        } finally {
          setChecking(false)
        }
      }, 500)
    } else {
      setChecking(false)
    }
  }

  async function handleSave() {
    if (!available) return
    setSaving(true)
    setError('')
    try {
      await changeUsername(input)
      onChanged(input)
      setOpen(false)
      setInput('')
      setAvailable(null)
    } catch (err) {
      setError(err?.response?.data?.message ?? 'No se pudo cambiar el usuario')
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setOpen(false)
    setInput('')
    setAvailable(null)
    setError('')
  }

  const statusColor = checking ? 'var(--text3)' : available === true ? '#3FB950' : available === false ? '#E5484D' : 'var(--text3)'
  const statusText  = checking ? 'Verificando…' : available === true ? 'Disponible' : available === false ? 'No disponible' : input.length > 0 && input.length < 3 ? 'Mínimo 3 caracteres' : ''

  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.8px', color: 'var(--text3)', display: 'block', marginBottom: 6 }}>
        NOMBRE DE USUARIO
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text1)' }}>@{currentUsername}</span>
        {!open && (
          <button onClick={() => setOpen(true)} style={{
            background: 'none', border: '1px solid var(--border)', borderRadius: 6,
            padding: '3px 10px', fontSize: 12, color: 'var(--text2)', cursor: 'pointer',
          }}>Cambiar</button>
        )}
      </div>

      {open && (
        <div style={{ marginTop: 10 }}>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', fontSize: 14 }}>@</span>
            <input
              autoFocus
              value={input}
              onChange={e => handleInput(e.target.value)}
              placeholder={currentUsername}
              maxLength={30}
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'var(--card-alt)', border: `1px solid ${statusColor === '#3FB950' ? '#3FB950' : statusColor === '#E5484D' ? '#E5484D' : 'var(--border)'}`,
                borderRadius: 8, padding: '8px 12px 8px 26px',
                color: 'var(--text1)', fontSize: 13, outline: 'none',
              }}
            />
          </div>
          {statusText && (
            <div style={{ fontSize: 11, color: statusColor, marginTop: 4 }}>{statusText}</div>
          )}
          {error && (
            <div style={{ fontSize: 12, color: '#E5484D', marginTop: 6, background: 'rgba(229,72,77,0.1)', borderRadius: 6, padding: '6px 10px' }}>
              {error}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={handleCancel} style={{
              background: 'none', border: '1px solid var(--border)', borderRadius: 8,
              padding: '6px 14px', fontSize: 12, color: 'var(--text2)', cursor: 'pointer',
            }}>Cancelar</button>
            <button onClick={handleSave} disabled={!available || saving} style={{
              background: '#2F81F7', border: 'none', borderRadius: 8,
              padding: '6px 16px', fontSize: 12, fontWeight: 600, color: '#fff',
              cursor: available && !saving ? 'pointer' : 'not-allowed',
              opacity: available && !saving ? 1 : 0.5,
            }}>{saving ? 'Guardando…' : 'Guardar'}</button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8, lineHeight: 1.5 }}>
            Solo letras minúsculas, números y guión bajo. Puedes cambiarlo cada 30 días.
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { user, deviceId, logout, theme, setTheme } = useStore()
  const [motos,       setMotos]       = useState([])
  const [plan,        setPlan]        = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [profile,     setProfile]     = useState(null)
  const [profileLoad, setProfileLoad] = useState(true)

  // Campos de edición de perfil
  const [displayName, setDisplayName] = useState('')
  const [bio,         setBio]         = useState('')
  const [city,        setCity]        = useState('')
  const [isPublic,    setIsPublic]    = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [saveMsg,     setSaveMsg]     = useState('')   // '' | 'ok'
  const [saveError,   setSaveError]   = useState('')  // mensaje de error específico

  useEffect(() => {
    Promise.allSettled([
      getMotos().then(({ data }) => setMotos(data)),
      api.get('/api/subscriptions/me').then(({ data }) => setPlan(data)),
    ]).finally(() => setLoading(false))

    getMyProfile()
      .then(({ data }) => {
        setProfile(data)
        setDisplayName(data.display_name ?? '')
        setBio(data.bio ?? '')
        setCity(data.city ?? '')
        setIsPublic(data.is_public ?? true)
      })
      .catch(() => {})
      .finally(() => setProfileLoad(false))
  }, [])

  async function handleSaveProfile() {
    setSaving(true)
    setSaveMsg('')
    setSaveError('')
    try {
      const { data } = await updateMyProfile({
        displayName: displayName.trim() || null,
        bio:         bio.trim()         || null,
        city:        city.trim()        || null,
        isPublic,
      })
      setProfile(data)
      setSaveMsg('ok')
      setTimeout(() => setSaveMsg(''), 3000)
    } catch (err) {
      const msg = err?.response?.data?.message ?? 'No se pudo guardar. Intenta de nuevo.'
      setSaveError(msg)
      setTimeout(() => setSaveError(''), 4000)
    } finally {
      setSaving(false)
    }
  }

  const uniqueMotos = [...new Map(motos.map(m => [m.id ?? m.alias, m])).values()]
  const isDark      = theme === 'dark'
  const planLabel   = plan?.plan ?? 'FREEMIUM'
  const isPremium   = planLabel === 'PREMIUM'

  // Nombre a mostrar: display_name > username > prefijo del email
  const displayLabel = profile?.display_name || profile?.username || user?.email?.split('@')[0] || '?'

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

      {/* ── Mi cuenta (resumen) ── */}
      <SectionLabel>MI CUENTA</SectionLabel>
      <Card>
        <div style={{ padding: '16px 16px 14px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <Avatar
            name={displayLabel}
            avatarUrl={profile?.avatar_url}
            size={52}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 15, fontWeight: 700, color: 'var(--text1)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{displayLabel}</div>
            {profile?.username && (
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 1 }}>@{profile.username}</div>
            )}
            <div style={{ marginTop: 6 }}>
              <span style={{
                display: 'inline-block', padding: '2px 8px', borderRadius: 6,
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

      {/* ── Perfil social ── */}
      <SectionLabel>PERFIL SOCIAL</SectionLabel>
      <Card style={{ padding: '18px 18px 10px' }}>
        {profileLoad ? (
          <div style={{ color: 'var(--text3)', fontSize: 13, padding: '8px 0' }}>Cargando perfil…</div>
        ) : (
          <>
            {/* Username */}
            <UsernameEditor
              currentUsername={profile?.username ?? '…'}
              onChanged={(newUser) => setProfile(p => ({ ...p, username: newUser }))}
            />

            {/* Nombre visible */}
            <EditField
              label="NOMBRE VISIBLE"
              value={displayName}
              onChange={setDisplayName}
              placeholder="Como quieres que te vean"
              maxLength={80}
            />

            {/* Biografía */}
            <EditField
              label="BIOGRAFÍA"
              value={bio}
              onChange={setBio}
              placeholder="Cuéntale algo a la comunidad"
              multiline
              maxLength={300}
            />

            {/* Ciudad */}
            <EditField
              label="CIUDAD"
              value={city}
              onChange={setCity}
              placeholder="Bogotá, Medellín…"
              maxLength={100}
            />

            {/* Perfil público */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text1)' }}>Perfil público</div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                  {isPublic ? 'Cualquier usuario puede ver tu perfil' : 'Solo tú puedes ver tu perfil'}
                </div>
              </div>
              <Toggle value={isPublic} onChange={setIsPublic} />
            </div>

            {/* Botón guardar */}
            <button
              onClick={handleSaveProfile}
              disabled={saving}
              style={{
                width: '100%', padding: '11px 0', borderRadius: 10,
                background: '#2F81F7', border: 'none', color: '#fff',
                fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1, transition: 'opacity 0.15s',
              }}
            >
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>

            {saveMsg === 'ok' && (
              <div style={{ marginTop: 10, fontSize: 13, color: '#3FB950', textAlign: 'center' }}>
                Perfil actualizado correctamente
              </div>
            )}
            {saveError && (
              <div style={{
                marginTop: 10, fontSize: 13, color: '#E5484D',
                background: 'rgba(229,72,77,0.08)', borderRadius: 8,
                padding: '8px 12px', textAlign: 'center',
              }}>
                {saveError}
              </div>
            )}
          </>
        )}
      </Card>

      <div style={{ marginBottom: 20 }} />

      {/* ── Apariencia ── */}
      <SectionLabel>APARIENCIA</SectionLabel>
      <Card>
        <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: 'var(--blue-10)', border: '1px solid var(--blue-20)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
          }}>{isDark ? '🌑' : '☀️'}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text1)' }}>Modo oscuro</div>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>{isDark ? 'Activado' : 'Desactivado'}</div>
          </div>
          <Toggle value={isDark} onChange={(v) => setTheme(v ? 'dark' : 'light')} />
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
              border: '2px solid var(--blue)', borderTopColor: 'transparent',
              animation: 'spin 0.8s linear infinite',
            }} />
            Cargando datos de la moto…
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </Card>
      ) : uniqueMotos.length > 0 ? uniqueMotos.map((moto) => (
        <Card key={moto.id} style={{ marginBottom: 12 }}>
          <InfoRow icon="🏷️" label="Apodo"   value={moto.alias}  />
          <InfoRow icon="🪪" label="Placa"   value={moto.placa}  />
          <InfoRow icon="🏭" label="Marca"   value={moto.marca}  />
          <InfoRow icon="🏍️" label="Modelo"  value={moto.modelo} />
          <InfoRow icon="🎨" label="Color"   value={moto.color}  />
          <InfoRow icon="📅" label="Año"     value={moto.anio}   />
          <InfoRow icon="📡" label="Dispositivo Argus" value={moto.device_id ?? deviceId} last />
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
          width: '100%', padding: '13px 0', borderRadius: 14,
          border: '1px solid var(--border)', background: 'transparent',
          color: 'var(--text2)', fontSize: 14, fontWeight: 500,
          cursor: 'pointer', transition: 'all 0.15s',
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

      <div style={{ paddingBottom: 32 }} />
    </div>
  )
}
