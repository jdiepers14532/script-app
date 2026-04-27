import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCursor from '@tiptap/extension-collaboration-cursor'
import * as Y from 'yjs'
import type { HocuspocusProvider } from '@hocuspocus/provider'
import { useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import { AnnotationMark } from '../../tiptap/AnnotationMark'
import PageWrapper from './PageWrapper'
import {
  Bold as BoldIcon, Italic as ItalicIcon, Underline as UnderlineIcon,
  AlignLeft, AlignCenter, AlignRight,
  List, ListOrdered, ImageIcon,
} from 'lucide-react'

interface RichTextEditorProps {
  ydoc?: Y.Doc | null
  provider?: HocuspocusProvider | null
  initialContent?: any  // ProseMirror JSON
  onSave?: (content: any) => void
  autoSaveMs?: number
  readOnly?: boolean
  seitenformat?: 'a4' | 'letter'
  showShadow?: boolean
  placeholder?: string
}

function ToolbarBtn({
  active, onClick, title, children,
}: { active?: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: '1px solid var(--border)', borderRadius: 4,
        background: active ? 'var(--text-primary)' : 'transparent',
        color: active ? 'var(--text-inverse)' : 'var(--text-secondary)',
        cursor: 'pointer', flexShrink: 0,
      }}
    >
      {children}
    </button>
  )
}

export default function RichTextEditor({
  initialContent,
  onSave,
  autoSaveMs = 1500,
  readOnly = false,
  seitenformat = 'a4',
  showShadow = true,
  placeholder = 'Text eingeben…',
  ydoc,
  provider,
}: RichTextEditorProps) {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave

  const collabExtensions = ydoc ? [
    Collaboration.configure({ document: ydoc }),
    ...(provider ? [CollaborationCursor.configure({
      provider,
      user: { name: 'Ich', color: '#007AFF' },
    })] : []),
  ] : []

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ history: ydoc ? false : undefined }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Image.configure({ inline: false }),
      AnnotationMark,
      Placeholder.configure({
        placeholder,
        emptyEditorClass: 'rt-editor-empty',
      }),
    ],
    content: ydoc ? undefined : (initialContent || { type: 'doc', content: [{ type: 'paragraph' }] }),
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      if (readOnly || !onSaveRef.current) return
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        onSaveRef.current?.(editor.getJSON())
      }, autoSaveMs)
    },
  })

  useEffect(() => {
    editor?.setEditable(!readOnly)
  }, [editor, readOnly])

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
  }, [])

  if (!editor) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      {!readOnly && (
        <div style={{
          display: 'flex', gap: 4, padding: '6px 12px', flexWrap: 'wrap', flexShrink: 0,
          borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)',
          alignItems: 'center',
        }}>
          <ToolbarBtn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Fett (Ctrl+B)">
            <BoldIcon size={13} />
          </ToolbarBtn>
          <ToolbarBtn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Kursiv (Ctrl+I)">
            <ItalicIcon size={13} />
          </ToolbarBtn>
          <ToolbarBtn active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Unterstrichen (Ctrl+U)">
            <UnderlineIcon size={13} />
          </ToolbarBtn>

          <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 2px' }} />

          <ToolbarBtn active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()} title="Links">
            <AlignLeft size={13} />
          </ToolbarBtn>
          <ToolbarBtn active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()} title="Mittig">
            <AlignCenter size={13} />
          </ToolbarBtn>
          <ToolbarBtn active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()} title="Rechts">
            <AlignRight size={13} />
          </ToolbarBtn>

          <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 2px' }} />

          <ToolbarBtn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Aufzählung">
            <List size={13} />
          </ToolbarBtn>
          <ToolbarBtn active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Nummerierung">
            <ListOrdered size={13} />
          </ToolbarBtn>

          <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 2px' }} />

          <ToolbarBtn
            onClick={() => {
              const url = window.prompt('Bild-URL:')
              if (url) editor.chain().focus().setImage({ src: url }).run()
            }}
            title="Bild einfügen"
          >
            <ImageIcon size={13} />
          </ToolbarBtn>
        </div>
      )}

      {/* Page area */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <PageWrapper seitenformat={seitenformat} showShadow={showShadow}>
          <EditorContent
            editor={editor}
            style={{
              outline: 'none', minHeight: 200,
              fontSize: 13, lineHeight: 1.6,
              fontFamily: 'var(--font-sans)',
            }}
          />
        </PageWrapper>
      </div>
    </div>
  )
}
