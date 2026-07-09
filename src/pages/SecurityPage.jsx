import { useEffect, useState, useCallback, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { getDeviceStatus, sendCommand,
         createGeofence, getActiveGeofence, deleteGeofence,
         createIncidentApi, createSecureRoomApi } from '../api/apiService.js'
import { connect, getSocket } from '../api/realtimeService.js'

const STATE_META = {
  STATE_IDLE:    { label: 'Inactivo',       color: 'var(--text2)',  bg: 'var(--card-alt)' },
  STATE_MOVING:  { label: 'En movimiento',  color: 'var(--orange)', bg: 'var(--orange-10)' },
  STATE_ALERT:   { label: 'ALERTA',         color: 'var(--armed)',  bg: 'var(--armed-10)' },
  STATE_PURSUIT: { label: 'PERSECUCIÓN',    color: 'var(--armed)',  bg: 'var(--armed-10)' },
}


// ── Componentes base ─────────────────────────────────────────────────────────

function SectionLabel({ children, style }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 600, letterSpacing: '1.2px',
      color: 'var(--text3)', marginBottom: 10, textTransform: 'uppercase',
      ...style,
    }}>{children}</div>
  )
}

function InfoModal({ emoji, title, children, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 18, padding: '24px 22px 20px',
          maxWidth: 360, width: '100%',
          boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 22 }}>{emoji}</span>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text1)' }}>{title}</div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.65 }}>{children}</div>
        <button
          onClick={onClose}
          style={{
            marginTop: 20, width: '100%', padding: '11px 0',
            borderRadius: 10, border: '1px solid var(--accent)',
            background: 'transparent', color: 'var(--accent)',
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
        >Entendido</button>
      </div>
    </div>
  )
}

function Card({ children, style }) {
  return (
    <div style={{
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 14,
      ...style,
    }}>{children}</div>
  )
}

// ── Panel de estado grande ────────────────────────────────────────────────────

