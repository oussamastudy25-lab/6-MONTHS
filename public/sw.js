// Mizan SW — self-unregisters so new Notification() works directly
self.addEventListener('install', () => {
  self.skipWaiting()
})
self.addEventListener('activate', async () => {
  // Unregister this SW so the page can use new Notification() freely
  await self.registration.unregister()
  self.clients.matchAll().then(clients => clients.forEach(c => c.navigate(c.url)))
})
