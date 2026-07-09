/**
 * @fileoverview Página de Conducción — IRC con filtro por día, tooltips de pilares,
 *   marcadores de eventos en mapa, y mapa que cambia con el tema.
 *
 * NOVEDADES v4:
 *   - dayModeActive: clic en barra del gráfico o navegación por día actualiza
 *     el IRC ring, stats y trayectos.
 *   - Pillar info: botón ⓘ en cada pilar explica qué evalúa y cómo mejorarlo.
 *   - Tiles del mapa: CartoDB Light en tema claro, Dark Matter en tema oscuro.
 *   - TripModal: marcadores de eventos (rojo=maniobras, amarillo=curvas) sobre la ruta.
 *   - Tiempo detenido: avisa cuando el firmware aún no reporta stoppedSec.
 *
 * @module pages/DrivingPage
 */

import { useState, useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { useStore }        from '../store/useStore'
import { getDriveMetrics } from '../api/apiService'

// ─── Constantes ────────────────────────────────────────────────────────────────
const BLUE   = '#1A56C9'
const GREEN  = '#22C55E'
const RED    = '#EF4444'
const YELLOW = '#F59E0B'
const PURPLE = '#A855F7'

const GAP_MS      = 30 * 60 * 1000
const MIN_TRIP_MS = 2  * 60 * 1000
const MIN_TRIP_KM = 0.1

const DRIVE_HARD_ACCEL_G  = 0.60
const DRIVE_HARD_GYRO_DPS = 50.0

// ─── Información de todas las tarjetas ────────────────────────────────────────
// Estructura: { icon, title, sub?, desc, tips? }
// sub: texto pequeño bajo el título (peso en IRC para pilares, aclaración para el resto)
// tips: aparece como sección "Cómo mejorar" al final del modal; omitir si no aplica

const INFO = {
  // Pilares IRC
  behavior: {
    icon: '🏎️', title: 'Comportamiento', sub: '45 puntos del IRC',
    desc: 'El pilar más importante. Evalúa la calidad de tus maniobras: frenadas bruscas (aceleración > 0.6g) y curvas agresivas (giro > 50°/s). Cada maniobra brusca descuenta puntos.',
    tips: ['Anticipa las frenadas — deja más distancia al vehículo de adelante', 'Reduce velocidad antes de entrar a la curva, no durante', 'Acelera progresivamente al salir de semáforos'],
  },
  temporal: {
    icon: '🕐', title: 'Contexto temporal', sub: '20 puntos del IRC',
    desc: 'Considera el horario de conducción. La nocturna (20:00–06:00) tiene riesgo 2× mayor estadísticamente. Las horas pico (7–9 am, 5–7 pm) tienen mayor densidad de accidentes.',
    tips: ['Evita la moto de noche cuando sea posible', 'Mayor precaución en horas pico — más vehículos, más estrés', 'En lluvia nocturna reduce la velocidad un 30% adicional'],
  },
  geo: {
    icon: '🗺️', title: 'Zona geográfica', sub: '20 puntos del IRC',
    desc: 'Analiza el Índice de Riesgo Argus (ARI) de las zonas recorridas. El ARI combina historial de incidentes, cuadrantes policiales y condiciones del entorno. Zonas con ARI alto penalizan el IRC.',
    tips: ['Revisa el mapa de calor en la pantalla principal', 'Conoce los sectores de alto riesgo en tu ciudad', 'Aumenta la precaución al pasar por zonas con ARI alto'],
  },
  consistency: {
    icon: '📊', title: 'Consistencia', sub: '15 puntos del IRC',
    desc: 'Premia mantener un estilo de conducción uniforme. Muchas maniobras por kilómetro o alta variabilidad entre sesiones indica conducción impredecible.',
    tips: ['Mantén velocidad constante en autopistas', 'Evita frenadas y aceleraciones repetitivas en ciudad', 'La consistencia mejora con la práctica y la anticipación'],
  },
  // Chips de estadísticas
  distance: {
    icon: '🛣️', title: 'Distancia recorrida',
    desc: 'Suma de kilómetros de todos los trayectos del período. Solo cuenta desplazamiento real — no incluye el tiempo detenido en semáforos o trancones.',
  },
  driving: {
    icon: '⏱️', title: 'Tiempo conduciendo',
    desc: 'Tiempo total en movimiento. A partir del firmware v3 se descuenta el tiempo de paradas (semáforos, trancones). En dispositivos sin actualizar se muestra el tiempo total del trayecto.',
    tips: ['Reduce paradas innecesarias planificando mejor la ruta', 'En hora pico, salir 20 min antes puede evitar hasta 15 min de trancón'],
  },
  maxSpeed: {
    icon: '⚡', title: 'Velocidad máxima', sub: 'Disponible a partir del firmware v3',
    desc: 'La mayor velocidad registrada en cualquier ventana de 30 segundos del período. Se activa después de actualizar el firmware del dispositivo.',
    tips: ['Velocidades > 80 km/h en vías urbanas aumentan significativamente el IRC de riesgo', 'En autopista, mantente dentro del límite señalizado'],
  },
  maneuvers: {
    icon: '🛑', title: 'Maniobras bruscas',
    desc: 'Ventanas de 30s donde la aceleración pico superó 0.60g. Incluye frenadas y arrancadas abruptas. Este umbral es 2× el de detección de robo para evitar falsos positivos en vías irregulares de Bogotá.',
    tips: ['Anticipa las frenadas — frena suave y progresivo', 'Arranca despacio: la potencia brusca desgasta la llanta y sube el IRC', 'En trancón, mantén distancia de seguridad constante'],
  },
  curves: {
    icon: '↩️', title: 'Curvas agresivas',
    desc: 'Ventanas de 30s donde la velocidad de giro del giroscopio superó 50°/s. Indica curvas tomadas con exceso de velocidad lateral, que aumentan el riesgo de volcamiento.',
    tips: ['Entra lento a la curva, sal rápido — regla básica de motociclismo', 'Mira hacia el final de la curva, no hacia el suelo', 'Reduce si hay arena, agua o gravilla en el pavimento'],
  },
  trips: {
    icon: '🗺️', title: 'Trayectos',
    desc: 'Número de salidas registradas en el período. Argus considera un nuevo trayecto cuando pasan más de 30 minutos sin movimiento o sin datos GPS del dispositivo.',
  },
  // Cards de análisis
  ircChart: {
    icon: '📊', title: 'IRC por día',
    desc: 'Cada barra muestra el Índice de Riesgo de Conducción (IRC) de ese día, de 0 a 100 — mayor puntaje es más seguro. Verde = muy seguro, naranja = mejorable, rojo = peligroso. Los días sin trayectos quedan sin barra.',
    tips: ['Haz clic en una barra para ver los detalles del día', 'Busca patrones: ¿los lunes conduces peor? ¿Los fines de semana?'],
  },
  usage: {
    icon: '🏍️', title: 'Uso de la moto',
    desc: 'Estadísticas generales de uso en el período: número de salidas, la más larga y la más corta, y el horario de mayor actividad. Útil para entender tus hábitos de movilidad.',
  },
  impact: {
    icon: '🌱', title: 'Impacto ambiental',
    desc: 'Estimado de huella de carbono basado en la distancia recorrida. Se asume rendimiento promedio de 18 km/L y factor de emisión de 2.3 kg CO₂ por litro de gasolina.',
    tips: ['Cada trayecto evitado = menos emisiones', 'Conducir a velocidad constante mejora el rendimiento hasta un 20%'],
  },
  trend: {
    icon: '📈', title: 'Tendencia del IRC',
    desc: 'Compara el IRC promedio de la primera mitad del período vs. la segunda mitad. Una flecha ↑ indica que tu conducción mejoró en los días más recientes. Una flecha ↓ indica deterioro.',
  },
  hourChart: {
    icon: '🕐', title: 'Hora de uso',
    desc: 'Distribución por hora del día de tus sesiones de conducción. La barra naranja marca tu hora pico. Las horas de mayor riesgo estadístico en Colombia son 6–9 am y 5–8 pm.',
    tips: ['Salir 20 min antes del pico reduce exposición y estrés', 'Las 11 pm–5 am tienen menor tráfico pero mayor riesgo de accidente grave'],
  },
}

// Alias legacy para compatibilidad interna
const PILLAR_INFO = INFO

// ─── Hook: tiles según tema ────────────────────────────────────────────────────

function useTileUrl() {
  const detect = () => {
    const el = document.documentElement
    return el.dataset.theme === 'dark' ||
      (!el.dataset.theme && window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  }
  const [dark, setDark] = useState(detect)
  useEffect(() => {
    const el = document.documentElement
    const mo = new MutationObserver(() => setDark(detect()))
    mo.observe(el, { attributes: true, attributeFilter: ['data-theme'] })
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    const onMq = () => setDark(detect())
    mq?.addEventListener('change', onMq)
    return () => { mo.disconnect(); mq?.removeEventListener('change', onMq) }
  }, [])
  return dark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'
}

// ─── Helpers puros ─────────────────────────────────────────────────────────────

function ircColor(irc) {
  if (irc >= 90) return '#22C55E'
  if (irc >= 75) return '#84CC16'
  if (irc >= 60) return '#F59E0B'
  if (irc >= 40) return '#FF6B35'
  return '#EF4444'
}

function ircLabel(irc) {
  if (irc >= 90) return 'Muy segura'
  if (irc >= 75) return 'Segura'
  if (irc >= 60) return 'Mejorable'
  if (irc >= 40) return 'De riesgo'
  return 'Peligrosa'
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R    = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a    = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function tripGpsPoints(trip) {
  return trip.filter(s => s.lat != null && s.lon != null).map(s => [s.lat, s.lon])
}
function tripDistanceKm(trip) {
  const pts = tripGpsPoints(trip)
  let km = 0
  for (let i = 1; i < pts.length; i++) km += haversineKm(pts[i-1][0], pts[i-1][1], pts[i][0], pts[i][1])
  return km
}
function tripDurationMs(trip) {
  return new Date(trip[trip.length-1].timestamp) - new Date(trip[0].timestamp) + 30000
}
function tripStoppedSec(trip)    { return trip.reduce((s, x) => s + (x.stoppedSec || 0), 0) }
function tripDrivingSec(trip)    { return trip.reduce((s, x) => s + Math.max(0, 30 - (x.stoppedSec || 0)), 0) }
function tripMaxSpeed(trip)      { return trip.reduce((m, s) => Math.max(m, s.maxSpeedKmh ?? s.avgSpeedKmh ?? 0), 0) }
function tripHardEvents(trip)    { return trip.filter(s => s.peakAccelDev >= DRIVE_HARD_ACCEL_G).length }
function tripCurveEvents(trip)   { return trip.filter(s => s.peakGyroMag  >= DRIVE_HARD_GYRO_DPS).length }
function tripHasStoppedData(trip){ return trip.some(s => s.stoppedSec !== null && s.stoppedSec !== undefined) }

function groupIntoTrips(sessions) {
  if (!sessions.length) return []
  const sorted = [...sessions].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
  const trips  = []
  let buf      = [sorted[0]]
  for (let i = 1; i < sorted.length; i++) {
    if (new Date(sorted[i].timestamp) - new Date(sorted[i-1].timestamp) > GAP_MS) { trips.push(buf); buf = [] }
    buf.push(sorted[i])
  }
  trips.push(buf)
  return trips
    .filter(t => tripDurationMs(t) >= MIN_TRIP_MS && tripDistanceKm(t) >= MIN_TRIP_KM)
    .reverse()
}

function fmtKm(km) {
  if (km == null || isNaN(km)) return '—'
  return km < 1 ? `${(km * 1000).toFixed(0)} m` : `${km.toFixed(1)} km`
}
function fmtSec(sec) {
  if (!sec) return '0 min'
  const min = Math.round(sec / 60)
  return min >= 60 ? `${Math.floor(min/60)}h ${min%60} min` : `${min} min`
}
function fmtTime(ts) {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`
}
function dayLabel(dt) {
  const now  = new Date(); now.setHours(0,0,0,0)
  const d    = new Date(dt); d.setHours(0,0,0,0)
  const diff = Math.round((now - d) / 86400000)
  if (diff === 0) return 'Hoy'
  if (diff === 1) return 'Ayer'
  const days   = ['Do','Lu','Ma','Mi','Ju','Vi','Sa']
  const months = ['','ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
  return `${days[dt.getDay()]} ${dt.getDate()} ${months[dt.getMonth()+1]}`
}
function getBounds(pts) {
  const lats = pts.map(p => p[0]); const lons = pts.map(p => p[1])
  const pLat = Math.max(0.002, (Math.max(...lats) - Math.min(...lats)) * 0.35)
  const pLon = Math.max(0.002, (Math.max(...lons) - Math.min(...lons)) * 0.35)
  return [[Math.min(...lats)-pLat, Math.min(...lons)-pLon], [Math.max(...lats)+pLat, Math.max(...lons)+pLon]]
}

// ─── Sub-componentes ───────────────────────────────────────────────────────────

function IRCRing({ irc, size = 110 }) {
  const r   = size * 0.4
  const c   = 2 * Math.PI * r
  const clr = ircColor(irc)
  const sw  = size * 0.085
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
         style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--border)" strokeWidth={sw} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={clr} strokeWidth={sw}
        strokeDasharray={`${c * irc/100} ${c}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.6s ease' }} />
      <text x={size/2} y={size/2 - 3} textAnchor="middle" dominantBaseline="central"
        style={{ transform:`rotate(90deg)`, transformOrigin:`${size/2}px ${size/2}px`,
                 fill:clr, fontSize:size*0.22, fontWeight:800, fontFamily:'system-ui' }}>
        {irc}
      </text>
      <text x={size/2} y={size/2 + size*0.15} textAnchor="middle"
        style={{ transform:`rotate(90deg)`, transformOrigin:`${size/2}px ${size/2}px`,
                 fill:'var(--text3)', fontSize:size*0.09, fontFamily:'system-ui', letterSpacing:1 }}>
        IRC
      </text>
    </svg>
  )
}

function PillarBar({ label, value, color, onInfo }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
          <span style={{ fontSize:11, color:'var(--text2)' }}>{label}</span>
          <button onClick={onInfo} title="¿Qué es esto?"
            style={{ width:16, height:16, borderRadius:'50%', border:'1px solid var(--text3)',
                     background:'transparent', cursor:'pointer', fontSize:9, color:'var(--text3)',
                     display:'inline-flex', alignItems:'center', justifyContent:'center', padding:0, flexShrink:0 }}>
            i
          </button>
        </div>
        <span style={{ fontSize:11, fontWeight:700, color, fontVariantNumeric:'tabular-nums' }}>{value}</span>
      </div>
      <div style={{ height:5, background:'var(--border)', borderRadius:3, overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${value}%`, background:color, borderRadius:3,
            transition:'width .5s ease' }} />
      </div>
    </div>
  )
}

// Modal de información genérico — pilares, chips, cards
function InfoModal({ info, onClose }) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [onClose])
  if (!info) return null
  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:3000, background:'rgba(0,0,0,.55)',
        display:'flex', alignItems:'center', justifyContent:'center', padding:20, backdropFilter:'blur(3px)' }}>
      <div onClick={e => e.stopPropagation()} style={{ background:'var(--card)', borderRadius:18,
          border:'1px solid var(--border)', width:'100%', maxWidth:420, padding:'24px 24px 28px',
          boxShadow:'0 24px 64px rgba(0,0,0,.3)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:24 }}>{info.icon}</span>
            <div>
              <div style={{ fontSize:15, fontWeight:700, color:'var(--text1)' }}>{info.title}</div>
              {info.sub && <div style={{ fontSize:11, color:'var(--text3)', marginTop:1 }}>{info.sub}</div>}
            </div>
          </div>
          <button onClick={onClose} style={{ width:28, height:28, borderRadius:'50%', border:'1px solid var(--border)',
              background:'var(--bg)', cursor:'pointer', fontSize:14, color:'var(--text2)', display:'flex',
              alignItems:'center', justifyContent:'center' }}>✕</button>
        </div>
        <p style={{ fontSize:13, color:'var(--text2)', lineHeight:1.65, marginBottom: info.tips ? 16 : 0 }}>{info.desc}</p>
        {info.tips && (
          <div style={{ background:'var(--bg)', borderRadius:10, padding:'12px 14px' }}>
            <div style={{ fontSize:10, fontWeight:700, letterSpacing:'1px', color:'var(--text3)',
                textTransform:'uppercase', marginBottom:8 }}>Cómo mejorar</div>
            {info.tips.map((tip, i) => (
              <div key={i} style={{ display:'flex', gap:8, marginBottom: i < info.tips.length-1 ? 6 : 0 }}>
                <span style={{ color:'var(--orange)', fontSize:11, flexShrink:0, marginTop:1 }}>→</span>
                <span style={{ fontSize:12, color:'var(--text2)', lineHeight:1.5 }}>{tip}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Alias para compatibilidad con usos anteriores
const PillarInfoModal = InfoModal

// Botón de información reutilizable
function InfoBtn({ onClick }) {
  return (
    <button onClick={onClick} title="¿Qué es esto?"
      style={{ width:16, height:16, borderRadius:'50%', border:'1px solid var(--text3)',
               background:'transparent', cursor:'pointer', fontSize:9, color:'var(--text3)',
               display:'inline-flex', alignItems:'center', justifyContent:'center',
               padding:0, flexShrink:0, lineHeight:1 }}>
      i
    </button>
  )
}

function StatChip({ icon, label, value, color, sub, onInfo }) {
  return (
    <div style={{ flex:1, minWidth:100, background:'var(--card)', border:'1px solid var(--border)',
        borderRadius:12, padding:'12px 14px', position:'relative' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
        <span style={{ fontSize:18 }}>{icon}</span>
        {onInfo && <InfoBtn onClick={onInfo} />}
      </div>
      <div style={{ fontSize:18, fontWeight:700, color:color||'var(--text1)',
          fontVariantNumeric:'tabular-nums', lineHeight:1 }}>{value}</div>
      <div style={{ fontSize:10, color:'var(--text2)', marginTop:3 }}>{label}</div>
      {sub && <div style={{ fontSize:9, color:'var(--text3)', marginTop:1 }}>{sub}</div>}
    </div>
  )
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize:10, fontWeight:700, letterSpacing:'1.4px', color:'var(--text3)',
        textTransform:'uppercase', marginBottom:10, marginTop:4 }}>
      {children}
    </div>
  )
}

// Encabezado de card con título + botón ⓘ opcional
function CardHeader({ title, onInfo }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:10 }}>
      <div style={{ fontSize:10, fontWeight:700, letterSpacing:'1.4px', color:'var(--text3)',
          textTransform:'uppercase' }}>{title}</div>
      {onInfo && <InfoBtn onClick={onInfo} />}
    </div>
  )
}

function HourChart({ hourDistribution, onInfo }) {
  if (!hourDistribution?.length) return null
  const max    = Math.max(...hourDistribution, 1)
  const labels = ['12a','','','3a','','','6a','','','9a','','','12p','','','3p','','','6p','','','9p','','']
  return (
    <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:14,
        padding:'16px 16px 10px' }}>
      <CardHeader title="Hora donde más usas la moto" onInfo={onInfo} />
      <div style={{ display:'flex', alignItems:'flex-end', gap:2, height:56 }}>
        {hourDistribution.map((v, i) => (
          <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center' }}>
            <div style={{ width:'100%', borderRadius:'3px 3px 0 0',
                height:Math.max(v>0?3:0, (v/max)*48),
                background: v === Math.max(...hourDistribution) ? '#FF6B35' : 'var(--border)',
                transition:'height .4s' }} />
            <div style={{ fontSize:8, color:'var(--text3)', marginTop:2, textAlign:'center' }}>{labels[i]}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Chip({ text, color, bg, border }) {
  return (
    <span style={{ fontSize:11, color, background:bg, border:`1px solid ${border}`,
        borderRadius:6, padding:'2px 8px' }}>{text}</span>
  )
}

function MiniMap({ trip, tileUrl }) {
  const points = tripGpsPoints(trip)
  if (!points.length) {
    return (
      <div style={{ height:130, background:'var(--card-alt)', display:'flex', alignItems:'center',
          justifyContent:'center', position:'relative', overflow:'hidden' }}>
        <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%' }}>
          <path d="M 40,110 Q 160,30 290,65 L 380,45" stroke={BLUE} strokeWidth="3" fill="none"
            strokeLinecap="round" opacity="0.3" strokeDasharray="8 5" />
        </svg>
        <span style={{ fontSize:11, color:'var(--text3)', position:'relative' }}>Sin GPS</span>
      </div>
    )
  }
  const mapProps = points.length === 1 ? { center:points[0], zoom:15 } : { bounds:getBounds(points) }
  return (
    <MapContainer {...mapProps} dragging={false} zoomControl={false} scrollWheelZoom={false}
      doubleClickZoom={false} attributionControl={false} style={{ height:130, width:'100%' }}>
      <TileLayer url={tileUrl} subdomains={['a','b','c','d']} />
      {points.length >= 2 && <Polyline positions={points} color={BLUE} weight={3} lineCap="round" lineJoin="round" />}
      <CircleMarker center={points[0]} radius={5} fillColor={GREEN} fillOpacity={1} color="white" weight={2} />
      {points.length >= 2 && (
        <CircleMarker center={points[points.length-1]} radius={5} fillColor={BLUE} fillOpacity={1} color="white" weight={2} />
      )}
    </MapContainer>
  )
}

function TripCard({ trip, onSelect, tileUrl }) {
  const km       = tripDistanceKm(trip)
  const driveSec = tripDrivingSec(trip)
  const stopSec  = tripStoppedSec(trip)
  const hardEvts = tripHardEvents(trip)
  const curveEvts= tripCurveEvents(trip)
  const maxSpd   = tripMaxSpeed(trip)
  const isSafe   = hardEvts === 0 && curveEvts === 0
  const start    = new Date(trip[0].timestamp)

  return (
    <div onClick={() => onSelect(trip)} style={{ background:'var(--card)', border:'1px solid var(--border)',
        borderRadius:14, overflow:'hidden', marginBottom:10, cursor:'pointer', transition:'box-shadow .15s' }}
      onMouseEnter={e => e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,.12)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow='none'}>
      <MiniMap trip={trip} tileUrl={tileUrl} />
      <div style={{ padding:'12px 16px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
          <div>
            <div style={{ fontSize:13, fontWeight:600, color:'var(--text1)' }}>{dayLabel(start)}</div>
            <div style={{ fontSize:11, color:'var(--text2)', marginTop:2 }}>
              {fmtTime(start)} · {fmtKm(km)} · {fmtSec(driveSec)} conduciendo
              {stopSec > 60 ? ` · ${fmtSec(stopSec)} detenido` : ''}
            </div>
          </div>
          <span style={{ fontSize:20 }}>🏍️</span>
        </div>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          {maxSpd > 0 && <Chip text={`⚡ ${Math.round(maxSpd)} km/h`} color="var(--text2)" bg="var(--bg)" border="var(--border)" />}
          {hardEvts  > 0 && <Chip text={`🛑 ${hardEvts} maniobra${hardEvts>1?'s':''}`} color={RED} bg="rgba(239,68,68,.08)" border="rgba(239,68,68,.2)" />}
          {curveEvts > 0 && <Chip text={`↩️ ${curveEvts} curva${curveEvts>1?'s':''}`} color={YELLOW} bg="rgba(245,158,11,.08)" border="rgba(245,158,11,.2)" />}
          {isSafe && <Chip text="✅ Seguro" color={GREEN} bg="rgba(34,197,94,.08)" border="rgba(34,197,94,.2)" />}
        </div>
      </div>
    </div>
  )
}

function TripModal({ trip, onClose, tileUrl }) {
  const points      = tripGpsPoints(trip)
  const km          = tripDistanceKm(trip)
  const driveSec    = tripDrivingSec(trip)
  const stopSec     = tripStoppedSec(trip)
  const hardEvts    = tripHardEvents(trip)
  const curveEvts   = tripCurveEvents(trip)
  const maxSpd      = tripMaxSpeed(trip)
  const hasStopData = tripHasStoppedData(trip)
  const avgSpd      = trip.filter(s => s.avgSpeedKmh).reduce((s,x,_,a) => s + x.avgSpeedKmh/a.length, 0)
  const start       = new Date(trip[0].timestamp)
  const end         = new Date(new Date(trip[trip.length-1].timestamp).getTime() + 30000)
  const isNight     = trip.some(s => s.isNight)

  // Puntos con evento para marcadores en mapa
  const hardPts  = trip.filter(s => s.isDrivingHard && s.lat != null && s.lon != null)
  const curvePts = trip.filter(s => s.isCurveHard   && s.lat != null && s.lon != null)

  const drivePct = (driveSec + stopSec) > 0 ? Math.round(driveSec / (driveSec + stopSec) * 100) : 100
  const stopPct  = 100 - drivePct

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:2000, background:'rgba(0,0,0,.55)',
        display:'flex', alignItems:'center', justifyContent:'center', padding:20, backdropFilter:'blur(2px)' }}>
      <div onClick={e => e.stopPropagation()} style={{ background:'var(--card)', borderRadius:18,
          border:'1px solid var(--border)', width:'100%', maxWidth:540, overflow:'hidden',
          boxShadow:'0 24px 64px rgba(0,0,0,.3)', maxHeight:'90vh', overflowY:'auto' }}>

        {/* Mapa con ruta + marcadores de eventos */}
        <div style={{ height:260, position:'relative' }}>
          {points.length >= 2 ? (
            <MapContainer bounds={getBounds(points)} boundsOptions={{ padding:[24,24] }}
              style={{ height:'100%', width:'100%' }} zoomControl scrollWheelZoom attributionControl={false}>
              <TileLayer url={tileUrl} subdomains={['a','b','c','d']} />
              <Polyline positions={points} color={BLUE} weight={4} lineCap="round" lineJoin="round" />
              {hardPts.map((s, i) => (
                <CircleMarker key={`h${i}`} center={[s.lat, s.lon]}
                  radius={5} fillColor={RED} fillOpacity={0.8} color="transparent" />
              ))}
              {curvePts.map((s, i) => (
                <CircleMarker key={`c${i}`} center={[s.lat, s.lon]}
                  radius={5} fillColor={YELLOW} fillOpacity={0.8} color="transparent" />
              ))}
              <CircleMarker center={points[0]} radius={7} fillColor={GREEN} fillOpacity={1} color="white" weight={2} />
              <CircleMarker center={points[points.length-1]} radius={7} fillColor={BLUE} fillOpacity={1} color="white" weight={2} />
            </MapContainer>
          ) : (
            <div style={{ height:'100%', background:'var(--card-alt)', display:'flex',
                alignItems:'center', justifyContent:'center', flexDirection:'column', gap:8 }}>
              <span style={{ fontSize:28 }}>📍</span>
              <span style={{ fontSize:12, color:'var(--text3)' }}>Sin datos GPS</span>
            </div>
          )}

          {/* Leyenda de eventos en el mapa */}
          {(hardEvts > 0 || curveEvts > 0) && (
            <div style={{ position:'absolute', bottom:8, left:8, zIndex:1000,
                background:'rgba(0,0,0,.65)', borderRadius:6, padding:'5px 10px',
                display:'flex', gap:12, alignItems:'center' }}>
              {hardEvts  > 0 && <span style={{ fontSize:10, color:'white', display:'flex', alignItems:'center', gap:4 }}>
                <span style={{ width:8, height:8, borderRadius:'50%', background:RED, display:'inline-block' }}/>
                Maniobra brusca
              </span>}
              {curveEvts > 0 && <span style={{ fontSize:10, color:'white', display:'flex', alignItems:'center', gap:4 }}>
                <span style={{ width:8, height:8, borderRadius:'50%', background:YELLOW, display:'inline-block' }}/>
                Curva agresiva
              </span>}
            </div>
          )}

          <button onClick={onClose} style={{ position:'absolute', top:10, right:10, zIndex:1000,
              width:30, height:30, borderRadius:'50%', background:'rgba(0,0,0,.55)', border:'none',
              color:'#fff', fontSize:15, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
        </div>

        <div style={{ padding:'18px 20px 24px' }}>
          {/* Encabezado */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
            <div>
              <div style={{ fontSize:15, fontWeight:700, color:'var(--text1)' }}>{dayLabel(start)}</div>
              <div style={{ fontSize:12, color:'var(--text2)', marginTop:2 }}>
                {fmtTime(start)} – {fmtTime(end)} · {fmtKm(km)}
                {isNight && <span style={{ marginLeft:6, fontSize:10, background:'rgba(168,85,247,.12)',
                    color:PURPLE, border:'1px solid rgba(168,85,247,.25)', borderRadius:4, padding:'1px 5px' }}>
                  🌙 Nocturno</span>}
              </div>
            </div>
            <span style={{ fontSize:24 }}>🏍️</span>
          </div>

          {/* Barra de tiempo conduciendo / detenido */}
          <div style={{ background:'var(--bg)', borderRadius:12, padding:'12px 14px', marginBottom:14 }}>
            {hasStopData ? (<>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                <span style={{ fontSize:11, color:'var(--text2)' }}>Conduciendo</span>
                <span style={{ fontSize:11, color:'var(--text2)' }}>Detenido</span>
              </div>
              <div style={{ height:8, borderRadius:4, overflow:'hidden', background:'var(--border)', display:'flex' }}>
                <div style={{ width:`${drivePct}%`, background:BLUE, transition:'width .5s' }} />
                <div style={{ flex:1, background:'var(--border)' }} />
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', marginTop:5 }}>
                <span style={{ fontSize:12, fontWeight:600, color:'var(--text1)' }}>{fmtSec(driveSec)}</span>
                <span style={{ fontSize:12, fontWeight:600, color:'var(--text3)' }}>{stopSec > 0 ? fmtSec(stopSec) : '< 1 min'}</span>
              </div>
            </>) : (
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ fontSize:18 }}>⏱️</span>
                <div>
                  <div style={{ fontSize:12, fontWeight:600, color:'var(--text1)' }}>Duración estimada: {fmtSec(driveSec)}</div>
                  <div style={{ fontSize:10, color:'var(--text3)', marginTop:2 }}>
                    El tiempo detenido estará disponible después de actualizar el firmware
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Grid de métricas */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:14 }}>
            {[
              { icon:'🚦', label:'Vel. promedio', value: avgSpd > 0 ? `${Math.round(avgSpd)} km/h` : '—',
                note: avgSpd === 0 ? 'Disponible post-firmware' : null },
              { icon:'⚡', label:'Vel. máxima', value: maxSpd > 0 ? `${Math.round(maxSpd)} km/h` : '—',
                color: maxSpd > 80 ? RED : 'var(--text1)', note: maxSpd === 0 ? 'Disponible post-firmware' : null },
              { icon:'🛑', label:'Maniobras bruscas', value: hardEvts,  color: hardEvts  > 0 ? RED    : GREEN },
              { icon:'↩️', label:'Curvas agresivas',  value: curveEvts, color: curveEvts > 0 ? YELLOW : GREEN },
            ].map(({ icon, label, value, color, note }) => (
              <div key={label} style={{ background:'var(--bg)', borderRadius:10, padding:'10px 12px' }}>
                <div style={{ fontSize:14, marginBottom:4 }}>{icon}</div>
                <div style={{ fontSize:16, fontWeight:700, color:color||'var(--text1)',
                    fontVariantNumeric:'tabular-nums' }}>{value}</div>
                <div style={{ fontSize:10, color:'var(--text2)', marginTop:2 }}>{label}</div>
                {note && <div style={{ fontSize:9, color:'var(--text3)' }}>{note}</div>}
              </div>
            ))}
          </div>

          {isNight && (
            <div style={{ fontSize:11, color:PURPLE, background:'rgba(168,85,247,.08)',
                border:'1px solid rgba(168,85,247,.2)', borderRadius:8, padding:'6px 10px' }}>
              🌙 Conducción nocturna — estadísticamente el doble de riesgo de accidente
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DayNav({ date, onPrev, onNext }) {
  const today = new Date(); today.setHours(0,0,0,0)
  const diff  = Math.round((today - date) / 86400000)
  const btn   = { width:28, height:28, borderRadius:8, border:'1px solid var(--border)',
                  background:'var(--card)', cursor:'pointer', fontSize:16, color:'var(--text2)',
                  display:'flex', alignItems:'center', justifyContent:'center' }
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
      <button style={btn} onClick={onPrev}>‹</button>
      <span style={{ fontSize:13, fontWeight:600, color:'var(--text1)', minWidth:90, textAlign:'center' }}>
        {dayLabel(date)}
      </span>
      <button style={{ ...btn, opacity:diff===0?.3:1 }} onClick={onNext} disabled={diff===0}>›</button>
    </div>
  )
}

// ─── Componente principal ──────────────────────────────────────────────────────

export default function DrivingPage() {
  const { deviceId } = useStore()

  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(false)
  const [data14,   setData14]   = useState(null)

  const [thisWeek,      setThisWeek]   = useState(true)
  const [selectedDate,  setSelDate]    = useState(() => { const d=new Date(); d.setHours(0,0,0,0); return d })
  const [dayModeActive, setDayMode]    = useState(false)
  const [selectedTrip,  setSelected]   = useState(null)
  const [infoModal,    setInfoModal] = useState(null)

  const tileUrl = useTileUrl()

  useEffect(() => { load() }, [deviceId])

  async function load() {
    if (!deviceId) return
    setLoading(true); setError(false)
    try {
      const res = await getDriveMetrics(deviceId, 14, 80)
      setData14(res.data)
    } catch { setError(true) }
    setLoading(false)
  }

  // ── Sesiones del período ─────────────────────────────────────────────────────

  const allSessions = data14?.sessions ?? []

  const sessions = useMemo(() => {
    const cut = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    return thisWeek
      ? allSessions.filter(s => new Date(s.timestamp) >= cut)
      : allSessions.filter(s => new Date(s.timestamp) < cut)
  }, [allSessions, thisWeek])

  // Sesiones del día seleccionado (usadas también para trayectos del día)
  const daySessions = useMemo(() => {
    const dayEnd = new Date(selectedDate); dayEnd.setHours(23,59,59,999)
    return allSessions.filter(s => { const ts=new Date(s.timestamp); return ts>=selectedDate && ts<=dayEnd })
  }, [allSessions, selectedDate])

  // Entry del dailyBreakdown ya calculado por el backend
  const dayEntry = data14?.dailyBreakdown?.find(d => d.date === selectedDate.toISOString().slice(0,10))

  // Modo activo determina qué sesiones se usan para stats superiores
  const displaySessions = dayModeActive ? daySessions : sessions

  // ── Métricas del display ─────────────────────────────────────────────────────
  // Si hay dayEntry usamos sus valores pre-calculados; si no, calculamos desde sesiones.

  const displayIrc   = dayModeActive && dayEntry ? dayEntry.irc   : (data14?.irc ?? 100)
  const displayLabel = dayModeActive && dayEntry ? dayEntry.ircLabel : ircLabel(data14?.irc ?? 100)
  const pillars      = data14?.pillars ?? { behavior:100, temporal:100, geo:100, consistency:100 }

  const totalDistKm = useMemo(() => {
    if (dayModeActive && dayEntry?.distanceKm != null) return dayEntry.distanceKm
    return displaySessions.reduce((s, x) => s + (x.distanceM || 0), 0) / 1000
  }, [displaySessions, dayModeActive, dayEntry])

  const totalDriveSec = useMemo(() => {
    if (dayModeActive && dayEntry?.drivingSec != null) return dayEntry.drivingSec
    return displaySessions.reduce((s, x) => s + Math.max(0, 30 - (x.stoppedSec || 0)), 0)
  }, [displaySessions, dayModeActive, dayEntry])

  const maxSpeedKmh = useMemo(() => {
    if (dayModeActive && dayEntry?.maxSpeedKmh != null) return dayEntry.maxSpeedKmh
    return displaySessions.reduce((m, s) => Math.max(m, s.maxSpeedKmh ?? s.avgSpeedKmh ?? 0), 0)
  }, [displaySessions, dayModeActive, dayEntry])

  const hardEvents = useMemo(() => {
    if (dayModeActive && dayEntry?.hardEvents != null) return dayEntry.hardEvents
    return displaySessions.filter(s => s.isDrivingHard).length
  }, [displaySessions, dayModeActive, dayEntry])

  const curveEvents = useMemo(() => {
    if (dayModeActive && dayEntry?.curveEvents != null) return dayEntry.curveEvents
    return displaySessions.filter(s => s.isCurveHard).length
  }, [displaySessions, dayModeActive, dayEntry])

  // ── Trayectos ────────────────────────────────────────────────────────────────

  const periodTrips = useMemo(() => groupIntoTrips(sessions), [sessions])
  const dayTrips    = useMemo(() => groupIntoTrips(daySessions), [daySessions])

  const isEmpty = sessions.length === 0

  // ── Barras del gráfico ───────────────────────────────────────────────────────

  const chartBars = useMemo(() => {
    const now    = new Date()
    const offset = thisWeek ? 0 : 7
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      day.setDate(day.getDate() - (6 - i) - offset)
      const key   = day.toISOString().slice(0,10)
      const entry = data14?.dailyBreakdown?.find(d => d.date === key)
      const today0= new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const diff  = Math.round((today0 - day) / 86400000)
      const names = ['Do','Lu','Ma','Mi','Ju','Vi','Sa']
      return {
        date: day, key,
        irc:         entry?.irc ?? -1,
        hasSessions: !!entry && entry.sessionCount > 0,
        label:       diff === 0 ? 'Hoy' : diff === 1 ? 'Ayer' : names[day.getDay()],
        isToday:     diff === 0,
        isSelected:  dayModeActive && day.toDateString() === selectedDate.toDateString(),
      }
    })
  }, [data14, thisWeek, selectedDate, dayModeActive])

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleBarClick = (bar) => {
    if (!bar.hasSessions) return
    setSelDate(bar.date)
    setDayMode(true)
  }

  const handlePrevDay = () => setSelDate(d => { const n=new Date(d); n.setDate(d.getDate()-1); return n })
  const handleNextDay = () => {
    const today = new Date(); today.setHours(0,0,0,0)
    if (selectedDate < today) setSelDate(d => { const n=new Date(d); n.setDate(d.getDate()+1); return n })
  }

  const handleWeekToggle = (isThisWeek) => {
    setThisWeek(isThisWeek)
    setDayMode(false)
    const d = new Date(); d.setHours(0,0,0,0); setSelDate(d)
  }

  // ── Loading / error ───────────────────────────────────────────────────────────

  if (loading) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center',
        justifyContent:'center', height:'60vh', gap:12, color:'var(--text3)' }}>
      <div style={{ width:28, height:28, border:'3px solid var(--border)', borderTopColor:'var(--orange)',
          borderRadius:'50%', animation:'spin .8s linear infinite' }} />
      <span style={{ fontSize:13 }}>Cargando métricas…</span>
      <style>{`@keyframes spin { to { transform:rotate(360deg) } }`}</style>
    </div>
  )

  if (error) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center',
        justifyContent:'center', height:'60vh', gap:12 }}>
      <div style={{ fontSize:48 }}>⚡</div>
      <div style={{ fontSize:16, fontWeight:700, color:'var(--text1)' }}>Sin conexión</div>
      <button onClick={load} style={{ marginTop:8, padding:'10px 24px', borderRadius:10, border:'none',
          cursor:'pointer', background:'var(--orange)', color:'#fff', fontWeight:600, fontSize:13 }}>
        Reintentar
      </button>
    </div>
  )

  const clr = ircColor(displayIrc)

  return (
    <div style={{ padding:24, maxWidth:840, background:'var(--bg)', minHeight:'100vh' }}>
      <style>{`.leaflet-container{z-index:0}`}</style>

      {/* Header */}
      <div style={{ marginBottom:20 }}>
        <h1 style={{ margin:0, fontSize:22, fontWeight:700, color:'var(--text1)' }}>Conducción</h1>
        <p style={{ margin:'4px 0 0', fontSize:13, color:'var(--text2)' }}>
          {dayModeActive
            ? `Métricas del ${dayLabel(selectedDate).toLowerCase()}`
            : 'Métricas y análisis de tus trayectos'}
        </p>
      </div>

      {/* Toggles de período */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20, flexWrap:'wrap' }}>
        <div style={{ display:'inline-flex', background:'var(--card)', border:'1px solid var(--border)',
            borderRadius:12, padding:4, gap:4 }}>
          {['Esta semana','Semana pasada'].map((lbl, i) => {
            const active = i === 0 ? thisWeek : !thisWeek
            return (
              <button key={lbl} onClick={() => handleWeekToggle(i===0)}
                style={{ padding:'7px 16px', borderRadius:8, border:'none', cursor:'pointer',
                    fontWeight:active?600:400, fontSize:13,
                    background:active?'var(--orange)':'transparent',
                    color:active?'#fff':'var(--text3)', transition:'all .15s' }}>{lbl}</button>
            )
          })}
        </div>
        {dayModeActive && (
          <button onClick={() => setDayMode(false)}
            style={{ padding:'7px 14px', borderRadius:8, border:'1px solid var(--border)',
                background:'var(--card)', cursor:'pointer', fontSize:12, color:'var(--text2)',
                display:'flex', alignItems:'center', gap:5 }}>
            ← Período completo
          </button>
        )}
      </div>

      {isEmpty ? (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center',
            gap:12, padding:'48px 0', textAlign:'center' }}>
          <div style={{ fontSize:64 }}>🏍️</div>
          <div style={{ fontSize:17, fontWeight:700, color:'var(--text1)' }}>
            {thisWeek ? 'Tu Argus aún no ha salido a rodar' : 'Sin datos esta semana'}
          </div>
          <div style={{ fontSize:13, color:'var(--text3)', maxWidth:360, lineHeight:1.6 }}>
            Las estadísticas aparecerán aquí en cuanto el dispositivo registre su primer trayecto.
          </div>
        </div>
      ) : (<>

        {/* ── IRC + Pilares ── */}
        <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:14,
            padding:'20px 24px', marginBottom:16 }}>
          <div style={{ display:'flex', gap:20, alignItems:'flex-start', flexWrap:'wrap' }}>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, flexShrink:0 }}>
              <IRCRing irc={displayIrc} size={110} />
              <div style={{ fontSize:12, fontWeight:600, color:'var(--text2)' }}>
                {dayModeActive ? dayLabel(selectedDate) : (thisWeek ? 'Esta semana' : 'Semana pasada')}
              </div>
              <div style={{ padding:'4px 12px', borderRadius:20, fontSize:12, fontWeight:600, color:clr,
                  background:`rgba(0,0,0,.04)`, border:`1px solid ${clr}40` }}>
                {displayLabel}
              </div>
            </div>

            <div style={{ flex:1, minWidth:200 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                <div style={{ fontSize:12, fontWeight:600, color:'var(--text2)' }}>Desglose por pilar</div>
                {dayModeActive && (
                  <div style={{ fontSize:9, color:'var(--text3)', background:'var(--bg)',
                      border:'1px solid var(--border)', borderRadius:4, padding:'2px 6px' }}>
                    Pilares = período completo
                  </div>
                )}
              </div>
              {[
                { key:'behavior',    label:'Comportamiento',    value: pillars.behavior },
                { key:'temporal',    label:'Contexto temporal', value: pillars.temporal },
                { key:'geo',         label:'Zona geográfica',   value: pillars.geo },
                { key:'consistency', label:'Consistencia',      value: pillars.consistency },
              ].map(({ key, label, value }) => (
                <PillarBar key={key} label={label} value={value}
                  color={ircColor(value)}
                  onInfo={() => setInfoModal(PILLAR_INFO[key])} />
              ))}
            </div>
          </div>
        </div>

        {/* ── Recomendaciones ── */}
        {!dayModeActive && (data14?.recommendations ?? []).length > 0 && (
          <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>
            {data14.recommendations.map((r, i) => (
              <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:10, background:'var(--card)',
                  border:'1px solid var(--border)', borderRadius:12, padding:'12px 14px' }}>
                <span style={{ fontSize:18, flexShrink:0 }}>{r.icon}</span>
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:'var(--text1)' }}>{r.title}</div>
                  <div style={{ fontSize:12, color:'var(--text2)', marginTop:2, lineHeight:1.5 }}>{r.text}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Stats rápidas ── */}
        <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>
          <StatChip icon="🛣️" label="Distancia"  value={fmtKm(totalDistKm)} color="var(--blue)"
            onInfo={() => setInfoModal(INFO.distance)} />
          <StatChip icon="⏱️" label="Conduciendo" value={fmtSec(totalDriveSec)} color="var(--blue)"
            onInfo={() => setInfoModal(INFO.driving)} />
          <StatChip icon="⚡" label="Vel. máxima"
            value={maxSpeedKmh > 0 ? `${Math.round(maxSpeedKmh)} km/h` : '—'}
            color={maxSpeedKmh > 80 ? 'var(--armed)' : 'var(--text1)'}
            sub={maxSpeedKmh === 0 ? 'Post-firmware' : undefined}
            onInfo={() => setInfoModal(INFO.maxSpeed)} />
          <StatChip icon="🛑" label="Maniobras"
            value={hardEvents} color={hardEvents > 3 ? 'var(--armed)' : 'var(--text1)'}
            onInfo={() => setInfoModal(INFO.maneuvers)} />
          <StatChip icon="↩️" label="Curvas agresivas"
            value={curveEvents} color={curveEvents > 3 ? '#F59E0B' : 'var(--text1)'}
            onInfo={() => setInfoModal(INFO.curves)} />
          <StatChip icon="🗺️" label="Trayectos"
            value={dayModeActive ? dayTrips.length : periodTrips.length} color="var(--text1)"
            onInfo={() => setInfoModal(INFO.trips)} />
        </div>

        {/* ── Gráfico IRC (barras clicables) ── */}
        <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:14,
            padding:'20px 16px', marginBottom:16 }}>
          <CardHeader title="IRC POR DÍA — CLIC PARA VER EL DÍA" onInfo={() => setInfoModal(INFO.ircChart)} />
          <div style={{ display:'flex', alignItems:'flex-end', gap:6, height:90 }}>
            {chartBars.map((bar, i) => {
              const ratio  = bar.irc >= 0 ? bar.irc / 100 : 0
              const barClr = bar.hasSessions ? ircColor(bar.irc) : 'var(--border)'
              return (
                <div key={i} onClick={() => handleBarClick(bar)}
                  style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4,
                      cursor: bar.hasSessions ? 'pointer' : 'default', borderRadius:6,
                      outline: bar.isSelected ? `2px solid ${barClr}` : 'none' }}>
                  {bar.irc >= 0 && (
                    <div style={{ fontSize:9, color:'var(--text3)', fontWeight:600 }}>{bar.irc}</div>
                  )}
                  <div style={{ width:'100%', height:Math.max(bar.hasSessions?4:0, ratio*70),
                      borderRadius:'4px 4px 0 0',
                      background: bar.hasSessions
                        ? (bar.isToday || bar.isSelected) ? barClr : `${barClr}70`
                        : 'transparent',
                      transition:'height .4s ease',
                      boxShadow: bar.isSelected ? `0 0 8px ${barClr}50` : 'none' }} />
                  <div style={{ fontSize:10, fontWeight: (bar.isToday || bar.isSelected) ? 700 : 400,
                      color: bar.isSelected ? barClr : bar.isToday ? 'var(--orange)' : 'var(--text3)' }}>
                    {bar.label}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Uso & Impacto (solo período) ── */}
        {!dayModeActive && (<>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
            <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:14, padding:'14px 16px' }}>
              <CardHeader title="Uso de la moto" onInfo={() => setInfoModal(INFO.usage)} />
              {[
                { label:'Trayectos',     value: data14?.usage?.tripCount ?? periodTrips.length },
                { label:'Más largo',     value: fmtKm(data14?.usage?.longestTripKm) },
                { label:'Más corto',     value: fmtKm(data14?.usage?.shortestTripKm) },
                { label:'Hora pico',     value: data14?.usage?.busiestHour != null ? `${data14.usage.busiestHour}:00` : '—' },
                { label:'Día más activo',value: data14?.usage?.busiestDay ?? '—' },
              ].map(({ label, value }) => (
                <div key={label} style={{ display:'flex', justifyContent:'space-between',
                    borderBottom:'1px solid var(--border)', padding:'7px 0', fontSize:12 }}>
                  <span style={{ color:'var(--text2)' }}>{label}</span>
                  <span style={{ fontWeight:600, color:'var(--text1)', fontVariantNumeric:'tabular-nums' }}>{value}</span>
                </div>
              ))}
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:14, padding:'14px 16px', flex:1 }}>
                <CardHeader title="🌱 Impacto ambiental" onInfo={() => setInfoModal(INFO.impact)} />
                {[{ label:'CO₂ emitido', value:`${data14?.impact?.co2Kg ?? 0} kg` },
                  { label:'Combustible', value:`${data14?.impact?.fuelLiters ?? 0} L` }]
                  .map(({ label, value }) => (
                  <div key={label} style={{ display:'flex', justifyContent:'space-between', marginBottom:6, fontSize:12 }}>
                    <span style={{ color:'var(--text2)' }}>{label}</span>
                    <span style={{ fontWeight:700, color:'var(--text1)' }}>{value}</span>
                  </div>
                ))}
              </div>
              <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:14, padding:'14px 16px', flex:1 }}>
                <CardHeader title="📈 Tendencia" onInfo={() => setInfoModal(INFO.trend)} />
                {(() => {
                  const dbs  = data14?.dailyBreakdown ?? []
                  if (dbs.length < 2) return <div style={{ fontSize:12, color:'var(--text3)' }}>Datos insuficientes</div>
                  const half   = Math.floor(dbs.length / 2)
                  const recent = dbs.slice(half).reduce((s,d)=>s+d.irc,0)/(dbs.length-half)||0
                  const prev   = dbs.slice(0,half).reduce((s,d)=>s+d.irc,0)/half||0
                  const diff   = Math.round(recent-prev)
                  const up     = diff >= 0
                  return (
                    <div style={{ fontSize:13, fontWeight:700, color:up?GREEN:RED }}>
                      {up?'↑':'↓'} {Math.abs(diff)} pts vs semana anterior
                    </div>
                  )
                })()}
              </div>
            </div>
          </div>
          {data14?.usage?.hourDistribution && (
            <div style={{ marginBottom:16 }}>
              <HourChart hourDistribution={data14.usage.hourDistribution} onInfo={() => setInfoModal(INFO.hourChart)} />
            </div>
          )}
        </>)}

        {/* ── Trayectos del día seleccionado ── */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
          <div>
            <SectionLabel>TRAYECTOS</SectionLabel>
            {dayEntry && dayEntry.sessionCount > 0 && (
              <div style={{ fontSize:11, color:ircColor(dayEntry.irc), fontWeight:600, marginTop:-6, marginBottom:6 }}>
                IRC del día: {dayEntry.irc} · {dayEntry.ircLabel}
              </div>
            )}
          </div>
          <DayNav date={selectedDate} onPrev={handlePrevDay} onNext={handleNextDay} />
        </div>

        {dayTrips.length === 0
          ? <div style={{ textAlign:'center', padding:'32px 0', color:'var(--text3)', fontSize:13 }}>
              Sin trayectos {dayLabel(selectedDate).toLowerCase()}
            </div>
          : dayTrips.map((t, i) => <TripCard key={i} trip={t} onSelect={setSelected} tileUrl={tileUrl} />)
        }

      </>)}

      {selectedTrip && <TripModal trip={selectedTrip} onClose={() => setSelected(null)} tileUrl={tileUrl} />}
      {infoModal   && <PillarInfoModal info={infoModal} onClose={() => setInfoModal(null)} />}
    </div>
  )
}


/* ═══════════════════════════════════════════════════════════════════
   RESUMEN — DrivingPage.jsx v4
   ═══════════════════════════════════════════════════════════════════

   ESTADO: Implementado y listo para deploy.

   FLUJO PRINCIPAL:
     1. Carga 14 días de datos con getDriveMetrics(deviceId, 14, 80).
     2. Período activo = Esta semana / Semana pasada (toggle).
     3. Clic en barra del gráfico → dayModeActive=true + selectedDate → IRC ring
        y stats muestran datos del día usando dailyBreakdown pre-calculado.
     4. DayNav (‹ ›) navega por día; botón "← Período completo" regresa al período.
     5. Lista de trayectos siempre muestra el día seleccionado.
     6. Cada trayecto abre TripModal con mapa CartoDB (tema-aware) + marcadores
        rojos (maniobras) y amarillos (curvas).
     7. Botón ⓘ en cada pilar abre PillarInfoModal con descripción + tips.

   DEPENDENCIAS CLAVE:
     - dailyBreakdown.irc / hardEvents / curveEvents / distanceKm / drivingSec
       ya calculados en driveController.js — no requiere llamadas adicionales.
     - isDrivingHard / isCurveHard / isNight en cada sesión — calculados por backend.

   DEUDA TÉCNICA:
     - Pilares per-day: el backend no los incluye en dailyBreakdown todavía.
       Por ahora se muestra badge "Pilares = período completo" en modo día.
     - Animated trip replay (Waze-style): pendiente.
     - Geocoding de inicio/fin: pendiente (Nominatim proxy).
   ═══════════════════════════════════════════════════════════════════ */
