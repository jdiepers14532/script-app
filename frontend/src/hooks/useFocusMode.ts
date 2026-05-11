import { useState, useEffect, useCallback, useRef } from 'react'
import { matchesShortcut } from '../shortcuts'

function setDataAttr(key: string, val: string) {
  document.documentElement.setAttribute(key, val)
}

export function useFocusMode() {
  const [focus, setFocus] = useState<boolean>(() => {
    return localStorage.getItem('sw-focus-mode') === 'true'
  })
  const [hoverOpen, setHoverOpenState] = useState(false)
  const [toolbarOpen, setToolbarOpenState] = useState(false)
  const [toolbarOpenedVia, setToolbarOpenedVia] = useState<'button' | 'click' | null>(null)
  const [toolbarPos, setToolbarPos] = useState<{ x: number; y: number }>(() => ({
    x: (typeof window !== 'undefined' ? window.innerWidth : 800) / 2 - 200,
    y: 50,
  }))
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fullscreenByFocus = useRef(false)

  // Open immediately / close with 200ms grace period (mouse gap tolerance)
  const setHoverOpen = useCallback((v: boolean) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    if (v) {
      setHoverOpenState(true)
      setDataAttr('data-focus-hover', 'true')
    } else {
      hoverTimer.current = setTimeout(() => {
        setHoverOpenState(false)
        setDataAttr('data-focus-hover', 'false')
      }, 200)
    }
  }, [])

  const setToolbarOpen = useCallback((v: boolean) => {
    setToolbarOpenState(v)
    setDataAttr('data-focus-toolbar', v ? 'true' : 'false')
    if (!v) setToolbarOpenedVia(null)
  }, [])

  const closeOverlays = useCallback(() => {
    setHoverOpenState(false)
    setToolbarOpenState(false)
    setDataAttr('data-focus-hover', 'false')
    setDataAttr('data-focus-toolbar', 'false')
  }, [])

  const toggle = useCallback(() => {
    setFocus(f => {
      const next = !f
      localStorage.setItem('sw-focus-mode', String(next))
      setDataAttr('data-mode', next ? 'focus' : 'normal')
      if (next) {
        if (!document.fullscreenElement) {
          // Not already fullscreen — request it and remember we caused it
          document.documentElement.requestFullscreen?.().then(() => {
            fullscreenByFocus.current = true
          }).catch(() => {})
        }
        // If already fullscreen: leave it as-is, fullscreenByFocus stays false
      } else {
        // Exit fullscreen only if we triggered it
        if (document.fullscreenElement && fullscreenByFocus.current) {
          fullscreenByFocus.current = false
          document.exitFullscreen?.()
        }
        closeOverlays()
      }
      return next
    })
  }, [closeOverlays])

  // Set initial data-mode attribute
  useEffect(() => {
    setDataAttr('data-mode', focus ? 'focus' : 'normal')
  }, [focus])

  // If user exits fullscreen externally (F11 / browser button), also exit focus mode
  useEffect(() => {
    const onFSChange = () => {
      if (!document.fullscreenElement && fullscreenByFocus.current) {
        fullscreenByFocus.current = false
        setFocus(f => {
          if (!f) return f
          localStorage.setItem('sw-focus-mode', 'false')
          setDataAttr('data-mode', 'normal')
          closeOverlays()
          return false
        })
      }
    }
    document.addEventListener('fullscreenchange', onFSChange)
    return () => document.removeEventListener('fullscreenchange', onFSChange)
  }, [closeOverlays])

  // Alt+Z toggle focus | Escape exit focus
  // Alt+Z: not taken by any browser, layout-independent (e.code), works on German keyboards
  // Note: e.altKey alone is NOT AltGr (AltGr = e.altKey && e.ctrlKey simultaneously)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (matchesShortcut('focusMode', e)) {
        e.preventDefault()
        toggle()
      } else if (e.key === 'Escape') {
        setFocus(f => {
          if (!f) return f
          localStorage.setItem('sw-focus-mode', 'false')
          setDataAttr('data-mode', 'normal')
          if (document.fullscreenElement && fullscreenByFocus.current) {
            fullscreenByFocus.current = false
            document.exitFullscreen?.()
          }
          closeOverlays()
          return false
        })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggle, closeOverlays])

  return { focus, toggle, hoverOpen, setHoverOpen, toolbarOpen, setToolbarOpen, toolbarPos, setToolbarPos, toolbarOpenedVia, setToolbarOpenedVia }
}
