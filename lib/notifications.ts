// Mizan Notification System

export async function registerSW() {
  if (!('serviceWorker' in navigator)) return null
  try {
    const reg = await navigator.serviceWorker.register('/sw.js')
    return reg
  } catch { return null }
}

export async function requestPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied'
  if (Notification.permission === 'granted') return 'granted'
  return await Notification.requestPermission()
}

export function getPermission(): NotificationPermission {
  if (!('Notification' in window)) return 'denied'
  return Notification.permission
}

// Fire a local notification immediately (no server needed)
export function notify(title: string, body: string, options?: {
  tag?: string; url?: string; requireInteraction?: boolean
}) {
  if (Notification.permission !== 'granted') return
  const n = new Notification(title, {
    body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: options?.tag ?? 'mizan',
    requireInteraction: options?.requireInteraction ?? false,
  })
  if (options?.url) n.onclick = () => { window.focus(); window.location.href = options.url! }
}

// Schedule a notification at a specific time
const scheduled = new Map<string, ReturnType<typeof setTimeout>>()

export function scheduleNotification(id: string, fireAt: Date, title: string, body: string, url?: string) {
  cancelScheduled(id)
  const delay = fireAt.getTime() - Date.now()
  if (delay < 0) return
  const t = setTimeout(() => { notify(title, body, { tag: id, url }); scheduled.delete(id) }, delay)
  scheduled.set(id, t)
}

export function cancelScheduled(id: string) {
  const t = scheduled.get(id)
  if (t) { clearTimeout(t); scheduled.delete(id) }
}

export function cancelAll() {
  scheduled.forEach(t => clearTimeout(t))
  scheduled.clear()
}