function BigStatusPanel({ armed, state, loading }) {
  const isAlert = state === 'STATE_ALERT' || state === 'STATE_PURSUIT'

  const accentColor = (isAlert || armed) ? 'var(--armed)' : 'var(--text3)'
  const circleBg    = (isAlert || armed) ? 'rgba(229,72,77,0.12)' : 'rgba(140,140,140,0.12)'
  const circleBdr   = (isAlert || armed) ? 'rgba(229,72,77,0.45)' : 'rgba(140,140,140,0.45)'

  const statusText = isAlert ? 'ALERTA' : armed ? 'ARMADO' : 'DESARMADO'
  const statusDesc = isAlert
    ? 'Posible intento de robo detectado'
    : armed ? 'Tu moto está protegida'
    : 'Activa la protección para mayor seguridad'

  return (
    <Card style={{ padding: '32px 20px 28px', marginBottom: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
        {loading ? (
          <div style={{ fontSize: 13, color: 'var(--text3)', padding: '20px 0' }}>Cargando…</div>
        ) : (
          <>
            <div style={{
              width: 74, height: 74, borderRadius: '50%',
              background: circleBg, border: `2px solid ${circleBdr}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 16,
            }}>
              <ShieldSvg armed={armed} alert={isAlert} color={accentColor} />
            </div>
            <div style={{
              fontSize: 20, fontWeight: 800, letterSpacing: '2.5px',
              color: accentColor, marginBottom: 6,
            }}>{statusText}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', textAlign: 'center' }}>
              {statusDesc}
            </div>
          </>
        )}
      </div>
    </Card>
  )
}

function ShieldSvg({ armed, alert, color }) {
  const SHIELD = 'M12 2L4 6v6c0 5.25 3.58 10.15 8 11.32C16.42 22.15 20 17.25 20 12V6L12 2z'
  if (alert) return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
      <path d={SHIELD} fill={color} opacity="0.2" />
      <path d={SHIELD} stroke={color} strokeWidth="1.5" />
      <line x1="12" y1="8" x2="12" y2="13" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="16" r="0.8" fill={color} />
    </svg>
  )
  if (armed) return (
    <svg width="30" height="30" viewBox="0 0 24 24">
      <path d={SHIELD} fill={color} />
      <polyline points="9,12 11,14 15,10" stroke="white" strokeWidth="2.2"
        strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
      <path d={SHIELD} stroke={color} strokeWidth="1.5" />
    </svg>
  )
}

// ── Botones ARM / DISARM principales ─────────────────────────────────────────

function ArmButtons({ cmdLoading, onCommand }) {
  const btn = (cmd, label, icon, primary) => (
    <button
      key={cmd}
      onClick={() => onCommand(cmd)}
      disabled={!!cmdLoading}
      style={{
        flex: 1, padding: '13px 0',
        borderRadius: 12,
        border: '1px solid var(--border)',
        background: primary && cmdLoading === cmd ? 'var(--blue)' : 'var(--card)',
        color: 'var(--text1)',
        fontSize: 14, fontWeight: 600,
        cursor: cmdLoading ? 'not-allowed' : 'pointer',
        opacity: cmdLoading && cmdLoading !== cmd ? 0.4 : 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        transition: 'opacity 0.15s',
      }}
    >
      {cmdLoading === cmd
        ? <Spinner color="var(--text2)" />
        : <><span style={{ fontSize: 15 }}>{icon}</span>{label}</>}
    </button>
  )
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
      {btn('ARM',    'Armado',   '🛡️', true)}
      {btn('DISARM', 'Desarmar', '🔓', false)}
    </div>
  )
}

// ── Card APP ONLY para BLE (no disponible en web) ────────────────────────────

function BleAppOnlyCard() {
  return (
    <Card style={{ marginBottom: 12, overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '13px 16px',
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
      }}>
        <span style={{ fontSize: 22, flexShrink: 0 }}>🔵</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#7b9fff', marginBottom: 2 }}>
            Conexión Bluetooth
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
            Solo disponible en la app móvil
          </div>
        </div>
        <span style={{
          padding: '3px 8px', borderRadius: 6, flexShrink: 0,
          background: 'rgba(123,159,255,0.15)', border: '1px solid rgba(123,159,255,0.3)',
          fontSize: 9, fontWeight: 700, color: '#7b9fff', letterSpacing: '0.5px',
        }}>APP ONLY</span>
      </div>
    </Card>
  )
}

// ── Sección Comandos (solo alarma + motor) ───────────────────────────────────

function CommandsCard({ cmdLoading, lastResult, onCommand, engineCut, alarmActive }) {
  const [showInfo, setShowInfo] = useState(false)
  const alarmCmd   = alarmActive ? 'SIREN_OFF' : 'SIREN_ON'
  const alarmLabel = alarmActive ? 'Apagar sirena' : 'Activar sirena'
  const alarmIcon  = alarmActive ? '🔕' : '🔔'
  const alarmColor = alarmActive ? 'var(--orange)' : 'var(--text2)'
  const alarmBg    = alarmActive ? 'var(--orange-10)' : 'var(--card-alt)'
  const alarmBdr   = alarmActive ? 'rgba(229,135,30,0.3)' : 'var(--border)'
  const alarmLoading = cmdLoading === 'SIREN_ON' || cmdLoading === 'SIREN_OFF'

  const motorCmd   = engineCut ? 'ENGINE_RESTORE' : 'ENGINE_CUT'
  const motorLabel = engineCut ? 'Restaurar motor' : 'Cortar motor'
  const motorIcon  = engineCut ? '✅' : '✂️'
  const motorColor = engineCut ? 'var(--green)' : 'var(--text2)'
  const motorBg    = engineCut ? 'rgba(63,185,80,0.08)' : 'var(--card-alt)'
  const motorBdr   = engineCut ? 'rgba(63,185,80,0.3)' : 'var(--border)'
  const motorLoading = cmdLoading === 'ENGINE_CUT' || cmdLoading === 'ENGINE_RESTORE'

  return (
    <Card style={{ padding: 14, marginBottom: 12 }}>
      {showInfo && (
        <InfoModal emoji="🎛️" title="Comandos remotos" onClose={() => setShowInfo(false)}>
          <strong>Sirena (bocina de búsqueda)</strong><br />
          Activa o apaga la bocina del vehículo sin cambiar el estado de vigilancia.
          Útil para localizar la moto en un parqueadero o como señal de advertencia.
          <br /><br />
          <strong>Cortar / Restaurar motor</strong><br />
          Interrumpe el circuito del motor vía relay físico — la moto no puede arrancar.
          Usar con cuidado: si la moto está en movimiento, el corte puede ser peligroso.
          Restaurar cuando tengas la moto de vuelta o desees habilitarla.
        </InfoModal>
      )}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <SectionLabel style={{ flex: 1, marginBottom: 0 }}>Comandos remotos</SectionLabel>
        <InfoCircle onClick={() => setShowInfo(true)} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <CmdBtn
          label={alarmLabel} icon={alarmIcon}
          color={alarmColor} bg={alarmBg} border={alarmBdr}
          loading={alarmLoading}
          disabled={!!cmdLoading && !alarmLoading}
          onClick={() => onCommand(alarmCmd)}
        />
        <CmdBtn
          label={motorLabel} icon={motorIcon}
          color={motorColor} bg={motorBg} border={motorBdr}
          loading={motorLoading}
          disabled={!!cmdLoading && !motorLoading}
          onClick={() => onCommand(motorCmd)}
        />
      </div>
      {engineCut && (
        <div style={{
          marginTop: 8, padding: '6px 10px', borderRadius: 8, fontSize: 11,
          background: 'rgba(63,185,80,0.06)', border: '1px solid rgba(63,185,80,0.25)',
          color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span>⚡</span> Motor cortado actualmente — toca "Restaurar motor" para habilitarlo
        </div>
      )}
      {lastResult && (
        <div style={{
          marginTop: 10, padding: '9px 12px', borderRadius: 10, fontSize: 12,
          background: lastResult.ok ? 'rgba(63,185,80,0.08)' : 'var(--armed-10)',
          border: `1px solid ${lastResult.ok ? 'rgba(63,185,80,0.3)' : 'rgba(229,72,77,0.3)'}`,
          color: lastResult.ok ? 'var(--green)' : 'var(--armed)',
        }}>{lastResult.msg}</div>
      )}
    </Card>
  )
}

function CmdBtn({ label, icon, color, bg, border, loading, disabled, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      style={{
        flex: 1, padding: '12px 8px',
        borderRadius: 12,
        border: `1px solid ${border || 'var(--border)'}`,
        background: bg || 'var(--card-alt)',
        color: color || 'var(--text2)',
        fontSize: 12, fontWeight: 600,
        cursor: (loading || disabled) ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : loading ? 0.5 : 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        transition: 'opacity 0.15s', minWidth: 0,
      }}
    >
      {loading
        ? <Spinner color={color || 'var(--text2)'} />
        : <>{icon && <span style={{ fontSize: 14 }}>{icon}</span>}{label}</>}
    </button>
  )
}

// ── Automatización BLE (APP ONLY) ────────────────────────────────────────────

function BleAutomationCard() {
  const [showInfo, setShowInfo] = useState(false)
  return (
    <Card style={{ marginBottom: 12, overflow: 'hidden' }}>
      {showInfo && (
        <InfoModal emoji="📡" title="Automatización BLE" onClose={() => setShowInfo(false)}>
          El Bluetooth Low Energy (BLE) del dispositivo Argus permite automatizar
          el armado y desarmado según la proximidad de tu teléfono.
          <br /><br />
          <strong>• Armar al alejarse</strong><br />
          Si tu teléfono pierde la señal BLE (porque te alejaste), el sistema
          se arma automáticamente después del tiempo configurado.
          <br /><br />
          <strong>• Desarmar al acercarse</strong><br />
          Cuando tu teléfono vuelve a detectar el dispositivo por BLE,
          el sistema se desarma sin que hagas nada.
          <br /><br />
          <strong>• Auto-armar por inactividad</strong><br />
          Si la moto lleva X minutos sin moverse y el sistema no está armado,
          lo arma automáticamente.
          <br /><br />
          Disponible solo en la app móvil — requiere Bluetooth activo.
        </InfoModal>
      )}
      <div style={{ padding: '14px 14px 0', display: 'flex', alignItems: 'center' }}>
        <SectionLabel style={{ flex: 1, marginBottom: 0 }}>Automatización BLE</SectionLabel>
        <InfoCircle onClick={() => setShowInfo(true)} />
      </div>
      <div style={{
        margin: '0 14px', padding: '10px 14px', borderRadius: 10,
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ fontSize: 20 }}>📱</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#7b9fff', marginBottom: 2 }}>
            Solo disponible en la app móvil
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>
            Armado automático por proximidad Bluetooth
          </div>
        </div>
        <span style={{
          padding: '3px 8px', borderRadius: 6, flexShrink: 0,
          background: 'rgba(123,159,255,0.15)', border: '1px solid rgba(123,159,255,0.3)',
          fontSize: 9, fontWeight: 700, color: '#7b9fff', letterSpacing: '0.5px',
        }}>APP ONLY</span>
      </div>
      <div style={{ display: 'flex', padding: '10px 14px 14px', gap: 8 }}>
        {['Armar al alejarse', 'Desarmar al acercarse', 'Auto-armar inactivo'].map(f => (
          <div key={f} style={{
            flex: 1, padding: '10px 8px',
            borderRadius: 10, border: '1px solid var(--border)',
            background: 'var(--card-alt)', textAlign: 'center', opacity: 0.5,
          }}>
            <div style={{ fontSize: 16, marginBottom: 4 }}>🔵</div>
            <div style={{ fontSize: 10, color: 'var(--text3)', lineHeight: 1.3 }}>{f}</div>
          </div>
        ))}
      </div>
    </Card>
  )
}

// ── Emergencia ────────────────────────────────────────────────────────────────

function EmergencyCard({ cmdLoading, onCommand, engineCut, onOpenRoom, roomLoading, activeRoom, onRejoinRoom }) {
  const restoreLoading = cmdLoading === 'ENGINE_RESTORE'

  const RoomBtn = () => activeRoom ? (
    <button
      onClick={onRejoinRoom}
      style={{
        marginTop: 8, width: '100%', padding: '12px 0', borderRadius: 10,
        border: '1px solid rgba(255,165,0,0.55)',
        background: 'rgba(255,165,0,0.08)',
        color: 'var(--orange)', fontSize: 13, fontWeight: 800, letterSpacing: '0.5px',
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      }}
    >
      <span style={{ fontSize: 9, color: 'var(--orange)' }}>●</span>
      SALA ACTIVA — REGRESAR
    </button>
  ) : (
    <button
      onClick={onOpenRoom}
      disabled={roomLoading}
      style={{
        marginTop: 8, width: '100%', padding: '12px 0', borderRadius: 10,
        border: '1px solid rgba(229,72,77,0.5)',
        background: 'rgba(229,72,77,0.08)',
        color: 'var(--armed)', fontSize: 13, fontWeight: 800, letterSpacing: '0.5px',
        cursor: roomLoading ? 'not-allowed' : 'pointer',
        opacity: roomLoading ? 0.6 : 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      }}
    >
      {roomLoading ? <Spinner color="var(--armed)" /> : (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/>
          </svg>
          REPORTAR ROBO
        </>
      )}
    </button>
  )

  if (engineCut) {
    return (
      <Card style={{
        padding: 18, marginBottom: 12,
        borderColor: 'rgba(63,185,80,0.3)',
        background: 'rgba(63,185,80,0.06)',
      }}>
        <SectionLabel style={{ marginBottom: 10 }}>Persecución activa</SectionLabel>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 26 }}>🔒</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--green)', marginBottom: 4 }}>
              Motor cortado
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12, lineHeight: 1.5 }}>
              El motor está bloqueado. Restaurarlo solo si ya recuperaste la moto.
            </div>
            <button
              onClick={() => onCommand('ENGINE_RESTORE')}
              disabled={!!cmdLoading}
              style={{
                width: '100%', padding: '12px 0', borderRadius: 10,
                border: '1px solid var(--green)', background: 'transparent',
                color: 'var(--green)', fontSize: 13, fontWeight: 800, letterSpacing: '0.5px',
                cursor: cmdLoading ? 'not-allowed' : 'pointer',
                opacity: cmdLoading ? 0.5 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {restoreLoading ? <Spinner color="var(--green)" /> : 'RESTAURAR MOTOR'}
            </button>
            <RoomBtn />
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card style={{
      padding: 18, marginBottom: 12,
      borderColor: 'rgba(229,72,77,0.3)',
      background: 'var(--armed-10)',
    }}>
      <SectionLabel style={{ marginBottom: 10 }}>Emergencia</SectionLabel>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 26 }}>🚨</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--armed)', marginBottom: 4 }}>
            ¿Te robaron la moto?
          </div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 2, lineHeight: 1.5 }}>
            Activa rastreo GPS continuo (cada 10s, sin pausas) y abre sala de
            coordinación con agentes REACTION.
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12, lineHeight: 1.4 }}>
            Silencia la sirena y mantiene el motor activo. El corte manual está
            disponible en "Comandos remotos" si lo necesitas.
          </div>
          <RoomBtn />
        </div>
      </div>
    </Card>
  )
}


// ── Automatización del motor ──────────────────────────────────────────────────

function EngineToggleRow({ label, description, value, onToggle }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text1)', marginBottom: 2 }}>
          {label}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.4 }}>
          {description}
        </div>
      </div>
      <button
        onClick={onToggle}
        style={{
          width: 40, height: 22, borderRadius: 11, border: 'none',
          background: value ? 'var(--accent)' : 'var(--border)',
          cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
          flexShrink: 0,
        }}
      >
        <span style={{
          position: 'absolute', top: 2,
          left: value ? 20 : 2,
          width: 18, height: 18, borderRadius: '50%',
          background: 'white', transition: 'left 0.2s',
        }} />
      </button>
    </div>
  )
}

function EngineAutoCard({ autoCutOnArm, autoRestoreOnDisarm, onChange }) {
  return (
    <Card style={{ padding: '14px 14px 4px', marginBottom: 12 }}>
      <SectionLabel style={{ marginBottom: 0 }}>Automatización del motor</SectionLabel>
      <div style={{ borderBottom: '1px solid var(--border)' }}>
        <EngineToggleRow
          label="Cortar motor al armar"
          description="Al presionar Armar, cortar el motor automáticamente como inmovilizador."
          value={autoCutOnArm}
          onToggle={() => onChange('cut', !autoCutOnArm)}
        />
      </div>
      <EngineToggleRow
        label="Restaurar motor al desarmar"
        description="Al presionar Desarmar, restaurar el motor si estaba cortado."
        value={autoRestoreOnDisarm}
        onToggle={() => onChange('restore', !autoRestoreOnDisarm)}
      />
    </Card>
  )
}

// ── Auto-sensibilidad en zonas de riesgo ARI ─────────────────────────────────

function AutoSensitivityInfoModal({ onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 18, padding: '24px 22px 20px',
          maxWidth: 360, width: '100%',
          boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 22 }}>🎯</span>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text1)' }}>
            Auto-sensibilidad en zonas de riesgo
          </div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.65 }}>
          Cuando está activa, Argus <strong>sube automáticamente</strong> la
          sensibilidad del sensor a <strong>Alta</strong> cada vez que la moto
          entra a una zona con índice de riesgo ARI elevado.
          <br /><br />
          <strong>• Al entrar a zona de riesgo</strong> → sensibilidad sube a Alta.
          <br /><br />
          <strong>• Al salir de la zona</strong> → sensibilidad vuelve a Media.
          <br /><br />
          Si dejas la moto parqueada en un barrio de alto ARI, considera
          desactivarla para evitar falsas alarmas por vibraciones del tráfico.
          Puedes ajustar la sensibilidad manualmente en cualquier momento.
        </div>
        <button
          onClick={onClose}
          style={{
            marginTop: 20, width: '100%', padding: '11px 0',
            borderRadius: 10, border: '1px solid var(--accent)',
            background: 'transparent', color: 'var(--accent)',
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
        >Entendido</button>
      </div>
    </div>
  )
}

function AutoSensitivityCard({ enabled, onToggle }) {
  const [showInfo, setShowInfo] = useState(false)
  return (
    <>
      {showInfo && <AutoSensitivityInfoModal onClose={() => setShowInfo(false)} />}
      <Card style={{ padding: '14px 14px 14px', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <SectionLabel style={{ flex: 1, margin: 0 }}>Sensibilidad por zona</SectionLabel>
          <InfoCircle onClick={() => setShowInfo(true)} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text1)', marginBottom: 2 }}>
              Auto-sensibilidad en zonas de riesgo
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.4 }}>
              Sube a Alta al entrar a zona ARI elevado. Vuelve a Media al salir.
            </div>
          </div>
          <button
            onClick={onToggle}
            style={{
              width: 40, height: 22, borderRadius: 11, border: 'none',
              background: enabled ? 'var(--armed)' : 'var(--border)',
              cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
              flexShrink: 0,
            }}
          >
            <span style={{
              position: 'absolute', top: 2,
              left: enabled ? 20 : 2,
              width: 18, height: 18, borderRadius: '50%',
              background: 'white', transition: 'left 0.2s',
            }} />
          </button>
        </div>
      </Card>
    </>
  )
}

// ── Alarma de movimiento (overlay rojo a pantalla completa) ──────────────────

function AlarmBanner({ onDismiss }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(180,30,40,0.93)', backdropFilter: 'blur(6px)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 20,
    }}>
      <style>{`
        @keyframes pulse-alarm {
          0%,100% { transform: scale(1); opacity: 1; }
          50%      { transform: scale(1.18); opacity: 0.7; }
        }
        .alarm-pulse { animation: pulse-alarm 0.9s ease-in-out infinite; }
      `}</style>
      <div className="alarm-pulse" style={{ fontSize: 72 }}>🚨</div>
      <div style={{
        fontSize: 26, fontWeight: 900, color: '#fff', letterSpacing: 3,
        textAlign: 'center',
      }}>¡ALERTA DE MOVIMIENTO!</div>
      <div style={{
        fontSize: 14, color: 'rgba(255,255,255,0.8)', textAlign: 'center',
        maxWidth: 300, lineHeight: 1.6,
      }}>
        El dispositivo detectó movimiento sospechoso.<br />
        Tu moto puede estar siendo robada.
      </div>
      <button
        onClick={onDismiss}
        style={{
          marginTop: 8, padding: '14px 44px',
          background: '#fff', color: '#b41e28',
          border: 'none', borderRadius: 14,
          fontSize: 16, fontWeight: 800, cursor: 'pointer',
          letterSpacing: '0.5px',
        }}
      >
        Entendido — Revisar
      </button>
    </div>
  )
}

// ── Selector de sensibilidad del sensor ──────────────────────────────────────

const SENS_LEVELS = [
  { key: 'SENSITIVITY_VERY_LOW',  label: 'Muy baja' },
  { key: 'SENSITIVITY_LOW',       label: 'Baja'     },
  { key: 'SENSITIVITY_MEDIUM',    label: 'Media'    },
  { key: 'SENSITIVITY_HIGH',      label: 'Alta'     },
  { key: 'SENSITIVITY_VERY_HIGH', label: 'Muy alta' },
]

function SensitivityCard({ currentLevel, onCommand, cmdLoading }) {
  const [showInfo, setShowInfo] = useState(false)
  return (
    <Card style={{ padding: '14px 14px 18px', marginBottom: 12 }}>
      {showInfo && (
        <InfoModal emoji="🎚️" title="Sensibilidad del sensor" onClose={() => setShowInfo(false)}>
          Controla qué tan fácil dispara una alerta el acelerómetro MPU6050 del dispositivo.
          <br /><br />
          <strong>• Muy baja / Baja</strong> — solo detecta impactos fuertes y
          manipulaciones directas. Ideal en zonas con mucho tráfico o vibración
          (avenidas, parqueaderos concurridos).
          <br /><br />
          <strong>• Media (predeterminado)</strong> — balance entre sensibilidad y
          falsas alarmas. Recomendado para uso cotidiano en ciudad.
          <br /><br />
          <strong>• Alta / Muy alta</strong> — detecta movimientos pequeños como
          un golpe suave o inclinar la moto. Útil en zonas de alto riesgo o cuando
          la dejas sola en la calle. Puede generar falsas alarmas por camiones o viento.
        </InfoModal>
      )}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <SectionLabel style={{ flex: 1, marginBottom: 0 }}>Sensibilidad del sensor</SectionLabel>
        <InfoCircle onClick={() => setShowInfo(true)} />
      </div>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12, lineHeight: 1.5 }}>
        Qué tan fácil detecta movimiento. Sube si hay falsas alarmas, baja en zonas tranquilas.
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {SENS_LEVELS.map(({ key, label }, i) => {
          const active = currentLevel === i
          return (
            <button
              key={key}
              onClick={() => onCommand(key)}
              disabled={!!cmdLoading}
              style={{
                flex: 1, padding: '9px 4px',
                borderRadius: 9,
                border: `1.5px solid ${active ? 'var(--orange)' : 'var(--border)'}`,
                background: active ? 'var(--orange-10)' : 'transparent',
                color: active ? 'var(--orange)' : 'var(--text2)',
                fontSize: 11, fontWeight: active ? 700 : 500,
                cursor: cmdLoading ? 'not-allowed' : 'pointer',
                opacity: cmdLoading && !active ? 0.5 : 1,
                transition: 'all 0.15s',
              }}
            >
              {label}
            </button>
          )
        })}
      </div>
    </Card>
  )
}

// ── Spinner inline ────────────────────────────────────────────────────────────

function Spinner({ color }) {
  return (
    <span style={{
      display: 'inline-block', width: 14, height: 14, flexShrink: 0,
      border: `2px solid ${color}`, borderTopColor: 'transparent',
      borderRadius: '50%', animation: 'spin 0.6s linear infinite',
    }} />
  )
}

// ── Geocerca de estacionamiento ───────────────────────────────────────────────

const GEO_BLUE = '#2196F3'

function InfoCircle({ onClick }) {
  return (
    <button
      onClick={onClick}
      title="¿Qué es el modo parqueadero?"
      style={{
        width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
        border: '1px solid var(--border)', background: 'var(--card-alt)',
        color: 'var(--text3)', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 700, lineHeight: 1,
      }}
    >ⓘ</button>
  )
}

function GeofenceInfoModal({ onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 18, padding: '24px 22px 20px',
          maxWidth: 360, width: '100%',
          boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 22 }}>🅿️</span>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text1)' }}>
            ¿Qué es el modo parqueadero?
          </div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.65 }}>
          Al armar con geocerca, el sistema vigila tu moto{' '}
          <strong>sin activar la sirena</strong> mientras esté dentro del radio
          que definas.
          <br /><br />
          <strong>• Movimiento dentro del radio</strong> → alerta silenciosa
          en la app (útil si un acomodador mueve la moto en el parqueadero).
          <br /><br />
          <strong>• Si la moto sale del radio</strong> → alarma completa
          inmediatamente.
          <br /><br />
          Esto evita falsas alarmas por vibraciones en parqueaderos sin
          sacrificar seguridad real.
        </div>
        <button
          onClick={onClose}
          style={{
            marginTop: 20, width: '100%', padding: '11px 0',
            borderRadius: 10, border: `1px solid ${GEO_BLUE}`,
            background: 'transparent', color: GEO_BLUE,
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
        >Entendido</button>
      </div>
    </div>
  )
}

function ParkingGeofenceCard({ armed, parkActive, parkRadius, geoLoading, radiusInput, onRadiusChange, onArm, onCancel }) {
  const [showInfo, setShowInfo] = useState(false)
  const canActivate = !armed || parkActive   // bloqueado si ARM normal activo sin geocerca

  return (
    <>
      {showInfo && <GeofenceInfoModal onClose={() => setShowInfo(false)} />}
      <div style={{
        padding: 14, marginBottom: 12,
        borderRadius: 14,
        border: `1px solid ${parkActive ? `${GEO_BLUE}80` : 'var(--border)'}`,
        background: parkActive ? `${GEO_BLUE}12` : 'var(--card)',
        transition: 'all 0.2s',
      }}>
        {/* Encabezado */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 14, color: parkActive ? GEO_BLUE : 'var(--text3)' }}>📍</span>
          <div style={{
            flex: 1, fontSize: 10, fontWeight: 700, letterSpacing: '1.2px',
            color: parkActive ? GEO_BLUE : 'var(--text3)', textTransform: 'uppercase',
          }}>
            {parkActive ? `Geocerca activa · ${parkRadius}m` : 'Modo Parqueadero'}
          </div>
          <InfoCircle onClick={() => setShowInfo(true)} />
        </div>

        {/* Descripción */}
        <div style={{
          fontSize: 11, color: 'var(--text2)', lineHeight: 1.5,
          marginBottom: parkActive ? 12 : 6,
        }}>
          {parkActive
            ? 'La moto está vigilada. Movimiento dentro del radio → alerta silenciosa. Si sale de la zona → alarma completa.'
            : 'Arma sin sirena dentro de un radio. Ideal para parqueaderos.'}
        </div>

        {/* Slider de radio — solo visible antes de armar */}
        {!parkActive && (
          <div style={{ marginBottom: 10 }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: 4,
            }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: GEO_BLUE }}>
                📍 Radio: {radiusInput ?? 80}m
              </span>
              <span style={{ fontSize: 10, color: 'var(--text3)' }}>50m – 500m</span>
            </div>
            <input
              type="range"
              min={50} max={500} step={10}
              value={radiusInput ?? 80}
              disabled={!canActivate || geoLoading}
              onChange={e => onRadiusChange?.(parseInt(e.target.value, 10))}
              style={{
                width: '100%',
                accentColor: GEO_BLUE,
                cursor: (!canActivate || geoLoading) ? 'not-allowed' : 'pointer',
                opacity: (!canActivate || geoLoading) ? 0.5 : 1,
              }}
            />
          </div>
        )}

        {/* Botón principal */}
        <button
          onClick={parkActive ? onCancel : onArm}
          disabled={!canActivate || geoLoading}
          style={{
            width: '100%', padding: '11px 0',
            borderRadius: 10,
            border: `1px solid ${!canActivate ? 'var(--border)' : parkActive ? '#b71c1c80' : `${GEO_BLUE}80`}`,
            background: !canActivate
              ? 'var(--card-alt)'
              : parkActive ? 'rgba(183,28,28,0.08)' : `${GEO_BLUE}14`,
            color: !canActivate
              ? 'var(--text3)'
              : parkActive ? '#e53935' : GEO_BLUE,
            fontSize: 13, fontWeight: 700,
            cursor: (!canActivate || geoLoading) ? 'not-allowed' : 'pointer',
            opacity: (!canActivate || geoLoading) ? 0.6 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            transition: 'all 0.15s',
          }}
        >
          {geoLoading
            ? <Spinner color={parkActive ? '#e53935' : GEO_BLUE} />
            : <>
                <span style={{ fontSize: 14 }}>{parkActive ? '🚫' : '🅿️'}</span>
                {parkActive ? 'Cancelar geocerca' : 'Armar con geocerca'}
              </>}
        </button>

        {/* Mensaje de bloqueo */}
        {armed && !parkActive && (
          <div style={{
            marginTop: 8, fontSize: 10, color: 'var(--text3)',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <span>🔒</span>
            Desarma primero para usar el modo parqueadero
          </div>
        )}
      </div>
    </>
  )
}

// Banner de salida de geocerca — top-fixed, visible 10s
function GeofenceExitBanner({ onDismiss }) {
  return (
    <div style={{
      position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
      zIndex: 9500, width: 'min(480px, calc(100vw - 32px))',
      background: '#b71c1c', borderRadius: 14,
      padding: '14px 18px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'flex-start', gap: 14,
    }}>
      <span style={{ fontSize: 26, flexShrink: 0 }}>🚨</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', letterSpacing: 0.5, marginBottom: 3 }}>
          ¡MOTO FUERA DE LA GEOCERCA!
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>
          La alarma completa se activó automáticamente.
        </div>
      </div>
      <button
        onClick={onDismiss}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'rgba(255,255,255,0.7)', fontSize: 18, flexShrink: 0,
          padding: 0, lineHeight: 1,
        }}
      >✕</button>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

const AUTO_SETTINGS_KEY  = 'argus:engine_auto'
const RISK_AUTO_KEY      = 'argus:auto_sensitivity'
const ACTIVE_ROOM_KEY    = 'argus:active_room'

function loadAutoSettings() {
  try {
    return JSON.parse(localStorage.getItem(AUTO_SETTINGS_KEY) ?? 'null') ?? {
      autoCutOnArm: false,
      autoRestoreOnDisarm: true,
    }
  } catch { return { autoCutOnArm: false, autoRestoreOnDisarm: true } }
}

export default function SecurityPage() {
  const { status, setStatus, deviceId, addAlert, alarmActive, setAlarmActive, setParkState, gps, motos } = useStore()
  const navigate = useNavigate()
  const [loading, setLoading]       = useState(false)
  const [cmdLoading, setCmdLoading] = useState(null)
  const [lastResult, setLastResult] = useState(null)
  const [autoSettings, setAutoSettings]     = useState(loadAutoSettings)
  const [autoSensitivity, setAutoSensitivity] = useState(
    () => localStorage.getItem(RISK_AUTO_KEY) === 'true'
  )
  const [sensitivity, setSensitivity]   = useState(
    () => parseInt(localStorage.getItem('argus:sensitivity') ?? '2', 10)
  )
  // Geocerca de estacionamiento
  const [parkActive,     setParkActive]     = useState(false)
  const [parkRadius,     setParkRadius]     = useState(80)
  const [parkLat,        setParkLat]        = useState(null)
  const [parkLng,        setParkLng]        = useState(null)
  const [radiusInput,    setRadiusInput]    = useState(80)   // radio que el usuario elige antes de armar
  const [geoLoading,     setGeoLoading]     = useState(false)
  const [geoExitBanner,  setGeoExitBanner]  = useState(false)
  const geoExitTimerRef = useRef(null)
  const [roomLoading, setRoomLoading] = useState(false)
  const [activeRoomData, setActiveRoomData] = useState(() => {
    try {
      const stored = sessionStorage.getItem(ACTIVE_ROOM_KEY)
      return stored ? JSON.parse(stored) : null
    } catch { return null }
  })

  const alarmBeepRef   = useRef(null)

  const engineCut = status?.motorCut ?? false
  // Ref de intención: solo se escribe por comandos explícitos (ENGINE_CUT / ENGINE_RESTORE).
  // Nunca se sobreescribe por polling, así el pre-DISARM ENGINE_RESTORE sigue siendo
  // correcto aunque el poll de 15s llegue entre ARM y DISARM con motorCut:false del servidor.
  const motorCutIntentRef = useRef(false)

  const playBeep = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'square'
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.25, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)
      osc.start()
      osc.stop(ctx.currentTime + 0.35)
    } catch { /* contexto de audio no disponible */ }
  }, [])

  const startAlarm = useCallback(() => {
    setAlarmActive(true)
    playBeep()
    if (alarmBeepRef.current) clearInterval(alarmBeepRef.current)
    alarmBeepRef.current = setInterval(playBeep, 1200)
  }, [playBeep, setAlarmActive])

  const dismissAlarm = useCallback(() => {
    setAlarmActive(false)
    clearInterval(alarmBeepRef.current)
    alarmBeepRef.current = null
  }, [setAlarmActive])

  // Suscripción a alertas en tiempo real — activa la alarma si llega STATE_ALERT
  useEffect(() => {
    const handleAlert = (data) => {
      if (data.deviceId && data.deviceId !== deviceId) return
      addAlert({ id: data._id ?? Date.now(), type: data.type, timestamp: data.timestamp ?? new Date().toISOString() })
      if (data.type === 'STATE_ALERT' || data.type === 'STATE_PURSUIT') {
        setStatus(s => ({ ...s, state: data.type }))
        // STATE_PURSUIT = rastreo silencioso confirmado; no activa la alarma
        if (data.type === 'STATE_ALERT') startAlarm()
      }
    }
    const handleGeoExit = (data) => {
      if (data.deviceId && data.deviceId !== deviceId) return
      setParkActive(false)
      setParkState({ active: false })
      setGeoExitBanner(true)
      clearTimeout(geoExitTimerRef.current)
      geoExitTimerRef.current = setTimeout(() => setGeoExitBanner(false), 10000)
    }
    const handleRiskAlert = (data) => {
      if (data.deviceId && data.deviceId !== deviceId) return
      if (localStorage.getItem(RISK_AUTO_KEY) !== 'true') return
      const cmd = data.event === 'enter' ? 'SENSITIVITY_HIGH' : 'SENSITIVITY_MEDIUM'
      sendCommand(deviceId, cmd).catch(() => {})
    }
    connect(null, null, handleAlert, handleRiskAlert, handleGeoExit)
    return () => {
      getSocket()?.off('alert:new', handleAlert)
      getSocket()?.off('geofence:exit', handleGeoExit)
      dismissAlarm()
      clearTimeout(geoExitTimerRef.current)
    }
  }, [deviceId, addAlert, setStatus, startAlarm, dismissAlarm])

  // Fetch del estado de geocerca al montar
  useEffect(() => {
    if (!deviceId) return
    getActiveGeofence(deviceId)
      .then(({ data }) => {
        const r = data.radius_m ?? 80
        setParkActive(true)
        setParkRadius(r)
        setParkLat(data.lat ?? null)
        setParkLng(data.lng ?? null)
        setParkState({ active: true, lat: data.lat ?? null, lng: data.lng ?? null, radius: r })
      })
      .catch(() => { /* 404 = sin geocerca activa, estado por defecto false */ })
  }, [deviceId, setParkState])

  const handleGeoArm = async (radius = radiusInput) => {
    if (geoLoading) return
    setGeoLoading(true)
    try {
      const { data } = await createGeofence(deviceId, { radiusM: radius })
      const r = data.radiusM ?? radius
      setParkActive(true)
      setParkRadius(r)
      setParkLat(data.lat ?? null)
      setParkLng(data.lng ?? null)
      setStatus(s => ({ ...s, armed: true }))
      setParkState({ active: true, lat: data.lat ?? null, lng: data.lng ?? null, radius: r })
      if (autoSettings.autoCutOnArm) {
        await sendCommand(deviceId, 'ENGINE_CUT').catch(() => {})
        motorCutIntentRef.current = true
        setStatus(s => ({ ...s, motorCut: true }))
      }
    } catch {
      /* sin feedback inline — el dispositivo puede estar offline (encolado) */
    } finally {
      setGeoLoading(false)
    }
  }

  const handleGeoCancel = async () => {
    if (geoLoading) return
    setGeoLoading(true)
    try {
      // Restaurar motor ANTES de cancelar para que ENGINE_RESTORE llegue al ESP32
      // antes que el DISARM que encola deleteGeofence().
      const shouldRestore =
        autoSettings.autoRestoreOnDisarm &&
        (motorCutIntentRef.current || engineCut)
      if (shouldRestore) {
        await sendCommand(deviceId, 'ENGINE_RESTORE').catch(() => {})
        motorCutIntentRef.current = false
        setStatus(s => ({ ...s, motorCut: false }))
      }
      await deleteGeofence(deviceId)
      setParkActive(false)
      setStatus(s => ({ ...s, armed: false }))
      setParkState({ active: false })
    } catch { /* idem */ } finally {
      setGeoLoading(false)
    }
  }

  const handleSensitivity = useCallback((key) => {
    const idx = SENS_LEVELS.findIndex(s => s.key === key)
    if (idx >= 0) {
      setSensitivity(idx)
      localStorage.setItem('argus:sensitivity', String(idx))
    }
  }, [])

  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await getDeviceStatus(deviceId)
      setStatus(data)
    } catch { /* offline */ }
  }, [deviceId, setStatus])

  useEffect(() => {
    setLoading(true)
    fetchStatus().finally(() => setLoading(false))
    const iv = setInterval(fetchStatus, 15000)
    return () => clearInterval(iv)
  }, [fetchStatus])


  const handleOpenRoom = async () => {
    if (!deviceId || roomLoading) return
    setRoomLoading(true)
    try {
      const lastPos = (gps?.lat != null && gps?.lon != null)
        ? { lat: gps.lat, lng: gps.lon }
        : null
      // STATE_PURSUIT: GPS cada 10s, sin sirena automática, sin corte de motor (firmware June 23)
      sendCommand(deviceId, 'PURSUIT_CONFIRM').catch(() => {})
      setStatus(s => ({ ...s, state: 'STATE_PURSUIT' }))
      addAlert({ id: Date.now(), type: 'PURSUIT_CONFIRM', timestamp: new Date().toISOString() })
      if (lastPos) createIncidentApi(deviceId, lastPos.lat, lastPos.lng).catch(() => {})
      const res  = await createSecureRoomApi(deviceId, lastPos)
      const moto = motos?.[0] ?? null
      const stateData = {
        roomData:          res.data,
        deviceId,
        motoAlias:         moto?.alias ?? null,
        motoPlaca:         moto?.placa ?? null,
        lastKnownPosition: lastPos,
      }
      sessionStorage.setItem(ACTIVE_ROOM_KEY, JSON.stringify(stateData))
      navigate('/recovery-room', { state: stateData })
    } catch (err) {
      alert('Error al reportar robo: ' + (err.response?.data?.error ?? err.message))
      setRoomLoading(false)
    }
  }

  const handleRejoinRoom = () => {
    if (!activeRoomData) return
    navigate('/recovery-room', { state: activeRoomData })
  }

  const handleCommand = async (command) => {
    // Sensibilidad: actualizar UI inmediatamente y NO bloquear el flujo ARM/DISARM.
    if (command.startsWith('SENSITIVITY_')) {
      handleSensitivity(command)
      return
    }
    if (cmdLoading) return
    setCmdLoading(command)
    setLastResult(null)
    try {
      // Pre-DISARM: restaurar motor si corresponde.
      // Usa motorCutIntentRef (intencion explicita) ademas de engineCut (estado del servidor),
      // para que el poll de 15s con motorCut:false no cancele el restore si el dispositivo
      // todavia no actualizo su estado tras ENGINE_CUT.
      const shouldRestore = command === 'DISARM' &&
        autoSettings.autoRestoreOnDisarm &&
        (motorCutIntentRef.current || engineCut)
      if (shouldRestore) {
        await sendCommand(deviceId, 'ENGINE_RESTORE').catch(() => {})
        motorCutIntentRef.current = false
        setStatus(s => ({ ...s, motorCut: false }))
      }

      const { data } = await sendCommand(deviceId, command)
      setLastResult(data.delivered
        ? { ok: true,  msg: `Comando ${command} entregado al dispositivo` }
        : { ok: false, msg: `Dispositivo offline. Comando ${command} encolado.` }
      )
      addAlert({ id: Date.now(), type: command, timestamp: new Date().toISOString() })

      // Actualizaciones optimistas -- respuesta inmediata sin esperar el proximo poll.
      if (command === 'ENGINE_CUT') {
        motorCutIntentRef.current = true
        setStatus(s => ({ ...s, motorCut: true }))
      }
      if (command === 'ENGINE_RESTORE') {
        motorCutIntentRef.current = false
        setStatus(s => ({ ...s, motorCut: false }))
      }
      if (command === 'ARM') {
        setStatus(s => ({ ...s, armed: true }))
        if (autoSettings.autoCutOnArm) {
          await sendCommand(deviceId, 'ENGINE_CUT').catch(() => {})
          motorCutIntentRef.current = true
          setStatus(s => ({ ...s, motorCut: true }))
        }
      }
      if (command === 'DISARM') {
        motorCutIntentRef.current = false
        setStatus(s => ({ ...s, armed: false, motorCut: false }))
        setAlarmActive(false)
      }
      if (command === 'PURSUIT_CONFIRM') {
        // Firmware June 23: STATE_PURSUIT activa GPS continuo pero NO auto-corta motor ni activa sirena
        setStatus(s => ({ ...s, state: 'STATE_PURSUIT' }))
        if (deviceId && status?.lat != null && status?.lon != null) {
          createIncidentApi(deviceId, status.lat, status.lon).catch(() => {})
        }
      }
      if (command === 'SIREN_ON')  setAlarmActive(true)
      if (command === 'SIREN_OFF') setAlarmActive(false)

    } catch {
      setLastResult({ ok: false, msg: 'Error de conexion con el servidor' })
    } finally {
      setCmdLoading(null)
    }
  }

  const handleAutoChange = (key, value) => {
    const next = key === 'cut'
      ? { ...autoSettings, autoCutOnArm: value }
      : { ...autoSettings, autoRestoreOnDisarm: value }
    setAutoSettings(next)
    localStorage.setItem(AUTO_SETTINGS_KEY, JSON.stringify(next))
  }

  const handleAutoSensitivityToggle = () => {
    const next = !autoSensitivity
    setAutoSensitivity(next)
    localStorage.setItem(RISK_AUTO_KEY, String(next))
  }

  const armed = status?.armed ?? false

  return (
    <div style={{ padding: '20px 20px 40px', background: 'var(--bg)', minHeight: '100vh' }}>
      {alarmActive && <AlarmBanner onDismiss={dismissAlarm} />}
      {geoExitBanner && <GeofenceExitBanner onDismiss={() => setGeoExitBanner(false)} />}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .sec-grid {
          display: grid;
          grid-template-columns: minmax(0,1fr) minmax(0,1fr);
          gap: 16px;
          max-width: 900px;
          margin: 0 auto;
        }
        @media (max-width: 767px) {
          .sec-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="sec-grid">
        {/* ── Columna izquierda ── */}
        <div>
          <BigStatusPanel armed={armed} state={status?.state} loading={loading} />
          {/* ARM normal deshabilitado si geocerca activa */}
          <ArmButtons
            cmdLoading={parkActive ? 'blocked' : cmdLoading}
            onCommand={handleCommand}
          />
          <ParkingGeofenceCard
            armed={armed}
            parkActive={parkActive}
            parkRadius={parkRadius}
            geoLoading={geoLoading}
            radiusInput={radiusInput}
            onRadiusChange={setRadiusInput}
            onArm={() => handleGeoArm(radiusInput)}
            onCancel={handleGeoCancel}
          />
          <BleAppOnlyCard />
          <CommandsCard
            cmdLoading={cmdLoading}
            lastResult={lastResult}
            engineCut={engineCut}
            alarmActive={alarmActive}
            onCommand={handleCommand}
          />
          <SensitivityCard
            currentLevel={sensitivity}
            onCommand={handleCommand}
            cmdLoading={cmdLoading}
          />
        </div>

        {/* ── Columna derecha ── */}
        <div>
          <BleAutomationCard />
          <EngineAutoCard
            autoCutOnArm={autoSettings.autoCutOnArm}
            autoRestoreOnDisarm={autoSettings.autoRestoreOnDisarm}
            onChange={handleAutoChange}
          />
          <AutoSensitivityCard
            enabled={autoSensitivity}
            onToggle={handleAutoSensitivityToggle}
          />
          <EmergencyCard
            cmdLoading={cmdLoading}
            engineCut={engineCut}
            onCommand={handleCommand}
            onOpenRoom={handleOpenRoom}
            roomLoading={roomLoading}
            activeRoom={activeRoomData}
            onRejoinRoom={handleRejoinRoom}
          />
          <Link to="/history" style={{ textDecoration: 'none' }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 16px',
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              cursor: 'pointer',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18 }}>📋</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text1)' }}>Historial de eventos</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>Alertas, comandos, trazabilidad</div>
                </div>
              </div>
              <span style={{ fontSize: 16, color: 'var(--text3)' }}>›</span>
            </div>
          </Link>
        </div>
      </div>

    </div>
  )
}
