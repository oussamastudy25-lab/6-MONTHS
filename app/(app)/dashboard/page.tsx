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

  if (!loaded) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5F6368', fontSize: 14, fontFamily: 'Roboto, sans-serif' }}>Loading…</div>

  const mdCard: React.CSSProperties = {
    background: '#FFFFFF', borderRadius: 12, border: '1px solid #E8EAED',
    overflow: 'hidden',
  }
  const mdCardHeader: React.CSSProperties = {
    padding: '12px 16px', borderBottom: '1px solid #E8EAED',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    background: '#FAFAFA',
  }
  const mdCardTitle: React.CSSProperties = {
    fontSize: 13, fontWeight: 600, color: '#202124',
    fontFamily: 'Google Sans, Roboto, sans-serif', letterSpacing: '-0.01em',
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: '#F8F9FA' }}>

      {/* Google-style page header */}
      <div style={{
        background: '#FFFFFF', borderBottom: '1px solid #E8EAED',
        padding: '16px 24px', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 400, color: '#202124', fontFamily: 'Google Sans, Roboto, sans-serif' }}>
            {greeting} 👋
          </div>
          <div style={{ fontSize: 12, color: '#5F6368', marginTop: 2, fontFamily: 'Roboto, sans-serif' }}>
            {now.toLocaleDateString('en-US', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
          </div>
        </div>
        <div style={{
          padding: '6px 14px', borderRadius: 20,
          background: '#FFF0E8', border: '1px solid #FFCCAA',
          fontSize: 12, fontWeight: 500, color: '#FF5C00',
          fontFamily: 'Roboto, sans-serif',
        }}>
          {habitsDone}/{scheduledHabits.length} habits done today
        </div>
      </div>

      <div style={{ padding: '20px 24px', maxWidth: 1100, display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* KPI strip — Google card style */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {([
            ['Habits Done', scheduledHabits.length > 0 ? `${habitsDone}/${scheduledHabits.length}` : '—', habitsDone===scheduledHabits.length&&scheduledHabits.length>0?'#34A853':'#FF5C00', habitsDone===scheduledHabits.length&&scheduledHabits.length>0?'#E6F4EA':'#FFF0E8', habitsDone===scheduledHabits.length&&scheduledHabits.length>0?'#137333':'#5C1B00', 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'],
            ['Focus Time',  todayFocusMins > 0 ? fmtMins(todayFocusMins) : '—', '#1A73E8', '#E8F0FE', '#174EA6', 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z'],
            ['Tasks',  todayTasks.length > 0 ? `${tasksDone}/${todayTasks.length}` : '—', tasksDone===todayTasks.length&&todayTasks.length>0?'#34A853':'#FF5C00', tasksDone===todayTasks.length&&todayTasks.length>0?'#E6F4EA':'#FFF0E8', tasksDone===todayTasks.length&&todayTasks.length>0?'#137333':'#5C1B00', 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4'],
            ['Wk Goals', wgoalItems.length > 0 ? `${wgoalsDone}/${wgoalItems.length}` : '—', wgoalsDone===wgoalItems.length&&wgoalItems.length>0?'#34A853':'#9334E6', wgoalsDone===wgoalItems.length&&wgoalItems.length>0?'#E6F4EA':'#F3E8FD', wgoalsDone===wgoalItems.length&&wgoalItems.length>0?'#137333':'#6B21A8', 'M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172'],
          ] as const).map(([l,v,accent,bg,textColor,iconPath]) => (
            <div key={l} style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E8EAED', padding: '16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d={iconPath} />
                  </svg>
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: accent, fontFamily: 'Google Sans, Roboto, sans-serif' }}>{v}</div>
              </div>
              <div style={{ fontSize: 12, color: '#5F6368', fontFamily: 'Roboto, sans-serif' }}>{l}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          {/* Habits quick-log */}
          <div style={mdCard}>
            <div style={mdCardHeader}>
              <span style={mdCardTitle}>Today's Habits</span>
              <span style={{ fontSize: 12, color: '#5F6368', fontFamily: 'Roboto, sans-serif' }}>{habitsLogged}/{scheduledHabits.length} logged</span>
            </div>
            <div>
              {scheduledHabits.length === 0 && (
                <div style={{ padding: '24px 16px', textAlign: 'center' }}>
                  <div style={{ fontSize: 13, color: '#80868B', marginBottom: 8, fontFamily: 'Roboto, sans-serif' }}>No habits set up yet</div>
                  <a href="/setup" style={{ fontSize: 12, color: '#FF5C00', textDecoration: 'none', fontWeight: 500 }}>Set up habits →</a>
                </div>
              )}
              {scheduledHabits.map((h, idx) => {
                const s = getStatus(h.id)
                return (
                  <div key={h.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 16px',
                    borderBottom: idx < scheduledHabits.length - 1 ? '1px solid #F1F3F4' : 'none',
                  }}>
                    <span style={{ fontSize: 13, fontFamily: 'Roboto, sans-serif', flex: 1, color: '#202124', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.name}</span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {(['done','missed','na'] as const).map(status => {
                        const active = s === status
                        const cfg = {
                          done:   { label:'✓', bg: active ? '#34A853' : '#F1F3F4', color: active ? 'white' : '#80868B' },
                          missed: { label:'✗', bg: active ? '#EA4335' : '#F1F3F4', color: active ? 'white' : '#80868B' },
                          na:     { label:'—', bg: active ? '#5F6368' : '#F1F3F4', color: active ? 'white' : '#80868B' },
                        }[status]
                        return (
                          <button key={status} onClick={() => toggleHabit(h.id, status)} style={{
                            width: 28, height: 28, borderRadius: 8,
                            background: cfg.bg, color: cfg.color,
                            border: 'none', cursor: 'pointer',
                            fontSize: 12, fontWeight: 600,
                            transition: 'background 0.12s',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {cfg.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
              {habits.filter(h => h.name && !isScheduled(h.frequency)).map(h => (
                <div key={h.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', opacity: 0.4, borderTop: '1px solid #F1F3F4' }}>
                  <span style={{ fontSize: 13, flex: 1, fontFamily: 'Roboto, sans-serif' }}>{h.name}</span>
                  <span style={{ fontSize: 11, color: '#80868B', background: '#F1F3F4', padding: '2px 8px', borderRadius: 12 }}>Rest day</span>
                </div>
              ))}
            </div>
          </div>

          {/* Tasks + weekly goals */}
          <div style={mdCard}>
            <div style={mdCardHeader}>
              <span style={mdCardTitle}>Tasks & Weekly Goals</span>
              <a href="/weekly" style={{ fontSize: 12, color: '#1A73E8', textDecoration: 'none', fontWeight: 500, fontFamily: 'Roboto, sans-serif' }}>Open Weekly →</a>
            </div>
            <div style={{ maxHeight: 280, overflowY: 'auto' }}>
              {todayTasks.length === 0 && wgoalItems.length === 0 && (
                <div style={{ padding: '24px 16px', textAlign: 'center' }}>
                  <div style={{ fontSize: 13, color: '#80868B', marginBottom: 8, fontFamily: 'Roboto, sans-serif' }}>No tasks for today</div>
                  <a href="/weekly" style={{ fontSize: 12, color: '#FF5C00', textDecoration: 'none', fontWeight: 500 }}>Add tasks →</a>
                </div>
              )}
              {todayTasks.map((t, idx) => (
                <div key={t.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 16px',
                  borderBottom: '1px solid #F1F3F4',
                }}>
                  <input type="checkbox" checked={t.done} onChange={e=>toggleTask(t.id,e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: '#FF5C00', cursor: 'pointer', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, flex: 1, fontFamily: 'Roboto, sans-serif', color: t.done ? '#80868B' : '#202124', textDecoration: t.done ? 'line-through' : 'none' }}>{t.text}</span>
                </div>
              ))}
              {wgoalItems.length > 0 && (
                <>
                  <div style={{ padding: '8px 16px', background: '#F8F9FA', borderTop: '1px solid #F1F3F4', borderBottom: '1px solid #F1F3F4' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#5F6368', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'Roboto, sans-serif' }}>Weekly Goals</span>
                  </div>
                  {wgoalItems.map(g => (
                    <div key={g.id} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 16px', borderBottom: '1px solid #F1F3F4',
                    }}>
                      <input type="checkbox" checked={g.done} onChange={e=>toggleWGoal(g.id,e.target.checked)}
                        style={{ width: 16, height: 16, accentColor: '#FF5C00', cursor: 'pointer', flexShrink: 0 }} />
                      <span style={{ fontSize: 13, flex: 1, fontFamily: 'Roboto, sans-serif', color: g.done ? '#80868B' : '#202124', textDecoration: g.done ? 'line-through' : 'none' }}>{g.text}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          {/* Focus today */}
          <div style={mdCard}>
            <div style={mdCardHeader}>
              <span style={mdCardTitle}>Focus Today</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: todayFocusMins>0?'#1A73E8':'#80868B', fontFamily: 'Roboto Mono, monospace' }}>{todayFocusMins>0?fmtMins(todayFocusMins):'—'}</span>
            </div>
            <div style={{ padding: 16 }}>
              {catTotals.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <div style={{ fontSize: 13, color: '#80868B', marginBottom: 8, fontFamily: 'Roboto, sans-serif' }}>No sessions today</div>
                  <a href="/timer" style={{ fontSize: 12, color: '#FF5C00', textDecoration: 'none', fontWeight: 500 }}>Start a session →</a>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {catTotals.map(c => {
                    const pct = todayFocusMins > 0 ? Math.round(c.mins/todayFocusMins*100) : 0
                    return (
                      <div key={c.id}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{ fontSize: 13, fontFamily: 'Roboto, sans-serif', color: '#202124' }}>{c.emoji} {c.name}</span>
                          <span style={{ fontSize: 12, color: '#5F6368', fontFamily: 'Roboto Mono, monospace' }}>{fmtMins(c.mins)}</span>
                        </div>
                        <div style={{ height: 6, background: '#F1F3F4', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', borderRadius: 3, background: c.color, width: `${pct}%`, transition: 'width 0.6s cubic-bezier(0.2,0,0,1)' }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Today's schedule */}
          <div style={mdCard}>
            <div style={mdCardHeader}>
              <span style={mdCardTitle}>Today's Schedule</span>
              <a href="/calendar" style={{ fontSize: 12, color: '#1A73E8', textDecoration: 'none', fontWeight: 500, fontFamily: 'Roboto, sans-serif' }}>Open Calendar →</a>
            </div>
            <div style={{ maxHeight: 220, overflowY: 'auto' }}>
              {blocks.length === 0 && (
                <div style={{ padding: '24px 16px', textAlign: 'center' }}>
                  <div style={{ fontSize: 13, color: '#80868B', marginBottom: 8, fontFamily: 'Roboto, sans-serif' }}>No events today</div>
                  <a href="/calendar" style={{ fontSize: 12, color: '#FF5C00', textDecoration: 'none', fontWeight: 500 }}>Open Calendar →</a>
                </div>
              )}
              {blocks.map((b, idx) => {
                const isCurrent = b.start_minutes <= nowMins && b.end_minutes > nowMins
                const isPast    = b.end_minutes <= nowMins
                return (
                  <div key={b.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 16px',
                    borderBottom: idx < blocks.length - 1 ? '1px solid #F1F3F4' : 'none',
                    background: isCurrent ? '#FFF8F5' : 'transparent',
                  }}>
                    <div style={{ width: 3, height: 36, borderRadius: 2, flexShrink: 0, background: b.color, opacity: isPast ? 0.3 : 1 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontFamily: 'Roboto, sans-serif', color: isPast ? '#80868B' : '#202124' }}>{b.title}</div>
                      <div style={{ fontSize: 11, color: '#80868B', fontFamily: 'Roboto Mono, monospace', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {minsToLabel(b.start_minutes)} – {minsToLabel(b.end_minutes)}
                        {isCurrent && <span style={{ color: '#FF5C00', fontWeight: 700, fontSize: 10, background: '#FFF0E8', padding: '1px 6px', borderRadius: 8 }}>NOW</span>}
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
          <div style={mdCard}>
            <div style={mdCardHeader}>
              <span style={mdCardTitle}>Active Goals</span>
              <a href="/goals" style={{ fontSize: 12, color: '#1A73E8', textDecoration: 'none', fontWeight: 500, fontFamily: 'Roboto, sans-serif' }}>View all →</a>
            </div>
            <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
              {goals.filter(g=>!g.archived).map(g => {
                const ms   = g.milestones ?? []
                const pct  = ms.length > 0 ? Math.round(ms.filter(m=>m.done).length/ms.length*100) : 0
                const color= CAT_COLORS[g.category] ?? '#888'
                return (
                  <div key={g.id} style={{
                    border: '1px solid #E8EAED', borderRadius: 10, padding: 14,
                    transition: 'box-shadow 0.15s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 6px rgba(60,64,67,0.15)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'none' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                      <span style={{ fontSize: 13, fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'Roboto, sans-serif', color: '#202124' }}>{g.title}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color, fontFamily: 'Roboto Mono, monospace' }}>{pct}%</span>
                    </div>
                    <div style={{ height: 4, background: '#F1F3F4', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', background: color, borderRadius: 2, width: `${pct}%` }} />
                    </div>
                    <div style={{ fontSize: 11, color: '#80868B', marginTop: 6, fontFamily: 'Roboto, sans-serif' }}>{ms.filter(m=>m.done).length}/{ms.length} milestones</div>
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