import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCursor from '@tiptap/extension-collaboration-cursor'
import * as Y from 'yjs'
import type { HocuspocusProvider } from '@hocuspocus/provider'
import { useState, useEffect, useRef, useCallback, useMemo, type WheelEvent, type CSSProperties } from 'react'
import {
  Info, ChevronDown, ChevronUp,
  Bold as BoldIcon, Italic as ItalicIcon, Underline as UnderlineIcon,
  AlignLeft, AlignCenter, AlignRight,
  List, ListOrdered, ImageIcon, Maximize2, Minimize2,
} from 'lucide-react'
import Tooltip from '../Tooltip'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import FontFamily from '@tiptap/extension-font-family'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import { ScreenplayExtension, ScreenplayElementType, FormatElement, SCREENPLAY_CSS } from '../../tiptap/ScreenplayExtension'
import { AbsatzExtension, generateAbsatzCSS, convertScreenplayToAbsatz, type AbsatzFormat } from '../../tiptap/AbsatzExtension'
import { FontSizeExtension } from '../../tiptap/FontSizeExtension'
import { LineSpacingExtension } from '../../tiptap/LineSpacingExtension'
import { AnnotationMark } from '../../tiptap/AnnotationMark'
import { SearchHighlightExtension } from '../../tiptap/SearchHighlightExtension'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import PageWrapper from './PageWrapper'
import { useUserPrefs } from '../../contexts'
import { createLineNumberPlugin, lineNumberPluginKey, LINE_NUMBER_CSS } from '../../tiptap/LineNumberPlugin'
import { createReplikNumberPlugin, REPLIK_NUMBER_CSS } from '../../tiptap/ReplikNumberPlugin'

// ── Platform detection ──────────────────────────────────────────────────────
const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent)
const modKey = isMac ? '\u2318' : 'Ctrl'
const altKey = isMac ? '\u2325' : 'Alt'

// ── Courier Prime font ──────────────────────────────────────────────────────
let fontLoaded = false
function loadCourierPrime() {
  if (fontLoaded) return
  fontLoaded = true
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = 'https://fonts.googleapis.com/css2?family=Courier+Prime:ital,wght@0,400;0,700;1,400;1,700&display=swap'
  document.head.appendChild(link)
}

// Inject screenplay CSS once (backward compat)
let spCssInjected = false
function injectScreenplayCSS() {
  if (spCssInjected) return
  const style = document.createElement('style')
  style.id = 'screenplay-css'
  style.textContent = SCREENPLAY_CSS
  document.head.appendChild(style)
  spCssInjected = true
}

let gutterCssInjected = false
function injectGutterCSS() {
  if (gutterCssInjected) return
  gutterCssInjected = true
  const style = document.createElement('style')
  style.id = 'gutter-css'
  style.textContent = LINE_NUMBER_CSS + REPLIK_NUMBER_CSS
  document.head.appendChild(style)
}

// ── Constants ───────────────────────────────────────────────────────────────

const FONT_SIZES = ['9pt', '10pt', '11pt', '12pt', '13pt', '14pt', '16pt', '18pt', '24pt', '36pt']
const FONT_FAMILIES = [
  { label: 'Courier Prime', value: 'Courier Prime' },
  { label: 'Courier New', value: 'Courier New' },
  { label: 'Inter', value: 'Inter' },
  { label: 'Arial', value: 'Arial' },
  { label: 'Helvetica', value: 'Helvetica' },
  { label: 'Times New Roman', value: 'Times New Roman' },
  { label: 'Georgia', value: 'Georgia' },
]
const LINE_SPACINGS = [
  { label: '1.0', value: '1' },
  { label: '1.15', value: '1.15' },
  { label: '1.5', value: '1.5' },
  { label: '2.0', value: '2' },
]

const LS_TOOLBAR_KEY = 'script_editor_toolbar'
function loadToolbarPrefs(): { formatBar: boolean; textBar: boolean } {
  try {
    const raw = localStorage.getItem(LS_TOOLBAR_KEY)
    return raw ? JSON.parse(raw) : { formatBar: true, textBar: true }
  } catch { return { formatBar: true, textBar: true } }
}
function saveToolbarPrefs(prefs: { formatBar: boolean; textBar: boolean }) {
  try { localStorage.setItem(LS_TOOLBAR_KEY, JSON.stringify(prefs)) } catch {}
}

