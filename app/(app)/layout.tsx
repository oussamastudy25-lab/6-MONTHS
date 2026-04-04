import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import DailyQuote from '@/components/DailyQuote'

function fmt(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const now = new Date()
  const today = fmt(now)
  const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
  const mon = new Date(now)
  const dow = mon.getDay()
  mon.setDate(mon.getDate() + (dow === 0 ? -6 : 1 - dow))
  mon.setHours(0,0,0,0)
  const weekStart = fmt(mon)

  // Fetch sidebar stats in parallel
  const [{ data: logs }, { data: allLogs }, { data: tasks }, { data: wgoals }] = await Promise.all([
    supabase.from('habit_logs').select('status,date').eq('user_id', user.id).like('date', `${ym}-%`),
    supabase.from('habit_logs').select('status,date').eq('user_id', user.id),
    supabase.from('tasks').select('done,text').eq('user_id', user.id).eq('date', today),
    supabase.from('weekly_goals').select('done').eq('user_id', user.id).eq('week_start', weekStart),
  ])

  // Month habit %
  const tracked = (logs ?? []).filter(l => l.status !== 'na')
  const done = tracked.filter(l => l.status === 'done').length
  const monthPct = tracked.length > 0 ? `${Math.round(done / tracked.length * 100)}%` : '—'

  // Best streak (all time)
  const allDates = Array.from(new Set((allLogs ?? []).filter(l => l.status === 'done').map(l => l.date))).sort()
  let best = 0, cur = 0, prev = ''
  for (const d of allDates) {
    if (prev) {
      const diff = Math.round((new Date(d).getTime() - new Date(prev).getTime()) / 86400000)
      cur = diff === 1 ? cur + 1 : 1
    } else cur = 1
    if (cur > best) best = cur
    prev = d
  }
  const streak = best > 0 ? `${best}d` : '—'

  // Today tasks
  const realTasks = (tasks ?? []).filter(t => t.text)
  const wg = wgoals ?? []
  const totalTasks = realTasks.length + wg.length
  const doneTasks = realTasks.filter(t => t.done).length + wg.filter(g => g.done).length
  const tasksStr = totalTasks > 0 ? `${doneTasks}/${totalTasks}` : '—'

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar streak={streak} monthPct={monthPct} tasks={tasksStr} />
      <main className="flex-1 overflow-hidden flex flex-col relative">
        <DailyQuote />
        {children}
      </main>
    </div>
  )
}
