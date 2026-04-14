'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

const sb = createClient()
type Row = { id: string; name: string; position: number; frequency: string }

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const PRESETS = [
  { value: 'daily',    label: 'Every day',   days: [0,1,2,3,4,5,6] },
  { value: 'weekdays', label: 'Weekdays',     days: [1,2,3,4,5] },
  { value: 'weekends', label: 'Weekends',     days: [0,6] },
  { value: '3x',       label: 'Mon/Wed/Fri',  days: [1,3,5] },
]

// Convert frequency string ↔ day array
function freqToDays(freq: string): number[] {
  const preset = PRESETS.find(p => p.value === freq)
  if (preset) return preset.days
  // custom: "custom:0,2,4" format
  if (freq.startsWith('custom:')) {
    return freq.slice(7).split(',').map(Number).filter(n => !isNaN(n))
  }
  return [0,1,2,3,4,5,6]
}

function daysToFreq(days: number[]): string {
  const sorted = [...days].sort((a,b)=>a-b)
  const preset = PRESETS.find(p =>
    p.days.length === sorted.length &&
    p.days.every((d,i) => d === sorted[i])
  )
  if (preset) return preset.value
  return 'custom:' + sorted.join(',')
}

function FreqLabel(freq: string) {
  const preset = PRESETS.find(p => p.value === freq)
  if (preset) return preset.label
  const days = freqToDays(freq)
  if (days.length === 0) return 'Never'
  if (days.length === 7) return 'Every day'
  return days.map(d => DAYS[d]).join(' · ')
}

