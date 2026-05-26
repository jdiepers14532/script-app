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
      { cssVar: '--notif-unread',      label: 'Ungelesen-Badge',    light: '#E8F2FF', dark: '#1A2940' },
    ],
  },
]

// ── Export/Import-Format ──────────────────────────────────────────────────────

export interface ThemeExport {
  version: 1
  name: string
  mode: 'light' | 'dark'
  overrides: Record<string, string>
  colorSchemeId?: string
}

// ── Preset-System ─────────────────────────────────────────────────────────────

interface TokenPreset {
  id: string
  name: string
  mode: 'light' | 'dark'
  overrides: Record<string, string>
  colorSchemeId?: string
}

const PRESETS: TokenPreset[] = [
  // ── Light Presets ──
  {
    id: 'light-standard',
    name: 'Light System Standard',
    mode: 'light',
    overrides: {},
    colorSchemeId: 'default',
  },
  {
    id: 'light-lavendel',
    name: 'Lavendel',
    mode: 'light',
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
  // ── Dark Presets ──
  {
    id: 'dark-standard',
    name: 'Dark System Standard',
    mode: 'dark',
    overrides: {},
    colorSchemeId: 'default',
  },
  {
    id: 'dark-lavendel',
    name: 'Nacht Lavendel',
    mode: 'dark',
    colorSchemeId: 'lavendel',
    // Inspiriert von Palette 2 (#7776A6, #524D73, #C4C1D9) + Palette 3 (#353340, #998DA6, #F2F2F2)
    overrides: {
      '--bg-page':            '#1C1529',
      '--bg-surface':         '#261D37',
      '--bg-subtle':          '#302545',
      '--bg-active':          '#3A2D52',
      '--bg-hover':           '#362A4E',
      '--text-primary':       '#F2F0FF',
      '--text-secondary':     '#C4C1D9',
      '--text-muted':         '#998DA6',
      '--text-inverse':       '#1C1529',
      '--border':             '#524D73',
      '--border-subtle':      '#352D50',
      '--border-strong':      '#C4C1D9',
      '--btn-primary-bg':     '#7776A6',
      '--btn-primary-color':  '#FFFFFF',
      '--input-bg':           '#160F22',
      '--notif-unread':       '#2E1F4A',
    },
  },
]

// ── Storage & Hilfsfunktionen ─────────────────────────────────────────────────

const LS_KEY_LIGHT = 'sw-token-overrides-light'
const LS_KEY_DARK  = 'sw-token-overrides-dark'
// Legacy-Key (alte Daten migrieren)
const LS_KEY_LEGACY = 'sw-token-overrides'

function loadOverrides(mode: 'light' | 'dark'): Record<string, string> {
  const key = mode === 'light' ? LS_KEY_LIGHT : LS_KEY_DARK
  try {
    const stored = localStorage.getItem(key)
    if (stored) return JSON.parse(stored)
    // Legacy-Migration: beim ersten Aufruf von Light den alten Key übernehmen
    if (mode === 'light') {
      const legacy = localStorage.getItem(LS_KEY_LEGACY)
      if (legacy) {
        const parsed = JSON.parse(legacy)
        localStorage.setItem(LS_KEY_LIGHT, legacy)
        return parsed
      }
    }
    return {}
  } catch { return {} }
}

function saveOverrides(mode: 'light' | 'dark', o: Record<string, string>) {
  const key = mode === 'light' ? LS_KEY_LIGHT : LS_KEY_DARK
  localStorage.setItem(key, JSON.stringify(o))
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

/** Light-Overrides: inline style auf :root (wirkt im Light-Mode) */
function applyLightOverrides(o: Record<string, string>) {
  // Zuerst alle bekannten Light-Token entfernen
  TOKEN_GROUPS.forEach(g => g.tokens.forEach(t => document.documentElement.style.removeProperty(t.cssVar)))
  Object.entries(o).forEach(([k, v]) => document.documentElement.style.setProperty(k, v))
}

/** Dark-Overrides: injizierter <style>-Tag mit [data-theme='dark'] !important */
function applyDarkOverrides(o: Record<string, string>) {
  let style = document.getElementById('sw-dark-overrides') as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = 'sw-dark-overrides'
    document.head.appendChild(style)
  }
  if (Object.keys(o).length === 0) { style.textContent = ''; return }
  const rules = Object.entries(o).map(([k, v]) => `  ${k}: ${v} !important;`).join('\n')
  style.textContent = `[data-theme='dark'] {\n${rules}\n}`
}

// Backend-Persistenz (debounced)
let persistTimerLight: ReturnType<typeof setTimeout> | null = null
let persistTimerDark:  ReturnType<typeof setTimeout> | null = null

function persistToBackend(mode: 'light' | 'dark', overrides: Record<string, string>) {
  const timer = mode === 'light' ? persistTimerLight : persistTimerDark
  if (timer) clearTimeout(timer)
  const t = setTimeout(() => {
    const key = mode === 'light' ? 'token_overrides_light' : 'token_overrides_dark'
    fetch('/api/me/settings', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ui_settings: { [key]: overrides } }),
    }).catch(() => {})
  }, 1000)
  if (mode === 'light') persistTimerLight = t
  else persistTimerDark = t
}

