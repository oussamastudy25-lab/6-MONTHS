'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'

const sb = createClient()

// ── Types ──────────────────────────────────────────────────────
type Block = { id: string; date: string; start_minutes: number; end_minutes: number; title: string; category: string; color: string; note: string }
type HabitLog = { habit_id: string; status: string; date: string }
type Habit = { id: string; name: string }
type Zone = { id: string; name: string; start_hour: number; end_hour: number }
type ZoneLog = { zone_id: string; date: string; respected: boolean }

// ── Constants ──────────────────────────────────────────────────
const CATEGORIES = [
  { key:'prayer',   label:'Prayer',   color:'#06b6d4', emoji:'🕌' },
  { key:'study',    label:'Study',    color:'#8b5cf6', emoji:'📚' },
  { key:'gym',      label:'Gym/Judo', color:'#22c55e', emoji:'🏋️' },
  { key:'content',  label:'Content',  color:'#FF5C00', emoji:'🎬' },
  { key:'business', label:'Business', color:'#f59e0b', emoji:'💼' },
  { key:'rest',     label:'Rest',     color:'#94a3b8', emoji:'😴' },
  { key:'meal',     label:'Meal',     color:'#ec4899', emoji:'🍽️' },
  { key:'judo',     label:'Judo',     color:'#16a34a', emoji:'🥋' },
  { key:'quran',    label:'Quran',    color:'#0369a1', emoji:'📖' },
  { key:'other',    label:'Other',    color:'#888',    emoji:'📌' },
]
const CAT = Object.fromEntries(CATEGORIES.map(c => [c.key, c]))
const DOW_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const HOUR_START = 4   // 4am
const HOUR_END   = 24  // midnight
const SLOT_HEIGHT = 48 // px per hour
const SNAP = 30        // minute snap

