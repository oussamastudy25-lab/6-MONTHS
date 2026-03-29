'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

const sb = createClient()

interface Stats {
  habits: number
  logs: number
  tasks: number
  wgoals: number
  mgoals: number
  smgoals: number
  milestones: number
  reviews: number
  months: number
}

export default function DatabasePage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [resetting, setResetting] = useState(false)
  const [exporting, setExporting] = useState(false)

  async function loadStats() {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const tables = ['habits','habit_logs','tasks','weekly_goals','monthly_goals','six_month_goals','milestones','reviews']
    const counts = await Promise.all(tables.map(t =>
      sb.from(t).select('*', { count: 'exact', head: true }).eq('user_id', user.id)
    ))
    const [habits, logs, tasks, wgoals, mgoals, smgoals, milestones, reviews] = counts.map(r => r.count ?? 0)
    // distinct months
    const { data: logDates } = await sb.from('habit_logs').select('date').eq('user_id', user.id)
    const months = new Set((logDates ?? []).map((r: {date:string}) => r.date.slice(0,7))).size
    setStats({ habits, logs, tasks, wgoals, mgoals, smgoals, milestones, reviews, months })
    setLoading(false)
  }

  useEffect(() => { loadStats() }, [])

  async function exportData() {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    setExporting(true)
    const tables = ['habits','habit_logs','tasks','weekly_goals','monthly_goals','six_month_goals','milestones','reviews']
    const results: Record<string, unknown[]> = {}
    await Promise.all(tables.map(async t => {
      const { data } = await sb.from(t).select('*').eq('user_id', user.id)
      results[t] = data ?? []
    }))
    const blob = new Blob([JSON.stringify({ version: 2, exported_at: new Date().toISOString(), user_id: user.id, ...results }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `mizan_backup_${new Date().toISOString().slice(0,10)}.json`
    a.click()
    setExporting(false)
  }

  async function resetAll() {
    if (!confirm('Delete ALL your data? This cannot be undone.')) return
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    setResetting(true)
    // Delete in reverse FK order
    const tables = ['milestones','six_month_goals','reviews','weekly_goals','monthly_goals','tasks','habit_logs','habits']
    for (const t of tables) { await sb.from(t).delete().eq('user_id', user.id) }
    setResetting(false)
    loadStats()
  }

  const INFO = [
    { label: 'Database',  value: 'Supabase PostgreSQL' },
    { label: 'Auth',      value: 'Google OAuth 2.0' },
    { label: 'Hosting',   value: 'Vercel' },
    { label: 'Framework', value: 'Next.js 14 App Router' },
  ]

  return (
    <>
      <div className="bg-white px-6 py-3 border-b-2 border-[#0A0A0A] flex-shrink-0">
        <div className="text-[19px] font-bold tracking-[.04em]">Database</div>
        <div className="text-[10px] text-[#888] tracking-[.12em] uppercase mt-0.5">Export · Reset · Stack info</div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl space-y-5">

          {/* Stats */}
          <div>
            <div className="text-[9px] font-bold text-[#bcbcbc] tracking-[.16em] uppercase mb-3">Your Data</div>
            {loading ? (
              <div className="text-[13px] text-[#888]">Loading…</div>
            ) : (
              <div className="grid gap-2" style={{gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))'}}>
                {stats && ([
                  ['Habits',      stats.habits],
                  ['Habit Logs',  stats.logs],
                  ['Tasks',       stats.tasks],
                  ['Weekly Goals',stats.wgoals],
                  ['Monthly Goals',stats.mgoals],
                  ['6M Goals',    stats.smgoals],
                  ['Milestones',  stats.milestones],
                  ['Reviews',     stats.reviews],
                  ['Months Tracked', stats.months],
                ] as [string, number][]).map(([l, v]) => (
                  <div key={l} className="bg-white border border-[#efefef] rounded-lg p-3">
                    <div className="text-[8.5px] text-[#888] uppercase tracking-[.1em] mb-1">{l}</div>
                    <div className="font-mono text-[18px] font-semibold text-[#0A0A0A]">{v}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Stack info */}
          <div>
            <div className="text-[9px] font-bold text-[#bcbcbc] tracking-[.16em] uppercase mb-3">Stack</div>
            <div className="bg-[#f7f7f7] border border-[#efefef] rounded-lg overflow-hidden">
              {INFO.map(({ label, value }, i) => (
                <div key={label} className={`flex items-center justify-between px-4 py-3 ${i < INFO.length-1 ? 'border-b border-[#efefef]' : ''}`}>
                  <span className="text-[11px] text-[#888] uppercase tracking-[.08em]">{label}</span>
                  <span className="font-mono text-[12px] font-semibold text-[#0A0A0A]">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div>
            <div className="text-[9px] font-bold text-[#bcbcbc] tracking-[.16em] uppercase mb-3">Actions</div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={exportData} disabled={exporting}
                className="bg-[#FF5C00] text-white text-[10px] font-bold uppercase tracking-[.1em] px-4 py-2 rounded-md hover:bg-[#FF7A2E] transition-colors disabled:opacity-50">
                {exporting ? 'Exporting…' : 'Export JSON'}
              </button>
              <button onClick={resetAll} disabled={resetting}
                className="border border-[#e0b0b0] text-[#8B0000] bg-[#FBE9E7] text-[10px] font-bold uppercase tracking-[.1em] px-4 py-2 rounded-md hover:bg-[#fdd] transition-colors disabled:opacity-50">
                {resetting ? 'Resetting…' : 'Reset All Data'}
              </button>
            </div>
            <p className="text-[10px] text-[#bcbcbc] mt-2">Export creates a full JSON backup of all your data across all tables.</p>
          </div>

        </div>
      </div>
    </>
  )
}