async function loadFromBackend(): Promise<{ light: Record<string, string>; dark: Record<string, string> }> {
  try {
    const r = await fetch('/api/me/settings', { credentials: 'include' })
    if (!r.ok) return { light: {}, dark: {} }
    const data = await r.json()
    return {
      light: data?.ui_settings?.token_overrides_light ?? data?.ui_settings?.token_overrides ?? {},
      dark:  data?.ui_settings?.token_overrides_dark  ?? {},
    }
  } catch { return { light: {}, dark: {} } }
}

// ── ColorChip ─────────────────────────────────────────────────────────────────

function ColorChip({ token, mode, isOverridden, onSet, onReset }: {
  token: TokenDef
  mode: 'light' | 'dark'
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
  const systemDefault = mode === 'light' ? token.light : (token.dark ?? token.light)
  const otherRef = mode === 'light' ? token.dark : token.light

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
        title={isHex ? 'Klicken zum Ändern' : 'Nicht direkt editierbar'}
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
        ref={inputRef} type="color"
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
          <input autoFocus value={hexInput}
            onChange={e => setHexInput(e.target.value)}
            onBlur={handleHexBlur} onKeyDown={handleHexKey}
            placeholder={currentVal}
            style={{ width: 76, fontSize: 11, fontFamily: 'monospace', textAlign: 'center', border: '1px solid var(--color-info)', borderRadius: 4, padding: '3px 5px', background: 'var(--input-bg)', color: 'var(--text-primary)', outline: 'none' }}
          />
        ) : (
          <div
            onClick={() => { setEditingHex(true); setHexInput(currentVal) }}
            title="Klicken zum Tippen"
            style={{ width: 76, fontSize: 11, fontFamily: 'monospace', color: 'var(--text-secondary)', textAlign: 'center', padding: '3px 5px', borderRadius: 4, border: '1px solid transparent', cursor: 'text', background: 'var(--bg-subtle)' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}
          >{currentVal}</div>
        )
      ) : (
        <div style={{ width: 76, fontSize: 10, fontFamily: 'monospace', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.3, wordBreak: 'break-all' }}>{currentVal}</div>
      )}
      <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-secondary)', minWidth: 72, textAlign: 'right' }}>
        {currentVal || '—'}
      </div>
      {/* Referenz-Chip: der andere Mode (Info) */}
      <div style={{ display: 'flex', gap: 3 }}>
        {otherRef && (
          <div title={`${mode === 'light' ? 'Dark' : 'Light'}-Default: ${otherRef}`} style={{ width: 20, height: 20, borderRadius: 4, border: '1.5px solid var(--border)', background: otherRef, cursor: 'help', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: isLightColor(otherRef) ? '#000' : '#fff' }}>
            {mode === 'light' ? 'D' : 'L'}
          </div>
        )}
        {token.focus && mode === 'light' && (
          <div title={`Focus-Default: ${token.focus}`} style={{ width: 20, height: 20, borderRadius: 4, border: '1.5px solid var(--border)', background: token.focus, cursor: 'help', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: isLightColor(token.focus) ? '#000' : '#fff' }}>F</div>
        )}
        {!otherRef && !(token.focus && mode === 'light') && <div style={{ width: 43 }} />}
        {otherRef && !(token.focus && mode === 'light') && <div style={{ width: 23 }} />}
      </div>
      <div style={{ width: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {isOverridden && (
          <button onClick={() => onReset(token.cssVar)}
            title={`Zurücksetzen (System: ${systemDefault})`}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, fontSize: 17, lineHeight: 1 }}
          >↺</button>
        )}
      </div>
    </div>
  )
}

