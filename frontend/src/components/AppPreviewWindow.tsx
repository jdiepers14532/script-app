import { useState } from 'react'

/*
 * AppPreviewWindow — Live-Vorschau aller Design Tokens als App-Mockup
 *
 * ⚠️  STARR — NICHT FÜR MOBILE OPTIMIEREN ⚠️
 * Diese Komponente hat eine feste Breite und ist ein Desktop-only Tool.
 * Bei Mobiloptimierungen der App diese Komponente NICHT anfassen.
 * Der übergeordnete Container schneidet sie bei kleinen Viewports ab — gewollt.
 * width: 420px, flex-shrink: 0 — diese Werte NICHT ändern.
 */

// ── Kleine Hilfskomponenten ───────────────────────────────────────────────────

function NavItem({ label, active, icon }: { label: string; active?: boolean; icon: string }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '5px 8px', borderRadius: 5, fontSize: 11,
        background: active ? 'var(--bg-active)' : hovered ? 'var(--bg-hover)' : 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontWeight: active ? 600 : 400, cursor: 'pointer', transition: 'background 0.1s',
        borderLeft: active ? '2px solid var(--border-strong)' : '2px solid transparent',
      }}
    >
      <span style={{ fontSize: 12 }}>{icon}</span>
      {label}
    </div>
  )
}

function MockButton({ label, variant = 'primary' }: { label: string; variant?: 'primary' | 'secondary' | 'ghost' }) {
  const [hovered, setHovered] = useState(false)
  const styles: Record<string, React.CSSProperties> = {
    primary: {
      background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-color)',
      border: 'none',
    },
    secondary: {
      background: 'transparent', color: 'var(--text-primary)',
      border: '1px solid var(--border-strong)',
    },
    ghost: {
      background: hovered ? 'var(--bg-hover)' : 'transparent',
      color: 'var(--text-secondary)', border: '1px solid var(--border)',
    },
  }
  return (
    <button
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...styles[variant],
        borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 500,
        cursor: 'pointer', fontFamily: 'inherit', transition: 'opacity 0.1s',
        opacity: hovered && variant !== 'ghost' ? 0.85 : 1,
      }}
    >
      {label}
    </button>
  )
}

function StatusBadge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: bg, color: color, border: `1px solid ${color}33`,
      borderRadius: 4, padding: '2px 7px', fontSize: 10, fontWeight: 600,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block' }} />
      {label}
    </span>
  )
}

// ── Haupt-Komponente ──────────────────────────────────────────────────────────

