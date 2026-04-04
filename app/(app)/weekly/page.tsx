'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

type WGoal = { id: string; text: string; done: boolean; position: number; week_start: string }
type Task  = { id: string; text: string; done: boolean; position: number; date: string }

const sb = createClient()
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DOW    = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

function getMon(d = new Date()) {
  const day=d.getDay(),diff=day===0?-6:1-day
  const m=new Date(d);m.setDate(d.getDate()+diff);m.setHours(0,0,0,0);return m
}
function fmt(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function weekLabel(mon: Date) {
  const sun=new Date(mon);sun.setDate(sun.getDate()+6)
  return `${mon.getDate()} ${MONTHS[mon.getMonth()].slice(0,3)} – ${sun.getDate()} ${MONTHS[sun.getMonth()].slice(0,3)}`
}
function weeksForMonth(y: number, m: number) {
  const first=new Date(y,m,1),last=new Date(y,m+1,0)
  const weeks:Date[]=[],cur=getMon(first)
  while(cur<=last){weeks.push(new Date(cur));cur.setDate(cur.getDate()+7)}
  return weeks
}
function weekDays(monStr: string): string[] {
  const mon = new Date(monStr)
  return Array.from({length:7}, (_,i) => { const d=new Date(mon);d.setDate(mon.getDate()+i);return fmt(d) })
}

function TextInput({ defaultValue, onSave, placeholder, done }: {
  defaultValue: string; onSave: (val: string) => void; placeholder: string; done?: boolean
}) {
  return (
    <input
      className={`flex-1 bg-transparent border-none outline-none text-[12.5px] ${done ? 'line-through text-[#bcbcbc]' : 'text-[#0A0A0A]'}`}
      defaultValue={defaultValue}
      placeholder={placeholder}
      onBlur={e => { if (e.target.value !== defaultValue) onSave(e.target.value) }}
    />
  )
}

export default function WeeklyPage() {
  const now = new Date()
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [weekMon, setWeekMon] = useState(() => fmt(getMon()))
  // All data loaded once
  const [allWgoals, setAllWgoals] = useState<WGoal[]>([])
  const [allTasks, setAllTasks]   = useState<Task[]>([])
  const [loaded, setLoaded] = useState(false)

  const weeks = weeksForMonth(year, month)
  const today = fmt()

  // Load ALL data once on mount
  const load = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const [{ data: wg }, { data: ts }] = await Promise.all([
      sb.from('weekly_goals').select('*').eq('user_id', user.id).order('position'),
      sb.from('tasks').select('*').eq('user_id', user.id).order('position'),
    ])
    setAllWgoals(wg ?? [])
    setAllTasks(ts ?? [])
    setLoaded(true)
  }, [])

  useEffect(() => { load() }, [load])

  // Derive from memory — no re-fetch on week switch
  const wgoals = allWgoals.filter(g => g.week_start === weekMon)
  const days = weekDays(weekMon)
  const tasksByDay: Record<string, Task[]> = {}
  days.forEach(d => { tasksByDay[d] = allTasks.filter(t => t.date === d) })

  // Weekly goals
  async function addWGoal() {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const { data } = await sb.from('weekly_goals').insert({ user_id:user.id, week_start:weekMon, text:'', done:false, position:wgoals.length }).select().single()
    if (data) setAllWgoals(g => [...g, {...data, week_start: weekMon}])
  }
  async function saveWGoalText(id: string, text: string) {
    if (!text.trim()) return // don't save empty
    setAllWgoals(g => g.map(x => x.id===id ? {...x,text} : x))
    await sb.from('weekly_goals').update({ text }).eq('id', id)
  }
  async function toggleWGoal(id: string, done: boolean) {
    setAllWgoals(g => g.map(x => x.id===id ? {...x,done} : x))
    await sb.from('weekly_goals').update({ done }).eq('id', id)
  }
  async function deleteWGoal(id: string) {
    await sb.from('weekly_goals').delete().eq('id', id)
    setAllWgoals(g => g.filter(x => x.id!==id))
  }

  // Tasks
  async function addTask(date: string) {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const existing = allTasks.filter(t => t.date === date)
    const { data } = await sb.from('tasks').insert({ user_id:user.id, date, text:'', done:false, position:existing.length }).select().single()
    if (data) setAllTasks(t => [...t, data])
  }
  async function saveTaskText(id: string, text: string) {
    if (!text.trim()) {
      // delete empty tasks on blur
      await sb.from('tasks').delete().eq('id', id)
      setAllTasks(t => t.filter(x => x.id !== id))
      return
    }
    setAllTasks(t => t.map(x => x.id===id ? {...x,text} : x))
    await sb.from('tasks').update({ text }).eq('id', id)
  }
  async function toggleTask(id: string, done: boolean) {
    setAllTasks(t => t.map(x => x.id===id ? {...x,done} : x))
    await sb.from('tasks').update({ done }).eq('id', id)
  }
  async function deleteTask(id: string) {
    await sb.from('tasks').delete().eq('id', id)
    setAllTasks(t => t.filter(x => x.id!==id))
  }

  return (
    <>
      <div className="bg-white px-6 py-3 border-b-2 border-[#0A0A0A] flex-shrink-0">
        <div className="text-[19px] font-bold tracking-[.04em]">Weekly</div>
        <div className="text-[10px] text-[#888] tracking-[.12em] uppercase mt-0.5">Goals + daily tasks</div>
      </div>

      <div className="flex items-center gap-2 px-6 py-2 bg-[#f7f7f7] border-b border-[#efefef] flex-shrink-0">
        <button onClick={() => { if(month===0){setMonth(11);setYear(y=>y-1)}else setMonth(m=>m-1) }}
          className="w-6 h-6 border border-[#dedede] rounded flex items-center justify-center text-[14px] text-[#888] hover:bg-[#0A0A0A] hover:text-white hover:border-[#0A0A0A] transition-colors">‹</button>
        <span className="text-[13px] font-bold tracking-[.04em] min-w-[140px] text-center">{MONTHS[month]} {year}</span>
        <button onClick={() => { if(month===11){setMonth(0);setYear(y=>y+1)}else setMonth(m=>m+1) }}
          className="w-6 h-6 border border-[#dedede] rounded flex items-center justify-center text-[14px] text-[#888] hover:bg-[#0A0A0A] hover:text-white hover:border-[#0A0A0A] transition-colors">›</button>
        <button onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); setWeekMon(fmt(getMon())) }}
          className="text-[9px] font-bold uppercase tracking-[.1em] px-3 py-1 rounded border border-[#dedede] text-[#888] hover:bg-[#FF5C00] hover:text-white hover:border-[#FF5C00] transition-colors">Today</button>
      </div>

      <div className="flex gap-1.5 px-6 pt-3 pb-0 flex-shrink-0 flex-wrap">
        {weeks.map(w => {
          const wk = fmt(w), on = wk === weekMon
          return (
            <button key={wk} onClick={() => setWeekMon(wk)}
              className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-[.08em] border transition-all ${on?'bg-[#0A0A0A] text-white border-[#0A0A0A]':'bg-[#f7f7f7] text-[#888] border-[#efefef] hover:bg-[#efefef] hover:text-[#0A0A0A]'}`}>
              {weekLabel(w)}
            </button>
          )
        })}
      </div>

      {!loaded ? (
        <div className="flex-1 flex items-center justify-center text-[13px] text-[#888]">Loading…</div>
      ) : (
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Weekly goals */}
          <div className="border border-[#efefef] rounded-lg overflow-hidden mb-5">
            <div className="bg-[#0A0A0A] px-4 py-2.5 flex items-center justify-between">
              <span className="text-[11px] font-bold tracking-[.08em] text-white uppercase">Weekly Goals</span>
              <span className="text-[10px] text-[#555] font-mono">{weekLabel(new Date(weekMon))}</span>
            </div>
            <div className="bg-white">
              {wgoals.map((g, i) => (
                <div key={g.id} className="flex items-center gap-1.5 bg-white border-b border-[#f7f7f7] last:border-0 px-3 h-10 focus-within:bg-[#fafafa] transition-colors">
                  <input type="checkbox" checked={g.done} onChange={e => toggleWGoal(g.id, e.target.checked)}
                    className="w-[13px] h-[13px] accent-[#FF5C00] cursor-pointer flex-shrink-0" />
                  <span className="font-mono text-[9.5px] text-[#bcbcbc] min-w-[13px]">{i+1}</span>
                  <div className="w-px h-[16px] bg-[#efefef] flex-shrink-0" />
                  <TextInput key={g.id} defaultValue={g.text} placeholder="Weekly goal…" done={g.done} onSave={val => saveWGoalText(g.id, val)} />
                  <button onClick={() => deleteWGoal(g.id)} className="w-5 h-5 flex items-center justify-center text-[11px] text-[#bcbcbc] hover:text-[#8B0000] transition-colors flex-shrink-0">×</button>
                </div>
              ))}
              <div className="px-3 py-2">
                <button onClick={addWGoal}
                  className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded border border-dashed border-[#dedede] text-[9px] font-bold uppercase tracking-[.08em] text-[#888] hover:border-[#FF5C00] hover:text-[#FF5C00] hover:bg-[#FFF0E8] transition-colors">
                  ＋ Add weekly goal
                </button>
              </div>
            </div>
          </div>

          {/* Daily tasks grid */}
          <div className="text-[9px] font-bold text-[#bcbcbc] tracking-[.16em] uppercase mb-3">Daily Tasks</div>
          <div className="grid gap-2" style={{gridTemplateColumns:'repeat(auto-fill,minmax(250px,1fr))'}}>
            {days.map(ds => {
              const d = new Date(ds)
              const dow = d.getDay()
              const isWknd = dow===0||dow===6
              const isToday = ds===today
              const dayTasks = tasksByDay[ds] ?? []
              const done = dayTasks.filter(t => t.done && t.text).length
              const total = dayTasks.filter(t => t.text).length
              return (
                <div key={ds} className={`border rounded-lg overflow-hidden ${isToday?'border-[#FF5C00] border-2':'border-[#efefef]'}`}>
                  <div className={`px-3 py-2 flex items-center justify-between ${isWknd?'bg-[#1E1E1E]':'bg-[#0A0A0A]'}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold tracking-[.1em] text-white uppercase">{DOW[dow]}</span>
                      {isToday && <span className="text-[8px] bg-[#FF5C00] text-white px-1.5 py-0.5 rounded font-bold uppercase tracking-[.08em]">Today</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      {total > 0 && <span className="font-mono text-[9px] text-[#555]">{done}/{total}</span>}
                      <span className="text-[9.5px] text-[#555] font-mono">{d.getDate()} {MONTHS[d.getMonth()].slice(0,3)}</span>
                    </div>
                  </div>
                  <div className="bg-white">
                    {dayTasks.map((t, i) => (
                      <div key={t.id} className="flex items-center gap-1.5 bg-white border-b border-[#f7f7f7] last:border-0 px-3 h-9 focus-within:bg-[#fafafa] transition-colors">
                        <input type="checkbox" checked={t.done} onChange={e => toggleTask(t.id, e.target.checked)}
                          className="w-[13px] h-[13px] accent-[#FF5C00] cursor-pointer flex-shrink-0" />
                        <span className="font-mono text-[9.5px] text-[#bcbcbc] min-w-[11px]">{i+1}</span>
                        <div className="w-px h-[14px] bg-[#efefef] flex-shrink-0" />
                        <TextInput key={t.id} defaultValue={t.text} placeholder="Task…" done={t.done} onSave={val => saveTaskText(t.id, val)} />
                        <button onClick={() => deleteTask(t.id)} className="w-5 h-5 flex items-center justify-center text-[11px] text-[#bcbcbc] hover:text-[#8B0000] transition-colors flex-shrink-0">×</button>
                      </div>
                    ))}
                    <div className="px-2 py-1.5">
                      <button onClick={() => addTask(ds)}
                        className="w-full flex items-center gap-1 px-2 py-1 rounded border border-dashed border-[#efefef] text-[9px] font-bold uppercase tracking-[.07em] text-[#bcbcbc] hover:border-[#FF5C00] hover:text-[#FF5C00] hover:bg-[#FFF0E8] transition-colors">
                        ＋ Add task
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}
