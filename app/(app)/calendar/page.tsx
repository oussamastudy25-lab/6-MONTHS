'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'

const sb = createClient()

/* ── Types ──────────────────────────────────────────────────────── */
type Block = { id: string; date: string; start_minutes: number; end_minutes: number; title: string; category: string; color: string; note: string; is_recurring?: boolean; recurring_id?: string }
type HabitLog = { habit_id: string; status: string; date: string }
type Zone = { id: string; name: string; start_hour: number; end_hour: number }
type RecurringBlock = { id: string; title: string; category: string; color: string; start_minutes: number; end_minutes: number; days_of_week: number[]; note: string }

/* ── Constants ──────────────────────────────────────────────────── */
const CATS = [
  { key:'prayer',   label:'Prayer',   color:'#06b6d4', emoji:'🕌' },
  { key:'study',    label:'Study',    color:'#8b5cf6', emoji:'📚' },
  { key:'gym',      label:'Gym',      color:'#22c55e', emoji:'🏋️' },
  { key:'judo',     label:'Judo',     color:'#16a34a', emoji:'🥋' },
  { key:'content',  label:'Content',  color:'#FF5C00', emoji:'🎬' },
  { key:'business', label:'Business', color:'#f59e0b', emoji:'💼' },
  { key:'rest',     label:'Rest',     color:'#94a3b8', emoji:'😴' },
  { key:'meal',     label:'Meal',     color:'#ec4899', emoji:'🍽️' },
  { key:'quran',    label:'Quran',    color:'#0369a1', emoji:'📖' },
  { key:'other',    label:'Other',    color:'#888',    emoji:'📌' },
]
const CAT = Object.fromEntries(CATS.map(c => [c.key, c]))
const DOW = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const DOW_FULL = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const MONTHS_S = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const HOUR_START = 4
const HOUR_END   = 24
const PX_PER_HOUR = 64
const SNAP_MINS  = 15

