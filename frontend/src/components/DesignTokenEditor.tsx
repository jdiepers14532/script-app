import React, { useState, useEffect, useRef } from 'react'

// ── Token-Definitionen (nur Light-Schema editierbar) ──────────────────────────

interface TokenDef {
  cssVar: string
  label: string
  light: string       // Light-Default (editierbar)
  dark?: string       // Dark-Referenz (nur zur Info)
  focus?: string      // Focus-Referenz (nur zur Info)
  description?: string
}

const TOKEN_GROUPS: { title: string; tokens: TokenDef[] }[] = [
  {
    title: 'Hintergründe',
    tokens: [
      { cssVar: '--bg-page',    label: 'Seite',           light: '#FFFFFF', dark: '#0D0D0D', focus: '#FAFAF8', description: 'Äußerster Seitenhintergrund' },
      { cssVar: '--bg-surface', label: 'Flächen & Cards', light: '#FAFAFA', dark: '#181818', focus: '#FFFFFF', description: 'Modals, Cards, Panels — leicht von Seite abgesetzt' },
      { cssVar: '--bg-subtle',  label: 'Subtil',          light: '#F5F5F5', dark: '#1A1A1A', focus: '#F0EFED', description: 'Abschnittsflächen, Fieldsets' },
      { cssVar: '--bg-active',  label: 'Aktiv',           light: '#F5F5F5', dark: '#1F1F1F', focus: '#ECEAE6', description: 'Aktiver Menüeintrag, selected state' },
      { cssVar: '--bg-hover',   label: 'Hover',           light: '#EDEDED', dark: '#262626',                  description: 'Hover-Zustand von Listeneinträgen' },
    ],
  },
  {
    title: 'Texte',
    tokens: [
      { cssVar: '--text-primary',   label: 'Primär',   light: '#000000', dark: '#FFFFFF',  focus: '#111111', description: 'Überschriften, Hauptinhalt' },
      { cssVar: '--text-secondary', label: 'Sekundär', light: '#757575', dark: '#A0A0A0',  focus: '#767470', description: 'Labels, Beschreibungen' },
      { cssVar: '--text-muted',     label: 'Gedämpft', light: '#9E9E9E', dark: '#6B6B6B',  focus: '#9E9C97', description: 'Hinweise, Metadaten' },
      { cssVar: '--text-inverse',   label: 'Invers',   light: '#FFFFFF', dark: '#000000',                    description: 'Text auf dunklen Flächen (z.B. Buttons)' },
    ],
  },
  {
    title: 'Borders',
    tokens: [
      { cssVar: '--border',        label: 'Standard', light: '#E0E0E0', dark: '#2A2A2A', focus: '#E5E4E0', description: 'Standardtrennlinie' },
      { cssVar: '--border-subtle', label: 'Subtil',   light: '#EEEEEE', dark: '#1F1F1F', focus: '#EDECE8', description: 'Sehr dezente Trennlinie' },
      { cssVar: '--border-strong', label: 'Kräftig',  light: '#000000', dark: '#FFFFFF',                   description: 'Starke Abgrenzung, aktive Elemente' },
    ],
  },
  {
    title: 'Buttons & Inputs',
    tokens: [
      { cssVar: '--btn-primary-bg',    label: 'Button Hintergrund', light: '#000000', dark: '#FFFFFF', description: 'Primärer Aktions-Button' },
      { cssVar: '--btn-primary-color', label: 'Button Text',        light: '#FFFFFF', dark: '#000000', description: 'Text auf Primär-Button' },
      { cssVar: '--input-bg',          label: 'Input Hintergrund',  light: '#FFFFFF', dark: '#1A1A1A', description: 'Eingabefelder, Textareas' },
      { cssVar: '--notif-unread',      label: 'Ungelesen-Badge',    light: '#E8F2FF',                  description: 'Hintergrund für ungelesene Markierungen' },
    ],
  },
]

