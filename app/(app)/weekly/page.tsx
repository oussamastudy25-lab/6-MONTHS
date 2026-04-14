'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

type WGoal = { id: string; text: string; done: boolean; position: number; goal_id: string|null }
type Task  = { id: string; text: string; done: boolean; position: number; date: string }
type SixGoal = { id: string; title: string; category: string }

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

// Uncontrolled text input that saves on blur — prevents losing focus during typing
function TextInput({ defaultValue, onSave, placeholder, done }: {
  defaultValue: string; onSave: (val: string) => void; placeholder: string; done?: boolean
}) {
  return (
    <input
      className={`flex-1 bg-transparent border-none outline-none text-[12.5px] ${done ? 'line-through text-[#80868B]' : 'text-[#0A0A0A]'}`}
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
  const [wgoals, setWgoals] = useState<WGoal[]>([])
  const [tasks, setTasks]   = useState<Record<string, Task[]>>({})
  const [sixGoals, setSixGoals] = useState<SixGoal[]>([])
  const [linkingId, setLinkingId] = useState<string|null>(null)

  const weeks = weeksForMonth(year, month)

  function weekDays(monStr: string): string[] {
    const mon = new Date(monStr)
    return Array.from({length:7}, (_,i) => {
      const d=new Date(mon);d.setDate(mon.getDate()+i);return fmt(d)
    })
  }

  const load = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const days = weekDays(weekMon)
    const [{ data: wg }, { data: ts }, { data: sg }] = await Promise.all([
      sb.from('weekly_goals').select('*').eq('user_id', user.id).eq('week_start', weekMon).order('position'),
      sb.from('tasks').select('*').eq('user_id', user.id).in('date', days).order('position'),
      sb.from('six_month_goals').select('id,title,category').eq('user_id', user.id).eq('archived', false).order('position'),
    ])
    setWgoals(wg ?? [])
    setSixGoals(sg ?? [])
    const grouped: Record<string, Task[]> = {}
    days.forEach(d => { grouped[d] = (ts ?? []).filter((t: Task) => t.date===d) })
    setTasks(grouped)
  }, [weekMon])

  useEffect(() => { load() }, [load])

  // Weekly goals
  async function addWGoal() {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const { data } = await sb.from('weekly_goals').insert({ user_id:user.id, week_start:weekMon, text:'', done:false, position:wgoals.length }).select().single()
    if (data) setWgoals(g => [...g, data])
  }
  async function saveWGoalText(id: string, text: string) {
    setWgoals(g => g.map(x => x.id===id ? {...x,text} : x))
    await sb.from('weekly_goals').update({ text }).eq('id', id)
  }
  async function toggleWGoal(id: string, done: boolean) {
    setWgoals(g => g.map(x => x.id===id ? {...x,done} : x))
    await sb.from('weekly_goals').update({ done }).eq('id', id)
  }
  async function deleteWGoal(id: string) {
    await sb.from('weekly_goals').delete().eq('id', id)
    setWgoals(g => g.filter(x => x.id!==id))
  }
  async function linkWGoal(id: string, goal_id: string|null) {
    setWgoals(g => g.map(x => x.id===id ? {...x,goal_id} : x))
    setLinkingId(null)
    await sb.from('weekly_goals').update({ goal_id }).eq('id', id)
  }

  // Tasks
  async function addTask(date: string) {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const { data } = await sb.from('tasks').insert({ user_id:user.id, date, text:'', done:false, position:(tasks[date]??[]).length }).select().single()
    if (data) setTasks(t => ({ ...t, [date]: [...(t[date]??[]), data] }))
  }
  async function saveTaskText(date: string, id: string, text: string) {
    setTasks(t => ({ ...t, [date]: (t[date]??[]).map(x => x.id===id ? {...x,text} : x) }))
    await sb.from('tasks').update({ text }).eq('id', id)
  }
  async function toggleTask(date: string, id: string, done: boolean) {
    setTasks(t => ({ ...t, [date]: (t[date]??[]).map(x => x.id===id ? {...x,done} : x) }))
    await sb.from('tasks').update({ done }).eq('id', id)
  }
  async function deleteTask(date: string, id: string) {
    await sb.from('tasks').delete().eq('id', id)
    setTasks(t => ({ ...t, [date]: (t[date]??[]).filter(x => x.id!==id) }))
  }

  const today = fmt()
  const [hideCompleted, setHideCompleted] = useState(false)

  return (
    <>
      {/* Header */}
      <div className="bg-white px-7 py-5 border-b border-[#E8EAED] flex-shrink-0">
        <div className="text-[22px] font-normal text-[#202124]">Weekly</div>
        <div className="text-[12px] text-[#5F6368] mt-1">Goals + daily tasks</div>
      </div>

      {/* Month nav */}
      <div className="flex items-center gap-2 px-6 py-2 bg-[#f7f7f7] border-b border-[#E8EAED] flex-shrink-0">
        <button onClick={() => { if(month===0){setMonth(11);setYear(y=>y-1)}else setMonth(m=>m-1) }}
          className="w-6 h-6 border border-[#DADCE0] rounded flex items-center justify-center text-[14px] text-[#5F6368] hover:bg-[#1A73E8] hover:text-white hover:border-[#1A73E8] transition-colors">‹</button>
        <span className="text-[14px] font-normal text-[#202124] min-w-[140px] text-center">{MONTHS[month]} {year}</span>
        <button onClick={() => { if(month===11){setMonth(0);setYear(y=>y+1)}else setMonth(m=>m+1) }}
          className="w-6 h-6 border border-[#DADCE0] rounded flex items-center justify-center text-[14px] text-[#5F6368] hover:bg-[#1A73E8] hover:text-white hover:border-[#1A73E8] transition-colors">›</button>
        <button onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); setWeekMon(fmt(getMon())) }}
          className="text-[11px] font-medium tracking-[0.04em] uppercase px-3 py-1 rounded border border-[#DADCE0] text-[#5F6368] hover:bg-[#1A73E8] hover:text-white hover:border-[#1A73E8] transition-colors">Today</button>
      </div>

      {/* Week tabs */}
      <div className="flex gap-1.5 px-6 pt-3 pb-0 flex-shrink-0 flex-wrap">
        {weeks.map(w => {
          const wk = fmt(w)
          const on = wk === weekMon
          return (
            <button key={wk} onClick={() => setWeekMon(wk)}
              className={`px-3 py-1.5 rounded-lg text-[13px] font-medium border transition-all ${on?'bg-[#1A73E8] text-white border-[#1A73E8]':'bg-[#f7f7f7] text-[#5F6368] border-[#E8EAED] hover:bg-[#efefef] hover:text-[#202124]'}`}>
              {weekLabel(w)}
            </button>
          )
        })}
      </div>

      <div className="flex-1 overflow-y-auto px-7 py-5">
        {/* Weekly goals */}
        <div className="border border-[#E8EAED] rounded-lg overflow-hidden mb-6">
          <div className="bg-[#FAFAFA] border-b border-[#E8EAED] px-4 py-2.5 flex items-center justify-between">
            <span className="text-[13px] font-medium text-[#202124]">Weekly Goals</span>
            <span className="text-[10px] text-[#555] font-mono">{weekLabel(new Date(weekMon))}</span>
          </div>
          <div className="bg-white">
            {wgoals.map((g, i) => (
              <div key={g.id} className="flex flex-col bg-white border-b border-[#f7f7f7] last:border-0">
                <div className="flex items-center gap-1.5 px-3 h-10 focus-within:bg-[#F8F9FA] transition-colors">
                <input type="checkbox" checked={g.done} onChange={e => toggleWGoal(g.id, e.target.checked)}
                  className="w-[13px] h-[13px] accent-[#1A73E8] cursor-pointer flex-shrink-0" />
                <span className="font-mono text-[12px] text-[#80868B] min-w-[13px]">{i+1}</span>
                <div className="w-px h-[16px] bg-[#efefef] flex-shrink-0" />
                <TextInput
                  key={g.id}
                  defaultValue={g.text}
                  placeholder="Weekly goal…"
                  done={g.done}
                  onSave={val => saveWGoalText(g.id, val)}
                />
                <button onClick={() => deleteWGoal(g.id)} className="w-5 h-5 flex items-center justify-center text-[11px] text-[#80868B] hover:text-[#8B0000] transition-colors flex-shrink-0">×</button>
                <button
                  onClick={() => setLinkingId(linkingId === g.id ? null : g.id)}
                  title="Link to a goal"
                  className={`w-5 h-5 flex items-center justify-center text-[11px] rounded transition-colors flex-shrink-0 ${g.goal_id ? 'text-[#1A73E8]' : 'text-[#dedede] hover:text-[#80868B]'}`}>
                  ◎
                </button>
                </div>
                {linkingId === g.id && (
                  <div className="px-3 pb-2">
                    <select
                      value={g.goal_id ?? ''}
                      onChange={e => linkWGoal(g.id, e.target.value || null)}
                      className="w-full text-[11px] bg-[#f7f7f7] border border-[#E8EAED] rounded-lg px-2 py-1.5 outline-none focus:border-[#1A73E8] focus:ring-2 focus:ring-[rgba(26,115,232,0.15)] transition-colors"
                    >
                      <option value="">— No goal linked —</option>
                      {sixGoals.map(sg => (
                        <option key={sg.id} value={sg.id}>{sg.category} · {sg.title}</option>
                      ))}
                    </select>
                    {g.goal_id && (
                      <div className="text-[11px] text-[#1A73E8] mt-1 font-medium">
                        ◎ {sixGoals.find(sg => sg.id === g.goal_id)?.title ?? 'Linked goal'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            <div className="px-3 py-2">
              <button onClick={addWGoal}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded border border-dashed border-[#DADCE0] text-[11px] font-medium tracking-[0.04em] uppercase text-[#5F6368] hover:border-[#1A73E8] hover:text-[#1A73E8] hover:bg-[#E8F0FE] transition-colors">
                ＋ Add weekly goal
              </button>
            </div>
          </div>
        </div>

        {/* Daily tasks grid */}
        <div className="flex items-center justify-between mb-3">
            <div className="text-[11px] font-medium text-[#5F6368] tracking-[0.06em] uppercase">Daily Tasks</div>
            <button onClick={() => setHideCompleted(h => !h)}
              className={`text-[11px] font-medium tracking-[0.04em] uppercase px-2 py-1 rounded-lg transition-all ${hideCompleted ? 'bg-[#1A73E8] text-white' : 'bg-[#f0f0f0] text-[#5F6368] hover:bg-[#e0e0e0]'}`}>
              {hideCompleted ? 'Show All' : 'Hide Done'}
            </button>
          </div>
        <div className="grid gap-2" style={{gridTemplateColumns:'repeat(auto-fill,minmax(250px,1fr))'}}>
          {weekDays(weekMon).map(ds => {
            const d = new Date(ds)
            const dow = d.getDay()
            const isWknd = dow===0||dow===6
            const isToday = ds===today
            const dayTasks = tasks[ds] ?? []
            const done = dayTasks.filter(t => t.done && t.text).length
            const total = dayTasks.filter(t => t.text).length
            return (
              <div key={ds} className={`border rounded-lg overflow-hidden ${isToday?'border-[#1A73E8] border-2':'border-[#E8EAED]'}`}>
                <div className={`px-3 py-2 flex items-center justify-between ${isWknd ? 'bg-[#F8F9FA]' : 'bg-[#FAFAFA]'} border-b border-[#E8EAED]`}>
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-[#202124]">{DOW[dow]}</span>
                    {isToday && <span className="text-[10px] bg-[#1A73E8] text-white px-2 py-0.5 rounded-full font-medium">Today</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    {total > 0 && <span className="font-mono text-[11px] text-[#555]">{done}/{total}</span>}
                    <span className="text-[12px] text-[#555] font-mono">{d.getDate()} {MONTHS[d.getMonth()].slice(0,3)}</span>
                  </div>
                </div>
                <div className="bg-white">
                  {dayTasks.filter(t => !hideCompleted || !t.done).map((t, i) => (
                    <div key={t.id} className="flex items-center gap-1.5 bg-white border-b border-[#f7f7f7] last:border-0 px-3 h-9 focus-within:bg-[#F8F9FA] transition-colors">
                      <input type="checkbox" checked={t.done} onChange={e => toggleTask(ds, t.id, e.target.checked)}
                        className="w-[13px] h-[13px] accent-[#1A73E8] cursor-pointer flex-shrink-0" />
                      <span className="font-mono text-[12px] text-[#80868B] min-w-[11px]">{i+1}</span>
                      <div className="w-px h-[14px] bg-[#efefef] flex-shrink-0" />
                      <TextInput
                        key={t.id}
                        defaultValue={t.text}
                        placeholder="Task…"
                        done={t.done}
                        onSave={val => saveTaskText(ds, t.id, val)}
                      />
                      <button onClick={() => deleteTask(ds, t.id)} className="w-5 h-5 flex items-center justify-center text-[11px] text-[#80868B] hover:text-[#8B0000] transition-colors flex-shrink-0">×</button>
                    </div>
                  ))}
                  <div className="px-2 py-1.5">
                    <button onClick={() => addTask(ds)}
                      className="w-full flex items-center gap-1 px-2 py-1 rounded border border-dashed border-[#E8EAED] text-[12px] font-medium text-[#80868B] hover:border-[#1A73E8] hover:text-[#1A73E8] hover:bg-[#E8F0FE] transition-colors">
                      ＋ Add task
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
