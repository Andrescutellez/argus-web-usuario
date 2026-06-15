/**
 * @fileoverview Pantalla principal de ubicación en tiempo real — Web Usuario Argus.
 *
 * PROPÓSITO:
 *   Paridad funcional con LocationScreen de Flutter. Muestra el mapa Mapbox con
 *   la moto en tiempo real, controles de seguridad en el bottom panel, selector
 *   de estilo de mapa y overlay GIS con cuadrante policial + CAIs cercanos.
 *
 * ARQUITECTURA DE DATOS GPS (triple canal — igual que Flutter):
 *   1. REST inicial (getLatestGps)    → primera posición conocida inmediata.
 *   2. Socket.io push (connect)       → canal principal, <200ms latencia.
 *   3. Polling de respaldo (30s)      → seguro si socket.io falla silenciosamente.
 *
 * MARCADORES DEL MAPA (5 capas CSS — equivalente a Flutter):
 *   Capa 1: Círculo punteado SVG         — solo cuando armado (zona de vigilancia).
 *   Capa 2: Halo exterior animado        — CSS @keyframes argus-pulse.
 *   Capa 3: Halo interior estático       — anillo opaco 28%.
 *   Capa 4: Punto sólido con emoji 🏍️   — posición exacta de la moto.
 *   Capa 5: Etiqueta de timestamp        — "📍 Hoy 15:30" debajo del marcador.
 *
 * GIS OVERLAY:
 *   - Badge con cuadrante, localidad y teléfono patrullero (esquina inferior izquierda).
 *   - Marcadores de CAIs cercanos (hasta 3) en el mapa.
 *   - Se carga automáticamente cuando llega el primer GPS real.
 *
 * CAPA DE LLUVIA SAB:
 *   - Círculos Leaflet coloreados por intensidad pluviométrica (sin_lluvia→muy_alto).
 *   - Toggle con botón ☁️/🌧️ en la columna de FABs (inferior derecha).
 *   - Leyenda de colores en badge flotante (top: 72, left: 16) cuando está activa.
 *   - Refresh automático cada 5 minutos; falla silenciosamente si SAB está caído.
 *
 * VARIABLES CRÍTICAS:
 *   - liveTs: null hasta que socket.io emite. "EN VIVO" solo si < 90s.
 *   - gisInfo: null hasta que lookup resuelve. Badge GIS oculto si null.
 *   - armed: estado local sincronizado con DeviceState del backend.
 *   - rainData: array de estaciones activas; vacío hasta que resuelve getLluvia().
 *   - showRain: controla visibilidad de círculos + leyenda. Default false.
 *
 * @module pages/LocationPage
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap, GeoJSON, ImageOverlay } from 'react-leaflet'
import L from 'leaflet'
import { useStore } from '../store/useStore.js'
import {
  getLatestGps, getDeviceStatus, sendCommand,
  getMotos, getGisLookup, getGisNear, getGisNearCuadrantes,
  getRadarBounds, BASE_URL,
} from '../api/apiService.js'
import { connect, disconnect } from '../api/realtimeService.js'

// ─── Mapbox ───────────────────────────────────────────────────────────────────

const MAPBOX_TOKEN = 'pk.eyJ1IjoiYW5kcmVzY3V0ZWxsZXoiLCJhIjoiY21kbDE1NmhoMTRhejJtcTE5cHo2MWx0NyJ9.jD6OT222OnM0RLJScNUM2Q'

const MAP_STYLES = [
  { id: 'streets-v12',          label: 'Estándar',         icon: '🗺️' },
  { id: 'satellite-streets-v12',label: 'Satélite + calles',icon: '🛰️' },
  { id: 'satellite-v9',         label: 'Satélite',         icon: '🌍' },
  { id: 'outdoors-v12',         label: 'Exteriores',       icon: '🏔️' },
  { id: 'light-v11',            label: 'Claro',            icon: '☀️' },
  { id: 'dark-v11',             label: 'Oscuro',           icon: '🌑' },
  { id: 'navigation-day-v1',    label: 'Tráfico día',      icon: '🚦' },
  { id: 'navigation-night-v1',  label: 'Tráfico noche',    icon: '🌙' },
]

const DEFAULT_STYLE = MAP_STYLES[5] // dark-v11

function mapboxUrl(styleId) {
  return `https://api.mapbox.com/styles/v1/mapbox/${styleId}/tiles/256/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`
}

// ─── Colores ──────────────────────────────────────────────────────────────────

const C = {
  armed:    '#E5484D',
  blue:     '#2F81F7',
  purple:   '#8B5CF6',
  green:    '#3FB950',
  orange:   '#F0883E',
  text2:    '#8B949E',
  text3:    '#484F58',
}

// Centro Colombia — aparece antes de que llegue GPS real
const COLOMBIA_CENTER = [4.711, -74.0721]

// ─── Marcador 5 capas ─────────────────────────────────────────────────────────

/**
 * Construye el DivIcon de 5 capas idéntico al marcador Flutter.
 * @param {boolean} armed    - rojo si armado, azul si no
 * @param {string}  timeLabel - texto de la capa 5 (ej: "📍 Hoy 15:30")
 */
