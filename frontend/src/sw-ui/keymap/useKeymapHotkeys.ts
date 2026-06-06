// ── Globale Keymap-Hotkeys — generisch, app-übergreifend ─────────────────────
// Registriert die App-weiten Trigger für Befehlspalette (Strg/Cmd+K) und
// Kürzel-Übersicht (?). Die App liefert die Callbacks und mountet die Overlays.
// Übergib stabile Callbacks (useCallback), sonst registriert sich der Listener neu.
import { useEffect } from 'react'
import type { CheatSheetView } from './ShortcutCheatSheet'

export interface KeymapHotkeyHandlers {
  /** Strg/Cmd+K (ohne Shift/Alt — Strg+Shift+K bleibt für die App frei) */
  onTogglePalette?: () => void
  /**
   * Kürzel-Übersicht öffnen — nur wenn der Fokus NICHT in einem Eingabe-/Textfeld liegt.
   * ? öffnet die Grafik, Strg+? die Liste (der View-Wunsch wird als Argument übergeben).
   */
  onOpenCheatSheet?: (view?: CheatSheetView) => void
}

export function useKeymapHotkeys({ onTogglePalette, onOpenCheatSheet }: KeymapHotkeyHandlers) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase()
      const isEditable = ['input', 'textarea', 'select'].includes(tag) || !!document.activeElement?.getAttribute('contenteditable')
      if (onTogglePalette && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.code === 'KeyK') {
        e.preventDefault(); onTogglePalette(); return
      }
      // ? → Grafik · Strg+? → Liste (Cmd zählt nicht — bleibt für OS/Browser frei)
      if (onOpenCheatSheet && e.key === '?' && !e.metaKey && !e.altKey && !isEditable) {
        e.preventDefault(); onOpenCheatSheet(e.ctrlKey ? 'liste' : 'grafik')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onTogglePalette, onOpenCheatSheet])
}
