// Mizan Service Worker — handles push notifications

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

self.addEventListener('push', e => {
  const data = e.data?.json() ?? {}
  const title = data.title ?? 'Mizan ميزان'
  const body  = data.body  ?? ''
  const icon  = data.icon  ?? '/favicon.ico'
  const tag   = data.tag   ?? 'mizan-notif'
  const url   = data.url   ?? '/'

  e.waitUntil(
    self.registration.showNotification(title, {
      body, icon, tag,
      badge: '/favicon.ico',
      data: { url },
      requireInteraction: data.requireInteraction ?? false,
    })
  )
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  const url = e.notification.data?.url ?? '/'
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const existing = clients.find(c => c.url.includes(self.location.origin))
      if (existing) { existing.focus(); existing.navigate(url) }
      else self.clients.openWindow(url)
    })
  )
})
