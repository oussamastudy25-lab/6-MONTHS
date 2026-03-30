'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

const sb = createClient()

type Block = { id: string; hour: number; label: string; category: string }
type Zone  = { id: string; name: string; start_hour: number; end_hour: number; position: number }
type ZoneLog = { zone_id: string; date: string; respected: boolean }

const CATEGORIES = [
  { key: 'prayer',   label: 'Prayer',   color: '#06b6d4', emoji: '🕌' },
  { key: 'study',    label: 'Study',    color: '#8b5cf6', emoji: '📚' },
  { key: 'gym',      label: 'Gym/Judo', color: '#22c55e', emoji: '🏋️' },
  { key: 'content',  label: 'Content',  color: '#FF5C00', emoji: '🎬' },
  { key: 'business', label: 'Business', color: '#f59e0b', emoji: '💼' },
  { key: 'rest',     label: 'Rest',     color: '#bcbcbc', emoji: '😴' },
  { key: 'meal',     label: 'Meal',     color: '#ec4899', emoji: '🍽️' },
  { key: 'other',    label: 'Other',    color: '#888',    emoji: '📌' },
]

const CAT = Object.fromEntries(CATEGORIES.map(c => [c.key, c]))
const HOURS = Array.from({ length: 20 }, (_, i) => i + 4) // 4am to 11pm

