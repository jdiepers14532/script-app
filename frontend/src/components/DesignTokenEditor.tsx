import React, { useState, useEffect, useRef } from 'react'

// ── Token-Definitionen ────────────────────────────────────────────────────────

interface TokenDef {
  cssVar: string
  label: string
  light: string
  dark?: string
  focus?: string
}

const TOKEN_GROUPS: { title: string; tokens: TokenDef[] }[] = [
  {
    title: 'Hintergründe',
    tokens: [
      { cssVar: '--bg-page',    label: 'Seite',    light: '#FFFFFF', dark: '#0D0D0D', focus: '#FAFAF8' },
      { cssVar: '--bg-surface', label: 'Flächen',  light: '#FFFFFF', dark: '#141414', focus: '#FFFFFF' },
      { cssVar: '--bg-subtle',  label: 'Subtil',   light: '#F5F5F5', dark: '#1A1A1A', focus: '#F0EFED' },
      { cssVar: '--bg-active',  label: 'Aktiv',    light: '#F5F5F5', dark: '#1F1F1F', focus: '#ECEAE6' },
      { cssVar: '--bg-hover',   label: 'Hover',    light: '#EDEDED', dark: '#262626' },
    ],
  },
  {
    title: 'Texte',
    tokens: [
      { cssVar: '--text-primary',   label: 'Primär',   light: '#000000', dark: '#FFFFFF',  focus: '#111111' },
      { cssVar: '--text-secondary', label: 'Sekundär', light: '#757575', dark: '#A0A0A0',  focus: '#767470' },
      { cssVar: '--text-muted',     label: 'Gedämpft', light: '#9E9E9E', dark: '#6B6B6B',  focus: '#9E9C97' },
      { cssVar: '--text-inverse',   label: 'Invers',   light: '#FFFFFF', dark: '#000000' },
    ],
  },
  {
    title: 'Borders',
    tokens: [
      { cssVar: '--border',        label: 'Standard', light: '#E0E0E0', dark: '#2A2A2A', focus: '#E5E4E0' },
      { cssVar: '--border-subtle', label: 'Subtil',   light: '#EEEEEE', dark: '#1F1F1F', focus: '#EDECE8' },
      { cssVar: '--border-strong', label: 'Kräftig',  light: '#000000', dark: '#FFFFFF' },
    ],
  },
  {
    title: 'Buttons & Inputs',
    tokens: [
      { cssVar: '--btn-primary-bg',    label: 'Button Hintergrund', light: '#000000', dark: '#FFFFFF' },
      { cssVar: '--btn-primary-color', label: 'Button Text',        light: '#FFFFFF', dark: '#000000' },
      { cssVar: '--input-bg',          label: 'Input Hintergrund',  light: '#FFFFFF', dark: '#1A1A1A' },
      { cssVar: '--notif-unread',      label: 'Ungelesen-Badge',    light: '#E8F2FF' },
    ],
  },
]

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

const LS_KEY = 'sw-token-overrides'

function loadOverrides(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') } catch { return {} }
}
function saveOverrides(o: Record<string, string>) {
  localStorage.setItem(LS_KEY, JSON.stringify(o))
}
function readToken(cssVar: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim()
}
function isLightColor(hex: string): boolean {
  if (!hex.startsWith('#') || hex.length < 7) return true
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 128
}

// ── Einzelner Token-Chip ──────────────────────────────────────────────────────

