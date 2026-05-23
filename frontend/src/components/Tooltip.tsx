import { useState, useRef, useCallback, ReactNode, useContext } from 'react'
import { createPortal } from 'react-dom'
import { UserPrefsContext } from '../contexts'

interface TooltipProps {
  text: string
  children: ReactNode
  placement?: 'top' | 'bottom' | 'right'
  delay?: number  // ms before showing
}

export default function Tooltip({ text, children, placement = 'top', delay = 0 }: TooltipProps) {
  const { showTooltips } = useContext(UserPrefsContext)
  const [pos, setPos] = useState<{ x: number; y: number; isBottom: boolean; isRight: boolean } | null>(null)
  const ref = useRef<HTMLSpanElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = useCallback(() => {
    if (!ref.current) return
    const doShow = () => {
      if (!ref.current) return
      const r = ref.current.getBoundingClientRect()
      if (placement === 'right') {
        setPos({ x: r.right + 8, y: r.top + r.height / 2, isBottom: false, isRight: true })
        return
      }
      // Auto-flip to bottom if not enough space above (or placement explicitly bottom)
      const useBottom = placement === 'bottom' || (placement === 'top' && r.top < 60)
      setPos(
        useBottom
          ? { x: r.left + r.width / 2, y: r.bottom + 8, isBottom: true, isRight: false }
          : { x: r.left + r.width / 2, y: r.top - 8, isBottom: false, isRight: false }
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

  if (!showTooltips || !text) return <>{children}</>

  return (
    <>
      <span ref={ref} onMouseEnter={show} onMouseLeave={hide} style={{ display: 'inline-flex', alignItems: 'center' }}>
        {children}
      </span>
      {pos && createPortal(
        <div style={{
          position: 'fixed',
          left: pos.isRight
            ? pos.x
            : `clamp(4px, calc(${pos.x}px - 110px), calc(100vw - 224px))` as any,
          top: pos.isRight
            ? `clamp(4px, calc(${pos.y}px - 16px), calc(100vh - 60px))` as any
            : pos.y,
          transform: pos.isRight ? undefined : pos.isBottom ? undefined : 'translateY(-100%)',
          background: '#111',
          color: '#fff',
          fontSize: 11,
          lineHeight: 1.5,
          padding: '6px 10px',
          borderRadius: 6,
          width: 220,
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