function HabitRow({ habit, index, onUpdateName, onUpdateFreq, onRemove }: {
  habit: Row; index: number
  onUpdateName: (id: string, name: string) => void
  onUpdateFreq: (id: string, freq: string) => void
  onRemove: (id: string) => void
}) {
  const [val, setVal] = useState(habit.name)
  const [focused, setFocused] = useState(false)
  const [showFreq, setShowFreq] = useState(false)
  const selectedDays = freqToDays(habit.frequency)

  function toggleDay(d: number) {
    const next = selectedDays.includes(d)
      ? selectedDays.filter(x => x !== d)
      : [...selectedDays, d]
    if (next.length === 0) return // must have at least 1
    onUpdateFreq(habit.id, daysToFreq(next))
  }

  return (
    <div style={{
      background: '#FFFFFF',
      border: focused ? '1.5px solid #1A73E8' : '1.5px solid #E8EAED',
      borderRadius: 14,
      marginBottom: 10,
      boxShadow: focused ? '0 0 0 3px rgba(26,115,232,0.08)' : '0 1px 3px rgba(60,64,67,0.06)',
      transition: 'border-color 0.15s, box-shadow 0.15s',
      overflow: 'hidden',
    }}>
      {/* Name row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px 10px' }}>
        <span style={{ fontSize: 11, color: '#BDC1C6', fontFamily: 'Roboto Mono, monospace', minWidth: 20, flexShrink: 0 }}>
          {String(index + 1).padStart(2, '0')}
        </span>
        <input
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            fontSize: 14, color: '#202124', fontFamily: 'Roboto, sans-serif', padding: 0,
          }}
          placeholder="Name this habit…"
          value={val}
          onChange={e => setVal(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); if (val !== habit.name) onUpdateName(habit.id, val) }}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        />
        <button onClick={() => onRemove(habit.id)} style={{
          width: 26, height: 26, borderRadius: '50%', border: 'none',
          background: 'transparent', display: 'flex', alignItems: 'center',
          justifyContent: 'center', cursor: 'pointer', color: '#BDC1C6',
          fontSize: 18, lineHeight: 1, transition: 'background 0.12s, color 0.12s', flexShrink: 0,
        }}
        onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background='#FCE8E6'; b.style.color='#D93025' }}
        onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background='transparent'; b.style.color='#BDC1C6' }}
        >×</button>
      </div>

      {/* Frequency section */}
      <div style={{ borderTop: '1px solid #F1F3F4', padding: '10px 14px 12px' }}>
        {/* Presets */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {PRESETS.map(o => {
            const isSelected = habit.frequency === o.value
            return (
              <button key={o.value} onClick={() => onUpdateFreq(habit.id, o.value)} style={{
                padding: '5px 12px', borderRadius: 20,
                border: isSelected ? '1.5px solid #1A73E8' : '1.5px solid #E8EAED',
                background: isSelected ? '#E8F0FE' : '#F8F9FA',
                color: isSelected ? '#1A73E8' : '#5F6368',
                fontSize: 12, fontWeight: isSelected ? 500 : 400,
                fontFamily: 'Roboto, sans-serif', cursor: 'pointer',
                transition: 'all 0.12s',
              }}>
                {o.label}
              </button>
            )
          })}
          {/* Custom toggle */}
          <button onClick={() => setShowFreq(s => !s)} style={{
            padding: '5px 12px', borderRadius: 20,
            border: showFreq || habit.frequency.startsWith('custom:') ? '1.5px solid #1A73E8' : '1.5px solid #E8EAED',
            background: showFreq || habit.frequency.startsWith('custom:') ? '#E8F0FE' : '#F8F9FA',
            color: showFreq || habit.frequency.startsWith('custom:') ? '#1A73E8' : '#5F6368',
            fontSize: 12, fontWeight: 400, fontFamily: 'Roboto, sans-serif',
            cursor: 'pointer', transition: 'all 0.12s',
          }}>
            Custom…
          </button>
        </div>

        {/* Day picker - shown when custom or presets expanded */}
        {(showFreq || habit.frequency.startsWith('custom:')) && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', paddingTop: 4 }}>
            {DAYS.map((d, i) => {
              const on = selectedDays.includes(i)
              return (
                <button key={i} onClick={() => toggleDay(i)} style={{
                  width: 36, height: 36, borderRadius: '50%',
                  border: on ? '1.5px solid #1A73E8' : '1.5px solid #E8EAED',
                  background: on ? '#1A73E8' : '#F8F9FA',
                  color: on ? 'white' : '#5F6368',
                  fontSize: 11, fontWeight: on ? 500 : 400,
                  fontFamily: 'Roboto, sans-serif', cursor: 'pointer',
                  transition: 'all 0.12s', flexShrink: 0,
                }}>
                  {d}
                </button>
              )
            })}
          </div>
        )}

        {/* Summary */}
        <div style={{ marginTop: 8, fontSize: 11, color: '#9AA0A6', fontFamily: 'Roboto, sans-serif' }}>
          {FreqLabel(habit.frequency)}
          {' · '}
          {selectedDays.length === 7 ? '7' : selectedDays.length}×/week
        </div>
      </div>
    </div>
  )
}

