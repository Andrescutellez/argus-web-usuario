/**
 * @fileoverview Pantalla principal de ubicación — Web Usuario Argus.
 *
 * MAPA: MapLibre GL JS + pmtiles (migrado desde react-leaflet + Mapbox).
 *   - Fase 1: CartoDB Dark Matter / Voyager / ESRI Satellite — gratis, sin setup.
 *   - Fase 2: cambiar CUSTOM_TILES_URL en src/lib/mapConfig.js → pmtiles propios en R2.
 *
 * COORDENADAS: MapLibre usa [lng, lat]. Leaflet usaba [lat, lng].
 *   gps.lat / gps.lon se invierten al pasar a MapLibre: [gps.lon, gps.lat].
 *
 * CAPAS ARGUS (fuentes GeoJSON sobre el basemap):
 *   - cuadrantes: polígonos de cuadrantes policiales (GeoJSON desde backend)
 *   - crime:      polígonos de localidades coloreados por ARI
 *   - radar:      imagen georeferenciada del radar SIRE
 *
 * MARCADORES:
 *   - vehicleMarker: maplibregl.Marker con elemento HTML animado (4 capas)
 *   - caiMarkers:    maplibregl.Marker con popup para cada CAI cercano
 *
 * ESTILOS DÍA/NOCHE:
 *   3 estilos seleccionables: Argus Dark (CartoDB), Claro (CartoDB), Satélite (ESRI).
 *   Al cambiar estilo → setStyle() → style.load → re-agrega fuentes y capas Argus.
 *
 * @module pages/LocationPage
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useStore } from '../store/useStore.js'
import {
  getLatestGps, getDeviceStatus, sendCommand,
  getMotos, getGisLookup, getGisNear, getGisNearCuadrantes,
  getRadarBounds, getRadarImage, getCrimeBogota, getCrimeLookup,
} from '../api/apiService.js'
import { connect, disconnect } from '../api/realtimeService.js'
import {
  MAP_STYLES, DEFAULT_STYLE, SATELLITE_STYLE,
  COLOMBIA_CENTER, DEFAULT_ZOOM, buildArgusStyle,
} from '../lib/mapConfig.js'

/**
 * Resuelve el estilo final para MapLibre.
 * Siempre recibe effectiveStyle (ya resuelto a argus-day/night/satellite),
 * nunca el stub {sistema:true} — ese lo resuelve el componente antes de llamar aquí.
 *   palette → buildArgusStyle con el objeto de paleta ya definido en MAP_STYLES
 *   url=null → SATELLITE_STYLE
 *   url string → URL directa (CartoDB/ESRI)
 */
async function resolveMapStyle(s) {
  if (!s.url) return SATELLITE_STYLE
  if (s.palette) return buildArgusStyle(s.url, s.palette)
  return s.url
}

// ─── Colores ──────────────────────────────────────────────────────────────────

const C = {
  armed:  '#E5484D',
  blue:   '#2F81F7',
  purple: '#8B5CF6',
  green:  '#3FB950',
  orange: '#F0883E',
  text2:  '#8B949E',
  text3:  '#484F58',
}

// ─── Expresiones MapLibre para colores de crimen ──────────────────────────────
// Equivalente a crimeRiskStyle() pero como expresiones data-driven de MapLibre.

const CRIME_FILL_EXPR = ['case',
  ['==', ['get', 'motos_2026'], 0],    'rgba(255,255,255,0.04)',
  ['<=', ['get', 'motos_2026'], 15],   'rgba(63,185,80,0.22)',
  ['<=', ['get', 'motos_2026'], 40],   'rgba(210,153,34,0.28)',
  ['<=', ['get', 'motos_2026'], 70],   'rgba(240,136,62,0.35)',
  ['<=', ['get', 'motos_2026'], 120],  'rgba(229,72,77,0.42)',
  'rgba(139,92,246,0.50)',
]

const CRIME_LINE_EXPR = ['case',
  ['==', ['get', 'motos_2026'], 0],    '#484F58',
  ['<=', ['get', 'motos_2026'], 15],   '#3FB950',
  ['<=', ['get', 'motos_2026'], 40],   '#D29922',
  ['<=', ['get', 'motos_2026'], 70],   '#F0883E',
  ['<=', ['get', 'motos_2026'], 120],  '#E5484D',
  '#8B5CF6',
]

const CRIME_LINE_WIDTH_EXPR = ['case',
  ['<=', ['get', 'motos_2026'], 40], 1.5,
  ['<=', ['get', 'motos_2026'], 70], 2,
  2.5,
]

// ─── Helpers de crimen (UI) ───────────────────────────────────────────────────

const CRIME_COLORS = {
  muy_bajo: '#3FB950', bajo: '#D29922', moderado: '#F0883E',
  alto: '#E5484D', muy_alto: '#8B5CF6',
}
function crimeColor(level) { return CRIME_COLORS[level] ?? '#484F58' }
function crimeLevelLabel(level) {
  return { muy_bajo: 'Muy bajo', bajo: 'Bajo', moderado: 'Moderado', alto: 'Alto', muy_alto: 'Muy alto' }[level] ?? 'Sin dato'
}
function crimePlainMsg(level, varPct) {
  const rising  = varPct != null && varPct > 5
  const falling = varPct != null && varPct < -5
  switch (level) {
    case 'muy_bajo': return falling ? 'Zona tranquila, robos bajando'        : 'Zona tranquila'
    case 'bajo':     return rising  ? 'Robos bajos, pero van subiendo'       : 'Zona con robos bajos'
    case 'moderado': return rising  ? 'Robos moderados y van subiendo'       : (falling ? 'Robos moderados, mejorando' : 'Zona con robos moderados')
    case 'alto':     return rising  ? 'Precaución: robos frecuentes y en aumento' : (falling ? 'Precaución: robos frecuentes, pero bajando' : 'Precaución: robos frecuentes')
    case 'muy_alto': return rising  ? '¡Alerta! Zona muy peligrosa y empeorando'  : '¡Alerta! Zona muy peligrosa'
    default:         return 'Sin datos de la zona'
  }
}

// ─── Marcador de vehículo ─────────────────────────────────────────────────────

// Cache del SVG: ambas versiones se fetchan al cargar el módulo.
// Modo noche usa moto-icon-night.svg; día usa moto-icon.svg.
let _motoSvgCache      = null
let _motoSvgNightCache = null
fetch('/moto-icon.svg').then(r => r.text()).then(t => { _motoSvgCache = t })
fetch('/moto-icon-night.svg').then(r => r.text()).then(t => { _motoSvgNightCache = t })

function _isDarkMode() {
  const el = document.documentElement
  return el.dataset.theme === 'dark' ||
    (!el.dataset.theme && window.matchMedia?.('(prefers-color-scheme: dark)').matches)
}

// Heading (rumbo) del vehículo en grados (0=Norte, sentido horario).
// Persiste entre renders para no resetearse al hacer zoom o cambiar estado armado.
let _prevGpsPos  = null
let _motoHeading = 0

