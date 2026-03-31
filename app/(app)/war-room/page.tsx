'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import DailyQuote from '@/components/DailyQuote'

const sb = createClient()

type Habit   = { id: string; name: string }
type HabitLog= { habit_id: string; status: string; date: string }
type Goal    = { id: string; title: string; category: string; end_date: string; pct: number }

const CAT_COLORS: Record<string,string> = {
  Health:'#22c55e', Mind:'#8b5cf6', Work:'#FF5C00',
  Relationships:'#ec4899', Finance:'#f59e0b', Spirit:'#06b6d4', Other:'#888'
}

function fmt(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function getMonday(d = new Date()) {
  const day=d.getDay(), diff=day===0?-6:1-day
  const m=new Date(d); m.setDate(d.getDate()+diff); m.setHours(0,0,0,0); return m
}

export default function WarRoomPage() {
  const now    = new Date()
  const today  = fmt(now)
  const weekStart = fmt(getMonday())

  const [habits, setHabits]       = useState<Habit[]>([])
  const [weekLogs, setWeekLogs]   = useState<HabitLog[]>([])
  const [goals, setGoals]         = useState<Goal[]>([])
  const [score, setScore]         = useState<number|null>(null)
  const [scoreBreakdown, setBreakdown] = useState({habits:0, tasks:0, goals:0})

  const load = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const uid = user.id

    // Week days up to today
    const weekDays: string[] = []
    for(let i=0;i<7;i++){
      const d=new Date(getMonday()); d.setDate(getMonday().getDate()+i)
      if(fmt(d)<=today) weekDays.push(fmt(d))
    }

    // Load habits + week logs
    const [{ data: habList }, { data: wLogs }] = await Promise.all([
      sb.from('habits').select('id,name').eq('user_id',uid).is('archived_at',null).order('position'),
      sb.from('habit_logs').select('habit_id,status,date').eq('user_id',uid).in('date',weekDays),
    ])
    setHabits((habList??[]).filter((h:{name:string})=>h.name))
    setWeekLogs(wLogs??[])

    // Goals + milestones
    const [{ data: goalsData }, { data: msData }] = await Promise.all([
      sb.from('six_month_goals').select('*').eq('user_id',uid).order('position'),
      sb.from('milestones').select('*').eq('user_id',uid),
    ])
    const goalsList = (goalsData??[]).map((g:{id:string;title:string;category:string;end_date:string}) => {
      const ms=(msData??[]).filter((m:{goal_id:string})=>m.goal_id===g.id)
      const done=ms.filter((m:{done:boolean})=>m.done).length
      return {id:g.id,title:g.title,category:g.category,end_date:g.end_date,pct:ms.length>0?Math.round(done/ms.length*100):0}
    })
    setGoals(goalsList)

    // ── Score calculation ────────────────────────────────
    // 1. Habits 33%: done/(done+missed) this week
    const allDone = (wLogs??[]).filter(l=>l.status==='done').length
    const allMissed = (wLogs??[]).filter(l=>l.status==='missed').length
    const habitPct = allDone+allMissed>0 ? Math.round(allDone/(allDone+allMissed)*100) : 100

    // 2. Tasks 33%: daily tasks today + weekly goals this week
    const [{ data: dailyTasks }, { data: weeklyGoals }] = await Promise.all([
      sb.from('tasks').select('done').eq('user_id',uid).eq('date',today),
      sb.from('weekly_goals').select('done').eq('user_id',uid).eq('week_start',weekStart),
    ])
    const dtTotal=(dailyTasks??[]).length, dtDone=(dailyTasks??[]).filter((t:{done:boolean})=>t.done).length
    const wgTotal=(weeklyGoals??[]).length, wgDone=(weeklyGoals??[]).filter((t:{done:boolean})=>t.done).length
    const totalTasks=dtTotal+wgTotal, doneTasks=dtDone+wgDone
    const taskPct = totalTasks>0 ? Math.round(doneTasks/totalTasks*100) : 100

    // 3. Goals 33%: milestones done/total
    const totalMs=(msData??[]).length
    const doneMs=(msData??[]).filter((m:{done:boolean})=>m.done).length
    const goalPct = totalMs>0 ? Math.round(doneMs/totalMs*100) : 100

    const final = Math.round((habitPct + taskPct + goalPct) / 3)
    setScore(final)
    setBreakdown({habits:habitPct, tasks:taskPct, goals:goalPct})
  }, [today, weekStart])

  useEffect(() => { load() }, [load])

  async function setHabitStatus(habitId: string, status: string) {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const current = weekLogs.find(l=>l.habit_id===habitId&&l.date===today)?.status??''
    const actual = current===status ? '' : status
    setWeekLogs(prev => {
      const without = prev.filter(l=>!(l.habit_id===habitId&&l.date===today))
      return actual==='' ? without : [...without,{habit_id:habitId,status:actual,date:today}]
    })
    if(actual==='') {
      await sb.from('habit_logs').delete().eq('user_id',user.id).eq('habit_id',habitId).eq('date',today)
    } else {
      await sb.from('habit_logs').upsert({user_id:user.id,habit_id:habitId,date:today,status:actual},{onConflict:'user_id,habit_id,date'})
    }
  }

  function getStreak(habitId: string): number {
    // Build a list of days from today backwards
    let streak = 0
    const d = new Date(now)
    while(true) {
      const ds = fmt(d)
      const log = weekLogs.find(l=>l.habit_id===habitId&&l.date===ds)
      if(!log) break
      if(log.status==='done') streak++
      else if(log.status==='missed') break
      // N/A: skip, don't break
      d.setDate(d.getDate()-1)
      if(d < getMonday()) break // only within week logs loaded
    }
    return streak
  }

  const scoreColor = score===null?'#888':score>=90?'#FF5C00':score>=75?'#22c55e':score>=50?'#f59e0b':'#ef4444'
  const scoreLabel = score===null?'—':score>=90?'LOCKED IN':score>=75?'SOLID':score>=50?'STRUGGLING':'FAILING'

  const todayLogs = weekLogs.filter(l=>l.date===today)
  const donedToday = todayLogs.filter(l=>l.status==='done').length
  const missedToday = todayLogs.filter(l=>l.status==='missed').length

  return (
    <div className="flex flex-col h-full">
      <DailyQuote />

      {/* Top bar */}
      <div className="bg-[#0A0A0A] px-6 py-3 flex items-center gap-4 flex-shrink-0 border-b border-[#1E1E1E]">
        <div>
          <div className="text-[20px] font-bold tracking-[.06em] text-white">WAR ROOM</div>
          <div className="text-[10px] text-[#555] tracking-[.15em] uppercase">
            {now.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})}
          </div>
        </div>

        {/* Score */}
        {score!==null && (
          <div className="ml-auto flex items-center gap-4">
            {/* Breakdown pills */}
            <div className="hidden sm:flex gap-2">
              {[['Habits',scoreBreakdown.habits],['Tasks',scoreBreakdown.tasks],['Goals',scoreBreakdown.goals]].map(([l,v])=>(
                <div key={l as string} className="text-center">
                  <div className="font-mono text-[14px] font-bold text-white leading-none">{v}%</div>
                  <div className="text-[8px] text-[#555] uppercase tracking-[.1em] mt-0.5">{l}</div>
                </div>
              ))}
            </div>
            <div className="w-px h-8 bg-[#2a2a2a] hidden sm:block"/>
            <div className="text-right">
              <div className="font-mono text-[34px] font-bold leading-none" style={{color:scoreColor}}>{score}</div>
              <div className="text-[9px] uppercase tracking-[.15em]" style={{color:scoreColor}}>{scoreLabel}</div>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto bg-[#f7f7f7]">
        <div className="p-4 grid gap-4 max-w-5xl" style={{gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))'}}>

          {/* HABITS TODAY */}
          {habits.length>0 && (
            <div className="bg-white border border-[#efefef] rounded-xl overflow-hidden shadow-sm">
              <div className="bg-[#0A0A0A] px-4 py-3 flex items-center justify-between">
                <span className="text-[11px] font-bold tracking-[.1em] text-white uppercase">Habits Today</span>
                <div className="flex items-center gap-2">
                  {missedToday>0 && <span className="text-[10px] font-bold text-[#ef4444]">{missedToday} missed</span>}
                  <span className="font-mono text-[13px] font-bold" style={{color:donedToday===habits.length?'#22c55e':'#FF5C00'}}>
                    {donedToday}/{habits.length}
                  </span>
                </div>
              </div>
              {habits.map(h => {
                const s = weekLogs.find(l=>l.habit_id===h.id&&l.date===today)?.status??''
                const streak = getStreak(h.id)
                return (
                  <div key={h.id} className="px-4 py-3 border-b border-[#f7f7f7] last:border-0 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold truncate">{h.name}</div>
                      {streak>0 && (
                        <div className="text-[9px] text-[#FF5C00] font-bold mt-0.5">🔥 {streak}d streak</div>
                      )}
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      {(['done','missed','na'] as const).map(status => {
                        const active = s===status
                        const cfg = {
                          done:   {lbl:'✓', on:'bg-[#22c55e] text-white border-[#22c55e]',  off:'border-[#e0e0e0] text-[#aaa] hover:border-[#22c55e] hover:text-[#22c55e]'},
                          missed: {lbl:'✗', on:'bg-[#ef4444] text-white border-[#ef4444]',  off:'border-[#e0e0e0] text-[#aaa] hover:border-[#ef4444] hover:text-[#ef4444]'},
                          na:     {lbl:'—', on:'bg-[#888] text-white border-[#888]',         off:'border-[#e0e0e0] text-[#ccc] hover:border-[#888] hover:text-[#888]'},
                        }[status]
                        return (
                          <button key={status} onClick={()=>setHabitStatus(h.id,status)}
                            className={`w-8 h-8 rounded-lg text-[12px] font-bold border-2 transition-all ${active?cfg.on:cfg.off}`}>
                            {cfg.lbl}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* GOALS */}
          {goals.length>0 && (
            <div className="bg-white border border-[#efefef] rounded-xl overflow-hidden shadow-sm">
              <div className="bg-[#0A0A0A] px-4 py-3 flex items-center justify-between">
                <span className="text-[11px] font-bold tracking-[.1em] text-white uppercase">Goals</span>
                <span className="text-[10px] text-[#888]">{scoreBreakdown.goals}% milestones done</span>
              </div>
              {goals.map(g => {
                const color = CAT_COLORS[g.category]??'#888'
                const daysLeft = Math.ceil((new Date(g.end_date).getTime()-Date.now())/86400000)
                return (
                  <div key={g.id} className="px-4 py-3 border-b border-[#f7f7f7] last:border-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background:color}}/>
                      <span className="text-[12px] font-semibold flex-1 truncate">{g.title}</span>
                      <span className="font-mono text-[12px] font-bold flex-shrink-0" style={{color}}>{g.pct}%</span>
                      <span className="text-[9px] text-[#aaa] font-mono flex-shrink-0">
                        {daysLeft>0?`${daysLeft}d left`:'ended'}
                      </span>
                    </div>
                    <div className="h-1.5 bg-[#f0f0f0] rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{width:`${g.pct}%`,background:color}}/>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Empty state */}
          {habits.length===0 && goals.length===0 && (
            <div className="col-span-full text-center py-16">
              <div className="text-4xl mb-4">⚔</div>
              <div className="text-[16px] font-bold mb-2">War Room is empty</div>
              <div className="text-[13px] text-[#888]">Add habits in Setup and goals in the Goals page.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
