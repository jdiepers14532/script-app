import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCursor from '@tiptap/extension-collaboration-cursor'
import * as Y from 'yjs'
import type { HocuspocusProvider } from '@hocuspocus/provider'
import { useState, useEffect, useRef, useCallback, useMemo, type WheelEvent, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import {
  Info, ChevronDown, ChevronUp,
  Bold as BoldIcon, Italic as ItalicIcon, Underline as UnderlineIcon,
  AlignLeft, AlignCenter, AlignRight,
  List, ListOrdered, ImageIcon, Maximize2, Minimize2, Pin, PinOff,
  Undo2, Redo2, Wand2, Download,
} from 'lucide-react'
import Tooltip from '../Tooltip'
import { useEditor, EditorContent, Extension } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import FontFamily from '@tiptap/extension-font-family'
import Image from '@tiptap/extension-image'
import { ResizableImageExtension } from '../../sw-ui/editor/extensions/ResizableImageExtension'
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
import { useUserPrefs, useFocus, useAppSettings, useTweaks, useSelectedProduction, useToast } from '../../contexts'
// Shortcut labels in tooltips: import { useShortcut } from '../../hooks/useShortcut'
// See src/shortcuts.ts for the registry — add new shortcuts there, use label() in Tooltips
import { LineNumberOverlay } from './LineNumberOverlay'
import { createReplikNumberPlugin, replikNumberPluginKey, REPLIK_NUMBER_CSS, setReplikNumberColor } from '../../tiptap/ReplikNumberPlugin'
import { createRevisionMarginPlugin, REVISION_MARGIN_CSS } from '../../tiptap/RevisionMarginPlugin'
import { PlaceholderChipExtension, PLACEHOLDER_CHIP_CSS } from '../../sw-ui/editor/extensions/PlaceholderChipExtension'
import { ParagraphStyleExtension } from '../../sw-ui/editor/extensions/ParagraphStyleExtension'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'

// ── Inline Ghost Text — ProseMirror Plugin (Modul-Ebene) ─────────────────────
const inlineGhostKey = new PluginKey<{ suffix: string; pos: number }>('inlineGhostText')
const inlineGhostPlugin = new Plugin({
  key: inlineGhostKey,
  state: {
    init: () => ({ suffix: '', pos: 0 }),
    apply(tr, prev) {
      const meta = tr.getMeta(inlineGhostKey)
      if (meta !== undefined) return { suffix: meta.suffix ?? '', pos: meta.pos ?? 0 }
      if (tr.docChanged) return { suffix: '', pos: 0 } // bei Eingabe automatisch löschen
      return prev
    },
  },
  props: {
    decorations(state) {
      const g = inlineGhostKey.getState(state)
      if (!g?.suffix || g.pos === 0) return DecorationSet.empty
      try {
        const widget = Decoration.widget(
          g.pos,
          () => {
            const span = document.createElement('span')
            span.textContent = g.suffix
            span.style.cssText = 'color:var(--text-secondary,#aaa);pointer-events:none;user-select:none;'
            return span
          },
          { side: 1, key: 'inline-ghost' }
        )
        return DecorationSet.create(state.doc, [widget])
      } catch { return DecorationSet.empty }
    },
  },
})
const InlineGhostExtension = Extension.create({
  name: 'inlineGhostText',
  addProseMirrorPlugins() { return [inlineGhostPlugin] },
})

// ── Charakter-Suffix-Parsing (OFF / NT / ONE-WAY / VO) ───────────────────────
const CHAR_SUFFIX_PATTERNS: Array<{ pattern: RegExp; canonical: string }> = [
  { pattern: /(?:^|\s)\(?\s*one[-\s]?way\s*\)?$/i, canonical: '(ONE-WAY)' },
  { pattern: /(?:^|\s)\(?\s*v\.?o\.?\s*\)?$/i, canonical: '(VO)' },
  { pattern: /(?:^|\s)\(?\s*n\.?t\.?\s*\)?$/i, canonical: '(NT)' },
  { pattern: /(?:^|\s)\(?\s*(?:off|o\.s\.?)\s*\)?$/i, canonical: '(OFF)' },
]
function parseSuffix(text: string): { name: string; suffix: string | null } {
  for (const { pattern, canonical } of CHAR_SUFFIX_PATTERNS) {
    if (pattern.test(text)) {
      return { name: text.replace(pattern, '').trim(), suffix: canonical }
    }
  }
  return { name: text, suffix: null }
}

// ── Platform detection ──────────────────────────────────────────────────────
const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent)
const modKey = isMac ? '\u2318' : 'Ctrl'
const altKey = isMac ? '\u2325' : 'Alt'
const shiftKey = 'Shift'

// ── Alignment keyboard shortcuts (Mod+Shift+L/E/R, mirrors MS Word) ─────────
const AlignmentShortcuts = Extension.create({
  name: 'alignmentShortcuts',
  addKeyboardShortcuts() {
    return {
      'Mod-Shift-l': () => this.editor.chain().focus().setTextAlign('left').run(),
      'Mod-Shift-e': () => this.editor.chain().focus().setTextAlign('center').run(),
      'Mod-Shift-r': () => this.editor.chain().focus().setTextAlign('right').run(),
    }
  },
})

// ── Cursor-Anfang/Ende der Szene (Strg+Home / Strg+End) ─────────────────────
const DocumentBoundsShortcuts = Extension.create({
  name: 'documentBoundsShortcuts',
  addKeyboardShortcuts() {
    return {
      'Mod-Home': () => {
        this.editor.commands.setTextSelection(0)
        return true
      },
      'Mod-End': () => {
        this.editor.commands.setTextSelection(this.editor.state.doc.content.size)
        return true
      },
    }
  },
})

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

let replikCssInjected = false
function injectReplikCSS() {
  if (replikCssInjected) return
  replikCssInjected = true
  const style = document.createElement('style')
  style.id = 'replik-css'
  style.textContent = REPLIK_NUMBER_CSS
  document.head.appendChild(style)
}

let revisionCssInjected = false
function injectRevisionCSS() {
  if (revisionCssInjected) return
  revisionCssInjected = true
  const style = document.createElement('style')
  style.id = 'revision-margin-css'
  style.textContent = REVISION_MARGIN_CSS
  document.head.appendChild(style)
}

let chipCssInjected = false
function injectChipCSS() {
  if (chipCssInjected) return
  chipCssInjected = true
  const style = document.createElement('style')
  style.id = 'placeholder-chip-css'
  style.textContent = PLACEHOLDER_CHIP_CSS
  document.head.appendChild(style)
}

const TABLE_CSS = `
/* Paragraph-Margin auf 0 setzen (wie im Vorlagen-Editor), damit spaceAfter die alleinige Abstandskontrolle ist */
.ue-editor .ProseMirror p { margin: 0; }
.ue-editor .ProseMirror table { border-collapse: collapse; width: 100%; margin: 4px 0; }
.ue-editor .ProseMirror td, .ue-editor .ProseMirror th {
  border: 1px solid #d0d0d0; padding: 5px 10px; vertical-align: top;
  min-width: 32px; position: relative; box-sizing: border-box;
}
.ue-editor .ProseMirror th { background: #f5f5f5; font-weight: 600; }
.ue-editor .ProseMirror .selectedCell { background: rgba(0,122,255,0.08) !important; outline: 2px solid #007AFF55; }
.ue-editor .ProseMirror .column-resize-handle {
  position: absolute; right: -2px; top: 0; bottom: 0; width: 6px;
  background: #007AFF88; cursor: col-resize; z-index: 20;
}
.ue-editor .ProseMirror .tableWrapper { overflow-x: auto; }
/* Rahmen ausblenden */
.ue-editor.ue-no-borders .ProseMirror td,
.ue-editor.ue-no-borders .ProseMirror th { border-color: transparent; }
`
let tableCssInjected = false
function injectTableCSS() {
  if (tableCssInjected) return
  tableCssInjected = true
  const style = document.createElement('style')
  style.id = 'ue-table-css'
  style.textContent = TABLE_CSS
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
  suppressLineNumbers?: boolean
  lineNumberMarginCm?: number
  showReplikNumbers?: boolean
  replikOffset?: number
  replikBaseline?: any[] | null
  isLocked?: boolean
  changedBlocks?: Set<number>
  revisionColor?: string | null
  /** Ref that is populated with the active Tiptap editor instance for external reads */
  editorRef?: React.MutableRefObject<any>
  /** Charakternamen aus dem Szenenkopf (Rollen + Komparsen) für Autovervollständigung */
  sceneCharNames?: string[]
  /** Callback wenn Charakter über AC eingefügt wurde — für automatischen Szenenkopf-Eintrag */
  onCharInserted?: (name: string, characterId: string | null, suffix: string | null) => void
  /** ID der aktuellen Szene — wird in Freigabe-Emails als Kontext mitgeschickt */
  szeneId?: string | null
  onMagicOpen?: () => void
  onExportOpen?: () => void
  exportOpen?: boolean
}

