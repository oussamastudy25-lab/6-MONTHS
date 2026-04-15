'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

const sb = createClient()
type Row = {
  id: string; name: string; position: number; frequency: string
  habit_type: string; measure_target: number | null; measure_unit: string | null
}

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const PRESETS = [
  { value: 'daily',    label: 'Every day',   days: [0,1,2,3,4,5,6] },
  { value: 'weekdays', label: 'Weekdays',     days: [1,2,3,4,5] },
  { value: 'weekends', label: 'Weekends',     days: [0,6] },
  { value: '3x',       label: 'Mon/Wed/Fri',  days: [1,3,5] },
]
const UNIT_PRESETS = ['pages','L','km','min','reps','sets','glasses','hrs','mg','kg']

function freqToDays(freq: string): number[] {
  const preset = PRESETS.find(p => p.value === freq)
  if (preset) return preset.days
  if (freq.startsWith('custom:')) return freq.slice(7).split(',').map(Number).filter(n => !isNaN(n))
  return [0,1,2,3,4,5,6]
}
function daysToFreq(days: number[]): string {
  const sorted = [...days].sort((a,b)=>a-b)
  const preset = PRESETS.find(p => p.days.length === sorted.length && p.days.every((d,i) => d === sorted[i]))
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

function HabitRow({ habit, index, onUpdate, onRemove }: {
  habit: Row; index: number
  onUpdate: (id: string, patch: Partial<Row>) => void
  onRemove: (id: string) => void
}) {
  const [val, setVal] = useState(habit.name)
  const [focused, setFocused] = useState(false)
  const [showFreq, setShowFreq] = useState(false)
  const [showUnitInput, setShowUnitInput] = useState(false)
  const selectedDays = freqToDays(habit.frequency)
  const isMeasure = habit.habit_type === 'measure'

  function toggleDay(d: number) {
    const next = selectedDays.includes(d) ? selectedDays.filter(x => x !== d) : [...selectedDays, d]
    if (next.length === 0) return
    onUpdate(habit.id, { frequency: daysToFreq(next) })
  }

  return (
    <div style={{
      background: '#FFFFFF',
      border: focused ? '1.5px solid #FF5C00' : '1.5px solid #E8EAED',
      borderRadius: 14, marginBottom: 10,
      boxShadow: focused ? '0 0 0 3px rgba(255,92,0,0.08)' : '0 1px 3px rgba(60,64,67,0.06)',
      transition: 'border-color 0.15s, box-shadow 0.15s', overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px 10px' }}>
        <span style={{ fontSize: 11, color: '#BDC1C6', fontFamily: 'monospace', minWidth: 20, flexShrink: 0 }}>
          {String(index + 1).padStart(2, '0')}
        </span>
        <input
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 14, color: '#202124', padding: 0 }}
          placeholder="Name this habit…"
          value={val}
          onChange={e => setVal(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); if (val !== habit.name) onUpdate(habit.id, { name: val }) }}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        />
        <span style={{
          fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 20, flexShrink: 0,
          background: isMeasure ? '#FFF0E8' : '#F0F4FF',
          color: isMeasure ? '#FF5C00' : '#1A73E8',
          border: isMeasure ? '1px solid #FFD4B8' : '1px solid #C8D5F5',
        }}>
          {isMeasure ? '📏 Measure' : '✓ Yes/No'}
        </span>
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

      {/* Type selector */}
      <div style={{ borderTop: '1px solid #F1F3F4', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontSize: 11, color: '#9AA0A6', marginRight: 4, flexShrink: 0 }}>Type:</div>
        {[
          { value: 'boolean', label: '✓ Yes / No' },
          { value: 'measure', label: '📏 Measure' },
        ].map(opt => {
          const active = habit.habit_type === opt.value
          return (
            <button key={opt.value} onClick={() => onUpdate(habit.id, { habit_type: opt.value })} style={{
              padding: '5px 12px', borderRadius: 20,
              border: active ? '1.5px solid #FF5C00' : '1.5px solid #E8EAED',
              background: active ? '#FFF0E8' : '#F8F9FA',
              color: active ? '#FF5C00' : '#5F6368',
              fontSize: 12, fontWeight: active ? 600 : 400, cursor: 'pointer', transition: 'all 0.12s',
            }}>
              {opt.label}
            </button>
          )
        })}
      </div>

      {/* Measure config */}
      {isMeasure && (
        <div style={{ borderTop: '1px solid #F1F3F4', padding: '10px 14px 12px', background: '#FFFAF7' }}>
          <div style={{ fontSize: 11, color: '#9AA0A6', marginBottom: 8 }}>Daily target</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="number" min="0" step="any"
              placeholder="0"
              value={habit.measure_target ?? ''}
              onChange={e => onUpdate(habit.id, { measure_target: e.target.value === '' ? null : parseFloat(e.target.value) })}
              style={{
                width: 80, padding: '6px 10px', borderRadius: 8,
                border: '1.5px solid #E8EAED', fontSize: 14, fontFamily: 'monospace',
                outline: 'none', color: '#202124', background: 'white',
              }}
              onFocus={e => (e.target.style.borderColor = '#FF5C00')}
              onBlur={e => (e.target.style.borderColor = '#E8EAED')}
            />
            {showUnitInput ? (
              <input
                autoFocus
                placeholder="unit (e.g. pages)"
                value={habit.measure_unit ?? ''}
                onChange={e => onUpdate(habit.id, { measure_unit: e.target.value })}
                onBlur={() => setShowUnitInput(false)}
                style={{
                  padding: '6px 10px', borderRadius: 8, width: 120,
                  border: '1.5px solid #FF5C00', fontSize: 13, outline: 'none', background: 'white',
                }}
              />
            ) : (
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {UNIT_PRESETS.map(u => (
                  <button key={u} onClick={() => onUpdate(habit.id, { measure_unit: u })} style={{
                    padding: '4px 10px', borderRadius: 20, fontSize: 11, cursor: 'pointer', transition: 'all 0.12s',
                    border: habit.measure_unit === u ? '1.5px solid #FF5C00' : '1.5px solid #E8EAED',
                    background: habit.measure_unit === u ? '#FFF0E8' : '#F8F9FA',
                    color: habit.measure_unit === u ? '#FF5C00' : '#5F6368',
                    fontWeight: habit.measure_unit === u ? 600 : 400,
                  }}>{u}</button>
                ))}
                <button onClick={() => setShowUnitInput(true)} style={{
                  padding: '4px 10px', borderRadius: 20, fontSize: 11, cursor: 'pointer',
                  border: '1.5px dashed #DADCE0', background: 'transparent', color: '#9AA0A6',
                }}>custom…</button>
              </div>
            )}
          </div>
          {habit.measure_target && habit.measure_unit && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#FF5C00', fontWeight: 500 }}>
              Goal: {habit.measure_target} {habit.measure_unit} / day
            </div>
          )}
        </div>
      )}

      {/* Frequency section */}
      <div style={{ borderTop: '1px solid #F1F3F4', padding: '10px 14px 12px' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {PRESETS.map(o => {
            const isSelected = habit.frequency === o.value
            return (
              <button key={o.value} onClick={() => onUpdate(habit.id, { frequency: o.value })} style={{
                padding: '5px 12px', borderRadius: 20,
                border: isSelected ? '1.5px solid #1A73E8' : '1.5px solid #E8EAED',
                background: isSelected ? '#E8F0FE' : '#F8F9FA',
                color: isSelected ? '#1A73E8' : '#5F6368',
                fontSize: 12, fontWeight: isSelected ? 500 : 400, cursor: 'pointer', transition: 'all 0.12s',
              }}>
                {o.label}
              </button>
            )
          })}
          <button onClick={() => setShowFreq(s => !s)} style={{
            padding: '5px 12px', borderRadius: 20,
            border: showFreq || habit.frequency.startsWith('custom:') ? '1.5px solid #1A73E8' : '1.5px solid #E8EAED',
            background: showFreq || habit.frequency.startsWith('custom:') ? '#E8F0FE' : '#F8F9FA',
            color: showFreq || habit.frequency.startsWith('custom:') ? '#1A73E8' : '#5F6368',
            fontSize: 12, fontWeight: 400, cursor: 'pointer', transition: 'all 0.12s',
          }}>
            Custom…
          </button>
        </div>
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
                  fontSize: 11, fontWeight: on ? 500 : 400, cursor: 'pointer', transition: 'all 0.12s', flexShrink: 0,
                }}>
                  {d}
                </button>
              )
            })}
          </div>
        )}
        <div style={{ marginTop: 8, fontSize: 11, color: '#9AA0A6' }}>
          {FreqLabel(habit.frequency)} · {selectedDays.length === 7 ? '7' : selectedDays.length}×/week
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
    const { data } = await sb.from('habits').insert({
      user_id: user.id, name: '', position: habits.length,
      frequency: 'daily', habit_type: 'boolean', measure_target: null, measure_unit: null
    }).select().single()
    if (data) setHabits(h => [...h, data])
  }

  const update = async (id: string, patch: Partial<Row>) => {
    setHabits(h => h.map(x => x.id === id ? { ...x, ...patch } : x))
    await sb.from('habits').update(patch).eq('id', id)
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this habit and all its logs?')) return
    await sb.from('habits').delete().eq('id', id)
    setHabits(h => h.filter(x => x.id !== id))
  }

  return (
    <>
      <div style={{ background: '#FFFFFF', borderBottom: '1px solid #E8EAED', padding: '20px 28px', flexShrink: 0 }}>
        <div style={{ fontSize: 22, fontWeight: 400, color: '#202124' }}>Setup</div>
        <div style={{ fontSize: 13, color: '#5F6368', marginTop: 3 }}>Manage your habits — yes/no or measurable with a daily target</div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '28px', background: '#F8F9FA' }}>
        <div style={{ maxWidth: 540 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 500, color: '#202124' }}>Your habits</div>
              <div style={{ fontSize: 12, color: '#5F6368', marginTop: 3 }}>Pick yes/no or set a daily target (e.g. "10 pages")</div>
            </div>
            {habits.length > 0 && (
              <span style={{ fontSize: 11, fontWeight: 500, color: '#1A73E8', background: '#E8F0FE', padding: '3px 10px', borderRadius: 20, flexShrink: 0 }}>
                {habits.length} habit{habits.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {habits.length === 0 && (
            <div style={{ background: '#FFFFFF', border: '1px solid #E8EAED', borderRadius: 14, padding: '40px 24px', textAlign: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 36, marginBottom: 14 }}>🌱</div>
              <div style={{ fontSize: 15, fontWeight: 500, color: '#202124', marginBottom: 6 }}>No habits yet</div>
              <div style={{ fontSize: 13, color: '#5F6368', lineHeight: 1.6 }}>Add a yes/no habit (meditation, cold shower…) or a measurable one (read 10 pages, drink 2L…)</div>
            </div>
          )}

          {habits.map((h, i) => (
            <HabitRow key={h.id} habit={h} index={i} onUpdate={update} onRemove={remove} />
          ))}

          <button onClick={add} style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '13px 0', borderRadius: 14, border: '1.5px dashed #DADCE0',
            background: 'transparent', color: '#5F6368', fontSize: 13,
            fontWeight: 400, cursor: 'pointer', transition: 'all 0.12s', marginTop: 4,
          }}
          onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor='#FF5C00'; b.style.color='#FF5C00'; b.style.background='#FFF5EE' }}
          onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor='#DADCE0'; b.style.color='#5F6368'; b.style.background='transparent' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add a habit
          </button>

          <div style={{ marginTop: 32 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: '#9AA0A6', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>Also configure</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { href: '/goals',    emoji: '🎯', title: 'Goals & Milestones', desc: 'Set goals and track milestones', color: '#E6F4EA' },
                { href: '/timer',    emoji: '⏱',  title: 'Focus Categories',   desc: 'Organize your deep work sessions', color: '#E8F0FE' },
                { href: '/calendar', emoji: '📅', title: 'Calendar Blocks',    desc: 'Schedule recurring time blocks', color: '#FEF7E0' },
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
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#202124' }}>{item.title}</div>
                      <div style={{ fontSize: 12, color: '#5F6368', marginTop: 1 }}>{item.desc}</div>
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
