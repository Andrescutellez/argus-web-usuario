import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getCommunityFeed, getMyCommunities, exploreCommunities,
  getCommunity, createCommunity, joinCommunity, leaveCommunity,
  getCommunityPosts, createCommunityPost, deleteCommunityPost,
  createInvitation,
} from '../api/apiService.js'
import { getSocket } from '../api/realtimeService.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(ts) {
  const diff = (Date.now() - new Date(ts)) / 1000
  if (diff < 60)   return 'ahora'
  if (diff < 3600) return `hace ${Math.floor(diff/60)}min`
  if (diff < 86400) return `hace ${Math.floor(diff/3600)}h`
  return `hace ${Math.floor(diff/86400)}d`
}

function initials(name = '') {
  return name.trim().split(' ').slice(0,2).map(w => w[0]?.toUpperCase()).join('') || '?'
}

// ─── Atoms ────────────────────────────────────────────────────────────────────

function CommunityAvatar({ name, size = 48 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg, #2F81F7, #1A3A6B)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontWeight: 700, fontSize: size * 0.33,
    }}>{initials(name)}</div>
  )
}

function UserAvatar({ name, size = 36 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: '#1C2A3A',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#2F81F7', fontWeight: 700, fontSize: size * 0.38,
    }}>{initials(name)}</div>
  )
}

function TypeBadge({ type }) {
  const labels = { CLUB: 'Club', EMPRESA: 'Empresa', FAMILIA: 'Familia', BARRIO: 'Barrio', CONCESIONARIO: 'Dealer' }
  return (
    <span style={{
      background: 'rgba(47,129,247,0.1)', color: '#2F81F7',
      fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
    }}>{labels[type] || type}</span>
  )
}

function PrivacyBadge({ privacy }) {
  return privacy === 'PRIVADA'
    ? <span style={{ fontSize: 11, color: 'var(--text3)' }}>🔒</span>
    : null
}

// ─── PostCard ─────────────────────────────────────────────────────────────────

