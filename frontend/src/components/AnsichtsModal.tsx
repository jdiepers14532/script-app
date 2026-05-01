import { useRef } from 'react'
import {
  Columns2, PanelLeft, PanelRight, BookOpen, AlignLeft, X,
} from 'lucide-react'
import {
  LIGHT_PALETTES, DARK_PALETTES, INTERFACE_FONTS, SCRIPT_FONTS,
  FONT_SIZES, INTERFACE_FONT_SIZES, CUSTOM_IDX, DEFAULT_TWEAKS,
} from './AppShell'
import { useTweaks, useAppSettings } from '../contexts'

export default function AnsichtsModal({ onClose }: { onClose: () => void }) {
  const { tweaks, set, reset } = useTweaks()
  const { treatmentLabel } = useAppSettings()
  const lightColorRef = useRef<HTMLInputElement>(null)
  const darkColorRef = useRef<HTMLInputElement>(null)

  const isDark = tweaks.theme === 'dark'
  const palettes = isDark ? DARK_PALETTES : LIGHT_PALETTES
  const activeIdx = isDark ? tweaks.darkBgIndex : tweaks.lightBgIndex
  const customColor = isDark ? tweaks.darkCustomBg : tweaks.lightCustomBg

  const sectionStyle: React.CSSProperties = {
    marginBottom: 24,
    padding: '16px 20px',
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 10,
  }
  const h3Style: React.CSSProperties = {
    fontSize: 13, fontWeight: 600, margin: '0 0 12px',
    color: 'var(--text-primary)',
  }
  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '8px 0',
    borderBottom: '1px solid var(--border-subtle)',
    fontSize: 13,
  }
  const labelStyle: React.CSSProperties = {
    color: 'var(--text-secondary)', fontSize: 13, minWidth: 160,
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          zIndex: 9998, animation: 'fadeIn 0.15s',
        }}
      />
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 520, maxWidth: '92vw', maxHeight: '85vh',
        background: 'var(--bg-page)', border: '1px solid var(--border)',
        borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        zIndex: 9999, display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
            Ansicht
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-secondary)', padding: 4, display: 'flex',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 12px' }}>

          {/* Darstellung */}
          <div style={sectionStyle}>
            <h3 style={h3Style}>Darstellung</h3>

            <div style={rowStyle}>
              <span style={labelStyle}>Theme</span>
              <div className="seg">
                <button className={tweaks.theme === 'light' ? 'on' : ''} onClick={() => set('theme', 'light')}>Hell</button>
                <button className={tweaks.theme === 'dark' ? 'on' : ''} onClick={() => set('theme', 'dark')}>Dunkel</button>
              </div>
            </div>

            <div style={{ ...rowStyle, flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
              <span style={labelStyle}>Hintergrundfarbe</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {palettes.map((p, i) => (
                  <button
                    key={i}
                    style={{
                      width: 26, height: 26, borderRadius: 6,
                      border: activeIdx === i ? '2px solid var(--text-primary)' : '1px solid var(--border)',
                      background: p.preview, cursor: 'pointer', padding: 0,
                    }}
                    title={p.name}
                    onClick={() => isDark ? set('darkBgIndex', i) : set('lightBgIndex', i)}
                  />
                ))}
                <div style={{ position: 'relative' }}>
                  <button
                    style={{
                      width: 26, height: 26, borderRadius: 6,
                      border: activeIdx === CUSTOM_IDX ? '2px solid var(--text-primary)' : '1px solid var(--border)',
                      background: activeIdx === CUSTOM_IDX ? customColor : 'linear-gradient(135deg, #ff6b6b, #ffd93d, #6bcb77, #4d96ff)',
                      cursor: 'pointer', padding: 0,
                    }}
                    title="Eigene Farbe"
                    onClick={() => {
                      if (isDark) { set('darkBgIndex', CUSTOM_IDX); darkColorRef.current?.click() }
                      else        { set('lightBgIndex', CUSTOM_IDX); lightColorRef.current?.click() }
                    }}
                  />
                  <input
                    ref={isDark ? darkColorRef : lightColorRef}
                    type="color"
                    value={customColor}
                    style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
                    onChange={e => isDark ? set('darkCustomBg', e.target.value) : set('lightCustomBg', e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div style={{ ...rowStyle, borderBottom: 'none' }}>
              <span style={labelStyle}>Tooltips</span>
              <div className="seg">
                <button className={tweaks.showTooltips ? 'on' : ''} onClick={() => set('showTooltips', true)}>An</button>
                <button className={!tweaks.showTooltips ? 'on' : ''} onClick={() => set('showTooltips', false)}>Aus</button>
              </div>
            </div>
          </div>

          {/* Schrift */}
          <div style={sectionStyle}>
            <h3 style={h3Style}>Schrift</h3>

            <div style={rowStyle}>
              <span style={labelStyle}>Interface-Schrift</span>
              <select
                value={tweaks.interfaceFont}
                onChange={e => set('interfaceFont', e.target.value)}
                style={{
                  fontSize: 12, padding: '4px 8px', borderRadius: 6,
                  border: '1px solid var(--border)', background: 'var(--bg-subtle)',
                  color: 'var(--text-primary)', fontFamily: 'inherit',
                }}
              >
                {INTERFACE_FONTS.map(f => (
                  <option key={f.value} value={f.value}>{f.name}</option>
                ))}
              </select>
            </div>

            <div style={rowStyle}>
              <span style={labelStyle}>Interface-Schriftgrosse</span>
              <div className="seg">
                {INTERFACE_FONT_SIZES.map(s => (
                  <button key={s} className={tweaks.interfaceFontSize === s ? 'on' : ''} onClick={() => set('interfaceFontSize', s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div style={rowStyle}>
              <span style={labelStyle}>Drehbuch-Schrift</span>
              <select
                value={tweaks.scriptFont}
                onChange={e => set('scriptFont', e.target.value)}
                style={{
                  fontSize: 12, padding: '4px 8px', borderRadius: 6,
                  border: '1px solid var(--border)', background: 'var(--bg-subtle)',
                  color: 'var(--text-primary)', fontFamily: tweaks.scriptFont,
                }}
              >
                {SCRIPT_FONTS.map(f => (
                  <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.name}</option>
                ))}
              </select>
            </div>

            <div style={{ ...rowStyle, borderBottom: 'none' }}>
              <span style={labelStyle}>Drehbuch-Schriftgrosse</span>
              <div className="seg">
                {FONT_SIZES.map(s => (
                  <button key={s} className={tweaks.fontSize === s ? 'on' : ''} onClick={() => set('fontSize', s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Editor */}
          <div style={sectionStyle}>
            <h3 style={h3Style}>Editor</h3>

            <div style={rowStyle}>
              <span style={labelStyle}>Panelmodus</span>
              <div className="seg">
                <button className={tweaks.panelMode === 'both' ? 'on' : ''} onClick={() => set('panelMode', 'both')} title="Beide Panels"><Columns2 size={13} /></button>
                <button className={tweaks.panelMode === 'treatment' ? 'on' : ''} onClick={() => set('panelMode', 'treatment')} title={`Nur ${treatmentLabel}`}><PanelLeft size={13} /></button>
                <button className={tweaks.panelMode === 'script' ? 'on' : ''} onClick={() => set('panelMode', 'script')} title="Nur Drehbuch"><PanelRight size={13} /></button>
              </div>
            </div>

            <div style={rowStyle}>
              <span style={labelStyle}>Editor-Ansicht</span>
              <div className="seg">
                <button className={tweaks.showPageShadow ? 'on' : ''} onClick={() => set('showPageShadow', true)} title="Blatt mit Schatten"><BookOpen size={13} /></button>
                <button className={!tweaks.showPageShadow ? 'on' : ''} onClick={() => set('showPageShadow', false)} title="Fliesstext"><AlignLeft size={13} /></button>
              </div>
            </div>

            <div style={rowStyle}>
              <span style={labelStyle}>Breakdown-Sidebar</span>
              <div className="seg">
                <button className={tweaks.breakdown ? 'on' : ''} onClick={() => set('breakdown', true)}>An</button>
                <button className={!tweaks.breakdown ? 'on' : ''} onClick={() => set('breakdown', false)}>Aus</button>
              </div>
            </div>

            <div style={{ ...rowStyle, borderBottom: 'none' }}>
              <span style={labelStyle}>Scroll-Nav Verzogerung</span>
              <div className="seg">
                {[500, 1000, 1500, 2000, 3000].map(ms => (
                  <button key={ms} className={tweaks.scrollNavDelay === ms ? 'on' : ''} onClick={() => set('scrollNavDelay', ms)}>
                    {ms / 1000}s
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Reset */}
          <div style={{ textAlign: 'center', paddingBottom: 8 }}>
            <button
              onClick={reset}
              style={{
                fontSize: 12, color: 'var(--text-secondary)', background: 'none',
                border: '1px solid var(--border)', borderRadius: 8, padding: '7px 18px',
                cursor: 'pointer',
              }}
            >
              Alle auf Standard zurucksetzen
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
