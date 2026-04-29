import { useState, useEffect, useRef, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { Mark } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import UnderlineExt from '@tiptap/extension-underline'
import PlaceholderExt from '@tiptap/extension-placeholder'
import { Search, Bold, Italic, Underline, List, Highlighter, Link2, Link2Off } from 'lucide-react'

// Inline highlight mark — avoids circular dep from @tiptap/extension-highlight
const HighlightMark = Mark.create({
  name: 'highlight',
  renderHTML() { return ['mark', 0] },
  parseHTML() { return [{ tag: 'mark' }] },
  addCommands() {
    return {
      toggleHighlight: () => ({ commands }: any) => commands.toggleMark(this.name),
    }
  },
})

interface Feld {
  id: number
  name: string
  typ: 'text' | 'richtext' | 'select' | 'link' | 'date' | 'number' | 'character_ref'
  optionen: string[]
  gilt_fuer: string
}

interface Feldwert {
  feld_id: number
  wert_text?: string | null
  wert_json?: any
}

interface FeldEditorProps {
  feld: Feld
  wert?: Feldwert | null
  onChange: (feldId: number, wertText: string | null, wertJson: any) => void
  // For link fields: search characters
  onCharacterSearch?: (q: string) => Promise<{ id: string; name: string }[]>
  beziehungstypen?: string[]
  // For character_ref fields: the current character being edited
  characterId?: string
}

const BEZIEHUNGSTYPEN = ['eltern_von', 'kind_von', 'geschwister', 'partner', 'custom']

function AutoResizeTextarea({ value, onChange, style, placeholder }: {
  value: string
  onChange: (v: string) => void
  style?: React.CSSProperties
  placeholder?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const resize = useCallback(() => {
    if (ref.current) {
      ref.current.style.height = 'auto'
      ref.current.style.height = ref.current.scrollHeight + 'px'
    }
  }, [])
  useEffect(() => { resize() }, [value, resize])
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={1}
      style={{ ...style, resize: 'none', overflow: 'hidden' }}
    />
  )
}

export default function FeldEditor({ feld, wert, onChange, onCharacterSearch, beziehungstypen = BEZIEHUNGSTYPEN, characterId }: FeldEditorProps) {
  if (feld.typ === 'character_ref') {
    return <CharacterRefFeld feld={feld} wert={wert} onChange={onChange} characterId={characterId} />
  }

  if (feld.typ === 'link') {
    return (
      <LinkFeld
        feld={feld}
        wert={wert}
        onChange={onChange}
        onCharacterSearch={onCharacterSearch}
        beziehungstypen={beziehungstypen}
      />
    )
  }

  if (feld.typ === 'richtext') {
    return <RichTextField feld={feld} wert={wert} onChange={onChange} />
  }

  const currentValue = wert?.wert_text ?? ''

  if (feld.typ === 'select') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={labelStyle}>{feld.name}</label>
        <select
          value={currentValue}
          onChange={e => onChange(feld.id, e.target.value || null, null)}
          style={inputStyle}
        >
          <option value="">— auswählen —</option>
          {feld.optionen.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      </div>
    )
  }

  if (feld.typ === 'text') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={labelStyle}>{feld.name}</label>
        <AutoResizeTextarea
          value={currentValue}
          onChange={v => onChange(feld.id, v || null, null)}
          style={{ ...inputStyle, lineHeight: '1.5' }}
        />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={labelStyle}>{feld.name}</label>
      <input
        type={feld.typ === 'number' ? 'number' : 'date'}
        value={currentValue}
        onChange={e => onChange(feld.id, e.target.value || null, null)}
        style={inputStyle}
      />
    </div>
  )
}