function PostCard({ post, showCommunity = false, onDelete, myId }) {
  const navigate = useNavigate()
  const isTheft  = post.type === 'THEFT_ALERT'
  const canDel   = myId === post.author_id

  return (
    <div style={{
      background: isTheft ? 'rgba(248,81,73,0.06)' : 'var(--card)',
      border: `1px solid ${isTheft ? 'rgba(248,81,73,0.3)' : 'var(--border)'}`,
      borderRadius: 12, marginBottom: 10, overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '14px 14px 10px' }}>
        <UserAvatar name={post.author_name} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span
              onClick={post.author_username ? () => navigate(`/u/${post.author_username}`) : undefined}
              style={{
                color: 'var(--text1)', fontWeight: 600, fontSize: 13,
                cursor: post.author_username ? 'pointer' : 'default',
              }}
              onMouseEnter={e => { if (post.author_username) e.currentTarget.style.textDecoration = 'underline' }}
              onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none' }}
            >{post.author_name}</span>
            {showCommunity && post.community_name && (
              <>
                <span style={{ color: 'var(--text3)', fontSize: 11 }}>en</span>
                <span style={{ color: '#2F81F7', fontSize: 11 }}>{post.community_name}</span>
              </>
            )}
            <span style={{ color: 'var(--text3)', fontSize: 11, marginLeft: 'auto' }}>{timeAgo(post.created_at)}</span>
          </div>
          {isTheft && (
            <span style={{
              display: 'inline-block', marginTop: 4,
              background: 'rgba(248,81,73,0.15)', color: '#F85149',
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
            }}>🚨 ALERTA DE ROBO</span>
          )}
        </div>
        {canDel && (
          <button
            onClick={() => onDelete?.(post)}
            style={{ background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text3)', padding: 4, borderRadius: 4, fontSize: 14 }}
            title="Eliminar"
          >✕</button>
        )}
      </div>
      <div style={{ padding: '0 14px 12px', color: 'var(--text1)', fontSize: 14, lineHeight: 1.5 }}>
        {post.content}
      </div>
      {post.lat && post.lng && (
        <div style={{ padding: '0 14px 10px', color: 'var(--orange)', fontSize: 11, display: 'flex', gap: 4 }}>
          📍 {Number(post.lat).toFixed(4)}, {Number(post.lng).toFixed(4)}
        </div>
      )}
    </div>
  )
}

// ─── CommunityCard ────────────────────────────────────────────────────────────

function CommunityCard({ community, active, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: active ? 'color-mix(in srgb, #2F81F7 12%, var(--card))' : 'var(--card)',
        border: `1px solid ${active ? '#2F81F7' : 'var(--border)'}`,
        borderRadius: 12, padding: 16, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 14,
        transition: 'border-color 0.15s, background 0.15s',
        marginBottom: 6,
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.borderColor = '#2F81F7' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.borderColor = 'var(--border)' }}
    >
      <CommunityAvatar name={community.name} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ color: 'var(--text1)', fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {community.name}
          </span>
          <PrivacyBadge privacy={community.privacy} />
        </div>
        {community.description && (
          <div style={{ color: 'var(--text2)', fontSize: 12, marginBottom: 4,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {community.description}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--text3)', fontSize: 11 }}>👥 {community.member_count} miembros</span>
          <TypeBadge type={community.type} />
          {community.role && (
            <span style={{ color: '#3FB950', fontSize: 11, fontWeight: 600 }}>
              {community.role === 'OWNER' ? 'Propietario' : community.role === 'ADMIN' ? 'Admin' : 'Miembro'}
            </span>
          )}
        </div>
      </div>
      <span style={{ color: 'var(--text3)', fontSize: 18 }}>›</span>
    </div>
  )
}

// ─── CommunityDetail (panel derecho) ─────────────────────────────────────────

function CommunityDetail({ communityId, myId, onBack }) {
  const [detail,  setDetail]  = useState(null)
  const [posts,   setPosts]   = useState([])
  const [loading, setLoading] = useState(true)
  const [isMember, setIsMember] = useState(false)
  const [composing, setComposing] = useState(false)
  const [content, setContent] = useState('')
  const [posting, setPosting] = useState(false)
  const [invToken, setInvToken] = useState(null)
  const [copied, setCopied]   = useState(false)

  useEffect(() => {
    load()
  }, [communityId])

  useEffect(() => {
    const sock = getSocket()
    if (!sock) return
    const h = (data) => {
      if (data.community_id === communityId) setPosts(p => [data, ...p])
    }
    sock.on('community:post', h)
    sock.on('community:theft_alert', h)
    sock.emit('community:join', [communityId])
    return () => { sock.off('community:post', h); sock.off('community:theft_alert', h) }
  }, [communityId])

  async function load() {
    setLoading(true)
    const [dRes, pRes] = await Promise.all([
      getCommunity(communityId).catch(() => null),
      getCommunityPosts(communityId).catch(() => null),
    ])
    if (dRes?.data) { setDetail(dRes.data); setIsMember(!!dRes.data.role) }
    if (pRes?.data) setPosts(pRes.data)
    setLoading(false)
  }

  async function handleJoin() {
    await joinCommunity(communityId)
    setIsMember(true)
    setDetail(d => d ? { ...d, member_count: d.member_count + 1 } : d)
  }

  async function handleLeave() {
    if (!window.confirm(`¿Salir de "${detail?.name}"?`)) return
    await leaveCommunity(communityId)
    setIsMember(false)
    setDetail(d => d ? { ...d, member_count: d.member_count - 1, role: null } : d)
  }

  async function handlePost() {
    if (!content.trim()) return
    setPosting(true)
    const res = await createCommunityPost(communityId, { content: content.trim() }).catch(() => null)
    setPosting(false)
    if (res?.data) { setPosts(p => [res.data, ...p]); setContent(''); setComposing(false) }
  }

  async function handleDelete(post) {
    if (!window.confirm('¿Eliminar publicación?')) return
    await deleteCommunityPost(communityId, post.id).catch(() => {})
    setPosts(p => p.filter(x => x.id !== post.id))
  }

  async function handleInvite() {
    const res = await createInvitation(communityId).catch(() => null)
    if (res?.data?.token) { setInvToken(res.data.token); setCopied(false) }
  }

  function copyToken() {
    navigator.clipboard.writeText(invToken)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      <div style={{ color: 'var(--text3)' }}>Cargando comunidad…</div>
    </div>
  )

  if (!detail) return (
    <div style={{ padding: 32, textAlign: 'center', color: 'var(--text3)' }}>
      No se pudo cargar la comunidad.
    </div>
  )

  const isAdmin = detail.role === 'OWNER' || detail.role === 'ADMIN'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)', padding: '14px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', fontSize: 20, padding: 0 }}>←</button>
          <CommunityAvatar name={detail.name} size={52} />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--text1)', fontWeight: 700, fontSize: 16 }}>{detail.name}</span>
              <PrivacyBadge privacy={detail.privacy} />
              <TypeBadge type={detail.type} />
            </div>
            <div style={{ color: 'var(--text3)', fontSize: 12, marginTop: 2 }}>👥 {detail.member_count} miembros</div>
          </div>
          {isAdmin && (
            <button onClick={handleInvite} style={{
              background: 'rgba(47,129,247,0.1)', border: '1px solid rgba(47,129,247,0.3)',
              color: '#2F81F7', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 12,
            }}>+ Invitar</button>
          )}
          {isMember && detail.role !== 'OWNER' && (
            <button onClick={handleLeave} style={{
              background: 'none', border: '1px solid var(--border)',
              color: 'var(--text3)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 12,
            }}>Salir</button>
          )}
          {!isMember && detail.privacy === 'PUBLICA' && (
            <button onClick={handleJoin} style={{
              background: '#2F81F7', border: 'none',
              color: '#fff', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 600,
            }}>Unirse</button>
          )}
        </div>
        {detail.description && (
          <div style={{ color: 'var(--text2)', fontSize: 13, paddingLeft: 4 }}>{detail.description}</div>
        )}
        {invToken && (
          <div style={{
            marginTop: 10, background: 'var(--card-alt)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ color: 'var(--text2)', fontSize: 12 }}>Código de invitación:</span>
            <code style={{ color: '#2F81F7', fontSize: 13, flex: 1 }}>{invToken}</code>
            <button onClick={copyToken} style={{
              background: 'none', border: '1px solid var(--border)', borderRadius: 6,
              padding: '3px 10px', cursor: 'pointer', color: copied ? '#3FB950' : 'var(--text2)', fontSize: 12,
            }}>{copied ? '✓ Copiado' : 'Copiar'}</button>
          </div>
        )}
      </div>

      {/* Compose area */}
      {isMember && (
        <div style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)', padding: '12px 20px' }}>
          {!composing ? (
            <div
              onClick={() => setComposing(true)}
              style={{
                background: 'var(--card-alt)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '10px 14px', cursor: 'text',
                color: 'var(--text3)', fontSize: 14,
              }}
            >¿Qué quieres compartir con la comunidad?</div>
          ) : (
            <div>
              <textarea
                autoFocus
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="¿Qué quieres compartir?"
                style={{
                  width: '100%', minHeight: 80, background: 'var(--card-alt)',
                  border: '1px solid #2F81F7', borderRadius: 10, padding: 12,
                  color: 'var(--text1)', fontSize: 14, resize: 'vertical',
                  fontFamily: 'inherit', boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <button onClick={() => setComposing(false)} style={{
                  background: 'none', border: '1px solid var(--border)',
                  color: 'var(--text2)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer',
                }}>Cancelar</button>
                <button onClick={handlePost} disabled={posting || !content.trim()} style={{
                  background: '#2F81F7', border: 'none', color: '#fff',
                  borderRadius: 8, padding: '6px 16px', cursor: 'pointer',
                  fontWeight: 600, opacity: (posting || !content.trim()) ? 0.5 : 1,
                }}>{posting ? 'Publicando…' : 'Publicar'}</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Posts */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
        {posts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text3)' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>💬</div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Aún no hay publicaciones</div>
            <div style={{ fontSize: 13 }}>{isMember ? '¡Sé el primero en publicar!' : 'Únete para ver el contenido'}</div>
          </div>
        ) : (
          posts.map(p => (
            <PostCard key={p.id} post={p} myId={myId} onDelete={handleDelete} />
          ))
        )}
      </div>
    </div>
  )
}

// ─── Main CommunityPage ───────────────────────────────────────────────────────

export default function CommunityPage() {
  const [tab,         setTab]         = useState('feed')   // 'feed' | 'mine' | 'explore'
  const [feed,        setFeed]        = useState([])
  const [feedLoading, setFeedLoading] = useState(true)
  const [mine,        setMine]        = useState([])
  const [mineLoading, setMineLoading] = useState(true)
  const [explore,     setExplore]     = useState([])
  const [explLoading, setExplLoading] = useState(true)
  const [search,      setSearch]      = useState('')
  const [selected,    setSelected]    = useState(null)
  const [showCreate,  setShowCreate]  = useState(false)
  const [isMobile,    setIsMobile]    = useState(() => window.innerWidth < 768)

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // myId desde el JWT en localStorage
  const myId = (() => {
    try {
      const raw = localStorage.getItem('argus_token')
      if (!raw) return null
      const payload = JSON.parse(atob(raw.split('.')[1]))
      return payload.sub
    } catch { return null }
  })()

  useEffect(() => { loadFeed(); loadMine(); loadExplore() }, [])

  useEffect(() => {
    const sock = getSocket()
    if (!sock) return
    const h = (data) => setFeed(f => [data, ...f])
    const th = (data) => { setFeed(f => [data, ...f]) }
    sock.on('community:post', h)
    sock.on('community:theft_alert', th)
    return () => { sock.off('community:post', h); sock.off('community:theft_alert', th) }
  }, [])

  async function loadFeed() {
    setFeedLoading(true)
    const res = await getCommunityFeed().catch(() => null)
    setFeed(res?.data || [])
    setFeedLoading(false)
  }

  async function loadMine() {
    setMineLoading(true)
    const res = await getMyCommunities().catch(() => null)
    const communities = res?.data || []
    setMine(communities)
    setMineLoading(false)
    if (communities.length) {
      const sock = getSocket()
      sock?.emit('community:join', communities.map(c => c.id))
    }
  }

  async function loadExplore(q = search) {
    setExplLoading(true)
    const res = await exploreCommunities(q).catch(() => null)
    setExplore(res?.data || [])
    setExplLoading(false)
  }

  async function handleCreate({ name, description, type, privacy }) {
    const res = await createCommunity({ name, description, type, privacy })
    if (res?.data) {
      setMine(m => [res.data, ...m])
      setSelected(res.data.id)
      setShowCreate(false)
    }
  }

  const TAB_STYLE = (active) => ({
    background: 'none', border: 'none', cursor: 'pointer', padding: '10px 16px',
    fontWeight: active ? 700 : 500, fontSize: 13,
    color: active ? '#2F81F7' : 'var(--text3)',
    borderBottom: active ? '2px solid #2F81F7' : '2px solid transparent',
    transition: 'all 0.15s',
  })

  // En móvil con comunidad seleccionada → mostrar solo el detalle
  if (isMobile && selected) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
        <CommunityDetail
          key={selected}
          communityId={selected}
          myId={myId}
          onBack={() => setSelected(null)}
        />
        {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreate={handleCreate} />}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--bg)' }}>

      {/* Sidebar/lista — en móvil ocupa todo, en desktop 360 px fijo */}
      <div style={{
        width: isMobile ? '100%' : 360,
        minWidth: isMobile ? 0 : 300,
        maxWidth: isMobile ? '100%' : 400,
        borderRight: isMobile ? 'none' : '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        flexShrink: 0,
        background: 'var(--bg)',
      }}>
        {/* Header sidebar */}
        <div style={{
          background: 'var(--card)', borderBottom: '1px solid var(--border)',
          padding: '14px 18px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ color: 'var(--text1)', fontWeight: 700, fontSize: 17 }}>Comunidades</span>
          <button onClick={() => setShowCreate(true)} style={{
            background: '#2F81F7', border: 'none', color: '#fff',
            borderRadius: 8, padding: '7px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}>+ Nueva</button>
        </div>

        {/* Tabs */}
        <div style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)', display: 'flex' }}>
          <button style={TAB_STYLE(tab === 'feed')}    onClick={() => setTab('feed')}>Inicio</button>
          <button style={TAB_STYLE(tab === 'mine')}    onClick={() => setTab('mine')}>Mis grupos</button>
          <button style={TAB_STYLE(tab === 'explore')} onClick={() => setTab('explore')}>Explorar</button>
        </div>

        {/* Lista */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>

          {tab === 'feed' && (
            feedLoading ? <Spinner /> :
            feed.length === 0
              ? <Empty icon="📰" title="Tu feed está vacío" sub="Únete a una comunidad para ver publicaciones" />
              : feed.map(p => (
                  <PostCard key={p.id} post={p} showCommunity myId={myId}
                    onDelete={async (post) => {
                      await deleteCommunityPost(post.community_id, post.id).catch(() => {})
                      setFeed(f => f.filter(x => x.id !== post.id))
                    }} />
                ))
          )}

          {tab === 'mine' && (
            mineLoading ? <Spinner /> :
            mine.length === 0
              ? <Empty icon="👥" title="No estás en ningún grupo" sub="Crea uno o únete desde Explorar"
                  action="Crear comunidad" onAction={() => setShowCreate(true)} />
              : mine.map(c => (
                  <CommunityCard key={c.id} community={c}
                    active={selected === c.id}
                    onClick={() => setSelected(c.id)} />
                ))
          )}

          {tab === 'explore' && (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && loadExplore()}
                  placeholder="Buscar comunidades…"
                  style={{
                    flex: 1, background: 'var(--card)', border: '1px solid var(--border)',
                    borderRadius: 8, padding: '8px 12px', color: 'var(--text1)', fontSize: 13,
                    outline: 'none',
                  }}
                />
                <button onClick={() => loadExplore()} style={{
                  background: '#2F81F7', border: 'none', color: '#fff',
                  borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13,
                }}>Buscar</button>
              </div>
              {explLoading ? <Spinner /> :
                explore.length === 0
                  ? <Empty icon="🔍" title="Sin resultados" sub="Prueba otro término" />
                  : explore.map(c => (
                      <CommunityCard key={c.id} community={c}
                        active={selected === c.id}
                        onClick={() => setSelected(c.id)} />
                    ))
              }
            </>
          )}
        </div>
      </div>

      {/* Panel derecho — solo en desktop */}
      {!isMobile && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          {selected ? (
            <CommunityDetail
              key={selected}
              communityId={selected}
              myId={myId}
              onBack={() => setSelected(null)}
            />
          ) : (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 12,
              color: 'var(--text3)',
            }}>
              <svg width="56" height="56" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.3 }}>
                <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
              </svg>
              <span style={{ fontSize: 15, fontWeight: 500 }}>Selecciona una comunidad</span>
              <span style={{ fontSize: 13, maxWidth: 260, textAlign: 'center', lineHeight: 1.5 }}>
                Elige un grupo de la lista o crea uno nuevo para ver su contenido
              </span>
            </div>
          )}
        </div>
      )}

      {/* Modal crear */}
      {showCreate && (
        <CreateModal onClose={() => setShowCreate(false)} onCreate={handleCreate} />
      )}
    </div>
  )
}

