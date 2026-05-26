import { C, InfoBox } from './_shared'
import { BUILTIN_COLOR_SCHEMES } from '../../components/appShellConstants'

// ── Hilfselemente ─────────────────────────────────────────────────────────────

function Swatch({ value }: { value: string }) {
  const isVar = value.startsWith('var(')
  return (
    <div style={{
      width: 18, height: 18, borderRadius: 4, flexShrink: 0, display: 'inline-block',
      background: isVar ? value : value,
      border: '1px solid rgba(0,0,0,0.15)',
      verticalAlign: 'middle', marginRight: 6,
    }} />
  )
}

function TR({ token, light, dark, focus, desc }: {
  token: string; light?: string; dark?: string; focus?: string; desc?: string
}) {
  const cell: React.CSSProperties = { padding: '6px 10px', border: `1px solid ${C.border}`, verticalAlign: 'middle' }
  const code: React.CSSProperties = { fontSize: 11, fontFamily: 'monospace', color: C.blue }
  const val: React.CSSProperties = { fontSize: 11, fontFamily: 'monospace', color: C.muted, display: 'flex', alignItems: 'center' }
  return (
    <tr>
      <td style={cell}><code style={code}>{token}</code>{desc && <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{desc}</div>}</td>
      <td style={cell}>{light ? <span style={val}><Swatch value={light} />{light}</span> : <span style={{ color: C.muted, fontSize: 11 }}>—</span>}</td>
      <td style={cell}>{dark  ? <span style={val}><Swatch value={dark}  />{dark}</span>  : <span style={{ color: C.muted, fontSize: 11 }}>—</span>}</td>
      <td style={cell}>{focus ? <span style={val}><Swatch value={focus} />{focus}</span> : <span style={{ color: C.muted, fontSize: 11 }}>—</span>}</td>
    </tr>
  )
}

function THead() {
  const th: React.CSSProperties = { textAlign: 'left', padding: '7px 10px', border: `1px solid ${C.border}`, background: C.subtle, color: C.muted, fontSize: 11, fontWeight: 700 }
  return (
    <thead>
      <tr>
        <th style={{ ...th, minWidth: 220 }}>Token</th>
        <th style={{ ...th, minWidth: 180 }}>Light (Default)</th>
        <th style={{ ...th, minWidth: 180 }}>Dark</th>
        <th style={{ ...th, minWidth: 160 }}>Focus</th>
      </tr>
    </thead>
  )
}

function StaticTR({ token, value, desc }: { token: string; value: string; desc?: string }) {
  const cell: React.CSSProperties = { padding: '6px 10px', border: `1px solid ${C.border}`, verticalAlign: 'middle' }
  return (
    <tr>
      <td style={cell}><code style={{ fontSize: 11, fontFamily: 'monospace', color: C.blue }}>{token}</code>{desc && <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{desc}</div>}</td>
      <td style={{ ...cell, fontSize: 11, fontFamily: 'monospace', color: C.muted }} colSpan={3}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {value.startsWith('#') && <Swatch value={value} />}
          {value}
        </span>
      </td>
    </tr>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <tr style={{ background: '#f0f4ff' }}>
      <td colSpan={4} style={{ padding: '5px 10px', fontSize: 11, fontWeight: 700, color: '#3366cc', border: `1px solid ${C.border}`, letterSpacing: 0.3 }}>
        {children}
      </td>
    </tr>
  )
}

const h2: React.CSSProperties = { fontSize: 15, fontWeight: 700, margin: '36px 0 10px', paddingBottom: 8, borderBottom: `2px solid ${C.border}`, color: C.text }
const p: React.CSSProperties = { fontSize: 13, color: C.muted, lineHeight: 1.7, margin: '0 0 12px' }
const box: React.CSSProperties = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '16px 20px', marginBottom: 12 }

// ── Haupt-Tab ─────────────────────────────────────────────────────────────────

