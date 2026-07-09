// PremiumPage — rediseñada con la estética del GoldScreen de Flutter.
// Header con gradiente oscuro fijo + glassmorphism + feature list con icon boxes + CTA con glow.

import { useState } from 'react'

// ── Datos ──────────────────────────────────────────────────────────────────────

const FEATURES = [
  { icon: '📍', title: 'Historial GPS 90 días',    desc: 'Revive cualquier ruta del último trimestre desde el mapa.',          premium: false },
  { icon: '🔔', title: 'Alertas en tiempo real',   desc: 'Notificaciones instantáneas de movimiento y zona de riesgo.',        premium: false },
  { icon: '⏱️', title: 'Heartbeat 30 segundos',   desc: 'Actualización de ubicación cada 30 seg en lugar de cada hora.',      premium: true  },
  { icon: '📊', title: 'Analítica avanzada',        desc: 'Score detallado, agresividad, curvas y trayectos con mapa real.',   premium: true  },
  { icon: '✂️', title: 'Corte remoto de motor',   desc: 'Bloquea el motor desde la app en segundos si detectas robo.',        premium: true  },
  { icon: '🛡️', title: 'Anti-jammer detection',   desc: 'Detecta intentos de bloqueo de señal GPS/LTE por ladrones.',        premium: true  },
  { icon: '🛰️', title: 'Red colaborativa Argus',  desc: 'Miles de usuarios que detectan y reportan motos robadas en tu zona.',premium: true  },
  { icon: '📋', title: 'Reportes para seguros',     desc: 'Exporta tu historial de conducción certificado para aseguradoras.', premium: true  },
]

// ── Componentes ────────────────────────────────────────────────────────────────

function FeatureRow({ feature, isPremium }) {
  const locked = feature.premium && !isPremium
  const iconBg = feature.premium
    ? 'rgba(240,160,48,0.12)'
    : 'rgba(59,139,245,0.12)'
  const iconBorder = feature.premium
    ? '1px solid rgba(240,160,48,0.30)'
    : '1px solid rgba(59,139,245,0.30)'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '13px 16px',
      opacity: locked ? 0.55 : 1,
    }}>
      {/* Icon box 42×42 */}
      <div style={{
        width: 42, height: 42, flexShrink: 0,
        background: iconBg,
        border: iconBorder,
        borderRadius: 12,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20,
      }}>
        {feature.icon}
      </div>

      {/* Texto */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text1)' }}>
            {feature.title}
          </span>
          {feature.premium && (
            <span style={{
              fontSize: 10, fontWeight: 700, color: 'var(--orange)',
              background: 'rgba(240,160,48,0.15)',
              padding: '2px 6px', borderRadius: 6,
            }}>
              GOLD
            </span>
          )}
        </div>
        <span style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>
          {feature.desc}
        </span>
      </div>

      {/* Chevron */}
      <span style={{ fontSize: 14, color: 'var(--text3)', flexShrink: 0 }}>›</span>
    </div>
  )
}

function PlanOption({ price, label, popular, selected, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: 16, borderRadius: 14, cursor: 'pointer',
        background: selected
          ? 'rgba(59,139,245,0.10)'
          : popular ? 'rgba(59,139,245,0.06)' : 'var(--card-alt)',
        border: selected
          ? '1.5px solid var(--blue)'
          : popular ? '1.5px solid rgba(59,139,245,0.35)' : '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}
    >
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text1)', marginBottom: 4 }}>
          {label}
        </div>
        {popular && (
          <span style={{
            fontSize: 10, fontWeight: 700, color: '#fff',
            background: 'var(--blue)',
            padding: '2px 8px', borderRadius: 8,
          }}>
            MÁS POPULAR
          </span>
        )}
      </div>
      <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--blue)' }}>
        {price}
      </span>
    </div>
  )
}

// ── Pantalla principal ─────────────────────────────────────────────────────────

