import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { loginApi, registerApi } from '../api/apiService.js'
import logoDark from '../assets/logo_dark_transparent.png'

export default function LoginPage() {
  const [mode, setMode]         = useState('login') // 'login' | 'register'
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const login    = useStore((s) => s.login)
  const navigate = useNavigate()

  const isLogin = mode === 'login'

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email || !password) { setError('Completa todos los campos'); return }
    if (mode === 'register' && password !== confirm) {
      setError('Las contraseñas no coinciden'); return
    }

    setLoading(true)
    setError('')
    try {
      if (mode === 'login') {
        const { data } = await loginApi(email, password)
        login(data)
        navigate('/location')
      } else {
        const { data } = await registerApi(email, password)
        login(data)
        navigate('/onboarding')
      }
    } catch (err) {
      const msg = err.response?.data?.message ?? 'Error de conexión'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const toggle = () => { setMode(m => m === 'login' ? 'register' : 'login'); setError('') }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden',
      background: 'linear-gradient(160deg, #0A1B36 0%, #123E7A 48%, #1A56C9 100%)',
      padding: '24px 16px',
    }}>
      {/* Blobs degradados difuminados — ambiente premium sin esferas 3D literales */}
      <div aria-hidden="true" style={{
        position: 'absolute', top: '-12%', left: '-10%', width: 460, height: 460,
        borderRadius: '50%', background: 'radial-gradient(circle, rgba(110,168,255,0.55), transparent 70%)',
        filter: 'blur(50px)', pointerEvents: 'none',
      }} />
      <div aria-hidden="true" style={{
        position: 'absolute', bottom: '-18%', right: '-14%', width: 540, height: 540,
        borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,139,245,0.45), transparent 72%)',
        filter: 'blur(60px)', pointerEvents: 'none',
      }} />
      <div aria-hidden="true" style={{
        position: 'absolute', top: '28%', right: '8%', width: 220, height: 220,
        borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.18), transparent 70%)',
        filter: 'blur(30px)', pointerEvents: 'none',
      }} />

      <div className="argus-fadein" style={{ width: '100%', maxWidth: 408, position: 'relative', zIndex: 1 }}>

        {/* Logo + claim */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ position: 'relative', display: 'inline-block', marginBottom: 4 }}>
            <span aria-hidden="true" style={{
              position: 'absolute', inset: -14,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(110,168,255,0.35), transparent 72%)',
              animation: 'argus-pulse 2.6s ease-in-out infinite',
            }} />
            <img src={logoDark} alt="Argus Secure" style={{ width: 230, position: 'relative', filter: 'drop-shadow(0 8px 28px rgba(0,0,0,0.35))' }} />
          </div>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.3px', marginTop: 2 }}>
            Protección inteligente para tu moto
          </p>
        </div>

        {/* Card flotante */}
        <div style={{
          borderRadius: 20,
          background: 'rgba(255,255,255,0.97)',
          boxShadow: '0 24px 60px rgba(5,15,35,0.45)',
          padding: '30px 28px',
        }}>
          {/* Tabs login/registro */}
          <div role="tablist" aria-label="Modo de acceso" style={{
            display: 'flex', gap: 4, padding: 4, marginBottom: 24,
            background: '#EEF3FB', borderRadius: 12, border: '1px solid #DCE6F5',
          }}>
            {[['login', 'Ingresar'], ['register', 'Crear cuenta']].map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={mode === key}
                onClick={() => { setMode(key); setError('') }}
                style={{
                  flex: 1, padding: '9px 0', borderRadius: 9, border: 'none',
                  fontSize: 13, fontWeight: 700, letterSpacing: '0.2px',
                  background: mode === key ? '#1A56C9' : 'transparent',
                  color: mode === key ? '#fff' : '#4A6480',
                  boxShadow: mode === key ? '0 4px 14px rgba(26,86,201,0.35)' : 'none',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Field
              label="Correo electrónico"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="usuario@ejemplo.com"
              autoComplete="email"
            />
            <Field
              label="Contraseña"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
              autoComplete={isLogin ? 'current-password' : 'new-password'}
            />
            {!isLogin && (
              <Field
                label="Confirmar contraseña"
                type="password"
                value={confirm}
                onChange={setConfirm}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            )}

            {error && (
              <p role="alert" style={{
                fontSize: 13, color: '#CF222E', background: 'rgba(207,34,46,0.08)',
                border: '1px solid rgba(207,34,46,0.2)', borderRadius: 10, padding: '8px 12px',
              }}>{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: 4, padding: '13px 0', borderRadius: 12, border: 'none',
                fontSize: 14.5, fontWeight: 700, letterSpacing: '0.3px', color: '#fff',
                background: 'linear-gradient(135deg, #1A56C9, #123E7A)',
                boxShadow: loading ? 'none' : '0 8px 22px rgba(26,86,201,0.4)',
                opacity: loading ? 0.6 : 1,
                transition: 'transform 0.15s, box-shadow 0.15s',
              }}
              onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.98)' }}
              onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
            >
              {loading ? 'Procesando…' : isLogin ? 'Ingresar' : 'Crear cuenta'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 22, letterSpacing: '0.2px' }}>
          {isLogin ? '¿No tenés cuenta? ' : '¿Ya tenés cuenta? '}
          <button onClick={toggle} style={{
            background: 'none', border: 'none', fontWeight: 700, color: '#fff', fontSize: 12, padding: 0,
          }}>
            {isLogin ? 'Registrate' : 'Ingresar'}
          </button>
        </p>
      </div>

      <style>{`
        @keyframes argus-pulse {
          0%, 100% { opacity: 0.55; transform: scale(1); }
          50%      { opacity: 1;    transform: scale(1.08); }
        }
      `}</style>
    </div>
  )
}

function Field({ label, type, value, onChange, placeholder, autoComplete }) {
  return (
    <div className="flex flex-col gap-1">
      <label style={{ fontSize: 12.5, fontWeight: 600, color: '#4A6480' }}>{label}</label>
      <input
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          background: '#F6F9FC',
          border: '1px solid #DCE6F5',
          color: '#0F1E2E',
          borderRadius: 10,
          padding: '11px 14px',
          fontSize: 14,
          outline: 'none',
          transition: 'border-color 0.15s, box-shadow 0.15s',
        }}
        onFocus={e => { e.target.style.borderColor = '#1A56C9'; e.target.style.boxShadow = '0 0 0 3px rgba(26,86,201,0.12)' }}
        onBlur={e  => { e.target.style.borderColor = '#DCE6F5'; e.target.style.boxShadow = 'none' }}
      />
    </div>
  )
}
