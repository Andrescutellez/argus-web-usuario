/**
 * @fileoverview Página de Garage — administración integral del vehículo.
 *
 * PROPÓSITO:
 *   6 pestañas en una sola página: Salud, Documentos, Mantenimiento,
 *   Combustible, Gastos y Agenda. Carga todos los datos en paralelo al montar.
 *   Los formularios de alta/edición se muestran como modales overlay.
 *
 * ARQUITECTURA:
 *   - Estado centralizado en GaragePage (score, docs, maint, fuel, expenses, agenda)
 *   - loadAll() usa Promise.allSettled para cargar los 7 endpoints en paralelo
 *   - Modal genérico: { type: 'doc'|'maint'|'fuel'|'expense'|'odometer', data: {...} }
 *   - Funciones de formato (fmtDate, fmtCOP, numFmt) puras sin dependencias
 *
 * @module pages/GaragePage
 */

import { useState, useEffect, useCallback } from 'react'
import { useStore } from '../store/useStore'
import {
  getGarageScore,
  getGarageDocuments,    upsertGarageDocument,
  getGarageMaintenance,  upsertGarageMaintenance,
  getGarageFuel,         addGarageFuel,    deleteGarageFuel,
  getGarageExpenses,     addGarageExpense, deleteGarageExpense,
  getGarageAgenda,       updateGarageOdometer,
  getMotos,
} from '../api/apiService'

// ── Catálogos ──────────────────────────────────────────────────────────────────

const DOC_CATALOG = {
  SOAT:           { label: 'SOAT',                  emoji: '🛡️', hasExpiry: true,  hasProp: false },
  TECNO:          { label: 'Tecnomecánica',          emoji: '🔬', hasExpiry: true,  hasProp: false },
  LIC_CONDUCCION: { label: 'Licencia de conducción', emoji: '🪪', hasExpiry: true,  hasProp: false },
  LIC_TRANSITO:   { label: 'Tarjeta de propiedad',   emoji: '📄', hasExpiry: false, hasProp: true  },
  GARANTIA:       { label: 'Garantía',               emoji: '✅', hasExpiry: true,  hasProp: false },
}

const MAINT_CATALOG = [
  { type: 'OIL',           label: 'Aceite',             emoji: '🛢️' },
  { type: 'AIR_FILTER',    label: 'Filtro de aire',     emoji: '💨' },
  { type: 'SPARK_PLUG',    label: 'Bujía',              emoji: '⚡' },
  { type: 'BRAKE_FLUID',   label: 'Líquido de frenos',  emoji: '💧' },
  { type: 'COOLANT',       label: 'Refrigerante',       emoji: '🌡️' },
  { type: 'CHAIN_LUBE',    label: 'Lubricar cadena',    emoji: '🔗' },
  { type: 'CHAIN_TENSION', label: 'Tensar cadena',      emoji: '⚙️' },
  { type: 'BRAKE_PADS',    label: 'Pastillas de freno', emoji: '🔵' },
  { type: 'TIRES',         label: 'Llantas',            emoji: '⭕' },
  { type: 'BATTERY',       label: 'Batería',            emoji: '🔋' },
]

const EXPENSE_CATALOG = [
  { key: 'GASOLINA',      label: 'Gasolina',       emoji: '⛽' },
  { key: 'ACEITE',        label: 'Aceite',          emoji: '🛢️' },
  { key: 'LAVADA',        label: 'Lavada',          emoji: '🚿' },
  { key: 'SOAT',          label: 'SOAT',            emoji: '🛡️' },
  { key: 'TECNO',         label: 'Tecnomecánica',   emoji: '🔬' },
  { key: 'MULTA',         label: 'Multa',           emoji: '🚨' },
  { key: 'REPUESTO',      label: 'Repuesto',        emoji: '🔧' },
  { key: 'MANTENIMIENTO', label: 'Mantenimiento',   emoji: '🛠️' },
  { key: 'ACCESORIO',     label: 'Accesorio',       emoji: '🎒' },
  { key: 'OTRO',          label: 'Otro',            emoji: '📦' },
]

const TABS = ['Salud', 'Documentos', 'Mantenimiento', 'Combustible', 'Gastos', 'Agenda']

// ── Helpers de formato ────────────────────────────────────────────────────────

const fmtDate = (d) => {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt)) return '—'
  return `${String(dt.getUTCDate()).padStart(2,'0')}/${String(dt.getUTCMonth()+1).padStart(2,'0')}/${dt.getUTCFullYear()}`
}

