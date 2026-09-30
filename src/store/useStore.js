/**
 * @fileoverview Store global de estado de la Web Usuario (Zustand).
 *
 * PROPÓSITO:
 *   Centraliza el estado reactivo compartido entre componentes React.
 *   Reemplaza prop drilling y Context API para los dominios principales:
 *   auth, GPS, estado del dispositivo, alertas y motos.
 *
 * VARIABLES CRÍTICAS:
 *   token     — JWT firmado. Si es null → usuario no autenticado.
 *               Si está corrupto en localStorage, el interceptor de axios
 *               lo eliminará en el primer 401.
 *   user      — Objeto del usuario: { id, email, role, deviceIds }.
 *               deviceIds es el array de ESP32s vinculados al usuario.
 *   deviceId  — El ESP32 "activo" actualmente. Derivado de user.deviceIds[0].
 *               Null si el usuario no tiene dispositivos (flujo onboarding).
 *   motos     — Array de motos del usuario. Se carga en MotosPage y OnboardingPage.
 *
 * PERSISTENCIA:
 *   token y user se persisten en localStorage para sobrevivir recargas.
 *   El resto del estado (gps, status, alerts, motos) es efímero — se recarga
 *   del servidor en cada montaje del componente correspondiente.
 *
 * ESTADO DE AUTENTICACIÓN Y FLUJO DE ONBOARDING:
 *   user !== null && deviceId !== null → flujo normal (Location/Security/History)
 *   user !== null && deviceId === null → redirigir a /onboarding
 *   user === null                      → redirigir a /login
 *
 * RIESGO DE CONCURRENCIA:
 *   Zustand usa un modelo de actualizaciones síncronas. Los setters son seguros
 *   para llamar desde múltiples componentes concurrentemente. Sin mutexes necesarios.
 *
 * @module store/useStore
 */

import { create } from 'zustand'

/**
 * Rehidratación desde localStorage al cargar el módulo.
 *
 * POR QUÉ rehidratar FUERA del create():
 *   Si se hiciera dentro, la función se ejecutaría en cada render del store
 *   (en StrictMode doble). Ejecutar aquí garantiza que solo ocurre una vez
 *   al importar el módulo.
 *
 * EDGE CASE:
 *   Si argus_user fue almacenado con un formato incompatible (versión anterior
 *   del schema), el JSON.parse podría devolver un objeto sin deviceIds.
 *   El operador ?. protege contra esto.
 */
const stored = JSON.parse(localStorage.getItem('argus_user') || 'null')

// Aplicar el tema guardado en localStorage al documento inmediatamente
// (antes del primer render) para evitar parpadeo claro→oscuro
const storedTheme = localStorage.getItem('argus_theme') || 'dark'
document.documentElement.setAttribute('data-theme', storedTheme)

