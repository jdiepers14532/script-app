import { useEffect, useRef, useCallback } from 'react'
import { useEditor, EditorContent, BubbleMenu } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { ScreenplayExtension, ScreenplayElementType, FormatElement, DEFAULT_FORMAT, SCREENPLAY_CSS } from '../../tiptap/ScreenplayExtension'
import { AnnotationMark } from '../../tiptap/AnnotationMark'
import PageWrapper from './PageWrapper'

// Inject screenplay CSS once
let cssInjected = false
function injectScreenplayCSS() {
  if (cssInjected) return
  const style = document.createElement('style')
  style.textContent = SCREENPLAY_CSS
  document.head.appendChild(style)
  cssInjected = true
}

const ELEMENT_TYPE_LABELS: Record<ScreenplayElementType, string> = {
  scene_heading: 'Szene',
  action: 'Aktion',
  character: 'Figur',
  dialogue: 'Dialog',
  parenthetical: 'Regie',
  transition: 'Übergang',
  shot: 'Shot',
}

interface ScreenplayEditorProps {
  initialContent?: any  // ProseMirror JSON
  onSave?: (content: any) => void
  autoSaveMs?: number
  readOnly?: boolean
  seitenformat?: 'a4' | 'letter'
  showShadow?: boolean
  formatElements?: FormatElement[]
  placeholder?: string
}

export default function ScreenplayEditor({
  initialContent,
  onSave,
  autoSaveMs = 1500,
  readOnly = false,
  seitenformat = 'a4',
  showShadow = true,
  formatElements = [],
  placeholder = 'INT. ORT - TAG',
}: ScreenplayEditorProps) {
  injectScreenplayCSS()

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable all default block nodes — only screenplay_element allowed at top level
        paragraph: false,
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      ScreenplayExtension.configure({ formatElements }),
      AnnotationMark,
      Placeholder.configure({
        placeholder,
        emptyEditorClass: 'sp-editor-empty',
      }),
    ],
    content: initialContent || {
      type: 'doc',
      content: [{ type: 'screenplay_element', attrs: { element_type: 'scene_heading' } }],
    },
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      if (readOnly || !onSaveRef.current) return
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        onSaveRef.current?.(editor.getJSON())
      }, autoSaveMs)
    },
  })

  // Update editable when readOnly prop changes
  useEffect(() => {
    editor?.setEditable(!readOnly)
  }, [editor, readOnly])

  // Cleanup timer on unmount
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
  }, [])

  const getCurrentElementType = useCallback((): ScreenplayElementType | null => {
    if (!editor) return null
    const { $from } = editor.state.selection
    const node = $from.node()
    if (node.type.name !== 'screenplay_element') return null
    return node.attrs.element_type as ScreenplayElementType
  }, [editor])

  const currentType = editor ? getCurrentElementType() : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      {!readOnly && (
        <div style={{
          display: 'flex', gap: 4, padding: '8px 12px',
          borderBottom: '1px solid var(--border)', flexWrap: 'wrap',
          background: 'var(--bg-surface)', flexShrink: 0,
        }}>
          {(Object.keys(ELEMENT_TYPE_LABELS) as ScreenplayElementType[]).map(type => (
            <button
              key={type}
              onClick={() => editor?.commands.setElementType(type)}
              title={`${ELEMENT_TYPE_LABELS[type]} (Tab/Enter)`}
              style={{
                padding: '3px 8px',
                fontSize: 11,
                fontFamily: 'inherit',
                border: '1px solid var(--border)',
                borderRadius: 4,
                background: currentType === type ? 'var(--text-primary)' : 'transparent',
                color: currentType === type ? 'var(--text-inverse)' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontWeight: currentType === type ? 600 : 400,
                transition: '0.1s',
              }}
            >
              {ELEMENT_TYPE_LABELS[type]}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 10, color: 'var(--text-muted)', alignSelf: 'center', paddingRight: 4 }}>
            Tab = nächster Typ · Enter = folge
          </span>
        </div>
      )}

      {/* Bubble Menu for element type changes */}
      {editor && !readOnly && (
        <BubbleMenu
          editor={editor}
          tippyOptions={{ duration: 100, placement: 'top' }}
          shouldShow={({ editor }) => {
            const { $from } = editor.state.selection
            return $from.node().type.name === 'screenplay_element'
          }}
        >
          <div style={{
            display: 'flex', gap: 2, background: '#111', borderRadius: 6,
            padding: '4px 6px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}>
            {(Object.keys(ELEMENT_TYPE_LABELS) as ScreenplayElementType[]).map(type => (
              <button
                key={type}
                onClick={() => editor.commands.setElementType(type)}
                style={{
                  padding: '2px 6px', fontSize: 10, border: 'none', borderRadius: 4,
                  background: currentType === type ? '#fff' : 'transparent',
                  color: currentType === type ? '#111' : '#aaa',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {ELEMENT_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
        </BubbleMenu>
      )}

      {/* Page area */}
      <div style={{ flex: 1, overflow: 'auto' }}>
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