const fmtCOP = (n) => {
  if (n == null) return '—'
  return '$' + Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

const numFmt = (n) => n?.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') ?? '—'

const scoreColor = (s) => s >= 80 ? '#22C55E' : s >= 60 ? '#F59E0B' : '#EF4444'
const scoreLabel = (s) => {
  if (s >= 90) return 'Excelente estado'
  if (s >= 75) return 'Buen estado'
  if (s >= 60) return 'Estado mejorable'
  if (s >= 40) return 'Requiere atención'
  return 'Estado crítico'
}

const statusColor = (st) => ({
  VIGENTE: '#22C55E', PROXIMO_A_VENCER: '#F59E0B', VENCIDO: '#EF4444',
}[st] ?? 'var(--text3)')

const statusLabel = (st) => ({
  VIGENTE: 'Vigente', PROXIMO_A_VENCER: 'Próximo', VENCIDO: 'Vencido',
}[st] ?? 'Sin fecha')

const progressColor = (p) => p >= 100 ? '#EF4444' : p >= 75 ? '#F59E0B' : '#22C55E'

// ── Componentes pequeños ──────────────────────────────────────────────────────

const SectionLabel = ({ children }) => (
  <p style={{
    fontSize: 11, fontWeight: 700, letterSpacing: '0.8px',
    color: 'var(--text3)', margin: '0 0 10px',
    textTransform: 'uppercase',
  }}>{children}</p>
)

const Card = ({ children, style, onClick, danger }) => (
  <div
    onClick={onClick}
    style={{
      background: 'var(--card)',
      border: `1px solid ${danger ? 'rgba(239,68,68,0.35)' : 'var(--border)'}`,
      borderRadius: 12,
      padding: 14,
      cursor: onClick ? 'pointer' : 'default',
      transition: onClick ? 'background 0.15s' : undefined,
      ...style,
    }}
    onMouseEnter={onClick ? e => e.currentTarget.style.background = 'var(--card-alt)' : undefined}
    onMouseLeave={onClick ? e => e.currentTarget.style.background = 'var(--card)' : undefined}
  >
    {children}
  </div>
)

const Badge = ({ label, color }) => (
  <span style={{
    display: 'inline-block',
    padding: '2px 8px', borderRadius: 6,
    fontSize: 10, fontWeight: 700,
    color: color,
    background: color + '20',
  }}>{label}</span>
)

const ProgressBar = ({ pct }) => (
  <div style={{ background: 'var(--border)', borderRadius: 3, height: 6, overflow: 'hidden' }}>
    <div style={{
      width: `${Math.min(pct, 100)}%`, height: 6,
      background: progressColor(pct),
      borderRadius: 3,
      transition: 'width 0.4s ease',
    }} />
  </div>
)

const EmptyState = ({ emoji, title, subtitle }) => (
  <div style={{
    padding: '40px 0', textAlign: 'center',
    color: 'var(--text3)',
  }}>
    <div style={{ fontSize: 36 }}>{emoji}</div>
    <p style={{ margin: '12px 0 4px', fontSize: 14, fontWeight: 600, color: 'var(--text2)' }}>{title}</p>
    <p style={{ margin: 0, fontSize: 12 }}>{subtitle}</p>
  </div>
)

// ── GaragePage ────────────────────────────────────────────────────────────────

export default function GaragePage() {
  const deviceId = useStore(s => s.deviceId)

  const [tab,        setTab]        = useState(0)
  const [loading,    setLoading]    = useState(true)
  const [scoreData,  setScoreData]  = useState(null)
  const [documents,  setDocuments]  = useState([])
  const [maintenance,setMaint]      = useState([])
  const [fuelData,   setFuelData]   = useState(null)
  const [expData,    setExpData]    = useState(null)
  const [agenda,     setAgenda]     = useState([])
  const [odometer,   setOdometer]   = useState(null)
  const [motoAlias,  setMotoAlias]  = useState(null)
  const [modal,      setModal]      = useState(null) // { kind, data }

  const loadAll = useCallback(async () => {
    setLoading(true)
    const [score, docs, maint, fuel, exp, ag, motos] = await Promise.allSettled([
      getGarageScore(),
      getGarageDocuments(),
      getGarageMaintenance(),
      getGarageFuel(),
      getGarageExpenses(),
      getGarageAgenda(),
      getMotos(),
    ])
    const v = (r) => r.status === 'fulfilled' ? r.value?.data : null
    setScoreData(v(score))
    setDocuments(v(docs)   ?? [])
    setMaint(v(maint)      ?? [])
    setFuelData(v(fuel))
    setExpData(v(exp))
    setAgenda(v(ag)        ?? [])
    const firstMoto = v(motos)?.[0]
    setMotoAlias(firstMoto?.alias ?? null)
    setOdometer(firstMoto?.current_odometer_km ?? null)
    setLoading(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  // ── Tab: Salud ─────────────────────────────────────────────────────────────

  const TabSalud = () => {
    const score      = scoreData?.score ?? 0
    const indicators = scoreData?.indicators ?? []
    const col        = scoreColor(score)
    const R = 54
    const circ = 2 * Math.PI * R
    const offset = circ - (score / 100) * circ

    return (
      <div style={{ maxWidth: 640 }}>
        {/* Ring */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 0' }}>
          <svg width="130" height="130" viewBox="0 0 130 130">
            <circle cx="65" cy="65" r={R} fill="none" stroke="var(--border)" strokeWidth="10"/>
            <circle cx="65" cy="65" r={R} fill="none" stroke={col} strokeWidth="10"
              strokeDasharray={circ} strokeDashoffset={offset}
              strokeLinecap="round"
              transform="rotate(-90 65 65)"
              style={{ transition: 'stroke-dashoffset 0.6s ease' }}
            />
            <text x="65" y="60" textAnchor="middle" fill={col}
              style={{ fontSize: 34, fontWeight: 900, fontFamily: 'inherit' }}>
              {score}
            </text>
            <text x="65" y="78" textAnchor="middle" fill="var(--text3)"
              style={{ fontSize: 13, fontFamily: 'inherit' }}>
              /100
            </text>
          </svg>
          <p style={{ margin: '10px 0 4px', fontSize: 16, fontWeight: 700, color: col }}>
            {scoreLabel(score)}
          </p>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text3)' }}>
            {motoAlias ? `Salud de ${motoAlias}` : 'Salud de tu moto'}
          </p>
        </div>

        {/* Indicadores */}
        {indicators.length > 0 && (
          <>
            <SectionLabel>Indicadores</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
              {indicators.map((ind, i) => {
                const c = ind.status === 'green' ? '#22C55E' : ind.status === 'yellow' ? '#F59E0B' : '#EF4444'
                return (
                  <Card key={i}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: c, flexShrink: 0 }}/>
                      <span style={{ flex: 1, fontSize: 13, color: 'var(--text1)', fontWeight: 500 }}>{ind.label}</span>
                      <span style={{ fontSize: 11, color: 'var(--text3)' }}>{ind.detail}</span>
                    </div>
                  </Card>
                )
              })}
            </div>
          </>
        )}

        {/* Preview agenda */}
        {agenda.length > 0 && (
          <>
            <SectionLabel>Próximos eventos</SectionLabel>
            {agenda.slice(0, 3).map((item, i) => <AgendaRow key={i} item={item} />)}
            {agenda.length > 3 && (
              <button
                onClick={() => setTab(5)}
                style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, cursor: 'pointer', padding: '4px 0' }}
              >
                Ver todos ({agenda.length}) →
              </button>
            )}
          </>
        )}
      </div>
    )
  }

  // ── Tab: Documentos ───────────────────────────────────────────────────────

  const TabDocumentos = () => {
    const docsMap = Object.fromEntries(documents.map(d => [d.type, d]))
    return (
      <div style={{ maxWidth: 640 }}>
        <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>
          Registra tus documentos y Argus te avisa cuando estén por vencer.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Object.entries(DOC_CATALOG).map(([type, info]) => {
            const existing = docsMap[type]
            const status   = existing?.status
            const daysLeft = existing?.days_remaining
            const col      = status ? statusColor(status) : 'var(--text3)'
            return (
              <Card key={type} onClick={() => setModal({ kind: 'doc', type, info, data: existing })}
                danger={status === 'VENCIDO'}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 22, flexShrink: 0 }}>{info.emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text1)' }}>{info.label}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: col }}>
                      {!info.hasExpiry && existing
                        ? 'Registrado'
                        : !existing
                          ? <span style={{ color: 'var(--text3)' }}>Toca para registrar</span>
                          : daysLeft >= 0
                            ? `Vence en ${daysLeft} días · ${fmtDate(existing.expires_at)}`
                            : `Venció hace ${Math.abs(daysLeft)} días`
                      }
                    </p>
                  </div>
                  {status
                    ? <Badge label={statusLabel(status)} color={col} />
                    : <span style={{ fontSize: 18, color: 'var(--text3)' }}>+</span>
                  }
                </div>
              </Card>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Tab: Mantenimiento ────────────────────────────────────────────────────

  const TabMantenimiento = () => {
    const maintMap = Object.fromEntries(maintenance.map(m => [m.type, m]))
    return (
      <div style={{ maxWidth: 640 }}>
        {/* Odómetro */}
        <Card style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 22 }}>🏁</span>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text3)' }}>Odómetro actual</p>
            <p style={{ margin: '2px 0 0', fontSize: 16, fontWeight: 700, color: 'var(--text1)' }}>
              {odometer != null ? `${numFmt(odometer)} km` : 'No configurado'}
            </p>
          </div>
          <button
            onClick={() => setModal({ kind: 'odometer' })}
            style={{
              background: 'var(--card-alt)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '6px 12px', fontSize: 12,
              color: 'var(--text2)', cursor: 'pointer',
            }}
          >Editar</button>
        </Card>

        <SectionLabel>Estado por ítem</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {MAINT_CATALOG.map(info => {
            const rec   = maintMap[info.type]
            const pct   = rec?.progress_pct ?? 0
            const kmRem = rec?.km_remaining
            const dyRem = rec?.days_remaining
            const intKm = rec?.interval_km
            const intDy = rec?.interval_days

            const subtitle = kmRem != null
              ? (kmRem > 0 ? `Faltan ${numFmt(Math.round(kmRem))} km` : '¡Vencido!')
              : dyRem != null
                ? (dyRem > 0 ? `Faltan ${Math.round(dyRem)} días` : '¡Vencido!')
                : 'Sin configurar'

            const interval = intKm != null
              ? `Cada ${numFmt(intKm)} km`
              : intDy != null ? `Cada ${intDy} días` : ''

            return (
              <Card key={info.type}
                onClick={() => setModal({ kind: 'maint', info, data: rec })}
                danger={pct >= 100}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: rec ? 10 : 0 }}>
                  <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{info.emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text1)' }}>{info.label}</p>
                    {interval && <p style={{ margin: '1px 0 0', fontSize: 10, color: 'var(--text3)' }}>{interval}</p>}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: progressColor(pct), flexShrink: 0 }}>
                    {subtitle}
                  </span>
                </div>
                {rec && (
                  <>
                    <ProgressBar pct={pct} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                      <span style={{ fontSize: 10, color: 'var(--text3)' }}>{pct}%</span>
                      {rec.last_done_at && (
                        <span style={{ fontSize: 10, color: 'var(--text3)' }}>
                          Último: {fmtDate(rec.last_done_at)}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </Card>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Tab: Combustible ──────────────────────────────────────────────────────

  const TabCombustible = () => {
    const summary  = fuelData?.summary
    const logs     = fuelData?.logs ?? []
    return (
      <div style={{ maxWidth: 640 }}>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 20 }}>
          {[
            { emoji: '⛽', val: summary?.avg_km_per_liter != null ? `${Number(summary.avg_km_per_liter).toFixed(1)} km/L` : '—', label: 'Consumo' },
            { emoji: '💰', val: summary?.avg_cost_per_km  != null ? fmtCOP(summary.avg_cost_per_km) + '/km' : '—', label: 'Costo/km' },
            { emoji: '📍', val: summary?.last_odometer    != null ? `${numFmt(summary.last_odometer)} km` : '—', label: 'Odómetro' },
          ].map(({ emoji, val, label }) => (
            <Card key={label} style={{ textAlign: 'center', padding: '12px 8px' }}>
              <div style={{ fontSize: 18 }}>{emoji}</div>
              <p style={{ margin: '4px 0 2px', fontSize: 12, fontWeight: 700, color: 'var(--text1)' }}>{val}</p>
              <p style={{ margin: 0, fontSize: 10, color: 'var(--text3)' }}>{label}</p>
            </Card>
          ))}
        </div>

        {/* Header con botón */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <SectionLabel>Historial de tanqueos</SectionLabel>
          <AddBtn onClick={() => setModal({ kind: 'fuel' })} />
        </div>

        {logs.length === 0
          ? <EmptyState emoji="⛽" title="Sin registros de combustible" subtitle="Agrega tu primer tanqueo con +" />
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {logs.map(log => (
                <Card key={log.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>⛽</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {log.liters != null && <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text1)' }}>{log.liters} L</span>}
                      {log.price_total != null && <span style={{ fontSize: 13, color: 'var(--text2)' }}>· {fmtCOP(log.price_total)}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 2, fontSize: 11, color: 'var(--text3)' }}>
                      {log.odometer_km != null && <span>{numFmt(log.odometer_km)} km</span>}
                      {log.km_per_liter != null && <span style={{ color: '#22C55E' }}>· {Number(log.km_per_liter).toFixed(1)} km/L</span>}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>{fmtDate(log.logged_at)}</span>
                  <button
                    onClick={() => handleDeleteFuel(log.id)}
                    style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: '2px 4px', fontSize: 14 }}
                  >✕</button>
                </Card>
              ))}
            </div>
        }
      </div>
    )
  }

  // ── Tab: Gastos ───────────────────────────────────────────────────────────

  const TabGastos = () => {
    const totals    = expData?.totals ?? {}
    const yearTotal = expData?.year_total
    const logs      = expData?.logs ?? []
    const filtered  = EXPENSE_CATALOG.filter(c => totals[c.key] != null)

    return (
      <div style={{ maxWidth: 640 }}>
        {/* Total año */}
        <Card style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text3)' }}>Invertido este año</p>
            <p style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 800, color: 'var(--text1)' }}>
              {yearTotal != null ? fmtCOP(yearTotal) : '—'}
            </p>
          </div>
          <span style={{ fontSize: 28 }}>💰</span>
        </Card>

        {/* Desglose categorías */}
        {filtered.length > 0 && (
          <>
            <SectionLabel>Por categoría</SectionLabel>
            <Card style={{ marginBottom: 20, padding: 0, overflow: 'hidden' }}>
              {filtered.map((cat, i) => (
                <div key={cat.key} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px',
                  borderBottom: i < filtered.length - 1 ? '1px solid var(--border-sub)' : 'none',
                }}>
                  <span style={{ fontSize: 16 }}>{cat.emoji}</span>
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--text1)' }}>{cat.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text1)' }}>{fmtCOP(totals[cat.key])}</span>
                </div>
              ))}
            </Card>
          </>
        )}

        {/* Historial */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <SectionLabel>Historial</SectionLabel>
          <AddBtn onClick={() => setModal({ kind: 'expense' })} />
        </div>

        {logs.length === 0
          ? <EmptyState emoji="💰" title="Sin registros de gastos" subtitle="Agrega tu primer gasto con +" />
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {logs.map(log => {
                const cat = EXPENSE_CATALOG.find(c => c.key === log.category) ?? { emoji: '📦', label: 'Otro' }
                return (
                  <Card key={log.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 18, flexShrink: 0 }}>{cat.emoji}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text1)' }}>{cat.label}</p>
                      {log.description && (
                        <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {log.description}
                        </p>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text1)' }}>{fmtCOP(log.amount)}</p>
                      <p style={{ margin: 0, fontSize: 10, color: 'var(--text3)' }}>{fmtDate(log.logged_at)}</p>
                    </div>
                    <button
                      onClick={() => handleDeleteExpense(log.id)}
                      style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: '2px 4px', fontSize: 14 }}
                    >✕</button>
                  </Card>
                )
              })}
            </div>
        }
      </div>
    )
  }

  // ── Tab: Agenda ───────────────────────────────────────────────────────────

  const TabAgenda = () => (
    <div style={{ maxWidth: 640 }}>
      {agenda.length === 0
        ? <EmptyState emoji="📅" title="Sin eventos próximos"
            subtitle="Registra documentos y mantenimiento para ver tu agenda" />
        : <>
            <SectionLabel>Próximas fechas</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {agenda.map((item, i) => <AgendaRow key={i} item={item} />)}
            </div>
          </>
      }
    </div>
  )

  // ── AgendaRow ─────────────────────────────────────────────────────────────

  const AgendaRow = ({ item }) => {
    const days    = item.days_until
    const isPast  = days != null && days < 0
    const isUrgent = days != null && days <= 7 && !isPast
    const col     = isPast ? '#EF4444' : isUrgent ? '#F59E0B' : 'var(--text2)'
    const label   = days == null ? 'Próx.' : isPast ? 'Vencido' : days === 0 ? 'Hoy' : days === 1 ? 'Mañana' : `${days}d`

    return (
      <Card danger={isPast}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 20, flexShrink: 0 }}>{item.icon ?? '📅'}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text1)' }}>{item.title}</p>
            {item.date && <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text3)' }}>{fmtDate(item.date)}</p>}
          </div>
          <Badge label={label} color={col} />
        </div>
      </Card>
    )
  }

  // ── Acciones ──────────────────────────────────────────────────────────────

  const handleDeleteFuel = async (id) => {
    if (!window.confirm('¿Eliminar este tanqueo?')) return
    await deleteGarageFuel(id).catch(() => {})
    loadAll()
  }

  const handleDeleteExpense = async (id) => {
    if (!window.confirm('¿Eliminar este gasto?')) return
    await deleteGarageExpense(id).catch(() => {})
    loadAll()
  }

  // ── Modales ───────────────────────────────────────────────────────────────

  const closeModal = () => setModal(null)

  const ModalWrapper = ({ title, children }) => (
    <div
      onClick={e => e.target === e.currentTarget && closeModal()}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: 24,
        width: '100%', maxWidth: 480,
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text1)' }}>{title}</h3>
          <button onClick={closeModal}
            style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text3)', padding: '0 4px' }}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )

  const ModalDoc = () => {
    const { type, info, data: existing } = modal
    const [issuedAt,  setIssuedAt]  = useState(existing?.issued_at?.slice(0,10)  ?? '')
    const [expiresAt, setExpiresAt] = useState(existing?.expires_at?.slice(0,10) ?? '')
    const [vin,       setVin]       = useState(existing?.vin         ?? '')
    const [engineNum, setEngineNum] = useState(existing?.engine_num  ?? '')
    const [cylCC,     setCylCC]     = useState(existing?.cylinder_cc ?? '')
    const [notes,     setNotes]     = useState(existing?.notes       ?? '')
    const [saving,    setSaving]    = useState(false)

    const onSave = async () => {
      setSaving(true)
      const body = {}
      if (issuedAt)  body.issued_at  = issuedAt
      if (expiresAt) body.expires_at = expiresAt
      if (vin)       body.vin         = vin
      if (engineNum) body.engine_num  = engineNum
      if (cylCC)     body.cylinder_cc = Number(cylCC)
      if (notes)     body.notes       = notes
      await upsertGarageDocument(type, body).catch(() => {})
      closeModal(); loadAll()
    }

    return (
      <ModalWrapper title={`${info.emoji} ${info.label}`}>
        <Field label="Fecha de expedición">
          <input type="date" value={issuedAt} onChange={e => setIssuedAt(e.target.value)} style={inputStyle()} />
        </Field>
        {info.hasExpiry && (
          <Field label="Fecha de vencimiento *">
            <input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} style={inputStyle()} />
          </Field>
        )}
        {info.hasProp && (
          <>
            <Field label="VIN / N° de chasis">
              <input value={vin} onChange={e => setVin(e.target.value)} placeholder="Número de chasis" style={inputStyle()} />
            </Field>
            <Field label="N° de motor">
              <input value={engineNum} onChange={e => setEngineNum(e.target.value)} placeholder="Número de motor" style={inputStyle()} />
            </Field>
            <Field label="Cilindraje (cc)">
              <input type="number" value={cylCC} onChange={e => setCylCC(e.target.value)} placeholder="ej. 150" style={inputStyle()} />
            </Field>
          </>
        )}
        <Field label="Notas (opcional)">
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notas adicionales" style={inputStyle()} />
        </Field>
        <SaveBtn saving={saving} onClick={onSave} />
      </ModalWrapper>
    )
  }

  const ModalMaint = () => {
    const { info, data: existing } = modal
    const [lastAt,  setLastAt]  = useState(existing?.last_done_at?.slice(0,10)  ?? '')
    const [lastKm,  setLastKm]  = useState(String(existing?.last_done_km ?? odometer ?? ''))
    const [intKm,   setIntKm]   = useState(String(existing?.interval_km  ?? ''))
    const [intDays, setIntDays] = useState(String(existing?.interval_days ?? ''))
    const [notes,   setNotes]   = useState(existing?.notes ?? '')
    const [saving,  setSaving]  = useState(false)

    const onSave = async () => {
      setSaving(true)
      const body = {}
      if (lastKm)  body.last_done_km  = Number(lastKm)
      if (lastAt)  body.last_done_at  = lastAt
      if (intKm)   body.interval_km   = Number(intKm)
      if (intDays) body.interval_days = Number(intDays)
      if (notes)   body.notes         = notes
      await upsertGarageMaintenance(info.type, body).catch(() => {})
      closeModal(); loadAll()
    }

    return (
      <ModalWrapper title={`${info.emoji} ${info.label}`}>
        <p style={{ margin: '-10px 0 16px', fontSize: 12, color: 'var(--text3)' }}>
          Marcar como hecho · ajustar intervalo
        </p>
        <Field label="Fecha del último mantenimiento">
          <input type="date" value={lastAt} onChange={e => setLastAt(e.target.value)} style={inputStyle()} />
        </Field>
        <Field label="Kilómetros al hacerlo">
          <input type="number" value={lastKm} onChange={e => setLastKm(e.target.value)} placeholder="ej. 15000" style={inputStyle()} />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Intervalo (km)">
            <input type="number" value={intKm} onChange={e => setIntKm(e.target.value)} placeholder="ej. 3000" style={inputStyle()} />
          </Field>
          <Field label="Intervalo (días)">
            <input type="number" value={intDays} onChange={e => setIntDays(e.target.value)} placeholder="ej. 180" style={inputStyle()} />
          </Field>
        </div>
        <Field label="Notas (opcional)">
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notas" style={inputStyle()} />
        </Field>
        <SaveBtn saving={saving} onClick={onSave} />
      </ModalWrapper>
    )
  }

  const ModalFuel = () => {
    const [liters,  setLiters]  = useState('')
    const [price,   setPrice]   = useState('')
    const [km,      setKm]      = useState(String(odometer ?? ''))
    const [date,    setDate]    = useState(new Date().toISOString().slice(0,10))
    const [notes,   setNotes]   = useState('')
    const [saving,  setSaving]  = useState(false)

    const onSave = async () => {
      setSaving(true)
      const body = { logged_at: date }
      if (liters) body.liters       = Number(liters)
      if (price)  body.price_total  = Number(price)
      if (km)     body.odometer_km  = Number(km)
      if (notes)  body.notes        = notes
      await addGarageFuel(body).catch(() => {})
      closeModal(); loadAll()
    }

    return (
      <ModalWrapper title="⛽ Nuevo tanqueo">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Litros">
            <input type="number" step="0.1" value={liters} onChange={e => setLiters(e.target.value)} placeholder="ej. 5.5" style={inputStyle()} />
          </Field>
          <Field label="Valor total ($)">
            <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="ej. 35000" style={inputStyle()} />
          </Field>
        </div>
        <Field label="Kilómetros actuales">
          <input type="number" value={km} onChange={e => setKm(e.target.value)} placeholder="ej. 15200" style={inputStyle()} />
        </Field>
        <Field label="Fecha">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle()} />
        </Field>
        <Field label="Notas (opcional)">
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notas" style={inputStyle()} />
        </Field>
        <SaveBtn saving={saving} onClick={onSave} label="Registrar" />
      </ModalWrapper>
    )
  }

  const ModalExpense = () => {
    const [cat,    setCat]    = useState('GASOLINA')
    const [amount, setAmount] = useState('')
    const [desc,   setDesc]   = useState('')
    const [date,   setDate]   = useState(new Date().toISOString().slice(0,10))
    const [saving, setSaving] = useState(false)

    const onSave = async () => {
      if (!amount) return
      setSaving(true)
      const body = { category: cat, amount: Number(amount), logged_at: date }
      if (desc) body.description = desc
      await addGarageExpense(body).catch(() => {})
      closeModal(); loadAll()
    }

    return (
      <ModalWrapper title="💰 Nuevo gasto">
        <Field label="Categoría">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {EXPENSE_CATALOG.map(c => (
              <button key={c.key} onClick={() => setCat(c.key)}
                style={{
                  padding: '5px 10px', borderRadius: 8, fontSize: 11, cursor: 'pointer',
                  border: `1px solid ${cat === c.key ? 'var(--accent)' : 'var(--border)'}`,
                  background: cat === c.key ? 'var(--accent-10)' : 'var(--card-alt)',
                  color: cat === c.key ? 'var(--accent)' : 'var(--text2)',
                  fontWeight: cat === c.key ? 700 : 400,
                }}>
                {c.emoji} {c.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Valor ($) *">
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="ej. 45000" style={inputStyle()} />
        </Field>
        <Field label="Descripción (opcional)">
          <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Descripción" style={inputStyle()} />
        </Field>
        <Field label="Fecha">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle()} />
        </Field>
        <SaveBtn saving={saving} onClick={onSave} label="Registrar" disabled={!amount} />
      </ModalWrapper>
    )
  }

  const ModalOdometer = () => {
    const [km,     setKm]     = useState(String(odometer ?? ''))
    const [saving, setSaving] = useState(false)

    const onSave = async () => {
      const n = Number(km)
      if (!n) return
      setSaving(true)
      await updateGarageOdometer(n).catch(() => {})
      closeModal(); loadAll()
    }

    return (
      <ModalWrapper title="🏁 Actualizar odómetro">
        <Field label="Kilómetros actuales">
          <input type="number" value={km} onChange={e => setKm(e.target.value)} placeholder="ej. 15200" style={inputStyle()} />
        </Field>
        <SaveBtn saving={saving} onClick={onSave} />
      </ModalWrapper>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const CONTENT = [TabSalud, TabDocumentos, TabMantenimiento, TabCombustible, TabGastos, TabAgenda]
  const ActiveTab = CONTENT[tab]

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      {/* Header + TabBar */}
      <div style={{
        background: 'var(--card)',
        borderBottom: '1px solid var(--border)',
        padding: '12px 16px 0',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 20 }}>🏍️</span>
          <div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--text1)' }}>Garage</p>
            {motoAlias && <p style={{ margin: 0, fontSize: 11, color: 'var(--text3)' }}>{motoAlias}</p>}
          </div>
          <div style={{ flex: 1 }} />
          <button
            onClick={loadAll}
            style={{
              background: 'none', border: 'none',
              fontSize: 16, color: 'var(--text2)', cursor: 'pointer', padding: 4,
            }}
            title="Recargar"
          >⟳</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: '1px' }}>
          {TABS.map((label, i) => (
            <button key={i} onClick={() => setTab(i)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '8px 12px', fontSize: 12, whiteSpace: 'nowrap',
                fontWeight: tab === i ? 700 : 400,
                color: tab === i ? 'var(--accent)' : 'var(--text2)',
                borderBottom: `2.5px solid ${tab === i ? 'var(--accent)' : 'transparent'}`,
                transition: 'all 0.15s',
              }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {loading
          ? <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
              <div style={{
                width: 32, height: 32, border: '3px solid var(--border)',
                borderTopColor: 'var(--accent)', borderRadius: '50%',
                animation: 'spin 0.7s linear infinite',
              }} />
              <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            </div>
          : <ActiveTab />
        }
      </div>

      {/* Modales */}
      {modal?.kind === 'doc'      && <ModalDoc />}
      {modal?.kind === 'maint'    && <ModalMaint />}
      {modal?.kind === 'fuel'     && <ModalFuel />}
      {modal?.kind === 'expense'  && <ModalExpense />}
      {modal?.kind === 'odometer' && <ModalOdometer />}
    </div>
  )
}

// ── Helpers de UI ──────────────────────────────────────────────────────────────

const AddBtn = ({ onClick }) => (
  <button
    onClick={onClick}
    style={{
      background: 'var(--accent)', color: '#fff',
      border: 'none', borderRadius: 8,
      padding: '5px 12px', fontSize: 12, fontWeight: 600,
      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
    }}
  >+ Agregar</button>
)

const Field = ({ label, children }) => (
  <div style={{ marginBottom: 14 }}>
    <label style={{ display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 5 }}>
      {label}
    </label>
    {children}
  </div>
)

const inputStyle = () => ({
  width: '100%', boxSizing: 'border-box',
  padding: '10px 12px', borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'var(--card-alt)',
  color: 'var(--text1)', fontSize: 13,
  outline: 'none',
})

const SaveBtn = ({ saving, onClick, label = 'Guardar', disabled = false }) => (
  <button
    onClick={onClick}
    disabled={saving || disabled}
    style={{
      width: '100%', padding: '12px 0', marginTop: 6,
      borderRadius: 12, border: 'none', cursor: saving || disabled ? 'not-allowed' : 'pointer',
      background: saving || disabled ? 'var(--accent-20)' : 'var(--accent)',
      color: saving || disabled ? 'var(--text3)' : '#fff',
      fontSize: 14, fontWeight: 700,
      transition: 'background 0.15s',
    }}
  >
    {saving ? 'Guardando...' : label}
  </button>
)

/* ═══════════════════════════════════════════════════════════
   RESUMEN DEL MÓDULO — GaragePage
   ═══════════════════════════════════════════════════════════

   EXPLICACIÓN PARA HUMANO:
   Pantalla de gestión integral de la moto. Carga todos los datos en
   paralelo con Promise.allSettled al montar. 6 pestañas:
   - Salud: ring SVG con score 0-100 y semáforo de indicadores
   - Documentos: SOAT/Tecno/licencias con estado de vencimiento
   - Mantenimiento: barras de progreso km/días para 10 ítems + odómetro
   - Combustible: historial de tanqueos + estadísticas de consumo
   - Gastos: registro y resumen por categoría del año
   - Agenda: lista de próximas fechas con urgencia coloreada

   Los modales se renderizan como overlay sobre toda la app.
   Las funciones de tab son componentes definidos como funciones dentro
   del scope de GaragePage para acceder directamente al estado sin props.

   DEUDA TÉCNICA:
   - Sin paginación: fuel_logs y expense_logs cargan todos los registros
   - ModalExpense no valida en tiempo real (requerería useEffect en amount)
   - El spinner usa animation CSS inline — no reutilizable

   ═══════════════════════════════════════════════════════════ */
