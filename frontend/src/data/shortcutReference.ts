// ── Zentrale Shortcut-Referenz (eine Quelle für Hilfe-Tab + Cheat-Sheet) ─────
// Registrierte Kürzel werden über label(id) aus shortcuts.ts aufgelöst → Anzeige,
// Handler und QWERTZ/QWERTY/Mac-Labels bleiben garantiert synchron. Native Tasten
// (Pfeile, Pos1/Ende, Tab, Enter, Bild blank) sind als Klartext geführt.

export interface RefRow { keys: string; desc: string }
export interface RefGroup { title: string; color: string; icon: string; rows: RefRow[] }

/**
 * Baut die gruppierte Kürzel-Referenz.
 * @param label  useShortcut().label — löst Registry-IDs zu plattformkorrekten Labels auf
 * @param mod    'Strg' | '⌘'
 * @param alt    'Alt'  | '⌥'
 */
export function buildShortcutGroups(
  label: (id: string) => string,
  mod: string,
  alt: string,
): RefGroup[] {
  return [
    {
      title: 'Szenen & Folgen', color: '#007AFF', icon: '🎬',
      rows: [
        { keys: '← / →', desc: 'Szene wechseln (außerhalb des Textes)' },
        { keys: `${label('scenePrev')} / ${label('sceneNext')}`, desc: 'Szene wechseln (auch im Editor)' },
        { keys: `${mod}+${alt}+↑ / ↓`, desc: 'Szene wechseln (Laptop-Alias, v. a. Mac)' },
        { keys: `${label('folgePrev')} / ${label('folgeNext')}`, desc: 'Folge wechseln' },
        { keys: label('gotoSzene'), desc: 'Gehe zu Szene …' },
        { keys: 'Mausrad am Rand', desc: 'Overscroll → vorherige / nächste Szene' },
      ],
    },
    {
      title: 'Editor · Text & Cursor', color: '#757575', icon: '⌨',
      rows: [
        { keys: 'Pfeile', desc: 'Zeichen / Zeile' },
        { keys: `${mod}+← / →`, desc: 'ein Wort weiter' },
        { keys: `${mod}+↑ / ↓`, desc: 'ein Absatz weiter' },
        { keys: 'Pos1 / Ende', desc: 'Zeilenanfang / -ende' },
        { keys: `${label('editorGotoStart')} / ${label('editorGotoEnd')}`, desc: 'Szenenanfang / -ende' },
        { keys: 'Bild ↑ / ↓', desc: 'im Szenentext scrollen' },
      ],
    },
    {
      title: 'Editor · Elemente', color: '#FF9500', icon: '✍',
      rows: [
        { keys: 'Tab', desc: 'zum nächsten Elementtyp' },
        { keys: 'Enter', desc: 'neues Element in Standardfolge' },
        { keys: `${alt}+1 … 7`, desc: 'Elementtyp setzen (Szenenkopf … Shot)' },
        { keys: `${label('undo')} / ${label('redo')}`, desc: 'Rückgängig / Wiederholen' },
        { keys: `${mod}+Shift+L / E / R`, desc: 'Ausrichtung links / mittig / rechts' },
      ],
    },
    {
      title: 'Befehle, Ansicht & Hilfe', color: '#00C853', icon: '⌘',
      rows: [
        { keys: `${mod}+K`, desc: 'Befehlspalette' },
        { keys: '?', desc: 'diese Kürzel-Übersicht' },
        { keys: 'F6 / Shift+F6', desc: 'Bereich wechseln (Liste ↔ Editor)' },
        { keys: label('focusMode'), desc: 'Fokus-Modus an/aus' },
        { keys: 'Esc', desc: 'Fokus-Modus / Dialog verlassen' },
        { keys: label('viewSettings'), desc: 'Ansichts-Einstellungen' },
        { keys: `${mod}+H`, desc: 'Suchen & Ersetzen' },
      ],
    },
    {
      title: 'App-Navigation (Alt + …)', color: '#AF52DE', icon: '📂',
      rows: [
        { keys: label('navEpisoden'), desc: 'Episoden' },
        { keys: label('navRollen'), desc: 'Rollen' },
        { keys: label('navKomparsen'), desc: 'Komparsen' },
        { keys: label('navMotive'), desc: 'Motive' },
        { keys: label('navStatistik'), desc: 'Statistik' },
        { keys: label('navBesetzung'), desc: 'Besetzungsmatrix' },
        { keys: label('navFreieDokumente'), desc: 'Freie Dokumente' },
        { keys: label('navDrehbuchkoordination'), desc: 'Drehbuchkoordination' },
        { keys: label('navExport'), desc: 'Export' },
        { keys: label('navHandbuch'), desc: 'Handbuch' },
        { keys: label('navNtListe'), desc: 'NT-Liste' },
        { keys: label('navFreigaben'), desc: 'Freigaben' },
      ],
    },
    {
      title: 'Bereiche', color: '#1E9FD0', icon: '🗂',
      rows: [
        { keys: label('bereichScript'), desc: 'Bereich Script' },
        { keys: label('bereichKonzept'), desc: 'Bereich Konzept' },
        { keys: label('bereichAnalyse'), desc: 'Bereich Analyse' },
      ],
    },
  ]
}
