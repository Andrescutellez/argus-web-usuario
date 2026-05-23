import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { loginApi, registerApi } from '../api/apiService.js'

export default function LoginPage() {
  const [mode, setMode]         = useState('login') // 'login' | 'register'
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const login    = useStore((s) => s.login)
  const navigate = useNavigate()

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

  const inputStyle = {
    background: 'var(--card-alt)',
    borderColor: 'var(--border)',
    color: 'var(--text1)',
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold" style={{ color: 'var(--blue)' }}>Argus</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text2)' }}>
            {mode === 'login' ? 'Panel de usuario' : 'Crear cuenta'}
          </p>
        </div>

        <div className="rounded-xl p-6 border" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium" style={{ color: 'var(--text2)' }}>
                Correo electrónico
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@ejemplo.com"
                className="rounded-md px-3 py-2 text-sm outline-none border transition-colors"
                style={inputStyle}
                onFocus={e => e.target.style.borderColor = 'var(--blue)'}
                onBlur={e  => e.target.style.borderColor = 'var(--border)'}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium" style={{ color: 'var(--text2)' }}>
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="rounded-md px-3 py-2 text-sm outline-none border transition-colors"
                style={inputStyle}
                onFocus={e => e.target.style.borderColor = 'var(--blue)'}
                onBlur={e  => e.target.style.borderColor = 'var(--border)'}
              />
            </div>

            {mode === 'register' && (
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium" style={{ color: 'var(--text2)' }}>
                  Confirmar contraseña
                </label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  className="rounded-md px-3 py-2 text-sm outline-none border transition-colors"
                  style={inputStyle}
                  onFocus={e => e.target.style.borderColor = 'var(--blue)'}
                  onBlur={e  => e.target.style.borderColor = 'var(--border)'}
                />
              </div>
            )}

            {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="py-2 rounded-md text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: 'var(--blue)', color: '#fff' }}
            >
              {loading ? 'Cargando...' : mode === 'login' ? 'Ingresar' : 'Crear cuenta'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm mt-4" style={{ color: 'var(--text2)' }}>
          {mode === 'login' ? '¿No tenés cuenta?' : '¿Ya tenés cuenta?'}{' '}
          <button onClick={toggle} className="font-semibold hover:underline" style={{ color: 'var(--blue)' }}>
            {mode === 'login' ? 'Registrate' : 'Ingresar'}
          </button>
        </p>
      </div>
    </div>
  )
}
