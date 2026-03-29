'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

const sb = createClient()
type Row = { id: string; name: string; position: number }
type Goal = { id: string; text: string; done: boolean; position: number }
type Metric = { id: string; name: string; unit: string; position: number }
type ExamPeriod = { id: string; name: string; start_date: string; end_date: string }

const month = new Date().toISOString().slice(0, 7)

const AddBtn = ({ onClick, label }: { onClick: () => void; label: string }) => (
  <button onClick={onClick} className="w-full flex items-center gap-1.5 px-3 py-2 rounded-md border border-dashed border-[#dedede] text-[10px] font-bold uppercase tracking-[.08em] text-[#888] hover:border-[#FF5C00] hover:text-[#FF5C00] hover:bg-[#FFF0E8] transition-colors mt-1">
    ＋ {label}
  </button>
)
const DelBtn = ({ onClick }: { onClick: () => void }) => (
  <button onClick={onClick} className="w-6 h-6 rounded border border-[#dedede] flex items-center justify-center text-[13px] text-[#888] hover:bg-[#FBE9E7] hover:border-[#e0a0a0] hover:text-[#8B0000] transition-colors flex-shrink-0">×</button>
)
const SectionTitle = ({ label }: { label: string }) => (
  <div className="text-[9px] font-bold text-[#bcbcbc] tracking-[.16em] uppercase mb-2">{label}</div>
)
const DynRow = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center gap-1.5 bg-[#f7f7f7] border border-[#efefef] rounded-md px-2 mb-1 h-10 focus-within:border-[#FF5C00] focus-within:bg-white transition-colors">
    {children}
  </div>
)

