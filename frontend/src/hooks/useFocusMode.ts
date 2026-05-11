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
          document.documentElement.setAttribute('data-mode', 'normal')
          return false
        })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggle])

  return { focus, toggle }
}
