import { useState, useRef, useCallback, ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface TooltipProps {
  text: string
  children: ReactNode
  placement?: 'top' | 'bottom'
  delay?: number  // ms before showing
}

export default function Tooltip({ text, children, placement = 'top', delay = 0 }: TooltipProps) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const ref = useRef<HTMLSpanElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = useCallback(() => {
    if (!ref.current) return
    const doShow = () => {
      if (!ref.current) return
      const r = ref.current.getBoundingClientRect()
      setPos(
        placement === 'bottom'
          ? { x: r.left + r.width / 2, y: r.bottom + 8 }
          : { x: r.left + r.width / 2, y: r.top - 8 }
      )
    }
    if (delay > 0) {
      timer.current = setTimeout(doShow, delay)
    } else {
      doShow()
    }
  }, [placement, delay])

  const hide = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    setPos(null)
  }, [])

  return (
    <>
      <span ref={ref} onMouseEnter={show} onMouseLeave={hide} style={{ display: 'inline-flex', alignItems: 'center' }}>
        {children}
      </span>
      {pos && createPortal(
        <div style={{
          position: 'fixed',
          left: pos.x,
          top: pos.y,
          transform: placement === 'bottom' ? 'translateX(-50%)' : 'translate(-50%, -100%)',
          background: '#111',
          color: '#fff',
          fontSize: 11,
          lineHeight: 1.5,
          padding: '6px 10px',
          borderRadius: 6,
          maxWidth: 220,
          whiteSpace: 'pre-line',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          zIndex: 99999,
          pointerEvents: 'none',
        }}>
          {text}
        </div>,
        document.body
      )}
    </>
  )
}
