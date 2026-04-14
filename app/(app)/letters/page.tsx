'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'

const sb = createClient()
type Letter = { id: string; title: string; content: string; letter_date: string; created_at: string; tags: string[] }

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
  { label:'Orange',   value:'#1A73E8',  bg:'#1A73E8' },
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
  const [titleVal, setTitleVal]     = useState('')
  const [showNew, setShowNew]     = useState(false)
  const [newTitle, setNewTitle]   = useState('')
  const [newDate, setNewDate]     = useState(today)
  const [saveState, setSaveState] = useState<'idle'|'saving'|'saved'>('idle')
  const [search, setSearch] = useState('')
  const [showColors, setShowColors] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const editorRef   = useRef<HTMLDivElement>(null)
  const saveTimer   = useRef<ReturnType<typeof setTimeout>|null>(null)
  const currentId   = useRef<string|null>(null)
  const titleValRef = useRef<string>('')

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
    // Auto-suggest title from first content line if title is empty
    let title = titleValRef.current
    if (!title.trim() && editorRef.current) {
      const text = editorRef.current.innerText.trim()
      const firstLine = text.split('\n').find(l => l.trim())
      if (firstLine) title = firstLine.slice(0, 60)
    }
    title = title || today
    const currentTags = selected?.tags ?? []
    await sb.from('letters').update({ content: html, title, tags: currentTags, updated_at: new Date().toISOString() }).eq('id', currentId.current)
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
    setTitleVal(l.title)
    titleValRef.current = l.title
    currentId.current = l.id
    setSaveState('idle')
    setShowColors(false)
    setTagInput('')
    setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.innerHTML = l.content || ''
        editorRef.current.focus()
      }
    }, 50)
  }

  async function addTag(tag: string) {
    if (!selected || !tag.trim()) return
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const newTags = Array.from(new Set([...(selected.tags??[]), tag.trim().toLowerCase()]))
    setSelected(prev => prev ? {...prev, tags: newTags} : prev)
    setLetters(prev => prev.map(l => l.id === selected.id ? {...l, tags: newTags} : l))
    await sb.from('letters').update({ tags: newTags }).eq('id', selected.id)
    setTagInput('')
  }
  async function removeTag(tag: string) {
    if (!selected) return
    const { data: { user } } = await sb.auth.getUser(); if (!user) return
    const newTags = (selected.tags??[]).filter(t => t !== tag)
    setSelected(prev => prev ? {...prev, tags: newTags} : prev)
    setLetters(prev => prev.map(l => l.id === selected.id ? {...l, tags: newTags} : l))
    await sb.from('letters').update({ tags: newTags }).eq('id', selected.id)
  }
  function printLetter() {
    window.print()
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
      className={`w-7 h-7 rounded flex items-center justify-center text-[12px] font-medium transition-all
        ${active ? 'bg-[#1A73E8] text-white' : 'text-[#555] hover:bg-[#f0f0f0]'}`}>
      {children}
    </button>
  )
  const Divider = () => <div className="w-px h-5 bg-[#e0e0e0] mx-0.5"/>

  return (
    <div className="flex h-full">

      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <div className="w-[220px] min-w-[220px] border-r border-[#E8EAED] flex flex-col bg-[#F8F9FA]">
        <div className="px-4 py-3 border-b border-[#E8EAED] bg-white flex-shrink-0 flex items-center justify-between">
          <div>
            <div className="text-[14px] font-medium">Letters</div>
            <div className="text-[11px] text-[#5F6368] uppercase tracking-[.12em] mt-0.5">{letters.length} entries</div>
          </div>
          <button onClick={() => { setShowNew(true); setNewTitle(''); setNewDate(today) }}
            className="w-7 h-7 bg-[#1A73E8] text-white hover:bg-[#1557B0] transition-colors">
            +
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-[#E8EAED] flex-shrink-0">
          <input
            className="w-full bg-[#f0f0f0] rounded-lg px-2.5 py-1.5 text-[11px] outline-none focus:bg-white focus:ring-1 focus:ring-[#1A73E8] transition-all placeholder:text-[#80868B]"
            placeholder="Search letters…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Tag filter */}
        {(() => {
          const allTags = Array.from(new Set(letters.flatMap(l => l.tags??[]))).sort()
          if (allTags.length === 0) return null
          return (
            <div className="px-3 py-2 border-b border-[#E8EAED] flex gap-1 flex-wrap">
              <button onClick={() => setTagFilter('')}
                className={`text-[11px] font-medium px-2 py-0.5 rounded-full transition-all ${!tagFilter ? 'bg-[#1A73E8] text-white' : 'bg-[#f0f0f0] text-[#5F6368] hover:bg-[#e0e0e0]'}`}>
                All
              </button>
              {allTags.map(t => (
                <button key={t} onClick={() => setTagFilter(tagFilter === t ? '' : t)}
                  className={`text-[11px] font-medium px-2 py-0.5 rounded-full transition-all ${tagFilter === t ? 'bg-[#1A73E8] text-white' : 'bg-[#f0f0f0] text-[#5F6368] hover:bg-[#e0e0e0]'}`}>
                  #{t}
                </button>
              ))}
            </div>
          )
        })()}

        <div className="flex-1 overflow-y-auto py-1">
          {(() => {
            const filtered = letters.filter(l =>
              (!tagFilter || (l.tags??[]).includes(tagFilter)) &&
              (!search.trim() ||
              l.title.toLowerCase().includes(search.toLowerCase()) ||
              l.content.replace(/<[^>]*>/g,'').toLowerCase().includes(search.toLowerCase()))
            )
            if (filtered.length === 0) return (
              <div className="text-center py-8 text-[12px] text-[#80868B] px-4">
                {search ? 'No results found.' : <>No letters yet.<br/>Click + to start writing.</>}
              </div>
            )
            return filtered.map(l => {
              const snippet = l.content.replace(/<[^>]*>/g,'').trim().slice(0, 80)
              return (
                <button key={l.id} onClick={() => openLetter(l)}
                  className={`w-full text-left px-3 py-2.5 border-b border-[#f0f0f0] transition-all hover:bg-white
                    ${selected?.id === l.id ? 'bg-white border-l-2 border-l-[#1A73E8]' : 'border-l-2 border-l-transparent'}`}>
                  <div className="text-[12px] font-medium truncate text-[#0A0A0A]">{l.title || l.letter_date}</div>
                  {snippet && (
                    <div className="text-[10px] text-[#80868B] mt-0.5 line-clamp-2 leading-relaxed">{snippet}</div>
                  )}
                  <div className="text-[11px] text-[#80868B] mt-1 flex items-center gap-2 flex-wrap">
                    <span>{displayDate(l.letter_date)}</span>
                    {l.content && <span>{wordCount(l.content)}w</span>}
                    {(l.tags??[]).map(t => <span key={t} className="text-[#1A73E8]" >#{t}</span>)}
                  </div>
                </button>
              )
            })
          })()}
        </div>
      </div>

      {/* ── Main area ───────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col bg-white min-w-0">

        {/* New letter modal */}
        {showNew && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
            <div className="bg-white rounded-xl shadow-2xl p-7 w-[380px] max-w-[90vw]">
              <div className="text-[16px] font-medium mb-4">New Letter</div>
              <div className="mb-3">
                <div className="text-[11px] font-medium text-[#5F6368] tracking-[0.05em] uppercase mb-1">Title</div>
                <input autoFocus
                  className="w-full border border-[#DADCE0] rounded-lg px-3 py-2.5 text-[14px] outline-none focus:border-[#1A73E8] focus:ring-2 focus:ring-[rgba(26,115,232,0.15)]"
                  placeholder="e.g. Letter to future self, Monday reflection…"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  onKeyDown={e => e.key==='Enter' && createLetter()}
                />
              </div>
              <div className="mb-6">
                <div className="text-[11px] font-medium text-[#5F6368] tracking-[0.05em] uppercase mb-1">Date</div>
                <input type="date"
                  className="w-full border border-[#DADCE0] rounded-lg px-3 py-2.5 text-[13px] outline-none focus:border-[#1A73E8] focus:ring-2 focus:ring-[rgba(26,115,232,0.15)]"
                  value={newDate} onChange={e => setNewDate(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <button onClick={createLetter} disabled={!newTitle.trim()}
                  className="flex-1 bg-[#1A73E8] text-white hover:bg-[#1557B0] transition-colors px-4 py-2 rounded-full text-[13px] font-medium disabled:opacity-40">
                  Create & Write
                </button>
                <button onClick={() => setShowNew(false)}
                  className="px-4 border border-[#DADCE0] text-[13px] font-medium rounded-lg hover:border-[#1A73E8] transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="text-5xl mb-4">✍</div>
            <div className="text-[16px] font-medium mb-2">Select a letter or write a new one</div>
            <div className="text-[13px] text-[#5F6368] max-w-sm mb-6">
              Write to yourself every day. Letters to your future self, reflections, plans — all in one place.
            </div>
            <button onClick={() => { setShowNew(true); setNewTitle(''); setNewDate(today) }}
              className="bg-[#1A73E8] text-white hover:bg-[#1557B0] transition-colors px-4 py-2 rounded-full text-[13px] font-medium">
              + Write a New Letter
            </button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-6 py-2.5 border-b border-[#E8EAED] flex items-center gap-5 flex-shrink-0">
              <input
                className="flex-1 text-[16px] font-medium outline-none placeholder:text-[#dedede] min-w-0"
                placeholder="Title…"
                value={titleVal}
                onChange={e => { setTitleVal(e.target.value); titleValRef.current = e.target.value; scheduleAutoSave() }}
              />
              <div className="flex items-center gap-2 flex-shrink-0">
                {saveState === 'saving' && <span className="text-[10px] text-[#80868B]">Saving…</span>}
                {saveState === 'saved'  && <span className="text-[10px] text-[#22c55e] font-medium">✓ Saved</span>}
                <span className="text-[10px] text-[#80868B] font-mono">{displayDate(selected.letter_date)}</span>
                <button onClick={printLetter} title="Export as PDF"
                  className="text-[10px] text-[#80868B] hover:text-[#202124] transition-colors px-1">⎙ PDF</button>
                <button onClick={deleteLetter} className="text-[10px] text-[#80868B] hover:text-[#ef4444] transition-colors px-1">Delete</button>
              </div>
            </div>

            {/* Formatting toolbar */}
            <div className="px-4 py-1.5 border-b border-[#E8EAED] flex items-center gap-0.5 flex-wrap flex-shrink-0 bg-[#F8F9FA]">

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
                    <span className="text-[11px] font-medium text-[#555]">A</span>
                    <div className="w-4 h-1 rounded-full bg-[#1A73E8]"/>
                  </div>
                </button>
                {showColors && (
                  <div className="absolute top-9 left-0 z-20 bg-white border border-[#E8EAED] rounded-lg shadow-lg p-2 flex gap-1.5">
                    {COLORS.map(c => (
                      <button key={c.value}
                        onMouseDown={e=>{e.preventDefault();cmd('foreColor',c.value);setShowColors(false)}}
                        title={c.label}
                        className="w-6 h-6 rounded-full border-2 border-white hover:border-[#1A73E8] transition-all"
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
                <span className="text-[11px] text-[#5F6368]">✕</span>
              </ToolBtn>
              <Divider/>

              {/* Indent */}
              <ToolBtn onClick={()=>cmd('indent')}  title="Indent"  active={false}><span className="text-[11px]">→</span></ToolBtn>
              <ToolBtn onClick={()=>cmd('outdent')} title="Outdent" active={false}><span className="text-[11px]">←</span></ToolBtn>

            </div>

            {/* Tags row */}
            <div className="px-4 py-2 border-b border-[#E8EAED] flex items-center gap-2 flex-wrap bg-[#F8F9FA]">
              <span className="text-[11px] font-medium text-[#80868B] uppercase tracking-[.1em] flex-shrink-0">Tags</span>
              {(selected.tags??[]).map(t => (
                <span key={t} className="flex items-center gap-1 bg-[#E8F0FE] text-[#1A73E8] text-[11px] font-medium px-2 py-0.5 rounded-full">
                  #{t}
                  <button onClick={() => removeTag(t)} className="ml-0.5 hover:text-[#202124] transition-colors leading-none">×</button>
                </span>
              ))}
              <input
                className="text-[11px] bg-transparent outline-none placeholder:text-[#dedede] min-w-[80px]"
                placeholder="Add tag…"
                value={tagInput}
                onChange={e => setTagInput(e.target.value.replace(/\s/g,''))}
                onKeyDown={e => { if(e.key==='Enter'||e.key===','){ e.preventDefault(); addTag(tagInput) } }}
              />
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
                  caretColor: '#1A73E8',
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
          border-left: 3px solid #1A73E8;
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
