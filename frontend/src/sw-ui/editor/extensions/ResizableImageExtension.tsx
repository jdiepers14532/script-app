import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { useEffect, useRef, useState } from 'react'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    resizableImage: {
      setResizableImage: (attrs: { src: string; alt?: string; width?: number }) => ReturnType
    }
  }
}

/** Accumulate CSS zoom of all ancestors to convert viewport px ↔ CSS px */
function getAncestorZoom(el: HTMLElement): number {
  let zoom = 1
  let cur: HTMLElement | null = el.parentElement
  while (cur) {
    const z = parseFloat(getComputedStyle(cur).zoom || '1')
    if (!isNaN(z) && z > 0 && z !== 1) zoom *= z
    cur = cur.parentElement
  }
  return zoom
}

function ResizableImageNodeView({ node, updateAttributes }: NodeViewProps) {
  const { src, alt, width, float: imgFloat } = node.attrs
  const [resizing, setResizing] = useState(false)
  const [hovered, setHovered]   = useState(false)
  const [displayWidth, setDisplayWidth] = useState(() => Number(width) || 120)
  const startData = useRef({ x: 0, w: 0, zoom: 1, containerW: 800 })
  const wrapperRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!resizing) setDisplayWidth(Number(width) || 120)
  }, [width, resizing])

  const onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    setResizing(true)

    // Correct for CSS zoom: delta from clientX is in viewport px; width is stored in CSS px.
    const zoom       = wrapperRef.current ? getAncestorZoom(wrapperRef.current) : 1
    const cssW       = Number(node.attrs.width) || displayWidth   // always CSS px, zoom-independent
    // Use the ProseMirror editor content area as max-width reference.
    // parentElement is ProseMirror's atom wrapper span (same width as image) — too narrow.
    const editorEl   = wrapperRef.current?.closest('.ProseMirror') as HTMLElement | null
    const editorBcr  = editorEl?.getBoundingClientRect()
    const containerW = editorBcr ? editorBcr.width / zoom : 800   // editor width in CSS px

    startData.current = { x: e.clientX, w: cssW, zoom, containerW }

    const onMove = (ev: MouseEvent) => {
      // Convert viewport-pixel delta → CSS-pixel delta
      const delta = (ev.clientX - startData.current.x) / startData.current.zoom
      const newW  = Math.max(24, Math.min(startData.current.containerW, Math.round(startData.current.w + delta)))
      setDisplayWidth(newW)
      updateAttributes({ width: newW })
    }
    const onUp = () => {
      setResizing(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const showOverlay = hovered || resizing

  // Float wrapper: floated → shrink-wraps image. Non-floated → inline-block (doesn't span full width).
  const wrapperStyle: React.CSSProperties = imgFloat === 'left'
    ? { display: 'block', float: 'left',  marginRight: 10, position: 'relative', maxWidth: '100%' }
    : imgFloat === 'right'
    ? { display: 'block', float: 'right', marginLeft:  10, position: 'relative', maxWidth: '100%' }
    : { display: 'inline-block', margin: '4px 0', position: 'relative', maxWidth: '100%', verticalAlign: 'top' }

  return (
    <NodeViewWrapper
      ref={wrapperRef}
      as="span"
      contentEditable={false}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { if (!resizing) setHovered(false) }}
      style={wrapperStyle}
    >
      <img
        src={src} alt={alt || ''}
        style={{
          width: displayWidth, maxWidth: '100%', display: 'block',
          outline: showOverlay ? '2px solid #007AFF88' : 'none',
          outlineOffset: 1, transition: 'outline 0.1s',
        }}
        draggable={false}
      />

      {/* ── Float / position controls — visible on hover ── */}
      {showOverlay && (
        <div style={{
          position: 'absolute', top: 4, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: 3, pointerEvents: 'all',
        }}>
          {([
            ['◁', 'left',  'Links'],
            ['▣', 'none',  'Block'],
            ['▷', 'right', 'Rechts'],
          ] as [string, string, string][]).map(([icon, val, title]) => (
            <button
              key={val}
              title={title}
              onMouseDown={e => { e.preventDefault(); e.stopPropagation(); updateAttributes({ float: val }) }}
              style={{
                width: 22, height: 22,
                border: `1.5px solid ${imgFloat === val ? '#007AFF' : 'rgba(0,0,0,0.35)'}`,
                borderRadius: 3,
                background: imgFloat === val ? '#007AFF' : 'rgba(255,255,255,0.92)',
                color: imgFloat === val ? '#fff' : '#333',
                cursor: 'pointer', fontSize: 11,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
              }}
            >{icon}</button>
          ))}
        </div>
      )}

      {/* ── Resize handle — bottom-right corner ── */}
      {showOverlay && (
        <span
          onMouseDown={onResizeStart}
          title="Größe ändern"
          style={{
            position: 'absolute', right: 3, bottom: 3, width: 14, height: 14,
            background: resizing ? '#007AFF' : '#007AFFCC',
            border: '2px solid #fff', borderRadius: 2,
            cursor: 'se-resize',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
          }}
        />
      )}

      {/* ── Width tooltip while resizing ── */}
      {resizing && (
        <span style={{
          position: 'absolute', bottom: 20, right: 3,
          background: 'rgba(0,0,0,0.75)', color: '#fff', fontSize: 10,
          padding: '2px 6px', borderRadius: 3, pointerEvents: 'none', whiteSpace: 'nowrap',
        }}>
          {displayWidth} px
        </span>
      )}
    </NodeViewWrapper>
  )
}

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
      float: {
        default: 'none',
        parseHTML: el => (el as HTMLElement).getAttribute('data-float') || 'none',
      },
    }
  },

  parseHTML()  { return [{ tag: 'img[data-width]' }] },

  renderHTML({ HTMLAttributes }) {
    const flt = HTMLAttributes.float
    const floatStyle = flt === 'left'  ? ';float:left;margin-right:10px'
                     : flt === 'right' ? ';float:right;margin-left:10px'
                     : ';display:block;margin:4px 0'
    return ['img', mergeAttributes(HTMLAttributes, {
      'data-width': HTMLAttributes.width,
      'data-float': HTMLAttributes.float,
      style: `width:${HTMLAttributes.width || 120}px;max-width:100%;vertical-align:middle${floatStyle}`,
    })]
  },

  addNodeView() { return ReactNodeViewRenderer(ResizableImageNodeView) },

  addCommands() {
    return {
      setResizableImage: (attrs: { src: string; alt?: string; width?: number }) =>
        ({ commands }: any) => commands.insertContent({ type: 'resizable_image', attrs }),
    } as any
  },
})
