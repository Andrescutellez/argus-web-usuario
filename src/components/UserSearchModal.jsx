/**
 * @file UserSearchModal.jsx
 * @brief Modal de búsqueda de usuarios Argus por username o nombre.
 *
 * PROPÓSITO:
 *   Permite buscar perfiles públicos de otros usuarios desde cualquier
 *   parte de la app (comunidades, invitaciones, etc.).
 *   Al tocar un resultado navega a /u/:username o dispara onSelect(profile).
 *
 * USO:
 *   <UserSearchModal
 *     open={true}
 *     onClose={() => setOpen(false)}
 *     onSelect={(profile) => handleInvite(profile)}  // opcional
 *   />
 *
 *   Si no se pasa onSelect, al tocar un resultado navega a /u/:username.
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchProfiles } from '../api/apiService.js'

// ─── Avatar pequeño ───────────────────────────────────────────────────────────
function MiniAvatar({ name, avatarUrl }) {
  const initial = (name?.[0] ?? '?').toUpperCase()
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt="avatar"
        style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    )
  }
  return (
    <div style={{
      width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
      background: 'var(--blue-10)', border: '1px solid var(--blue-20)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 15, fontWeight: 700, color: 'var(--blue)',
    }}>{initial}</div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────
export default function UserSearchModal({ open, onClose, onSelect }) {
  const navigate       = useNavigate()
  const [query,    setQuery]    = useState('')
  const [results,  setResults]  = useState([])
  const [loading,  setLoading]  = useState(false)
  const [empty,    setEmpty]    = useState(false)
  const debounceRef = useRef(null)
  const inputRef    = useRef(null)

  // Enfocar el input al abrir
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 80)
    } else {
      setQuery(''); setResults([]); setEmpty(false)
    }
  }, [open])

  const handleQuery = useCallback((val) => {
    setQuery(val)
    setEmpty(false)
    clearTimeout(debounceRef.current)

    if (val.trim().length < 2) {
      setResults([])
      return
    }

    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await searchProfiles(val.trim())
        setResults(data)
        setEmpty(data.length === 0)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 350)
  }, [])

  function handleSelect(profile) {
    if (onSelect) {
      onSelect(profile)
      onClose()
    } else {
      navigate(`/u/${profile.username}`)
      onClose()
    }
  }

  if (!open) return null

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
          zIndex: 1000,
        }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed', top: '12%', left: '50%', transform: 'translateX(-50%)',
        width: 'min(94vw, 480px)',
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 18, zIndex: 1001,
        boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
        overflow: 'hidden',
      }}>

        {/* Campo de búsqueda */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 16px',
          borderBottom: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: 16, color: 'var(--text3)', flexShrink: 0 }}>🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => handleQuery(e.target.value)}
            placeholder="Buscar por usuario o nombre…"
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              fontSize: 14, color: 'var(--text1)', fontFamily: 'inherit',
            }}
          />
          {loading && (
            <div style={{
              width: 14, height: 14, borderRadius: '50%',
              border: '2px solid var(--blue)', borderTopColor: 'transparent',
              animation: 'spin 0.7s linear infinite', flexShrink: 0,
            }} />
          )}
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text3)', fontSize: 18, padding: 0, flexShrink: 0,
              lineHeight: 1,
            }}
          >×</button>
        </div>

        {/* Resultados */}
        <div style={{ maxHeight: 360, overflowY: 'auto' }}>
          {results.length > 0 && results.map((p) => {
            const displayName = p.display_name || p.username
            return (
              <button
                key={p.user_id}
                onClick={() => handleSelect(p)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px', background: 'none', border: 'none',
                  borderBottom: '1px solid var(--border-sub)',
                  cursor: 'pointer', textAlign: 'left',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--card-alt)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <MiniAvatar name={displayName} avatarUrl={p.avatar_url} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 14, fontWeight: 600, color: 'var(--text1)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {displayName}
                    {p.argus_verified && <span style={{ marginLeft: 4, fontSize: 12 }}>✓</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 1 }}>
                    @{p.username}{p.city ? ` · ${p.city}` : ''}
                  </div>
                </div>
                <span style={{ fontSize: 12, color: 'var(--text3)', flexShrink: 0 }}>›</span>
              </button>
            )
          })}

          {empty && (
            <div style={{
              padding: '32px 16px', textAlign: 'center',
              fontSize: 13, color: 'var(--text3)',
            }}>
              Sin resultados para "{query}"
            </div>
          )}

          {!loading && results.length === 0 && !empty && (
            <div style={{
              padding: '28px 16px', textAlign: 'center',
              fontSize: 13, color: 'var(--text3)', lineHeight: 1.6,
            }}>
              Escribe al menos 2 caracteres<br />para buscar usuarios
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </>
  )
}
