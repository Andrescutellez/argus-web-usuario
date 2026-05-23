// PremiumPage — equivalente al GoldScreen de Flutter.
// Muestra la comparativa de planes y botones de upgrade.

const FEATURES = [
  { icon: '⏱️', name: 'Heartbeat',         free: '1 hora',       premium: '30 segundos' },
  { icon: '📡', name: 'Datos LTE',          free: '3 encendidos/día', premium: 'Continuo' },
  { icon: '🗺️', name: 'Tracking en vivo',  free: '—',            premium: '✓' },
  { icon: '🛰️', name: 'Red colaborativa',  free: '—',            premium: '✓' },
  { icon: '🔔', name: 'Alertas avanzadas', free: 'Básicas',      premium: 'Todas' },
  { icon: '🛡️', name: 'Anti-jammer',       free: '—',            premium: '✓' },
  { icon: '✂️', name: 'Corte remoto',      free: '—',            premium: '✓' },
  { icon: '📊', name: 'Métricas avanzadas',free: 'Semana',       premium: 'Todo el historial' },
]

function PlanCard({ title, price, period, features, isPremium, isCurrent, onSelect }) {
  return (
    <div style={{
      flex: 1,
      background: isPremium ? 'linear-gradient(145deg, #1a1f2e, #161B22)' : 'var(--card)',
      border: isPremium
        ? '2px solid rgba(47,129,247,0.5)'
        : isCurrent ? '2px solid var(--border)' : '1px solid var(--border)',
      borderRadius: 18,
      padding: 24,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {isPremium && (
        <div style={{
          position: 'absolute', top: 14, right: 14,
          padding: '3px 10px',
          background: 'var(--blue)',
          borderRadius: 20,
          fontSize: 11, fontWeight: 700, color: '#fff',
        }}>RECOMENDADO</div>
      )}

      <div style={{ fontSize: 28, marginBottom: 8 }}>{isPremium ? '⭐' : '🔓'}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text1)', marginBottom: 4 }}>{title}</div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 20 }}>
        <span style={{ fontSize: 34, fontWeight: 800, color: isPremium ? 'var(--blue)' : 'var(--text1)' }}>
          {price}
        </span>
        <span style={{ fontSize: 13, color: 'var(--text2)' }}>/{period}</span>
      </div>

      <button
        onClick={onSelect}
        disabled={isCurrent}
        style={{
          width: '100%',
          padding: '12px 0',
          borderRadius: 10,
          border: isCurrent ? '1px solid var(--border)' : 'none',
          background: isCurrent
            ? 'transparent'
            : isPremium ? 'var(--blue)' : 'var(--card-alt)',
          color: isCurrent ? 'var(--text3)' : '#fff',
          fontSize: 14, fontWeight: 700,
          cursor: isCurrent ? 'not-allowed' : 'pointer',
          marginBottom: 20,
        }}
      >
        {isCurrent ? 'Plan actual' : isPremium ? 'Activar Premium' : 'Seleccionar'}
      </button>

      {features.map((f, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 0',
          borderBottom: i < features.length - 1 ? '1px solid var(--border-sub)' : 'none',
          fontSize: 13,
          color: f.enabled ? 'var(--text1)' : 'var(--text3)',
        }}>
          <span style={{ fontSize: 16 }}>{f.enabled ? '✓' : '—'}</span>
          {f.text}
        </div>
      ))}
    </div>
  )
}

export default function PremiumPage() {
  const freeFeatures = [
    { enabled: true,  text: 'Alarma local BLE' },
    { enabled: true,  text: 'Alertas básicas' },
    { enabled: true,  text: 'Heartbeat 1 hora' },
    { enabled: false, text: 'Tracking en vivo' },
    { enabled: false, text: 'Red colaborativa Argus' },
    { enabled: false, text: 'Anti-jammer' },
  ]
  const premiumFeatures = [
    { enabled: true, text: 'Todo lo de Freemium' },
    { enabled: true, text: 'Heartbeat 30 segundos' },
    { enabled: true, text: 'Tracking en vivo continuo' },
    { enabled: true, text: 'Red colaborativa Argus' },
    { enabled: true, text: 'Anti-jammer detection' },
    { enabled: true, text: 'Historial completo' },
  ]

  return (
    <div style={{ padding: 24, maxWidth: 880, background: 'var(--bg)', minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ marginBottom: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⭐</div>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--text1)' }}>
          Argus Premium
        </h1>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--text2)', lineHeight: 1.6 }}>
          Protección completa con GPS continuo, red colaborativa y anti-jammer.
        </p>
      </div>

      {/* Tarjetas de planes */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 36, flexWrap: 'wrap' }}>
        <PlanCard
          title="Freemium"
          price="$0"
          period="mes"
          features={freeFeatures}
          isPremium={false}
          isCurrent={true}
          onSelect={() => {}}
        />
        <PlanCard
          title="Premium Mensual"
          price="$9.99"
          period="mes"
          features={premiumFeatures}
          isPremium={true}
          isCurrent={false}
          onSelect={() => alert('Próximamente: pasarela de pago Stripe')}
        />
        <PlanCard
          title="Premium Anual"
          price="$79.99"
          period="año"
          features={[...premiumFeatures, { enabled: true, text: '2 meses gratis' }]}
          isPremium={false}
          isCurrent={false}
          onSelect={() => alert('Próximamente: pasarela de pago Stripe')}
        />
      </div>

      {/* Tabla comparativa */}
      <div style={{ marginBottom: 12 }}>
        <div style={{
          fontSize: 11, fontWeight: 600, letterSpacing: '1.2px',
          color: 'var(--text3)', marginBottom: 12,
        }}>COMPARATIVA DE CARACTERÍSTICAS</div>
      </div>
      <div style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        overflow: 'hidden',
      }}>
        {/* Cabecera */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
          padding: '12px 16px',
          background: 'var(--card-alt)',
          borderBottom: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)' }}>Característica</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', textAlign: 'center' }}>Freemium</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--blue)', textAlign: 'center' }}>Premium ⭐</span>
        </div>
        {FEATURES.map((f, i) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
            padding: '12px 16px',
            borderBottom: i < FEATURES.length - 1 ? '1px solid var(--border-sub)' : 'none',
            alignItems: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>{f.icon}</span>
              <span style={{ fontSize: 13, color: 'var(--text1)' }}>{f.name}</span>
            </div>
            <span style={{
              textAlign: 'center', fontSize: 13,
              color: f.free === '—' ? 'var(--text3)' : 'var(--text2)',
            }}>{f.free}</span>
            <span style={{
              textAlign: 'center', fontSize: 13, fontWeight: 600,
              color: f.premium === '✓' ? 'var(--green)' : 'var(--blue)',
            }}>{f.premium}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
