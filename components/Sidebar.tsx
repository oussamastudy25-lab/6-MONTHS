'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const NAV = [
  { href: '/setup',             icon: '⚙',  label: 'Setup' },
  { href: '/calendar',          icon: '◫',  label: 'Calendar' },
  { href: '/tracker',           icon: '▦',  label: 'Tracker' },
  { divider: true },
  { href: '/weekly',            icon: '◷',  label: 'Weekly' },
  { href: '/goals',             icon: '◎',  label: '6M Goals' },
  { href: '/timer',             icon: '⏱',  label: 'Timer' },
  { href: '/insights',          icon: '◈',  label: 'Insights' },
  { divider: true },
  { href: '/letters',           icon: '✍',  label: 'Letters' },
  { href: '/database',          icon: '◳',  label: 'Database' },
]

interface Props { streak?: string; monthPct?: string; tasks?: string }

export default function Sidebar({ streak='—', monthPct='—', tasks='—' }: Props) {
  const path = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <nav className="w-[196px] min-w-[196px] bg-[#0A0A0A] flex flex-col border-r border-[#1E1E1E]">
      <div className="px-4 py-[18px] border-b border-[#1E1E1E]">
        <div className="flex items-baseline gap-2">
          <span className="text-[17px] font-bold tracking-[.08em] text-white">MIZAN</span>
          <span className="text-[13px] text-[#FF5C00]" style={{fontFamily:'Noto Sans Arabic,serif'}}>ميزان</span>
        </div>
        <div className="text-[9px] text-[#555] tracking-[.15em] uppercase mt-1">Habit OS · 2026</div>
      </div>

      <div className="flex-1 py-1.5 overflow-y-auto">
        {NAV.map((item, i) => {
          if ('divider' in item) return <div key={i} className="h-px bg-[#1E1E1E] mx-3.5 my-1.5" />
          const active = path === item.href
          return (
            <Link key={item.href} href={item.href}
              className={`flex items-center gap-2.5 px-4 py-2.5 text-[10.5px] font-semibold tracking-[.1em] uppercase border-l-2 transition-all
                ${active
                  ? isWarRoom
                    ? 'text-white border-white bg-[rgba(255,255,255,.08)]'
                    : 'text-[#FF5C00] border-[#FF5C00] bg-[rgba(255,92,0,.07)]'
                  : 'text-[#888] border-transparent hover:text-white hover:bg-white/[.04]'
                }`}
            >
              <span className="text-[13px] w-4 text-center">{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </div>

      <div className="mx-2.5 mb-3 p-2.5 border border-[#1E1E1E] rounded-md bg-[#141414]">
        {[['This Month', monthPct],['Best Streak', streak],['Tasks', tasks]].map(([l,v]) => (
          <div key={l} className="flex justify-between items-center mb-1.5 last:mb-0">
            <span className="text-[9px] text-[#888] uppercase tracking-[.1em]">{l}</span>
            <span className="font-mono text-[11px] text-[#FF5C00] font-semibold">{v}</span>
          </div>
        ))}
      </div>

      <button onClick={signOut} className="mx-2.5 mb-3 text-[9.5px] text-[#555] hover:text-[#888] uppercase tracking-[.1em] text-left px-1 transition-colors">
        Sign out →
      </button>
    </nav>
  )
}
