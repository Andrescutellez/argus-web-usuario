/**
 * @fileoverview Web Push VAPID — registro del browser para notificaciones en segundo plano.
 *
 * DOS FLUJOS según el estado del permiso de Notification:
 *
 *   silentSubscribeIfGranted() — llamada automáticamente al cargar el Layout.
 *     Solo actúa si el permiso ya es 'granted'. No muestra ningún prompt.
 *     Sirve para re-suscribir cuando la suscripción anterior expiró (rotan cada ~weeks).
 *
 *   requestAndSubscribe() — debe llamarse DESDE UN CLICK del usuario.
 *     Chrome bloquea Notification.requestPermission() sin gesto de usuario — silencia
 *     la solicitud y el permiso queda en 'default' sin mostrar nada. Por eso existe
 *     este segundo entry point que se conecta a un botón en el Layout.
 *
 * IDEMPOTENTE:
 *   pushManager.subscribe() devuelve la suscripción existente si ya hay una activa.
 *   El POST al backend hace UPSERT por userId.
 *
 * @module api/webPushService
 */

import api from './apiService.js'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = atob(base64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

async function _doSubscribe() {
  const { data } = await api.get('/api/push/vapid-public-key')
  if (!data?.publicKey) throw new Error('Sin clave pública VAPID')

  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly:      true,
    applicationServerKey: urlBase64ToUint8Array(data.publicKey),
  })

  await api.post('/api/push/subscribe', subscription.toJSON())
  console.log('[WebPush] Suscripción activa')
  return true
}

function _supported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/**
 * @brief Suscribe silenciosamente si el permiso ya fue concedido.
 * Llamar al cargar el Layout, sin necesidad de gesto de usuario.
 * @returns {Promise<void>}
 */
export async function silentSubscribeIfGranted() {
  if (!_supported()) return
  if (Notification.permission !== 'granted') return
  try { await _doSubscribe() } catch (err) {
    console.error('[WebPush] Re-suscripción silenciosa fallida:', err.message)
  }
}

/**
 * @brief Pide permiso y suscribe. DEBE llamarse desde el handler de un click.
 * Chrome ignora requestPermission() sin gesto de usuario.
 * @returns {Promise<'granted'|'denied'|'default'>} Estado del permiso resultante
 */
export async function requestAndSubscribe() {
  if (!_supported()) return 'default'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission === 'granted') {
    try { await _doSubscribe() } catch (_) {}
    return 'granted'
  }
  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return permission
    await _doSubscribe()
    return 'granted'
  } catch (err) {
    console.error('[WebPush] requestAndSubscribe error:', err.message)
    return 'default'
  }
}
