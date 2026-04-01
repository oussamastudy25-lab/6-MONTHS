'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

const sb = createClient()
type Habit  = { id: string; name: string }
type Log    = { habit_id: string; status: string; date: string }
type Review = { win: string; improve: string; gratitude: string; next_week: string; week_rating: number | null }
type WeekScore = { label: string; score: number | null; weekStart: string }

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const MONTH_S = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DOW = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

const REVIEW_FIELDS: { key: keyof Omit<Review,'week_rating'>; label: string; ph: string }[] = [
  { key:'win',       label:'🏆 Win of the week',   ph:'What went well?' },
  { key:'improve',   label:'🔧 What to improve',   ph:'What could be better?' },
  { key:'gratitude', label:'🤲 Gratitude',          ph:'What are you grateful for?' },
  { key:'next_week', label:'🎯 Next week focus',    ph:'One thing for next week?' },
]

function getMon(d = new Date()) {
  const day=d.getDay(),diff=day===0?-6:1-day
  const m=new Date(d);m.setDate(d.getDate()+diff);m.setHours(0,0,0,0);return m
}
function fmt(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function weekLabel(mon: Date) {
  const sun=new Date(mon);sun.setDate(sun.getDate()+6)
  return `${mon.getDate()} ${MONTH_S[mon.getMonth()]} – ${sun.getDate()} ${MONTH_S[sun.getMonth()]}`
}
function weeksForMonth(y: number, m: number) {
  const first=new Date(y,m,1),last=new Date(y,m+1,0)
  const weeks:Date[]=[],cur=getMon(first)
  while(cur<=last){weeks.push(new Date(cur));cur.setDate(cur.getDate()+7)}
  return weeks
}

export default function InsightsPage() {
  const now = new Date()
  const [tab, setTab] = useState<'analytics'|'performance'|'review'>('analytics')
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [habits, setHabits] = useState<Habit[]>([])
  const [logs, setLogs] = useState<Log[]>([])
  const [allLogs, setAllLogs] = useState<Log[]>([])
  const [weekMon, setWeekMon] = useState(() => fmt(getMon()))
  const [review, setReview] = useState<Review>({ win:'', improve:'', gratitude:'', next_week:'', week_rating: null })
  const [saving, setSaving] = useState(false)
  const [perfData, setPerfData] = useState<{month:string;done:number;total:number;tasks:string;goals:string}[]>([])
  const [scoreHistory, setScoreHistory] = useState<WeekScore[]>([])
  // New analytics state
  const [streakData, setStreakData] = useState<{id:string;name:string;current:number;best:number}[]>([])
  const [dowData, setDowData] = useState<{day:string;done:number;missed:number;total:number}[]>([])
  const [cleanHistory, setCleanHistory] = useState<{name:string;months:{month:string;clean:number;total:number}[]}[]>([])
  const [monthComp, setMonthComp] = useState<{id:string;name:string;thisPct:number;prevPct:number}[]>([])
  const [badHabits, setBadHabits] = useState<{id:string;name:string}[]>([])

  const loadAnalytics = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const ym = `${year}-${String(month+1).padStart(2,'0')}`
    const prevDate = new Date(year, month-1, 1)
    const prevYm = `${prevDate.getFullYear()}-${String(prevDate.getMonth()+1).padStart(2,'0')}`

    const [{ data: h }, { data: l }, { data: al }, { data: bh }, { data: allR }] = await Promise.all([
      sb.from('habits').select('id,name').eq('user_id', user.id).is('archived_at', null).order('position'),
      sb.from('habit_logs').select('habit_id,status,date').eq('user_id', user.id).like('date', `${ym}-%`),
      sb.from('habit_logs').select('habit_id,status,date').eq('user_id', user.id),
      sb.from('bad_habits').select('id,name').eq('user_id', user.id),
      sb.from('bad_habit_relapses').select('habit_id,date').eq('user_id', user.id).order('date'),
    ])
    setHabits(h??[]); setLogs(l??[]); setAllLogs(al??[]); setBadHabits(bh??[])

    // STREAK DATA per habit
    const habitList = h??[]
    const allLogsList = al??[]
    const streaks = habitList.map((habit:{id:string;name:string}) => {
      const hLogs = allLogsList.filter((ll:{habit_id:string;status:string}) => ll.habit_id===habit.id&&ll.status==='done')
        .map((ll:{date:string}) => ll.date).sort()
      let best=0,cur=0,prevD=''
      hLogs.forEach(d => {
        if (prevD) {
          const diff=Math.round((new Date(d).getTime()-new Date(prevD).getTime())/86400000)
          if (diff===1) cur++; else cur=1
        } else cur=1
        if (cur>best) best=cur; prevD=d
      })
      // current streak from today backwards
      let current=0
      const todayStr=fmt()
      for (let i=0;;i++) {
        const d=new Date(); d.setDate(d.getDate()-i)
        const ds=fmt(d)
        if (allLogsList.find((ll:{habit_id:string;date:string;status:string}) => ll.habit_id===habit.id&&ll.date===ds&&ll.status==='done')) current++
        else break
      }
      return {id:habit.id,name:habit.name,current,best}
    })
    setStreakData(streaks)

    // DOW ANALYSIS — which day of week has most misses (all time)
    const dowStats: Record<number,{done:number;missed:number}> = {0:{done:0,missed:0},1:{done:0,missed:0},2:{done:0,missed:0},3:{done:0,missed:0},4:{done:0,missed:0},5:{done:0,missed:0},6:{done:0,missed:0}}
    allLogsList.forEach((ll:{date:string;status:string}) => {
      const d=new Date(ll.date).getDay()
      const dow=d===0?6:d-1 // convert to Mon=0
      if (ll.status==='done') dowStats[dow].done++
      else if (ll.status==='missed') dowStats[dow].missed++
    })
    setDowData(DOW.map((name,i) => ({
      day:name, done:dowStats[i].done, missed:dowStats[i].missed,
      total:dowStats[i].done+dowStats[i].missed
    })))

    // MONTH COMPARISON
    const prevLogs = allLogsList.filter((ll:{date:string}) => ll.date.startsWith(prevYm))
    const comp = habitList.map((habit:{id:string;name:string}) => {
      const thisTracked = (l??[]).filter((ll:{habit_id:string;status:string}) => ll.habit_id===habit.id&&ll.status!=='na')
      const thisDone = thisTracked.filter((ll:{status:string}) => ll.status==='done').length
      const prevTracked = prevLogs.filter((ll:{habit_id:string;status:string}) => ll.habit_id===habit.id&&ll.status!=='na')
      const prevDone = prevTracked.filter((ll:{status:string}) => ll.status==='done').length
      return {
        id:habit.id, name:habit.name,
        thisPct: thisTracked.length>0?Math.round(thisDone/thisTracked.length*100):0,
        prevPct: prevTracked.length>0?Math.round(prevDone/prevTracked.length*100):0,
      }
    })
    setMonthComp(comp)

    // CLEAN DAYS HISTORY per bad habit
    const bhList = bh??[]
    const relapseList = allR??[]
    const cleanHist = bhList.map((habit:{id:string;name:string}) => {
      const habitRelapses = relapseList.filter((r:{habit_id:string}) => r.habit_id===habit.id).map((r:{date:string}) => r.date).sort()
      // Per month: count clean days (no relapse in month)
      const months: {month:string;clean:number;total:number}[] = []
      for (let i=5; i>=0; i--) {
        const d=new Date(year,month-i,1)
        const ym2=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
        const daysInM=new Date(d.getFullYear(),d.getMonth()+1,0).getDate()
        const monthRelapses=habitRelapses.filter(r=>r.startsWith(ym2))
        const clean=daysInM-monthRelapses.length
        months.push({month:MONTH_S[d.getMonth()],clean:Math.max(0,clean),total:daysInM})
      }
      return {name:habit.name,months}
    })
    setCleanHistory(cleanHist)
  }, [year, month])

  const loadPerf = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const [{ data: l }, { data: t }, { data: g }, { data: nnList }, { data: habList }] = await Promise.all([
      sb.from('habit_logs').select('date,status,habit_id').eq('user_id', user.id),
      sb.from('tasks').select('date,done,text').eq('user_id', user.id),
      sb.from('monthly_goals').select('month,done,text').eq('user_id', user.id),
      sb.from('non_negotiables').select('id').eq('user_id', user.id),
      sb.from('habits').select('id').eq('user_id', user.id).is('archived_at', null),
    ])
    const months = Array.from(new Set((l??[]).map((r:{date:string}) => r.date.slice(0,7)))).sort()
    const curMk = `${year}-${String(month+1).padStart(2,'0')}`
    if (!months.includes(curMk)) months.push(curMk); months.sort()
    const rows = months.map(mk => {
      const ml=(l??[]).filter((r:{date:string}) => r.date.startsWith(mk))
      const done=ml.filter((r:{status:string}) => r.status==='done').length
      const tracked=ml.filter((r:{status:string}) => r.status!=='na').length
      const td=(t??[]).filter((r:{date:string;text:string}) => r.date.startsWith(mk)&&r.text)
      const gd=(g??[]).filter((r:{month:string;text:string}) => r.month===mk&&r.text)
      return {month:mk,done,total:tracked,
        tasks:td.length>0?`${td.filter((r:{done:boolean})=>r.done).length}/${td.length}`:'—',
        goals:gd.length>0?`${gd.filter((r:{done:boolean})=>r.done).length}/${gd.length}`:'—'}
    })
    setPerfData(rows)

    // Weekly score history
    const weekScores:WeekScore[]=[]
    for (let w=23;w>=0;w--) {
      const mon=getMon(new Date(Date.now()-w*7*86400000))
      const wStart=fmt(mon)
      const wDays:string[]=[]
      for(let i=0;i<7;i++){const d=new Date(mon);d.setDate(mon.getDate()+i);const ds=fmt(d);if(ds<=fmt())wDays.push(ds)}
      if(wDays.length===0){weekScores.push({label:`${mon.getDate()} ${MONTH_S[mon.getMonth()]}`,score:null,weekStart:wStart});continue}
      const [{data:hLogs},{data:nLogs}]=await Promise.all([
        sb.from('habit_logs').select('habit_id,status,date').eq('user_id',user.id).in('date',wDays),
        sb.from('nn_logs').select('nn_id,done,date').eq('user_id',user.id).in('date',wDays),
      ])
      let earned=0,maxPts=0
      wDays.forEach(d=>{
        ;(nnList??[]).forEach((n:{id:string})=>{maxPts+=2;const log=(nLogs??[]).find((ll:{nn_id:string;date:string;done:boolean})=>ll.nn_id===n.id&&ll.date===d);if(log?.done)earned+=2})
        ;(habList??[]).forEach((h:{id:string})=>{maxPts+=1;const log=(hLogs??[]).find((ll:{habit_id:string;date:string;status:string})=>ll.habit_id===h.id&&ll.date===d&&ll.status==='done');if(log)earned+=1})
      })
      weekScores.push({label:`${mon.getDate()} ${MONTH_S[mon.getMonth()]}`,score:maxPts>0?Math.round(earned/maxPts*100):null,weekStart:wStart})
    }
    setScoreHistory(weekScores)
  }, [year, month])

  const loadReview = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const { data } = await sb.from('reviews').select('*').eq('user_id', user.id).eq('week_start', weekMon).maybeSingle()
    setReview(data ? { win:data.win, improve:data.improve, gratitude:data.gratitude, next_week:data.next_week, week_rating:data.week_rating } : { win:'', improve:'', gratitude:'', next_week:'', week_rating:null })
  }, [weekMon])

  useEffect(() => {
    if (tab==='analytics') loadAnalytics()
    else if (tab==='performance') loadPerf()
    else loadReview()
  }, [tab, loadAnalytics, loadPerf, loadReview])

  async function saveReview() {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    setSaving(true)
    await sb.from('reviews').upsert({ user_id:user.id, week_start:weekMon, ...review, updated_at:new Date().toISOString() }, { onConflict:'user_id,week_start' })
    setSaving(false)
  }

  const daysInMonth = new Date(year, month+1, 0).getDate()
  const days = Array.from({length:daysInMonth},(_,i) => `${year}-${String(month+1).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`)
  const activeHabits = habits.filter(h=>h.name)
  const totalDone = logs.filter(l=>l.status==='done').length
  const totalTracked = logs.filter(l=>l.status!=='na').length
  const overallPct = totalTracked>0?Math.round(totalDone/totalTracked*100):0
  let bestStreak=0,curStr=0
  Array.from(new Set(allLogs.map(l=>l.date))).sort().forEach(d=>{
    const any=allLogs.some(l=>l.date===d&&l.status==='done')
    if(any){curStr++;bestStreak=Math.max(bestStreak,curStr)}else curStr=0
  })

  const curMk = `${year}-${String(month+1).padStart(2,'0')}`
  const weeks = weeksForMonth(year, month)

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
            {saving?'Saving…':'Save'}
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

      {/* ANALYTICS */}
      {tab==='analytics' && (
        <>
          <MonthNav />
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {/* KPI bar */}
            <div className="flex gap-2 flex-wrap">
              {[['Total Done',totalDone],['Overall',`${overallPct}%`],['Best Streak',`${bestStreak}d`],['Habits',activeHabits.length]].map(([l,v])=>(
                <div key={l as string} className="bg-[#0A0A0A] px-4 py-3 rounded-md min-w-[90px]">
                  <div className="font-mono text-[21px] text-[#FF5C00] font-semibold">{v}</div>
                  <div className="text-[8.5px] text-[#888] uppercase tracking-[.1em] mt-0.5">{l}</div>
                </div>
              ))}
            </div>

            {/* MONTH COMPARISON */}
            {monthComp.length>0 && (
              <div>
                <div className="text-[9px] font-bold text-[#bcbcbc] tracking-[.16em] uppercase mb-3">
                  This Month vs Last Month
                </div>
                <div className="bg-white border border-[#efefef] rounded-lg overflow-hidden">
                  <div className="grid grid-cols-4 bg-[#f7f7f7] px-4 py-2 border-b border-[#efefef]">
                    <div className="col-span-2 text-[9px] font-bold text-[#888] uppercase tracking-[.1em]">Habit</div>
                    <div className="text-[9px] font-bold text-[#888] uppercase tracking-[.1em] text-center">{MONTH_S[month===0?11:month-1]}</div>
                    <div className="text-[9px] font-bold text-[#FF5C00] uppercase tracking-[.1em] text-center">{MONTH_S[month]}</div>
                  </div>
                  {monthComp.map(h => {
                    const delta = h.thisPct-h.prevPct
                    return (
                      <div key={h.id} className="grid grid-cols-4 px-4 py-3 border-b border-[#f7f7f7] last:border-0 hover:bg-[#fafafa] items-center">
                        <div className="col-span-2 text-[12px] font-semibold truncate">{h.name}</div>
                        <div className="text-center">
                          <span className="font-mono text-[13px] text-[#888]">{h.prevPct}%</span>
                        </div>
                        <div className="text-center flex items-center justify-center gap-1.5">
                          <span className="font-mono text-[13px] font-bold text-[#0A0A0A]">{h.thisPct}%</span>
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
                <div className="grid gap-2" style={{gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))'}}>
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

            {/* DAY-OF-WEEK ANALYSIS */}
            {dowData.some(d=>d.total>0) && (
              <div>
                <div className="text-[9px] font-bold text-[#bcbcbc] tracking-[.16em] uppercase mb-3">
                  Day-of-Week — Where You Fail Most
                </div>
                <div className="bg-white border border-[#efefef] rounded-lg p-4">
                  <div className="flex items-end gap-2" style={{height:112}}>
                    {dowData.map(d => {
                      const failRate = d.total>0?Math.round(d.missed/d.total*100):0
                      const height = Math.max(4, failRate)
                      const color = failRate>=70?'#ef4444':failRate>=40?'#f59e0b':failRate>=20?'#FF5C00':'#22c55e'
                      return (
                        <div key={d.day} className="flex-1 flex flex-col items-center gap-1 group relative">
                          <div className="absolute bottom-full mb-1 hidden group-hover:block bg-[#0A0A0A] text-white text-[9px] px-1.5 py-1 rounded whitespace-nowrap z-10">
                            {d.day}: {failRate}% miss ({d.missed}/{d.total})
                          </div>
                          <div className="w-full rounded-sm" style={{height:Math.max(4,Math.round(Number(height)*1.12)),background:color}} />
                          <div className="text-[9px] font-bold text-[#888]">{d.day}</div>
                          <div className="text-[8px] font-mono text-[#bcbcbc]">{failRate}%</div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="text-[9px] text-[#888] mt-2">Bar height = miss rate. Taller = more failures on that day.</div>
                </div>
              </div>
            )}

            {/* CLEAN DAYS HISTORY */}
            {cleanHistory.length>0 && (
              <div>
                <div className="text-[9px] font-bold text-[#bcbcbc] tracking-[.16em] uppercase mb-3">Clean Days History</div>
                <div className="space-y-3">
                  {cleanHistory.map(bh => (
                    <div key={bh.name} className="bg-white border border-[#efefef] rounded-lg p-4">
                      <div className="text-[12px] font-bold mb-3">{bh.name}</div>
                      <div className="flex gap-2 items-end h-20">
                        {bh.months.map(m => {
                          const pct = Math.round(m.clean/m.total*100)
                          const color = pct>=90?'#22c55e':pct>=70?'#FF5C00':pct>=50?'#f59e0b':'#ef4444'
                          return (
                            <div key={m.month} className="flex-1 flex flex-col items-center gap-1 group relative">
                              <div className="absolute bottom-full mb-1 hidden group-hover:block bg-[#0A0A0A] text-white text-[9px] px-1.5 py-1 rounded whitespace-nowrap z-10">
                                {m.month}: {m.clean}/{m.total} clean days
                              </div>
                              <div className="w-full rounded-sm" style={{height:Math.max(4,Math.round(pct*1.28)),background:color}} />
                              <div className="text-[8px] font-bold text-[#888]">{m.month}</div>
                              <div className="text-[8px] font-mono text-[#bcbcbc]">{pct}%</div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Per-habit breakdown */}
            {activeHabits.length>0 && (
              <div>
                <div className="text-[9px] font-bold text-[#bcbcbc] tracking-[.16em] uppercase mb-3">Per-Habit This Month</div>
                <div className="grid gap-3" style={{gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))'}}>
                  {activeHabits.map((h,idx)=>{
                    let done=0,missed=0,na=0
                    days.forEach(d=>{const v=logs.find(l=>l.habit_id===h.id&&l.date===d)?.status??'';if(v==='done')done++;else if(v==='missed')missed++;else if(v==='na')na++})
                    const tracked=done+missed,pct=tracked>0?Math.round(done/tracked*100):0
                    return (
                      <div key={h.id} className="bg-white border border-[#efefef] rounded-lg p-4 hover:border-[#dedede] transition-colors">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="font-mono text-[10px] text-[#bcbcbc]">#{idx+1}</span>
                          <span className="text-[13px] font-bold flex-1">{h.name}</span>
                          <span className="font-mono text-[16px] font-bold text-[#FF5C00]">{pct}%</span>
                        </div>
                        <div className="flex gap-3 mb-3">
                          {[['Done',done,'#FF5C00'],['Missed',missed,'#ef4444'],['N/A',na,'#888']].map(([l,v,c])=>(
                            <div key={l as string}>
                              <div className="font-mono text-[16px] font-semibold" style={{color:c as string}}>{v}</div>
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
          </div>
        </>
      )}

      {/* PERFORMANCE */}
      {tab==='performance' && (
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* 24-week score chart */}
          {scoreHistory.some(w=>w.score!==null) && (
            <div>
              <div className="text-[9px] font-bold text-[#bcbcbc] tracking-[.16em] uppercase mb-3">Weekly Score — 24 Weeks</div>
              <div className="bg-white border border-[#efefef] rounded-lg p-4">
                <div className="flex items-end gap-1" style={{height:128}}>
                  {scoreHistory.map((w,i)=>{
                    const s=w.score
                    const color=s===null?'#efefef':s>=90?'#FF5C00':s>=75?'#22c55e':s>=50?'#f59e0b':'#ef4444'
                    const h=s!==null?Math.max(4,Math.round(s/100*100)):4
                    return (
                      <div key={w.weekStart} className="flex-1 flex flex-col items-center gap-1 group relative">
                        <div className="absolute bottom-full mb-1 hidden group-hover:block bg-[#0A0A0A] text-white text-[9px] px-1.5 py-1 rounded whitespace-nowrap z-10">
                          {w.label}: {s!==null?`${s}%`:'—'}
                        </div>
                        <div className="w-full rounded-sm" style={{height:Math.max(4,Math.round(Number(h)*1.28)),background:color,opacity:i===scoreHistory.length-1?1:0.8}} />
                        {(i===0||i===11||i===23)&&<div className="text-[7px] text-[#bcbcbc] whitespace-nowrap">{w.label}</div>}
                      </div>
                    )
                  })}
                </div>
                <div className="flex gap-3 mt-3 flex-wrap">
                  {[['#FF5C00','90+ Locked In'],['#22c55e','75+ Solid'],['#f59e0b','50+ Struggling'],['#ef4444','<50 Failing']].map(([c,l])=>(
                    <div key={l} className="flex items-center gap-1">
                      <div className="w-2.5 h-2.5 rounded-sm" style={{background:c}} />
                      <span className="text-[9px] text-[#888]">{l}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Month tiles */}
          <div>
            <div className="text-[9px] font-bold text-[#bcbcbc] tracking-[.16em] uppercase mb-3">All Months</div>
            <div className="flex flex-wrap gap-2">
              {perfData.map(row=>{
                const [y,m]=row.month.split('-').map(Number)
                const pct=row.total>0?Math.round(row.done/row.total*100):null
                const isCur=row.month===curMk
                return (
                  <button key={row.month} onClick={()=>{setYear(y);setMonth(m-1)}}
                    className={`px-3 py-2 rounded-md border text-center transition-all ${isCur?'bg-[#FF5C00] border-[#FF5C00]':'bg-white border-[#efefef] hover:border-[#FF5C00]'}`}>
                    <div className={`text-[10px] font-bold ${isCur?'text-white':'text-[#0A0A0A]'}`}>{MONTH_S[m-1]} {y}</div>
                    <div className={`font-mono text-[12px] font-semibold mt-0.5 ${isCur?'text-white/80':'text-[#FF5C00]'}`}>{pct!==null?`${pct}%`:'—'}</div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Table */}
          <div>
            <div className="text-[9px] font-bold text-[#bcbcbc] tracking-[.16em] uppercase mb-3">Month-by-Month</div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {['Month','Habit Rate','Done/Total','Tasks','Goals'].map(h=>(
                      <th key={h} className="bg-[#0A0A0A] text-white text-[9px] font-bold uppercase tracking-[.1em] px-3 py-2 text-left border border-[#1E1E1E]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {perfData.map(row=>{
                    const[,m]=row.month.split('-').map(Number)
                    const [y]=row.month.split('-').map(Number)
                    const pct=row.total>0?Math.round(row.done/row.total*100):0
                    const isCur=row.month===curMk
                    return (
                      <tr key={row.month} className={isCur?'bg-[#FFF0E8]':'hover:bg-[#f7f7f7]'}>
                        <td className="px-3 py-2 border border-[#efefef] text-[12px] font-bold">{MONTH_S[m-1]} {y}</td>
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
        </div>
      )}

      {/* REVIEW */}
      {tab==='review' && (
        <>
          <MonthNav />
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {/* Week tabs */}
            <div className="flex gap-1.5 mb-5 flex-wrap">
              {weeks.map(w=>{
                const wk=fmt(w)
                const on=wk===weekMon
                return (
                  <button key={wk} onClick={()=>setWeekMon(wk)}
                    className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-[.08em] border transition-all ${on?'bg-[#0A0A0A] text-white border-[#0A0A0A]':'bg-[#f7f7f7] text-[#888] border-[#efefef] hover:bg-[#efefef] hover:text-[#0A0A0A]'}`}>
                    {weekLabel(w)}
                  </button>
                )
              })}
            </div>

            {/* WEEK RATING */}
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
                    {review.week_rating >= 8 ? '🔥 Strong week. Build on it.' : review.week_rating >= 5 ? '⚡ Decent. Identify what dragged you down.' : '⚠️ Tough week. What needs to change?'}
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-3 max-w-2xl">
              {REVIEW_FIELDS.map(f=>(
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
