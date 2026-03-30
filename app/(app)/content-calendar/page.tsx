'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

const sb = createClient()
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAYS_SHORT = ['M','T','W','T','F','S','S']

type Tracker = { id: string; name: string; emoji: string; color: string; position: number }
type Log = { tracker_id: string; date: string }

const PRESET_COLORS = ['#FF5C00','#22c55e','#8b5cf6','#ec4899','#f59e0b','#06b6d4','#ef4444','#0A0A0A']
const PRESET_EMOJIS = ['📸','🎬','✍️','🎙️','📧','💬','📚','🏋️','🤼','🕌','💡','🔥']

function fmt(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function getMonday(d = new Date()) {
  const day = d.getDay(), diff = day===0?-6:1-day
  const m = new Date(d); m.setDate(d.getDate()+diff); m.setHours(0,0,0,0); return m
}

export default function ContentCalendarPage() {
  const today = fmt()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())

  const [trackers, setTrackers] = useState<Tracker[]>([])
  const [logs, setLogs] = useState<Log[]>([])
  const [showSetup, setShowSetup] = useState(false)
  const [newTracker, setNewTracker] = useState({ name:'', emoji:'📸', color:'#FF5C00' })
  const [editId, setEditId] = useState<string|null>(null)

  const load = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const ym = `${year}-${String(month+1).padStart(2,'0')}`
    const [{ data: t }, { data: l }] = await Promise.all([
      sb.from('content_trackers').select('*').eq('user_id', user.id).order('position'),
      sb.from('content_logs').select('tracker_id,date').eq('user_id', user.id).like('date', `${ym}-%`),
    ])
    setTrackers(t ?? [])
    setLogs(l ?? [])
  }, [year, month])

  useEffect(() => { load() }, [load])

  // Calendar grid
  const daysInMonth = new Date(year, month+1, 0).getDate()
  const firstDow = new Date(year, month, 1).getDay()
  const startOffset = firstDow===0?6:firstDow-1
  const days: (string|null)[] = [...Array(startOffset).fill(null)]
  for (let d=1; d<=daysInMonth; d++) {
    days.push(`${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`)
  }
  while (days.length % 7 !== 0) days.push(null)

  async function toggleLog(trackerId: string, dateStr: string) {
    if (dateStr > today) return
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const exists = logs.find(l => l.tracker_id===trackerId && l.date===dateStr)
    if (exists) {
      await sb.from('content_logs').delete().eq('tracker_id', trackerId).eq('date', dateStr)
      setLogs(prev => prev.filter(l => !(l.tracker_id===trackerId && l.date===dateStr)))
    } else {
      await sb.from('content_logs').insert({ user_id: user.id, tracker_id: trackerId, date: dateStr, done: true })
      setLogs(prev => [...prev, { tracker_id: trackerId, date: dateStr }])
    }
  }

  async function addTracker() {
    if (!newTracker.name.trim()) return
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    if (editId) {
      await sb.from('content_trackers').update({ name: newTracker.name, emoji: newTracker.emoji, color: newTracker.color }).eq('id', editId)
      setTrackers(prev => prev.map(t => t.id===editId ? {...t,...newTracker} : t))
      setEditId(null)
    } else {
      const { data } = await sb.from('content_trackers').insert({ user_id: user.id, ...newTracker, position: trackers.length }).select().single()
      if (data) setTrackers(prev => [...prev, data])
    }
    setNewTracker({ name:'', emoji:'📸', color:'#FF5C00' })
  }

  async function deleteTracker(id: string) {
    if (!confirm('Delete tracker and all its logs?')) return
    await sb.from('content_trackers').delete().eq('id', id)
    setTrackers(prev => prev.filter(t => t.id!==id))
    setLogs(prev => prev.filter(l => l.tracker_id!==id))
  }

  function startEdit(t: Tracker) {
    setNewTracker({ name: t.name, emoji: t.emoji, color: t.color })
    setEditId(t.id); setShowSetup(true)
  }

  // Stats per tracker
  function trackerStats(tid: string) {
    const monthLogs = logs.filter(l => l.tracker_id===tid)
    const total = monthLogs.length
    // current streak
    let streak = 0
    for (let i=daysInMonth; i>=1; i--) {
      const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`
      if (ds > today) continue
      if (monthLogs.find(l => l.date===ds)) streak++; else break
    }
    return { total, streak }
  }

  // Week summary
  const weekDays: string[] = []
  const mon = getMonday()
  for (let i=0;i<7;i++) { const d=new Date(mon); d.setDate(mon.getDate()+i); weekDays.push(fmt(d)) }

  const totalThisMonth = logs.length
  const daysLogged = new Set(logs.map(l=>l.date)).size
  const activeDays = Array.from({length:daysInMonth},(_,i) => {
    const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`
    return ds<=today ? ds : null
  }).filter(Boolean).length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white px-6 py-3 border-b-2 border-[#0A0A0A] flex items-center flex-shrink-0">
        <div>
          <div className="text-[19px] font-bold tracking-[.04em]">Content</div>
          <div className="text-[10px] text-[#888] tracking-[.12em] uppercase mt-0.5">Track what you create</div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="text-right">
            <div className="font-mono text-[18px] font-bold text-[#FF5C00]">{totalThisMonth}</div>
            <div className="text-[8px] text-[#888] uppercase tracking-[.1em]">total this month</div>
          </div>
          <div className="text-right">
            <div className="font-mono text-[18px] font-bold text-[#0A0A0A]">{daysLogged}/{activeDays}</div>
            <div className="text-[8px] text-[#888] uppercase tracking-[.1em]">days active</div>
          </div>
          <button onClick={() => { setShowSetup(s=>!s); setEditId(null); setNewTracker({name:'',emoji:'📸',color:'#FF5C00'}) }}
            className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-[.1em] border transition-all ${showSetup ? 'bg-[#0A0A0A] text-white border-[#0A0A0A]' : 'border-[#dedede] text-[#888] hover:border-[#0A0A0A] hover:text-[#0A0A0A]'}`}>
            ⚙ Trackers
          </button>
        </div>
      </div>

      {/* Month nav */}
      <div className="flex items-center gap-2 px-6 py-2 bg-[#f7f7f7] border-b border-[#efefef] flex-shrink-0">
        <button onClick={() => { if(month===0){setMonth(11);setYear(y=>y-1)}else setMonth(m=>m-1) }}
          className="w-6 h-6 border border-[#dedede] rounded flex items-center justify-center text-[14px] text-[#888] hover:bg-[#0A0A0A] hover:text-white hover:border-[#0A0A0A] transition-colors">‹</button>
        <span className="text-[13px] font-bold tracking-[.04em] min-w-[140px] text-center">{MONTHS[month]} {year}</span>
        <button onClick={() => { if(month===11){setMonth(0);setYear(y=>y+1)}else setMonth(m=>m+1) }}
          className="w-6 h-6 border border-[#dedede] rounded flex items-center justify-center text-[14px] text-[#888] hover:bg-[#0A0A0A] hover:text-white hover:border-[#0A0A0A] transition-colors">›</button>
        <button onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()) }}
          className="text-[9px] font-bold uppercase tracking-[.1em] px-3 py-1 rounded border border-[#dedede] text-[#888] hover:bg-[#FF5C00] hover:text-white hover:border-[#FF5C00] transition-colors">Today</button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Main content */}
        <div className="flex-1 overflow-y-auto p-5">

          {trackers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="text-5xl mb-4">📌</div>
              <div className="text-[16px] font-bold mb-2">No trackers yet</div>
              <div className="text-[13px] text-[#888] mb-5">Create custom trackers for everything you want to log — reels, community posts, study sessions, anything.</div>
              <button onClick={() => setShowSetup(true)}
                className="bg-[#FF5C00] text-white text-[10px] font-bold uppercase tracking-[.1em] px-4 py-2 rounded-md hover:bg-[#FF7A2E] transition-colors">
                + Create First Tracker
              </button>
            </div>
          ) : (
            <>
              {/* This week strip */}
              <div className="mb-5">
                <div className="text-[9px] font-bold text-[#bcbcbc] tracking-[.16em] uppercase mb-2">This Week</div>
                <div className="bg-white border border-[#efefef] rounded-lg overflow-hidden">
                  <div className="grid grid-cols-8 border-b border-[#f7f7f7]">
                    <div className="px-3 py-2 text-[9px] font-bold text-[#888] uppercase tracking-[.1em]">Tracker</div>
                    {weekDays.map((d,i) => {
                      const isToday = d===today
                      const isPast = d<=today
                      const dn = parseInt(d.split('-')[2])
                      return (
                        <div key={d} className={`py-2 text-center text-[9px] font-bold ${isToday?'text-[#FF5C00]':isPast?'text-[#bcbcbc]':'text-[#efefef]'}`}>
                          <div>{DAYS_SHORT[i]}</div>
                          <div className="font-mono">{dn}</div>
                        </div>
                      )
                    })}
                  </div>
                  {trackers.map(t => (
                    <div key={t.id} className="grid grid-cols-8 border-b border-[#f7f7f7] last:border-0 hover:bg-[#fafafa] transition-colors">
                      <div className="px-3 py-2.5 flex items-center gap-2">
                        <span className="text-[14px]">{t.emoji}</span>
                        <span className="text-[11px] font-semibold truncate">{t.name}</span>
                      </div>
                      {weekDays.map(d => {
                        const done = !!logs.find(l => l.tracker_id===t.id && l.date===d)
                        const isPast = d<=today
                        return (
                          <div key={d} className="flex items-center justify-center py-2">
                            {isPast ? (
                              <button onClick={() => toggleLog(t.id, d)}
                                className={`w-7 h-7 rounded-md flex items-center justify-center transition-all hover:scale-110 ${done?'shadow-sm':''}`}
                                style={done?{background:t.color}:{background:'#f7f7f7'}}>
                                {done && <span className="text-white text-[11px] font-bold">✓</span>}
                              </button>
                            ) : (
                              <div className="w-7 h-7 rounded-md bg-[#fafafa]" />
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>

              {/* Monthly grid per tracker */}
              <div className="text-[9px] font-bold text-[#bcbcbc] tracking-[.16em] uppercase mb-3">Monthly Grid</div>
              <div className="space-y-4">
                {trackers.map(t => {
                  const { total, streak } = trackerStats(t.id)
                  return (
                    <div key={t.id} className="bg-white border border-[#efefef] rounded-lg overflow-hidden">
                      <div className="px-4 py-3 flex items-center gap-3 border-b border-[#f7f7f7]">
                        <span className="text-[18px]">{t.emoji}</span>
                        <span className="text-[13px] font-bold flex-1">{t.name}</span>
                        <div className="flex items-center gap-4 mr-2">
                          <div className="text-right">
                            <div className="font-mono text-[16px] font-bold" style={{color:t.color}}>{total}</div>
                            <div className="text-[8px] text-[#888] uppercase tracking-[.08em]">this month</div>
                          </div>
                          <div className="text-right">
                            <div className="font-mono text-[16px] font-bold text-[#0A0A0A]">{streak}d</div>
                            <div className="text-[8px] text-[#888] uppercase tracking-[.08em]">streak</div>
                          </div>
                        </div>
                        <button onClick={() => startEdit(t)} className="text-[10px] text-[#bcbcbc] hover:text-[#888] transition-colors">✎</button>
                        <button onClick={() => deleteTracker(t.id)} className="text-[10px] text-[#bcbcbc] hover:text-[#ef4444] transition-colors">×</button>
                      </div>
                      <div className="px-4 py-3">
                        {/* Day headers */}
                        <div className="flex gap-1 mb-1">
                          {Array(startOffset).fill(null).map((_,i) => <div key={i} className="w-7 h-4" />)}
                          {DAYS_SHORT.slice(0, 7-startOffset).concat(startOffset>0?DAYS_SHORT.slice(0,startOffset):[]).map((d,i,a) => {
                            // Just show row of day labels once
                            return null
                          })}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {Array(startOffset).fill(null).map((_,i) => <div key={`e${i}`} className="w-7 h-7" />)}
                          {Array.from({length:daysInMonth},(_,i) => {
                            const d = i+1
                            const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
                            const done = !!logs.find(l => l.tracker_id===t.id && l.date===ds)
                            const isPast = ds<=today
                            const isToday = ds===today
                            return (
                              <button key={ds} onClick={() => toggleLog(t.id, ds)} disabled={!isPast}
                                title={`${d} ${MONTH_SHORT[month]} — ${done?'Done':'Not done'}`}
                                className={`w-7 h-7 rounded-md flex items-center justify-center font-mono text-[9px] font-bold transition-all ${isPast?'hover:scale-110 cursor-pointer':'cursor-not-allowed'} ${isToday&&!done?'ring-2':''}  `}
                                style={{
                                  background: done ? t.color : isPast ? '#f7f7f7' : '#fafafa',
                                  color: done ? 'white' : isPast ? '#bcbcbc' : '#efefef',
                                  outline: isToday&&!done ? `2px solid ${t.color}` : undefined,
                                }}>
                                {d}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* Setup sidebar */}
        {showSetup && (
          <div className="w-64 border-l border-[#efefef] flex flex-col bg-white flex-shrink-0">
            <div className="px-4 py-3 border-b border-[#efefef]">
              <div className="text-[12px] font-bold">{editId ? 'Edit Tracker' : 'New Tracker'}</div>
            </div>
            <div className="p-4 flex-1 overflow-y-auto">
              {/* Name */}
              <div className="mb-3">
                <div className="text-[9px] font-bold text-[#888] uppercase tracking-[.12em] mb-1">Name</div>
                <input className="w-full bg-[#f7f7f7] border border-[#dedede] rounded-md px-3 py-2 text-[13px] outline-none focus:border-[#FF5C00]"
                  placeholder="e.g. Instagram Reel" value={newTracker.name}
                  onChange={e => setNewTracker(p=>({...p,name:e.target.value}))}
                  onKeyDown={e => e.key==='Enter' && addTracker()} />
              </div>

              {/* Emoji */}
              <div className="mb-3">
                <div className="text-[9px] font-bold text-[#888] uppercase tracking-[.12em] mb-1">Icon</div>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_EMOJIS.map(em => (
                    <button key={em} onClick={() => setNewTracker(p=>({...p,emoji:em}))}
                      className={`w-8 h-8 rounded-md flex items-center justify-center text-[16px] transition-all ${newTracker.emoji===em?'bg-[#FFF0E8] ring-2 ring-[#FF5C00]':'bg-[#f7f7f7] hover:bg-[#efefef]'}`}>
                      {em}
                    </button>
                  ))}
                  <input className="w-8 h-8 bg-[#f7f7f7] border border-[#dedede] rounded-md text-center text-[13px] outline-none"
                    placeholder="?" value={PRESET_EMOJIS.includes(newTracker.emoji)?'':newTracker.emoji}
                    onChange={e => setNewTracker(p=>({...p,emoji:e.target.value||'📌'}))} />
                </div>
              </div>

              {/* Color */}
              <div className="mb-4">
                <div className="text-[9px] font-bold text-[#888] uppercase tracking-[.12em] mb-1">Color</div>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_COLORS.map(c => (
                    <button key={c} onClick={() => setNewTracker(p=>({...p,color:c}))}
                      className={`w-7 h-7 rounded-md transition-all ${newTracker.color===c?'ring-2 ring-offset-1 ring-[#0A0A0A] scale-110':''}`}
                      style={{background:c}} />
                  ))}
                </div>
              </div>

              {/* Preview */}
              <div className="bg-[#f7f7f7] rounded-md p-3 mb-4 flex items-center gap-2">
                <span className="text-[20px]">{newTracker.emoji}</span>
                <span className="text-[13px] font-bold">{newTracker.name||'Tracker name'}</span>
                <div className="ml-auto w-6 h-6 rounded-md" style={{background:newTracker.color}} />
              </div>

              <button onClick={addTracker}
                className="w-full bg-[#FF5C00] text-white text-[10px] font-bold uppercase tracking-[.1em] py-2 rounded-md hover:bg-[#FF7A2E] transition-colors mb-2">
                {editId ? 'Update Tracker' : '+ Add Tracker'}
              </button>
              {editId && (
                <button onClick={() => {setEditId(null);setNewTracker({name:'',emoji:'📸',color:'#FF5C00'})}}
                  className="w-full border border-[#dedede] text-[10px] font-bold uppercase tracking-[.1em] py-2 rounded-md hover:border-[#0A0A0A] transition-colors">
                  Cancel
                </button>
              )}

              {/* Existing trackers list */}
              {trackers.length > 0 && (
                <div className="mt-4 pt-4 border-t border-[#efefef]">
                  <div className="text-[9px] font-bold text-[#888] uppercase tracking-[.12em] mb-2">Your Trackers</div>
                  {trackers.map(t => (
                    <div key={t.id} className="flex items-center gap-2 py-1.5 border-b border-[#f7f7f7] last:border-0">
                      <span className="text-[14px]">{t.emoji}</span>
                      <span className="text-[11px] font-semibold flex-1 truncate">{t.name}</span>
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{background:t.color}} />
                      <button onClick={() => startEdit(t)} className="text-[10px] text-[#bcbcbc] hover:text-[#888] transition-colors">✎</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
