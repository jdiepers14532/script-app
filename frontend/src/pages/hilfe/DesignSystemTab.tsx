import { C, InfoBox } from './_shared'
import { BUILTIN_COLOR_SCHEMES } from '../../components/appShellConstants'

function ColorChip({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      <div style={{
        width: 36, height: 36, borderRadius: 8, background: value, flexShrink: 0,
        border: '1px solid rgba(0,0,0,0.1)',
      }} />
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.text, fontFamily: 'monospace' }}>{label}</div>
        <div style={{ fontSize: 11, color: C.muted, fontFamily: 'monospace' }}>{value}</div>
      </div>
    </div>
  )
}

function TokenRow({ name, desc }: { name: string; desc: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '5px 0', borderBottom: `1px solid ${C.border}`, alignItems: 'flex-start' }}>
      <code style={{ fontSize: 11, color: C.blue, fontFamily: 'monospace', minWidth: 220, flexShrink: 0 }}>{name}</code>
      <span style={{ fontSize: 12, color: C.muted }}>{desc}</span>
    </div>
  )
}

const h2Style: React.CSSProperties = {
  fontSize: 15, fontWeight: 700, margin: '32px 0 10px 0',
  paddingBottom: 8, borderBottom: `2px solid ${C.border}`,
  color: C.text,
}
const pStyle: React.CSSProperties = {
  fontSize: 13, color: C.muted, lineHeight: 1.7, margin: '0 0 12px 0',
}
const boxStyle: React.CSSProperties = {
  background: C.surface, border: `1px solid ${C.border}`,
  borderRadius: 10, padding: '16px 20px', marginBottom: 8,
}