/** Bearing en grados desde (lat1,lon1) hacia (lat2,lon2). */
function bearingDeg(lat1, lon1, lat2, lon2) {
  const dLon = (lon2 - lon1) * Math.PI / 180
  const rl1  = lat1 * Math.PI / 180, rl2 = lat2 * Math.PI / 180
  return Math.atan2(Math.sin(dLon) * Math.cos(rl2),
    Math.cos(rl1) * Math.sin(rl2) - Math.sin(rl1) * Math.cos(rl2) * Math.cos(dLon)
  ) * 180 / Math.PI
}

/** Aplica el rumbo al wrapper de rotación sin recrear el elemento (preserva animaciones). */
function applyMarkerHeading(el, deg) {
  const rot = el.querySelector('.moto-rotate')
  if (rot) rot.style.transform = `rotate(${deg}deg)`
}

/** Tamaño del marcador en px según el nivel de zoom del mapa. */
function motoSizeForZoom(zoom) {
  if (zoom >= 18) return 120
  if (zoom >= 17) return 86
  if (zoom >= 16) return 66
  return 52
}

/** Crea el HTMLElement del marcador de la moto (top-down).
 *  armed+!park → círculo degradado rojo pulsante + SVG rotado hacia el rumbo.
 *  unarmed     → SVG con sombra sutil.
 *  anchor:'center' en MapLibre garantiza centrado exacto sobre la coordenada GPS. */
function makeVehicleEl(armed, isMoving, parkMode = false, zoom = 15) {
  const isArmed = armed && !parkMode
  const size    = motoSizeForZoom(zoom)

  const el = document.createElement('div')
  el.style.cssText = `position:relative;width:${size}px;height:${size}px;`

  const _activeSvg = _isDarkMode() ? (_motoSvgNightCache ?? _motoSvgCache) : _motoSvgCache
  const svgContent = _activeSvg
    ? _activeSvg
        .replace(/width="1254\.000000pt"/, `width="${size}"`)
        .replace(/height="1254\.000000pt"/, `height="${size}"`)
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52" width="${size}" height="${size}">
         <ellipse cx="26" cy="26" rx="20" ry="26" fill="#000"/>
         <line x1="6" y1="20" x2="0" y2="20" stroke="#000" stroke-width="4" stroke-linecap="round"/>
         <line x1="46" y1="20" x2="52" y2="20" stroke="#000" stroke-width="4" stroke-linecap="round"/>
       </svg>`

  if (isArmed) {
    el.innerHTML = `
      <style>@keyframes argus-glow-ring{
        0%,100%{transform:scale(1);opacity:.65}
        50%    {transform:scale(1.4);opacity:1}
      }</style>
      <div class="moto-glow" style="
        position:absolute;
        width:${size * 2}px;height:${size * 2}px;
        top:-${size * .5}px;left:-${size * .5}px;
        border-radius:50%;
        background:radial-gradient(circle,rgba(229,72,77,.85) 0%,rgba(229,72,77,.45) 38%,transparent 72%);
        animation:argus-glow-ring 1.8s ease-in-out infinite;
        pointer-events:none;
      "></div>
      <div class="moto-rotate" style="
        width:${size}px;height:${size}px;
        transform:rotate(${_motoHeading}deg);
        transition:transform .5s ease;
      ">${svgContent}</div>`
  } else {
    el.innerHTML = `
      <div class="moto-rotate" style="
        width:${size}px;height:${size}px;
        transform:rotate(${_motoHeading}deg);
        transition:transform .5s ease;
        filter:drop-shadow(0 2px 8px rgba(0,0,0,.75));
      ">${svgContent}</div>`
  }
  return el
}

/** Crea el HTMLElement del marcador de un CAI. */
function makeCaiEl() {
  const el = document.createElement('div')
  el.style.cssText = 'width:30px;height:30px;cursor:pointer;'
  el.innerHTML = `<div style="width:30px;height:30px;border-radius:50%;
    background:#14532D;border:2.5px solid #22C55E;
    display:flex;align-items:center;justify-content:center;font-size:14px;
    box-shadow:0 2px 10px rgba(34,197,94,0.5);">🚓</div>`
  return el
}

// ─── Capas Argus en MapLibre ──────────────────────────────────────────────────

/** Agrega todas las fuentes y capas propias de Argus al mapa.
 *  Se llama en el evento 'load' (inicial) y en 'style.load' (cambio de estilo).
 *  Las fuentes empiezan vacías; los useEffects las llenan con setData(). */
function addArgusLayers(map) {
  // Imagen de radar — placeholder 1×1 px transparente para poder llamar updateImage() luego
  const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=='

  map.addSource('cuadrantes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addSource('crime',      { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addSource('geofence',   { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addSource('radar', {
    type: 'image', url: BLANK,
    coordinates: [[-74.5, 5.0], [-73.5, 5.0], [-73.5, 4.0], [-74.5, 4.0]],
  })

  // Cuadrantes policiales
  map.addLayer({ id: 'cuadrantes-fill', type: 'fill', source: 'cuadrantes',
    layout: { visibility: 'none' },
    paint: { 'fill-color': '#7FFF00', 'fill-opacity': 0.07 } })
  map.addLayer({ id: 'cuadrantes-line', type: 'line', source: 'cuadrantes',
    layout: { visibility: 'none' },
    paint: { 'line-color': '#7FFF00', 'line-width': 1.5, 'line-opacity': 0.75 } })

  // Crimen / ARI — colores data-driven por motos_2026
  map.addLayer({ id: 'crime-fill', type: 'fill', source: 'crime',
    layout: { visibility: 'none' },
    paint: { 'fill-color': CRIME_FILL_EXPR, 'fill-opacity': 1 } })
  map.addLayer({ id: 'crime-line', type: 'line', source: 'crime',
    layout: { visibility: 'none' },
    paint: {
      'line-color':   CRIME_LINE_EXPR,
      'line-width':   CRIME_LINE_WIDTH_EXPR,
      'line-opacity': 0.75,
    } })

  // Geocerca de estacionamiento — círculo azul punteado
  map.addLayer({ id: 'geofence-fill', type: 'fill', source: 'geofence',
    layout: { visibility: 'none' },
    paint: { 'fill-color': '#2196F3', 'fill-opacity': 0.10 } })
  map.addLayer({ id: 'geofence-line', type: 'line', source: 'geofence',
    layout: { visibility: 'none' },
    paint: { 'line-color': '#2196F3', 'line-width': 2, 'line-opacity': 0.85,
             'line-dasharray': [4, 3] } })

  // Radar SIRE
  map.addLayer({ id: 'radar-layer', type: 'raster', source: 'radar',
    layout: { visibility: 'none' },
    paint: { 'raster-opacity': 0.82 } })
}

