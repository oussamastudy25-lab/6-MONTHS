'use client'
import { useEffect, useState } from 'react'

interface Props {
  habitName: string
  days: number
  onDone: () => void
}

const MILESTONE_MSGS: Record<number, string> = {
  7:   "First week. The war has begun.",
  21:  "21 days. Your brain is rewiring. Keep going.",
  40:  "40 days. The hardest part is behind you.",
  90:  "90 days. You are not the same person who started.",
  120: "120 days. Most people quit at 40. You didn't.",
  180: "180 days. War won.",
}

export default function MilestoneCelebration({ habitName, days, onDone }: Props) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setVisible(true)
    const t = setTimeout(() => { setVisible(false); setTimeout(onDone, 400) }, 4000)
    return () => clearTimeout(t)
  }, [onDone])

  const msg = MILESTONE_MSGS[days] ?? `Day ${days}.`

  return (
    <div className={`fixed inset-0 z-[200] flex flex-col items-center justify-center bg-[#0A0A0A] transition-opacity duration-400 ${visible ? 'opacity-100' : 'opacity-0'}`}>
      <div className="text-center px-8">
        <div className="font-mono text-[100px] font-bold text-[#FF5C00] leading-none mb-2">{days}</div>
        <div className="text-[13px] text-[#555] uppercase tracking-[.2em] mb-6">DAYS CLEAN</div>
        <div className="text-[22px] font-bold text-white mb-3">{habitName}</div>
        <div className="text-[14px] text-[#888] italic max-w-sm leading-relaxed">{msg}</div>
      </div>
      <button onClick={() => { setVisible(false); setTimeout(onDone, 400) }}
        className="absolute bottom-10 text-[10px] text-[#333] uppercase tracking-[.15em] hover:text-[#555] transition-colors">
        Continue →
      </button>
    </div>
  )
}
