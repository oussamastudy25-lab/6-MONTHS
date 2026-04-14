'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'

const sb = createClient()

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true); setError('')
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) { setError(error.message); setLoading(false); return }
    setSent(true); setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#F8F9FA',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Roboto, Google Sans, sans-serif',
    }}>
      <div style={{ width: '100%', maxWidth: 420, padding: '0 24px' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: 'linear-gradient(135deg, #1A73E8, #1557B0)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
            boxShadow: '0 2px 8px rgba(255,92,0,0.3)',
          }}>
            <span style={{ color: 'white', fontSize: 26, fontFamily: 'Noto Sans Arabic, serif' }}>م</span>
          </div>
          <div style={{ fontSize: 26, fontWeight: 400, color: '#202124', letterSpacing: '-0.01em' }}>
            Mizan
          </div>
          <div style={{ fontSize: 13, color: '#5F6368', marginTop: 4 }}>Your personal habit OS</div>
        </div>

        {/* Card */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: 16,
          border: '1px solid #E8EAED',
          padding: 32,
          boxShadow: '0 1px 3px rgba(60,64,67,0.08), 0 4px 8px rgba(60,64,67,0.05)',
        }}>
          {sent ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: '#E6F4EA',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px',
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#34A853" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
              </div>
              <div style={{ fontSize: 18, fontWeight: 500, color: '#202124', marginBottom: 8 }}>Check your email</div>
              <div style={{ fontSize: 14, color: '#5F6368', lineHeight: 1.6 }}>
                We sent a sign-in link to<br />
                <strong style={{ color: '#202124' }}>{email}</strong>
              </div>
              <button onClick={() => setSent(false)} style={{
                marginTop: 20,
                padding: '8px 20px',
                borderRadius: 20,
                border: '1px solid #DADCE0',
                background: 'transparent',
                color: '#5F6368',
                fontSize: 13,
                cursor: 'pointer',
                transition: 'background 0.12s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#F1F3F4' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
              >
                Use a different email
              </button>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 20, fontWeight: 500, color: '#202124', marginBottom: 6 }}>Sign in</div>
              <div style={{ fontSize: 14, color: '#5F6368', marginBottom: 24, lineHeight: 1.5 }}>
                Enter your email — we'll send you a magic link. No password needed.
              </div>
              <form onSubmit={sendMagicLink} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 500, color: '#5F6368', display: 'block', marginBottom: 6 }}>
                    Email address
                  </label>
                  <input
                    type="email" required
                    value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    style={{
                      width: '100%', padding: '10px 14px',
                      borderRadius: 8, border: '1px solid #DADCE0',
                      background: '#FFFFFF', fontSize: 14,
                      color: '#202124', outline: 'none',
                      transition: 'border-color 0.15s, box-shadow 0.15s',
                      boxSizing: 'border-box',
                    }}
                    onFocus={e => { e.target.style.borderColor='#1A73E8'; e.target.style.boxShadow='0 0 0 3px rgba(255,92,0,0.12)' }}
                    onBlur={e => { e.target.style.borderColor='#DADCE0'; e.target.style.boxShadow='none' }}
                  />
                </div>
                {error && (
                  <div style={{
                    padding: '8px 12px', borderRadius: 8,
                    background: '#FFF0EE', border: '1px solid #FFDDD9',
                    fontSize: 12, color: '#C5221F',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    {error}
                  </div>
                )}
                <button type="submit" disabled={loading} style={{
                  padding: '11px 24px',
                  borderRadius: 24,
                  background: loading ? '#FBBC04' : '#1A73E8',
                  color: 'white',
                  border: 'none',
                  fontSize: 14, fontWeight: 500,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'background 0.15s, box-shadow 0.15s',
                  marginTop: 4,
                }}
                onMouseEnter={e => { if (!loading)(e.currentTarget as HTMLButtonElement).style.boxShadow='0 1px 4px rgba(255,92,0,0.4)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow='none' }}
                >
                  {loading ? 'Sending…' : 'Continue with email'}
                </button>
              </form>
            </>
          )}
        </div>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: '#80868B' }}>
          Mizan · ميزان · Personal use only
        </div>
      </div>
    </div>
  )
}
