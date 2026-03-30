'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

const sb = createClient()

type NN = { id: string; name: string; done: boolean }

function fmt(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export default function NNFloat() {
  const [open, setOpen]   = useState(false)
  const [nns, setNNs]     = useState<NN[]>([])
  const [loading, setL]   = useState(false)
  const today = fmt(new Date())

  async function load() {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const [{ data: list }, { data: logs }] = await Promise.all([
      sb.from('non_negotiables').select('id,name').eq('user_id', user.id).order('position'),
      sb.from('nn_logs').select('nn_id,done').eq('user_id', user.id).eq('date', today),
    ])
    const map: Record<string, boolean> = {}
    ;(logs ?? []).forEach((l: {nn_id:string;done:boolean}) => { map[l.nn_id] = l.done })
    setNNs((list ?? []).map((n: {id:string;name:string}) => ({ id: n.id, name: n.name, done: map[n.id] ?? false })))
  }

  useEffect(() => { if (open) load() }, [open])

  async function toggle(nn: NN) {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    setL(true)
    const newDone = !nn.done
    setNNs(prev => prev.map(n => n.id === nn.id ? { ...n, done: newDone } : n))
    await sb.from('nn_logs').upsert(
      { user_id: user.id, nn_id: nn.id, date: today, done: newDone },
      { onConflict: 'nn_id,date' }
    )
    setL(false)
  }

  if (nns.length === 0 && !open) return null

  const allDone = nns.length > 0 && nns.every(n => n.done)
  const doneCnt = nns.filter(n => n.done).length

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-full shadow-2xl font-bold text-[11px] uppercase tracking-[.1em] transition-all"
        style={{
          background: allDone ? '#22c55e' : '#FF5C00',
          color: 'white',
          boxShadow: `0 4px 24px ${allDone ? 'rgba(34,197,94,.4)' : 'rgba(255,92,0,.4)'}`,
        }}
      >
        <span className="text-[14px]">{allDone ? '✓' : '⚔'}</span>
        <span>NNs {doneCnt}/{nns.length}</span>
      </button>

      {/* Popup */}
      {open && (
        <div className="fixed bottom-20 right-6 z-50 w-72 bg-white rounded-xl shadow-2xl border border-[#efefef] overflow-hidden">
          <div className="bg-[#0A0A0A] px-4 py-3 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-[.1em] text-white">Non-Negotiables</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-[#FF5C00] font-bold">{fmt(new Date())}</span>
              <button onClick={() => setOpen(false)} className="text-[#555] hover:text-white text-[14px] transition-colors">✕</button>
            </div>
          </div>
          {nns.length === 0 ? (
            <div className="px-4 py-3 text-[12px] text-[#888]">Add non-negotiables in Setup →</div>
          ) : nns.map(nn => (
            <button key={nn.id} onClick={() => toggle(nn)}
              className="w-full flex items-center gap-3 px-4 py-3 border-b border-[#f7f7f7] last:border-0 hover:bg-[#fafafa] transition-colors text-left">
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${nn.done ? 'bg-[#FF5C00] border-[#FF5C00]' : 'border-[#dedede]'}`}>
                {nn.done && <span className="text-white text-[10px] font-bold">✓</span>}
              </div>
              <span className={`text-[13px] font-semibold ${nn.done ? 'line-through text-[#bcbcbc]' : 'text-[#0A0A0A]'}`}>
                {nn.name}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Backdrop */}
      {open && <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />}
    </>
  )
}
