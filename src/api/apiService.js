/**
 * @fileoverview Capa de comunicación HTTP para la Web Usuario de Argus Secure.
 *
 * PROPÓSITO:
 *   Centraliza todas las llamadas al backend REST. Cualquier componente que
 *   necesite datos del servidor importa desde aquí — nunca llama a axios
 *   directamente. Esto permite cambiar la base URL o headers en un solo lugar.
 *
 * VARIABLES CRÍTICAS:
 *   BASE_URL      — Dirección del backend. Viene de VITE_API_URL en .env.
 *                   Si no está definida, apunta a https://api.argussecure.online.
 *   argus_token   — JWT almacenado en localStorage. Se inyecta en CADA request.
 *                   Si se corrompe o expira, el interceptor redirige a /login.
 *
 * RIESGOS:
 *   - Si BASE_URL apunta a producción en desarrollo, los comandos (ARM/DISARM)
 *     llegarán al ESP32 real. Siempre usar VITE_API_URL=http://localhost:3000
 *     en desarrollo.
 *   - El interceptor 401 hace window.location.href — esto recarga el bundle
 *     completo. Para evitar flicker, el store debe limpiarse antes.
 *
 * ESTADO:
 *   Sin estado local. Esta capa es puramente funcional (request → response).
 *
 * @module api/apiService
 */

import axios from 'axios'

// BASE_URL: fallback al dominio oficial de producción (nunca IPs — regla 2026-07-09:
// una migración de servidor solo debe requerir cambiar DNS, no tocar código).
// Desarrollo: definir VITE_API_URL=http://localhost:3000 en .env.local
const BASE_URL = import.meta.env.VITE_API_URL || 'https://api.argussecure.online'

/**
 * @brief Instancia axios preconfigurada con baseURL y timeout estándar.
 *
 * PROPÓSITO:
 *   Todos los endpoints del proyecto usan esta instancia para heredar
 *   automáticamente el token de auth y la URL base sin repetición.
 *
 * TIMEOUT:
 *   10 segundos. Adecuado para el backend en GCP (latencia esperada <200ms).
 *   Aumentar si se agregan endpoints de análisis pesado.
 */
const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
})

/**
 * @brief Interceptor de request: inyecta el JWT en cada llamada saliente.
 *
 * PROPÓSITO:
 *   Evitar pasar el token manualmente en cada llamada. Si el token no existe
 *   (usuario no autenticado), la request sale sin header Authorization y el
 *   backend responderá 401.
 *
 * POR QUÉ localStorage Y NO una variable en módulo:
 *   El token puede cambiar durante la sesión (refresh futuro). Leer desde
 *   localStorage en cada request garantiza que siempre se usa el token vigente.
 */
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('argus_token')
  // Solo inyectar si existe — endpoints públicos (login/register) no lo necesitan
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

/**
 * @brief Interceptor de response: redirige a /login cuando el token expira.
 *
 * PROPÓSITO:
 *   El JWT tiene expiración de 7 días. Si el usuario deja la sesión abierta
 *   y vuelve con el token vencido, el backend devuelve 401. Este interceptor
 *   limpia el almacenamiento local y redirige sin que el usuario vea un error
 *   confuso de red.
 *
 * POR QUÉ limpiar localStorage aquí Y en logout del store:
 *   Este interceptor corre antes de que React tenga control. Limpiar aquí
 *   evita que en el siguiente render el store intente re-hidratar un token
 *   inválido del localStorage.
 *
 * EDGE CASE:
 *   Si el servidor cae y responde 401 por error (no por token inválido),
 *   el usuario será deslogueado. Sería más robusto diferenciar 401 "token
 *   inválido" de 503 "servidor caído", pero requiere convención en el backend.
 */
