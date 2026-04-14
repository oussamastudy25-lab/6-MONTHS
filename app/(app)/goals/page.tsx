'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

type Milestone = { id: string; goal_id: string; text: string; done: boolean; position: number }
type Goal = { id: string; title: string; description: string; category: string; start_date: string; end_date: string; archived: boolean; milestones?: Milestone[] }

const sb = createClient()
const CATEGORIES = ['Health','Mind','Work','Relationships','Finance','Spirit','Other']
const CAT_COLORS: Record<string,string> = {
  Health:'#22c55e',Mind:'#8b5cf6',Work:'#FF5C00',
  Relationships:'#ec4899',Finance:'#f59e0b',Spirit:'#06b6d4',Other:'#888'
}

function daysLeft(end: string) {
  const d = Math.ceil((new Date(end).getTime()-Date.now())/86400000)
  if(d<0) return 'Ended'
  if(d===0) return 'Today'
  return `${d}d left`
}
function duration(start: string, end: string) {
  const d = Math.ceil((new Date(end).getTime()-new Date(start).getTime())/86400000)
  if(d>=365) return `${Math.round(d/365*10)/10}y`
  if(d>=30)  return `${Math.round(d/30)}mo`
  return `${d}d`
}
function pct(g: Goal) {
  const ms = g.milestones??[]
  if(!ms.length) return 0
  return Math.round(ms.filter(m=>m.done).length/ms.length*100)
}

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string|null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const today = new Date().toISOString().slice(0,10)
  const [form, setForm] = useState({ title:'', description:'', category:'Work', start_date: today, end_date:'' })

  const load = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const [{ data: g }, { data: m }] = await Promise.all([
      sb.from('six_month_goals').select('*').eq('user_id', user.id).order('position'),
      sb.from('milestones').select('*').eq('user_id', user.id).order('position'),
    ])
    setGoals((g??[]).map((goal:Goal) => ({ ...goal, milestones: (m??[]).filter((ms:Milestone) => ms.goal_id===goal.id) })))
  }, [])

  useEffect(() => { load() }, [load])

  async function saveGoal() {
    if (!form.title.trim() || !form.end_date) return
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    if (editId) {
      await sb.from('six_month_goals').update({ title:form.title, description:form.description, category:form.category, start_date:form.start_date, end_date:form.end_date }).eq('id', editId)
      setGoals(prev => prev.map(g => g.id===editId ? {...g,...form} : g))
      setEditId(null)
    } else {
      const { data } = await sb.from('six_month_goals').insert({ user_id:user.id, ...form, position:goals.length, archived:false }).select().single()
      if (data) setGoals(prev => [...prev, {...data, milestones:[]}])
    }
    setForm({ title:'', description:'', category:'Work', start_date:today, end_date:'' })
    setShowForm(false)
  }

  async function deleteGoal(id: string) {
    if (!confirm('Delete goal and all milestones?')) return
    await sb.from('six_month_goals').delete().eq('id', id)
    setGoals(prev => prev.filter(g => g.id!==id))
  }

  async function archiveGoal(id: string, archived: boolean) {
    await sb.from('six_month_goals').update({ archived }).eq('id', id)
    setGoals(prev => prev.map(g => g.id===id ? {...g,archived} : g))
  }

  function startEdit(g: Goal) {
    setForm({ title:g.title, description:g.description, category:g.category, start_date:g.start_date, end_date:g.end_date })
    setEditId(g.id); setShowForm(true)
  }

  async function addMilestone(goalId: string) {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const ms = goals.find(g=>g.id===goalId)?.milestones??[]
    const { data } = await sb.from('milestones').insert({ user_id:user.id, goal_id:goalId, text:'', done:false, position:ms.length }).select().single()
    if (data) setGoals(prev => prev.map(g => g.id===goalId ? {...g,milestones:[...(g.milestones??[]),data]} : g))
    // Auto-expand when adding milestone
    setExpanded(prev => new Set([...prev, goalId]))
  }

  async function toggleMilestone(goalId: string, msId: string, done: boolean) {
    await sb.from('milestones').update({ done }).eq('id', msId)
    setGoals(prev => prev.map(g => g.id===goalId ? {...g,milestones:(g.milestones??[]).map(m=>m.id===msId?{...m,done}:m)} : g))
  }

  async function updateMilestone(goalId: string, msId: string, text: string) {
    setGoals(prev => prev.map(g => g.id===goalId ? {...g,milestones:(g.milestones??[]).map(m=>m.id===msId?{...m,text}:m)} : g))
    await sb.from('milestones').update({ text }).eq('id', msId)
  }

  async function deleteMilestone(goalId: string, msId: string) {
    await sb.from('milestones').delete().eq('id', msId)
    setGoals(prev => prev.map(g => g.id===goalId ? {...g,milestones:(g.milestones??[]).filter(m=>m.id!==msId)} : g))
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const active = goals.filter(g => !g.archived)
  const archived = goals.filter(g => g.archived)

  return (
    <>
      {/* Header */}
      <div className="bg-white px-6 py-3 border-b border-[#E8EAED] flex items-center flex-shrink-0">
        <div>
          <div className="text-[22px] font-normal text-[#202124]">Goals</div>
          <div className="text-[12px] text-[#5F6368] mt-1">
            {active.length} active · {archived.length} archived
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          {archived.length>0 && (
            <button onClick={() => setShowArchived(s=>!s)}
              className={`px-3 py-1.5 rounded border text-[10px] font-bold uppercase tracking-[.1em] transition-all ${showArchived?'bg-[#FF5C00] text-white border-[#0A0A0A]':'border-[#DADCE0] text-[#5F6368] hover:border-[#0A0A0A] hover:text-[#0A0A0A]'}`}>
              {showArchived ? 'Hide archived' : `Archived (${archived.length})`}
            </button>
          )}
          <button onClick={() => { setShowForm(s=>!s); setEditId(null); setForm({title:'',description:'',category:'Work',start_date:today,end_date:''}) }}
            className="bg-[#FF5C00] text-white text-[10px] font-bold uppercase tracking-[.1em] px-4 py-1.5 rounded hover:bg-[#FF7A2E] transition-colors">
            + New Goal
          </button>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="px-6 py-4 border-b border-[#E8EAED] bg-[#F8F9FA] flex-shrink-0">
          <div className="max-w-2xl grid grid-cols-2 gap-3">
            <input className="col-span-2 bg-white border border-[#DADCE0] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#FF5C00] focus:ring-2 focus:ring-[rgba(255,92,0,0.12)]"
              placeholder="Goal title *" value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} />
            <input className="col-span-2 bg-white border border-[#DADCE0] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#FF5C00] focus:ring-2 focus:ring-[rgba(255,92,0,0.12)]"
              placeholder="Description (optional)" value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} />
            <div>
              <div className="text-[9px] font-bold text-[#5F6368] uppercase tracking-[.12em] mb-1">Category</div>
              <select className="w-full bg-white border border-[#DADCE0] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#FF5C00] focus:ring-2 focus:ring-[rgba(255,92,0,0.12)]"
                value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>
                {CATEGORIES.map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-[9px] font-bold text-[#5F6368] uppercase tracking-[.12em] mb-1">Start</div>
                <input type="date" className="w-full bg-white border border-[#DADCE0] rounded-lg px-3 py-2 text-[12px] outline-none focus:border-[#FF5C00] focus:ring-2 focus:ring-[rgba(255,92,0,0.12)]"
                  value={form.start_date} onChange={e=>setForm(f=>({...f,start_date:e.target.value}))} />
              </div>
              <div>
                <div className="text-[9px] font-bold text-[#5F6368] uppercase tracking-[.12em] mb-1">End *</div>
                <input type="date" className="w-full bg-white border border-[#DADCE0] rounded-lg px-3 py-2 text-[12px] outline-none focus:border-[#FF5C00] focus:ring-2 focus:ring-[rgba(255,92,0,0.12)]"
                  value={form.end_date} onChange={e=>setForm(f=>({...f,end_date:e.target.value}))} />
              </div>
            </div>
            <div className="col-span-2 flex gap-2">
              <button onClick={saveGoal} className="bg-[#FF5C00] text-white text-[10px] font-bold uppercase tracking-[.1em] px-5 py-2 rounded hover:bg-[#FF7A2E] transition-colors">
                {editId ? 'Update' : 'Create Goal'}
              </button>
              <button onClick={()=>{setShowForm(false);setEditId(null)}} className="border border-[#DADCE0] text-[10px] font-bold uppercase tracking-[.1em] px-4 py-2 rounded hover:border-[#0A0A0A] transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Goals list */}
      <div className="flex-1 overflow-y-auto p-5">
        {active.length===0 && !showArchived && (
          <div className="text-center py-20">
            <div className="text-4xl mb-3">◎</div>
            <div className="text-[15px] font-bold mb-1">No goals yet</div>
            <div className="text-[13px] text-[#5F6368]">Click + New Goal to start. Set your own dates — 1 month, 6 months, 1 year, whatever you need.</div>
          </div>
        )}
        <div className="space-y-3 max-w-4xl">
          {(showArchived ? [...active,...archived] : active).map(g => {
            const p = pct(g)
            const ms = g.milestones??[]
            const color = CAT_COLORS[g.category]??'#888'
            const elapsed = Math.ceil((Date.now()-new Date(g.start_date).getTime())/86400000)
            const total = Math.ceil((new Date(g.end_date).getTime()-new Date(g.start_date).getTime())/86400000)
            const timePct = total>0 ? Math.min(100, Math.round(elapsed/total*100)) : 0
            const isExpanded = expanded.has(g.id)
            const doneMilestones = ms.filter(m=>m.done).length

            return (
              <div key={g.id} className={`bg-white border rounded-lg overflow-hidden transition-all ${g.archived?'border-[#f0f0f0] opacity-70':'border-[#E8EAED] hover:border-[#DADCE0]'}`}>
                {/* Goal header */}
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-3 h-3 rounded-full flex-shrink-0 mt-1.5" style={{background:color}} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`text-[14px] font-bold ${g.archived?'line-through text-[#5F6368]':''}`}>{g.title}</span>
                        <span className="text-[9px] font-bold uppercase tracking-[.1em] px-2 py-0.5 rounded-full" style={{background:color+'20',color}}>
                          {g.category}
                        </span>
                        {g.archived && <span className="text-[9px] font-bold uppercase tracking-[.1em] px-2 py-0.5 rounded-full bg-[#f0f0f0] text-[#5F6368]">Archived</span>}
                        <span className="font-mono text-[10px] text-[#5F6368] ml-auto">{daysLeft(g.end_date)}</span>
                        <span className="font-mono text-[10px] text-[#80868B]">{duration(g.start_date,g.end_date)}</span>
                      </div>
                      {g.description && <div className="text-[12px] text-[#5F6368] mb-2">{g.description}</div>}

                      {/* Progress bars */}
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-[#efefef] rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{width:`${p}%`,background:color}} />
                          </div>
                          <span className="font-mono text-[11px] font-bold" style={{color}}>{p}%</span>
                          <span className="text-[9px] text-[#5F6368]">{doneMilestones}/{ms.length} done</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1 bg-[#efefef] rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{width:`${timePct}%`,background:'#dedede'}} />
                          </div>
                          <span className="text-[9px] text-[#5F6368] font-mono">{timePct}% time</span>
                        </div>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => toggleExpand(g.id)}
                        className="w-7 h-7 border border-[#DADCE0] rounded flex items-center justify-center text-[11px] text-[#5F6368] hover:border-[#0A0A0A] hover:text-[#0A0A0A] transition-colors"
                        title={isExpanded?'Collapse milestones':'Show milestones'}>
                        {isExpanded ? '▲' : '▼'}
                      </button>
                      {!g.archived && (
                        <button onClick={() => startEdit(g)}
                          className="w-7 h-7 border border-[#DADCE0] rounded flex items-center justify-center text-[11px] text-[#5F6368] hover:border-[#0A0A0A] hover:text-[#0A0A0A] transition-colors">✎</button>
                      )}
                      {!g.archived ? (
                        <button onClick={() => archiveGoal(g.id, true)}
                          className="w-7 h-7 border border-[#DADCE0] rounded flex items-center justify-center text-[11px] text-[#5F6368] hover:border-[#22c55e] hover:text-[#22c55e] transition-colors"
                          title="Archive (mark as accomplished)">✓</button>
                      ) : (
                        <button onClick={() => archiveGoal(g.id, false)}
                          className="w-7 h-7 border border-[#DADCE0] rounded flex items-center justify-center text-[9px] text-[#5F6368] hover:border-[#FF5C00] hover:text-[#FF5C00] transition-colors"
                          title="Unarchive">↩</button>
                      )}
                      <button onClick={() => deleteGoal(g.id)}
                        className="w-7 h-7 border border-[#DADCE0] rounded flex items-center justify-center text-[13px] text-[#5F6368] hover:bg-[#FBE9E7] hover:border-[#e0a0a0] hover:text-[#8B0000] transition-colors">×</button>
                    </div>
                  </div>
                </div>

                {/* Milestones — only shown when expanded */}
                {isExpanded && (
                  <div className="px-3 pb-3 bg-[#F8F9FA] border-t border-[#f7f7f7]">
                    <div className="pt-3">
                      {ms.map((m,i) => (
                        <div key={m.id} className="flex items-center gap-2 bg-white border border-[#E8EAED] rounded-lg px-2 mb-1 h-9 focus-within:border-[#FF5C00] transition-colors group">
                          <input type="checkbox" checked={m.done} onChange={e => toggleMilestone(g.id,m.id,e.target.checked)}
                            className="w-[13px] h-[13px] cursor-pointer flex-shrink-0" style={{accentColor:color}} />
                          <span className="font-mono text-[9px] text-[#80868B] min-w-[14px]">{i+1}</span>
                          <input className={`flex-1 bg-transparent border-none outline-none text-[12px] ${m.done?'line-through text-[#80868B]':''}`}
                            placeholder="Milestone…" value={m.text}
                            onChange={e => updateMilestone(g.id,m.id,e.target.value)} />
                          <button onClick={() => deleteMilestone(g.id,m.id)}
                            className="w-5 h-5 flex items-center justify-center text-[11px] text-[#80868B] hover:text-[#8B0000] opacity-0 group-hover:opacity-100 transition-all">×</button>
                        </div>
                      ))}
                      {!g.archived && (
                        <button onClick={() => addMilestone(g.id)}
                          className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-dashed border-[#DADCE0] text-[9px] font-bold uppercase tracking-[.08em] text-[#5F6368] hover:border-[#FF5C00] hover:text-[#FF5C00] hover:bg-[#FFF0E8] transition-colors">
                          ＋ Add milestone
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
