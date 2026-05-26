import React, { useState, useEffect, useRef } from 'react'

// ── Token-Definitionen (nur Light-Schema editierbar) ──────────────────────────

interface TokenDef {
  cssVar: string
  label: string
  light: string
  dark?: string
  focus?: string
  description?: string
}

const TOKEN_GROUPS: { title: string; tokens: TokenDef[] }[] = [
  {
    title: 'Hintergründe',
    tokens: [
      { cssVar: '--bg-page',    label: 'Seite',           light: '#FFFFFF', dark: '#0D0D0D', focus: '#FAFAF8' },
      { cssVar: '--bg-surface', label: 'Flächen & Cards', light: '#FAFAFA', dark: '#181818', focus: '#FFFFFF' },
      { cssVar: '--bg-subtle',  label: 'Subtil',          light: '#F5F5F5', dark: '#1A1A1A', focus: '#F0EFED' },
      { cssVar: '--bg-active',  label: 'Aktiv',           light: '#F5F5F5', dark: '#1F1F1F', focus: '#ECEAE6' },
      { cssVar: '--bg-hover',   label: 'Hover',           light: '#EDEDED', dark: '#262626' },
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

const SYSTEM_DEFAULTS: Record<string, string> = {}
TOKEN_GROUPS.forEach(g => g.tokens.forEach(t => { SYSTEM_DEFAULTS[t.cssVar] = t.light }))

// ── Preset-System ─────────────────────────────────────────────────────────────

interface TokenPreset {
  id: string
  name: string
  overrides: Record<string, string>
  /** ID des BUILTIN_COLOR_SCHEMES, der zusammen mit diesem Preset aktiviert wird */
  colorSchemeId?: string
}

const PRESETS: TokenPreset[] = [
  {
    id: 'system-light',
    name: 'Light System Standard',
    overrides: {},
    colorSchemeId: 'default',
  },
  {
    id: 'lavendel',
    name: 'Lavendel',
    // Backgrounds: Paletten 1–3,5 — starker Kontrast durch #2D0140 als Textfarbe
    // Buttons: #510273 (Palette 1 — Royal Deep Purple)
    // Farbschema: Image 4 (#660273 Action, #BC55D9 Akzent, Orange #F27405 Komplementär)
    colorSchemeId: 'lavendel',
    overrides: {
      '--bg-page':            '#F5F0FC',
      '--bg-surface':         '#ECE3F5',
      '--bg-subtle':          '#E2D5ED',
      '--bg-active':          '#D8C9E8',
      '--bg-hover':           '#DECCEC',
      '--text-primary':       '#2D0140',
      '--text-secondary':     '#510273',
      '--text-muted':         '#7776A6',
      '--text-inverse':       '#FFFFFF',
      '--border':             '#C5ADDE',
      '--border-subtle':      '#D8CAE9',
      '--border-strong':      '#2D0140',
      '--btn-primary-bg':     '#510273',
      '--btn-primary-color':  '#FFFFFF',
      '--input-bg':           '#FAF6FF',
      '--notif-unread':       '#EFE2FA',
    },
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

let persistTimer: ReturnType<typeof setTimeout> | null = null
function persistToBackend(overrides: Record<string, string>) {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    fetch('/api/me/settings', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ui_settings: { token_overrides: overrides } }),
    }).catch(() => {})
  }, 1000)
}