// ── LanguageTool types + CSS ─────────────────────────────────────────────────

interface LTMatch {
  message: string
  shortMessage: string
  offset: number
  length: number
  replacements: string[]
  rule: { id: string; category: string }
}

let ltCssInjected = false
function injectLTCSS() {
  if (ltCssInjected) return
  ltCssInjected = true
  const style = document.createElement('style')
  style.id = 'languagetool-css'
  style.textContent = `
    .lt-error {
      text-decoration: underline wavy #FF3B30;
      text-decoration-skip-ink: none;
      text-underline-offset: 2px;
      cursor: pointer;
    }
    .lt-warning {
      text-decoration: underline wavy #FFCC00;
      text-decoration-skip-ink: none;
      text-underline-offset: 2px;
      cursor: pointer;
    }
    .lt-popup {
      position: fixed; z-index: 99999; background: var(--bg-surface, #fff);
      border: 1px solid var(--border, #ddd); border-radius: 8px; padding: 10px 14px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.18); max-width: 320px; font-size: 12px;
      line-height: 1.5; color: var(--text-primary, #111);
    }
    .lt-popup-msg { margin-bottom: 6px; font-weight: 500; }
    .lt-popup-replacements { display: flex; gap: 4px; flex-wrap: wrap; }
    .lt-popup-btn {
      padding: 3px 8px; border-radius: 4px; border: 1px solid var(--border, #ddd);
      background: var(--bg-subtle, #f5f5f5); cursor: pointer; font-size: 11px;
      color: var(--text-primary, #111); font-family: inherit;
    }
    .lt-popup-btn:hover { background: #007AFF; color: #fff; border-color: #007AFF; }
  `
  document.head.appendChild(style)
}

// ── Props ───────────────────────────────────────────────────────────────────

interface UniversalEditorProps {
  ydoc?: Y.Doc | null
  provider?: HocuspocusProvider | null
  produktionId?: string
  initialContent?: any
  onSave?: (content: any) => void
  autoSaveMs?: number
  readOnly?: boolean
  seitenformat?: 'a4' | 'letter'
  showShadow?: boolean
  formatElements?: FormatElement[]
  absatzformate?: AbsatzFormat[]
  kategorie?: string // drehbuch | storyline | notiz
  placeholder?: string
  onNavigateNext?: () => void
  onNavigatePrev?: () => void
  showLineNumbers?: boolean
  showReplikNumbers?: boolean
  replikOffset?: number
  replikBaseline?: any[] | null
  isLocked?: boolean
}

// ── Component ───────────────────────────────────────────────────────────────