export default function DesignSystemTab() {
  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 0 40px' }}>

      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px 0', color: C.text }}>Design-System</h1>
      <p style={{ ...pStyle, fontSize: 14 }}>
        Alle Farben der Script-App sind in einer einzigen Datei definiert und über drei Ebenen
        hierarchisch strukturiert. Das ermöglicht globale Farbänderungen ohne einzelne Komponenten
        anfassen zu müssen.
      </p>

      {/* ── Ebene 1 ── */}
      <h2 style={h2Style}>Ebene 1 — Brand Raw Tokens</h2>
      <p style={pStyle}>
        Die unterste Ebene definiert die <strong>rohen Markenwerte</strong> als benannte CSS Custom Properties.
        Sie sind theme-unabhängig und stehen in <code>tokens.css</code> unter <code>:root</code>.
        Hier eine Farbe zu ändern wirkt sich sofort auf alle Stellen aus, die das Token verwenden.
      </p>
      <div style={boxStyle}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
          <ColorChip value="#00C853" label="--sw-green" />
          <ColorChip value="#007AFF" label="--sw-info" />
          <ColorChip value="#FF3B30" label="--sw-danger" />
          <ColorChip value="#FFCC00" label="--sw-warning" />
          <ColorChip value="#FF9500" label="--sw-warning-alt" />
          <ColorChip value="#000000" label="--sw-black" />
          <ColorChip value="#FFFFFF" label="--sw-white" />
          <ColorChip value="#757575" label="--sw-gray-secondary" />
        </div>
        <InfoBox title="Hinweis" color={C.blue}>
          Diese Werte werden durch das <strong>Farbschema</strong>-System überschrieben
          via <code>document.documentElement.style.setProperty()</code> — Inline-Style hat
          höhere CSS-Spezifität als Stylesheet-Regeln.
        </InfoBox>
      </div>

      {/* ── Ebene 2 ── */}
      <h2 style={h2Style}>Ebene 2 — Semantische Tokens</h2>
      <p style={pStyle}>
        Die mittlere Ebene mappt die Brand-Tokens auf <strong>bedeutungsbasierte Variablen</strong>.
        Für jedes Theme gibt es einen eigenen Block in <code>tokens.css</code>.
        Komponenten verwenden ausschließlich diese Variablen — nie direkte Farbwerte.
      </p>
      <div style={boxStyle}>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Hintergrund</div>
            <TokenRow name="--bg-page"    desc="Seiten-Hintergrund" />
            <TokenRow name="--bg-surface" desc="Karten, Panels" />
            <TokenRow name="--bg-subtle"  desc="Inputs, inaktive Bereiche" />
            <TokenRow name="--bg-active"  desc="Aktiver Listeneintrag" />
            <TokenRow name="--bg-hover"   desc="Hover-Zustand" />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Text &amp; Border</div>
            <TokenRow name="--text-primary"   desc="Haupt-Textfarbe" />
            <TokenRow name="--text-secondary" desc="Labels, Hilfstexte" />
            <TokenRow name="--text-muted"     desc="Deaktiviert, Timestamps" />
            <TokenRow name="--text-inverse"   desc="Text auf dunklem Hintergrund" />
            <TokenRow name="--border"         desc="Trennlinien, Rahmen" />
            <TokenRow name="--border-subtle"  desc="Sehr feine Trennlinien" />
          </div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
          Theme-Blöcke in tokens.css
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: C.subtle }}>
              <th style={{ textAlign: 'left', padding: '6px 10px', border: `1px solid ${C.border}`, color: C.muted }}>Selektor</th>
              <th style={{ textAlign: 'left', padding: '6px 10px', border: `1px solid ${C.border}`, color: C.muted }}>Wird aktiviert durch</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["`:root, [data-theme='light']`", 'Standard (Hell-Theme, Default)'],
              ["[data-theme='dark']",           'Theme = Dunkel (User-Einstellung)'],
              ["[data-mode='focus']",           'Fokus-Modus (Alt+Z) — warme, minimale Töne'],
            ].map(([sel, note]) => (
              <tr key={sel}>
                <td style={{ padding: '6px 10px', border: `1px solid ${C.border}` }}><code style={{ fontSize: 11 }}>{sel}</code></td>
                <td style={{ padding: '6px 10px', border: `1px solid ${C.border}`, color: C.muted }}>{note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Ebene 3 ── */}
      <h2 style={h2Style}>Ebene 3 — Komponentenklassen (app.css)</h2>
      <p style={pStyle}>
        <code>app.css</code> enthält alle Layout- und Komponentenregeln. Farben werden
        ausschließlich über semantische Tokens referenziert — nie als Hardcode-Werte.
        Jede Farbänderung auf Ebene 1 oder 2 zieht sich automatisch durch alle Komponenten.
      </p>
      <div style={boxStyle}>
        <pre style={{ fontSize: 12, color: C.muted, margin: 0, lineHeight: 1.7, overflow: 'auto' }}>{`/* Beispiel aus app.css */
.topbar {
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
}

.btn-primary {
  background: var(--btn-primary-bg);   /* = schwarz (hell) / weiß (dunkel) */
  color: var(--btn-primary-color);
}`}</pre>
        <InfoBox title="Ausnahmen" color={C.orange}>
          Vereinzelte Hardcode-Farben in app.css: <code>#ffe566</code> (Mark-Highlight im Editor),{' '}
          <code>rgba(0,122,255,0.2)</code> (Textauswahl). Diese sind bewusst fest und ändern
          sich nicht mit dem Farbschema.
        </InfoBox>
      </div>

      {/* ── Farbschema-System ── */}
      <h2 style={h2Style}>Farbschema-System</h2>
      <p style={pStyle}>
        Das Farbschema steuert die <strong>5 Brand-Akzentfarben</strong> (Ebene 1) zur Laufzeit.
        Es ist unabhängig von Theme (Hell/Dunkel) und Hintergrundfarbe — alle drei Dimensionen
        sind orthogonal kombinierbar.
      </p>
      <div style={boxStyle}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          {BUILTIN_COLOR_SCHEMES.map(scheme => (
            <div key={scheme.id} style={{
              background: C.subtle, borderRadius: 8, padding: '10px 14px',
              border: `1px solid ${C.border}`, minWidth: 148,
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 6 }}>{scheme.name}</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {Object.values(scheme.colors).map((c, i) => (
                  <div key={i} style={{ width: 18, height: 18, borderRadius: 4, background: c, border: '1px solid rgba(0,0,0,0.1)' }} />
                ))}
              </div>
            </div>
          ))}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 12 }}>
          <thead>
            <tr style={{ background: C.subtle }}>
              <th style={{ textAlign: 'left', padding: '6px 10px', border: `1px solid ${C.border}`, color: C.muted }}>Dimension</th>
              <th style={{ textAlign: 'left', padding: '6px 10px', border: `1px solid ${C.border}`, color: C.muted }}>Speicherort</th>
              <th style={{ textAlign: 'left', padding: '6px 10px', border: `1px solid ${C.border}`, color: C.muted }}>Einstellen via</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Theme (Hell/Dunkel)',    'ui_settings.theme (Backend)',                    'Ansicht → Darstellung'],
              ['Hintergrundfarbe',       'ui_settings.lightBgIndex (Backend)',             'Ansicht → Hintergrundfarbe'],
              ['Farbschema (Akzent)',    'ui_settings.activeColorSchemeId (Backend)\n+ custom in localStorage',
                                                                                           'Ansicht → Farbschema ändern'],
            ].map(([dim, store, where]) => (
              <tr key={dim}>
                <td style={{ padding: '6px 10px', border: `1px solid ${C.border}`, fontWeight: 500, color: C.text }}>{dim}</td>
                <td style={{ padding: '6px 10px', border: `1px solid ${C.border}` }}><code style={{ fontSize: 11 }}>{store}</code></td>
                <td style={{ padding: '6px 10px', border: `1px solid ${C.border}`, color: C.muted }}>{where}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Technische Umsetzung ── */}
      <h2 style={h2Style}>Technische Umsetzung</h2>
      <p style={pStyle}>
        Farbschemata werden per <code>document.documentElement.style.setProperty()</code> als
        Inline-Style auf <code>:root</code> gesetzt. Inline-Styles haben höhere CSS-Spezifität
        als alle Stylesheet-Regeln — kein <code>!important</code> nötig, sofort wirksam, kein Reload.
      </p>
      <div style={boxStyle}>
        <pre style={{ fontSize: 12, color: C.muted, margin: 0, lineHeight: 1.7, overflow: 'auto' }}>{`// AppShell.tsx — Farbschema-Effekt
useEffect(() => {
  const scheme = resolveColorScheme(tweaks.activeColorSchemeId)
  const el = document.documentElement
  el.style.setProperty('--sw-green',       scheme.colors.green)
  el.style.setProperty('--sw-info',        scheme.colors.info)
  el.style.setProperty('--sw-danger',      scheme.colors.danger)
  el.style.setProperty('--sw-warning',     scheme.colors.warning)
  el.style.setProperty('--sw-warning-alt', scheme.colors.warningAlt)
}, [tweaks.activeColorSchemeId])`}</pre>
        <InfoBox title="Dateien" color={C.blue}>
          <strong>Built-in Schemata:</strong> <code>appShellConstants.ts → BUILTIN_COLOR_SCHEMES</code><br />
          <strong>Benutzerdefiniert:</strong> <code>localStorage['script-color-schemes-v1']</code> (JSON-Array)<br />
          <strong>Aktive ID:</strong> <code>ui_settings.activeColorSchemeId</code> — automatisch im JSONB gespeichert,
          kein DB-Migration nötig.
        </InfoBox>
      </div>
    </div>
  )
}
