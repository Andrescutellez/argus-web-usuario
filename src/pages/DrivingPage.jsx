// Métricas de conducción — equivalente al DrivingScreen de la app Flutter.
// Datos mock mientras el backend no expone endpoints de telemetría.

const weekDays = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const weekKm   = [12, 34, 8, 45, 22, 67, 31]
const maxKm    = Math.max(...weekKm)

const trips = [
  { date: '23 may', origin: 'Casa', dest: 'Trabajo', km: 12.4, time: '18 min', score: 92 },
  { date: '22 may', origin: 'Centro',dest: 'Casa',   km: 8.1,  time: '14 min', score: 85 },
  { date: '21 may', origin: 'Casa', dest: 'Gym',     km: 5.3,  time: '10 min', score: 97 },
  { date: '20 may', origin: 'Gym',  dest: 'Casa',    km: 5.6,  time: '12 min', score: 78 },
]

function ScoreRing({ score }) {
  const r = 52, c = 2 * Math.PI * r
  const pct = score / 100
  const dash = c * pct
  const color = score >= 90 ? 'var(--green)' : score >= 70 ? 'var(--orange)' : 'var(--armed)'
  return (
    <svg width={130} height={130} viewBox="0 0 130 130" style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={65} cy={65} r={r} fill="none" stroke="var(--border)" strokeWidth={10} />
      <circle
        cx={65} cy={65} r={r} fill="none"
        stroke={color} strokeWidth={10}
        strokeDasharray={`${dash} ${c}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.6s ease' }}
      />
      {/* Score text — compensamos la rotación con transform inverso */}
      <text
        x={65} y={65}
        textAnchor="middle" dominantBaseline="central"
        style={{
          transform: 'rotate(90deg)',
          transformOrigin: '65px 65px',
          fill: color,
          fontSize: 28,
          fontWeight: 700,
          fontFamily: 'system-ui',
        }}
      >{score}</text>
      <text
        x={65} y={82}
        textAnchor="middle"
        style={{
          transform: 'rotate(90deg)',
          transformOrigin: '65px 65px',
          fill: 'var(--text3)',
          fontSize: 11,
          fontFamily: 'system-ui',
        }}
      >SCORE</text>
    </svg>
  )
}

function MetricCard({ icon, label, value, sub, color }) {
  return (
    <div style={{
      flex: 1,
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 14,
      padding: '16px 14px',
      minWidth: 0,
    }}>
      <div style={{ fontSize: 22, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || 'var(--text1)', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 600, letterSpacing: '1.2px',
      color: 'var(--text3)', marginBottom: 10,
    }}>{children}</div>
  )
}

export default function DrivingPage() {
  const score = 87

  return (
    <div style={{ padding: 24, maxWidth: 780, background: 'var(--bg)', minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text1)' }}>Conducción</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text2)' }}>
          Métricas y análisis de tus trayectos
        </p>
      </div>

      {/* Score + métricas semana */}
      <div style={{
        display: 'flex', gap: 20, marginBottom: 24,
        alignItems: 'stretch',
        flexWrap: 'wrap',
      }}>
        {/* Ring de score */}
        <div style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: '20px 24px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <ScoreRing score={score} />
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginTop: 8 }}>
            Esta semana
          </div>
          <div style={{
            marginTop: 8,
            padding: '4px 12px',
            borderRadius: 20,
            background: 'var(--green-10)',
            border: '1px solid rgba(63,185,80,0.3)',
            fontSize: 12, fontWeight: 600,
            color: 'var(--green)',
          }}>Excelente</div>
        </div>

        {/* Métricas */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 220 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <MetricCard icon="🛣️" label="Esta semana" value="219 km" sub="+12% vs anterior" color="var(--blue)" />
            <MetricCard icon="⏱️" label="Tiempo total" value="4h 22m" sub="7 trayectos" />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <MetricCard icon="⚡" label="Vel. máxima" value="78 km/h" />
            <MetricCard icon="🌱" label="Eco score" value="91" color="var(--green)" />
          </div>
        </div>
      </div>

      {/* Gráfico de km por día */}
      <SectionLabel>KM POR DÍA — ESTA SEMANA</SectionLabel>
      <div style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: '20px 16px',
        marginBottom: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 100 }}>
          {weekDays.map((day, i) => {
            const pct = weekKm[i] / maxKm
            const isToday = i === 6
            return (
              <div key={day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{ fontSize: 9, color: 'var(--text3)', fontWeight: 600 }}>{weekKm[i]}</div>
                <div style={{
                  width: '100%',
                  height: Math.max(6, pct * 70),
                  borderRadius: '4px 4px 0 0',
                  background: isToday ? 'var(--blue)' : 'var(--border)',
                  transition: 'height 0.4s ease',
                }} />
                <div style={{
                  fontSize: 11, fontWeight: isToday ? 700 : 400,
                  color: isToday ? 'var(--blue)' : 'var(--text3)',
                }}>{day}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Últimos trayectos */}
      <SectionLabel>ÚLTIMOS TRAYECTOS</SectionLabel>
      <div style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        overflow: 'hidden',
      }}>
        {trips.map((trip, i) => {
          const scoreColor = trip.score >= 90 ? 'var(--green)' : trip.score >= 70 ? 'var(--orange)' : 'var(--armed)'
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center',
              padding: '14px 16px',
              borderBottom: i < trips.length - 1 ? '1px solid var(--border-sub)' : 'none',
              gap: 14,
            }}>
              <div style={{ fontSize: 22 }}>🏍️</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text1)' }}>
                  {trip.origin} → {trip.dest}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                  {trip.km} km · {trip.time} · {trip.date}
                </div>
              </div>
              <div style={{
                padding: '4px 10px',
                borderRadius: 20,
                background: `color-mix(in srgb, ${scoreColor} 15%, transparent)`,
                fontSize: 12, fontWeight: 700,
                color: scoreColor,
              }}>{trip.score}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
