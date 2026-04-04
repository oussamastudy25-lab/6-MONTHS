'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

const sb = createClient()
type Row = { id: string; name: string; position: number }

function HabitInput({ habit, onUpdate, onRemove }: {
  habit: Row
  onUpdate: (id: string, name: string) => void
  onRemove: (id: string) => void
}) {
  const [val, setVal] = useState(habit.name)
  return (
    <div className="flex items-center gap-1.5 bg-[#f7f7f7] border border-[#efefef] rounded-md px-2 mb-1 h-10 focus-within:border-[#FF5C00] focus-within:bg-white transition-colors">
      <span className="font-mono text-[10px] text-[#bcbcbc] min-w-[16px]">{habit.position + 1}</span>
      <div className="w-px h-[18px] bg-[#dedede]"/>
      <input
        className="flex-1 bg-transparent border-none outline-none text-[13px]"
        placeholder="Habit name…"
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={() => { if (val !== habit.name) onUpdate(habit.id, val) }}
        onKeyDown={e => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur() } }}
      />
      <button onClick={() => onRemove(habit.id)}
        className="w-6 h-6 rounded border border-[#dedede] flex items-center justify-center text-[13px] text-[#888] hover:bg-[#FBE9E7] hover:border-[#e0a0a0] hover:text-[#8B0000] transition-colors">×</button>
    </div>
  )
}

export default function SetupPage() {
  const [habits, setHabits] = useState<Row[]>([])

  const load = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const { data } = await sb.from('habits').select('*').eq('user_id', user.id).is('archived_at', null).order('position')
    setHabits(data ?? [])
  }, [])

  useEffect(() => { load() }, [load])

  const add = async () => {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const { data } = await sb.from('habits').insert({ user_id: user.id, name: '', position: habits.length }).select().single()
    if (data) setHabits(h => [...h, data])
  }
  const update = async (id: string, name: string) => {
    setHabits(h => h.map(x => x.id===id ? {...x,name} : x))
    await sb.from('habits').update({ name }).eq('id', id)
  }
  const remove = async (id: string) => {
    if (!confirm('Delete habit and all its logs?')) return
    await sb.from('habits').delete().eq('id', id)
    setHabits(h => h.filter(x => x.id!==id))
  }

  return (
    <>
      <div className="bg-white px-6 py-3 border-b-2 border-[#0A0A0A] flex-shrink-0">
        <div className="text-[19px] font-bold tracking-[.04em]">Setup</div>
        <div className="text-[10px] text-[#888] tracking-[.12em] uppercase mt-0.5">Manage your daily habits</div>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-md">
          <div className="text-[9px] font-bold text-[#bcbcbc] tracking-[.16em] uppercase mb-1">Daily Habits</div>
          <div className="text-[10px] text-[#aaa] mb-3">Logged in Tracker every day. ✓ Done / ✗ Missed / — N/A</div>

          {habits.map(h => (
            <HabitInput key={h.id} habit={h} onUpdate={update} onRemove={remove} />
          ))}

          <button onClick={add}
            className="w-full flex items-center gap-1.5 px-3 py-2 rounded-md border border-dashed border-[#dedede] text-[10px] font-bold uppercase tracking-[.08em] text-[#888] hover:border-[#FF5C00] hover:text-[#FF5C00] hover:bg-[#FFF0E8] transition-colors mt-1">
            ＋ Add habit
          </button>

          <div className="mt-8 bg-[#f7f7f7] border border-[#efefef] rounded-lg p-4">
            <div className="text-[10px] font-bold text-[#888] uppercase tracking-[.1em] mb-2">Other settings</div>
            <div className="text-[11px] text-[#aaa] space-y-1">
              <div>🎯 Goals & milestones → <span className="font-semibold text-[#888]">Goals page</span></div>
              <div>⏱ Focus categories → <span className="font-semibold text-[#888]">Timer page</span></div>
              <div>📅 Recurring calendar blocks → <span className="font-semibold text-[#888]">Calendar page</span></div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
