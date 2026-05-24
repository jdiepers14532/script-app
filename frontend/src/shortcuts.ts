/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  TASTATURKÜRZEL-REGISTRY — script-app                                      ║
 * ║                                                                              ║
 * ║  PFLICHT-REGEL für alle Entwicklungen:                                      ║
 * ║  Jedes Tastaturkürzel, das in einem Tooltip, auf der /hilfe-Seite oder      ║
 * ║  in einer Onscreen-Hilfe angezeigt wird, MUSS hier registriert sein.        ║
 * ║  Niemals Kürzel-Strings direkt in Tooltip-Texten hardcoden.                 ║
 * ║                                                                              ║
 * ║  Neues Kürzel hinzufügen:                                                   ║
 * ║  1. Eintrag in SHORTCUT_DEFS ergänzen                                       ║
 * ║  2. useShortcut().label('meineId') im Tooltip-Text verwenden                ║
 * ║  3. matchesShortcut('meineId', e) im keydown-Handler verwenden              ║
 * ║                                                                              ║
 * ║  Layout-Hinweise (e.code ist physische Position, nicht Label):              ║
 * ║  • QWERTY: Taste "Z" → e.code='KeyZ', Taste "Y" → e.code='KeyY'           ║
 * ║  • QWERTZ: Taste "Z" → e.code='KeyY' (physisch), "Y" → e.code='KeyZ'      ║
 * ║  • codes[] = alle e.code-Werte, die den Shortcut auslösen sollen            ║
 * ║  • label(layout) = was der User auf seiner Tastatur sieht                   ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

export type KeyboardLayout = 'qwerty' | 'qwertz'

export interface ShortcutDef {
  /** Physische Tastenpositionen (e.code) — unabhängig vom Tastaturlayout */
  codes: string[]
  altKey?: boolean
  ctrlKey?: boolean
  shiftKey?: boolean
  /** Label das dem User angezeigt wird — muss zur Beschriftung seiner Taste passen */
  label(layout: KeyboardLayout, isMac: boolean): string
}

/**
 * Alle App-Kürzel zentral registriert.
 * Neue Kürzel hier eintragen — nicht in einzelnen Komponenten hardcoden.
 */
export const SHORTCUT_DEFS: Record<string, ShortcutDef> = {

  // ── Fokus-Modus ─────────────────────────────────────────────────────────────
  // QWERTY:  Alt+Z → e.code='KeyZ'
  // QWERTZ:  Alt+Z → e.code='KeyY'  (Z und Y physisch vertauscht)
  // Beide Codes werden akzeptiert → Alt+Z funktioniert auf beiden Layouts
  focusMode: {
    codes: ['KeyZ', 'KeyY'],
    altKey: true,
    label: (_layout, isMac) => `${isMac ? '⌥' : 'Alt'}+Z`,
  },

  // ── Undo / Redo ─────────────────────────────────────────────────────────────
  undo: {
    codes: ['KeyZ'],
    ctrlKey: true,
    label: (_layout, isMac) => `${isMac ? '⌘' : 'Strg'}+Z`,
  },
  redo: {
    codes: ['KeyY'],
    ctrlKey: true,
    label: (_layout, isMac) => `${isMac ? '⌘' : 'Strg'}+Y`,
  },

  // ── Werkzeug-Leiste öffnen (Klick-basiert, kein code) ───────────────────────
  toolbarOpen: {
    codes: [],
    altKey: true,
    label: (_layout, isMac) => `${isMac ? '⌥' : 'Alt'}+Klick`,
  },

  // ── Autoren-Stoppzeit Auto-Berechnung (Klick-basiert, nur Drehbuch-Werkstufe) ─
  vorstoppAuto: {
    codes: [],
    altKey: true,
    label: (_layout, isMac) => `${isMac ? '⌥' : 'Alt'}+Klick`,
  },

  // ── Ansichts-Einstellungen öffnen ────────────────────────────────────────
  // Alt+A → "A" für Ansicht; nicht von Browsern belegt; KeyA ist auf QWERTY und
  // QWERTZ immer dieselbe physische Position — kein Layout-Mapping nötig.
  viewSettings: {
    codes: ['KeyA'],
    altKey: true,
    label: (_layout, isMac) => `${isMac ? '⌥' : 'Alt'}+A`,
  },

}

// ── Hilfsfunktionen (pure, kein React) ────────────────────────────────────────

/**
 * Gibt true zurück wenn das KeyboardEvent zum Shortcut passt.
 * AltGr-Guard: AltGr = e.ctrlKey + e.altKey gleichzeitig → wird NICHT als Alt akzeptiert.
 */
export function matchesShortcut(id: string, e: KeyboardEvent): boolean {
  const def = SHORTCUT_DEFS[id]
  if (!def) return false
  if (def.altKey  && (!e.altKey  || e.ctrlKey))  return false  // AltGr-Guard
  if (def.ctrlKey && !e.ctrlKey)  return false
  if (def.shiftKey && !e.shiftKey) return false
  if (!def.altKey  && e.altKey)   return false
  if (!def.ctrlKey && e.ctrlKey)  return false
  if (!def.shiftKey && e.shiftKey) return false
  return def.codes.length === 0 || def.codes.includes(e.code)
}

/** Label für direkte (nicht-Hook) Verwendung außerhalb von React. */
export function getShortcutLabel(id: string, layout: KeyboardLayout, isMac: boolean): string {
  return SHORTCUT_DEFS[id]?.label(layout, isMac) ?? id
}
