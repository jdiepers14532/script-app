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

  // ── Navigation (App-Nav-Menü) ─────────────────────────────────────────────
  // Alt+Buchstabe — nicht von modernen Browsern als Navigation belegt.
  // Alt+D wurde bewusst ausgelassen (fokussiert Adressleiste in Chrome/Edge).
  // ^ = Backquote-Taste (physisch links neben 1, auf QWERTZ unverschoben "^")
  navEpisoden: {
    codes: ['Backquote'],
    altKey: true,
    label: (_layout, isMac) => `${isMac ? '⌥' : 'Alt'}+^`,
  },
  navRollen: {
    codes: ['KeyR'],
    altKey: true,
    label: (_layout, isMac) => `${isMac ? '⌥' : 'Alt'}+R`,
  },
  navKomparsen: {
    codes: ['KeyK'],
    altKey: true,
    label: (_layout, isMac) => `${isMac ? '⌥' : 'Alt'}+K`,
  },
  navMotive: {
    codes: ['KeyM'],
    altKey: true,
    label: (_layout, isMac) => `${isMac ? '⌥' : 'Alt'}+M`,
  },
  navStatistik: {
    codes: ['KeyS'],
    altKey: true,
    label: (_layout, isMac) => `${isMac ? '⌥' : 'Alt'}+S`,
  },
  navBesetzung: {
    codes: ['KeyB'],
    altKey: true,
    label: (_layout, isMac) => `${isMac ? '⌥' : 'Alt'}+B`,
  },
  navFreieDokumente: {
    codes: ['KeyF'],
    altKey: true,
    label: (_layout, isMac) => `${isMac ? '⌥' : 'Alt'}+F`,
  },
  navDrehbuchkoordination: {
    codes: ['KeyC'],
    altKey: true,
    label: (_layout, isMac) => `${isMac ? '⌥' : 'Alt'}+C`,
  },
  navExport: {
    codes: ['KeyE'],
    altKey: true,
    label: (_layout, isMac) => `${isMac ? '⌥' : 'Alt'}+E`,
  },
  navHandbuch: {
    codes: ['KeyH'],
    altKey: true,
    label: (_layout, isMac) => `${isMac ? '⌥' : 'Alt'}+H`,
  },
  // Alt+N → NT-Liste (N wie NT); nicht von Browsern als Navigation belegt
  navNtListe: {
    codes: ['KeyN'],
    altKey: true,
    label: (_layout, isMac) => `${isMac ? '⌥' : 'Alt'}+N`,
  },
  // Alt+G → Freigaben (G wie Genehmigung); nicht von Browsern als Navigation belegt
  navFreigaben: {
    codes: ['KeyG'],
    altKey: true,
    label: (_layout, isMac) => `${isMac ? '⌥' : 'Alt'}+G`,
  },

  // ── Bereichs-Switcher (Strg+Shift+1/2/3) ────────────────────────────────
  // Alt+1–3 war belegt durch ScreenplayExtension + AbsatzExtension im Editor.
  // Ctrl+Shift+1–3 ist in Chrome/Edge/Firefox/Safari nicht belegt.
  // Digit1–3 sind auf allen Tastatur-Layouts identisch — kein Layout-Mapping nötig.
  bereichScript: {
    codes: ['Digit1'],
    ctrlKey: true,
    shiftKey: true,
    label: (_layout, isMac) => `${isMac ? '⌘' : 'Strg'}+Shift+1`,
  },
  bereichKonzept: {
    codes: ['KeyK'],
    ctrlKey: true,
    shiftKey: true,
    label: (_layout, isMac) => `${isMac ? '⌘' : 'Strg'}+Shift+K`,
  },
  bereichAnalyse: {
    codes: ['KeyL'],
    ctrlKey: true,
    shiftKey: true,
    label: (_layout, isMac) => `${isMac ? '⌘' : 'Strg'}+Shift+L`,
  },

  // ── Editor: Cursor Anfang/Ende der Szene ─────────────────────────────────
  editorGotoStart: {
    codes: ['Home'],
    ctrlKey: true,
    label: (_layout, isMac) => `${isMac ? '⌘' : 'Strg'}+Home`,
  },
  editorGotoEnd: {
    codes: ['End'],
    ctrlKey: true,
    label: (_layout, isMac) => `${isMac ? '⌘' : 'Strg'}+Ende`,
  },

  // ── Szenennavigation ─────────────────────────────────────────────────────
  gotoSzene: {
    codes: ['KeyG'],
    ctrlKey: true,
    label: (_layout, isMac) => `${isMac ? '⌘' : 'Strg'}+G`,
  },

  // Szene wechseln: Alt+Bild auf/ab.
  // NICHT Strg+Bild — das ist im Browser für Tab-Wechsel reserviert und per
  // preventDefault() nicht abfangbar. Alt+Bild ist frei und behält die „Bild"-Semantik.
  // Funktioniert auch im Editor (kein isEditable-Guard im Handler).
  // Mac-Laptop-Alias ⌘+⌥+↑/↓ wird im ScriptPage-Handler separat behandelt.
  sceneNext: {
    codes: ['PageDown'],
    altKey: true,
    label: (_layout, isMac) => `${isMac ? '⌥' : 'Alt'}+Bild ab`,
  },
  scenePrev: {
    codes: ['PageUp'],
    altKey: true,
    label: (_layout, isMac) => `${isMac ? '⌥' : 'Alt'}+Bild auf`,
  },

  // Folge wechseln: Alt+Shift+Bild auf/ab. Mac-Alias ⌘+⌥+Shift+↑/↓ im Handler.
  folgeNext: {
    codes: ['PageDown'],
    altKey: true,
    shiftKey: true,
    label: (_layout, isMac) => `${isMac ? '⌥' : 'Alt'}+Shift+Bild ab`,
  },
  folgePrev: {
    codes: ['PageUp'],
    altKey: true,
    shiftKey: true,
    label: (_layout, isMac) => `${isMac ? '⌥' : 'Alt'}+Shift+Bild auf`,
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
