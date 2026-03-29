'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

type Milestone = { id: string; goal_id: string; text: string; done: boolean; position: number }
type SixMonthGoal = { id: string; title: string; description: string; category: string; start_date: string; end_date: string; milestones?: Milestone[] }

const sb = createClient()
const CATEGORIES = ['Health', 'Mind', 'Work', 'Relationships', 'Finance', 'Spirit', 'Other']
const CAT_COLORS: Record<string, string> = {
  Health: '#22c55e', Mind: '#8b5cf6', Work: '#FF5C00',
  Relationships: '#ec4899', Finance: '#f59e0b', Spirit: '#06b6d4', Other: '#888'
}

export default function GoalsPage() {
  const [goals, setGoals] = useState<SixMonthGoal[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ title: '', description: '', category: 'Work', start_date: '', end_date: '' })

  const today = new Date().toISOString().slice(0, 10)
  const sixMonths = new Date(); sixMonths.setMonth(sixMonths.getMonth() + 6)
  const defaultEnd = sixMonths.toISOString().slice(0, 10)

  const load = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const { data: goalsData } = await sb.from('six_month_goals').select('*').eq('user_id', user.id).order('position')
    if (!goalsData) return
    const { data: msData } = await sb.from('milestones').select('*').eq('user_id', user.id).order('position')
    const ms = msData ?? []
    setGoals(goalsData.map(g => ({ ...g, milestones: ms.filter(m => m.goal_id === g.id) })))
  }, [])

  useEffect(() => { load() }, [load])

  async function saveGoal() {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    if (!form.title.trim()) return
    if (editId) {
      await sb.from('six_month_goals').update({ title: form.title, description: form.description, category: form.category, start_date: form.start_date || today, end_date: form.end_date || defaultEnd }).eq('id', editId)
    } else {
      await sb.from('six_month_goals').insert({ user_id: user.id, title: form.title, description: form.description, category: form.category, start_date: form.start_date || today, end_date: form.end_date || defaultEnd, position: goals.length })
    }
    setForm({ title: '', description: '', category: 'Work', start_date: '', end_date: '' })
    setShowForm(false); setEditId(null); load()
  }

  async function deleteGoal(id: string) {
    if (!confirm('Delete this goal and all its milestones?')) return
    await sb.from('six_month_goals').delete().eq('id', id)
    setGoals(g => g.filter(x => x.id !== id))
  }

  async function addMilestone(goalId: string) {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const goal = goals.find(g => g.id === goalId)
    const pos = (goal?.milestones?.length ?? 0)
    const { data } = await sb.from('milestones').insert({ goal_id: goalId, user_id: user.id, text: '', done: false, position: pos }).select().single()
    if (data) setGoals(gs => gs.map(g => g.id === goalId ? { ...g, milestones: [...(g.milestones??[]), data] } : g))
  }

  async function updateMilestone(goalId: string, msId: string, text: string) {
    setGoals(gs => gs.map(g => g.id===goalId ? { ...g, milestones: g.milestones?.map(m => m.id===msId ? {...m,text} : m) } : g))
    await sb.from('milestones').update({ text }).eq('id', msId)
  }

  async function toggleMilestone(goalId: string, msId: string, done: boolean) {
    setGoals(gs => gs.map(g => g.id===goalId ? { ...g, milestones: g.milestones?.map(m => m.id===msId ? {...m,done} : m) } : g))
    await sb.from('milestones').update({ done }).eq('id', msId)
  }

  async function deleteMilestone(goalId: string, msId: string) {
    await sb.from('milestones').delete().eq('id', msId)
    setGoals(gs => gs.map(g => g.id===goalId ? { ...g, milestones: g.milestones?.filter(m => m.id!==msId) } : g))
  }

  function pct(goal: SixMonthGoal) {
    const ms = goal.milestones ?? []
    if (!ms.length) return 0
    return Math.round(ms.filter(m => m.done).length / ms.length * 100)
  }

  function daysLeft(endDate: string) {
    const diff = Math.ceil((new Date(endDate).getTime() - Date.now()) / 86400000)
    if (diff < 0) return 'Ended'
    if (diff === 0) return 'Today'
    return `${diff}d left`
  }

  function startEdit(g: SixMonthGoal) {
    setForm({ title: g.title, description: g.description, category: g.category, start_date: g.start_date, end_date: g.end_date })
    setEditId(g.id); setShowForm(true)
  }

  return (
    <>
      {/* Header */}
      <div className="bg-white px-6 py-3 border-b-2 border-[#0A0A0A] flex items-center flex-shrink-0">
        <div>
          <div className="text-[19px] font-bold tracking-[.04em]">6-Month Goals</div>
          <div className="text-[10px] text-[#888] tracking-[.12em] uppercase mt-0.5">The war plan · milestones + progress</div>
        </div>
        <button onClick={() => { setShowForm(true); setEditId(null); setForm({ title:'',description:'',category:'Work',start_date:'',end_date:'' }) }}
          className="ml-auto bg-[#FF5C00] text-white text-[10px] font-bold uppercase tracking-[.1em] px-3 py-1.5 rounded-md hover:bg-[#FF7A2E] transition-colors">
          + New Goal
        </button>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm" onClick={e => { if(e.target===e.currentTarget){setShowForm(false);setEditId(null)} }}>
          <div className="bg-white rounded-xl w-[480px] max-w-[95vw] shadow-2xl fade-up">
            <div className="px-5 py-4 border-b-2 border-[#0A0A0A] flex items-center">
              <div className="text-[15px] font-bold">{editId ? 'Edit Goal' : 'New 6-Month Goal'}</div>
              <button onClick={() => {setShowForm(false);setEditId(null)}} className="ml-auto w-7 h-7 border border-[#dedede] rounded flex items-center justify-center text-[#888] hover:bg-[#0A0A0A] hover:text-white transition-colors">✕</button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <div className="text-[9px] font-bold text-[#888] uppercase tracking-[.12em] mb-1">Goal Title *</div>
                <input className="w-full bg-[#f7f7f7] border border-[#dedede] rounded-md px-3 py-2 text-[13px] outline-none focus:border-[#FF5C00]"
                  placeholder="What do you want to achieve?" value={form.title} onChange={e => setForm(f=>({...f,title:e.target.value}))} />
              </div>
              <div>
                <div className="text-[9px] font-bold text-[#888] uppercase tracking-[.12em] mb-1">Description</div>
                <textarea className="w-full bg-[#f7f7f7] border border-[#dedede] rounded-md px-3 py-2 text-[13px] outline-none focus:border-[#FF5C00] resize-none h-16"
                  placeholder="Why does this matter?" value={form.description} onChange={e => setForm(f=>({...f,description:e.target.value}))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[9px] font-bold text-[#888] uppercase tracking-[.12em] mb-1">Category</div>
                  <select className="w-full bg-[#f7f7f7] border border-[#dedede] rounded-md px-3 py-2 text-[13px] outline-none focus:border-[#FF5C00]"
                    value={form.category} onChange={e => setForm(f=>({...f,category:e.target.value}))}>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <div className="text-[9px] font-bold text-[#888] uppercase tracking-[.12em] mb-1">End Date</div>
                  <input type="date" className="w-full bg-[#f7f7f7] border border-[#dedede] rounded-md px-3 py-2 text-[13px] outline-none focus:border-[#FF5C00]"
                    value={form.end_date || defaultEnd} onChange={e => setForm(f=>({...f,end_date:e.target.value}))} />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={saveGoal} className="bg-[#FF5C00] text-white text-[10px] font-bold uppercase tracking-[.1em] px-4 py-2 rounded-md hover:bg-[#FF7A2E] transition-colors">
                  {editId ? 'Update' : 'Create Goal'}
                </button>
                <button onClick={() => {setShowForm(false);setEditId(null)}} className="border border-[#dedede] text-[10px] font-bold uppercase tracking-[.1em] px-4 py-2 rounded-md hover:border-[#0A0A0A] transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Goals list */}
      <div className="flex-1 overflow-y-auto p-6">
        {goals.length === 0 && (
          <div className="text-center py-20">
            <div className="text-4xl mb-3">◎</div>
            <div className="text-[15px] font-bold mb-1">No goals yet</div>
            <div className="text-[13px] text-[#888]">Click + New Goal to start your 6-month war plan</div>
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 max-w-4xl">
          {goals.map(g => {
            const p = pct(g)
            const ms = g.milestones ?? []
            const color = CAT_COLORS[g.category] ?? '#888'
            return (
              <div key={g.id} className="bg-white border border-[#efefef] rounded-lg overflow-hidden hover:border-[#dedede] transition-colors">
                {/* Goal header */}
                <div className="p-4 border-b border-[#f7f7f7]">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5" style={{background:color}} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[14px] font-bold">{g.title}</span>
                        <span className="text-[9px] font-bold uppercase tracking-[.1em] px-2 py-0.5 rounded-full" style={{background:color+'20',color}}>
                          {g.category}
                        </span>
                        <span className="text-[9px] font-mono text-[#888] ml-auto">{daysLeft(g.end_date)}</span>
                      </div>
                      {g.description && <div className="text-[12px] text-[#888] mt-0.5">{g.description}</div>}
                      {/* Progress bar */}
                      <div className="mt-3 flex items-center gap-3">
                        <div className="flex-1 h-1.5 bg-[#efefef] rounded-full overflow-hidden">
                          <div className="h-full rounded-full bar-animated transition-all duration-500" style={{width:`${p}%`,background:color}} />
                        </div>
                        <span className="font-mono text-[12px] font-semibold" style={{color}}>{p}%</span>
                        <span className="text-[10px] text-[#888]">{ms.filter(m=>m.done).length}/{ms.length} milestones</span>
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => startEdit(g)} className="w-7 h-7 border border-[#dedede] rounded flex items-center justify-center text-[11px] text-[#888] hover:border-[#0A0A0A] hover:text-[#0A0A0A] transition-colors">✎</button>
                      <button onClick={() => deleteGoal(g.id)} className="w-7 h-7 border border-[#dedede] rounded flex items-center justify-center text-[13px] text-[#888] hover:bg-[#FBE9E7] hover:border-[#e0a0a0] hover:text-[#8B0000] transition-colors">×</button>
                    </div>
                  </div>
                </div>

                {/* Milestones */}
                <div className="p-3 bg-[#fafafa]">
                  {ms.map((m, i) => (
                    <div key={m.id} className="flex items-center gap-2 bg-white border border-[#efefef] rounded-md px-2 mb-1 h-9 focus-within:border-[#FF5C00] transition-colors">
                      <input type="checkbox" checked={m.done} onChange={e => toggleMilestone(g.id, m.id, e.target.checked)}
                        className="w-[13px] h-[13px] accent-[#FF5C00] cursor-pointer flex-shrink-0" />
                      <span className="font-mono text-[9px] text-[#bcbcbc] min-w-[14px]">{i+1}</span>
                      <input className={`flex-1 bg-transparent border-none outline-none text-[12px] ${m.done ? 'line-through text-[#bcbcbc]' : ''}`}
                        placeholder="Milestone…" value={m.text} onChange={e => updateMilestone(g.id, m.id, e.target.value)} />
                      <button onClick={() => deleteMilestone(g.id, m.id)}
                        className="w-5 h-5 flex items-center justify-center text-[11px] text-[#bcbcbc] hover:text-[#8B0000] transition-colors">×</button>
                    </div>
                  ))}
                  <button onClick={() => addMilestone(g.id)}
                    className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md border border-dashed border-[#dedede] text-[9px] font-bold uppercase tracking-[.08em] text-[#888] hover:border-[#FF5C00] hover:text-[#FF5C00] hover:bg-[#FFF0E8] transition-colors">
                    ＋ Add milestone
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