export default function SetupPage() {
  const [habits, setHabits] = useState<Row[]>([])

  const load = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const { data } = await sb.from('habits').select('*').eq('user_id', user.id).is('archived_at', null).order('position')
    setHabits(data ?? [])
  }, [])

  useEffect(() => { load() }, [load])

  const add = async () => {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const { data } = await sb.from('habits').insert({ user_id: user.id, name: '', position: habits.length, frequency: 'daily' }).select().single()
    if (data) setHabits(h => [...h, data])
  }
  const updateName = async (id: string, name: string) => {
    setHabits(h => h.map(x => x.id===id ? {...x,name} : x))
    await sb.from('habits').update({ name }).eq('id', id)
  }
  const updateFreq = async (id: string, frequency: string) => {
    setHabits(h => h.map(x => x.id===id ? {...x,frequency} : x))
    await sb.from('habits').update({ frequency }).eq('id', id)
  }
  const remove = async (id: string) => {
    if (!confirm('Delete this habit and all its logs?')) return
    await sb.from('habits').delete().eq('id', id)
    setHabits(h => h.filter(x => x.id!==id))
  }

  return (
    <>
      <div style={{ background: '#FFFFFF', borderBottom: '1px solid #E8EAED', padding: '20px 28px', flexShrink: 0 }}>
        <div style={{ fontSize: 22, fontWeight: 400, color: '#202124', fontFamily: 'Google Sans, Roboto, sans-serif' }}>Setup</div>
        <div style={{ fontSize: 13, color: '#5F6368', marginTop: 3, fontFamily: 'Roboto, sans-serif' }}>Manage your habits and tracking schedule</div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '28px', background: '#F8F9FA' }}>
        <div style={{ maxWidth: 540 }}>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 500, color: '#202124', fontFamily: 'Google Sans, Roboto, sans-serif' }}>Your habits</div>
              <div style={{ fontSize: 12, color: '#5F6368', marginTop: 3, fontFamily: 'Roboto, sans-serif' }}>Pick days or use a preset for each habit</div>
            </div>
            {habits.length > 0 && (
              <span style={{ fontSize: 11, fontWeight: 500, color: '#1A73E8', background: '#E8F0FE', padding: '3px 10px', borderRadius: 20, fontFamily: 'Roboto, sans-serif', flexShrink: 0 }}>
                {habits.length} habit{habits.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {habits.length === 0 && (
            <div style={{ background: '#FFFFFF', border: '1px solid #E8EAED', borderRadius: 14, padding: '40px 24px', textAlign: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 36, marginBottom: 14 }}>🌱</div>
              <div style={{ fontSize: 15, fontWeight: 500, color: '#202124', fontFamily: 'Google Sans, Roboto, sans-serif', marginBottom: 6 }}>No habits yet</div>
              <div style={{ fontSize: 13, color: '#5F6368', fontFamily: 'Roboto, sans-serif', lineHeight: 1.6 }}>Add your first habit below and choose how often to track it.</div>
            </div>
          )}

          {habits.map((h, i) => (
            <HabitRow key={h.id} habit={h} index={i}
              onUpdateName={updateName} onUpdateFreq={updateFreq} onRemove={remove} />
          ))}

          <button onClick={add} style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '13px 0', borderRadius: 14, border: '1.5px dashed #DADCE0',
            background: 'transparent', color: '#5F6368', fontSize: 13,
            fontFamily: 'Roboto, sans-serif', fontWeight: 400, cursor: 'pointer',
            transition: 'all 0.12s', marginTop: 4,
          }}
          onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor='#1A73E8'; b.style.color='#1A73E8'; b.style.background='#F0F4FF' }}
          onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor='#DADCE0'; b.style.color='#5F6368'; b.style.background='transparent' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add a habit
          </button>

          <div style={{ marginTop: 32 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: '#9AA0A6', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12, fontFamily: 'Roboto, sans-serif' }}>Also configure</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { href: '/goals',    emoji: '🎯', title: 'Goals & Milestones', desc: 'Set 6-month goals and track progress', color: '#E6F4EA' },
                { href: '/timer',    emoji: '⏱',  title: 'Focus Categories',   desc: 'Organize your deep work sessions',     color: '#E8F0FE' },
                { href: '/calendar', emoji: '📅', title: 'Calendar Blocks',    desc: 'Schedule recurring time blocks',        color: '#FEF7E0' },
              ].map(item => (
                <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    background: '#FFFFFF', border: '1px solid #E8EAED', borderRadius: 12,
                    padding: '13px 16px', cursor: 'pointer', transition: 'box-shadow 0.15s, border-color 0.15s',
                  }}
                  onMouseEnter={e => { const d = e.currentTarget as HTMLDivElement; d.style.boxShadow='0 2px 8px rgba(60,64,67,0.12)'; d.style.borderColor='#C8D0DB' }}
                  onMouseLeave={e => { const d = e.currentTarget as HTMLDivElement; d.style.boxShadow='none'; d.style.borderColor='#E8EAED' }}
                  >
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: item.color, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{item.emoji}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#202124', fontFamily: 'Roboto, sans-serif' }}>{item.title}</div>
                      <div style={{ fontSize: 12, color: '#5F6368', fontFamily: 'Roboto, sans-serif', marginTop: 1 }}>{item.desc}</div>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9AA0A6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </div>
                </Link>
              ))}
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
