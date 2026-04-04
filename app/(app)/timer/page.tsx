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

  // Browser tab title when running
  useEffect(()=>{
    if(!running){document.title='Mizan ميزان';return}
    const cat=categories.find(c=>c.id===running.category_id)
    const mins=Math.floor(elapsed/60).toString().padStart(2,'0')
    const secs=(elapsed%60).toString().padStart(2,'0')
    document.title=`🔴 ${mins}:${secs} — ${cat?.name??'Focus'}`
    return()=>{document.title='Mizan ميزان'}
  },[running,elapsed,categories])

  async function startTimer(){
    if(!activeCat)return
    const {data:{user}}=await sb.auth.getUser();if(!user)return
    const now=new Date().toISOString()
    const {data}=await sb.from('focus_sessions').insert({
      user_id:user.id,category_id:activeCat,date:today,started_at:now,duration_minutes:0,note
    }).select().single()
    if(data){setRunning(data);setElapsed(0);setSessions(prev=>[...prev,data]);setTimeboxDone(false)}
  }

  async function stopTimer(){
    if(!running)return
    const now=new Date().toISOString()
    const addMins=Math.floor((Date.now()-new Date(running.started_at!).getTime())/60000)
    const total=running.duration_minutes+addMins
    await sb.from('focus_sessions').update({ended_at:now,duration_minutes:total,note}).eq('id',running.id)
    setSessions(prev=>prev.map(s=>s.id===running.id?{...s,ended_at:now,duration_minutes:total}:s))
    setRunning(null);setElapsed(0);setNote('');setTimeboxDone(false)
    load()
  }

  async function deleteSession(id:string){
    await sb.from('focus_sessions').delete().eq('id',id)
    setSessions(prev=>prev.filter(s=>s.id!==id))
    if(running?.id===id){setRunning(null);setElapsed(0)}
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
                      {/* Mode toggle: Free / Timebox */}
                      <div className="flex gap-1 mb-5 bg-[#f7f7f7] p-1 rounded-lg">
                        <button onClick={()=>setTimeboxMode(false)}
                          className={`flex-1 py-2 rounded-md text-[10px] font-bold uppercase tracking-[.1em] transition-all ${!timeboxMode?'bg-white text-[#0A0A0A] shadow-sm':'text-[#888]'}`}>
                          Free Flow
                        </button>
                        <button onClick={()=>setTimeboxMode(true)}
                          className={`flex-1 py-2 rounded-md text-[10px] font-bold uppercase tracking-[.1em] transition-all ${timeboxMode?'bg-white text-[#0A0A0A] shadow-sm':'text-[#888]'}`}>
                          ⏦ Timebox
                        </button>
                      </div>

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
                        {timeboxDone?(
                          <div className="space-y-2">
                            <div className="text-[13px] font-bold text-[#22c55e]">✓ Block complete — {fmtMins(timeboxMins)} focused</div>
                            <div className="flex gap-2 justify-center">
                              <button onClick={stopTimer}
                                className="px-5 py-2.5 rounded-xl text-[12px] font-bold uppercase tracking-[.1em] bg-[#22c55e] text-white hover:bg-green-600 transition-colors">
                                ✓ Save & Finish
                              </button>
                              <button onClick={()=>{setTimeboxDone(false)}}
                                className="px-5 py-2.5 rounded-xl text-[12px] font-bold uppercase tracking-[.1em] border border-[#dedede] text-[#888] hover:border-[#0A0A0A] hover:text-[#0A0A0A] transition-colors">
                                + Another Block
                              </button>
                            </div>
                          </div>
                        ):isRunningHere?(
                          <button onClick={stopTimer}
                            className="px-8 py-3 rounded-xl text-[13px] font-bold uppercase tracking-[.1em] text-white transition-all hover:opacity-90"
                            style={{background:currentCat.color}}>
                            ⏹ Stop
                          </button>
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
                <div className="text-[9px] font-bold text-[#bcbcbc] tracking-[.16em] uppercase mb-3">Recent Sessions</div>
                <div className="space-y-1">
                  {allSessions.filter(s=>s.ended_at).slice(0,20).map(s=>{
                    const cat=categories.find(c=>c.id===s.category_id);if(!cat)return null
                    return (
                      <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 bg-white border border-[#f7f7f7] rounded-lg hover:border-[#efefef] transition-colors">
                        <span className="text-[14px]">{cat.emoji}</span>
                        <div className="flex-1">
                          <span className="text-[11px] font-semibold">{cat.name}</span>
                          {s.note&&<span className="text-[10px] text-[#888] ml-2">— {s.note}</span>}
                        </div>
                        <span className="text-[9px] text-[#bcbcbc] font-mono">{s.date}</span>
                        <span className="font-mono text-[12px] font-bold" style={{color:cat.color}}>{fmtMins(s.duration_minutes)}</span>
                      </div>
                    )
                  })}
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