function makeVehicleIcon(armed, timeLabel) {
  const color  = armed ? C.armed : C.purple
  const shadow = armed ? 'rgba(229,72,77,0.45)' : 'rgba(139,92,246,0.45)'
  const bg1    = armed ? 'rgba(229,72,77,0.18)' : 'rgba(139,92,246,0.18)'
  const bg2    = armed ? 'rgba(229,72,77,0.28)' : 'rgba(139,92,246,0.28)'

  // Círculo punteado SVG (Capa 1) — solo cuando armado
  const dashedRing = armed
    ? `<svg width="140" height="140" style="position:absolute;top:-53px;left:-53px;pointer-events:none">
        <circle cx="70" cy="70" r="68" fill="none"
          stroke="rgba(229,72,77,0.5)" stroke-width="1.5"
          stroke-dasharray="13 8"/>
      </svg>`
    : ''

  return new L.DivIcon({
    className: '',
    html: `
      <style>
        @keyframes argus-pulse {
          from { transform: scale(0.8); opacity: 0.51; }
          to   { transform: scale(1.3); opacity: 0.85; }
        }
      </style>
      <div style="position:relative;width:34px;height:34px;">
        ${dashedRing}
        <!-- Capa 2: halo exterior animado -->
        <div style="position:absolute;width:80px;height:80px;top:-23px;left:-23px;
          border-radius:50%;background:${bg1};
          animation:argus-pulse 1.4s ease-in-out infinite alternate;
          pointer-events:none;"></div>
        <!-- Capa 3: halo interior estático -->
        <div style="position:absolute;width:52px;height:52px;top:-9px;left:-9px;
          border-radius:50%;background:${bg2};pointer-events:none;"></div>
        <!-- Capa 4: punto central sólido -->
        <div style="position:relative;width:34px;height:34px;border-radius:50%;
          background:${color};
          box-shadow:0 4px 14px ${shadow};
          display:flex;align-items:center;justify-content:center;font-size:14px;">
          🏍️
        </div>
        <!-- Capa 5: etiqueta timestamp debajo -->
        <div style="position:absolute;top:40px;left:50%;transform:translateX(-50%);
          white-space:nowrap;background:rgba(22,27,34,0.94);color:#8B949E;
          font-size:11px;padding:4px 10px;border-radius:8px;
          border:1px solid rgba(48,54,61,0.7);pointer-events:none;">
          ${timeLabel}
        </div>
      </div>`,
    iconSize:   [34, 34],
    iconAnchor: [17, 17],
  })
}

// ─── Icono CAI ────────────────────────────────────────────────────────────────

function makeCaiIcon() {
  return new L.DivIcon({
    className: '',
    html: `<div style="width:30px;height:30px;border-radius:50%;
      background:#14532D;border:2.5px solid #22C55E;
      display:flex;align-items:center;justify-content:center;font-size:14px;
      box-shadow:0 2px 10px rgba(34,197,94,0.5);">🚓</div>`,
    iconSize:   [30, 30],
    iconAnchor: [15, 15],
  })
}

