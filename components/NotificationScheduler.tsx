'use client'
import { useEffect } from 'react'
import { createClient } from '@/lib/supabase'

const sb = createClient()

const WORK_MSGS = [
  "Your work window is active. Is your timer running?",
  "Time to focus. Start your session now.",
  "Every minute counts. Open your timer.",
  "The best time to start was earlier. The second best time is now.",
  "Your goals are waiting. Lock in.",
  "Stop browsing. Start working.",
  "Your future self is watching. Start the timer.",
]

function getSettings() {
  try { return JSON.parse(localStorage.getItem('mizan_notif_settings') ?? '{}') } catch { return {} }
}

function fire(title: string, body: string, url: string, tag: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  try {
    const n = new Notification(title, { body, icon: '/favicon.ico', tag, requireInteraction: false })
    n.onclick = () => { window.focus(); window.location.href = url }
  } catch {}
}

// Tracks which notifications already fired this session (prevent duplicates)
const fired = new Set<string>()

async function checkAndFire() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return

  const s        = getSettings()
  const calOn    = s.calReminders  !== false
  const calMins  = s.calMinsBefore ?? 10
  const workOn   = s.workReminders !== false
  const workEvery= s.workInterval  ?? 30

  const { data: { user } } = await sb.auth.getUser()
  if (!user) return

  const now      = new Date()
  const nowMins  = now.getHours() * 60 + now.getMinutes()
  const dow      = now.getDay()
  const today    = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`

  // ── Calendar reminders ─────────────────────────────────────────────────────
  if (calOn) {
    const { data: blocks } = await sb.from('schedule_blocks')
      .select('id,title,date,start_minutes')
      .eq('user_id', user.id)
      .eq('date', today)

    for (const b of (blocks ?? [])) {
      // Fire when we're within a 1-minute window of the target time
      const targetMins = b.start_minutes - calMins
      const diff = nowMins - targetMins
      if (diff >= 0 && diff < 2) {
        const key = `cal_${b.id}_${today}_${targetMins}`
        if (!fired.has(key)) {
          fired.add(key)
          fire(`📅 Starting in ${calMins}m`, b.title || 'Calendar event', '/calendar', key)
        }
      }
    }
  }

  // ── Work reminders ─────────────────────────────────────────────────────────
  if (workOn) {
    const { data: wins } = await sb.from('accountability_windows')
      .select('label,days_of_week,start_minutes,end_minutes')
      .eq('user_id', user.id)
      .eq('is_active', true)

    for (const w of (wins ?? [])) {
      if (!w.days_of_week.includes(dow)) continue
      if (nowMins < w.start_minutes || nowMins >= w.end_minutes) continue

      // Check if nowMins aligns with an interval slot (within 2-min window)
      const elapsed   = nowMins - w.start_minutes
      const slotIndex = Math.floor(elapsed / workEvery)
      const slotStart = w.start_minutes + slotIndex * workEvery
      const diff      = nowMins - slotStart

      if (diff >= 0 && diff < 2) {
        const key = `work_${w.label}_${today}_${slotStart}`
        if (!fired.has(key)) {
          fired.add(key)
          const msg = WORK_MSGS[slotIndex % WORK_MSGS.length]
          fire(`⏱ ${w.label}`, msg, '/timer', key)
        }
      }
    }
  }
}

let intervalId: ReturnType<typeof setInterval> | null = null

export default function NotificationScheduler() {
  useEffect(() => {
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }

    // Only start one interval globally
    if (intervalId) return

    // Check immediately, then every 60 seconds
    checkAndFire()
    intervalId = setInterval(checkAndFire, 60_000)

    return () => {
      // Don't clear on unmount — we want it running globally
      // It gets cleared only when the tab is closed
    }
  }, [])

  return null
}