export default function SetupPage() {
  const [habits, setHabits]   = useState<Row[]>([])
  const [goals, setGoals]     = useState<Goal[]>([])
  const [nns, setNNs]         = useState<Row[]>([])
  const [bh, setBH]           = useState<Row[]>([])
  const [metrics, setMetrics] = useState<Metric[]>([])
  const [exams, setExams]     = useState<ExamPeriod[]>([])

  const load = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const uid = user.id
    const [h, g, n, b, m, e] = await Promise.all([
      sb.from('habits').select('*').eq('user_id', uid).is('archived_at', null).order('position'),
      sb.from('monthly_goals').select('*').eq('user_id', uid).eq('month', month).order('position'),
      sb.from('non_negotiables').select('*').eq('user_id', uid).order('position'),
      sb.from('bad_habits').select('*').eq('user_id', uid).order('position'),
      sb.from('weekly_metrics').select('*').eq('user_id', uid).order('position'),
      sb.from('exam_periods').select('*').eq('user_id', uid).order('start_date'),
    ])
    setHabits(h.data ?? [])
    setGoals(g.data ?? [])
    setNNs(n.data ?? [])
    setBH(b.data ?? [])
    setMetrics(m.data ?? [])
    setExams(e.data ?? [])
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

  // Monthly goals
  const addGoal = async () => {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const { data } = await sb.from('monthly_goals').insert({ user_id: user.id, month, text: '', done: false, position: goals.length }).select().single()
    if (data) setGoals(g => [...g, data])
  }
  const updateGoal = async (id: string, text: string) => {
    setGoals(g => g.map(x => x.id === id ? { ...x, text } : x))
    await sb.from('monthly_goals').update({ text }).eq('id', id)
  }
  const toggleGoal = async (id: string, done: boolean) => {
    setGoals(g => g.map(x => x.id === id ? { ...x, done } : x))
    await sb.from('monthly_goals').update({ done }).eq('id', id)
  }
  const deleteGoal = async (id: string) => {
    await sb.from('monthly_goals').delete().eq('id', id)
    setGoals(g => g.filter(x => x.id !== id))
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

  // Bad habits
  const addBH = async () => {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const { data } = await sb.from('bad_habits').insert({ user_id: user.id, name: '', position: bh.length }).select().single()
    if (data) setBH(b => [...b, data])
  }
  const updateBH = async (id: string, name: string) => {
    setBH(b => b.map(x => x.id === id ? { ...x, name } : x))
    await sb.from('bad_habits').update({ name }).eq('id', id)
  }
  const deleteBH = async (id: string) => {
    if (!confirm('Delete this bad habit and all relapse history?')) return
    await sb.from('bad_habits').delete().eq('id', id)
    setBH(b => b.filter(x => x.id !== id))
  }

  // Weekly metrics
  const addMetric = async () => {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const { data } = await sb.from('weekly_metrics').insert({ user_id: user.id, name: '', unit: '', position: metrics.length }).select().single()
    if (data) setMetrics(m => [...m, data])
  }
  const updateMetric = async (id: string, field: 'name'|'unit', val: string) => {
    setMetrics(m => m.map(x => x.id === id ? { ...x, [field]: val } : x))
    await sb.from('weekly_metrics').update({ [field]: val }).eq('id', id)
  }
  const deleteMetric = async (id: string) => {
    await sb.from('weekly_metrics').delete().eq('id', id)
    setMetrics(m => m.filter(x => x.id !== id))
  }

  // Exam periods
  const addExam = async () => {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const today = new Date().toISOString().slice(0,10)
    const end = new Date(Date.now() + 14 * 86400000).toISOString().slice(0,10)
    const { data } = await sb.from('exam_periods').insert({ user_id: user.id, name: '', start_date: today, end_date: end }).select().single()
    if (data) setExams(e => [...e, data])
  }
  const updateExam = async (id: string, field: string, val: string) => {
    setExams(e => e.map(x => x.id === id ? { ...x, [field]: val } : x))
    await sb.from('exam_periods').update({ [field]: val }).eq('id', id)
  }
  const deleteExam = async (id: string) => {
    await sb.from('exam_periods').delete().eq('id', id)
    setExams(e => e.filter(x => x.id !== id))
  }

  const monthLabel = new Date(month + '-01').toLocaleString('default', { month: 'long', year: 'numeric' })

  return (
    <>
      <div className="bg-white px-6 py-3 border-b-2 border-[#0A0A0A] flex-shrink-0">
        <div className="text-[19px] font-bold tracking-[.04em]">Setup</div>
        <div className="text-[10px] text-[#888] tracking-[.12em] uppercase mt-0.5">Configure your entire war plan</div>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid gap-6 max-w-4xl" style={{gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))'}}>

          {/* HABITS */}
          <div>
            <SectionTitle label="Daily Habits" />
            {habits.map((h,i) => (
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
            <SectionTitle label="Non-Negotiables (count ×2 in score)" />
            {nns.map((n,i) => (
              <DynRow key={n.id}>
                <span className="font-mono text-[10px] text-[#FF5C00] min-w-[16px] font-bold">{i+1}</span>
                <div className="w-px h-[18px] bg-[#dedede]" />
                <input className="flex-1 bg-transparent border-none outline-none text-[13px] font-semibold"
                  placeholder="e.g. Fajr prayer, Gym session…" value={n.name} onChange={e => updateNN(n.id, e.target.value)} />
                <DelBtn onClick={() => deleteNN(n.id)} />
              </DynRow>
            ))}
            <AddBtn onClick={addNN} label="Add non-negotiable" />
          </div>

          {/* BAD HABITS */}
          <div>
            <SectionTitle label="Bad Habits to Quit (clean days tracker)" />
            {bh.map((b,i) => (
              <DynRow key={b.id}>
                <span className="font-mono text-[10px] text-[#ef4444] min-w-[16px] font-bold">{i+1}</span>
                <div className="w-px h-[18px] bg-[#dedede]" />
                <input className="flex-1 bg-transparent border-none outline-none text-[13px]"
                  placeholder="Bad habit to quit…" value={b.name} onChange={e => updateBH(b.id, e.target.value)} />
                <DelBtn onClick={() => deleteBH(b.id)} />
              </DynRow>
            ))}
            <AddBtn onClick={addBH} label="Add bad habit" />
          </div>

          {/* MONTHLY GOALS */}
          <div>
            <SectionTitle label={`Monthly Goals · ${monthLabel}`} />
            {goals.map((g,i) => (
              <DynRow key={g.id}>
                <input type="checkbox" checked={g.done} onChange={e => toggleGoal(g.id, e.target.checked)}
                  className="w-[14px] h-[14px] accent-[#FF5C00] cursor-pointer" />
                <span className="font-mono text-[10px] text-[#bcbcbc] min-w-[13px]">{i+1}</span>
                <div className="w-px h-[18px] bg-[#dedede]" />
                <input className={`flex-1 bg-transparent border-none outline-none text-[13px] ${g.done ? 'line-through text-[#bcbcbc]' : ''}`}
                  placeholder="Monthly goal…" value={g.text} onChange={e => updateGoal(g.id, e.target.value)} />
                <DelBtn onClick={() => deleteGoal(g.id)} />
              </DynRow>
            ))}
            <AddBtn onClick={addGoal} label="Add monthly goal" />
          </div>

          {/* WEEKLY METRICS */}
          <div>
            <SectionTitle label="Weekly Metrics (track every Sunday)" />
            {metrics.map((m,i) => (
              <div key={m.id} className="flex items-center gap-1.5 bg-[#f7f7f7] border border-[#efefef] rounded-md px-2 mb-1 h-10 focus-within:border-[#FF5C00] focus-within:bg-white transition-colors">
                <span className="font-mono text-[10px] text-[#bcbcbc] min-w-[16px]">{i+1}</span>
                <div className="w-px h-[18px] bg-[#dedede]" />
                <input className="flex-1 bg-transparent border-none outline-none text-[13px]"
                  placeholder="Metric name (e.g. Followers)…" value={m.name}
                  onChange={e => updateMetric(m.id, 'name', e.target.value)} />
                <input className="w-16 bg-transparent border-none outline-none text-[11px] text-[#888] text-right"
                  placeholder="unit" value={m.unit}
                  onChange={e => updateMetric(m.id, 'unit', e.target.value)} />
                <DelBtn onClick={() => deleteMetric(m.id)} />
              </div>
            ))}
            <AddBtn onClick={addMetric} label="Add metric" />
          </div>

          {/* EXAM PERIODS */}
          <div>
            <SectionTitle label="Exam Periods (activates Exam Mode)" />
            {exams.map(e => (
              <div key={e.id} className="bg-[#f7f7f7] border border-[#efefef] rounded-md p-2 mb-2">
                <div className="flex items-center gap-2 mb-1.5">
                  <input className="flex-1 bg-transparent border-none outline-none text-[13px] font-semibold"
                    placeholder="Exam period name…" value={e.name}
                    onChange={ev => updateExam(e.id, 'name', ev.target.value)} />
                  <DelBtn onClick={() => deleteExam(e.id)} />
                </div>
                <div className="flex items-center gap-2">
                  <input type="date" className="flex-1 bg-white border border-[#dedede] rounded px-2 py-1 text-[11px] outline-none focus:border-[#FF5C00]"
                    value={e.start_date} onChange={ev => updateExam(e.id, 'start_date', ev.target.value)} />
                  <span className="text-[10px] text-[#888]">→</span>
                  <input type="date" className="flex-1 bg-white border border-[#dedede] rounded px-2 py-1 text-[11px] outline-none focus:border-[#FF5C00]"
                    value={e.end_date} onChange={ev => updateExam(e.id, 'end_date', ev.target.value)} />
                </div>
              </div>
            ))}
            <AddBtn onClick={addExam} label="Add exam period" />
          </div>

        </div>
      </div>
    </>
  )
}
