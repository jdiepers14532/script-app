import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCursor from '@tiptap/extension-collaboration-cursor'
import * as Y from 'yjs'
import type { HocuspocusProvider } from '@hocuspocus/provider'
import { useState, useEffect, useRef, useCallback, useMemo, type WheelEvent } from 'react'
import { Info } from 'lucide-react'
import Tooltip from '../Tooltip'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import Placeholder from '@tiptap/extension-placeholder'
import { ScreenplayExtension, ScreenplayElementType, FormatElement, SCREENPLAY_CSS } from '../../tiptap/ScreenplayExtension'
import { AbsatzExtension, generateAbsatzCSS, convertScreenplayToAbsatz, type AbsatzFormat } from '../../tiptap/AbsatzExtension'
import { AnnotationMark } from '../../tiptap/AnnotationMark'
import PageWrapper from './PageWrapper'

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
}

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
}: UniversalEditorProps) {
  injectScreenplayCSS()

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave

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
    return () => { /* keep CSS injected across re-renders */ }
  }, [absatzformate, relevantFormats])

  // Convert content from screenplay_element to absatz if formats available
  const processedContent = useMemo(() => {
    if (!initialContent) return null
    if (relevantFormats.length === 0) return initialContent

    // Check if content has screenplay_element nodes
    const hasScreenplay = initialContent?.content?.some(
      (n: any) => n.type === 'screenplay_element'
    )
    if (hasScreenplay) {
      return convertScreenplayToAbsatz(initialContent, relevantFormats)
    }
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

  // Determine which node types to include
  const hasAbsatzFormate = relevantFormats.length > 0

  const editor = useEditor({
    extensions: [
      // Always include paragraph + heading as fallback (content may have mixed node types)
      StarterKit.configure({
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        history: ydoc ? false : undefined,
      }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      // Always include ScreenplayExtension for backward compat rendering
      ScreenplayExtension.configure({ formatElements }),
      // Include AbsatzExtension when formats are available
      ...(hasAbsatzFormate ? [AbsatzExtension.configure({ formate: relevantFormats })] : []),
      AnnotationMark,
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
  }, [processedContent, hasAbsatzFormate]) // re-create editor when content/formats change

  useEffect(() => {
    editor?.setEditable(!readOnly)
  }, [editor, readOnly])

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

  // Get current screenplay element type (backward compat)
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

  if (!editor) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      {!readOnly && (
        <div style={{
          display: 'flex', gap: 4, padding: '6px 12px',
          borderBottom: '1px solid var(--border)', flexWrap: 'wrap',
          background: 'var(--bg-surface)', flexShrink: 0, alignItems: 'center',
        }}>
          {hasAbsatzFormate ? (
            // Absatzformat toolbar — format buttons from loaded formats
            <>
              {relevantFormats.map(fmt => (
                <Tooltip key={fmt.id} text={`${fmt.name}${fmt.kuerzel ? ` (${fmt.kuerzel})` : ''}`} placement="bottom" delay={400}>
                  <button
                    onClick={() => editor.commands.setAbsatzFormat(fmt.id)}
                    style={{
                      height: 28, padding: '0 8px',
                      fontSize: 11,
                      fontFamily: 'inherit',
                      border: '1px solid var(--border)',
                      borderRadius: 4,
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
              <Tooltip text={'Tab: nächster Typ · Enter: folgendes Element'} placement="bottom">
                <span style={{ width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'help', color: 'var(--text-muted)', flexShrink: 0 }}>
                  <Info size={13} />
                </span>
              </Tooltip>
            </>
          ) : currentElementType ? (
            // Legacy screenplay toolbar
            <>
              {(['scene_heading', 'action', 'character', 'dialogue', 'parenthetical', 'transition', 'shot'] as ScreenplayElementType[]).map(type => (
                <button
                  key={type}
                  onClick={() => editor.commands.setElementType(type)}
                  style={{
                    height: 28, padding: '0 8px',
                    fontSize: 11,
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    background: currentElementType === type ? 'var(--text-primary)' : 'transparent',
                    color: currentElementType === type ? 'var(--text-inverse)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontWeight: currentElementType === type ? 600 : 400,
                    transition: '0.1s',
                  }}
                >
                  {type === 'scene_heading' ? 'SH' : type === 'parenthetical' ? 'PAR' : type.slice(0, 4).toUpperCase()}
                </button>
              ))}
            </>
          ) : (
            // Richtext toolbar (fallback when no formats loaded)
            <>
              <ToolbarBtn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Fett">B</ToolbarBtn>
              <ToolbarBtn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Kursiv">I</ToolbarBtn>
              <ToolbarBtn active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Unterstrichen">U</ToolbarBtn>
            </>
          )}
        </div>
      )}

      {/* Page area */}
      <div style={{ flex: 1, overflow: 'auto' }} onWheel={handleScrollWheel}>
        <PageWrapper seitenformat={seitenformat} showShadow={showShadow}>
          <EditorContent
            editor={editor}
            style={{ outline: 'none', minHeight: '100%' }}
          />
        </PageWrapper>
      </div>
    </div>
  )
}

function ToolbarBtn({ active, onClick, title, children }: {
  active?: boolean; onClick: () => void; title: string; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: '1px solid var(--border)', borderRadius: 4,
        background: active ? 'var(--text-primary)' : 'transparent',
        color: active ? 'var(--text-inverse)' : 'var(--text-secondary)',
        cursor: 'pointer', flexShrink: 0, fontSize: 12, fontWeight: 600,
      }}
    >
      {children}
    </button>
  )
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
  // Fallback: screenplay element for drehbuch, paragraph for others
  if (kategorie === 'drehbuch') {
    return { type: 'doc', content: [{ type: 'screenplay_element', attrs: { element_type: 'scene_heading' } }] }
  }
  return { type: 'doc', content: [{ type: 'paragraph' }] }
}
