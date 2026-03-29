'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

type Habit = { id: string; name: string }
type Log   = { habit_id: string; status: string; date: string }

const sb = createClient()
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

export default function TrackerPage() {
  const now = new Date()
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [habits, setHabits] = useState<Habit[]>([])
  const [logs, setLogs]     = useState<Log[]>([])

  const load = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const ym = `${year}-${String(month+1).padStart(2,'0')}`
    const [{ data: h }, { data: l }] = await Promise.all([
      sb.from('habits').select('id,name').eq('user_id', user.id).is('archived_at', null).order('position'),
      sb.from('habit_logs').select('habit_id,status,date').eq('user_id', user.id).like('date', `${ym}-%`),
    ])
    setHabits(h ?? [])
    setLogs(l ?? [])
  }, [year, month])

  useEffect(() => { load() }, [load])

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const d = i + 1
    return `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
  })

  function getStatus(habitId: string, date: string) {
    return logs.find(l => l.habit_id === habitId && l.date === date)?.status ?? ''
  }

  function cardStats(habitId: string) {
    let done = 0, missed = 0, streak = 0, best = 0, cur = 0
    days.forEach(d => {
      const v = getStatus(habitId, d)
      if (v === 'done') { done++; cur++; best = Math.max(best, cur) }
      else if (v === 'missed') { missed++; cur = 0 }
      else cur = 0
    })
    // current streak = from end of month backwards
    for (let i = days.length - 1; i >= 0; i--) {
      if (getStatus(habitId, days[i]) === 'done') streak++
      else break
    }
    const tracked = done + missed
    const pct = tracked > 0 ? Math.round(done / tracked * 100) : 0
    return { done, missed, streak, best, pct }
  }

  const activeHabits = habits.filter(h => h.name)

  return (
    <>
      {/* Header */}
      <div className="bg-white px-6 py-3 border-b-2 border-[#0A0A0A] flex-shrink-0">
        <div className="text-[19px] font-bold tracking-[.04em]">Tracker</div>
        <div className="text-[10px] text-[#888] tracking-[.12em] uppercase mt-0.5">Habit cards · monthly view</div>
      </div>

      {/* Month nav */}
      <div className="flex items-center gap-2 px-6 py-2 bg-[#f7f7f7] border-b border-[#efefef] flex-shrink-0">
        <button onClick={() => { if(month===0){setMonth(11);setYear(y=>y-1)}else setMonth(m=>m-1) }}
          className="w-6 h-6 border border-[#dedede] rounded flex items-center justify-center text-[14px] text-[#888] hover:bg-[#0A0A0A] hover:text-white hover:border-[#0A0A0A] transition-colors">‹</button>
        <span className="text-[13px] font-bold tracking-[.04em] min-w-[140px] text-center">{MONTHS[month]} {year}</span>
        <button onClick={() => { if(month===11){setMonth(0);setYear(y=>y+1)}else setMonth(m=>m+1) }}
          className="w-6 h-6 border border-[#dedede] rounded flex items-center justify-center text-[14px] text-[#888] hover:bg-[#0A0A0A] hover:text-white hover:border-[#0A0A0A] transition-colors">›</button>
        <button onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()) }}
          className="text-[9px] font-bold uppercase tracking-[.1em] px-3 py-1 rounded border border-[#dedede] text-[#888] hover:bg-[#FF5C00] hover:text-white hover:border-[#FF5C00] transition-colors">Today</button>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {activeHabits.length === 0 && (
          <div className="text-center py-20">
            <div className="text-4xl mb-3">▦</div>
            <div className="text-[15px] font-bold mb-1">No habits yet</div>
            <div className="text-[13px] text-[#888]">Add habits in Setup, then log them in Calendar</div>
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 max-w-5xl" style={{gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))'}}>
          {activeHabits.map((h, idx) => {
            const { done, missed, streak, best, pct } = cardStats(h.id)
            return (
              <div key={h.id} className="bg-white border border-[#efefef] rounded-lg p-4 hover:border-[#dedede] transition-colors">
                {/* Card header */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="font-mono text-[10px] text-[#bcbcbc]">#{idx+1}</span>
                  <span className="text-[13px] font-bold flex-1">{h.name}</span>
                  <span className="font-mono text-[18px] font-semibold text-[#FF5C00]">{pct}%</span>
                </div>

                {/* Progress bar */}
                <div className="h-1 bg-[#efefef] rounded-full overflow-hidden mb-3">
                  <div className="h-full bg-[#FF5C00] rounded-full bar-animated" style={{width:`${pct}%`}} />
                </div>

                {/* Day squares */}
                <div className="flex flex-wrap gap-0.5 mb-3">
                  {days.map(d => {
                    const v = getStatus(h.id, d)
                    const day = parseInt(d.split('-')[2])
                    return (
                      <div key={d} title={`Day ${day}: ${v || '—'}`}
                        className={`w-[18px] h-[18px] rounded-[3px] flex items-center justify-center font-mono text-[8px] transition-transform hover:scale-110 cursor-default
                          ${v==='done' ? 'bg-[#FF5C00] text-white' : v==='missed' ? 'bg-[#FBE9E7] text-[#8B0000]' : v==='na' ? 'bg-[#f5f5f5] text-[#bcbcbc]' : 'bg-[#f7f7f7] text-[#dedede]'}`}>
                        {day}
                      </div>
                    )
                  })}
                </div>

                {/* Footer stats */}
                <div className="flex gap-4 pt-2 border-t border-[#f7f7f7]">
                  {[['Done', done],['Missed', missed],['Streak', `${streak}d`],['Best', `${best}d`]].map(([l,v])=>(
                    <div key={l}>
                      <div className="font-mono text-[14px] font-semibold text-[#0A0A0A]">{v}</div>
                      <div className="text-[8px] text-[#888] uppercase tracking-[.08em] mt-0.5">{l}</div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
