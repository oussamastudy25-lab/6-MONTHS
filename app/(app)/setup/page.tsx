'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

type Habit = { id: string; name: string; position: number }
type Goal  = { id: string; text: string; done: boolean; position: number }
const sb = createClient()

export default function SetupPage() {
  const [habits, setHabits] = useState<Habit[]>([])
  const [goals, setGoals]   = useState<Goal[]>([])
  const month = new Date().toISOString().slice(0, 7)

  const load = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return
    const [{ data: h }, { data: g }] = await Promise.all([
      sb.from('habits').select('*').eq('user_id', user.id).is('archived_at', null).order('position'),
      sb.from('monthly_goals').select('*').eq('user_id', user.id).eq('month', month).order('position'),
    ])
    setHabits(h ?? []); setGoals(g ?? [])
  }, [month])

  useEffect(() => { load() }, [load])

  async function addHabit() {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const { data } = await sb.from('habits').insert({ user_id: user.id, name: '', position: habits.length }).select().single()
    if (data) setHabits(h => [...h, data])
  }
  async function updateHabit(id: string, name: string) {
    setHabits(h => h.map(x => x.id===id ? {...x,name} : x))
    await sb.from('habits').update({ name }).eq('id', id)
  }
  async function deleteHabit(id: string) {
    if (!confirm('Delete habit? All tracking data for it will be removed.')) return
    await sb.from('habits').delete().eq('id', id)
    setHabits(h => h.filter(x => x.id !== id))
  }
  async function addGoal() {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const { data } = await sb.from('monthly_goals').insert({ user_id: user.id, month, text: '', done: false, position: goals.length }).select().single()
    if (data) setGoals(g => [...g, data])
  }
  async function updateGoal(id: string, text: string) {
    setGoals(g => g.map(x => x.id===id ? {...x,text} : x))
    await sb.from('monthly_goals').update({ text }).eq('id', id)
  }
  async function toggleGoal(id: string, done: boolean) {
    setGoals(g => g.map(x => x.id===id ? {...x,done} : x))
    await sb.from('monthly_goals').update({ done }).eq('id', id)
  }
  async function deleteGoal(id: string) {
    await sb.from('monthly_goals').delete().eq('id', id)
    setGoals(g => g.filter(x => x.id !== id))
  }

  const monthLabel = new Date(month+'-01').toLocaleString('default',{month:'long',year:'numeric'})

  const DynRow = ({ children }: { children: React.ReactNode }) => (
    <div className="flex items-center gap-1.5 bg-[#f7f7f7] border border-[#efefef] rounded-md px-2 mb-1 h-10 focus-within:border-[#FF5C00] focus-within:bg-white transition-colors">
      {children}
    </div>
  )
  const AddBtn = ({ onClick, label }: { onClick: () => void; label: string }) => (
    <button onClick={onClick} className="w-full flex items-center gap-1.5 px-3 py-2 rounded-md border border-dashed border-[#dedede] text-[10px] font-bold uppercase tracking-[.08em] text-[#888] hover:border-[#FF5C00] hover:text-[#FF5C00] hover:bg-[#FFF0E8] transition-colors mt-1">
      ＋ {label}
    </button>
  )
  const DelBtn = ({ onClick }: { onClick: () => void }) => (
    <button onClick={onClick} className="w-6 h-6 rounded border border-[#dedede] flex items-center justify-center text-[13px] text-[#888] hover:bg-[#FBE9E7] hover:border-[#e0a0a0] hover:text-[#8B0000] transition-colors flex-shrink-0">×</button>
  )

  return (
    <>
      <div className="bg-white px-6 py-3 border-b-2 border-[#0A0A0A] flex-shrink-0">
        <div className="text-[19px] font-bold tracking-[.04em]">Setup</div>
        <div className="text-[10px] text-[#888] tracking-[.12em] uppercase mt-0.5">Habits · Monthly Goals</div>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-2 gap-6 max-w-3xl">
          <div>
            <div className="text-[9px] font-bold text-[#bcbcbc] tracking-[.16em] uppercase mb-2">Habits</div>
            {habits.map((h, i) => (
              <DynRow key={h.id}>
                <span className="font-mono text-[10px] text-[#bcbcbc] min-w-[16px]">{i+1}</span>
                <div className="w-px h-[18px] bg-[#dedede]" />
                <input className="flex-1 bg-transparent border-none outline-none text-[13px]"
                  placeholder="Habit name…" value={h.name} onChange={e => updateHabit(h.id, e.target.value)} />
                <DelBtn onClick={() => deleteHabit(h.id)} />
              </DynRow>
            ))}
            <AddBtn onClick={addHabit} label="Add habit" />
          </div>
          <div>
            <div className="text-[9px] font-bold text-[#bcbcbc] tracking-[.16em] uppercase mb-2">Goals · {monthLabel}</div>
            {goals.map((g, i) => (
              <DynRow key={g.id}>
                <input type="checkbox" checked={g.done} onChange={e => toggleGoal(g.id, e.target.checked)}
                  className="w-[14px] h-[14px] accent-[#FF5C00] cursor-pointer" />
                <span className="font-mono text-[10px] text-[#bcbcbc] min-w-[13px]">{i+1}</span>
                <div className="w-px h-[18px] bg-[#dedede]" />
                <input className={`flex-1 bg-transparent border-none outline-none text-[13px] ${g.done ? 'line-through text-[#bcbcbc]' : ''}`}
                  placeholder="Goal…" value={g.text} onChange={e => updateGoal(g.id, e.target.value)} />
                <DelBtn onClick={() => deleteGoal(g.id)} />
              </DynRow>
            ))}
            <AddBtn onClick={addGoal} label="Add goal" />
          </div>
        </div>
      </div>
    </>
  )
}