function RichTextField({ feld, wert, onChange }: Pick<FeldEditorProps, 'feld' | 'wert' | 'onChange'>) {
  const [dirty, setDirty] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // Derive initial content: prefer wert_json, fall back to plain wert_text
  const initialContent = wert?.wert_json
    ?? (wert?.wert_text
      ? { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: wert.wert_text }] }] }
      : { type: 'doc', content: [{ type: 'paragraph' }] })

  const editor = useEditor({
    extensions: [
      StarterKit,
      UnderlineExt,
      HighlightMark,
      PlaceholderExt.configure({ placeholder: 'Text eingeben…', emptyEditorClass: 'rt-editor-empty' }),
    ],
    content: initialContent,
    onUpdate: ({ editor }) => {
      setDirty(true)
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        const json = editor.getJSON()
        const text = editor.getText()
        onChangeRef.current(feld.id, text || null, json)
        setDirty(false)
      }, 600)
    },
  })

  // Reset content when a different entity is loaded (wert reference changes with new data)
  const prevWertRef = useRef(wert)
  useEffect(() => {
    if (!editor || prevWertRef.current === wert) return
    prevWertRef.current = wert
    const newContent = wert?.wert_json
      ?? (wert?.wert_text
        ? { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: wert.wert_text }] }] }
        : { type: 'doc', content: [{ type: 'paragraph' }] })
    editor.commands.setContent(newContent, false)
  }, [editor, wert])

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])

  if (!editor) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <label style={labelStyle}>{feld.name}</label>
        {dirty && <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Wird gespeichert…</span>}
      </div>
      <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', background: 'var(--bg)' }}>
        {/* Toolbar */}
        <div style={{ display: 'flex', gap: 2, padding: '4px 6px', borderBottom: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
          <TBtn active={editor.isActive('bold')} title="Fett" onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={12} /></TBtn>
          <TBtn active={editor.isActive('italic')} title="Kursiv" onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={12} /></TBtn>
          <TBtn active={editor.isActive('underline')} title="Unterstrichen" onClick={() => editor.chain().focus().toggleUnderline().run()}><Underline size={12} /></TBtn>
          <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 2px', alignSelf: 'center' }} />
          <TBtn active={editor.isActive('bulletList')} title="Aufzählung" onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={12} /></TBtn>
          <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 2px', alignSelf: 'center' }} />
          <TBtn active={editor.isActive('highlight')} title="Markieren" onClick={() => editor.chain().focus().toggleHighlight().run()}><Highlighter size={12} /></TBtn>
        </div>
        {/* Editor content — grows with text */}
        <div className="tiptap-feld" style={{ padding: '6px 10px', fontSize: 13, lineHeight: 1.6, minHeight: 60, position: 'relative' }}>
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  )
}