/** Registra los handlers de click/hover sobre capas Argus. */
function addArgusHandlers(map, onCuadranteClick, onCrimeClick) {
  map.on('click', 'cuadrantes-fill', e => {
    const f = e.features[0]
    onCuadranteClick({ descripcion: f.properties.descripcion, cuadrante_id: f.properties.cuadrante_id, ciudad: f.properties.ciudad })
  })
  map.on('click', 'crime-fill', e => onCrimeClick(e.features[0].properties))
  ;['cuadrantes-fill', 'crime-fill'].forEach(id => {
    map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer' })
    map.on('mouseleave', id, () => { map.getCanvas().style.cursor = '' })
  })
}

// ─── Formateador de tiempo ────────────────────────────────────────────────────

function fmtTime(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  const now = new Date()
  return d.toDateString() === now.toDateString()
    ? `Hoy ${d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`
    : d.toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// ─── Auto-settings del motor ──────────────────────────────────────────────────

const AUTO_SETTINGS_KEY = 'argus:engine_auto'

// ─── Componente principal ─────────────────────────────────────────────────────

/** Genera un GeoJSON FeatureCollection con un polígono circular.
 *  Aproxima el círculo con 64 puntos usando offsets de lat/lng en grados.
 *  @param {number} lat Centro (latitud)
 *  @param {number} lng Centro (longitud)
 *  @param {number} radiusM Radio en metros
 */
function buildCircleGeoJson(lat, lng, radiusM) {
  const STEPS = 64
  const latDelta = radiusM / 111320
  const lngDelta = radiusM / (111320 * Math.cos(lat * Math.PI / 180))
  const coords = []
  for (let i = 0; i <= STEPS; i++) {
    const angle = (2 * Math.PI * i) / STEPS
    coords.push([lng + lngDelta * Math.cos(angle), lat + latDelta * Math.sin(angle)])
  }
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] }, properties: {} }],
  }
}