// System-Defaults (Referenz für Reset auf CSS-Quelle)
const SYSTEM_DEFAULTS: Record<string, string> = {}
TOKEN_GROUPS.forEach(g => g.tokens.forEach(t => { SYSTEM_DEFAULTS[t.cssVar] = t.light }))

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
  useEffect(() => { setCurrentVal(readToken(token.cssVar)) })

  const isHex = currentVal.startsWith('#') && currentVal.length === 7

  const darkDefault = token.dark
  const focusDefault = token.focus

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px',
      borderRadius: 6,
      background: isOverridden ? 'rgba(0,122,255,0.05)' : 'transparent',
      border: `1px solid ${isOverridden ? 'rgba(0,122,255,0.2)' : 'transparent'}`,
    }}>
      {/* Klickbarer Farbchip */}
      <div
        onClick={() => isHex && inputRef.current?.click()}
        title={isHex ? 'Klicken zum Ändern' : 'Nicht direkt editierbar (rgba)'}
        style={{
          width: 30, height: 30, borderRadius: 7, flexShrink: 0,
          cursor: isHex ? 'pointer' : 'default',
          background: `var(${token.cssVar})`,
          border: '1.5px solid var(--border)',
          boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.07)',
          transition: 'transform 0.1s',
        }}
        onMouseEnter={e => isHex && ((e.target as HTMLElement).style.transform = 'scale(1.12)')}
        onMouseLeave={e => ((e.target as HTMLElement).style.transform = 'scale(1)')}
      />
      <input
        ref={inputRef}
        type="color"
        value={isHex ? currentVal : '#000000'}
        onChange={e => { onSet(token.cssVar, e.target.value); setCurrentVal(e.target.value) }}
        style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
      />

      {/* Label + CSS-Var + Beschreibung */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>{token.label}</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{token.cssVar}</div>
      </div>

      {/* Aktueller Wert */}
      <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-secondary)', minWidth: 72, textAlign: 'right' }}>
        {currentVal || '—'}
      </div>

      {/* Dark/Focus Referenz-Chips (nur Info, nicht editierbar) */}
      <div style={{ display: 'flex', gap: 3 }}>
        {darkDefault && (
          <div
            title={`Dark Default: ${darkDefault}`}
            style={{
              width: 20, height: 20, borderRadius: 4, border: '1.5px solid var(--border)',
              background: darkDefault, cursor: 'help',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 8, fontWeight: 700, color: isLightColor(darkDefault) ? '#000' : '#fff',
            }}
          >D</div>
        )}
        {focusDefault && (
          <div
            title={`Focus Default: ${focusDefault}`}
            style={{
              width: 20, height: 20, borderRadius: 4, border: '1.5px solid var(--border)',
              background: focusDefault, cursor: 'help',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 8, fontWeight: 700, color: isLightColor(focusDefault) ? '#000' : '#fff',
            }}
          >F</div>
        )}
        {/* Platzhalter wenn kein D/F da */}
        {!darkDefault && !focusDefault && <div style={{ width: 43 }} />}
        {darkDefault && !focusDefault && <div style={{ width: 23 }} />}
      </div>

      {/* Reset auf System-Standard */}
      <div style={{ width: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {isOverridden && (
          <button
            onClick={() => onReset(token.cssVar)}
            title={`Zurücksetzen auf System-Standard (${SYSTEM_DEFAULTS[token.cssVar]})`}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', padding: 0, fontSize: 17, lineHeight: 1,
            }}
          >↺</button>
        )}
      </div>
    </div>
  )
}

// ── Live-Vorschau ─────────────────────────────────────────────────────────────

