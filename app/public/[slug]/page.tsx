'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

const sb = createClient()

type Win  = { label: string; days_of_week: number[]; start_minutes: number; end_minutes: number }
type Goal = { title: string; category: string; pct: number }
type Data = {
  display_name: string; show_habits: boolean; show_focus: boolean; show_goals: boolean
  timer_running: boolean; habits_done: number; habits_total: number
  focus_today_mins: number; days_active_30: number
  weekly_goals_done: number; weekly_goals_total: number
  windows: Win[]; goals: Goal[]
}

function minsToLabel(m: number) {
  return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`
}
function fmtMins(m: number) {
  if (!m) return '0m'
  const h = Math.floor(m/60), min = m%60
  return h > 0 ? `${h}h${min > 0 ? ` ${min}m` : ''}` : `${min}m`
}
function isInWindow(w: Win) {
  const now = new Date()
  const dow = now.getDay()
  const mins = now.getHours()*60 + now.getMinutes()
  return w.days_of_week.includes(dow) && mins >= w.start_minutes && mins < w.end_minutes
}

const CAT_COLORS: Record<string,string> = {
  Health:'#22c55e', Mind:'#8b5cf6', Work:'#FF5C00',
  Relationships:'#ec4899', Finance:'#f59e0b', Spirit:'#06b6d4', Other:'#888'
}

export default function PublicPage({ params }: { params: { slug: string } }) {
  const [data, setData]       = useState<Data|null>(null)
  const [notFound, setNotFound] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<Date|null>(null)
  const [tick, setTick]       = useState(0) // forces re-render every second for live clock

  const load = useCallback(async () => {
    const { data: result } = await sb.rpc('get_public_profile', { p_slug: params.slug })
    if (!result) { setNotFound(true); return }
    setData(result)
    setUpdatedAt(new Date())
  }, [params.slug])

  useEffect(() => {
    load()
    const refresh = setInterval(load, 30_000)
    const clock   = setInterval(() => setTick(t => t+1), 1000)
    return () => { clearInterval(refresh); clearInterval(clock) }
  }, [load])

  if (notFound) return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
      <div className="text-center">
        <div className="text-[48px] mb-4">🔍</div>
        <div className="text-white text-[20px] font-bold mb-2">Profile not found</div>
        <div className="text-[#444] text-[13px]">This page doesn&apos;t exist or is set to private.</div>
      </div>
    </div>
  )

  if (!data) return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
      <div className="text-[#444] text-[13px]">Loading…</div>
    </div>
  )

  const activeWindow  = data.windows.find(w => isInWindow(w))
  const inWindow      = !!activeWindow
  const isLive        = data.timer_running

  const status = inWindow
    ? (isLive ? 'live' : 'offline')
    : (isLive ? 'working' : 'free')

  const cfg = {
    live:    { color:'#22c55e', border:'#22c55e40', bg:'#021a0d', dot:'🟢', label:'LIVE',         sub:'Timer is running · In the zone' },
    offline: { color:'#ef4444', border:'#ef444440', bg:'#1a0202', dot:'🔴', label:'NOT WORKING',  sub:`${activeWindow?.label ?? 'Deep Work'} window is active` },
    working: { color:'#f59e0b', border:'#f59e0b40', bg:'#1a1002', dot:'🟡', label:'WORKING',      sub:'Working outside scheduled window' },
    free:    { color:'#555',    border:'#55555540', bg:'#111111', dot:'⚫', label:'FREE TIME',     sub:'No accountability window right now' },
  }[status]

  const now    = new Date()
  const timeStr= now.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', second:'2-digit' })
  const dateStr= now.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' })

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white" style={{fontFamily:'system-ui,-apple-system,sans-serif'}}>

      {/* Top bar */}
      <div className="px-5 pt-6 pb-4 border-b border-[#1a1a1a]">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div>
            <span className="text-[13px] font-black tracking-[.12em]">MIZAN</span>
            <span className="text-[12px] text-[#FF5C00] ml-2" style={{fontFamily:'serif'}}>ميزان</span>
            <div className="text-[9px] text-[#333] uppercase tracking-[.12em] mt-0.5">accountability</div>
          </div>
          <div className="text-right">
            <div className="font-mono text-[20px] font-bold" style={{color:cfg.color}}>{timeStr}</div>
            <div className="text-[9px] text-[#444] mt-0.5">{dateStr}</div>
          </div>
        </div>
      </div>

      <div className="px-5 py-5 max-w-md mx-auto space-y-4">

        {/* Name */}
        <div className="text-[22px] font-black">{data.display_name}</div>

        {/* BIG STATUS CARD */}
        <div className="rounded-2xl px-5 py-6 text-center"
          style={{background:cfg.bg, border:`1px solid ${cfg.border}`}}>
          <div className="text-[11px] uppercase tracking-[.18em] mb-2" style={{color:cfg.color+'99'}}>
            status
          </div>
          <div className="text-[28px] font-black tracking-[.03em] mb-1" style={{color:cfg.color}}>
            {cfg.dot} {cfg.label}
          </div>
          <div className="text-[13px]" style={{color:cfg.color+'88'}}>{cfg.sub}</div>
          {inWindow && activeWindow && (
            <div className="text-[11px] font-mono mt-3 px-3 py-1.5 rounded-lg inline-block" style={{background:cfg.color+'15',color:cfg.color+'99'}}>
              {activeWindow.label} · {minsToLabel(activeWindow.start_minutes)}–{minsToLabel(activeWindow.end_minutes)}
            </div>
          )}
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-2.5">
          {data.show_habits && (
            <div className="bg-[#111] border border-[#1E1E1E] rounded-xl p-4 text-center">
              <div className="font-mono text-[22px] font-bold text-[#FF5C00]">{data.habits_done}/{data.habits_total}</div>
              <div className="text-[9px] text-[#444] uppercase tracking-[.1em] mt-1">Habits</div>
              <div className="text-[9px] text-[#2a2a2a] mt-1">{data.days_active_30}d / 30d</div>
            </div>
          )}
          {data.show_focus && (
            <div className="bg-[#111] border border-[#1E1E1E] rounded-xl p-4 text-center">
              <div className="font-mono text-[22px] font-bold text-[#FF5C00]">{fmtMins(data.focus_today_mins)}</div>
              <div className="text-[9px] text-[#444] uppercase tracking-[.1em] mt-1">Focus</div>
              <div className="text-[9px] text-[#2a2a2a] mt-1">today</div>
            </div>
          )}
          <div className="bg-[#111] border border-[#1E1E1E] rounded-xl p-4 text-center">
            <div className="font-mono text-[22px] font-bold text-[#FF5C00]">{data.weekly_goals_done}/{data.weekly_goals_total}</div>
            <div className="text-[9px] text-[#444] uppercase tracking-[.1em] mt-1">Goals</div>
            <div className="text-[9px] text-[#2a2a2a] mt-1">this week</div>
          </div>
        </div>

        {/* Active 6M goals */}
        {data.show_goals && data.goals && data.goals.length > 0 && (
          <div className="bg-[#111] border border-[#1E1E1E] rounded-xl p-4">
            <div className="text-[9px] font-bold text-[#333] uppercase tracking-[.12em] mb-3">Active Goals</div>
            <div className="space-y-3">
              {(data.goals as Goal[]).map((g, i) => {
                const color = CAT_COLORS[g.category] ?? '#888'
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{background:color}} />
                        <span className="text-[12px] font-medium truncate">{g.title}</span>
                      </div>
                      <span className="font-mono text-[11px] font-bold flex-shrink-0 ml-2" style={{color}}>{g.pct}%</span>
                    </div>
                    <div className="h-[3px] bg-[#1E1E1E] rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{width:`${g.pct}%`,background:color}} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center pt-2 pb-6 space-y-1">
          <div className="text-[9px] text-[#2a2a2a] uppercase tracking-[.1em]">
            Refreshes every 30s · updated {updatedAt?.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'}) ?? '...'}
          </div>
          <div className="text-[9px] text-[#222]">
            Powered by <span className="text-[#FF5C00]">Mizan ميزان</span> · Habit OS
          </div>
        </div>
      </div>
    </div>
  )
}
