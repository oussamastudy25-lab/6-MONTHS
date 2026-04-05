import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import DailyQuote from '@/components/DailyQuote'
import NotificationScheduler from '@/components/NotificationScheduler'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return (
    <div className="flex h-screen overflow-hidden">
      <NotificationScheduler />
      <Sidebar />
      <main className="flex-1 overflow-hidden flex flex-col relative">
        <DailyQuote />
        {children}
      </main>
    </div>
  )
}