function ColorChip({ token, isOverridden, onSet, onReset }: {
  token: TokenDef
  isOverridden: boolean
  onSet: (cssVar: string, value: string) => void
  onReset: (cssVar: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [currentVal, setCurrentVal] = useState(() => readToken(token.cssVar))

  // Wert nach jeder Render-Phase neu lesen (reagiert auf externe Änderungen)
  useEffect(() => {
    setCurrentVal(readToken(token.cssVar))
  })

  const isHex = currentVal.startsWith('#')
  const defaults = [
    token.light && { key: 'L', title: 'Light Default', val: token.light },
    token.dark  && { key: 'D', title: 'Dark Default',  val: token.dark },
    token.focus && { key: 'F', title: 'Focus Default', val: token.focus },
  ].filter(Boolean) as { key: string; title: string; val: string }[]

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px',
      borderRadius: 6,
      background: isOverridden ? 'rgba(0,122,255,0.06)' : 'transparent',
      border: `1px solid ${isOverridden ? 'rgba(0,122,255,0.25)' : 'transparent'}`,
    }}>
      {/* Farbchip → öffnet Color Picker */}
      <div
        onClick={() => isHex && inputRef.current?.click()}
        title={isHex ? 'Klicken zum Ändern' : 'rgba-Wert — nicht direkt editierbar'}
        style={{
          width: 28, height: 28, borderRadius: 6, flexShrink: 0,
          cursor: isHex ? 'pointer' : 'default',
          background: `var(${token.cssVar})`,
          border: '1.5px solid var(--border)',
          boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)',
          position: 'relative',
        }}
      />
      <input
        ref={inputRef}
        type="color"
        value={isHex && currentVal.length === 7 ? currentVal : '#000000'}
        onChange={e => {
          onSet(token.cssVar, e.target.value)
          setCurrentVal(e.target.value)
        }}
        style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
      />

      {/* Label + CSS-Variable */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>{token.label}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{token.cssVar}</div>
      </div>

      {/* Aktueller Wert */}
      <div style={{
        fontSize: 11, fontFamily: 'monospace', color: 'var(--text-secondary)',
        minWidth: 76, textAlign: 'right',
      }}>
        {currentVal || '—'}
      </div>

      {/* Default-Chips: L / D / F */}
      <div style={{ display: 'flex', gap: 3 }}>
        {defaults.map(d => (
          <button
            key={d.key}
            onClick={() => onSet(token.cssVar, d.val)}
            title={`${d.title}: ${d.val}`}
            style={{
              width: 20, height: 20, borderRadius: 4, padding: 0, cursor: 'pointer',
              border: '1.5px solid var(--border)', background: d.val,
              color: isLightColor(d.val) ? '#000' : '#fff',
              fontSize: 9, fontWeight: 700, lineHeight: 1,
            }}
          >
            {d.key}
          </button>
        ))}
      </div>

      {/* Reset-Button */}
      <div style={{ width: 20 }}>
        {isOverridden && (
          <button
            onClick={() => onReset(token.cssVar)}
            title="Zurücksetzen auf CSS-Default"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', padding: 0, fontSize: 16, lineHeight: 1,
            }}
          >
            ↺
          </button>
        )}
      </div>
    </div>
  )
}

// ── Live-Vorschau-Panel ───────────────────────────────────────────────────────

function PreviewPanel() {
  const [hovered, setHovered] = useState(false)
  const [active, setActive] = useState(false)

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 28,
      padding: 16, background: 'var(--bg-subtle)', border: '1px solid var(--border)',
      borderRadius: 8,
    }}>
      {/* Card: surface + borders + Texthierarchie */}
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 8, padding: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
          Überschrift — text-primary
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
          Beschreibung — text-secondary
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          Hinweis — text-muted
        </div>
      </div>

      {/* Interaktive Zustände */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{
          background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)',
          borderRadius: 6, padding: '7px 12px', fontSize: 12, color: 'var(--text-secondary)',
        }}>
          bg-subtle / border-subtle
        </div>
        <div
          style={{
            background: active ? 'var(--bg-active)' : hovered ? 'var(--bg-hover)' : 'transparent',
            border: '1px solid var(--border)', borderRadius: 6,
            padding: '7px 12px', fontSize: 12, color: 'var(--text-secondary)',
            cursor: 'pointer', transition: 'background 0.12s',
          }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => { setHovered(false); setActive(false) }}
          onMouseDown={() => setActive(true)}
          onMouseUp={() => setActive(false)}
        >
          {active ? 'bg-active' : hovered ? 'bg-hover' : 'hover / active ← testen'}
        </div>
      </div>

      {/* Button + Input */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button style={{
          background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-color)',
          border: 'none', borderRadius: 6, padding: '7px 16px',
          fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
        }}>
          Primär-Button
        </button>
        <input
          placeholder="Input-Feld…"
          readOnly
          style={{
            background: 'var(--input-bg)', border: '1px solid var(--border)',
            borderRadius: 6, padding: '7px 10px', fontSize: 12,
            color: 'var(--text-primary)', fontFamily: 'inherit', outline: 'none', width: 110,
          }}
        />
      </div>

      {/* Borders + Badge */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ borderTop: '2px solid var(--border-strong)', paddingTop: 5, fontSize: 11, color: 'var(--text-muted)' }}>
          border-strong
        </div>
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 5, fontSize: 11, color: 'var(--text-muted)' }}>
          border
        </div>
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 5, fontSize: 11, color: 'var(--text-muted)' }}>
          border-subtle
        </div>
        <div style={{
          background: 'var(--notif-unread)', border: '1px solid var(--border)',
          borderRadius: 4, padding: '3px 8px', fontSize: 11, color: 'var(--text-primary)',
          display: 'inline-block', alignSelf: 'flex-start', marginTop: 2,
        }}>
          notif-unread Badge
        </div>
      </div>
    </div>
  )
}

