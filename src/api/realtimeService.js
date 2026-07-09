import { io } from 'socket.io-client'

// Dominio oficial de producción — nunca IPs (regla 2026-07-09). Dev: VITE_API_URL en .env.local
const BASE_URL = import.meta.env.VITE_API_URL || 'https://api.argussecure.online'

let socket = null

// Callbacks globales registrados por Layout (fuera del ciclo de vida de páginas)
let _onNearbyIncident   = null
let _onSecureRoomAlert  = null

/**
 * Registra callbacks globales para eventos dirigidos al dispositivo.
 * Llamar desde Layout (singleton, siempre montado).
 *
 * @param {Function|null} onNearbyIncident  — 'incident:nearby'
 * @param {Function|null} onSecureRoomAlert — 'secure:room_alert'
 */
export const setGlobalCallbacks = (onNearbyIncident, onSecureRoomAlert) => {
  _onNearbyIncident  = onNearbyIncident
  _onSecureRoomAlert = onSecureRoomAlert
  // Si el socket ya existe, registrar inmediatamente
  if (socket) {
    socket.off('incident:nearby').off('secure:room_alert')
    if (_onNearbyIncident)  socket.on('incident:nearby',   _onNearbyIncident)
    if (_onSecureRoomAlert) socket.on('secure:room_alert', _onSecureRoomAlert)
  }
}

/**
 * Conecta el socket y registra los handlers de los eventos de página.
 * deviceId se pasa en la query para que el servidor una el socket al room 'device:<id>'.
 */
export const connect = (onGpsUpdate, onStatusUpdate, onAlertNew, onRiskAlert, onGeofenceExit, onDiag, deviceId) => {
  if (!socket) {
    // autoConnect:false para controlar exactamente cuándo conecta,
    // evitando que io() inicie el handshake antes de que registremos los handlers.
    socket = io(BASE_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: false,
      query: deviceId ? { deviceId } : {},
      // El token viaja en auth (no en query) para no quedar en logs de nginx.
      auth: { token: localStorage.getItem('argus_token') },
    })
    socket.on('connect',    () => console.log('[RT] conectado'))
    socket.on('disconnect', () => console.log('[RT] desconectado'))
  }

  // Limpiar handlers anteriores antes de re-registrar.
  // Necesario en React 19 Strict Mode: el efecto se monta dos veces,
  // y sin .off() los listeners se acumulan duplicados.
  socket.off('gps:update').off('device:status').off('alert:new')
        .off('risk:zone_enter').off('risk:zone_exit').off('geofence:exit')
        .off('device:diag').off('incident:nearby').off('secure:room_alert')
  if (onGpsUpdate)      socket.on('gps:update',     onGpsUpdate)
  if (onStatusUpdate)   socket.on('device:status',   onStatusUpdate)
  if (onAlertNew)       socket.on('alert:new',        onAlertNew)
  if (onRiskAlert) {
    socket.on('risk:zone_enter', d => onRiskAlert({ ...d, event: 'enter' }))
    socket.on('risk:zone_exit',  d => onRiskAlert({ ...d, event: 'exit'  }))
  }
  if (onGeofenceExit)   socket.on('geofence:exit',   onGeofenceExit)
  if (onDiag)           socket.on('device:diag',     onDiag)

  // Re-registrar callbacks globales después de la limpieza
  if (_onNearbyIncident)  socket.on('incident:nearby',   _onNearbyIncident)
  if (_onSecureRoomAlert) socket.on('secure:room_alert', _onSecureRoomAlert)

  if (!socket.connected) socket.connect()
  return socket
}

export const disconnect = () => {
  // Limpiamos listeners pero NO destruimos la instancia (socket = null).
  // En Strict Mode el cleanup corre entre el primer y segundo mount:
  // si ponemos socket = null aquí, el segundo connect() crea un socket nuevo
  // mientras el WebSocket del primero aún está cerrándose → error de browser.
  // Reusar la misma instancia y reconectar es más seguro.
  if (socket) {
    socket.off('gps:update').off('device:status').off('alert:new')
    socket.disconnect()
  }
}

export const getSocket = () => socket