function PreviewPanel() {
  const [hovered, setHovered] = useState(false)
  const [pressed, setPressed] = useState(false)

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 28,
      padding: 14, background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 8,
    }}>
      {/* Karte: bg-surface, border, Texthierarchie */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 14, boxShadow: 'var(--shadow-md)' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>Überschrift</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 5 }}>Beschreibungstext</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Hinweis · text-muted</div>
      </div>

      {/* bg-subtle + Hover/Active */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '6px 10px', fontSize: 11, color: 'var(--text-secondary)' }}>
          bg-subtle / border-subtle
        </div>
        <div
          style={{
            background: pressed ? 'var(--bg-active)' : hovered ? 'var(--bg-hover)' : 'transparent',
            border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px',
            fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer', transition: 'background 0.1s',
          }}
          onMouseEnter={() => setHovered(true)} onMouseLeave={() => { setHovered(false); setPressed(false) }}
          onMouseDown={() => setPressed(true)} onMouseUp={() => setPressed(false)}
        >
          {pressed ? 'bg-active' : hovered ? 'bg-hover' : 'hover / active testen →'}
        </div>
      </div>

      {/* Button + Input */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button style={{ background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-color)', border: 'none', borderRadius: 6, padding: '7px 14px', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
          Button
        </button>
        <input readOnly placeholder="Input…" style={{ background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', fontSize: 11, color: 'var(--text-primary)', fontFamily: 'inherit', width: 90 }} />
        <div style={{ background: 'var(--notif-unread)', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 7px', fontSize: 10, color: 'var(--text-primary)' }}>
          3 neu
        </div>
      </div>

      {/* Borders */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ borderTop: '2px solid var(--border-strong)', paddingTop: 4, fontSize: 10, color: 'var(--text-muted)' }}>border-strong</div>
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 4, fontSize: 10, color: 'var(--text-muted)' }}>border</div>
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 4, fontSize: 10, color: 'var(--text-muted)' }}>border-subtle</div>
      </div>
    </div>
  )
}

// ── Haupt-Komponente ──────────────────────────────────────────────────────────

export function DesignTokenEditor() {
  const [overrides, setOverrides] = useState<Record<string, string>>(loadOverrides)
  const overridesCount = Object.keys(overrides).length

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
    // System-Default wiederherstellen (CSS-Quelle übernimmt)
    document.documentElement.style.removeProperty(cssVar)
    const next = { ...overrides }
    delete next[cssVar]
    setOverrides(next)
    saveOverrides(next)
  }

  function resetAll() {
    // Alle Overrides entfernen → CSS-Quelle (tokens.css) übernimmt
    Object.keys(overrides).forEach(v => document.documentElement.style.removeProperty(v))
    setOverrides({})
    saveOverrides({})
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 820 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
            Light-Theme anpassen
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Ändere die Farben des hellen Themes. Änderungen werden gespeichert und beim nächsten Öffnen wiederhergestellt.
            Das Dark-Theme bleibt unverändert.
          </div>
        </div>
        {overridesCount > 0 && (
          <button
            onClick={resetAll}
            title="Alle Overrides entfernen — CSS-Quelle (tokens.css) übernimmt"
            style={{
              padding: '7px 14px', borderRadius: 6, border: '1px solid var(--border)',
              background: 'none', color: 'var(--text-secondary)', fontSize: 12,
              cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, whiteSpace: 'nowrap',
            }}
          >
            ↺ Auf System-Standard ({overridesCount} Änderung{overridesCount !== 1 ? 'en' : ''})
          </button>
        )}
      </div>

      {/* Info-Box */}
      <div style={{
        background: 'var(--color-info-bg)', border: '1px solid rgba(0,122,255,0.2)',
        borderRadius: 7, padding: '10px 14px', fontSize: 12,
        color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6,
      }}>
        <strong style={{ color: 'var(--text-primary)' }}>Hinweis:</strong>{' '}
        Klicke auf einen Farbchip, um den Color Picker zu öffnen.
        Die kleinen <strong>D</strong>- und <strong>F</strong>-Chips zeigen die Dark- bzw. Focus-Default-Farben zur Orientierung — sie sind nicht editierbar.
        <strong> ↺</strong> setzt den Token auf den System-Standard aus <code style={{ fontFamily: 'monospace', background: 'rgba(0,0,0,0.06)', padding: '0 3px', borderRadius: 3 }}>tokens.css</code> zurück.
      </div>

      {/* Live-Vorschau */}
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--text-muted)', marginBottom: 8 }}>
        Live-Vorschau
      </div>
      <PreviewPanel />

      {/* Token-Gruppen */}
      {TOKEN_GROUPS.map(group => (
        <div key={group.title} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--text-muted)', marginBottom: 6 }}>
            {group.title}
          </div>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
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