export const useStore = create((set) => ({

  // ── Tema ───────────────────────────────────────────────────────────────

  /** 'dark' | 'light' — persiste en localStorage y se aplica al data-theme del <html> */
  theme: storedTheme,

  setTheme: (theme) => {
    localStorage.setItem('argus_theme', theme)
    document.documentElement.setAttribute('data-theme', theme)
    set({ theme })
  },

  // ── Auth ────────────────────────────────────────────────────────────────

  /**
   * user: perfil del usuario autenticado.
   * Rehidratado desde localStorage para persistir entre recargas.
   * null = sesión no iniciada.
   */
  user: stored,

  /**
   * token: JWT raw. Se envía en cada request via interceptor de axios.
   * Rehidratado desde localStorage.
   */
  token: localStorage.getItem('argus_token') || null,

  /**
   * @brief Guarda la sesión del usuario tras login o registro exitoso.
   *
   * PROPÓSITO:
   *   Unifica en un solo setter todo lo que ocurre al autenticar:
   *   persiste en localStorage Y actualiza el store reactivo en un solo paso.
   *   Los componentes que consumen user/token reaccionan inmediatamente.
   *
   * FLUJO LÓGICO:
   *   1. Persistir token y user en localStorage (para sobrevivir recargas).
   *   2. Derivar deviceId del primer elemento de deviceIds.
   *   3. Actualizar el store para disparar re-renders.
   *
   * POR QUÉ derivar deviceId aquí:
   *   Centraliza la lógica: cualquier componente que necesite deviceId
   *   simplemente lo lee del store sin recalcular.
   *
   * @param {object} payload
   * @param {string}   payload.token  JWT firmado por el backend
   * @param {object}   payload.user   { id, email, role, deviceIds }
   */
  login: ({ token, user }) => {
    localStorage.setItem('argus_token', token)
    localStorage.setItem('argus_user', JSON.stringify(user))
    set({
      token,
      user,
      deviceId:       user.devices?.[0]?.id       ?? user.deviceIds?.[0] ?? null,
      deviceProtocol: user.devices?.[0]?.protocol ?? 'argus',
    })
  },

  /**
   * @brief Cierra la sesión: limpia localStorage y resetea todo el estado.
   *
   * PROPÓSITO:
   *   Garantiza que ningún dato sensible (token, GPS, alertas) persiste
   *   en memoria o localStorage después de cerrar sesión.
   *
   * POR QUÉ resetear también gps/status/alerts:
   *   Si el usuario vuelve a iniciar sesión con otra cuenta, no debe ver
   *   los datos del usuario anterior que quedaron en el store.
   */
  logout: () => {
    localStorage.removeItem('argus_token')
    localStorage.removeItem('argus_user')
    set({
      user: null,
      token: null,
      gps: null,
      status: null,
      deviceId: null,
      alerts: [],
      motos: [],
      subscription: null,
      alarmActive: false,
    })
  },

  /**
   * @brief Actualiza el token y deviceIds en el store sin hacer logout/login.
   *
   * PROPÓSITO:
   *   Después de asignar un device en el Onboarding, el backend no emite
   *   un nuevo JWT automáticamente. El frontend llama a getMeApi() para
   *   obtener los deviceIds actualizados y luego llama a refreshUser()
   *   para que el store refleje el nuevo estado sin reiniciar la sesión.
   *
   * FLUJO:
   *   OnboardingPage → assignDevice() → getMeApi() → refreshUser(userData)
   *
   * @param {object} userData  { id, email, role, deviceIds } — datos frescos del servidor
   */
  refreshUser: (userData) => {
    localStorage.setItem('argus_user', JSON.stringify(userData))
    set({
      user: userData,
      deviceId:       userData.devices?.[0]?.id       ?? userData.deviceIds?.[0] ?? null,
      deviceProtocol: userData.devices?.[0]?.protocol ?? 'argus',
    })
  },

  // ── GPS ────────────────────────────────────────────────────────────────

  /** Última posición GPS recibida (socket.io o polling). null si sin datos. */
  gps: null,

  /**
   * @brief Actualiza la posición GPS en el store.
   * @param {{ lat, lon, speed, timestamp }} gps  Datos de posición
   */
  setGps: (gps) => set({ gps }),

  // ── Device status ──────────────────────────────────────────────────────

  /** Estado del dispositivo: { connected, armed, lat, lon, speed, lastSeen }. null = no cargado. */
  status: null,

  /**
   * @brief Actualiza el estado del dispositivo en el store.
   * Acepta valor directo o función (s => nuevoEstado) para actualizaciones optimistas
   * que necesitan leer el estado anterior.
   * @param {object|Function} updater  Nuevo estado o función (prev) => nuevoEstado
   */
  setStatus: (updater) => typeof updater === 'function'
    ? set(s => ({ status: updater(s.status) }))
    : set({ status: updater }),

  /**
   * true cuando la sirena está activa por activación manual del usuario.
   * Compartido entre LocationPage y SecurityPage para sincronizar el botón.
   */
  alarmActive: false,
  setAlarmActive: (v) => set({ alarmActive: v }),

  // ── Alerts ────────────────────────────────────────────────────────────

  /**
   * alerts: array de eventos históricos y en tiempo real.
   * Ordenado descendente (más reciente primero).
   * Límite: 100 elementos para evitar crecimiento ilimitado de memoria.
   */
  alerts: [],

  /**
   * @brief Reemplaza el array completo de alertas (carga inicial desde el backend).
   * @param {Array} alerts  Array de alertas del endpoint GET /api/alerts/:deviceId
   */
  setAlerts: (alerts) => set({ alerts }),

  /**
   * @brief Agrega una alerta al inicio del array (evento en tiempo real).
   *
   * PROPÓSITO:
   *   Cuando llega un evento via socket.io (alert:new), se prepend al array
   *   existente en lugar de recargar todo desde el servidor.
   *
   * POR QUÉ limitar a 100:
   *   El array vive en memoria del navegador. Sin límite, una sesión larga
   *   con muchos eventos podría consumir memoria excesiva.
   *
   * @param {object} alert  Alerta nueva recibida via WebSocket
   */
  addAlert: (alert) => set((s) => ({ alerts: [alert, ...s.alerts].slice(0, 100) })),

  // ── Motos ──────────────────────────────────────────────────────────────

  /**
   * motos: lista de motos del usuario autenticado.
   * Se carga lazy (en demanda) desde MotosPage y OnboardingPage.
   * No se persiste en localStorage — se recarga en cada sesión.
   */
  motos: [],

  /**
   * @brief Reemplaza el array de motos del usuario.
   * @param {Array} motos  Array de motos del endpoint GET /api/motos
   */
  setMotos: (motos) => set({ motos }),

  /**
   * @brief Agrega una moto recién creada al store sin recargar del servidor.
   *
   * PROPÓSITO:
   *   Optimistic update: el Onboarding ya tiene el objeto de la moto creada
   *   (response del POST). Agregarlo directamente evita un round-trip extra.
   *
   * @param {object} moto  Objeto moto devuelto por POST /api/motos
   */
  addMoto: (moto) => set((s) => ({ motos: [...s.motos, moto] })),

  // ── Suscripción ────────────────────────────────────────────────────────

  /**
   * subscription: plan del usuario. null = no cargado aún.
   * Campos esperados: { plan: 'FREEMIUM'|'PREMIUM', status, expires_at }
   */
  subscription: null,

  /**
   * @brief Actualiza el plan de suscripción del usuario.
   * @param {object} subscription  Datos del plan desde el backend
   */
  setSubscription: (subscription) => set({ subscription }),

  // ── Geocerca de estacionamiento ────────────────────────────────────────

  /**
   * Estado de la geocerca activa. Compartido entre SecurityPage (escribe) y
   * LocationPage (lee para dibujar el círculo en el mapa).
   * Se resetea a false al cancelar, al hacer logout y al salir del radio.
   */
  parkActive: false,
  parkLat:    null,
  parkLng:    null,
  parkRadius: 80,

  /**
   * @brief Actualiza el estado de la geocerca. Llamado desde SecurityPage.
   * @param {{ active, lat, lng, radius }} state
   */
  setParkState: ({ active, lat = null, lng = null, radius = 80 }) =>
    set({ parkActive: active, parkLat: lat, parkLng: lng, parkRadius: radius }),

  // ── Device ID derivado ─────────────────────────────────────────────────

  /**
   * deviceId: ID del ESP32 activo.
   *
   * ORDEN DE PRIORIDAD al rehidratar:
   *   1. user.deviceIds[0] del localStorage (usuario ya tiene dispositivo)
   *   2. VITE_DEVICE_ID del .env (override de desarrollo)
   *   3. Fallback hardcodeado para tests manuales
   *
   * IMPORTANTE:
   *   Si deviceId es null, el usuario aún no completó el Onboarding.
   *   Layout.jsx detecta esto y redirige a /onboarding.
   *   No agregar el fallback hardcodeado en producción — puede apuntar
   *   al ESP32 físico de otro usuario si los IDs colisionan.
   */
  deviceId:       stored?.devices?.[0]?.id       ?? stored?.deviceIds?.[0] ?? import.meta.env.VITE_DEVICE_ID ?? null,
  deviceProtocol: stored?.devices?.[0]?.protocol ?? 'argus',
}))

