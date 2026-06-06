// ── Hilfe-Tab: Tastenkürzel ─────────────────────────────────────────────────
// Rendert die zentrale Kürzel-Referenz (data/shortcutReference.ts) — dieselbe Quelle
// wie das Cheat-Sheet (?) und die Befehlspalette. Registry-Labels via useShortcut().
import { C, Section } from './_shared'
import { useShortcut } from '../../hooks/useShortcut'
import { buildShortcutGroups } from '../../data/shortcutReference'

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      display: 'inline-block', fontFamily: 'monospace', fontSize: 11, fontWeight: 600,
      color: C.text, background: 'var(--bg-subtle)', border: `1px solid ${C.border}`,
      borderRadius: 5, padding: '2px 7px', whiteSpace: 'nowrap', lineHeight: 1.4,
    }}>{children}</span>
  )
}

export default function TastenkuerzelTab() {
  const { label, isMac } = useShortcut()
  const mod = isMac ? '⌘' : 'Strg'
  const alt = isMac ? '⌥' : 'Alt'
  const groups = buildShortcutGroups(label, mod, alt)

  return (
    <div>
      <Section title="Tastenkürzel">
        <p style={{ fontSize: 13, color: C.muted, marginTop: 0 }}>
          Alle Kürzel auf einen Blick — jederzeit auch per <Kbd>?</Kbd> als Overlay oder per{' '}
          <Kbd>{mod}+K</Kbd> als durchsuchbare Befehlspalette. Die Belegung folgt der{' '}
          <strong>physischen Tastenposition</strong> (QWERTZ und QWERTY automatisch erkannt).
          {isMac ? ' Auf dem Mac werden ⌘/⌥ angezeigt.' : ' Auf dem Mac stehen ⌘/⌥ statt Strg/Alt.'}
          {' '}Druckbare Grafik im Repo: <code>tastatur-kurzbefehle.svg</code>.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16, marginTop: 16 }}>
          {groups.map(g => (
            <div key={g.title} style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', background: 'var(--bg-surface)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderLeft: `4px solid ${g.color}`, fontWeight: 700, fontSize: 14, color: g.color }}>
                <span>{g.icon}</span><span>{g.title}</span>
              </div>
              <div style={{ padding: '4px 14px 12px' }}>
                {g.rows.map((r, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '5px 0', borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ flex: '0 0 168px' }}><Kbd>{r.keys}</Kbd></div>
                    <div style={{ flex: 1, fontSize: 13, color: C.text }}>{r.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p style={{ fontSize: 11.5, color: C.muted, marginTop: 18 }}>
          Hinweis: <Kbd>{mod}+Bild auf/ab</Kbd> ist <strong>nicht</strong> belegt — diese Kombination ist
          vom Browser fest für den Tab-Wechsel reserviert und lässt sich nicht abfangen. Der Szenenwechsel
          läuft daher über <Kbd>{alt}+Bild auf/ab</Kbd>.
        </p>
      </Section>
    </div>
  )
}