export default function DesignSystemTab() {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 0 48px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px', color: C.text }}>Design-System (Admin)</h1>
      <p style={{ ...p, fontSize: 14 }}>
        Vollständige Referenz aller CSS Custom Properties, Theme-Blöcke und technischen Details.
        Für den User-Überblick: <strong>Hilfe → Theme &amp; Farben</strong>.
      </p>

      {/* ── Vollständige Token-Referenz ── */}
      <h2 style={h2}>Vollständige Token-Referenz</h2>
      <p style={p}>
        Alle CSS Custom Properties aus <code style={{ fontFamily: 'monospace' }}>frontend/src/styles/tokens.css</code>.
        Theme-gesteuerte Tokens haben unterschiedliche Werte pro Theme-Block.
        Statische Tokens (kursiv grau) gelten für alle Themes gleich.
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <THead />
          <tbody>

            {/* ── Brand-Farben ── */}
            <SectionLabel>Brand-Farben (Rohtokens) — statisch, theme-unabhängig</SectionLabel>
            <StaticTR token="--sw-black"          value="#000000"  desc="Schwarz" />
            <StaticTR token="--sw-white"          value="#FFFFFF"  desc="Weiß" />
            <StaticTR token="--sw-green"          value="#00C853"  desc="Aktiv, Erfolg" />
            <StaticTR token="--sw-danger"         value="#FF3B30"  desc="Fehler, Löschen" />
            <StaticTR token="--sw-warning"        value="#FFCC00"  desc="Warnung (gelb)" />
            <StaticTR token="--sw-warning-alt"    value="#FF9500"  desc="Warnung (orange), C2-Klasse" />
            <StaticTR token="--sw-info"           value="#007AFF"  desc="Info, Links, Focus" />
            <StaticTR token="--sw-gray-surface"   value="#F5F5F5"  desc="Grau-Fläche (Rohwert)" />
            <StaticTR token="--sw-gray-border"    value="#E0E0E0"  desc="Grau-Border (Rohwert)" />
            <StaticTR token="--sw-gray-secondary" value="#757575"  desc="Grau-Text (Rohwert)" />
            <StaticTR token="--sw-gray-900"       value="#1a1a1a"  desc="Fast-Schwarz" />

            {/* ── Semantische Status-Tokens ── */}
            <SectionLabel>Semantische Status-Tokens — statisch, bedeutungsbasiert</SectionLabel>
            <StaticTR token="--color-success"    value="#00C853"              desc="Erfolg — Textfarbe" />
            <StaticTR token="--color-success-bg" value="rgba(0,200,83,0.08)" desc="Erfolg — Hintergrund" />
            <StaticTR token="--color-danger"     value="#FF3B30"              desc="Fehler — Textfarbe" />
            <StaticTR token="--color-danger-bg"  value="rgba(255,59,48,0.08)" desc="Fehler — Hintergrund" />
            <StaticTR token="--color-warning"    value="#FF9500"              desc="Warnung — Textfarbe" />
            <StaticTR token="--color-warning-bg" value="rgba(255,149,0,0.10)" desc="Warnung — Hintergrund" />
            <StaticTR token="--color-info"       value="#007AFF"              desc="Info — Textfarbe" />
            <StaticTR token="--color-info-bg"    value="rgba(0,122,255,0.08)" desc="Info — Hintergrund" />

            {/* ── Hintergründe ── */}
            <SectionLabel>Hintergründe — theme-gesteuert</SectionLabel>
            <TR token="--bg-page"    desc="Äußerster Seitenhintergrund"       light="#FFFFFF"  dark="#0D0D0D"  focus="#FAFAF8" />
            <TR token="--bg-surface" desc="Karten, Panels, Modals"            light="#FAFAFA"  dark="#181818"  focus="#FFFFFF" />
            <TR token="--bg-subtle"  desc="Fieldsets, Hinweis-Boxen"          light="#F5F5F5"  dark="#1A1A1A"  focus="#F0EFED" />
            <TR token="--bg-active"  desc="Aktiver Menüeintrag, selected"     light="#F5F5F5"  dark="#1F1F1F"  focus="#ECEAE6" />
            <TR token="--bg-hover"   desc="Hover-Zustand"                     light="#EDEDED"  dark="#262626" />

            {/* ── Texte ── */}
            <SectionLabel>Texte — theme-gesteuert</SectionLabel>
            <TR token="--text-primary"   desc="Haupttext, Überschriften"      light="#000000"  dark="#FFFFFF"  focus="#111111" />
            <TR token="--text-secondary" desc="Labels, Hilfstexte"            light="#757575"  dark="#A0A0A0"  focus="#767470" />
            <TR token="--text-muted"     desc="Metadaten, Timestamps"         light="#9E9E9E"  dark="#6B6B6B"  focus="#9E9C97" />
            <TR token="--text-inverse"   desc="Text auf dunklem Grund"        light="#FFFFFF"  dark="#000000" />

            {/* ── Borders ── */}
            <SectionLabel>Borders — theme-gesteuert</SectionLabel>
            <TR token="--border"        desc="Standardtrennlinie"             light="#E0E0E0"  dark="#2A2A2A"  focus="#E5E4E0" />
            <TR token="--border-subtle" desc="Sehr dezente Trennlinie"        light="#EEEEEE"  dark="#1F1F1F"  focus="#EDECE8" />
            <TR token="--border-strong" desc="Kräftige Abgrenzung"            light="#000000"  dark="#FFFFFF" />

            {/* ── Interaktion ── */}
            <SectionLabel>Buttons, Inputs, Benachrichtigungen — theme-gesteuert</SectionLabel>
            <TR token="--btn-primary-bg"    desc="Primär-Button Hintergrund"  light="#000000"  dark="#FFFFFF" />
            <TR token="--btn-primary-color" desc="Primär-Button Text"         light="#FFFFFF"  dark="#000000" />
            <TR token="--input-bg"          desc="Eingabefelder"              light="#FFFFFF"  dark="#1A1A1A" />
            <TR token="--notif-unread"      desc="Ungelesene Markierungen"    light="#E8F2FF"  dark="rgba(0,122,255,0.12)" />
            <TR token="--focus-ring"        desc="Keyboard-Fokus-Ring"        light="rgba(0,122,255,0.4)" />

            {/* ── Schatten ── */}
            <SectionLabel>Schatten — theme-gesteuert (Light leicht, Dark kräftig)</SectionLabel>
            <TR token="--shadow-sm" desc="Sehr kleiner Schatten"  light="0 1px 2px rgba(0,0,0,0.05)"  dark="0 1px 3px rgba(0,0,0,0.25)" />
            <TR token="--shadow-md" desc="Standard-Schatten"      light="0 2px 8px rgba(0,0,0,0.08)"  dark="0 2px 10px rgba(0,0,0,0.35)" />
            <TR token="--shadow-lg" desc="Große Flächen"          light="0 4px 16px rgba(0,0,0,0.08)" dark="0 4px 20px rgba(0,0,0,0.40)" />
            <TR token="--shadow-xl" desc="Modals, Floating Panels" light="0 4px 24px rgba(0,0,0,0.15)" dark="0 8px 32px rgba(0,0,0,0.50)" />

          </tbody>
        </table>
      </div>

      {/* ── Typografie & Layout ── */}
      <h2 style={h2}>Typografie & Layout — statisch</h2>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: C.subtle }}>
              <th style={{ textAlign: 'left', padding: '7px 10px', border: `1px solid ${C.border}`, color: C.muted, width: 220 }}>Token</th>
              <th style={{ textAlign: 'left', padding: '7px 10px', border: `1px solid ${C.border}`, color: C.muted }} colSpan={3}>Wert</th>
            </tr>
          </thead>
          <tbody>
            <SectionLabel>Schriften</SectionLabel>
            <StaticTR token="--font-sans"  value="'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif" />
            <StaticTR token="--font-mono"  value="'Courier Prime', 'Courier New', Courier, monospace" />
            <StaticTR token="--user-interface-size" value="13px" desc="Wird zur Laufzeit via Ansicht-Modal überschrieben" />
            <StaticTR token="--user-script-size"    value="13px" desc="Drehbuch-Schriftgröße" />
            <SectionLabel>Schriftgrößen (fs = font-size)</SectionLabel>
            <StaticTR token="--fs-xs"   value="11px" />
            <StaticTR token="--fs-sm"   value="12px" />
            <StaticTR token="--fs-base" value="13px" desc="Standard Interface-Text" />
            <StaticTR token="--fs-md"   value="14px" />
            <StaticTR token="--fs-lg"   value="15px" />
            <StaticTR token="--fs-xl"   value="17px" />
            <SectionLabel>Schriftgewichte (fw = font-weight)</SectionLabel>
            <StaticTR token="--fw-regular" value="400" />
            <StaticTR token="--fw-medium"  value="500" />
            <StaticTR token="--fw-semi"    value="600" />
            <StaticTR token="--fw-bold"    value="700" />
            <SectionLabel>Zeilenhöhen (lh = line-height)</SectionLabel>
            <StaticTR token="--lh-tight"   value="1.15" />
            <StaticTR token="--lh-snug"    value="1.3" />
            <StaticTR token="--lh-base"    value="1.5" />
            <StaticTR token="--lh-relaxed" value="1.7" />
            <SectionLabel>Abstände (space)</SectionLabel>
            <StaticTR token="--space-1 … --space-20" value="4px · 8px · 12px · 16px · 20px · 24px · 32px · 40px · 48px · 64px · 80px" desc="8px-Grid" />
            <SectionLabel>Radien (radius)</SectionLabel>
            <StaticTR token="--radius-xs"   value="4px" />
            <StaticTR token="--radius-sm"   value="6px" />
            <StaticTR token="--radius-md"   value="8px" desc="Standard" />
            <StaticTR token="--radius-lg"   value="12px" desc="Cards, Modals" />
            <StaticTR token="--radius-xl"   value="20px" />
            <StaticTR token="--radius-pill" value="999px" desc="Chips, Tags" />
            <SectionLabel>Letter-Spacing (tracking)</SectionLabel>
            <StaticTR token="--tracking-wide"  value="0.5px" />
            <StaticTR token="--tracking-wider" value="0.08em" />
          </tbody>
        </table>
      </div>

      {/* ── Architektur ── */}
      <h2 style={h2}>Architektur: 3-Ebenen-Modell</h2>
      <div style={box}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          {[
            { num: '1', title: 'Brand Raw Tokens', desc: 'Rohe Markenwerte, theme-unabhängig. Farbschema-System überschreibt diese zur Laufzeit.' },
            { num: '2', title: 'Semantische Tokens', desc: 'Bedeutungsbasierte Variablen pro Theme-Block (Light/Dark/Focus). Komponenten nutzen nur diese.' },
            { num: '3', title: 'Komponentenklassen', desc: 'app.css — referenziert ausschließlich Ebene-2-Tokens. Nie direkte Farbwerte.' },
          ].map(e => (
            <div key={e.num} style={{ background: C.subtle, borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: C.muted, marginBottom: 6 }}>E{e.num}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 4 }}>{e.title}</div>
              <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{e.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Theme-Blöcke ── */}
      <h2 style={h2}>Theme-Blöcke in tokens.css</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: C.subtle }}>
            {['CSS-Selektor', 'Aktiviert durch', 'Überschreibt'].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '7px 10px', border: `1px solid ${C.border}`, color: C.muted }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[
            [":root, [data-theme='light']", 'Standard — automatisch aktiv',       'Light-Defaults auf bg-*, text-*, border-*, shadow-*'],
            ["[data-theme='dark']",         'User-Einstellung „Dunkel"',           'bg-*, text-*, border-*, shadow-* + notif-unread'],
            ["[data-mode='focus']",          'Fokus-Modus (Alt+Z / Toolbar)',      'bg-page/surface/subtle/active, text-*, border/subtle'],
          ].map(([sel, trigger, overrides]) => (
            <tr key={sel}>
              <td style={{ padding: '7px 10px', border: `1px solid ${C.border}` }}><code style={{ fontSize: 11, fontFamily: 'monospace' }}>{sel}</code></td>
              <td style={{ padding: '7px 10px', border: `1px solid ${C.border}`, color: C.muted, fontSize: 12 }}>{trigger}</td>
              <td style={{ padding: '7px 10px', border: `1px solid ${C.border}`, color: C.muted, fontSize: 12 }}>{overrides}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── Farbschema-System ── */}
      <h2 style={h2}>Farbschema-System (Built-in)</h2>
      <div style={box}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          {BUILTIN_COLOR_SCHEMES.map(scheme => (
            <div key={scheme.id} style={{ background: C.subtle, borderRadius: 8, padding: '10px 14px', border: `1px solid ${C.border}`, minWidth: 140 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 6 }}>{scheme.name}</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {Object.values(scheme.colors).map((c, i) => (
                  <div key={i} style={{ width: 18, height: 18, borderRadius: 4, background: c as string, border: '1px solid rgba(0,0,0,0.1)' }} />
                ))}
              </div>
            </div>
          ))}
        </div>
        <InfoBox title="Technisch" color={C.blue}>
          Farbschemata setzen die 5 <code>--sw-*</code>-Brand-Tokens via{' '}
          <code>document.documentElement.style.setProperty()</code>. Inline-Styles haben
          höhere CSS-Spezifität als alle Stylesheet-Regeln — wirkt sofort, kein Reload.
        </InfoBox>
      </div>

      {/* ── Token Editor ── */}
      <h2 style={h2}>Light-Theme Token-Editor</h2>
      <p style={p}>
        Unter <strong>Ansicht → Theme anpassen</strong> (oder direkt via Route <code style={{ fontFamily: 'monospace' }}>/theme-anpassen</code>) können alle
        Light-Theme-Tokens einzeln überschrieben werden. Overrides werden in{' '}
        <code style={{ fontFamily: 'monospace' }}>localStorage['sw-token-overrides']</code> persistiert und beim Mount auf <code style={{ fontFamily: 'monospace' }}>:root</code> angewendet.
        Dark-Theme und Focus-Modus bleiben unberührt.
      </p>
    </div>
  )
}