// ── Haupt-Komponente ──────────────────────────────────────────────────────────

export function DesignTokenEditor() {
  const [overrides, setOverrides] = useState<Record<string, string>>(loadOverrides)
  const overridesCount = Object.keys(overrides).length

  // Beim Mount: gespeicherte Overrides auf :root anwenden
  useEffect(() => {
    Object.entries(overrides).forEach(([cssVar, value]) => {
      document.documentElement.style.setProperty(cssVar, value)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function setToken(cssVar: string, value: string) {
    document.documentElement.style.setProperty(cssVar, value)
    const next = { ...overrides, [cssVar]: value }
    setOverrides(next)
    saveOverrides(next)
  }

  function resetToken(cssVar: string) {
    document.documentElement.style.removeProperty(cssVar)
    const next = { ...overrides }
    delete next[cssVar]
    setOverrides(next)
    saveOverrides(next)
  }

  function resetAll() {
    Object.keys(overrides).forEach(v => document.documentElement.style.removeProperty(v))
    setOverrides({})
    saveOverrides({})
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 860 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Design Tokens</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.5 }}>
            Farb-Overrides auf CSS-Custom-Property-Ebene · in localStorage gespeichert · wirken sofort im aktuellen Theme
          </div>
        </div>
        {overridesCount > 0 && (
          <button
            onClick={resetAll}
            style={{
              padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border)',
              background: 'none', color: 'var(--text-secondary)', fontSize: 12,
              cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
            }}
          >
            ↺ Alle zurücksetzen ({overridesCount})
          </button>
        )}
      </div>

      {/* Hinweis-Box */}
      <div style={{
        background: 'var(--bg-subtle)', border: '1px solid var(--border)',
        borderRadius: 6, padding: '10px 14px', fontSize: 12,
        color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6,
      }}>
        <strong style={{ color: 'var(--text-primary)' }}>Wie es funktioniert:</strong> Jede Änderung setzt
        die CSS-Variable direkt auf dem <code style={{ fontFamily: 'monospace', background: 'var(--border)', padding: '0 3px', borderRadius: 3 }}>:root</code>-Element.
        Das überschreibt das aktive Theme. Die Default-Buttons <strong>L</strong> / <strong>D</strong> / <strong>F</strong> setzen
        den Light-, Dark- bzw. Focus-Wert. <strong>↺</strong> entfernt den Override und lässt das CSS wieder greifen.
      </div>

      {/* Live-Vorschau */}
      <div style={{
        fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: 0.5, color: 'var(--text-muted)', marginBottom: 10,
      }}>
        Live-Vorschau
      </div>
      <PreviewPanel />

      {/* Token-Gruppen */}
      {TOKEN_GROUPS.map(group => (
        <div key={group.title} style={{ marginBottom: 20 }}>
          <div style={{
            fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: 0.5, color: 'var(--text-muted)', marginBottom: 6,
          }}>
            {group.title}
          </div>
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 8, padding: 6, display: 'flex', flexDirection: 'column', gap: 2,
          }}>
            {group.tokens.map(token => (
              <ColorChip
                key={token.cssVar}
                token={token}
                isOverridden={token.cssVar in overrides}
                onSet={setToken}
                onReset={resetToken}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
