import { io } from 'socket.io-client'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://34.69.219.193:3000'

let socket = null

export const connect = (onGpsUpdate, onStatusUpdate, onAlertNew) => {
  if (!socket) {
    socket = io(BASE_URL, { transports: ['websocket', 'polling'] })
    socket.on('connect', () => console.log('[RT] conectado'))
    socket.on('disconnect', () => console.log('[RT] desconectado'))
  }

  // Handlers are additive — each caller registers its own without clobbering others.
  if (onGpsUpdate)    socket.on('gps:update',   (d) => onGpsUpdate(d))
  if (onStatusUpdate) socket.on('device:status', (d) => onStatusUpdate(d))
  if (onAlertNew)     socket.on('alert:new',     (d) => onAlertNew(d))

  if (!socket.connected) socket.connect()
  return socket
}

export const disconnect = () => {
  socket?.disconnect()
  socket = null
}

export const getSocket = () => socket
