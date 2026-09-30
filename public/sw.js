/**
 * Service Worker — Argus Web Push
 * Maneja notificaciones push en background (tab cerrada o en segundo plano).
 * El backend envía un payload JSON: { title, body, data: { type, deviceId, ... } }
 */

self.addEventListener('push', (event) => {
  let payload = { title: 'Argus', body: 'Notificación', data: {} };
  try {
    if (event.data) payload = event.data.json();
  } catch (_) { /* payload por defecto */ }

  const options = {
    body:    payload.body,
    icon:    '/favicon.svg',
    badge:   '/favicon.svg',
    data:    payload.data ?? {},
    vibrate: [200, 100, 200, 100, 400],
    requireInteraction: payload.data?.type === 'GT06_POWER_CUT' || payload.data?.type === 'GT06_VIBRATION',
  };

  event.waitUntil(
    self.registration.showNotification(payload.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Abrir o enfocar la pestaña de seguridad al hacer clic en la notificación
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow('/security');
    })
  );
});