/* ═══════════════════════════════════════════════════════════
   RESUMEN DEL MÓDULO — useStore
   ═══════════════════════════════════════════════════════════

   EXPLICACIÓN PARA HUMANO:
   Este archivo es la "memoria compartida" de la aplicación web. Cuando el
   usuario hace login, su token y perfil se guardan aquí y en localStorage.
   Cada pantalla lee del store lo que necesita: la ubicación lee `gps`,
   la seguridad lee `status`, el historial lee `alerts`, el onboarding lee
   `motos`. Al hacer logout, todo se borra simultáneamente.

   PSEUDOCÓDIGO:
   Al cargar:
     stored = localStorage.argus_user
     token  = localStorage.argus_token
     deviceId = stored.deviceIds[0] o null

   login({ token, user }) → guardar en localStorage + store
   logout()              → limpiar localStorage + store completo
   refreshUser(userData) → actualizar user + deviceId tras onboarding

   setGps/setStatus/setAlerts → actualizados por páginas individuales
   setMotos/addMoto           → actualizados por OnboardingPage / MotosPage
   setSubscription            → actualizado por quien muestre el plan

   DIAGRAMA MENTAL:
   LoginPage    → login()         → store.user, store.token, store.deviceId
   Layout       → lee user        → redirige a /login o /onboarding
   LocationPage → setGps()        → store.gps
   SecurityPage → setStatus()     → store.status
   HistoryPage  → setAlerts()     → store.alerts
   OnboardingPage → addMoto()     → store.motos; refreshUser() → store.deviceId

   ═══════════════════════════════════════════════════════════ */
