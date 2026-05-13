import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { useEffect, useRef, useState } from 'react'

// ── TypeScript augmentation ───────────────────────────────────────────────────
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    resizableImage: {
      setResizableImage: (attrs: { src: string; alt?: string; width?: number }) => ReturnType
    }
  }
}

// ── NodeView — renders image with drag-to-resize handle ───────────────────────
function ResizableImageNodeView({ node, updateAttributes }: NodeViewProps) {
  const { src, alt, width } = node.attrs
  const [resizing, setResizing] = useState(false)
  const [hovered, setHovered] = useState(false)
  // Local display width for immediate visual feedback during drag
  const [displayWidth, setDisplayWidth] = useState(() => Number(width) || 120)
  const startData = useRef({ x: 0, w: 0 })

  // Sync from node attrs when not actively resizing (undo/redo, external changes)
  useEffect(() => {
    if (!resizing) setDisplayWidth(Number(width) || 120)
  }, [width, resizing])

  const onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setResizing(true)
    startData.current = { x: e.clientX, w: displayWidth }

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startData.current.x
      const newW = Math.max(24, Math.min(800, Math.round(startData.current.w + delta)))
      setDisplayWidth(newW)        // instant visual update
      updateAttributes({ width: newW })  // persist to document
    }
    const onUp = () => {
      setResizing(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const showHandle = hovered || resizing

  return (
    <NodeViewWrapper
      as="span"
      contentEditable={false}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { if (!resizing) setHovered(false) }}
      style={{ display: 'inline-block', position: 'relative', verticalAlign: 'middle', cursor: 'default' }}
    >
      <img
        src={src}
        alt={alt || ''}
        style={{
          width: displayWidth,
          maxWidth: '100%',
          display: 'block',
          outline: showHandle ? '2px solid #007AFF88' : 'none',
          outlineOffset: 1,
          transition: 'outline 0.1s',
        }}
        draggable={false}
      />
      {/* Resize handle — always visible on hover */}
      <span
        onMouseDown={onResizeStart}
        style={{
          position: 'absolute', right: -5, bottom: -5,
          width: 12, height: 12,
          background: resizing ? '#007AFF' : '#007AFFCC',
          border: '2px solid #fff',
          borderRadius: 2,
          cursor: 'se-resize',
          display: showHandle ? 'flex' : 'none',
          alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
        }}
      />
      {/* Width tooltip while resizing */}
      {resizing && (
        <span style={{
          position: 'absolute', top: -22, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.75)', color: '#fff', fontSize: 10,
          padding: '2px 6px', borderRadius: 3, pointerEvents: 'none', whiteSpace: 'nowrap',
        }}>
          {displayWidth} px
        </span>
      )}
    </NodeViewWrapper>
  )
}

// ── Tiptap Node extension ─────────────────────────────────────────────────────
export const ResizableImageExtension = Node.create({
  name: 'resizable_image',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      src:   { default: null },
      alt:   { default: '' },
      width: {
        default: 120,
        parseHTML: el => parseInt((el as HTMLElement).getAttribute('data-width') || '120') || 120,
      },
    }
  },

  parseHTML() {
    return [{ tag: 'img[data-width]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(HTMLAttributes, {
      'data-width': HTMLAttributes.width,
      style: `width:${HTMLAttributes.width || 120}px;max-width:100%;vertical-align:middle`,
    })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageNodeView)
  },

  addCommands() {
    return {
      setResizableImage: (attrs: { src: string; alt?: string; width?: number }) =>
        ({ commands }: any) => commands.insertContent({ type: 'resizable_image', attrs }),
    } as any
  },
})
