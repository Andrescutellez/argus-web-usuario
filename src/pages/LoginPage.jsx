import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { loginApi, registerApi } from '../api/apiService.js'
import logoDark from '../assets/logo_dark_transparent.png'

export default function LoginPage() {
  const [mode, setMode]         = useState('login')
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
      setError(err.response?.data?.message ?? 'Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  const toggle = () => { setMode(m => m === 'login' ? 'register' : 'login'); setError('') }

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#000000',
      padding: '24px 16px',
    }}>
      <div className="argus-fadein" style={{ width: '100%', maxWidth: 400, position: 'relative' }}>

        {/* Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 32 }}>
          <img src={logoDark} alt="Argus Secure" style={{ width: 220 }} />
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 8, letterSpacing: '0.3px' }}>
            Protección inteligente para tu moto
          </p>
        </div>

        {/* Card */}
        <div style={{
          borderRadius: 18,
          background: '#0F0F0F',
          border: '1px solid #1E1E1E',
          padding: '28px 24px',
        }}>
          {/* Tabs */}
          <div role="tablist" style={{
            display: 'flex', gap: 4, padding: 4, marginBottom: 24,
            background: '#161616', borderRadius: 12, border: '1px solid #222',
          }}>
            {[['login', 'Ingresar'], ['register', 'Crear cuenta']].map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={mode === key}
                onClick={() => { setMode(key); setError('') }}
                style={{
                  flex: 1, padding: '9px 0', borderRadius: 9, border: 'none',
                  fontSize: 13, fontWeight: 700,
                  background: mode === key ? '#1A56C9' : 'transparent',
                  color: mode === key ? '#fff' : 'rgba(255,255,255,0.35)',
                  cursor: 'pointer',
                  boxShadow: mode === key ? '0 4px 14px rgba(26,86,201,0.4)' : 'none',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Correo electrónico" type="email" value={email}
              onChange={setEmail} placeholder="usuario@ejemplo.com" autoComplete="email" />
            <Field label="Contraseña" type="password" value={password}
              onChange={setPassword} placeholder="••••••••"
              autoComplete={isLogin ? 'current-password' : 'new-password'} />
            {!isLogin && (
              <Field label="Confirmar contraseña" type="password" value={confirm}
                onChange={setConfirm} placeholder="••••••••" autoComplete="new-password" />
            )}

            {error && (
              <p role="alert" style={{
                fontSize: 13, color: '#F85149', background: 'rgba(248,81,73,0.08)',
                border: '1px solid rgba(248,81,73,0.2)', borderRadius: 10, padding: '8px 12px', margin: 0,
              }}>{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: 4, padding: '13px 0', borderRadius: 12, border: 'none',
                fontSize: 14, fontWeight: 700, color: '#fff', cursor: loading ? 'not-allowed' : 'pointer',
                background: 'linear-gradient(135deg, #1A56C9, #123E7A)',
                opacity: loading ? 0.6 : 1,
                transition: 'opacity 0.15s, box-shadow 0.15s',
              }}
            >
              {loading ? 'Procesando…' : isLogin ? 'Ingresar' : 'Crear cuenta'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 20 }}>
          {isLogin ? '¿No tienes cuenta? ' : '¿Ya tienes cuenta? '}
          <button onClick={toggle} style={{
            background: 'none', border: 'none', fontWeight: 700,
            color: 'rgba(255,255,255,0.7)', fontSize: 12, padding: 0, cursor: 'pointer',
          }}>
            {isLogin ? 'Regístrate' : 'Ingresar'}
          </button>
        </p>
      </div>
    </div>
  )
}

function Field({ label, type, value, onChange, placeholder, autoComplete }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}>{label}</label>
      <input
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          background: '#151515', border: '1px solid #2A2A2A',
          color: '#F0F0F0', borderRadius: 10,
          padding: '11px 14px', fontSize: 14, outline: 'none',
          transition: 'border-color 0.15s, box-shadow 0.15s',
        }}
        onFocus={e => { e.target.style.borderColor = '#1A56C9'; e.target.style.boxShadow = '0 0 0 3px rgba(26,86,201,0.15)' }}
        onBlur={e  => { e.target.style.borderColor = '#2A2A2A'; e.target.style.boxShadow = 'none' }}
      />
    </div>
  )
}
