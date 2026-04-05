'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { registerSW, requestPermission, getPermission, scheduleNotification, cancelAll } from '@/lib/notifications'

const sb = createClient()

type Block = { id: string; title: string; date: string; start_minutes: number; end_minutes: number }
type Win   = { label: string; days_of_week: number[]; start_minutes: number; end_minutes: number }

function minsToLabel(m: number) {
  const h = Math.floor(m/60), min = m%60
  return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`
}

const WORK_REMINDER_MSGS = [
  "Time to focus. Open your timer and get to work.",
  "Your accountability window is active. Is your timer running?",
  "Every minute counts. Start your session now.",
  "The best time to start was earlier. The second best time is now.",
  "Your goals are waiting. Start the timer.",
]

export default function NotificationsPage() {
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [swReady,    setSwReady]    = useState(false)
  const [loading,    setLoading]    = useState(false)
  const [scheduled,  setScheduled]  = useState(0)

  // Settings stored in localStorage
  const [calReminders,  setCalReminders]  = useState(true)
  const [calMinsBefore, setCalMinsBefore] = useState(10)
  const [workReminders, setWorkReminders] = useState(true)
  const [workInterval,  setWorkInterval]  = useState(30) // minutes

  useEffect(() => {
    setPermission(getPermission())
    registerSW().then(r => setSwReady(!!r))
    // Load settings
    try {
      const s = JSON.parse(localStorage.getItem('mizan_notif_settings') ?? '{}')
      if (s.calReminders  !== undefined) setCalReminders(s.calReminders)
      if (s.calMinsBefore !== undefined) setCalMinsBefore(s.calMinsBefore)
      if (s.workReminders !== undefined) setWorkReminders(s.workReminders)
      if (s.workInterval  !== undefined) setWorkInterval(s.workInterval)
    } catch {}
  }, [])

  function saveSettings(patch: Record<string, boolean|number>) {
    try {
      const cur = JSON.parse(localStorage.getItem('mizan_notif_settings') ?? '{}')
      localStorage.setItem('mizan_notif_settings', JSON.stringify({...cur, ...patch}))
    } catch {}
  }

  async function enable() {
    setLoading(true)
    const perm = await requestPermission()
    setPermission(perm)
    setLoading(false)
  }

  const scheduleAll = useCallback(async () => {
    if (permission !== 'granted') return
    cancelAll()
    let count = 0
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`

    // Calendar event reminders
    if (calReminders) {
      const { data: blocks } = await sb.from('schedule_blocks').select('id,title,date,start_minutes,end_minutes')
        .eq('user_id', user.id).gte('date', todayStr).limit(50)
      for (const b of (blocks ?? []) as Block[]) {
        const fireAt = new Date(`${b.date}T00:00:00`)
        fireAt.setMinutes(fireAt.getMinutes() + b.start_minutes - calMinsBefore)
        if (fireAt > today) {
          scheduleNotification(
            `cal_${b.id}`, fireAt,
            `📅 Starting in ${calMinsBefore}m`,
            b.title || 'Calendar event',
            '/calendar'
          )
          count++
        }
      }
    }

    // Work reminders during accountability windows
    if (workReminders) {
      const { data: wins } = await sb.from('accountability_windows').select('*').eq('user_id', user.id).eq('is_active', true)
      const now = new Date()
      const dow = now.getDay()
      const todayMins = now.getHours()*60 + now.getMinutes()

      for (const w of (wins ?? []) as Win[]) {
        if (!w.days_of_week.includes(dow)) continue
        // Schedule reminders at every workInterval minutes during the window
        let slot = w.start_minutes
        while (slot < w.end_minutes) {
          if (slot > todayMins) {
            const fireAt = new Date()
            fireAt.setHours(Math.floor(slot/60), slot%60, 0, 0)
            const msg = WORK_REMINDER_MSGS[Math.floor(Math.random() * WORK_REMINDER_MSGS.length)]
            scheduleNotification(
              `work_${w.label}_${slot}`, fireAt,
              `⏱ ${w.label} · Work time`,
              msg,
              '/timer'
            )
            count++
          }
          slot += workInterval
        }
      }
    }

    setScheduled(count)
  }, [permission, calReminders, calMinsBefore, workReminders, workInterval])

  useEffect(() => {
    if (permission === 'granted') scheduleAll()
  }, [permission, scheduleAll])

  const granted = permission === 'granted'
  const denied  = permission === 'denied'

  return (
    <>
      <div className="bg-white px-6 py-3 border-b-2 border-[#0A0A0A] flex-shrink-0">
        <div className="text-[19px] font-bold tracking-[.04em]">Notifications</div>
        <div className="text-[10px] text-[#888] tracking-[.12em] uppercase mt-0.5">Calendar reminders · Work nudges</div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-lg space-y-6">

          {/* Permission card */}
          <div className={`rounded-xl p-5 border-2 ${granted ? 'bg-[#f0fdf4] border-[#bbf7d0]' : denied ? 'bg-[#fef2f2] border-[#fecaca]' : 'bg-[#f7f7f7] border-[#efefef]'}`}>
            <div className="flex items-center gap-3">
              <div className="text-[28px]">{granted ? '🔔' : denied ? '🔕' : '🔔'}</div>
              <div className="flex-1">
                <div className="text-[14px] font-bold text-[#0A0A0A]">
                  {granted ? 'Notifications enabled' : denied ? 'Notifications blocked' : 'Enable notifications'}
                </div>
                <div className="text-[11px] text-[#888] mt-0.5">
                  {granted
                    ? `${scheduled} notification${scheduled !== 1 ? 's' : ''} scheduled`
                    : denied
                    ? 'Click the lock icon in your browser address bar to re-enable'
                    : 'Get calendar reminders and work nudges'}
                </div>
              </div>
              {!granted && !denied && (
                <button onClick={enable} disabled={loading}
                  className="px-4 py-2 bg-[#FF5C00] text-white text-[10px] font-bold uppercase tracking-[.08em] rounded-lg hover:bg-[#FF7A2E] transition-colors disabled:opacity-50 flex-shrink-0">
                  {loading ? '…' : 'Enable'}
                </button>
              )}
              {granted && (
                <button onClick={scheduleAll}
                  className="px-3 py-1.5 border border-[#16a34a] text-[#16a34a] text-[10px] font-bold uppercase tracking-[.08em] rounded-lg hover:bg-[#f0fdf4] transition-colors flex-shrink-0">
                  Refresh
                </button>
              )}
            </div>
          </div>

          {/* Calendar reminders */}
          <div className={!granted ? 'opacity-40 pointer-events-none' : ''}>
            <div className="text-[9px] font-bold text-[#bcbcbc] tracking-[.16em] uppercase mb-3">📅 Calendar Reminders</div>
            <div className="bg-white border border-[#efefef] rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#f5f5f5]">
                <div>
                  <div className="text-[13px] font-medium">Remind me before events</div>
                  <div className="text-[10px] text-[#aaa] mt-0.5">Fires for today's calendar events</div>
                </div>
                <button onClick={() => { setCalReminders(v => { saveSettings({calReminders:!v}); return !v }) }}
                  className="relative flex-shrink-0" style={{width:40,height:22}}>
                  <div className={`w-10 rounded-full transition-colors ${calReminders?'bg-[#FF5C00]':'bg-[#dedede]'}`} style={{height:22}}/>
                  <div className={`absolute top-0.5 w-[18px] h-[18px] bg-white rounded-full shadow transition-all ${calReminders?'left-[20px]':'left-[2px]'}`}/>
                </button>
              </div>
              {calReminders && (
                <div className="px-4 py-3">
                  <div className="text-[10px] font-bold text-[#888] uppercase tracking-[.08em] mb-2">Minutes before event</div>
                  <div className="flex gap-2">
                    {[5, 10, 15, 30].map(m => (
                      <button key={m} onClick={() => { setCalMinsBefore(m); saveSettings({calMinsBefore:m}) }}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${calMinsBefore===m?'bg-[#0A0A0A] text-white border-[#0A0A0A]':'border-[#efefef] text-[#888] hover:border-[#dedede]'}`}>
                        {m}m
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Work reminders */}
          <div className={!granted ? 'opacity-40 pointer-events-none' : ''}>
            <div className="text-[9px] font-bold text-[#bcbcbc] tracking-[.16em] uppercase mb-3">⏱ Work Reminders</div>
            <div className="bg-white border border-[#efefef] rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#f5f5f5]">
                <div>
                  <div className="text-[13px] font-medium">Nudge me during work windows</div>
                  <div className="text-[10px] text-[#aaa] mt-0.5">Fires during your accountability windows</div>
                </div>
                <button onClick={() => { setWorkReminders(v => { saveSettings({workReminders:!v}); return !v }) }}
                  className="relative flex-shrink-0" style={{width:40,height:22}}>
                  <div className={`w-10 rounded-full transition-colors ${workReminders?'bg-[#FF5C00]':'bg-[#dedede]'}`} style={{height:22}}/>
                  <div className={`absolute top-0.5 w-[18px] h-[18px] bg-white rounded-full shadow transition-all ${workReminders?'left-[20px]':'left-[2px]'}`}/>
                </button>
              </div>
              {workReminders && (
                <div className="px-4 py-3">
                  <div className="text-[10px] font-bold text-[#888] uppercase tracking-[.08em] mb-2">Reminder every</div>
                  <div className="flex gap-2">
                    {[15, 30, 45, 60].map(m => (
                      <button key={m} onClick={() => { setWorkInterval(m); saveSettings({workInterval:m}) }}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${workInterval===m?'bg-[#0A0A0A] text-white border-[#0A0A0A]':'border-[#efefef] text-[#888] hover:border-[#dedede]'}`}>
                        {m}m
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* How it works */}
          <div className="bg-[#f7f7f7] border border-[#efefef] rounded-xl p-4 space-y-2">
            <div className="text-[10px] font-bold text-[#888] uppercase tracking-[.1em]">How it works</div>
            <div className="text-[11px] text-[#aaa] space-y-1.5 leading-relaxed">
              <div>• Notifications are scheduled when you open this page and after you change settings</div>
              <div>• They fire even if the Mizan tab is in the background, as long as your browser is open</div>
              <div>• Work reminders only fire during accountability windows you&apos;ve set up</div>
              <div>• Clicking a notification opens the right page directly</div>
            </div>
          </div>

          {/* Test button */}
          {granted && (
            <button onClick={() => {
              new Notification('🔔 Test notification', {
                body: 'Notifications are working perfectly!',
                icon: '/favicon.ico',
                tag: 'test',
              })
            }}
              className="w-full py-2.5 border border-[#dedede] text-[10px] font-bold uppercase tracking-[.08em] text-[#888] rounded-lg hover:border-[#0A0A0A] hover:text-[#0A0A0A] transition-colors">
              Send test notification
            </button>
          )}

        </div>
      </div>
    </>
  )
}
