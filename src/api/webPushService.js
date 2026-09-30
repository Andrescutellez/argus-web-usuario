/**
 * @fileoverview Web Push VAPID — registro del browser para notificaciones en segundo plano.
 *
 * PROPÓSITO:
 *   Registra un Service Worker (/sw.js) y suscribe el browser al servidor push del backend.
 *   Una vez suscrito, el browser recibe notificaciones incluso con la pestaña cerrada.
 *
 * FLUJO:
 *   1. Verificar soporte (ServiceWorker + PushManager + Notification).
 *   2. Pedir permiso de notificaciones al usuario.
 *   3. GET /api/push/vapid-public-key → obtener clave pública.
 *   4. navigator.serviceWorker.register('/sw.js') → obtener registro.
 *   5. registration.pushManager.subscribe() → obtener PushSubscription.
 *   6. POST /api/push/subscribe → guardar suscripción en el backend.
 *
 * IDEMPOTENTE:
 *   Si el browser ya tiene una suscripción activa, pushManager.subscribe()
 *   devuelve la existente sin crear una nueva. El POST al backend simplemente
 *   actualiza el registro (UPSERT).
 *
 * @module api/webPushService
 */

import api from './apiService.js'

/**
 * @brief Convierte una clave VAPID Base64Url a Uint8Array.
 * Necesario porque PushManager.subscribe() espera applicationServerKey como Uint8Array.
 * @param {string} base64String  Clave VAPID pública en formato Base64Url
 * @returns {Uint8Array}
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = atob(base64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

/**
 * @brief Inicializa Web Push: registra el SW, solicita permiso y suscribe al backend.
 *
 * Se llama una vez tras autenticación exitosa (en Layout.jsx).
 * No lanza excepciones — todos los errores se loguean y la función retorna silenciosamente.
 * Si el usuario niega el permiso, no se vuelve a preguntar (comportamiento nativo del browser).
 *
 * @returns {Promise<void>}
 */
export async function initWebPush() {
  // Verificar soporte del browser
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    console.log('[WebPush] No soportado en este browser')
    return
  }

  // Si el usuario ya negó el permiso, no volver a intentar
  if (Notification.permission === 'denied') return

  try {
    // Obtener clave pública VAPID del backend
    const { data } = await api.get('/api/push/vapid-public-key')
    if (!data?.publicKey) return

    // Solicitar permiso de notificaciones al usuario
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return

    // Registrar Service Worker (idempotente: si ya está registrado, devuelve el mismo)
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })

    // Suscribir al push — si ya existe suscripción activa, devuelve la misma
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly:      true,
      applicationServerKey: urlBase64ToUint8Array(data.publicKey),
    })

    // Guardar suscripción en el backend (UPSERT por userId)
    await api.post('/api/push/subscribe', subscription.toJSON())

    console.log('[WebPush] Suscripción activa:', subscription.endpoint.slice(-20))
  } catch (err) {
    // AbortError = usuario canceló o el browser bloqueó; no es un error real
    if (err.name !== 'AbortError') {
      console.error('[WebPush] Error al inicializar:', err.message)
    }
  }
}