async function loadFromBackend(): Promise<Record<string, string> | null> {
  try {
    const r = await fetch('/api/me/settings', { credentials: 'include' })
    if (!r.ok) return null
    const data = await r.json()
    return data?.ui_settings?.token_overrides ?? null
  } catch { return null }
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
  const [hexInput, setHexInput] = useState('')
  const [editingHex, setEditingHex] = useState(false)
  useEffect(() => { setCurrentVal(readToken(token.cssVar)) })

  const isHex = currentVal.startsWith('#') && currentVal.length === 7

  function handleHexBlur() {
    setEditingHex(false)
    const v = hexInput.trim()
    const normalized = v.startsWith('#') ? v : `#${v}`
    if (/^#[0-9a-fA-F]{6}$/.test(normalized)) {
      onSet(token.cssVar, normalized)
      setCurrentVal(normalized)
    }
    setHexInput('')
  }

  function handleHexKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
    if (e.key === 'Escape') { setEditingHex(false); setHexInput('') }
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px',
      borderRadius: 6,
      background: isOverridden ? 'rgba(0,122,255,0.05)' : 'transparent',
      border: `1px solid ${isOverridden ? 'rgba(0,122,255,0.2)' : 'transparent'}`,
    }}>
      <div
        onClick={() => isHex && inputRef.current?.click()}
        title={isHex ? 'Klicken zum Ändern' : 'Nicht direkt editierbar (rgba)'}
        style={{
          width: 32, height: 32, borderRadius: 7, flexShrink: 0,
          cursor: isHex ? 'pointer' : 'default',
          background: `var(${token.cssVar})`,
          border: '1.5px solid var(--border)',
          boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.07)',
          transition: 'transform 0.1s',
        }}
        onMouseEnter={e => isHex && ((e.target as HTMLElement).style.transform = 'scale(1.1)')}
        onMouseLeave={e => ((e.target as HTMLElement).style.transform = 'scale(1)')}
      />
      <input
        ref={inputRef}
        type="color"
        value={isHex ? currentVal : '#000000'}
        onChange={e => { onSet(token.cssVar, e.target.value); setCurrentVal(e.target.value) }}
        style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>{token.label}</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{token.cssVar}</div>
      </div>
      {isHex ? (
        editingHex ? (
          <input
            autoFocus
            value={hexInput}
            onChange={e => setHexInput(e.target.value)}
            onBlur={handleHexBlur}
            onKeyDown={handleHexKey}
            placeholder={currentVal}
            style={{
              width: 76, fontSize: 11, fontFamily: 'monospace', textAlign: 'center',
              border: '1px solid var(--color-info)', borderRadius: 4, padding: '3px 5px',
              background: 'var(--input-bg)', color: 'var(--text-primary)', outline: 'none',
            }}
          />
        ) : (
          <div
            onClick={() => { setEditingHex(true); setHexInput(currentVal) }}
            title="Klicken zum Tippen"
            style={{
              width: 76, fontSize: 11, fontFamily: 'monospace', color: 'var(--text-secondary)',
              textAlign: 'center', padding: '3px 5px', borderRadius: 4,
              border: '1px solid transparent', cursor: 'text',
              background: 'var(--bg-subtle)',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}
          >
            {currentVal}
          </div>
        )
      ) : (
        <div style={{ width: 76, fontSize: 10, fontFamily: 'monospace', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.3, wordBreak: 'break-all' }}>
          {currentVal}
        </div>
      )}
      <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-secondary)', minWidth: 72, textAlign: 'right' }}>
        {currentVal || '—'}
      </div>
      <div style={{ display: 'flex', gap: 3 }}>
        {token.dark && (
          <div title={`Dark Default: ${token.dark}`} style={{ width: 20, height: 20, borderRadius: 4, border: '1.5px solid var(--border)', background: token.dark, cursor: 'help', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: isLightColor(token.dark) ? '#000' : '#fff' }}>D</div>
        )}
        {token.focus && (
          <div title={`Focus Default: ${token.focus}`} style={{ width: 20, height: 20, borderRadius: 4, border: '1.5px solid var(--border)', background: token.focus, cursor: 'help', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: isLightColor(token.focus) ? '#000' : '#fff' }}>F</div>
        )}
        {!token.dark && !token.focus && <div style={{ width: 43 }} />}
        {token.dark && !token.focus && <div style={{ width: 23 }} />}
      </div>
      <div style={{ width: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {isOverridden && (
          <button
            onClick={() => onReset(token.cssVar)}
            title={`Zurücksetzen (${SYSTEM_DEFAULTS[token.cssVar]})`}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, fontSize: 17, lineHeight: 1 }}
          >↺</button>
        )}
      </div>
    </div>
  )
}

// ── Haupt-Komponente ──────────────────────────────────────────────────────────

interface DesignTokenEditorProps {
  activeColorSchemeId?: string
  onSetColorSchemeId?: (id: string) => void
}

