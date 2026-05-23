/**
 * @fileoverview Página de Onboarding — registro de moto y asignación de dispositivo.
 *
 * PROPÓSITO:
 *   Guía al usuario recién registrado (sin dispositivo asignado) a través de
 *   dos pasos para activar su plan:
 *     Paso 1: Registrar los datos de la moto (alias, placa, marca, modelo).
 *     Paso 2: Ingresar el ID del dispositivo ESP32 y vincularlo a la moto.
 *   Al finalizar, refresca el perfil del usuario para obtener el nuevo deviceId
 *   y redirige al panel principal.
 *
 * FLUJO DE ONBOARDING:
 *   /onboarding → Paso 1 (formulario moto) → POST /api/motos
 *              → Paso 2 (formulario device) → POST /api/motos/:id/assign-device
 *              → getMeApi() → refreshUser() → navigate('/location')
 *
 * VARIABLES CRÍTICAS:
 *   step        — Controla qué formulario se muestra (1 o 2).
 *   motoId      — UUID de la moto creada en el Paso 1. Necesario para el Paso 2.
 *   deviceIdInput — El ID del ESP32 ingresado por el usuario.
 *                   Debe coincidir exactamente con el ID del hardware.
 *
 * ESTADOS DEL COMPONENTE:
 *   step=1, motoId=null     → formulario de datos de la moto
 *   step=2, motoId!=null    → formulario de ID del dispositivo
 *   loading=true            → spinner mientras espera respuesta del backend
 *   error!=''               → mensaje de error visible al usuario
 *
 * EDGE CASES:
 *   - Si el usuario ya tiene un deviceId (accedió a /onboarding manualmente),
 *     Layout.jsx no lo enviaría aquí. Pero como defensa, OnboardingPage
 *     tampoco bloquea ese caso.
 *   - Si el Paso 1 falla (500 del backend), el usuario puede reintentar
 *     sin consecuencias (la moto no queda en estado inconsistente).
 *   - Si el Paso 2 falla, el usuario puede volver a intentar con el mismo
 *     motoId (ya está almacenado en state).
 *
 * @module pages/OnboardingPage
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { createMoto, assignDevice, getMeApi } from '../api/apiService.js'

/**
 * @brief Indicador visual de progreso de pasos (1 de 2 / 2 de 2).
 *
 * PROPÓSITO:
 *   Dar contexto al usuario sobre cuánto queda del flujo.
 *   Dos pasos es suficientemente corto para no necesitar barra de progreso.
 *
 * @param {object} props
 * @param {number} props.current  Paso actual (1-based)
 * @param {number} props.total    Total de pasos
 */
