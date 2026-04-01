'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

const sb = createClient()
type Habit = { id: string; name: string }
type Log   = { habit_id: string; status: string; date: string }
type Review= { win: string; improve: string; gratitude: string; next_week: string; week_rating: number | null }

const MONTHS  = ['January','February','March','April','May','June','July','August','September','October','November','December']
const MONTH_S = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DOW     = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

const REVIEW_FIELDS: { key: keyof Omit<Review,'week_rating'>; label: string; ph: string }[] = [
  { key:'win',       label:'🏆 Win of the week',  ph:'What went well?' },
  { key:'improve',   label:'🔧 What to improve',  ph:'What could be better?' },
  { key:'gratitude', label:'🤲 Gratitude',         ph:'What are you grateful for?' },
  { key:'next_week', label:'🎯 Next week focus',   ph:'One thing for next week?' },
]

function getMon(d = new Date()) {
  const day=d.getDay(),diff=day===0?-6:1-day
  const m=new Date(d); m.setDate(d.getDate()+diff); m.setHours(0,0,0,0); return m
}
function fmt(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function weekLabel(mon: Date) {
  const sun=new Date(mon); sun.setDate(sun.getDate()+6)
  return `${mon.getDate()} ${MONTH_S[mon.getMonth()]} – ${sun.getDate()} ${MONTH_S[sun.getMonth()]}`
}
function weeksForMonth(y: number, m: number) {
  const first=new Date(y,m,1), last=new Date(y,m+1,0)
  const weeks: Date[]=[], cur=getMon(first)
  while(cur<=last){ weeks.push(new Date(cur)); cur.setDate(cur.getDate()+7) }
  return weeks
}

export default function InsightsPage() {
  const now   = new Date()
  const today = fmt(now)
  const [tab, setTab] = useState<'analytics'|'performance'|'review'>('analytics')
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [habits, setHabits] = useState<Habit[]>([])
  const [logs, setLogs]     = useState<Log[]>([])
  const [allLogs, setAllLogs] = useState<Log[]>([])
  const [weekMon, setWeekMon] = useState(() => fmt(getMon()))
  const [review, setReview] = useState<Review>({ win:'', improve:'', gratitude:'', next_week:'', week_rating:null })
  const [saving, setSaving] = useState(false)

  // Analytics state
  const [streakData, setStreakData]   = useState<{id:string;name:string;current:number;best:number}[]>([])
  const [dowData, setDowData]         = useState<{day:string;done:number;missed:number;total:number}[]>([])
  const [monthComp, setMonthComp]     = useState<{id:string;name:string;thisPct:number;prevPct:number}[]>([])

  // Performance state
  const [perfRows, setPerfRows]       = useState<{month:string;habitPct:number|null;habitDone:number;habitTotal:number;tasksDone:number;tasksTotal:number;goalsDone:number;goalsTotal:number}[]>([])
  const [weekScores, setWeekScores]   = useState<{label:string;score:number|null;weekStart:string}[]>([])

  // ─── ANALYTICS ──────────────────────────────────────────────────────────────
  const loadAnalytics = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const ym = `${year}-${String(month+1).padStart(2,'0')}`
    const prevDate = new Date(year, month-1, 1)
    const prevYm = `${prevDate.getFullYear()}-${String(prevDate.getMonth()+1).padStart(2,'0')}`

    const [{ data: h }, { data: l }, { data: al }] = await Promise.all([
      sb.from('habits').select('id,name').eq('user_id', user.id).is('archived_at', null).order('position'),
      sb.from('habit_logs').select('habit_id,status,date').eq('user_id', user.id).like('date', `${ym}-%`),
      sb.from('habit_logs').select('habit_id,status,date').eq('user_id', user.id),
    ])
    setHabits(h??[]); setLogs(l??[]); setAllLogs(al??[])

    const habitList = (h??[]).filter((hh:{name:string}) => hh.name)
    const allLogsList = al??[]

    // STREAKS per habit
    const streaks = habitList.map((habit:{id:string;name:string}) => {
      const doneDates = allLogsList
        .filter((ll:{habit_id:string;status:string}) => ll.habit_id===habit.id && ll.status==='done')
        .map((ll:{date:string}) => ll.date).sort()
      let best=0, cur=0, prevD=''
      doneDates.forEach(d => {
        if (prevD) {
          const diff = Math.round((new Date(d).getTime()-new Date(prevD).getTime())/86400000)
          cur = diff===1 ? cur+1 : 1
        } else cur=1
        if (cur>best) best=cur; prevD=d
      })
      let current=0
      for (let i=0;;i++) {
        const d=new Date(); d.setDate(d.getDate()-i)
        const ds=fmt(d)
        if (allLogsList.find((ll:{habit_id:string;date:string;status:string}) => ll.habit_id===habit.id&&ll.date===ds&&ll.status==='done')) current++
        else break
      }
      return { id:habit.id, name:habit.name, current, best }
    })
    setStreakData(streaks)

    // DOW ANALYSIS
    const dowStats: Record<number,{done:number;missed:number}> = Object.fromEntries([0,1,2,3,4,5,6].map(i=>[i,{done:0,missed:0}]))
    allLogsList.forEach((ll:{date:string;status:string}) => {
      const d = new Date(ll.date+'T12:00:00').getDay()
      const dow = d===0 ? 6 : d-1
      if (ll.status==='done') dowStats[dow].done++
      else if (ll.status==='missed') dowStats[dow].missed++
    })
    setDowData(DOW.map((name,i) => ({ day:name, done:dowStats[i].done, missed:dowStats[i].missed, total:dowStats[i].done+dowStats[i].missed })))

    // MONTH COMPARISON
    const prevLogs = allLogsList.filter((ll:{date:string}) => ll.date.startsWith(prevYm))
    const comp = habitList.map((habit:{id:string;name:string}) => {
      const thisT = (l??[]).filter((ll:{habit_id:string;status:string}) => ll.habit_id===habit.id && ll.status!=='na')
      const thisDone = thisT.filter((ll:{status:string}) => ll.status==='done').length
      const prevT = prevLogs.filter((ll:{habit_id:string;status:string}) => ll.habit_id===habit.id && ll.status!=='na')
      const prevDone = prevT.filter((ll:{status:string}) => ll.status==='done').length
      return {
        id: habit.id, name: habit.name,
        thisPct: thisT.length>0 ? Math.round(thisDone/thisT.length*100) : 0,
        prevPct: prevT.length>0 ? Math.round(prevDone/prevT.length*100) : 0,
      }
    })
    setMonthComp(comp)
  }, [year, month])

  // ─── PERFORMANCE ────────────────────────────────────────────────────────────
  const loadPerf = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return

    // Load all data needed
    const [{ data: habList }, { data: habLogs }, { data: tasks }, { data: wgoals }, { data: milestones }] = await Promise.all([
      sb.from('habits').select('id').eq('user_id', user.id).is('archived_at', null),
      sb.from('habit_logs').select('date,status,habit_id').eq('user_id', user.id),
      sb.from('tasks').select('date,done').eq('user_id', user.id),
      sb.from('weekly_goals').select('week_start,done').eq('user_id', user.id),
      sb.from('milestones').select('done').eq('user_id', user.id),
    ])

    // Build month list from all habit logs + current month
    const curMk = `${year}-${String(month+1).padStart(2,'0')}`
    const monthSet = new Set((habLogs??[]).map((r:{date:string}) => r.date.slice(0,7)))
    monthSet.add(curMk)
    const months = Array.from(monthSet).sort()

    // Goals milestone % (overall snapshot — same for all rows as milestones have no date)
    const totalMs = (milestones??[]).length
    const doneMs  = (milestones??[]).filter((m:{done:boolean}) => m.done).length
    const goalPct = totalMs>0 ? Math.round(doneMs/totalMs*100) : null

    const rows = months.map(mk => {
      const [y, m] = mk.split('-').map(Number)
      // Habit stats for this month
      const ml = (habLogs??[]).filter((r:{date:string}) => r.date.startsWith(mk))
      const habitDone    = ml.filter((r:{status:string}) => r.status==='done').length
      const habitTracked = ml.filter((r:{status:string}) => r.status!=='na').length
      const habitPct     = habitTracked>0 ? Math.round(habitDone/habitTracked*100) : null
      // Task stats: daily tasks in this month
      const monthTasks   = (tasks??[]).filter((r:{date:string}) => r.date.startsWith(mk))
      const tasksDone    = monthTasks.filter((r:{done:boolean}) => r.done).length
      const tasksTotal   = monthTasks.length
      // Weekly goals: those whose week_start falls in this month
      const monthStart = `${mk}-01`
      const monthEnd   = new Date(y, m, 0).toISOString().slice(0,10)
      const wg = (wgoals??[]).filter((r:{week_start:string}) => r.week_start>=monthStart && r.week_start<=monthEnd)
      const wgDone  = wg.filter((r:{done:boolean}) => r.done).length
      const wgTotal = wg.length
      return {
        month: mk,
        habitPct,
        habitDone,
        habitTotal: habitTracked,
        tasksDone: tasksDone + wgDone,
        tasksTotal: tasksTotal + wgTotal,
        goalsDone: doneMs,
        goalsTotal: totalMs,
      }
    })
    setPerfRows(rows)

    // ── Weekly score history (24 weeks) ─────────────────────────────────────
    // Formula: habits 33% + tasks 33% + goals 33%
    // Goals uses current milestone snapshot (same value each week — it's a running total)
    const scores: {label:string;score:number|null;weekStart:string}[] = []
    for (let w=23; w>=0; w--) {
      const mon   = getMon(new Date(Date.now()-w*7*86400000))
      const wStart = fmt(mon)
      const wDays: string[] = []
      for (let i=0; i<7; i++) {
        const d=new Date(mon); d.setDate(mon.getDate()+i)
        const ds=fmt(d); if(ds<=today) wDays.push(ds)
      }
      const label = `${mon.getDate()} ${MONTH_S[mon.getMonth()]}`
      if (wDays.length===0) { scores.push({label,score:null,weekStart:wStart}); continue }

      const [{ data: wHabLogs }, { data: wTasks }, { data: wWGoals }] = await Promise.all([
        sb.from('habit_logs').select('habit_id,status,date').eq('user_id', user.id).in('date', wDays),
        sb.from('tasks').select('date,done').eq('user_id', user.id).in('date', wDays),
        sb.from('weekly_goals').select('week_start,done').eq('user_id', user.id).eq('week_start', wStart),
      ])

      // Habits %
      const hDone    = (wHabLogs??[]).filter((l:{status:string}) => l.status==='done').length
      const hTracked = (wHabLogs??[]).filter((l:{status:string}) => l.status!=='na').length
      const habitScore = hTracked>0 ? Math.round(hDone/hTracked*100) : 100

      // Tasks %
      const tTotal = (wTasks??[]).length + (wWGoals??[]).length
      const tDone  = (wTasks??[]).filter((t:{done:boolean}) => t.done).length + (wWGoals??[]).filter((g:{done:boolean}) => g.done).length
      const taskScore = tTotal>0 ? Math.round(tDone/tTotal*100) : 100

      // Goals % — current milestone snapshot
      const goalScore = goalPct ?? 100

      const final = Math.round((habitScore + taskScore + goalScore) / 3)
      scores.push({ label, score: final, weekStart: wStart })
    }
    setWeekScores(scores)
  }, [year, month, today])

  // ─── REVIEW ─────────────────────────────────────────────────────────────────
  const loadReview = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const { data } = await sb.from('reviews').select('*').eq('user_id', user.id).eq('week_start', weekMon).maybeSingle()
    setReview(data
      ? { win:data.win, improve:data.improve, gratitude:data.gratitude, next_week:data.next_week, week_rating:data.week_rating }
      : { win:'', improve:'', gratitude:'', next_week:'', week_rating:null })
  }, [weekMon])

  useEffect(() => {
    if (tab==='analytics') loadAnalytics()
    else if (tab==='performance') loadPerf()
    else loadReview()
  }, [tab, loadAnalytics, loadPerf, loadReview])

  async function saveReview() {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    setSaving(true)
    await sb.from('reviews').upsert({ user_id:user.id, week_start:weekMon, ...review }, { onConflict:'user_id,week_start' })
    setSaving(false)
  }

  const daysInMonth  = new Date(year, month+1, 0).getDate()
  const days         = Array.from({length:daysInMonth},(_,i) => `${year}-${String(month+1).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`)
  const activeHabits = habits.filter(h => h.name)
  const totalDone    = logs.filter(l => l.status==='done').length
  const totalTracked = logs.filter(l => l.status!=='na').length
  const overallPct   = totalTracked>0 ? Math.round(totalDone/totalTracked*100) : 0
  let bestStreak=0, curStr=0
  Array.from(new Set(allLogs.map(l=>l.date))).sort().forEach(d => {
    const any = allLogs.some(l => l.date===d && l.status==='done')
    if (any) { curStr++; bestStreak=Math.max(bestStreak,curStr) } else curStr=0
  })
  const curMk    = `${year}-${String(month+1).padStart(2,'0')}`
  const weeks    = weeksForMonth(year, month)

  const MonthNav = () => (
    <div className="flex items-center gap-2 px-6 py-2 bg-[#f7f7f7] border-b border-[#efefef] flex-shrink-0">
      <button onClick={()=>{if(month===0){setMonth(11);setYear(y=>y-1)}else setMonth(m=>m-1)}}
        className="w-6 h-6 border border-[#dedede] rounded flex items-center justify-center text-[14px] text-[#888] hover:bg-[#0A0A0A] hover:text-white hover:border-[#0A0A0A] transition-colors">‹</button>
      <span className="text-[13px] font-bold tracking-[.04em] min-w-[140px] text-center">{MONTHS[month]} {year}</span>
      <button onClick={()=>{if(month===11){setMonth(0);setYear(y=>y+1)}else setMonth(m=>m+1)}}
        className="w-6 h-6 border border-[#dedede] rounded flex items-center justify-center text-[14px] text-[#888] hover:bg-[#0A0A0A] hover:text-white hover:border-[#0A0A0A] transition-colors">›</button>
      <button onClick={()=>{setYear(now.getFullYear());setMonth(now.getMonth())}}
        className="text-[9px] font-bold uppercase tracking-[.1em] px-3 py-1 rounded border border-[#dedede] text-[#888] hover:bg-[#FF5C00] hover:text-white hover:border-[#FF5C00] transition-colors">Today</button>
    </div>
  )

  return (
    <>
      <div className="bg-white px-6 py-3 border-b-2 border-[#0A0A0A] flex items-center flex-shrink-0">
        <div>
          <div className="text-[19px] font-bold tracking-[.04em]">Insights</div>
          <div className="text-[10px] text-[#888] tracking-[.12em] uppercase mt-0.5">Analytics · Performance · Review</div>
        </div>
        {tab==='review' && (
          <button onClick={saveReview} disabled={saving}
            className="ml-auto bg-[#FF5C00] text-white text-[10px] font-bold uppercase tracking-[.1em] px-3 py-1.5 rounded-md hover:bg-[#FF7A2E] transition-colors disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        )}
      </div>

      <div className="flex border-b-2 border-[#0A0A0A] flex-shrink-0">
        {(['analytics','performance','review'] as const).map(t=>(
          <button key={t} onClick={()=>setTab(t)}
            className={`px-5 py-2.5 text-[10.5px] font-bold uppercase tracking-[.1em] border-b-2 -mb-0.5 transition-all ${tab===t?'text-[#FF5C00] border-[#FF5C00]':'text-[#888] border-transparent hover:text-[#0A0A0A]'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* ── ANALYTICS ─────────────────────────────────────────────────────────── */}
      {tab==='analytics' && (
        <>
          <MonthNav />
          <div className="flex-1 overflow-y-auto p-5 space-y-6">

            {/* KPI bar */}
            <div className="flex gap-2 flex-wrap">
              {([['Total Done',totalDone],['This Month',`${overallPct}%`],['Best Streak',`${bestStreak}d`],['Habits',activeHabits.length]] as const).map(([l,v])=>(
                <div key={l} className="bg-[#0A0A0A] px-4 py-3 rounded-md min-w-[90px]">
                  <div className="font-mono text-[21px] text-[#FF5C00] font-semibold">{v}</div>
                  <div className="text-[8.5px] text-[#888] uppercase tracking-[.1em] mt-0.5">{l}</div>
                </div>
              ))}
            </div>

            {/* MONTH COMPARISON */}
            {monthComp.length>0 && (
              <div>
                <div className="text-[9px] font-bold text-[#bcbcbc] tracking-[.16em] uppercase mb-3">This Month vs Last Month</div>
                <div className="bg-white border border-[#efefef] rounded-lg overflow-hidden">
                  <div className="grid grid-cols-4 bg-[#f7f7f7] px-4 py-2 border-b border-[#efefef]">
                    <div className="col-span-2 text-[9px] font-bold text-[#888] uppercase tracking-[.1em]">Habit</div>
                    <div className="text-[9px] font-bold text-[#888] uppercase tracking-[.1em] text-center">{MONTH_S[month===0?11:month-1]}</div>
                    <div className="text-[9px] font-bold text-[#FF5C00] uppercase tracking-[.1em] text-center">{MONTH_S[month]}</div>
                  </div>
                  {monthComp.map(h => {
                    const delta = h.thisPct - h.prevPct
                    return (
                      <div key={h.id} className="grid grid-cols-4 px-4 py-3 border-b border-[#f7f7f7] last:border-0 hover:bg-[#fafafa] items-center">
                        <div className="col-span-2 text-[12px] font-semibold truncate">{h.name}</div>
                        <div className="text-center"><span className="font-mono text-[13px] text-[#888]">{h.prevPct}%</span></div>
                        <div className="text-center flex items-center justify-center gap-1.5">
                          <span className="font-mono text-[13px] font-bold">{h.thisPct}%</span>
                          {delta!==0 && (
                            <span className={`text-[9px] font-bold ${delta>0?'text-[#22c55e]':'text-[#ef4444]'}`}>
                              {delta>0?'↑':'↓'}{Math.abs(delta)}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* HABIT STREAKS */}
            {streakData.length>0 && (
              <div>
                <div className="text-[9px] font-bold text-[#bcbcbc] tracking-[.16em] uppercase mb-3">Habit Streaks</div>
                <div className="grid gap-2" style={{gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))'}}>
                  {streakData.map(h => (
                    <div key={h.id} className="bg-white border border-[#efefef] rounded-lg p-3 hover:border-[#dedede] transition-colors">
                      <div className="text-[11px] font-bold mb-2 truncate">{h.name}</div>
                      <div className="flex gap-4">
                        <div>
                          <div className="font-mono text-[22px] font-bold text-[#FF5C00] leading-none">{h.current}d</div>
                          <div className="text-[8px] text-[#888] uppercase tracking-[.08em] mt-0.5">Current</div>
                        </div>
                        <div>
                          <div className="font-mono text-[22px] font-bold text-[#0A0A0A] leading-none">{h.best}d</div>
                          <div className="text-[8px] text-[#888] uppercase tracking-[.08em] mt-0.5">Best ever</div>
                        </div>
                      </div>
                      <div className="mt-2 h-1 bg-[#efefef] rounded-full overflow-hidden">
                        <div className="h-full bg-[#FF5C00] rounded-full" style={{width:`${h.best>0?Math.round(h.current/h.best*100):0}%`}} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* DOW ANALYSIS */}
            {dowData.some(d=>d.total>0) && (
              <div>
                <div className="text-[9px] font-bold text-[#bcbcbc] tracking-[.16em] uppercase mb-3">Day-of-Week — Where You Miss Most</div>
                <div className="bg-white border border-[#efefef] rounded-lg p-4">
                  <div className="flex items-end gap-2" style={{height:100}}>
                    {dowData.map(d => {
                      const failRate = d.total>0 ? Math.round(d.missed/d.total*100) : 0
                      const barH = Math.max(4, Math.round(failRate * 0.9))
                      const color = failRate>=70?'#ef4444':failRate>=40?'#f59e0b':failRate>=20?'#FF5C00':'#22c55e'
                      return (
                        <div key={d.day} className="flex-1 flex flex-col items-center gap-1 group relative" style={{height:100}}>
                          <div className="absolute bottom-full mb-1 hidden group-hover:block bg-[#0A0A0A] text-white text-[9px] px-1.5 py-1 rounded whitespace-nowrap z-10">
                            {d.day}: {failRate}% miss ({d.missed}/{d.total})
                          </div>
                          <div className="flex-1"/>
                          <div className="w-full rounded-sm" style={{height:barH, background:color}} />
                          <div className="text-[9px] font-bold text-[#888]">{d.day}</div>
                          <div className="text-[8px] font-mono text-[#bcbcbc]">{failRate}%</div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="text-[9px] text-[#888] mt-1">Taller = more misses that day.</div>
                </div>
              </div>
            )}

            {/* PER-HABIT THIS MONTH */}
            {activeHabits.length>0 && (
              <div>
                <div className="text-[9px] font-bold text-[#bcbcbc] tracking-[.16em] uppercase mb-3">Per-Habit This Month</div>
                <div className="grid gap-3" style={{gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))'}}>
                  {activeHabits.map((h,idx) => {
                    let done=0,missed=0,na=0
                    days.forEach(d => {
                      const v=logs.find(l=>l.habit_id===h.id&&l.date===d)?.status??''
                      if(v==='done')done++; else if(v==='missed')missed++; else if(v==='na')na++
                    })
                    const tracked=done+missed, pct=tracked>0?Math.round(done/tracked*100):0
                    return (
                      <div key={h.id} className="bg-white border border-[#efefef] rounded-lg p-4 hover:border-[#dedede] transition-colors">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-mono text-[10px] text-[#bcbcbc]">#{idx+1}</span>
                          <span className="text-[13px] font-bold flex-1">{h.name}</span>
                          <span className="font-mono text-[16px] font-bold text-[#FF5C00]">{pct}%</span>
                        </div>
                        <div className="flex gap-3 mb-2">
                          {([['Done',done,'#22c55e'],['Missed',missed,'#ef4444'],['N/A',na,'#888']] as const).map(([l,v,c])=>(
                            <div key={l}>
                              <div className="font-mono text-[16px] font-semibold" style={{color:c}}>{v}</div>
                              <div className="text-[8px] text-[#888] uppercase tracking-[.08em]">{l}</div>
                            </div>
                          ))}
                        </div>
                        <div className="h-1.5 bg-[#efefef] rounded-full overflow-hidden">
                          <div className="h-full bg-[#FF5C00] rounded-full" style={{width:`${pct}%`}} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {activeHabits.length===0 && (
              <div className="text-center py-16 text-[#888]">
                <div className="text-3xl mb-3">▦</div>
                <div className="text-[14px] font-bold mb-1">No habit data yet</div>
                <div className="text-[12px]">Start logging habits in the Tracker to see analytics here.</div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── PERFORMANCE ───────────────────────────────────────────────────────── */}
      {tab==='performance' && (
        <div className="flex-1 overflow-y-auto p-5 space-y-6">

          {/* 24-week score chart */}
          {weekScores.some(w=>w.score!==null) && (
            <div>
              <div className="text-[9px] font-bold text-[#bcbcbc] tracking-[.16em] uppercase mb-1">Weekly Score — 24 Weeks</div>
              <div className="text-[9px] text-[#aaa] mb-3">Habits 33% + Tasks & Goals 33% + Milestones 33%</div>
              <div className="bg-white border border-[#efefef] rounded-lg p-4">
                <div className="flex items-end gap-1" style={{height:120}}>
                  {weekScores.map((w,i) => {
                    const s = w.score
                    const color = s===null?'#efefef':s>=90?'#FF5C00':s>=75?'#22c55e':s>=50?'#f59e0b':'#ef4444'
                    const barH = s!==null ? Math.max(4, Math.round(s * 1.0)) : 4
                    return (
                      <div key={w.weekStart} className="flex-1 flex flex-col items-center gap-0.5 group relative" style={{height:120}}>
                        <div className="absolute bottom-full mb-1 hidden group-hover:block bg-[#0A0A0A] text-white text-[9px] px-1.5 py-1 rounded whitespace-nowrap z-10">
                          {w.label}: {s!==null?`${s}%`:'—'}
                        </div>
                        <div className="flex-1"/>
                        <div className="w-full rounded-sm" style={{height:barH, background:color, opacity:i===weekScores.length-1?1:0.8}} />
                        {(i===0||i===11||i===23) && <div className="text-[7px] text-[#bcbcbc] whitespace-nowrap">{w.label}</div>}
                      </div>
                    )
                  })}
                </div>
                <div className="flex gap-3 mt-2 flex-wrap">
                  {([['#FF5C00','90+ Locked In'],['#22c55e','75+ Solid'],['#f59e0b','50+ OK'],['#ef4444','<50 Weak']] as const).map(([c,l])=>(
                    <div key={l} className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-sm" style={{background:c}} />
                      <span className="text-[9px] text-[#888]">{l}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Month table */}
          <div>
            <div className="text-[9px] font-bold text-[#bcbcbc] tracking-[.16em] uppercase mb-3">Month-by-Month Breakdown</div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {['Month','Habit Rate','Habits','Tasks Done','Goals Done'].map(h=>(
                      <th key={h} className="bg-[#0A0A0A] text-white text-[9px] font-bold uppercase tracking-[.1em] px-3 py-2 text-left border border-[#1E1E1E] whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {perfRows.map(row => {
                    const [y,m] = row.month.split('-').map(Number)
                    const isCur = row.month===curMk
                    return (
                      <tr key={row.month} className={isCur?'bg-[#FFF0E8]':'hover:bg-[#f7f7f7]'}>
                        <td className="px-3 py-2 border border-[#efefef] text-[12px] font-bold whitespace-nowrap">
                          {MONTH_S[m-1]} {y}
                        </td>
                        <td className="px-3 py-2 border border-[#efefef]">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] min-w-[32px]">
                              {row.habitPct!==null ? `${row.habitPct}%` : '—'}
                            </span>
                            <div className="w-[60px] h-1.5 bg-[#efefef] rounded-full overflow-hidden">
                              <div className="h-full bg-[#FF5C00] rounded-full" style={{width:`${row.habitPct??0}%`}} />
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2 border border-[#efefef] font-mono text-[12px]">
                          {row.habitTotal>0 ? `${row.habitDone}/${row.habitTotal}` : '—'}
                        </td>
                        <td className="px-3 py-2 border border-[#efefef] font-mono text-[12px]">
                          {row.tasksTotal>0 ? `${row.tasksDone}/${row.tasksTotal}` : '—'}
                        </td>
                        <td className="px-3 py-2 border border-[#efefef] font-mono text-[12px]">
                          {row.goalsTotal>0 ? `${row.goalsDone}/${row.goalsTotal}` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="text-[9px] text-[#aaa] mt-2">
              Tasks = daily tasks + weekly goals. Goals = total milestones across all active goals.
            </div>
          </div>
        </div>
      )}

      {/* ── REVIEW ────────────────────────────────────────────────────────────── */}
      {tab==='review' && (
        <>
          <MonthNav />
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <div className="flex gap-1.5 mb-5 flex-wrap">
              {weeks.map(w => {
                const wk=fmt(w), on=wk===weekMon
                return (
                  <button key={wk} onClick={()=>setWeekMon(wk)}
                    className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-[.08em] border transition-all ${on?'bg-[#0A0A0A] text-white border-[#0A0A0A]':'bg-[#f7f7f7] text-[#888] border-[#efefef] hover:bg-[#efefef] hover:text-[#0A0A0A]'}`}>
                    {weekLabel(w)}
                  </button>
                )
              })}
            </div>

            <div className="border border-[#efefef] rounded-lg overflow-hidden mb-3">
              <div className="bg-[#0A0A0A] px-4 py-2.5">
                <span className="text-[11px] font-bold tracking-[.08em] text-white">⭐ Rate this week — 1 to 10</span>
              </div>
              <div className="bg-white px-4 py-4">
                <div className="flex gap-1.5 flex-wrap">
                  {[1,2,3,4,5,6,7,8,9,10].map(n => (
                    <button key={n} onClick={() => setReview(r=>({...r,week_rating:r.week_rating===n?null:n}))}
                      className={`w-10 h-10 rounded-md font-mono text-[14px] font-bold border-2 transition-all ${review.week_rating===n?'bg-[#FF5C00] border-[#FF5C00] text-white scale-110':'border-[#efefef] text-[#bcbcbc] hover:border-[#FF5C00] hover:text-[#FF5C00]'}`}>
                      {n}
                    </button>
                  ))}
                </div>
                {review.week_rating && (
                  <div className="mt-2 text-[11px] text-[#888]">
                    {review.week_rating>=8?'🔥 Strong week. Build on it.':review.week_rating>=5?'⚡ Decent. What dragged you down?':'⚠️ Tough week. What needs to change?'}
                  </div>
                )}
              </div>
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
                      placeholder={f.ph} value={review[f.key]}
                      onChange={e=>setReview(r=>({...r,[f.key]:e.target.value}))}
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
