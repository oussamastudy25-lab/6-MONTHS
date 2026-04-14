'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

type Habit = { id: string; name: string; frequency: string }
type Log   = { habit_id: string; status: string; date: string }

const sb = createClient()
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function isScheduled(frequency: string, d = new Date()) {
  const dow = d.getDay()
  if (frequency === 'weekdays') return dow >= 1 && dow <= 5
  if (frequency === 'weekends') return dow === 0 || dow === 6
  if (frequency === '3x') return [1, 3, 5].includes(dow)
  return true
}

function fmt(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export default function TrackerPage() {
  const now   = new Date()
  const today = fmt(now)
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [habits, setHabits] = useState<Habit[]>([])
  const [logs, setLogs]     = useState<Log[]>([])   // ALL logs, all months
  const [loaded, setLoaded] = useState(false)

  // Load habits + ALL logs once on mount — month nav never re-fetches
  const load = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const [{ data: h }, { data: l }] = await Promise.all([
      sb.from('habits').select('id,name,frequency').eq('user_id', user.id).is('archived_at', null).order('position'),
      sb.from('habit_logs').select('habit_id,status,date').eq('user_id', user.id),
    ])
    setHabits(h ?? [])
    setLogs(l ?? [])
    setLoaded(true)
  }, [])

  useEffect(() => { load() }, [load])

  // Derive days for the currently viewed month (UI only — no fetch)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const d = i + 1
    return `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
  })

  function getStatus(habitId: string, date: string) {
    return logs.find(l => l.habit_id === habitId && l.date === date)?.status ?? ''
  }

  async function save(habitId: string, date: string, next: string) {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return

    // Update local state immediately
    setLogs(prev => {
      const without = prev.filter(l => !(l.habit_id === habitId && l.date === date))
      return next === '' ? without : [...without, { habit_id: habitId, status: next, date }]
    })

    // Persist to DB
    if (next === '') {
      await sb.from('habit_logs').delete()
        .eq('user_id', user.id).eq('habit_id', habitId).eq('date', date)
    } else {
      await sb.from('habit_logs').upsert(
        { user_id: user.id, habit_id: habitId, date, status: next },
        { onConflict: 'user_id,habit_id,date' }
      )
    }
  }

  // Today buttons: tap to set specific status, tap again to clear
  function toggleStatus(habitId: string, date: string, status: string) {
    const current = getStatus(habitId, date)
    save(habitId, date, current === status ? '' : status)
  }

  // Grid squares: tap cycles '' → done → missed → na → ''
  function cycleStatus(habitId: string, date: string) {
    const current = getStatus(habitId, date)
    const next = current === '' ? 'done' : current === 'done' ? 'missed' : current === 'missed' ? 'na' : ''
    save(habitId, date, next)
  }

  function cardStats(habitId: string) {
    let done = 0, missed = 0, streak = 0, best = 0, cur = 0
    days.forEach(d => {
      const v = getStatus(habitId, d)
      if (v === 'done') { done++; cur++; best = Math.max(best, cur) }
      else if (v === 'missed') { missed++; cur = 0 }
      else cur = 0
    })
    for (let i = days.length - 1; i >= 0; i--) {
      if (getStatus(habitId, days[i]) === 'done') streak++
      else break
    }
    const tracked = done + missed
    const pct = tracked > 0 ? Math.round(done / tracked * 100) : 0
    return { done, missed, streak, best, pct }
  }

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth()
  const activeHabits = habits.filter(h => h.name)
  const scheduledToday = activeHabits.filter(h => isScheduled(h.frequency))
  const restDayToday   = activeHabits.filter(h => !isScheduled(h.frequency))

  return (
    <>
      <div className="bg-white px-6 py-3 border-b border-[#E8EAED] flex-shrink-0">
        <div className="text-[22px] font-normal text-[#202124]">Tracker</div>
        <div className="text-[12px] text-[#5F6368] mt-1">Log today's habits · monthly overview</div>
      </div>

      <div className="flex items-center gap-2 px-6 py-2 bg-[#f7f7f7] border-b border-[#E8EAED] flex-shrink-0">
        <button onClick={() => { if(month===0){setMonth(11);setYear(y=>y-1)}else setMonth(m=>m-1) }}
          className="w-6 h-6 border border-[#DADCE0] rounded flex items-center justify-center text-[14px] text-[#5F6368] hover:bg-[#0A0A0A] hover:text-white hover:border-[#0A0A0A] transition-colors">‹</button>
        <span className="text-[13px] font-bold tracking-[.04em] min-w-[140px] text-center">{MONTHS[month]} {year}</span>
        <button onClick={() => { if(month===11){setMonth(0);setYear(y=>y+1)}else setMonth(m=>m+1) }}
          className="w-6 h-6 border border-[#DADCE0] rounded flex items-center justify-center text-[14px] text-[#5F6368] hover:bg-[#0A0A0A] hover:text-white hover:border-[#0A0A0A] transition-colors">›</button>
        <button onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()) }}
          className="text-[9px] font-bold uppercase tracking-[.1em] px-3 py-1 rounded border border-[#DADCE0] text-[#5F6368] hover:bg-[#FF5C00] hover:text-white hover:border-[#FF5C00] transition-colors">Today</button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!loaded ? (
          <div className="text-center py-20 text-[#5F6368] text-[13px]">Loading…</div>
        ) : activeHabits.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-4xl mb-3">▦</div>
            <div className="text-[15px] font-bold mb-1">No habits yet</div>
            <div className="text-[13px] text-[#5F6368] mb-4">Add your first habit to start tracking</div>
            <a href="/setup"
              className="inline-block bg-[#FF5C00] text-white text-[10px] font-bold uppercase tracking-[.1em] px-5 py-2.5 rounded-lg hover:bg-[#FF7A2E] transition-colors">
              + Add Habits in Setup
            </a>
          </div>
        ) : (
          <>
            {/* TODAY'S LOG */}
            {isCurrentMonth && (
              <div className="px-5 pt-4 pb-4 border-b border-[#E8EAED] bg-white">
                <div className="text-[9px] font-bold text-[#80868B] tracking-[.16em] uppercase mb-3">
                  Today — {now.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long' })}
                </div>
                <div className="space-y-2">
                  {scheduledToday.map(h => {
                    const s = getStatus(h.id, today)
                    return (
                      <div key={h.id} className="flex items-center gap-3 bg-[#f7f7f7] rounded-lg px-3 py-2.5">
                        <span className="text-[13px] font-semibold flex-1">{h.name}</span>
                        <div className="flex gap-1.5">
                          {(['done','missed','na'] as const).map(status => {
                            const active = s === status
                            const cfg = {
                              done:   { label:'✓ Done',   on:'bg-[#22c55e] text-white border-[#22c55e]',  off:'border-[#DADCE0] text-[#5F6368] hover:border-[#22c55e] hover:text-[#22c55e]' },
                              missed: { label:'✗ Missed', on:'bg-[#ef4444] text-white border-[#ef4444]',  off:'border-[#DADCE0] text-[#5F6368] hover:border-[#ef4444] hover:text-[#ef4444]' },
                              na:     { label:'— Skip',   on:'bg-[#888] text-white border-[#888]',         off:'border-[#DADCE0] text-[#80868B] hover:border-[#888] hover:text-[#5F6368]' },
                            }[status]
                            return (
                              <button key={status}
                                onClick={() => toggleStatus(h.id, today, status)}
                                className={`px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-[.06em] border-2 transition-all ${active ? cfg.on : cfg.off}`}>
                                {cfg.label}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
                {restDayToday.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5 px-1">
                    {restDayToday.map(h => (
                      <span key={h.id} className="text-[9px] text-[#80868B] bg-[#f5f5f5] px-2 py-1 rounded-lg">
                        {h.name} · rest day
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* MONTHLY GRID CARDS */}
            <div className="p-5 grid gap-3 max-w-5xl" style={{gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))'}}>
              {activeHabits.map((h, idx) => {
                const { done, missed, streak, best, pct } = cardStats(h.id)
                return (
                  <div key={h.id} className="bg-white border border-[#E8EAED] rounded-lg p-4 hover:border-[#DADCE0] transition-colors">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="font-mono text-[10px] text-[#80868B]">#{idx+1}</span>
                      <span className="text-[13px] font-bold flex-1">{h.name}</span>
                      <div className="text-right">
                        <div className="font-mono text-[18px] font-semibold text-[#FF5C00]">{pct}%</div>
                        {streak > 0 && <div className="text-[9px] text-[#FF5C00]/70 font-bold">🔥 {streak}d</div>}
                      </div>
                    </div>
                    <div className="h-1 bg-[#efefef] rounded-full overflow-hidden mb-3">
                      <div className="h-full bg-[#FF5C00] rounded-full" style={{width:`${pct}%`}} />
                    </div>
                    <div className="flex flex-wrap gap-0.5 mb-3">
                      {days.map(d => {
                        const v = getStatus(h.id, d)
                        const day = parseInt(d.split('-')[2])
                        const isToday = d === today
                        const dayDow = new Date(d+'T12:00:00').getDay()
                        const dayScheduled = isScheduled(h.frequency, new Date(d+'T12:00:00'))
                        return (
                          <button key={d}
                            title={`${d}: ${!dayScheduled ? 'rest day' : v || 'tap to log'}`}
                            onClick={() => dayScheduled && cycleStatus(h.id, d)}
                            className={`w-[18px] h-[18px] rounded-[3px] flex items-center justify-center font-mono text-[8px] transition-all cursor-pointer
                              ${!dayScheduled   ? 'bg-[#f3f3f3] text-[#e0e0e0] cursor-default'
                              : v==='done'       ? 'bg-[#FF5C00] text-white hover:scale-125'
                              : v==='missed'     ? 'bg-[#FBE9E7] text-[#8B0000] hover:scale-125'
                              : v==='na'         ? 'bg-[#f5f5f5] text-[#80868B] hover:scale-125'
                              : isToday          ? 'bg-[#f0f0f0] text-[#0A0A0A] ring-1 ring-[#FF5C00] hover:scale-125'
                              : 'bg-[#f7f7f7] text-[#dedede] hover:scale-125'}`}>
                            {dayScheduled ? day : '·'}
                          </button>
                        )
                      })}
                    </div>
                    <div className="flex gap-4 pt-2 border-t border-[#f7f7f7]">
                      {[['Done',done],['Missed',missed],['Streak',`${streak}d`],['Best',`${best}d`]].map(([l,v])=>(
                        <div key={l as string}>
                          <div className="font-mono text-[14px] font-semibold">{v}</div>
                          <div className="text-[8px] text-[#5F6368] uppercase tracking-[.08em] mt-0.5">{l}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </>
  )
}