function LinkFeld({ feld, wert, onChange, onCharacterSearch, beziehungstypen }: FeldEditorProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ id: string; name: string }[]>([])
  const [searching, setSearching] = useState(false)
  const [beziehungstyp, setBeziehungstyp] = useState(beziehungstypen?.[0] ?? 'custom')
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const doSearch = async (q: string) => {
    if (!q.trim() || !onCharacterSearch) { setResults([]); return }
    setSearching(true)
    try {
      const r = await onCharacterSearch(q)
      setResults(r)
    } finally {
      setSearching(false)
    }
  }

  const handleInput = (v: string) => {
    setQuery(v)
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => doSearch(v), 300)
  }

  const select = (item: { id: string; name: string }) => {
    onChange(feld.id, null, { character_id: item.id, name: item.name, beziehungstyp })
    setQuery('')
    setResults([])
  }

  const stored = wert?.wert_json

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={labelStyle}>{feld.name}</label>
      {stored && (
        <div style={{ fontSize: 12, padding: '4px 8px', background: 'var(--bg-subtle)', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{stored.name} <span style={{ color: 'var(--text-secondary)' }}>({stored.beziehungstyp})</span></span>
          <button onClick={() => onChange(feld.id, null, null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 12 }}>×</button>
        </div>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        <select value={beziehungstyp} onChange={e => setBeziehungstyp(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
          {beziehungstypen?.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <div style={{ position: 'relative', flex: 1 }}>
          <div style={{ position: 'relative' }}>
            <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
            <input
              value={query}
              onChange={e => handleInput(e.target.value)}
              placeholder="Figur suchen…"
              style={{ ...inputStyle, paddingLeft: 26 }}
            />
          </div>
          {results.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
              {searching && <div style={{ padding: '6px 10px', fontSize: 12, color: 'var(--text-secondary)' }}>Sucht…</div>}
              {results.map(r => (
                <div key={r.id} onClick={() => select(r)} style={{ padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-subtle)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  {r.name}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function extractNamesFromText(text: string): string[] {
  return text
    .split(/[,;\n]/)
    .map(s => s.replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim())
    .filter(s => s.length >= 3)
    .slice(0, 5)
}

function CharacterRefFeld({ feld, wert, onChange, characterId }: Pick<FeldEditorProps, 'feld' | 'wert' | 'onChange' | 'characterId'>) {
  const [text, setText] = useState(wert?.wert_text ?? '')
  const [links, setLinks] = useState<any[]>([])
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevWertRef = useRef(wert)

  // Load links when character changes
  useEffect(() => {
    setLinks([])
    setSuggestions([])
    if (!characterId) return
    fetch(`/api/characters/${encodeURIComponent(characterId)}/feldwerte/${feld.id}/links`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(setLinks)
      .catch(() => {})
  }, [characterId, feld.id])

  // Reset text when a different character is loaded
  useEffect(() => {
    if (prevWertRef.current !== wert) {
      prevWertRef.current = wert
      setText(wert?.wert_text ?? '')
      setSuggestions([])
    }
  }, [wert])

  const doSearch = async (val: string) => {
    const names = extractNamesFromText(val)
    if (names.length === 0) { setSuggestions([]); return }
    setSearching(true)
    try {
      const linkedIds = new Set(links.map((l: any) => l.linked_character_id))
      const seen = new Set<string>()
      const results: any[] = []
      for (const name of names) {
        const r = await fetch(`/api/characters/search?q=${encodeURIComponent(name)}`, { credentials: 'include' })
        if (!r.ok) continue
        const data = await r.json()
        for (const item of data) {
          if (item.id !== characterId && !linkedIds.has(item.id) && !seen.has(item.id)) {
            seen.add(item.id)
            results.push(item)
          }
        }
      }
      setSuggestions(results)
    } finally { setSearching(false) }
  }

  const handleTextChange = (val: string) => {
    setText(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(val), 700)
  }

  const handleBlur = () => {
    onChange(feld.id, text || null, null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    doSearch(text)
  }

  const linkChar = async (item: any) => {
    if (!characterId) return
    const r = await fetch(`/api/characters/${encodeURIComponent(characterId)}/feldwerte/${feld.id}/links`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linked_character_id: item.id }),
    })
    if (r.ok) {
      setLinks(prev => [...prev, { linked_character_id: item.id, linked_character_name: item.name }])
      setSuggestions(prev => prev.filter(s => s.id !== item.id))
    }
  }

  const unlinkChar = async (linkedId: string) => {
    if (!characterId) return
    await fetch(`/api/characters/${encodeURIComponent(characterId)}/feldwerte/${feld.id}/links/${encodeURIComponent(linkedId)}`, {
      method: 'DELETE', credentials: 'include',
    })
    setLinks(prev => prev.filter(l => l.linked_character_id !== linkedId))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={labelStyle}>{feld.name}</label>
      <input
        type="text"
        value={text}
        onChange={e => handleTextChange(e.target.value)}
        onBlur={handleBlur}
        style={inputStyle}
        placeholder="Name eingeben…"
      />
      {(links.length > 0 || suggestions.length > 0 || searching) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
          {links.map((link: any) => (
            <span key={link.linked_character_id} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11,
              padding: '3px 6px 3px 5px', borderRadius: 12, color: 'var(--text)',
              background: 'rgba(0,200,83,0.1)', border: '1px solid rgba(0,200,83,0.35)',
            }}>
              <Link2 size={10} color="#00C853" />
              <span>{link.linked_character_name}</span>
              {link.staffeln && <span style={{ color: 'var(--text-secondary)', fontSize: 10 }}>({link.staffeln})</span>}
              <button onClick={() => unlinkChar(link.linked_character_id)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 13, padding: 0, lineHeight: 1, marginLeft: 1 }}>×</button>
            </span>
          ))}
          {suggestions.map((s: any) => (
            <span key={s.id} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11,
              padding: '3px 6px 3px 5px', borderRadius: 12, color: 'var(--text-secondary)',
              background: 'var(--bg-subtle)', border: '1px solid var(--border)',
            }}>
              <Link2Off size={10} />
              <span>{s.name}</span>
              {s.staffeln && <span style={{ fontSize: 10 }}>({s.staffeln})</span>}
              <button onClick={() => linkChar(s)}
                style={{ border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', color: 'var(--text)', fontSize: 10, padding: '1px 6px', borderRadius: 4, marginLeft: 2 }}>
                Verknüpfen
              </button>
            </span>
          ))}
          {searching && <span style={{ fontSize: 11, color: 'var(--text-secondary)', alignSelf: 'center' }}>Sucht…</span>}
        </div>
      )}
    </div>
  )
}

function TBtn({ active, title, onClick, children }: { active: boolean; title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: '1px solid ' + (active ? 'var(--text)' : 'transparent'),
        borderRadius: 3,
        background: active ? 'var(--bg-active)' : 'transparent',
        cursor: 'pointer', color: 'var(--text)',
      }}
    >
      {children}
    </button>
  )
}

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em',
}

const inputStyle: React.CSSProperties = {
  fontSize: 13, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6,
  background: 'var(--bg)', color: 'var(--text)', width: '100%', boxSizing: 'border-box',
}
