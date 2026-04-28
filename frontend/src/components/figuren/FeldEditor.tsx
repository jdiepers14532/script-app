import { useState, useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import UnderlineExt from '@tiptap/extension-underline'
import Highlight from '@tiptap/extension-highlight'
import PlaceholderExt from '@tiptap/extension-placeholder'
import { Search, Bold, Italic, Underline, List, Highlighter } from 'lucide-react'

interface Feld {
  id: number
  name: string
  typ: 'text' | 'richtext' | 'select' | 'link' | 'date' | 'number'
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
}

const BEZIEHUNGSTYPEN = ['eltern_von', 'kind_von', 'geschwister', 'partner', 'custom']

export default function FeldEditor({ feld, wert, onChange, onCharacterSearch, beziehungstypen = BEZIEHUNGSTYPEN }: FeldEditorProps) {
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={labelStyle}>{feld.name}</label>
      <input
        type={feld.typ === 'number' ? 'number' : feld.typ === 'date' ? 'date' : 'text'}
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
      Highlight,
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
          {([
            { icon: <Bold size={12} />, title: 'Fett', fn: () => editor.chain().focus().toggleBold().run(), active: editor.isActive('bold') },
            { icon: <Italic size={12} />, title: 'Kursiv', fn: () => editor.chain().focus().toggleItalic().run(), active: editor.isActive('italic') },
            { icon: <Underline size={12} />, title: 'Unterstrichen', fn: () => editor.chain().focus().toggleUnderline().run(), active: editor.isActive('underline') },
            null,
            { icon: <List size={12} />, title: 'Aufzählung', fn: () => editor.chain().focus().toggleBulletList().run(), active: editor.isActive('bulletList') },
            null,
            { icon: <Highlighter size={12} />, title: 'Markieren', fn: () => editor.chain().focus().toggleHighlight().run(), active: editor.isActive('highlight') },
          ] as const).map((btn, i) =>
            btn === null
              ? <div key={i} style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 2px', alignSelf: 'center' }} />
              : <button key={i} onClick={btn.fn} title={btn.title} style={{
                  width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '1px solid ' + (btn.active ? 'var(--text)' : 'transparent'),
                  borderRadius: 3, background: btn.active ? 'var(--bg-active)' : 'transparent',
                  cursor: 'pointer', color: 'var(--text)',
                }}>{btn.icon}</button>
          )}
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

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em',
}

const inputStyle: React.CSSProperties = {
  fontSize: 13, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6,
  background: 'var(--bg)', color: 'var(--text)', width: '100%', boxSizing: 'border-box',
}
