import { useState, useEffect, useCallback } from 'react'

export function useFocusMode() {
  const [focus, setFocus] = useState<boolean>(() => {
    return localStorage.getItem('sw-focus-mode') === 'true'
  })

  const toggle = useCallback(() => {
    setFocus(f => {
      const next = !f
      localStorage.setItem('sw-focus-mode', String(next))
      document.documentElement.setAttribute('data-mode', next ? 'focus' : 'normal')
      return next
    })
  }, [])

  // Set initial data-mode attribute
  useEffect(() => {
    document.documentElement.setAttribute('data-mode', focus ? 'focus' : 'normal')
  }, [focus])

  // F10 keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F10') {
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggle])

  return { focus, toggle }
}
