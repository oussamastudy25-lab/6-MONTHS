'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'

const sb = createClient()

/* ── Types ──────────────────────────────────────────────────────── */
type Block = {
  id: string; date: string; start_minutes: number; end_minutes: number
  title: string; category: string; color: string; note: string
  is_recurring?: boolean; recurring_id?: string
}
type HabitLog = { habit_id: string; status: string; date: string }
type RecurringBlock = {
  id: string; title: string; category: string; color: string
  start_minutes: number; end_minutes: number; days_of_week: number[]; note: string
}

/* ── Constants ──────────────────────────────────────────────────── */
const DOW       = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const DOW_FULL  = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const MONTHS    = ['January','February','March','April','May','June','July','August','September','October','November','December']
const MONTHS_S  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const HOUR_START   = 0
const HOUR_END     = 24
const PX_PER_HOUR  = 72   // taller slots
const SNAP_MINS    = 15

// Color palette — user picks freely
const COLOR_PALETTE = [
  '#4285f4','#0f9d58','#db4437','#f4b400','#ab47bc','#00acc1',
  '#ff7043','#9e9d24','#5c6bc0','#e91e63','#26a69a','#8d6e63',
  '#546e7a','#ec407a','#7e57c2','#42a5f5','#66bb6a','#ffa726',
]

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
function minsToY(mins: number) { return ((mins-HOUR_START*60)/60)*PX_PER_HOUR }
function yToMins(y: number) {
  const raw = (y/PX_PER_HOUR)*60+HOUR_START*60
  return Math.max(HOUR_START*60, Math.min(HOUR_END*60, Math.round(raw/SNAP_MINS)*SNAP_MINS))
}
function minsToLabel(mins: number) {
  const h=Math.floor(mins/60)%24, m=mins%60
  const ampm=h>=12?'pm':'am', h12=h===0?12:h>12?h-12:h
  return m===0?`${h12}${ampm}`:`${h12}:${String(m).padStart(2,'0')}${ampm}`
}
function durLabel(start: number, end: number) {
  const d=end-start, h=Math.floor(d/60), m=d%60
  return h>0&&m>0?`${h}h ${m}m`:h>0?`${h}h`:`${m}m`
}
function dowIndex(dateStr: string) {
  const d = new Date(dateStr).getDay(); return d===0?6:d-1
}
function lightenHex(hex: string, amount = 0.85): string {
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16)
  const lr=Math.round(r+(255-r)*amount), lg=Math.round(g+(255-g)*amount), lb=Math.round(b+(255-b)*amount)
  return `#${lr.toString(16).padStart(2,'0')}${lg.toString(16).padStart(2,'0')}${lb.toString(16).padStart(2,'0')}`
}