/* ── Helpers ────────────────────────────────────────────────────── */
function fmt(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function getMonday(d = new Date()) {
  const day = d.getDay(), diff = day===0?-6:1-day
  const m = new Date(d); m.setDate(d.getDate()+diff); m.setHours(0,0,0,0); return m
}
function weekDates(mon: Date): string[] {
  return Array.from({length:7},(_,i)=>{ const d=new Date(mon); d.setDate(mon.getDate()+i); return fmt(d) })
}
function minsToY(mins: number) { return ((mins - HOUR_START*60)/60)*PX_PER_HOUR }
function yToMins(y: number) {
  const raw = (y/PX_PER_HOUR)*60 + HOUR_START*60
  return Math.max(HOUR_START*60, Math.min(HOUR_END*60, Math.round(raw/SNAP_MINS)*SNAP_MINS))
}
function minsToLabel(mins: number) {
  const h=Math.floor(mins/60)%24, m=mins%60
  const ampm=h>=12?'pm':'am', h12=h===0?12:h>12?h-12:h
  return m===0?`${h12}${ampm}`:`${h12}:${String(m).padStart(2,'0')}${ampm}`
}
function durLabel(start: number, end: number) {
  const d=end-start
  const h=Math.floor(d/60), m=d%60
  return h>0&&m>0?`${h}h ${m}m`:h>0?`${h}h`:`${m}m`
}
function dowIndex(dateStr: string) {
  const d=new Date(dateStr).getDay()
  return d===0?6:d-1 // 0=Mon…6=Sun
}

/* ── Main Component ─────────────────────────────────────────────── */
export default function CalendarPage() {
  const now = new Date()
  const today = fmt(now)
  const [viewMode, setViewMode] = useState<'week'|'day'>('week')
  const [weekMon, setWeekMon] = useState(() => getMonday())
  const [dayDate, setDayDate] = useState(today)

  // Mini-calendar
  const [miniYear, setMiniYear] = useState(now.getFullYear())
  const [miniMonth, setMiniMonth] = useState(now.getMonth())

  const dates = weekDates(weekMon)

  // Data
  const [blocks, setBlocks] = useState<Block[]>([])
  const [recurringBlocks, setRecurring] = useState<RecurringBlock[]>([])
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>([])
  const [zones, setZones] = useState<Zone[]>([])

  // Modal state
  type ModalState = {
    mode: 'create'|'edit'|'recurring-create'|'recurring-edit'
    date?: string; id?: string; recurring_id?: string
    start_minutes: number; end_minutes: number
    title: string; category: string; color: string; note: string
    days_of_week?: number[]
  }
  const [modal, setModal] = useState<ModalState|null>(null)

  // Drag state (use refs for performance — no re-render during drag)
  const dragging = useRef<{
    type: 'create'|'move'|'resize'
    blockId?: string
    date: string
    origStart?: number; origEnd?: number
    startY: number; startMins: number
    currentStart: number; currentEnd: number
  }|null>(null)
  const [dragVisual, setDragVisual] = useState<{date:string;start:number;end:number;color:string}|null>(null)

  const gridRef = useRef<HTMLDivElement>(null)
  const totalH = (HOUR_END-HOUR_START)*PX_PER_HOUR

  // ── Load ────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    const {data:{user}} = await sb.auth.getUser(); if(!user) return
    const loadDates = viewMode==='week' ? dates : [dayDate]
    const [{data:b},{data:rb},{data:hl},{data:z}] = await Promise.all([
      sb.from('schedule_blocks').select('*').eq('user_id',user.id).in('date',loadDates).order('start_minutes'),
      sb.from('recurring_blocks').select('*').eq('user_id',user.id).order('position'),
      sb.from('habit_logs').select('habit_id,status,date').eq('user_id',user.id).in('date',loadDates),
      sb.from('phone_free_zones').select('*').eq('user_id',user.id),
    ])
    setBlocks(b??[])
    setRecurring(rb??[])
    setHabitLogs(hl??[])
    setZones(z??[])
  }, [viewMode, viewMode==='week'?dates.join(','):dayDate])

  useEffect(() => { load() }, [load])

  // ── Expand recurring blocks for a given date ────────────────────
  function getBlocksForDate(date: string): Block[] {
    const specific = blocks.filter(b => b.date===date)
    const overriddenRecurringIds = new Set(specific.map(b=>b.recurring_id).filter(Boolean))
    const dow = dowIndex(date)
    const recurring: Block[] = recurringBlocks
      .filter(r => r.days_of_week.includes(dow) && !overriddenRecurringIds.has(r.id))
      .map(r => ({ id:`r_${r.id}_${date}`, date, start_minutes:r.start_minutes, end_minutes:r.end_minutes, title:r.title, category:r.category, color:r.color, note:r.note, is_recurring:true, recurring_id:r.id }))
    return [...specific, ...recurring].sort((a,b) => a.start_minutes-b.start_minutes)
  }

  // ── Habit pct for day header ────────────────────────────────────
  function habitPct(date: string) {
    const dl = habitLogs.filter(l=>l.date===date)
    const tracked = dl.filter(l=>l.status!=='na')
    if(!tracked.length) return null
    return Math.round(dl.filter(l=>l.status==='done').length/tracked.length*100)
  }

  // ── Current block (what should I be doing NOW) ──────────────────
  function getCurrentBlock(): Block|null {
    if(!dates.includes(today)) return null
    const nowMins = now.getHours()*60+now.getMinutes()
    return getBlocksForDate(today).find(b => b.start_minutes<=nowMins && b.end_minutes>nowMins) ?? null
  }
  const currentBlock = getCurrentBlock()

  // ── Layout (avoid overlaps) ─────────────────────────────────────
  function layoutBlocks(dayBlocks: Block[]) {
    const sorted = [...dayBlocks].sort((a,b)=>a.start_minutes-b.start_minutes)
    const cols: Block[][] = []
    sorted.forEach(b => {
      let placed=false
      for(const col of cols) {
        if(col[col.length-1].end_minutes<=b.start_minutes){col.push(b);placed=true;break}
      }
      if(!placed) cols.push([b])
    })
    return sorted.map(b => {
      const ci = cols.findIndex(c=>c.includes(b))
      const overlap = cols.filter(c=>c.some(ob=>ob.start_minutes<b.end_minutes&&ob.end_minutes>b.start_minutes))
      return {block:b, colIdx:ci, totalCols:overlap.length}
    })
  }

  // ── Pointer event handlers ──────────────────────────────────────
  function getColRect(date: string): DOMRect|null {
    if(!gridRef.current) return null
    const el = gridRef.current.querySelector(`[data-col="${date}"]`)
    return el?.getBoundingClientRect() ?? null
  }

  function onColPointerDown(e: React.PointerEvent, date: string) {
    if(e.button!==0) return
    e.preventDefault()
    const rect = getColRect(date); if(!rect) return
    const y = e.clientY-rect.top
    const startMins = yToMins(y)
    dragging.current = { type:'create', date, startY:e.clientY, startMins, currentStart:startMins, currentEnd:startMins+60 }
    setDragVisual({date,start:startMins,end:startMins+60,color:CAT.study.color})
  }

  function onBlockPointerDown(e: React.PointerEvent, block: Block, isResize: boolean) {
    e.stopPropagation()
    if(block.is_recurring || e.button!==0) return
    e.preventDefault()
    dragging.current = {
      type: isResize?'resize':'move',
      blockId: block.id, date: block.date,
      origStart:block.start_minutes, origEnd:block.end_minutes,
      startY: e.clientY, startMins: block.start_minutes,
      currentStart:block.start_minutes, currentEnd:block.end_minutes
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = dragging.current; if(!d) return
    const rect = getColRect(d.date); if(!rect) return
    const dy = e.clientY - d.startY
    const deltaMins = Math.round((dy/PX_PER_HOUR)*60/SNAP_MINS)*SNAP_MINS

    if(d.type==='create') {
      const s = d.startMins, e2 = yToMins(e.clientY-rect.top)
      const [start,end] = s<=e2?[s,Math.max(s+SNAP_MINS,e2)]:[e2,s+SNAP_MINS]
      d.currentStart=start; d.currentEnd=end
      setDragVisual({date:d.date,start,end,color:CAT.study.color})
    } else if(d.type==='move') {
      const newStart = Math.max(HOUR_START*60, Math.min(HOUR_END*60-SNAP_MINS, d.origStart!+deltaMins))
      const dur = d.origEnd!-d.origStart!
      d.currentStart=newStart; d.currentEnd=newStart+dur
      setDragVisual({date:d.date,start:newStart,end:newStart+dur,color:blocks.find(b=>b.id===d.blockId)?.color??CAT.study.color})
    } else if(d.type==='resize') {
      const newEnd = Math.max(d.origStart!+SNAP_MINS, Math.min(HOUR_END*60, d.origEnd!+deltaMins))
      d.currentEnd=newEnd
      setDragVisual({date:d.date,start:d.origStart!,end:newEnd,color:blocks.find(b=>b.id===d.blockId)?.color??CAT.study.color})
    }
  }

  async function onPointerUp(e: React.PointerEvent) {
    const d = dragging.current; if(!d) { setDragVisual(null); return }
    const {data:{user}} = await sb.auth.getUser(); if(!user) { dragging.current=null; setDragVisual(null); return }

    if(d.type==='create') {
      if(d.currentEnd-d.currentStart>=SNAP_MINS) {
        openModal({ mode:'create', date:d.date, start_minutes:d.currentStart, end_minutes:d.currentEnd, title:'', category:'study', color:CAT.study.color, note:'' })
      }
    } else if(d.type==='move' || d.type==='resize') {
      if(d.currentStart!==d.origStart || d.currentEnd!==d.origEnd) {
        await sb.from('schedule_blocks').update({start_minutes:d.currentStart,end_minutes:d.currentEnd}).eq('id',d.blockId!)
        setBlocks(prev=>prev.map(b=>b.id===d.blockId?{...b,start_minutes:d.currentStart,end_minutes:d.currentEnd}:b))
      }
    }
    dragging.current=null; setDragVisual(null)
  }

  // ── Modal helpers ────────────────────────────────────────────────
  function openModal(m: ModalState) { setModal(m) }

  function openBlockEdit(block: Block) {
    if(block.is_recurring) {
      const rb = recurringBlocks.find(r=>r.id===block.recurring_id)
      if(rb) openModal({mode:'recurring-edit',recurring_id:rb.id,start_minutes:rb.start_minutes,end_minutes:rb.end_minutes,title:rb.title,category:rb.category,color:rb.color,note:rb.note,days_of_week:rb.days_of_week})
    } else {
      openModal({mode:'edit',id:block.id,date:block.date,start_minutes:block.start_minutes,end_minutes:block.end_minutes,title:block.title,category:block.category,color:block.color,note:block.note})
    }
  }

  async function saveModal() {
    if(!modal) return
    const {data:{user}} = await sb.auth.getUser(); if(!user) return

    if(modal.mode==='create') {
      const {data} = await sb.from('schedule_blocks').insert({user_id:user.id,date:modal.date,start_minutes:modal.start_minutes,end_minutes:modal.end_minutes,title:modal.title||'(untitled)',category:modal.category,color:modal.color,note:modal.note}).select().single()
      if(data) setBlocks(prev=>[...prev,data])
    } else if(modal.mode==='edit') {
      await sb.from('schedule_blocks').update({title:modal.title,category:modal.category,color:modal.color,start_minutes:modal.start_minutes,end_minutes:modal.end_minutes,note:modal.note}).eq('id',modal.id!)
      setBlocks(prev=>prev.map(b=>b.id===modal.id?{...b,...modal}:b))
    } else if(modal.mode==='recurring-create') {
      const {data} = await sb.from('recurring_blocks').insert({user_id:user.id,title:modal.title||'(untitled)',category:modal.category,color:modal.color,start_minutes:modal.start_minutes,end_minutes:modal.end_minutes,days_of_week:modal.days_of_week??[0,1,2,3,4,5,6],note:modal.note,position:recurringBlocks.length}).select().single()
      if(data) setRecurring(prev=>[...prev,data])
    } else if(modal.mode==='recurring-edit') {
      await sb.from('recurring_blocks').update({title:modal.title,category:modal.category,color:modal.color,start_minutes:modal.start_minutes,end_minutes:modal.end_minutes,days_of_week:modal.days_of_week,note:modal.note}).eq('id',modal.recurring_id!)
      setRecurring(prev=>prev.map(r=>r.id===modal.recurring_id?{...r,...modal,days_of_week:modal.days_of_week??r.days_of_week}:r))
    }
    setModal(null)
  }

  async function copyBlockToDate(block: Block, targetDate: string) {
    const {data:{user}} = await sb.auth.getUser(); if(!user) return
    const {data} = await sb.from('schedule_blocks').insert({user_id:user.id,date:targetDate,start_minutes:block.start_minutes,end_minutes:block.end_minutes,title:block.title,category:block.category,color:block.color,note:block.note}).select().single()
    if(data) setBlocks(prev=>[...prev,data])
    setModal(null)
  }

  async function deleteBlock(id: string, isRecurring?: boolean, recurringId?: string) {
    if(isRecurring&&recurringId) {
      if(!confirm('Delete this recurring block from all days?')) return
      await sb.from('recurring_blocks').delete().eq('id',recurringId)
      setRecurring(prev=>prev.filter(r=>r.id!==recurringId))
    } else {
      await sb.from('schedule_blocks').delete().eq('id',id)
      setBlocks(prev=>prev.filter(b=>b.id!==id))
    }
    setModal(null)
  }

  // ── Mini calendar ────────────────────────────────────────────────
  function miniCalDays() {
    const first=new Date(miniYear,miniMonth,1)
    const last=new Date(miniYear,miniMonth+1,0)
    const startDow=first.getDay()===0?6:first.getDay()-1
    const days:string[]=Array(startDow).fill('')
    for(let d=1;d<=last.getDate();d++) {
      const ds=`${miniYear}-${String(miniMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
      days.push(ds)
    }
    return days
  }

  function navigateToDate(dateStr: string) {
    const d=new Date(dateStr)
    if(viewMode==='day') { setDayDate(dateStr) }
    else { setWeekMon(getMonday(d)) }
  }

  // ── Render ───────────────────────────────────────────────────────
  const viewDates = viewMode==='week' ? dates : [dayDate]
  const hourLabels = Array.from({length:HOUR_END-HOUR_START},(_,i)=>HOUR_START+i)
  const nowMins = now.getHours()*60+now.getMinutes()

  return (
    <div className="flex flex-col h-full" style={{fontFamily:'DM Sans,sans-serif'}}>

      {/* ── HEADER ── */}
      <div className="bg-white px-5 py-2.5 border-b border-[#e0e0e0] flex items-center gap-3 flex-shrink-0">
        {/* Logo area */}
        <div className="text-[15px] font-semibold text-[#3c4043] mr-2">Calendar</div>

        {/* Nav */}
        <div className="flex items-center gap-1">
          <button onClick={() => {
            if(viewMode==='week') setWeekMon(d=>{const n=new Date(d);n.setDate(n.getDate()-7);return n})
            else setDayDate(d=>{const n=new Date(d);n.setDate(n.getDate()-1);return fmt(n)})
          }} className="w-8 h-8 rounded-full flex items-center justify-center text-[#5f6368] hover:bg-[#f1f3f4] transition-colors text-[18px]">‹</button>
          <button onClick={() => { setWeekMon(getMonday()); setDayDate(today) }}
            className="px-4 py-1.5 rounded border border-[#dadce0] text-[13px] font-medium text-[#3c4043] hover:bg-[#f1f3f4] transition-colors">Today</button>
          <button onClick={() => {
            if(viewMode==='week') setWeekMon(d=>{const n=new Date(d);n.setDate(n.getDate()+7);return n})
            else setDayDate(d=>{const n=new Date(d);n.setDate(n.getDate()+1);return fmt(n)})
          }} className="w-8 h-8 rounded-full flex items-center justify-center text-[#5f6368] hover:bg-[#f1f3f4] transition-colors text-[18px]">›</button>
        </div>

        {/* Title */}
        <div className="text-[20px] font-normal text-[#3c4043]">
          {viewMode==='week'
            ? `${MONTHS[weekMon.getMonth()]} ${weekMon.getFullYear()}`
            : `${new Date(dayDate).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}`
          }
        </div>

        {/* Current block banner */}
        {currentBlock && (
          <div className="ml-4 flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-semibold"
            style={{background:`${currentBlock.color}18`,color:currentBlock.color,border:`1px solid ${currentBlock.color}40`}}>
            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{background:currentBlock.color}} />
            NOW: {CAT[currentBlock.category]?.emoji} {currentBlock.title} · until {minsToLabel(currentBlock.end_minutes)}
          </div>
        )}

        {/* View toggle + recurring */}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={()=>openModal({mode:'recurring-create',start_minutes:9*60,end_minutes:10*60,title:'',category:'study',color:CAT.study.color,note:'',days_of_week:[0,1,2,3,4]})}
            className="px-3 py-1.5 rounded border border-[#dadce0] text-[11px] font-medium text-[#5f6368] hover:bg-[#f1f3f4] transition-colors">
            ↻ Recurring
          </button>
          <div className="flex rounded border border-[#dadce0] overflow-hidden">
            {(['week','day'] as const).map(v=>(
              <button key={v} onClick={()=>setViewMode(v)}
                className={`px-3 py-1.5 text-[12px] font-medium capitalize transition-colors ${viewMode===v?'bg-[#e8f0fe] text-[#1a73e8]':'text-[#5f6368] hover:bg-[#f1f3f4]'}`}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── BODY ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT SIDEBAR (mini calendar + recurring list) ── */}
        <div className="w-[220px] flex-shrink-0 border-r border-[#e0e0e0] overflow-y-auto bg-white">
          <div className="p-3">
            {/* Mini calendar nav */}
            <div className="flex items-center justify-between mb-1">
              <span className="text-[12px] font-medium text-[#3c4043]">{MONTHS_S[miniMonth]} {miniYear}</span>
              <div className="flex gap-0.5">
                <button onClick={()=>{if(miniMonth===0){setMiniMonth(11);setMiniYear(y=>y-1)}else setMiniMonth(m=>m-1)}}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[#5f6368] hover:bg-[#f1f3f4] text-[14px]">‹</button>
                <button onClick={()=>{if(miniMonth===11){setMiniMonth(0);setMiniYear(y=>y+1)}else setMiniMonth(m=>m+1)}}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[#5f6368] hover:bg-[#f1f3f4] text-[14px]">›</button>
              </div>
            </div>
            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1">
              {['M','T','W','T','F','S','S'].map((d,i)=>(
                <div key={i} className="text-center text-[10px] text-[#70757a] font-medium py-0.5">{d}</div>
              ))}
            </div>
            {/* Days */}
            <div className="grid grid-cols-7 gap-y-0.5">
              {miniCalDays().map((ds,i) => {
                if(!ds) return <div key={i} />
                const isToday=ds===today
                const isSelected=viewMode==='week'?dates.includes(ds):ds===dayDate
                const pct=habitPct(ds)
                const day=parseInt(ds.split('-')[2])
                return (
                  <button key={ds} onClick={()=>navigateToDate(ds)}
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-medium transition-all relative mx-auto
                      ${isToday?'bg-[#1a73e8] text-white hover:bg-[#1557b0]':isSelected?'bg-[#e8f0fe] text-[#1a73e8]':'text-[#3c4043] hover:bg-[#f1f3f4]'}`}>
                    {day}
                    {pct!==null&&!isToday&&(
                      <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                        style={{background:pct>=80?'#22c55e':pct>=50?'#f59e0b':'#ef4444'}} />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Recurring blocks list */}
          {recurringBlocks.length>0&&(
            <div className="px-3 pb-3">
              <div className="text-[10px] font-semibold text-[#5f6368] uppercase tracking-[.1em] mb-2 mt-1">Recurring</div>
              {recurringBlocks.map(r=>(
                <div key={r.id} className="flex items-center gap-2 py-1.5 cursor-pointer hover:bg-[#f1f3f4] rounded px-1.5"
                  onClick={()=>openModal({mode:'recurring-edit',recurring_id:r.id,start_minutes:r.start_minutes,end_minutes:r.end_minutes,title:r.title,category:r.category,color:r.color,note:r.note,days_of_week:r.days_of_week})}>
                  <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{background:r.color}} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-medium truncate text-[#3c4043]">{r.title}</div>
                    <div className="text-[9px] text-[#5f6368]">{minsToLabel(r.start_minutes)} · {r.days_of_week.length===7?'every day':`${r.days_of_week.length}d/week`}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── MAIN GRID ── */}
        <div className="flex-1 overflow-auto relative">
          {/* Day headers */}
          <div className="sticky top-0 z-20 bg-white border-b border-[#e0e0e0] flex" style={{paddingLeft:48}}>
            {viewDates.map(date=>{
              const d=new Date(date)
              const isToday=date===today
              const pct=habitPct(date)
              const dow=d.getDay()===0?6:d.getDay()-1
              return (
                <div key={date} className="flex-1 flex flex-col items-center py-2 border-r border-[#f1f3f4] last:border-0 cursor-pointer hover:bg-[#f8f9fa]"
                  onClick={()=>{setDayDate(date);setViewMode('day')}}>
                  <div className={`text-[11px] font-medium mb-0.5 ${isToday?'text-[#1a73e8]':'text-[#5f6368]'}`}>
                    {viewMode==='week'?DOW[dow]:DOW_FULL[dow]}
                  </div>
                  <div className={`text-[22px] font-normal leading-none w-9 h-9 flex items-center justify-center rounded-full ${isToday?'bg-[#1a73e8] text-white':'text-[#3c4043]'}`}>
                    {d.getDate()}
                  </div>
                  {pct!==null&&(
                    <div className="flex items-center gap-1 mt-1">
                      <div className="w-10 h-1 bg-[#e8eaed] rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{width:`${pct}%`,background:pct>=80?'#34a853':pct>=50?'#fbbc04':'#ea4335'}} />
                      </div>
                      <span className={`text-[9px] font-medium ${pct>=80?'text-[#34a853]':pct>=50?'text-[#fbbc04]':'text-[#ea4335]'}`}>{pct}%</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Time grid */}
          <div
            ref={gridRef}
            className="flex relative"
            style={{height:totalH}}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            {/* Hour labels */}
            <div className="w-12 flex-shrink-0 relative select-none" style={{height:totalH}}>
              {hourLabels.map(h=>(
                <div key={h} className="absolute right-2 text-[10px] text-[#70757a] font-normal"
                  style={{top:(h-HOUR_START)*PX_PER_HOUR-8,lineHeight:'16px'}}>
                  {h===12?'12 PM':h>12?`${h-12} PM`:`${h} AM`}
                </div>
              ))}
            </div>

            {/* Day columns */}
            {viewDates.map(date=>{
              const dayBlocks=getBlocksForDate(date)
              const laid=layoutBlocks(dayBlocks)
              const isToday=date===today
              const dayZones=zones.map(z=>({...z,isActive:isToday&&nowMins>=z.start_hour*60&&nowMins<z.end_hour*60}))

              return (
                <div key={date}
                  data-col={date}
                  className={`flex-1 relative border-r border-[#f1f3f4] last:border-0 ${isToday?'bg-[#fffbf7]':'bg-white'}`}
                  style={{height:totalH,cursor:'crosshair'}}
                  onPointerDown={e=>onColPointerDown(e,date)}>

                  {/* Hour lines */}
                  {hourLabels.map(h=>(
                    <div key={h} className="absolute left-0 right-0 border-t border-[#f1f3f4]"
                      style={{top:(h-HOUR_START)*PX_PER_HOUR}} />
                  ))}
                  {/* Half-hour lines */}
                  {hourLabels.map(h=>(
                    <div key={`h${h}`} className="absolute left-0 right-0 border-t border-dashed border-[#f8f9fa]"
                      style={{top:(h-HOUR_START)*PX_PER_HOUR+PX_PER_HOUR/2}} />
                  ))}

                  {/* Phone-free zone shading */}
                  {dayZones.map(z=>(
                    <div key={z.id} className="absolute left-0 right-0 pointer-events-none"
                      style={{top:minsToY(z.start_hour*60),height:(z.end_hour-z.start_hour)*PX_PER_HOUR,background:'rgba(239,68,68,.04)',borderLeft:'2px solid rgba(239,68,68,.15)'}}>
                      <span className="text-[8px] text-[#ef4444]/40 px-0.5 absolute top-0.5">📵</span>
                    </div>
                  ))}

                  {/* Now line */}
                  {isToday&&nowMins>=HOUR_START*60&&nowMins<=HOUR_END*60&&(
                    <div className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
                      style={{top:minsToY(nowMins)}}>
                      <div className="w-2.5 h-2.5 rounded-full bg-[#ea4335] -ml-1.5 flex-shrink-0 shadow" />
                      <div className="flex-1 h-[2px] bg-[#ea4335]" />
                    </div>
                  )}

                  {/* Drag preview */}
                  {dragVisual&&dragVisual.date===date&&(
                    <div className="absolute left-1 right-1 rounded-lg z-20 pointer-events-none opacity-80 shadow"
                      style={{top:minsToY(dragVisual.start)+1,height:Math.max(16,minsToY(dragVisual.end)-minsToY(dragVisual.start)-2),background:dragVisual.color}}>
                      <div className="px-2 py-1 text-[10px] text-white font-semibold">
                        {minsToLabel(dragVisual.start)} – {minsToLabel(dragVisual.end)}
                      </div>
                    </div>
                  )}

                  {/* Blocks */}
                  {laid.map(({block:b,colIdx,totalCols})=>{
                    const top=minsToY(b.start_minutes)
                    const height=Math.max(20,minsToY(b.end_minutes)-minsToY(b.start_minutes)-2)
                    const w=`calc(${100/totalCols}% - ${totalCols>1?4:2}px)`
                    const left=`calc(${colIdx*100/totalCols}% + 1px)`
                    const cat=CAT[b.category]??CAT.other
                    const isNow=isToday&&nowMins>=b.start_minutes&&nowMins<b.end_minutes
                    const isDragging=dragging.current?.blockId===b.id
                    const dur=durLabel(b.start_minutes,b.end_minutes)
                    return (
                      <div key={b.id}
                        className={`absolute rounded-lg overflow-hidden z-10 transition-shadow ${isDragging?'opacity-50':'opacity-100'} ${isNow?'ring-2 ring-offset-1':'hover:brightness-95'}`}
                        style={{top:top+1,height,width:w,left,background:b.color,cursor:b.is_recurring?'pointer':'grab',outline:isNow?`2px solid ${b.color}`:undefined}}
                        onClick={e=>{e.stopPropagation();openBlockEdit(b)}}
                        onPointerDown={e=>onBlockPointerDown(e,b,false)}>
                        <div className="px-1.5 py-1 h-full flex flex-col overflow-hidden select-none">
                          <div className="text-[10px] text-white font-semibold leading-tight truncate">
                            {cat.emoji} {b.title}
                            {b.is_recurring&&<span className="opacity-60 ml-0.5">↻</span>}
                          </div>
                          {height>30&&(
                            <div className="text-[9px] text-white/75 leading-tight mt-0.5">
                              {minsToLabel(b.start_minutes)} – {minsToLabel(b.end_minutes)} · {dur}
                            </div>
                          )}
                        </div>
                        {/* Resize handle */}
                        {!b.is_recurring&&height>24&&(
                          <div className="absolute bottom-0 left-0 right-0 h-2 cursor-s-resize flex items-center justify-center"
                            onPointerDown={e=>onBlockPointerDown(e,b,true)}>
                            <div className="w-6 h-0.5 bg-white/40 rounded" />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── MODAL ── */}
      {modal&&(
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
          onClick={e=>{if(e.target===e.currentTarget)setModal(null)}}>
          <div className="bg-white rounded-2xl w-[440px] max-w-[95vw] shadow-2xl overflow-hidden">
            <div className="px-5 pt-5 pb-0 flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{background:CAT[modal.category]?.color??'#888'}} />
              <input
                autoFocus
                className="flex-1 text-[17px] font-normal text-[#3c4043] outline-none placeholder:text-[#bdc1c6] border-b border-[#e0e0e0] pb-1"
                placeholder={modal.mode.includes('recurring')?'Recurring block name':'Block title'}
                value={modal.title}
                onChange={e=>setModal(m=>m?{...m,title:e.target.value}:m)}
                onKeyDown={e=>e.key==='Enter'&&saveModal()}
              />
              <button onClick={()=>setModal(null)} className="w-7 h-7 rounded-full flex items-center justify-center text-[#5f6368] hover:bg-[#f1f3f4] text-[16px]">✕</button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Time */}
              <div className="flex items-center gap-3">
                <div className="text-[#5f6368] text-[13px] w-4">🕐</div>
                <div className="flex items-center gap-2 flex-1">
                  <select className="bg-[#f1f3f4] border-0 rounded-lg px-2 py-1.5 text-[13px] text-[#3c4043] outline-none"
                    value={modal.start_minutes}
                    onChange={e=>setModal(m=>m?{...m,start_minutes:parseInt(e.target.value)}:m)}>
                    {Array.from({length:(HOUR_END-HOUR_START)*4},(_,i)=>{const mins=HOUR_START*60+i*15;return <option key={mins} value={mins}>{minsToLabel(mins)}</option>})}
                  </select>
                  <span className="text-[#5f6368] text-[13px]">–</span>
                  <select className="bg-[#f1f3f4] border-0 rounded-lg px-2 py-1.5 text-[13px] text-[#3c4043] outline-none"
                    value={modal.end_minutes}
                    onChange={e=>setModal(m=>m?{...m,end_minutes:parseInt(e.target.value)}:m)}>
                    {Array.from({length:(HOUR_END-HOUR_START)*4},(_,i)=>{const mins=HOUR_START*60+i*15+15;return <option key={mins} value={mins}>{minsToLabel(mins)}</option>})}
                  </select>
                  <span className="text-[11px] text-[#5f6368] bg-[#f1f3f4] px-2 py-1 rounded-lg font-mono">{durLabel(modal.start_minutes,modal.end_minutes)}</span>
                </div>
              </div>

              {/* Days of week (recurring only) */}
              {modal.mode.includes('recurring')&&(
                <div className="flex items-start gap-3">
                  <div className="text-[#5f6368] text-[13px] w-4 mt-1">↻</div>
                  <div className="flex gap-1.5 flex-wrap">
                    {DOW.map((d,i)=>{
                      const sel=(modal.days_of_week??[]).includes(i)
                      return (
                        <button key={d} onClick={()=>setModal(m=>{if(!m)return m; const dw=m.days_of_week??[]; return {...m,days_of_week:sel?dw.filter(x=>x!==i):[...dw,i].sort()}})}
                          className={`w-9 h-9 rounded-full text-[11px] font-semibold transition-all ${sel?'bg-[#1a73e8] text-white':'bg-[#f1f3f4] text-[#5f6368] hover:bg-[#e8eaed]'}`}>
                          {d}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Category */}
              <div className="flex items-start gap-3">
                <div className="text-[#5f6368] text-[13px] w-4 mt-1">🏷</div>
                <div className="flex flex-wrap gap-1.5">
                  {CATS.map(c=>(
                    <button key={c.key} onClick={()=>setModal(m=>m?{...m,category:c.key,color:c.color}:m)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${modal.category===c.key?'text-white':'text-[#5f6368] bg-[#f1f3f4] hover:bg-[#e8eaed]'}`}
                      style={modal.category===c.key?{background:c.color}:{}}>
                      {c.emoji} {c.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Note */}
              <div className="flex items-center gap-3">
                <div className="text-[#5f6368] text-[13px] w-4">📝</div>
                <input className="flex-1 bg-[#f1f3f4] rounded-lg px-3 py-2 text-[13px] text-[#3c4043] outline-none placeholder:text-[#bdc1c6]"
                  placeholder="Add note (optional)"
                  value={modal.note}
                  onChange={e=>setModal(m=>m?{...m,note:e.target.value}:m)} />
              </div>

              {/* Copy to date (edit only, non-recurring) */}
              {modal.mode==='edit'&&modal.id&&(
                <div className="flex items-center gap-3">
                  <div className="text-[#5f6368] text-[13px] w-4">📋</div>
                  <div className="flex gap-1.5 flex-wrap">
                    {dates.filter(d=>d!==modal.date).map(d=>{
                      const dow=new Date(d).getDay()===0?6:new Date(d).getDay()-1
                      return (
                        <button key={d} onClick={()=>copyBlockToDate(blocks.find(b=>b.id===modal.id)!,d)}
                          className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-[#f1f3f4] text-[#5f6368] hover:bg-[#e8f0fe] hover:text-[#1a73e8] transition-colors">
                          Copy to {DOW[dow]}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between pt-1">
                {(modal.mode==='edit'||modal.mode==='recurring-edit')&&(
                  <button onClick={()=>{
                    const m=blocks.find(b=>b.id===modal.id)
                    deleteBlock(modal.id??'',modal.mode==='recurring-edit',modal.recurring_id)
                  }} className="text-[13px] text-[#ea4335] hover:bg-[#fce8e6] px-3 py-2 rounded-full transition-colors">
                    Delete
                  </button>
                )}
                <div className="flex gap-2 ml-auto">
                  <button onClick={()=>setModal(null)} className="px-4 py-2 rounded-full text-[13px] font-medium text-[#1a73e8] hover:bg-[#e8f0fe] transition-colors">Cancel</button>
                  <button onClick={saveModal}
                    className="px-5 py-2 rounded-full text-[13px] font-medium text-white transition-all hover:opacity-90"
                    style={{background:CAT[modal.category]?.color??'#1a73e8'}}>
                    {modal.mode.includes('create')?'Save':'Update'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