// ─── Modal crear comunidad ────────────────────────────────────────────────────

function CreateModal({ onClose, onCreate }) {
  const [name, setName]       = useState('')
  const [desc, setDesc]       = useState('')
  const [type, setType]       = useState('CLUB')
  const [privacy, setPrivacy] = useState('PUBLICA')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const types = ['CLUB', 'EMPRESA', 'FAMILIA', 'BARRIO', 'CONCESIONARIO']

  async function submit() {
    if (!name.trim()) return
    setLoading(true)
    setError('')
    try {
      await onCreate({ name: name.trim(), description: desc.trim() || undefined, type, privacy })
    } catch (e) {
      setError('Error al crear la comunidad. Intenta de nuevo.')
    }
    setLoading(false)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 16, padding: 28, width: '100%', maxWidth: 460,
        margin: '0 16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ margin: 0, color: 'var(--text1)', fontSize: 17 }}>Nueva comunidad</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 18 }}>✕</button>
        </div>

        <Field label="Nombre *" value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Club Riders Bogotá" />
        <Field label="Descripción" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Opcional" rows={2} style={{ marginTop: 12 }} />

        <div style={{ marginTop: 12 }}>
          <label style={{ color: 'var(--text2)', fontSize: 12, fontWeight: 600 }}>Tipo</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            {types.map(t => (
              <button key={t} onClick={() => setType(t)} style={{
                background: type === t ? '#2F81F7' : 'var(--card-alt)',
                border: `1px solid ${type === t ? '#2F81F7' : 'var(--border)'}`,
                color: type === t ? '#fff' : 'var(--text2)',
                borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12,
              }}>{t}</button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ color: 'var(--text2)', fontSize: 12, fontWeight: 600 }}>Privacidad:</label>
          {['PUBLICA', 'PRIVADA'].map(p => (
            <button key={p} onClick={() => setPrivacy(p)} style={{
              background: privacy === p ? '#2F81F7' : 'var(--card-alt)',
              border: `1px solid ${privacy === p ? '#2F81F7' : 'var(--border)'}`,
              color: privacy === p ? '#fff' : 'var(--text2)',
              borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 12,
            }}>{p === 'PUBLICA' ? 'Pública' : 'Privada'}</button>
          ))}
        </div>

        {error && (
          <div style={{ marginTop: 12, color: '#F85149', fontSize: 12, background: 'rgba(248,81,73,0.1)', borderRadius: 6, padding: '8px 12px' }}>
            ⚠️ {error}
          </div>
        )}

        <button onClick={submit} disabled={loading || !name.trim()} style={{
          width: '100%', marginTop: 16, padding: '12px',
          background: '#2F81F7', border: 'none', color: '#fff',
          borderRadius: 10, cursor: loading || !name.trim() ? 'not-allowed' : 'pointer',
          fontWeight: 700, fontSize: 14,
          opacity: (loading || !name.trim()) ? 0.5 : 1,
        }}>{loading ? 'Creando…' : 'Crear comunidad'}</button>
      </div>
    </div>
  )
}

// ─── Utilidades de UI ─────────────────────────────────────────────────────────

const FIELD_INPUT_STYLE = {
  width: '100%', background: 'var(--card-alt)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '8px 12px', color: 'var(--text1)', fontSize: 13,
  fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none',
}

function Field({ label, value, onChange, placeholder, rows, style }) {
  return (
    <div style={style}>
      <label style={{ color: 'var(--text2)', fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>{label}</label>
      {rows
        ? <textarea value={value} onChange={onChange} placeholder={placeholder} rows={rows}
            style={{ ...FIELD_INPUT_STYLE, resize: 'vertical' }} />
        : <input value={value} onChange={onChange} placeholder={placeholder}
            style={FIELD_INPUT_STYLE} />
      }
    </div>
  )
}

function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
      <div style={{
        width: 28, height: 28, border: '3px solid var(--border)',
        borderTopColor: '#2F81F7', borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

function Empty({ icon, title, sub, action, onAction }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>{icon}</div>
      <div style={{ color: 'var(--text1)', fontWeight: 600, marginBottom: 6 }}>{title}</div>
      <div style={{ color: 'var(--text2)', fontSize: 13 }}>{sub}</div>
      {action && (
        <button onClick={onAction} style={{
          marginTop: 16, background: '#2F81F7', border: 'none',
          color: '#fff', borderRadius: 8, padding: '8px 18px', cursor: 'pointer', fontWeight: 600,
        }}>{action}</button>
      )}
    </div>
  )
}