export default function PremiumPage() {
  const isPremium = false   // placeholder — cuando haya auth real, viene del contexto
  const [showModal, setShowModal] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState('anual')

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>

      {/* ── Header oscuro fijo ─────────────────────────────────────────────── */}
      <div style={{
        background: '#0D1117',
        borderBottom: '1px solid #21262D',
        padding: '48px 24px 28px',
      }}>
        {/* Ícono + título */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <div style={{
            width: 46, height: 46, borderRadius: '50%', flexShrink: 0,
            background: 'rgba(255,255,255,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22,
          }}>
            ⭐
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>Argus Gold</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>
              Protección máxima
            </div>
          </div>
        </div>

        {/* Glassmorphism — plan actual */}
        <div style={{
          background: 'rgba(255,255,255,0.10)',
          border: '1px solid rgba(255,255,255,0.18)',
          borderRadius: 20, padding: '16px 18px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginBottom: 4 }}>
              Tu plan actual
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 2 }}>
              {isPremium ? 'Gold' : 'Freemium'}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
              {isPremium ? 'Renovación automática activa' : 'Funciones básicas activas'}
            </div>
          </div>
          {!isPremium && (
            <button
              onClick={() => setShowModal(true)}
              style={{
                background: '#fff', color: '#1A65D0',
                border: 'none', borderRadius: 14,
                padding: '10px 18px',
                fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
              }}
            >
              Mejorar →
            </button>
          )}
        </div>
      </div>

      {/* ── Contenido ─────────────────────────────────────────────────────── */}
      <div style={{ padding: '20px 16px 120px', maxWidth: 680, margin: '0 auto' }}>

        {/* Título sección */}
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text1)', marginBottom: 12 }}>
          {isPremium ? 'Incluido en tu membresía Gold' : '¿Qué incluye Gold?'}
        </div>

        {/* Lista de features */}
        <div style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 14, overflow: 'hidden',
          marginBottom: 24,
        }}>
          {FEATURES.map((f, i) => (
            <div key={i} style={{
              borderBottom: i < FEATURES.length - 1 ? '1px solid var(--border-sub)' : 'none',
            }}>
              <FeatureRow feature={f} isPremium={isPremium} />
            </div>
          ))}
        </div>

        {/* CTA — solo si no es premium */}
        {!isPremium && (
          <div>
            <button
              onClick={() => setShowModal(true)}
              style={{
                width: '100%',
                padding: '16px 0',
                background: 'linear-gradient(90deg, #2F81F7, #1A65D0)',
                boxShadow: '0 8px 24px rgba(47,129,247,0.35)',
                border: 'none', borderRadius: 20,
                color: '#fff', fontSize: 16, fontWeight: 800,
                cursor: 'pointer', marginBottom: 10,
              }}
            >
              Desbloquear análisis avanzado →
            </button>
            <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text2)' }}>
              Desde $9.99/mes · Cancela cuando quieras
            </div>
          </div>
        )}
      </div>

      {/* ── Modal de upgrade ──────────────────────────────────────────────── */}
      {showModal && (
        <div
          onClick={() => setShowModal(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.70)',
            zIndex: 100, display: 'flex', alignItems: 'flex-end',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 520, margin: '0 auto',
              background: 'var(--card)',
              borderRadius: '24px 24px 0 0',
              border: '1px solid var(--border)',
              borderBottom: 'none',
              padding: '24px 20px 40px',
            }}
          >
            {/* Handle + close */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 20,
            }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--text1)' }}>
                Argus Gold
              </span>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  background: 'none', border: 'none',
                  fontSize: 20, color: 'var(--text2)', cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            {/* Opciones de plan */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 8 }}>
              <PlanOption
                price="$9.99"
                label="Mensual"
                popular={false}
                selected={selectedPlan === 'mensual'}
                onClick={() => setSelectedPlan('mensual')}
              />
              <PlanOption
                price="$79.99"
                label="Anual (ahorra 33%)"
                popular={true}
                selected={selectedPlan === 'anual'}
                onClick={() => setSelectedPlan('anual')}
              />
            </div>

            {/* CTA modal */}
            <button
              style={{
                width: '100%', padding: '16px 0', marginTop: 8,
                background: 'var(--blue)',
                border: 'none', borderRadius: 18,
                color: '#fff', fontSize: 16, fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Comenzar prueba gratis 14 días
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