// Rollenname aus Großbuchstaben normalisieren (CSS text-transform verhindert korrekte Schreibweise)
const toRollenName = (s: string) =>
  s.toLowerCase().replace(/(?:^|\s)\S/g, c => c.toUpperCase())

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
  suppressLineNumbers = false,
  lineNumberMarginCm = 1,
  showReplikNumbers = false,
  replikOffset = 0,
  replikBaseline = null,
  isLocked = false,
  changedBlocks,
  revisionColor = null,
  editorRef,
  sceneCharNames,
  onCharInserted,
  szeneId,
  onMagicOpen,
  onExportOpen,
  exportOpen = false,
}: UniversalEditorProps) {
  injectScreenplayCSS()
  loadCourierPrime()
  injectLTCSS()
  injectReplikCSS()
  injectChipCSS()
  injectTableCSS()

  const { spellcheck: spellcheckMode } = useUserPrefs()
  const { tweaks } = useTweaks()
  const { selectedId: selectedProdId } = useSelectedProduction()
  const { showToast } = useToast()
  const { lnSettings, pageMargins, replikSettings, suffixSettings, acAlleDeaktiviert, charAcDeaktiviert } = useAppSettings()
  const { focus, hoverOpen, setHoverOpen, toolbarOpen, setToolbarOpen, toolbarPos, setToolbarPos, toolbarOpenedVia, setToolbarOpenedVia } = useFocus()

  // Tabellen-Cursor-Erkennung + Rahmen-Toggle
  const [isInTable, setIsInTable] = useState(false)
  const [tableBorders, setTableBorders] = useState(true)

  // Toolbar pin state: button-open = pinned, click-open = not pinned
  const [toolbarPinned, setToolbarPinned] = useState(false)
  useEffect(() => {
    if (toolbarOpenedVia === 'button') setToolbarPinned(true)
    else if (toolbarOpenedVia === 'click') setToolbarPinned(false)
  }, [toolbarOpenedVia])

  // ── Undo / Redo ─────────────────────────────────────────────────────────────
  const undoManagerRef = useRef<Y.UndoManager | null>(null)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  // Collab mode: Yjs UndoManager (user-specific undo stack)
  useEffect(() => {
    if (!ydoc) { undoManagerRef.current = null; return }
    const fragment = ydoc.getXmlFragment('default')
    const um = new Y.UndoManager(fragment, { captureTimeout: 500 })
    undoManagerRef.current = um
    const update = () => {
      setCanUndo(um.undoStack.length > 0)
      setCanRedo(um.redoStack.length > 0)
    }
    um.on('stack-item-added', update)
    um.on('stack-item-popped', update)
    return () => { um.destroy(); undoManagerRef.current = null }
  }, [ydoc])

  // Auto-close toolbar when NOT pinned and cursor moves > 50px away
  const toolbarRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!toolbarOpen || toolbarPinned) return
    const handler = (e: MouseEvent) => {
      const el = toolbarRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const dx = Math.max(r.left - e.clientX, 0, e.clientX - r.right)
      const dy = Math.max(r.top - e.clientY, 0, e.clientY - r.bottom)
      if (Math.sqrt(dx * dx + dy * dy) > 50) setToolbarOpen(false)
    }
    document.addEventListener('mousemove', handler)
    return () => document.removeEventListener('mousemove', handler)
  }, [toolbarOpen, toolbarPinned, setToolbarOpen])

  // ResizeObserver: track .page element dimensions for focus-mode floating panels
  // --sw-focus-page-w        = page width (used by SceneEditor hover panel + toolbar)
  // --sw-focus-page-vp-left  = page left edge in viewport (SceneEditor panel: position:fixed)
  // --sw-focus-page-cont-left= page left edge within scroll container (hover strip: position:absolute)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return
    const update = () => {
      const page = container.querySelector('.page') as HTMLElement | null
      if (page) {
        const pageRect = page.getBoundingClientRect()
        const contRect = container.getBoundingClientRect()
        document.documentElement.style.setProperty('--sw-focus-page-w', page.offsetWidth + 'px')
        document.documentElement.style.setProperty('--sw-focus-page-vp-left', pageRect.left + 'px')
        document.documentElement.style.setProperty('--sw-focus-page-cont-left', (pageRect.left - contRect.left) + 'px')
      }
    }
    const ro = new ResizeObserver(update)
    ro.observe(container)
    update()
    return () => ro.disconnect()
  }, [])

  // Toolbar width state (null = auto)
  const [toolbarWidth, setToolbarWidth] = useState<number | null>(null)
  const handleToolbarResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = toolbarRef.current?.offsetWidth ?? 420
    const onMove = (ev: MouseEvent) => {
      setToolbarWidth(Math.max(280, startW + (ev.clientX - startX)))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [])

  // Drag state for floating toolbar
  const dragRef = useRef<{ dragging: boolean; offsetX: number; offsetY: number }>({ dragging: false, offsetX: 0, offsetY: 0 })
  const handleToolbarDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragRef.current = { dragging: true, offsetX: e.clientX - toolbarPos.x, offsetY: e.clientY - toolbarPos.y }
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current.dragging) return
      setToolbarPos({ x: ev.clientX - dragRef.current.offsetX, y: ev.clientY - dragRef.current.offsetY })
    }
    const onUp = () => {
      dragRef.current.dragging = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [toolbarPos, setToolbarPos])

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
    (absatzformate ?? []).filter(f =>
      f.kategorie === kategorie ||
      f.kategorie === 'alle' ||
      (f.kategorie === 'sl_db' && (kategorie === 'drehbuch' || kategorie === 'storyline'))
    ),
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

  // ── Charakter-Autovervollständigung ───────────────────────────────────────
  const [acSuggestions, setAcSuggestions] = useState<string[]>([])
  const [acSelectedIndex, setAcSelectedIndex] = useState(0)
  const [acPos, setAcPos] = useState<{ x: number; y: number } | null>(null)
  // Refs für synchronen Zugriff in Keyboard-Handlers
  const acActiveRef = useRef(false)
  const acSuggestionsRef = useRef<string[]>([])
  const acSelectedIndexRef = useRef(0)
  const acNewNameRef = useRef<string | null>(null)
  useEffect(() => { acSuggestionsRef.current = acSuggestions }, [acSuggestions])
  useEffect(() => { acSelectedIndexRef.current = acSelectedIndex }, [acSelectedIndex])

  // "Neu anlegen"-Name wenn kein Treffer in DB
  const [acNewName, setAcNewName] = useState<string | null>(null)
  useEffect(() => { acNewNameRef.current = acNewName }, [acNewName])

  // Dialog-State für Charakter-Anlegen-Bestätigung
  const [newCharDialog, setNewCharDialog] = useState<{ name: string; suffix?: string | null; isKomparse: boolean; loading: boolean } | null>(null)
  // Erkannter Suffix (OFF/NT/ONE-WAY) aus letzter AC-Eingabe — wird beim Einfügen angehängt
  const detectedSuffixRef = useRef<string | null>(null)

  // Debounced DB-Suche für "alle"-Modus (nicht mehr verwendet — durch Cache ersetzt)
  const acDbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cache aller Produktions-Charaktere für "alle"-Modus (max ~40 Einträge, lokal gefiltert)
  const allCharObjsRef = useRef<{ id: string; name: string }[]>([])

  // Sync charAcStyle für Keyboard-Extension (stabile Ref)
  const charAcStyleRef = useRef<'inline' | 'menu'>('menu')
  useEffect(() => { charAcStyleRef.current = tweaks.charAcStyle }, [tweaks.charAcStyle])

  // Inline-Modus: aktueller Vorschlag-Name (zum Einfügen) oder kein-Treffer-Name (für Neu-Anlegen)
  const inlineGhostAcceptNameRef = useRef<string | null>(null)
  const inlineGhostNoMatchNameRef = useRef<string | null>(null)
  const inlineGhostActiveRef = useRef(false)
  // Nach Acceptance: nächstes onUpdate nicht erneut aktivieren (verhindert Tab-Loop nach Suffix-Accept)
  const suppressGhostUpdateRef = useRef(false)

  // IDs der "Character"-Absatzformate
  const charFormatIds = useMemo(
    () => absatzformate.filter(f => f.name.toLowerCase() === 'character').map(f => f.id),
    [absatzformate]
  )
  // IDs der "Action"-Absatzformate
  const actionFormatIds = useMemo(
    () => absatzformate.filter(f => f.name.toLowerCase() === 'action').map(f => f.id),
    [absatzformate]
  )

  // Szenen-Suffix-Memory: speichert den zuletzt benutzten Suffix pro CHARACTER-Name in dieser Szene
  // Map<NAME_UPPER, '(OFF)'|'(NT)'|'(ONE-WAY)'>
  const sceneSuffixMemoryRef = useRef<Map<string, string>>(new Map())

  // Charakter-Cache: alle Produktions-Charaktere laden wenn Produktion wechselt
  useEffect(() => {
    allCharObjsRef.current = []
    if (!selectedProdId || acAlleDeaktiviert || charAcDeaktiviert) return
    fetch(`/api/characters?produktion_id=${selectedProdId}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then((rows: any[]) => { allCharObjsRef.current = rows.map(r => ({ id: String(r.id), name: String(r.name) })) })
      .catch(() => {})
  }, [selectedProdId, tweaks.nurCharAusSzenenkopf, acAlleDeaktiviert, charAcDeaktiviert])

  // Keyboard-Handler via mutable ref (lesen von Refs für frische Werte)
  const acHandlersRef = useRef({
    onArrowUp: () => {},
    onArrowDown: () => {},
    onAccept: () => {},
    onDismiss: () => {},
  })

  // Keyboard-Extension — useMemo mit [] damit die Instanz stabil bleibt
  // addKeyboardShortcuts liest acActiveRef/acHandlersRef zur Laufzeit
  const charAcKeyExtension = useMemo(() => Extension.create({
    name: 'charAcKey',
    addKeyboardShortcuts() {
      return {
        ArrowUp:   () => { if (!acActiveRef.current) return false; acHandlersRef.current.onArrowUp();  return true },
        ArrowDown: () => { if (!acActiveRef.current) return false; acHandlersRef.current.onArrowDown(); return true },
        Tab: () => {
          if (charAcStyleRef.current === 'inline') {
            if (!inlineGhostActiveRef.current) return false
            acHandlersRef.current.onAccept()
            return true
          }
          if (!acActiveRef.current) return false
          acHandlersRef.current.onAccept()
          return true
        },
        Enter: () => {
          if (charAcStyleRef.current === 'inline') {
            if (!inlineGhostActiveRef.current) return false
            acHandlersRef.current.onAccept()
            return true
          }
          if (!acActiveRef.current) return false
          acHandlersRef.current.onAccept()
          return true
        },
        Escape: () => {
          if (charAcStyleRef.current === 'inline') {
            if (!inlineGhostActiveRef.current) return false
            acHandlersRef.current.onDismiss()
            return true
          }
          if (!acActiveRef.current) return false
          acHandlersRef.current.onDismiss()
          return true
        },
      }
    },
  }), []) // eslint-disable-line react-hooks/exhaustive-deps

  const collabExtensions = useMemo(() => ydoc ? [
    Collaboration.configure({ document: ydoc }),
    ...(provider ? [CollaborationCursor.configure({
      provider,
      user: { name: 'Ich', color: '#007AFF' },
    })] : []),
    // Keyboard shortcuts for Yjs-based undo/redo (StarterKit History is disabled in collab mode)
    Extension.create({
      name: 'collabHistory',
      addKeyboardShortcuts() {
        return {
          'Mod-z': () => { undoManagerRef.current?.undo(); return true },
          'Mod-y': () => { undoManagerRef.current?.redo(); return true },
          'Mod-Shift-z': () => { undoManagerRef.current?.redo(); return true },
        }
      },
    }),
  ] : [], [ydoc, provider])

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
      ResizableImageExtension,
      ScreenplayExtension.configure({ formatElements }),
      AbsatzExtension.configure({ formate: relevantFormats }),
      AlignmentShortcuts,
      DocumentBoundsShortcuts,
      AnnotationMark,
      SearchHighlightExtension,
      InlineGhostExtension,
      PlaceholderChipExtension,
      ParagraphStyleExtension,
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
      Placeholder.configure({
        placeholder,
        emptyEditorClass: 'universal-editor-empty',
      }),
      ...collabExtensions,
      // charAcKeyExtension LAST → höchste Priorität für Keyboard-Shortcuts
      charAcKeyExtension,
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
  }, [processedContent, hasAbsatzFormate, kategorie])

  useEffect(() => {
    editor?.setEditable(!readOnly)
  }, [editor, readOnly])

  // Expose editor instance to parent via editorRef (for template apply, snapshot, etc.)
  useEffect(() => {
    if (!editorRef) return
    editorRef.current = editor ?? null
    return () => { editorRef.current = null }
  }, [editor, editorRef])

  // Solo mode: track History state via editor transactions
  useEffect(() => {
    if (!editor || ydoc) return
    const update = () => {
      setCanUndo(editor.can().undo())
      setCanRedo(editor.can().redo())
    }
    editor.on('transaction', update)
    update()
    return () => { editor.off('transaction', update) }
  }, [editor, ydoc])

  // Cursor-Position in Tabelle tracken
  useEffect(() => {
    if (!editor) return
    const update = () => setIsInTable(editor.isActive('tableCell') || editor.isActive('tableHeader'))
    editor.on('selectionUpdate', update)
    editor.on('transaction', update)
    return () => { editor.off('selectionUpdate', update); editor.off('transaction', update) }
  }, [editor])

  // ── Line number settings (used by overlay rendered in PageWrapper) ────────
  // Stabile Ref für suffixSettings (für AC-Closure)
  const suffixSettingsRef = useRef(suffixSettings)
  useEffect(() => { suffixSettingsRef.current = suffixSettings }, [suffixSettings])

  // ── Replik number plugin ──────────────────────────────────────────────────
  useEffect(() => {
    if (!editor) return
    try { editor.unregisterPlugin(replikNumberPluginKey) } catch {}
    if (showReplikNumbers) {
      try { editor.registerPlugin(createReplikNumberPlugin({
        offset: replikOffset,
        baseline: replikBaseline,
        isLocked,
        color: replikSettings.color,
      })) } catch {}
    }
    setReplikNumberColor(editor.view.dom as HTMLElement, replikSettings.color)
    return () => { try { editor.unregisterPlugin(replikNumberPluginKey) } catch {} }
  }, [editor, showReplikNumbers, replikOffset, replikBaseline, isLocked, replikSettings.color])

  // ── Revision margin plugin ────────────────────────────────────────────────
  useEffect(() => {
    if (!editor) return
    try { editor.unregisterPlugin('revisionMargin') } catch {}
    if (changedBlocks?.size && revisionColor) {
      injectRevisionCSS()
      try { editor.registerPlugin(createRevisionMarginPlugin({
        changedBlocks: changedBlocks ?? new Set(),
        revisionColor,
      })) } catch {}
    }
    return () => { try { editor.unregisterPlugin('revisionMargin') } catch {} }
  }, [editor, changedBlocks, revisionColor])

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
  }, [])

  // Overscroll navigation
  const overscrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (overscrollTimer.current) clearTimeout(overscrollTimer.current) }, [])

  const { scrollNavDelay } = useUserPrefs()

  const handleScrollWheel = useCallback((e: WheelEvent<HTMLDivElement>) => {
    const container = scrollContainerRef.current
    if (!container) return
    // scrollContainerRef ist der eigentliche Scroll-Container (overflow:auto)
    // .pw-outer wächst mit dem Content und hat immer scrollTop=0 — NICHT verwenden
    const atBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 2
    const atTop = container.scrollTop <= 0
    if (e.deltaY > 0 && atBottom && onNavigateNext) {
      if (!overscrollTimer.current) {
        overscrollTimer.current = setTimeout(() => { overscrollTimer.current = null; onNavigateNext() }, scrollNavDelay)
      }
    } else if (e.deltaY < 0 && atTop && onNavigatePrev) {
      if (!overscrollTimer.current) {
        overscrollTimer.current = setTimeout(() => { overscrollTimer.current = null; onNavigatePrev() }, scrollNavDelay)
      }
    } else if (overscrollTimer.current) {
      // Timer nur löschen wenn User aktiv von der Grenze weg scrollt (nicht bei deltaY=0)
      if ((e.deltaY > 0 && !atBottom) || (e.deltaY < 0 && !atTop)) {
        clearTimeout(overscrollTimer.current); overscrollTimer.current = null
      }
    }
  }, [onNavigateNext, onNavigatePrev, scrollNavDelay])

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

  // Guard gegen eigene Ghost-Text-Dispatches (verhindert Endlosschleife)
  const dispatchingGhostRef = useRef(false)
  // Flag: AC läuft gerade für eine Action-Zeile (nicht CHARACTER)
  const actionAcModeRef = useRef(false)

  // ── Charakter-AC: State-Tracking (Cursor in Character-Node?) ───────────────
  useEffect(() => {
    if (!editor) return
    const modus = tweaks.nurCharAusSzenenkopf
    const style = charAcStyleRef.current
    const noFormats = charFormatIds.length === 0

    // Nur die ProseMirror-Dekoration löschen — Refs NICHT anfassen
    const clearGhostDecoration = () => {
      if (dispatchingGhostRef.current) return
      const cur = inlineGhostKey.getState(editor.state)
      if (cur?.suffix) {
        dispatchingGhostRef.current = true
        editor.view.dispatch(editor.state.tr.setMeta(inlineGhostKey, { suffix: '', pos: 0 }))
        dispatchingGhostRef.current = false
      }
    }

    // Alle Inline-Refs + Dekoration zurücksetzen (bei dismiss / Cursor weg)
    const resetInline = () => {
      inlineGhostAcceptNameRef.current = null
      inlineGhostNoMatchNameRef.current = null
      inlineGhostActiveRef.current = false
      clearGhostDecoration()
    }

    const setGhost = (suffix: string, pos: number) => {
      if (dispatchingGhostRef.current) return
      const cur = inlineGhostKey.getState(editor.state)
      if (cur?.suffix === suffix && cur?.pos === pos) return
      dispatchingGhostRef.current = true
      editor.view.dispatch(editor.state.tr.setMeta(inlineGhostKey, { suffix, pos }))
      dispatchingGhostRef.current = false
    }

    const dismiss = () => {
      if (acActiveRef.current) {
        acActiveRef.current = false
        setAcSuggestions([])
        setAcNewName(null)
        setAcPos(null)
      }
      resetInline()
    }

    if (acAlleDeaktiviert || charAcDeaktiviert || noFormats) { dismiss(); return }

    const update = () => {
      if (dispatchingGhostRef.current) return // Ghost-Dispatch — ignorieren
      const { state, view } = editor
      const { $from } = state.selection
      const node = $from.node()
      const isCharNode = node.type.name === 'absatz' && charFormatIds.includes(node.attrs.format_id)

      if (!isCharNode) {
        // Action-AC: Großbuchstaben-Wort in Action-Zeilen?
        const ss2 = suffixSettingsRef.current
        const isActionNode = ss2.action_ac_enabled
          && !ss2.ac_alle_deaktiviert
          && node.type.name === 'absatz'
          && actionFormatIds.includes(node.attrs.format_id)
        if (!isActionNode) { actionAcModeRef.current = false; dismiss(); return }

        const nodeStart2 = $from.start()
        const cursorOffset2 = $from.pos - nodeStart2
        const textBefore2 = node.textContent.slice(0, cursorOffset2)
        const capsMatch = textBefore2.match(/[A-ZÄÖÜ]+$/)
        if (!capsMatch || capsMatch[0].length < ss2.action_ac_trigger_chars) {
          actionAcModeRef.current = false; dismiss(); return
        }

        actionAcModeRef.current = true
        detectedSuffixRef.current = null
        const actionQueryUpper = capsMatch[0]
        const actionPool: string[] = modus === 'szenenkopf'
          ? (sceneCharNames ?? [])
          : allCharObjsRef.current.map(o => o.name)
        const actionCoords = view.coordsAtPos($from.pos)

        if (style === 'inline') {
          const bestMatch2 = actionPool.find(n => n.toUpperCase().startsWith(actionQueryUpper))
          if (bestMatch2) {
            const restUpper = bestMatch2.toUpperCase().slice(actionQueryUpper.length)
            inlineGhostAcceptNameRef.current = bestMatch2
            inlineGhostNoMatchNameRef.current = null
            inlineGhostActiveRef.current = restUpper.length > 0
            setGhost(restUpper, $from.pos)
          } else {
            inlineGhostAcceptNameRef.current = null
            inlineGhostNoMatchNameRef.current = modus === 'alle' ? toRollenName(actionQueryUpper) : null
            inlineGhostActiveRef.current = modus === 'alle'
            clearGhostDecoration()
          }
        } else {
          clearGhostDecoration()
          acActiveRef.current = true
          const filtered2 = actionPool.filter(n => n.toUpperCase().startsWith(actionQueryUpper)).slice(0, 9)
          if (filtered2.length === 0 && modus !== 'alle') { actionAcModeRef.current = false; dismiss(); return }
          setAcSuggestions(filtered2)
          const exactMatch2 = filtered2.some(n => n.toUpperCase() === actionQueryUpper)
          setAcNewName(modus === 'alle' && !exactMatch2 ? toRollenName(actionQueryUpper) : null)
          setAcSelectedIndex(0)
          setAcPos({ x: actionCoords.left, y: actionCoords.top })
        }
        return
      }

      actionAcModeRef.current = false
      const query = node.textContent
      // Suffix erkennen (OFF / NT / ONE-WAY / VO) — Suche läuft auf dem bereinigten Namen
      const { name: queryClean, suffix: rawSuffix } = parseSuffix(query.trim())
      const ss = suffixSettingsRef.current
      const querySuffix = rawSuffix === '(OFF)' && !ss.suffix_off_enabled ? null
        : rawSuffix === '(NT)' && !ss.suffix_nt_enabled ? null
        : rawSuffix === '(ONE-WAY)' && !ss.suffix_oneway_enabled ? null
        : rawSuffix === '(VO)' && !ss.suffix_vo_enabled ? null
        : rawSuffix
      const queryUpper = queryClean.toUpperCase()
      // Memory-Suffix: letzter bekannter Suffix dieser Figur in der aktuellen Szene
      const memorySuffix = !querySuffix
        ? (sceneSuffixMemoryRef.current.get(queryUpper) ?? null)
        : null
      const effectiveSuffix = querySuffix ?? memorySuffix
      detectedSuffixRef.current = effectiveSuffix
      const coords = view.coordsAtPos($from.pos)
      const nodeEndPos = $from.end()

      // Welcher Namens-Pool?
      const pool: string[] =
        modus === 'szenenkopf'
          ? (sceneCharNames ?? [])
          : allCharObjsRef.current.map(o => o.name)

      if (style === 'inline') {
        // ── Inline Ghost Text ─────────────────────────────────────────────
        if (!queryClean) { resetInline(); return }

        // Nach einer Acceptance den direkt folgenden onUpdate ignorieren,
        // damit Tab nach dem Normalisieren (z.B. "SIMON OFF" → "SIMON (OFF)")
        // wieder normal zur nächsten Zeile springt
        if (suppressGhostUpdateRef.current) {
          suppressGhostUpdateRef.current = false
          resetInline()
          return
        }

        // Bester Treffer: startsWith, alphabetisch erster Treffer
        const bestMatch = pool.find(n => n.toUpperCase().startsWith(queryUpper))

        if (bestMatch) {
          const ghostSuffix = bestMatch.slice(queryClean.length) // Name-Vervollständigung
          inlineGhostAcceptNameRef.current = bestMatch
          inlineGhostNoMatchNameRef.current = null
          // Aktiv wenn Ghost-Text sichtbar ODER Suffix bekannt (explizit oder aus Memory)
          inlineGhostActiveRef.current = ghostSuffix.length > 0 || !!effectiveSuffix
          setGhost(ghostSuffix, nodeEndPos)
        } else {
          // Kein Treffer — Neu anlegen (nur im "alle"-Modus)
          inlineGhostAcceptNameRef.current = null
          inlineGhostNoMatchNameRef.current = modus === 'alle' ? toRollenName(queryClean) : null
          inlineGhostActiveRef.current = modus === 'alle' && queryClean.length > 0
          clearGhostDecoration()
        }
      } else {
        // ── Dropdown-Menü ─────────────────────────────────────────────────
        clearGhostDecoration()
        acActiveRef.current = true

        if (modus === 'szenenkopf') {
          const filtered = pool.filter(n =>
            !queryClean || n.toUpperCase().startsWith(queryUpper)
          ).slice(0, 8)

          if (filtered.length === 0) { dismiss(); return }

          setAcSuggestions(filtered)
          acNewNameRef.current = null
          setAcNewName(null)
          setAcSelectedIndex(0)
          setAcPos({ x: coords.left, y: coords.top })
        } else {
          // Alle — lokaler Cache, includes-Suche, «Neu anlegen» als erster Eintrag
          const filtered = queryClean
            ? pool.filter(n => n.toUpperCase().includes(queryUpper)).slice(0, 9)
            : pool.slice(0, 10)

          // Neu-anlegen nur wenn kein exakter Treffer vorhanden
          const exactMatch = filtered.some(n => n.toUpperCase() === queryUpper)
          const newName = queryClean && !exactMatch ? toRollenName(queryClean) : null
          acNewNameRef.current = newName
          setAcNewName(newName)

          if (filtered.length === 0 && !newName) { dismiss(); return }

          setAcSuggestions(filtered)
          setAcSelectedIndex(0)
          setAcPos({ x: coords.left, y: coords.top })
        }
      }
    }

    editor.on('selectionUpdate', update)
    editor.on('update', update)
    return () => {
      editor.off('selectionUpdate', update)
      editor.off('update', update)
      acActiveRef.current = false
      inlineGhostActiveRef.current = false
    }
  }, [editor, tweaks.nurCharAusSzenenkopf, tweaks.charAcStyle, sceneCharNames, charFormatIds, actionFormatIds, acAlleDeaktiviert, charAcDeaktiviert]) // eslint-disable-line react-hooks/exhaustive-deps

  // Suffix-Memory aufbauen: bei jeder Dokument-Änderung alle CHARACTER-Nodes scannen
  useEffect(() => {
    if (!editor || charFormatIds.length === 0) return
    const rebuildSuffixMemory = () => {
      const memory = new Map<string, string>()
      editor.state.doc.descendants((node: any) => {
        if (node.type.name === 'absatz' && charFormatIds.includes(node.attrs.format_id)) {
          const { name, suffix } = parseSuffix(node.textContent ?? '')
          const key = name.trim().toUpperCase()
          if (key && suffix) memory.set(key, suffix)
        }
      })
      sceneSuffixMemoryRef.current = memory
    }
    editor.on('update', rebuildSuffixMemory)
    rebuildSuffixMemory() // initialer Scan
    return () => { editor.off('update', rebuildSuffixMemory) }
  }, [editor, charFormatIds])

  // ── Charakter-AC: Handler-Ref aktuell halten ────────────────────────────────
  const onCharInsertedRef = useRef(onCharInserted)
  onCharInsertedRef.current = onCharInserted

  const insertNameIntoEditor = useCallback((name: string, suffix?: string | null) => {
    if (!editor) return
    const { $from } = editor.state.selection
    if ($from.node().type.name !== 'absatz') return
    const start = $from.start()
    const end = $from.end()
    const fullText = suffix ? `${name} ${suffix}` : name
    const chain = editor.chain().focus()
    if (start < end) {
      chain.deleteRange({ from: start, to: end }).insertContentAt(start, fullText).run()
    } else {
      chain.insertContentAt(start, fullText).run()
    }
  }, [editor])

  // Wrapper: Charakter einfügen + Szenenkopf-Callback auslösen
  const acceptCharIntoEditor = useCallback((name: string, sfx: string | null) => {
    const charId = allCharObjsRef.current.find(o => o.name.toUpperCase() === name.toUpperCase())?.id ?? null
    insertNameIntoEditor(name, sfx)
    onCharInsertedRef.current?.(name, charId, sfx)
  }, [insertNameIntoEditor])

  // Action-AC: ersetzt das getippte CAPS-Wort durch den akzeptierten Namen
  const acceptActionCharIntoEditor = useCallback((name: string) => {
    if (!editor) return
    const { $from } = editor.state.selection
    const node = $from.node()
    if (node.type.name !== 'absatz') return
    const nodeStart = $from.start()
    const cursorOffset = $from.pos - nodeStart
    const textBefore = node.textContent.slice(0, cursorOffset)
    const match = textBefore.match(/[A-ZÄÖÜ]+$/)
    if (!match) return
    const wordStart = nodeStart + cursorOffset - match[0].length
    const wordEnd = nodeStart + cursorOffset
    const insertName = suffixSettingsRef.current.action_auto_caps ? name.toUpperCase() : name
    const charId = allCharObjsRef.current.find(o => o.name.toUpperCase() === name.toUpperCase())?.id ?? null
    editor.chain().focus().deleteRange({ from: wordStart, to: wordEnd }).insertContentAt(wordStart, insertName).run()
    onCharInsertedRef.current?.(name, charId, null)
  }, [editor])
  const acceptActionCharIntoEditorRef = useRef(acceptActionCharIntoEditor)
  useEffect(() => { acceptActionCharIntoEditorRef.current = acceptActionCharIntoEditor }, [acceptActionCharIntoEditor])

  useEffect(() => {
    acHandlersRef.current = {
      onArrowUp: () => setAcSelectedIndex(prev => Math.max(0, prev - 1)),
      onArrowDown: () => {
        const maxIdx = acSuggestionsRef.current.length - 1 + (acNewNameRef.current ? 1 : 0)
        setAcSelectedIndex(prev => Math.min(Math.max(maxIdx, 0), prev + 1))
      },
      onAccept: () => {
        // ── Action-AC-Modus ────────────────────────────────────────────
        if (actionAcModeRef.current) {
          if (charAcStyleRef.current === 'inline') {
            const acceptName = inlineGhostAcceptNameRef.current
            const noMatchName = inlineGhostNoMatchNameRef.current
            inlineGhostActiveRef.current = false
            inlineGhostAcceptNameRef.current = null
            inlineGhostNoMatchNameRef.current = null
            if (editor) {
              dispatchingGhostRef.current = true
              editor.view.dispatch(editor.state.tr.setMeta(inlineGhostKey, { suffix: '', pos: 0 }))
              dispatchingGhostRef.current = false
            }
            if (acceptName) {
              acceptActionCharIntoEditorRef.current(acceptName)
            } else if (noMatchName) {
              setNewCharDialog({ name: noMatchName, suffix: null, isKomparse: false, loading: false })
            }
            return
          }
          const suggestions = acSuggestionsRef.current
          const idx = acSelectedIndexRef.current
          const newName = acNewNameRef.current
          if (idx === 0 && newName) {
            acActiveRef.current = false
            setAcSuggestions([])
            setAcNewName(null)
            setAcPos(null)
            setNewCharDialog({ name: newName, suffix: null, isKomparse: false, loading: false })
            return
          }
          const suggestionIdx2 = newName ? idx - 1 : idx
          const actionName = suggestions[suggestionIdx2]
          if (!actionName) return
          acceptActionCharIntoEditorRef.current(actionName)
          acActiveRef.current = false
          setAcSuggestions([])
          setAcNewName(null)
          setAcPos(null)
          return
        }
        if (charAcStyleRef.current === 'inline') {
          // ── Inline-Modus ──────────────────────────────────────────────
          const acceptName = inlineGhostAcceptNameRef.current
          const noMatchName = inlineGhostNoMatchNameRef.current
          inlineGhostActiveRef.current = false
          inlineGhostAcceptNameRef.current = null
          inlineGhostNoMatchNameRef.current = null
          if (editor) {
            dispatchingGhostRef.current = true
            editor.view.dispatch(editor.state.tr.setMeta(inlineGhostKey, { suffix: '', pos: 0 }))
            dispatchingGhostRef.current = false
          }
          if (acceptName) {
            suppressGhostUpdateRef.current = true
            const sfx = detectedSuffixRef.current
            detectedSuffixRef.current = null
            acceptCharIntoEditor(acceptName, sfx)
          } else if (noMatchName) {
            setNewCharDialog({ name: noMatchName, suffix: detectedSuffixRef.current, isKomparse: false, loading: false })
            detectedSuffixRef.current = null
          }
          return
        }
        // ── Dropdown-Menü-Modus ────────────────────────────────────────
        const suggestions = acSuggestionsRef.current
        const idx = acSelectedIndexRef.current
        const newName = acNewNameRef.current
        // Index 0 mit newName = "Neu anlegen" (erste Position)
        if (idx === 0 && newName) {
          acActiveRef.current = false
          setAcSuggestions([])
          setAcNewName(null)
          setAcPos(null)
          setNewCharDialog({ name: newName, suffix: detectedSuffixRef.current, isKomparse: false, loading: false })
          detectedSuffixRef.current = null
          return
        }
        // Suggestion-Index: wenn newName vorhanden, verschieben um 1
        const suggestionIdx = newName ? idx - 1 : idx
        const name = suggestions[suggestionIdx]
        if (!name) return
        const sfx = detectedSuffixRef.current
        detectedSuffixRef.current = null
        acceptCharIntoEditor(name, sfx)
        acActiveRef.current = false
        setAcSuggestions([])
        setAcNewName(null)
        setAcPos(null)
      },
      onDismiss: () => {
        if (charAcStyleRef.current === 'inline') {
          inlineGhostActiveRef.current = false
          inlineGhostAcceptNameRef.current = null
          inlineGhostNoMatchNameRef.current = null
          if (editor) {
            dispatchingGhostRef.current = true
            editor.view.dispatch(editor.state.tr.setMeta(inlineGhostKey, { suffix: '', pos: 0 }))
            dispatchingGhostRef.current = false
          }
        } else {
          acActiveRef.current = false
          setAcSuggestions([])
          setAcNewName(null)
          setAcPos(null)
        }
      },
    }
  }, [editor, insertNameIntoEditor, acSuggestions, acSelectedIndex]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Charakter anlegen + Freigabe-Anfrage stellen
  const handleCreateChar = async (name: string) => {
    if (!selectedProdId) return
    setNewCharDialog(prev => prev ? { ...prev, loading: true } : null)
    try {
      const createRes = await fetch('/api/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, produktion_id: selectedProdId, is_komparse: newCharDialog?.isKomparse ?? false }),
      })
      if (!createRes.ok) {
        const err = await createRes.json()
        showToast(err.error || 'Charakter konnte nicht angelegt werden', 'error')
        setNewCharDialog(null)
        return
      }
      const char = await createRes.json()

      // Freigabe-Anfrage versuchen (optional — ignoriere Fehler wenn nicht konfiguriert)
      let freigabeGestartet = false
      try {
        const fRes = await fetch(`/api/rollen-freigabe/${selectedProdId}/anfragen`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ character_id: char.id, szene_id: szeneId ?? undefined }),
        })
        if (fRes.ok) {
          const fData = await fRes.json()
          freigabeGestartet = fData.status === 'ausstehend'
        }
      } catch { /* Freigabe nicht konfiguriert — ignorieren */ }

      // Name + ggf. Suffix in Editor einfügen
      const sfx = newCharDialog?.suffix ?? null
      const fullInsertName = sfx ? `${name} ${sfx}` : name
      const { $from } = editor.state.selection
      const start = $from.start()
      const end = $from.end()
      const chain = editor.chain().focus()
      if (start < end) {
        chain.deleteRange({ from: start, to: end }).insertContentAt(start, fullInsertName).run()
      } else {
        chain.insertContentAt(start, fullInsertName).run()
      }

      // Cache aktualisieren + Szenenkopf-Callback mit bekannter ID
      allCharObjsRef.current = [...allCharObjsRef.current, { id: String(char.id), name }]
      onCharInsertedRef.current?.(name, String(char.id), sfx)

      showToast(
        freigabeGestartet
          ? `${name} wurde angelegt. Freigabe-Anfrage gesendet.`
          : `${name} wurde angelegt.`,
        'success'
      )
      setNewCharDialog(null)
    } catch {
      showToast('Fehler beim Anlegen des Charakters', 'error')
      setNewCharDialog(null)
    }
  }

  // Direkte AC-Accept-Funktion für Klick im Dropdown (nach editor-Guard)
  // i=0 mit acNewName = "Neu anlegen" (erste Position), i=1..n = Suggestions[0..n-1]
  const acceptAcByIndex = (i: number) => {
    if (i === 0 && acNewName) {
      // Klick auf "Neu anlegen" (erster Eintrag)
      acActiveRef.current = false
      setAcSuggestions([])
      setAcNewName(null)
      setAcPos(null)
      setNewCharDialog({ name: acNewName, suffix: detectedSuffixRef.current, isKomparse: false, loading: false })
      detectedSuffixRef.current = null
      return
    }
    // Suggestions sind um 1 verschoben wenn acNewName vorhanden
    const suggestionIdx = acNewName ? i - 1 : i
    const name = acSuggestions[suggestionIdx]
    if (!name) return
    if (actionAcModeRef.current) {
      acceptActionCharIntoEditorRef.current(name)
    } else {
      const sfx = detectedSuffixRef.current
      detectedSuffixRef.current = null
      acceptCharIntoEditor(name, sfx)
    }
    acActiveRef.current = false
    setAcSuggestions([])
    setAcNewName(null)
    setAcPos(null)
  }

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
    <div className={`ue-editor${tableBorders ? '' : ' ue-no-borders'}`} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
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
        <div
          ref={toolbarRef}
          className="universal-editor-toolbar"
          style={focus && toolbarOpen ? {
            position: 'fixed', left: toolbarPos.x, top: toolbarPos.y,
            ...(toolbarWidth !== null ? { width: toolbarWidth } : {}),
          } : undefined}
        >
          {/* Drag header — only visible in focus mode toolbar */}
          {focus && toolbarOpen && (
            <div
              onMouseDown={handleToolbarDragStart}
              style={{
                display: 'flex', alignItems: 'center', padding: '4px 8px 4px 10px',
                borderBottom: '1px solid #3a3a3c', cursor: 'grab', userSelect: 'none', flexShrink: 0,
              }}
            >
              <span style={{ flex: 1, fontSize: 10, color: '#6e6e73', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Werkzeuge</span>
              <Tooltip text={toolbarPinned ? 'Lösen — schließt bei Mausverlassen' : 'Anheften — bleibt geöffnet'}>
                <button
                  onClick={(e) => { e.stopPropagation(); setToolbarPinned(p => !p) }}
                  onMouseDown={(e) => e.stopPropagation()}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: toolbarPinned ? '#30d158' : '#6e6e73', padding: '2px 4px', display: 'flex', alignItems: 'center', lineHeight: 1 }}
                >
                  {toolbarPinned ? <Pin size={12} /> : <PinOff size={12} />}
                </button>
              </Tooltip>
            </div>
          )}
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
                        {type === 'scene_heading' ? 'TXT' : type === 'parenthetical' ? 'PAR' : type.slice(0, 4).toUpperCase()}
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
              {/* Undo / Redo */}
              <ToolbarBtn
                disabled={!canUndo}
                onClick={() => ydoc ? undoManagerRef.current?.undo() : editor.chain().focus().undo().run()}
                tooltip={`Rückgängig (${modKey}+Z)`}
              >
                <Undo2 size={13} />
              </ToolbarBtn>
              <ToolbarBtn
                disabled={!canRedo}
                onClick={() => ydoc ? undoManagerRef.current?.redo() : editor.chain().focus().redo().run()}
                tooltip={`Wiederholen (${modKey}+Y)`}
              >
                <Redo2 size={13} />
              </ToolbarBtn>

              <Sep />

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
                tooltip={`Linksbuendig (${modKey}+${shiftKey}+L)`}
              >
                <AlignLeft size={13} />
              </ToolbarBtn>
              <ToolbarBtn
                active={editor.isActive({ textAlign: 'center' })}
                onClick={() => editor.chain().focus().setTextAlign('center').run()}
                tooltip={`Zentriert (${modKey}+${shiftKey}+E)`}
              >
                <AlignCenter size={13} />
              </ToolbarBtn>
              <ToolbarBtn
                active={editor.isActive({ textAlign: 'right' })}
                onClick={() => editor.chain().focus().setTextAlign('right').run()}
                tooltip={`Rechtsbuendig (${modKey}+${shiftKey}+R)`}
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

              {onMagicOpen && (
                <ToolbarBtn onClick={onMagicOpen} tooltip={"Magic-Funktionen\nCtrl+M"}>
                  <Wand2 size={13} style={{ color: '#AF52DE' }} />
                </ToolbarBtn>
              )}

              {onExportOpen && (
                <ToolbarBtn
                  onClick={onExportOpen}
                  tooltip="Exportieren (PDF, DOCX, Fountain, FDX)"
                  active={exportOpen}
                >
                  <Download size={13} />
                </ToolbarBtn>
              )}

              <div style={{ flex: 1 }} />

              {/* Minimize text bar */}
              <Tooltip text="Textformate minimieren" placement="bottom">
                <button onClick={() => toggleToolbar('textBar')} style={miniBtn}>
                  <ChevronUp size={12} />
                </button>
              </Tooltip>
            </div>
          )}

          {/* ── Row 3: Tabellen-Toolbar (kontextsensitiv) ───────────────── */}
          {isInTable && editor && (
            <div style={{
              display: 'flex', gap: 2, padding: '3px 8px', flexShrink: 0, alignItems: 'center',
              borderBottom: '1px solid var(--border)', background: '#FFF8E1', flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: 10, color: '#999', marginRight: 4, whiteSpace: 'nowrap' }}>Tabelle</span>
              <Tooltip text="Zeile oberhalb einfügen"><button onMouseDown={e => { e.preventDefault(); editor.chain().focus().addRowBefore().run() }} style={tblBtn}>↑ Z</button></Tooltip>
              <Tooltip text="Zeile unterhalb einfügen"><button onMouseDown={e => { e.preventDefault(); editor.chain().focus().addRowAfter().run() }} style={tblBtn}>↓ Z</button></Tooltip>
              <Tooltip text="Zeile löschen"><button onMouseDown={e => { e.preventDefault(); editor.chain().focus().deleteRow().run() }} style={{ ...tblBtn, color: '#FF3B30' }}>✕ Z</button></Tooltip>
              <div style={{ width: 1, height: 14, background: 'var(--border)', margin: '0 2px' }} />
              <Tooltip text="Spalte links einfügen"><button onMouseDown={e => { e.preventDefault(); editor.chain().focus().addColumnBefore().run() }} style={tblBtn}>← S</button></Tooltip>
              <Tooltip text="Spalte rechts einfügen"><button onMouseDown={e => { e.preventDefault(); editor.chain().focus().addColumnAfter().run() }} style={tblBtn}>→ S</button></Tooltip>
              <Tooltip text="Spalte löschen"><button onMouseDown={e => { e.preventDefault(); editor.chain().focus().deleteColumn().run() }} style={{ ...tblBtn, color: '#FF3B30' }}>✕ S</button></Tooltip>
              <div style={{ width: 1, height: 14, background: 'var(--border)', margin: '0 2px' }} />
              <Tooltip text="Tabelle löschen"><button onMouseDown={e => { e.preventDefault(); editor.chain().focus().deleteTable().run() }} style={{ ...tblBtn, color: '#FF3B30' }}>Tabelle ✕</button></Tooltip>
              <div style={{ flex: 1 }} />
              <Tooltip text={tableBorders ? 'Rahmen ausblenden' : 'Rahmen einblenden'}>
                <button onMouseDown={e => { e.preventDefault(); setTableBorders(v => !v) }} style={{ ...tblBtn, background: tableBorders ? '#E0C97A' : 'none', fontWeight: 600 }}>
                  {tableBorders ? '⊞ Rahmen' : '⊡ Rahmen'}
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

          {/* Custom right-edge resize handle — active on full height of right border */}
          {focus && toolbarOpen && (
            <div
              onMouseDown={handleToolbarResizeStart}
              style={{
                position: 'absolute', top: 0, right: 0, bottom: 0, width: 6,
                cursor: 'ew-resize',
              }}
            />
          )}
        </div>
      )}

      {/* Page area */}
      <div
        ref={scrollContainerRef}
        style={{ flex: 1, overflow: 'auto', position: 'relative', scrollPaddingBottom: '180px' }}
        onWheelCapture={handleScrollWheel}
        onClick={e => {
          if (focus && e.altKey) {
            e.preventDefault()
            setToolbarPos({ x: e.clientX, y: e.clientY })
            setToolbarOpenedVia('click')
            setToolbarOpen(true)
            return
          }
          if (editor && !readOnly) {
            const target = e.target as HTMLElement
            const proseMirrorEl = scrollContainerRef.current?.querySelector('.ProseMirror')
            if (proseMirrorEl && !proseMirrorEl.contains(target)) {
              // Click in page margin/padding — clamp coords into editor and use posAtCoords
              const pmRect = proseMirrorEl.getBoundingClientRect()
              const cx = Math.max(pmRect.left + 1, Math.min(pmRect.right - 1, e.clientX))
              const cy = Math.max(pmRect.top + 1, Math.min(pmRect.bottom - 1, e.clientY))
              const pos = editor.view.posAtCoords({ left: cx, top: cy })
              if (pos != null) {
                try {
                  const $pos = editor.state.doc.resolve(pos.pos)
                  if ($pos.parent.inlineContent) {
                    editor.commands.setTextSelection(pos.pos)
                  } else {
                    editor.commands.focus('end')
                    return
                  }
                } catch {
                  editor.commands.focus('end')
                  return
                }
                editor.commands.focus()
              } else {
                editor.commands.focus('end')
              }
            }
          }
        }}
      >
        {/* Focus mode: hover strip at top of canvas triggers SceneEditor panel */}
        <div
          className="focus-hover-strip"
          onMouseEnter={() => { if (focus) setHoverOpen(true) }}
          onMouseLeave={() => { if (focus) setHoverOpen(false) }}
          onTouchStart={() => { if (focus) setHoverOpen(!hoverOpen) }}
        />
        <PageWrapper className={kategorie === 'drehbuch' ? 'page' : 'page page-notiz'} seitenformat={seitenformat} showShadow={showShadow} pageMargins={pageMargins}>
          <EditorContent
            editor={editor}
            style={{ outline: 'none', minHeight: '100%' }}
            spellCheck={spellcheckMode === 'browser'}
          />
          <LineNumberOverlay
            show={showLineNumbers && !suppressLineNumbers}
            marginCm={lineNumberMarginCm}
            fontFamily={lnSettings.fontFamily}
            fontSizePt={lnSettings.fontSizePt}
            color={lnSettings.color}
          />
        </PageWrapper>
      </div>

      {/* Charakter-Autovervollständigung Dropdown — öffnet nach oben */}
      {acPos && (acSuggestions.length > 0 || acNewName) && createPortal(
        <div
          style={{
            position: 'fixed',
            left: acPos.x,
            bottom: window.innerHeight - acPos.y + 4,
            zIndex: 99990,
            background: 'var(--bg-surface, #fff)',
            border: '1px solid var(--border, #ddd)',
            borderRadius: 8,
            boxShadow: '0 -4px 24px rgba(0,0,0,0.18)',
            minWidth: 180,
            maxWidth: 300,
            fontSize: 12,
          }}
          onMouseDown={e => e.preventDefault()}
        >
          {/* Scrollbarer Bereich — max. 4 Einträge à ~32px sichtbar */}
          <div style={{ maxHeight: 128, overflowY: 'auto' }}>
            {/* "Neu anlegen" als erster Eintrag (Index 0) */}
            {acNewName && (
              <div
                onClick={() => acceptAcByIndex(0)}
                onMouseEnter={() => setAcSelectedIndex(0)}
                style={{
                  padding: '7px 12px',
                  background: acSelectedIndex === 0 ? '#007AFF' : 'transparent',
                  color: acSelectedIndex === 0 ? '#fff' : 'var(--text-primary, #111)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  borderBottom: acSuggestions.length > 0 ? '1px solid var(--border-subtle, #eee)' : undefined,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600 }}>+</span>
                <span style={{ fontFamily: "'Courier Prime', monospace", letterSpacing: '0.03em' }}>
                  «{acNewName}» anlegen
                </span>
              </div>
            )}
            {/* Bestehende Treffer — Index beginnt bei 1 wenn acNewName vorhanden */}
            {acSuggestions.map((name, i) => {
              const displayIdx = acNewName ? i + 1 : i
              return (
                <div
                  key={name}
                  onClick={() => acceptAcByIndex(displayIdx)}
                  onMouseEnter={() => setAcSelectedIndex(displayIdx)}
                  style={{
                    padding: '7px 12px',
                    background: displayIdx === acSelectedIndex ? '#007AFF' : 'transparent',
                    color: displayIdx === acSelectedIndex ? '#fff' : 'var(--text-primary, #111)',
                    cursor: 'pointer',
                    fontFamily: "'Courier Prime', monospace",
                    letterSpacing: '0.03em',
                  }}
                >
                  {name}
                </div>
              )
            })}
          </div>
          <div style={{ padding: '4px 12px', borderTop: '1px solid var(--border-subtle, #eee)', fontSize: 10, color: 'var(--text-muted, #999)' }}>
            ↑↓ navigieren · Tab/Enter übernehmen · Esc schließen
          </div>
        </div>,
        document.body
      )}

      {/* Neuen Charakter anlegen — Bestätigungsdialog */}
      {newCharDialog && createPortal(
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => { if (!newCharDialog.loading) setNewCharDialog(null) }}
        >
          <div
            style={{ background: 'var(--bg-surface, #fff)', borderRadius: 12, padding: '24px 28px', minWidth: 320, maxWidth: 440, boxShadow: '0 16px 48px rgba(0,0,0,0.3)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>Neuen Charakter anlegen?</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              <strong>{newCharDialog.name}</strong> existiert noch nicht in der Rollendatenbank.
              Soll der Charakter angelegt und eine Freigabe-Anfrage gesendet werden?
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={newCharDialog.isKomparse}
                disabled={newCharDialog.loading}
                onChange={e => setNewCharDialog(prev => prev ? { ...prev, isKomparse: e.target.checked } : null)}
              />
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>Ist Komparse</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  Komparsen erhalten eine Komparsen-Nummer statt einer Rollen-Nummer.
                </div>
              </div>
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setNewCharDialog(null)}
                disabled={newCharDialog.loading}
                style={{ padding: '8px 16px', border: '1px solid var(--border)', borderRadius: 8, background: 'transparent', cursor: 'pointer', fontSize: 13 }}
              >
                Abbrechen
              </button>
              <button
                onClick={() => handleCreateChar(newCharDialog.name)}
                disabled={newCharDialog.loading}
                style={{ padding: '8px 16px', border: 'none', borderRadius: 8, background: '#007AFF', color: '#fff', cursor: newCharDialog.loading ? 'wait' : 'pointer', fontSize: 13, fontWeight: 500 }}
              >
                {newCharDialog.loading ? 'Wird angelegt…' : 'Anlegen & Freigabe anfragen'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

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

function ToolbarBtn({ active, disabled, onClick, tooltip, children }: {
  active?: boolean; disabled?: boolean; onClick: () => void; tooltip: string; children: React.ReactNode
}) {
  return (
    <Tooltip text={tooltip} placement="bottom" delay={500}>
      <button
        onClick={onClick}
        disabled={disabled}
        style={{
          width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1px solid var(--border)', borderRadius: 4,
          background: active ? 'var(--text-primary)' : 'transparent',
          color: active ? 'var(--text-inverse)' : disabled ? 'var(--text-muted)' : 'var(--text-secondary)',
          cursor: disabled ? 'default' : 'pointer', flexShrink: 0,
          opacity: disabled ? 0.4 : 1,
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

const tblBtn: React.CSSProperties = {
  background: 'none', border: '1px solid #E0C97A', cursor: 'pointer',
  color: '#6B5900', padding: '1px 6px', borderRadius: 4,
  fontSize: 10, fontFamily: 'inherit', whiteSpace: 'nowrap', lineHeight: '18px',
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
