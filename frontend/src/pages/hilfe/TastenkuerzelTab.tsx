// ── Hilfe-Tab: Tastenkürzel ─────────────────────────────────────────────────
// Vollständige Übersicht aller Kürzel. Registrierte Kürzel werden über
// useShortcut().label(id) aus der zentralen Registry (shortcuts.ts) gezogen —
// so bleiben Anzeige, Handler und QWERTZ/QWERTY/Mac-Labels garantiert synchron.
// Native Tasten (Pfeile, Pos1/Ende, Tab, Enter) sind bewusst als Klartext geführt.
import { C, Section } from './_shared'
import { useShortcut } from '../../hooks/useShortcut'

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      display: 'inline-block', fontFamily: 'monospace', fontSize: 11, fontWeight: 600,
      color: C.text, background: 'var(--bg-subtle)', border: `1px solid ${C.border}`,
      borderRadius: 5, padding: '2px 7px', whiteSpace: 'nowrap', lineHeight: 1.4,
    }}>{children}</span>
  )
}

function Row({ keys, desc }: { keys: string; desc: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '5px 0', borderBottom: `1px solid ${C.border}` }}>
      <div style={{ flex: '0 0 168px' }}><Kbd>{keys}</Kbd></div>
      <div style={{ flex: 1, fontSize: 13, color: C.text }}>{desc}</div>
    </div>
  )
}

function Card({ color, icon, title, children }: { color: string; icon: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', background: 'var(--bg-surface)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderLeft: `4px solid ${color}`, fontWeight: 700, fontSize: 14, color }}>
        <span>{icon}</span><span>{title}</span>
      </div>
      <div style={{ padding: '4px 14px 12px' }}>{children}</div>
    </div>
  )
}

export default function TastenkuerzelTab() {
  const { label, isMac } = useShortcut()
  const mod = isMac ? '⌘' : 'Strg'
  const alt = isMac ? '⌥' : 'Alt'

  return (
    <div>
      <Section title="Tastenkürzel">
        <p style={{ fontSize: 13, color: C.muted, marginTop: 0 }}>
          Alle Kürzel auf einen Blick. Die Belegung folgt der <strong>physischen Tastenposition</strong> —
          QWERTZ und QWERTY werden automatisch erkannt. {isMac ? 'Auf dem Mac wird ⌘/⌥ angezeigt.' : 'Auf dem Mac stehen ⌘/⌥ statt Strg/Alt.'}
          {' '}Eine druckbare Grafik liegt im Repo unter <code>tastatur-kurzbefehle.svg</code>.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16, marginTop: 16 }}>

          <Card color={C.blue} icon="🎬" title="Szenen & Folgen">
            <Row keys="← / →" desc="Szene wechseln (außerhalb des Textes)" />
            <Row keys={`${label('scenePrev')} / ${label('sceneNext')}`} desc="Szene wechseln (auch im Editor)" />
            <Row keys={`${mod}+${alt}+↑ / ↓`} desc="Szene wechseln (Laptop-Alias, v. a. Mac)" />
            <Row keys={`${label('folgePrev')} / ${label('folgeNext')}`} desc="Folge wechseln" />
            <Row keys={label('gotoSzene')} desc="Gehe zu Szene …" />
            <Row keys="Mausrad am Rand" desc="Overscroll → vorherige / nächste Szene" />
          </Card>

          <Card color={C.gray} icon="⌨" title="Editor · Text & Cursor">
            <Row keys="Pfeile" desc="Zeichen / Zeile" />
            <Row keys={`${mod}+← / →`} desc="ein Wort weiter" />
            <Row keys={`${mod}+↑ / ↓`} desc="ein Absatz weiter" />
            <Row keys="Pos1 / Ende" desc="Zeilenanfang / -ende" />
            <Row keys={`${label('editorGotoStart')} / ${label('editorGotoEnd')}`} desc="Szenenanfang / -ende" />
            <Row keys="Bild ↑ / ↓" desc="im Szenentext scrollen" />
          </Card>

          <Card color={C.orange} icon="✍" title="Editor · Elemente">
            <Row keys="Tab" desc="zum nächsten Elementtyp" />
            <Row keys="Enter" desc="neues Element in Standardfolge" />
            <Row keys={`${alt}+1 … 7`} desc="Elementtyp setzen (Szenenkopf … Shot)" />
            <Row keys={`${label('undo')} / ${label('redo')}`} desc="Rückgängig / Wiederholen" />
            <Row keys={`${mod}+Shift+L / E / R`} desc="Ausrichtung links / mittig / rechts" />
          </Card>

          <Card color={C.green} icon="⌘" title="Befehle, Ansicht & Hilfe">
            <Row keys={label('focusMode')} desc="Fokus-Modus an/aus" />
            <Row keys="Esc" desc="Fokus-Modus / Dialog verlassen" />
            <Row keys={label('viewSettings')} desc="Ansichts-Einstellungen" />
            <Row keys={`${mod}+H`} desc="Suchen & Ersetzen" />
            <Row keys={`${mod}+K`} desc="Befehlspalette (folgt)" />
            <Row keys="?" desc="diese Kürzel-Übersicht (folgt)" />
          </Card>

          <Card color={C.purple} icon="📂" title="App-Navigation (Alt + …)">
            <Row keys={label('navEpisoden')} desc="Episoden" />
            <Row keys={label('navRollen')} desc="Rollen" />
            <Row keys={label('navKomparsen')} desc="Komparsen" />
            <Row keys={label('navMotive')} desc="Motive" />
            <Row keys={label('navStatistik')} desc="Statistik" />
            <Row keys={label('navBesetzung')} desc="Besetzungsmatrix" />
            <Row keys={label('navFreieDokumente')} desc="Freie Dokumente" />
            <Row keys={label('navDrehbuchkoordination')} desc="Drehbuchkoordination" />
            <Row keys={label('navExport')} desc="Export" />
            <Row keys={label('navHandbuch')} desc="Handbuch" />
            <Row keys={label('navNtListe')} desc="NT-Liste" />
            <Row keys={label('navFreigaben')} desc="Freigaben" />
          </Card>

          <Card color="#1E9FD0" icon="🗂" title="Bereiche">
            <Row keys={label('bereichScript')} desc="Bereich Script" />
            <Row keys={label('bereichKonzept')} desc="Bereich Konzept" />
            <Row keys={label('bereichAnalyse')} desc="Bereich Analyse" />
          </Card>

        </div>

        <p style={{ fontSize: 11.5, color: C.muted, marginTop: 18 }}>
          Hinweis: <Kbd>{mod}+Bild auf/ab</Kbd> ist <strong>nicht</strong> belegt — diese Kombination ist vom
          Browser fest für den Tab-Wechsel reserviert und lässt sich nicht abfangen. Deshalb läuft der
          Szenenwechsel über <Kbd>{alt}+Bild auf/ab</Kbd>.
        </p>
      </Section>
    </div>
  )
}