export default function UniversalEditor({
  initialContent,
  onSave,
  autoSaveMs = 1500,
  readOnly = false,
  seitenformat = 'a4',
  showShadow = true,
  formatElements = [],
  absatzformate = [],
  kategorie = 'drehbuch',
  placeholder = 'Text eingeben...',
  ydoc,
  provider,
  produktionId,
  onNavigateNext,
  onNavigatePrev,
  showLineNumbers = false,
  showReplikNumbers = false,
  replikOffset = 0,
  replikBaseline = null,
  isLocked = false,
}: UniversalEditorProps) {
  injectScreenplayCSS()
  loadCourierPrime()
  injectLTCSS()
  injectGutterCSS()

  const { spellcheck: spellcheckMode } = useUserPrefs()

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave

  // Toolbar visibility
  const [toolbarPrefs, setToolbarPrefs] = useState(loadToolbarPrefs)
  const toggleToolbar = useCallback((bar: 'formatBar' | 'textBar') => {
    setToolbarPrefs(prev => {
      const next = { ...prev, [bar]: !prev[bar] }
      saveToolbarPrefs(next)
      return next
    })
  }, [])
  const toggleAllToolbars = useCallback(() => {
    const allVisible = toolbarPrefs.formatBar && toolbarPrefs.textBar
    const next = { formatBar: !allVisible, textBar: !allVisible }
    setToolbarPrefs(next)
    saveToolbarPrefs(next)
  }, [toolbarPrefs])

  // Filter formats by kategorie
  const relevantFormats = useMemo(() =>
    absatzformate.filter(f => f.kategorie === kategorie || f.kategorie === 'alle'),
    [absatzformate, kategorie]
  )

  // Inject dynamic CSS for absatzformate
  useEffect(() => {
    if (relevantFormats.length === 0) return
    const id = 'absatz-dynamic-css'
    let style = document.getElementById(id) as HTMLStyleElement | null
    if (!style) {
      style = document.createElement('style')
      style.id = id
      document.head.appendChild(style)
    }
    style.textContent = generateAbsatzCSS(absatzformate)
  }, [absatzformate, relevantFormats])

  // Convert content from screenplay_element to absatz if formats available
  const processedContent = useMemo(() => {
    if (!initialContent) return null
    if (relevantFormats.length === 0) return initialContent
    const hasScreenplay = initialContent?.content?.some(
      (n: any) => n.type === 'screenplay_element'
    )
    if (hasScreenplay) return convertScreenplayToAbsatz(initialContent, relevantFormats)
    return initialContent
  }, [initialContent, relevantFormats])

  // Character autocomplete (for screenplay/drehbuch mode)
  const [acSuggestions, setAcSuggestions] = useState<string[]>([])
  const [acQuery, setAcQuery] = useState('')
  const [acPos, setAcPos] = useState<{ x: number; y: number } | null>(null)
  const acTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const triggerAutocomplete = useCallback((query: string, domRect: DOMRect | null) => {
    setAcQuery(query)
    if (!query || !produktionId || !domRect) { setAcSuggestions([]); setAcPos(null); return }
    if (acTimer.current) clearTimeout(acTimer.current)
    acTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/autocomplete/characters?produktion_id=${encodeURIComponent(produktionId)}&q=${encodeURIComponent(query)}`, { credentials: 'include' })
        const data = await res.json()
        const names = [
          ...(data.own ?? []).map((c: any) => c.name),
          ...(data.cross ?? []).map((c: any) => `${c.name} • ${c.produktion_id}`),
        ].slice(0, 8)
        setAcSuggestions(names)
        if (names.length > 0) setAcPos({ x: domRect.left, y: domRect.bottom + 4 })
        else setAcPos(null)
      } catch { setAcSuggestions([]); setAcPos(null) }
    }, 250)
  }, [produktionId])

  const collabExtensions = ydoc ? [
    Collaboration.configure({ document: ydoc }),
    ...(provider ? [CollaborationCursor.configure({
      provider,
      user: { name: 'Ich', color: '#007AFF' },
    })] : []),
  ] : []

  const hasAbsatzFormate = relevantFormats.length > 0

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        history: ydoc ? false : undefined,
      }),
      Underline,
      TextStyle,
      FontFamily,
      FontSizeExtension,
      LineSpacingExtension,
      TextAlign.configure({ types: ['heading', 'paragraph', 'absatz', 'screenplay_element'] }),
      Image.configure({ inline: false, allowBase64: true }),
      ScreenplayExtension.configure({ formatElements }),
      AbsatzExtension.configure({ formate: relevantFormats }),
      AnnotationMark,
      SearchHighlightExtension,
      Placeholder.configure({
        placeholder,
        emptyEditorClass: 'universal-editor-empty',
      }),
      ...collabExtensions,
    ],
    content: ydoc ? undefined : (processedContent || getDefaultContent(hasAbsatzFormate, relevantFormats, kategorie)),
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      if (readOnly || !onSaveRef.current) return
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        onSaveRef.current?.(editor.getJSON())
      }, autoSaveMs)
    },
  }, [processedContent, hasAbsatzFormate])

  useEffect(() => {
    editor?.setEditable(!readOnly)
  }, [editor, readOnly])

  // ── Line number plugin (register/unregister based on toggle) ──────────────
  useEffect(() => {
    if (!editor) return
    try { editor.unregisterPlugin(lineNumberPluginKey) } catch {}
    const el = editor.view.dom as HTMLElement
    if (showLineNumbers) {
      try { editor.registerPlugin(createLineNumberPlugin()) } catch {}
      el.classList.add('has-line-numbers')
    } else {
      el.classList.remove('has-line-numbers')
    }
    return () => {
      try { editor.unregisterPlugin(lineNumberPluginKey) } catch {}
      el.classList.remove('has-line-numbers')
    }
  }, [editor, showLineNumbers])

  // ── Replik number plugin ──────────────────────────────────────────────────
  useEffect(() => {
    if (!editor) return
    try { editor.unregisterPlugin('replikNumbers') } catch {}
    if (showReplikNumbers) {
      try { editor.registerPlugin(createReplikNumberPlugin({
        offset: replikOffset,
        baseline: replikBaseline,
        isLocked,
      })) } catch {}
    }
    return () => { try { editor.unregisterPlugin('replikNumbers') } catch {} }
  }, [editor, showReplikNumbers, replikOffset, replikBaseline, isLocked])

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
  }, [])

  // Overscroll navigation
  const overscrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (overscrollTimer.current) clearTimeout(overscrollTimer.current) }, [])

  const handleScrollWheel = useCallback((e: WheelEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 2
    const atTop = el.scrollTop <= 0
    if (e.deltaY > 0 && atBottom && onNavigateNext) {
      if (!overscrollTimer.current) {
        overscrollTimer.current = setTimeout(() => { overscrollTimer.current = null; onNavigateNext() }, 300)
      }
    } else if (e.deltaY < 0 && atTop && onNavigatePrev) {
      if (!overscrollTimer.current) {
        overscrollTimer.current = setTimeout(() => { overscrollTimer.current = null; onNavigatePrev() }, 300)
      }
    } else if (overscrollTimer.current) {
      clearTimeout(overscrollTimer.current); overscrollTimer.current = null
    }
  }, [onNavigateNext, onNavigatePrev])

  // Get current format for toolbar highlight
  const getCurrentFormat = useCallback((): AbsatzFormat | null => {
    if (!editor) return null
    const { $from } = editor.state.selection
    const node = $from.node()
    if (node.type.name === 'absatz') {
      return relevantFormats.find(f => f.id === node.attrs.format_id) ?? null
    }
    return null
  }, [editor, relevantFormats])

  const getCurrentElementType = useCallback((): ScreenplayElementType | null => {
    if (!editor) return null
    const { $from } = editor.state.selection
    const node = $from.node()
    if (node.type.name === 'screenplay_element') {
      return node.attrs.element_type as ScreenplayElementType
    }
    return null
  }, [editor])

  const [currentFormat, setCurrentFormat] = useState<AbsatzFormat | null>(null)
  const [currentElementType, setCurrentElementType] = useState<ScreenplayElementType | null>(null)

  useEffect(() => {
    if (!editor) return
    const update = () => {
      setCurrentFormat(getCurrentFormat())
      setCurrentElementType(getCurrentElementType())
    }
    editor.on('selectionUpdate', update)
    editor.on('transaction', update)
    return () => {
      editor.off('selectionUpdate', update)
      editor.off('transaction', update)
    }
  }, [editor, getCurrentFormat, getCurrentElementType])

  // Image upload handler
  const fileInputRef = useRef<HTMLInputElement>(null)
  const handleImageUpload = useCallback(async (file: File) => {
    if (!editor) return
    const formData = new FormData()
    formData.append('image', file)
    try {
      const res = await fetch('/api/editor-uploads', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })
      const data = await res.json()
      if (data.url) {
        editor.chain().focus().setImage({ src: data.url }).run()
      }
    } catch (err) {
      console.error('Image upload failed:', err)
    }
  }, [editor])

  // ── LanguageTool integration ──────────────────────────────────────────────
  const [ltMatches, setLtMatches] = useState<LTMatch[]>([])
  const [ltPopup, setLtPopup] = useState<{ match: LTMatch; pmFrom: number; pmTo: number; x: number; y: number } | null>(null)
  const ltTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ltAbort = useRef<AbortController | null>(null)

  // Build a full mapping: getText() char index → ProseMirror position
  const buildTextToPmMap = useCallback((doc: any): number[] => {
    const map: number[] = [] // map[textIdx] = pmPos
    let isFirstBlock = true
    doc.descendants((node: any, pos: number) => {
      if (node.isBlock && node.isLeaf) return false
      if (node.isBlock && !isFirstBlock && node.content.size > 0) {
        map.push(-1) // newline separator from getText()
      }
      if (node.isBlock && node.content.size > 0) isFirstBlock = false
      if (node.isText) {
        for (let i = 0; i < node.text.length; i++) {
          map.push(pos + i)
        }
      }
      return true
    })
    return map
  }, [])

  // Debounced LT check
  useEffect(() => {
    if (spellcheckMode !== 'languagetool' || !editor) {
      setLtMatches([])
      setLtPopup(null)
      return
    }
    const check = async () => {
      if (editor.isDestroyed) return
      const text = editor.getText()
      if (!text.trim() || text.length < 3) { setLtMatches([]); return }
      try {
        ltAbort.current?.abort()
        ltAbort.current = new AbortController()
        const resp = await fetch('/api/spellcheck', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
          signal: ltAbort.current.signal,
        })
        if (!resp.ok) return
        const data = await resp.json()
        setLtMatches(data.matches || [])
      } catch (e: any) {
        if (e.name !== 'AbortError') console.error('[LT] check failed:', e)
      }
    }
    const handler = () => {
      if (ltTimer.current) clearTimeout(ltTimer.current)
      ltTimer.current = setTimeout(check, 2000)
    }
    editor.on('update', handler)
    // Initial check on mount
    check()
    return () => {
      editor.off('update', handler)
      if (ltTimer.current) clearTimeout(ltTimer.current)
      ltAbort.current?.abort()
    }
  }, [editor, spellcheckMode])

  // Apply ProseMirror inline decorations for LT matches
  useEffect(() => {
    if (!editor) return
    try { editor.unregisterPlugin('languagetool') } catch {}

    if (spellcheckMode !== 'languagetool' || ltMatches.length === 0) return

    const doc = editor.state.doc
    const textMap = buildTextToPmMap(doc)

    const decos: any[] = []
    for (let i = 0; i < ltMatches.length; i++) {
      const m = ltMatches[i]
      const from = textMap[m.offset]
      const toIdx = m.offset + m.length - 1
      const to = toIdx < textMap.length ? textMap[toIdx] : undefined
      if (from == null || from < 0 || to == null || to < 0) continue
      const pmTo = to + 1 // end is exclusive in PM
      if (from >= pmTo) continue
      const isSpelling = m.rule.category === 'TYPOS' || m.rule.category === 'SPELLING'
      decos.push(Decoration.inline(from, pmTo, {
        class: isSpelling ? 'lt-error' : 'lt-warning',
        'data-lt-idx': String(i),
      }))
    }

    if (decos.length === 0) return

    const decoSet = DecorationSet.create(doc, decos)
    const plugin = new Plugin({
      key: new PluginKey('languagetool'),
      state: {
        init() { return decoSet },
        apply(tr: any, old: any) {
          // Map decorations through each transaction's steps
          if (tr.docChanged) return old.map(tr.mapping, tr.doc)
          return old
        },
      },
      props: {
        decorations(state: any) {
          return this.getState(state)
        },
      },
    })
    try { editor.registerPlugin(plugin) } catch {}

    return () => {
      try { editor.unregisterPlugin('languagetool') } catch {}
    }
  }, [editor, ltMatches, spellcheckMode, buildTextToPmMap])

  // Click handler on editor for LT popup
  useEffect(() => {
    if (!editor || spellcheckMode !== 'languagetool') return
    const el = editor.view.dom as HTMLElement
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.classList.contains('lt-error') || target.classList.contains('lt-warning')) {
        const idx = parseInt(target.dataset.ltIdx || '-1')
        const match = ltMatches[idx]
        if (match) {
          const rect = target.getBoundingClientRect()
          const textMap = buildTextToPmMap(editor.state.doc)
          const from = textMap[match.offset] ?? -1
          const toIdx = match.offset + match.length - 1
          const to = toIdx < textMap.length ? (textMap[toIdx] ?? -1) + 1 : -1
          setLtPopup({ match, pmFrom: from, pmTo: to, x: rect.left, y: rect.bottom + 4 })
          e.stopPropagation()
        }
      } else {
        setLtPopup(null)
      }
    }
    el.addEventListener('click', handleClick)
    return () => el.removeEventListener('click', handleClick)
  }, [editor, ltMatches, spellcheckMode, buildTextToPmMap])

  // Close LT popup on outside click
  useEffect(() => {
    if (!ltPopup) return
    const close = () => setLtPopup(null)
    const timer = setTimeout(() => document.addEventListener('click', close), 50)
    return () => { clearTimeout(timer); document.removeEventListener('click', close) }
  }, [ltPopup])

  // Apply replacement from LT popup
  const applyLtReplacement = useCallback((match: LTMatch, pmFrom: number, pmTo: number, replacement: string) => {
    if (!editor || pmFrom < 0 || pmTo < 0) return
    editor.chain()
      .focus()
      .deleteRange({ from: pmFrom, to: pmTo })
      .insertContentAt(pmFrom, replacement)
      .run()
    setLtPopup(null)
  }, [editor])

  if (!editor) return null

  // Current inline style values for dropdowns
  const activeFontFamily = editor.getAttributes('textStyle').fontFamily || ''
  const activeFontSize = editor.getAttributes('textStyle').fontSize || ''
  const activeLineSpacing = (() => {
    const { $from } = editor.state.selection
    const node = $from.node()
    return node.attrs?.lineSpacing || ''
  })()

  const allHidden = !toolbarPrefs.formatBar && !toolbarPrefs.textBar

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Hidden file input for image upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) handleImageUpload(file)
          e.target.value = ''
        }}
      />

      {!readOnly && (
        <>
          {/* ── Row 1: Format Toolbar (Absatzformate / Screenplay types) ──── */}
          {toolbarPrefs.formatBar && (
            <div style={{
              display: 'flex', gap: 4, padding: '5px 12px',
              borderBottom: '1px solid var(--border)', flexWrap: 'wrap',
              background: 'var(--bg-surface)', flexShrink: 0, alignItems: 'center',
            }}>
              {hasAbsatzFormate ? (
                <>
                  {relevantFormats.sort((a, b) => a.sort_order - b.sort_order).map((fmt, idx) => (
                    <Tooltip key={fmt.id} text={`${fmt.name}${fmt.kuerzel ? ` (${fmt.kuerzel})` : ''}\n${altKey}+${idx + 1}`} placement="bottom" delay={400}>
                      <button
                        onClick={() => editor.commands.setAbsatzFormat(fmt.id)}
                        style={{
                          height: 26, padding: '0 8px',
                          fontSize: 11, fontFamily: 'inherit',
                          border: '1px solid var(--border)', borderRadius: 4,
                          background: currentFormat?.id === fmt.id ? 'var(--text-primary)' : 'transparent',
                          color: currentFormat?.id === fmt.id ? 'var(--text-inverse)' : 'var(--text-secondary)',
                          cursor: 'pointer',
                          fontWeight: currentFormat?.id === fmt.id ? 600 : 400,
                          transition: '0.1s',
                        }}
                      >
                        {fmt.kuerzel || fmt.name.slice(0, 4)}
                      </button>
                    </Tooltip>
                  ))}
                  <Tooltip text={`Tab: nachstes Format\nEnter: Folgeformat`} placement="bottom">
                    <span style={{ width: 24, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'help', color: 'var(--text-muted)', flexShrink: 0 }}>
                      <Info size={12} />
                    </span>
                  </Tooltip>
                </>
              ) : currentElementType ? (
                <>
                  {(['scene_heading', 'action', 'character', 'dialogue', 'parenthetical', 'transition', 'shot'] as ScreenplayElementType[]).map((type, idx) => (
                    <Tooltip key={type} text={`${type === 'scene_heading' ? 'Szene' : type === 'parenthetical' ? 'Par.' : type}\n${altKey}+${idx + 1}`} placement="bottom" delay={400}>
                      <button
                        onClick={() => editor.commands.setElementType(type)}
                        style={{
                          height: 26, padding: '0 8px', fontSize: 11,
                          border: '1px solid var(--border)', borderRadius: 4,
                          background: currentElementType === type ? 'var(--text-primary)' : 'transparent',
                          color: currentElementType === type ? 'var(--text-inverse)' : 'var(--text-secondary)',
                          cursor: 'pointer',
                          fontWeight: currentElementType === type ? 600 : 400,
                          transition: '0.1s',
                        }}
                      >
                        {type === 'scene_heading' ? 'SH' : type === 'parenthetical' ? 'PAR' : type.slice(0, 4).toUpperCase()}
                      </button>
                    </Tooltip>
                  ))}
                </>
              ) : null}

              <div style={{ flex: 1 }} />

              {/* Fokus-Modus */}
              <Tooltip text="Fokus-Modus (alle Leisten ausblenden)" placement="bottom">
                <button onClick={toggleAllToolbars} style={miniBtn}>
                  <Minimize2 size={11} />
                </button>
              </Tooltip>
              {/* Minimize format bar */}
              <Tooltip text="Formatleiste minimieren" placement="bottom">
                <button onClick={() => toggleToolbar('formatBar')} style={miniBtn}>
                  <ChevronUp size={12} />
                </button>
              </Tooltip>
            </div>
          )}

          {/* ── Row 2: Inline Text Formatting Toolbar ──────────────────── */}
          {toolbarPrefs.textBar && (
            <div style={{
              display: 'flex', gap: 3, padding: '4px 12px',
              borderBottom: '1px solid var(--border)', flexWrap: 'wrap',
              background: 'var(--bg-surface)', flexShrink: 0, alignItems: 'center',
            }}>
              {/* Bold / Italic / Underline */}
              <ToolbarBtn
                active={editor.isActive('bold')}
                onClick={() => editor.chain().focus().toggleBold().run()}
                tooltip={`Fett (${modKey}+B)`}
              >
                <BoldIcon size={13} />
              </ToolbarBtn>
              <ToolbarBtn
                active={editor.isActive('italic')}
                onClick={() => editor.chain().focus().toggleItalic().run()}
                tooltip={`Kursiv (${modKey}+I)`}
              >
                <ItalicIcon size={13} />
              </ToolbarBtn>
              <ToolbarBtn
                active={editor.isActive('underline')}
                onClick={() => editor.chain().focus().toggleUnderline().run()}
                tooltip={`Unterstrichen (${modKey}+U)`}
              >
                <UnderlineIcon size={13} />
              </ToolbarBtn>

              <Sep />

              {/* Text Alignment */}
              <ToolbarBtn
                active={editor.isActive({ textAlign: 'left' })}
                onClick={() => editor.chain().focus().setTextAlign('left').run()}
                tooltip="Linksbuendig"
              >
                <AlignLeft size={13} />
              </ToolbarBtn>
              <ToolbarBtn
                active={editor.isActive({ textAlign: 'center' })}
                onClick={() => editor.chain().focus().setTextAlign('center').run()}
                tooltip="Zentriert"
              >
                <AlignCenter size={13} />
              </ToolbarBtn>
              <ToolbarBtn
                active={editor.isActive({ textAlign: 'right' })}
                onClick={() => editor.chain().focus().setTextAlign('right').run()}
                tooltip="Rechtsbuendig"
              >
                <AlignRight size={13} />
              </ToolbarBtn>

              <Sep />

              {/* Font Family */}
              <Tooltip text="Schriftart" placement="bottom">
                <select
                  value={activeFontFamily}
                  onChange={e => {
                    if (e.target.value) editor.chain().focus().setFontFamily(e.target.value).run()
                    else editor.chain().focus().unsetFontFamily().run()
                  }}
                  style={selectStyle}
                >
                  <option value="">Standard</option>
                  {FONT_FAMILIES.map(f => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </Tooltip>

              {/* Font Size */}
              <Tooltip text="Schriftgroesse" placement="bottom">
                <select
                  value={activeFontSize}
                  onChange={e => {
                    if (e.target.value) editor.chain().focus().setFontSize(e.target.value).run()
                    else editor.chain().focus().unsetFontSize().run()
                  }}
                  style={{ ...selectStyle, width: 56 }}
                >
                  <option value="">--</option>
                  {FONT_SIZES.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </Tooltip>

              {/* Line Spacing */}
              <Tooltip text="Zeilenabstand" placement="bottom">
                <select
                  value={activeLineSpacing}
                  onChange={e => {
                    if (e.target.value) editor.chain().focus().setLineSpacing(e.target.value).run()
                    else editor.chain().focus().unsetLineSpacing().run()
                  }}
                  style={{ ...selectStyle, width: 52 }}
                >
                  <option value="">--</option>
                  {LINE_SPACINGS.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </Tooltip>

              <Sep />

              {/* Lists */}
              <ToolbarBtn
                active={editor.isActive('bulletList')}
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                tooltip="Aufzaehlung"
              >
                <List size={13} />
              </ToolbarBtn>
              <ToolbarBtn
                active={editor.isActive('orderedList')}
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                tooltip="Nummerierung"
              >
                <ListOrdered size={13} />
              </ToolbarBtn>

              <Sep />

              {/* Image Upload */}
              <ToolbarBtn
                onClick={() => fileInputRef.current?.click()}
                tooltip="Bild einfuegen"
              >
                <ImageIcon size={13} />
              </ToolbarBtn>

              <div style={{ flex: 1 }} />

              {/* Minimize text bar */}
              <Tooltip text="Textformate minimieren" placement="bottom">
                <button onClick={() => toggleToolbar('textBar')} style={miniBtn}>
                  <ChevronUp size={12} />
                </button>
              </Tooltip>
            </div>
          )}

          {/* ── Collapsed bar indicator ─────────────────────────────────── */}
          {(!toolbarPrefs.formatBar || !toolbarPrefs.textBar) && (
            <div style={{
              display: 'flex', gap: 4, padding: '2px 12px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg-surface)', flexShrink: 0, alignItems: 'center',
              justifyContent: 'flex-end',
            }}>
              {!toolbarPrefs.formatBar && (
                <Tooltip text="Formatleiste einblenden" placement="bottom">
                  <button onClick={() => toggleToolbar('formatBar')} style={{ ...miniBtn, gap: 4, display: 'flex', alignItems: 'center' }}>
                    <ChevronDown size={11} />
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Formate</span>
                  </button>
                </Tooltip>
              )}
              {!toolbarPrefs.textBar && (
                <Tooltip text="Textformate einblenden" placement="bottom">
                  <button onClick={() => toggleToolbar('textBar')} style={{ ...miniBtn, gap: 4, display: 'flex', alignItems: 'center' }}>
                    <ChevronDown size={11} />
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Text</span>
                  </button>
                </Tooltip>
              )}
              <div style={{ flex: 1 }} />
              <Tooltip text={allHidden ? 'Alle Leisten einblenden' : 'Fokus-Modus'} placement="bottom">
                <button onClick={toggleAllToolbars} style={miniBtn}>
                  {allHidden ? <Maximize2 size={11} /> : <Minimize2 size={11} />}
                </button>
              </Tooltip>
            </div>
          )}

          {/* (Fokus toggle is inside each toolbar row via the minimize button) */}
        </>
      )}

      {/* Page area */}
      <div style={{ flex: 1, overflow: 'auto', position: 'relative' }} onWheel={handleScrollWheel}>
        <PageWrapper seitenformat={seitenformat} showShadow={showShadow}>
          <EditorContent
            editor={editor}
            style={{ outline: 'none', minHeight: '100%' }}
            spellCheck={spellcheckMode === 'browser'}
          />
        </PageWrapper>
      </div>

      {/* LanguageTool Popup */}
      {ltPopup && (
        <div
          className="lt-popup"
          style={{ left: ltPopup.x, top: ltPopup.y }}
          onClick={e => e.stopPropagation()}
        >
          <div className="lt-popup-msg">{ltPopup.match.message}</div>
          {ltPopup.match.replacements.length > 0 && (
            <div className="lt-popup-replacements">
              {ltPopup.match.replacements.map((r, i) => (
                <button key={i} className="lt-popup-btn" onClick={() => applyLtReplacement(ltPopup.match, ltPopup.pmFrom, ltPopup.pmTo, r)}>
                  {r}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function ToolbarBtn({ active, onClick, tooltip, children }: {
  active?: boolean; onClick: () => void; tooltip: string; children: React.ReactNode
}) {
  return (
    <Tooltip text={tooltip} placement="bottom" delay={500}>
      <button
        onClick={onClick}
        style={{
          width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1px solid var(--border)', borderRadius: 4,
          background: active ? 'var(--text-primary)' : 'transparent',
          color: active ? 'var(--text-inverse)' : 'var(--text-secondary)',
          cursor: 'pointer', flexShrink: 0,
        }}
      >
        {children}
      </button>
    </Tooltip>
  )
}

function Sep() {
  return <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 2px', flexShrink: 0 }} />
}

const miniBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: 'var(--text-muted)', padding: 2, borderRadius: 4,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}

const selectStyle: React.CSSProperties = {
  fontSize: 11, padding: '2px 4px', borderRadius: 4,
  border: '1px solid var(--border)', background: 'transparent',
  color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit',
  height: 26, maxWidth: 120,
}

function getDefaultContent(hasFormats: boolean, formate: AbsatzFormat[], kategorie: string): any {
  if (hasFormats) {
    const defaultFmt = formate.find(f => f.ist_standard) ?? formate[0]
    return {
      type: 'doc',
      content: [{
        type: 'absatz',
        attrs: { format_id: defaultFmt?.id ?? null, format_name: defaultFmt?.name ?? null },
      }],
    }
  }
  if (kategorie === 'drehbuch') {
    return { type: 'doc', content: [{ type: 'screenplay_element', attrs: { element_type: 'scene_heading' } }] }
  }
  return { type: 'doc', content: [{ type: 'paragraph' }] }
}
