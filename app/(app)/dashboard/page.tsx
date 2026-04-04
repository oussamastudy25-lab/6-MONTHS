'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

const sb = createClient()

type Habit    = { id: string; name: string; frequency: string }
type Log      = { habit_id: string; status: string; date: string }
type Task     = { id: string; text: string; done: boolean }
type WGoal    = { id: string; text: string; done: boolean }
type Session  = { category_id: string; duration_minutes: number; ended_at: string|null }
type Category = { id: string; name: string; color: string; emoji: string }
type Goal     = { id: string; title: string; category: string; archived: boolean; milestones: {done:boolean}[] }
type Block    = { id: string; title: string; start_minutes: number; end_minutes: number; color: string }

function fmt(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function getMon(d = new Date()) {
  const day=d.getDay(), diff=day===0?-6:1-day
  const m=new Date(d); m.setDate(d.getDate()+diff); m.setHours(0,0,0,0); return m
}
function fmtMins(m: number) {
  if (m === 0) return '0m'
  const h = Math.floor(m/60), min = m%60
  return h > 0 ? `${h}h${min > 0 ? ` ${min}m` : ''}` : `${min}m`
}
function minsToLabel(m: number) {
  return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`
}
function isScheduled(frequency: string, d = new Date()) {
  const dow = d.getDay()
  if (frequency === 'weekdays') return dow >= 1 && dow <= 5
  if (frequency === 'weekends') return dow === 0 || dow === 6
  if (frequency === '3x') return [1, 3, 5].includes(dow)
  return true // daily
}

const CAT_COLORS: Record<string,string> = {
  Health:'#22c55e', Mind:'#8b5cf6', Work:'#FF5C00',
  Relationships:'#ec4899', Finance:'#f59e0b', Spirit:'#06b6d4', Other:'#888'
}

export default function DashboardPage() {
  const now      = new Date()
  const today    = fmt(now)
  const weekStart= fmt(getMon())
  const hour     = now.getHours()
  const greeting = hour < 5 ? 'Still up?' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const nowMins  = hour * 60 + now.getMinutes()

  const [habits,     setHabits]     = useState<Habit[]>([])
  const [logs,       setLogs]       = useState<Log[]>([])
  const [tasks,      setTasks]      = useState<Task[]>([])
  const [wgoals,     setWgoals]     = useState<WGoal[]>([])
  const [sessions,   setSessions]   = useState<Session[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [goals,      setGoals]      = useState<Goal[]>([])
  const [blocks,     setBlocks]     = useState<Block[]>([])
  const [loaded,     setLoaded]     = useState(false)

  const load = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const [
      { data: h }, { data: l }, { data: t }, { data: wg },
      { data: sess }, { data: cats }, { data: g }, { data: ms }, { data: bl }
    ] = await Promise.all([
      sb.from('habits').select('id,name,frequency').eq('user_id', user.id).is('archived_at', null).order('position'),
      sb.from('habit_logs').select('habit_id,status,date').eq('user_id', user.id).eq('date', today),
      sb.from('tasks').select('id,text,done').eq('user_id', user.id).eq('date', today).order('position'),
      sb.from('weekly_goals').select('id,text,done').eq('user_id', user.id).eq('week_start', weekStart).order('position'),
      sb.from('focus_sessions').select('category_id,duration_minutes,ended_at').eq('user_id', user.id).eq('date', today),
      sb.from('focus_categories').select('id,name,color,emoji').eq('user_id', user.id),
      sb.from('six_month_goals').select('id,title,category,archived').eq('user_id', user.id).eq('archived', false).order('position'),
      sb.from('milestones').select('goal_id,done').eq('user_id', user.id),
      sb.from('schedule_blocks').select('id,title,start_minutes,end_minutes,color').eq('user_id', user.id).eq('date', today),
    ])
    const goalList = (g??[]).map((goal: {id:string;title:string;category:string;archived:boolean}) => ({
      ...goal,
      milestones: (ms??[]).filter((m:{goal_id:string}) => m.goal_id === goal.id)
    }))
    setHabits(h??[]); setLogs(l??[]); setTasks(t??[]); setWgoals(wg??[])
    setSessions(sess??[]); setCategories(cats??[]); setGoals(goalList)
    setBlocks((bl??[]).sort((a:{start_minutes:number},b:{start_minutes:number}) => a.start_minutes - b.start_minutes))
    setLoaded(true)
  }, [today, weekStart])

  useEffect(() => { load() }, [load])

  function getStatus(hid: string) { return logs.find(l => l.habit_id === hid)?.status ?? '' }

  async function toggleHabit(hid: string, status: string) {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const cur = getStatus(hid)
    const next = cur === status ? '' : status
    setLogs(prev => {
      const without = prev.filter(l => l.habit_id !== hid)
      return next === '' ? without : [...without, { habit_id: hid, status: next, date: today }]
    })
    if (next === '') {
      await sb.from('habit_logs').delete().eq('user_id', user.id).eq('habit_id', hid).eq('date', today)
    } else {
      await sb.from('habit_logs').upsert({ user_id: user.id, habit_id: hid, date: today, status: next }, { onConflict: 'user_id,habit_id,date' })
    }
  }

  async function toggleTask(id: string, done: boolean) {
    setTasks(prev => prev.map(t => t.id===id ? {...t,done} : t))
    await sb.from('tasks').update({ done }).eq('id', id)
  }
  async function toggleWGoal(id: string, done: boolean) {
    setWgoals(prev => prev.map(g => g.id===id ? {...g,done} : g))
    await sb.from('weekly_goals').update({ done }).eq('id', id)
  }

  // Computed stats
  const scheduledHabits = habits.filter(h => h.name && isScheduled(h.frequency))
  const habitsDone      = scheduledHabits.filter(h => getStatus(h.id) === 'done').length
  const habitsLogged    = scheduledHabits.filter(h => getStatus(h.id) !== '').length
  const todayFocusMins  = sessions.filter(s => s.ended_at).reduce((a,s) => a + s.duration_minutes, 0)
  const todayTasks      = tasks.filter(t => t.text)
  const tasksDone       = todayTasks.filter(t => t.done).length
  const wgoalItems      = wgoals.filter(g => g.text)
  const wgoalsDone      = wgoalItems.filter(g => g.done).length
  const catTotals       = categories
    .map(c => ({ ...c, mins: sessions.filter(s => s.category_id===c.id && s.ended_at).reduce((a,s) => a+s.duration_minutes, 0) }))
    .filter(c => c.mins > 0).sort((a,b) => b.mins - a.mins)
  const upcomingBlocks  = blocks.filter(b => b.end_minutes > nowMins)

  if (!loaded) return <div className="flex-1 flex items-center justify-center text-[#888] text-[13px]">Loading…</div>

  return (
    <div className="flex-1 overflow-y-auto bg-[#fafafa]">
      {/* Header */}
      <div className="bg-white px-6 py-4 border-b-2 border-[#0A0A0A] flex-shrink-0">
        <div className="text-[20px] font-bold">{greeting} 👋</div>
        <div className="text-[11px] text-[#888] mt-0.5 tracking-[.04em]">
          {now.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
        </div>
      </div>

      <div className="p-5 space-y-4 max-w-5xl">

        {/* KPI strip */}
        <div className="grid grid-cols-4 gap-3">
          {([
            ['Habits', scheduledHabits.length > 0 ? `${habitsDone}/${scheduledHabits.length}` : '—', habitsDone===scheduledHabits.length&&scheduledHabits.length>0?'#22c55e':'#FF5C00'],
            ['Focus',  todayFocusMins > 0 ? fmtMins(todayFocusMins) : '—', '#FF5C00'],
            ['Tasks',  todayTasks.length > 0 ? `${tasksDone}/${todayTasks.length}` : '—', tasksDone===todayTasks.length&&todayTasks.length>0?'#22c55e':'#FF5C00'],
            ['Wk Goals',wgoalItems.length > 0 ? `${wgoalsDone}/${wgoalItems.length}` : '—', wgoalsDone===wgoalItems.length&&wgoalItems.length>0?'#22c55e':'#FF5C00'],
          ] as const).map(([l,v,c]) => (
            <div key={l} className="bg-[#0A0A0A] rounded-xl px-4 py-3">
              <div className="font-mono text-[22px] font-bold leading-none" style={{color:c}}>{v}</div>
              <div className="text-[9px] text-[#555] uppercase tracking-[.12em] mt-1.5">{l}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Habits quick-log */}
          <div className="bg-white border border-[#efefef] rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-[#0A0A0A] flex items-center justify-between">
              <span className="text-[11px] font-bold text-white uppercase tracking-[.08em]">Today's Habits</span>
              <span className="text-[10px] text-[#555] font-mono">{habitsLogged}/{scheduledHabits.length} logged</span>
            </div>
            <div className="divide-y divide-[#f7f7f7]">
              {scheduledHabits.length === 0 && (
                <div className="px-4 py-6 text-center">
                  <div className="text-[12px] text-[#bcbcbc] mb-2">No habits set up yet</div>
                  <a href="/setup" className="text-[10px] font-bold text-[#FF5C00] hover:underline">→ Add habits in Setup</a>
                </div>
              )}
              {scheduledHabits.map(h => {
                const s = getStatus(h.id)
                return (
                  <div key={h.id} className="flex items-center gap-2 px-3 py-2">
                    <span className="text-[12px] font-medium flex-1 truncate">{h.name}</span>
                    <div className="flex gap-1">
                      {(['done','missed','na'] as const).map(status => {
                        const active = s === status
                        const cfg = {
                          done:   { label:'✓', on:'bg-[#22c55e] text-white', off:'bg-[#f0f0f0] text-[#aaa] hover:text-[#22c55e]' },
                          missed: { label:'✗', on:'bg-[#ef4444] text-white', off:'bg-[#f0f0f0] text-[#aaa] hover:text-[#ef4444]' },
                          na:     { label:'—', on:'bg-[#888] text-white',    off:'bg-[#f0f0f0] text-[#aaa] hover:text-[#555]' },
                        }[status]
                        return (
                          <button key={status} onClick={() => toggleHabit(h.id, status)}
                            className={`w-7 h-7 rounded-md text-[11px] font-bold transition-all ${active ? cfg.on : cfg.off}`}>
                            {cfg.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
              {habits.filter(h => h.name && !isScheduled(h.frequency)).map(h => (
                <div key={h.id} className="flex items-center gap-2 px-3 py-2 opacity-40">
                  <span className="text-[12px] flex-1 truncate">{h.name}</span>
                  <span className="text-[9px] text-[#888] uppercase tracking-[.06em]">rest day</span>
                </div>
              ))}
            </div>
          </div>

          {/* Tasks + weekly goals */}
          <div className="bg-white border border-[#efefef] rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-[#0A0A0A] flex items-center justify-between">
              <span className="text-[11px] font-bold text-white uppercase tracking-[.08em]">Tasks & Goals</span>
              <a href="/weekly" className="text-[9px] text-[#555] hover:text-[#FF5C00] transition-colors uppercase tracking-[.08em]">→ Weekly</a>
            </div>
            <div className="divide-y divide-[#f7f7f7] max-h-[260px] overflow-y-auto">
              {todayTasks.length === 0 && wgoalItems.length === 0 && (
                <div className="px-4 py-6 text-center">
                  <div className="text-[12px] text-[#bcbcbc] mb-2">No tasks for today</div>
                  <a href="/weekly" className="text-[10px] font-bold text-[#FF5C00] hover:underline">→ Add tasks in Weekly</a>
                </div>
              )}
              {todayTasks.map(t => (
                <div key={t.id} className="flex items-center gap-2.5 px-4 py-2">
                  <input type="checkbox" checked={t.done} onChange={e=>toggleTask(t.id,e.target.checked)}
                    className="w-[13px] h-[13px] accent-[#FF5C00] cursor-pointer flex-shrink-0" />
                  <span className={`text-[12px] flex-1 ${t.done?'line-through text-[#bcbcbc]':''}`}>{t.text}</span>
                </div>
              ))}
              {wgoalItems.length > 0 && (
                <>
                  <div className="px-4 py-1.5 bg-[#f9f9f9]">
                    <span className="text-[9px] font-bold text-[#bcbcbc] uppercase tracking-[.1em]">Weekly Goals</span>
                  </div>
                  {wgoalItems.map(g => (
                    <div key={g.id} className="flex items-center gap-2.5 px-4 py-2">
                      <input type="checkbox" checked={g.done} onChange={e=>toggleWGoal(g.id,e.target.checked)}
                        className="w-[13px] h-[13px] accent-[#FF5C00] cursor-pointer flex-shrink-0" />
                      <span className={`text-[12px] flex-1 ${g.done?'line-through text-[#bcbcbc]':''}`}>{g.text}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Focus + Schedule */}
        <div className="grid grid-cols-2 gap-4">
          {/* Focus today */}
          <div className="bg-white border border-[#efefef] rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-[#0A0A0A] flex items-center justify-between">
              <span className="text-[11px] font-bold text-white uppercase tracking-[.08em]">Focus Today</span>
              <span className="font-mono text-[11px] font-bold" style={{color:todayFocusMins>0?'#FF5C00':'#555'}}>{todayFocusMins>0?fmtMins(todayFocusMins):'—'}</span>
            </div>
            <div className="p-4">
              {catTotals.length === 0 ? (
                <div className="text-center py-4">
                  <div className="text-[12px] text-[#bcbcbc] mb-2">No sessions today</div>
                  <a href="/timer" className="text-[10px] font-bold text-[#FF5C00] hover:underline">→ Start a session</a>
                </div>
              ) : (
                <div className="space-y-3">
                  {catTotals.map(c => {
                    const pct = todayFocusMins > 0 ? Math.round(c.mins/todayFocusMins*100) : 0
                    return (
                      <div key={c.id}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[12px] font-medium">{c.emoji} {c.name}</span>
                          <span className="font-mono text-[11px] text-[#888]">{fmtMins(c.mins)}</span>
                        </div>
                        <div className="h-1.5 bg-[#efefef] rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{width:`${pct}%`,background:c.color}} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Today's schedule */}
          <div className="bg-white border border-[#efefef] rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-[#0A0A0A] flex items-center justify-between">
              <span className="text-[11px] font-bold text-white uppercase tracking-[.08em]">Today's Schedule</span>
              <a href="/calendar" className="text-[9px] text-[#555] hover:text-[#FF5C00] transition-colors uppercase tracking-[.08em]">→ Calendar</a>
            </div>
            <div className="divide-y divide-[#f7f7f7] max-h-[200px] overflow-y-auto">
              {blocks.length === 0 && (
                <div className="px-4 py-6 text-center">
                  <div className="text-[12px] text-[#bcbcbc] mb-2">No events today</div>
                  <a href="/calendar" className="text-[10px] font-bold text-[#FF5C00] hover:underline">→ Open Calendar</a>
                </div>
              )}
              {blocks.map(b => {
                const isCurrent = b.start_minutes <= nowMins && b.end_minutes > nowMins
                const isPast    = b.end_minutes <= nowMins
                return (
                  <div key={b.id} className={`flex items-center gap-3 px-4 py-2.5 ${isCurrent?'bg-[#FFF8F5]':''}`}>
                    <div className="w-1 h-8 rounded-full flex-shrink-0" style={{background:b.color,opacity:isPast?0.3:1}} />
                    <div>
                      <div className={`text-[12px] font-medium ${isPast?'text-[#bcbcbc]':''}`}>{b.title}</div>
                      <div className="text-[9px] text-[#aaa] font-mono mt-0.5 flex items-center gap-1.5">
                        {minsToLabel(b.start_minutes)} – {minsToLabel(b.end_minutes)}
                        {isCurrent && <span className="text-[#FF5C00] font-bold">NOW</span>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Active 6M Goals */}
        {goals.filter(g=>!g.archived).length > 0 && (
          <div className="bg-white border border-[#efefef] rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-[#0A0A0A] flex items-center justify-between">
              <span className="text-[11px] font-bold text-white uppercase tracking-[.08em]">Active Goals</span>
              <a href="/goals" className="text-[9px] text-[#555] hover:text-[#FF5C00] transition-colors uppercase tracking-[.08em]">→ Goals</a>
            </div>
            <div className="p-4 grid gap-3" style={{gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))'}}>
              {goals.filter(g=>!g.archived).map(g => {
                const ms   = g.milestones ?? []
                const pct  = ms.length > 0 ? Math.round(ms.filter(m=>m.done).length/ms.length*100) : 0
                const color= CAT_COLORS[g.category] ?? '#888'
                return (
                  <div key={g.id} className="border border-[#efefef] rounded-lg p-3 hover:border-[#dedede] transition-colors">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background:color}} />
                      <span className="text-[12px] font-bold flex-1 truncate">{g.title}</span>
                      <span className="font-mono text-[12px] font-bold text-[#FF5C00]">{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-[#efefef] rounded-full overflow-hidden">
                      <div className="h-full bg-[#FF5C00] rounded-full" style={{width:`${pct}%`}} />
                    </div>
                    <div className="text-[9px] text-[#bcbcbc] mt-1.5">{ms.filter(m=>m.done).length}/{ms.length} milestones</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