/* ── Main Component ─────────────────────────────────────────────── */
export default function CalendarPage() {
  const now = new Date()
  const today = fmt(now)
  type ViewMode = 'week'|'day'|'month'
  const [viewMode, setViewMode] = useState<ViewMode>('week')
  const [weekMon, setWeekMon] = useState(() => getMonday())
  const [dayDate, setDayDate] = useState(today)
  const [monthYear, setMonthYear] = useState(now.getFullYear())
  const [monthMonth, setMonthMonth] = useState(now.getMonth())

  // Mini-calendar sidebar
  const [miniYear, setMiniYear]   = useState(now.getFullYear())
  const [miniMonth, setMiniMonth] = useState(now.getMonth())

  const dates = weekDates(weekMon)

  // Data
  const [blocks, setBlocks]       = useState<Block[]>([])
  const [recurringBlocks, setRec] = useState<RecurringBlock[]>([])
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>([])

  // Modal
  type ModalState = {
    mode: 'create'|'edit'|'rec-create'|'rec-edit'
    date?: string; id?: string; recurring_id?: string
    start_minutes: number; end_minutes: number
    title: string; color: string; note: string; days_of_week?: number[]
  }
  const [modal, setModal] = useState<ModalState|null>(null)

  // Drag
  const dragging = useRef<{
    type: 'create'|'move'|'resize'
    blockId?: string; date: string
    origStart?: number; origEnd?: number
    startY: number; startMins: number
    currentStart: number; currentEnd: number
  }|null>(null)
  const [dragVisual, setDragVisual] = useState<{date:string;start:number;end:number;color:string}|null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const totalH = (HOUR_END-HOUR_START)*PX_PER_HOUR

  /* ── Load ── */
  const loadDates = viewMode==='week' ? dates : viewMode==='day' ? [dayDate] : (() => {
    const d: string[] = []
    const daysInM = new Date(monthYear, monthMonth+1, 0).getDate()
    for(let i=1;i<=daysInM;i++) d.push(`${monthYear}-${String(monthMonth+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`)
    return d
  })()

  const load = useCallback(async () => {
    const {data:{user}} = await sb.auth.getUser(); if(!user) return
    const [{data:b},{data:rb},{data:hl}] = await Promise.all([
      sb.from('schedule_blocks').select('*').eq('user_id',user.id).in('date',loadDates).order('start_minutes'),
      sb.from('recurring_blocks').select('*').eq('user_id',user.id).order('position'),
      sb.from('habit_logs').select('habit_id,status,date').eq('user_id',user.id).in('date',loadDates),
    ])
    setBlocks(b??[]); setRec(rb??[]); setHabitLogs(hl??[])
  }, [viewMode, viewMode==='week'?dates.join(','):viewMode==='day'?dayDate:`${monthYear}-${monthMonth}`])

  useEffect(()=>{load()},[load])

  // Scroll to current time on mount and when view changes (week/day)
  useEffect(()=>{
    if(viewMode==='month') return
    const el = scrollRef.current
    if(!el) return
    const nowMins = new Date().getHours()*60+new Date().getMinutes()
    const nowY = minsToY(nowMins)
    // Center the now line in the viewport, with some offset so you see context above
    const offset = el.clientHeight * 0.35
    el.scrollTop = Math.max(0, nowY - offset)
  },[viewMode])

  /* ── Expand recurring ── */
  function getBlocksForDate(date: string): Block[] {
    const specific = blocks.filter(b=>b.date===date)
    const overridden = new Set(specific.map(b=>b.recurring_id).filter(Boolean))
    const dow = dowIndex(date)
    const recurring: Block[] = recurringBlocks
      .filter(r=>r.days_of_week.includes(dow)&&!overridden.has(r.id))
      .map(r=>({id:`r_${r.id}_${date}`,date,start_minutes:r.start_minutes,end_minutes:r.end_minutes,title:r.title,category:r.category,color:r.color,note:r.note,is_recurring:true,recurring_id:r.id}))
    return [...specific,...recurring].sort((a,b)=>a.start_minutes-b.start_minutes)
  }

  /* ── Habit pct ── */
  function habitPct(date: string) {
    const dl=habitLogs.filter(l=>l.date===date)
    const tracked=dl.filter(l=>l.status!=='na')
    if(!tracked.length) return null
    return Math.round(dl.filter(l=>l.status==='done').length/tracked.length*100)
  }

  /* ── Now block ── */
  function getCurrentBlock(): Block|null {
    if(!dates.includes(today)) return null
    const nowMins=now.getHours()*60+now.getMinutes()
    return getBlocksForDate(today).find(b=>b.start_minutes<=nowMins&&b.end_minutes>nowMins)??null
  }
  const currentBlock = getCurrentBlock()

  /* ── Layout ── */
  function layoutBlocks(dayBlocks: Block[]) {
    const sorted=[...dayBlocks].sort((a,b)=>a.start_minutes-b.start_minutes)
    const cols: Block[][] = []
    sorted.forEach(b=>{
      let placed=false
      for(const col of cols){if(col[col.length-1].end_minutes<=b.start_minutes){col.push(b);placed=true;break}}
      if(!placed)cols.push([b])
    })
    return sorted.map(b=>{
      const ci=cols.findIndex(c=>c.includes(b))
      const overlap=cols.filter(c=>c.some(ob=>ob.start_minutes<b.end_minutes&&ob.end_minutes>b.start_minutes))
      return{block:b,colIdx:ci,totalCols:overlap.length}
    })
  }

  /* ── Drag ── */
  function getColRect(date: string): DOMRect|null {
    if(!gridRef.current) return null
    return gridRef.current.querySelector(`[data-col="${date}"]`)?.getBoundingClientRect()??null
  }

  function onColPointerDown(e: React.PointerEvent, date: string) {
    if(e.button!==0) return; e.preventDefault()
    const rect=getColRect(date); if(!rect) return
    const startMins=yToMins(e.clientY-rect.top)
    dragging.current={type:'create',date,startY:e.clientY,startMins,currentStart:startMins,currentEnd:startMins+60}
    setDragVisual({date,start:startMins,end:startMins+60,color:'#4285f4'})
  }

  function onBlockPointerDown(e: React.PointerEvent, block: Block, isResize: boolean) {
    e.stopPropagation(); if(block.is_recurring||e.button!==0) return; e.preventDefault()
    dragging.current={type:isResize?'resize':'move',blockId:block.id,date:block.date,origStart:block.start_minutes,origEnd:block.end_minutes,startY:e.clientY,startMins:block.start_minutes,currentStart:block.start_minutes,currentEnd:block.end_minutes}
  }

  function onPointerMove(e: React.PointerEvent) {
    const d=dragging.current; if(!d) return
    const rect=getColRect(d.date); if(!rect) return
    const dy=e.clientY-d.startY
    const deltaMins=Math.round((dy/PX_PER_HOUR)*60/SNAP_MINS)*SNAP_MINS
    if(d.type==='create'){
      const s=d.startMins, e2=yToMins(e.clientY-rect.top)
      const [start,end]=s<=e2?[s,Math.max(s+SNAP_MINS,e2)]:[e2,s+SNAP_MINS]
      d.currentStart=start; d.currentEnd=end
      setDragVisual({date:d.date,start,end,color:'#4285f4'})
    } else if(d.type==='move'){
      const newStart=Math.max(HOUR_START*60,Math.min(HOUR_END*60-SNAP_MINS,d.origStart!+deltaMins))
      const dur=d.origEnd!-d.origStart!
      d.currentStart=newStart; d.currentEnd=newStart+dur
      setDragVisual({date:d.date,start:newStart,end:newStart+dur,color:blocks.find(b=>b.id===d.blockId)?.color??'#4285f4'})
    } else if(d.type==='resize'){
      const newEnd=Math.max(d.origStart!+SNAP_MINS,Math.min(HOUR_END*60,d.origEnd!+deltaMins))
      d.currentEnd=newEnd
      setDragVisual({date:d.date,start:d.origStart!,end:newEnd,color:blocks.find(b=>b.id===d.blockId)?.color??'#4285f4'})
    }
  }

  async function onPointerUp() {
    const d=dragging.current; if(!d){setDragVisual(null);return}
    const {data:{user}}=await sb.auth.getUser(); if(!user){dragging.current=null;setDragVisual(null);return}
    if(d.type==='create'){
      if(d.currentEnd-d.currentStart>=SNAP_MINS)
        setModal({mode:'create',date:d.date,start_minutes:d.currentStart,end_minutes:d.currentEnd,title:'',color:'#4285f4',note:''})
    } else if(d.type==='move'||d.type==='resize'){
      if(d.currentStart!==d.origStart||d.currentEnd!==d.origEnd){
        await sb.from('schedule_blocks').update({start_minutes:d.currentStart,end_minutes:d.currentEnd}).eq('id',d.blockId!)
        setBlocks(prev=>prev.map(b=>b.id===d.blockId?{...b,start_minutes:d.currentStart,end_minutes:d.currentEnd}:b))
      }
    }
    dragging.current=null; setDragVisual(null)
  }

  /* ── Modal save / delete ── */
  async function saveModal() {
    if(!modal) return
    const {data:{user}}=await sb.auth.getUser(); if(!user) return
    if(modal.mode==='create'){
      const {data}=await sb.from('schedule_blocks').insert({user_id:user.id,date:modal.date,start_minutes:modal.start_minutes,end_minutes:modal.end_minutes,title:modal.title||'(untitled)',category:'other',color:modal.color,note:modal.note}).select().single()
      if(data)setBlocks(prev=>[...prev,data])
    } else if(modal.mode==='edit'){
      await sb.from('schedule_blocks').update({title:modal.title,color:modal.color,start_minutes:modal.start_minutes,end_minutes:modal.end_minutes,note:modal.note}).eq('id',modal.id!)
      setBlocks(prev=>prev.map(b=>b.id===modal.id?{...b,...modal}:b))
    } else if(modal.mode==='rec-create'){
      const {data}=await sb.from('recurring_blocks').insert({user_id:user.id,title:modal.title||'(untitled)',category:'other',color:modal.color,start_minutes:modal.start_minutes,end_minutes:modal.end_minutes,days_of_week:modal.days_of_week??[0,1,2,3,4,5,6],note:modal.note,position:recurringBlocks.length}).select().single()
      if(data)setRec(prev=>[...prev,data])
    } else if(modal.mode==='rec-edit'){
      await sb.from('recurring_blocks').update({title:modal.title,color:modal.color,start_minutes:modal.start_minutes,end_minutes:modal.end_minutes,days_of_week:modal.days_of_week,note:modal.note}).eq('id',modal.recurring_id!)
      setRec(prev=>prev.map(r=>r.id===modal.recurring_id?{...r,...modal,days_of_week:modal.days_of_week??r.days_of_week}:r))
    }
    setModal(null)
  }

  async function deleteBlock(id: string, isRec?: boolean, recId?: string) {
    if(isRec&&recId){
      if(!confirm('Delete this recurring block from all days?'))return
      await sb.from('recurring_blocks').delete().eq('id',recId)
      setRec(prev=>prev.filter(r=>r.id!==recId))
    } else {
      await sb.from('schedule_blocks').delete().eq('id',id)
      setBlocks(prev=>prev.filter(b=>b.id!==id))
    }
    setModal(null)
  }

  function openBlockEdit(b: Block) {
    if(b.is_recurring){
      const rb=recurringBlocks.find(r=>r.id===b.recurring_id)
      if(rb)setModal({mode:'rec-edit',recurring_id:rb.id,start_minutes:rb.start_minutes,end_minutes:rb.end_minutes,title:rb.title,color:rb.color,note:rb.note,days_of_week:rb.days_of_week})
    } else {
      setModal({mode:'edit',id:b.id,date:b.date,start_minutes:b.start_minutes,end_minutes:b.end_minutes,title:b.title,color:b.color,note:b.note})
    }
  }

  /* ── Mini calendar ── */
  function miniCalDays() {
    const first=new Date(miniYear,miniMonth,1)
    const last=new Date(miniYear,miniMonth+1,0)
    const startDow=first.getDay()===0?6:first.getDay()-1
    const days:string[]=Array(startDow).fill('')
    for(let d=1;d<=last.getDate();d++)
      days.push(`${miniYear}-${String(miniMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`)
    return days
  }

  function navigateTo(dateStr: string) {
    const d=new Date(dateStr)
    if(viewMode==='day'){setDayDate(dateStr)}
    else if(viewMode==='week'){setWeekMon(getMonday(d))}
    else{setMonthYear(d.getFullYear());setMonthMonth(d.getMonth())}
  }

  function navPrev() {
    if(viewMode==='week') setWeekMon(d=>{const n=new Date(d);n.setDate(n.getDate()-7);return n})
    else if(viewMode==='day') setDayDate(d=>{const n=new Date(d);n.setDate(n.getDate()-1);return fmt(n)})
    else { const p=monthMonth===0?{y:monthYear-1,m:11}:{y:monthYear,m:monthMonth-1}; setMonthYear(p.y);setMonthMonth(p.m) }
  }
  function navNext() {
    if(viewMode==='week') setWeekMon(d=>{const n=new Date(d);n.setDate(n.getDate()+7);return n})
    else if(viewMode==='day') setDayDate(d=>{const n=new Date(d);n.setDate(n.getDate()+1);return fmt(n)})
    else { const n=monthMonth===11?{y:monthYear+1,m:0}:{y:monthYear,m:monthMonth+1}; setMonthYear(n.y);setMonthMonth(n.m) }
  }

  function titleLabel() {
    if(viewMode==='week') {
      // Use Thursday (day 3) of the week — always falls in the dominant month
      const thu = new Date(weekMon); thu.setDate(weekMon.getDate() + 3)
      return `${MONTHS[thu.getMonth()]} ${thu.getFullYear()}`
    }
    if(viewMode==='day') return new Date(dayDate).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})
    return `${MONTHS[monthMonth]} ${monthYear}`
  }

  const hourLabels = Array.from({length:HOUR_END-HOUR_START},(_,i)=>HOUR_START+i)
  const nowMins = now.getHours()*60+now.getMinutes()
  const viewDates = viewMode==='week' ? dates : [dayDate]

  /* ══════════════════════════════════════════════════════════════ */
  return (
    <div className="flex flex-col h-full bg-white" style={{fontFamily:'Google Sans,Roboto,sans-serif'}}>

      {/* ── TOP BAR ── */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-[#e0e0e0] bg-white flex-shrink-0">
        {/* Nav */}
        <button onClick={navPrev} className="w-8 h-8 rounded-full flex items-center justify-center text-[#5f6368] hover:bg-[#f1f3f4] transition-colors text-[20px] leading-none">‹</button>
        <button onClick={()=>{setWeekMon(getMonday());setDayDate(today);setMonthYear(now.getFullYear());setMonthMonth(now.getMonth())}}
          className="px-4 py-1.5 rounded border border-[#dadce0] text-[13px] font-medium text-[#3c4043] hover:bg-[#f1f3f4] transition-colors">Today</button>
        <button onClick={navNext} className="w-8 h-8 rounded-full flex items-center justify-center text-[#5f6368] hover:bg-[#f1f3f4] transition-colors text-[20px] leading-none">›</button>

        <span className="text-[18px] font-normal text-[#3c4043] ml-1">{titleLabel()}</span>

        {/* NOW banner */}
        {currentBlock&&(
          <div className="ml-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border"
            style={{background:lightenHex(currentBlock.color,0.88),color:currentBlock.color,borderColor:lightenHex(currentBlock.color,0.6)}}>
            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{background:currentBlock.color}}/>
            NOW: {currentBlock.title} · until {minsToLabel(currentBlock.end_minutes)}
          </div>
        )}

        {/* View toggle + recurring */}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={()=>setModal({mode:'rec-create',start_minutes:9*60,end_minutes:10*60,title:'',color:'#4285f4',note:'',days_of_week:[0,1,2,3,4]})}
            className="px-3 py-1.5 rounded border border-[#dadce0] text-[11px] font-medium text-[#5f6368] hover:bg-[#f1f3f4] transition-colors">
            ↻ Recurring
          </button>
          <div className="flex rounded border border-[#dadce0] overflow-hidden text-[12px]">
            {(['day','week','month'] as const).map(v=>(
              <button key={v} onClick={()=>setViewMode(v)}
                className={`px-3 py-1.5 font-medium capitalize transition-colors ${viewMode===v?'bg-[#e8f0fe] text-[#1a73e8]':'text-[#5f6368] hover:bg-[#f1f3f4]'}`}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── BODY ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── MINI CALENDAR SIDEBAR ── */}
        <div className="w-[200px] flex-shrink-0 border-r border-[#e0e0e0] bg-white overflow-y-auto p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] font-medium text-[#3c4043]">{MONTHS_S[miniMonth]} {miniYear}</span>
            <div className="flex gap-0.5">
              <button onClick={()=>{if(miniMonth===0){setMiniMonth(11);setMiniYear(y=>y-1)}else setMiniMonth(m=>m-1)}}
                className="w-6 h-6 rounded-full flex items-center justify-center text-[#5f6368] hover:bg-[#f1f3f4] text-[15px]">‹</button>
              <button onClick={()=>{if(miniMonth===11){setMiniMonth(0);setMiniYear(y=>y+1)}else setMiniMonth(m=>m+1)}}
                className="w-6 h-6 rounded-full flex items-center justify-center text-[#5f6368] hover:bg-[#f1f3f4] text-[15px]">›</button>
            </div>
          </div>
          <div className="grid grid-cols-7 mb-1">
            {['M','T','W','T','F','S','S'].map((d,i)=>(
              <div key={i} className="text-center text-[10px] text-[#70757a] font-medium">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-0.5">
            {miniCalDays().map((ds,i)=>{
              if(!ds) return <div key={i}/>
              const isToday=ds===today
              const isSelected=viewMode==='week'?dates.includes(ds):viewMode==='day'?ds===dayDate:ds.startsWith(`${monthYear}-${String(monthMonth+1).padStart(2,'0')}`)
              const pct=habitPct(ds)
              const day=parseInt(ds.split('-')[2])
              return (
                <button key={ds} onClick={()=>navigateTo(ds)}
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-medium transition-all relative mx-auto ${isToday?'bg-[#1a73e8] text-white':isSelected?'bg-[#e8f0fe] text-[#1a73e8]':'text-[#3c4043] hover:bg-[#f1f3f4]'}`}>
                  {day}
                  {pct!==null&&!isToday&&(
                    <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                      style={{background:pct>=80?'#0f9d58':pct>=50?'#f4b400':'#db4437'}}/>
                  )}
                </button>
              )
            })}
          </div>

          {/* Recurring list */}
          {recurringBlocks.length>0&&(
            <div className="mt-3 pt-3 border-t border-[#f1f3f4]">
              <div className="text-[10px] font-semibold text-[#5f6368] uppercase tracking-[.1em] mb-1.5">Recurring</div>
              {recurringBlocks.map(r=>(
                <div key={r.id} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-[#f1f3f4] rounded px-1"
                  onClick={()=>setModal({mode:'rec-edit',recurring_id:r.id,start_minutes:r.start_minutes,end_minutes:r.end_minutes,title:r.title,color:r.color,note:r.note,days_of_week:r.days_of_week})}>
                  <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{background:r.color}}/>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-medium truncate text-[#3c4043]">{r.title}</div>
                    <div className="text-[9px] text-[#5f6368]">{minsToLabel(r.start_minutes)} · {r.days_of_week.length===7?'daily':`${r.days_of_week.length}d/wk`}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── MAIN GRID ── */}
        <div ref={scrollRef} className="flex-1 overflow-auto bg-white">

          {/* ══ MONTH VIEW ══ */}
          {viewMode==='month'&&(
            <div className="flex flex-col h-full">
              {/* Month day headers */}
              <div className="grid grid-cols-7 border-b border-[#e0e0e0]">
                {DOW.map(d=>(
                  <div key={d} className="text-center text-[11px] font-medium text-[#70757a] py-2">{d}</div>
                ))}
              </div>
              {/* Month grid */}
              <div className="flex-1 overflow-y-auto">
                {(()=>{
                  const first=new Date(monthYear,monthMonth,1)
                  const last=new Date(monthYear,monthMonth+1,0)
                  const startDow=first.getDay()===0?6:first.getDay()-1
                  const cells: (string|null)[] = Array(startDow).fill(null)
                  for(let d=1;d<=last.getDate();d++)
                    cells.push(`${monthYear}-${String(monthMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`)
                  while(cells.length%7!==0)cells.push(null)
                  const weeks:((string|null)[][])=[]
                  for(let i=0;i<cells.length;i+=7)weeks.push(cells.slice(i,i+7))
                  return weeks.map((week,wi)=>(
                    <div key={wi} className="grid grid-cols-7 border-b border-[#e0e0e0]" style={{minHeight:120}}>
                      {week.map((ds,di)=>{
                        if(!ds) return <div key={di} className="border-r border-[#e0e0e0] bg-[#fafafa]"/>
                        const isToday=ds===today
                        const dayBlocks=getBlocksForDate(ds).slice(0,3)
                        const more=getBlocksForDate(ds).length-3
                        const pct=habitPct(ds)
                        const day=parseInt(ds.split('-')[2])
                        return (
                          <div key={ds} className="border-r border-[#e0e0e0] p-1 cursor-pointer hover:bg-[#f8f9fa] transition-colors"
                            onClick={()=>{setDayDate(ds);setViewMode('day')}}>
                            <div className="flex items-center justify-between mb-1">
                              <span className={`text-[12px] font-medium w-6 h-6 flex items-center justify-center rounded-full ${isToday?'bg-[#1a73e8] text-white':'text-[#3c4043]'}`}>
                                {day}
                              </span>
                              {pct!==null&&(
                                <div className="w-1.5 h-1.5 rounded-full" style={{background:pct>=80?'#0f9d58':pct>=50?'#f4b400':'#db4437'}}/>
                              )}
                            </div>
                            {dayBlocks.map(b=>(
                              <div key={b.id} className="text-[10px] font-medium px-1 py-0.5 rounded mb-0.5 truncate text-white"
                                style={{background:b.color}}
                                onClick={e=>{e.stopPropagation();openBlockEdit(b)}}>
                                {minsToLabel(b.start_minutes)} {b.title}
                              </div>
                            ))}
                            {more>0&&<div className="text-[9px] text-[#5f6368] px-1">{more} more</div>}
                          </div>
                        )
                      })}
                    </div>
                  ))
                })()}
              </div>
            </div>
          )}

          {/* ══ WEEK / DAY VIEW ══ */}
          {viewMode!=='month'&&(
            <>
              {/* Day headers */}
              <div className="sticky top-0 z-20 bg-white border-b border-[#e0e0e0] flex" style={{paddingLeft:52}}>
                {viewDates.map(date=>{
                  const d=new Date(date)
                  const isToday=date===today
                  const pct=habitPct(date)
                  const dow=d.getDay()===0?6:d.getDay()-1
                  return (
                    <div key={date} className="flex-1 flex flex-col items-center py-1.5 border-r border-[#f1f3f4] last:border-0 cursor-pointer hover:bg-[#f8f9fa] transition-colors"
                      onClick={()=>{setDayDate(date);if(viewMode==='week')setViewMode('day')}}>
                      {/* Day label — bolder, larger */}
                      <div className={`text-[11px] font-semibold uppercase tracking-[.08em] mb-1 ${isToday?'text-[#1a73e8]':'text-[#5f6368]'}`}>
                        {viewMode==='week'?DOW[dow]:DOW_FULL[dow]}
                      </div>
                      {/* Date circle */}
                      <div className={`text-[20px] font-normal leading-none w-9 h-9 flex items-center justify-center rounded-full transition-colors ${isToday?'bg-[#1a73e8] text-white':'text-[#3c4043] hover:bg-[#f1f3f4]'}`}>
                        {d.getDate()}
                      </div>
                      {/* Habit bar */}
                      {pct!==null&&(
                        <div className="flex items-center gap-1 mt-1.5">
                          <div className="w-10 h-1 bg-[#e8eaed] rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{width:`${pct}%`,background:pct>=80?'#0f9d58':pct>=50?'#f4b400':'#db4437'}}/>
                          </div>
                          <span className={`text-[9px] font-semibold ${pct>=80?'text-[#0f9d58]':pct>=50?'text-[#f4b400]':'text-[#db4437]'}`}>{pct}%</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Time grid */}
              <div ref={gridRef} className="flex relative bg-white" style={{height:totalH}}
                onPointerMove={onPointerMove} onPointerUp={onPointerUp}>

                {/* Hour labels */}
                <div className="w-[52px] flex-shrink-0 relative select-none">
                  {hourLabels.map(h=>(
                    <div key={h} className="absolute right-2 text-[10px] text-[#70757a]"
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
                  return (
                    <div key={date} data-col={date}
                      className="flex-1 relative border-r border-[#f1f3f4] last:border-0 bg-white"
                      style={{height:totalH,cursor:'crosshair'}}
                      onPointerDown={e=>onColPointerDown(e,date)}>

                      {/* Hour lines */}
                      {hourLabels.map(h=>(
                        <div key={h} className="absolute left-0 right-0 border-t border-[#f1f3f4]"
                          style={{top:(h-HOUR_START)*PX_PER_HOUR}}/>
                      ))}
                      {/* Half-hour dashed */}
                      {hourLabels.map(h=>(
                        <div key={`hh${h}`} className="absolute left-0 right-0 border-t border-dashed border-[#f8f9fa]"
                          style={{top:(h-HOUR_START)*PX_PER_HOUR+PX_PER_HOUR/2}}/>
                      ))}

                      {/* Now line */}
                      {isToday&&nowMins>=HOUR_START*60&&nowMins<=HOUR_END*60&&(
                        <div className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
                          style={{top:minsToY(nowMins)}}>
                          <div className="w-3 h-3 rounded-full bg-[#ea4335] -ml-1.5 flex-shrink-0"/>
                          <div className="flex-1 h-[2px] bg-[#ea4335]"/>
                        </div>
                      )}

                      {/* Drag preview */}
                      {dragVisual&&dragVisual.date===date&&(
                        <div className="absolute left-1 right-1 rounded-lg z-20 pointer-events-none opacity-80 shadow"
                          style={{top:minsToY(dragVisual.start)+1,height:Math.max(22,minsToY(dragVisual.end)-minsToY(dragVisual.start)-2),background:dragVisual.color}}>
                          <div className="px-2 py-1 text-[10px] text-white font-medium">
                            {minsToLabel(dragVisual.start)} – {minsToLabel(dragVisual.end)}
                          </div>
                        </div>
                      )}

                      {/* Blocks */}
                      {laid.map(({block:b,colIdx,totalCols})=>{
                        const top=minsToY(b.start_minutes)
                        const height=Math.max(28,minsToY(b.end_minutes)-minsToY(b.start_minutes)-2)
                        const w=`calc(${100/totalCols}% - ${totalCols>1?4:2}px)`
                        const left=`calc(${colIdx*100/totalCols}% + 1px)`
                        const isDragging=dragging.current?.blockId===b.id
                        return (
                          <div key={b.id}
                            className={`absolute rounded-lg overflow-hidden z-10 ${isDragging?'opacity-40':'hover:brightness-95 transition-all'}`}
                            style={{top:top+1,height,width:w,left,background:b.color,cursor:b.is_recurring?'pointer':'grab'}}
                            onClick={e=>{e.stopPropagation();openBlockEdit(b)}}
                            onPointerDown={e=>onBlockPointerDown(e,b,false)}>
                            <div className="px-2 py-1 h-full flex flex-col overflow-hidden select-none">
                              <div className="text-[11px] text-white font-semibold leading-tight truncate">
                                {b.title}{b.is_recurring&&<span className="opacity-60 ml-0.5 text-[9px]">↻</span>}
                              </div>
                              {height>36&&(
                                <div className="text-[10px] text-white/80 leading-tight mt-0.5">
                                  {minsToLabel(b.start_minutes)} – {minsToLabel(b.end_minutes)}
                                  {height>52&&<span className="ml-1 opacity-70">· {durLabel(b.start_minutes,b.end_minutes)}</span>}
                                </div>
                              )}
                            </div>
                            {/* Resize handle */}
                            {!b.is_recurring&&height>28&&(
                              <div className="absolute bottom-0 left-0 right-0 h-2 cursor-s-resize flex items-center justify-center"
                                onPointerDown={e=>onBlockPointerDown(e,b,true)}>
                                <div className="w-8 h-0.5 bg-white/40 rounded"/>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── MODAL ── */}
      {modal&&(
        <div className="fixed inset-0 bg-black/25 flex items-center justify-center z-50"
          onClick={e=>{if(e.target===e.currentTarget)setModal(null)}}>
          <div className="bg-white rounded-2xl w-[400px] max-w-[95vw] shadow-2xl overflow-hidden">
            {/* Color strip at top */}
            <div className="h-1.5 w-full" style={{background:modal.color}}/>

            <div className="px-5 py-4">
              {/* Title */}
              <input autoFocus
                className="w-full text-[17px] font-normal text-[#3c4043] outline-none placeholder:text-[#bdc1c6] border-b border-[#e0e0e0] pb-2 mb-4"
                placeholder={modal.mode.includes('rec')?'Recurring block title':'Add title'}
                value={modal.title}
                onChange={e=>setModal(m=>m?{...m,title:e.target.value}:m)}
                onKeyDown={e=>e.key==='Enter'&&saveModal()}/>

              {/* Time */}
              <div className="flex items-center gap-2 mb-4">
                <span className="text-[#5f6368] text-[15px]">🕐</span>
                <select className="bg-[#f1f3f4] border-0 rounded-lg px-3 py-1.5 text-[13px] text-[#3c4043] outline-none cursor-pointer"
                  value={modal.start_minutes}
                  onChange={e=>setModal(m=>m?{...m,start_minutes:parseInt(e.target.value)}:m)}>
                  {Array.from({length:(HOUR_END-HOUR_START)*4},(_,i)=>{const mins=HOUR_START*60+i*15;return<option key={mins} value={mins}>{minsToLabel(mins)}</option>})}
                </select>
                <span className="text-[#5f6368]">–</span>
                <select className="bg-[#f1f3f4] border-0 rounded-lg px-3 py-1.5 text-[13px] text-[#3c4043] outline-none cursor-pointer"
                  value={modal.end_minutes}
                  onChange={e=>setModal(m=>m?{...m,end_minutes:parseInt(e.target.value)}:m)}>
                  {Array.from({length:(HOUR_END-HOUR_START)*4},(_,i)=>{const mins=HOUR_START*60+i*15+15;return<option key={mins} value={mins}>{minsToLabel(mins)}</option>})}
                </select>
                <span className="text-[11px] text-[#5f6368] bg-[#f1f3f4] px-2 py-1 rounded-lg font-mono">{durLabel(modal.start_minutes,modal.end_minutes)}</span>
              </div>

              {/* Days of week (recurring only) */}
              {modal.mode.includes('rec')&&(
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-[#5f6368] text-[15px]">↻</span>
                  <div className="flex gap-1">
                    {DOW.map((d,i)=>{
                      const sel=(modal.days_of_week??[]).includes(i)
                      return (
                        <button key={d} onClick={()=>setModal(m=>{if(!m)return m;const dw=m.days_of_week??[];return{...m,days_of_week:sel?dw.filter(x=>x!==i):[...dw,i].sort()}})}
                          className={`w-8 h-8 rounded-full text-[10px] font-semibold transition-all ${sel?'text-white':'bg-[#f1f3f4] text-[#5f6368] hover:bg-[#e8eaed]'}`}
                          style={sel?{background:modal.color}:{}}>
                          {d}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Color picker */}
              <div className="flex items-center gap-2 mb-4">
                <span className="text-[#5f6368] text-[15px]">🎨</span>
                <div className="flex flex-wrap gap-2">
                  {COLOR_PALETTE.map(c=>(
                    <button key={c} onClick={()=>setModal(m=>m?{...m,color:c}:m)}
                      className="w-6 h-6 rounded-full transition-all hover:scale-110"
                      style={{background:c,outline:modal.color===c?`2px solid ${c}`:undefined,outlineOffset:modal.color===c?'2px':undefined}}/>
                  ))}
                </div>
              </div>

              {/* Note */}
              <div className="flex items-center gap-2 mb-5">
                <span className="text-[#5f6368] text-[15px]">📝</span>
                <input className="flex-1 bg-[#f1f3f4] rounded-lg px-3 py-2 text-[13px] text-[#3c4043] outline-none placeholder:text-[#bdc1c6]"
                  placeholder="Add note"
                  value={modal.note}
                  onChange={e=>setModal(m=>m?{...m,note:e.target.value}:m)}/>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between">
                {(modal.mode==='edit'||modal.mode==='rec-edit')&&(
                  <button onClick={()=>deleteBlock(modal.id??'',modal.mode==='rec-edit',modal.recurring_id)}
                    className="text-[13px] text-[#ea4335] hover:bg-[#fce8e6] px-3 py-2 rounded-full transition-colors">
                    Delete
                  </button>
                )}
                <div className="flex gap-2 ml-auto">
                  <button onClick={()=>setModal(null)} className="px-4 py-2 rounded-full text-[13px] font-medium text-[#1a73e8] hover:bg-[#e8f0fe] transition-colors">Cancel</button>
                  <button onClick={saveModal}
                    className="px-5 py-2 rounded-full text-[13px] font-medium text-white transition-all hover:opacity-90"
                    style={{background:modal.color}}>
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
