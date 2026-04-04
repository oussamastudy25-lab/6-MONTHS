'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

const sb = createClient()
type Row = { id: string; name: string; position: number; frequency: string }

const FREQ_OPTIONS = [
  { value: 'daily',    label: 'Every day' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekends', label: 'Weekends' },
  { value: '3x',       label: 'Mon/Wed/Fri' },
]

function HabitRow({ habit, index, onUpdateName, onUpdateFreq, onRemove }: {
  habit: Row; index: number
  onUpdateName: (id: string, name: string) => void
  onUpdateFreq: (id: string, freq: string) => void
  onRemove: (id: string) => void
}) {
  const [val, setVal] = useState(habit.name)
  return (
    <div className="flex items-center gap-1.5 bg-[#f7f7f7] border border-[#efefef] rounded-md px-2 mb-1.5 focus-within:border-[#FF5C00] focus-within:bg-white transition-colors">
      <span className="font-mono text-[10px] text-[#bcbcbc] min-w-[16px] flex-shrink-0">{index+1}</span>
      <div className="w-px h-[18px] bg-[#dedede] flex-shrink-0"/>
      <input
        className="flex-1 bg-transparent border-none outline-none text-[13px] py-2.5 min-w-0"
        placeholder="Habit name…"
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={() => { if (val !== habit.name) onUpdateName(habit.id, val) }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      />
      <select
        value={habit.frequency}
        onChange={e => onUpdateFreq(habit.id, e.target.value)}
        className="bg-transparent border-none outline-none text-[10px] text-[#888] cursor-pointer py-2 pl-1 pr-0 flex-shrink-0"
        title="Frequency"
      >
        {FREQ_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <button onClick={() => onRemove(habit.id)}
        className="w-6 h-6 rounded border border-[#dedede] flex items-center justify-center text-[13px] text-[#888] hover:bg-[#FBE9E7] hover:border-[#e0a0a0] hover:text-[#8B0000] transition-colors flex-shrink-0">×</button>
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
    const { data } = await sb.from('habits').insert({ user_id: user.id, name: '', position: habits.length, frequency: 'daily' }).select().single()
    if (data) setHabits(h => [...h, data])
  }
  const updateName = async (id: string, name: string) => {
    setHabits(h => h.map(x => x.id===id ? {...x,name} : x))
    await sb.from('habits').update({ name }).eq('id', id)
  }
  const updateFreq = async (id: string, frequency: string) => {
    setHabits(h => h.map(x => x.id===id ? {...x,frequency} : x))
    await sb.from('habits').update({ frequency }).eq('id', id)
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
          <div className="text-[10px] text-[#aaa] mb-3">
            Logged in Tracker. ✓ Done / ✗ Missed / — N/A · Set frequency per habit
          </div>

          {habits.map((h, i) => (
            <HabitRow key={h.id} habit={h} index={i}
              onUpdateName={updateName} onUpdateFreq={updateFreq} onRemove={remove} />
          ))}

          <button onClick={add}
            className="w-full flex items-center gap-1.5 px-3 py-2 rounded-md border border-dashed border-[#dedede] text-[10px] font-bold uppercase tracking-[.08em] text-[#888] hover:border-[#FF5C00] hover:text-[#FF5C00] hover:bg-[#FFF0E8] transition-colors mt-1">
            ＋ Add habit
          </button>

          {habits.length > 0 && (
            <div className="mt-4 p-3 bg-[#f7f7f7] border border-[#efefef] rounded-lg">
              <div className="text-[9px] font-bold text-[#888] uppercase tracking-[.1em] mb-1.5">Frequency legend</div>
              <div className="space-y-0.5">
                {FREQ_OPTIONS.map(o => (
                  <div key={o.value} className="text-[10px] text-[#aaa]">
                    <span className="font-semibold text-[#666]">{o.label}</span>
                    {o.value === 'daily' && ' — logged 7 days/week'}
                    {o.value === 'weekdays' && ' — Mon to Fri only'}
                    {o.value === 'weekends' && ' — Sat & Sun only'}
                    {o.value === '3x' && ' — Mon, Wed, Fri only'}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 bg-[#f7f7f7] border border-[#efefef] rounded-lg p-4">
            <div className="text-[10px] font-bold text-[#888] uppercase tracking-[.1em] mb-2">Other settings</div>
            <div className="text-[11px] text-[#aaa] space-y-1">
              <div>🎯 Goals & milestones → <span className="font-semibold text-[#888]">Goals page</span></div>
              <div>⏱ Focus categories → <span className="font-semibold text-[#888]">Timer page</span></div>
              <div>📅 Calendar blocks → <span className="font-semibold text-[#888]">Calendar page</span></div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
