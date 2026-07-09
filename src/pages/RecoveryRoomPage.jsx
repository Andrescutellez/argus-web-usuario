/**
 * @fileoverview Sala de Recuperación — Web Usuario (Argus Secure).
 *
 * PROPÓSITO:
 *   Pantalla que el propietario ve tras confirmar un robo. Muestra:
 *   - Mapa MapLibre con la posición de la moto en tiempo real (geo-stream WebSocket).
 *   - Botón PTT para hablar con agentes REACTION y aliados (LiveKit).
 *   - Timer del evento desde la apertura de la sala.
 *   - Botón "MOTO RECUPERADA" para cerrar la sala con resolución RECOVERED.
 *
 * FLUJO:
 *   SecurityPage → POST /api/secure/rooms → navigate('/recovery-room', { state: { roomData } })
 *   RecoveryRoomPage monta → conecta WebSocket geo-stream → muestra GPS live.
 *
 * GEO-STREAM:
 *   Protocolo idéntico al del operador: { type:'auth', token } → { type:'gps_update', lat, lng }
 *
 * CSS VARS:
 *   --bg, --card, --card-alt, --border, --text1, --text2, --text3,
 *   --accent, --accent-10, --armed, --armed-10, --green, --green-10, --orange.
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import api, { closeSecureRoomApi, sendCommand } from '../api/apiService.js'
import { buildArgusStyle, MAP_STYLES } from '../lib/mapConfig.js'
import { useStore } from '../store/useStore.js'

const ACTIVE_ROOM_KEY = 'argus:active_room'

// ── Moto SVG marker (igual que mapa principal) ─────────────────────────────
let _motoSvgCache      = null
let _motoSvgNightCache = null
fetch('/moto-icon.svg').then(r => r.text()).then(t => { _motoSvgCache = t })
fetch('/moto-icon-night.svg').then(r => r.text()).then(t => { _motoSvgNightCache = t })

function _isDarkMode() {
  const el = document.documentElement
  return el.dataset.theme === 'dark' ||
    (!el.dataset.theme && window.matchMedia?.('(prefers-color-scheme: dark)').matches)
}

function motoSizeForZoom(zoom) {
  if (zoom >= 18) return 120
  if (zoom >= 17) return 86
  if (zoom >= 16) return 66
  return 52
}

// Siempre armed+glow rojo: la sala de recuperación implica STATE_PURSUIT.
function makePursuitMarkerEl(zoom = 15) {
  const size = motoSizeForZoom(zoom)
  const _activeSvg = _isDarkMode() ? (_motoSvgNightCache ?? _motoSvgCache) : _motoSvgCache
  const svg = _activeSvg
    ? _activeSvg
        .replace(/width="1254\.000000pt"/, `width="${size}"`)
        .replace(/height="1254\.000000pt"/, `height="${size}"`)
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52" width="${size}" height="${size}">
         <ellipse cx="26" cy="26" rx="20" ry="26" fill="#000"/>
         <line x1="6" y1="20" x2="0" y2="20" stroke="#000" stroke-width="4" stroke-linecap="round"/>
         <line x1="46" y1="20" x2="52" y2="20" stroke="#000" stroke-width="4" stroke-linecap="round"/>
       </svg>`
  const el = document.createElement('div')
  el.style.cssText = `position:relative;width:${size}px;height:${size}px;`
  el.innerHTML = `
    <style>@keyframes rr-glow{0%,100%{transform:scale(1);opacity:.65}50%{transform:scale(1.4);opacity:1}}</style>
    <div style="
      position:absolute;
      width:${size * 2}px;height:${size * 2}px;
      top:-${size * .5}px;left:-${size * .5}px;
      border-radius:50%;
      background:radial-gradient(circle,rgba(229,72,77,.85) 0%,rgba(229,72,77,.45) 38%,transparent 72%);
      animation:rr-glow 1.8s ease-in-out infinite;
      pointer-events:none;
    "></div>
    <div style="width:${size}px;height:${size}px;">${svg}</div>`
  return el
}

export default function RecoveryRoomPage() {
  const location          = useLocation()
  const navigate          = useNavigate()
  const roomData          = location.state?.roomData
  const deviceId          = location.state?.deviceId
  const motoAlias         = location.state?.motoAlias ?? null
  const motoPlaca         = location.state?.motoPlaca ?? null
  const lastKnownPosition = location.state?.lastKnownPosition ?? null

  const { theme } = useStore()

  // Resolver estilo del mapa según tema de la app
  const effectiveMapStyle = useMemo(() => {
    const id = theme === 'dark' ? 'argus-night' : 'argus-day'
    return MAP_STYLES.find(s => s.id === id) ?? MAP_STYLES.find(s => s.id === 'argus-day')
  }, [theme])

  // ── Geo-stream ───────────────────────────────────────────────────────────
  const wsRef             = useRef(null)
  const [geoStatus, setGeoStatus] = useState('connecting')
  const [lastPos,   setLastPos]   = useState(null)

  // ── Mapa ──────────────────────────────────────────────────────────────────
  const mapContainerRef = useRef(null)
  const mapRef          = useRef(null)
  const markerRef       = useRef(null)
  // Persiste la última posición GPS válida para restaurar el marcador si el mapa se reconstruye
  const lastPosRef      = useRef(lastKnownPosition)

  // ── PTT ───────────────────────────────────────────────────────────────────
  const [pttActive, setPttActive] = useState(false)

  // ── Timer ─────────────────────────────────────────────────────────────────
  const [elapsed, setElapsed] = useState(0)

  // ── Cierre de sala ────────────────────────────────────────────────────────
  const [closing,        setClosing]        = useState(false)
  const [confirmVisible, setConfirmVisible] = useState(false)

  // Redirigir si no hay roomData (acceso directo a la URL)
  useEffect(() => {
    if (!roomData) navigate('/security', { replace: true })
  }, [roomData, navigate])

  // Persistir sala activa en sessionStorage para que SecurityPage muestre "REGRESAR"
  useEffect(() => {
    if (roomData) {
      sessionStorage.setItem(ACTIVE_ROOM_KEY, JSON.stringify({
        roomData, deviceId,
        motoAlias:         motoAlias ?? null,
        motoPlaca:         motoPlaca ?? null,
        lastKnownPosition: lastKnownPosition ?? null,
      }))
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Geo-stream ────────────────────────────────────────────────────────────
  const connectGeoStream = useCallback(() => {
    if (!roomData?.geoWsUrl || !roomData?.geoToken) return
    if (wsRef.current) wsRef.current.close()

    const wsUrl = roomData.geoWsUrl.replace(/^http/, 'ws').replace(/^https/, 'wss')
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token: roomData.geoToken }))
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'auth_ok') setGeoStatus('connected')
        if (msg.type === 'gps_update' || msg.type === 'last_position') {
          const pos = { lat: msg.lat, lng: msg.lng, ts: msg.timestamp }
          setLastPos(pos)
          lastPosRef.current = pos   // persiste para restaurar marcador si mapa se reconstruye
          updateMarker(pos)
        }
      } catch { /* ignore */ }
    }
    ws.onerror  = () => setGeoStatus('error')
    ws.onclose  = () => {
      setGeoStatus('disconnected')
      if (wsRef.current === ws) {
        setTimeout(connectGeoStream, 3000)
      }
    }
  }, [roomData?.geoWsUrl, roomData?.geoToken]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    connectGeoStream()
    return () => { wsRef.current?.close(); wsRef.current = null }
  }, [connectGeoStream])

  // ── Mapa ──────────────────────────────────────────────────────────────────
  // Se re-ejecuta cuando cambia el tema (effectiveMapStyle.id cambia) — destruye
  // y recrea el mapa con la paleta correcta, restaurando el marcador en lastPosRef.
  useEffect(() => {
    if (!mapContainerRef.current) return

    // Destruir mapa anterior (cambio de tema)
    if (mapRef.current) {
      mapRef.current.remove()
      mapRef.current    = null
      markerRef.current = null
    }

    const initPos = lastPosRef.current               // nav state o último GPS en vivo
    const center  = initPos ? [initPos.lng, initPos.lat] : [-74.0341, 4.6956]

    buildArgusStyle(effectiveMapStyle.url, effectiveMapStyle.palette)
      .then((style) => {
        if (!mapContainerRef.current) return
        mapRef.current = new maplibregl.Map({
          container:          mapContainerRef.current,
          style,
          center,
          zoom:               15,
          attributionControl: false,
        })
        // Esperar style.load: garantiza que el mapa está listo para posicionar elementos HTML.
        // lastPosRef.current puede tener GPS en vivo que llegó mientras cargaba el estilo.
        mapRef.current.once('load', () => {
          const markerPos = lastPosRef.current
          if (markerPos && mapRef.current) {
            markerRef.current = new maplibregl.Marker({
              element: makePursuitMarkerEl(mapRef.current.getZoom()),
              anchor:  'center',
            })
              .setLngLat([markerPos.lng, markerPos.lat])
              .addTo(mapRef.current)
          }
        })
      })
      .catch(console.error)

    return () => {
      mapRef.current?.remove()
      mapRef.current    = null
      markerRef.current = null
    }
  }, [effectiveMapStyle.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const updateMarker = ({ lat, lng }) => {
    if (!mapRef.current) return
    if (markerRef.current) {
      markerRef.current.setLngLat([lng, lat])
    } else {
      markerRef.current = new maplibregl.Marker({
        element: makePursuitMarkerEl(mapRef.current.getZoom()),
        anchor:  'center',
      })
        .setLngLat([lng, lat])
        .addTo(mapRef.current)
    }
    mapRef.current.easeTo({ center: [lng, lat], duration: 400 })
  }

  // ── Timer ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const pad = (n) => String(n).padStart(2, '0')
  const timerLabel = `${pad(Math.floor(elapsed / 60))}:${pad(elapsed % 60)}`

  // ── Cerrar sala ───────────────────────────────────────────────────────────
  const handleClose = async () => {
    if (closing) return
    setClosing(true)
    setConfirmVisible(false)
    try {
      await closeSecureRoomApi(roomData.roomName, 'RECOVERED')
    } catch (err) {
      // 404 = sala ya expiró o fue cerrada por otro participante — continuar de todas formas
      if (err.response?.status !== 404) {
        setClosing(false)
        alert('Error al cerrar la sala: ' + (err.response?.data?.message ?? err.message))
        return
      }
    }
    sessionStorage.removeItem(ACTIVE_ROOM_KEY)
    if (deviceId) {
      await sendCommand(deviceId, 'ENGINE_RESTORE').catch(() => {})
      await sendCommand(deviceId, 'DISARM').catch(() => {})
    }
    navigate('/security', { replace: true })
  }

  if (!roomData) return null

  const statusColor = {
    connected:    'var(--green)',
    connecting:   'var(--orange)',
    disconnected: 'var(--text3)',
    error:        'var(--armed)',
  }[geoStatus] ?? 'var(--text3)'

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      background: 'var(--bg)',
    }}>

      {/* ── Header ── */}
      <div style={{
        padding: '12px 20px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--card)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: 'var(--armed)',
            boxShadow: '0 0 8px rgba(229,72,77,0.5)',
          }} />
          <span style={{
            fontSize: 12, fontWeight: 800, color: 'var(--armed)',
            letterSpacing: '1px',
          }}>SALA DE RECUPERACIÓN</span>
        </div>
        <div style={{
          marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10,
        }}>
          {/* GPS status */}
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
            color: statusColor,
            background: geoStatus === 'connected' ? 'var(--green-10)' : 'var(--card-alt)',
            border: `1px solid ${statusColor}40`,
          }}>
            {geoStatus === 'connected' ? 'GPS EN VIVO' : geoStatus.toUpperCase()}
          </span>
          {/* Timer */}
          <span style={{
            fontSize: 13, fontWeight: 700, fontFamily: 'monospace',
            padding: '4px 10px', borderRadius: 8,
            background: 'var(--card-alt)', border: '1px solid var(--border)',
            color: 'var(--text1)',
          }}>{timerLabel}</span>
          {/* Salir sin cerrar */}
          <button
            onClick={() => navigate('/security')}
            style={{
              padding: '6px 12px', borderRadius: 8, fontSize: 11,
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--text2)', cursor: 'pointer',
            }}
          >Salir</button>
        </div>
      </div>

      {/* Datos de moto + última posición */}
      <div style={{
        padding: '6px 20px',
        background: 'var(--card)', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        {(motoAlias || motoPlaca) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13 }}>🏍️</span>
            {motoAlias && (
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text1)' }}>{motoAlias}</span>
            )}
            {motoPlaca && (
              <span style={{
                fontSize: 11, fontWeight: 700, color: 'var(--text3)',
                padding: '1px 6px', borderRadius: 5,
                background: 'var(--card-alt)', border: '1px solid var(--border)',
                fontFamily: 'monospace', letterSpacing: '1px',
              }}>{motoPlaca}</span>
            )}
          </div>
        )}
        {lastPos && (
          <span style={{
            fontSize: 10, color: 'var(--text3)', fontFamily: 'monospace',
            marginLeft: 'auto',
          }}>
            📍 {lastPos.lat.toFixed(5)}, {lastPos.lng.toFixed(5)}
            {geoStatus === 'disconnected' && (
              <span style={{ marginLeft: 6, color: 'var(--orange)' }}>· GPS interrumpido</span>
            )}
          </span>
        )}
      </div>

      {/* ── Mapa ── */}
      <div ref={mapContainerRef} style={{ flex: 1 }} />

      {/* ── PTT walkie-talkie ── */}
      <style>{`
        @keyframes ptt-ring {
          0%   { transform: scale(1);    opacity: 0.6; }
          100% { transform: scale(1.55); opacity: 0; }
        }
        .ptt-ring { animation: ptt-ring 0.9s ease-out infinite; }
      `}</style>
      <div style={{
        padding: '12px 20px 8px',
        borderTop: '1px solid var(--border)',
        background: 'var(--card)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      }}>
        {/* Botón circular */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {/* Aro pulsante — solo cuando está hablando */}
          {pttActive && (
            <div className="ptt-ring" style={{
              position: 'absolute',
              width: 80, height: 80, borderRadius: '50%',
              border: '3px solid rgba(229,72,77,0.7)',
              pointerEvents: 'none',
            }} />
          )}
          <button
            onMouseDown={() => setPttActive(true)}
            onMouseUp={() => setPttActive(false)}
            onMouseLeave={() => setPttActive(false)}
            onTouchStart={(e) => { e.preventDefault(); setPttActive(true) }}
            onTouchEnd={() => setPttActive(false)}
            style={{
              width: 80, height: 80, borderRadius: '50%',
              cursor: 'pointer', userSelect: 'none',
              border: `3px solid ${pttActive ? 'var(--armed)' : 'rgba(229,72,77,0.4)'}`,
              background: pttActive
                ? 'radial-gradient(circle at 38% 38%, #ff5f52, #c0392b)'
                : 'radial-gradient(circle at 38% 38%, rgba(229,72,77,0.18), rgba(229,72,77,0.06))',
              boxShadow: pttActive
                ? '0 0 0 6px rgba(229,72,77,0.25), 0 4px 20px rgba(229,72,77,0.45)'
                : '0 0 0 4px rgba(229,72,77,0.08)',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 2,
              transition: 'all 0.08s ease',
              transform: pttActive ? 'scale(0.94)' : 'scale(1)',
            }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24"
              fill={pttActive ? '#fff' : 'rgba(229,72,77,0.9)'}>
              {pttActive
                ? <path d="M12 15c1.66 0 3-1.34 3-3V6c0-1.66-1.34-3-3-3S9 4.34 9 6v6c0 1.66 1.34 3 3 3z M17 12c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-2.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                : <path d="M12 15c1.66 0 3-1.34 3-3V6c0-1.66-1.34-3-3-3S9 4.34 9 6v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 15.2 14.47 17 12 17s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V21h2v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z"/>
              }
            </svg>
          </button>
        </div>
        {/* Label */}
        <div style={{
          fontSize: 10, fontWeight: 800, letterSpacing: '1.2px',
          color: pttActive ? 'var(--armed)' : 'var(--text3)',
          transition: 'color 0.1s',
        }}>
          {pttActive ? '● EN AIRE — HABLANDO' : 'MANTENER PARA HABLAR'}
        </div>
      </div>

      {/* ── Acciones ── */}
      <div style={{
        padding: '8px 20px 4px',
        background: 'var(--card)',
        display: 'flex', gap: 10,
      }}>
        <button
          onClick={() => navigate('/security')}
          style={{
            flex: 1, padding: '12px 0', borderRadius: 10, fontSize: 12,
            border: '1px solid var(--border)', background: 'var(--card-alt)',
            color: 'var(--text2)', cursor: 'pointer', fontWeight: 700,
          }}
        >Salir</button>
        <button
          onClick={() => setConfirmVisible(true)}
          disabled={closing}
          style={{
            flex: 2, padding: '12px 0', borderRadius: 10, fontSize: 12,
            border: 'none', background: 'var(--green)',
            color: '#fff', cursor: closing ? 'not-allowed' : 'pointer',
            fontWeight: 800, letterSpacing: '0.5px',
          }}
        >
          {closing ? 'Cerrando…' : '🏁 MOTO RECUPERADA'}
        </button>
      </div>
      <div style={{
        textAlign: 'center', fontSize: 10, color: 'var(--text3)',
        paddingBottom: 10, background: 'var(--card)',
      }}>
        La sala permanece activa. Regresa desde Seguridad.
      </div>

      {/* ── Modal de confirmación ── */}
      {confirmVisible && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999,
        }} onClick={() => setConfirmVisible(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: 16, padding: 24, maxWidth: 340, width: '90%',
            }}
          >
            <div style={{ fontSize: 32, textAlign: 'center', marginBottom: 10 }}>🏁</div>
            <h3 style={{ margin: '0 0 8px', fontSize: 15, color: 'var(--text1)', textAlign: 'center' }}>
              ¿Recuperaste la moto?
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text2)', lineHeight: 1.5, textAlign: 'center' }}>
              Esto cerrará la sala, notificará a todos los participantes y marcará el incidente como resuelto.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setConfirmVisible(false)}
                style={{
                  flex: 1, padding: '11px 0', borderRadius: 10, fontSize: 13,
                  border: '1px solid var(--border)', background: 'var(--card-alt)',
                  color: 'var(--text2)', cursor: 'pointer',
                }}
              >Cancelar</button>
              <button
                onClick={handleClose}
                style={{
                  flex: 2, padding: '11px 0', borderRadius: 10, fontSize: 13,
                  border: 'none', background: 'var(--green)',
                  color: '#fff', cursor: 'pointer', fontWeight: 800,
                }}
              >Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