export default function LocationPage() {
  const { gps, setGps, status, setStatus, deviceId, alarmActive, setAlarmActive, theme,
          parkActive, parkLat, parkLng, parkRadius } = useStore()

  // ── Estado UI ─────────────────────────────────────────────────────────────
  const [mapStyle,     setMapStyle]     = useState(DEFAULT_STYLE)
  const [showPicker,   setShowPicker]   = useState(false)
  // Tema: usa el toggle "Oscuro/Claro" de la app (store) — no el OS
  // Así el mapa en modo "Sistema" responde al mismo botón que el resto de la UI
  const [loading,      setLoading]      = useState(true)
  const [liveTs,       setLiveTs]       = useState(null)
  const [armed,        setArmed]        = useState(false)
  const [cmdFeedback,  setCmdFeedback]  = useState(null)
  const [diag,         setDiag]         = useState(null)

  // Moto
  const [motoAlias, setMotoAlias] = useState('Mi moto')
  const [motoPlaca, setMotoPlaca] = useState('')

  // GIS
  const [gisInfo,        setGisInfo]        = useState(null)
  const [selectedGis,    setSelectedGis]    = useState(null)
  const [nearbyCai,      setNearbyCai]      = useState([])
  const [nearCuadrantes, setNearCuadrantes] = useState(null)

  // Radar SIRE
  const [radarBounds,   setRadarBounds]   = useState(null)
  const [radarImageUrl, setRadarImageUrl] = useState(null)
  const [showRain,      setShowRain]      = useState(false)
  const [showCuadrantes, setShowCuadrantes] = useState(false)
  const [showCrime,     setShowCrime]     = useState(false)
  const [crimeData,     setCrimeData]     = useState(null)
  const [selectedCrime, setSelectedCrime] = useState(null)
  const [crimeInfo,     setCrimeInfo]     = useState(null)

  // Firmware state
  const [deviceState, setDeviceState] = useState('STATE_IDLE')

  // ARI risk alert
  const [riskAlert, setRiskAlert] = useState(null)
  const riskTimerRef = useRef(null)

  // Estilo efectivo: resuelve 'sistema' al estilo real según el toggle Oscuro/Claro de la app.
  // Los useEffects del mapa usan effectiveStyle, no mapStyle directamente.
  const effectiveStyle = mapStyle.sistema
    ? (MAP_STYLES.find(s => s.id === (theme === 'dark' ? 'argus-night' : 'argus-day')) ?? MAP_STYLES[1])
    : mapStyle

  // ── Refs ─────────────────────────────────────────────────────────────────
  const pollingRef     = useRef(null)
  const gisRef         = useRef({ lastLon: null, lastLat: null })
  const radarBlobRef   = useRef(null)
  const motorCutRef    = useRef(false)

  // MapLibre refs
  const mapContainerRef  = useRef(null)
  const mapRef           = useRef(null)
  const vehicleMarkerRef = useRef(null)
  const caiMarkersRef    = useRef([])
  const didFlyRef        = useRef(false)
  const userPannedRef    = useRef(false)
  // mapReadyKey: sube tras cada 'load' / 'style.load' para disparar efectos de capas
  const [mapReadyKey, setMapReadyKey] = useState(0)
  const mapReadyRef = useRef(false)

  // ── Fetchers ──────────────────────────────────────────────────────────────

  const fetchGps = useCallback(async () => {
    if (!deviceId) return
    try {
      const { data } = await getLatestGps(deviceId)
      if (data?.lat && data?.lon) {
        setGps(data)
        // Si el último GPS almacenado es reciente, tratar como EN VIVO sin esperar socket
        if (data.timestamp && Date.now() - new Date(data.timestamp).getTime() < 30_000) {
          setLiveTs(Date.now())
        }
      }
    } catch { /* offline */ }
  }, [deviceId, setGps])

  const fetchStatus = useCallback(async () => {
    if (!deviceId) return
    try {
      const { data } = await getDeviceStatus(deviceId)
      setStatus(data)
      setArmed(data?.armed ?? false)
      motorCutRef.current = data?.motorCut ?? false
    } catch { /* offline */ }
  }, [deviceId, setStatus])

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
    } catch { /* GIS no disponible */ }
  }, [])

  const fetchCrimeZone = useCallback(async (lat, lon) => {
    try {
      const { data } = await getCrimeLookup(lat, lon)
      setCrimeInfo(data)
    } catch { /* fuera de Bogotá o error */ }
  }, [])

  // ── Mapa: inicialización (solo al montar) ─────────────────────────────────

  useEffect(() => {
    // Registrar protocolo pmtiles. El .bind(proto) es obligatorio — sin él
    // `this` se pierde cuando MapLibre llama al handler y los tiles no cargan.
    try {
      const proto = new Protocol()
      maplibregl.addProtocol('pmtiles', proto.tile.bind(proto))
    } catch { /* ya registrado en HMR o doble mount */ }

    let cancelled = false
    // Usar effectiveStyle (ya resuelve Sistema→día/noche según el toggle de la app)
    // para que al recargar la página el mapa arranque con el tema correcto.
    resolveMapStyle(effectiveStyle).then(resolvedStyle => {
      if (cancelled || !mapContainerRef.current) return

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style:     resolvedStyle,
      center:    COLOMBIA_CENTER,
      zoom:      DEFAULT_ZOOM,
      attributionControl: false,
    })
    mapRef.current = map

    const onLoad = () => {
      mapReadyRef.current = true
      addArgusLayers(map)
      addArgusHandlers(map,
        (gisData) => setSelectedGis(gisData),
        (props)   => setSelectedCrime(props),
      )
      setMapReadyKey(k => k + 1)
    }
    map.on('load', onLoad)

    // Escalar el marcador de la moto al hacer zoom.
    // Actualiza el DOM directamente sin recrear el elemento para no resetear la animación CSS.
    map.on('dragstart', () => { userPannedRef.current = true })

    map.on('zoom', () => {
      const marker = vehicleMarkerRef.current
      if (!marker) return
      const size = motoSizeForZoom(map.getZoom())
      const el   = marker.getElement()
      el.style.width  = size + 'px'
      el.style.height = size + 'px'
      const glow = el.querySelector('.moto-glow')
      if (glow) {
        glow.style.width  = (size * 2) + 'px'
        glow.style.height = (size * 2) + 'px'
        glow.style.top    = `-${size * .5}px`
        glow.style.left   = `-${size * .5}px`
      }
      const rot = el.querySelector('.moto-rotate')
      if (rot) { rot.style.width = size + 'px'; rot.style.height = size + 'px' }
      const svg = el.querySelector('svg')
      if (svg) { svg.setAttribute('width', size); svg.setAttribute('height', size) }
    })

    return () => {
      mapReadyRef.current = false
      vehicleMarkerRef.current?.remove()
      vehicleMarkerRef.current = null
      caiMarkersRef.current.forEach(m => m.remove())
      caiMarkersRef.current = []
      map.remove()
      mapRef.current = null
    }
    }) // cierra resolveMapStyle.then()
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mapa: cambio de estilo ────────────────────────────────────────────────

  // effectiveStyle cambia cuando: usuario elige otro estilo O el toggle Oscuro/Claro cambia
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    mapReadyRef.current = false
    resolveMapStyle(effectiveStyle).then(resolvedStyle => {
      if (!mapRef.current) return
      map.once('style.load', () => {
        addArgusLayers(map)
        addArgusHandlers(map,
          (gisData) => setSelectedGis(gisData),
          (props)   => setSelectedCrime(props),
        )
        mapReadyRef.current = true
        setMapReadyKey(k => k + 1)
      })
      map.setStyle(resolvedStyle)
    })
  }, [effectiveStyle]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mapa: capas cuadrantes ────────────────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReadyRef.current) return
    const data = nearCuadrantes ?? { type: 'FeatureCollection', features: [] }
    map.getSource('cuadrantes')?.setData(data)
    const vis = showCuadrantes && nearCuadrantes ? 'visible' : 'none'
    map.setLayoutProperty('cuadrantes-fill', 'visibility', vis)
    map.setLayoutProperty('cuadrantes-line', 'visibility', vis)
  }, [nearCuadrantes, showCuadrantes, mapReadyKey])

  // ── Mapa: capa crimen ─────────────────────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReadyRef.current) return
    if (crimeData) map.getSource('crime')?.setData(crimeData)
    const vis = showCrime && crimeData ? 'visible' : 'none'
    map.setLayoutProperty('crime-fill', 'visibility', vis)
    map.setLayoutProperty('crime-line', 'visibility', vis)
  }, [crimeData, showCrime, mapReadyKey])

  // ── Mapa: radar SIRE ──────────────────────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReadyRef.current || !radarImageUrl || !radarBounds) return
    // radarBounds viene como [[south,west],[north,east]] (Leaflet order desde backend)
    const [[south, west], [north, east]] = radarBounds
    map.getSource('radar')?.updateImage({
      url: radarImageUrl,
      coordinates: [[west, north], [east, north], [east, south], [west, south]],
    })
  }, [radarImageUrl, radarBounds, mapReadyKey])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReadyRef.current) return
    map.setLayoutProperty('radar-layer', 'visibility', showRain && radarImageUrl ? 'visible' : 'none')
  }, [showRain, radarImageUrl, mapReadyKey])

  // ── Mapa: geocerca de estacionamiento ────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReadyRef.current) return
    if (parkActive && parkLat != null && parkLng != null) {
      map.getSource('geofence')?.setData(buildCircleGeoJson(parkLat, parkLng, parkRadius))
      map.setLayoutProperty('geofence-fill', 'visibility', 'visible')
      map.setLayoutProperty('geofence-line', 'visibility', 'visible')
    } else {
      map.getSource('geofence')?.setData({ type: 'FeatureCollection', features: [] })
      map.setLayoutProperty('geofence-fill', 'visibility', 'none')
      map.setLayoutProperty('geofence-line', 'visibility', 'none')
    }
  }, [parkActive, parkLat, parkLng, parkRadius, mapReadyKey])

  // ── Mapa: marcador de la moto ─────────────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current
    if (!map || !gps?.lat) return

    // Calcular rumbo desde la posición anterior (umbral ~11m en latitudes colombianas)
    if (_prevGpsPos) {
      const dy = gps.lat - _prevGpsPos.lat
      const dx = gps.lon - _prevGpsPos.lon
      if (Math.abs(dy) + Math.abs(dx) > 0.0001) {
        _motoHeading = bearingDeg(_prevGpsPos.lat, _prevGpsPos.lon, gps.lat, gps.lon)
        if (vehicleMarkerRef.current) {
          applyMarkerHeading(vehicleMarkerRef.current.getElement(), _motoHeading)
        }
      }
    }
    _prevGpsPos = { lat: gps.lat, lon: gps.lon }

    if (!vehicleMarkerRef.current) {
      // Primera vez: crear el marcador con zoom y heading actuales
      const el = makeVehicleEl(armed, (gps?.speed ?? 0) > 8, parkActive, map.getZoom())
      vehicleMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([gps.lon, gps.lat])
        .addTo(map)
    } else {
      vehicleMarkerRef.current.setLngLat([gps.lon, gps.lat])
    }

    if (!didFlyRef.current) {
      map.flyTo({ center: [gps.lon, gps.lat], zoom: 16, duration: 1200 })
      didFlyRef.current = true
    } else if (!userPannedRef.current) {
      map.easeTo({ center: [gps.lon, gps.lat], duration: 600 })
    }
  }, [gps]) // eslint-disable-line react-hooks/exhaustive-deps

  // Actualizar apariencia al armar/mover/cambiar modo parqueo
  // innerHTML se reemplaza pero se reaplica el heading para no perder la rotación
  useEffect(() => {
    if (!vehicleMarkerRef.current) return
    const el    = vehicleMarkerRef.current.getElement()
    const newEl = makeVehicleEl(armed, (gps?.speed ?? 0) > 8, parkActive, mapRef.current?.getZoom() ?? 15)
    el.innerHTML = newEl.innerHTML
    applyMarkerHeading(el, _motoHeading)
  }, [armed, gps?.speed, parkActive])

  // ── Mapa: marcadores CAI ──────────────────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    caiMarkersRef.current.forEach(m => m.remove())
    caiMarkersRef.current = []

    if (!showCuadrantes) return   // ligado al toggle de cuadrantes

    nearbyCai.forEach(cai => {
      if (!cai.lat || !cai.lon) return
      const popup = new maplibregl.Popup({ closeButton: false, offset: 20, maxWidth: '220px' })
        .setHTML(`
          <div style="font-size:12px;line-height:1.6;min-width:160px;padding:4px 0">
            <strong style="color:#16a34a">🟢 ${cai.nombre ?? ''}</strong><br>
            <span style="color:#666">${cai.direccion ?? ''}</span><br>
            ${cai.distancia_m != null ? `<span style="color:#16a34a;font-weight:600">${cai.distancia_m} m</span>` : ''}
          </div>
        `)
      const marker = new maplibregl.Marker({ element: makeCaiEl(), anchor: 'center' })
        .setLngLat([cai.lon, cai.lat])
        .setPopup(popup)
        .addTo(map)
      caiMarkersRef.current.push(marker)
    })
  }, [nearbyCai, showCuadrantes])

  // ── Ciclo de vida GPS / socket / radar ────────────────────────────────────

  useEffect(() => {
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
          if (data.lat && data.lon) {
            fetchGis(data.lon, data.lat)
            fetchCrimeZone(data.lat, data.lon)
          }
        }
      },
      (data) => {
        if (data.deviceId === deviceId) {
          setStatus(data)
          setArmed(data?.armed ?? false)
          motorCutRef.current = data?.motorCut ?? false
        }
      },
      (alertData) => {
        if (alertData.deviceId !== deviceId) return
        const { type } = alertData
        if (['STATE_MOVING','STATE_ALERT','STATE_PURSUIT','STATE_IDLE'].includes(type)) {
          setDeviceState(type)
        }
      },
      (alert) => {
        if (alert.deviceId !== deviceId) return
        clearTimeout(riskTimerRef.current)
        setRiskAlert(alert)
        riskTimerRef.current = setTimeout(() => setRiskAlert(null), 10_000)
      },
      null,    // onGeofenceExit — manejado en SecurityPage
      (data) => { if (data.deviceId === deviceId) setDiag(data) },
      deviceId // para que el servidor una el socket al room 'device:<id>'
    )

    pollingRef.current = setInterval(() => { fetchGps(); fetchStatus() }, 30_000)

    // Radar SIRE
    const fetchRadar = async () => {
      try {
        const { data } = await getRadarBounds()
        if (data?.bounds) {
          const { north, south, east, west } = data.bounds
          setRadarBounds([[south, west], [north, east]])
          const imgResp = await getRadarImage()
          if (radarBlobRef.current) URL.revokeObjectURL(radarBlobRef.current)
          const blobUrl = URL.createObjectURL(imgResp.data)
          radarBlobRef.current = blobUrl
          setRadarImageUrl(blobUrl)
        }
      } catch { /* radar es opcional */ }
    }
    fetchRadar()
    const rainInterval = setInterval(fetchRadar, 5 * 60 * 1000)

    return () => {
      clearInterval(pollingRef.current)
      clearInterval(rainInterval)
      disconnect()
      if (radarBlobRef.current) URL.revokeObjectURL(radarBlobRef.current)
    }
  }, [deviceId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (gps?.lat && gps?.lon && !gisInfo) fetchGis(gps.lon, gps.lat)
    if (gps?.lat && gps?.lon && !crimeInfo) fetchCrimeZone(gps.lat, gps.lon)
  }, [gps, gisInfo, crimeInfo, fetchGis, fetchCrimeZone])

  useEffect(() => {
    if (!showCrime || crimeData) return
    getCrimeBogota().then(({ data }) => setCrimeData(data)).catch(() => {})
  }, [showCrime]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Comandos ──────────────────────────────────────────────────────────────

  const runCmd = useCallback(async (command) => {
    try {
      // Pre-DISARM: restaurar motor si auto-restore activo y motor cortado
      if (command === 'DISARM') {
        const as = JSON.parse(localStorage.getItem(AUTO_SETTINGS_KEY) ?? 'null') ?? {}
        if ((as.autoRestoreOnDisarm || as.autoCutOnArm) && motorCutRef.current) {
          await sendCommand(deviceId, 'ENGINE_RESTORE').catch(() => {})
          motorCutRef.current = false
          setStatus(s => ({ ...s, motorCut: false }))
        }
      }

      const { data } = await sendCommand(deviceId, command)
      setCmdFeedback(data.delivered
        ? { ok: true,  msg: `✓ ${command} entregado` }
        : { ok: false, msg: `⚡ ${command} encolado (device offline)` }
      )
      if (command === 'ARM')            { setArmed(true);  setStatus(s => ({ ...s, armed: true })) }
      if (command === 'DISARM')         { setArmed(false); setStatus(s => ({ ...s, armed: false })) }
      if (command === 'ENGINE_CUT')     { motorCutRef.current = true;  setStatus(s => ({ ...s, motorCut: true })) }
      if (command === 'ENGINE_RESTORE') { motorCutRef.current = false; setStatus(s => ({ ...s, motorCut: false })) }

      // Post-ARM: cortar motor si auto-cut activo
      if (command === 'ARM') {
        const as = JSON.parse(localStorage.getItem(AUTO_SETTINGS_KEY) ?? 'null') ?? {}
        if (as.autoCutOnArm) {
          await sendCommand(deviceId, 'ENGINE_CUT').catch(() => {})
          motorCutRef.current = true
          setStatus(s => ({ ...s, motorCut: true }))
        }
      }
    } catch {
      setCmdFeedback({ ok: false, msg: '✗ Error de conexión' })
    }
    setTimeout(() => setCmdFeedback(null), 3000)
  }, [deviceId, setStatus])

  // ── Derivados ─────────────────────────────────────────────────────────────

  const engineCut      = status?.motorCut ?? false
  const hasGps         = !!(gps?.lat && gps?.lon)
  const isLive         = liveTs != null && Date.now() - liveTs < 90_000
  // Si tenemos GPS en vivo inferimos que la conexión 4G está activa
  const isTcpConn      = (status?.connected ?? false) || isLive
  const isGpsSleep     = isTcpConn && !isLive && hasGps
  const isMoving       = (gps?.speed ?? 0) > 8
  const firmwareMoving = ['STATE_MOVING','STATE_ALERT','STATE_PURSUIT'].includes(deviceState)
  const speedText      = isMoving ? `${gps.speed.toFixed(0)} km/h` : firmwareMoving ? 'Moviendo' : 'Estacionada'

  const liveLabel = isLive ? 'EN VIVO' : isGpsSleep ? 'GPS EN REPOSO' : hasGps ? 'SIN SEÑAL' : loading ? 'CARGANDO…' : 'OFFLINE'
  const liveColor = isLive ? C.green : isGpsSleep ? '#D29922' : hasGps ? C.orange : C.text2
  const connectionLabel = isTcpConn ? '📡 4G' : '○ Desconectado'

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--map-bg)' }}>

      {/* ── Mapa ─────────────────────────────────────────────────────── */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>

        {/* Contenedor MapLibre — ocupa todo el espacio */}
        <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

        {/* ── Badge ESTADO — arriba izquierda ─────────────────────── */}
        <GlassBadge style={{ top: 16, left: 16 }}>
          <div style={{ fontSize: 9, color: C.text3, letterSpacing: '0.8px', marginBottom: 2 }}>ESTADO</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: armed ? C.armed : C.text2 }}>
            {armed ? '● ARMADO' : '○ DESARMADO'}
          </div>
        </GlassBadge>

        {/* ── Leyenda radar ────────────────────────────────────────── */}
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

        {/* ── Leyenda crimen ───────────────────────────────────────── */}
        {showCrime && (
          <GlassBadge style={{ top: showRain ? 178 : 72, left: 16 }}>
            <div style={{ fontSize: 8, color: '#484F58', letterSpacing: '0.8px', marginBottom: 4 }}>
              HURTOS MOTOS 2026 · BOGOTÁ
            </div>
            {[
              ['#3FB950', '1-15 casos'],
              ['#D29922', '16-40 casos'],
              ['#F0883E', '41-70 casos'],
              ['#E5484D', '71-120 casos'],
              ['#8B5CF6', '121+ casos'],
            ].map(([color, label]) => (
              <div key={color} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
                <span style={{ fontSize: 9, color: '#8B949E' }}>{label}</span>
              </div>
            ))}
            {selectedCrime && (
              <>
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', margin: '6px 0' }} />
                <div style={{ fontSize: 10, fontWeight: 700, color: '#E6EDF3', marginBottom: 2 }}>
                  {selectedCrime.nombre}
                </div>
                <div style={{ fontSize: 9, color: '#8B949E', lineHeight: 1.7 }}>
                  🚨 {selectedCrime.motos_2026} robos de vehículos
                  {selectedCrime.motos_var_pct != null && (
                    <span style={{ color: selectedCrime.motos_var_pct > 0 ? '#E5484D' : '#3FB950', marginLeft: 4 }}>
                      {selectedCrime.motos_var_pct > 0 ? '↑' : '↓'}{Math.abs(selectedCrime.motos_var_pct).toFixed(1)}%
                    </span>
                  )}
                </div>
              </>
            )}
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

        {/* ── Banner ARI — alerta de zona de riesgo ────────────────── */}
        {riskAlert && (
          <div
            onClick={() => { clearTimeout(riskTimerRef.current); setRiskAlert(null) }}
            style={{
              position: 'absolute', top: 72, left: '50%', transform: 'translateX(-50%)',
              zIndex: 1001, cursor: 'pointer', minWidth: 260, maxWidth: 340,
              background: 'rgba(8,12,18,0.92)', backdropFilter: 'blur(12px)',
              border: `1.5px solid ${riskAlert.event === 'enter' ? 'rgba(229,72,77,0.5)' : 'rgba(63,185,80,0.5)'}`,
              borderRadius: 14, padding: '10px 16px',
              display: 'flex', gap: 10, alignItems: 'flex-start',
              boxShadow: `0 4px 24px ${riskAlert.event === 'enter' ? 'rgba(229,72,77,0.2)' : 'rgba(63,185,80,0.1)'}`,
            }}
          >
            <span style={{ fontSize: 20, flexShrink: 0 }}>{riskAlert.event === 'enter' ? '⚠️' : '✅'}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 2,
                color: riskAlert.event === 'enter' ? '#E5484D' : '#3FB950' }}>
                {riskAlert.event === 'enter'
                  ? `Zona de riesgo alto · ARI ${riskAlert.ari}`
                  : `Zona segura · ARI ${riskAlert.ari}`}
              </div>
              <div style={{ fontSize: 10, color: '#8B949E' }}>
                {riskAlert.event === 'enter'
                  ? `Argus activó vigilancia reforzada en ${riskAlert.localidad}`
                  : `Vigilancia normal restaurada en ${riskAlert.localidad}`}
              </div>
            </div>
            <span style={{ fontSize: 14, color: '#484F58', flexShrink: 0 }}>×</span>
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

        {/* ── Botones flotantes — columna derecha ─────────────────── */}
        <div style={{
          position: 'absolute', top: 70, right: 16, zIndex: 1000,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {/* Recentrar en la moto */}
          <MapFab onClick={() => {
            if (hasGps && mapRef.current) {
              userPannedRef.current = false
              mapRef.current.flyTo({ center: [gps.lon, gps.lat], zoom: 16, duration: 800 })
            }
          }}>
            <span style={{ fontSize: 16 }}>📍</span>
          </MapFab>

          {/* Toggle sirena */}
          <MapFab
            active={alarmActive}
            activeColor={C.armed}
            onClick={() => {
              if (!alarmActive) { setAlarmActive(true);  runCmd('SIREN_ON') }
              else              { setAlarmActive(false); runCmd('SIREN_OFF') }
            }}
          >
            <span style={{ fontSize: 16 }}>{alarmActive ? '🔕' : '🔔'}</span>
          </MapFab>

          {/* Selector de estilo */}
          <MapFab onClick={() => setShowPicker(p => !p)}>
            <span style={{ fontSize: 18 }}>{mapStyle.icon}</span>
          </MapFab>

          {/* Toggle radar */}
          <MapFab active={showRain} activeColor="#2F81F7" onClick={() => setShowRain(r => !r)}>
            <span style={{ fontSize: 16 }}>{showRain ? '🌧️' : '☁️'}</span>
          </MapFab>

          {/* Toggle cuadrantes */}
          <MapFab active={showCuadrantes} activeColor="#22C55E" onClick={() => setShowCuadrantes(s => !s)}>
            <span style={{ fontSize: 16 }}>🛡️</span>
          </MapFab>

          {/* Toggle crimen */}
          <MapFab active={showCrime} activeColor="#E5484D"
            onClick={() => { setShowCrime(c => !c); setSelectedCrime(null) }}>
            <span style={{ fontSize: 15 }}>⚠️</span>
          </MapFab>
        </div>

        {/* ── Picker de estilos ────────────────────────────────────── */}
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
        isMoving={isMoving}
        gps={gps}
        armed={armed}
        alarmActive={alarmActive}
        liveColor={liveColor}
        liveLabel={liveLabel}
        gisInfo={gisInfo}
        selectedGis={selectedGis}
        nearbyCai={nearbyCai}
        crimeInfo={crimeInfo}
        connectionLabel={connectionLabel}
        diag={diag}
        engineCut={engineCut}
        onClearSelectedGis={() => setSelectedGis(null)}
        onArm={()    => runCmd('ARM')}
        onDisarm={()  => runCmd('DISARM')}
        onAlarm={() => {
          if (!alarmActive) { setAlarmActive(true);  runCmd('SIREN_ON') }
          else              { setAlarmActive(false); runCmd('SIREN_OFF') }
        }}
        onEngineCut={() => runCmd(engineCut ? 'ENGINE_RESTORE' : 'ENGINE_CUT')}
      />
    </div>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

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

/** Picker de estilo — 4 opciones: Sistema, Argus Día, Argus Noche, Satélite. */
function StylePicker({ current, onSelect, onClose }) {
  return (
    <>
      <div onClick={onClose} style={{
        position: 'absolute', inset: 0, zIndex: 1100,
        background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)',
      }} />
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 1101,
        background: 'var(--card)', borderRadius: '20px 20px 0 0',
        borderTop: '1px solid var(--border)',
        padding: '12px 16px 32px',
      }}>
        <div style={{ width: 32, height: 3, background: 'var(--border)', borderRadius: 2, margin: '0 auto 16px' }} />
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text1)', marginBottom: 2 }}>Tema del mapa</div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 16 }}>
          Sistema sigue el modo oscuro/claro de tu dispositivo
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {MAP_STYLES.map(s => {
            const active = s.id === current.id
            return (
              <button key={s.id} onClick={() => onSelect(s)} style={{
                padding: '12px 6px', borderRadius: 12,
                border: `${active ? 2 : 1}px solid ${active ? C.purple : 'var(--border)'}`,
                background: active ? 'rgba(139,92,246,0.12)' : 'var(--card-alt)',
                cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              }}>
                <span style={{ fontSize: 28 }}>{s.icon}</span>
                <span style={{ fontSize: 10, textAlign: 'center', lineHeight: 1.3,
                  fontWeight: active ? 700 : 500,
                  color: active ? C.purple : 'var(--text2)' }}>
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

// ─── Modal histórico de crimen ────────────────────────────────────────────────

function CrimeHistoryModal({ info, onClose }) {
  if (!info) return null
  const nombre  = info.nombre ?? '—'
  const level   = info.risk_level
  const col     = crimeColor(level)
  const label   = crimeLevelLabel(level)
  const ari     = info.ari
  const hist    = info.historico ?? {}
  const years   = ['2018','2019','2020','2021','2022','2023','2024','2025','2026']
  const values  = years.map(y => hist[y] ?? 0)
  const maxVal  = Math.max(...values, 1)

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 3000,
      background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 520, margin: '0 auto',
        background: 'var(--card)', borderRadius: '20px 20px 0 0',
        padding: '12px 20px 32px', border: '1px solid var(--border)',
      }}>
        <div style={{ width: 32, height: 3, background: 'var(--border)', borderRadius: 2, margin: '0 auto 14px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text1)', flex: 1 }}>{nombre}</div>
          <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: col + '26', color: col }}>{label}</span>
          {ari != null && <span style={{ fontSize: 12, fontWeight: 700, color: col }}>ARI {ari}</span>}
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 0 }}>×</button>
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 2 }}>¿Cuántos vehículos se robaron cada año?</div>
        <div style={{ fontSize: 9, color: 'var(--text3)', marginBottom: 4 }}>Datos oficiales de la Secretaría de Seguridad de Bogotá</div>
        <div style={{ fontSize: 9, color: '#E67E22', marginBottom: 12 }}>⚠️ Cifra incluye solo robos denunciados — la realidad puede ser mayor.</div>
        {years.map((y, i) => {
          const val = values[i]
          const isNow = y === '2026'
          return (
            <div key={y} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ width: 36, fontSize: 10, color: isNow ? 'var(--text1)' : 'var(--text3)', fontWeight: isNow ? 700 : 400 }}>{y}</span>
              <div style={{ flex: 1, height: 16, background: 'var(--card-alt)', borderRadius: 4, position: 'relative', overflow: 'hidden' }}>
                <div style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0,
                  width: `${Math.max((val / maxVal) * 100, 2)}%`,
                  background: isNow ? col : col + '80',
                  borderRadius: 4, transition: 'width 0.4s ease',
                }} />
              </div>
              <span style={{ width: 28, fontSize: 10, textAlign: 'right', color: isNow ? 'var(--text1)' : 'var(--text3)', fontWeight: isNow ? 700 : 400 }}>{val}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Signal helpers ───────────────────────────────────────────────────────────

