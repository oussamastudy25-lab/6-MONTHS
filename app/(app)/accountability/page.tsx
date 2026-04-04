'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

const sb = createClient()

type Profile = { id: string; slug: string; display_name: string; is_public: boolean; show_habits: boolean; show_focus: boolean; show_goals: boolean }
type Win     = { id: string; label: string; days_of_week: number[]; start_minutes: number; end_minutes: number; is_active: boolean }

const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

function minsToLabel(m: number) {
  return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`
}
function labelToMins(s: string) {
  const [h,m] = s.split(':').map(Number)
  return h*60 + (m||0)
}

export default function AccountabilityPage() {
  const [profile,   setProfile]   = useState<Profile|null>(null)
  const [windows,   setWindows]   = useState<Win[]>([])
  const [loaded,    setLoaded]    = useState(false)
  const [copied,    setCopied]    = useState(false)
  const [nameVal,   setNameVal]   = useState('')
  const [showForm,  setShowForm]  = useState(false)
  const [newWin,    setNewWin]    = useState({ label:'Deep Work', days:[1,2,3,4,5], start:540, end:780 })
  const [origin,    setOrigin]    = useState('')

  useEffect(() => { setOrigin(window.location.origin) }, [])

  const load = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return

    let { data: p } = await sb.from('accountability_profiles').select('*').eq('user_id', user.id).single()
    if (!p) {
      const { data: np } = await sb.from('accountability_profiles').insert({ user_id: user.id }).select().single()
      p = np
    }
    const { data: w } = await sb.from('accountability_windows').select('*').eq('user_id', user.id).order('created_at')

    if (p) { setProfile(p); setNameVal(p.display_name) }
    setWindows(w ?? [])
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
    if (!newWin.label.trim() || newWin.days.length === 0) return
    const { data } = await sb.from('accountability_windows').insert({
      user_id: user.id, label: newWin.label.trim(),
      days_of_week: newWin.days, start_minutes: newWin.start, end_minutes: newWin.end
    }).select().single()
    if (data) { setWindows(w => [...w, data]); setShowForm(false); setNewWin({ label:'Deep Work', days:[1,2,3,4,5], start:540, end:780 }) }
  }

  async function deleteWindow(id: string) {
    await sb.from('accountability_windows').delete().eq('id', id)
    setWindows(w => w.filter(x => x.id !== id))
  }

  async function regenSlug() {
    if (!profile) return
    if (!confirm('This breaks your existing link. Generate a new one?')) return
    const newSlug = Math.random().toString(36).substring(2, 10)
    await sb.from('accountability_profiles').update({ slug: newSlug }).eq('id', profile.id)
    setProfile(p => p ? {...p, slug: newSlug} : p)
  }

  function copyLink() {
    if (!profile) return
    navigator.clipboard.writeText(`${origin}/public/${profile.slug}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  if (!loaded) return <div className="flex-1 flex items-center justify-center text-[#888] text-[13px]">Loading…</div>

  const pubUrl = profile ? `${origin}/public/${profile.slug}` : ''

  return (
    <>
      <div className="bg-white px-6 py-3 border-b-2 border-[#0A0A0A] flex-shrink-0">
        <div className="text-[19px] font-bold tracking-[.04em]">Accountability</div>
        <div className="text-[10px] text-[#888] tracking-[.12em] uppercase mt-0.5">Your public progress page · live red/green status</div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-lg space-y-7">

          {/* Public link */}
          <div>
            <div className="text-[9px] font-bold text-[#bcbcbc] tracking-[.16em] uppercase mb-3">Your Public Link</div>
            <div className="bg-[#0A0A0A] rounded-xl p-4 space-y-3">
              <div className="text-[11px] text-[#555]">Share this with anyone — no login required. They see your live status.</div>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-[#1a1a1a] rounded-lg px-3 py-2.5 font-mono text-[11px] text-[#FF5C00] truncate border border-[#2a2a2a]">
                  {pubUrl}
                </div>
                <button onClick={copyLink}
                  className={`px-3 py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-[.08em] transition-all flex-shrink-0 ${copied?'bg-[#22c55e] text-white':'bg-[#FF5C00] text-white hover:bg-[#FF7A2E]'}`}>
                  {copied ? '✓ Copied!' : 'Copy'}
                </button>
              </div>
              <a href={pubUrl} target="_blank" rel="noopener noreferrer"
                className="text-[10px] text-[#444] hover:text-[#FF5C00] transition-colors inline-flex items-center gap-1">
                ↗ Preview your page
              </a>
            </div>
          </div>

          {/* Display name */}
          <div>
            <div className="text-[9px] font-bold text-[#bcbcbc] tracking-[.16em] uppercase mb-2">Display Name</div>
            <input
              className="w-full border border-[#efefef] rounded-lg px-3 py-2.5 text-[13px] outline-none focus:border-[#FF5C00] transition-colors"
              value={nameVal}
              onChange={e => setNameVal(e.target.value)}
              onBlur={() => nameVal.trim() && updateProfile({ display_name: nameVal.trim() })}
              onKeyDown={e => e.key==='Enter' && nameVal.trim() && updateProfile({ display_name: nameVal.trim() })}
              placeholder="Your name or alias"
            />
            <div className="text-[10px] text-[#bcbcbc] mt-1">Shows as the title on your public page</div>
          </div>

          {/* Visibility toggles */}
          <div>
            <div className="text-[9px] font-bold text-[#bcbcbc] tracking-[.16em] uppercase mb-3">Show on Public Page</div>
            <div className="space-y-2">
              {([
                ['show_habits', '▦  Habits (done today + days active)'],
                ['show_focus',  '⏱  Focus time today'],
                ['show_goals',  '◎  Active 6M goals with progress %'],
              ] as const).map(([key, label]) => (
                <div key={key} className="flex items-center justify-between bg-[#f7f7f7] border border-[#efefef] rounded-lg px-4 py-3">
                  <span className="text-[12px] text-[#0A0A0A]">{label}</span>
                  <button onClick={() => updateProfile({ [key]: !profile?.[key] })}
                    className="relative flex-shrink-0 transition-colors"
                    style={{width:40,height:22}}>
                    <div className={`w-10 h-5.5 rounded-full transition-colors ${profile?.[key]?'bg-[#FF5C00]':'bg-[#dedede]'}`} style={{height:22}} />
                    <div className={`absolute top-0.5 w-[18px] h-[18px] bg-white rounded-full shadow transition-all ${profile?.[key]?'left-[20px]':'left-[2px]'}`} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Accountability windows */}
          <div>
            <div className="text-[9px] font-bold text-[#bcbcbc] tracking-[.16em] uppercase mb-1">Accountability Windows</div>
            <div className="text-[10px] text-[#aaa] mb-3 leading-relaxed">
              During these hours, friends see <span className="text-[#ef4444] font-bold">🔴 NOT WORKING</span> if your timer is off,
              or <span className="text-[#22c55e] font-bold">🟢 LIVE</span> if it's running.
              Outside windows they see a neutral status — no pressure.
            </div>

            <div className="space-y-2 mb-3">
              {windows.length === 0 && !showForm && (
                <div className="text-[12px] text-[#bcbcbc] text-center py-5 bg-[#f9f9f9] rounded-lg border border-dashed border-[#efefef]">
                  No windows yet — add one to activate live status
                </div>
              )}
              {windows.map(w => (
                <div key={w.id} className="flex items-center gap-3 bg-white border border-[#efefef] rounded-lg px-4 py-3 hover:border-[#dedede] transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-[#0A0A0A]">{w.label}</div>
                    <div className="text-[10px] text-[#888] mt-0.5">
                      {w.days_of_week.map(d => DOW[d]).join(' · ')} &nbsp;·&nbsp; {minsToLabel(w.start_minutes)}–{minsToLabel(w.end_minutes)}
                    </div>
                  </div>
                  <button onClick={() => deleteWindow(w.id)}
                    className="w-6 h-6 flex items-center justify-center text-[13px] text-[#bcbcbc] hover:text-[#ef4444] transition-colors rounded">×</button>
                </div>
              ))}
            </div>

            {showForm ? (
              <div className="bg-[#f7f7f7] border border-[#efefef] rounded-xl p-4 space-y-3">
                <input
                  className="w-full bg-white border border-[#efefef] rounded-lg px-3 py-2.5 text-[13px] outline-none focus:border-[#FF5C00] transition-colors"
                  placeholder="Label (e.g. Deep Work, Study Block)"
                  value={newWin.label}
                  onChange={e => setNewWin(w => ({...w, label: e.target.value}))}
                />
                <div>
                  <div className="text-[9px] font-bold text-[#888] uppercase tracking-[.08em] mb-1.5">Days of Week</div>
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
                    <input type="time" className="w-full bg-white border border-[#efefef] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#FF5C00] transition-colors"
                      value={minsToLabel(newWin.start)}
                      onChange={e => setNewWin(w => ({...w, start: labelToMins(e.target.value)}))} />
                  </div>
                  <div>
                    <div className="text-[9px] font-bold text-[#888] uppercase tracking-[.08em] mb-1">End</div>
                    <input type="time" className="w-full bg-white border border-[#efefef] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#FF5C00] transition-colors"
                      value={minsToLabel(newWin.end)}
                      onChange={e => setNewWin(w => ({...w, end: labelToMins(e.target.value)}))} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={addWindow}
                    className="flex-1 bg-[#FF5C00] text-white text-[10px] font-bold uppercase tracking-[.08em] py-2.5 rounded-lg hover:bg-[#FF7A2E] transition-colors">
                    ＋ Add Window
                  </button>
                  <button onClick={() => setShowForm(false)}
                    className="px-4 border border-[#dedede] text-[10px] font-bold uppercase tracking-[.08em] text-[#888] rounded-lg hover:border-[#0A0A0A] transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowForm(true)}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-dashed border-[#dedede] text-[10px] font-bold uppercase tracking-[.08em] text-[#888] hover:border-[#FF5C00] hover:text-[#FF5C00] hover:bg-[#FFF0E8] transition-colors">
                ＋ Add accountability window
              </button>
            )}
          </div>

          {/* How it works */}
          <div className="bg-[#0A0A0A] rounded-xl p-4">
            <div className="text-[10px] font-bold text-[#555] uppercase tracking-[.12em] mb-3">How the Red/Green Status Works</div>
            <div className="space-y-2">
              {[
                ['🟢', '#22c55e', 'LIVE', 'Timer running during an accountability window'],
                ['🔴', '#ef4444', 'NOT WORKING', 'Window is active but timer is off — visible to everyone'],
                ['🟡', '#f59e0b', 'WORKING', 'Timer running but outside a scheduled window'],
                ['⚫', '#555',    'FREE TIME', 'No window scheduled — no status pressure'],
              ].map(([dot, color, label, desc]) => (
                <div key={label} className="flex items-start gap-2.5">
                  <span className="text-[14px] flex-shrink-0 mt-0.5">{dot}</span>
                  <div>
                    <span className="text-[10px] font-bold" style={{color}}>{label}</span>
                    <span className="text-[10px] text-[#444] ml-2">{desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Regen slug */}
          <div>
            <div className="text-[9px] font-bold text-[#bcbcbc] tracking-[.16em] uppercase mb-2">Danger Zone</div>
            <button onClick={regenSlug}
              className="text-[10px] text-[#444] hover:text-[#888] transition-colors uppercase tracking-[.08em]">
              ↻ Regenerate link (invalidates existing)
            </button>
          </div>

        </div>
      </div>
    </>
  )
}
