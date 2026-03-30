'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

const sb = createClient()
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmt(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export default function ContentCalendarPage() {
  const today = fmt(new Date())
  const [posts, setPosts] = useState<Record<string, boolean>>({})
  const [startDate] = useState(() => {
    // Start from 6 months ago or current month start, whichever is sooner
    const d = new Date()
    d.setMonth(d.getMonth() - 0)
    d.setDate(1)
    return fmt(d)
  })

  const load = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const { data } = await sb.from('content_posts').select('date,posted').eq('user_id', user.id)
    const map: Record<string, boolean> = {}
    ;(data ?? []).forEach((p: {date:string;posted:boolean}) => { map[p.date] = p.posted })
    setPosts(map)
  }, [])

  useEffect(() => { load() }, [load])

  async function toggleDay(dateStr: string) {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    if (dateStr > today) return // Can't mark future days
    const current = posts[dateStr] ?? false
    const newVal = !current
    setPosts(prev => ({ ...prev, [dateStr]: newVal }))
    await sb.from('content_posts').upsert(
      { user_id: user.id, date: dateStr, posted: newVal },
      { onConflict: 'user_id,date' }
    )
  }

  // Generate 6 months of days from start
  const allDays: string[] = []
  const start = new Date(startDate)
  for (let i = 0; i < 180; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    allDays.push(fmt(d))
  }

  // Group by month
  const byMonth: Record<string, string[]> = {}
  allDays.forEach(d => {
    const mk = d.slice(0, 7)
    if (!byMonth[mk]) byMonth[mk] = []
    byMonth[mk].push(d)
  })

  const totalDays = allDays.filter(d => d <= today).length
  const postedDays = allDays.filter(d => d <= today && posts[d]).length
  const streak = (() => {
    let s = 0
    for (let i = allDays.indexOf(today); i >= 0; i--) {
      if (posts[allDays[i]]) s++; else break
    }
    return s
  })()
  const missedDays = totalDays - postedDays

  return (
    <>
      <div className="bg-white px-6 py-3 border-b-2 border-[#0A0A0A] flex items-center flex-shrink-0">
        <div>
          <div className="text-[19px] font-bold tracking-[.04em]">Content Calendar</div>
          <div className="text-[10px] text-[#888] tracking-[.12em] uppercase mt-0.5">180 days · click a day to mark as posted</div>
        </div>
        <div className="ml-auto flex gap-4">
          {[['Posted', postedDays, '#FF5C00'], ['Missed', missedDays, '#ef4444'], ['Streak', `${streak}d`, '#22c55e']].map(([l,v,c]) => (
            <div key={l as string} className="text-right">
              <div className="font-mono text-[20px] font-bold" style={{color:c as string}}>{v}</div>
              <div className="text-[9px] text-[#888] uppercase tracking-[.1em]">{l}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="space-y-6 max-w-4xl">
          {Object.entries(byMonth).map(([mk, days]) => {
            const [y, m] = mk.split('-').map(Number)
            const monthPosted = days.filter(d => d <= today && posts[d]).length
            const monthTotal = days.filter(d => d <= today).length
            const pct = monthTotal > 0 ? Math.round(monthPosted / monthTotal * 100) : null

            return (
              <div key={mk}>
                <div className="flex items-center gap-3 mb-2">
                  <div className="text-[12px] font-bold tracking-[.06em] uppercase">{MONTHS[m-1]} {y}</div>
                  {pct !== null && (
                    <>
                      <div className="flex-1 h-1 bg-[#efefef] rounded-full overflow-hidden max-w-[120px]">
                        <div className="h-full bg-[#FF5C00] rounded-full" style={{width:`${pct}%`}} />
                      </div>
                      <span className="font-mono text-[11px] text-[#888]">{monthPosted}/{monthTotal}</span>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {days.map(d => {
                    const isPast = d <= today
                    const isToday = d === today
                    const posted = posts[d] ?? false
                    const day = parseInt(d.split('-')[2])
                    return (
                      <button
                        key={d}
                        onClick={() => toggleDay(d)}
                        disabled={!isPast}
                        title={d}
                        className={`w-8 h-8 rounded-md flex items-center justify-center font-mono text-[10px] font-bold transition-all ${
                          !isPast
                            ? 'bg-[#fafafa] text-[#efefef] cursor-not-allowed'
                            : posted
                            ? 'bg-[#FF5C00] text-white shadow-sm hover:bg-[#FF7A2E]'
                            : isToday
                            ? 'bg-white border-2 border-[#FF5C00] text-[#FF5C00] hover:bg-[#FFF0E8]'
                            : 'bg-white border border-[#efefef] text-[#bcbcbc] hover:border-[#FF5C00] hover:text-[#FF5C00]'
                        }`}
                      >
                        {day}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
