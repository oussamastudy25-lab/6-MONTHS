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
function isInWindow(w: Win, now = new Date()) {
  const dow = now.getDay()
  const mins = now.getHours()*60 + now.getMinutes()
  return w.days_of_week.includes(dow) && mins >= w.start_minutes && mins < w.end_minutes
}
function minsUntilWindowEnd(w: Win, now = new Date()) {
  const mins = now.getHours()*60 + now.getMinutes()
  return Math.max(0, w.end_minutes - mins)
}
function minsOffline(timerRunning: boolean, windows: Win[], now = new Date()) {
  // rough: we don't know exactly when they stopped, just show "since window started" if !running
  if (timerRunning) return 0
  const activeWin = windows.find(w => isInWindow(w, now))
  if (!activeWin) return 0
  const mins = now.getHours()*60 + now.getMinutes()
  return mins - activeWin.start_minutes
}

const CAT_COLORS: Record<string,string> = {
  Health:'#16a34a', Mind:'#7c3aed', Work:'#ea580c',
  Relationships:'#db2777', Finance:'#d97706', Spirit:'#0891b2', Other:'#6b7280'
}
const DOW_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

export default function PublicPage({ params }: { params: { slug: string } }) {
  const [data, setData]         = useState<Data|null>(null)
  const [notFound, setNotFound] = useState(false)
  const [now, setNow]           = useState(new Date())

  const load = useCallback(async () => {
    const { data: result } = await sb.rpc('get_public_profile', { p_slug: params.slug })
    if (!result) { setNotFound(true); return }
    setData(result)
  }, [params.slug])

  useEffect(() => {
    load()
    const refresh = setInterval(load, 30_000)
    const clock   = setInterval(() => setNow(new Date()), 1000)
    return () => { clearInterval(refresh); clearInterval(clock) }
  }, [load])

  if (notFound) return (
    <div className="min-h-screen bg-[#f8f8f6] flex items-center justify-center">
      <div className="text-center">
        <div className="text-[56px] mb-4">🔍</div>
        <div className="text-[#0A0A0A] text-[20px] font-bold mb-2">Profile not found</div>
        <div className="text-[#888] text-[13px]">This accountability page doesn&apos;t exist or is set to private.</div>
      </div>
    </div>
  )

  if (!data) return (
    <div className="min-h-screen bg-[#f8f8f6] flex items-center justify-center">
      <div className="text-[#aaa] text-[13px]">Loading…</div>
    </div>
  )

  const activeWindow  = data.windows.find(w => isInWindow(w, now))
  const inWindow      = !!activeWindow
  const isLive        = data.timer_running
  const offlineMins   = minsOffline(isLive, data.windows, now)
  const remainingMins = activeWindow ? minsUntilWindowEnd(activeWindow, now) : 0

  // Determine status
  const status = inWindow ? (isLive ? 'live' : 'offline') : (isLive ? 'working' : 'free')

  const dateStr = now.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long' })
  const timeStr = now.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' })

  // Habit completion %
  const habitPct = data.habits_total > 0 ? Math.round(data.habits_done / data.habits_total * 100) : 0

  return (
    <div className="min-h-screen bg-[#f5f5f2]" style={{fontFamily:'system-ui,-apple-system,sans-serif'}}>

      {/* Top bar */}
      <div className="bg-white border-b border-[#e8e8e4] px-5 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-black tracking-[.1em] text-[#0A0A0A]">MIZAN</span>
            <span className="text-[11px] text-[#FF5C00]" style={{fontFamily:'serif'}}>ميزان</span>
            <span className="text-[10px] text-[#bbb] ml-1">accountability</span>
          </div>
          <div className="text-right">
            <div className="text-[13px] font-bold text-[#0A0A0A]">{timeStr}</div>
            <div className="text-[10px] text-[#aaa]">{dateStr}</div>
          </div>
        </div>
      </div>

      <div className="px-5 py-6 max-w-lg mx-auto space-y-4">

        {/* Name */}
        <div>
          <div className="text-[24px] font-black text-[#0A0A0A] leading-tight">{data.display_name}</div>
          {data.windows.length > 0 && (
            <div className="text-[11px] text-[#aaa] mt-1">
              {data.windows.map(w =>
                `${w.days_of_week.map(d=>DOW_SHORT[d]).join('/')} ${minsToLabel(w.start_minutes)}–${minsToLabel(w.end_minutes)}`
              ).join(' · ')}
            </div>
          )}
        </div>

        {/* STATUS CARD — only show when in a window */}
        {inWindow && (
          <div className={`rounded-2xl p-5 ${isLive
            ? 'bg-[#f0fdf4] border border-[#bbf7d0]'
            : 'bg-[#fef2f2] border border-[#fecaca]'}`}>
            <div className="flex items-start justify-between">
              <div>
                <div className={`text-[11px] font-bold uppercase tracking-[.12em] mb-1 ${isLive?'text-[#16a34a]':'text-[#dc2626]'}`}>
                  {isLive ? '● Live' : '● Not working'}
                </div>
                <div className="text-[18px] font-black text-[#0A0A0A] leading-tight">
                  {isLive
                    ? `In the zone`
                    : offlineMins > 0
                      ? `${offlineMins}m without working`
                      : `Should be working`}
                </div>
                <div className={`text-[12px] mt-1 ${isLive?'text-[#16a34a]':'text-[#888]'}`}>
                  {isLive
                    ? `${activeWindow?.label ?? 'Deep Work'} · ${remainingMins}m left in window`
                    : `${activeWindow?.label ?? 'Deep Work'} window is active`}
                </div>
              </div>
              <div className={`text-[40px] leading-none ${isLive?'':'opacity-30 grayscale'}`}>
                {isLive ? '🟢' : '🔴'}
              </div>
            </div>

            {/* Time left bar */}
            {activeWindow && (
              <div className="mt-4">
                <div className="flex justify-between text-[9px] text-[#aaa] mb-1 uppercase tracking-[.08em]">
                  <span>{minsToLabel(activeWindow.start_minutes)}</span>
                  <span>{remainingMins}m remaining</span>
                  <span>{minsToLabel(activeWindow.end_minutes)}</span>
                </div>
                <div className="h-1.5 bg-[#e5e5e5] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.round((1 - remainingMins / (activeWindow.end_minutes - activeWindow.start_minutes)) * 100)}%`,
                      background: isLive ? '#16a34a' : '#dc2626'
                    }} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Working outside window */}
        {!inWindow && isLive && (
          <div className="bg-[#fffbeb] border border-[#fde68a] rounded-2xl p-4 flex items-center gap-3">
            <span className="text-[28px]">🟡</span>
            <div>
              <div className="text-[14px] font-bold text-[#92400e]">Working</div>
              <div className="text-[11px] text-[#a16207]">Timer running outside scheduled window — bonus points</div>
            </div>
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          {data.show_habits && (
            <div className="bg-white border border-[#e8e8e4] rounded-xl p-4">
              <div className="text-[10px] font-bold text-[#aaa] uppercase tracking-[.1em] mb-2">Habits</div>
              <div className="text-[22px] font-black text-[#0A0A0A]">{data.habits_done}<span className="text-[14px] text-[#aaa] font-normal">/{data.habits_total}</span></div>
              <div className="mt-2 h-1 bg-[#f0f0f0] rounded-full overflow-hidden">
                <div className="h-full bg-[#FF5C00] rounded-full" style={{width:`${habitPct}%`}} />
              </div>
              <div className="text-[9px] text-[#aaa] mt-1">{habitPct}% done today</div>
            </div>
          )}
          {data.show_focus && (
            <div className="bg-white border border-[#e8e8e4] rounded-xl p-4">
              <div className="text-[10px] font-bold text-[#aaa] uppercase tracking-[.1em] mb-2">Focus</div>
              <div className="text-[22px] font-black text-[#0A0A0A]">{fmtMins(data.focus_today_mins)}</div>
              <div className="text-[9px] text-[#aaa] mt-3">{data.days_active_30} active days<br/>last 30 days</div>
            </div>
          )}
          <div className="bg-white border border-[#e8e8e4] rounded-xl p-4">
            <div className="text-[10px] font-bold text-[#aaa] uppercase tracking-[.1em] mb-2">Goals</div>
            <div className="text-[22px] font-black text-[#0A0A0A]">{data.weekly_goals_done}<span className="text-[14px] text-[#aaa] font-normal">/{data.weekly_goals_total}</span></div>
            <div className="text-[9px] text-[#aaa] mt-3">weekly goals<br/>completed</div>
          </div>
        </div>

        {/* 6M Goals */}
        {data.show_goals && data.goals && data.goals.length > 0 && (
          <div className="bg-white border border-[#e8e8e4] rounded-xl p-4">
            <div className="text-[10px] font-bold text-[#aaa] uppercase tracking-[.1em] mb-4">6-Month Goals</div>
            <div className="space-y-4">
              {(data.goals as Goal[]).map((g, i) => {
                const color = CAT_COLORS[g.category] ?? '#6b7280'
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background:color}} />
                        <span className="text-[13px] font-semibold text-[#0A0A0A] truncate">{g.title}</span>
                      </div>
                      <span className="text-[12px] font-bold flex-shrink-0 ml-3" style={{color}}>{g.pct}%</span>
                    </div>
                    <div className="h-1.5 bg-[#f0f0f0] rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{width:`${g.pct}%`,background:color}} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* No windows = clean neutral state */}
        {data.windows.length === 0 && !isLive && (
          <div className="text-center py-4 text-[11px] text-[#bbb]">
            No accountability windows set
          </div>
        )}

        {/* Minimal footer */}
        <div className="text-center pb-4">
          <span className="text-[9px] text-[#ccc] uppercase tracking-[.1em]">Mizan ميزان</span>
        </div>

      </div>
    </div>
  )
}