function signalFromDiag(diag) {
  if (!diag) return null
  const { rssi, cgatt } = diag
  if (!cgatt)    return { label: 'Sin datos',  color: '#FF6B35', level: 0 }
  if (rssi >= 26) return { label: 'Excelente', color: '#22c55e', level: 5 }
  if (rssi >= 20) return { label: 'Buena',     color: '#4ade80', level: 4 }
  if (rssi >= 15) return { label: 'Regular',   color: '#eab308', level: 3 }
  if (rssi >= 8)  return { label: 'Débil',     color: '#f97316', level: 2 }
  return           { label: 'Muy débil',        color: '#ef4444', level: 1 }
}

function SignalBars({ level, color }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, height: 12, verticalAlign: 'middle' }}>
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} style={{
          display: 'inline-block',
          width: 3,
          height: 3 + i * 2,
          borderRadius: 1,
          background: i <= level ? color : 'var(--text3)',
          opacity: i <= level ? 1 : 0.25,
        }} />
      ))}
    </span>
  )
}

// ─── BottomPanel ──────────────────────────────────────────────────────────────

function BottomPanel({
  motoAlias, motoPlaca, speedText, isMoving, gps, armed,
  alarmActive, liveColor, liveLabel, connectionLabel, diag,
  gisInfo, selectedGis, nearbyCai, crimeInfo, engineCut,
  onClearSelectedGis, onArm, onDisarm, onAlarm, onEngineCut,
}) {
  const hasGps = !!(gps?.lat && gps?.lon)
  const [expanded, setExpanded] = useState(true)
  const [crimeModal, setCrimeModal] = useState(false)
  const dragState = useRef({ startY: 0, dragging: false })
  const DRAG_THRESHOLD = 24

  const handlePointerDown = (e) => {
    dragState.current = { startY: e.clientY, dragging: true }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const handlePointerUp = (e) => {
    if (!dragState.current.dragging) return
    const deltaY = e.clientY - dragState.current.startY
    dragState.current.dragging = false
    if (deltaY > DRAG_THRESHOLD)       setExpanded(false)
    else if (deltaY < -DRAG_THRESHOLD) setExpanded(true)
    else                               setExpanded(x => !x)
  }

  const d = selectedGis ?? gisInfo

  return (
    <>
      {crimeModal && <CrimeHistoryModal info={crimeInfo} onClose={() => setCrimeModal(false)} />}
      <div style={{ background: 'var(--card)', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <div onPointerDown={handlePointerDown} onPointerUp={handlePointerUp}
          role="button" aria-label={expanded ? 'Colapsar panel' : 'Expandir panel'}
          style={{ padding: '10px 0 8px', cursor: 'grab', touchAction: 'none' }}>
          <div style={{ width: 32, height: 3, background: 'var(--border)', borderRadius: 2, margin: '0 auto' }} />
        </div>

        <div style={{ padding: '0 16px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: expanded ? 12 : 0 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text1)' }}>{motoAlias}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                {motoPlaca && <span style={{ fontSize: 11, color: 'var(--text2)' }}>{motoPlaca}</span>}
                {motoPlaca && <span style={{ fontSize: 11, color: 'var(--text3)' }}>·</span>}
                <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.3px', color: speedText !== 'Estacionada' ? '#3FB950' : 'var(--text3)' }}>
                  {speedText !== 'Estacionada' ? `▶ ${speedText}` : '■ Estacionada'}
                </span>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span>{connectionLabel}</span>
                {(() => {
                  const sig = signalFromDiag(diag)
                  if (!sig) return null
                  return (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ color: 'var(--text3)' }}>·</span>
                      <SignalBars level={sig.level} color={sig.color} />
                      <span style={{ color: sig.color, fontWeight: 600 }}>{sig.label}</span>
                    </span>
                  )
                })()}
                <span style={{ color: 'var(--text3)' }}>·</span>
                <span>{gps?.timestamp ? `Última ubicación: ${fmtTime(gps.timestamp)}` : 'Sin ubicación aún'}</span>
              </div>
              <div onClick={() => crimeInfo && setCrimeModal(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4, cursor: crimeInfo ? 'pointer' : 'default' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                  background: crimeInfo ? crimeColor(crimeInfo.risk_level) : 'var(--text3)', display: 'inline-block' }} />
                {crimeInfo ? (
                  <>
                    <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text2)' }}>{crimeInfo.nombre}</span>
                    <span style={{ fontSize: 10, color: 'var(--text3)' }}>·</span>
                    <span style={{ fontSize: 10, color: crimeColor(crimeInfo.risk_level), flex: 1 }}>
                      {crimePlainMsg(crimeInfo.risk_level, crimeInfo.motos_var_pct)}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text3)' }}>›</span>
                  </>
                ) : (
                  <span style={{ fontSize: 10, color: 'var(--text3)' }}>
                    {gps?.lat ? 'Zona sin cobertura de datos' : 'Esperando ubicación...'}
                  </span>
                )}
              </div>
            </div>

            <button onClick={armed ? onDisarm : onArm} style={{
              padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
              background: armed ? 'var(--armed-10)' : 'var(--card-alt)',
              border: `1px solid ${armed ? 'var(--armed-20)' : 'var(--border)'}`,
              color: armed ? 'var(--armed)' : 'var(--text2)',
              fontSize: 12, fontWeight: 700, flexShrink: 0,
            }}>
              {armed ? '● Armado' : 'Armar'}
            </button>
          </div>

          <div style={{ maxHeight: expanded ? 400 : 0, opacity: expanded ? 1 : 0,
            overflow: 'hidden', transition: 'max-height 0.25s ease, opacity 0.2s ease' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <ActionBtn label={alarmActive ? 'Silenciar' : 'Alarma'} icon="🔔"
                active={alarmActive} activeColor={C.purple} onClick={onAlarm} />
              <ActionBtn label={engineCut ? 'Restaurar motor' : 'Apagar motor'}
                icon={engineCut ? '✅' : '✂️'} active={engineCut} activeColor={C.green} onClick={onEngineCut} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, marginBottom: d ? 10 : 0 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: liveColor, display: 'inline-block' }} />
              <span style={{ fontSize: 10, color: 'var(--text2)' }}>{liveLabel}</span>
            </div>

            {d && (
              <div style={{ background: 'var(--card-alt)', borderRadius: 10, border: '1px solid var(--border)', padding: '10px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                  <span style={{ fontSize: 9, color: 'var(--text3)', letterSpacing: '0.8px' }}>CUADRANTE</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {d.ciudad && <span style={{ fontSize: 9, color: 'var(--text2)' }}>{d.ciudad}</span>}
                    {selectedGis && (
                      <button onClick={onClearSelectedGis} aria-label="Volver a cuadrante de la moto"
                        style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 0, fontSize: 15, lineHeight: 1 }}>×</button>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text1)' }}>
                  {d.descripcion || d.cuadrante_id || '—'}
                </div>
                {nearbyCai[0]?.nombre && (
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>🚓 {nearbyCai[0].nombre}</div>
                )}
                {nearbyCai[0]?.telefono && (
                  <div style={{ fontSize: 12, color: 'var(--blue)', fontWeight: 600, marginTop: 4 }}>📞 {nearbyCai[0].telefono}</div>
                )}
                {nearbyCai.length > 0 && (
                  <>
                    <div style={{ height: 1, background: 'var(--border)', margin: '6px 0' }} />
                    <div style={{ display: 'flex' }}>
                      {nearbyCai.slice(0, 3).map((cai, i) => (
                        <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 10, color: 'var(--text2)' }}>
                          🚓 {cai.distancia_m != null ? `${cai.distancia_m}m` : ''}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function ActionBtn({ label, icon, onClick, active = false, activeColor = C.purple }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: '10px 0', borderRadius: 10, cursor: 'pointer',
      background: active ? `${activeColor}18` : 'var(--card-alt)',
      border: `1px solid ${active ? `${activeColor}50` : 'var(--border)'}`,
      color: active ? activeColor : 'var(--text2)',
      fontSize: 12, fontWeight: 600,
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    }}>
      <span>{icon}</span>{label}
    </button>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   RESUMEN DEL MÓDULO — LocationPage.jsx
   ═══════════════════════════════════════════════════════════════════

   MIGRACIÓN: react-leaflet + Mapbox → MapLibre GL JS + pmtiles

   FUENTE DE TILES:
   Fase 1 (ahora): CartoDB Dark Matter / Voyager / ESRI Satellite — gratis.
   Fase 2: cambiar CUSTOM_TILES_URL en src/lib/mapConfig.js al archivo pmtiles
   propio en Cloudflare R2. Una sola línea de cambio.

   DÍA/NOCHE:
   StylePicker ofrece 3 estilos. Al seleccionar → map.setStyle() →
   'style.load' → addArgusLayers() re-agrega fuentes y capas Argus.

   MARCADORES: maplibregl.Marker con HTMLElement (no L.DivIcon).
   CAPAS: addArgusLayers() en cada load/style.load. setData() en useEffects.

   OFFLINE: cuando el usuario tenga bogota.pmtiles descargado localmente,
   cambiar la fuente a 'pmtiles:///data/user/...bogota.pmtiles' para modo offline.

   ═══════════════════════════════════════════════════════════════════ */
