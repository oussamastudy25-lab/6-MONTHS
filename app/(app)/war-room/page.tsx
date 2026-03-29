'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

const sb = createClient()

type NN       = { id: string; name: string; done: boolean }
type BadHabit = { id: string; name: string; cleanDays: number; lastRelapse: string | null }
type Goal     = { id: string; title: string; category: string; end_date: string; pct: number }
type Metric   = { id: string; name: string; unit: string; value: number | null; prev: number | null }

const CAT_COLORS: Record<string, string> = {
  Health:'#22c55e', Mind:'#8b5cf6', Work:'#FF5C00',
  Relationships:'#ec4899', Finance:'#f59e0b', Spirit:'#06b6d4', Other:'#888'
}

function getMonday(d = new Date()) {
  const day = d.getDay(), diff = day === 0 ? -6 : 1 - day
  const m = new Date(d); m.setDate(d.getDate() + diff); m.setHours(0,0,0,0)
  return m
}
function fmt(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function daysBetween(a: string, b: string) {
  return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
}

export default function WarRoomPage() {
  const today = fmt(new Date())
  const weekStart = fmt(getMonday())
  const prevWeekStart = fmt(getMonday(new Date(Date.now() - 7 * 86400000)))

  const [nns, setNNs]         = useState<NN[]>([])
  const [badHabits, setBH]    = useState<BadHabit[]>([])
  const [goals, setGoals]     = useState<Goal[]>([])
  const [metrics, setMetrics] = useState<Metric[]>([])
  const [score, setScore]     = useState<number | null>(null)
  const [examMode, setExamMode] = useState(false)
  const [examName, setExamName] = useState('')
  const [relapseNote, setRelapseNote] = useState<Record<string, string>>({})
  const [showRelapseFor, setShowRelapseFor] = useState<string | null>(null)
  const [habitsDoneToday, setHabitsDone] = useState(0)
  const [habitsTotal, setHabitsTotal] = useState(0)

  const load = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const uid = user.id

    // Non-negotiables + today's logs
    const [{ data: nnList }, { data: nnLogs }] = await Promise.all([
      sb.from('non_negotiables').select('*').eq('user_id', uid).order('position'),
      sb.from('nn_logs').select('*').eq('user_id', uid).eq('date', today),
    ])
    const nnMap: Record<string, boolean> = {}
    ;(nnLogs ?? []).forEach((l: {nn_id: string; done: boolean}) => { nnMap[l.nn_id] = l.done })
    setNNs((nnList ?? []).map((n: {id:string;name:string}) => ({ id: n.id, name: n.name, done: nnMap[n.id] ?? false })))

    // Bad habits + relapses
    const { data: bh } = await sb.from('bad_habits').select('*').eq('user_id', uid).order('position')
    const { data: relapses } = await sb.from('bad_habit_relapses').select('habit_id,date').eq('user_id', uid).order('date', { ascending: false })
    const bhData: BadHabit[] = (bh ?? []).map((h: {id:string;name:string}) => {
      const lastR = (relapses ?? []).find((r: {habit_id:string;date:string}) => r.habit_id === h.id)
      const cleanDays = lastR ? daysBetween(lastR.date, today) : daysBetween(h.id.slice(0,10) === today.slice(0,10) ? today : '2026-01-01', today)
      // Actually compute from created_at – but we don't have it here, so use last relapse
      const cd = lastR ? Math.max(0, daysBetween(lastR.date, today)) : null
      return { id: h.id, name: h.name, cleanDays: cd ?? 0, lastRelapse: lastR?.date ?? null }
    })
    setBH(bhData)

    // 6-month goals + milestones
    const [{ data: goalsData }, { data: msData }] = await Promise.all([
      sb.from('six_month_goals').select('*').eq('user_id', uid).order('position'),
      sb.from('milestones').select('*').eq('user_id', uid),
    ])
    setGoals((goalsData ?? []).map((g: {id:string;title:string;category:string;end_date:string}) => {
      const ms = (msData ?? []).filter((m: {goal_id:string}) => m.goal_id === g.id)
      const done = ms.filter((m: {done:boolean}) => m.done).length
      return { id: g.id, title: g.title, category: g.category, end_date: g.end_date, pct: ms.length > 0 ? Math.round(done / ms.length * 100) : 0 }
    }))

    // Weekly metrics
    const [{ data: mDefs }, { data: mLogs }, { data: mPrevLogs }] = await Promise.all([
      sb.from('weekly_metrics').select('*').eq('user_id', uid).order('position'),
      sb.from('weekly_metric_logs').select('*').eq('user_id', uid).eq('week_start', weekStart),
      sb.from('weekly_metric_logs').select('*').eq('user_id', uid).eq('week_start', prevWeekStart),
    ])
    const mMap: Record<string, number> = {}
    const mPrevMap: Record<string, number> = {}
    ;(mLogs ?? []).forEach((l: {metric_id:string;value:number}) => { mMap[l.metric_id] = l.value })
    ;(mPrevLogs ?? []).forEach((l: {metric_id:string;value:number}) => { mPrevMap[l.metric_id] = l.value })
    setMetrics((mDefs ?? []).map((m: {id:string;name:string;unit:string}) => ({
      id: m.id, name: m.name, unit: m.unit,
      value: mMap[m.id] ?? null, prev: mPrevMap[m.id] ?? null
    })))

    // Exam mode
    const { data: exams } = await sb.from('exam_periods').select('*').eq('user_id', uid)
    const active = (exams ?? []).find((e: {start_date:string;end_date:string;name:string}) =>
      today >= e.start_date && today <= e.end_date)
    setExamMode(!!active)
    setExamName(active?.name ?? '')

    // Weekly score — habits this week
    const weekDays: string[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(getMonday()); d.setDate(getMonday().getDate() + i)
      if (fmt(d) <= today) weekDays.push(fmt(d))
    }
    const [{ data: habLogs }, { data: nnWeekLogs }] = await Promise.all([
      sb.from('habit_logs').select('status,date').eq('user_id', uid).in('date', weekDays),
      sb.from('nn_logs').select('done,date,nn_id').eq('user_id', uid).in('date', weekDays),
    ])
    const { data: habList } = await sb.from('habits').select('id').eq('user_id', uid).is('archived_at', null)
    const habCount = (habList ?? []).length
    const nnCount = (nnList ?? []).length

    let earned = 0, maxPts = 0
    weekDays.forEach(d => {
      // NNs = 2 pts each
      ;(nnList ?? []).forEach((n: {id:string}) => {
        maxPts += 2
        const log = (nnWeekLogs ?? []).find((l: {nn_id:string;date:string;done:boolean}) => l.nn_id === n.id && l.date === d)
        if (log?.done) earned += 2
      })
      // Habits = 1 pt each
      ;(habList ?? []).forEach((h: {id:string}) => {
        maxPts += 1
        const log = (habLogs ?? []).find((l: {status:string;date:string}) => l.date === d)
        if (log?.status === 'done') earned += 1
      })
    })
    setScore(maxPts > 0 ? Math.round(earned / maxPts * 100) : null)

    // Today's habits
    const todayDone = (habLogs ?? []).filter((l: {status:string;date:string}) => l.date === today && l.status === 'done').length
    setHabitsDone(todayDone)
    setHabitsTotal(habCount)
  }, [today, weekStart, prevWeekStart])

  useEffect(() => { load() }, [load])

  async function toggleNN(nn: NN) {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const newDone = !nn.done
    setNNs(prev => prev.map(n => n.id === nn.id ? { ...n, done: newDone } : n))
    await sb.from('nn_logs').upsert(
      { user_id: user.id, nn_id: nn.id, date: today, done: newDone },
      { onConflict: 'nn_id,date' }
    )
  }

  async function logRelapse(habitId: string) {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    await sb.from('bad_habit_relapses').insert({
      user_id: user.id, habit_id: habitId, date: today, note: relapseNote[habitId] ?? ''
    })
    setShowRelapseFor(null)
    setRelapseNote(r => ({ ...r, [habitId]: '' }))
    load()
  }

  async function updateMetric(id: string, value: string) {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const num = parseFloat(value)
    setMetrics(prev => prev.map(m => m.id === id ? { ...m, value: isNaN(num) ? null : num } : m))
    if (!isNaN(num)) {
      await sb.from('weekly_metric_logs').upsert(
        { user_id: user.id, metric_id: id, week_start: weekStart, value: num },
        { onConflict: 'metric_id,week_start' }
      )
    }
  }

  const scoreColor = score === null ? '#888' : score >= 90 ? '#FF5C00' : score >= 75 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444'
  const scoreLabel = score === null ? '—' : score >= 90 ? 'LOCKED IN' : score >= 75 ? 'SOLID' : score >= 50 ? 'STRUGGLING' : 'FAILING'
  const nnDone = nns.filter(n => n.done).length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-[#0A0A0A] px-6 py-4 flex items-center gap-4 flex-shrink-0">
        <div>
          <div className="text-[22px] font-bold tracking-[.04em] text-white">WAR ROOM</div>
          <div className="text-[10px] text-[#555] tracking-[.15em] uppercase mt-0.5">
            {new Date().toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long' })}
          </div>
        </div>
        {examMode && (
          <div className="ml-4 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-[.1em]"
            style={{background:'rgba(255,92,0,.15)',color:'#FF5C00',border:'1px solid rgba(255,92,0,.3)'}}>
            ⚡ EXAM MODE — {examName}
          </div>
        )}
        {score !== null && (
          <div className="ml-auto text-right">
            <div className="font-mono text-[32px] font-bold leading-none" style={{color:scoreColor}}>{score}</div>
            <div className="text-[9px] uppercase tracking-[.15em] mt-0.5" style={{color:scoreColor}}>{scoreLabel}</div>
            <div className="text-[8px] text-[#555] mt-0.5">weekly score</div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto bg-[#f7f7f7]">
        <div className="p-5 grid gap-4 max-w-5xl" style={{gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))'}}>

          {/* NON-NEGOTIABLES */}
          <div className="bg-white border-2 border-[#0A0A0A] rounded-lg overflow-hidden">
            <div className="bg-[#0A0A0A] px-4 py-3 flex items-center justify-between">
              <span className="text-[11px] font-bold tracking-[.1em] text-white uppercase">Non-Negotiables</span>
              <span className="font-mono text-[13px] font-bold" style={{color: nnDone === nns.length && nns.length > 0 ? '#22c55e' : '#FF5C00'}}>
                {nnDone}/{nns.length}
              </span>
            </div>
            {nns.length === 0 ? (
              <div className="p-4 text-[12px] text-[#888]">Add non-negotiables in Setup →</div>
            ) : nns.map(nn => (
              <button key={nn.id} onClick={() => toggleNN(nn)}
                className="w-full flex items-center gap-3 px-4 py-3 border-b border-[#f7f7f7] last:border-0 hover:bg-[#fafafa] transition-colors text-left">
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${nn.done ? 'bg-[#FF5C00] border-[#FF5C00]' : 'border-[#dedede]'}`}>
                  {nn.done && <span className="text-white text-[10px] font-bold">✓</span>}
                </div>
                <span className={`text-[13px] font-semibold ${nn.done ? 'line-through text-[#bcbcbc]' : 'text-[#0A0A0A]'}`}>{nn.name}</span>
              </button>
            ))}
            <div className="px-4 py-2 bg-[#fafafa] flex items-center justify-between">
              <span className="text-[10px] text-[#888]">Regular habits today</span>
              <span className="font-mono text-[11px] font-bold text-[#888]">{habitsDoneToday}/{habitsTotal}</span>
            </div>
          </div>

          {/* CLEAN DAYS */}
          {badHabits.length > 0 && (
            <div className="bg-white border border-[#efefef] rounded-lg overflow-hidden">
              <div className="bg-[#0A0A0A] px-4 py-3">
                <span className="text-[11px] font-bold tracking-[.1em] text-white uppercase">Clean Days</span>
              </div>
              {badHabits.map(bh => (
                <div key={bh.id} className="border-b border-[#f7f7f7] last:border-0">
                  <div className="px-4 py-4 flex items-center gap-3">
                    <div className="flex-1">
                      <div className="text-[13px] font-bold text-[#0A0A0A]">{bh.name}</div>
                      <div className="text-[10px] text-[#888] mt-0.5">
                        {bh.lastRelapse ? `Last relapse: ${bh.lastRelapse}` : 'No relapses logged'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-[28px] font-bold text-[#FF5C00] leading-none">{bh.cleanDays}</div>
                      <div className="text-[8px] text-[#888] uppercase tracking-[.1em]">days clean</div>
                    </div>
                  </div>
                  {/* Milestone badges */}
                  <div className="px-4 pb-3 flex gap-1.5 flex-wrap">
                    {[7,21,40,90,180].map(m => (
                      <div key={m} className={`px-2 py-0.5 rounded text-[9px] font-bold ${bh.cleanDays >= m ? 'bg-[#FF5C00] text-white' : 'bg-[#f7f7f7] text-[#bcbcbc]'}`}>
                        {m}d
                      </div>
                    ))}
                  </div>
                  {showRelapseFor === bh.id ? (
                    <div className="px-4 pb-3 flex gap-2">
                      <input className="flex-1 bg-[#f7f7f7] border border-[#dedede] rounded px-2 py-1.5 text-[12px] outline-none focus:border-[#FF5C00]"
                        placeholder="What happened? (optional)"
                        value={relapseNote[bh.id] ?? ''}
                        onChange={e => setRelapseNote(r => ({ ...r, [bh.id]: e.target.value }))} />
                      <button onClick={() => logRelapse(bh.id)}
                        className="bg-[#ef4444] text-white text-[9px] font-bold uppercase tracking-[.08em] px-3 rounded hover:bg-red-600 transition-colors">
                        Confirm
                      </button>
                      <button onClick={() => setShowRelapseFor(null)}
                        className="text-[9px] text-[#888] px-2">✕</button>
                    </div>
                  ) : (
                    <div className="px-4 pb-3">
                      <button onClick={() => setShowRelapseFor(bh.id)}
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
          {goals.length > 0 && (
            <div className="bg-white border border-[#efefef] rounded-lg overflow-hidden">
              <div className="bg-[#0A0A0A] px-4 py-3">
                <span className="text-[11px] font-bold tracking-[.1em] text-white uppercase">6-Month Goals</span>
              </div>
              {goals.map(g => {
                const color = CAT_COLORS[g.category] ?? '#888'
                const daysLeft = Math.ceil((new Date(g.end_date).getTime() - Date.now()) / 86400000)
                return (
                  <div key={g.id} className="px-4 py-3 border-b border-[#f7f7f7] last:border-0">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background:color}} />
                      <span className="text-[12px] font-bold flex-1 truncate">{g.title}</span>
                      <span className="font-mono text-[12px] font-bold" style={{color}}>{g.pct}%</span>
                      <span className="text-[9px] text-[#888] font-mono">{daysLeft > 0 ? `${daysLeft}d` : 'ended'}</span>
                    </div>
                    <div className="h-1.5 bg-[#efefef] rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{width:`${g.pct}%`,background:color}} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* WEEKLY NUMBERS */}
          {metrics.length > 0 && (
            <div className="bg-white border border-[#efefef] rounded-lg overflow-hidden">
              <div className="bg-[#0A0A0A] px-4 py-3">
                <span className="text-[11px] font-bold tracking-[.1em] text-white uppercase">Weekly Numbers</span>
                <span className="text-[9px] text-[#555] ml-2">Update every Sunday</span>
              </div>
              {metrics.map(m => {
                const delta = m.value !== null && m.prev !== null ? m.value - m.prev : null
                const up = delta !== null && delta > 0
                const down = delta !== null && delta < 0
                return (
                  <div key={m.id} className="px-4 py-3 border-b border-[#f7f7f7] last:border-0 flex items-center gap-3">
                    <div className="flex-1">
                      <div className="text-[11px] font-bold text-[#0A0A0A]">{m.name}</div>
                      {delta !== null && (
                        <div className={`text-[9px] font-mono mt-0.5 ${up?'text-[#22c55e]':down?'text-[#ef4444]':'text-[#888]'}`}>
                          {up?'+':''}{delta}{m.unit} vs last week
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        className="w-20 bg-[#f7f7f7] border border-[#dedede] rounded px-2 py-1.5 text-right font-mono text-[13px] font-bold outline-none focus:border-[#FF5C00] focus:bg-white"
                        placeholder="0"
                        value={m.value ?? ''}
                        onChange={e => updateMetric(m.id, e.target.value)}
                      />
                      {m.unit && <span className="text-[10px] text-[#888]">{m.unit}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* EMPTY STATE */}
          {nns.length === 0 && badHabits.length === 0 && goals.length === 0 && (
            <div className="col-span-full text-center py-16">
              <div className="text-4xl mb-4">⚔</div>
              <div className="text-[16px] font-bold mb-2">Your War Room is empty</div>
              <div className="text-[13px] text-[#888]">Go to Setup to configure non-negotiables, bad habits, and metrics.</div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
