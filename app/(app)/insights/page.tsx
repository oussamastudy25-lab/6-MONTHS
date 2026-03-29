'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

type Habit  = { id: string; name: string }
type Log    = { habit_id: string; status: string; date: string }
type Review = { win: string; improve: string; gratitude: string; next_week: string }

const sb = createClient()
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const REVIEW_FIELDS: { key: keyof Review; label: string; ph: string }[] = [
  { key:'win',       label:'🏆 Win of the week',   ph:'What went well?' },
  { key:'improve',   label:'🔧 What to improve',   ph:'What could be better?' },
  { key:'gratitude', label:'🤲 Gratitude',          ph:'What are you grateful for?' },
  { key:'next_week', label:'🎯 Next week focus',    ph:'One thing for next week?' },
]

function getMon(d: Date) {
  const day = d.getDay(), diff = day===0?-6:1-day
  const m = new Date(d); m.setDate(d.getDate()+diff); m.setHours(0,0,0,0); return m
}
function fmt(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
function weekLabel(mon: Date) {
  const sun = new Date(mon); sun.setDate(sun.getDate()+6)
  return `${mon.getDate()} ${MONTHS[mon.getMonth()].slice(0,3)} – ${sun.getDate()} ${MONTHS[sun.getMonth()].slice(0,3)}`
}
function weeksForMonth(y: number, m: number) {
  const first = new Date(y, m, 1), last = new Date(y, m+1, 0)
  const weeks: Date[] = []; let cur = getMon(first)
  while (cur <= last) { weeks.push(new Date(cur)); cur.setDate(cur.getDate()+7) }
  return weeks
}

export default function InsightsPage() {
  const now = new Date()
  const [tab, setTab]     = useState<'analytics'|'performance'|'review'>('analytics')
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [habits, setHabits] = useState<Habit[]>([])
  const [logs, setLogs]     = useState<Log[]>([])
  const [allLogs, setAllLogs] = useState<Log[]>([])
  const [weekMon, setWeekMon] = useState(() => fmt(getMon(now)))
  const [review, setReview] = useState<Review>({ win:'', improve:'', gratitude:'', next_week:'' })
  const [saving, setSaving] = useState(false)
  const [perfData, setPerfData] = useState<{month:string;done:number;total:number;tasks:string;goals:string}[]>([])

  const loadAnalytics = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const ym = `${year}-${String(month+1).padStart(2,'0')}`
    const [{ data: h }, { data: l }, { data: al }] = await Promise.all([
      sb.from('habits').select('id,name').eq('user_id', user.id).is('archived_at', null).order('position'),
      sb.from('habit_logs').select('habit_id,status,date').eq('user_id', user.id).like('date', `${ym}-%`),
      sb.from('habit_logs').select('habit_id,status,date').eq('user_id', user.id),
    ])
    setHabits(h ?? []); setLogs(l ?? []); setAllLogs(al ?? [])
  }, [year, month])

  const loadPerf = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const [{ data: l }, { data: t }, { data: g }] = await Promise.all([
      sb.from('habit_logs').select('date,status').eq('user_id', user.id),
      sb.from('tasks').select('date,done,text').eq('user_id', user.id),
      sb.from('monthly_goals').select('month,done,text').eq('user_id', user.id),
    ])
    // Group by month
    const months = Array.from(new Set((l??[]).map((r:{date:string}) => r.date.slice(0,7)))).sort()
    const curMk = `${year}-${String(month+1).padStart(2,'0')}`
    if (!months.includes(curMk)) months.push(curMk); months.sort()
    const rows = months.map(mk => {
      const ml = (l??[]).filter((r:{date:string}) => r.date.startsWith(mk))
      const done = ml.filter((r:{status:string}) => r.status==='done').length
      const tracked = ml.filter((r:{status:string}) => r.status!=='na').length
      const td = (t??[]).filter((r:{date:string;done:boolean;text:string}) => r.date.startsWith(mk) && r.text)
      const gd = (g??[]).filter((r:{month:string;text:string}) => r.month===mk && r.text)
      return {
        month: mk,
        done, total: tracked,
        tasks: td.length > 0 ? `${td.filter((r:{done:boolean})=>r.done).length}/${td.length}` : '—',
        goals: gd.length > 0 ? `${gd.filter((r:{done:boolean})=>r.done).length}/${gd.length}` : '—',
      }
    })
    setPerfData(rows)
  }, [year, month])

  const loadReview = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const { data } = await sb.from('reviews').select('*').eq('user_id', user.id).eq('week_start', weekMon).maybeSingle()
    setReview(data ? { win: data.win, improve: data.improve, gratitude: data.gratitude, next_week: data.next_week } : { win:'', improve:'', gratitude:'', next_week:'' })
  }, [weekMon])

  useEffect(() => {
    if (tab==='analytics') loadAnalytics()
    else if (tab==='performance') loadPerf()
    else loadReview()
  }, [tab, loadAnalytics, loadPerf, loadReview])

  async function saveReview() {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    setSaving(true)
    await sb.from('reviews').upsert({ user_id: user.id, week_start: weekMon, ...review, updated_at: new Date().toISOString() }, { onConflict: 'user_id,week_start' })
    setSaving(false)
  }

  // Analytics calcs
  const daysInMonth = new Date(year, month+1, 0).getDate()
  const days = Array.from({length:daysInMonth}, (_,i) => `${year}-${String(month+1).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`)
  const activeHabits = habits.filter(h => h.name)
  function getV(hid: string, date: string) { return logs.find(l => l.habit_id===hid && l.date===date)?.status ?? '' }

  // Best streak across all time
  const allDates = Array.from(new Set(allLogs.map(l=>l.date))).sort()
  let bestStreak = 0, curStr = 0
  allDates.forEach(d => {
    const anyDone = allLogs.some(l => l.date===d && l.status==='done')
    if (anyDone) { curStr++; bestStreak = Math.max(bestStreak, curStr) } else curStr = 0
  })

  const totalDone = logs.filter(l => l.status==='done').length
  const totalTracked = logs.filter(l => l.status!=='na').length
  const overallPct = totalTracked > 0 ? Math.round(totalDone/totalTracked*100) : 0

  // 12-week sparkline per habit
  function sparkline(hid: string) {
    const bars = []
    for (let w = 11; w >= 0; w--) {
      const mon = getMon(new Date(now.getTime() - w*7*86400000))
      let wd = 0, wt = 0
      for (let d = 0; d < 7; d++) {
        const dd = new Date(mon); dd.setDate(mon.getDate()+d)
        const ds = fmt(dd)
        const v = allLogs.find(l => l.habit_id===hid && l.date===ds)?.status ?? ''
        if (v==='done') { wd++; wt++ } else if (v==='missed') wt++
      }
      bars.push(wt > 0 ? Math.round(wd/wt*100) : 0)
    }
    return bars
  }

  const MonthNav = () => (
    <div className="flex items-center gap-2 px-6 py-2 bg-[#f7f7f7] border-b border-[#efefef] flex-shrink-0">
      <button onClick={() => { if(month===0){setMonth(11);setYear(y=>y-1)}else setMonth(m=>m-1) }}
        className="w-6 h-6 border border-[#dedede] rounded flex items-center justify-center text-[14px] text-[#888] hover:bg-[#0A0A0A] hover:text-white hover:border-[#0A0A0A] transition-colors">‹</button>
      <span className="text-[13px] font-bold tracking-[.04em] min-w-[140px] text-center">{MONTHS[month]} {year}</span>
      <button onClick={() => { if(month===11){setMonth(0);setYear(y=>y+1)}else setMonth(m=>m+1) }}
        className="w-6 h-6 border border-[#dedede] rounded flex items-center justify-center text-[14px] text-[#888] hover:bg-[#0A0A0A] hover:text-white hover:border-[#0A0A0A] transition-colors">›</button>
      <button onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()) }}
        className="text-[9px] font-bold uppercase tracking-[.1em] px-3 py-1 rounded border border-[#dedede] text-[#888] hover:bg-[#FF5C00] hover:text-white hover:border-[#FF5C00] transition-colors">Today</button>
    </div>
  )

  const curMk = `${year}-${String(month+1).padStart(2,'0')}`
  const weeks = weeksForMonth(year, month)

  return (
    <>
      {/* Header */}
      <div className="bg-white px-6 py-3 border-b-2 border-[#0A0A0A] flex items-center flex-shrink-0">
        <div>
          <div className="text-[19px] font-bold tracking-[.04em]">Insights</div>
          <div className="text-[10px] text-[#888] tracking-[.12em] uppercase mt-0.5">Analytics · Performance · Review</div>
        </div>
        {tab === 'review' && (
          <button onClick={saveReview} className="ml-auto bg-[#FF5C00] text-white text-[10px] font-bold uppercase tracking-[.1em] px-3 py-1.5 rounded-md hover:bg-[#FF7A2E] transition-colors disabled:opacity-50" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="flex border-b-2 border-[#0A0A0A] flex-shrink-0">
        {(['analytics','performance','review'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2.5 text-[10.5px] font-bold uppercase tracking-[.1em] border-b-2 -mb-0.5 transition-all ${tab===t ? 'text-[#FF5C00] border-[#FF5C00]' : 'text-[#888] border-transparent hover:text-[#0A0A0A]'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* ANALYTICS */}
      {tab === 'analytics' && (
        <>
          <MonthNav />
          <div className="flex-1 overflow-y-auto p-6">
            {/* KPI bar */}
            <div className="flex gap-2 mb-6 flex-wrap">
              {[['Total Done', totalDone],['Overall', `${overallPct}%`],['Best Streak', `${bestStreak}d`],['Habits', activeHabits.length]].map(([l,v]) => (
                <div key={l} className="bg-[#0A0A0A] px-4 py-3 rounded-md min-w-[90px]">
                  <div className="font-mono text-[21px] text-[#FF5C00] font-semibold">{v}</div>
                  <div className="text-[8.5px] text-[#888] uppercase tracking-[.1em] mt-0.5">{l}</div>
                </div>
              ))}
            </div>
            {/* Per-habit cards */}
            {activeHabits.length === 0 ? (
              <div className="text-[13px] text-[#888]">No habits configured.</div>
            ) : (
              <>
                <div className="text-[9px] font-bold text-[#bcbcbc] tracking-[.16em] uppercase mb-3">Per-Habit Breakdown</div>
                <div className="grid gap-3" style={{gridTemplateColumns:'repeat(auto-fill,minmax(270px,1fr))'}}>
                  {activeHabits.map((h, idx) => {
                    let done=0, missed=0, na=0
                    days.forEach(d => { const v=getV(h.id,d); if(v==='done')done++; else if(v==='missed')missed++; else if(v==='na')na++ })
                    const tracked=done+missed, pct=tracked>0?Math.round(done/tracked*100):0
                    const bars = sparkline(h.id)
                    const maxB = Math.max(...bars, 1)
                    return (
                      <div key={h.id} className="bg-white border border-[#efefef] rounded-lg p-4 hover:border-[#dedede] transition-colors">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="font-mono text-[10px] text-[#bcbcbc]">#{idx+1}</span>
                          <span className="text-[13px] font-bold flex-1">{h.name}</span>
                        </div>
                        <div className="flex gap-4 mb-3">
                          {[['Rate',`${pct}%`,true],['Done',done,false],['Missed',missed,false],['N/A',na,false]].map(([l,v,orange])=>(
                            <div key={l as string}>
                              <div className={`font-mono text-[19px] font-semibold ${orange?'text-[#FF5C00]':'text-[#0A0A0A]'}`}>{v}</div>
                              <div className="text-[8px] text-[#888] uppercase tracking-[.08em] mt-0.5">{l}</div>
                            </div>
                          ))}
                        </div>
                        <div className="h-1.5 bg-[#efefef] rounded-full overflow-hidden mb-3">
                          <div className="h-full bg-[#FF5C00] rounded-full bar-animated" style={{width:`${pct}%`}} />
                        </div>
                        {/* 12-week sparkline */}
                        <div className="flex gap-0.5 items-end h-8">
                          {bars.map((b,i) => (
                            <div key={i} className={`flex-1 rounded-sm ${b>0?'bg-[#FF5C00]':'bg-[#efefef]'}`}
                              style={{height:`${Math.max(b/maxB*100,b>0?8:4)}%`}} />
                          ))}
                        </div>
                        <div className="text-[8px] text-[#bcbcbc] mt-1">12-week trend</div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* PERFORMANCE */}
      {tab === 'performance' && (
        <div className="flex-1 overflow-y-auto p-6">
          {/* Month tiles */}
          <div className="text-[9px] font-bold text-[#bcbcbc] tracking-[.16em] uppercase mb-3">All Months</div>
          <div className="flex flex-wrap gap-2 mb-6">
            {perfData.map(row => {
              const [y,m] = row.month.split('-').map(Number)
              const pct = row.total > 0 ? Math.round(row.done/row.total*100) : null
              const isCur = row.month === curMk
              return (
                <button key={row.month} onClick={() => { setYear(y); setMonth(m-1) }}
                  className={`px-3 py-2 rounded-md border text-center transition-all ${isCur ? 'bg-[#FF5C00] border-[#FF5C00]' : 'bg-white border-[#efefef] hover:border-[#FF5C00]'}`}>
                  <div className={`text-[10px] font-bold ${isCur?'text-white':'text-[#0A0A0A]'}`}>{MONTHS[m-1].slice(0,3)} {y}</div>
                  <div className={`font-mono text-[12px] font-semibold mt-0.5 ${isCur?'text-white/80':'text-[#FF5C00]'}`}>{pct !== null ? `${pct}%` : '—'}</div>
                </button>
              )
            })}
          </div>
          {/* Table */}
          <div className="text-[9px] font-bold text-[#bcbcbc] tracking-[.16em] uppercase mb-3">Month-by-Month</div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {['Month','Habit Rate','Done/Total','Tasks','Goals'].map(h => (
                    <th key={h} className="bg-[#0A0A0A] text-white text-[9px] font-bold uppercase tracking-[.1em] px-3 py-2 text-left border border-[#1E1E1E]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {perfData.map(row => {
                  const [,m] = row.month.split('-').map(Number)
                  const [y] = row.month.split('-').map(Number)
                  const pct = row.total > 0 ? Math.round(row.done/row.total*100) : 0
                  const isCur = row.month === curMk
                  return (
                    <tr key={row.month} className={isCur ? 'bg-[#FFF0E8]' : 'hover:bg-[#f7f7f7]'}>
                      <td className="px-3 py-2 border border-[#efefef] text-[12px] font-bold">{MONTHS[m-1].slice(0,3)} {y}</td>
                      <td className="px-3 py-2 border border-[#efefef]">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] min-w-[32px]">{row.total>0?`${pct}%`:'—'}</span>
                          <div className="w-[70px] h-1.5 bg-[#efefef] rounded-full overflow-hidden">
                            <div className="h-full bg-[#FF5C00] rounded-full" style={{width:`${pct}%`}} />
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 border border-[#efefef] font-mono text-[12px]">{row.total>0?`${row.done}/${row.total}`:'—'}</td>
                      <td className="px-3 py-2 border border-[#efefef] font-mono text-[12px]">{row.tasks}</td>
                      <td className="px-3 py-2 border border-[#efefef] font-mono text-[12px]">{row.goals}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* REVIEW */}
      {tab === 'review' && (
        <>
          <MonthNav />
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {/* Week tabs */}
            <div className="flex gap-1.5 mb-5 flex-wrap">
              {weeks.map(w => {
                const wk = fmt(w)
                const on = wk === weekMon
                return (
                  <button key={wk} onClick={() => setWeekMon(wk)}
                    className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-[.08em] border transition-all ${on ? 'bg-[#0A0A0A] text-white border-[#0A0A0A]' : 'bg-[#f7f7f7] text-[#888] border-[#efefef] hover:bg-[#efefef] hover:text-[#0A0A0A]'}`}>
                    {weekLabel(w)}
                  </button>
                )
              })}
            </div>
            <div className="grid gap-3 max-w-2xl">
              {REVIEW_FIELDS.map(f => (
                <div key={f.key} className="border border-[#efefef] rounded-lg overflow-hidden">
                  <div className="bg-[#0A0A0A] px-4 py-2.5">
                    <span className="text-[11px] font-bold tracking-[.08em] text-white">{f.label}</span>
                  </div>
                  <div className="bg-white p-3">
                    <textarea
                      className="w-full bg-[#f7f7f7] border border-[#efefef] rounded-md px-3 py-2 text-[13px] outline-none focus:border-[#FF5C00] focus:bg-white resize-none h-20 leading-relaxed transition-colors"
                      placeholder={f.ph}
                      value={review[f.key]}
                      onChange={e => setReview(r => ({...r, [f.key]: e.target.value}))}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  )
}
