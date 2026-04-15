'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'

type Habit = {
  id: string; name: string; frequency: string
  habit_type: string; measure_target: number | null; measure_unit: string | null
}
type Log = { habit_id: string; status: string; date: string; measure_value: number | null }
type Task = { id: string; text: string; done: boolean }
type WGoal = { id: string; text: string; done: boolean }

const sb = createClient()
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function isScheduled(frequency: string, d = new Date()) {
  const dow = d.getDay()
  if (frequency === 'weekdays') return dow >= 1 && dow <= 5
  if (frequency === 'weekends') return dow === 0 || dow === 6
  if (frequency === '3x') return [1, 3, 5].includes(dow)
  if (frequency.startsWith('custom:')) { const days = frequency.slice(7).split(',').map(Number); return days.includes(dow) }
  return true
}
function fmt(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function getMon(d = new Date()) {
  const day = d.getDay(), diff = day === 0 ? -6 : 1 - day
  const m = new Date(d); m.setDate(d.getDate() + diff); m.setHours(0,0,0,0); return m
}

// For measure habits: color based on % of target reached
function measureColor(val: number | null, target: number | null): string {
  if (val === null || val === undefined) return '#f7f7f7'
  if (!target || target === 0) return '#1A73E8' // no target = any value counts
  const pct = val / target
  if (pct >= 1)   return '#22c55e'    // full green = met target
  if (pct >= 0.5) return '#f59e0b'    // amber = halfway
  return '#fca5a5'                     // light red = less than half
}

export default function TrackerPage() {
  const now    = new Date()
  const today  = fmt(now)
  const weekStart = fmt(getMon())
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [habits, setHabits] = useState<Habit[]>([])
  const [logs,   setLogs]   = useState<Log[]>([])
  const [tasks,  setTasks]  = useState<Task[]>([])
  const [wgoals, setWgoals] = useState<WGoal[]>([])
  const [loaded, setLoaded] = useState(false)
  const [activeTab, setActiveTab] = useState<'grid' | 'analytics'>('grid')
  // track pending measure inputs per habit (today only)
  const measureInputRefs = useRef<Record<string, string>>({})
  const [measureInputs, setMeasureInputs] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const [{ data: h }, { data: l }, { data: t }, { data: wg }] = await Promise.all([
      sb.from('habits').select('id,name,frequency,habit_type,measure_target,measure_unit').eq('user_id', user.id).is('archived_at', null).order('position'),
      sb.from('habit_logs').select('habit_id,status,date,measure_value').eq('user_id', user.id),
      sb.from('tasks').select('id,text,done').eq('user_id', user.id).eq('date', today).order('position'),
      sb.from('weekly_goals').select('id,text,done').eq('user_id', user.id).eq('week_start', weekStart).order('position'),
    ])
    setHabits(h ?? [])
    setLogs(l ?? [])
    setTasks(t ?? [])
    setWgoals(wg ?? [])
    setLoaded(true)
    // init measure inputs from existing logs
    const inputs: Record<string, string> = {}
    ;(l ?? []).filter((lg: Log) => lg.date === today && lg.measure_value !== null).forEach((lg: Log) => {
      inputs[lg.habit_id] = String(lg.measure_value)
    })
    setMeasureInputs(inputs)
  }, [today, weekStart])

  useEffect(() => { load() }, [load])

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const d = i + 1
    return `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
  })

  function getLog(habitId: string, date: string) {
    return logs.find(l => l.habit_id === habitId && l.date === date)
  }
  function getStatus(habitId: string, date: string) { return getLog(habitId, date)?.status ?? '' }
  function getMeasureVal(habitId: string, date: string) { return getLog(habitId, date)?.measure_value ?? null }

  async function saveLog(habitId: string, date: string, status: string, measureValue?: number | null) {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    setLogs(prev => {
      const without = prev.filter(l => !(l.habit_id === habitId && l.date === date))
      if (status === '') return without
      return [...without, { habit_id: habitId, status, date, measure_value: measureValue ?? null }]
    })
    if (status === '') {
      await sb.from('habit_logs').delete().eq('user_id', user.id).eq('habit_id', habitId).eq('date', date)
    } else {
      await sb.from('habit_logs').upsert(
        { user_id: user.id, habit_id: habitId, date, status, measure_value: measureValue ?? null },
        { onConflict: 'user_id,habit_id,date' }
      )
    }
  }

  function toggleStatus(habitId: string, date: string, status: string) {
    const cur = getStatus(habitId, date)
    saveLog(habitId, date, cur === status ? '' : status)
  }
  function cycleStatus(habitId: string, date: string) {
    const cur = getStatus(habitId, date)
    const next = cur === '' ? 'done' : cur === 'done' ? 'missed' : cur === 'missed' ? 'na' : ''
    saveLog(habitId, date, next)
  }

  async function saveMeasure(habitId: string, date: string, valueStr: string, habit: Habit) {
    const val = parseFloat(valueStr)
    if (isNaN(val) || valueStr.trim() === '') {
      saveLog(habitId, date, '')
      return
    }
    const target = habit.measure_target
    const status = !target ? 'done' : val >= target ? 'done' : val > 0 ? 'partial' : ''
    await saveLog(habitId, date, status === '' ? 'missed' : status, val)
  }

  // Boolean habit stats for the month
  function boolStats(habitId: string) {
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

  // Measure habit stats for the month
  function measureStats(habit: Habit) {
    const vals = days
      .map(d => getMeasureVal(habit.id, d))
      .filter((v): v is number => v !== null && v !== undefined)
    if (vals.length === 0) return { avg: 0, total: 0, best: 0, daysLogged: 0, daysHitTarget: 0, pct: 0 }
    const total = vals.reduce((a, b) => a + b, 0)
    const avg   = total / vals.length
    const best  = Math.max(...vals)
    const daysLogged = vals.length
    const daysHitTarget = habit.measure_target
      ? vals.filter(v => v >= (habit.measure_target as number)).length
      : vals.filter(v => v > 0).length
    const pct = daysLogged > 0 ? Math.round(daysHitTarget / daysLogged * 100) : 0
    return { avg, total, best, daysLogged, daysHitTarget, pct }
  }

  // Overdue checks
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth()
  const activeHabits = habits.filter(h => h.name)
  const scheduledToday = activeHabits.filter(h => isScheduled(h.frequency))
  const restDayToday   = activeHabits.filter(h => !isScheduled(h.frequency))

  // Overdue daily tasks (not done today)
  const pendingTasks = tasks.filter(t => t.text && !t.done)
  // Overdue weekly goals (not done this week)
  const pendingWGoals = wgoals.filter(g => g.text && !g.done)
  // Unlogged scheduled habits today
  const unloggedHabits = scheduledToday.filter(h => getStatus(h.id, today) === '')
  const hasOverdue = pendingTasks.length > 0 || pendingWGoals.length > 0 || unloggedHabits.length > 0

  return (
    <>
      <div className="bg-white px-7 py-5 border-b border-[#E8EAED] flex-shrink-0">
        <div className="text-[22px] font-normal text-[#202124]">Tracker</div>
        <div className="text-[12px] text-[#5F6368] mt-1">Log today's habits · monthly overview · analytics</div>
      </div>

      {/* ── OVERDUE BANNER ── */}
      {isCurrentMonth && hasOverdue && (
        <div style={{
          background: '#FFF8F0', borderBottom: '1px solid #FFD4B8',
          padding: '10px 24px', flexShrink: 0, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center',
        }}>
          <span style={{ fontSize: 14, flexShrink: 0 }}>⚠️</span>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', flex: 1 }}>
            {unloggedHabits.length > 0 && (
              <span style={{ fontSize: 12, color: '#B45309', fontWeight: 500 }}>
                {unloggedHabits.length} habit{unloggedHabits.length !== 1 ? 's' : ''} not logged today
                <span style={{ fontWeight: 400, color: '#92400E', marginLeft: 4 }}>
                  ({unloggedHabits.slice(0,3).map(h => h.name).join(', ')}{unloggedHabits.length > 3 ? '…' : ''})
                </span>
              </span>
            )}
            {pendingTasks.length > 0 && (
              <span style={{ fontSize: 12, color: '#B45309', fontWeight: 500 }}>
                {pendingTasks.length} task{pendingTasks.length !== 1 ? 's' : ''} pending today
              </span>
            )}
            {pendingWGoals.length > 0 && (
              <span style={{ fontSize: 12, color: '#B45309', fontWeight: 500 }}>
                {pendingWGoals.length} weekly goal{pendingWGoals.length !== 1 ? 's' : ''} not done
              </span>
            )}
          </div>
          <a href="/weekly" style={{ fontSize: 11, color: '#FF5C00', fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}>Go to Weekly →</a>
        </div>
      )}

      {/* Month nav */}
      <div className="flex items-center gap-2 px-6 py-2 bg-[#f7f7f7] border-b border-[#E8EAED] flex-shrink-0">
        <button onClick={() => { if(month===0){setMonth(11);setYear(y=>y-1)}else setMonth(m=>m-1) }}
          className="w-6 h-6 border border-[#DADCE0] rounded flex items-center justify-center text-[14px] text-[#5F6368] hover:bg-[#FF5C00] hover:text-white hover:border-[#FF5C00] transition-colors">‹</button>
        <span className="text-[14px] font-normal text-[#202124] min-w-[140px] text-center">{MONTHS[month]} {year}</span>
        <button onClick={() => { if(month===11){setMonth(0);setYear(y=>y+1)}else setMonth(m=>m+1) }}
          className="w-6 h-6 border border-[#DADCE0] rounded flex items-center justify-center text-[14px] text-[#5F6368] hover:bg-[#FF5C00] hover:text-white hover:border-[#FF5C00] transition-colors">›</button>
        <button onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()) }}
          className="text-[11px] font-medium tracking-[0.04em] uppercase px-3 py-1 rounded border border-[#DADCE0] text-[#5F6368] hover:bg-[#FF5C00] hover:text-white hover:border-[#FF5C00] transition-colors">Today</button>

        {/* Tab switcher */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {(['grid','analytics'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 500, cursor: 'pointer', transition: 'all 0.12s', textTransform: 'capitalize',
              border: activeTab === tab ? '1.5px solid #FF5C00' : '1.5px solid #E8EAED',
              background: activeTab === tab ? '#FF5C00' : 'transparent',
              color: activeTab === tab ? 'white' : '#5F6368',
            }}>
              {tab === 'grid' ? '▦ Grid' : '📊 Analytics'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!loaded ? (
          <div className="text-center py-20 text-[#5F6368] text-[13px]">Loading…</div>
        ) : activeHabits.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-4xl mb-3">▦</div>
            <div className="text-[15px] font-medium mb-1">No habits yet</div>
            <div className="text-[13px] text-[#5F6368] mb-4">Add your first habit to start tracking</div>
            <a href="/setup" className="inline-block bg-[#FF5C00] text-white hover:bg-[#e05200] transition-colors px-4 py-2 rounded-full text-[13px] font-medium">
              + Add Habits in Setup
            </a>
          </div>
        ) : (
          <>
            {/* TODAY'S LOG */}
            {isCurrentMonth && (
              <div className="px-5 pt-4 pb-4 border-b border-[#E8EAED] bg-white">
                <div className="text-[11px] font-medium text-[#5F6368] tracking-[0.06em] uppercase mb-3">
                  Today — {now.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long' })}
                </div>
                <div className="space-y-3">
                  {scheduledToday.map(h => {
                    const s = getStatus(h.id, today)
                    const isMeasure = h.habit_type === 'measure'
                    const mv = getMeasureVal(h.id, today)

                    if (isMeasure) {
                      return (
                        <div key={h.id} className="flex items-center gap-3 bg-[#FFFAF7] rounded-lg px-3 py-2.5" style={{ border: '1px solid #FFD4B8' }}>
                          <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{h.name}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                            <input
                              type="number" min="0" step="any"
                              placeholder="0"
                              value={measureInputs[h.id] ?? ''}
                              onChange={e => {
                                const v = e.target.value
                                setMeasureInputs(prev => ({ ...prev, [h.id]: v }))
                              }}
                              onBlur={e => saveMeasure(h.id, today, e.target.value, h)}
                              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                              style={{
                                width: 64, padding: '5px 8px', borderRadius: 8, textAlign: 'right',
                                border: `1.5px solid ${s === 'done' ? '#22c55e' : s === 'partial' ? '#f59e0b' : '#E8EAED'}`,
                                fontSize: 14, fontFamily: 'monospace', fontWeight: 600, outline: 'none',
                                background: 'white', color: '#202124',
                              }}
                              onFocus={e => (e.target.style.borderColor = '#FF5C00')}
                            />
                            {h.measure_unit && <span style={{ fontSize: 12, color: '#9AA0A6', minWidth: 28 }}>{h.measure_unit}</span>}
                            {h.measure_target && (
                              <span style={{ fontSize: 11, color: '#9AA0A6' }}>/ {h.measure_target}</span>
                            )}
                            {s === 'done' && <span style={{ fontSize: 16 }}>✅</span>}
                            {s === 'partial' && <span style={{ fontSize: 16 }}>🔶</span>}
                          </div>
                          <button onClick={() => { setMeasureInputs(p => ({ ...p, [h.id]: '' })); saveLog(h.id, today, '') }}
                            style={{ fontSize: 11, color: '#BDC1C6', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: 4 }}
                            title="Clear">✕</button>
                        </div>
                      )
                    }

                    return (
                      <div key={h.id} className="flex items-center gap-5 bg-[#f7f7f7] rounded-lg px-3 py-2.5">
                        <span className="text-[13px] font-medium flex-1">{h.name}</span>
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
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium tracking-[0.03em] uppercase border-2 transition-all ${active ? cfg.on : cfg.off}`}>
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
                      <span key={h.id} className="text-[11px] text-[#80868B] bg-[#f5f5f5] px-2 py-1 rounded-lg">
                        {h.name} · rest day
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* GRID VIEW */}
            {activeTab === 'grid' && (
              <div className="p-5 grid gap-5 max-w-5xl" style={{gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))'}}>
                {activeHabits.map((h, idx) => {
                  const isMeasure = h.habit_type === 'measure'

                  if (isMeasure) {
                    const { avg, total, best, daysLogged, daysHitTarget, pct } = measureStats(h)
                    return (
                      <div key={h.id} className="bg-white border border-[#E8EAED] rounded-lg p-5 hover:border-[#DADCE0] transition-colors">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="font-mono text-[10px] text-[#80868B]">#{idx+1}</span>
                          <span className="text-[13px] font-medium flex-1">{h.name}</span>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                            <div className="font-mono text-[18px] font-medium" style={{ color: '#FF5C00' }}>{pct}%</div>
                            <div style={{ fontSize: 9, color: '#9AA0A6', textTransform: 'uppercase', letterSpacing: '0.06em' }}>on target</div>
                          </div>
                        </div>
                        <div className="h-1 bg-[#efefef] rounded-full overflow-hidden mb-3">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: '#FF5C00' }} />
                        </div>
                        {/* Mini calendar squares — color = measure completion */}
                        <div className="flex flex-wrap gap-0.5 mb-3">
                          {days.map(d => {
                            const day = parseInt(d.split('-')[2])
                            const isToday = d === today
                            const dayScheduled = isScheduled(h.frequency, new Date(d+'T12:00:00'))
                            const val = getMeasureVal(h.id, d)
                            const color = !dayScheduled ? '#f3f3f3' : measureColor(val, h.measure_target)
                            const textColor = !dayScheduled ? '#e0e0e0' : val !== null ? 'white' : (isToday ? '#0A0A0A' : '#dedede')
                            return (
                              <div
                                key={d}
                                title={`${d}: ${val !== null ? `${val}${h.measure_unit ? ' ' + h.measure_unit : ''}` : 'not logged'}`}
                                className={`w-[18px] h-[18px] rounded-[3px] flex items-center justify-center font-mono text-[8px] ${isToday && val === null ? 'ring-1 ring-[#FF5C00]' : ''}`}
                                style={{ background: color, color: textColor }}
                              >
                                {dayScheduled ? day : '·'}
                              </div>
                            )
                          })}
                        </div>
                        <div className="flex gap-4 pt-2 border-t border-[#f7f7f7]">
                          {[
                            ['Avg', avg > 0 ? `${avg % 1 === 0 ? avg : avg.toFixed(1)}${h.measure_unit ? ' ' + h.measure_unit : ''}` : '—'],
                            ['Total', total > 0 ? `${total % 1 === 0 ? total : total.toFixed(1)}` : '—'],
                            ['Best', best > 0 ? `${best % 1 === 0 ? best : best.toFixed(1)}` : '—'],
                            ['Days', `${daysHitTarget}/${daysLogged}`],
                          ].map(([l,v])=>(
                            <div key={l as string}>
                              <div className="font-mono text-[13px] font-medium">{v}</div>
                              <div className="text-[8px] text-[#5F6368] uppercase tracking-[.08em] mt-0.5">{l}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  }

                  const { done, missed, streak, best, pct } = boolStats(h.id)
                  return (
                    <div key={h.id} className="bg-white border border-[#E8EAED] rounded-lg p-5 hover:border-[#DADCE0] transition-colors">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="font-mono text-[10px] text-[#80868B]">#{idx+1}</span>
                        <span className="text-[13px] font-medium flex-1">{h.name}</span>
                        <div className="text-right">
                          <div className="font-mono text-[18px] font-medium text-[#1A73E8]">{pct}%</div>
                          {streak > 0 && <div className="text-[11px] text-[#1A73E8]/70 font-medium">🔥 {streak}d</div>}
                        </div>
                      </div>
                      <div className="h-1 bg-[#efefef] rounded-full overflow-hidden mb-3">
                        <div className="h-full bg-[#1A73E8] rounded-full" style={{width:`${pct}%`}} />
                      </div>
                      <div className="flex flex-wrap gap-0.5 mb-3">
                        {days.map(d => {
                          const v = getStatus(h.id, d)
                          const day = parseInt(d.split('-')[2])
                          const isToday = d === today
                          const dayScheduled = isScheduled(h.frequency, new Date(d+'T12:00:00'))
                          return (
                            <button key={d}
                              title={`${d}: ${!dayScheduled ? 'rest day' : v || 'tap to log'}`}
                              onClick={() => dayScheduled && cycleStatus(h.id, d)}
                              className={`w-[18px] h-[18px] rounded-[3px] flex items-center justify-center font-mono text-[8px] transition-all cursor-pointer
                                ${!dayScheduled   ? 'bg-[#f3f3f3] text-[#e0e0e0] cursor-default'
                                : v==='done'       ? 'bg-[#1A73E8] text-white hover:scale-125'
                                : v==='missed'     ? 'bg-[#FBE9E7] text-[#8B0000] hover:scale-125'
                                : v==='na'         ? 'bg-[#f5f5f5] text-[#80868B] hover:scale-125'
                                : isToday          ? 'bg-[#f0f0f0] text-[#0A0A0A] ring-1 ring-[#1A73E8] hover:scale-125'
                                : 'bg-[#f7f7f7] text-[#dedede] hover:scale-125'}`}>
                              {dayScheduled ? day : '·'}
                            </button>
                          )
                        })}
                      </div>
                      <div className="flex gap-5 pt-2 border-t border-[#f7f7f7]">
                        {[['Done',done],['Missed',missed],['Streak',`${streak}d`],['Best',`${best}d`]].map(([l,v])=>(
                          <div key={l as string}>
                            <div className="font-mono text-[14px] font-medium">{v}</div>
                            <div className="text-[8px] text-[#5F6368] uppercase tracking-[.08em] mt-0.5">{l}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* ANALYTICS VIEW */}
            {activeTab === 'analytics' && (
              <div className="p-5 max-w-4xl">
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#202124', marginBottom: 4 }}>
                    {MONTHS[month]} {year} — Analytics
                  </div>
                  <div style={{ fontSize: 12, color: '#5F6368' }}>Detailed breakdown for all habits this month</div>
                </div>

                {activeHabits.map((h, idx) => {
                  const isMeasure = h.habit_type === 'measure'

                  if (isMeasure) {
                    const { avg, total, best, daysLogged, daysHitTarget, pct } = measureStats(h)
                    // Build daily chart data
                    const chartDays = days.slice(0, now.getDate())
                    const maxVal = Math.max(...chartDays.map(d => getMeasureVal(h.id, d) ?? 0), h.measure_target ?? 0, 1)

                    return (
                      <div key={h.id} style={{
                        background: '#FFFFFF', border: '1px solid #E8EAED', borderRadius: 12,
                        marginBottom: 16, overflow: 'hidden',
                      }}>
                        {/* Header */}
                        <div style={{ padding: '14px 18px 10px', borderBottom: '1px solid #F1F3F4', display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#80868B' }}>#{idx+1}</span>
                          <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{h.name}</span>
                          <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: '#FFF0E8', color: '#FF5C00', border: '1px solid #FFD4B8', fontWeight: 600 }}>
                            📏 {h.measure_target ? `${h.measure_target} ${h.measure_unit ?? ''} / day` : h.measure_unit ?? 'measure'}
                          </span>
                        </div>

                        {/* Stat cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 0 }}>
                          {[
                            { label: 'Days Hit Target', value: `${daysHitTarget}`, sub: `of ${daysLogged} logged` },
                            { label: 'On Target', value: `${pct}%`, sub: 'consistency' },
                            { label: 'Average', value: avg > 0 ? `${avg % 1 === 0 ? avg : avg.toFixed(1)}` : '—', sub: h.measure_unit ?? '' },
                            { label: 'Total', value: total > 0 ? `${total % 1 === 0 ? total : total.toFixed(1)}` : '—', sub: h.measure_unit ?? '' },
                            { label: 'Best Day', value: best > 0 ? `${best % 1 === 0 ? best : best.toFixed(1)}` : '—', sub: h.measure_unit ?? '' },
                          ].map((s, i) => (
                            <div key={i} style={{
                              padding: '12px 14px', borderRight: i < 4 ? '1px solid #F1F3F4' : 'none',
                              borderBottom: '1px solid #F1F3F4',
                            }}>
                              <div style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 700, color: '#FF5C00' }}>{s.value}</div>
                              <div style={{ fontSize: 10, color: '#9AA0A6', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>{s.label}</div>
                              {s.sub && <div style={{ fontSize: 10, color: '#BDC1C6', marginTop: 1 }}>{s.sub}</div>}
                            </div>
                          ))}
                        </div>

                        {/* Bar chart */}
                        <div style={{ padding: '14px 18px 16px' }}>
                          <div style={{ fontSize: 10, color: '#9AA0A6', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                            Daily values — {MONTHS[month]}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 64, position: 'relative' }}>
                            {/* Target line */}
                            {h.measure_target && (
                              <div style={{
                                position: 'absolute', left: 0, right: 0,
                                bottom: `${(h.measure_target / maxVal) * 64}px`,
                                borderTop: '1.5px dashed #FF5C00', opacity: 0.5, zIndex: 1,
                              }} />
                            )}
                            {days.map(d => {
                              const val = getMeasureVal(h.id, d)
                              const dayScheduled = isScheduled(h.frequency, new Date(d+'T12:00:00'))
                              const isFuture = d > today
                              const height = val !== null && maxVal > 0 ? Math.max(2, Math.round((val / maxVal) * 60)) : 0
                              const color = !dayScheduled ? '#f0f0f0'
                                : isFuture ? '#f0f0f0'
                                : val === null ? '#efefef'
                                : measureColor(val, h.measure_target)
                              return (
                                <div key={d} title={val !== null ? `${d}: ${val} ${h.measure_unit ?? ''}` : d}
                                  style={{
                                    flex: 1, borderRadius: '2px 2px 0 0',
                                    height: isFuture || val === null ? 3 : height,
                                    background: color, minWidth: 0,
                                    transition: 'height 0.2s',
                                  }}
                                />
                              )
                            })}
                          </div>
                          {/* Legend */}
                          <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                            {[
                              { color: '#22c55e', label: `≥ target (${h.measure_target ?? ''}${h.measure_unit ?? ''})` },
                              { color: '#f59e0b', label: '≥ 50% of target' },
                              { color: '#fca5a5', label: '< 50% of target' },
                            ].map(({ color, label }) => (
                              <div key={color} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <div style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
                                <span style={{ fontSize: 10, color: '#9AA0A6' }}>{label}</span>
                              </div>
                            ))}
                            {h.measure_target && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <div style={{ width: 14, borderTop: '1.5px dashed #FF5C00' }} />
                                <span style={{ fontSize: 10, color: '#9AA0A6' }}>target line</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  }

                  // Boolean analytics
                  const { done, missed, streak, best, pct } = boolStats(h.id)
                  const total = done + missed
                  const completionByWeek: { week: string; done: number; total: number }[] = []
                  for (let d = 0; d < days.length; d += 7) {
                    const slice = days.slice(d, d + 7)
                    const wDone = slice.filter(x => getStatus(h.id, x) === 'done').length
                    const wTotal = slice.filter(x => isScheduled(h.frequency, new Date(x+'T12:00:00')) && getStatus(h.id, x) !== 'na' && x <= today).length
                    completionByWeek.push({ week: `W${Math.floor(d/7)+1}`, done: wDone, total: wTotal })
                  }

                  return (
                    <div key={h.id} style={{
                      background: '#FFFFFF', border: '1px solid #E8EAED', borderRadius: 12,
                      marginBottom: 16, overflow: 'hidden',
                    }}>
                      <div style={{ padding: '14px 18px 10px', borderBottom: '1px solid #F1F3F4', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#80868B' }}>#{idx+1}</span>
                        <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{h.name}</span>
                        <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: '#F0F4FF', color: '#1A73E8', border: '1px solid #C8D5F5', fontWeight: 600 }}>
                          ✓ Yes/No
                        </span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 0 }}>
                        {[
                          { label: 'Done', value: `${done}`, sub: `of ${total} tracked` },
                          { label: 'Consistency', value: `${pct}%`, sub: 'done/tracked' },
                          { label: 'Missed', value: `${missed}`, sub: 'days' },
                          { label: 'Current Streak', value: `${streak}d`, sub: 'in a row' },
                          { label: 'Best Streak', value: `${best}d`, sub: 'this month' },
                        ].map((s, i) => (
                          <div key={i} style={{
                            padding: '12px 14px', borderRight: i < 4 ? '1px solid #F1F3F4' : 'none',
                            borderBottom: '1px solid #F1F3F4',
                          }}>
                            <div style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 700, color: '#1A73E8' }}>{s.value}</div>
                            <div style={{ fontSize: 10, color: '#9AA0A6', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>{s.label}</div>
                            {s.sub && <div style={{ fontSize: 10, color: '#BDC1C6', marginTop: 1 }}>{s.sub}</div>}
                          </div>
                        ))}
                      </div>
                      {/* Weekly bars */}
                      <div style={{ padding: '14px 18px 16px' }}>
                        <div style={{ fontSize: 10, color: '#9AA0A6', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                          Weekly completion
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 48 }}>
                          {completionByWeek.filter(w => w.total > 0).map((w) => {
                            const wpct = w.total > 0 ? Math.round(w.done / w.total * 100) : 0
                            const color = wpct >= 80 ? '#22c55e' : wpct >= 50 ? '#f59e0b' : '#ef4444'
                            return (
                              <div key={w.week} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                                <div style={{ width: '100%', background: '#f3f3f3', borderRadius: 4, height: 40, display: 'flex', alignItems: 'flex-end', overflow: 'hidden' }}>
                                  <div style={{ width: '100%', background: color, height: `${wpct}%`, borderRadius: 4, transition: 'height 0.3s' }} />
                                </div>
                                <div style={{ fontSize: 9, color: '#9AA0A6' }}>{w.week}</div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
