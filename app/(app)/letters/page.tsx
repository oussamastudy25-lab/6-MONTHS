'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'

const sb = createClient()
type Letter = { id: string; title: string; content: string; letter_date: string; created_at: string }

function fmt(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function displayDate(s: string) {
  const d = new Date(s + 'T12:00:00')
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
function wordCount(html: string) {
  return html.replace(/<[^>]*>/g,'').trim().split(/\s+/).filter(Boolean).length
}

const COLORS = [
  { label:'Default',  value:'inherit',  bg:'#0A0A0A' },
  { label:'Orange',   value:'#FF5C00',  bg:'#FF5C00' },
  { label:'Blue',     value:'#3b82f6',  bg:'#3b82f6' },
  { label:'Green',    value:'#22c55e',  bg:'#22c55e' },
  { label:'Red',      value:'#ef4444',  bg:'#ef4444' },
  { label:'Purple',   value:'#8b5cf6',  bg:'#8b5cf6' },
  { label:'Gray',     value:'#888888',  bg:'#888888' },
]
const SIZES = [
  { label:'S', value:'1' },
  { label:'M', value:'3' },
  { label:'L', value:'5' },
  { label:'XL',value:'7' },
]

export default function LettersPage() {
  const today = fmt(new Date())
  const [letters, setLetters]     = useState<Letter[]>([])
  const [selected, setSelected]   = useState<Letter|null>(null)
  const [showNew, setShowNew]     = useState(false)
  const [newTitle, setNewTitle]   = useState('')
  const [newDate, setNewDate]     = useState(today)
  const [saveState, setSaveState] = useState<'idle'|'saving'|'saved'>('idle')
  const [showColors, setShowColors] = useState(false)
  const editorRef   = useRef<HTMLDivElement>(null)
  const saveTimer   = useRef<ReturnType<typeof setTimeout>|null>(null)
  const currentId   = useRef<string|null>(null)

  const load = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const { data } = await sb.from('letters').select('*').eq('user_id', user.id).order('letter_date', { ascending: false })
    setLetters(data ?? [])
  }, [])

  useEffect(() => { load() }, [load])

  // Auto-save on content change
  function scheduleAutoSave() {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaveState('saving')
    saveTimer.current = setTimeout(() => { doSave() }, 1500)
  }

  async function doSave() {
    if (!currentId.current || !editorRef.current) return
    const html = editorRef.current.innerHTML
    const titleEl = document.getElementById('letter-title') as HTMLInputElement|null
    const title = titleEl?.value || today
    await sb.from('letters').update({ content: html, title, updated_at: new Date().toISOString() }).eq('id', currentId.current)
    setSaveState('saved')
    setTimeout(() => setSaveState('idle'), 2000)
    // Update local list
    setLetters(prev => prev.map(l => l.id === currentId.current ? {...l, content: html, title} : l))
    setSelected(prev => prev && prev.id === currentId.current ? {...prev, content: html, title} : prev)
  }

  async function createLetter() {
    if (!newTitle.trim()) return
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const { data } = await sb.from('letters').insert({
      user_id: user.id, title: newTitle.trim(), content: '', letter_date: newDate,
      updated_at: new Date().toISOString()
    }).select().single()
    if (data) {
      setLetters(prev => [data, ...prev])
      setShowNew(false)
      setNewTitle('')
      openLetter(data)
    }
  }

  function openLetter(l: Letter) {
    if (saveTimer.current) { clearTimeout(saveTimer.current); doSave() }
    setSelected(l)
    currentId.current = l.id
    setSaveState('idle')
    setShowColors(false)
    setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.innerHTML = l.content || ''
        editorRef.current.focus()
      }
    }, 50)
  }

  async function deleteLetter() {
    if (!selected || !confirm('Delete this letter permanently?')) return
    await sb.from('letters').delete().eq('id', selected.id)
    setLetters(prev => prev.filter(l => l.id !== selected.id))
    setSelected(null)
    currentId.current = null
    if (editorRef.current) editorRef.current.innerHTML = ''
  }

  // Rich text commands
  function cmd(command: string, value?: string) {
    editorRef.current?.focus()
    document.execCommand(command, false, value)
    scheduleAutoSave()
  }

  function isActive(command: string) {
    try { return document.queryCommandState(command) } catch { return false }
  }

  const ToolBtn = ({ onClick, active, title, children }: { onClick:()=>void; active?:boolean; title:string; children:React.ReactNode }) => (
    <button onMouseDown={e=>{e.preventDefault();onClick()}} title={title}
      className={`w-7 h-7 rounded flex items-center justify-center text-[12px] font-bold transition-all
        ${active ? 'bg-[#FF5C00] text-white' : 'text-[#555] hover:bg-[#f0f0f0]'}`}>
      {children}
    </button>
  )
  const Divider = () => <div className="w-px h-5 bg-[#e0e0e0] mx-0.5"/>

  return (
    <div className="flex h-full">

      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <div className="w-[220px] min-w-[220px] border-r border-[#efefef] flex flex-col bg-[#fafafa]">
        <div className="px-4 py-3 border-b-2 border-[#0A0A0A] bg-white flex-shrink-0 flex items-center justify-between">
          <div>
            <div className="text-[14px] font-bold">Letters</div>
            <div className="text-[9px] text-[#888] uppercase tracking-[.12em] mt-0.5">{letters.length} entries</div>
          </div>
          <button onClick={() => { setShowNew(true); setNewTitle(''); setNewDate(today) }}
            className="w-7 h-7 bg-[#FF5C00] text-white rounded-md flex items-center justify-center text-[16px] hover:bg-[#FF7A2E] transition-colors">
            +
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {letters.length === 0 && (
            <div className="text-center py-8 text-[12px] text-[#bcbcbc] px-4">
              No letters yet.<br/>Click + to start writing.
            </div>
          )}
          {letters.map(l => (
            <button key={l.id} onClick={() => openLetter(l)}
              className={`w-full text-left px-3 py-2.5 border-b border-[#f0f0f0] transition-all hover:bg-white
                ${selected?.id === l.id ? 'bg-white border-l-2 border-l-[#FF5C00]' : 'border-l-2 border-l-transparent'}`}>
              <div className="text-[12px] font-semibold truncate text-[#0A0A0A]">{l.title || l.letter_date}</div>
              <div className="text-[9px] text-[#aaa] mt-0.5 flex items-center gap-2">
                <span>{displayDate(l.letter_date)}</span>
                {l.content && <span className="text-[#bcbcbc]">{wordCount(l.content)}w</span>}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Main area ───────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col bg-white min-w-0">

        {/* New letter modal */}
        {showNew && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
            <div className="bg-white rounded-xl shadow-2xl p-6 w-[380px] max-w-[90vw]">
              <div className="text-[16px] font-bold mb-4">New Letter</div>
              <div className="mb-3">
                <div className="text-[9px] font-bold text-[#888] uppercase tracking-[.12em] mb-1">Title</div>
                <input autoFocus
                  className="w-full border border-[#dedede] rounded-lg px-3 py-2.5 text-[14px] outline-none focus:border-[#FF5C00]"
                  placeholder="e.g. Letter to future self, Monday reflection…"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  onKeyDown={e => e.key==='Enter' && createLetter()}
                />
              </div>
              <div className="mb-5">
                <div className="text-[9px] font-bold text-[#888] uppercase tracking-[.12em] mb-1">Date</div>
                <input type="date"
                  className="w-full border border-[#dedede] rounded-lg px-3 py-2.5 text-[13px] outline-none focus:border-[#FF5C00]"
                  value={newDate} onChange={e => setNewDate(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <button onClick={createLetter} disabled={!newTitle.trim()}
                  className="flex-1 bg-[#FF5C00] text-white text-[11px] font-bold uppercase tracking-[.1em] py-2.5 rounded-lg hover:bg-[#FF7A2E] transition-colors disabled:opacity-40">
                  Create & Write
                </button>
                <button onClick={() => setShowNew(false)}
                  className="px-4 border border-[#dedede] text-[11px] font-bold uppercase tracking-[.1em] rounded-lg hover:border-[#0A0A0A] transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="text-5xl mb-4">✍</div>
            <div className="text-[16px] font-bold mb-2">Select a letter or write a new one</div>
            <div className="text-[13px] text-[#888] max-w-sm mb-6">
              Write to yourself every day. Letters to your future self, reflections, plans — all in one place.
            </div>
            <button onClick={() => { setShowNew(true); setNewTitle(''); setNewDate(today) }}
              className="bg-[#FF5C00] text-white text-[10px] font-bold uppercase tracking-[.1em] px-5 py-2.5 rounded-lg hover:bg-[#FF7A2E] transition-colors">
              + Write a New Letter
            </button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-6 py-2.5 border-b border-[#efefef] flex items-center gap-3 flex-shrink-0">
              <input id="letter-title"
                className="flex-1 text-[16px] font-bold outline-none placeholder:text-[#dedede] min-w-0"
                placeholder="Title…"
                defaultValue={selected.title}
                onChange={() => scheduleAutoSave()}
              />
              <div className="flex items-center gap-2 flex-shrink-0">
                {saveState === 'saving' && <span className="text-[10px] text-[#aaa]">Saving…</span>}
                {saveState === 'saved'  && <span className="text-[10px] text-[#22c55e] font-bold">✓ Saved</span>}
                <span className="text-[10px] text-[#bcbcbc] font-mono">{displayDate(selected.letter_date)}</span>
                <button onClick={deleteLetter} className="text-[10px] text-[#bcbcbc] hover:text-[#ef4444] transition-colors px-1">Delete</button>
              </div>
            </div>

            {/* Formatting toolbar */}
            <div className="px-4 py-1.5 border-b border-[#efefef] flex items-center gap-0.5 flex-wrap flex-shrink-0 bg-[#fafafa]">

              {/* Text style */}
              <ToolBtn onClick={()=>cmd('bold')}      active={isActive('bold')}      title="Bold (Ctrl+B)"><b>B</b></ToolBtn>
              <ToolBtn onClick={()=>cmd('italic')}    active={isActive('italic')}    title="Italic (Ctrl+I)"><i>I</i></ToolBtn>
              <ToolBtn onClick={()=>cmd('underline')} active={isActive('underline')} title="Underline (Ctrl+U)"><u>U</u></ToolBtn>
              <Divider/>

              {/* Headings */}
              <ToolBtn onClick={()=>cmd('formatBlock','<h1>')} title="Heading 1"
                active={false}>
                <span className="text-[10px]">H1</span>
              </ToolBtn>
              <ToolBtn onClick={()=>cmd('formatBlock','<h2>')} title="Heading 2"
                active={false}>
                <span className="text-[10px]">H2</span>
              </ToolBtn>
              <ToolBtn onClick={()=>cmd('formatBlock','<p>')} title="Normal text"
                active={false}>
                <span className="text-[9px]">¶</span>
              </ToolBtn>
              <Divider/>

              {/* Lists */}
              <ToolBtn onClick={()=>cmd('insertUnorderedList')} active={isActive('insertUnorderedList')} title="Bullet list">
                <span className="text-[11px]">≡</span>
              </ToolBtn>
              <ToolBtn onClick={()=>cmd('insertOrderedList')} active={isActive('insertOrderedList')} title="Numbered list">
                <span className="text-[11px]">①</span>
              </ToolBtn>
              <Divider/>

              {/* Blockquote */}
              <ToolBtn onClick={()=>cmd('formatBlock','<blockquote>')} title="Blockquote"
                active={false}>
                <span className="text-[13px]">"</span>
              </ToolBtn>
              <Divider/>

              {/* Font size */}
              {SIZES.map(s => (
                <ToolBtn key={s.value} onClick={()=>cmd('fontSize', s.value)} title={`Size ${s.label}`} active={false}>
                  <span style={{fontSize: s.value==='1'?'9px':s.value==='3'?'11px':s.value==='5'?'13px':'15px'}}>{s.label}</span>
                </ToolBtn>
              ))}
              <Divider/>

              {/* Text color */}
              <div className="relative">
                <button onMouseDown={e=>{e.preventDefault();setShowColors(s=>!s)}}
                  className="w-7 h-7 rounded flex items-center justify-center hover:bg-[#f0f0f0] transition-all"
                  title="Text color">
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-[11px] font-bold text-[#555]">A</span>
                    <div className="w-4 h-1 rounded-full bg-[#FF5C00]"/>
                  </div>
                </button>
                {showColors && (
                  <div className="absolute top-9 left-0 z-20 bg-white border border-[#efefef] rounded-lg shadow-lg p-2 flex gap-1.5">
                    {COLORS.map(c => (
                      <button key={c.value}
                        onMouseDown={e=>{e.preventDefault();cmd('foreColor',c.value);setShowColors(false)}}
                        title={c.label}
                        className="w-6 h-6 rounded-full border-2 border-white hover:border-[#0A0A0A] transition-all"
                        style={{background:c.bg}}
                      />
                    ))}
                  </div>
                )}
              </div>
              <Divider/>

              {/* Highlight */}
              <ToolBtn onClick={()=>cmd('hiliteColor','#FFF3CD')} title="Highlight yellow" active={false}>
                <span className="text-[11px]">🖊</span>
              </ToolBtn>
              <ToolBtn onClick={()=>cmd('hiliteColor','transparent')} title="Remove highlight" active={false}>
                <span className="text-[9px] text-[#888]">✕</span>
              </ToolBtn>
              <Divider/>

              {/* Indent */}
              <ToolBtn onClick={()=>cmd('indent')}  title="Indent"  active={false}><span className="text-[11px]">→</span></ToolBtn>
              <ToolBtn onClick={()=>cmd('outdent')} title="Outdent" active={false}><span className="text-[11px]">←</span></ToolBtn>

            </div>

            {/* Editor */}
            <div className="flex-1 overflow-y-auto">
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={scheduleAutoSave}
                onClick={() => setShowColors(false)}
                className="min-h-full p-8 outline-none text-[15px] leading-[1.8] text-[#1a1a1a] font-sans"
                style={{
                  caretColor: '#FF5C00',
                }}
                data-placeholder="Start writing…"
              />
            </div>
          </>
        )}
      </div>

      <style>{`
        [contenteditable]:empty:before {
          content: attr(data-placeholder);
          color: #dedede;
          pointer-events: none;
        }
        [contenteditable] h1 {
          font-size: 1.7em;
          font-weight: 800;
          margin: 0.8em 0 0.4em;
          line-height: 1.2;
          color: #0A0A0A;
        }
        [contenteditable] h2 {
          font-size: 1.3em;
          font-weight: 700;
          margin: 0.7em 0 0.3em;
          line-height: 1.3;
          color: #0A0A0A;
        }
        [contenteditable] blockquote {
          border-left: 3px solid #FF5C00;
          margin: 1em 0;
          padding: 0.5em 1em;
          background: #FFF8F5;
          color: #555;
          border-radius: 0 6px 6px 0;
          font-style: italic;
        }
        [contenteditable] ul {
          list-style: disc;
          padding-left: 1.5em;
          margin: 0.5em 0;
        }
        [contenteditable] ol {
          list-style: decimal;
          padding-left: 1.5em;
          margin: 0.5em 0;
        }
        [contenteditable] li {
          margin: 0.25em 0;
        }
        [contenteditable] b, [contenteditable] strong { font-weight: 700; }
        [contenteditable] i, [contenteditable] em { font-style: italic; }
      `}</style>
    </div>
  )
}
