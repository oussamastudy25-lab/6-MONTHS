'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

const sb = createClient()

function getSettings() {
  try { return JSON.parse(localStorage.getItem('mizan_notif_settings') ?? '{}') } catch { return {} }
}
function saveSettings(patch: Record<string, unknown>) {
  try {
    const cur = getSettings()
    localStorage.setItem('mizan_notif_settings', JSON.stringify({...cur, ...patch}))
  } catch {}
}

export default function NotificationsPage() {
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [loading,    setLoading]    = useState(false)
  const [tested,     setTested]     = useState(false)
  const [debugInfo,  setDebugInfo]  = useState<string[]>([])

  const [calEnabled,   setCalEnabled]   = useState(true)
  const [calMins,      setCalMins]      = useState(10)
  const [workEnabled,  setWorkEnabled]  = useState(true)
  const [workInterval, setWorkInterval] = useState(30)

  useEffect(() => {
    if ('Notification' in window) setPermission(Notification.permission)
    const s = getSettings()
    if (s.calReminders  !== undefined) setCalEnabled(s.calReminders)
    if (s.calMinsBefore !== undefined) setCalMins(s.calMinsBefore)
    if (s.workReminders !== undefined) setWorkEnabled(s.workReminders)
    if (s.workInterval  !== undefined) setWorkInterval(s.workInterval)

    loadDebugInfo()
  }, [])

  async function loadDebugInfo() {
    const lines: string[] = []
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { setDebugInfo(['Not logged in']); return }

    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`

    const [{ data: blocks }, { data: wins }] = await Promise.all([
      sb.from('schedule_blocks').select('id,title,date,start_minutes').eq('user_id', user.id).eq('date', today),
      sb.from('accountability_windows').select('label,days_of_week,start_minutes,end_minutes,is_active').eq('user_id', user.id),
    ])

    lines.push(`Today: ${today} (${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][now.getDay()]})`)
    lines.push(`Current time: ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`)
    lines.push(`Calendar events today: ${(blocks ?? []).length}`)
    for (const b of blocks ?? []) {
      const h = Math.floor(b.start_minutes/60), m = b.start_minutes%60
      lines.push(`  · ${b.title || 'Untitled'} at ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`)
    }
    lines.push(`Accountability windows: ${(wins ?? []).length}`)
    for (const w of wins ?? []) {
      const sh = Math.floor(w.start_minutes/60), sm = w.start_minutes%60
      const eh = Math.floor(w.end_minutes/60), em = w.end_minutes%60
      const days = w.days_of_week.map((d: number) => ['Su','Mo','Tu','We','Th','Fr','Sa'][d]).join('/')
      lines.push(`  · ${w.label} ${days} ${String(sh).padStart(2,'0')}:${String(sm).padStart(2,'0')}–${String(eh).padStart(2,'0')}:${String(em).padStart(2,'0')} (${w.is_active ? 'active' : 'inactive'})`)
    }
    lines.push(`Check runs every 60s. Notifications fire within a 2-minute window of each target time.`)
    setDebugInfo(lines)
  }

  async function enable() {
    setLoading(true)
    const perm = await Notification.requestPermission()
    setPermission(perm)
    setLoading(false)
  }

  function sendTest() {
    if (Notification.permission !== 'granted') return
    try {
      const n = new Notification('🔔 Mizan — Test notification', {
        body: "Notifications are working! Calendar reminders and work nudges are active.",
        icon: '/favicon.ico',
        tag: 'mizan-test-' + Date.now(),
        requireInteraction: false,
      })
      n.onclick = () => window.focus()
    } catch (e) { console.warn('Test notif error:', e) }
    setTested(true)
    setTimeout(() => setTested(false), 3000)
  }

  const granted = permission === 'granted'
  const denied  = permission === 'denied'

  return (
    <>
      <div className="bg-white px-6 py-3 border-b border-[#E8EAED] flex-shrink-0">
        <div className="text-[22px] font-normal text-[#202124]">Notifications</div>
        <div className="text-[12px] text-[#5F6368] mt-1">Calendar reminders · Work nudges</div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-lg space-y-6">

          {/* Permission card */}
          <div className={`rounded-xl p-5 border-2 ${granted ? 'bg-[#f0fdf4] border-[#bbf7d0]' : denied ? 'bg-[#fef2f2] border-[#fecaca]' : 'bg-[#f7f7f7] border-[#E8EAED]'}`}>
            <div className="flex items-center gap-4">
              <div className="text-[32px]">{granted ? '🔔' : denied ? '🔕' : '🔔'}</div>
              <div className="flex-1">
                <div className="text-[14px] font-bold">
                  {granted ? 'Notifications enabled' : denied ? 'Notifications blocked' : 'Notifications off'}
                </div>
                <div className="text-[11px] text-[#5F6368] mt-0.5 leading-relaxed">
                  {granted
                    ? 'Checks every 60 seconds. Fires when a calendar event or work window aligns.'
                    : denied
                    ? 'Click the 🔒 in your browser address bar → Site settings → reset Notifications, then refresh.'
                    : 'Enable to get calendar reminders and work nudges.'}
                </div>
              </div>
              {!granted && !denied && (
                <button onClick={enable} disabled={loading}
                  className="px-4 py-2.5 bg-[#FF5C00] text-white text-[10px] font-bold uppercase tracking-[.08em] rounded-lg hover:bg-[#FF7A2E] transition-colors disabled:opacity-50 flex-shrink-0">
                  {loading ? '…' : 'Enable'}
                </button>
              )}
            </div>
          </div>

          {/* Test button - most important, show first */}
          {granted && (
            <button onClick={sendTest}
              className={`w-full py-3 text-[12px] font-bold uppercase tracking-[.08em] rounded-xl border-2 transition-all ${tested ? 'border-[#22c55e] text-[#22c55e] bg-[#f0fdf4]' : 'border-[#FF5C00] text-[#FF5C00] hover:bg-[#FFF0E8]'}`}>
              {tested ? '✓ Notification sent — check your browser!' : '🔔 Send test notification now'}
            </button>
          )}

          {/* Calendar settings */}
          <div className={!granted ? 'opacity-40 pointer-events-none' : ''}>
            <div className="text-[9px] font-bold text-[#80868B] tracking-[.16em] uppercase mb-3">📅 Calendar Reminders</div>
            <div className="bg-white border border-[#E8EAED] rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3.5 border-b border-[#f5f5f5]">
                <div>
                  <div className="text-[14px] font-medium">Remind before calendar events</div>
                  <div className="text-[10px] text-[#aaa] mt-0.5">Fires for events added to your Calendar page</div>
                </div>
                <button onClick={() => { const v = !calEnabled; setCalEnabled(v); saveSettings({calReminders:v}) }}
                  className="relative flex-shrink-0" style={{width:40,height:22}}>
                  <div className={`w-10 rounded-full transition-colors ${calEnabled?'bg-[#FF5C00]':'bg-[#dedede]'}`} style={{height:22}}/>
                  <div className={`absolute top-0.5 w-[18px] h-[18px] bg-white rounded-full shadow transition-all ${calEnabled?'left-[20px]':'left-[2px]'}`}/>
                </button>
              </div>
              {calEnabled && (
                <div className="px-4 py-3">
                  <div className="text-[10px] font-bold text-[#5F6368] uppercase tracking-[.08em] mb-2">Minutes before event</div>
                  <div className="flex gap-2">
                    {[5, 10, 15, 30].map(m => (
                      <button key={m} onClick={() => { setCalMins(m); saveSettings({calMinsBefore:m}) }}
                        className={`px-4 py-1.5 rounded-lg text-[12px] font-bold border transition-all ${calMins===m?'bg-[#FF5C00] text-white border-[#0A0A0A]':'border-[#E8EAED] text-[#5F6368] hover:border-[#DADCE0]'}`}>
                        {m}m
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Work settings */}
          <div className={!granted ? 'opacity-40 pointer-events-none' : ''}>
            <div className="text-[9px] font-bold text-[#80868B] tracking-[.16em] uppercase mb-3">⏱ Work Reminders</div>
            <div className="bg-white border border-[#E8EAED] rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3.5 border-b border-[#f5f5f5]">
                <div>
                  <div className="text-[14px] font-medium">Nudge during accountability windows</div>
                  <div className="text-[10px] text-[#aaa] mt-0.5">Only fires during windows set in Accountability</div>
                </div>
                <button onClick={() => { const v = !workEnabled; setWorkEnabled(v); saveSettings({workReminders:v}) }}
                  className="relative flex-shrink-0" style={{width:40,height:22}}>
                  <div className={`w-10 rounded-full transition-colors ${workEnabled?'bg-[#FF5C00]':'bg-[#dedede]'}`} style={{height:22}}/>
                  <div className={`absolute top-0.5 w-[18px] h-[18px] bg-white rounded-full shadow transition-all ${workEnabled?'left-[20px]':'left-[2px]'}`}/>
                </button>
              </div>
              {workEnabled && (
                <div className="px-4 py-3">
                  <div className="text-[10px] font-bold text-[#5F6368] uppercase tracking-[.08em] mb-2">Remind every</div>
                  <div className="flex gap-2">
                    {[15, 30, 45, 60].map(m => (
                      <button key={m} onClick={() => { setWorkInterval(m); saveSettings({workInterval:m}) }}
                        className={`px-4 py-1.5 rounded-lg text-[12px] font-bold border transition-all ${workInterval===m?'bg-[#FF5C00] text-white border-[#0A0A0A]':'border-[#E8EAED] text-[#5F6368] hover:border-[#DADCE0]'}`}>
                        {m}m
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Debug info */}
          {granted && debugInfo.length > 0 && (
            <div className="bg-[#f7f7f7] border border-[#E8EAED] rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] font-bold text-[#5F6368] uppercase tracking-[.1em]">Status</div>
                <button onClick={loadDebugInfo} className="text-[9px] text-[#80868B] hover:text-[#5F6368] uppercase tracking-[.08em]">Refresh</button>
              </div>
              <div className="space-y-0.5">
                {debugInfo.map((line, i) => (
                  <div key={i} className={`font-mono text-[10px] ${line.startsWith('  ·') ? 'text-[#5F6368] pl-2' : 'text-[#555]'}`}>
                    {line}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-[#f7f7f7] border border-[#E8EAED] rounded-xl p-4">
            <div className="text-[10px] font-bold text-[#5F6368] uppercase tracking-[.1em] mb-2">How it works</div>
            <div className="text-[11px] text-[#aaa] space-y-1.5 leading-relaxed">
              <div>• Mizan checks every 60 seconds whether a notification should fire</div>
              <div>• Works while browser is open, even if Mizan tab is in the background</div>
              <div>• Calendar: fires when you open Mizan and leave it open before an event</div>
              <div>• Work nudges: requires accountability windows set in the Accountability page</div>
              <div>• Clicking a notification opens the right page directly</div>
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
