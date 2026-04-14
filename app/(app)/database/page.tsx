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
  letters: number
  months: number
}

export default function DatabasePage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [resetting, setResetting] = useState(false)
  const [resetInput, setResetInput] = useState('')
  const [showResetModal, setShowResetModal] = useState(false)
  const [exporting, setExporting] = useState(false)

  async function loadStats() {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const tables = ['habits','habit_logs','tasks','weekly_goals','monthly_goals','six_month_goals','milestones','reviews','letters']
    const counts = await Promise.all(tables.map(t =>
      sb.from(t).select('*', { count: 'exact', head: true }).eq('user_id', user.id)
    ))
    const [habits, logs, tasks, wgoals, mgoals, smgoals, milestones, reviews, letters] = counts.map(r => r.count ?? 0)
    // distinct months
    const { data: logDates } = await sb.from('habit_logs').select('date').eq('user_id', user.id)
    const months = new Set((logDates ?? []).map((r: {date:string}) => r.date.slice(0,7))).size
    setStats({ habits, logs, tasks, wgoals, mgoals, smgoals, milestones, reviews, letters, months })
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
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    setResetting(true)
    const tables = ['milestones','six_month_goals','reviews','weekly_goals','monthly_goals','tasks','habit_logs','habits','letters']
    for (const t of tables) { await sb.from(t).delete().eq('user_id', user.id) }
    setResetting(false)
    setShowResetModal(false)
    setResetInput('')
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
      <div className="bg-white px-6 py-3 border-b border-[#E8EAED] flex-shrink-0">
        <div className="text-[22px] font-normal text-[#202124]">Database</div>
        <div className="text-[12px] text-[#5F6368] mt-1">Export · Reset · Stack info</div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl space-y-5">

          {/* Stats */}
          <div>
            <div className="text-[11px] font-medium text-[#5F6368] tracking-[0.06em] uppercase mb-3">Your Data</div>
            {loading ? (
              <div className="text-[13px] text-[#5F6368]">Loading…</div>
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
                  ['Letters',     stats.letters],
                  ['Months Tracked', stats.months],
                ] as [string, number][]).map(([l, v]) => (
                  <div key={l} className="bg-white border border-[#E8EAED] rounded-lg p-3">
                    <div className="text-[8.5px] text-[#5F6368] uppercase tracking-[.1em] mb-1">{l}</div>
                    <div className="font-mono text-[18px] font-medium text-[#0A0A0A]">{v}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Stack info */}
          <div>
            <div className="text-[11px] font-medium text-[#5F6368] tracking-[0.06em] uppercase mb-3">Stack</div>
            <div className="bg-[#f7f7f7] border border-[#E8EAED] rounded-lg overflow-hidden">
              {INFO.map(({ label, value }, i) => (
                <div key={label} className={`flex items-center justify-between px-4 py-3 ${i < INFO.length-1 ? 'border-b border-[#E8EAED]' : ''}`}>
                  <span className="text-[11px] text-[#5F6368] uppercase tracking-[.08em]">{label}</span>
                  <span className="font-mono text-[12px] font-medium text-[#0A0A0A]">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div>
            <div className="text-[11px] font-medium text-[#5F6368] tracking-[0.06em] uppercase mb-3">Actions</div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={exportData} disabled={exporting}
                className="bg-[#1A73E8] text-white hover:bg-[#1557B0] transition-colors disabled:opacity-50">
                {exporting ? 'Exporting…' : 'Export JSON'}
              </button>
              <button onClick={() => { setShowResetModal(true); setResetInput('') }}
                className="border border-[#e0b0b0] text-[#8B0000] bg-[#FBE9E7] text-[13px] font-medium px-4 py-2 rounded-lg hover:bg-[#fdd] transition-colors">
                Reset All Data
              </button>
            </div>
            <p className="text-[10px] text-[#80868B] mt-2">Export creates a full JSON backup of all your data across all tables.</p>
          </div>

        </div>
      </div>
      {/* Reset confirmation modal */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-[380px] max-w-[90vw]">
            <div className="text-[16px] font-medium text-[#8B0000] mb-2">⚠️ Reset All Data</div>
            <div className="text-[13px] text-[#555] mb-4 leading-relaxed">
              This will permanently delete <strong>all</strong> your habits, logs, tasks, goals, letters, and reviews. This cannot be undone.
            </div>
            <div className="mb-4">
              <div className="text-[12px] font-medium text-[#5F6368] tracking-[0.04em] uppercase mb-1.5">Type <span className="text-[#8B0000] font-mono">RESET</span> to confirm</div>
              <input autoFocus
                className="w-full border-2 border-[#DADCE0] rounded-lg px-3 py-2.5 text-[14px] font-mono outline-none focus:border-[#8B0000] transition-colors"
                placeholder="RESET"
                value={resetInput}
                onChange={e => setResetInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && resetInput === 'RESET' && resetAll()}
              />
            </div>
            <div className="flex gap-2">
              <button onClick={resetAll} disabled={resetInput !== 'RESET' || resetting}
                className="flex-1 bg-[#8B0000] text-white text-[13px] font-medium py-2.5 rounded-lg disabled:opacity-30 hover:bg-red-800 transition-colors">
                {resetting ? 'Deleting…' : 'Delete Everything'}
              </button>
              <button onClick={() => { setShowResetModal(false); setResetInput('') }}
                className="px-4 border border-[#DADCE0] text-[13px] font-medium rounded-lg hover:border-[#1A73E8] transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
