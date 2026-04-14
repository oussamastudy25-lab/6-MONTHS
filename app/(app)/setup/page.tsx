'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

const sb = createClient()
type Row = { id: string; name: string; position: number; frequency: string }

const FREQ_OPTIONS = [
  { value: 'daily',    label: 'Daily',    sub: 'Every day',    icon: '7' },
  { value: 'weekdays', label: 'Weekdays', sub: 'Mon – Fri',    icon: '5' },
  { value: 'weekends', label: 'Weekends', sub: 'Sat & Sun',    icon: '2' },
  { value: '3x',       label: '3× week',  sub: 'M · W · F',   icon: '3' },
]

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
      boxShadow: focused ? '0 0 0 3px rgba(26,115,232,0.08)' : '0 1px 2px rgba(60,64,67,0.04)',
      transition: 'border-color 0.15s, box-shadow 0.15s',
    }}>
      {/* Name row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 11, color: '#BDC1C6', fontFamily: 'Roboto Mono, monospace', minWidth: 18, flexShrink: 0 }}>
          {String(index + 1).padStart(2, '0')}
        </span>
        <input
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            fontSize: 14, color: '#202124', fontFamily: 'Roboto, sans-serif',
            padding: 0,
          }}
          placeholder="Name this habit…"
          value={val}
          onChange={e => setVal(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); if (val !== habit.name) onUpdateName(habit.id, val) }}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        />
        <button onClick={() => onRemove(habit.id)} style={{
          width: 26, height: 26, borderRadius: '50%',
          border: 'none', background: 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: '#BDC1C6', fontSize: 18, lineHeight: 1,
          transition: 'background 0.12s, color 0.12s', flexShrink: 0,
        }}
        onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background='#FCE8E6'; b.style.color='#D93025' }}
        onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background='transparent'; b.style.color='#BDC1C6' }}
        >×</button>
      </div>

      {/* Frequency chips */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {FREQ_OPTIONS.map(o => {
          const selected = habit.frequency === o.value
          return (
            <button key={o.value} onClick={() => onUpdateFreq(habit.id, o.value)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 20,
              border: selected ? '1.5px solid #1A73E8' : '1.5px solid #E8EAED',
              background: selected ? '#E8F0FE' : '#F8F9FA',
              cursor: 'pointer', transition: 'all 0.12s',
            }}>
              <span style={{
                width: 18, height: 18, borderRadius: '50%',
                background: selected ? '#1A73E8' : '#E8EAED',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, fontWeight: 500, color: selected ? 'white' : '#80868B',
                fontFamily: 'Roboto Mono, monospace', flexShrink: 0,
              }}>{o.icon}</span>
              <span style={{ fontSize: 12, fontWeight: selected ? 500 : 400, color: selected ? '#1A73E8' : '#5F6368', fontFamily: 'Roboto, sans-serif', lineHeight: 1 }}>
                {o.label}
              </span>
              <span style={{ fontSize: 11, color: selected ? '#4285F4' : '#9AA0A6', fontFamily: 'Roboto, sans-serif' }}>
                {o.sub}
              </span>
            </button>
          )
        })}
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
      {/* Page header */}
      <div style={{ background: '#FFFFFF', borderBottom: '1px solid #E8EAED', padding: '16px 24px', flexShrink: 0 }}>
        <div style={{ fontSize: 22, fontWeight: 400, color: '#202124', fontFamily: 'Google Sans, Roboto, sans-serif' }}>Setup</div>
        <div style={{ fontSize: 12, color: '#5F6368', marginTop: 2, fontFamily: 'Roboto, sans-serif' }}>Manage your habits and tracking schedule</div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px', background: '#F8F9FA' }}>
        <div style={{ maxWidth: 520 }}>

          {/* Section header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#202124', fontFamily: 'Google Sans, Roboto, sans-serif' }}>
                Your habits
              </div>
              <div style={{ fontSize: 12, color: '#5F6368', marginTop: 2, fontFamily: 'Roboto, sans-serif' }}>
                Select how often each habit should be tracked
              </div>
            </div>
            {habits.length > 0 && (
              <span style={{
                fontSize: 11, fontWeight: 500, color: '#1A73E8',
                background: '#E8F0FE', padding: '3px 10px', borderRadius: 20,
                fontFamily: 'Roboto, sans-serif', flexShrink: 0,
              }}>
                {habits.length} habit{habits.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Empty state */}
          {habits.length === 0 && (
            <div style={{
              background: '#FFFFFF', border: '1px solid #E8EAED', borderRadius: 12,
              padding: '36px 24px', textAlign: 'center', marginBottom: 12,
            }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🌱</div>
              <div style={{ fontSize: 15, fontWeight: 500, color: '#202124', fontFamily: 'Google Sans, Roboto, sans-serif', marginBottom: 6 }}>
                No habits yet
              </div>
              <div style={{ fontSize: 13, color: '#5F6368', fontFamily: 'Roboto, sans-serif', lineHeight: 1.6 }}>
                Add your first habit below — you can set how<br/>often it should be tracked.
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
            padding: '12px 0', borderRadius: 12,
            border: '1.5px dashed #DADCE0',
            background: 'transparent',
            color: '#5F6368', fontSize: 13, fontFamily: 'Roboto, sans-serif', fontWeight: 500,
            cursor: 'pointer', transition: 'all 0.12s',
            marginTop: 4,
          }}
          onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor='#1A73E8'; b.style.color='#1A73E8'; b.style.background='#F0F4FF' }}
          onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor='#DADCE0'; b.style.color='#5F6368'; b.style.background='transparent' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add a habit
          </button>

          {/* Quick navigation to related pages */}
          <div style={{ marginTop: 28 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: '#80868B', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10, fontFamily: 'Roboto, sans-serif' }}>
              Also configure
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { href: '/goals',    emoji: '🎯', title: 'Goals & Milestones', desc: 'Set 6-month goals and track progress', color: '#E6F4EA', textColor: '#137333' },
                { href: '/timer',    emoji: '⏱',  title: 'Focus Categories',   desc: 'Organize your deep work sessions',     color: '#E8F0FE', textColor: '#1A73E8' },
                { href: '/calendar', emoji: '📅', title: 'Calendar Blocks',    desc: 'Schedule recurring time blocks',        color: '#FEF7E0', textColor: '#B06000' },
              ].map(item => (
                <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    background: '#FFFFFF', border: '1px solid #E8EAED', borderRadius: 12,
                    padding: '12px 14px', cursor: 'pointer', transition: 'box-shadow 0.15s, border-color 0.15s',
                  }}
                  onMouseEnter={e => { const d = e.currentTarget as HTMLDivElement; d.style.boxShadow='0 1px 6px rgba(60,64,67,0.12)'; d.style.borderColor='#C8D0DB' }}
                  onMouseLeave={e => { const d = e.currentTarget as HTMLDivElement; d.style.boxShadow='none'; d.style.borderColor='#E8EAED' }}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: 10,
                      background: item.color, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                    }}>{item.emoji}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
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