api.interceptors.response.use(
  (res) => res,
  (err) => {
    // Excluir el endpoint de login: si falla con 401 es por credenciales
    // incorrectas y el formulario debe mostrar el error, no recargar la página.
    const isAuthRequest = err.config?.url?.includes('/auth/login') || err.config?.url?.includes('/auth/register')
    if (err.response?.status === 401 && !isAuthRequest) {
      // Limpiar sesión antes de redirigir para que el store no se rehidrate
      localStorage.removeItem('argus_token')
      localStorage.removeItem('argus_user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  },
)

// ─── Auth ──────────────────────────────────────────────────────────────────

/**
 * @brief Autentica al usuario y retorna { token, user }.
 *
 * FLUJO: POST /api/auth/login → backend valida bcrypt → emite JWT 7d
 *
 * @param {string} email    Correo del usuario
 * @param {string} password Contraseña en texto plano (HTTPS en producción)
 * @returns {Promise<AxiosResponse<{ token: string, user: object }>>}
 */
export const loginApi = (email, password) =>
  api.post('/api/auth/login', { email, password })

/**
 * @brief Crea una nueva cuenta de usuario con plan FREEMIUM por defecto.
 *
 * FLUJO: POST /api/auth/register → crea usuario → crea suscripción FREEMIUM
 *        → asocia deviceId si se pasa → emite JWT
 *
 * NOTA: deviceId es opcional aquí. El flujo de Onboarding lo registra después
 *       via POST /api/motos/:motoId/assign-device para mayor flexibilidad.
 *
 * @param {string}      email     Correo del nuevo usuario
 * @param {string}      password  Contraseña (mínimo recomendado: 8 caracteres)
 * @param {string|null} deviceId  ID del ESP32 a asociar en el mismo paso (opcional)
 * @returns {Promise<AxiosResponse<{ token: string, user: object }>>}
 */
export const registerApi = (email, password, deviceId = null) =>
  api.post('/api/auth/register', { email, password, ...(deviceId ? { deviceId } : {}) })

/**
 * @brief Obtiene el perfil fresco del usuario desde el servidor.
 *
 * PROPÓSITO:
 *   Llamar al arrancar la app para verificar que el token almacenado sigue
 *   siendo válido y refrescar datos como role o deviceIds si cambiaron.
 *
 * @returns {Promise<AxiosResponse<{ id, email, role, deviceIds }>>}
 */
export const getMeApi = () =>
  api.get('/api/auth/me')

// ─── GPS ──────────────────────────────────────────────────────────────────

/**
 * @brief Última posición GPS conocida del dispositivo.
 *
 * @param {string} deviceId  ID del ESP32 (ej: 'ARGUS-1237E630')
 * @returns {Promise<AxiosResponse<{ lat, lon, speed, timestamp }>>}
 */
export const getLatestGps = (deviceId) =>
  api.get(`/api/gps/${deviceId}/latest`)

/**
 * @brief Historial de posiciones GPS (sin implementar paginación aún).
 *
 * NOTA: Endpoint legacy sin filtros. Para uso en LocationPage mientras no
 *       se implementa paginación por cursor en el backend.
 *
 * @returns {Promise<AxiosResponse<Array>>}
 */
export const getGpsHistory = () =>
  api.get('/api/gps')

// ─── Device ───────────────────────────────────────────────────────────────

/**
 * @brief Estado en tiempo real del dispositivo (conexión, armed, posición).
 *
 * @param {string} deviceId
 * @returns {Promise<AxiosResponse<{ connected, armed, lat, lon, speed, lastSeen }>>}
 */
export const getDeviceStatus = (deviceId) =>
  api.get(`/api/device/${deviceId}/status`)

/**
 * @brief Envía un comando remoto al ESP32 (ARM, DISARM, ALERT, ENGINE_CUT).
 *
 * FLUJO: POST /api/device/:deviceId/command → backend encola TCP → ESP32
 *   Si el dispositivo está offline, el backend almacena el comando y lo
 *   entrega en la próxima reconexión TCP.
 *
 * RIESGO:
 *   ENGINE_CUT corta el motor mientras la moto está en movimiento. El frontend
 *   debe pedir confirmación explícita antes de llamar a este endpoint.
 *
 * @param {string} deviceId
 * @param {'ARM'|'DISARM'|'ALERT'|'ENGINE_CUT'} command
 * @returns {Promise<AxiosResponse<{ delivered: boolean }>>}
 */
export const sendCommand = (deviceId, command) =>
  api.post(`/api/device/${deviceId}/command`, { command })

// ─── Alerts ───────────────────────────────────────────────────────────────

/**
 * @brief Carga el historial de alertas del dispositivo.
 *
 * Los tipos de alerta están definidos en el modelo Alert.js del backend:
 *   STATE_ALERT, STATE_PURSUIT, STATE_MOVING, STATE_IDLE, ARM, DISARM,
 *   ALERT_CMD, ENGINE_CUT
 *
 * @param {string} deviceId  ID del ESP32
 * @param {number} limit     Máximo de alertas a retornar (default: 50)
 * @returns {Promise<AxiosResponse<Array<Alert>>>}
 */
export const getAlerts = (deviceId, limit = 50) =>
  api.get(`/api/alerts/${deviceId}?limit=${limit}`)

// ─── Motos ────────────────────────────────────────────────────────────────

/**
 * @brief Retorna todas las motos registradas del usuario autenticado.
 *
 * PROPÓSITO:
 *   Poblar la pantalla de gestión de moto (MotosPage / OnboardingPage).
 *   El backend filtra automáticamente por req.user.sub — el frontend no
 *   necesita pasar el userId.
 *
 * @returns {Promise<AxiosResponse<Array<Moto>>>}
 *   Cada Moto: { id, user_id, alias, placa, marca, modelo, color, anio, created_at }
 */
export const getMotos = () =>
  api.get('/api/motos')

/**
 * @brief Crea una nueva moto para el usuario autenticado.
 *
 * FLUJO: POST /api/motos → inserta en tabla `motos` → registra en audit_log
 *
 * @param {object} data  Campos de la moto
 * @param {string} data.alias   Nombre descriptivo (ej: 'Mi CB500')
 * @param {string} data.placa   Placa vehicular (ej: 'ABC-123')
 * @param {string} data.marca   Marca (ej: 'Honda')
 * @param {string} data.modelo  Modelo (ej: 'CB500F')
 * @param {string} [data.color] Color del vehículo
 * @param {number} [data.anio]  Año de fabricación
 * @returns {Promise<AxiosResponse<Moto>>}
 */
export const createMoto = (data) =>
  api.post('/api/motos', data)

/**
 * @brief Retorna el detalle de una moto junto al device instalado (si tiene).
 *
 * @param {string} motoId  UUID de la moto
 * @returns {Promise<AxiosResponse<Moto & { device: Device|null }>>}
 */
export const getMoto = (motoId) =>
  api.get(`/api/motos/${motoId}`)

/**
 * @brief Actualiza los campos de una moto existente.
 *
 * NOTA: Solo el dueño puede actualizar sus motos (el backend valida).
 *
 * @param {string} motoId  UUID de la moto
 * @param {object} data    Campos a actualizar (parcial)
 * @returns {Promise<AxiosResponse<Moto>>}
 */
export const updateMoto = (motoId, data) =>
  api.put(`/api/motos/${motoId}`, data)

/**
 * @brief Asigna un dispositivo ESP32 a una moto y lo vincula al usuario.
 *
 * PROPÓSITO:
 *   Paso final del Onboarding. Después de llamar este endpoint:
 *   1. El dispositivo queda registrado en la tabla `devices`.
 *   2. El device queda vinculado al usuario en `user_devices`.
 *   3. El JWT actual ya NO refleja el nuevo deviceId — el usuario debe hacer
 *      login de nuevo (o llamar a getMeApi) para obtener el token actualizado.
 *
 * EDGE CASE:
 *   Si el deviceId ya existe en la tabla devices (fue registrado por el firmware
 *   en una sesión TCP anterior), assignDevice lo reutiliza sin duplicar.
 *
 * @param {string} motoId   UUID de la moto a la que se asigna
 * @param {string} deviceId ID del ESP32 (ej: 'ARGUS-1237E630')
 * @returns {Promise<AxiosResponse<Device>>}
 */
export const assignDevice = (motoId, deviceId) =>
  api.post(`/api/motos/${motoId}/assign-device`, { deviceId })

// ─── GIS ──────────────────────────────────────────────────────────────────

/**
 * @brief Jerarquía territorial y cuadrante policial de un punto GPS.
 *
 * PROPÓSITO:
 *   Enriquece cualquier coordenada con: localidad, UPZ, sector catastral,
 *   cuadrante policial y —lo más valioso— el teléfono del patrullero asignado.
 *
 * @param {number} lon  Longitud WGS-84
 * @param {number} lat  Latitud WGS-84
 * @returns {Promise<AxiosResponse<{
 *   loc_nombre, upl_nombre, sca_nombre,
 *   pcu_codigo, pcu_nombre, pcu_nom_cai, pcu_nom_est, pcu_telefono
 * }>>}
 */
export const getGisLookup = (lon, lat) =>
  api.get('/api/gis/lookup', { params: { lon, lat } })

/**
 * @brief POIs policiales más cercanos a un punto GPS.
 *
 * @param {number} lon      Longitud WGS-84
 * @param {number} lat      Latitud WGS-84
 * @param {'cai'|'estacion'} type  Tipo de POI
 * @param {number} [limit=3]       Máximo de resultados
 * @returns {Promise<AxiosResponse<Array<{nombre, direccion, lat, lon, telefono, distancia_m}>>>}
 */
export const getGisNear = (lon, lat, type = 'cai', limit = 3) =>
  api.get('/api/gis/near', { params: { lon, lat, type, limit } })

/**
 * @brief GeoJSON de localidades con datos de hurto de motos (heatmap de riesgo).
 *
 * @returns {Promise<AxiosResponse<GeoJSON.FeatureCollection>>}
 */
export const getGisHeatmap = () =>
  api.get('/api/gis/heatmap')

/**
 * @brief Los N cuadrantes policiales más cercanos al punto GPS.
 * Devuelve GeoJSON FeatureCollection con ~5 cuadrantes (el contenedor + vecinos).
 * Usado por el mapa de usuario para el overlay territorial local.
 */
export const getGisNearCuadrantes = (lon, lat, limit = 5) =>
  api.get('/api/gis/cuadrantes-near', { params: { lon, lat, limit } })

// ─── Weather ──────────────────────────────────────────────────────────────

/**
 * @brief Datos de lluvia en tiempo real de las estaciones SAB de Bogotá.
 *
 * PROPÓSITO:
 *   Alimenta la capa de lluvia del mapa de usuario. Devuelve todas las
 *   estaciones pluviométricas activas con su intensidad y acumulado del día,
 *   listo para renderizar como círculos Leaflet en LocationPage.
 *
 * FUENTE: Sistema de Alertas de Bogotá (SAB) — proxy en el backend para
 *   evitar problemas de CORS desde el browser.
 *
 * CACHÉ: El backend marca `stale: true` si la última actualización tiene
 *   más de 15 minutos. El frontend puede mostrar un aviso al usuario.
 *
 * INTENSIDADES POSIBLES:
 *   'sin_lluvia' | 'bajo' | 'moderado' | 'alto' | 'muy_alto'
 *
 * @returns {Promise<AxiosResponse<{
 *   ok: boolean,
 *   stale: boolean,
 *   fuente: string,
 *   ciudad: string,
 *   actualizado: string,
 *   total: number,
 *   estaciones: Array<{
 *     id: number, nombre: string, lat: number, lon: number,
 *     valor_mm: number, acumulado_dia: number,
 *     intensidad: string, localidad: string,
 *     ultima_lectura: string, activa: boolean
 *   }>
 * }>>}
 */
export const getLluvia      = () => api.get('/api/weather/lluvia')
export const getRadarBounds = () => api.get('/api/weather/radar/bounds')
export const getRadarImage  = () => api.get('/api/weather/radar/image', { responseType: 'blob' })
export { BASE_URL }

// ─── Criminalidad ────────────────────────────────────────────────────────────

/** GeoJSON con 20 localidades de Bogotá + hurtos motos/autos (2018-2026) + cámaras. Cache 24h. */
export const getCrimeBogota   = () => api.get('/api/crime/bogota')
/** Datos de la localidad que contiene el punto GPS dado. */
export const getCrimeLookup   = (lat, lon) => api.get('/api/crime/bogota/lookup', { params: { lat, lon } })
/** Ranking de hurtos motos por departamento (últimos 12 meses, datos.gov.co). */
export const getCrimeNacional = () => api.get('/api/crime/nacional')

// ─── Conducción ───────────────────────────────────────────────────────────────

/**
 * @brief Métricas de conducción del MPU6050 para el período solicitado.
 *
 * PROPÓSITO:
 *   Alimenta la DrivingPage con los datos reales del sensor de movimiento.
 *   El backend agrega las sesiones DriveMetrics de MongoDB en score,
 *   breakdown diario y lista de sesiones raw.
 *
 * ENDPOINT:
 *   GET /api/drive/metrics/:deviceId?days=N&speedLimit=80
 *   Respuesta 200: { deviceId, period, irc, ircLabel, pillars, stats, usage, impact, dailyBreakdown, recommendations, sessions }
 *   Respuesta 200 vacía (sin actividad): { irc: 100, sessions: [] }
 *
 * PARA CUBRIR AMBOS PERÍODOS DEL TOGGLE:
 *   Llamar con days=14 y filtrar en el cliente. Evita dos llamadas separadas
 *   de red al cambiar entre "Esta semana" y "Semana pasada".
 *
 * @param {string} deviceId    ID del ESP32 (ej: 'ARGUS-1237E630')
 * @param {number} days        Días hacia atrás desde hoy (default 14)
 * @param {number} speedLimit  Límite de velocidad urbano en km/h (default 80)
 * @returns {Promise<AxiosResponse>}
 */
export const getDriveMetrics = (deviceId, days = 14, speedLimit = 80) =>
  api.get(`/api/drive/metrics/${deviceId}?days=${days}&speedLimit=${speedLimit}`)

// ─── Suscripción ──────────────────────────────────────────────────────────

/**
 * @brief Placeholder para obtener el plan de suscripción del usuario.
 *
 * NOTA: El backend expone suscripción implícitamente via /api/auth/me en el
 *   campo role. Un endpoint dedicado GET /api/subscriptions/me está pendiente
 *   de implementar si se necesitan detalles de fechas o upgrade en frontend.
 *
 * @returns {Promise<AxiosResponse<{ plan, status, expires_at }>>}
 */
export const getSubscription = () =>
  api.get('/api/subscriptions/me')

// ─── Geocerca de estacionamiento ─────────────────────────────────────────────

/**
 * @brief Crea una geocerca de estacionamiento y arma el dispositivo en modo silencioso.
 *
 * @param {string} deviceId   ID del ESP32
 * @param {object} opts       { lat?, lng?, radiusM? } — coordenadas opcionales (fallback a último GPS del servidor)
 * @returns {Promise<AxiosResponse<{ id, lat, lng, radiusM, expiresAt }>>}
 */
export const createGeofence = (deviceId, { lat, lng, radiusM = 80 } = {}) =>
  api.post(`/api/geofence/${deviceId}`, { lat, lng, radiusM })

/**
 * @brief Retorna la geocerca activa del dispositivo, o rechaza con 404 si no tiene.
 *
 * @param {string} deviceId
 * @returns {Promise<AxiosResponse<{ id, lat, lng, radius_m, expires_at }>>}
 */
export const getActiveGeofence = (deviceId) =>
  api.get(`/api/geofence/${deviceId}`)

/**
 * @brief Cancela la geocerca activa y desarma el dispositivo.
 *
 * @param {string} deviceId
 * @returns {Promise<AxiosResponse<{ message: string }>>}
 */
export const deleteGeofence = (deviceId) =>
  api.delete(`/api/geofence/${deviceId}`)

// Seguridad comunitaria — incidentes
export const createIncidentApi = (deviceId, lat, lng) =>
  api.post('/api/incidents', { deviceId, lat, lng, platform: 'web' })

export const resolveIncidentApi = (incidentId, note = '') =>
  api.patch(`/api/incidents/${incidentId}/resolve`, { resolutionNote: note })

// ─── Argus Secure — Sala de Recuperación ─────────────────────────────────────

/** Abre una Sala de Recuperación (propietario). Retorna roomData con tokens. */
export const createSecureRoomApi = (vehicleId, lastKnownPosition = null) =>
  api.post('/api/secure/rooms', {
    vehicleId,
    ...(lastKnownPosition ? { lastKnownPosition } : {}),
  })

/** Cierra la sala con resolución. */
export const closeSecureRoomApi = (roomName, resolution = 'RECOVERED') =>
  api.delete(`/api/secure/rooms/${roomName}`, { data: { resolution } })

// ─── Comunidades ──────────────────────────────────────────────────────────────
export const getCommunityFeed    = (before)         => api.get('/api/communities/feed', { params: before ? { before } : {} })
export const getMyCommunities    = ()               => api.get('/api/communities/mine')
export const exploreCommunities  = (search = '', offset = 0) => api.get('/api/communities/explore', { params: { search, offset } })
export const getCommunity        = (id)             => api.get(`/api/communities/${id}`)
export const createCommunity     = (body)           => api.post('/api/communities', body)
export const updateCommunity     = (id, body)       => api.patch(`/api/communities/${id}`, body)
export const deleteCommunity     = (id)             => api.delete(`/api/communities/${id}`)
export const joinCommunity       = (id)             => api.post(`/api/communities/${id}/join`)
export const leaveCommunity      = (id)             => api.delete(`/api/communities/${id}/leave`)
export const getCommunityPosts   = (id, before)     => api.get(`/api/communities/${id}/posts`, { params: before ? { before } : {} })
export const createCommunityPost = (id, body)       => api.post(`/api/communities/${id}/posts`, body)
export const deleteCommunityPost = (id, postId)     => api.delete(`/api/communities/${id}/posts/${postId}`)
export const createInvitation    = (id)             => api.post(`/api/communities/${id}/invitations`)
export const useInvitationToken  = (token)          => api.post(`/api/communities/join/${token}`)
export const getPrivacyPrefs     = ()               => api.get('/api/communities/privacy/prefs')
export const updatePrivacyPrefs  = (body)           => api.patch('/api/communities/privacy/prefs', body)

// ─── Perfil social ────────────────────────────────────────────────────────────
export const getMyProfile      = ()               => api.get('/api/profile/me')
export const updateMyProfile   = (body)           => api.patch('/api/profile/me', body)
export const changeUsername    = (username)       => api.patch('/api/profile/me/username', { username })
export const checkUsername     = (username)       => api.get(`/api/profile/check/${encodeURIComponent(username)}`)
export const getPublicProfile  = (username)       => api.get(`/api/profile/${encodeURIComponent(username)}`)

export default api

/* ═══════════════════════════════════════════════════════════
   RESUMEN DEL MÓDULO — apiService
   ═══════════════════════════════════════════════════════════

   EXPLICACIÓN PARA HUMANO:
   Este archivo es la única puerta de entrada al backend desde el frontend.
   Todos los componentes React importan funciones de aquí y nunca usan
   axios directamente. Hay una instancia compartida (api) que maneja
   automáticamente el token JWT y la redirección en caso de sesión expirada.

   PSEUDOCÓDIGO:
   GET  /api/auth/me              → perfil del usuario autenticado
   POST /api/auth/login           → { token, user }
   POST /api/auth/register        → { token, user }
   GET  /api/gps/:id/latest       → última posición GPS
   GET  /api/device/:id/status    → estado del dispositivo
   POST /api/device/:id/command   → enviar ARM/DISARM/ALERT/ENGINE_CUT
   GET  /api/alerts/:id           → historial de alertas
   GET  /api/motos                → lista de motos del usuario
   POST /api/motos                → crear moto
   GET  /api/motos/:id            → detalle + device instalado
   PUT  /api/motos/:id            → actualizar moto
   POST /api/motos/:id/assign-device → vincular ESP32 a moto + usuario
   GET  /api/weather/lluvia       → estaciones pluviométricas SAB (lluvia tiempo real)

   DIAGRAMA MENTAL:
   Componente React → importa función → api.get/post → interceptor inyecta JWT
   → backend responde → interceptor 401 → limpia localStorage → /login
   → dato llega al componente vía Promise

   ═══════════════════════════════════════════════════════════ */
