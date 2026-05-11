/**
 * Hook für Tastaturkürzel-Labels in Komponenten.
 * Liest das vom User gewählte Tastaturlayout aus TweakState.
 *
 * Verwendung in Tooltips:
 *   const { label } = useShortcut()
 *   <Tooltip text={`Fokus-Modus\n${label('focusMode')}`}>
 *
 * Verwendung in keydown-Handlern:
 *   import { matchesShortcut } from '../shortcuts'  ← pure Funktion, kein Hook nötig
 *   if (matchesShortcut('focusMode', e)) { ... }
 *
 * HINWEIS: Dieser Hook setzt useTweaks() voraus → nur innerhalb von AppShell nutzbar.
 * Für Verwendung außerhalb: getShortcutLabel() aus '../shortcuts' direkt importieren.
 */
import { useCallback } from 'react'
import { getShortcutLabel, matchesShortcut } from '../shortcuts'
import type { KeyboardEvent } from 'react'
import { useTweaks } from '../contexts'

const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent)

export function useShortcut() {
  const { tweaks } = useTweaks()
  const layout = tweaks.keyboardLayout ?? 'qwertz'

  const label = useCallback(
    (id: string) => getShortcutLabel(id, layout, isMac),
    [layout],
  )

  const matches = useCallback(
    (id: string, e: KeyboardEvent<Element> | globalThis.KeyboardEvent) =>
      matchesShortcut(id, e as globalThis.KeyboardEvent),
    [],
  )

  return { label, matches, layout, isMac }
}