function StepIndicator({ current, total }) {
  return (
    <div className="flex items-center gap-2 justify-center mb-6">
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1
        // Paso activo: relleno azul. Paso completado: verde. Pendiente: gris.
        const isActive    = n === current
        const isCompleted = n < current
        return (
          <div key={n} className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
              style={{
                background: isCompleted ? 'var(--green)' : isActive ? 'var(--blue)' : 'var(--card-alt)',
                color: (isActive || isCompleted) ? '#fff' : 'var(--text3)',
              }}
            >
              {isCompleted ? '✓' : n}
            </div>
            {/* Línea conectora entre pasos, no se muestra después del último */}
            {n < total && (
              <div
                className="w-10 h-0.5 rounded"
                style={{ background: isCompleted ? 'var(--green)' : 'var(--border)' }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * @brief Campo de formulario estilizado con las variables CSS del proyecto.
 *
 * PROPÓSITO:
 *   Evitar repetir el mismo bloque de label + input en cada campo del
 *   formulario. Sigue el mismo estilo visual que LoginPage.jsx.
 *
 * @param {object} props
 * @param {string}   props.label        Texto del label visible
 * @param {string}   props.type         Tipo de input HTML (text, number, etc.)
 * @param {string}   props.value        Valor controlado del input
 * @param {Function} props.onChange     Handler onChange
 * @param {string}   props.placeholder  Placeholder descriptivo
 * @param {boolean}  [props.required]   Si se marca con asterisco visual
 */
function Field({ label, type = 'text', value, onChange, placeholder, required = false }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium" style={{ color: 'var(--text2)' }}>
        {label}
        {/* Asterisco para campos requeridos — solo visual, la validación es JS */}
        {required && <span style={{ color: 'var(--red)' }}> *</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="rounded-md px-3 py-2 text-sm outline-none border transition-colors"
        style={{ background: 'var(--card-alt)', borderColor: 'var(--border)', color: 'var(--text1)' }}
        onFocus={e  => e.target.style.borderColor = 'var(--blue)'}
        onBlur={e   => e.target.style.borderColor = 'var(--border)'}
      />
    </div>
  )
}

/**
 * @brief Pantalla principal de Onboarding (wizard de 2 pasos).
 *
 * PROPÓSITO:
 *   Es la primera pantalla que ve un usuario recién registrado que no tiene
 *   ningún dispositivo ESP32 vinculado. Sin completar este flujo, el usuario
 *   no puede usar Location, Security ni History (no hay deviceId).
 *
 * FLUJO LÓGICO:
 *   1. Renderizar el paso actual (1 o 2) según el estado interno.
 *   2. Paso 1: validar campos mínimos → POST /api/motos → guardar motoId en state.
 *   3. Paso 2: validar deviceId no vacío → POST /api/motos/:id/assign-device.
 *   4. Llamar getMeApi() para obtener perfil fresco con el nuevo deviceId.
 *   5. refreshUser() actualiza el store → Layout detecta deviceId y permite navegar.
 *   6. navigate('/location') lleva al usuario al panel principal.
 *
 * DEPENDENCIAS:
 *   useStore.refreshUser()  — para actualizar deviceId sin logout
 *   createMoto()            — POST /api/motos
 *   assignDevice()          — POST /api/motos/:id/assign-device
 *   getMeApi()              — GET /api/auth/me (perfil fresco)
 */
export default function OnboardingPage() {
  const navigate     = useNavigate()
  const refreshUser  = useStore((s) => s.refreshUser)
  const logout       = useStore((s) => s.logout)

  // ── Estado del wizard ──────────────────────────────────────────────────
  const [step, setStep]     = useState(1)      // Paso actual: 1 o 2
  const [motoId, setMotoId] = useState(null)   // UUID de la moto creada en Paso 1

  // ── Formulario Paso 1: datos de la moto ───────────────────────────────
  const [alias, setAlias]   = useState('')
  const [placa, setPlaca]   = useState('')
  const [marca, setMarca]   = useState('')
  const [modelo, setModelo] = useState('')
  const [color, setColor]   = useState('')
  const [anio, setAnio]     = useState('')

  // ── Formulario Paso 2: ID del dispositivo ─────────────────────────────
  const [deviceIdInput, setDeviceIdInput] = useState('')

  // ── Estado UI compartido ──────────────────────────────────────────────
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  /**
   * @brief Maneja el envío del Paso 1: crear la moto en el backend.
   *
   * PROPÓSITO:
   *   Valida que alias y placa estén presentes (mínimo requerido por UX).
   *   Los campos marca, modelo, color, año son opcionales.
   *   Si la moto se crea exitosamente, avanza al Paso 2 con el motoId.
   *
   * FLUJO:
   *   1. Validar campos requeridos.
   *   2. POST /api/motos con todos los campos completados.
   *   3. Guardar moto.id en state para el Paso 2.
   *   4. Avanzar al Paso 2.
   *
   * @param {React.FormEvent} e  Evento del formulario
   */
  const handleStep1 = async (e) => {
    e.preventDefault()
    if (!alias.trim() || !placa.trim()) {
      setError('El alias y la placa son requeridos')
      return
    }

    setLoading(true)
    setError('')
    try {
      const { data: moto } = await createMoto({
        alias: alias.trim(),
        placa: placa.trim().toUpperCase(), // Normalizar placa a mayúsculas
        marca: marca.trim(),
        modelo: modelo.trim(),
        color: color.trim(),
        // Convertir anio a número si se ingresó — el backend espera integer
        anio: anio ? parseInt(anio, 10) : undefined,
      })
      // Guardar el UUID de la moto para usarlo en el Paso 2
      setMotoId(moto.id)
      setStep(2)
    } catch (err) {
      const msg = err.response?.data?.message ?? 'Error al registrar la moto'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  /**
   * @brief Maneja el envío del Paso 2: vincular el ESP32 a la moto.
   *
   * PROPÓSITO:
   *   Después de asignar el device, el JWT del usuario no incluye el nuevo
   *   deviceId todavía. Por eso se llama getMeApi() para obtener datos frescos
   *   y luego refreshUser() para actualizar el store sin necesidad de logout.
   *
   * FLUJO:
   *   1. Validar que el deviceId no esté vacío.
   *   2. POST /api/motos/:motoId/assign-device con el deviceId ingresado.
   *   3. GET /api/auth/me → perfil fresco con deviceIds actualizados.
   *   4. refreshUser(userData) → actualiza store.deviceId → desbloquea Layout.
   *   5. navigate('/location') → pantalla principal.
   *
   * EDGE CASE:
   *   Si getMeApi() falla después de un assignDevice exitoso, el usuario
   *   está en estado inconsistente (device asignado en BD pero store desactualizado).
   *   En ese caso, el logout y re-login resuelve el problema. Por ahora se muestra
   *   un mensaje descriptivo.
   *
   * @param {React.FormEvent} e  Evento del formulario
   */
  const handleStep2 = async (e) => {
    e.preventDefault()
    if (!deviceIdInput.trim()) {
      setError('Ingresá el ID del dispositivo')
      return
    }

    setLoading(true)
    setError('')
    try {
      // Paso 2a: vincular el ESP32 a la moto en el backend
      await assignDevice(motoId, deviceIdInput.trim().toUpperCase())

      // Paso 2b: refrescar el perfil para obtener el nuevo deviceId en el JWT
      const { data: userData } = await getMeApi()

      // Paso 2c: actualizar el store con el perfil fresco
      // Esto dispara el re-render de Layout que detecta deviceId != null
      refreshUser(userData)

      // Paso 2d: navegar al panel principal
      navigate('/location', { replace: true })
    } catch (err) {
      const msg = err.response?.data?.message ?? 'Error al vincular el dispositivo'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-8"
      style={{ background: 'var(--bg)' }}
    >
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold" style={{ color: 'var(--blue)' }}>Argus</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text2)' }}>
            Configuración inicial
          </p>
        </div>

        {/* Indicador de pasos */}
        <StepIndicator current={step} total={2} />

        {/* Contenedor de la tarjeta */}
        <div
          className="rounded-xl p-6 border"
          style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
        >

          {/* ── Paso 1: Datos de la moto ── */}
          {step === 1 && (
            <>
              <div className="mb-5">
                <h2 className="text-base font-semibold" style={{ color: 'var(--text1)' }}>
                  Registrá tu moto
                </h2>
                <p className="text-sm mt-1" style={{ color: 'var(--text2)' }}>
                  Ingresá los datos del vehículo donde instalarás el dispositivo Argus.
                </p>
              </div>

              <form onSubmit={handleStep1} className="flex flex-col gap-4">
                <Field
                  label="Alias"
                  value={alias}
                  onChange={e => setAlias(e.target.value)}
                  placeholder="ej: Mi Honda roja"
                  required
                />
                <Field
                  label="Placa"
                  value={placa}
                  onChange={e => setPlaca(e.target.value)}
                  placeholder="ej: ABC-123"
                  required
                />
                {/* Fila de dos columnas para marca y modelo */}
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    label="Marca"
                    value={marca}
                    onChange={e => setMarca(e.target.value)}
                    placeholder="ej: Honda"
                  />
                  <Field
                    label="Modelo"
                    value={modelo}
                    onChange={e => setModelo(e.target.value)}
                    placeholder="ej: CB500F"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    label="Color"
                    value={color}
                    onChange={e => setColor(e.target.value)}
                    placeholder="ej: Rojo"
                  />
                  <Field
                    label="Año"
                    type="number"
                    value={anio}
                    onChange={e => setAnio(e.target.value)}
                    placeholder="ej: 2022"
                  />
                </div>

                {/* Mensaje de error */}
                {error && (
                  <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="py-2 rounded-md text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50 mt-1"
                  style={{ background: 'var(--blue)', color: '#fff' }}
                >
                  {loading ? 'Registrando…' : 'Continuar →'}
                </button>
              </form>
            </>
          )}

          {/* ── Paso 2: ID del dispositivo ── */}
          {step === 2 && (
            <>
              <div className="mb-5">
                <h2 className="text-base font-semibold" style={{ color: 'var(--text1)' }}>
                  Vinculá tu dispositivo
                </h2>
                <p className="text-sm mt-1" style={{ color: 'var(--text2)' }}>
                  Ingresá el ID del dispositivo Argus que instalaste en tu moto.
                  Lo encontrás en la etiqueta del hardware o en la app de configuración BLE.
                </p>
              </div>

              <form onSubmit={handleStep2} className="flex flex-col gap-4">
                <Field
                  label="ID del dispositivo"
                  value={deviceIdInput}
                  onChange={e => setDeviceIdInput(e.target.value)}
                  placeholder="ej: ARGUS-1237E630"
                  required
                />

                {/* Ayuda visual sobre dónde encontrar el ID */}
                <div
                  className="rounded-lg p-3 text-xs"
                  style={{ background: 'var(--blue-10)', color: 'var(--text2)' }}
                >
                  El ID del dispositivo tiene el formato <strong style={{ color: 'var(--blue)' }}>ARGUS-XXXXXXXX</strong> y
                  está impreso en la etiqueta del módulo ESP32.
                </div>

                {/* Mensaje de error */}
                {error && (
                  <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>
                )}

                <div className="flex gap-3 mt-1">
                  {/* Botón volver al Paso 1 para corregir datos de la moto */}
                  <button
                    type="button"
                    onClick={() => { setStep(1); setError('') }}
                    disabled={loading}
                    className="flex-1 py-2 rounded-md text-sm font-medium transition-opacity disabled:opacity-50"
                    style={{ background: 'var(--card-alt)', color: 'var(--text2)' }}
                  >
                    ← Volver
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-2 rounded-md text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                    style={{ background: 'var(--blue)', color: '#fff' }}
                  >
                    {loading ? 'Vinculando…' : 'Activar dispositivo'}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>

        {/* Opción de cerrar sesión si el usuario cambió de idea */}
        <p className="text-center text-xs mt-4" style={{ color: 'var(--text3)' }}>
          ¿No es tu cuenta?{' '}
          <button
            onClick={logout}
            className="underline"
            style={{ color: 'var(--text2)' }}
          >
            Cerrar sesión
          </button>
        </p>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   RESUMEN DEL MÓDULO — OnboardingPage
   ═══════════════════════════════════════════════════════════

   EXPLICACIÓN PARA HUMANO:
   Esta pantalla aparece una sola vez: cuando el usuario se registra y todavía
   no tiene ningún dispositivo Argus vinculado. Tiene dos pasos: primero
   registra los datos de la moto (alias, placa, marca, etc.) y luego ingresa
   el ID del ESP32 físico para vincularlo. Al terminar, el sistema actualiza
   el perfil del usuario sin necesidad de hacer logout, y lo lleva directo
   al panel de ubicación.

   PSEUDOCÓDIGO:
   montar: step=1, motoId=null

   Paso 1 submit:
     validar alias + placa no vacíos
     POST /api/motos { alias, placa, marca, modelo, color, anio }
     si OK → guardar moto.id, avanzar a step=2
     si error → mostrar mensaje

   Paso 2 submit:
     validar deviceIdInput no vacío
     POST /api/motos/:motoId/assign-device { deviceId }
     si OK → GET /api/auth/me → refreshUser(userData)
              → navigate('/location')
     si error → mostrar mensaje

   DIAGRAMA MENTAL:
   Usuario sin dispositivo → /onboarding
   Paso 1: [alias][placa][marca][modelo][color][año] → POST /api/motos
   Paso 2: [deviceId] → POST /api/motos/:id/assign-device
                      → getMeApi() → refreshUser() → /location

   ═══════════════════════════════════════════════════════════ */
