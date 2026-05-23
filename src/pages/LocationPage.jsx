import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import { useStore } from '../store/useStore.js'
import { getLatestGps, getDeviceStatus } from '../api/apiService.js'
import { connect, disconnect } from '../api/realtimeService.js'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// Marcador personalizado estilo Argus
const makeDeviceIcon = (armed) => new L.DivIcon({
  className: '',
  html: `
    <div style="
      width:40px;height:40px;
      display:flex;align-items:center;justify-content:center;
      position:relative;
    ">
      <div style="
        position:absolute;width:40px;height:40px;border-radius:50%;
        background:${armed ? 'rgba(229,72,77,0.18)' : 'rgba(47,129,247,0.18)'};
        animation: argus-pulse 1.4s ease-in-out infinite alternate;
      "></div>
      <div style="
        width:26px;height:26px;border-radius:50%;
        background:${armed ? '#E5484D' : '#2F81F7'};
        display:flex;align-items:center;justify-content:center;
        font-size:13px;
        box-shadow:0 0 14px ${armed ? 'rgba(229,72,77,0.5)' : 'rgba(47,129,247,0.5)'};
        position:relative;z-index:1;
      ">🏍️</div>
    </div>
    <style>
      @keyframes argus-pulse {
        from { transform: scale(0.85); opacity: 0.6; }
        to   { transform: scale(1.15); opacity: 1; }
      }
    </style>
  `,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
})

function MapRecenter({ lat, lon }) {
  const map = useMap()
  useEffect(() => {
    if (lat && lon) map.setView([lat, lon], map.getZoom())
  }, [lat, lon, map])
  return null
}

const DEFAULT_POS = [-12.0464, -77.0428]