export function DesignTokenEditor({ activeColorSchemeId, onSetColorSchemeId }: DesignTokenEditorProps) {
  const [overrides, setOverrides] = useState<Record<string, string>>(loadOverrides)
  const [backendLoaded, setBackendLoaded] = useState(false)
  const overridesCount = Object.keys(overrides).length

  useEffect(() => {
    loadFromBackend().then(backendOverrides => {
      if (backendOverrides && Object.keys(backendOverrides).length > 0) {
        const merged = { ...loadOverrides(), ...backendOverrides }
        setOverrides(merged)
        saveOverrides(merged)
        Object.entries(merged).forEach(([k, v]) => document.documentElement.style.setProperty(k, v))
      } else {
        Object.entries(loadOverrides()).forEach(([k, v]) => document.documentElement.style.setProperty(k, v))
      }
      setBackendLoaded(true)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function setToken(cssVar: string, value: string) {
    document.documentElement.style.setProperty(cssVar, value)
    const next = { ...overrides, [cssVar]: value }
    setOverrides(next)
    saveOverrides(next)
    persistToBackend(next)
  }

  function resetToken(cssVar: string) {
    document.documentElement.style.removeProperty(cssVar)
    const next = { ...overrides }
    delete next[cssVar]
    setOverrides(next)
    saveOverrides(next)
    persistToBackend(next)
  }

  function resetAll() {
    Object.keys(overrides).forEach(v => document.documentElement.style.removeProperty(v))
    setOverrides({})
    saveOverrides({})
    persistToBackend({})
  }

  function applyPreset(preset: TokenPreset) {
    Object.keys(overrides).forEach(v => document.documentElement.style.removeProperty(v))
    Object.entries(preset.overrides).forEach(([k, v]) => document.documentElement.style.setProperty(k, v))
    setOverrides(preset.overrides)
    saveOverrides(preset.overrides)
    persistToBackend(preset.overrides)
    if (preset.colorSchemeId && onSetColorSchemeId) {
      onSetColorSchemeId(preset.colorSchemeId)
    }
  }

  function getActivePresetId(): string {
    for (const p of PRESETS) {
      if (p.id === 'system-light') {
        const schemeOk = !p.colorSchemeId || activeColorSchemeId === p.colorSchemeId
        if (overridesCount === 0 && schemeOk) return 'system-light'
        continue
      }
      const keys = Object.keys(p.overrides)
      const tokensMatch = keys.length === overridesCount && keys.every(k => overrides[k] === p.overrides[k])
      const schemeOk = !p.colorSchemeId || activeColorSchemeId === p.colorSchemeId
      if (tokensMatch && schemeOk) return p.id
    }
    return 'custom'
  }

  const activePresetId = getActivePresetId()

  return (
    <div style={{ padding: '24px 28px' }}>

      {/* Header mit Preset-Dropdown rechts */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
            Light-Theme anpassen
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Ändere die Farben des hellen Themes. Änderungen werden in deinem Profil gespeichert.
            Das Dark-Theme bleibt unverändert.
            {!backendLoaded && <span style={{ marginLeft: 6, color: 'var(--text-muted)' }}>· Lade…</span>}
          </div>
        </div>

        {/* Preset-Dropdown */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Preset
          </label>
          <select
            value={activePresetId}
            onChange={e => {
              const p = PRESETS.find(x => x.id === e.target.value)
              if (p) applyPreset(p)
            }}
            style={{
              fontSize: 12, padding: '5px 10px', borderRadius: 6,
              border: '1px solid var(--border)', background: 'var(--bg-surface)',
              color: 'var(--text-primary)', cursor: 'pointer', fontFamily: 'inherit',
              outline: 'none', minWidth: 170,
            }}
          >
            {PRESETS.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
            {activePresetId === 'custom' && (
              <option value="custom" disabled>Benutzerdefiniert</option>
            )}
          </select>
        </div>

        {/* Reset-Button */}
        {overridesCount > 0 && (
          <button
            onClick={resetAll}
            title="Alle Overrides auf System-Standard zurücksetzen"
            style={{
              padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)',
              background: 'none', color: 'var(--text-secondary)', fontSize: 12,
              cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, whiteSpace: 'nowrap',
              alignSelf: 'flex-end',
            }}
          >
            ↺ {overridesCount} Änderung{overridesCount !== 1 ? 'en' : ''}
          </button>
        )}
      </div>

      {/* Info-Box */}
      <div style={{
        background: 'var(--color-info-bg)', border: '1px solid rgba(0,122,255,0.2)',
        borderRadius: 7, padding: '10px 14px', fontSize: 12,
        color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6,
      }}>
        Chip klicken → Color Picker. Hex-Wert klicken → direkt tippen.{' '}
        <strong>D</strong> = Dark-Default · <strong>F</strong> = Focus-Default (nur Info).{' '}
        <strong>↺</strong> = System-Standard zurücksetzen.{' '}
        Presets ändern auch das <strong>Farbschema</strong> (Akzentfarben).
      </div>

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
