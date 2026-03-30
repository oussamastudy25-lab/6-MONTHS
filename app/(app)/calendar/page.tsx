'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'

const sb = createClient()

/* ── Types ─────────────────────────────────────────────── */
type Block = { id: string; date: string; start_minutes: number; end_minutes: number; title: string; category: string; color: string; note: string; is_recurring?: boolean; recurring_id?: string }
type HabitLog = { habit_id: string; status: string; date: string }
type RecurringBlock = { id: string; title: string; category: string; color: string; start_minutes: number; end_minutes: number; days_of_week: number[]; note: string }

/* ── Constants ──────────────────────────────────────────── */
const DOW        = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const DOW_FULL   = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const MONTHS     = ['January','February','March','April','May','June','July','August','September','October','November','December']
const MONTHS_S   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const HOUR_START = 0
const HOUR_END   = 24
const PX_PER_HR  = 48
const SNAP       = 15

const COLORS = [
  '#4285f4','#0f9d58','#db4437','#f4b400','#9c27b0',
  '#FF5C00','#00bcd4','#e91e63','#607d8b','#795548',
  '#3f51b5','#009688','#ff5722','#8bc34a','#212121',
]

/* ── Helpers ───────────────────────────────────────────── */
function fmt(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function getMon(d = new Date()) {
  const day=d.getDay(), diff=day===0?-6:1-day
  const m=new Date(d); m.setDate(d.getDate()+diff); m.setHours(0,0,0,0); return m
}
function weekDates(mon: Date) {
  return Array.from({length:7},(_,i)=>{const d=new Date(mon);d.setDate(mon.getDate()+i);return fmt(d)})
}
function m2y(mins: number) { return ((mins)/60)*PX_PER_HR }
function y2m(y: number) {
  const raw=(y/PX_PER_HR)*60
  return Math.max(0, Math.min(HOUR_END*60, Math.round(raw/SNAP)*SNAP))
}
function mLabel(mins: number) {
  const h=Math.floor(mins/60)%24, m=mins%60
  const ampm=h>=12?'PM':'AM', h12=h===0?12:h>12?h-12:h
  return m===0?`${h12} ${ampm}`:`${h12}:${String(m).padStart(2,'0')} ${ampm}`
}
function durLabel(s: number, e: number) {
  const d=e-s, h=Math.floor(d/60), m=d%60
  return h>0&&m>0?`${h}h ${m}m`:h>0?`${h}h`:`${m}m`
}
function dowIdx(dateStr: string) {
  const d=new Date(dateStr).getDay(); return d===0?6:d-1
}
function monthDays(y: number, m: number) {
  const first=new Date(y,m,1), last=new Date(y,m+1,0)
  const startDow=first.getDay()===0?6:first.getDay()-1
  const days: string[] = Array(startDow).fill('')
  for(let d=1;d<=last.getDate();d++) days.push(`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`)
  return days
}

/* ── Component ─────────────────────────────────────────── */
export default function CalendarPage() {
  const now    = new Date()
  const today  = fmt(now)
  const nowMins = now.getHours()*60+now.getMinutes()

  const [view, setView]         = useState<'week'|'day'|'month'>('week')
  const [weekMon, setWeekMon]   = useState(()=>getMon())
  const [dayDate, setDayDate]   = useState(today)
  const [miniY, setMiniY]       = useState(now.getFullYear())
  const [miniM, setMiniM]       = useState(now.getMonth())

  const [blocks, setBlocks]     = useState<Block[]>([])
  const [recurring, setRecurring] = useState<RecurringBlock[]>([])
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>([])

  const dates = weekDates(weekMon)

  /* Modal */
  type MS = { mode:'create'|'edit'|'rc'|'re'; id?:string; rid?:string; date?:string
    start_minutes:number; end_minutes:number; title:string; color:string; note:string
    days_of_week?:number[] }
  const [modal, setModal] = useState<MS|null>(null)

  /* Drag */
  const drag = useRef<{type:'create'|'move'|'resize'; id?:string; date:string
    origS?:number; origE?:number; startY:number; curS:number; curE:number}|null>(null)
  const [dv, setDv] = useState<{date:string;s:number;e:number;color:string}|null>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  /* ── Load ─────────────────────────────────────────────── */
  const load = useCallback(async () => {
    const {data:{user}}=await sb.auth.getUser(); if(!user) return
    const lds = view==='week'?dates:view==='day'?[dayDate]:
      monthDays(view==='month'?miniY:now.getFullYear(), view==='month'?miniM:now.getMonth()).filter(Boolean)
    const [{data:b},{data:rb},{data:hl}] = await Promise.all([
      sb.from('schedule_blocks').select('*').eq('user_id',user.id).in('date',lds).order('start_minutes'),
      sb.from('recurring_blocks').select('*').eq('user_id',user.id).order('position'),
      sb.from('habit_logs').select('habit_id,status,date').eq('user_id',user.id).in('date',lds),
    ])
    setBlocks(b??[]); setRecurring(rb??[]); setHabitLogs(hl??[])
  }, [view, view==='week'?dates.join(','):view==='day'?dayDate:`${miniY}-${miniM}`])

  useEffect(()=>{load()},[load])

  /* ── Expand recurring for a date ──────────────────────── */
  function getBlocks(date: string): Block[] {
    const spec=blocks.filter(b=>b.date===date)
    const overridden=new Set(spec.map(b=>b.recurring_id).filter(Boolean))
    const dow=dowIdx(date)
    const rec: Block[]=recurring.filter(r=>r.days_of_week.includes(dow)&&!overridden.has(r.id))
      .map(r=>({id:`r_${r.id}_${date}`,date,start_minutes:r.start_minutes,end_minutes:r.end_minutes,
        title:r.title,category:r.category,color:r.color,note:r.note,is_recurring:true,recurring_id:r.id}))
    return [...spec,...rec].sort((a,b)=>a.start_minutes-b.start_minutes)
  }

  function habitPct(date: string) {
    const dl=habitLogs.filter(l=>l.date===date)
    const tracked=dl.filter(l=>l.status!=='na')
    if(!tracked.length) return null
    return Math.round(dl.filter(l=>l.status==='done').length/tracked.length*100)
  }

  function currentBlock() {
    if(!dates.includes(today)) return null
    return getBlocks(today).find(b=>b.start_minutes<=nowMins&&b.end_minutes>nowMins)??null
  }
  const nowBlock = currentBlock()

  /* ── Layout ───────────────────────────────────────────── */
  function layout(dayBlocks: Block[]) {
    const sorted=[...dayBlocks].sort((a,b)=>a.start_minutes-b.start_minutes)
    const cols: Block[][]=[]
    sorted.forEach(b=>{
      let placed=false
      for(const col of cols){if(col[col.length-1].end_minutes<=b.start_minutes){col.push(b);placed=true;break}}
      if(!placed) cols.push([b])
    })
    return sorted.map(b=>{
      const ci=cols.findIndex(c=>c.includes(b))
      const overlap=cols.filter(c=>c.some(ob=>ob.start_minutes<b.end_minutes&&ob.end_minutes>b.start_minutes))
      return {block:b,colIdx:ci,totalCols:overlap.length}
    })
  }

  /* ── Pointer events ───────────────────────────────────── */
  function colRect(date: string) {
    return gridRef.current?.querySelector(`[data-col="${date}"]`)?.getBoundingClientRect()??null
  }

  function onColDown(e: React.PointerEvent, date: string) {
    if(e.button!==0) return; e.preventDefault()
    const rect=colRect(date); if(!rect) return
    const s=y2m(e.clientY-rect.top)
    drag.current={type:'create',date,startY:e.clientY,curS:s,curE:s+60}
    setDv({date,s,e:s+60,color:'#4285f4'})
  }

  function onBlockDown(e: React.PointerEvent, block: Block, resize: boolean) {
    e.stopPropagation(); if(block.is_recurring||e.button!==0) return; e.preventDefault()
    drag.current={type:resize?'resize':'move',id:block.id,date:block.date,origS:block.start_minutes,origE:block.end_minutes,startY:e.clientY,curS:block.start_minutes,curE:block.end_minutes}
  }

  function onPMove(e: React.PointerEvent) {
    const d=drag.current; if(!d) return
    const rect=colRect(d.date); if(!rect) return
    const dy=e.clientY-d.startY, dm=Math.round((dy/PX_PER_HR)*60/SNAP)*SNAP
    if(d.type==='create'){
      const s=y2m(d.curS===d.curS?m2y(d.origS??y2m(d.startY-rect.top)):0)
      const e2=y2m(e.clientY-rect.top)
      const [ns,ne]=d.curS<=e2?[d.curS,Math.max(d.curS+SNAP,e2)]:[e2,d.curS+SNAP]
      d.curS=ns; d.curE=ne
      setDv({date:d.date,s:ns,e:ne,color:'#4285f4'})
    } else if(d.type==='move'){
      const ns=Math.max(0,Math.min(HOUR_END*60-SNAP,(d.origS??0)+dm))
      const dur=(d.origE??60)-(d.origS??0)
      d.curS=ns; d.curE=ns+dur
      setDv({date:d.date,s:ns,e:ns+dur,color:blocks.find(b=>b.id===d.id)?.color??'#4285f4'})
    } else {
      const ne=Math.max((d.origS??0)+SNAP,Math.min(HOUR_END*60,(d.origE??60)+dm))
      d.curE=ne
      setDv({date:d.date,s:d.origS??0,e:ne,color:blocks.find(b=>b.id===d.id)?.color??'#4285f4'})
    }
  }

  async function onPUp() {
    const d=drag.current; if(!d){setDv(null);return}
    const {data:{user}}=await sb.auth.getUser(); if(!user){drag.current=null;setDv(null);return}
    if(d.type==='create'&&d.curE-d.curS>=SNAP){
      openModal({mode:'create',date:d.date,start_minutes:d.curS,end_minutes:d.curE,title:'',color:'#4285f4',note:''})
    } else if(d.type!=='create'&&d.id){
      await sb.from('schedule_blocks').update({start_minutes:d.curS,end_minutes:d.curE}).eq('id',d.id)
      setBlocks(prev=>prev.map(b=>b.id===d.id?{...b,start_minutes:d.curS,end_minutes:d.curE}:b))
    }
    drag.current=null; setDv(null)
  }

  /* ── Modal helpers ────────────────────────────────────── */
  function openModal(m: MS){setModal(m)}

  function openEdit(block: Block){
    if(block.is_recurring){
      const rb=recurring.find(r=>r.id===block.recurring_id)
      if(rb) openModal({mode:'re',rid:rb.id,start_minutes:rb.start_minutes,end_minutes:rb.end_minutes,title:rb.title,color:rb.color,note:rb.note,days_of_week:rb.days_of_week})
    } else {
      openModal({mode:'edit',id:block.id,date:block.date,start_minutes:block.start_minutes,end_minutes:block.end_minutes,title:block.title,color:block.color,note:block.note})
    }
  }

  async function saveModal(){
    if(!modal) return
    const {data:{user}}=await sb.auth.getUser(); if(!user) return
    const title=modal.title||'(untitled)'
    if(modal.mode==='create'){
      const {data}=await sb.from('schedule_blocks').insert({user_id:user.id,date:modal.date,start_minutes:modal.start_minutes,end_minutes:modal.end_minutes,title,color:modal.color,note:modal.note,category:'other'}).select().single()
      if(data) setBlocks(p=>[...p,data])
    } else if(modal.mode==='edit'){
      await sb.from('schedule_blocks').update({title,color:modal.color,start_minutes:modal.start_minutes,end_minutes:modal.end_minutes,note:modal.note}).eq('id',modal.id!)
      setBlocks(p=>p.map(b=>b.id===modal.id?{...b,...modal,title}:b))
    } else if(modal.mode==='rc'){
      const {data}=await sb.from('recurring_blocks').insert({user_id:user.id,title,color:modal.color,start_minutes:modal.start_minutes,end_minutes:modal.end_minutes,days_of_week:modal.days_of_week??[0,1,2,3,4,5,6],note:modal.note,category:'other',position:recurring.length}).select().single()
      if(data) setRecurring(p=>[...p,data])
    } else {
      await sb.from('recurring_blocks').update({title,color:modal.color,start_minutes:modal.start_minutes,end_minutes:modal.end_minutes,days_of_week:modal.days_of_week,note:modal.note}).eq('id',modal.rid!)
      setRecurring(p=>p.map(r=>r.id===modal.rid?{...r,...modal,title,days_of_week:modal.days_of_week??r.days_of_week}:r))
    }
    setModal(null)
  }

  async function deleteBlock(id: string, isRec?: boolean, rid?: string){
    if(isRec&&rid){
      if(!confirm('Delete recurring block from all days?')) return
      await sb.from('recurring_blocks').delete().eq('id',rid)
      setRecurring(p=>p.filter(r=>r.id!==rid))
    } else {
      await sb.from('schedule_blocks').delete().eq('id',id)
      setBlocks(p=>p.filter(b=>b.id!==id))
    }
    setModal(null)
  }

  /* ── Navigate ─────────────────────────────────────────── */
  function navPrev(){
    if(view==='week') setWeekMon(d=>{const n=new Date(d);n.setDate(n.getDate()-7);return n})
    else if(view==='day') setDayDate(d=>{const n=new Date(d);n.setDate(n.getDate()-1);return fmt(n)})
    else { if(miniM===0){setMiniM(11);setMiniY(y=>y-1)}else setMiniM(m=>m-1) }
  }
  function navNext(){
    if(view==='week') setWeekMon(d=>{const n=new Date(d);n.setDate(n.getDate()+7);return n})
    else if(view==='day') setDayDate(d=>{const n=new Date(d);n.setDate(n.getDate()+1);return fmt(n)})
    else { if(miniM===11){setMiniM(0);setMiniY(y=>y+1)}else setMiniM(m=>m+1) }
  }
  function navToday(){setWeekMon(getMon());setDayDate(today);setMiniY(now.getFullYear());setMiniM(now.getMonth())}

  function navToDate(dateStr: string){
    setDayDate(dateStr); setWeekMon(getMon(new Date(dateStr)))
    setMiniY(parseInt(dateStr.slice(0,4))); setMiniM(parseInt(dateStr.slice(5,7))-1)
    if(view==='month') setView('day')
  }

  /* ── Title ────────────────────────────────────────────── */
  function headerTitle(){
    if(view==='day') return new Date(dayDate).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})
    if(view==='month') return `${MONTHS[miniM]} ${miniY}`
    // week
    const end=new Date(weekMon); end.setDate(weekMon.getDate()+6)
    if(weekMon.getMonth()===end.getMonth()) return `${MONTHS[weekMon.getMonth()]} ${weekMon.getFullYear()}`
    return `${MONTHS_S[weekMon.getMonth()]} – ${MONTHS_S[end.getMonth()]} ${end.getFullYear()}`
  }

  /* ── Time grid helpers ────────────────────────────────── */
  const hourLabels = Array.from({length:HOUR_END},(_,i)=>i)
  const totalH = HOUR_END*PX_PER_HR
  const viewDates = view==='week'?dates:[dayDate]

  /* ── RENDER ───────────────────────────────────────────── */
  return (
    <div className="flex flex-col h-full bg-white" style={{fontFamily:'Google Sans,Roboto,sans-serif'}}>

      {/* ── HEADER ─────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[#e0e0e0] flex-shrink-0">
        <button onClick={navToday}
          className="px-3.5 py-1.5 rounded-full border border-[#dadce0] text-[13px] font-medium text-[#3c4043] hover:bg-[#f1f3f4] transition-colors">
          Today
        </button>
        <button onClick={navPrev} className="w-8 h-8 rounded-full flex items-center justify-center text-[#3c4043] hover:bg-[#f1f3f4] text-[18px]">‹</button>
        <button onClick={navNext} className="w-8 h-8 rounded-full flex items-center justify-center text-[#3c4043] hover:bg-[#f1f3f4] text-[18px]">›</button>
        <span className="text-[18px] font-normal text-[#3c4043] ml-1 flex-1">{headerTitle()}</span>

        {/* NOW indicator */}
        {nowBlock && (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium mr-2"
            style={{background:`${nowBlock.color}18`,color:nowBlock.color,border:`1px solid ${nowBlock.color}30`}}>
            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{background:nowBlock.color}}/>
            {nowBlock.title} · until {mLabel(nowBlock.end_minutes)}
          </div>
        )}

        {/* Recurring button */}
        <button onClick={()=>openModal({mode:'rc',start_minutes:9*60,end_minutes:10*60,title:'',color:'#4285f4',note:'',days_of_week:[0,1,2,3,4]})}
          className="px-3 py-1.5 rounded border border-[#dadce0] text-[12px] text-[#3c4043] hover:bg-[#f1f3f4] transition-colors mr-1">
          ↻ Recurring
        </button>

        {/* View toggle */}
        <div className="flex rounded-full border border-[#dadce0] overflow-hidden">
          {(['day','week','month'] as const).map(v=>(
            <button key={v} onClick={()=>setView(v)}
              className={`px-4 py-1.5 text-[12px] font-medium capitalize transition-colors ${view===v?'bg-[#e8f0fe] text-[#1a73e8]':'text-[#3c4043] hover:bg-[#f1f3f4]'}`}>
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* ── BODY ───────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── MINI CALENDAR sidebar ───────────────────── */}
        <div className="w-[200px] flex-shrink-0 border-r border-[#e0e0e0] overflow-y-auto p-3 bg-white">
          {/* Mini nav */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] font-medium text-[#3c4043]">{MONTHS_S[miniM]} {miniY}</span>
            <div className="flex">
              <button onClick={()=>{if(miniM===0){setMiniM(11);setMiniY(y=>y-1)}else setMiniM(m=>m-1)}}
                className="w-6 h-6 rounded-full flex items-center justify-center text-[#5f6368] hover:bg-[#f1f3f4] text-[13px]">‹</button>
              <button onClick={()=>{if(miniM===11){setMiniM(0);setMiniY(y=>y+1)}else setMiniM(m=>m+1)}}
                className="w-6 h-6 rounded-full flex items-center justify-center text-[#5f6368] hover:bg-[#f1f3f4] text-[13px]">›</button>
            </div>
          </div>
          <div className="grid grid-cols-7 mb-1">
            {['M','T','W','T','F','S','S'].map((d,i)=>(
              <div key={i} className="text-center text-[10px] text-[#70757a] font-medium py-0.5">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-0.5">
            {monthDays(miniY,miniM).map((ds,i)=>{
              if(!ds) return <div key={i}/>
              const isT=ds===today
              const inView=view==='week'?dates.includes(ds):view==='day'?ds===dayDate:false
              const pct=habitPct(ds)
              const day=parseInt(ds.split('-')[2])
              return (
                <button key={ds} onClick={()=>navToDate(ds)}
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-medium mx-auto relative transition-all
                    ${isT?'bg-[#1a73e8] text-white':inView?'bg-[#e8f0fe] text-[#1a73e8]':'text-[#3c4043] hover:bg-[#f1f3f4]'}`}>
                  {day}
                  {pct!==null&&!isT&&<div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                    style={{background:pct>=80?'#0f9d58':pct>=50?'#f4b400':'#db4437'}}/>}
                </button>
              )
            })}
          </div>

          {/* Recurring list */}
          {recurring.length>0&&(
            <div className="mt-4">
              <div className="text-[10px] font-semibold text-[#5f6368] uppercase tracking-wider mb-1.5">Recurring</div>
              {recurring.map(r=>(
                <div key={r.id} className="flex items-center gap-1.5 py-1 px-1 rounded hover:bg-[#f1f3f4] cursor-pointer"
                  onClick={()=>openModal({mode:'re',rid:r.id,start_minutes:r.start_minutes,end_minutes:r.end_minutes,title:r.title,color:r.color,note:r.note,days_of_week:r.days_of_week})}>
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background:r.color}}/>
                  <span className="text-[11px] text-[#3c4043] truncate flex-1">{r.title}</span>
                  <span className="text-[9px] text-[#5f6368]">{r.days_of_week.length===7?'daily':`${r.days_of_week.length}d`}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── MAIN ───────────────────────────────────── */}
        <div className="flex-1 overflow-auto">

          {/* ─── MONTH VIEW ──────────────────────────── */}
          {view==='month' && (
            <div className="h-full flex flex-col">
              {/* DOW headers */}
              <div className="grid grid-cols-7 border-b border-[#e0e0e0]">
                {DOW.map(d=>(
                  <div key={d} className="text-center text-[11px] font-medium text-[#70757a] py-2 uppercase tracking-wider">{d}</div>
                ))}
              </div>
              {/* Day cells */}
              <div className="flex-1 grid grid-cols-7 auto-rows-fr">
                {monthDays(miniY,miniM).map((ds,i)=>{
                  if(!ds) return <div key={i} className="border-r border-b border-[#f1f3f4] bg-[#fafafa]"/>
                  const isT=ds===today
                  const dayBlocks=getBlocks(ds).slice(0,3)
                  const more=getBlocks(ds).length-3
                  const day=parseInt(ds.split('-')[2])
                  return (
                    <div key={ds} className="border-r border-b border-[#f1f3f4] p-1 cursor-pointer hover:bg-[#f8f9fa] transition-colors min-h-[80px]"
                      onClick={()=>navToDate(ds)}>
                      <div className={`text-[12px] font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1 ${isT?'bg-[#1a73e8] text-white':'text-[#3c4043]'}`}>
                        {day}
                      </div>
                      {dayBlocks.map(b=>(
                        <div key={b.id} className="text-[10px] text-white rounded px-1 py-0.5 mb-0.5 truncate font-medium"
                          style={{background:b.color}}
                          onClick={e=>{e.stopPropagation();openEdit(b)}}>
                          {mLabel(b.start_minutes).replace(' AM','').replace(' PM','')} {b.title}
                        </div>
                      ))}
                      {more>0&&<div className="text-[10px] text-[#5f6368]">+{more} more</div>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ─── WEEK / DAY VIEW ─────────────────────── */}
          {view!=='month' && (
            <>
              {/* Day headers */}
              <div className="sticky top-0 z-20 bg-white border-b border-[#e0e0e0] flex"
                style={{paddingLeft:46,boxShadow:'0 1px 3px rgba(0,0,0,.1)'}}>
                {viewDates.map(date=>{
                  const d=new Date(date), isT=date===today
                  const pct=habitPct(date)
                  const dow=d.getDay()===0?6:d.getDay()-1
                  return (
                    <div key={date} className="flex-1 flex flex-col items-center py-2 border-r border-[#f1f3f4] last:border-0 cursor-pointer hover:bg-[#f8f9fa] transition-colors"
                      onClick={()=>{setDayDate(date);setView('day')}}>
                      <div className={`text-[10px] font-bold uppercase tracking-wider ${isT?'text-[#1a73e8]':'text-[#70757a]'}`}>
                        {view==='week'?DOW[dow]:DOW_FULL[dow]}
                      </div>
                      <div className={`text-[22px] font-normal w-9 h-9 flex items-center justify-center rounded-full leading-none ${isT?'bg-[#1a73e8] text-white':'text-[#3c4043] hover:bg-[#f1f3f4]'}`}>
                        {d.getDate()}
                      </div>
                      {pct!==null&&(
                        <div className="flex items-center gap-1 mt-0.5">
                          <div className="w-8 h-0.5 bg-[#e8eaed] rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{width:`${pct}%`,background:pct>=80?'#0f9d58':pct>=50?'#f4b400':'#db4437'}}/>
                          </div>
                          <span className="text-[9px] font-medium" style={{color:pct>=80?'#0f9d58':pct>=50?'#f4b400':'#db4437'}}>{pct}%</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Time grid */}
              <div ref={gridRef} className="flex relative" style={{height:totalH}}
                onPointerMove={onPMove} onPointerUp={onPUp}>

                {/* Hour labels */}
                <div className="w-12 flex-shrink-0 relative select-none border-r border-[#f1f3f4]">
                  {hourLabels.map(h=>(
                    <div key={h} className="absolute right-2 text-[10px] text-[#70757a]"
                      style={{top:h*PX_PER_HR-8,lineHeight:'16px'}}>
                      {h===0?'':h<12?`${h} AM`:h===12?'12 PM':`${h-12} PM`}
                    </div>
                  ))}
                </div>

                {/* Day columns */}
                {viewDates.map(date=>{
                  const dayBlocks=getBlocks(date)
                  const laid=layout(dayBlocks)
                  const isT=date===today
                  return (
                    <div key={date} data-col={date}
                      className="flex-1 relative border-r border-[#f1f3f4] last:border-0 bg-white"
                      style={{height:totalH,cursor:'crosshair'}}
                      onPointerDown={e=>onColDown(e,date)}>

                      {/* Grid lines */}
                      {hourLabels.map(h=>(
                        <div key={h} className="absolute left-0 right-0 border-t border-[#f1f3f4]" style={{top:h*PX_PER_HR}}/>
                      ))}
                      {hourLabels.map(h=>(
                        <div key={`h${h}`} className="absolute left-0 right-0 border-t border-dashed border-[#f8f9fa]" style={{top:h*PX_PER_HR+PX_PER_HR/2}}/>
                      ))}

                      {/* Now line */}
                      {isT&&nowMins>=0&&nowMins<=HOUR_END*60&&(
                        <div className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
                          style={{top:m2y(nowMins)}}>
                          <div className="w-2.5 h-2.5 rounded-full bg-[#ea4335] -ml-1.5 flex-shrink-0"/>
                          <div className="flex-1 h-[2px] bg-[#ea4335]"/>
                        </div>
                      )}

                      {/* Drag preview */}
                      {dv&&dv.date===date&&(
                        <div className="absolute left-0.5 right-0.5 rounded pointer-events-none z-20 opacity-75"
                          style={{top:m2y(dv.s)+1,height:Math.max(14,m2y(dv.e)-m2y(dv.s)-2),background:dv.color}}>
                          <div className="px-1.5 text-[9px] text-white font-medium pt-0.5">
                            {mLabel(dv.s)} – {mLabel(dv.e)}
                          </div>
                        </div>
                      )}

                      {/* Blocks */}
                      {laid.map(({block:b,colIdx,totalCols})=>{
                        const top=m2y(b.start_minutes)
                        const height=Math.max(22,m2y(b.end_minutes)-m2y(b.start_minutes)-1)
                        const w=`calc(${100/totalCols}% - ${totalCols>1?3:2}px)`
                        const left=`calc(${colIdx*100/totalCols}% + 1px)`
                        const isNow=isT&&nowMins>=b.start_minutes&&nowMins<b.end_minutes
                        const dur=durLabel(b.start_minutes,b.end_minutes)
                        return (
                          <div key={b.id}
                            className="absolute rounded overflow-hidden z-10 hover:brightness-95 transition-all"
                            style={{top:top+1,height,width:w,left,background:b.color,
                              cursor:b.is_recurring?'pointer':'grab',
                              outline:isNow?`2px solid ${b.color}`:undefined,
                              outlineOffset:isNow?'1px':undefined}}
                            onClick={e=>{e.stopPropagation();openEdit(b)}}
                            onPointerDown={e=>onBlockDown(e,b,false)}>
                            <div className="px-1.5 py-0.5 h-full flex flex-col overflow-hidden select-none">
                              <div className="text-[11px] text-white font-semibold leading-tight truncate">
                                {b.title}{b.is_recurring?' ↻':''}
                              </div>
                              {height>32&&(
                                <div className="text-[9px] text-white/80 leading-tight">
                                  {mLabel(b.start_minutes)}–{mLabel(b.end_minutes)} · {dur}
                                </div>
                              )}
                            </div>
                            {!b.is_recurring&&height>28&&(
                              <div className="absolute bottom-0 left-0 right-0 h-2 cursor-s-resize flex items-end justify-center pb-0.5"
                                onPointerDown={e=>onBlockDown(e,b,true)}>
                                <div className="w-5 h-0.5 bg-white/40 rounded"/>
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

      {/* ── MODAL ───────────────────────────────────────── */}
      {modal&&(
        <div className="fixed inset-0 bg-black/25 flex items-center justify-center z-50"
          onClick={e=>{if(e.target===e.currentTarget)setModal(null)}}>
          <div className="bg-white rounded-2xl w-[380px] max-w-[95vw] shadow-2xl overflow-hidden">
            {/* Color strip */}
            <div className="h-1.5 w-full" style={{background:modal.color}}/>

            <div className="px-5 pt-4 pb-5 space-y-3">
              {/* Title */}
              <input autoFocus
                className="w-full text-[16px] font-normal text-[#3c4043] outline-none border-b border-[#e0e0e0] pb-2 placeholder:text-[#bdc1c6]"
                placeholder={modal.mode.includes('r')?'Recurring block title':'Block title'}
                value={modal.title}
                onChange={e=>setModal(m=>m?{...m,title:e.target.value}:m)}
                onKeyDown={e=>e.key==='Enter'&&saveModal()}
              />

              {/* Time */}
              <div className="flex items-center gap-2">
                <span className="text-[#5f6368] text-[14px]">🕐</span>
                <select className="bg-[#f1f3f4] rounded px-2 py-1.5 text-[12px] text-[#3c4043] outline-none border-0"
                  value={modal.start_minutes}
                  onChange={e=>setModal(m=>m?{...m,start_minutes:parseInt(e.target.value)}:m)}>
                  {Array.from({length:HOUR_END*4},(_,i)=>{const v=i*15;return <option key={v} value={v}>{mLabel(v)}</option>})}
                </select>
                <span className="text-[#5f6368] text-[12px]">–</span>
                <select className="bg-[#f1f3f4] rounded px-2 py-1.5 text-[12px] text-[#3c4043] outline-none border-0"
                  value={modal.end_minutes}
                  onChange={e=>setModal(m=>m?{...m,end_minutes:parseInt(e.target.value)}:m)}>
                  {Array.from({length:HOUR_END*4},(_,i)=>{const v=i*15+15;return <option key={v} value={v}>{mLabel(v)}</option>})}
                </select>
                <span className="text-[11px] text-[#5f6368] bg-[#f1f3f4] px-2 py-1 rounded font-mono">
                  {durLabel(modal.start_minutes,modal.end_minutes)}
                </span>
              </div>

              {/* Days of week (recurring only) */}
              {modal.mode.includes('r')&&(
                <div className="flex items-center gap-1.5">
                  <span className="text-[#5f6368] text-[14px]">↻</span>
                  <div className="flex gap-1">
                    {DOW.map((d,i)=>{
                      const sel=(modal.days_of_week??[]).includes(i)
                      return (
                        <button key={d} onClick={()=>setModal(m=>{if(!m)return m;const dw=m.days_of_week??[];return{...m,days_of_week:sel?dw.filter(x=>x!==i):[...dw,i].sort()}})}
                          className={`w-8 h-8 rounded-full text-[10px] font-semibold transition-all ${sel?'text-white':'bg-[#f1f3f4] text-[#5f6368] hover:bg-[#e8eaed]'}`}
                          style={sel?{background:modal.color}:{}}>
                          {d.slice(0,1)}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Color picker */}
              <div className="flex items-center gap-2">
                <span className="text-[#5f6368] text-[14px]">🎨</span>
                <div className="flex gap-1.5 flex-wrap">
                  {COLORS.map(c=>(
                    <button key={c} onClick={()=>setModal(m=>m?{...m,color:c}:m)}
                      className={`w-5 h-5 rounded-full transition-all ${modal.color===c?'scale-125 ring-2 ring-offset-1 ring-[#5f6368]':''}`}
                      style={{background:c}}/>
                  ))}
                </div>
              </div>

              {/* Note */}
              <div className="flex items-center gap-2">
                <span className="text-[#5f6368] text-[14px]">📝</span>
                <input className="flex-1 bg-[#f1f3f4] rounded px-2.5 py-1.5 text-[12px] text-[#3c4043] outline-none placeholder:text-[#bdc1c6]"
                  placeholder="Add note"
                  value={modal.note}
                  onChange={e=>setModal(m=>m?{...m,note:e.target.value}:m)}/>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-1">
                {(modal.mode==='edit'||modal.mode==='re')&&(
                  <button onClick={()=>deleteBlock(modal.id??'',modal.mode==='re',modal.rid)}
                    className="text-[13px] text-[#ea4335] hover:bg-[#fce8e6] px-3 py-1.5 rounded-full transition-colors">
                    Delete
                  </button>
                )}
                <div className="flex gap-2 ml-auto">
                  <button onClick={()=>setModal(null)}
                    className="px-4 py-1.5 rounded-full text-[13px] font-medium text-[#1a73e8] hover:bg-[#e8f0fe] transition-colors">
                    Cancel
                  </button>
                  <button onClick={saveModal}
                    className="px-5 py-1.5 rounded-full text-[13px] font-medium text-white transition-all hover:opacity-90"
                    style={{background:modal.color}}>
                    {modal.mode.includes('create')||modal.mode==='rc'?'Save':'Update'}
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