// ── Helpers ────────────────────────────────────────────────────
function fmt(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function getWeekStart(d = new Date()) {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const m = new Date(d); m.setDate(d.getDate() + diff); m.setHours(0,0,0,0); return m
}
function weekDates(monday: Date): string[] {
  return Array.from({length:7}, (_,i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i); return fmt(d)
  })
}
function minsToY(mins: number) {
  return ((mins - HOUR_START * 60) / 60) * SLOT_HEIGHT
}
function yToMins(y: number, snapTo = SNAP) {
  const raw = (y / SLOT_HEIGHT) * 60 + HOUR_START * 60
  return Math.max(HOUR_START * 60, Math.round(raw / snapTo) * snapTo)
}
function minsLabel(mins: number) {
  const h = Math.floor(mins / 60) % 24
  const m = mins % 60
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2,'0')}${ampm}`
}
function blockHeight(b: Block) {
  return Math.max(20, ((b.end_minutes - b.start_minutes) / 60) * SLOT_HEIGHT)
}

// ── Component ──────────────────────────────────────────────────
export default function CalendarPage() {
  const now = new Date()
  const today = fmt(now)
  const [weekMon, setWeekMon] = useState(() => getWeekStart())
  const dates = weekDates(weekMon)

  const [blocks, setBlocks]     = useState<Block[]>([])
  const [habits, setHabits]     = useState<Habit[]>([])
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>([])
  const [zones, setZones]       = useState<Zone[]>([])
  const [zoneLogs, setZoneLogs] = useState<ZoneLog[]>([])

  // Modal state
  const [modal, setModal] = useState<{
    mode: 'create' | 'edit'
    date: string
    start_minutes: number
    end_minutes: number
    id?: string
    title: string
    category: string
    color: string
    note: string
  } | null>(null)

  // Drag-to-create state
  const dragRef = useRef<{ date: string; startY: number; startMins: number } | null>(null)
  const [dragPreview, setDragPreview] = useState<{ date: string; start: number; end: number } | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const [{ data: b }, { data: h }, { data: hl }, { data: z }, { data: zl }] = await Promise.all([
      sb.from('schedule_blocks').select('*').eq('user_id', user.id).in('date', dates).order('start_minutes'),
      sb.from('habits').select('id,name').eq('user_id', user.id).is('archived_at', null).order('position'),
      sb.from('habit_logs').select('habit_id,status,date').eq('user_id', user.id).in('date', dates),
      sb.from('phone_free_zones').select('*').eq('user_id', user.id).order('position'),
      sb.from('phone_free_logs').select('zone_id,date,respected').eq('user_id', user.id).in('date', dates),
    ])
    setBlocks(b ?? [])
    setHabits(h ?? [])
    setHabitLogs(hl ?? [])
    setZones(z ?? [])
    setZoneLogs(zl ?? [])
  }, [dates.join(',')])

  useEffect(() => { load() }, [load])

  // ── Drag to create ──────────────────────────────────────────
  function onColumnMouseDown(e: React.MouseEvent, date: string) {
    if (e.button !== 0) return
    e.preventDefault()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const y = e.clientY - rect.top
    const startMins = yToMins(y)
    dragRef.current = { date, startY: e.clientY, startMins }
    setDragPreview({ date, start: startMins, end: startMins + 60 })
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!dragRef.current || !gridRef.current) return
    const cols = gridRef.current.querySelectorAll('[data-col]')
    let colRect: DOMRect | null = null
    cols.forEach(col => {
      if ((col as HTMLElement).dataset.col === dragRef.current!.date) {
        colRect = col.getBoundingClientRect()
      }
    })
    if (!colRect) return
    const y = e.clientY - (colRect as DOMRect).top
    const endMins = yToMins(y)
    const start = Math.min(dragRef.current.startMins, endMins)
    const end = Math.max(dragRef.current.startMins, endMins) + SNAP
    setDragPreview({ date: dragRef.current.date, start: Math.max(HOUR_START*60, start), end: Math.min(HOUR_END*60, end) })
  }

  function onMouseUp() {
    if (!dragRef.current || !dragPreview) { dragRef.current = null; setDragPreview(null); return }
    const dur = dragPreview.end - dragPreview.start
    if (dur >= 15) {
      openCreate(dragPreview.date, dragPreview.start, dragPreview.end)
    }
    dragRef.current = null
    setDragPreview(null)
  }

  // ── Modal ───────────────────────────────────────────────────
  function openCreate(date: string, start_minutes: number, end_minutes: number) {
    setModal({ mode:'create', date, start_minutes, end_minutes, title:'', category:'study', color:CAT.study.color, note:'' })
  }
  function openEdit(b: Block) {
    setModal({ mode:'edit', date:b.date, start_minutes:b.start_minutes, end_minutes:b.end_minutes, title:b.title, category:b.category, color:b.color, note:b.note, id:b.id })
  }

  async function saveBlock() {
    if (!modal) return
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    if (modal.mode === 'create') {
      const { data } = await sb.from('schedule_blocks').insert({
        user_id: user.id, date: modal.date, start_minutes: modal.start_minutes,
        end_minutes: modal.end_minutes, title: modal.title || '(no title)',
        category: modal.category, color: modal.color, note: modal.note
      }).select().single()
      if (data) setBlocks(prev => [...prev, data])
    } else {
      await sb.from('schedule_blocks').update({
        title: modal.title, category: modal.category, color: modal.color,
        start_minutes: modal.start_minutes, end_minutes: modal.end_minutes, note: modal.note
      }).eq('id', modal.id!)
      setBlocks(prev => prev.map(b => b.id === modal.id ? { ...b, ...modal } : b))
    }
    setModal(null)
  }

  async function deleteBlock(id: string) {
    await sb.from('schedule_blocks').delete().eq('id', id)
    setBlocks(prev => prev.filter(b => b.id !== id))
    setModal(null)
  }

  // ── Habit completion for day header ─────────────────────────
  function dayHabitPct(date: string) {
    const dayLogs = habitLogs.filter(l => l.date === date)
    const tracked = dayLogs.filter(l => l.status !== 'na')
    const done = tracked.filter(l => l.status === 'done')
    if (tracked.length === 0) return null
    return Math.round(done.length / tracked.length * 100)
  }

  // ── Phone-free zone shading ──────────────────────────────────
  function zoneShades(date: string) {
    return zones.map(z => {
      const log = zoneLogs.find(l => l.zone_id === z.id && l.date === date)
      return { ...z, respected: log?.respected }
    })
  }

  // ── Compute column blocks avoiding overlaps ──────────────────
  function layoutBlocks(dayBlocks: Block[]) {
    // Simple overlap detection — assign column indices
    const sorted = [...dayBlocks].sort((a,b) => a.start_minutes - b.start_minutes)
    const cols: Block[][] = []
    sorted.forEach(b => {
      let placed = false
      for (const col of cols) {
        if (col[col.length-1].end_minutes <= b.start_minutes) {
          col.push(b); placed = true; break
        }
      }
      if (!placed) cols.push([b])
    })
    const result: { block: Block; colIdx: number; totalCols: number }[] = []
    cols.forEach((col, ci) => {
      col.forEach(b => {
        // Count how many cols overlap this block
        const overlapping = cols.filter(oc => oc.some(ob => ob.start_minutes < b.end_minutes && ob.end_minutes > b.start_minutes))
        result.push({ block: b, colIdx: ci, totalCols: overlapping.length })
      })
    })
    return result
  }

  const hourLabels = Array.from({length: HOUR_END - HOUR_START}, (_, i) => HOUR_START + i)
  const totalH = (HOUR_END - HOUR_START) * SLOT_HEIGHT

  return (
    <div className="flex flex-col h-full select-none">
      {/* Header */}
      <div className="bg-white px-5 py-3 border-b-2 border-[#0A0A0A] flex items-center gap-3 flex-shrink-0">
        <div className="text-[19px] font-bold tracking-[.04em]">Calendar</div>

        {/* Week nav */}
        <div className="flex items-center gap-1 ml-2">
          <button onClick={() => setWeekMon(d => { const n=new Date(d); n.setDate(n.getDate()-7); return n })}
            className="w-7 h-7 border border-[#dedede] rounded flex items-center justify-center text-[14px] text-[#888] hover:bg-[#0A0A0A] hover:text-white hover:border-[#0A0A0A] transition-colors">‹</button>
          <button onClick={() => setWeekMon(getWeekStart())}
            className="px-3 py-1 text-[9px] font-bold uppercase tracking-[.1em] border border-[#dedede] rounded text-[#888] hover:bg-[#FF5C00] hover:text-white hover:border-[#FF5C00] transition-colors">
            Today
          </button>
          <button onClick={() => setWeekMon(d => { const n=new Date(d); n.setDate(n.getDate()+7); return n })}
            className="w-7 h-7 border border-[#dedede] rounded flex items-center justify-center text-[14px] text-[#888] hover:bg-[#0A0A0A] hover:text-white hover:border-[#0A0A0A] transition-colors">›</button>
        </div>

        <div className="text-[13px] font-bold text-[#0A0A0A]">
          {weekMon.toLocaleDateString('en-GB', {month:'long', year:'numeric'})}
        </div>

        <div className="ml-auto text-[9px] text-[#bcbcbc] uppercase tracking-[.12em]">
          Click or drag to create a block
        </div>
      </div>

      {/* Calendar grid */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Day headers */}
        <div className="flex flex-shrink-0 border-b border-[#efefef] bg-white">
          <div className="w-14 flex-shrink-0 border-r border-[#efefef]" />
          {dates.map((date, i) => {
            const d = new Date(date)
            const isToday = date === today
            const pct = dayHabitPct(date)
            return (
              <div key={date} className={`flex-1 px-2 py-2 border-r border-[#efefef] last:border-0 text-center ${isToday ? 'bg-[#FFF0E8]' : ''}`}>
                <div className={`text-[9px] font-bold uppercase tracking-[.12em] ${isToday ? 'text-[#FF5C00]' : 'text-[#bcbcbc]'}`}>
                  {DOW_SHORT[d.getDay()]}
                </div>
                <div className={`text-[16px] font-bold leading-none mt-0.5 ${isToday ? 'text-[#FF5C00]' : 'text-[#0A0A0A]'}`}>
                  {d.getDate()}
                </div>
                {pct !== null && (
                  <div className="mt-1 flex items-center gap-1 justify-center">
                    <div className="w-10 h-1 bg-[#efefef] rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{width:`${pct}%`, background: pct>=80?'#22c55e':pct>=50?'#f59e0b':'#ef4444'}} />
                    </div>
                    <span className={`text-[8px] font-mono font-bold ${pct>=80?'text-[#22c55e]':pct>=50?'text-[#f59e0b]':'text-[#ef4444]'}`}>{pct}%</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Time grid */}
        <div className="flex-1 overflow-y-auto">
          <div
            ref={gridRef}
            className="flex relative"
            style={{ height: totalH }}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
          >
            {/* Hour labels */}
            <div className="w-14 flex-shrink-0 relative border-r border-[#efefef]">
              {hourLabels.map(h => (
                <div key={h} className="absolute w-full flex items-start justify-end pr-2"
                  style={{ top: (h - HOUR_START) * SLOT_HEIGHT - 8, height: SLOT_HEIGHT }}>
                  <span className="text-[9px] text-[#bcbcbc] font-mono">
                    {h === 12 ? '12pm' : h > 12 ? `${h-12}pm` : `${h}am`}
                  </span>
                </div>
              ))}
            </div>

            {/* Day columns */}
            {dates.map((date) => {
              const dayBlocks = blocks.filter(b => b.date === date)
              const laid = layoutBlocks(dayBlocks)
              const shades = zoneShades(date)
              const isToday = date === today
              const nowMins = now.getHours() * 60 + now.getMinutes()

              return (
                <div key={date}
                  data-col={date}
                  className={`flex-1 relative border-r border-[#efefef] last:border-0 cursor-crosshair ${isToday ? 'bg-[#fffaf8]' : 'bg-white'}`}
                  style={{ height: totalH }}
                  onMouseDown={e => onColumnMouseDown(e, date)}
                  onClick={e => {
                    if (dragRef.current) return
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                    const y = e.clientY - rect.top
                    const startMins = yToMins(y)
                    openCreate(date, startMins, startMins + 60)
                  }}
                >
                  {/* Hour grid lines */}
                  {hourLabels.map(h => (
                    <div key={h} className="absolute w-full border-t border-[#f3f3f3]"
                      style={{ top: (h - HOUR_START) * SLOT_HEIGHT }} />
                  ))}

                  {/* 30-min lines */}
                  {hourLabels.map(h => (
                    <div key={`h${h}`} className="absolute w-full border-t border-dashed border-[#f7f7f7]"
                      style={{ top: (h - HOUR_START) * SLOT_HEIGHT + SLOT_HEIGHT/2 }} />
                  ))}

                  {/* Phone-free zone shading */}
                  {shades.map(z => {
                    const top = minsToY(z.start_hour * 60)
                    const height = ((z.end_hour - z.start_hour)) * SLOT_HEIGHT
                    return (
                      <div key={z.id} className="absolute left-0 right-0 pointer-events-none"
                        style={{ top, height, background: z.respected === false ? 'rgba(239,68,68,.04)' : z.respected === true ? 'rgba(34,197,94,.04)' : 'rgba(239,68,68,.04)', borderLeft: '2px solid rgba(239,68,68,.2)' }}>
                        <span className="text-[8px] text-[#ef4444]/50 px-1 absolute top-0.5 left-0.5">📵</span>
                      </div>
                    )
                  })}

                  {/* Current time line */}
                  {isToday && nowMins >= HOUR_START * 60 && nowMins <= HOUR_END * 60 && (
                    <div className="absolute left-0 right-0 z-30 pointer-events-none flex items-center"
                      style={{ top: minsToY(nowMins) }}>
                      <div className="w-2 h-2 rounded-full bg-[#FF5C00] -ml-1 flex-shrink-0" />
                      <div className="flex-1 h-[2px] bg-[#FF5C00]" />
                    </div>
                  )}

                  {/* Drag preview */}
                  {dragPreview && dragPreview.date === date && (
                    <div className="absolute left-1 right-1 rounded-md z-20 pointer-events-none opacity-70"
                      style={{
                        top: minsToY(dragPreview.start) + 1,
                        height: Math.max(16, minsToY(dragPreview.end) - minsToY(dragPreview.start)),
                        background: CAT.study.color
                      }}>
                      <div className="px-1.5 py-0.5 text-[9px] text-white font-bold">
                        {minsLabel(dragPreview.start)} – {minsLabel(dragPreview.end)}
                      </div>
                    </div>
                  )}

                  {/* Blocks */}
                  {laid.map(({ block: b, colIdx, totalCols }) => {
                    const top = minsToY(b.start_minutes)
                    const height = blockHeight(b)
                    const width = `calc(${100/totalCols}% - 4px)`
                    const left = `calc(${colIdx * 100/totalCols}% + 2px)`
                    const cat = CAT[b.category] ?? CAT.other
                    return (
                      <div
                        key={b.id}
                        className="absolute rounded-md overflow-hidden z-10 cursor-pointer hover:brightness-95 transition-all group"
                        style={{ top: top + 1, height: Math.max(18, height - 2), width, left, background: b.color }}
                        onClick={e => { e.stopPropagation(); openEdit(b) }}
                      >
                        <div className="px-1.5 py-0.5 h-full flex flex-col justify-start overflow-hidden">
                          <div className="text-[9px] text-white font-bold leading-tight truncate">
                            {cat.emoji} {b.title}
                          </div>
                          {height > 32 && (
                            <div className="text-[8px] text-white/70 font-mono leading-tight">
                              {minsLabel(b.start_minutes)}–{minsLabel(b.end_minutes)}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 backdrop-blur-sm"
          onClick={e => { if(e.target===e.currentTarget) setModal(null) }}>
          <div className="bg-white rounded-xl w-[400px] max-w-[95vw] shadow-2xl overflow-hidden">
            {/* Modal header */}
            <div className="px-5 py-4 border-b-2 border-[#0A0A0A] flex items-center gap-2">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{background: CAT[modal.category]?.color ?? '#888'}} />
              <div className="text-[14px] font-bold flex-1">
                {modal.mode === 'create' ? 'New Block' : 'Edit Block'}
              </div>
              <div className="text-[10px] text-[#888] font-mono">
                {new Date(modal.date).toLocaleDateString('en-GB', {weekday:'short', day:'numeric', month:'short'})}
              </div>
              <button onClick={() => setModal(null)} className="w-7 h-7 border border-[#dedede] rounded flex items-center justify-center text-[#888] hover:bg-[#0A0A0A] hover:text-white transition-colors">✕</button>
            </div>

            <div className="p-5 space-y-4">
              {/* Title */}
              <input
                autoFocus
                className="w-full bg-[#f7f7f7] border border-[#dedede] rounded-md px-3 py-2.5 text-[14px] font-semibold outline-none focus:border-[#FF5C00] focus:bg-white transition-colors"
                placeholder="Block title…"
                value={modal.title}
                onChange={e => setModal(m => m ? {...m, title: e.target.value} : m)}
                onKeyDown={e => e.key === 'Enter' && saveBlock()}
              />

              {/* Time */}
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="text-[9px] font-bold text-[#888] uppercase tracking-[.12em] mb-1">Start</div>
                  <select className="w-full bg-[#f7f7f7] border border-[#dedede] rounded-md px-2 py-2 text-[12px] outline-none focus:border-[#FF5C00]"
                    value={modal.start_minutes}
                    onChange={e => setModal(m => m ? {...m, start_minutes: parseInt(e.target.value)} : m)}>
                    {Array.from({length: (HOUR_END - HOUR_START) * 2}, (_, i) => {
                      const mins = HOUR_START * 60 + i * 30
                      return <option key={mins} value={mins}>{minsLabel(mins)}</option>
                    })}
                  </select>
                </div>
                <div className="text-[#bcbcbc] mt-4">→</div>
                <div className="flex-1">
                  <div className="text-[9px] font-bold text-[#888] uppercase tracking-[.12em] mb-1">End</div>
                  <select className="w-full bg-[#f7f7f7] border border-[#dedede] rounded-md px-2 py-2 text-[12px] outline-none focus:border-[#FF5C00]"
                    value={modal.end_minutes}
                    onChange={e => setModal(m => m ? {...m, end_minutes: parseInt(e.target.value)} : m)}>
                    {Array.from({length: (HOUR_END - HOUR_START) * 2}, (_, i) => {
                      const mins = HOUR_START * 60 + i * 30 + 30
                      return <option key={mins} value={mins}>{minsLabel(mins)}</option>
                    })}
                  </select>
                </div>
                <div className="mt-4 text-[10px] text-[#888] font-mono min-w-[36px]">
                  {Math.round((modal.end_minutes - modal.start_minutes))}m
                </div>
              </div>

              {/* Category */}
              <div>
                <div className="text-[9px] font-bold text-[#888] uppercase tracking-[.12em] mb-1.5">Category</div>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORIES.map(c => (
                    <button key={c.key} onClick={() => setModal(m => m ? {...m, category: c.key, color: c.color} : m)}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-bold border-2 transition-all ${modal.category === c.key ? 'text-white border-transparent' : 'border-[#efefef] text-[#888] hover:border-[#dedede]'}`}
                      style={modal.category === c.key ? {background: c.color} : {}}>
                      <span>{c.emoji}</span><span>{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Note */}
              <input className="w-full bg-[#f7f7f7] border border-[#dedede] rounded-md px-3 py-2 text-[12px] outline-none focus:border-[#FF5C00] transition-colors"
                placeholder="Note (optional)"
                value={modal.note}
                onChange={e => setModal(m => m ? {...m, note: e.target.value} : m)} />

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button onClick={saveBlock}
                  className="flex-1 py-2.5 rounded-md text-[11px] font-bold uppercase tracking-[.1em] text-white transition-all hover:opacity-90"
                  style={{background: CAT[modal.category]?.color ?? '#FF5C00'}}>
                  {modal.mode === 'create' ? 'Create Block' : 'Save Changes'}
                </button>
                {modal.mode === 'edit' && (
                  <button onClick={() => deleteBlock(modal.id!)}
                    className="px-4 py-2.5 border-2 border-[#ef4444] text-[#ef4444] text-[11px] font-bold uppercase tracking-[.1em] rounded-md hover:bg-[#FBE9E7] transition-colors">
                    Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
