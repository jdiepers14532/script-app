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

function ResizableImageNodeView({ node, updateAttributes }: NodeViewProps) {
  const { src, alt, width, float: imgFloat } = node.attrs
  const [resizing, setResizing]       = useState(false)
  const [hovered, setHovered]         = useState(false)
  const [displayWidth, setDisplayWidth] = useState(() => Number(width) || 120)
  const startData  = useRef({ x: 0, w: 0 })
  const wrapperRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!resizing) setDisplayWidth(Number(width) || 120)
  }, [width, resizing])

  const onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    setResizing(true)
    // Use actual rendered (visual) width as starting point — stored displayWidth may differ
    // from visual if CSS max-width constraints have capped it (e.g. in narrow columns)
    const actualW = wrapperRef.current?.offsetWidth ?? displayWidth
    startData.current = { x: e.clientX, w: actualW }
    const containerW = wrapperRef.current?.parentElement?.clientWidth ?? 800
    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startData.current.x
      const newW  = Math.max(24, Math.min(containerW, Math.round(startData.current.w + delta)))
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

  const showHandle = hovered || resizing

  // Float-based wrapper style — decouples image from text line height
  const wrapperStyle: React.CSSProperties = imgFloat === 'left'
    ? { display: 'block', float: 'left',  marginRight: 10, position: 'relative', cursor: 'default', maxWidth: '100%' }
    : imgFloat === 'right'
    ? { display: 'block', float: 'right', marginLeft:  10, position: 'relative', cursor: 'default', maxWidth: '100%' }
    : { display: 'block', margin: '4px 0',               position: 'relative', cursor: 'default', maxWidth: '100%' }

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
        style={{ width: displayWidth, maxWidth: '100%', display: 'block',
          outline: showHandle ? '2px solid #007AFF88' : 'none', outlineOffset: 1, transition: 'outline 0.1s' }}
        draggable={false}
      />
      {/* Resize handle — INSIDE image bounds (right:3,bottom:3) so overflow:auto on
          parent scroll containers doesn't clip it (negative offsets would be clipped) */}
      <span
        onMouseDown={onResizeStart}
        style={{
          position: 'absolute', right: 3, bottom: 3, width: 12, height: 12,
          background: resizing ? '#007AFF' : '#007AFFCC', border: '2px solid #fff', borderRadius: 2,
          cursor: 'se-resize', display: showHandle ? 'flex' : 'none',
          alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
        }}
      />
      {resizing && (
        <span style={{
          position: 'absolute', top: 4, left: '50%', transform: 'translateX(-50%)',
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
