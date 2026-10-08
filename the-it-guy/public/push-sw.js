/* Push-only worker. Keep application requests online so releases stay current. */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('push', (event) => {
  let payload = {}
  try { payload = event.data?.json() || {} } catch { /* Still display a visible notification. */ }
  event.waitUntil(self.registration.showNotification(payload.title || 'Arch9', {
    body: payload.body || 'You have an Arch9 notification.',
    icon: '/icon-192.png', badge: '/icon-192.png', data: { url: payload.url || '/mobile/inbox' },
  }))
})
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  // Push payloads cannot navigate to another origin or outside the mobile app.
  let target = new URL('/mobile/inbox', self.location.origin)
  try {
    const candidate = new URL(event.notification.data?.url, self.location.origin)
    if (candidate.origin === self.location.origin && candidate.pathname.startsWith('/mobile/')) target = candidate
  } catch { /* Use the inbox. */ }
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      if (new URL(client.url).origin !== target.origin) continue
      if ('navigate' in client) await client.navigate(target.href)
      return client.focus()
    }
    return self.clients.openWindow(target.href)
  })())
})
