'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { fetchEvents, createTimeBlock, deleteEvent, fmtTime, fmtEventDuration, type GCalEvent } from '@/lib/gcal'

type Habit = { id: string; name: string }
type Log   = { habit_id: string; status: 'done'|'missed'|'na' }

const sb = createClient()
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS   = ['MON','TUE','WED','THU','FRI','SAT','SUN']

export default function CalendarPage() {
  const now = new Date()
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [habits, setHabits]     = useState<Habit[]>([])
  const [logs, setLogs]         = useState<Record<string, Log[]>>({})
  const [gcalEvents, setGcalEvents] = useState<GCalEvent[]>([])
  const [token, setToken]       = useState<string|null>(null)
  const [modalDate, setModalDate] = useState<string|null>(null)
  const [gcalOpen, setGcalOpen] = useState(false)
  const [newBlock, setNewBlock] = useState({ summary: '', start: '09:00', end: '10:00' })
  const [gcalLoading, setGcalLoading] = useState(false)
  const [modalLogs, setModalLogs] = useState<Record<string, string>>({})

  const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`

  const load = useCallback(async () => {
    const { data: { session } } = await sb.auth.getSession()
    if (!session?.user) return
    setToken(session.provider_token ?? null)

    const ym = `${year}-${String(month+1).padStart(2,'0')}`
    const [{ data: h }, { data: l }] = await Promise.all([
      sb.from('habits').select('id,name').eq('user_id', session.user.id).is('archived_at', null).order('position'),
      sb.from('habit_logs').select('habit_id,status,date').eq('user_id', session.user.id).like('date', `${ym}-%`),
    ])
    setHabits(h ?? [])
    const grouped: Record<string, Log[]> = {}
    ;(l ?? []).forEach((row: Log & {date: string}) => {
      if (!grouped[row.date]) grouped[row.date] = []
      grouped[row.date].push({ habit_id: row.habit_id, status: row.status })
    })
    setLogs(grouped)
  }, [year, month])

  useEffect(() => { load() }, [load])

  async function loadGcal() {
    if (!token) return
    setGcalLoading(true)
    try {
      const start = new Date(year, month, 1).toISOString()
      const end   = new Date(year, month+1, 0, 23, 59, 59).toISOString()
      const events = await fetchEvents(token, start, end)
      setGcalEvents(events)
    } catch (e) { console.error(e) }
    setGcalLoading(false)
  }

  function openModal(dateStr: string) {
    const dayLogs = logs[dateStr] ?? []
    const map: Record<string, string> = {}
    dayLogs.forEach(l => { map[l.habit_id] = l.status })
    setModalLogs(map)
    setModalDate(dateStr)
  }

  async function setStatus(hid: string, status: string) {
    if (!modalDate) return
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const current = modalLogs[hid] ?? ''
    const newStatus = current === status ? null : status

    setModalLogs(prev => {
      const next = {...prev}
      if (newStatus) next[hid] = newStatus; else delete next[hid]
      return next
    })

    if (newStatus) {
      await sb.from('habit_logs').upsert({ user_id: user.id, habit_id: hid, date: modalDate, status: newStatus }, { onConflict: 'habit_id,date' })
    } else {
      await sb.from('habit_logs').delete().eq('habit_id', hid).eq('date', modalDate)
    }
    load()
  }

  async function createBlock() {
    if (!token || !newBlock.summary || !modalDate) return
    const start = `${modalDate}T${newBlock.start}:00`
    const end   = `${modalDate}T${newBlock.end}:00`
    await createTimeBlock(token, newBlock.summary, start, end)
    setNewBlock({ summary: '', start: '09:00', end: '10:00' })
    loadGcal()
  }

  // Build calendar grid
  const daysInMonth = new Date(year, month+1, 0).getDate()
  const firstDow = new Date(year, month, 1).getDay()
  const startOffset = firstDow === 0 ? 6 : firstDow - 1
  const allDays: (string|null)[] = [...Array(startOffset).fill(null)]
  for (let d = 1; d <= daysInMonth; d++) {
    allDays.push(`${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`)
  }
  while (allDays.length % 7 !== 0) allDays.push(null)

  function cellStats(dateStr: string) {
    const dl = logs[dateStr] ?? []
    const done = dl.filter(l => l.status==='done').length
    const missed = dl.filter(l => l.status==='missed').length
    const tracked = done + missed
    const pct = tracked > 0 ? Math.round(done/tracked*100) : null
    return { done, missed, pct }
  }

  function dayEvents(dateStr: string) {
    return gcalEvents.filter(e => {
      const d = e.start.dateTime ? e.start.dateTime.slice(0,10) : e.start.date
      return d === dateStr
    })
  }

  const modalDay = modalDate ? parseInt(modalDate.split('-')[2]) : null
  const modalDow = modalDate ? new Date(modalDate).getDay() : null
  const DOW_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white px-6 py-3 border-b-2 border-[#0A0A0A] flex items-center flex-shrink-0">
        <div>
          <div className="text-[19px] font-bold tracking-[.04em]">Calendar</div>
          <div className="text-[10px] text-[#888] tracking-[.12em] uppercase mt-0.5">Click any day to log habits</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {token && (
            <button onClick={() => { setGcalOpen(!gcalOpen); if(!gcalOpen) loadGcal() }}
              className={`text-[10px] font-bold uppercase tracking-[.1em] px-3 py-1.5 rounded-md border transition-colors ${gcalOpen ? 'bg-[#0A0A0A] text-white border-[#0A0A0A]' : 'border-[#dedede] text-[#888] hover:border-[#0A0A0A] hover:text-[#0A0A0A]'}`}>
              ◷ Calendar
            </button>
          )}
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
        {gcalLoading && <span className="text-[10px] text-[#888] ml-2">Loading calendar…</span>}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Calendar grid */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DAYS.map(d => <div key={d} className="text-center text-[9px] font-bold text-[#bcbcbc] tracking-[.1em] py-1 uppercase">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {allDays.map((ds, i) => {
              if (!ds) return <div key={i} className="min-h-[80px] bg-[#fafafa] rounded-md opacity-30" />
              const isToday = ds === today
              const dow = new Date(ds).getDay()
              const isWknd = dow===0||dow===6
              const { pct, done, missed } = cellStats(ds)
              const evts = gcalOpen ? dayEvents(ds) : []
              const day = parseInt(ds.split('-')[2])
              return (
                <div key={ds} onClick={() => openModal(ds)}
                  className={`min-h-[80px] rounded-md p-1.5 cursor-pointer transition-all border ${isToday ? 'border-2 border-[#FF5C00]' : 'border border-[#efefef] hover:border-[#FF5C00]'} ${isWknd ? 'bg-[#fafafa]' : 'bg-white'}`}>
                  <div className={`text-[12px] font-bold mb-1 ${isToday ? 'text-[#FF5C00]' : ''}`}>{day}</div>
                  {/* Habit dots */}
                  <div className="flex flex-wrap gap-0.5">
                    {habits.slice(0,10).map(h => {
                      const v = (logs[ds]??[]).find(l=>l.habit_id===h.id)?.status ?? ''
                      return <div key={h.id} className={`w-1.5 h-1.5 rounded-full ${v==='done'?'bg-[#FF5C00]':v==='missed'?'bg-[#dedede]':v==='na'?'bg-[#efefef]':'bg-[#efefef]'}`} />
                    })}
                  </div>
                  {pct !== null && (
                    <>
                      <div className="mt-1 h-[3px] bg-[#efefef] rounded-full overflow-hidden">
                        <div className="h-full bg-[#FF5C00] rounded-full" style={{width:`${pct}%`}} />
                      </div>
                      <div className="font-mono text-[9px] text-[#888] mt-0.5">{pct}%</div>
                    </>
                  )}
                  {/* GCal events */}
                  {evts.slice(0,2).map(e => (
                    <div key={e.id} className="mt-0.5 text-[8px] bg-[#FFF0E8] text-[#FF5C00] rounded px-1 truncate font-medium">
                      {fmtTime(e.start.dateTime)} {e.summary}
                    </div>
                  ))}
                  {evts.length > 2 && <div className="text-[8px] text-[#888] mt-0.5">+{evts.length-2} more</div>}
                </div>
              )
            })}
          </div>
        </div>

        {/* GCal side panel */}
        {gcalOpen && token && (
          <div className="w-[260px] border-l border-[#efefef] flex flex-col overflow-hidden flex-shrink-0">
            <div className="px-3 py-2 border-b border-[#efefef] bg-[#fafafa]">
              <div className="text-[10px] font-bold uppercase tracking-[.1em]">Google Calendar</div>
              <div className="text-[9px] text-[#888]">{MONTHS[month]} {year}</div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {gcalEvents.length === 0 && <div className="text-[11px] text-[#888] text-center py-8">No events this month</div>}
              {gcalEvents.map(e => (
                <div key={e.id} className="mb-1.5 p-2 rounded-md bg-white border border-[#efefef] hover:border-[#dedede] transition-colors group">
                  <div className="text-[11px] font-semibold leading-tight">{e.summary}</div>
                  {e.start.dateTime && (
                    <div className="text-[9px] text-[#888] font-mono mt-0.5">
                      {e.start.dateTime.slice(5,10).replace('-','/')} · {fmtTime(e.start.dateTime)} – {fmtTime(e.end.dateTime)} · {fmtEventDuration(e.start.dateTime, e.end.dateTime)}
                    </div>
                  )}
                  {e.start.date && <div className="text-[9px] text-[#888] font-mono mt-0.5">All day</div>}
                  <button onClick={() => token && deleteEvent(token, e.id).then(loadGcal)}
                    className="hidden group-hover:block text-[8px] text-[#888] hover:text-[#8B0000] mt-1 uppercase tracking-[.08em]">Remove</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Habit log modal */}
      {modalDate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm" onClick={e => { if(e.target===e.currentTarget) setModalDate(null) }}>
          <div className="bg-white rounded-xl w-[480px] max-w-[95vw] max-h-[88vh] flex flex-col shadow-2xl fade-up">
            <div className="px-5 py-4 border-b-2 border-[#0A0A0A] flex items-center">
              <div>
                <div className="text-[15px] font-bold">{modalDay} {MONTHS[month]} {year}</div>
                <div className="text-[10px] text-[#888] uppercase tracking-[.12em]">{modalDow !== null ? DOW_NAMES[modalDow] : ''}</div>
              </div>
              <button onClick={() => setModalDate(null)} className="ml-auto w-7 h-7 border border-[#dedede] rounded flex items-center justify-center text-[#888] hover:bg-[#0A0A0A] hover:text-white transition-colors">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {habits.length === 0 && <div className="text-[13px] text-[#888] py-4">No habits configured. Go to Setup first.</div>}
              {habits.map(h => {
                const v = modalLogs[h.id] ?? ''
                return (
                  <div key={h.id} className="flex items-center gap-2.5 p-3 rounded-md bg-[#f7f7f7] border border-[#efefef] mb-1.5">
                    <div className="flex-1 text-[13px] font-semibold">{h.name}</div>
                    <div className="flex gap-1.5">
                      {([['done','DONE','#E8F5E9','#1B5E20'],['missed','MISS','#FBE9E7','#8B0000'],['na','N/A','#f5f5f5','#666']] as const).map(([s,l,bg,fg]) => (
                        <button key={s} onClick={() => setStatus(h.id, s)}
                          className="px-2 py-1 rounded text-[9px] font-bold tracking-[.07em] border transition-all"
                          style={v===s ? {background:bg,borderColor:fg,color:fg} : {background:'white',borderColor:'#dedede',color:'#888'}}>
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}

              {/* Create time block in modal */}
              {token && (
                <div className="mt-4 pt-4 border-t border-[#efefef]">
                  <div className="text-[9px] font-bold uppercase tracking-[.12em] text-[#888] mb-2">Add Time Block to Google Calendar</div>
                  <input className="w-full bg-[#f7f7f7] border border-[#dedede] rounded-md px-3 py-2 text-[12px] outline-none focus:border-[#FF5C00] mb-2"
                    placeholder="Block name (e.g. Deep work, Gym…)" value={newBlock.summary}
                    onChange={e => setNewBlock(b => ({...b,summary:e.target.value}))} />
                  <div className="flex gap-2 items-center mb-2">
                    <input type="time" className="flex-1 bg-[#f7f7f7] border border-[#dedede] rounded-md px-2 py-1.5 text-[12px] outline-none focus:border-[#FF5C00]"
                      value={newBlock.start} onChange={e => setNewBlock(b=>({...b,start:e.target.value}))} />
                    <span className="text-[#888] text-[11px]">→</span>
                    <input type="time" className="flex-1 bg-[#f7f7f7] border border-[#dedede] rounded-md px-2 py-1.5 text-[12px] outline-none focus:border-[#FF5C00]"
                      value={newBlock.end} onChange={e => setNewBlock(b=>({...b,end:e.target.value}))} />
                    <button onClick={createBlock}
                      className="bg-[#FF5C00] text-white text-[9px] font-bold uppercase tracking-[.1em] px-3 py-1.5 rounded-md hover:bg-[#FF7A2E] transition-colors whitespace-nowrap">
                      Add Block
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