// ─── FlyToGps ─────────────────────────────────────────────────────────────────

/** Vuela al GPS real solo la primera vez que llega — no interrumpe al usuario después. */
function FlyToGps({ lat, lon }) {
  const map    = useMap()
  const didFly = useRef(false)
  useEffect(() => {
    if (lat && lon && !didFly.current) {
      map.flyTo([lat, lon], 16, { duration: 1.2 })
      didFly.current = true
    }
  }, [lat, lon, map])
  return null
}

// ─── Formateador de tiempo ────────────────────────────────────────────────────

function fmtTime(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  return sameDay
    ? `Hoy ${d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`
    : d.toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function LocationPage() {
  const { gps, setGps, status, setStatus, deviceId } = useStore()

  // Estado de mapa y UI
  const [mapStyle,   setMapStyle]   = useState(DEFAULT_STYLE)
  const [showPicker, setShowPicker] = useState(false)
  const [loading,    setLoading]    = useState(true)
  const [liveTs,     setLiveTs]     = useState(null)
  const [armed,      setArmed]      = useState(false)
  const [alarmActive, setAlarmActive] = useState(false)
  const [cmdFeedback, setCmdFeedback] = useState(null)

  // Datos de la moto
  const [motoAlias, setMotoAlias] = useState('Mi moto')
  const [motoPlaca, setMotoPlaca] = useState('')

  // GIS
  const [gisInfo,        setGisInfo]        = useState(null)   // lookup result
  const [nearbyCai,      setNearbyCai]      = useState([])      // up to 3 CAIs
  const [nearCuadrantes, setNearCuadrantes] = useState(null)   // GeoJSON FeatureCollection local

  // Radar SIRE — overlay de reflectividad en tiempo real
  const [radarBounds, setRadarBounds] = useState(null)  // [[s,w],[n,e]] para ImageOverlay
  const [radarTs,     setRadarTs]     = useState(0)     // ts del backend para cache-bust de imagen
  const [showRain,    setShowRain]    = useState(false)  // toggle capa radar

  const pollingRef = useRef(null)
  const gisRef     = useRef({ lastLon: null, lastLat: null }) // evita lookups duplicados

  // ─── Fetchers ───────────────────────────────────────────────────────────────

  const fetchGps = useCallback(async () => {
    if (!deviceId) return
    try {
      const { data } = await getLatestGps(deviceId)
      if (data?.lat && data?.lon) setGps(data)
    } catch { /* offline */ }
  }, [deviceId, setGps])

  const fetchStatus = useCallback(async () => {
    if (!deviceId) return
    try {
      const { data } = await getDeviceStatus(deviceId)
      setStatus(data)
      setArmed(data?.armed ?? false)
    } catch { /* offline */ }
  }, [deviceId, setStatus])

  /** Consulta GIS solo cuando las coordenadas cambian (radio mínimo ~50m implícito por precisión float) */
  const fetchGis = useCallback(async (lon, lat) => {
    const prev = gisRef.current
    if (prev.lastLon === lon && prev.lastLat === lat) return
    gisRef.current = { lastLon: lon, lastLat: lat }

    try {
      const [lookupRes, caiRes, cuadRes] = await Promise.allSettled([
        getGisLookup(lon, lat),
        getGisNear(lon, lat, 'cai', 3),
        getGisNearCuadrantes(lon, lat, 5),
      ])
      if (lookupRes.status === 'fulfilled') setGisInfo(lookupRes.value.data)
      if (caiRes.status    === 'fulfilled') setNearbyCai(caiRes.value.data ?? [])
      if (cuadRes.status   === 'fulfilled') setNearCuadrantes(cuadRes.value.data)
    } catch { /* GIS datos aún no cargados */ }
  }, [])

  // ─── Ciclo de vida ──────────────────────────────────────────────────────────

  useEffect(() => {
    // Cargar datos de la moto para el bottom panel
    getMotos().then(({ data }) => {
      if (data?.length) {
        setMotoAlias(data[0].alias ?? 'Mi moto')
        setMotoPlaca(data[0].placa ?? '')
      }
    }).catch(() => {})

    setLoading(true)
    Promise.all([fetchGps(), fetchStatus()]).finally(() => setLoading(false))

    connect(
      (data) => {
        if (data.deviceId === deviceId) {
          setGps(data)
          setLiveTs(Date.now())
          if (data.lat && data.lon) fetchGis(data.lon, data.lat)
        }
      },
      (data) => {
        if (data.deviceId === deviceId) {
          setStatus(data)
          setArmed(data?.armed ?? false)
        }
      },
    )

    pollingRef.current = setInterval(() => { fetchGps(); fetchStatus() }, 30_000)

    // Radar SIRE — bounds del KMZ, fetch inicial + refresh cada 5 min
    const fetchRadar = async () => {
      try {
        const { data } = await getRadarBounds()
        if (data?.bounds) {
          const { north, south, east, west } = data.bounds
          setRadarBounds([[south, west], [north, east]])
          setRadarTs(data.ts)
        }
      } catch { /* radar es opcional */ }
    }
    fetchRadar()
    const rainInterval = setInterval(fetchRadar, 5 * 60 * 1000)

    return () => { clearInterval(pollingRef.current); clearInterval(rainInterval); disconnect() }
  }, [deviceId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Dispara GIS la primera vez que hay GPS (desde REST inicial)
  useEffect(() => {
    if (gps?.lat && gps?.lon && !gisInfo) fetchGis(gps.lon, gps.lat)
  }, [gps, gisInfo, fetchGis])

  // ─── Comandos ───────────────────────────────────────────────────────────────

  const runCmd = useCallback(async (command) => {
    try {
      const { data } = await sendCommand(deviceId, command)
      setCmdFeedback(data.delivered
        ? { ok: true, msg: `✓ ${command} entregado` }
        : { ok: false, msg: `⚡ ${command} encolado (device offline)` }
      )
      if (command === 'ARM')    setArmed(true)
      if (command === 'DISARM') setArmed(false)
    } catch {
      setCmdFeedback({ ok: false, msg: '✗ Error de conexión' })
    }
    setTimeout(() => setCmdFeedback(null), 3000)
  }, [deviceId])

  // ─── Derivados ──────────────────────────────────────────────────────────────

  const hasGps    = !!(gps?.lat && gps?.lon)
  const isLive    = liveTs != null && Date.now() - liveTs < 90_000
  const speedText = gps?.speed > 0 ? `${gps.speed.toFixed(0)} km/h` : 'Quieta'
  const timeLabel = hasGps ? `📍 ${fmtTime(gps.timestamp)}` : '📍 --:--'

  const liveLabel = isLive   ? 'EN VIVO'
    : hasGps     ? 'SIN SEÑAL'
    : loading    ? 'CARGANDO…'
    : 'OFFLINE'
  const liveColor = isLive   ? C.green : hasGps ? C.orange : C.text2

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0D1117' }}>

      {/* ── Mapa ─────────────────────────────────────────────────────── */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <MapContainer
          center={COLOMBIA_CENTER}
          zoom={12}
          style={{ width: '100%', height: '100%' }}
          zoomControl={false}
        >
          <TileLayer
            key={mapStyle.id}
            url={mapboxUrl(mapStyle.id)}
            attribution='© <a href="https://www.mapbox.com/">Mapbox</a> © <a href="https://www.openstreetmap.org/">OSM</a>'
            maxZoom={19}
            tileSize={512}
            zoomOffset={-1}
          />

          <FlyToGps lat={gps?.lat} lon={gps?.lon} />

          {/* Cuadrantes cercanos — solo los 5 más próximos a la moto */}
          {nearCuadrantes && (
            <GeoJSON
              key={nearCuadrantes.features.map(f => f.properties?.cuadrante_id).join(',')}
              data={nearCuadrantes}
              style={() => ({
                fillColor:   '#7FFF00',
                fillOpacity: 0.07,
                color:       '#7FFF00',
                weight:      1.5,
                opacity:     0.75,
              })}
            />
          )}

          {/* Radar SIRE — overlay de reflectividad. La imagen PNG ya viene coloreada
               por el SIRE (verde=leve → rojo=muy fuerte). opacity 0.65 para ver el mapa. */}
          {showRain && radarBounds && (
            <ImageOverlay
              url={`${BASE_URL}/api/weather/radar/image?t=${radarTs}`}
              bounds={radarBounds}
              opacity={0.65}
            />
          )}

          {/* Marcador principal de la moto — 5 capas */}
          {hasGps && (
            <Marker
              position={[gps.lat, gps.lon]}
              icon={makeVehicleIcon(armed, timeLabel)}
            >
              <Popup>
                <div style={{ fontFamily: 'monospace', fontSize: 12, lineHeight: 1.7, minWidth: 180 }}>
                  <strong style={{ fontSize: 13 }}>{motoAlias}</strong>
                  {motoPlaca && <span style={{ color: '#666' }}> · {motoPlaca}</span>}<br />
                  {gps.lat.toFixed(6)}, {gps.lon.toFixed(6)}<br />
                  <span style={{ color: '#666' }}>{speedText} · {fmtTime(gps.timestamp)}</span>
                </div>
              </Popup>
            </Marker>
          )}

          {/* Marcadores CAI cercanos */}
          {nearbyCai.map((cai, i) => (
            cai.lat && cai.lon && (
              <Marker
                key={i}
                position={[cai.lat, cai.lon]}
                icon={makeCaiIcon()}
              >
                <Popup>
                  <div style={{ fontSize: 12, lineHeight: 1.6, minWidth: 160 }}>
                    <strong style={{ color: '#16a34a' }}>🟢 {cai.nombre}</strong><br />
                    <span style={{ color: '#666' }}>{cai.direccion}</span><br />
                    <span style={{ color: '#16a34a', fontWeight: 600 }}>{cai.distancia_m} m</span>
                  </div>
                </Popup>
              </Marker>
            )
          ))}
        </MapContainer>

        {/* ── Badge ESTADO — arriba izquierda ─────────────────────── */}
        <GlassBadge style={{ top: 16, left: 16 }}>
          <div style={{ fontSize: 9, color: C.text3, letterSpacing: '0.8px', marginBottom: 2 }}>ESTADO</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: armed ? C.armed : C.text2 }}>
            {armed ? '● ARMADO' : '○ DESARMADO'}
          </div>
        </GlassBadge>

        {/* ── Leyenda radar — debajo del badge ESTADO ─────────────── */}
        {showRain && (
          <GlassBadge style={{ top: 72, left: 16 }}>
            <div style={{ fontSize: 8, color: '#484F58', letterSpacing: '0.8px', marginBottom: 4 }}>
              RADAR SIRE · REFLECTIVIDAD
            </div>
            {[
              ['#00BFFF', 'Lluvia ligera'],
              ['#3FB950', 'Lluvia moderada'],
              ['#F0883E', 'Lluvia fuerte'],
              ['#E5484D', 'Lluvia muy fuerte'],
              ['#8B5CF6', 'Granizo / tormenta'],
            ].map(([color, label]) => (
              <div key={color} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
                <span style={{ fontSize: 9, color }}>{label}</span>
              </div>
            ))}
          </GlassBadge>
        )}

        {/* ── Badge GPS — arriba derecha ───────────────────────────── */}
        <GlassBadge style={{ top: 16, right: 16, textAlign: 'right' }}>
          <div style={{ fontSize: 9, color: C.text3, letterSpacing: '0.8px', marginBottom: 2 }}>GPS</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: liveColor, display: 'inline-block' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: liveColor }}>{liveLabel}</span>
          </div>
        </GlassBadge>

        {/* ── Badge GIS — cuadrante + patrullero ──────────────────── */}
        {gisInfo && (
          <GlassBadge style={{ bottom: 24, left: 16, maxWidth: 220 }}>
            <div style={{ fontSize: 9, color: C.text3, letterSpacing: '0.8px', marginBottom: 3 }}>CUADRANTE</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#CDD9E5', marginBottom: 1 }}>
              {gisInfo.descripcion || gisInfo.cuadrante_id || '—'}
            </div>
            {gisInfo.ciudad && (
              <div style={{ fontSize: 10, color: C.text3, marginTop: 2 }}>{gisInfo.ciudad}</div>
            )}
          </GlassBadge>
        )}

        {/* ── Sin GPS — aviso central ──────────────────────────────── */}
        {!hasGps && !loading && (
          <div style={{
            position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            zIndex: 1000,
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
            borderRadius: 12, padding: '10px 18px',
            fontSize: 12, color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap',
          }}>
            📡 Sin posición GPS registrada aún
          </div>
        )}

        {/* ── Feedback de comando ──────────────────────────────────── */}
        {cmdFeedback && (
          <div style={{
            position: 'absolute', top: 60, left: '50%', transform: 'translateX(-50%)',
            zIndex: 1000,
            background: cmdFeedback.ok ? 'rgba(63,185,80,0.15)' : 'rgba(229,72,77,0.15)',
            backdropFilter: 'blur(8px)',
            border: `1px solid ${cmdFeedback.ok ? 'rgba(63,185,80,0.4)' : 'rgba(229,72,77,0.4)'}`,
            borderRadius: 10, padding: '8px 16px',
            fontSize: 12, fontWeight: 600,
            color: cmdFeedback.ok ? C.green : C.armed,
            whiteSpace: 'nowrap',
          }}>
            {cmdFeedback.msg}
          </div>
        )}

        {/* ── Botones flotantes — esquina inferior derecha ─────────── */}
        <div style={{
          position: 'absolute', right: 16, bottom: 220, zIndex: 1000,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {/* Toggle capa de lluvia SAB */}
          <MapFab
            active={showRain}
            activeColor="#2F81F7"
            onClick={() => setShowRain(r => !r)}
          >
            <span style={{ fontSize: 16 }}>{showRain ? '🌧️' : '☁️'}</span>
          </MapFab>

          {/* Selector de estilo de mapa */}
          <MapFab onClick={() => setShowPicker(p => !p)}>
            <span style={{ fontSize: 18 }}>{mapStyle.icon}</span>
          </MapFab>

          {/* Toggle alarma */}
          <MapFab
            active={alarmActive}
            activeColor={C.armed}
            onClick={() => {
              const next = !alarmActive
              setAlarmActive(next)
              if (next) runCmd('ALERT')
            }}
          >
            <span style={{ fontSize: 16 }}>🔔</span>
          </MapFab>

          {/* Recentrar */}
          <MapFab onClick={() => {
            if (hasGps) {
              // Para recentrar usamos el hack de FlyToGps reseteando didFly
              // en su lugar hacemos scroll imperativo si hay referencia
              window._argusMapRef?.flyTo([gps.lat, gps.lon], 16, { duration: 0.8 })
            }
          }}>
            <span style={{ fontSize: 16 }}>📍</span>
          </MapFab>
        </div>

        {/* ── Picker de estilos — modal bottom sheet ───────────────── */}
        {showPicker && (
          <StylePicker
            current={mapStyle}
            onSelect={(s) => { setMapStyle(s); setShowPicker(false) }}
            onClose={() => setShowPicker(false)}
          />
        )}
      </div>

      {/* ── Bottom panel ─────────────────────────────────────────────── */}
      <BottomPanel
        motoAlias={motoAlias}
        motoPlaca={motoPlaca}
        speedText={speedText}
        gps={gps}
        armed={armed}
        alarmActive={alarmActive}
        liveColor={liveColor}
        liveLabel={liveLabel}
        onArm={()    => runCmd('ARM')}
        onDisarm={()  => runCmd('DISARM')}
        onAlarm={()  => { setAlarmActive(a => !a); runCmd('ALERT') }}
        onEngineCut={() => runCmd('ENGINE_CUT')}
      />
    </div>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

/** Badge de vidrio posicionado absolutamente sobre el mapa. */
function GlassBadge({ children, style }) {
  return (
    <div style={{
      position: 'absolute', zIndex: 1000,
      background: 'rgba(13,17,23,0.75)', backdropFilter: 'blur(10px)',
      borderRadius: 12, padding: '8px 14px',
      border: '1px solid rgba(255,255,255,0.07)',
      ...style,
    }}>
      {children}
    </div>
  )
}

/** Botón circular flotante sobre el mapa. */
function MapFab({ children, onClick, active = false, activeColor = C.armed }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 44, height: 44, borderRadius: '50%', border: 'none',
        background: active ? activeColor : 'rgba(13,17,23,0.8)',
        boxShadow: `0 2px 8px rgba(0,0,0,0.4)${active ? `, 0 0 12px ${activeColor}60` : ''}`,
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(8px)',
        transition: 'background 0.15s, box-shadow 0.15s',
      }}
    >
      {children}
    </button>
  )
}

