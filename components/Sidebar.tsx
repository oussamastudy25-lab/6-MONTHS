'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const NAV = [
  { href: '/dashboard',      icon: 'M3 9.75L12 3l9 6.75V21a.75.75 0 01-.75.75H15a.75.75 0 01-.75-.75v-4.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21a.75.75 0 01-.75.75H3.75A.75.75 0 013 21V9.75z', label: 'Dashboard' },
  { divider: true },
  { href: '/setup',          icon: 'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z M15 12a3 3 0 11-6 0 3 3 0 016 0z', label: 'Setup' },
  { href: '/calendar',       icon: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5', label: 'Calendar' },
  { href: '/tracker',        icon: 'M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z', label: 'Tracker' },
  { divider: true },
  { href: '/weekly',         icon: 'M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z', label: 'Weekly' },
  { href: '/goals',          icon: 'M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0', label: '6M Goals' },
  { href: '/timer',          icon: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z', label: 'Timer' },
  { divider: true },
  { href: '/letters',        icon: 'M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10', label: 'Letters' },
  { divider: true },
  { href: '/accountability', icon: 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z', label: 'Accountability' },
]

export default function Sidebar() {
  const path = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <nav style={{
      width: 240, minWidth: 240,
      background: '#FFFFFF',
      display: 'flex', flexDirection: 'column',
      borderRight: '1px solid #E8EAED',
      overflowY: 'auto',
    }}>

      {/* Logo */}
      <div style={{ padding: '16px 16px 14px', borderBottom: '1px solid #E8EAED' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: '#1A73E8',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 1px 4px rgba(26,115,232,0.3)',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="3" x2="12" y2="20"/>
              <line x1="4" y1="7" x2="20" y2="7"/>
              <path d="M4 7 C4 7 2 11 4 13 C6 15 8 13 8 13 C8 13 6 9 4 7Z" fill="white" stroke="none"/>
              <path d="M20 7 C20 7 18 11 20 13 C22 15 24 13 24 13 C24 13 22 9 20 7Z" fill="white" stroke="none"/>
              <line x1="9" y1="20" x2="15" y2="20"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 500, color: '#202124', fontFamily: 'Google Sans, Roboto, sans-serif', letterSpacing: '-0.01em', lineHeight: 1.2 }}>
              Mizan
              <span style={{ marginLeft: 5, fontSize: 13, fontFamily: 'Noto Sans Arabic, serif', color: '#1A73E8', fontWeight: 400 }}>ميزان</span>
            </div>
            <div style={{ fontSize: 11, color: '#9AA0A6', marginTop: 1, fontFamily: 'Roboto, sans-serif', fontWeight: 400 }}>Habit OS</div>
          </div>
        </div>
      </div>

      {/* Nav items */}
      <div style={{ flex: 1, padding: '8px 8px' }}>
        {NAV.map((item, i) => {
          if ('divider' in item) return (
            <div key={i} style={{ height: 1, background: '#F1F3F4', margin: '4px 8px' }} />
          )
          const active = path === item.href
          return (
            <Link key={item.href} href={item.href} style={{ textDecoration: 'none', display: 'block' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '9px 16px', borderRadius: 24,
                background: active ? '#E8F0FE' : 'transparent',
                color: active ? '#1A73E8' : '#3C4043',
                fontFamily: 'Roboto, sans-serif',
                fontSize: 13.5, fontWeight: active ? 500 : 400,
                cursor: 'pointer', transition: 'background 0.12s',
                userSelect: 'none',
              }}
              onMouseEnter={e => { if (!active)(e.currentTarget as HTMLDivElement).style.background = '#F1F3F4' }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = active ? '#E8F0FE' : 'transparent' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                  stroke={active ? '#1A73E8' : '#5F6368'}
                  strokeWidth={active ? 2 : 1.6}
                  strokeLinecap="round" strokeLinejoin="round"
                  style={{ flexShrink: 0 }}>
                  <path d={item.icon} />
                </svg>
                <span style={{ flex: 1 }}>{item.label}</span>
                {active && (
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#1A73E8', flexShrink: 0 }} />
                )}
              </div>
            </Link>
          )
        })}
      </div>

      {/* Sign out */}
      <button onClick={signOut} style={{
        margin: '8px 12px 16px',
        padding: '8px 14px', borderRadius: 20,
        border: '1px solid #E8EAED', background: 'transparent',
        color: '#5F6368', fontSize: 13,
        fontFamily: 'Roboto, sans-serif', fontWeight: 400,
        cursor: 'pointer', textAlign: 'left',
        display: 'flex', alignItems: 'center', gap: 8,
        transition: 'background 0.12s, color 0.12s',
      }}
      onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background='#F1F3F4'; b.style.color='#202124' }}
      onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background='transparent'; b.style.color='#5F6368' }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
        Sign out
      </button>
    </nav>
  )
}