function fmt(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function hourLabel(h: number) {
  if (h === 0) return '12 AM'
  if (h === 12) return '12 PM'
  return h < 12 ? `${h} AM` : `${h - 12} PM`
}

export default function SchedulePage() {
  const today = fmt()
  const now = new Date()
  const currentHour = now.getHours()

  const [blocks, setBlocks]     = useState<Block[]>([])
  const [zones, setZones]       = useState<Zone[]>([])
  const [zoneLogs, setZoneLogs] = useState<ZoneLog[]>([])
  const [tab, setTab]           = useState<'schedule'|'zones'>('schedule')

  // Edit state
  const [editHour, setEditHour] = useState<number | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editCat, setEditCat]   = useState('study')

  // Zone form
  const [zoneForm, setZoneForm] = useState({ name: '', start_hour: 5, end_hour: 7 })
  const [editZoneId, setEditZoneId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const [{ data: b }, { data: z }, { data: zl }] = await Promise.all([
      sb.from('schedule_blocks').select('*').eq('user_id', user.id).order('hour'),
      sb.from('phone_free_zones').select('*').eq('user_id', user.id).order('position'),
      sb.from('phone_free_logs').select('*').eq('user_id', user.id).eq('date', today),
    ])
    setBlocks(b ?? [])
    setZones(z ?? [])
    setZoneLogs(zl ?? [])
  }, [today])

  useEffect(() => { load() }, [load])

  function blockAt(hour: number): Block | undefined {
    return blocks.find(b => b.hour === hour)
  }

  function openEdit(hour: number) {
    const b = blockAt(hour)
    setEditHour(hour)
    setEditLabel(b?.label ?? '')
    setEditCat(b?.category ?? 'study')
  }

  async function saveBlock() {
    if (editHour === null) return
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const existing = blockAt(editHour)
    if (!editLabel.trim()) {
      // Delete if empty
      if (existing) {
        await sb.from('schedule_blocks').delete().eq('id', existing.id)
        setBlocks(prev => prev.filter(b => b.id !== existing.id))
      }
      setEditHour(null); return
    }
    if (existing) {
      await sb.from('schedule_blocks').update({ label: editLabel, category: editCat }).eq('id', existing.id)
      setBlocks(prev => prev.map(b => b.id === existing.id ? { ...b, label: editLabel, category: editCat } : b))
    } else {
      const { data } = await sb.from('schedule_blocks').insert({ user_id: user.id, hour: editHour, label: editLabel, category: editCat }).select().single()
      if (data) setBlocks(prev => [...prev, data].sort((a, b) => a.hour - b.hour))
    }
    setEditHour(null)
  }

  // Phone-free zones
  async function saveZone() {
    if (!zoneForm.name.trim()) return
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    if (editZoneId) {
      await sb.from('phone_free_zones').update({ name: zoneForm.name, start_hour: zoneForm.start_hour, end_hour: zoneForm.end_hour }).eq('id', editZoneId)
      setZones(prev => prev.map(z => z.id === editZoneId ? { ...z, ...zoneForm } : z))
      setEditZoneId(null)
    } else {
      const { data } = await sb.from('phone_free_zones').insert({ user_id: user.id, ...zoneForm, position: zones.length }).select().single()
      if (data) setZones(prev => [...prev, data])
    }
    setZoneForm({ name: '', start_hour: 5, end_hour: 7 })
  }

  async function deleteZone(id: string) {
    if (!confirm('Delete this zone?')) return
    await sb.from('phone_free_zones').delete().eq('id', id)
    setZones(prev => prev.filter(z => z.id !== id))
  }

  async function toggleZoneLog(zoneId: string, respected: boolean) {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const existing = zoneLogs.find(l => l.zone_id === zoneId)
    if (existing) {
      // Toggle respect/fail or delete
      if (existing.respected === respected) {
        await sb.from('phone_free_logs').delete().eq('zone_id', zoneId).eq('date', today)
        setZoneLogs(prev => prev.filter(l => l.zone_id !== zoneId))
      } else {
        await sb.from('phone_free_logs').update({ respected }).eq('zone_id', zoneId).eq('date', today)
        setZoneLogs(prev => prev.map(l => l.zone_id === zoneId ? { ...l, respected } : l))
      }
    } else {
      await sb.from('phone_free_logs').upsert({ user_id: user.id, zone_id: zoneId, date: today, respected }, { onConflict: 'zone_id,date' })
      setZoneLogs(prev => [...prev, { zone_id: zoneId, date: today, respected }])
    }
  }

  function isPhoneFreeNow() {
    return zones.some(z => currentHour >= z.start_hour && currentHour < z.end_hour)
  }

  const activeZone = zones.find(z => currentHour >= z.start_hour && currentHour < z.end_hour)
  const filled = blocks.length
  const totalHours = HOURS.length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white px-6 py-3 border-b-2 border-[#0A0A0A] flex items-center flex-shrink-0">
        <div>
          <div className="text-[19px] font-bold tracking-[.04em]">Daily Plan</div>
          <div className="text-[10px] text-[#888] tracking-[.12em] uppercase mt-0.5">
            {new Date().toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long' })} · {hourLabel(currentHour)} now
          </div>
        </div>
        {isPhoneFreeNow() && (
          <div className="ml-4 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-[.1em] animate-pulse"
            style={{ background: 'rgba(239,68,68,.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,.3)' }}>
            📵 Phone-Free Zone Active
          </div>
        )}
        {activeZone && (
          <div className="ml-2 text-[10px] text-[#888]">{activeZone.name} until {hourLabel(activeZone.end_hour)}</div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b-2 border-[#0A0A0A] flex-shrink-0">
        {(['schedule', 'zones'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2.5 text-[10.5px] font-bold uppercase tracking-[.1em] border-b-2 -mb-0.5 transition-all ${tab === t ? 'text-[#FF5C00] border-[#FF5C00]' : 'text-[#888] border-transparent hover:text-[#0A0A0A]'}`}>
            {t === 'schedule' ? '🗓 Daily Schedule' : '📵 Phone-Free Zones'}
          </button>
        ))}
      </div>

      {tab === 'schedule' && (
        <div className="flex flex-1 overflow-hidden">
          {/* Schedule grid */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="text-[9px] font-bold text-[#bcbcbc] tracking-[.16em] uppercase mb-3">
              {filled}/{totalHours} hours planned — click any slot to edit
            </div>
            <div className="max-w-2xl space-y-1">
              {HOURS.map(h => {
                const b = blockAt(h)
                const cat = b ? (CAT[b.category] ?? CAT.other) : null
                const isCurrent = h === currentHour
                const isPast = h < currentHour
                const isEditing = editHour === h

                return (
                  <div key={h} className={`flex items-stretch rounded-lg overflow-hidden border transition-all ${isCurrent ? 'border-[#FF5C00] border-2 shadow-sm' : 'border-[#efefef] hover:border-[#dedede]'}`}>
                    {/* Hour label */}
                    <div className={`w-16 flex-shrink-0 flex items-center justify-center text-[10px] font-mono font-bold border-r ${isCurrent ? 'bg-[#FF5C00] text-white border-[#FF5C00]' : isPast ? 'bg-[#f7f7f7] text-[#bcbcbc] border-[#efefef]' : 'bg-[#fafafa] text-[#888] border-[#efefef]'}`}>
                      {hourLabel(h)}
                    </div>

                    {/* Block content */}
                    {isEditing ? (
                      <div className="flex-1 p-2 bg-white flex items-center gap-2">
                        <div className="flex gap-1 flex-wrap">
                          {CATEGORIES.map(c => (
                            <button key={c.key} onClick={() => setEditCat(c.key)}
                              className={`px-2 py-1 rounded text-[9px] font-bold border transition-all ${editCat === c.key ? 'text-white border-transparent' : 'border-[#efefef] text-[#888]'}`}
                              style={editCat === c.key ? { background: c.color } : {}}>
                              {c.emoji}
                            </button>
                          ))}
                        </div>
                        <input
                          autoFocus
                          className="flex-1 bg-[#f7f7f7] border border-[#dedede] rounded px-2 py-1.5 text-[12px] outline-none focus:border-[#FF5C00]"
                          placeholder="What are you doing this hour?"
                          value={editLabel}
                          onChange={e => setEditLabel(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveBlock(); if (e.key === 'Escape') setEditHour(null) }}
                        />
                        <button onClick={saveBlock} className="bg-[#FF5C00] text-white text-[9px] font-bold uppercase tracking-[.08em] px-2 py-1.5 rounded hover:bg-[#FF7A2E] transition-colors">Save</button>
                        <button onClick={() => setEditHour(null)} className="text-[11px] text-[#888] hover:text-[#0A0A0A] px-1">✕</button>
                      </div>
                    ) : b ? (
                      <button onClick={() => openEdit(h)} className="flex-1 flex items-center gap-3 px-3 py-2.5 bg-white hover:bg-[#fafafa] transition-colors text-left">
                        <span className="text-[16px]">{cat?.emoji}</span>
                        <span className={`text-[12px] font-semibold flex-1 ${isPast ? 'text-[#bcbcbc]' : 'text-[#0A0A0A]'}`}>{b.label}</span>
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cat?.color }} />
                      </button>
                    ) : (
                      <button onClick={() => openEdit(h)} className="flex-1 flex items-center px-3 py-2.5 bg-white hover:bg-[#fafafa] transition-colors">
                        <span className="text-[11px] text-[#dedede] hover:text-[#bcbcbc]">+ Add block</span>
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Today summary sidebar */}
          <div className="w-52 border-l border-[#efefef] p-4 overflow-y-auto flex-shrink-0 bg-[#fafafa]">
            <div className="text-[9px] font-bold text-[#bcbcbc] tracking-[.16em] uppercase mb-3">Today's Plan</div>
            {CATEGORIES.filter(c => blocks.some(b => b.category === c.key)).map(c => {
              const count = blocks.filter(b => b.category === c.key).length
              return (
                <div key={c.key} className="flex items-center gap-2 mb-2">
                  <span className="text-[14px]">{c.emoji}</span>
                  <div className="flex-1">
                    <div className="text-[10px] font-semibold">{c.label}</div>
                    <div className="text-[9px] text-[#888]">{count}h planned</div>
                  </div>
                  <div className="h-1.5 w-12 bg-[#efefef] rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, count/8*100)}%`, background: c.color }} />
                  </div>
                </div>
              )
            })}
            {blocks.length === 0 && (
              <div className="text-[11px] text-[#bcbcbc] text-center py-4">No blocks yet.<br/>Start planning.</div>
            )}
          </div>
        </div>
      )}

      {tab === 'zones' && (
        <div className="flex-1 overflow-y-auto p-5">
          <div className="max-w-2xl">
            {/* Current status banner */}
            <div className={`p-4 rounded-lg mb-5 border-2 ${isPhoneFreeNow() ? 'bg-[#FBE9E7] border-[#ef4444]' : 'bg-[#f0fdf4] border-[#22c55e]'}`}>
              <div className="text-[13px] font-bold mb-0.5" style={{ color: isPhoneFreeNow() ? '#8B0000' : '#166534' }}>
                {isPhoneFreeNow() ? '📵 You are in a phone-free zone right now' : '✅ No phone-free zone active right now'}
              </div>
              <div className="text-[11px]" style={{ color: isPhoneFreeNow() ? '#8B0000' : '#166534' }}>
                {isPhoneFreeNow() ? `${activeZone?.name} — put the phone down.` : 'Open Instagram if it\'s scheduled. Otherwise — work.'}
              </div>
            </div>

            {/* Today's zones check-in */}
            {zones.length > 0 && (
              <div className="mb-5">
                <div className="text-[9px] font-bold text-[#bcbcbc] tracking-[.16em] uppercase mb-3">Today's Check-In</div>
                <div className="space-y-2">
                  {zones.map(z => {
                    const log = zoneLogs.find(l => l.zone_id === z.id)
                    const isPast = currentHour >= z.end_hour
                    const isActive = currentHour >= z.start_hour && currentHour < z.end_hour
                    return (
                      <div key={z.id} className={`bg-white border rounded-lg p-4 ${isActive ? 'border-[#ef4444] border-2' : 'border-[#efefef]'}`}>
                        <div className="flex items-center gap-3 mb-3">
                          <div className="flex-1">
                            <div className="text-[13px] font-bold">{z.name}</div>
                            <div className="text-[10px] text-[#888] font-mono">{hourLabel(z.start_hour)} → {hourLabel(z.end_hour)}</div>
                          </div>
                          {isActive && <div className="text-[9px] font-bold uppercase tracking-[.1em] text-[#ef4444] animate-pulse">ACTIVE NOW</div>}
                          {log && <div className={`text-[9px] font-bold uppercase tracking-[.1em] ${log.respected ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>{log.respected ? '✓ RESPECTED' : '✗ BROKE IT'}</div>}
                        </div>
                        {(isPast || isActive) && (
                          <div className="flex gap-2">
                            <button onClick={() => toggleZoneLog(z.id, true)}
                              className={`flex-1 py-2 rounded-md text-[10px] font-bold uppercase tracking-[.1em] border-2 transition-all ${log?.respected === true ? 'bg-[#22c55e] text-white border-[#22c55e]' : 'border-[#22c55e] text-[#22c55e] hover:bg-[#f0fdf4]'}`}>
                              ✓ Phone stayed away
                            </button>
                            <button onClick={() => toggleZoneLog(z.id, false)}
                              className={`flex-1 py-2 rounded-md text-[10px] font-bold uppercase tracking-[.1em] border-2 transition-all ${log?.respected === false ? 'bg-[#ef4444] text-white border-[#ef4444]' : 'border-[#ef4444] text-[#ef4444] hover:bg-[#FBE9E7]'}`}>
                              ✗ I checked my phone
                            </button>
                          </div>
                        )}
                        {!isPast && !isActive && (
                          <div className="text-[10px] text-[#bcbcbc]">Check-in available when the zone is active or after it ends.</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Add / edit zone form */}
            <div className="border border-[#efefef] rounded-lg overflow-hidden mb-5">
              <div className="bg-[#0A0A0A] px-4 py-3">
                <span className="text-[11px] font-bold tracking-[.1em] text-white uppercase">{editZoneId ? 'Edit Zone' : '+ New Phone-Free Zone'}</span>
              </div>
              <div className="p-4 space-y-3 bg-white">
                <input className="w-full bg-[#f7f7f7] border border-[#dedede] rounded-md px-3 py-2 text-[13px] outline-none focus:border-[#FF5C00]"
                  placeholder="Zone name (e.g. Morning Focus, Study Block)"
                  value={zoneForm.name} onChange={e => setZoneForm(f => ({ ...f, name: e.target.value }))} />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[9px] font-bold text-[#888] uppercase tracking-[.12em] mb-1">Start</div>
                    <select className="w-full bg-[#f7f7f7] border border-[#dedede] rounded-md px-3 py-2 text-[12px] outline-none focus:border-[#FF5C00]"
                      value={zoneForm.start_hour} onChange={e => setZoneForm(f => ({ ...f, start_hour: parseInt(e.target.value) }))}>
                      {Array.from({ length: 20 }, (_, i) => i + 4).map(h => (
                        <option key={h} value={h}>{hourLabel(h)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div className="text-[9px] font-bold text-[#888] uppercase tracking-[.12em] mb-1">End</div>
                    <select className="w-full bg-[#f7f7f7] border border-[#dedede] rounded-md px-3 py-2 text-[12px] outline-none focus:border-[#FF5C00]"
                      value={zoneForm.end_hour} onChange={e => setZoneForm(f => ({ ...f, end_hour: parseInt(e.target.value) }))}>
                      {Array.from({ length: 20 }, (_, i) => i + 5).map(h => (
                        <option key={h} value={h}>{hourLabel(h)}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={saveZone} className="flex-1 bg-[#FF5C00] text-white text-[10px] font-bold uppercase tracking-[.1em] py-2 rounded-md hover:bg-[#FF7A2E] transition-colors">
                    {editZoneId ? 'Update Zone' : 'Add Zone'}
                  </button>
                  {editZoneId && (
                    <button onClick={() => { setEditZoneId(null); setZoneForm({ name: '', start_hour: 5, end_hour: 7 }) }}
                      className="border border-[#dedede] text-[10px] font-bold uppercase tracking-[.1em] px-4 py-2 rounded-md hover:border-[#0A0A0A] transition-colors">
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Zones list */}
            {zones.length > 0 && (
              <div>
                <div className="text-[9px] font-bold text-[#bcbcbc] tracking-[.16em] uppercase mb-3">Your Zones</div>
                <div className="space-y-2">
                  {zones.map(z => (
                    <div key={z.id} className="flex items-center gap-3 bg-white border border-[#efefef] rounded-lg px-4 py-3 hover:border-[#dedede] transition-colors">
                      <div className="text-[16px]">📵</div>
                      <div className="flex-1">
                        <div className="text-[12px] font-bold">{z.name}</div>
                        <div className="text-[10px] text-[#888] font-mono">{hourLabel(z.start_hour)} → {hourLabel(z.end_hour)}</div>
                      </div>
                      <button onClick={() => { setZoneForm({ name: z.name, start_hour: z.start_hour, end_hour: z.end_hour }); setEditZoneId(z.id) }}
                        className="text-[10px] text-[#bcbcbc] hover:text-[#888] transition-colors">✎</button>
                      <button onClick={() => deleteZone(z.id)}
                        className="text-[10px] text-[#bcbcbc] hover:text-[#ef4444] transition-colors">×</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