export default function AppPreviewWindow() {
  const [inputVal, setInputVal] = useState('')
  const [activeNav, setActiveNav] = useState('szenen')
  const [showModal, setShowModal] = useState(false)

  return (
    /*
     * STARR — NICHT FÜR MOBILE OPTIMIEREN
     * width + min-width = 420px, flex-shrink: 0 → niemals ändern
     */
    <div style={{
      width: 420,
      minWidth: 420,   /* STARR */
      flexShrink: 0,   /* STARR */
      display: 'flex', flexDirection: 'column', gap: 0,
      border: '1px solid var(--border)', borderRadius: 10,
      overflow: 'hidden',
      boxShadow: 'var(--shadow-xl)',
      background: 'var(--bg-page)',
      height: '100%',
      fontFamily: 'var(--font-sans)',
    }}>

      {/* ── Fenster-Titlebar ── */}
      <div style={{
        background: '#1e1e1e', padding: '8px 12px',
        display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
      }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FF5F57' }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FEBC2E' }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#28C840' }} />
        <span style={{ fontSize: 11, color: '#888', marginLeft: 8 }}>script.serienwerft.studio</span>
      </div>

      {/* ── App-Topbar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '0 12px', height: 40, flexShrink: 0,
        background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ width: 22, height: 22, borderRadius: 4, background: 'var(--text-primary)', flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>script</span>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', flex: 2 }}>Rote Rosen · Staffel 24</span>
        {/* Notification Badge */}
        <div style={{ position: 'relative' }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--bg-subtle)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 12 }}>🔔</span>
          </div>
          <div style={{
            position: 'absolute', top: -3, right: -3, width: 14, height: 14,
            background: 'var(--notif-unread)', border: '1.5px solid var(--bg-surface)',
            borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 8, fontWeight: 700, color: 'var(--color-info)',
          }}>3</div>
        </div>
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
          JD
        </div>
      </div>

      {/* ── App-Body ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Sidebar */}
        <div style={{
          width: 130, flexShrink: 0, borderRight: '1px solid var(--border)',
          background: 'var(--bg-subtle)', padding: '10px 8px',
          display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto',
        }}>
          {[
            { id: 'szenen', label: 'Szenen', icon: '📋' },
            { id: 'figuren', label: 'Figuren', icon: '🎭' },
            { id: 'motive', label: 'Motive', icon: '🏠' },
            { id: 'statistik', label: 'Statistik', icon: '📊' },
          ].map(item => (
            <div key={item.id} onClick={() => setActiveNav(item.id)}>
              <NavItem label={item.label} icon={item.icon} active={activeNav === item.id} />
            </div>
          ))}
          <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', padding: '4px 8px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Folge 124
          </div>
          {['Sz. 01 — INT', 'Sz. 02 — INT', 'Sz. 03 — EXT'].map((s, i) => (
            <NavItem key={i} label={s} icon="▸" active={i === 0} />
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Panel-Header */}
          <div style={{
            padding: '8px 12px', borderBottom: '1px solid var(--border)',
            background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>
              Szene 01 · INT. BÜRO — TAG
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 5px' }}>
              Entwurf
            </span>
          </div>

          {/* Scroll-Content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>

            {/* Text-Hierarchie */}
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 7, padding: 10, marginBottom: 10, boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 3 }}>
                Szeneninhalt · text-primary
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 3, lineHeight: 1.5 }}>
                Lars betritt das Büro. Er sieht müde aus. — text-secondary
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                Zuletzt bearbeitet: heute · text-muted
              </div>
            </div>

            {/* Border-Beispiele */}
            <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ borderTop: '2px solid var(--border-strong)', paddingTop: 4, fontSize: 10, color: 'var(--text-muted)' }}>border-strong</div>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 4, fontSize: 10, color: 'var(--text-muted)' }}>border</div>
              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 4, fontSize: 10, color: 'var(--text-muted)' }}>border-subtle</div>
            </div>

            {/* Input + Buttons */}
            <div style={{ marginBottom: 10 }}>
              <input
                value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                placeholder="Notiz eingeben…  (input-bg, border)"
                style={{
                  width: '100%', background: 'var(--input-bg)',
                  border: '1px solid var(--border)', borderRadius: 5,
                  padding: '6px 8px', fontSize: 11, color: 'var(--text-primary)',
                  fontFamily: 'inherit', marginBottom: 7, outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <MockButton label="Speichern" variant="primary" />
                <MockButton label="Verwerfen" variant="secondary" />
                <MockButton label="Optionen" variant="ghost" />
              </div>
            </div>

            {/* Status-Badges */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              <StatusBadge label="Erfolg" color="var(--color-success)" bg="var(--color-success-bg)" />
              <StatusBadge label="Fehler" color="var(--color-danger)" bg="var(--color-danger-bg)" />
              <StatusBadge label="Warnung" color="var(--color-warning)" bg="var(--color-warning-bg)" />
              <StatusBadge label="Info" color="var(--color-info)" bg="var(--color-info-bg)" />
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--notif-unread)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 7px', fontSize: 10, fontWeight: 600, color: 'var(--color-info)' }}>
                ● 3 ungelesen
              </span>
            </div>
          </div>

          {/* Modal-Trigger (Shadow-Demo) */}
          <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', background: 'var(--bg-subtle)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setShowModal(v => !v)}
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 5, padding: '3px 8px', fontSize: 10, color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              {showModal ? 'Modal ausblenden' : 'Modal + shadow-xl zeigen'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Modales Overlay ── */}
      {showModal && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10 }}>
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 10, boxShadow: 'var(--shadow-xl)', width: 260, overflow: 'hidden',
          }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 12, color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              Modal (shadow-xl)
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ padding: '12px 14px' }}>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.5 }}>
                Dieser Dialog zeigt bg-surface, border, shadow-xl.
              </p>
              <div style={{ display: 'flex', gap: 6 }}>
                <MockButton label="OK" variant="primary" />
                <MockButton label="Abbrechen" variant="ghost" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