// ── Haupt-Komponente ──────────────────────────────────────────────────────────

interface DesignTokenEditorProps {
  mode: 'light' | 'dark'
  activeColorSchemeId?: string
  onSetColorSchemeId?: (id: string) => void
}

export function DesignTokenEditor({ mode, activeColorSchemeId, onSetColorSchemeId }: DesignTokenEditorProps) {
  const [overrides, setOverrides] = useState<Record<string, string>>(() => loadOverrides(mode))
  const [backendLoaded, setBackendLoaded] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)

  // Beim Mode-Wechsel die Overrides neu laden
  useEffect(() => {
    setOverrides(loadOverrides(mode))
  }, [mode])

  // Backend beim Start laden und anwenden
  useEffect(() => {
    loadFromBackend().then(({ light, dark }) => {
      // Light anwenden
      const lm = Object.keys(light).length > 0 ? light : loadOverrides('light')
      saveOverrides('light', lm)
      applyLightOverrides(lm)
      // Dark anwenden
      const dm = Object.keys(dark).length > 0 ? dark : loadOverrides('dark')
      saveOverrides('dark', dm)
      applyDarkOverrides(dm)
      // Aktuellen Mode in State setzen
      setOverrides(mode === 'light' ? lm : dm)
      setBackendLoaded(true)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const overridesCount = Object.keys(overrides).length

  function setToken(cssVar: string, value: string) {
    const next = { ...overrides, [cssVar]: value }
    setOverrides(next)
    saveOverrides(mode, next)
    persistToBackend(mode, next)
    if (mode === 'light') applyLightOverrides(next)
    else applyDarkOverrides(next)
  }

  function resetToken(cssVar: string) {
    const next = { ...overrides }
    delete next[cssVar]
    setOverrides(next)
    saveOverrides(mode, next)
    persistToBackend(mode, next)
    if (mode === 'light') applyLightOverrides(next)
    else applyDarkOverrides(next)
  }

  function resetAll() {
    setOverrides({})
    saveOverrides(mode, {})
    persistToBackend(mode, {})
    if (mode === 'light') applyLightOverrides({})
    else applyDarkOverrides({})
  }

  function applyPreset(preset: TokenPreset) {
    setOverrides(preset.overrides)
    saveOverrides(mode, preset.overrides)
    persistToBackend(mode, preset.overrides)
    if (mode === 'light') applyLightOverrides(preset.overrides)
    else applyDarkOverrides(preset.overrides)
    if (preset.colorSchemeId && onSetColorSchemeId) {
      onSetColorSchemeId(preset.colorSchemeId)
    }
  }

  function getActivePresetId(): string {
    for (const p of PRESETS.filter(x => x.mode === mode)) {
      if (p.id.endsWith('-standard') && overridesCount === 0) {
        const schemeOk = !p.colorSchemeId || activeColorSchemeId === p.colorSchemeId
        if (schemeOk) return p.id
        continue
      }
      const keys = Object.keys(p.overrides)
      const tokensMatch = keys.length === overridesCount && keys.every(k => overrides[k] === p.overrides[k])
      const schemeOk = !p.colorSchemeId || activeColorSchemeId === p.colorSchemeId
      if (tokensMatch && schemeOk) return p.id
    }
    return 'custom'
  }

  // ── JSON Export ──────────────────────────────────────────────────────────────
  function exportJson() {
    const presetName = PRESETS.find(p => p.id === getActivePresetId())?.name ?? 'Benutzerdefiniert'
    const data: ThemeExport = {
      version: 1,
      name: presetName,
      mode,
      overrides,
      colorSchemeId: activeColorSchemeId,
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `theme-${mode}-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── JSON Import ──────────────────────────────────────────────────────────────
  function importJson(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const data: ThemeExport = JSON.parse(ev.target?.result as string)
        if (data.version !== 1 || !data.overrides || !data.mode) {
          alert('Ungültige Theme-Datei (version oder mode fehlt).')
          return
        }
        if (data.mode !== mode) {
          const ok = confirm(`Die Datei ist ein ${data.mode === 'light' ? 'Light' : 'Dark'}-Theme, aktuell ist ${mode === 'light' ? 'Light' : 'Dark'} aktiv. Trotzdem importieren?`)
          if (!ok) return
        }
        // Tokens anwenden
        const targetMode = data.mode
        setOverrides(data.overrides)
        saveOverrides(targetMode, data.overrides)
        persistToBackend(targetMode, data.overrides)
        if (targetMode === 'light') applyLightOverrides(data.overrides)
        else applyDarkOverrides(data.overrides)
        // Farbschema übernehmen
        if (data.colorSchemeId && onSetColorSchemeId) {
          onSetColorSchemeId(data.colorSchemeId)
        }
      } catch {
        alert('Fehler beim Lesen der Datei.')
      }
    }
    reader.readAsText(file)
    e.target.value = '' // Reset
  }

  const activePresetId = getActivePresetId()
  const modePresets = PRESETS.filter(p => p.mode === mode)
  const modeLabel = mode === 'light' ? 'Light' : 'Dark'

  return (
    <div style={{ padding: '24px 28px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
            {modeLabel}-Theme anpassen
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Änderungen werden im Profil gespeichert.{' '}
            Zwischen Hell/Dunkel wechseln (oben) um das andere Theme zu bearbeiten.
            {!backendLoaded && <span style={{ color: 'var(--text-muted)' }}> · Lade…</span>}
          </div>
        </div>

        {/* Preset-Dropdown + Export/Import */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
          <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Preset
          </label>
          <select
            value={activePresetId}
            onChange={e => {
              const p = modePresets.find(x => x.id === e.target.value)
              if (p) applyPreset(p)
            }}
            style={{
              fontSize: 12, padding: '5px 10px', borderRadius: 6,
              border: '1px solid var(--border)', background: 'var(--bg-surface)',
              color: 'var(--text-primary)', cursor: 'pointer', fontFamily: 'inherit',
              outline: 'none', minWidth: 180,
            }}
          >
            {modePresets.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
            {activePresetId === 'custom' && (
              <option value="custom" disabled>Benutzerdefiniert</option>
            )}
          </select>

          {/* Export / Import Buttons */}
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={exportJson}
              title="Aktuelle Theme-Einstellungen als JSON exportieren"
              style={{ fontSize: 11, padding: '3px 10px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg-subtle)', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              ↓ Export
            </button>
            <button
              onClick={() => importRef.current?.click()}
              title="Theme-JSON importieren"
              style={{ fontSize: 11, padding: '3px 10px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg-subtle)', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              ↑ Import
            </button>
            <input ref={importRef} type="file" accept=".json" onChange={importJson}
              style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
            />
          </div>
        </div>

        {/* Reset-Button */}
        {overridesCount > 0 && (
          <button onClick={resetAll}
            title="Alle Änderungen zurücksetzen"
            style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, whiteSpace: 'nowrap', alignSelf: 'flex-end' }}
          >
            ↺ {overridesCount} Änderung{overridesCount !== 1 ? 'en' : ''}
          </button>
        )}
      </div>

      {/* Info */}
      <div style={{ background: 'var(--color-info-bg)', border: '1px solid rgba(0,122,255,0.2)', borderRadius: 7, padding: '10px 14px', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
        Chip klicken → Color Picker · Hex-Wert klicken → tippen · <strong>↺</strong> = System-Standard.{' '}
        Presets ändern auch das <strong>Farbschema</strong>.{' '}
        <strong>Export/Import</strong> speichert Tokens + Farbschema als JSON.
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
                mode={mode}
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
