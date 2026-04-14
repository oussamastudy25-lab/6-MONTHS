'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

const sb = createClient()
type Row = { id: string; name: string; position: number; frequency: string }

const FREQ_OPTIONS = [
  { value: 'daily',    label: 'Daily',       sub: '7 days' },
  { value: 'weekdays', label: 'Weekdays',    sub: 'Mon–Fri' },
  { value: 'weekends', label: 'Weekends',    sub: 'Sat–Sun' },
  { value: '3x',       label: 'Mon/Wed/Fri', sub: '3×/week' },
]

function FreqChip({ value, selected, onClick }: { value: string; selected: boolean; onClick: () => void }) {
  const opt = FREQ_OPTIONS.find(o => o.value === value)!
  return (
    <button onClick={onClick} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '7px 10px', borderRadius: 8,
      border: selected ? '2px solid #1A73E8' : '1.5px solid #DADCE0',
      background: selected ? '#E8F0FE' : '#FFFFFF',
      cursor: 'pointer', transition: 'all 0.12s',
      minWidth: 72,
    }}>
      <span style={{ fontSize: 12, fontWeight: selected ? 600 : 500, color: selected ? '#1A73E8' : '#3C4043', fontFamily: 'Roboto, sans-serif', lineHeight: 1.3 }}>
        {opt.label}
      </span>
      <span style={{ fontSize: 10, color: selected ? '#4285F4' : '#80868B', marginTop: 1, fontFamily: 'Roboto, sans-serif' }}>
        {opt.sub}
      </span>
    </button>
  )
}

function HabitRow({ habit, index, onUpdateName, onUpdateFreq, onRemove }: {
  habit: Row; index: number
  onUpdateName: (id: string, name: string) => void
  onUpdateFreq: (id: string, freq: string) => void
  onRemove: (id: string) => void
}) {
  const [val, setVal] = useState(habit.name)
  const [focused, setFocused] = useState(false)

  return (
    <div style={{
      background: '#FFFFFF',
      border: focused ? '1.5px solid #1A73E8' : '1.5px solid #E8EAED',
      borderRadius: 12,
      padding: '12px 14px',
      marginBottom: 8,
      boxShadow: focused ? '0 0 0 3px rgba(26,115,232,0.08)' : 'none',
      transition: 'border-color 0.15s, box-shadow 0.15s',
    }}>
      {/* Name row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 11, color: '#BDC1C6', fontFamily: 'Roboto Mono, monospace', minWidth: 18 }}>
          {String(index + 1).padStart(2, '0')}
        </span>
        <input
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            fontSize: 14, color: '#202124', fontFamily: 'Roboto, sans-serif',
            padding: 0,
          }}
          placeholder="Habit name…"
          value={val}
          onChange={e => setVal(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); if (val !== habit.name) onUpdateName(habit.id, val) }}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        />
        <button onClick={() => onRemove(habit.id)} style={{
          width: 24, height: 24, borderRadius: '50%',
          border: 'none', background: 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: '#BDC1C6', fontSize: 16,
          transition: 'background 0.12s, color 0.12s',
          flexShrink: 0,
        }}
        onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background='#FCE8E6'; b.style.color='#D93025' }}
        onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background='transparent'; b.style.color='#BDC1C6' }}
        >×</button>
      </div>

      {/* Frequency chips */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {FREQ_OPTIONS.map(o => (
          <FreqChip
            key={o.value}
            value={o.value}
            selected={habit.frequency === o.value}
            onClick={() => onUpdateFreq(habit.id, o.value)}
          />
        ))}
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
    if (!confirm('Delete habit and all its logs?')) return
    await sb.from('habits').delete().eq('id', id)
    setHabits(h => h.filter(x => x.id!==id))
  }

  return (
    <>
      <div style={{ background: '#FFFFFF', borderBottom: '1px solid #E8EAED', padding: '16px 24px', flexShrink: 0 }}>
        <div style={{ fontSize: 22, fontWeight: 400, color: '#202124', fontFamily: 'Google Sans, Roboto, sans-serif' }}>Setup</div>
        <div style={{ fontSize: 12, color: '#5F6368', marginTop: 2, fontFamily: 'Roboto, sans-serif' }}>Configure your habits and tracking frequency</div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 24, background: '#F8F9FA' }}>
        <div style={{ maxWidth: 480 }}>

          {/* Section label */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#202124', fontFamily: 'Google Sans, Roboto, sans-serif' }}>
                Habits
              </div>
              <div style={{ fontSize: 11, color: '#5F6368', marginTop: 2, fontFamily: 'Roboto, sans-serif' }}>
                Tap a frequency chip to change the schedule for each habit
              </div>
            </div>
            {habits.length > 0 && (
              <span style={{
                fontSize: 11, fontWeight: 500, color: '#1A73E8',
                background: '#E8F0FE', padding: '3px 10px', borderRadius: 12,
                fontFamily: 'Roboto, sans-serif',
              }}>
                {habits.length} habit{habits.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Empty state */}
          {habits.length === 0 && (
            <div style={{
              background: '#FFFFFF', border: '1px solid #E8EAED', borderRadius: 12,
              padding: '32px 24px', textAlign: 'center', marginBottom: 12,
            }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>✨</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#202124', fontFamily: 'Google Sans, Roboto, sans-serif', marginBottom: 4 }}>
                No habits yet
              </div>
              <div style={{ fontSize: 13, color: '#5F6368', fontFamily: 'Roboto, sans-serif' }}>
                Add your first habit below to start tracking
              </div>
            </div>
          )}

          {/* Habit rows */}
          {habits.map((h, i) => (
            <HabitRow key={h.id} habit={h} index={i}
              onUpdateName={updateName} onUpdateFreq={updateFreq} onRemove={remove} />
          ))}

          {/* Add button */}
          <button onClick={add} style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '11px 0', borderRadius: 12,
            border: '1.5px dashed #DADCE0',
            background: 'transparent',
            color: '#5F6368', fontSize: 13, fontFamily: 'Roboto, sans-serif', fontWeight: 500,
            cursor: 'pointer', transition: 'all 0.12s',
            marginTop: 4,
          }}
          onMouseEnter={e => {
            const b = e.currentTarget as HTMLButtonElement
            b.style.borderColor = '#1A73E8'
            b.style.color = '#1A73E8'
            b.style.background = '#F8F9FF'
          }}
          onMouseLeave={e => {
            const b = e.currentTarget as HTMLButtonElement
            b.style.borderColor = '#DADCE0'
            b.style.color = '#5F6368'
            b.style.background = 'transparent'
          }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add a habit
          </button>

        </div>
      </div>
    </>
  )
}
