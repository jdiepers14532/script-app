import { useNavigate } from 'react-router-dom'
import { C, InfoBox } from './_shared'

function TokenVisual({ cssVar, label, desc }: { cssVar: string; label: string; desc: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
      <div style={{
        width: 36, height: 36, borderRadius: 8, background: `var(${cssVar})`,
        border: '1.5px solid rgba(0,0,0,0.1)', flexShrink: 0,
      }} />
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{label}</span>
          <code style={{ fontSize: 10, color: C.blue, fontFamily: 'monospace' }}>{cssVar}</code>
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{desc}</div>
      </div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.7, color: C.muted, margin: '28px 0 10px' }}>
      {children}
    </div>
  )
}

export default function ThemeAnpassenHilfeTab() {
  const navigate = useNavigate()

  return (
    <div style={{ padding: '28px 32px', maxWidth: 760, color: C.text }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 6px' }}>Theme & Farben</h1>
      <p style={{ fontSize: 14, color: C.muted, marginBottom: 24, lineHeight: 1.6 }}>
        Das Light-Theme der App lässt sich vollständig anpassen — ohne Code-Kenntnisse.
        Alle Änderungen sind sofort sichtbar und bleiben auch nach dem Neuladen erhalten.
      </p>

      {/* CTA */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 20px', marginBottom: 28,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 3 }}>Theme anpassen öffnen</div>
          <div style={{ fontSize: 12, color: C.muted }}>
            Ansicht öffnen (oben rechts oder Shortcut) → Button <strong>„Theme anpassen"</strong>
          </div>
        </div>
        <button
          onClick={() => navigate('/theme-anpassen')}
          style={{
            background: C.text, color: '#fff', border: 'none', borderRadius: 7,
            padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Jetzt öffnen →
        </button>
      </div>

      <InfoBox>
        Das <strong>Dark-Theme</strong> ist nicht editierbar — es wechselt automatisch auf optimierte Dunkel-Werte,
        wenn du im Ansicht-Modal auf „Dunkel" umschaltest. Deine Light-Anpassungen bleiben dabei erhalten.
      </InfoBox>

      <SectionTitle>Was kann ich anpassen?</SectionTitle>

      <p style={{ fontSize: 13, color: C.muted, marginBottom: 14, lineHeight: 1.6 }}>
        Alle Farb-Tokens wirken <strong>global</strong> — eine Änderung an <code style={{ fontFamily: 'monospace', background: 'rgba(0,0,0,0.05)', padding: '0 3px', borderRadius: 3 }}>--bg-surface</code> zum Beispiel
        verändert sofort alle Karten, Panels und Modals in der gesamten App.
      </p>

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '0 16px' }}>
        <TokenVisual cssVar="--bg-page"    label="Seitenhintergrund"    desc="Der äußerste Hintergrund der App" />
        <TokenVisual cssVar="--bg-surface" label="Karten & Panels"      desc="Modals, Cards, Seitenleisten — leicht von der Seite abgesetzt" />
        <TokenVisual cssVar="--bg-subtle"  label="Abschnittsflächen"    desc="Fieldsets, Hinweis-Boxen, Listen-Hintergründe" />
        <TokenVisual cssVar="--bg-hover"   label="Hover-Zustand"        desc="Reaktion wenn man über ein Element fährt" />
        <TokenVisual cssVar="--text-primary"   label="Haupttext"        desc="Überschriften, Inhaltstext" />
        <TokenVisual cssVar="--text-secondary" label="Nebentext"        desc="Labels, Beschreibungen" />
        <TokenVisual cssVar="--text-muted"     label="Gedämpfter Text"  desc="Hinweise, Metadaten, Zeitstempel" />
        <TokenVisual cssVar="--border"         label="Trennlinien"      desc="Standard-Rahmen und Trennstriche" />
        <TokenVisual cssVar="--btn-primary-bg" label="Button-Farbe"     desc="Hintergrund von Aktions-Buttons" />
        <div style={{ padding: '8px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--notif-unread)', border: '1.5px solid rgba(0,0,0,0.1)', flexShrink: 0 }} />
            <div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>Ungelesen-Markierung</span>
                <code style={{ fontSize: 10, color: C.blue, fontFamily: 'monospace' }}>--notif-unread</code>
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>Hintergrund für ungelesene Badges und Markierungen</div>
            </div>
          </div>
        </div>
      </div>

      <SectionTitle>Wie funktioniert es technisch?</SectionTitle>
      <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 10 }}>
        Die App verwendet <strong>CSS Custom Properties</strong> (auch CSS-Variablen genannt). Jede Farbe ist an einer
        zentralen Stelle definiert und wird in der ganzen App referenziert. Wenn du eine Variable änderst, zieht
        die Änderung sofort durch alle Komponenten.
      </p>
      <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 10 }}>
        Deine Anpassungen werden im Browser-Speicher (<code style={{ fontFamily: 'monospace', fontSize: 11 }}>localStorage</code>) gespeichert und beim nächsten
        Öffnen automatisch wiederhergestellt.
      </p>
      <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
        Mit <strong>„Auf System-Standard"</strong> kannst du alle Anpassungen zurücksetzen — die App kehrt dann zu den
        Original-Farben aus der zentralen Tokendatei zurück.
      </p>

      <SectionTitle>Statusfarben (nicht editierbar)</SectionTitle>
      <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 14 }}>
        Einige Farben sind semantisch festgelegt und nicht über den Theme-Editor veränderbar,
        da sie eine feste Bedeutung für alle Nutzer haben:
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[
          { color: '#00C853', label: 'Erfolg / Aktiv', bg: 'rgba(0,200,83,0.08)' },
          { color: '#FF3B30', label: 'Fehler / Gefahr', bg: 'rgba(255,59,48,0.08)' },
          { color: '#FF9500', label: 'Warnung', bg: 'rgba(255,149,0,0.10)' },
          { color: '#007AFF', label: 'Information', bg: 'rgba(0,122,255,0.08)' },
        ].map(s => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 10, background: s.bg, border: `1px solid ${s.color}33`, borderRadius: 8, padding: '8px 12px' }}>
            <div style={{ width: 14, height: 14, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: C.text }}>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
