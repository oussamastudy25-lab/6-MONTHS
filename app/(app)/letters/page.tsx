'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

const sb = createClient()
type Letter = { id: string; title: string; content: string; letter_date: string; is_day_one: boolean; created_at: string }

function fmt(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export default function LettersPage() {
  const today = fmt(new Date())
  const [letters, setLetters] = useState<Letter[]>([])
  const [selected, setSelected] = useState<Letter | null>(null)
  const [isNew, setIsNew]       = useState(false)
  const [form, setForm]         = useState({ title: '', content: '', is_day_one: false, letter_date: today })
  const [saving, setSaving]     = useState(false)

  const load = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const { data } = await sb.from('letters').select('*').eq('user_id', user.id).order('letter_date', { ascending: false })
    setLetters(data ?? [])
  }, [])

  useEffect(() => { load() }, [load])

  function openNew(isDayOne = false) {
    setForm({ title: isDayOne ? 'Day One — The War Begins' : '', content: '', is_day_one: isDayOne, letter_date: today })
    setSelected(null)
    setIsNew(true)
  }

  function openLetter(l: Letter) {
    setSelected(l)
    setForm({ title: l.title, content: l.content, is_day_one: l.is_day_one, letter_date: l.letter_date })
    setIsNew(false)
  }

  async function save() {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    if (!form.content.trim()) return
    setSaving(true)
    if (isNew) {
      const { data } = await sb.from('letters').insert({
        user_id: user.id, title: form.title || form.letter_date,
        content: form.content, letter_date: form.letter_date, is_day_one: form.is_day_one,
        updated_at: new Date().toISOString()
      }).select().single()
      if (data) { setSelected(data); setIsNew(false) }
    } else if (selected) {
      await sb.from('letters').update({
        title: form.title, content: form.content, updated_at: new Date().toISOString()
      }).eq('id', selected.id)
    }
    setSaving(false)
    load()
  }

  async function deleteLetter() {
    if (!selected || !confirm('Delete this letter?')) return
    await sb.from('letters').delete().eq('id', selected.id)
    setSelected(null); setIsNew(false)
    load()
  }

  const dayOne = letters.find(l => l.is_day_one)
  const journal = letters.filter(l => !l.is_day_one)
  const editing = isNew || selected !== null

  return (
    <div className="flex h-full">
      {/* Sidebar list */}
      <div className="w-[240px] min-w-[240px] border-r border-[#efefef] flex flex-col bg-white">
        <div className="px-4 py-3 border-b-2 border-[#0A0A0A] flex-shrink-0">
          <div className="text-[14px] font-bold">Letters</div>
          <div className="text-[9px] text-[#888] uppercase tracking-[.12em] mt-0.5">Your 6-month journal</div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {/* Day One */}
          <div className="px-3 pt-3 pb-1">
            <div className="text-[8px] font-bold text-[#bcbcbc] uppercase tracking-[.15em] mb-1.5">Day One Letter</div>
            {dayOne ? (
              <button onClick={() => openLetter(dayOne)}
                className={`w-full text-left px-3 py-2 rounded-md border transition-all ${selected?.id === dayOne.id ? 'bg-[#FFF0E8] border-[#FF5C00]' : 'bg-[#f7f7f7] border-[#efefef] hover:border-[#dedede]'}`}>
                <div className="text-[11px] font-bold text-[#FF5C00]">⚔ {dayOne.title || 'Day One'}</div>
                <div className="text-[9px] text-[#888] mt-0.5">{dayOne.letter_date}</div>
              </button>
            ) : (
              <button onClick={() => openNew(true)}
                className="w-full text-left px-3 py-2 rounded-md border border-dashed border-[#FF5C00] bg-[#FFF0E8] hover:bg-orange-50 transition-colors">
                <div className="text-[11px] font-bold text-[#FF5C00]">+ Write Day One Letter</div>
                <div className="text-[9px] text-[#888] mt-0.5">Why you started the war</div>
              </button>
            )}
          </div>

          {/* Daily journal */}
          <div className="px-3 pt-3 pb-2">
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[8px] font-bold text-[#bcbcbc] uppercase tracking-[.15em]">Daily Journal</div>
              <button onClick={() => openNew(false)}
                className="text-[9px] font-bold text-[#FF5C00] hover:text-[#FF7A2E] transition-colors">+ New</button>
            </div>
            {journal.length === 0 && (
              <div className="text-[11px] text-[#bcbcbc] py-2 text-center">No entries yet</div>
            )}
            {journal.map(l => (
              <button key={l.id} onClick={() => openLetter(l)}
                className={`w-full text-left px-3 py-2 rounded-md border mb-1 transition-all ${selected?.id === l.id ? 'bg-[#FFF0E8] border-[#FF5C00]' : 'bg-white border-[#efefef] hover:border-[#dedede]'}`}>
                <div className="text-[11px] font-semibold truncate">{l.title || l.letter_date}</div>
                <div className="text-[9px] text-[#888] mt-0.5">{l.letter_date}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 flex flex-col bg-white">
        {!editing ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="text-5xl mb-4">✍</div>
            <div className="text-[16px] font-bold mb-2">Select a letter or write a new one</div>
            <div className="text-[13px] text-[#888] max-w-sm mb-6">
              Write to yourself every day. Your Day One letter is what you read when you're about to give up.
            </div>
            <div className="flex gap-3">
              {!dayOne && (
                <button onClick={() => openNew(true)}
                  className="bg-[#FF5C00] text-white text-[10px] font-bold uppercase tracking-[.1em] px-4 py-2 rounded-md hover:bg-[#FF7A2E] transition-colors">
                  Write Day One Letter
                </button>
              )}
              <button onClick={() => openNew(false)}
                className="border border-[#dedede] text-[10px] font-bold uppercase tracking-[.1em] px-4 py-2 rounded-md hover:border-[#0A0A0A] transition-colors">
                Write Today's Entry
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="px-6 py-3 border-b border-[#efefef] flex items-center gap-3 flex-shrink-0">
              {form.is_day_one && (
                <span className="text-[9px] font-bold uppercase tracking-[.12em] px-2 py-1 rounded bg-[#FFF0E8] text-[#FF5C00] border border-[#FF5C00]/30">
                  ⚔ Day One
                </span>
              )}
              <input
                className="flex-1 text-[16px] font-bold outline-none placeholder:text-[#dedede]"
                placeholder={form.is_day_one ? "Why you started the war..." : "Entry title..."}
                value={form.title}
                onChange={e => setForm(f => ({...f, title: e.target.value}))}
              />
              <input type="date" className="text-[11px] text-[#888] font-mono outline-none border border-[#efefef] rounded px-2 py-1"
                value={form.letter_date}
                onChange={e => setForm(f => ({...f, letter_date: e.target.value}))}
              />
              {selected && (
                <button onClick={deleteLetter} className="text-[10px] text-[#bcbcbc] hover:text-[#ef4444] transition-colors">Delete</button>
              )}
              <button onClick={save} disabled={saving}
                className="bg-[#FF5C00] text-white text-[10px] font-bold uppercase tracking-[.1em] px-4 py-2 rounded-md hover:bg-[#FF7A2E] transition-colors disabled:opacity-60">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
            <textarea
              className="flex-1 p-6 text-[14px] leading-relaxed outline-none resize-none font-sans placeholder:text-[#dedede]"
              placeholder={form.is_day_one
                ? "Write to yourself. Why are you starting this war? What will you lose if you quit? What do you owe yourself in 6 months? Don't hold back."
                : "What happened today? What did you learn? What are you fighting for right now?"}
              value={form.content}
              onChange={e => setForm(f => ({...f, content: e.target.value}))}
            />
          </>
        )}
      </div>
    </div>
  )
}
