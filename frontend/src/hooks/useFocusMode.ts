import { useState, useEffect, useCallback, useRef } from 'react'

function setDataAttr(key: string, val: string) {
  document.documentElement.setAttribute(key, val)
}

export function useFocusMode() {
  const [focus, setFocus] = useState<boolean>(() => {
    return localStorage.getItem('sw-focus-mode') === 'true'
  })
  const [hoverOpen, setHoverOpenState] = useState(false)
  const [toolbarOpen, setToolbarOpenState] = useState(false)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
      if (!next) closeOverlays()
      return next
    })
  }, [closeOverlays])

  // Set initial data-mode attribute
  useEffect(() => {
    setDataAttr('data-mode', focus ? 'focus' : 'normal')
  }, [focus])

  // F10 toggle focus / F9 toggle toolbar (in focus mode) / Escape exit
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F10') {
        e.preventDefault()
        toggle()
      } else if (e.key === 'F9') {
        e.preventDefault()
        setToolbarOpen(!document.documentElement.getAttribute('data-focus-toolbar') || document.documentElement.getAttribute('data-focus-toolbar') !== 'true')
      } else if (e.key === 'Escape') {
        setFocus(f => {
          if (!f) return f
          localStorage.setItem('sw-focus-mode', 'false')
          setDataAttr('data-mode', 'normal')
          closeOverlays()
          return false
        })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggle, closeOverlays, setToolbarOpen])

  return { focus, toggle, hoverOpen, setHoverOpen, toolbarOpen, setToolbarOpen }
}
