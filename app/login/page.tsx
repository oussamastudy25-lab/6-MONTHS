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
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="w-full max-w-sm px-6">
        <div className="mb-10">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-3xl font-bold tracking-widest text-[#0A0A0A]">MIZAN</span>
            <span className="text-xl text-[#FF5C00]" style={{fontFamily:'Noto Sans Arabic,serif'}}>ميزان</span>
          </div>
          <p className="text-xs text-gray-400 tracking-[0.15em] uppercase">Your personal habit OS</p>
        </div>

        <div className="border-2 border-[#0A0A0A] rounded-lg p-8">
          {sent ? (
            <div className="text-center">
              <div className="text-2xl mb-3">✉️</div>
              <h2 className="text-[15px] font-bold mb-2">Check your email</h2>
              <p className="text-[13px] text-gray-500">
                We sent a magic link to <strong>{email}</strong>.<br/>
                Click it to sign in — no password needed.
              </p>
              <button onClick={() => setSent(false)}
                className="mt-5 text-[10px] text-gray-400 hover:text-gray-600 uppercase tracking-widest transition-colors">
                Use a different email
              </button>
            </div>
          ) : (
            <>
              <h1 className="text-[16px] font-bold mb-1">Start your war.</h1>
              <p className="text-[13px] text-gray-500 mb-6">Enter your email — we'll send a magic link.</p>
              <form onSubmit={sendMagicLink} className="space-y-3">
                <input
                  type="email" required
                  value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full bg-[#f7f7f7] border border-[#dedede] rounded-md px-3 py-2.5 text-[13px] outline-none focus:border-[#FF5C00] focus:bg-white transition-colors"
                />
                {error && <p className="text-[11px] text-red-500">{error}</p>}
                <button type="submit" disabled={loading}
                  className="w-full bg-[#FF5C00] text-white rounded-md py-2.5 text-[12px] font-bold tracking-wide uppercase hover:bg-[#FF7A2E] transition-colors disabled:opacity-60">
                  {loading ? 'Sending…' : 'Send Magic Link'}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-[10px] text-gray-300 text-center mt-6">Mizan · ميزان · Personal use only</p>
      </div>
    </div>
  )
}
