'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

const sb = createClient()

type Profile  = { id: string; slug: string; display_name: string; is_public: boolean; show_habits: boolean; show_focus: boolean; show_goals: boolean }
type Win      = { id: string; label: string; days_of_week: number[]; start_minutes: number; end_minutes: number; is_active: boolean }
type Followed = { id: string; slug: string; nickname: string }
type FriendData = {
  display_name: string; timer_running: boolean
  habits_done: number; habits_total: number
  focus_today_mins: number; days_active_30: number
  weekly_goals_done: number; weekly_goals_total: number
  windows: { label: string; days_of_week: number[]; start_minutes: number; end_minutes: number }[]
  goals: { title: string; category: string; pct: number }[]
}

const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

function minsToLabel(m: number) {
  return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`
}
function labelToMins(s: string) {
  const [h,m] = s.split(':').map(Number); return h*60+(m||0)
}
function fmtMins(m: number) {
  if (!m) return '0m'
  const h = Math.floor(m/60), min = m%60
  return h > 0 ? `${h}h${min > 0 ? ` ${min}m` : ''}` : `${min}m`
}
function isInWindow(w: { days_of_week: number[]; start_minutes: number; end_minutes: number }) {
  const now = new Date(), dow = now.getDay(), mins = now.getHours()*60+now.getMinutes()
  return w.days_of_week.includes(dow) && mins >= w.start_minutes && mins < w.end_minutes
}

function FriendCard({ followed, onRemove }: { followed: Followed; onRemove: (id: string) => void }) {
  const [data, setData]         = useState<FriendData|null>(null)
  const [error, setError]       = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    sb.rpc('get_public_profile', { p_slug: followed.slug }).then(({ data: r }) => {
      if (!r) { setError(true); return }
      setData(r)
    })
    const interval = setInterval(async () => {
      const { data: r } = await sb.rpc('get_public_profile', { p_slug: followed.slug })
      if (r) setData(r)
    }, 30_000)
    return () => clearInterval(interval)
  }, [followed.slug])

  const activeWindow = data?.windows?.find(w => isInWindow(w))
  const inWindow     = !!activeWindow
  const isLive       = data?.timer_running ?? false
  const status = inWindow ? (isLive ? 'live' : 'offline') : (isLive ? 'working' : 'free')
  const habitPct = data && data.habits_total > 0 ? Math.round(data.habits_done / data.habits_total * 100) : 0

  const statusCfg = {
    live:    { dot: '🟢', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', label: 'Live' },
    offline: { dot: '🔴', color: '#dc2626', bg: '#fef2f2', border: '#fecaca', label: 'Not working' },
    working: { dot: '🟡', color: '#d97706', bg: '#fffbeb', border: '#fde68a', label: 'Working' },
    free:    { dot: '⚫', color: '#9ca3af', bg: '#f9fafb', border: '#e5e7eb', label: 'Free time' },
  }[status]

  return (
    <div className="bg-white border border-[#efefef] rounded-xl overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {error ? (
          <div className="text-[12px] text-[#ef4444] flex-1">Invalid code — profile not found</div>
        ) : !data ? (
          <div className="text-[12px] text-[#aaa] flex-1">Loading…</div>
        ) : (
          <>
            <div className="text-[18px] leading-none">{statusCfg.dot}</div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-bold text-[#0A0A0A] truncate">
                {followed.nickname || data.display_name}
              </div>
              <div className="text-[10px] mt-0.5" style={{color: statusCfg.color}}>
                {statusCfg.label}
                {inWindow && activeWindow && ` · ${activeWindow.label}`}
              </div>
            </div>
            {/* Quick stats */}
            <div className="flex items-center gap-3 text-right flex-shrink-0">
              <div>
                <div className="font-mono text-[13px] font-bold text-[#FF5C00]">{data.habits_done}/{data.habits_total}</div>
                <div className="text-[8px] text-[#bcbcbc] uppercase tracking-[.08em]">habits</div>
              </div>
              <div>
                <div className="font-mono text-[13px] font-bold text-[#FF5C00]">{fmtMins(data.focus_today_mins)}</div>
                <div className="text-[8px] text-[#bcbcbc] uppercase tracking-[.08em]">focus</div>
              </div>
            </div>
            <button onClick={() => setExpanded(e => !e)}
              className="w-6 h-6 flex items-center justify-center text-[#bcbcbc] hover:text-[#0A0A0A] transition-colors text-[12px]">
              {expanded ? '▲' : '▼'}
            </button>
          </>
        )}
        <button onClick={() => onRemove(followed.id)}
          className="w-5 h-5 flex items-center justify-center text-[13px] text-[#e0e0e0] hover:text-[#ef4444] transition-colors flex-shrink-0">×</button>
      </div>

      {/* Expanded detail */}
      {expanded && data && (
        <div className="border-t border-[#f5f5f5] px-4 py-3 space-y-3">
          {/* Status card */}
          {inWindow && (
            <div className="rounded-lg px-3 py-2.5" style={{background: statusCfg.bg, border: `1px solid ${statusCfg.border}`}}>
              <div className="text-[11px] font-bold" style={{color: statusCfg.color}}>
                {statusCfg.dot} {statusCfg.label}
                {activeWindow && ` · ${minsToLabel(activeWindow.start_minutes)}–${minsToLabel(activeWindow.end_minutes)}`}
              </div>
            </div>
          )}

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-[#f9f9f9] rounded-lg p-2.5 text-center">
              <div className="font-mono text-[15px] font-bold text-[#0A0A0A]">{data.habits_done}/{data.habits_total}</div>
              <div className="h-1 bg-[#efefef] rounded-full mt-1.5 mb-0.5 overflow-hidden">
                <div className="h-full bg-[#FF5C00] rounded-full" style={{width:`${habitPct}%`}}/>
              </div>
              <div className="text-[8.5px] text-[#aaa] uppercase tracking-[.08em]">Habits</div>
            </div>
            <div className="bg-[#f9f9f9] rounded-lg p-2.5 text-center">
              <div className="font-mono text-[15px] font-bold text-[#0A0A0A]">{fmtMins(data.focus_today_mins)}</div>
              <div className="text-[8.5px] text-[#aaa] uppercase tracking-[.08em] mt-1">Focus today</div>
            </div>
            <div className="bg-[#f9f9f9] rounded-lg p-2.5 text-center">
              <div className="font-mono text-[15px] font-bold text-[#0A0A0A]">{data.weekly_goals_done}/{data.weekly_goals_total}</div>
              <div className="text-[8.5px] text-[#aaa] uppercase tracking-[.08em] mt-1">Wk Goals</div>
            </div>
          </div>

          {/* Goals */}
          {data.goals && data.goals.length > 0 && (
            <div className="space-y-2">
              {data.goals.map((g, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-[#555] truncate flex-1">{g.title}</span>
                    <span className="text-[10px] font-bold text-[#FF5C00] flex-shrink-0 ml-2">{g.pct}%</span>
                  </div>
                  <div className="h-1 bg-[#efefef] rounded-full overflow-hidden">
                    <div className="h-full bg-[#FF5C00] rounded-full" style={{width:`${g.pct}%`}}/>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="text-[9px] text-[#ddd] text-center">Refreshes every 30s</div>
        </div>
      )}
    </div>
  )
}

export default function AccountabilityPage() {
  const [profile,    setProfile]    = useState<Profile|null>(null)
  const [windows,    setWindows]    = useState<Win[]>([])
  const [followed,   setFollowed]   = useState<Followed[]>([])
  const [loaded,     setLoaded]     = useState(false)
  const [nameVal,    setNameVal]    = useState('')
  const [showWinForm,setShowWinForm]= useState(false)
  const [newWin,     setNewWin]     = useState({ label:'Deep Work', days:[1,2,3,4,5], start:540, end:780 })
  // Follow by code
  const [addCode,    setAddCode]    = useState('')
  const [addNick,    setAddNick]    = useState('')
  const [addError,   setAddError]   = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [addStep,    setAddStep]    = useState<'input'|'confirm'>('input')
  const [preview,    setPreview]    = useState<{name:string}|null>(null)


  const load = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    let { data: p } = await sb.from('accountability_profiles').select('*').eq('user_id', user.id).single()
    if (!p) {
      const { data: np } = await sb.from('accountability_profiles').insert({ user_id: user.id }).select().single()
      p = np
    }
    const [{ data: w }, { data: f }] = await Promise.all([
      sb.from('accountability_windows').select('*').eq('user_id', user.id).order('created_at'),
      sb.from('followed_profiles').select('*').eq('user_id', user.id).order('added_at'),
    ])
    if (p) { setProfile(p); setNameVal(p.display_name) }
    setWindows(w ?? [])
    setFollowed(f ?? [])
    setLoaded(true)
  }, [])

  useEffect(() => { load() }, [load])

  async function updateProfile(updates: Partial<Profile>) {
    if (!profile) return
    setProfile(prev => prev ? {...prev, ...updates} : prev)
    await sb.from('accountability_profiles').update(updates).eq('id', profile.id)
  }

  async function addWindow() {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    if (!newWin.label.trim() || !newWin.days.length) return
    const { data } = await sb.from('accountability_windows').insert({
      user_id: user.id, label: newWin.label.trim(),
      days_of_week: newWin.days, start_minutes: newWin.start, end_minutes: newWin.end
    }).select().single()
    if (data) { setWindows(w => [...w, data]); setShowWinForm(false); setNewWin({ label:'Deep Work', days:[1,2,3,4,5], start:540, end:780 }) }
  }

  async function deleteWindow(id: string) {
    await sb.from('accountability_windows').delete().eq('id', id)
    setWindows(w => w.filter(x => x.id !== id))
  }

  // Follow flow
  async function lookupCode() {
    const code = addCode.trim()
    if (!code) return
    setAddLoading(true); setAddError('')
    const { data } = await sb.rpc('get_public_profile', { p_slug: code })
    setAddLoading(false)
    if (!data) { setAddError('Profile not found. Check the code and try again.'); return }
    if (code === profile?.slug) { setAddError("That's your own code!"); return }
    if (followed.find(f => f.slug === code)) { setAddError('You already follow this person.'); return }
    setPreview({ name: data.display_name })
    setAddStep('confirm')
  }

  async function confirmFollow() {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    setAddLoading(true)
    const { data } = await sb.from('followed_profiles').insert({
      user_id: user.id, slug: addCode.trim(), nickname: addNick.trim()
    }).select().single()
    setAddLoading(false)
    if (data) {
      setFollowed(f => [...f, data])
      setAddCode(''); setAddNick(''); setAddStep('input'); setPreview(null)
    }
  }

  async function removeFollowed(id: string) {
    await sb.from('followed_profiles').delete().eq('id', id)
    setFollowed(f => f.filter(x => x.id !== id))
  }

  if (!loaded) return <div className="flex-1 flex items-center justify-center text-[#888] text-[13px]">Loading…</div>

  return (
    <>
      <div className="bg-white px-6 py-3 border-b-2 border-[#0A0A0A] flex-shrink-0">
        <div className="text-[19px] font-bold tracking-[.04em]">Accountability</div>
        <div className="text-[10px] text-[#888] tracking-[.12em] uppercase mt-0.5">Your page · follow friends</div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-lg space-y-7">

          {/* ── YOUR CODE ── */}
          <div>
            <div className="text-[9px] font-bold text-[#bcbcbc] tracking-[.16em] uppercase mb-3">Your Code</div>
            <div className="bg-[#0A0A0A] rounded-xl p-5 flex items-center gap-5">
              <div>
                <div className="text-[9px] text-[#444] uppercase tracking-[.12em] mb-1.5">Share this with friends</div>
                <div className="font-mono text-[28px] font-black text-[#FF5C00] tracking-[.18em]">{profile?.slug}</div>
              </div>
              <div className="flex-1 text-[11px] text-[#444] leading-relaxed">
                Give this code to a friend — they paste it in Mizan to follow your live stats.
              </div>
            </div>
          </div>

          {/* ── FOLLOW A FRIEND ── */}
          <div>
            <div className="text-[9px] font-bold text-[#bcbcbc] tracking-[.16em] uppercase mb-3">Follow a Friend</div>
            {addStep === 'input' ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    className="flex-1 border border-[#efefef] rounded-lg px-3 py-2.5 text-[13px] font-mono outline-none focus:border-[#FF5C00] transition-colors"
                    placeholder="Paste their code (e.g. mp13m4w0)"
                    value={addCode}
                    onChange={e => { setAddCode(e.target.value); setAddError('') }}
                    onKeyDown={e => e.key === 'Enter' && lookupCode()}
                  />
                  <button onClick={lookupCode} disabled={!addCode.trim() || addLoading}
                    className="px-4 bg-[#FF5C00] text-white text-[10px] font-bold uppercase tracking-[.08em] rounded-lg hover:bg-[#FF7A2E] transition-colors disabled:opacity-40">
                    {addLoading ? '…' : 'Find'}
                  </button>
                </div>
                {addError && <div className="text-[11px] text-[#ef4444]">{addError}</div>}
              </div>
            ) : (
              <div className="bg-[#f7f7f7] border border-[#efefef] rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="text-[24px]">👤</div>
                  <div>
                    <div className="text-[14px] font-bold text-[#0A0A0A]">{preview?.name}</div>
                    <div className="text-[10px] text-[#aaa] font-mono">{addCode}</div>
                  </div>
                </div>
                <input
                  className="w-full border border-[#efefef] rounded-lg px-3 py-2 text-[12px] outline-none focus:border-[#FF5C00] transition-colors bg-white"
                  placeholder="Nickname (optional — e.g. Karim)"
                  value={addNick}
                  onChange={e => setAddNick(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && confirmFollow()}
                />
                <div className="flex gap-2">
                  <button onClick={confirmFollow} disabled={addLoading}
                    className="flex-1 bg-[#FF5C00] text-white text-[10px] font-bold uppercase tracking-[.08em] py-2.5 rounded-lg hover:bg-[#FF7A2E] transition-colors disabled:opacity-50">
                    {addLoading ? 'Adding…' : '＋ Follow'}
                  </button>
                  <button onClick={() => { setAddStep('input'); setPreview(null); setAddCode('') }}
                    className="px-4 border border-[#dedede] text-[10px] font-bold uppercase tracking-[.08em] rounded-lg hover:border-[#0A0A0A] transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── FOLLOWING LIST ── */}
          {followed.length > 0 && (
            <div>
              <div className="text-[9px] font-bold text-[#bcbcbc] tracking-[.16em] uppercase mb-3">
                Following · {followed.length}
              </div>
              <div className="space-y-2">
                {followed.map(f => (
                  <FriendCard key={f.id} followed={f} onRemove={removeFollowed} />
                ))}
              </div>
            </div>
          )}

          {/* ── DISPLAY NAME ── */}
          <div>
            <div className="text-[9px] font-bold text-[#bcbcbc] tracking-[.16em] uppercase mb-2">Your Display Name</div>
            <input
              className="w-full border border-[#efefef] rounded-lg px-3 py-2.5 text-[13px] outline-none focus:border-[#FF5C00] transition-colors"
              value={nameVal}
              onChange={e => setNameVal(e.target.value)}
              onBlur={() => nameVal.trim() && updateProfile({ display_name: nameVal.trim() })}
              onKeyDown={e => e.key==='Enter' && nameVal.trim() && updateProfile({ display_name: nameVal.trim() })}
              placeholder="Your name or alias"
            />
          </div>

          {/* ── VISIBILITY ── */}
          <div>
            <div className="text-[9px] font-bold text-[#bcbcbc] tracking-[.16em] uppercase mb-3">Show on Public Page</div>
            <div className="space-y-2">
              {([
                ['show_habits', '▦  Habits'],
                ['show_focus',  '⏱  Focus time'],
                ['show_goals',  '◎  6M Goals'],
              ] as const).map(([key, label]) => (
                <div key={key} className="flex items-center justify-between bg-[#f7f7f7] border border-[#efefef] rounded-lg px-4 py-3">
                  <span className="text-[12px] text-[#0A0A0A]">{label}</span>
                  <button onClick={() => updateProfile({ [key]: !profile?.[key] })}
                    className="relative flex-shrink-0" style={{width:40,height:22}}>
                    <div className={`w-10 rounded-full transition-colors ${profile?.[key]?'bg-[#FF5C00]':'bg-[#dedede]'}`} style={{height:22}}/>
                    <div className={`absolute top-0.5 w-[18px] h-[18px] bg-white rounded-full shadow transition-all ${profile?.[key]?'left-[20px]':'left-[2px]'}`}/>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* ── WINDOWS ── */}
          <div>
            <div className="text-[9px] font-bold text-[#bcbcbc] tracking-[.16em] uppercase mb-1">Accountability Windows</div>
            <div className="text-[10px] text-[#aaa] mb-3 leading-relaxed">
              During these hours: <span className="text-[#ef4444] font-bold">🔴 NOT WORKING</span> if timer off,
              <span className="text-[#16a34a] font-bold"> 🟢 LIVE</span> if timer running.
            </div>
            <div className="space-y-2 mb-3">
              {windows.length === 0 && !showWinForm && (
                <div className="text-[12px] text-[#bcbcbc] text-center py-5 bg-[#f9f9f9] rounded-lg border border-dashed border-[#efefef]">
                  No windows yet
                </div>
              )}
              {windows.map(w => (
                <div key={w.id} className="flex items-center gap-3 bg-white border border-[#efefef] rounded-lg px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold">{w.label}</div>
                    <div className="text-[10px] text-[#888] mt-0.5">
                      {w.days_of_week.map(d=>DOW[d]).join(' · ')} &nbsp;·&nbsp; {minsToLabel(w.start_minutes)}–{minsToLabel(w.end_minutes)}
                    </div>
                  </div>
                  <button onClick={() => deleteWindow(w.id)}
                    className="w-6 h-6 flex items-center justify-center text-[13px] text-[#bcbcbc] hover:text-[#ef4444] transition-colors">×</button>
                </div>
              ))}
            </div>
            {showWinForm ? (
              <div className="bg-[#f7f7f7] border border-[#efefef] rounded-xl p-4 space-y-3">
                <input className="w-full bg-white border border-[#efefef] rounded-lg px-3 py-2.5 text-[13px] outline-none focus:border-[#FF5C00] transition-colors"
                  placeholder="Label (e.g. Deep Work)" value={newWin.label}
                  onChange={e => setNewWin(w => ({...w, label: e.target.value}))} />
                <div>
                  <div className="text-[9px] font-bold text-[#888] uppercase tracking-[.08em] mb-1.5">Days</div>
                  <div className="flex gap-1 flex-wrap">
                    {DOW.map((d, i) => (
                      <button key={i}
                        onClick={() => setNewWin(w => ({ ...w, days: w.days.includes(i) ? w.days.filter(x=>x!==i) : [...w.days, i].sort() }))}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-bold border transition-all ${newWin.days.includes(i)?'bg-[#0A0A0A] text-white border-[#0A0A0A]':'border-[#dedede] text-[#888] hover:border-[#0A0A0A] hover:text-[#0A0A0A]'}`}>
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-[9px] font-bold text-[#888] uppercase tracking-[.08em] mb-1">Start</div>
                    <input type="time" className="w-full bg-white border border-[#efefef] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#FF5C00]"
                      value={minsToLabel(newWin.start)} onChange={e => setNewWin(w => ({...w, start: labelToMins(e.target.value)}))} />
                  </div>
                  <div>
                    <div className="text-[9px] font-bold text-[#888] uppercase tracking-[.08em] mb-1">End</div>
                    <input type="time" className="w-full bg-white border border-[#efefef] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#FF5C00]"
                      value={minsToLabel(newWin.end)} onChange={e => setNewWin(w => ({...w, end: labelToMins(e.target.value)}))} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={addWindow} className="flex-1 bg-[#FF5C00] text-white text-[10px] font-bold uppercase tracking-[.08em] py-2.5 rounded-lg hover:bg-[#FF7A2E] transition-colors">
                    ＋ Add Window
                  </button>
                  <button onClick={() => setShowWinForm(false)} className="px-4 border border-[#dedede] text-[10px] font-bold uppercase tracking-[.08em] rounded-lg hover:border-[#0A0A0A] transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowWinForm(true)}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-dashed border-[#dedede] text-[10px] font-bold uppercase tracking-[.08em] text-[#888] hover:border-[#FF5C00] hover:text-[#FF5C00] hover:bg-[#FFF0E8] transition-colors">
                ＋ Add window
              </button>
            )}
          </div>



        </div>
      </div>
    </>
  )
}
