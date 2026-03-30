'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import DailyQuote from '@/components/DailyQuote'
import MilestoneCelebration from '@/components/MilestoneCelebration'

const sb = createClient()

type NN       = { id: string; name: string; done: boolean }
type BadHabit = { id: string; name: string; cleanDays: number; lastRelapse: string | null }
type Goal     = { id: string; title: string; category: string; end_date: string; pct: number }
type Metric   = { id: string; name: string; unit: string; value: number | null; prev: number | null }
type StudyBlock = { id?: string; block: 1|2; started_at: string|null; ended_at: string|null; duration_minutes: number }

const CAT_COLORS: Record<string, string> = {
  Health:'#22c55e', Mind:'#8b5cf6', Work:'#FF5C00',
  Relationships:'#ec4899', Finance:'#f59e0b', Spirit:'#06b6d4', Other:'#888'
}
const MILESTONES = [7,21,40,90,120,180]

function fmt(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function getMonday(d = new Date()) {
  const day = d.getDay(), diff = day===0?-6:1-day
  const m = new Date(d); m.setDate(d.getDate()+diff); m.setHours(0,0,0,0); return m
}
function daysBetween(a: string, b: string) {
  return Math.max(0, Math.floor((new Date(b).getTime()-new Date(a).getTime())/86400000))
}

export default function WarRoomPage() {
  const today = fmt()
  const weekStart = fmt(getMonday())
  const prevWeekStart = fmt(getMonday(new Date(Date.now()-7*86400000)))

  const [nns, setNNs]           = useState<NN[]>([])
  const [badHabits, setBH]      = useState<BadHabit[]>([])
  const [goals, setGoals]       = useState<Goal[]>([])
  const [metrics, setMetrics]   = useState<Metric[]>([])
  const [score, setScore]       = useState<number|null>(null)
  const [examMode, setExamMode] = useState(false)
  const [examName, setExamName] = useState('')
  const [habitsDone, setHabitsDone] = useState(0)
  const [habitsTotal, setHabitsTotal] = useState(0)

  // Study timer
  const [blocks, setBlocks]   = useState<StudyBlock[]>([{block:1,started_at:null,ended_at:null,duration_minutes:0},{block:2,started_at:null,ended_at:null,duration_minutes:0}])
  const [elapsed, setElapsed] = useState<Record<number,number>>({1:0,2:0})
  const timerRef = useRef<NodeJS.Timeout|null>(null)

  // Relapse
  const [showRelapseFor, setShowRelapseFor] = useState<string|null>(null)
  const [relapseForm, setRelapseForm] = useState({ time_of_day:'', trigger_cause:'', prior_activity:'', note:'' })

  // Milestone
  const [milestone, setMilestone] = useState<{name:string;days:number}|null>(null)

  const load = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const uid = user.id

    const [{ data: nnList }, { data: nnLogs }] = await Promise.all([
      sb.from('non_negotiables').select('*').eq('user_id',uid).order('position'),
      sb.from('nn_logs').select('*').eq('user_id',uid).eq('date',today),
    ])
    const nnMap: Record<string,boolean> = {}
    ;(nnLogs??[]).forEach((l:{nn_id:string;done:boolean}) => { nnMap[l.nn_id]=l.done })
    setNNs((nnList??[]).map((n:{id:string;name:string}) => ({id:n.id,name:n.name,done:nnMap[n.id]??false})))

    // Bad habits
    const { data: bh } = await sb.from('bad_habits').select('*').eq('user_id',uid).order('position')
    const { data: relapses } = await sb.from('bad_habit_relapses').select('habit_id,date').eq('user_id',uid).order('date',{ascending:false})
    const bhData: BadHabit[] = (bh??[]).map((h:{id:string;name:string}) => {
      const lastR = (relapses??[]).find((r:{habit_id:string}) => r.habit_id===h.id) as {habit_id:string;date:string}|undefined
      return { id:h.id, name:h.name, cleanDays: lastR ? daysBetween(lastR.date,today) : 0, lastRelapse: lastR?.date??null }
    })
    setBH(bhData)

    // Goals
    const [{ data: goalsData }, { data: msData }] = await Promise.all([
      sb.from('six_month_goals').select('*').eq('user_id',uid).order('position'),
      sb.from('milestones').select('*').eq('user_id',uid),
    ])
    setGoals((goalsData??[]).map((g:{id:string;title:string;category:string;end_date:string}) => {
      const ms = (msData??[]).filter((m:{goal_id:string}) => m.goal_id===g.id)
      const done = ms.filter((m:{done:boolean}) => m.done).length
      return {id:g.id,title:g.title,category:g.category,end_date:g.end_date,pct:ms.length>0?Math.round(done/ms.length*100):0}
    }))

    // Metrics
    const [{ data: mDefs }, { data: mLogs }, { data: mPrev }] = await Promise.all([
      sb.from('weekly_metrics').select('*').eq('user_id',uid).order('position'),
      sb.from('weekly_metric_logs').select('*').eq('user_id',uid).eq('week_start',weekStart),
      sb.from('weekly_metric_logs').select('*').eq('user_id',uid).eq('week_start',prevWeekStart),
    ])
    const mMap: Record<string,number> = {}
    const mPMap: Record<string,number> = {}
    ;(mLogs??[]).forEach((l:{metric_id:string;value:number}) => { mMap[l.metric_id]=l.value })
    ;(mPrev??[]).forEach((l:{metric_id:string;value:number}) => { mPMap[l.metric_id]=l.value })
    setMetrics((mDefs??[]).map((m:{id:string;name:string;unit:string}) => ({
      id:m.id,name:m.name,unit:m.unit,value:mMap[m.id]??null,prev:mPMap[m.id]??null
    })))

    // Exam mode
    const { data: exams } = await sb.from('exam_periods').select('*').eq('user_id',uid)
    const active = (exams??[]).find((e:{start_date:string;end_date:string;name:string}) => today>=e.start_date&&today<=e.end_date)
    setExamMode(!!active); setExamName(active?.name??'')

    // Study sessions
    const { data: sessions } = await sb.from('study_sessions').select('*').eq('user_id',uid).eq('date',today)
    const b1 = (sessions??[]).find((s:{block:number}) => s.block===1)
    const b2 = (sessions??[]).find((s:{block:number}) => s.block===2)
    setBlocks([
      b1 ? {id:b1.id,block:1,started_at:b1.started_at,ended_at:b1.ended_at,duration_minutes:b1.duration_minutes} : {block:1,started_at:null,ended_at:null,duration_minutes:0},
      b2 ? {id:b2.id,block:2,started_at:b2.started_at,ended_at:b2.ended_at,duration_minutes:b2.duration_minutes} : {block:2,started_at:null,ended_at:null,duration_minutes:0},
    ])
    const e1: Record<number,number> = {}
    if (b1) e1[1] = b1.duration_minutes*60
    if (b2) e1[2] = b2.duration_minutes*60
    setElapsed(e1)

    // Score
    const weekDays: string[] = []
    for (let i=0;i<7;i++) {
      const d=new Date(getMonday()); d.setDate(getMonday().getDate()+i)
      if (fmt(d)<=today) weekDays.push(fmt(d))
    }
    const [{ data: habLogs }, { data: nnWeekLogs }, { data: habList }] = await Promise.all([
      sb.from('habit_logs').select('status,date,habit_id').eq('user_id',uid).in('date',weekDays),
      sb.from('nn_logs').select('done,date,nn_id').eq('user_id',uid).in('date',weekDays),
      sb.from('habits').select('id').eq('user_id',uid).is('archived_at',null),
    ])
    setHabitsTotal((habList??[]).length)
    const todayDone = (habLogs??[]).filter((l:{status:string;date:string}) => l.date===today&&l.status==='done').length
    setHabitsDone(todayDone)

    let earned=0,maxPts=0
    weekDays.forEach(d => {
      ;(nnList??[]).forEach((n:{id:string}) => {
        maxPts+=2
        const log=(nnWeekLogs??[]).find((l:{nn_id:string;date:string;done:boolean}) => l.nn_id===n.id&&l.date===d)
        if (log?.done) earned+=2
      })
      ;(habList??[]).forEach((h:{id:string}) => {
        maxPts+=1
        const log=(habLogs??[]).find((l:{habit_id:string;date:string;status:string}) => l.habit_id===h.id&&l.date===d&&l.status==='done')
        if (log) earned+=1
      })
    })
    setScore(maxPts>0?Math.round(earned/maxPts*100):null)
  }, [today, weekStart, prevWeekStart])

  useEffect(() => { load() }, [load])

  // Live timer tick
  useEffect(() => {
    const running = blocks.find(b => b.started_at && !b.ended_at)
    if (running) {
      timerRef.current = setInterval(() => {
        const base = running.duration_minutes*60
        const started = new Date(running.started_at!).getTime()
        const now = Date.now()
        const secs = base + Math.floor((now-started)/1000)
        setElapsed(prev => ({...prev,[running.block]:secs}))
      }, 1000)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [blocks])

  async function toggleTimer(blockNum: 1|2) {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const block = blocks.find(b => b.block===blockNum)!
    const now = new Date().toISOString()

    if (!block.started_at) {
      // Start
      const { data } = await sb.from('study_sessions').insert({
        user_id:user.id, date:today, block:blockNum, started_at:now, duration_minutes:0
      }).select().single()
      if (data) {
        setBlocks(prev => prev.map(b => b.block===blockNum ? {...b,id:data.id,started_at:now,ended_at:null} : b))
      }
    } else if (!block.ended_at) {
      // Stop
      const base = block.duration_minutes
      const started = new Date(block.started_at).getTime()
      const addMins = Math.floor((Date.now()-started)/60000)
      const total = base+addMins
      await sb.from('study_sessions').update({ended_at:now,duration_minutes:total}).eq('id',block.id!)
      setBlocks(prev => prev.map(b => b.block===blockNum ? {...b,ended_at:now,duration_minutes:total} : b))
      setElapsed(prev => ({...prev,[blockNum]:total*60}))
    } else {
      // Reset
      await sb.from('study_sessions').delete().eq('id',block.id!)
      setBlocks(prev => prev.map(b => b.block===blockNum ? {block:blockNum,started_at:null,ended_at:null,duration_minutes:0} : b))
      setElapsed(prev => ({...prev,[blockNum]:0}))
    }
  }

  function fmtTime(secs: number) {
    const h=Math.floor(secs/3600), m=Math.floor((secs%3600)/60), s=secs%60
    if (h>0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
  }

  async function toggleNN(nn: NN) {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const newDone = !nn.done
    setNNs(prev => prev.map(n => n.id===nn.id ? {...n,done:newDone} : n))
    await sb.from('nn_logs').upsert({user_id:user.id,nn_id:nn.id,date:today,done:newDone},{onConflict:'nn_id,date'})
  }

  async function logRelapse(habitId: string) {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    await sb.from('bad_habit_relapses').insert({
      user_id:user.id, habit_id:habitId, date:today,
      ...relapseForm
    })
    setShowRelapseFor(null)
    setRelapseForm({time_of_day:'',trigger_cause:'',prior_activity:'',note:''})
    load()
  }

  async function updateMetric(id: string, value: string) {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const num = parseFloat(value)
    setMetrics(prev => prev.map(m => m.id===id ? {...m,value:isNaN(num)?null:num} : m))
    if (!isNaN(num)) {
      await sb.from('weekly_metric_logs').upsert(
        {user_id:user.id,metric_id:id,week_start:weekStart,value:num},
        {onConflict:'metric_id,week_start'}
      )
    }
  }

  function checkMilestone(bh: BadHabit) {
    if (MILESTONES.includes(bh.cleanDays)) {
      setMilestone({name:bh.name,days:bh.cleanDays})
    }
  }

  useEffect(() => {
    badHabits.forEach(bh => checkMilestone(bh))
  }, [badHabits])

  const scoreColor = score===null?'#888':score>=90?'#FF5C00':score>=75?'#22c55e':score>=50?'#f59e0b':'#ef4444'
  const scoreLabel = score===null?'—':score>=90?'LOCKED IN':score>=75?'SOLID':score>=50?'STRUGGLING':'FAILING'
  const nnDone = nns.filter(n=>n.done).length
  const totalStudyMins = (elapsed[1]??0)/60 + (elapsed[2]??0)/60

  return (
    <>
      {milestone && (
        <MilestoneCelebration
          habitName={milestone.name}
          days={milestone.days}
          onDone={() => setMilestone(null)}
        />
      )}

      <div className="flex flex-col h-full">
        {/* Morning Briefing — Quote */}
        <DailyQuote />

        {/* War Room Header */}
        <div className="bg-[#0A0A0A] px-6 py-3 flex items-center gap-4 flex-shrink-0 border-b border-[#1E1E1E]">
          <div>
            <div className="text-[20px] font-bold tracking-[.06em] text-white">WAR ROOM</div>
            <div className="text-[10px] text-[#555] tracking-[.15em] uppercase">
              {new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})}
            </div>
          </div>
          {examMode && (
            <div className="px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-[.1em]"
              style={{background:'rgba(255,92,0,.15)',color:'#FF5C00',border:'1px solid rgba(255,92,0,.3)'}}>
              ⚡ EXAM MODE — {examName}
            </div>
          )}
          {score!==null && (
            <div className="ml-auto text-right">
              <div className="font-mono text-[30px] font-bold leading-none" style={{color:scoreColor}}>{score}</div>
              <div className="text-[9px] uppercase tracking-[.15em]" style={{color:scoreColor}}>{scoreLabel}</div>
              <div className="text-[8px] text-[#444]">weekly score</div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto bg-[#f7f7f7]">
          <div className="p-4 grid gap-4 max-w-5xl" style={{gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))'}}>

            {/* NON-NEGOTIABLES */}
            <div className="bg-white border-2 border-[#0A0A0A] rounded-lg overflow-hidden">
              <div className="bg-[#0A0A0A] px-4 py-3 flex items-center justify-between">
                <span className="text-[11px] font-bold tracking-[.1em] text-white uppercase">Non-Negotiables</span>
                <span className="font-mono text-[13px] font-bold" style={{color:nnDone===nns.length&&nns.length>0?'#22c55e':'#FF5C00'}}>
                  {nnDone}/{nns.length}
                </span>
              </div>
              {nns.length===0 ? (
                <div className="p-4 text-[12px] text-[#888]">Add non-negotiables in Setup →</div>
              ) : nns.map(nn => (
                <button key={nn.id} onClick={() => toggleNN(nn)}
                  className="w-full flex items-center gap-3 px-4 py-3 border-b border-[#f7f7f7] last:border-0 hover:bg-[#fafafa] transition-colors text-left">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${nn.done?'bg-[#FF5C00] border-[#FF5C00]':'border-[#dedede]'}`}>
                    {nn.done && <span className="text-white text-[10px] font-bold">✓</span>}
                  </div>
                  <span className={`text-[13px] font-semibold ${nn.done?'line-through text-[#bcbcbc]':'text-[#0A0A0A]'}`}>{nn.name}</span>
                </button>
              ))}
              <div className="px-4 py-2 bg-[#fafafa] flex items-center justify-between">
                <span className="text-[10px] text-[#888]">Habits today</span>
                <span className="font-mono text-[11px] font-bold text-[#888]">{habitsDone}/{habitsTotal}</span>
              </div>
            </div>

            {/* STUDY TIMER */}
            <div className="bg-white border border-[#efefef] rounded-lg overflow-hidden">
              <div className="bg-[#0A0A0A] px-4 py-3 flex items-center justify-between">
                <span className="text-[11px] font-bold tracking-[.1em] text-white uppercase">Study Timer</span>
                <span className="font-mono text-[11px] text-[#FF5C00] font-bold">
                  {Math.floor(totalStudyMins/60)}h{String(Math.floor(totalStudyMins%60)).padStart(2,'0')}m / 4h
                </span>
              </div>
              {[1,2].map(bn => {
                const b = blocks.find(x => x.block===bn)!
                const secs = elapsed[bn]??0
                const running = !!b.started_at && !b.ended_at
                const done = !!b.ended_at
                const pct = Math.min(100, Math.round(secs/7200*100))
                return (
                  <div key={bn} className="px-4 py-4 border-b border-[#f7f7f7] last:border-0">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-bold text-[#0A0A0A]">Block {bn}</span>
                      <span className="font-mono text-[22px] font-bold" style={{color:done?'#22c55e':running?'#FF5C00':'#bcbcbc'}}>
                        {fmtTime(secs)}
                      </span>
                    </div>
                    <div className="h-1.5 bg-[#efefef] rounded-full overflow-hidden mb-3">
                      <div className="h-full rounded-full transition-all" style={{width:`${pct}%`,background:done?'#22c55e':'#FF5C00'}} />
                    </div>
                    <button onClick={() => toggleTimer(bn as 1|2)}
                      className="w-full py-2 rounded-md text-[10px] font-bold uppercase tracking-[.1em] transition-all"
                      style={{
                        background: done?'#f7f7f7':running?'#FBE9E7':'#FF5C00',
                        color: done?'#888':running?'#8B0000':'white',
                        border: done?'1px solid #efefef':running?'1px solid #e0a0a0':'none',
                      }}>
                      {done?'Reset':running?'⏸ Stop':'▶ Start'}
                    </button>
                  </div>
                )
              })}
            </div>

            {/* CLEAN DAYS */}
            {badHabits.length>0 && (
              <div className="bg-white border border-[#efefef] rounded-lg overflow-hidden">
                <div className="bg-[#0A0A0A] px-4 py-3">
                  <span className="text-[11px] font-bold tracking-[.1em] text-white uppercase">Clean Days</span>
                </div>
                {badHabits.map(bh => (
                  <div key={bh.id} className="border-b border-[#f7f7f7] last:border-0">
                    <div className="px-4 py-4 flex items-center gap-3">
                      <div className="flex-1">
                        <div className="text-[13px] font-bold">{bh.name}</div>
                        <div className="text-[10px] text-[#888] mt-0.5">
                          {bh.lastRelapse?`Last relapse: ${bh.lastRelapse}`:'No relapses logged'}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-[28px] font-bold text-[#FF5C00] leading-none">{bh.cleanDays}</div>
                        <div className="text-[8px] text-[#888] uppercase tracking-[.1em]">days clean</div>
                      </div>
                    </div>
                    {/* Milestones */}
                    <div className="px-4 pb-3 flex gap-1.5 flex-wrap">
                      {MILESTONES.map(m => (
                        <div key={m} className={`px-2 py-0.5 rounded text-[9px] font-bold ${bh.cleanDays>=m?'bg-[#FF5C00] text-white':'bg-[#f7f7f7] text-[#bcbcbc]'}`}>
                          {m}d
                        </div>
                      ))}
                    </div>
                    {/* Relapse form */}
                    {showRelapseFor===bh.id ? (
                      <div className="px-4 pb-4 space-y-2">
                        <div className="text-[9px] font-bold text-[#ef4444] uppercase tracking-[.1em] mb-1">Log Relapse — Be Honest</div>
                        <select className="w-full bg-[#f7f7f7] border border-[#dedede] rounded px-2 py-1.5 text-[12px] outline-none focus:border-[#FF5C00]"
                          value={relapseForm.time_of_day} onChange={e=>setRelapseForm(f=>({...f,time_of_day:e.target.value}))}>
                          <option value="">What time was it?</option>
                          {['Late night (10pm-2am)','Morning (6am-12pm)','Afternoon (12pm-6pm)','Evening (6pm-10pm)'].map(t=><option key={t}>{t}</option>)}
                        </select>
                        <input className="w-full bg-[#f7f7f7] border border-[#dedede] rounded px-2 py-1.5 text-[12px] outline-none focus:border-[#FF5C00]"
                          placeholder="What triggered it?" value={relapseForm.trigger_cause}
                          onChange={e=>setRelapseForm(f=>({...f,trigger_cause:e.target.value}))} />
                        <input className="w-full bg-[#f7f7f7] border border-[#dedede] rounded px-2 py-1.5 text-[12px] outline-none focus:border-[#FF5C00]"
                          placeholder="What were you doing before?" value={relapseForm.prior_activity}
                          onChange={e=>setRelapseForm(f=>({...f,prior_activity:e.target.value}))} />
                        <input className="w-full bg-[#f7f7f7] border border-[#dedede] rounded px-2 py-1.5 text-[12px] outline-none focus:border-[#FF5C00]"
                          placeholder="Note (optional)" value={relapseForm.note}
                          onChange={e=>setRelapseForm(f=>({...f,note:e.target.value}))} />
                        <div className="flex gap-2 pt-1">
                          <button onClick={()=>logRelapse(bh.id)}
                            className="flex-1 bg-[#ef4444] text-white text-[9px] font-bold uppercase tracking-[.1em] py-2 rounded hover:bg-red-600 transition-colors">
                            Confirm Relapse
                          </button>
                          <button onClick={()=>{setShowRelapseFor(null);setRelapseForm({time_of_day:'',trigger_cause:'',prior_activity:'',note:''})}}
                            className="px-3 text-[9px] text-[#888] hover:text-[#0A0A0A] transition-colors">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="px-4 pb-3">
                        <button onClick={()=>setShowRelapseFor(bh.id)}
                          className="text-[9px] font-bold uppercase tracking-[.1em] text-[#bcbcbc] hover:text-[#ef4444] transition-colors">
                          Log relapse →
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* 6-MONTH GOALS */}
            {goals.length>0 && (
              <div className="bg-white border border-[#efefef] rounded-lg overflow-hidden">
                <div className="bg-[#0A0A0A] px-4 py-3">
                  <span className="text-[11px] font-bold tracking-[.1em] text-white uppercase">6-Month Goals</span>
                </div>
                {goals.map(g => {
                  const color=CAT_COLORS[g.category]??'#888'
                  const daysLeft=Math.ceil((new Date(g.end_date).getTime()-Date.now())/86400000)
                  return (
                    <div key={g.id} className="px-4 py-3 border-b border-[#f7f7f7] last:border-0">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 rounded-full" style={{background:color}} />
                        <span className="text-[12px] font-bold flex-1 truncate">{g.title}</span>
                        <span className="font-mono text-[12px] font-bold" style={{color}}>{g.pct}%</span>
                        <span className="text-[9px] text-[#888] font-mono">{daysLeft>0?`${daysLeft}d`:'ended'}</span>
                      </div>
                      <div className="h-1.5 bg-[#efefef] rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{width:`${g.pct}%`,background:color}} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* WEEKLY NUMBERS */}
            {metrics.length>0 && (
              <div className="bg-white border border-[#efefef] rounded-lg overflow-hidden">
                <div className="bg-[#0A0A0A] px-4 py-3">
                  <span className="text-[11px] font-bold tracking-[.1em] text-white uppercase">Weekly Numbers</span>
                </div>
                {metrics.map(m => {
                  const delta=m.value!==null&&m.prev!==null?m.value-m.prev:null
                  return (
                    <div key={m.id} className="px-4 py-3 border-b border-[#f7f7f7] last:border-0 flex items-center gap-3">
                      <div className="flex-1">
                        <div className="text-[11px] font-bold">{m.name}</div>
                        {delta!==null && (
                          <div className={`text-[9px] font-mono mt-0.5 ${delta>0?'text-[#22c55e]':delta<0?'text-[#ef4444]':'text-[#888]'}`}>
                            {delta>0?'+':''}{delta}{m.unit} vs last week
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <input type="number" className="w-20 bg-[#f7f7f7] border border-[#dedede] rounded px-2 py-1.5 text-right font-mono text-[13px] font-bold outline-none focus:border-[#FF5C00]"
                          placeholder="0" value={m.value??''}
                          onChange={e=>updateMetric(m.id,e.target.value)} />
                        {m.unit&&<span className="text-[10px] text-[#888]">{m.unit}</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  )
}
