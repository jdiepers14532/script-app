import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'

export interface EditorPrefs {
  showShadow: boolean
  seitenformat: 'a4' | 'letter'
  scriptFontSize: number   // pt, 10–16
}

const DEFAULTS: EditorPrefs = {
  showShadow: true,
  seitenformat: 'a4',
  scriptFontSize: 12,
}

const LS_KEY = 'script_editor_prefs'

function loadLocal(): Partial<EditorPrefs> {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveLocal(prefs: EditorPrefs) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(prefs))
  } catch {}
}

export function useEditorPrefs() {
  const [prefs, setPrefs] = useState<EditorPrefs>({ ...DEFAULTS, ...loadLocal() })

  // Sync from backend on mount
  useEffect(() => {
    api.getSettings()
      .then((settings: any) => {
        const editorPrefs = settings?.ui_settings?.editor
        if (editorPrefs) {
          setPrefs(prev => {
            const merged = { ...prev, ...editorPrefs }
            saveLocal(merged)
            return merged
          })
        }
      })
      .catch(() => {})
  }, [])

  const updatePrefs = useCallback((patch: Partial<EditorPrefs>) => {
    setPrefs(prev => {
      const next = { ...prev, ...patch }
      saveLocal(next)
      // Persist to backend
      api.updateSettings({ ui_settings: { editor: next } }).catch(() => {})
      return next
    })
  }, [])

  return { prefs, updatePrefs }
}
