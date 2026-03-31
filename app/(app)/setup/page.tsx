'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

const sb = createClient()
type Row = { id: string; name: string; position: number }

const AddBtn = ({ onClick, label }: { onClick: () => void; label: string }) => (
  <button onClick={onClick} className="w-full flex items-center gap-1.5 px-3 py-2 rounded-md border border-dashed border-[#dedede] text-[10px] font-bold uppercase tracking-[.08em] text-[#888] hover:border-[#FF5C00] hover:text-[#FF5C00] hover:bg-[#FFF0E8] transition-colors mt-1">
    ＋ {label}
  </button>
)
const DelBtn = ({ onClick }: { onClick: () => void }) => (
  <button onClick={onClick} className="w-6 h-6 rounded border border-[#dedede] flex items-center justify-center text-[13px] text-[#888] hover:bg-[#FBE9E7] hover:border-[#e0a0a0] hover:text-[#8B0000] transition-colors flex-shrink-0">×</button>
)
const SectionTitle = ({ label, sub }: { label: string; sub?: string }) => (
  <div className="mb-2">
    <div className="text-[9px] font-bold text-[#bcbcbc] tracking-[.16em] uppercase">{label}</div>
    {sub && <div className="text-[10px] text-[#aaa] mt-0.5">{sub}</div>}
  </div>
)
const DynRow = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center gap-1.5 bg-[#f7f7f7] border border-[#efefef] rounded-md px-2 mb-1 h-10 focus-within:border-[#FF5C00] focus-within:bg-white transition-colors">
    {children}
  </div>
)

export default function SetupPage() {
  const [habits, setHabits] = useState<Row[]>([])
  const [nns, setNNs]       = useState<Row[]>([])

  const load = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const uid = user.id
    const [h, n] = await Promise.all([
      sb.from('habits').select('*').eq('user_id', uid).is('archived_at', null).order('position'),
      sb.from('non_negotiables').select('*').eq('user_id', uid).order('position'),
    ])
    setHabits(h.data ?? [])
    setNNs(n.data ?? [])
  }, [])

  useEffect(() => { load() }, [load])

  // Habits
  const addHabit = async () => {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const { data } = await sb.from('habits').insert({ user_id: user.id, name: '', position: habits.length }).select().single()
    if (data) setHabits(h => [...h, data])
  }
  const updateHabit = async (id: string, name: string) => {
    setHabits(h => h.map(x => x.id === id ? { ...x, name } : x))
    await sb.from('habits').update({ name }).eq('id', id)
  }
  const deleteHabit = async (id: string) => {
    if (!confirm('Delete habit and all its logs?')) return
    await sb.from('habits').delete().eq('id', id)
    setHabits(h => h.filter(x => x.id !== id))
  }

  // Non-negotiables
  const addNN = async () => {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const { data } = await sb.from('non_negotiables').insert({ user_id: user.id, name: '', position: nns.length }).select().single()
    if (data) setNNs(n => [...n, data])
  }
  const updateNN = async (id: string, name: string) => {
    setNNs(n => n.map(x => x.id === id ? { ...x, name } : x))
    await sb.from('non_negotiables').update({ name }).eq('id', id)
  }
  const deleteNN = async (id: string) => {
    await sb.from('non_negotiables').delete().eq('id', id)
    setNNs(n => n.filter(x => x.id !== id))
  }

  return (
    <>
      <div className="bg-white px-6 py-3 border-b-2 border-[#0A0A0A] flex-shrink-0">
        <div className="text-[19px] font-bold tracking-[.04em]">Setup</div>
        <div className="text-[10px] text-[#888] tracking-[.12em] uppercase mt-0.5">Configure habits and non-negotiables</div>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid gap-8 max-w-3xl" style={{gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))'}}>

          {/* HABITS */}
          <div>
            <SectionTitle label="Daily Habits" sub="Logged in Tracker and War Room every day" />
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

          {/* NON-NEGOTIABLES */}
          <div>
            <SectionTitle label="Non-Negotiables" sub="Count ×2 in weekly score. Things you MUST do every day." />
            {nns.map((n, i) => (
              <DynRow key={n.id}>
                <span className="font-mono text-[10px] text-[#FF5C00] min-w-[16px] font-bold">{i+1}</span>
                <div className="w-px h-[18px] bg-[#dedede]" />
                <input className="flex-1 bg-transparent border-none outline-none text-[13px] font-semibold"
                  placeholder="e.g. Fajr prayer, Study 4h, Gym…" value={n.name} onChange={e => updateNN(n.id, e.target.value)} />
                <DelBtn onClick={() => deleteNN(n.id)} />
              </DynRow>
            ))}
            <AddBtn onClick={addNN} label="Add non-negotiable" />
          </div>

        </div>

        {/* Info box */}
        <div className="mt-8 max-w-3xl bg-[#f7f7f7] border border-[#efefef] rounded-lg p-4">
          <div className="text-[10px] font-bold text-[#888] uppercase tracking-[.1em] mb-2">Other settings live in their pages</div>
          <div className="text-[11px] text-[#aaa] space-y-1">
            <div>⚔ Bad habits & clean day tracking → <span className="font-semibold text-[#888]">War Room</span></div>
            <div>🎯 6-month goals & milestones → <span className="font-semibold text-[#888]">Goals</span></div>
            <div>📊 Weekly metrics → <span className="font-semibold text-[#888]">War Room</span></div>
            <div>⏱ Focus categories → <span className="font-semibold text-[#888]">Timer</span></div>
            <div>📵 Phone-free zones → <span className="font-semibold text-[#888]">Calendar</span></div>
          </div>
        </div>
      </div>
    </>
  )
}
