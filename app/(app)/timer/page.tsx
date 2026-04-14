'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'

const sb = createClient()
const MONTH_S = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const PRESET_COLORS = ['#FF5C00','#22c55e','#8b5cf6','#ec4899','#f59e0b','#06b6d4','#ef4444','#0A0A0A']
const PRESET_EMOJIS = ['📚','💼','🎬','🏋️','🧘','💡','✍️','🔬','🎯','⚡']

type Category = { id: string; name: string; color: string; emoji: string; target_minutes: number; position: number }
type Session  = { id: string; category_id: string; date: string; started_at: string|null; ended_at: string|null; duration_minutes: number; note: string }

// Timebox presets (minutes)
const TIMEBOX_PRESETS = [15, 25, 30, 45, 60, 90, 120]

function fmt(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function fmtTime(secs: number) {
  const h=Math.floor(secs/3600),m=Math.floor((secs%3600)/60),s=secs%60
  if(h>0)return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
}
function fmtMins(mins: number) {
  if(mins<60)return `${mins}m`
  const h=Math.floor(mins/60),m=mins%60
  return m>0?`${h}h ${m}m`:`${h}h`
}

export default function TimerPage() {
  const today = fmt()
  const [categories, setCategories] = useState<Category[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [allSessions, setAllSessions] = useState<Session[]>([])
  const [activeCat, setActiveCat] = useState<string|null>(null)
  const [running, setRunning] = useState<Session|null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [note, setNote] = useState('')
  const [showSetup, setShowSetup] = useState(false)
  const [editId, setEditId] = useState<string|null>(null)
  const [form, setForm] = useState({name:'',color:'#FF5C00',emoji:'📚',target_minutes:120})
  const timerRef = useRef<NodeJS.Timeout|null>(null)
  const [view, setView] = useState<'timer'|'analytics'>('timer')

  // Timebox state
  const [timeboxMode, setTimeboxMode] = useState(false)
  const [timeboxMins, setTimeboxMins] = useState(25)
  const [timeboxDone, setTimeboxDone] = useState(false)
  // Rest / break state
  const [restMode, setRestMode]       = useState(false)
  const [restMins, setRestMins]       = useState(5)
  const [restElapsed, setRestElapsed] = useState(0)
  const [restDone, setRestDone]       = useState(false)
  const restStartedAt = useRef<number|null>(null)  // timestamp-based, no closure issues
  // Minimum warning + 2-min rule
  const [showMinWarning, setShowMinWarning] = useState(false)
  const [showRestOffer, setShowRestOffer] = useState(false)
  const MIN_SESSION_SECS = 5 * 60  // 5 minutes minimum before we warn
  const TWO_MIN_SECS     = 2 * 60  // below 2 min → don't save at all
  // Manual session form (analytics view)
  const [showAddSession, setShowAddSession] = useState(false)
  const [addForm, setAddForm] = useState({ category_id: '', date: fmt(), duration_minutes: 60, note: '' })

  // Edit existing session record
  const [editSessionId, setEditSessionId] = useState<string|null>(null)
  const [editSessionForm, setEditSessionForm] = useState({ duration_minutes: 0, note: '' })

  // Resistance system
  const [showStopChoice, setShowStopChoice] = useState(false)
  const [resistMode, setResistMode]         = useState(false)
  const [resistCount, setResistCount]       = useState(0)   // how many 2-min blocks survived
  const [resistElapsed, setResistElapsed]   = useState(0)   // seconds into current 2-min block
  const resistStartedAt = useRef<number|null>(null)
  const resistRef = useRef<ReturnType<typeof setInterval>|null>(null)
  const RESIST_REQUIRED = 2   // must survive this many 2-min blocks to unlock Stop
  const RESIST_SECS     = 120 // 2 minutes per block

  const load = useCallback(async () => {
    const {data:{user}}=await sb.auth.getUser();if(!user)return
    const [{data:cats},{data:sess},{data:allSess}]=await Promise.all([
      sb.from('focus_categories').select('*').eq('user_id',user.id).order('position'),
      sb.from('focus_sessions').select('*').eq('user_id',user.id).eq('date',today).order('created_at'),
      sb.from('focus_sessions').select('*').eq('user_id',user.id).order('date',{ascending:false}),
    ])
    setCategories(cats??[])
    setSessions(sess??[])
    setAllSessions(allSess??[])
    const r=(sess??[]).find((s:Session)=>s.started_at&&!s.ended_at)
    if(r){
      setRunning(r)
      const base=r.duration_minutes*60
      const started=new Date(r.started_at!).getTime()
      setElapsed(base+Math.floor((Date.now()-started)/1000))
    }
    if(cats&&cats.length>0&&!activeCat)setActiveCat(cats[0].id)
  },[today,activeCat])

  useEffect(()=>{load()},[load])

  // Live tick
  useEffect(()=>{
    if(running){
      timerRef.current=setInterval(()=>{
        const base=running.duration_minutes*60
        const started=new Date(running.started_at!).getTime()
        const newElapsed=base+Math.floor((Date.now()-started)/1000)
        setElapsed(newElapsed)
        // Timebox: auto-stop when time reached
        if(timeboxMode&&!timeboxDone&&newElapsed>=timeboxMins*60){
          setTimeboxDone(true)
        }
      },1000)
    } else {
      if(timerRef.current)clearInterval(timerRef.current)
    }
    return()=>{if(timerRef.current)clearInterval(timerRef.current)}
  },[running,timeboxMode,timeboxMins,timeboxDone])

  // Browser tab title — running or resting
  useEffect(()=>{
    if(restMode){
      if(restDone){ document.title='🔔 Rest over — Ready!'; return }
      const remaining = restMins*60 - restElapsed
      const m=Math.floor(remaining/60).toString().padStart(2,'0')
      const s=(remaining%60).toString().padStart(2,'0')
      document.title=`😴 ${m}:${s} — Rest`
      return()=>{ document.title='Mizan ميزان' }
    }
    if(!running){document.title='Mizan ميزان';return}
    const cat=categories.find(c=>c.id===running.category_id)
    const mins=Math.floor(elapsed/60).toString().padStart(2,'0')
    const secs=(elapsed%60).toString().padStart(2,'0')
    document.title=`🔴 ${mins}:${secs} — ${cat?.name??'Focus'}`
    return()=>{document.title='Mizan ميزان'}
  },[running,elapsed,categories,restMode,restDone,restElapsed,restMins])

  // Rest countdown — timestamp-based so no stale closure issues
  const restRef = useRef<ReturnType<typeof setInterval>|null>(null)
  useEffect(()=>{
    if(restMode && !restDone){
      restRef.current = setInterval(()=>{
        if(!restStartedAt.current) return
        const elapsed = Math.floor((Date.now() - restStartedAt.current) / 1000)
        setRestElapsed(elapsed)
        if(elapsed >= restMins * 60) setRestDone(true)
      }, 500)
    } else {
      if(restRef.current){ clearInterval(restRef.current); restRef.current = null }
    }
    return ()=>{ if(restRef.current){ clearInterval(restRef.current); restRef.current = null } }
  },[restMode,restDone,restMins])

  // Resistance countdown effect — timestamp-based
  useEffect(()=>{
    if(resistMode){
      resistRef.current = setInterval(()=>{
        if(!resistStartedAt.current) return
        const e = Math.floor((Date.now() - resistStartedAt.current) / 1000)
        setResistElapsed(e)
        if(e >= RESIST_SECS){
          // Block survived — increment count, reset for next block
          setResistCount(n => n + 1)
          setResistElapsed(0)
          resistStartedAt.current = Date.now()
        }
      }, 500)
    } else {
      if(resistRef.current){ clearInterval(resistRef.current); resistRef.current = null }
    }
    return ()=>{ if(resistRef.current){ clearInterval(resistRef.current); resistRef.current = null } }
  },[resistMode])

  function startResist(){
    resistStartedAt.current = Date.now()
    setResistElapsed(0)
    setResistMode(true)
  }
  function cancelResist(){
    resistStartedAt.current = null
    setResistMode(false); setResistElapsed(0); setResistCount(0)
  }

  function startRest(mins:number){
    restStartedAt.current = Date.now()  // record start time
    setRestMins(mins); setRestElapsed(0); setRestDone(false); setRestMode(true)
    setTimeboxDone(false)
  }
  function endRest(){
    restStartedAt.current = null
    setRestMode(false); setRestElapsed(0); setRestDone(false)
  }
  function skipRest(){ endRest() }

  async function startTimer(){
    if(!activeCat)return
    const {data:{user}}=await sb.auth.getUser();if(!user)return
    const now=new Date().toISOString()
    const {data}=await sb.from('focus_sessions').insert({
      user_id:user.id,category_id:activeCat,date:today,started_at:now,duration_minutes:0,note
    }).select().single()
    if(data){setRunning(data);setElapsed(0);setSessions(prev=>[...prev,data]);setTimeboxDone(false);setShowRestOffer(false);setShowStopChoice(false);setResistMode(false);setResistElapsed(0);setResistCount(0);resistStartedAt.current=null}
  }

  async function stopTimer(force=false){
    if(!running)return

    // Path 1: under 2 minutes → delete the session entirely (two-minute rule)
    if(!force && elapsed < TWO_MIN_SECS){
      // Delete ghost session and clear
      await sb.from('focus_sessions').delete().eq('id',running.id)
      setSessions(prev=>prev.filter(s=>s.id!==running.id))
      setRunning(null);setElapsed(0);setNote('');setTimeboxDone(false);setShowMinWarning(false)
      setResistMode(false);setResistElapsed(0);setResistCount(0);resistStartedAt.current=null;setShowStopChoice(false)
      return
    }

    // Path 2: under minimum (5 min) but over 2 min → warn, don't stop yet
    if(!force && elapsed < MIN_SESSION_SECS && !timeboxDone){
      setShowMinWarning(true)
      return
    }

    // Path 3: normal save
    const wasTimeboxDone = timeboxDone  // capture before clearing
    setShowMinWarning(false)
    const now=new Date().toISOString()
    const addMins=Math.floor((Date.now()-new Date(running.started_at!).getTime())/60000)
    const total=running.duration_minutes+addMins
    await sb.from('focus_sessions').update({ended_at:now,duration_minutes:total,note}).eq('id',running.id)
    setSessions(prev=>prev.map(s=>s.id===running.id?{...s,ended_at:now,duration_minutes:total}:s))
    setRunning(null);setElapsed(0);setNote('');setTimeboxDone(false)
    setResistMode(false);setResistElapsed(0);setResistCount(0);resistStartedAt.current=null;setShowStopChoice(false)
    // Offer rest for free-flow stops (timebox done already has its own rest UI)
    if (!wasTimeboxDone) setShowRestOffer(true)
    load()
  }

  async function deleteSession(id:string){
    await sb.from('focus_sessions').delete().eq('id',id)
    setSessions(prev=>prev.filter(s=>s.id!==id))
    setAllSessions(prev=>prev.filter(s=>s.id!==id))
    if(running?.id===id){setRunning(null);setElapsed(0)}
  }

  async function saveEditSession(){
    if(!editSessionId||editSessionForm.duration_minutes<1)return
    await sb.from('focus_sessions').update({
      duration_minutes:editSessionForm.duration_minutes,
      note:editSessionForm.note.trim()||null,
    }).eq('id',editSessionId)
    const update=(s:Session)=>s.id===editSessionId?{...s,duration_minutes:editSessionForm.duration_minutes,note:editSessionForm.note}:s
    setSessions(prev=>prev.map(update))
    setAllSessions(prev=>prev.map(update))
    setEditSessionId(null)
  }

  async function addManualSession(){
    if(!addForm.category_id||addForm.duration_minutes<1)return
    const {data:{user}}=await sb.auth.getUser();if(!user)return
    const {data}=await sb.from('focus_sessions').insert({
      user_id:user.id,
      category_id:addForm.category_id,
      date:addForm.date,
      duration_minutes:addForm.duration_minutes,
      note:addForm.note.trim()||null,
      started_at:null,
      ended_at:new Date().toISOString(),
    }).select().single()
    if(data){
      setAllSessions(prev=>[data,...prev])
      if(addForm.date===today) setSessions(prev=>[...prev,data])
    }
    setShowAddSession(false)
    setAddForm({category_id:'',date:fmt(),duration_minutes:60,note:''})
  }

  async function saveCategory(){
    if(!form.name.trim())return
    const {data:{user}}=await sb.auth.getUser();if(!user)return
    if(editId && editId!=='new'){
      await sb.from('focus_categories').update({name:form.name,color:form.color,emoji:form.emoji,target_minutes:form.target_minutes}).eq('id',editId)
      setCategories(prev=>prev.map(c=>c.id===editId?{...c,...form}:c))
    } else {
      const {data}=await sb.from('focus_categories').insert({user_id:user.id,...form,position:categories.length}).select().single()
      if(data){setCategories(prev=>[...prev,data]);if(!activeCat)setActiveCat(data.id)}
    }
    setEditId(null)
    setForm({name:'',color:'#FF5C00',emoji:'📚',target_minutes:120})
  }

  async function deleteCategory(id:string){
    if(!confirm('Delete category and all its sessions?'))return
    await sb.from('focus_categories').delete().eq('id',id)
    setCategories(prev=>prev.filter(c=>c.id!==id))
    if(activeCat===id)setActiveCat(categories.find(c=>c.id!==id)?.id??null)
  }

  function startEdit(c:Category){
    setForm({name:c.name,color:c.color,emoji:c.emoji,target_minutes:c.target_minutes})
    setEditId(c.id);setShowSetup(true)
  }

  function todayMins(catId:string){return sessions.filter(s=>s.category_id===catId&&s.ended_at).reduce((a,s)=>a+s.duration_minutes,0)}

  function last7Days(){
    const days:string[]=[]
    for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);days.push(fmt(d))}
    return days
  }
  function weeklyByCategory(catId:string){
    return last7Days().map(d=>({
      day:d.slice(8)+' '+MONTH_S[parseInt(d.slice(5,7))-1],
      mins:allSessions.filter(s=>s.category_id===catId&&s.date===d&&s.ended_at).reduce((a,s)=>a+s.duration_minutes,0)
    }))
  }

  const currentCat=categories.find(c=>c.id===activeCat)
  const todayTotal=sessions.filter(s=>s.ended_at).reduce((a,s)=>a+s.duration_minutes,0)
  const catTodayMins=activeCat?todayMins(activeCat):0
  const targetMins=currentCat?.target_minutes??120
  const dailyPct=Math.min(100,Math.round(catTodayMins/targetMins*100))

  // Timebox progress
  const timeboxSecs=timeboxMins*60
  const timeboxElapsed=running&&running.category_id===activeCat?Math.min(elapsed,timeboxSecs):0
  const timeboxPct=timeboxMode?Math.min(100,Math.round(timeboxElapsed/timeboxSecs*100)):0
  const timeboxRemaining=Math.max(0,timeboxSecs-timeboxElapsed)

  const isRunningHere=running&&running.category_id===activeCat

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white px-6 py-3 border-b-2 border-[#0A0A0A] flex items-center flex-shrink-0">
        <div>
          <div className="text-[19px] font-bold tracking-[.04em]">Focus Timer</div>
          <div className="text-[10px] text-[#888] tracking-[.12em] uppercase mt-0.5">Total today: {fmtMins(todayTotal)}</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={()=>setView(v=>v==='timer'?'analytics':'timer')}
            className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-[.1em] border transition-all ${view==='analytics'?'bg-[#0A0A0A] text-white border-[#0A0A0A]':'border-[#dedede] text-[#888] hover:border-[#0A0A0A] hover:text-[#0A0A0A]'}`}>
            {view==='timer'?'◈ Analytics':'⏱ Timer'}
          </button>
          <button onClick={()=>{setShowSetup(s=>!s);setEditId(null);setForm({name:'',color:'#FF5C00',emoji:'📚',target_minutes:120})}}
            className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-[.1em] border transition-all ${showSetup?'bg-[#0A0A0A] text-white border-[#0A0A0A]':'border-[#dedede] text-[#888] hover:border-[#0A0A0A] hover:text-[#0A0A0A]'}`}>
            ⚙ Categories
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          {view==='timer'?(
            <div className="p-6 pb-20">
              {categories.length===0?(
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="text-5xl mb-4">⏱</div>
                  <div className="text-[16px] font-bold mb-2">No categories yet</div>
                  <div className="text-[13px] text-[#888] mb-5">Create focus categories for everything you do — Study, Business, Content, Gym.</div>
                  <button onClick={()=>setShowSetup(true)} className="bg-[#FF5C00] text-white text-[10px] font-bold uppercase tracking-[.1em] px-4 py-2 rounded-md hover:bg-[#FF7A2E] transition-colors">+ Create Category</button>
                </div>
              ):(
                <div className="max-w-xl mx-auto">
                  {/* Category tabs */}
                  <div className="flex gap-1.5 mb-5 flex-wrap">
                    {categories.map(c=>{
                      const mins=todayMins(c.id),on=activeCat===c.id
                      return (
                        <button key={c.id} onClick={()=>setActiveCat(c.id)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-md border text-[11px] font-bold transition-all ${on?'text-white border-transparent':'border-[#efefef] text-[#888] hover:border-[#dedede]'}`}
                          style={on?{background:c.color}:{}}>
                          <span className="text-[14px]">{c.emoji}</span>
                          <span>{c.name}</span>
                          <span className={`font-mono text-[9px] ${on?'text-white/70':'text-[#bcbcbc]'}`}>{fmtMins(mins)}</span>
                        </button>
                      )
                    })}
                  </div>

                  {currentCat&&(
                    <>
                      {/* Mode toggle: Free / Timebox — LOCKED while running */}
                      <div className={`flex gap-1 mb-5 bg-[#f7f7f7] p-1 rounded-lg ${running ? 'opacity-50 pointer-events-none' : ''}`}
                        title={running ? 'Stop the timer to change mode' : ''}>
                        <button onClick={()=>setTimeboxMode(false)}
                          className={`flex-1 py-2 rounded-md text-[10px] font-bold uppercase tracking-[.1em] transition-all ${!timeboxMode?'bg-white text-[#0A0A0A] shadow-sm':'text-[#888]'}`}>
                          Free Flow
                        </button>
                        <button onClick={()=>setTimeboxMode(true)}
                          className={`flex-1 py-2 rounded-md text-[10px] font-bold uppercase tracking-[.1em] transition-all ${timeboxMode?'bg-white text-[#0A0A0A] shadow-sm':'text-[#888]'}`}>
                          ⏦ Timebox
                        </button>
                      </div>
                      {running && (
                        <div className="text-[9px] text-[#bcbcbc] text-center -mt-4 mb-4 italic">
                          Stop timer to switch mode
                        </div>
                      )}

                      {/* Timebox config */}
                      {timeboxMode&&!isRunningHere&&(
                        <div className="mb-5">
                          <div className="text-[9px] font-bold text-[#888] uppercase tracking-[.12em] mb-2">Block Duration</div>
                          <div className="flex gap-1.5 flex-wrap">
                            {TIMEBOX_PRESETS.map(m=>(
                              <button key={m} onClick={()=>setTimeboxMins(m)}
                                className={`px-3 py-1.5 rounded-md text-[11px] font-bold border transition-all ${timeboxMins===m?'text-white border-transparent':'border-[#efefef] text-[#888] hover:border-[#dedede]'}`}
                                style={timeboxMins===m?{background:currentCat.color}:{}}>
                                {m}m
                              </button>
                            ))}
                            <div className="flex items-center gap-1">
                              <input type="number" min="5" max="300" className="w-16 bg-[#f7f7f7] border border-[#dedede] rounded-md px-2 py-1.5 text-[11px] font-bold outline-none focus:border-[#FF5C00] text-center"
                                value={timeboxMins} onChange={e=>setTimeboxMins(Math.max(5,parseInt(e.target.value)||25))}/>
                              <span className="text-[10px] text-[#888]">min</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* BIG TIMER */}
                      <div className="text-center mb-4">
                        {/* Circular progress for timebox */}
                        {timeboxMode?(
                          <div className="relative inline-flex items-center justify-center mb-3">
                            <svg width="180" height="180" className="-rotate-90">
                              <circle cx="90" cy="90" r="82" fill="none" stroke="#efefef" strokeWidth="8"/>
                              <circle cx="90" cy="90" r="82" fill="none" strokeWidth="8"
                                stroke={timeboxDone?'#22c55e':currentCat.color}
                                strokeDasharray={`${2*Math.PI*82}`}
                                strokeDashoffset={`${2*Math.PI*82*(1-timeboxPct/100)}`}
                                strokeLinecap="round"
                                style={{transition:'stroke-dashoffset 1s linear'}}/>
                            </svg>
                            <div className="absolute text-center">
                              {timeboxDone?(
                                <>
                                  <div className="text-[22px] font-bold text-[#22c55e]">DONE!</div>
                                  <div className="text-[11px] text-[#888]">{fmtMins(timeboxMins)} block</div>
                                </>
                              ):(
                                <>
                                  <div className="font-mono text-[32px] font-bold leading-none" style={{color:isRunningHere?currentCat.color:'#0A0A0A'}}>
                                    {isRunningHere?fmtTime(timeboxRemaining):fmtTime(timeboxSecs)}
                                  </div>
                                  <div className="text-[10px] text-[#888] mt-1">{timeboxPct}% done</div>
                                </>
                              )}
                            </div>
                          </div>
                        ):(
                          <div className="font-mono text-[72px] font-bold leading-none mb-3"
                            style={{color:isRunningHere?currentCat.color:'#0A0A0A'}}>
                            {fmtTime(isRunningHere?elapsed:0)}
                          </div>
                        )}

                        {/* Daily progress bar */}
                        <div className="flex items-center gap-3 justify-center mb-4">
                          <div className="w-48 h-2 bg-[#efefef] rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{width:`${dailyPct}%`,background:currentCat.color}}/>
                          </div>
                          <span className="text-[11px] text-[#888] font-mono">{fmtMins(catTodayMins)} / {fmtMins(targetMins)}</span>
                        </div>

                        {/* Note + Control — sticky so always visible */}
                        <div className="sticky bottom-0 bg-white/95 backdrop-blur-sm pt-3 pb-2 -mx-6 px-6 border-t border-[#f0f0f0] mt-4">
                        {!running&&(
                          <input className="w-full max-w-sm mx-auto block bg-[#f7f7f7] border border-[#dedede] rounded-md px-3 py-2 text-[12px] outline-none focus:border-[#FF5C00] text-center mb-3"
                            placeholder="What are you working on? (optional)"
                            value={note} onChange={e=>setNote(e.target.value)}/>
                        )}

                        {/* Control button */}
                        {showRestOffer?(
                          <div className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-2xl p-4 text-center space-y-3">
                            <div className="text-[22px]">✅</div>
                            <div>
                              <div className="text-[14px] font-bold text-[#15803d]">Session saved!</div>
                              <div className="text-[11px] text-[#16a34a] mt-0.5">Take a proper break — you earned it</div>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              {[
                                {m:5,  label:'Quick', sub:'5 min'},
                                {m:10, label:'Standard', sub:'10 min'},
                                {m:15, label:'Long', sub:'15 min'},
                              ].map(({m,label,sub})=>(
                                <button key={m} onClick={()=>{startRest(m);setShowRestOffer(false)}}
                                  className="flex flex-col items-center gap-0.5 py-2.5 rounded-xl border-2 border-[#22c55e] text-[#15803d] hover:bg-[#22c55e] hover:text-white transition-all group">
                                  <span className="text-[10px] font-black uppercase tracking-[.06em]">{label}</span>
                                  <span className="text-[12px] font-bold">{sub}</span>
                                </button>
                              ))}
                            </div>
                            <button onClick={()=>setShowRestOffer(false)}
                              className="text-[10px] text-[#aaa] hover:text-[#555] transition-colors uppercase tracking-[.08em]">
                              Skip break, start next →
                            </button>
                          </div>
                        ):restMode?(
                          /* REST MODE */
                          <div className="py-1">
                            {restDone?(
                              <div className="bg-[#fff7ed] border border-[#fed7aa] rounded-2xl p-5 text-center space-y-3">
                                <div className="text-[36px]">🔔</div>
                                <div>
                                  <div className="text-[16px] font-black text-[#c2410c]">Break's over!</div>
                                  <div className="text-[11px] text-[#ea580c] mt-1">You rested {restMins} minutes — time to lock in</div>
                                </div>
                                <button onClick={()=>{endRest();setTimeboxDone(false)}}
                                  className="w-full py-3 rounded-xl text-[13px] font-bold uppercase tracking-[.08em] text-white transition-colors"
                                  style={{background:currentCat?.color??'#FF5C00'}}>
                                  ▶ Start Next Session
                                </button>
                                <button onClick={()=>{endRest();stopTimer(true)}}
                                  className="text-[10px] text-[#aaa] hover:text-[#555] transition-colors uppercase tracking-[.08em]">
                                  Done for today
                                </button>
                              </div>
                            ):(
                              <div className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-2xl p-5 text-center space-y-4">
                                <div className="text-[11px] font-bold text-[#16a34a] uppercase tracking-[.12em]">Rest Break</div>
                                {/* Big rest ring */}
                                <div className="relative w-32 h-32 mx-auto">
                                  <svg className="w-32 h-32 -rotate-90" viewBox="0 0 128 128">
                                    <circle cx="64" cy="64" r="56" fill="none" stroke="#dcfce7" strokeWidth="8"/>
                                    <circle cx="64" cy="64" r="56" fill="none" stroke="#22c55e" strokeWidth="8"
                                      strokeDasharray={`${2*Math.PI*56}`}
                                      strokeDashoffset={`${2*Math.PI*56*(1 - restElapsed/(restMins*60))}`}
                                      strokeLinecap="round" style={{transition:'stroke-dashoffset 0.5s linear'}}/>
                                  </svg>
                                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <span className="font-mono text-[26px] font-black text-[#15803d] leading-none">
                                      {String(Math.floor(Math.max(0,restMins*60-restElapsed)/60)).padStart(2,'0')}:{String(Math.max(0,restMins*60-restElapsed)%60).padStart(2,'0')}
                                    </span>
                                    <span className="text-[10px] text-[#4ade80] uppercase tracking-[.1em] mt-1">remaining</span>
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <div className="text-[13px] font-semibold text-[#15803d]">Step away from the screen</div>
                                  <div className="text-[11px] text-[#4ade80]">Stretch · Breathe · Hydrate 💧</div>
                                </div>
                                <button onClick={skipRest}
                                  className="text-[10px] text-[#86efac] hover:text-[#15803d] transition-colors uppercase tracking-[.08em]">
                                  End rest early →
                                </button>
                              </div>
                            )}
                          </div>
                        ):timeboxDone?(
                          <div className="space-y-2">
                            <div className="text-center">
                              <div className="text-[22px] mb-1">🎯</div>
                              <div className="text-[14px] font-black text-[#15803d]">Block complete!</div>
                              <div className="text-[11px] text-[#aaa] mt-0.5">{fmtMins(timeboxMins)} of focused work done</div>
                            </div>
                            <div className="space-y-2">
                              <div className="text-[9px] font-bold text-[#bcbcbc] uppercase tracking-[.1em] text-center">Take a break?</div>
                              <div className="grid grid-cols-3 gap-2">
                              {[
                                {m:5,label:'5 min'},
                                {m:10,label:'10 min'},
                                {m:15,label:'15 min'},
                              ].map(({m,label})=>(
                                <button key={m} onClick={()=>startRest(m)}
                                  className="py-2.5 rounded-xl text-[11px] font-bold border-2 border-[#22c55e] text-[#15803d] hover:bg-[#22c55e] hover:text-white transition-all">
                                  {label}
                                </button>
                              ))}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={()=>stopTimer(true)}
                                className="flex-1 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-[.1em] border border-[#dedede] text-[#888] hover:border-[#0A0A0A] hover:text-[#0A0A0A] transition-colors">
                                ✓ Done for today
                              </button>
                              <button onClick={()=>setTimeboxDone(false)}
                                className="px-4 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-[.1em] border border-[#dedede] text-[#888] hover:border-[#0A0A0A] hover:text-[#0A0A0A] transition-colors">
                                + Again
                              </button>
                            </div>
                          </div>
                        ):isRunningHere?(
                          <div className="w-full space-y-2">
                            {resistMode ? (
                              /* RESISTANCE MODE — survive 2 min blocks */
                              <div className="rounded-2xl overflow-hidden border border-[#FF5C00]/20 bg-[#FFF8F5]">
                                {/* Header */}
                                <div className="px-4 pt-4 pb-2 text-center">
                                  <div className="text-[11px] font-black uppercase tracking-[.14em] text-[#FF5C00] mb-0.5">
                                    {resistCount >= RESIST_REQUIRED
                                      ? '✓ Resistance complete'
                                      : `Resist #${resistCount + 1} of ${RESIST_REQUIRED}`}
                                  </div>
                                  <div className="text-[10px] text-[#aaa]">
                                    {resistCount >= RESIST_REQUIRED
                                      ? `You resisted ${RESIST_REQUIRED}× — stop is unlocked`
                                      : `Hold on for ${RESIST_SECS/60} minutes`}
                                  </div>
                                </div>

                                {/* Ring countdown or done state */}
                                {resistCount < RESIST_REQUIRED ? (
                                  <div className="flex flex-col items-center py-3">
                                    <div className="relative w-24 h-24">
                                      <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
                                        <circle cx="48" cy="48" r="40" fill="none" stroke="#fce7d6" strokeWidth="6"/>
                                        <circle cx="48" cy="48" r="40" fill="none" stroke="#FF5C00" strokeWidth="6"
                                          strokeDasharray={`${2*Math.PI*40}`}
                                          strokeDashoffset={`${2*Math.PI*40*(1 - resistElapsed/RESIST_SECS)}`}
                                          strokeLinecap="round" style={{transition:'stroke-dashoffset 0.5s linear'}}/>
                                      </svg>
                                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                                        <span className="font-mono text-[20px] font-black text-[#FF5C00] leading-none">
                                          {String(Math.floor(Math.max(0,RESIST_SECS-resistElapsed)/60)).padStart(2,'0')}:{String(Math.max(0,RESIST_SECS-resistElapsed)%60).padStart(2,'0')}
                                        </span>
                                        <span className="text-[9px] text-[#FF5C00]/60 uppercase tracking-[.08em] mt-0.5">resist</span>
                                      </div>
                                    </div>
                                    {/* Dots for completed blocks */}
                                    {RESIST_REQUIRED > 1 && (
                                      <div className="flex gap-1.5 mt-2">
                                        {Array.from({length:RESIST_REQUIRED}).map((_,i)=>(
                                          <div key={i} className={`w-2 h-2 rounded-full ${i < resistCount ? 'bg-[#FF5C00]' : 'bg-[#fce7d6]'}`}/>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="text-center py-4">
                                    <div className="text-[28px]">💪</div>
                                    <div className="text-[12px] font-bold text-[#FF5C00] mt-1">You made it!</div>
                                  </div>
                                )}

                                {/* Actions */}
                                <div className="px-4 pb-4 space-y-2">
                                  <button onClick={cancelResist}
                                    className="w-full py-2.5 rounded-xl text-[12px] font-bold uppercase tracking-[.08em] text-white transition-colors"
                                    style={{background:currentCat.color}}>
                                    ▶ Keep working
                                  </button>
                                  {resistCount >= RESIST_REQUIRED ? (
                                    <button onClick={()=>{cancelResist();stopTimer(true)}}
                                      className="w-full py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-[.08em] border-2 border-[#0A0A0A] text-[#0A0A0A] hover:bg-[#0A0A0A] hover:text-white transition-all">
                                      ⏹ Stop session
                                    </button>
                                  ) : (
                                    <div className="text-[9px] text-[#bcbcbc] text-center">
                                      Stop unlocks after {RESIST_REQUIRED} resistances ({RESIST_REQUIRED - resistCount} remaining)
                                    </div>
                                  )}
                                </div>
                              </div>
                            ) : showStopChoice ? (
                              /* STOP CHOICE — resist or stop immediately */
                              <div className="bg-[#f7f7f7] border border-[#efefef] rounded-2xl p-4 space-y-3 text-center">
                                <div className="text-[12px] font-bold text-[#0A0A0A]">Stop the session?</div>
                                <div className="text-[10px] text-[#aaa]">Resist 2 minutes to build discipline, or stop now.</div>
                                <div className="space-y-2">
                                  <button onClick={()=>{setShowStopChoice(false);startResist()}}
                                    className="w-full py-2.5 rounded-xl text-[12px] font-bold uppercase tracking-[.08em] text-white transition-colors"
                                    style={{background:currentCat.color}}>
                                    💪 Resist 2 min first
                                  </button>
                                  <button onClick={()=>{setShowStopChoice(false);stopTimer(true)}}
                                    className="w-full py-2.5 rounded-xl text-[12px] font-bold uppercase tracking-[.08em] border border-[#dedede] text-[#888] hover:border-[#0A0A0A] hover:text-[#0A0A0A] transition-all">
                                    ⏹ Stop now
                                  </button>
                                  <button onClick={()=>setShowStopChoice(false)}
                                    className="text-[10px] text-[#bcbcbc] hover:text-[#888] transition-colors uppercase tracking-[.06em]">
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button onClick={()=>setShowStopChoice(true)}
                                className="px-8 py-3 rounded-xl text-[13px] font-bold uppercase tracking-[.1em] text-white transition-all hover:opacity-90"
                                style={{background:currentCat.color}}>
                                ⏹ Stop
                              </button>
                            )}
                          </div>
                        ):running?(
                          <div className="text-[12px] text-[#888]">
                            Timer running on <strong>{categories.find(c=>c.id===running.category_id)?.name}</strong> — stop it first
                          </div>
                        ):(
                          <button onClick={startTimer}
                            className="px-8 py-3 rounded-xl text-[13px] font-bold uppercase tracking-[.1em] text-white transition-all hover:opacity-90"
                            style={{background:currentCat.color}}>
                            {timeboxMode?`▶ Start ${timeboxMins}m Block`:'▶ Start'}
                          </button>
                        )}
                        </div>{/* end sticky */}
                      </div>

                      {/* Today's sessions */}
                      {sessions.filter(s=>s.category_id===activeCat).length>0&&(
                        <div className="mt-4">
                          <div className="text-[9px] font-bold text-[#bcbcbc] tracking-[.16em] uppercase mb-2">Today</div>
                          <div className="space-y-1.5">
                            {sessions.filter(s=>s.category_id===activeCat).map(s=>{
                              const isActive=!s.ended_at
                              return (
                                <div key={s.id} className="flex items-center gap-3 px-4 py-3 bg-white border border-[#efefef] rounded-lg hover:border-[#dedede] group transition-colors">
                                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive?'animate-pulse':''}`} style={{background:currentCat.color}}/>
                                  <div className="flex-1">
                                    {s.note&&<div className="text-[11px] font-semibold">{s.note}</div>}
                                    <div className="text-[10px] text-[#888] font-mono">
                                      {s.started_at?new Date(s.started_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):''}
                                      {s.ended_at?` → ${new Date(s.ended_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`:' → running'}
                                    </div>
                                  </div>
                                  <div className="font-mono text-[13px] font-bold" style={{color:currentCat.color}}>
                                    {isActive?fmtTime(elapsed):fmtMins(s.duration_minutes)}
                                  </div>
                                  <button onClick={()=>deleteSession(s.id)} className="text-[11px] text-[#bcbcbc] hover:text-[#ef4444] opacity-0 group-hover:opacity-100 transition-all">×</button>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          ):(
            /* ANALYTICS */
            <div className="p-5 space-y-6">
              <div>
                <div className="text-[9px] font-bold text-[#bcbcbc] tracking-[.16em] uppercase mb-3">Today's Focus</div>
                <div className="grid gap-3" style={{gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))'}}>
                  {categories.map(c=>{
                    const mins=todayMins(c.id)
                    const p=Math.min(100,Math.round(mins/c.target_minutes*100))
                    return (
                      <div key={c.id} className="bg-white border border-[#efefef] rounded-lg p-4 hover:border-[#dedede] transition-colors">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[18px]">{c.emoji}</span>
                          <span className="text-[12px] font-bold flex-1">{c.name}</span>
                        </div>
                        <div className="font-mono text-[22px] font-bold" style={{color:c.color}}>{fmtMins(mins)}</div>
                        <div className="text-[9px] text-[#888] mb-2">of {fmtMins(c.target_minutes)} target</div>
                        <div className="h-1.5 bg-[#efefef] rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{width:`${p}%`,background:c.color}}/>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {categories.map(c=>{
                const weekly=weeklyByCategory(c.id)
                const maxMins=Math.max(...weekly.map(d=>d.mins),1)
                const total7=weekly.reduce((a,d)=>a+d.mins,0)
                if(total7===0)return null
                return (
                  <div key={c.id}>
                    <div className="text-[9px] font-bold text-[#bcbcbc] tracking-[.16em] uppercase mb-3">{c.emoji} {c.name} — Last 7 Days</div>
                    <div className="bg-white border border-[#efefef] rounded-lg p-4">
                      <div className="flex items-end gap-2 mb-2" style={{height:96}}>
                        {weekly.map((d,i)=>{
                          const barH=d.mins>0?Math.max(6,Math.round(d.mins/maxMins*80)):3
                          const isToday=i===6
                          return (
                            <div key={d.day} className="flex-1 flex flex-col items-center gap-1 group relative" style={{height:96}}>
                              <div className="absolute bottom-full mb-1 hidden group-hover:block bg-[#0A0A0A] text-white text-[9px] px-1.5 py-1 rounded whitespace-nowrap z-10">
                                {d.day}: {fmtMins(d.mins)}
                              </div>
                              <div className="flex-1"/>
                              <div className="w-full rounded-sm" style={{height:barH,background:d.mins>0?c.color:'#efefef',opacity:isToday?1:0.7}}/>
                              <div className="text-[8px] text-[#bcbcbc]" style={{lineHeight:'1.2'}}>{d.day.slice(0,2)}</div>
                            </div>
                          )
                        })}
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-[#888]">
                        <span>7-day: <span className="font-bold font-mono" style={{color:c.color}}>{fmtMins(total7)}</span></span>
                        <span>Daily avg: <span className="font-bold font-mono">{fmtMins(Math.round(total7/7))}</span></span>
                        <span>Target: <span className="font-bold font-mono">{fmtMins(c.target_minutes)}/day</span></span>
                      </div>
                    </div>
                  </div>
                )
              })}

              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[9px] font-bold text-[#bcbcbc] tracking-[.16em] uppercase">Recent Sessions</div>
                  <button onClick={()=>{setShowAddSession(v=>!v);setAddForm({category_id:categories[0]?.id??'',date:fmt(),duration_minutes:60,note:''})}}
                    className="text-[9px] font-bold uppercase tracking-[.1em] px-2.5 py-1 rounded-md border border-[#dedede] text-[#888] hover:border-[#FF5C00] hover:text-[#FF5C00] transition-all">
                    {showAddSession?'✕ Cancel':'＋ Add'}
                  </button>
                </div>

                {/* Add session form */}
                {showAddSession&&(
                  <div className="mb-3 bg-white border-2 border-[#FF5C00] rounded-lg p-4 space-y-3">
                    <div className="text-[10px] font-bold text-[#FF5C00] uppercase tracking-[.1em]">Log a session manually</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-[8px] font-bold text-[#888] uppercase tracking-[.12em] mb-1">Category</div>
                        <select className="w-full bg-[#f7f7f7] border border-[#dedede] rounded-md px-2 py-1.5 text-[12px] outline-none focus:border-[#FF5C00]"
                          value={addForm.category_id} onChange={e=>setAddForm(p=>({...p,category_id:e.target.value}))}>
                          {categories.map(c=><option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <div className="text-[8px] font-bold text-[#888] uppercase tracking-[.12em] mb-1">Date</div>
                        <input type="date" className="w-full bg-[#f7f7f7] border border-[#dedede] rounded-md px-2 py-1.5 text-[12px] outline-none focus:border-[#FF5C00]"
                          value={addForm.date} onChange={e=>setAddForm(p=>({...p,date:e.target.value}))}/>
                      </div>
                    </div>
                    <div>
                      <div className="text-[8px] font-bold text-[#888] uppercase tracking-[.12em] mb-1">Duration (minutes)</div>
                      <div className="flex items-center gap-2">
                        <input type="number" min="1" max="600" step="5"
                          className="flex-1 bg-[#f7f7f7] border border-[#dedede] rounded-md px-2 py-1.5 text-[12px] outline-none focus:border-[#FF5C00]"
                          value={addForm.duration_minutes} onChange={e=>setAddForm(p=>({...p,duration_minutes:parseInt(e.target.value)||1}))}/>
                        <span className="text-[10px] text-[#888] flex-shrink-0">{fmtMins(addForm.duration_minutes)}</span>
                      </div>
                      <div className="flex gap-1 mt-1.5 flex-wrap">
                        {[15,25,30,45,60,90,120].map(m=>(
                          <button key={m} onClick={()=>setAddForm(p=>({...p,duration_minutes:m}))}
                            className={`text-[9px] px-2 py-0.5 rounded-md border font-mono transition-all ${addForm.duration_minutes===m?'bg-[#FF5C00] text-white border-[#FF5C00]':'border-[#dedede] text-[#888] hover:border-[#FF5C00]'}`}>
                            {fmtMins(m)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-[8px] font-bold text-[#888] uppercase tracking-[.12em] mb-1">Note (optional)</div>
                      <input className="w-full bg-[#f7f7f7] border border-[#dedede] rounded-md px-2 py-1.5 text-[12px] outline-none focus:border-[#FF5C00]"
                        placeholder="What did you work on?" value={addForm.note} onChange={e=>setAddForm(p=>({...p,note:e.target.value}))}
                        onKeyDown={e=>e.key==='Enter'&&addManualSession()}/>
                    </div>
                    <button onClick={addManualSession}
                      className="w-full bg-[#FF5C00] text-white text-[10px] font-bold uppercase tracking-[.1em] py-2.5 rounded-md hover:bg-[#FF7A2E] transition-colors">
                      + Log Session
                    </button>
                  </div>
                )}

                <div className="space-y-1">
                  {allSessions.filter(s=>s.ended_at).slice(0,20).map(s=>{
                    const cat=categories.find(c=>c.id===s.category_id);if(!cat)return null
                    const isEditing=editSessionId===s.id
                    if(isEditing){
                      return (
                        <div key={s.id} className="border-2 border-[#FF5C00] rounded-lg p-3 bg-white space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[14px]">{cat.emoji}</span>
                            <span className="text-[11px] font-semibold flex-1">{cat.name}</span>
                            <span className="text-[9px] text-[#bcbcbc] font-mono">{s.date}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-[10px] text-[#888] uppercase tracking-[.1em] font-bold flex-shrink-0">Duration</label>
                            <input type="number" min={1} max={999}
                              value={editSessionForm.duration_minutes}
                              onChange={e=>setEditSessionForm(p=>({...p,duration_minutes:parseInt(e.target.value)||1}))}
                              className="w-16 text-center font-mono text-[13px] font-bold border border-[#dedede] rounded-md px-2 py-1 focus:outline-none focus:border-[#FF5C00]"/>
                            <span className="text-[10px] text-[#888]">min</span>
                            <div className="flex gap-1 flex-wrap">
                              {[15,25,30,45,60,90,120].map(m=>(
                                <button key={m} onClick={()=>setEditSessionForm(p=>({...p,duration_minutes:m}))}
                                  className={`text-[9px] px-1.5 py-0.5 rounded font-mono border transition-all ${editSessionForm.duration_minutes===m?'bg-[#FF5C00] text-white border-[#FF5C00]':'border-[#dedede] text-[#888] hover:border-[#FF5C00]'}`}>
                                  {m}m
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <input type="text" placeholder="Note (optional)"
                              value={editSessionForm.note}
                              onChange={e=>setEditSessionForm(p=>({...p,note:e.target.value}))}
                              className="w-full text-[11px] border border-[#dedede] rounded-md px-2 py-1.5 focus:outline-none focus:border-[#FF5C00]"/>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={saveEditSession}
                              className="flex-1 bg-[#FF5C00] text-white text-[10px] font-bold uppercase tracking-[.1em] py-1.5 rounded-md hover:bg-[#FF7A2E] transition-colors">
                              Save
                            </button>
                            <button onClick={()=>setEditSessionId(null)}
                              className="px-3 text-[10px] font-bold uppercase tracking-[.1em] border border-[#dedede] rounded-md text-[#888] hover:border-[#0A0A0A] hover:text-[#0A0A0A] transition-colors">
                              Cancel
                            </button>
                          </div>
                        </div>
                      )
                    }
                    return (
                      <div key={s.id} className="group flex items-center gap-3 px-4 py-2.5 bg-white border border-[#f7f7f7] rounded-lg hover:border-[#efefef] transition-colors">
                        <span className="text-[14px]">{cat.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <span className="text-[11px] font-semibold">{cat.name}</span>
                          {s.note&&<span className="text-[10px] text-[#888] ml-2">— {s.note}</span>}
                        </div>
                        <span className="text-[9px] text-[#bcbcbc] font-mono flex-shrink-0">{s.date}</span>
                        <span className="font-mono text-[12px] font-bold flex-shrink-0" style={{color:cat.color}}>{fmtMins(s.duration_minutes)}</span>
                        <button onClick={()=>{setEditSessionId(s.id);setEditSessionForm({duration_minutes:s.duration_minutes,note:s.note||''})}}
                          className="opacity-0 group-hover:opacity-100 text-[13px] text-[#bcbcbc] hover:text-[#FF5C00] transition-all leading-none flex-shrink-0 ml-1"
                          title="Edit duration">
                          ✎
                        </button>
                        <button onClick={()=>{if(confirm('Delete this session?'))deleteSession(s.id)}}
                          className="opacity-0 group-hover:opacity-100 text-[14px] text-[#bcbcbc] hover:text-[#ef4444] transition-all leading-none flex-shrink-0">
                          ×
                        </button>
                      </div>
                    )
                  })}
                  {allSessions.filter(s=>s.ended_at).length===0&&(
                    <div className="text-center py-8 text-[12px] text-[#bcbcbc]">No sessions yet. Start your timer!</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Setup sidebar */}
        {showSetup&&(
          <div className="w-64 border-l border-[#efefef] flex flex-col bg-white flex-shrink-0 min-h-0">

            {/* Mode: choose */}
            {!editId&&(
              <>
                <div className="px-4 py-3 border-b border-[#efefef] flex-shrink-0 flex items-center justify-between">
                  <div className="text-[12px] font-bold">Categories</div>
                  <button onClick={()=>setShowSetup(false)} className="text-[16px] text-[#bcbcbc] hover:text-[#888] transition-colors leading-none">×</button>
                </div>
                <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-3">
                  {/* Add new button */}
                  <button
                    onClick={()=>{setEditId('new');setForm({name:'',color:'#FF5C00',emoji:'📚',target_minutes:120})}}
                    className="w-full flex items-center gap-3 px-3 py-3 bg-[#FF5C00] text-white rounded-lg hover:bg-[#FF7A2E] transition-colors">
                    <span className="text-[20px]">＋</span>
                    <div className="text-left">
                      <div className="text-[12px] font-bold">New Category</div>
                      <div className="text-[9px] opacity-80">Create a new focus category</div>
                    </div>
                  </button>

                  {/* Existing categories */}
                  {categories.length>0&&(
                    <div>
                      <div className="text-[9px] font-bold text-[#bcbcbc] uppercase tracking-[.12em] mb-2">Your Categories</div>
                      <div className="space-y-1">
                        {categories.map(c=>(
                          <button key={c.id}
                            onClick={()=>startEdit(c)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[#efefef] hover:border-[#FF5C00] hover:bg-[#FFF8F5] transition-all text-left group">
                            <span className="text-[18px]">{c.emoji}</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-[12px] font-semibold truncate">{c.name}</div>
                              <div className="text-[9px] text-[#888]">{fmtMins(c.target_minutes)}/day</div>
                            </div>
                            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{background:c.color}}/>
                            <span className="text-[10px] text-[#bcbcbc] group-hover:text-[#FF5C00] transition-colors">✎</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {categories.length===0&&(
                    <div className="text-center py-6 text-[12px] text-[#bcbcbc]">
                      No categories yet.<br/>Create your first one above.
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Mode: edit / create form */}
            {editId&&(
              <>
                <div className="px-4 py-3 border-b border-[#efefef] flex-shrink-0 flex items-center gap-2">
                  <button onClick={()=>{setEditId(null);setForm({name:'',color:'#FF5C00',emoji:'📚',target_minutes:120})}}
                    className="text-[14px] text-[#bcbcbc] hover:text-[#0A0A0A] transition-colors">‹</button>
                  <div className="text-[12px] font-bold">{editId==='new'?'New Category':'Edit Category'}</div>
                  {editId!=='new'&&(
                    <button onClick={()=>deleteCategory(editId)}
                      className="ml-auto text-[9px] font-bold text-[#bcbcbc] hover:text-[#ef4444] transition-colors uppercase tracking-[.08em]">Delete</button>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-3">
                  <div>
                    <div className="text-[9px] font-bold text-[#888] uppercase tracking-[.12em] mb-1">Name</div>
                    <input className="w-full bg-[#f7f7f7] border border-[#dedede] rounded-md px-3 py-2 text-[13px] outline-none focus:border-[#FF5C00]"
                      placeholder="e.g. Study, Business…" value={form.name} autoFocus
                      onChange={e=>setForm(p=>({...p,name:e.target.value}))}
                      onKeyDown={e=>e.key==='Enter'&&saveCategory()}/>
                  </div>
                  <div>
                    <div className="text-[9px] font-bold text-[#888] uppercase tracking-[.12em] mb-1">Daily Target</div>
                    <div className="flex items-center gap-2">
                      <input type="number" min="15" max="600" step="15"
                        className="flex-1 bg-[#f7f7f7] border border-[#dedede] rounded-md px-3 py-2 text-[13px] outline-none focus:border-[#FF5C00]"
                        value={form.target_minutes} onChange={e=>setForm(p=>({...p,target_minutes:parseInt(e.target.value)||60}))}/>
                      <span className="text-[10px] text-[#888]">{fmtMins(form.target_minutes)}</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] font-bold text-[#888] uppercase tracking-[.12em] mb-1">Icon</div>
                    <div className="flex flex-wrap gap-1.5">
                      {PRESET_EMOJIS.map(em=>(
                        <button key={em} onClick={()=>setForm(p=>({...p,emoji:em}))}
                          className={`w-8 h-8 rounded-md flex items-center justify-center text-[16px] transition-all ${form.emoji===em?'bg-[#FFF0E8] ring-2 ring-[#FF5C00]':'bg-[#f7f7f7] hover:bg-[#efefef]'}`}>
                          {em}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] font-bold text-[#888] uppercase tracking-[.12em] mb-1">Color</div>
                    <div className="flex flex-wrap gap-1.5">
                      {PRESET_COLORS.map(col=>(
                        <button key={col} onClick={()=>setForm(p=>({...p,color:col}))}
                          className={`w-7 h-7 rounded-md transition-all ${form.color===col?'ring-2 ring-offset-1 ring-[#0A0A0A] scale-110':''}`}
                          style={{background:col}}/>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-2.5 bg-[#f7f7f7] rounded-md">
                    <span className="text-[18px]">{form.emoji}</span>
                    <span className="text-[12px] font-bold flex-1">{form.name||'Name'}</span>
                    <span className="text-[10px] text-[#888]">{fmtMins(form.target_minutes)}/day</span>
                    <div className="w-4 h-4 rounded-sm" style={{background:form.color}}/>
                  </div>
                  <button onClick={saveCategory} className="w-full bg-[#FF5C00] text-white text-[10px] font-bold uppercase tracking-[.1em] py-2.5 rounded-md hover:bg-[#FF7A2E] transition-colors">
                    {editId==='new'?'+ Create Category':'Update'}
                  </button>
                  <button onClick={()=>{setEditId(null);setForm({name:'',color:'#FF5C00',emoji:'📚',target_minutes:120})}}
                    className="w-full border border-[#dedede] text-[10px] font-bold uppercase tracking-[.1em] py-2 rounded-md hover:border-[#0A0A0A] transition-colors">
                    ‹ Back
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