export default function LocationPage() {
  const { gps, setGps, status, setStatus, deviceId } = useStore()
  const [loading, setLoading]   = useState(true)
  const [live, setLive]         = useState(false)
  const [armed, setArmed]       = useState(false)
  const pollingRef = useRef(null)

  const fetchGps = async () => {
    try {
      const { data } = await getLatestGps(deviceId)
      if (data?.lat && data?.lon) setGps(data)
    } catch { /* offline */ }
  }

  const fetchStatus = async () => {
    try {
      const { data } = await getDeviceStatus(deviceId)
      setStatus(data)
      setArmed(data?.armed ?? false)
    } catch { /* offline */ }
  }

  useEffect(() => {
    setLoading(true)
    Promise.all([fetchGps(), fetchStatus()]).finally(() => setLoading(false))

    const rt = connect(
      (data) => { if (data.deviceId === deviceId) { setGps(data); setLive(true) } },
      (data) => { if (data.deviceId === deviceId) { setStatus(data); setArmed(data?.armed ?? false) } }
    )
    setLive(rt?.connected || false)

    pollingRef.current = setInterval(() => { fetchGps(); fetchStatus() }, 30000)
    return () => { clearInterval(pollingRef.current); disconnect() }
  }, [deviceId]) // eslint-disable-line react-hooks/exhaustive-deps

  const position  = gps?.lat && gps?.lon ? [gps.lat, gps.lon] : DEFAULT_POS
  const speedText = gps?.speed > 0 ? `${gps.speed.toFixed(0)} km/h` : 'Quieta'
  const fmt       = (ts) => ts ? new Date(ts).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : '—'
  const liveStatus = live ? 'EN VIVO' : status?.connected ? 'CONECTADO' : loading ? 'CARGANDO…' : 'OFFLINE'
  const liveColor  = live ? 'var(--green)' : status?.connected ? 'var(--orange)' : 'var(--text3)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)' }}>

      {/* Badges superiores sobre el mapa */}
      <div style={{ position: 'relative', flex: 1 }}>
        <MapContainer
          center={position}
          zoom={15}
          style={{ width: '100%', height: '100%', background: 'var(--map-bg)' }}
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://osm.org">OpenStreetMap</a> &copy; <a href="https://mapbox.com">Mapbox</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapRecenter lat={position[0]} lon={position[1]} />
          {gps?.lat && gps?.lon && (
            <Marker position={[gps.lat, gps.lon]} icon={makeDeviceIcon(armed)}>
              <Popup>
                <div style={{ fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6 }}>
                  <strong>{deviceId}</strong><br />
                  {gps.lat?.toFixed(6)}, {gps.lon?.toFixed(6)}<br />
                  {speedText} · {fmt(gps.timestamp)}
                </div>
              </Popup>
            </Marker>
          )}
        </MapContainer>

        {/* Badge estado — arriba izquierda */}
        <div style={{
          position: 'absolute', top: 16, left: 16, zIndex: 1000,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(8px)',
          borderRadius: 12,
          padding: '8px 14px',
          border: '1px solid rgba(255,255,255,0.08)',
        }}>
          <div style={{ fontSize: 9, color: '#484F58', letterSpacing: '0.8px', marginBottom: 2 }}>ESTADO</div>
          <div style={{
            fontSize: 12, fontWeight: 700,
            color: armed ? '#E5484D' : '#8B949E',
          }}>{armed ? '● ARMADO' : '○ DESARMADO'}</div>
        </div>

        {/* Badge GPS — arriba derecha */}
        <div style={{
          position: 'absolute', top: 16, right: 16, zIndex: 1000,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(8px)',
          borderRadius: 12,
          padding: '8px 14px',
          border: '1px solid rgba(255,255,255,0.08)',
          textAlign: 'right',
        }}>
          <div style={{ fontSize: 9, color: '#484F58', letterSpacing: '0.8px', marginBottom: 2 }}>GPS</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: liveColor, display: 'inline-block' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: liveColor }}>{liveStatus}</span>
          </div>
        </div>

        {/* Atribución */}
        <div style={{
          position: 'absolute', bottom: 16, left: 16, zIndex: 1000,
          background: 'rgba(0,0,0,0.55)',
          borderRadius: 8,
          padding: '4px 8px',
          fontSize: 10, color: 'rgba(255,255,255,0.7)',
        }}>© OpenStreetMap</div>
      </div>

      {/* Bottom panel — igual al bottom sheet de la app Flutter */}
      <div style={{
        background: 'var(--card)',
        borderTop: '1px solid var(--border)',
        padding: '14px 20px 16px',
        flexShrink: 0,
      }}>
        {/* Handle visual */}
        <div style={{
          width: 32, height: 3,
          background: 'var(--border)',
          borderRadius: 2,
          margin: '0 auto 14px',
        }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          {/* Info moto */}
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text1)' }}>
              {status?.alias ?? 'Mi moto'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
              {gps ? `${gps.lat?.toFixed(5)}, ${gps.lon?.toFixed(5)}` : 'Sin datos GPS'}
              {' · '}{speedText}
              {' · '}{fmt(gps?.timestamp)}
            </div>
          </div>

          {/* Badge estado del dispositivo */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px',
            borderRadius: 8,
            background: armed ? 'rgba(229,72,77,0.1)' : 'var(--card-alt)',
            border: `1px solid ${armed ? 'rgba(229,72,77,0.3)' : 'var(--border)'}`,
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: liveColor }} />
            <span style={{
              fontSize: 12, fontWeight: 600,
              color: armed ? 'var(--armed)' : 'var(--text2)',
            }}>{armed ? '● Armado' : 'Desarmado'}</span>
          </div>
        </div>

        {/* Red Argus mesh */}
        <div style={{
          padding: '10px 14px',
          borderRadius: 10,
          background: 'var(--card-alt)',
          border: '1px solid var(--border-sub)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontSize: 12,
          color: 'var(--text2)',
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', flexShrink: 0 }} />
          3 nodos Argus cercanos · Red activa
        </div>
      </div>
    </div>
  )
}