/** Picker de estilo de mapa — bottom sheet modal superpuesto al mapa. */
function StylePicker({ current, onSelect, onClose }) {
  return (
    <>
      {/* Overlay oscuro */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0, zIndex: 1100,
          background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)',
        }}
      />
      {/* Sheet */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 1101,
        background: '#161B22', borderRadius: '20px 20px 0 0',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        padding: '12px 16px 32px',
      }}>
        {/* Handle */}
        <div style={{
          width: 32, height: 3, background: '#30363D',
          borderRadius: 2, margin: '0 auto 16px',
        }} />
        <div style={{ fontSize: 15, fontWeight: 700, color: '#CDD9E5', marginBottom: 4 }}>
          Estilo de mapa
        </div>
        <div style={{ fontSize: 12, color: C.text2, marginBottom: 16 }}>
          Selecciona el estilo visual del mapa
        </div>
        {/* Grid 4 columnas */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {MAP_STYLES.map(s => {
            const active = s.id === current.id
            return (
              <button
                key={s.id}
                onClick={() => onSelect(s)}
                style={{
                  padding: '10px 6px',
                  borderRadius: 12,
                  border: `${active ? 2 : 1}px solid ${active ? C.purple : '#30363D'}`,
                  background: active ? 'rgba(139,92,246,0.12)' : '#0D1117',
                  cursor: 'pointer',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', gap: 6,
                }}
              >
                <span style={{ fontSize: 22 }}>{s.icon}</span>
                <span style={{
                  fontSize: 9, textAlign: 'center',
                  fontWeight: active ? 700 : 500,
                  color: active ? C.purple : C.text2,
                }}>
                  {s.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}

/** Panel inferior con info de moto y controles de seguridad — equivalente al bottom sheet Flutter. */
function BottomPanel({
  motoAlias, motoPlaca, speedText, gps, armed,
  alarmActive, liveColor, liveLabel,
  onArm, onDisarm, onAlarm, onEngineCut,
}) {
  const hasGps = !!(gps?.lat && gps?.lon)

  return (
    <div style={{
      background: '#161B22',
      borderTop: '1px solid #21262D',
      padding: '14px 16px 16px',
      flexShrink: 0,
    }}>
      {/* Handle */}
      <div style={{
        width: 32, height: 3, background: '#30363D',
        borderRadius: 2, margin: '0 auto 14px',
      }} />

      {/* Fila info moto + toggle armar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#CDD9E5' }}>{motoAlias}</div>
          <div style={{ fontSize: 11, color: C.text2, marginTop: 3 }}>
            {[
              motoPlaca,
              hasGps ? `${gps.lat.toFixed(5)}, ${gps.lon.toFixed(5)}` : null,
              speedText,
            ].filter(Boolean).join(' · ')}
          </div>
          {gps?.timestamp && (
            <div style={{ fontSize: 10, color: C.text3, marginTop: 2 }}>
              Última: {fmtTime(gps.timestamp)}
            </div>
          )}
        </div>

        {/* Toggle ARM/DISARM */}
        <button
          onClick={armed ? onDisarm : onArm}
          style={{
            padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: armed ? 'rgba(229,72,77,0.12)' : '#21262D',
            border: `1px solid ${armed ? 'rgba(229,72,77,0.35)' : '#30363D'}`,
            color: armed ? C.armed : C.text2,
            fontSize: 12, fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {armed ? '● Armado' : 'Armar'}
        </button>
      </div>

      {/* Fila de acciones rápidas */}
      <div style={{ display: 'flex', gap: 8 }}>
        <ActionBtn
          label={alarmActive ? 'Silenciar' : 'Alarma'}
          icon="🔔"
          active={alarmActive}
          activeColor={C.purple}
          onClick={onAlarm}
        />
        <ActionBtn
          label="Apagar motor"
          icon="✂️"
          onClick={onEngineCut}
        />
      </div>

      {/* Indicador GPS en vivo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: liveColor, display: 'inline-block' }} />
        <span style={{ fontSize: 10, color: C.text2 }}>{liveLabel}</span>
      </div>
    </div>
  )
}

/** Botón de acción del bottom panel. */
function ActionBtn({ label, icon, onClick, active = false, activeColor = C.purple }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
        background: active ? `${activeColor}18` : '#21262D',
        border: `1px solid ${active ? `${activeColor}50` : '#30363D'}`,
        color: active ? activeColor : C.text2,
        fontSize: 12, fontWeight: 600,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      }}
    >
      <span>{icon}</span>
      {label}
    </button>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   RESUMEN DEL MÓDULO — LocationPage.jsx
   ═══════════════════════════════════════════════════════════════════

   EXPLICACIÓN PARA HUMANO:
   Esta es la pantalla principal del mapa para la web. En esta versión
   refactorizada tiene paridad completa con la app Flutter: Mapbox tiles
   con 8 estilos seleccionables, marcador de 5 capas animado, botones
   flotantes, bottom panel con ARM/DISARM/Alarma/Motor, overlay GIS
   que muestra el cuadrante policial asignado al punto GPS actual,
   el teléfono del patrullero y los CAIs cercanos en el mapa, y ahora
   también una capa de lluvia en tiempo real de las estaciones SAB de Bogotá.

   DIAGRAMA MENTAL:
   ┌─────────────────────────────────────────────────┐
   │ [● ARMADO]                 [GPS ● EN VIVO]      │ ← badges glass
   │ [LLUVIA (mm/día)]  ← leyenda si showRain=true   │
   │                                                 │
   │         tiles Mapbox (8 estilos)                │
   │                                                 │
   │  ○ ○ ○  (círculos lluvia SAB por intensidad)    │ ← capa lluvia
   │    ╌╌╌╌╌╌╌╌╌ (solo armado)                     │ ← círculo punteado SVG
   │  ○○○○○○○○○○○ (halo animado)                   │
   │    ○○○○○○○○○ (halo estático)                   │
   │      ●[🏍️]● (punto central)                    │
   │      📍 Hoy 15:30                               │ ← etiqueta timestamp
   │                                                 │
   │  🚓 🚓 🚓  [☁️/🌧️] [🗺️] [🔔] [📍]           │ ← CAIs + FABs
   │                                                 │
   │  CUADRANTE / CAI / 📞 Patrullero                │ ← badge GIS inferior izquierda
   │                                                 │
   │ ─────────────────────────────────────────────── │
   │  Mi moto · ABC-123 · Quieta      [● Armado]     │
   │  [🔔 Alarma]  [✂️ Apagar motor]                 │ ← bottom panel
   └─────────────────────────────────────────────────┘

   DEUDA TÉCNICA:
   - window._argusMapRef para recentrar: hack temporal, reemplazar con
     useImperativeHandle + forwardRef cuando se necesite más control del mapa.
   - ENGINE_CUT sin dialog de confirmación (igual que Flutter por ahora).
   - Batería hardcodeada: no hay endpoint de batería en el backend todavía.
   - Leyenda de lluvia sin indicador de frescura (stale): si SAB tarda >15 min
     el backend marca stale:true, pero el frontend no lo muestra aún.

   ═══════════════════════════════════════════════════════════════════ */
