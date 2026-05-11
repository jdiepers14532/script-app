import { useState, useEffect, useCallback } from 'react'

function setDataAttr(key: string, val: string) {
  document.documentElement.setAttribute(key, val)
}

export function useFocusMode() {
  const [focus, setFocus] = useState<boolean>(() => {
    return localStorage.getItem('sw-focus-mode') === 'true'
  })
  const [hoverOpen, setHoverOpenState] = useState(false)
  const [toolbarOpen, setToolbarOpenState] = useState(false)

  const setHoverOpen = useCallback((v: boolean) => {
    setHoverOpenState(v)
    setDataAttr('data-focus-hover', v ? 'true' : 'false')
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

  // F10 toggle / Escape exit
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F10') {
        e.preventDefault()
        toggle()
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
  }, [toggle, closeOverlays])

  return { focus, toggle, hoverOpen, setHoverOpen, toolbarOpen, setToolbarOpen }
}
