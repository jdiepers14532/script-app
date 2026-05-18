import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import AppShell from '../components/AppShell'
import Tooltip from '../components/Tooltip'
import { api } from '../api/client'
import { useSelectedProduction } from '../contexts'
import { DEFAULT_ENV_COLORS, DEFAULT_ENV_COLORS_DARK, type EnvKey, type EnvColor } from '../data/scenes'
import { DEFAULT_SECTIONS, type StatModalSection } from '../components/StatistikModal'
import { useTerminologie, TERM_OPTIONS, TERM_DEFAULTS, TERM_KEYS, TERM_LABELS } from '../sw-ui'
import type { TermKey, TerminologieConfig } from '../sw-ui'
import DokumentVorlagenEditor, { ToolbarContent, emptyVorlagenEditorValue, renderPmToPreviewHtml, type DokumentVorlagenEditorValue, type PreviewContext } from '../components/editor/DokumentVorlagenEditor'
import { SzenenKopfVorlagenEditor, KopfZeilenEditor, emptyKopfZeilenEditorValue } from '../sw-ui'
import type { KopfZeilenEditorValue } from '../sw-ui'
import AutorenplanTab from '../components/AutorenplanTab'

// ── Constants ────────────────────────────────────────────────────────────────────

const DK_TABS = [
  { id: 'allgemein',              label: 'Allgemein' },
  { id: 'terminologie',           label: 'Terminologie' },
  { id: 'figuren',                label: 'Figuren' },
  { id: 'produktion',            label: 'Produktion' },
  { id: 'export-vorlagen',       label: 'Export-Vorlagen' },
  { id: 'lock-regeln',           label: 'Lock-Regeln' },
  { id: 'dokument-typen',        label: 'Dokumenten-Formatierung' },
  { id: 'gruppen-register',      label: 'Gruppen-Register' },

  { id: 'statistik-panel',         label: 'Statistik-Panel' },
  { id: 'daily-regeln',            label: 'Daily-Regeln' },
  { id: 'autorenplan',            label: 'Autorenplan' },
]

const FORMAT_TEMPLATE_TABS = ['dokument-typen', 'kopf-fusszeilen', 'vorlagen', 'stockshot-templates']
const FORMAT_SUB_NAV = [
  { id: 'dokument-typen',      label: 'Drehbuch-Formatierung' },
  { id: 'kopf-fusszeilen',     label: 'Kopf-/Fußzeile' },
  { id: 'vorlagen',            label: 'Notiz-Vorlagen' },
  { id: 'stockshot-templates', label: 'Stockshot-Templates' },
]

const KUERZEL_FIELDS = [
  { key: 'int',       label: 'Innen (INT)' },
  { key: 'ext',       label: 'Aussen (EXT)' },
  { key: 'tag',       label: 'Tag' },
  { key: 'nacht',     label: 'Nacht' },
  { key: 'daemmerung',label: 'Dämmerung' },
  { key: 'abend',     label: 'Abend' },
]
const DEFAULT_KUERZEL: Record<string, string> = { int: 'I', ext: 'E', tag: 'T', nacht: 'N', daemmerung: 'D', abend: 'A' }

const ENV_COLOR_LABELS: Record<EnvKey, string> = {
  d_i:       'INT / Tag',
  d_e:       'EXT / Tag',
  d_ie:      'INT+EXT / Tag',
  evening_i: 'INT / Abend',
  n_i:       'INT / Nacht',
  n_e:       'EXT / Nacht',
  n_ie:      'INT+EXT / Nacht',
}

const FONT_FAMILIES = [
  'Courier Prime',
  'Courier New',
  'Inter',
  'Arial',
  'Helvetica',
  'Times New Roman',
  'Georgia',
]

const COPY_SECTIONS = [
  { id: 'kategorien', label: 'Charakter-Kategorien' },
  { id: 'labels',     label: 'Fassungs-Labels' },
  { id: 'colors',     label: 'Revisions-Farben' },
  { id: 'einstellungen', label: 'Revisions-Export' },
  { id: 'absatzformate', label: 'Absatzformate' },
  { id: 'vorlagen',   label: 'Dokument-Vorlagen' },
]

// ── Drag-sortable list helper ────────────────────────────────────────────────────
function SortableList({
  items, onReorder, renderItem,
}: {
  items: any[]
  onReorder: (newItems: any[]) => void
  renderItem: (item: any, dragHandle: React.ReactNode) => React.ReactNode
}) {
  const dragIdx = useRef<number | null>(null)
  const overIdx = useRef<number | null>(null)

  return (
    <div>
      {items.map((item, i) => (
        <div
          key={item.id}
          draggable
          onDragStart={() => { dragIdx.current = i }}
          onDragOver={e => { e.preventDefault(); overIdx.current = i }}
          onDrop={() => {
            if (dragIdx.current === null || dragIdx.current === overIdx.current) return
            const arr = [...items]
            const [moved] = arr.splice(dragIdx.current, 1)
            arr.splice(overIdx.current!, 0, moved)
            onReorder(arr)
            dragIdx.current = null; overIdx.current = null
          }}
          style={{ userSelect: 'none' }}
        >
          {renderItem(item, (
            <span style={{ cursor: 'grab', color: 'var(--text-muted)', fontSize: 14, lineHeight: 1, paddingRight: 8 }}>&#x2807;</span>
          ))}
        </div>
      ))}
    </div>
  )
}

// ── FeldListe helper ─────────────────────────────────────────────────────────────
function FeldListe({ felder, onDelete, deleteConfirm, onConfirmDelete, onCancelDelete }: {
  felder: any[]
  onDelete: (id: number) => void
  deleteConfirm: number | null
  onConfirmDelete: (id: number) => void
  onCancelDelete: () => void
}) {
  if (felder.length === 0) return <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '8px 0' }}>Keine Felder konfiguriert.</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
      {felder.map(f => (
        <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--bg-subtle)', borderRadius: 6 }}>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{f.name}</span>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '2px 6px', background: 'var(--bg)', borderRadius: 4 }}>{f.typ}</span>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{f.gilt_fuer}</span>
          {deleteConfirm === f.id ? (
            <span style={{ fontSize: 11, display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={{ color: '#FF3B30' }}>Alle Werte werden gelöscht!</span>
              <button onClick={() => onConfirmDelete(f.id)} style={{ fontSize: 11, padding: '2px 8px', background: '#FF3B30', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Löschen</button>
              <button onClick={onCancelDelete} style={{ fontSize: 11, padding: '2px 8px', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', background: 'transparent' }}>Abbrechen</button>
            </span>
          ) : (
            <button onClick={() => onDelete(f.id)} style={{ fontSize: 11, padding: '2px 6px', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', background: 'transparent', color: 'var(--text-secondary)' }}>Löschen</button>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Tab: Allgemein (production-specific endpoints) ───────────────────────────────

function AllgemeinTab({ productionId }: { productionId: string }) {
  const { t } = useTerminologie()
  const [datumsformat, setDatumsformat] = useState<'de' | 'en'>('de')
  const [datumsformatSaving, setDatumsformatSaving] = useState(false)
  const [kuerzel, setKuerzel] = useState<Record<string, string>>(DEFAULT_KUERZEL)
  const [roles, setRoles] = useState<string[] | null>(null)
  const [kuerzelSaving, setKuerzelSaving] = useState(false)
  const [envColors, setEnvColors] = useState<Record<EnvKey, EnvColor>>({ ...DEFAULT_ENV_COLORS })
  const [envColorsDark, setEnvColorsDark] = useState<Record<EnvKey, EnvColor>>({ ...DEFAULT_ENV_COLORS_DARK })
  const [envColorsSaving, setEnvColorsSaving] = useState(false)
  const [envColorsCustom, setEnvColorsCustom] = useState(false)
  const [lnFont, setLnFont] = useState("'Courier Prime', 'Courier New', monospace")
  const [lnSize, setLnSize] = useState(10)
  const [lnColor, setLnColor] = useState('#999999')
  const [lnSaving, setLnSaving] = useState(false)

  useEffect(() => {
    fetch(`/api/dk-settings/${productionId}/app-settings`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((data: any) => {
        if (data?.datumsformat === 'en') setDatumsformat('en')
        if (data?.scene_kuerzel) {
          try { setKuerzel({ ...DEFAULT_KUERZEL, ...JSON.parse(data.scene_kuerzel) }) } catch {}
        }
        if (data?.scene_env_colors) {
          try {
            const parsed = JSON.parse(data.scene_env_colors)
            const merged = { ...DEFAULT_ENV_COLORS }
            for (const k of Object.keys(parsed) as EnvKey[]) {
              if (merged[k]) merged[k] = { ...merged[k], ...parsed[k] }
            }
            setEnvColors(merged)
            setEnvColorsCustom(true)
          } catch {}
        }
        if (data?.scene_env_colors_dark) {
          try {
            const parsed = JSON.parse(data.scene_env_colors_dark)
            const merged = { ...DEFAULT_ENV_COLORS_DARK }
            for (const k of Object.keys(parsed) as EnvKey[]) {
              if (merged[k]) merged[k] = { ...merged[k], ...parsed[k] }
            }
            setEnvColorsDark(merged)
          } catch {}
        }
        if (data?.ln_settings) {
          try {
            const s = JSON.parse(data.ln_settings)
            if (s.fontFamily) setLnFont(s.fontFamily)
            if (typeof s.fontSizePt === 'number') setLnSize(s.fontSizePt)
            if (s.color) setLnColor(s.color)
          } catch {}
        }
      })
      .catch(() => {})

    // Roles from auth app
    fetch('https://auth.serienwerft.studio/api/auth/my-apps', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((data: any) => {
        const script = (data?.apps || []).find((a: any) => a.subdomain === 'script')
        setRoles(script?.roles || [])
      })
      .catch(() => {})
  }, [productionId])

  const saveKuerzel = async (next: Record<string, string>) => {
    setKuerzel(next)
    setKuerzelSaving(true)
    await fetch(`/api/dk-settings/${productionId}/app-settings/scene_kuerzel`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: JSON.stringify(next) }),
    }).catch(() => {})
    setKuerzelSaving(false)
  }

  const saveDatumsformat = async (val: 'de' | 'en') => {
    setDatumsformat(val)
    setDatumsformatSaving(true)
    await fetch(`/api/dk-settings/${productionId}/app-settings/datumsformat`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: val }),
    }).catch(() => {})
    setDatumsformatSaving(false)
  }

  const saveEnvColors = async (next: Record<EnvKey, EnvColor>) => {
    setEnvColors(next)
    setEnvColorsCustom(true)
    setEnvColorsSaving(true)
    await fetch(`/api/dk-settings/${productionId}/app-settings/scene_env_colors`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: JSON.stringify(next) }),
    }).catch(() => {})
    setEnvColorsSaving(false)
    window.dispatchEvent(new CustomEvent('app-settings-changed', { detail: { productionId } }))
  }

  const saveEnvColorsDark = async (next: Record<EnvKey, EnvColor>) => {
    setEnvColorsDark(next)
    setEnvColorsSaving(true)
    await fetch(`/api/dk-settings/${productionId}/app-settings/scene_env_colors_dark`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: JSON.stringify(next) }),
    }).catch(() => {})
    setEnvColorsSaving(false)
    window.dispatchEvent(new CustomEvent('app-settings-changed', { detail: { productionId } }))
  }

  const resetEnvColorsToDefault = async () => {
    setEnvColors({ ...DEFAULT_ENV_COLORS })
    setEnvColorsDark({ ...DEFAULT_ENV_COLORS_DARK })
    setEnvColorsCustom(false)
    setEnvColorsSaving(true)
    await Promise.all([
      fetch(`/api/dk-settings/${productionId}/app-settings/scene_env_colors`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: JSON.stringify(DEFAULT_ENV_COLORS) }),
      }),
      fetch(`/api/dk-settings/${productionId}/app-settings/scene_env_colors_dark`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: JSON.stringify(DEFAULT_ENV_COLORS_DARK) }),
      }),
    ]).catch(() => {})
    setEnvColorsSaving(false)
    window.dispatchEvent(new CustomEvent('app-settings-changed', { detail: { productionId } }))
  }

  const saveLnSettings = async () => {
    setLnSaving(true)
    await api.updateDkAppSetting(productionId, 'ln_settings', JSON.stringify({
      fontFamily: lnFont, fontSizePt: lnSize, color: lnColor,
    })).catch(() => {})
    window.dispatchEvent(new CustomEvent('app-settings-changed', { detail: { productionId } }))
    setLnSaving(false)
  }

  return (
    <div style={{ maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 32 }}>

      <section>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>Datumsformat</h3>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.6 }}>
          Format für Datumsangaben in Kopf-/Fußzeilen und Exporten dieser Produktion.
        </p>
        <div className="seg" style={{ display: 'inline-flex' }}>
          {([
            { val: 'de', label: 'Deutsch  (TT.MM.JJJJ)', example: '13.05.2026' },
            { val: 'en', label: 'Englisch (MM/DD/YYYY)', example: '05/13/2026' },
          ] as const).map(opt => (
            <button
              key={opt.val}
              className={datumsformat === opt.val ? 'on' : ''}
              onClick={() => saveDatumsformat(opt.val)}
              disabled={datumsformatSaving}
              title={opt.example}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {datumsformatSaving && <span style={{ marginLeft: 12, fontSize: 12, color: 'var(--text-secondary)' }}>Wird gespeichert...</span>}
      </section>

      <section>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>{t('szene', 'c')}-Kürzel</h3>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.6 }}>
          Abkürzungen für die einzeilige {t('szene', 'c')}übersicht.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, maxWidth: 360 }}>
          {KUERZEL_FIELDS.map(({ key, label }) => (
            <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>
              <input
                type="text"
                maxLength={4}
                value={kuerzel[key] ?? ''}
                onChange={e => setKuerzel(prev => ({ ...prev, [key]: e.target.value }))}
                onBlur={() => saveKuerzel(kuerzel)}
                style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-surface)', fontSize: 13, fontFamily: 'inherit', textTransform: 'uppercase' }}
              />
            </label>
          ))}
        </div>
        <button
          style={{ marginTop: 12, padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-subtle)', fontSize: 12, cursor: 'pointer' }}
          onClick={() => saveKuerzel(DEFAULT_KUERZEL)}
          disabled={kuerzelSaving}
        >
          Zurücksetzen
        </button>
        {kuerzelSaving && <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--text-secondary)' }}>Wird gespeichert...</span>}
      </section>

      <section>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>{t('szene', 'c')}farben</h3>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.6 }}>
          Farbkodierung der {t('szene', 'p')} nach INT/EXT und Tageszeit. Standard: Industrie-Standard (Movie Magic Scheduling).
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          {/* Light Mode */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#FFF', border: '1px solid #ccc', display: 'inline-block' }} />
              Hell
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(Object.keys(ENV_COLOR_LABELS) as EnvKey[]).map(key => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 500, width: 100, flexShrink: 0 }}>{ENV_COLOR_LABELS[key]}</span>
                  <input
                    type="color"
                    value={envColors[key].bg}
                    title="Hintergrund"
                    onChange={e => setEnvColors(prev => ({ ...prev, [key]: { ...prev[key], bg: e.target.value } }))}
                    onBlur={() => saveEnvColors(envColors)}
                    style={{ width: 28, height: 22, border: '1px solid var(--border)', borderRadius: 4, padding: 0, cursor: 'pointer' }}
                  />
                  <input
                    type="color"
                    value={envColors[key].stripe}
                    title="Akzent"
                    onChange={e => setEnvColors(prev => ({ ...prev, [key]: { ...prev[key], stripe: e.target.value } }))}
                    onBlur={() => saveEnvColors(envColors)}
                    style={{ width: 28, height: 22, border: '1px solid var(--border)', borderRadius: 4, padding: 0, cursor: 'pointer' }}
                  />
                  <div style={{ width: 40, height: 22, borderRadius: 4, background: envColors[key].bg, border: '1px solid var(--border)', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: envColors[key].stripe }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* Dark Mode */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#1A1A1A', border: '1px solid #555', display: 'inline-block' }} />
              Dunkel
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(Object.keys(ENV_COLOR_LABELS) as EnvKey[]).map(key => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 500, width: 100, flexShrink: 0 }}>{ENV_COLOR_LABELS[key]}</span>
                  <input
                    type="color"
                    value={envColorsDark[key].bg}
                    title="Hintergrund"
                    onChange={e => setEnvColorsDark(prev => ({ ...prev, [key]: { ...prev[key], bg: e.target.value } }))}
                    onBlur={() => saveEnvColorsDark(envColorsDark)}
                    style={{ width: 28, height: 22, border: '1px solid var(--border)', borderRadius: 4, padding: 0, cursor: 'pointer' }}
                  />
                  <input
                    type="color"
                    value={envColorsDark[key].stripe}
                    title="Akzent"
                    onChange={e => setEnvColorsDark(prev => ({ ...prev, [key]: { ...prev[key], stripe: e.target.value } }))}
                    onBlur={() => saveEnvColorsDark(envColorsDark)}
                    style={{ width: 28, height: 22, border: '1px solid var(--border)', borderRadius: 4, padding: 0, cursor: 'pointer' }}
                  />
                  <div style={{ width: 40, height: 22, borderRadius: 4, background: envColorsDark[key].bg, border: '1px solid #555', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: envColorsDark[key].stripe }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <button
          style={{ marginTop: 12, padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-subtle)', fontSize: 12, cursor: 'pointer' }}
          onClick={resetEnvColorsToDefault}
          disabled={envColorsSaving}
        >
          Auf Standard zurücksetzen
        </button>
        {envColorsSaving && <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--text-secondary)' }}>Wird gespeichert...</span>}
      </section>

      <section>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>Zeilennummern (Standard-Einstellungen)</h3>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.6 }}>
          Standard-Darstellung der Zeilennummern für alle Nutzer dieser Produktion.
          Nutzer können den Abstand in ihren Ansichts-Einstellungen individuell überschreiben.
        </p>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
          <label style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ color: 'var(--text-secondary)' }}>Schriftart</span>
            <select value={lnFont} onChange={e => setLnFont(e.target.value)}
              style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-subtle)', color: 'var(--text-primary)' }}>
              {LN_FONT_OPTIONS.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ color: 'var(--text-secondary)' }}>Größe (pt)</span>
            <input type="number" min={6} max={16} step={1} value={lnSize}
              onChange={e => setLnSize(Math.max(6, Math.min(16, parseInt(e.target.value) || 10)))}
              style={{ width: 60, fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-subtle)', color: 'var(--text-primary)', textAlign: 'center' }} />
          </label>
          <label style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ color: 'var(--text-secondary)' }}>Farbe</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="color" value={lnColor} onChange={e => setLnColor(e.target.value)}
                style={{ width: 32, height: 28, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: 0, background: 'none' }} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{lnColor}</span>
            </div>
          </label>

        </div>
        <div style={{ padding: 12, background: 'var(--bg-subtle)', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 12 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Vorschau:</span>
          <div style={{ marginTop: 6, fontFamily: lnFont, fontSize: `${lnSize}pt`, color: lnColor }}>
            5 &nbsp;&nbsp; 10 &nbsp;&nbsp; 15 &nbsp;&nbsp; 20
          </div>
        </div>
        <button onClick={saveLnSettings} disabled={lnSaving}
          style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: 'var(--text-primary)', color: '#fff', fontSize: 12, cursor: 'pointer' }}>
          {lnSaving ? 'Wird gespeichert…' : 'Speichern'}
        </button>
      </section>

      <section>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>Zugriff</h3>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.6 }}>
          User mit Zugriff auf die Script-App werden in der Auth-App verwaltet.
        </p>
        <div className="admin-roles-list">
          {roles === null
            ? <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Lädt...</span>
            : roles.length === 0
            ? <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>--</span>
            : roles.map(r => <span key={r} className="admin-role-chip">{r}</span>)
          }
        </div>
      </section>

    </div>
  )
}

// ── Tab: Figuren ─────────────────────────────────────────────────────────────────

function FigurenTab() {
  const { selectedProduction } = useSelectedProduction()
  const produktionId = selectedProduction?.id ?? null
  const { t } = useTerminologie()

  const [figurenLabel, setFigurenLabel] = useState<'Rollen' | 'Figuren' | 'Charaktere'>('Rollen')
  const [felder, setFelder] = useState<any[]>([])
  const [newFeld, setNewFeld] = useState<{ name: string; typ: string; gilt_fuer: string; optionen: string } | null>(null)
  const [feldSaving, setFeldSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const [presetLoading, setPresetLoading] = useState(false)
  const [presetDone, setPresetDone] = useState(false)
  const [kategorien, setKategorien] = useState<any[]>([])
  const [newKat, setNewKat] = useState({ name: '', typ: 'rolle' as 'rolle' | 'komparse' })
  const [katSaving, setKatSaving] = useState(false)

  useEffect(() => {
    fetch('/api/admin/app-settings', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((d: any) => { if (d?.figuren_label) setFigurenLabel(d.figuren_label) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!produktionId) return
    api.getCharakterFelder(produktionId).then(setFelder).catch(() => {})
    api.getCharKategorien(produktionId).then(setKategorien).catch(() => setKategorien([]))
  }, [produktionId])

  const addKat = async () => {
    if (!newKat.name.trim() || !produktionId) return
    setKatSaving(true)
    try {
      const r = await api.createCharKategorie(produktionId, newKat)
      setKategorien(prev => [...prev, r])
      setNewKat({ name: '', typ: 'rolle' })
    } catch {} finally { setKatSaving(false) }
  }
  const delKat = async (id: number) => {
    if (!produktionId) return
    try { await api.deleteCharKategorie(produktionId, id); setKategorien(prev => prev.filter(k => k.id !== id)) } catch {}
  }
  const reorderKat = async (ordered: any[]) => {
    if (!produktionId) return
    setKategorien(ordered)
    const order = ordered.map((k, i) => ({ id: k.id, sort_order: i + 1 }))
    try { const r = await api.reorderCharKategorien(produktionId, order); setKategorien(r) } catch {}
  }

  const handleCreateFeld = async () => {
    if (!newFeld || !produktionId || !newFeld.name.trim()) return
    setFeldSaving(true)
    try {
      const optionen = newFeld.typ === 'select'
        ? newFeld.optionen.split(',').map(s => s.trim()).filter(Boolean)
        : []
      const f = await api.createCharakterFeld(produktionId, { name: newFeld.name.trim(), typ: newFeld.typ, optionen, gilt_fuer: newFeld.gilt_fuer })
      setFelder(prev => [...prev, f])
      setNewFeld(null)
    } finally { setFeldSaving(false) }
  }

  const handleDeleteFeld = async (id: number) => {
    if (!produktionId) return
    await api.deleteCharakterFeld(produktionId, id)
    setFelder(prev => prev.filter(f => f.id !== id))
    setDeleteConfirm(null)
  }

  const handleRollenprofilPreset = async () => {
    if (!produktionId) return
    setPresetLoading(true)
    try {
      const rows = await api.rollenprofilFelderPreset(produktionId)
      setFelder(rows)
      setPresetDone(true)
      setTimeout(() => setPresetDone(false), 3000)
    } finally { setPresetLoading(false) }
  }

  const rollenFelder = felder.filter(f => f.gilt_fuer === 'alle' || f.gilt_fuer === 'rolle' || f.gilt_fuer === 'komparse')
  const motivFelder = felder.filter(f => f.gilt_fuer === 'motiv')

  return (
    <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 32 }}>
      {!produktionId && (
        <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Bitte eine Produktion auswählen, um Felder zu konfigurieren.</p>
      )}

      {produktionId && (
        <>
        <section style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 20, display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 8px' }}>Felder für {figurenLabel} und {t('komparse', 'p')}</h3>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
              Eigene Felder erweitern das Profil jeder Figur, jedes {t('komparse', 's')} oder Motivs um charakterisierende Angaben — hier sind nur dramaturgische Anforderungen oder Spezifikationen aus der Geschichte gemeint. Angaben zum eventuellen Motiv oder Drehort erfolgen ausschließlich in der Motiv-Datenbank durch das Szenenbild.
            </p>
          </div>

          <div>
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>Felder für {figurenLabel} & {t('komparse', 'p')}</h3>
            <FeldListe felder={rollenFelder} onDelete={id => setDeleteConfirm(id)} deleteConfirm={deleteConfirm} onConfirmDelete={handleDeleteFeld} onCancelDelete={() => setDeleteConfirm(null)} />
          </div>

          <div>
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>Felder für {t('motiv', 'p')}</h3>
            <FeldListe felder={motivFelder} onDelete={id => setDeleteConfirm(id)} deleteConfirm={deleteConfirm} onConfirmDelete={handleDeleteFeld} onCancelDelete={() => setDeleteConfirm(null)} />
          </div>

          {/* Add field form */}
          {newFeld ? (
            <div style={{ background: 'var(--bg-subtle)', borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h4 style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>Neues Feld</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <input placeholder="Feldname" value={newFeld.name} onChange={e => setNewFeld({ ...newFeld, name: e.target.value })}
                  style={{ fontSize: 12, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--text)' }} />
                <select value={newFeld.typ} onChange={e => setNewFeld({ ...newFeld, typ: e.target.value })}
                  style={{ fontSize: 12, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--text)' }}>
                  {['text', 'richtext', 'select', 'link', 'date', 'number'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <select value={newFeld.gilt_fuer} onChange={e => setNewFeld({ ...newFeld, gilt_fuer: e.target.value })}
                  style={{ fontSize: 12, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--text)' }}>
                  <option value="alle">Alle</option>
                  <option value="rolle">Nur {figurenLabel}</option>
                  <option value="komparse">Nur {t('komparse', 'p')}</option>
                  <option value="motiv">Nur Motive</option>
                </select>
              </div>
              {newFeld.typ === 'select' && (
                <input placeholder="Optionen (kommagetrennt)" value={newFeld.optionen} onChange={e => setNewFeld({ ...newFeld, optionen: e.target.value })}
                  style={{ fontSize: 12, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--text)' }} />
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleCreateFeld} disabled={!newFeld.name.trim() || feldSaving}
                  style={{ fontSize: 12, padding: '6px 14px', background: 'var(--text)', color: 'var(--bg)', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                  {feldSaving ? 'Speichern...' : 'Speichern'}
                </button>
                <button onClick={() => setNewFeld(null)} style={{ fontSize: 12, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', background: 'transparent', color: 'var(--text)' }}>
                  Abbrechen
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setNewFeld({ name: '', typ: 'text', gilt_fuer: 'alle', optionen: '' })}
              style={{ alignSelf: 'flex-start', fontSize: 12, padding: '7px 14px', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', background: 'transparent', color: 'var(--text)' }}>
              + Feld hinzufügen
            </button>
          )}

          {/* Rollenprofil preset */}
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>Rollenprofil-Standardfelder</h3>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.6 }}>
              Fügt die Standard-Rollenprofil-Felder hinzu (Alter, Geburtsort, Charakter, Backstory usw.). Bereits vorhandene Felder werden nicht überschrieben.
            </p>
            <button
              onClick={handleRollenprofilPreset}
              disabled={presetLoading}
              style={{ fontSize: 12, padding: '7px 14px', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', background: presetDone ? '#00C853' : 'transparent', color: presetDone ? '#fff' : 'var(--text)', transition: 'background 0.2s, color 0.2s' }}
            >
              {presetLoading ? 'Wird hinzugefügt...' : presetDone ? 'Felder hinzugefügt' : 'Rollenprofil-Felder hinzufügen'}
            </button>
          </div>
        </section>

        {/* Charakter-Kategorien */}
        <section style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 6px' }}>Charakter-Kategorien</h3>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
              Definiert die Kategorien für {figurenLabel} und {t('komparse', 'p')} in dieser Produktion. Reihenfolge per Drag &amp; Drop.
            </p>
          </div>
          <SortableList
            items={kategorien}
            onReorder={reorderKat}
            renderItem={(k, handle) => (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 4 }}>
                {handle}
                <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-subtle)', padding: '2px 7px', borderRadius: 99, fontWeight: 600, textTransform: 'uppercase' as const, flexShrink: 0 }}>
                  {k.typ === 'komparse' ? t('komparse') : 'Rolle'}
                </span>
                <span style={{ flex: 1, fontSize: 13 }}>{k.name}</span>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, padding: '0 4px', lineHeight: 1 }} onClick={() => delKat(k.id)} title="Löschen">x</button>
              </div>
            )}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              style={{ flex: 1, fontSize: 13, padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontFamily: 'inherit', outline: 'none' }}
              placeholder="Neue Kategorie..."
              value={newKat.name}
              onChange={e => setNewKat(v => ({ ...v, name: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && addKat()}
            />
            <select style={{ fontSize: 13, padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontFamily: 'inherit', outline: 'none' }} value={newKat.typ} onChange={e => setNewKat(v => ({ ...v, typ: e.target.value as any }))}>
              <option value="rolle">Rolle</option>
              <option value="komparse">{t('komparse')}</option>
            </select>
            <button style={{ fontSize: 12, padding: '6px 14px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-subtle)', cursor: 'pointer', fontFamily: 'inherit' }} onClick={addKat} disabled={katSaving || !newKat.name.trim()}>
              {katSaving ? '...' : '+ Hinzufügen'}
            </button>
          </div>
        </section>
        </>
      )}
    </div>
  )
}

// ── Tab: Produktion ──────────────────────────────────────────────────────────────

function ProduktionTab() {
  const { selectedProduction } = useSelectedProduction()
  const produktionId = selectedProduction?.id ?? ''
  const { t } = useTerminologie()

  const [labels, setLabels] = useState<any[]>([])
  const [colors, setColors] = useState<any[]>([])
  const [memoSchwelle, setMemoSchwelle] = useState<number>(100)
  const [vorstoppEin, setVorstoppEin] = useState<{ methode: string; menge: number; dauer_sekunden: number }>({
    methode: 'seiten', menge: 54, dauer_sekunden: 60,
  })
  const [saving, setSaving] = useState<Record<string, boolean>>({})

  // New-item input state
  const [newLabel, setNewLabel] = useState({ name: '', is_produktionsfassung: false })
  const [newColor, setNewColor] = useState({ name: '', color: '#4A90D9' })
  const [wgaPresetDone, setWgaPresetDone] = useState(false)
  const [farbenPresets, setFarbenPresets] = useState<any[]>([])
  const [newPresetName, setNewPresetName] = useState('')
  const [savePresetOpen, setSavePresetOpen] = useState(false)
  const [numModus, setNumModus] = useState<'global' | 'per_typ'>('global')

  useEffect(() => {
    api.getRevisionFarbenPresets().then(setFarbenPresets).catch(() => {})
    api.getFassungsNummerierung().then((d: any) => setNumModus((d.modus ?? 'global') as 'global' | 'per_typ')).catch(() => {})
  }, [])

  useEffect(() => {
    if (!produktionId) return
    api.getStageLabels(produktionId).then(setLabels).catch(() => setLabels([]))
    api.getRevisionColors(produktionId).then(setColors).catch(() => setColors([]))
    api.getRevisionEinstellungen(produktionId).then(e => setMemoSchwelle(e.memo_schwellwert_zeichen ?? 100)).catch(() => {})
    api.getVorstoppEinstellungen(produktionId).then(e => setVorstoppEin({
      methode: e.methode ?? 'seiten',
      menge: e.menge ?? 54,
      dauer_sekunden: e.dauer_sekunden ?? 60,
    })).catch(() => {})
  }, [produktionId])

  const busy = (key: string) => saving[key]
  const set = (key: string, v: boolean) => setSaving(s => ({ ...s, [key]: v }))

  // ── Stage Labels ──
  const addLabel = async () => {
    if (!newLabel.name.trim()) return
    set('lbl', true)
    try {
      const r = await api.createStageLabel(produktionId, newLabel)
      setLabels(prev => [...prev, r])
      setNewLabel({ name: '', is_produktionsfassung: false })
    } catch {} finally { set('lbl', false) }
  }
  const delLabel = async (id: number) => {
    try { await api.deleteStageLabel(produktionId, id); setLabels(prev => prev.filter(l => l.id !== id)) } catch {}
  }
  const toggleProd = async (id: number, current: boolean) => {
    try {
      const r = await api.updateStageLabel(produktionId, id, { is_produktionsfassung: !current })
      setLabels(prev => prev.map(l => l.id === id ? r : l))
    } catch {}
  }
  const reorderLabels = async (ordered: any[]) => {
    setLabels(ordered)
    const order = ordered.map((l, i) => ({ id: l.id, sort_order: i + 1 }))
    try { const r = await api.reorderStageLabels(produktionId, order); setLabels(r) } catch {}
  }

  // ── Revision Colors ──
  const addColor = async () => {
    if (!newColor.name.trim()) return
    set('col', true)
    try {
      const r = await api.createRevisionColor(produktionId, newColor)
      setColors(prev => [...prev, r])
      setNewColor({ name: '', color: '#4A90D9' })
    } catch {} finally { set('col', false) }
  }
  const delColor = async (id: number) => {
    try { await api.deleteRevisionColor(produktionId, id); setColors(prev => prev.filter(c => c.id !== id)) } catch {}
  }
  const reorderColors = async (ordered: any[]) => {
    setColors(ordered)
    const order = ordered.map((c, i) => ({ id: c.id, sort_order: i + 1 }))
    try { const r = await api.reorderRevisionColors(produktionId, order); setColors(r) } catch {}
  }
  const handleWgaPreset = async () => {
    set('wga', true)
    try {
      const rows = await api.revisionColorsWgaPreset(produktionId)
      setColors(rows)
      setWgaPresetDone(true)
      setTimeout(() => setWgaPresetDone(false), 3000)
    } catch {} finally { set('wga', false) }
  }
  const saveMemo = async () => {
    set('memo', true)
    try { await api.updateRevisionEinstellungen(produktionId, { memo_schwellwert_zeichen: memoSchwelle }) }
    catch {} finally { set('memo', false) }
  }
  const saveVorstopp = async () => {
    set('vs', true)
    try { await api.updateVorstoppEinstellungen(produktionId, vorstoppEin) }
    catch {} finally { set('vs', false) }
  }

  const savePreset = async () => {
    if (!newPresetName.trim() || !colors.length) return
    set('preset', true)
    try {
      const r = await api.createRevisionFarbenPreset({ name: newPresetName.trim(), farben: colors.map(c => ({ name: c.name, color: c.color })) })
      setFarbenPresets(prev => [...prev, r])
      setNewPresetName('')
      setSavePresetOpen(false)
    } catch {} finally { set('preset', false) }
  }
  const deletePreset = async (id: number) => {
    try { await api.deleteRevisionFarbenPreset(id); setFarbenPresets(prev => prev.filter(p => p.id !== id)) } catch {}
  }
  const loadPreset = (preset: any) => {
    const farben: { name: string; color: string }[] = Array.isArray(preset.farben) ? preset.farben : JSON.parse(preset.farben ?? '[]')
    // Bestehende Farben dieser Produktion löschen und durch Preset ersetzen (nach Bestätigung)
    if (!window.confirm(`Preset "$\{preset.name\}" laden? Alle aktuellen Farben dieser Produktion werden ersetzt.`)) return
    Promise.all(colors.map(c => api.deleteRevisionColor(produktionId, c.id).catch(() => {}))).then(async () => {
      const added: any[] = []
      for (let i = 0; i < farben.length; i++) {
        const r = await api.createRevisionColor(produktionId, { ...farben[i], sort_order: i + 1 }).catch(() => null)
        if (r) added.push(r)
      }
      setColors(added)
    })
  }

  const sectionStyle: React.CSSProperties = { marginBottom: 40 }
  const h3Style: React.CSSProperties = { fontSize: 13, fontWeight: 600, margin: '0 0 4px' }
  const subStyle: React.CSSProperties = { fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 14px', lineHeight: 1.6 }
  const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 4 }
  const inputStyle: React.CSSProperties = { fontSize: 13, padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontFamily: 'inherit', outline: 'none' }
  const btnStyle: React.CSSProperties = { fontSize: 12, padding: '6px 14px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-subtle)', cursor: 'pointer', fontFamily: 'inherit' }
  const delBtnStyle: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, padding: '0 4px', lineHeight: 1 }

  if (!selectedProduction) {
    return (
      <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
        Keine Produktion ausgewählt. Wähle eine Produktion im Header aus.
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 640 }}>

      {/* ── Stage Labels ── */}
      <section style={sectionStyle}>
        <h3 style={h3Style}>Fassungs-Labels</h3>
        <p style={subStyle}>Labels für Fassungen (Stages) dieser Produktion. Ein Label kann als Produktionsfassung markiert werden -- dieses löst den Schloss-Mechanismus aus.</p>

        <SortableList
          items={labels}
          onReorder={reorderLabels}
          renderItem={(l, handle) => (
            <div style={rowStyle}>
              {handle}
              <span style={{ flex: 1, fontSize: 13 }}>{l.name}</span>
              <button
                onClick={() => toggleProd(l.id, l.is_produktionsfassung)}
                style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 99, border: '1px solid',
                  cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
                  background: l.is_produktionsfassung ? 'var(--text-primary)' : 'var(--bg-subtle)',
                  color: l.is_produktionsfassung ? 'var(--text-inverse)' : 'var(--text-secondary)',
                  borderColor: l.is_produktionsfassung ? 'var(--text-primary)' : 'var(--border)',
                }}
                title="Als Produktionsfassung markieren"
              >
                {l.is_produktionsfassung ? 'Produktion' : 'Kein PF'}
              </button>
              <button style={delBtnStyle} onClick={() => delLabel(l.id)} title="Löschen">x</button>
            </div>
          )}
        />

        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input
            style={{ ...inputStyle, flex: 1 }}
            placeholder="Neues Label..."
            value={newLabel.name}
            onChange={e => setNewLabel(v => ({ ...v, name: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && addLabel()}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={newLabel.is_produktionsfassung}
              onChange={e => setNewLabel(v => ({ ...v, is_produktionsfassung: e.target.checked }))}
            />
            Produktionsfassung
          </label>
          <button style={btnStyle} onClick={addLabel} disabled={busy('lbl') || !newLabel.name.trim()}>
            {busy('lbl') ? '...' : '+ Hinzufügen'}
          </button>
        </div>
      </section>

      {/* ── Fassungs-Nummerierung ── */}
      <section style={sectionStyle}>
        <h3 style={h3Style}>Fassungs-Nummerierung</h3>
        <p style={subStyle}>
          Global: Alle Dokument-Typen teilen eine gemeinsame Nummerierung pro Folge.
          Pro Typ: Jeder Typ beginnt bei Fassung&nbsp;1.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['global', 'per_typ'] as const).map(m => (
            <button key={m} onClick={async () => { setNumModus(m); try { await api.updateFassungsNummerierung(m) } catch {} }}
              style={{ padding: '6px 16px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, cursor: 'pointer',
                background: numModus === m ? 'var(--text-primary)' : 'transparent',
                color: numModus === m ? '#fff' : 'var(--text-primary)' }}>
              {m === 'global' ? 'Global' : 'Pro Typ'}
            </button>
          ))}
        </div>
      </section>

      {/* ── Revision Colors ── */}
      <section style={sectionStyle}>
        <h3 style={{ ...h3Style, display: 'flex', alignItems: 'center', gap: 6 }}>
          Revisions-Farben (Textänderungen)
          <Tooltip text={`Farbkodierung für Revisionsrunden (geänderte Seiten werden farbig gedruckt).\n\nWGA-Standard (USA/UK): 11 Farben in festgelegter Reihenfolge (Weiß → Blau → Pink → Gelb → Grün → …)\n\nARD/ZDF/Deutschland: keine Normierung — jede Produktion wählt selbst.\n\nEigene Farbpresets können unten gespeichert und in allen Produktionen wiederverwendet werden.`}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400, cursor: 'default', border: '1px solid var(--border)', borderRadius: 99, padding: '1px 6px' }}>?</span>
          </Tooltip>
        </h3>
        <p style={subStyle}>Farbmarkierung für Revisionsstände. Reihenfolge bestimmt die Revisions-Sequenz.</p>

        {/* Preset-Leiste */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <button
            onClick={handleWgaPreset}
            disabled={busy('wga')}
            style={{ fontSize: 12, padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer', background: wgaPresetDone ? '#00C853' : 'transparent', color: wgaPresetDone ? '#fff' : 'var(--text)', transition: 'background 0.2s, color 0.2s' }}
          >
            {busy('wga') ? '...' : wgaPresetDone ? 'WGA eingefügt' : 'WGA-Standard'}
          </button>
          {farbenPresets.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 0, border: '1px solid var(--border)', borderRadius: 7, overflow: 'hidden' }}>
              <button onClick={() => loadPreset(p)} style={{ fontSize: 12, padding: '6px 10px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text)' }}>{p.name}</button>
              <button onClick={() => deletePreset(p.id)} style={{ fontSize: 11, padding: '6px 6px', background: 'transparent', border: 'none', borderLeft: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-muted)' }}>×</button>
            </div>
          ))}
          {savePresetOpen ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                style={{ ...inputStyle, fontSize: 12, padding: '5px 8px', width: 160 }}
                placeholder="Preset-Name..."
                value={newPresetName}
                onChange={e => setNewPresetName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && savePreset()}
                autoFocus
              />
              <button style={{ ...btnStyle, fontSize: 12 }} onClick={savePreset} disabled={busy('preset') || !newPresetName.trim() || !colors.length}>
                {busy('preset') ? '...' : 'Speichern'}
              </button>
              <button style={{ ...btnStyle, fontSize: 12 }} onClick={() => { setSavePresetOpen(false); setNewPresetName('') }}>Abbrechen</button>
            </div>
          ) : (
            <button onClick={() => setSavePresetOpen(true)} style={{ fontSize: 12, padding: '6px 10px', border: '1px dashed var(--border)', borderRadius: 7, cursor: 'pointer', background: 'transparent', color: 'var(--text-secondary)' }}>
              + Als Preset speichern
            </button>
          )}
        </div>

        <SortableList
          items={colors}
          onReorder={reorderColors}
          renderItem={(c, handle) => (
            <div style={rowStyle}>
              {handle}
              <span style={{ width: 16, height: 16, borderRadius: 4, background: c.color, flexShrink: 0, border: '1px solid rgba(0,0,0,0.1)' }} />
              <span style={{ flex: 1, fontSize: 13 }}>{c.name}</span>
              <code style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.color}</code>
              <button style={delBtnStyle} onClick={() => delColor(c.id)} title="Löschen">x</button>
            </div>
          )}
        />

        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <input
            style={{ ...inputStyle, flex: 1, minWidth: 160 }}
            placeholder="Name (z.B. Pinke Seiten)..."
            value={newColor.name}
            onChange={e => setNewColor(v => ({ ...v, name: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && addColor()}
          />
          <input
            type="color"
            value={newColor.color}
            onChange={e => setNewColor(v => ({ ...v, color: e.target.value }))}
            style={{ width: 44, height: 36, border: '1px solid var(--border)', borderRadius: 7, padding: 2, cursor: 'pointer' }}
          />
          <button style={btnStyle} onClick={addColor} disabled={busy('col') || !newColor.name.trim()}>
            {busy('col') ? '...' : '+ Hinzufügen'}
          </button>
        </div>
      </section>

      {/* ── Revision Export Einstellungen ── */}
      <section style={sectionStyle}>
        <h3 style={h3Style}>Revisions-Export</h3>
        <p style={subStyle}>Änderungen mit weniger als dieser Zeichenanzahl werden im Export als kurze Notiz (Memo-Zeile) statt als vollständiger Absatz dargestellt.</p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            type="number"
            style={{ ...inputStyle, width: 100 }}
            value={memoSchwelle}
            min={0}
            onChange={e => setMemoSchwelle(parseInt(e.target.value) || 0)}
          />
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Zeichen (Schwellwert)</span>
          <button style={btnStyle} onClick={saveMemo} disabled={busy('memo')}>
            {busy('memo') ? '...' : 'Speichern'}
          </button>
        </div>
      </section>

      {/* ── Vorstopp Einstellungen ── */}
      <section style={sectionStyle}>
        <h3 style={h3Style}>Vorstopp-Einstellungen</h3>
        <p style={subStyle}>
          Verhältnis für die automatische Vorstopp-Berechnung: <em>X Einheiten entsprechen Y Sekunden.</em><br />
          Beispiel: 54 Seiten = 60 Sek. → jede Seite ≈ 1,11 Sek.
        </p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Methode</span>
            <select
              style={inputStyle}
              value={vorstoppEin.methode}
              onChange={e => setVorstoppEin(v => ({ ...v, methode: e.target.value }))}
            >
              <option value="seiten">Seiten : Sek.</option>
              <option value="zeichen">Zeichen o. Leerz. : Sek.</option>
              <option value="zeichen_mit_leerzeichen">Zeichen m. Leerz. : Sek.</option>
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {vorstoppEin.methode === 'seiten' ? 'Seiten' : vorstoppEin.methode === 'zeichen' ? 'Zeichen (o. Leerz.)' : 'Zeichen (m. Leerz.)'}
            </span>
            <input
              type="number"
              style={{ ...inputStyle, width: 110 }}
              value={vorstoppEin.menge}
              min={0}
              step={vorstoppEin.methode === 'seiten' ? 0.125 : 10}
              onChange={e => setVorstoppEin(v => ({ ...v, menge: parseFloat(e.target.value) || 0 }))}
            />
          </div>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', paddingBottom: 8 }}>entsprechen</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Sekunden</span>
            <input
              type="number"
              style={{ ...inputStyle, width: 100 }}
              value={vorstoppEin.dauer_sekunden}
              min={0}
              onChange={e => setVorstoppEin(v => ({ ...v, dauer_sekunden: parseInt(e.target.value) || 0 }))}
            />
          </div>
          <button style={{ ...btnStyle, alignSelf: 'flex-end' }} onClick={saveVorstopp} disabled={busy('vs')}>
            {busy('vs') ? '...' : 'Speichern'}
          </button>
        </div>
      </section>

    </div>
  )
}

// ── Tab: Dokument-Typen (Absatzformate) ─────────────────────────────────────────


type DokTypenMargins = { oben: number; unten: number; links: number; rechts: number }

function DokumentTypenTab({
  headerSlot, seitenformat, seitenformatSaving, margins,
  onSeitenformatChange, onMarginsUpdate, onMarginsSave,
}: {
  headerSlot?: HTMLDivElement | null
  seitenformat: 'a4' | 'letter'
  seitenformatSaving: boolean
  margins: DokTypenMargins
  onSeitenformatChange: (val: 'a4' | 'letter') => void
  onMarginsUpdate: (next: DokTypenMargins) => void
  onMarginsSave: (next: DokTypenMargins) => void
}) {
  const { selectedProduction } = useSelectedProduction()
  const produktionId = selectedProduction?.id ?? ''
  const [formate, setFormate] = useState<any[]>([])
  const [presets, setPresets] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [editData, setEditData] = useState<any>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [showSavePreset, setShowSavePreset] = useState(false)
  const [showUpdatePreset, setShowUpdatePreset] = useState(false)
  const [presetName, setPresetName] = useState('')
  const [filterKat, setFilterKat] = useState<string>('alle')
  // Preset-Dropdown state
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null)
  const [renamingPreset, setRenamingPreset] = useState(false)
  const [renamingValue, setRenamingValue] = useState('')
  const [templateEdit, setTemplateEdit] = useState<string | null>(null)
  const [isSuperadmin, setIsSuperadmin] = useState(false)

  const load = async () => {
    if (!produktionId) return
    setLoading(true)
    try {
      const [f, p] = await Promise.all([
        api.getAbsatzformate(produktionId),
        api.getAbsatzformatPresets(),
      ])
      setFormate(f); setPresets(p)
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { load() }, [produktionId])
  useEffect(() => {
    api.getMe().then(me => setIsSuperadmin(me.roles?.includes('superadmin') ?? false)).catch(() => {})
  }, [])

  // Erstes Preset vorauswählen wenn Presets geladen
  useEffect(() => {
    if (presets.length > 0 && !selectedPresetId) setSelectedPresetId(presets[0].id)
  }, [presets, selectedPresetId])

  const selectedPreset = presets.find(p => p.id === selectedPresetId) ?? null
  const templateValue = templateEdit !== null ? templateEdit : (selectedPreset?.szenen_kopf_template ?? '')
  const templateDirty = templateEdit !== null && templateEdit !== (selectedPreset?.szenen_kopf_template ?? '')
  // System-Presets: nur Superadmin darf speichern
  const canEditTemplate = selectedPreset && (!selectedPreset.ist_system || isSuperadmin)

  const handleSelectPreset = (id: string) => {
    setSelectedPresetId(id)
    setTemplateEdit(null)
    setRenamingPreset(false)
    // Layout-Felder aus Preset laden, wenn vorhanden
    const preset = presets.find(p => p.id === id)
    if (preset) {
      if (preset.seitenformat) onSeitenformatChange(preset.seitenformat)
      if (preset.page_margins) {
        let pm = preset.page_margins
        if (typeof pm === 'string') { try { pm = JSON.parse(pm) } catch {} }
        const next = { ...margins, ...pm }
        onMarginsSave(next)
      }
    }
  }

  const handleApplyPreset = async () => {
    if (!selectedPresetId) return
    if (!confirm('Alle bestehenden Absatzformate dieser Produktion werden ersetzt. Fortfahren?')) return
    setMsg(null)
    try {
      const result = await api.applyAbsatzformatPreset(produktionId, selectedPresetId)
      setFormate(result); setMsg('Preset angewendet.')
    } catch (e: any) { setMsg(e.message ?? 'Fehler') }
  }

  const handleUpdatePreset = async () => {
    if (!selectedPresetId || !selectedPreset) return
    const presetFormate = formate.map(f => ({
      name: f.name, kuerzel: f.kuerzel, textbaustein: f.textbaustein,
      font_family: f.font_family, font_size: f.font_size,
      bold: f.bold, italic: f.italic, underline: f.underline,
      uppercase: f.uppercase, text_align: f.text_align,
      margin_left: f.margin_left, margin_right: f.margin_right,
      space_before: f.space_before, space_after: f.space_after,
      line_height: f.line_height, sort_order: f.sort_order,
      ist_standard: f.ist_standard, kategorie: f.kategorie,
      shortcut: f.shortcut ?? null,
      enter_next: formate.find(x => x.id === f.enter_next_format)?.name ?? null,
      tab_next: formate.find(x => x.id === f.tab_next_format)?.name ?? null,
    }))
    try {
      await api.patchAbsatzformatPreset(selectedPresetId, { formate: presetFormate, seitenformat, page_margins: margins })
      setShowUpdatePreset(false)
      await load(); setMsg(`Preset „${selectedPreset.name}" aktualisiert.`)
    } catch (e: any) { setMsg(e.message ?? 'Fehler') }
  }

  const handleRenamePreset = async () => {
    if (!selectedPresetId || !renamingValue.trim()) return
    try {
      await api.patchAbsatzformatPreset(selectedPresetId, { name: renamingValue.trim() })
      setRenamingPreset(false); setRenamingValue(''); await load(); setMsg('Preset umbenannt.')
    } catch (e: any) { setMsg(e.message ?? 'Fehler') }
  }

  const handleDeletePreset = async () => {
    if (!selectedPreset) return
    if (!confirm(`Preset „${selectedPreset.name}" wirklich löschen?`)) return
    try {
      await api.deleteAbsatzformatPreset(selectedPresetId!)
      setSelectedPresetId(null); setTemplateEdit(null)
      await load(); setMsg('Preset gelöscht.')
    } catch (e: any) { setMsg(e.message ?? 'Fehler') }
  }

  const handleSaveTemplate = async () => {
    if (!selectedPresetId || templateEdit === null) return
    try {
      await api.patchAbsatzformatPreset(selectedPresetId, { szenen_kopf_template: templateEdit })
      setTemplateEdit(null); await load(); setMsg('Szenenkopf-Vorlage gespeichert.')
    } catch (e: any) { setMsg(e.message ?? 'Fehler') }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Absatzformat "${name}" löschen?`)) return
    try { await api.deleteAbsatzformat(produktionId, id); await load() } catch (e: any) { setMsg(e.message) }
  }

  const startEdit = (fmt: any) => { setEditId(fmt.id); setEditData({ ...fmt }) }
  const cancelEdit = () => { setEditId(null); setEditData(null) }

  const saveEdit = async () => {
    if (!editData || !editId) return
    try {
      await api.updateAbsatzformat(produktionId, editId, editData)
      setEditId(null); setEditData(null); await load(); setMsg('Gespeichert.')
    } catch (e: any) { setMsg(e.message ?? 'Fehler') }
  }

  const handleAdd = async (data: any) => {
    try {
      await api.createAbsatzformat(produktionId, data)
      setShowAdd(false); await load(); setMsg('Format erstellt.')
    } catch (e: any) { setMsg(e.message ?? 'Fehler') }
  }

  const handleSaveAsPreset = async () => {
    if (!presetName.trim()) return
    const presetFormate = formate.map(f => ({
      name: f.name, kuerzel: f.kuerzel, textbaustein: f.textbaustein,
      font_family: f.font_family, font_size: f.font_size,
      bold: f.bold, italic: f.italic, underline: f.underline,
      uppercase: f.uppercase, text_align: f.text_align,
      margin_left: f.margin_left, margin_right: f.margin_right,
      space_before: f.space_before, space_after: f.space_after,
      line_height: f.line_height, sort_order: f.sort_order,
      ist_standard: f.ist_standard, kategorie: f.kategorie,
      shortcut: f.shortcut ?? null,
      enter_next: formate.find(x => x.id === f.enter_next_format)?.name ?? null,
      tab_next: formate.find(x => x.id === f.tab_next_format)?.name ?? null,
    }))
    try {
      const saved = await api.createAbsatzformatPreset({
        name: presetName.trim(),
        formate: presetFormate,
        seitenformat,
        page_margins: margins,
      })
      setShowSavePreset(false); setPresetName('')
      await load(); setSelectedPresetId(saved.id); setMsg('Preset gespeichert.')
    } catch (e: any) { setMsg(e.message ?? 'Fehler') }
  }

  const handleSetStandard = async (formatId: string) => {
    try {
      const updated = await api.setAbsatzformatStandard(produktionId, formatId)
      setFormate(prev => prev.map(f => f.kategorie === updated.kategorie ? { ...f, ist_standard: f.id === updated.id } : f))
    } catch (e: any) { setMsg(e.message ?? 'Fehler') }
  }

  const filtered = filterKat === 'alle' ? formate : formate.filter(f => f.kategorie === filterKat || f.kategorie === 'alle')

  const dragFormatIdx = useRef<number | null>(null)
  const overFormatIdx = useRef<number | null>(null)

  const handleReorderFormate = async (newOrder: any[]) => {
    setFormate(newOrder)
    const orderPayload = newOrder.map((f, i) => ({ id: f.id, sort_order: i + 1 }))
    try {
      const result = await api.reorderAbsatzformate(produktionId, orderPayload)
      setFormate(result)
    } catch (e: any) {
      setMsg(e.message ?? 'Fehler beim Speichern der Reihenfolge')
      await load()
    }
  }

  const inputStyle = { padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', fontSize: 11, width: '100%', background: 'var(--bg-surface)', color: 'var(--text-primary)' } as const
  const selectStyle = { ...inputStyle, width: 'auto' } as const

  if (!produktionId) return <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Bitte zuerst eine Produktion wählen.</p>

  // Preset-Bar im Header via Portal (Format+Ränder wird vom Parent gerendert)
  const headerBarContent = headerSlot ? createPortal(
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', flexShrink: 0 }}>Preset:</span>
        {renamingPreset ? (
          <>
            <input value={renamingValue} onChange={e => setRenamingValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleRenamePreset(); if (e.key === 'Escape') { setRenamingPreset(false); setRenamingValue('') } }}
              autoFocus style={{ minWidth: 180, fontSize: 10, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }} />
            <button onClick={handleRenamePreset} style={{ padding: '2px 8px', borderRadius: 4, border: 'none', background: '#00C853', color: '#fff', fontSize: 10, cursor: 'pointer' }}>OK</button>
            <button onClick={() => { setRenamingPreset(false); setRenamingValue('') }} style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 10, cursor: 'pointer' }}>Abbrechen</button>
          </>
        ) : (
          <select value={selectedPresetId ?? ''} onChange={e => handleSelectPreset(e.target.value)}
            style={{ minWidth: 200, fontSize: 11, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontWeight: 500 }}>
            {presets.length === 0 && <option value="">— keine Presets —</option>}
            {presets.map(p => <option key={p.id} value={p.id}>{p.name}{p.ist_system ? ' (System)' : ''}</option>)}
          </select>
        )}
        {!renamingPreset && selectedPreset && (
          <>
            <button onClick={handleApplyPreset} title="Dieses Preset auf die aktuelle Produktion anwenden"
              style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border)', fontSize: 10, cursor: 'pointer', background: 'var(--text-primary)', color: '#fff', flexShrink: 0 }}>
              Anwenden
            </button>
            {!selectedPreset.ist_system && (
              <>
                <button onClick={() => setShowUpdatePreset(true)}
                  style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid #007AFF55', fontSize: 10, cursor: 'pointer', background: 'transparent', color: '#007AFF', flexShrink: 0 }}>
                  Preset aktualisieren…
                </button>
                <button onClick={() => { setRenamingPreset(true); setRenamingValue(selectedPreset.name) }}
                  style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)', fontSize: 10, cursor: 'pointer', background: 'transparent', color: 'var(--text-primary)' }}>
                  Umbenennen
                </button>
                <button onClick={handleDeletePreset}
                  style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid #FF3B30', fontSize: 10, cursor: 'pointer', background: 'transparent', color: '#FF3B30' }}>
                  Löschen
                </button>
              </>
            )}
          </>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowSavePreset(true)}
          style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border)', fontSize: 10, cursor: 'pointer', background: 'transparent', color: 'var(--text-primary)', flexShrink: 0 }}>
          Als Preset speichern…
        </button>
    </div>,
    headerSlot
  ) : null

  return (
    <div style={{ maxWidth: 960 }}>
      {headerBarContent}

      {/* Szenenkopf-Vorlage (kein Border) */}
      {selectedPreset && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>Szenenkopf-Vorlage</span>
            {selectedPreset.ist_system && !isSuperadmin && (
              <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'var(--bg-subtle)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                System-Preset — nur lesbar
              </span>
            )}
            {selectedPreset.ist_system && isSuperadmin && (
              <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: '#007AFF22', color: '#007AFF', border: '1px solid #007AFF55' }}>
                System-Preset — Superadmin
              </span>
            )}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-primary)', marginBottom: 8 }}>
            Definiert den Szenenkopf für den Drehbuch-Export. Jede Zeile mit leeren Feldern werden ausgeblendet.
          </div>
          <SzenenKopfVorlagenEditor
            value={templateValue}
            readOnly={!canEditTemplate}
            onChange={v => setTemplateEdit(v)}
            seitenformat={seitenformat}
            marginLeft={margins.links}
            marginRight={margins.rechts}
            onMarginChange={(side, mm) => onMarginsUpdate({
              ...margins,
              [side === 'left' ? 'links' : 'rechts']: mm,
            })}
          />
          {canEditTemplate && templateDirty && (
            <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
              <button onClick={handleSaveTemplate}
                style={{ padding: '4px 12px', borderRadius: 5, border: 'none', background: 'var(--text-primary)', color: '#fff', fontSize: 11, cursor: 'pointer' }}>
                Speichern
              </button>
              <button onClick={() => setTemplateEdit(null)}
                style={{ padding: '4px 10px', borderRadius: 5, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer' }}>
                Abbrechen
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Formate dieser Produktion ─────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>
          Absatz-Formatierungen{selectedPreset ? ` von „${selectedPreset.name}"` : ''}
        </span>
        <div style={{ flex: 1 }} />
        <label style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Filter:</label>
        <select value={filterKat} onChange={e => setFilterKat(e.target.value)} style={selectStyle}>
          <option value="alle">Alle</option>
          <option value="drehbuch">Drehbuch</option>
          <option value="storyline">Storyline</option>
          <option value="notiz">Notiz</option>
        </select>
      </div>

      {msg && <p style={{ fontSize: 12, color: 'var(--sw-info)', marginBottom: 8 }}>{msg}</p>}
      {loading && <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Lädt...</p>}

      {/* Absatzformate-Tabelle */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead><tr style={{ borderBottom: '2px solid var(--border)', background: 'var(--bg-subtle)' }}>
          <th style={{ padding: '6px 2px', width: 16 }} />
          <th style={{ padding: '6px 2px', width: 20 }} title="Standard-Format dieser Kategorie" />
          <th style={{ textAlign: 'left', padding: '6px 6px', fontWeight: 600 }}>Name</th>
          <th style={{ textAlign: 'left', padding: '6px 4px', fontWeight: 600 }}>Prefix</th>
          <th style={{ textAlign: 'left', padding: '6px 4px', fontWeight: 600 }}>Kürzel</th>
          <th style={{ textAlign: 'left', padding: '6px 4px', fontWeight: 600 }}>Kat.</th>
          <th style={{ textAlign: 'left', padding: '6px 4px', fontWeight: 600 }}>Schrift</th>
          <th style={{ textAlign: 'center', padding: '6px 4px', fontWeight: 600 }}>Größe</th>
          <th style={{ textAlign: 'center', padding: '6px 4px', fontWeight: 600 }}>Stil</th>
          <th style={{ textAlign: 'left', padding: '6px 4px', fontWeight: 600 }}>Ausr.</th>
          <th style={{ textAlign: 'center', padding: '6px 4px', fontWeight: 600 }}>Einzug L</th>
          <th style={{ textAlign: 'center', padding: '6px 4px', fontWeight: 600 }}>Einzug R</th>
          <th style={{ textAlign: 'center', padding: '6px 4px', fontWeight: 600 }} title="Abstand vor dem Absatz (pt)">Ab.v.</th>
          <th style={{ textAlign: 'center', padding: '6px 4px', fontWeight: 600 }} title="Abstand nach dem Absatz (pt)">Ab.n.</th>
          <th style={{ textAlign: 'center', padding: '6px 4px', fontWeight: 600 }} title="Zeilenabstand (1.0 = einfach)">ZA</th>
          <th style={{ textAlign: 'left', padding: '6px 4px', fontWeight: 600 }}>Enter→</th>
          <th style={{ textAlign: 'left', padding: '6px 4px', fontWeight: 600 }}>Tab→</th>
          <th style={{ padding: '6px 4px' }} />
        </tr></thead>
        <tbody>
          {filtered.map(f => editId === f.id ? (
            <tr key={f.id} style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
              <td style={{ padding: '4px 2px' }} />
              <td style={{ padding: '4px 2px', textAlign: 'center' }}>
                <button onClick={() => handleSetStandard(f.id)} title={editData.ist_standard ? 'Ist Standard' : 'Als Standard setzen'}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: editData.ist_standard ? '#FFCC00' : 'var(--text-muted)', lineHeight: 1 }}>★</button>
              </td>
              <td style={{ padding: '4px 6px' }}><input value={editData.name} onChange={e => setEditData({ ...editData, name: e.target.value })} style={inputStyle} /></td>
              <td style={{ padding: '4px 4px' }}><input value={editData.textbaustein ?? ''} onChange={e => setEditData({ ...editData, textbaustein: e.target.value || null })} placeholder="—" style={{ ...inputStyle, width: 80 }} /></td>
              <td style={{ padding: '4px 4px' }}><input value={editData.kuerzel ?? ''} onChange={e => setEditData({ ...editData, kuerzel: e.target.value })} style={{ ...inputStyle, width: 50 }} /></td>
              <td style={{ padding: '4px 4px' }}>
                <select value={editData.kategorie} onChange={e => setEditData({ ...editData, kategorie: e.target.value })} style={{ ...selectStyle, fontSize: 10 }}>
                  <option value="alle">alle</option><option value="drehbuch">drehbuch</option><option value="storyline">storyline</option><option value="notiz">notiz</option>
                </select>
              </td>
              <td style={{ padding: '4px 4px' }}>
                <select value={editData.font_family} onChange={e => setEditData({ ...editData, font_family: e.target.value })} style={{ ...selectStyle, fontSize: 10, minWidth: 110 }}>
                  {FONT_FAMILIES.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </td>
              <td style={{ padding: '4px 4px' }}><input type="number" className="no-spin" value={editData.font_size} onChange={e => setEditData({ ...editData, font_size: parseFloat(e.target.value) })} style={{ ...inputStyle, width: 40, textAlign: 'center' }} /></td>
              <td style={{ padding: '4px 4px', textAlign: 'center' }}>
                <label style={{ fontSize: 10, marginRight: 3 }}><input type="checkbox" checked={editData.bold} onChange={e => setEditData({ ...editData, bold: e.target.checked })} /> B</label>
                <label style={{ fontSize: 10, marginRight: 3 }}><input type="checkbox" checked={editData.italic} onChange={e => setEditData({ ...editData, italic: e.target.checked })} /> I</label>
                <label style={{ fontSize: 10, marginRight: 3 }}><input type="checkbox" checked={editData.underline ?? false} onChange={e => setEditData({ ...editData, underline: e.target.checked })} /> U</label>
                <label style={{ fontSize: 10 }}><input type="checkbox" checked={editData.uppercase} onChange={e => setEditData({ ...editData, uppercase: e.target.checked })} /> UC</label>
              </td>
              <td style={{ padding: '4px 4px' }}>
                <select value={editData.text_align} onChange={e => setEditData({ ...editData, text_align: e.target.value })} style={{ ...selectStyle, fontSize: 10 }}>
                  <option value="left">L</option><option value="center">C</option><option value="right">R</option>
                </select>
              </td>
              <td style={{ padding: '4px 4px' }}>
                <input type="number" className="no-spin" step="0.1" min="0" value={editData.margin_left ?? 0} onChange={e => setEditData({ ...editData, margin_left: parseFloat(e.target.value) || 0 })} style={{ ...inputStyle, width: 50, textAlign: 'center' }} />
              </td>
              <td style={{ padding: '4px 4px' }}>
                <input type="number" className="no-spin" step="0.1" min="0" value={editData.margin_right ?? 0} onChange={e => setEditData({ ...editData, margin_right: parseFloat(e.target.value) || 0 })} style={{ ...inputStyle, width: 50, textAlign: 'center' }} />
              </td>
              <td style={{ padding: '4px 4px' }}>
                <input type="number" className="no-spin" step="1" min="0" value={editData.space_before ?? 0} onChange={e => setEditData({ ...editData, space_before: parseInt(e.target.value) || 0 })} style={{ ...inputStyle, width: 40, textAlign: 'center' }} />
              </td>
              <td style={{ padding: '4px 4px' }}>
                <input type="number" className="no-spin" step="1" min="0" value={editData.space_after ?? 0} onChange={e => setEditData({ ...editData, space_after: parseInt(e.target.value) || 0 })} style={{ ...inputStyle, width: 40, textAlign: 'center' }} />
              </td>
              <td style={{ padding: '4px 4px' }}>
                <input type="number" className="no-spin" step="0.1" min="0.5" max="4" value={editData.line_height ?? 1.0} onChange={e => setEditData({ ...editData, line_height: parseFloat(e.target.value) || 1.0 })} style={{ ...inputStyle, width: 40, textAlign: 'center' }} />
              </td>
              <td style={{ padding: '4px 4px' }}>
                <select value={editData.enter_next_format ?? ''} onChange={e => setEditData({ ...editData, enter_next_format: e.target.value || null })} style={{ ...selectStyle, fontSize: 10 }}>
                  <option value="">-</option>
                  {formate.map(o => <option key={o.id} value={o.id}>{o.kuerzel || o.name}</option>)}
                </select>
              </td>
              <td style={{ padding: '4px 4px' }}>
                <select value={editData.tab_next_format ?? ''} onChange={e => setEditData({ ...editData, tab_next_format: e.target.value || null })} style={{ ...selectStyle, fontSize: 10 }}>
                  <option value="">-</option>
                  {formate.map(o => <option key={o.id} value={o.id}>{o.kuerzel || o.name}</option>)}
                </select>
              </td>
              <td style={{ padding: '4px 4px', whiteSpace: 'nowrap' }}>
                <button onClick={saveEdit} style={{ fontSize: 10, color: '#00C853', background: 'none', border: 'none', cursor: 'pointer', marginRight: 4 }}>OK</button>
                <button onClick={cancelEdit} style={{ fontSize: 10, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>X</button>
              </td>
            </tr>
          ) : (
            <tr
              key={f.id}
              draggable={filterKat === 'alle'}
              onDragStart={() => { dragFormatIdx.current = formate.findIndex(x => x.id === f.id) }}
              onDragOver={e => { e.preventDefault(); overFormatIdx.current = formate.findIndex(x => x.id === f.id) }}
              onDrop={e => {
                e.preventDefault()
                if (dragFormatIdx.current === null || dragFormatIdx.current === overFormatIdx.current) return
                const arr = [...formate]
                const [moved] = arr.splice(dragFormatIdx.current, 1)
                arr.splice(overFormatIdx.current!, 0, moved)
                handleReorderFormate(arr)
                dragFormatIdx.current = null; overFormatIdx.current = null
              }}
              style={{ borderBottom: '1px solid var(--border)', cursor: filterKat === 'alle' ? 'grab' : undefined }}
            >
              <td style={{ padding: '6px 2px', color: 'var(--text-muted)', userSelect: 'none', textAlign: 'center', fontSize: 13 }}>
                {filterKat === 'alle' ? '⠇' : ''}
              </td>
              <td style={{ padding: '6px 2px', textAlign: 'center' }}>
                <button onClick={() => handleSetStandard(f.id)} title={f.ist_standard ? 'Standard-Format' : 'Als Standard setzen'}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: f.ist_standard ? '#FFCC00' : 'var(--bg-subtle)', lineHeight: 1, padding: 0 }}>★</button>
              </td>
              <td style={{ padding: '6px 6px', fontWeight: f.ist_standard ? 600 : 400 }}>
                {f.name}
              </td>
              <td style={{ padding: '6px 4px', color: f.textbaustein ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: f.textbaustein ? 600 : 400, fontSize: 10 }}>{f.textbaustein ?? '—'}</td>
              <td style={{ padding: '6px 4px', color: 'var(--text-secondary)' }}>{f.kuerzel ?? '-'}</td>
              <td style={{ padding: '6px 4px', color: 'var(--text-secondary)' }}>{f.kategorie === 'alle' ? '*' : f.kategorie === 'drehbuch' ? 'DB' : f.kategorie === 'notiz' ? 'NZ' : 'SL'}</td>
              <td style={{ padding: '6px 4px', color: 'var(--text-secondary)', fontSize: 10 }}>{f.font_family} {f.font_size}</td>
              <td style={{ padding: '6px 4px', textAlign: 'center', color: 'var(--text-secondary)' }}>{f.font_size}</td>
              <td style={{ padding: '6px 4px', textAlign: 'center', fontSize: 10 }}>
                {f.bold && <b>B</b>}{f.italic && <i> I</i>}{f.underline && <u> U</u>}{f.uppercase && <span> UC</span>}
                {!f.bold && !f.italic && !f.underline && !f.uppercase && '-'}
              </td>
              <td style={{ padding: '6px 4px', color: 'var(--text-secondary)' }}>{f.text_align === 'left' ? 'L' : f.text_align === 'center' ? 'C' : 'R'}</td>
              <td style={{ padding: '6px 4px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 10 }}>{f.margin_left ? f.margin_left + '"' : '-'}</td>
              <td style={{ padding: '6px 4px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 10 }}>{f.margin_right ? f.margin_right + '"' : '-'}</td>
              <td style={{ padding: '6px 4px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 10 }}>{f.space_before || '-'}</td>
              <td style={{ padding: '6px 4px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 10 }}>{f.space_after || '-'}</td>
              <td style={{ padding: '6px 4px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 10 }}>{f.line_height ?? 1.0}</td>
              <td style={{ padding: '6px 4px', color: 'var(--text-secondary)', fontSize: 10 }}>
                {formate.find(x => x.id === f.enter_next_format)?.kuerzel || formate.find(x => x.id === f.enter_next_format)?.name || '-'}
              </td>
              <td style={{ padding: '6px 4px', color: 'var(--text-secondary)', fontSize: 10 }}>
                {formate.find(x => x.id === f.tab_next_format)?.kuerzel || formate.find(x => x.id === f.tab_next_format)?.name || '-'}
              </td>
              <td style={{ padding: '6px 4px', whiteSpace: 'nowrap' }}>
                <button onClick={() => startEdit(f)} style={{ fontSize: 10, color: 'var(--sw-info)', background: 'none', border: 'none', cursor: 'pointer', marginRight: 4 }}>Edit</button>
                <button onClick={() => handleDelete(f.id, f.name)} style={{ fontSize: 10, color: '#FF3B30', background: 'none', border: 'none', cursor: 'pointer' }}>X</button>
              </td>
            </tr>
          ))}
          {filtered.length === 0 && !loading && (
            <tr><td colSpan={18} style={{ padding: 16, color: 'var(--text-muted)', textAlign: 'center' }}>
              Keine Absatzformate. Wähle ein Preset aus und klicke „Anwenden", um zu starten.
            </td></tr>
          )}
        </tbody>
      </table>

      {/* Add button */}
      <div style={{ marginTop: 12 }}>
        {!showAdd ? (
          <button onClick={() => setShowAdd(true)}
            style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 11, cursor: 'pointer', background: 'transparent', color: 'var(--text-primary)' }}>
            + Format hinzufügen
          </button>
        ) : (
          <AbsatzformatAddForm formate={formate} onAdd={handleAdd} onCancel={() => setShowAdd(false)} />
        )}
      </div>

      {/* Save-as-Preset Dialog */}
      {showSavePreset && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 24, minWidth: 340, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Als Preset speichern</h3>
            <input value={presetName} onChange={e => setPresetName(e.target.value)} placeholder="Preset-Name"
              style={{ ...inputStyle, width: '100%', marginBottom: 12, padding: '8px 12px', fontSize: 13 }} />
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 16, background: 'var(--bg-subtle)', borderRadius: 6, padding: '8px 12px', lineHeight: 1.8 }}>
              <div><strong>Formate:</strong> {formate.length} Absatzformate</div>
              <div><strong>Seitenformat:</strong> {seitenformat.toUpperCase()}</div>
              <div><strong>Ränder:</strong> O {margins.oben} · U {margins.unten} · L {margins.links} · R {margins.rechts} mm</div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowSavePreset(false); setPresetName('') }}
                style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, cursor: 'pointer', background: 'transparent', color: 'var(--text-primary)' }}>
                Abbrechen
              </button>
              <button onClick={handleSaveAsPreset} disabled={!presetName.trim()}
                style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: 'var(--text-primary)', color: '#fff', fontSize: 12, cursor: 'pointer', opacity: presetName.trim() ? 1 : 0.5 }}>
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Update-Preset Dialog */}
      {showUpdatePreset && selectedPreset && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 24, minWidth: 340, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Preset aktualisieren</h3>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
              Überschreibt <strong>„{selectedPreset.name}"</strong> mit den aktuellen Einstellungen:
            </p>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 16, background: 'var(--bg-subtle)', borderRadius: 6, padding: '8px 12px', lineHeight: 1.8 }}>
              <div><strong>Formate:</strong> {formate.length} Absatzformate</div>
              <div><strong>Seitenformat:</strong> {seitenformat.toUpperCase()}</div>
              <div><strong>Ränder:</strong> O {margins.oben} · U {margins.unten} · L {margins.links} · R {margins.rechts} mm</div>
              <div style={{ marginTop: 4, color: 'var(--text-muted)' }}>Szenenkopf-Vorlage wird nicht verändert.</div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowUpdatePreset(false)}
                style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, cursor: 'pointer', background: 'transparent', color: 'var(--text-primary)' }}>
                Abbrechen
              </button>
              <button onClick={handleUpdatePreset}
                style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: '#007AFF', color: '#fff', fontSize: 12, cursor: 'pointer' }}>
                Aktualisieren
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-Component: Add Absatzformat Form ─────────────────────────────────────────

function AbsatzformatAddForm({ formate, onAdd, onCancel }: { formate: any[]; onAdd: (d: any) => void; onCancel: () => void }) {
  const [data, setData] = useState({
    name: '', kuerzel: '', kategorie: 'alle', font_family: 'Courier Prime', font_size: 12,
    bold: false, italic: false, underline: false, uppercase: false, text_align: 'left',
    margin_left: 0, margin_right: 0, space_before: 12, space_after: 0, line_height: 1.0,
    enter_next_format: null as string | null, tab_next_format: null as string | null,
    textbaustein: '', sort_order: formate.length + 1,
  })

  const inputStyle = { padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', fontSize: 11, background: 'var(--bg-surface)', color: 'var(--text-primary)' } as const

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginTop: 8, background: 'var(--bg-subtle)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, fontSize: 11 }}>
        <div><label style={{ display: 'block', fontSize: 10, color: 'var(--text-secondary)', marginBottom: 2 }}>Name *</label>
          <input value={data.name} onChange={e => setData({ ...data, name: e.target.value })} style={{ ...inputStyle, width: '100%' }} /></div>
        <div><label style={{ display: 'block', fontSize: 10, color: 'var(--text-secondary)', marginBottom: 2 }}>Kürzel</label>
          <input value={data.kuerzel} onChange={e => setData({ ...data, kuerzel: e.target.value })} style={{ ...inputStyle, width: '100%' }} /></div>
        <div><label style={{ display: 'block', fontSize: 10, color: 'var(--text-secondary)', marginBottom: 2 }}>Kategorie</label>
          <select value={data.kategorie} onChange={e => setData({ ...data, kategorie: e.target.value })} style={{ ...inputStyle, width: '100%' }}>
            <option value="alle">alle</option><option value="drehbuch">drehbuch</option><option value="storyline">storyline</option><option value="notiz">notiz</option>
          </select></div>
        <div><label style={{ display: 'block', fontSize: 10, color: 'var(--text-secondary)', marginBottom: 2 }}>Prefix (fett vorangestellt, Import-Erkennung)</label>
          <input value={data.textbaustein} onChange={e => setData({ ...data, textbaustein: e.target.value })} placeholder="z.B. Status Quo:" style={{ ...inputStyle, width: '100%' }} /></div>
        <div><label style={{ display: 'block', fontSize: 10, color: 'var(--text-secondary)', marginBottom: 2 }}>Schrift</label>
          <select value={data.font_family} onChange={e => setData({ ...data, font_family: e.target.value })} style={{ ...inputStyle, width: '100%' }}>
            {FONT_FAMILIES.map(f => <option key={f} value={f}>{f}</option>)}
          </select></div>
        <div><label style={{ display: 'block', fontSize: 10, color: 'var(--text-secondary)', marginBottom: 2 }}>Größe (pt)</label>
          <input type="number" className="no-spin" value={data.font_size} onChange={e => setData({ ...data, font_size: parseFloat(e.target.value) })} style={{ ...inputStyle, width: '100%' }} /></div>
        <div><label style={{ display: 'block', fontSize: 10, color: 'var(--text-secondary)', marginBottom: 2 }}>Ausrichtung</label>
          <select value={data.text_align} onChange={e => setData({ ...data, text_align: e.target.value })} style={{ ...inputStyle, width: '100%' }}>
            <option value="left">Links</option><option value="center">Mitte</option><option value="right">Rechts</option>
          </select></div>
        <div><label style={{ display: 'block', fontSize: 10, color: 'var(--text-secondary)', marginBottom: 2 }}>Stil</label>
          <div style={{ display: 'flex', gap: 6, paddingTop: 4 }}>
            <label><input type="checkbox" checked={data.bold} onChange={e => setData({ ...data, bold: e.target.checked })} /> B</label>
            <label><input type="checkbox" checked={data.italic} onChange={e => setData({ ...data, italic: e.target.checked })} /> I</label>
            <label><input type="checkbox" checked={data.underline} onChange={e => setData({ ...data, underline: e.target.checked })} /> U</label>
            <label><input type="checkbox" checked={data.uppercase} onChange={e => setData({ ...data, uppercase: e.target.checked })} /> UC</label>
          </div></div>
        <div><label style={{ display: 'block', fontSize: 10, color: 'var(--text-secondary)', marginBottom: 2 }}>Enter→</label>
          <select value={data.enter_next_format ?? ''} onChange={e => setData({ ...data, enter_next_format: e.target.value || null })} style={{ ...inputStyle, width: '100%' }}>
            <option value="">-</option>
            {formate.map(o => <option key={o.id} value={o.id}>{o.kuerzel || o.name}</option>)}
          </select></div>
        <div><label style={{ display: 'block', fontSize: 10, color: 'var(--text-secondary)', marginBottom: 2 }}>Tab→</label>
          <select value={data.tab_next_format ?? ''} onChange={e => setData({ ...data, tab_next_format: e.target.value || null })} style={{ ...inputStyle, width: '100%' }}>
            <option value="">-</option>
            {formate.map(o => <option key={o.id} value={o.id}>{o.kuerzel || o.name}</option>)}
          </select></div>
        <div><label style={{ display: 'block', fontSize: 10, color: 'var(--text-secondary)', marginBottom: 2 }}>Einzug L (inch)</label>
          <input type="number" className="no-spin" step="0.1" value={data.margin_left} onChange={e => setData({ ...data, margin_left: parseFloat(e.target.value) })} style={{ ...inputStyle, width: '100%' }} /></div>
        <div><label style={{ display: 'block', fontSize: 10, color: 'var(--text-secondary)', marginBottom: 2 }}>Einzug R (inch)</label>
          <input type="number" className="no-spin" step="0.1" value={data.margin_right} onChange={e => setData({ ...data, margin_right: parseFloat(e.target.value) })} style={{ ...inputStyle, width: '100%' }} /></div>
        <div><label style={{ display: 'block', fontSize: 10, color: 'var(--text-secondary)', marginBottom: 2 }}>Abstand vor Absatz (pt)</label>
          <input type="number" className="no-spin" step="1" value={data.space_before} onChange={e => setData({ ...data, space_before: parseInt(e.target.value) || 0 })} style={{ ...inputStyle, width: '100%' }} /></div>
        <div><label style={{ display: 'block', fontSize: 10, color: 'var(--text-secondary)', marginBottom: 2 }}>Abstand nach Absatz (pt)</label>
          <input type="number" className="no-spin" step="1" value={data.space_after} onChange={e => setData({ ...data, space_after: parseInt(e.target.value) || 0 })} style={{ ...inputStyle, width: '100%' }} /></div>
        <div><label style={{ display: 'block', fontSize: 10, color: 'var(--text-secondary)', marginBottom: 2 }}>Zeilenabstand (1.0 = einfach)</label>
          <input type="number" className="no-spin" step="0.1" min="0.5" max="4" value={data.line_height} onChange={e => setData({ ...data, line_height: parseFloat(e.target.value) || 1.0 })} style={{ ...inputStyle, width: '100%' }} /></div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
        <button onClick={onCancel}
          style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 11, cursor: 'pointer', background: 'transparent', color: 'var(--text-primary)' }}>Abbrechen</button>
        <button onClick={() => { if (data.name.trim()) onAdd({ ...data, textbaustein: data.textbaustein || null }) }} disabled={!data.name.trim()}
          style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: 'var(--text-primary)', color: '#fff', fontSize: 11, cursor: 'pointer', opacity: data.name.trim() ? 1 : 0.5 }}>Erstellen</button>
      </div>
    </div>
  )
}

// ── Tab: Gruppen-Register ─────────────────────────────────────────────────────

function GruppenRegisterTab() {
  const { selectedProduction } = useSelectedProduction()
  const produktionId = selectedProduction?.id ?? ''
  const [gruppen, setGruppen] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editBeschreibung, setEditBeschreibung] = useState('')
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [memberSearch, setMemberSearch] = useState('')
  const [memberResults, setMemberResults] = useState<any[]>([])
  const [memberSearching, setMemberSearching] = useState(false)
  const memberSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = async () => {
    if (!produktionId) return
    setLoading(true)
    try {
      const data = await api.getAdminColabRegister(produktionId)
      setGruppen(Array.isArray(data) ? data : [])
    } catch {
      setMsg({ text: 'Gruppen konnten nicht geladen werden.', ok: false })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [produktionId])

  const startEdit = (g: any) => {
    setEditingId(g.id)
    setEditName(g.name)
    setEditBeschreibung(g.beschreibung ?? '')
    setMemberSearch('')
    setMemberResults([])
    setMsg(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setMemberSearch('')
    setMemberResults([])
    setMsg(null)
  }

  const saveEdit = async (g: any) => {
    if (!editName.trim()) return
    setSaving(true)
    try {
      const updated = await api.updateAdminColabGruppe(g.id, { name: editName.trim(), beschreibung: editBeschreibung.trim() || undefined })
      setGruppen(prev => prev.map(x => x.id === g.id ? { ...x, ...updated } : x))
      setEditingId(null)
      setMemberSearch('')
      setMemberResults([])
      setMsg({ text: 'Gespeichert.', ok: true })
    } catch {
      setMsg({ text: 'Fehler beim Speichern.', ok: false })
    } finally {
      setSaving(false)
    }
  }

  const handleMemberSearch = (val: string, gruppeId: string) => {
    setMemberSearch(val)
    if (memberSearchRef.current) clearTimeout(memberSearchRef.current)
    if (!val.trim() || val.trim().length < 2) { setMemberResults([]); return }
    memberSearchRef.current = setTimeout(async () => {
      setMemberSearching(true)
      try {
        const results = await api.searchAppUsers(val.trim())
        const gruppe = gruppen.find(g => g.id === gruppeId)
        const existingIds = new Set((gruppe?.mitglieder ?? []).map((m: any) => m.user_id))
        setMemberResults((results as any[]).filter((u: any) => !existingIds.has(u.id)))
      } catch {
        setMemberResults([])
      } finally {
        setMemberSearching(false)
      }
    }, 300)
  }

  const addMember = async (gruppeId: string, user: any) => {
    try {
      await api.addColabMitglied(gruppeId, { user_id: user.id, user_name: user.username ?? user.name ?? user.id })
      setGruppen(prev => prev.map(g => {
        if (g.id !== gruppeId) return g
        const newMember = { user_id: user.id, user_name: user.username ?? user.name ?? user.id }
        return { ...g, mitglieder: [...(g.mitglieder ?? []), newMember], mitglieder_count: (g.mitglieder_count ?? 0) + 1 }
      }))
      setMemberSearch('')
      setMemberResults([])
    } catch {
      setMsg({ text: 'Mitglied konnte nicht hinzugefügt werden.', ok: false })
    }
  }

  const removeMember = async (gruppeId: string, userId: string) => {
    try {
      await api.removeColabMitglied(gruppeId, userId)
      setGruppen(prev => prev.map(g => {
        if (g.id !== gruppeId) return g
        return { ...g, mitglieder: (g.mitglieder ?? []).filter((m: any) => m.user_id !== userId), mitglieder_count: Math.max(0, (g.mitglieder_count ?? 1) - 1) }
      }))
    } catch {
      setMsg({ text: 'Mitglied konnte nicht entfernt werden.', ok: false })
    }
  }

  const deleteGruppe = async (g: any) => {
    if (!confirm(`Gruppe „${g.name}" wirklich löschen?\n\nAlle Werkstufen, die diese Gruppe als Sichtbarkeit nutzen, werden auf „autoren" zurückgesetzt.`)) return
    try {
      await api.deleteAdminColabGruppe(g.id)
      setGruppen(prev => prev.filter(x => x.id !== g.id))
      setMsg({ text: `Gruppe „${g.name}" gelöscht.`, ok: true })
      if (expandedId === g.id) setExpandedId(null)
    } catch {
      setMsg({ text: 'Fehler beim Löschen.', ok: false })
    }
  }

  const fmt = (ts: string) => new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16, marginTop: 0, lineHeight: 1.5 }}>
        Alle Team-Work-Gruppen dieser Produktion. Gruppen werden von Autoren selbst angelegt —
        als Admin kannst du Gruppen umbenennen oder löschen. Der Ersteller wird dabei benachrichtigt.
      </p>

      {!produktionId && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Bitte zuerst eine Produktion wählen.</p>
      )}

      {msg && (
        <div style={{
          background: msg.ok ? 'rgba(0,200,83,0.1)' : 'rgba(255,59,48,0.1)',
          border: `1px solid ${msg.ok ? '#00C853' : '#FF3B30'}`,
          borderRadius: 7, padding: '7px 12px', marginBottom: 14, fontSize: 12,
          color: msg.ok ? '#00C853' : '#FF3B30',
        }}>
          {msg.text}
        </div>
      )}

      {produktionId && loading && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Lädt…</p>
      )}

      {produktionId && !loading && gruppen.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Keine Gruppen angelegt.</p>
      )}

      {produktionId && !loading && gruppen.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 80px 80px', gap: 8, padding: '4px 12px', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
            <span>Gruppe</span>
            <span>Erstellt von</span>
            <span>Mitglieder</span>
            <span style={{ textAlign: 'right' }}>Aktionen</span>
          </div>

          {gruppen.map(g => (
            <div key={g.id} style={{ border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden', background: 'var(--bg-surface)' }}>
              {/* Row */}
              {editingId === g.id ? (
                <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {/* Name + Beschreibung */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Name & Beschreibung</div>
                    <input
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      autoFocus
                      placeholder="Gruppenname"
                      style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-subtle)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}
                      onKeyDown={e => { if (e.key === 'Enter') saveEdit(g); if (e.key === 'Escape') cancelEdit() }}
                    />
                    <input
                      value={editBeschreibung}
                      onChange={e => setEditBeschreibung(e.target.value)}
                      placeholder="Beschreibung (optional)"
                      style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-subtle)', color: 'var(--text-primary)', fontSize: 12 }}
                    />
                  </div>

                  {/* Member management */}
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                      Mitglieder ({(g.mitglieder ?? []).length})
                    </div>

                    {/* Current members */}
                    {(g.mitglieder ?? []).length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {(g.mitglieder as any[]).map((m: any) => (
                          <span key={m.user_id} style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '3px 8px 3px 10px', borderRadius: 20,
                            background: 'var(--bg-surface)', border: '1px solid var(--border)',
                            fontSize: 11, color: 'var(--text-primary)',
                          }}>
                            {m.user_name}
                            <button
                              onClick={() => removeMember(g.id, m.user_id)}
                              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: '50%', border: 'none', background: 'rgba(255,59,48,0.15)', color: '#FF3B30', fontSize: 10, cursor: 'pointer', padding: 0, lineHeight: 1 }}
                            >×</button>
                          </span>
                        ))}
                      </div>
                    )}
                    {(g.mitglieder ?? []).length === 0 && (
                      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>Noch keine Mitglieder.</p>
                    )}

                    {/* User search */}
                    <div style={{ position: 'relative' }}>
                      <input
                        value={memberSearch}
                        onChange={e => handleMemberSearch(e.target.value, g.id)}
                        placeholder="Mitglied hinzufügen (Name eingeben…)"
                        style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-subtle)', color: 'var(--text-primary)', fontSize: 12 }}
                      />
                      {memberSearching && (
                        <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: 'var(--text-muted)' }}>Sucht…</div>
                      )}
                      {memberResults.length > 0 && (
                        <div style={{
                          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                          background: 'var(--bg-surface)', border: '1px solid var(--border)',
                          borderRadius: 7, marginTop: 2, boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                          maxHeight: 180, overflowY: 'auto',
                        }}>
                          {memberResults.map((u: any) => (
                            <button key={u.id}
                              onClick={() => addMember(g.id, u)}
                              style={{
                                width: '100%', textAlign: 'left', padding: '8px 12px',
                                border: 'none', background: 'transparent', cursor: 'pointer',
                                fontSize: 12, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8,
                              }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-subtle)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >
                              <span style={{ flex: 1 }}>{u.username ?? u.name ?? u.id}</span>
                              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>+ hinzufügen</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Save / Cancel */}
                  <div style={{ display: 'flex', gap: 6, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                    <button onClick={() => saveEdit(g)} disabled={!editName.trim() || saving}
                      style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: '#007AFF', color: '#fff', fontSize: 12, fontWeight: 600, cursor: editName.trim() ? 'pointer' : 'default', opacity: editName.trim() ? 1 : 0.5 }}>
                      {saving ? 'Speichert…' : 'Speichern'}
                    </button>
                    <button onClick={cancelEdit}
                      style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer' }}>
                      Abbrechen
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 80px 80px', gap: 8, padding: '10px 12px', alignItems: 'center', cursor: 'pointer' }}
                  onClick={() => setExpandedId(expandedId === g.id ? null : g.id)}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{g.name}</div>
                    {g.beschreibung && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{g.beschreibung}</div>}
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                      Angelegt {fmt(g.erstellt_am)}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{g.erstellt_von_name ?? g.erstellt_von}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{g.mitglieder_count ?? 0}</div>
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                    <button onClick={() => startEdit(g)}
                      style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer' }}>
                      Bearbeiten
                    </button>
                    <button onClick={() => deleteGruppe(g)}
                      style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: 'rgba(255,59,48,0.1)', color: '#FF3B30', fontSize: 11, cursor: 'pointer' }}>
                      Löschen
                    </button>
                  </div>
                </div>
              )}

              {/* Expandable member list */}
              {expandedId === g.id && editingId !== g.id && (
                <div style={{ borderTop: '1px solid var(--border)', padding: '10px 12px', background: 'var(--bg-subtle)' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
                    Mitglieder ({(g.mitglieder ?? []).length})
                  </div>
                  {(g.mitglieder ?? []).length === 0 ? (
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Keine Mitglieder.</p>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {(g.mitglieder as any[]).map((m: any) => (
                        <span key={m.user_id} style={{
                          padding: '3px 10px', borderRadius: 20, background: 'var(--bg-surface)',
                          border: '1px solid var(--border)', fontSize: 11, color: 'var(--text-primary)',
                        }}>
                          {m.user_name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Tab: Dokument-Einstellungen ──────────────────────────────────────────────────

const LN_FONT_OPTIONS = [
  { label: 'Courier Prime', value: "'Courier Prime', 'Courier New', monospace" },
  { label: 'Courier New', value: "'Courier New', monospace" },
  { label: 'Inter', value: "'Inter', system-ui, sans-serif" },
  { label: 'Arial', value: "Arial, sans-serif" },
]


// ── Copy Settings Section (sidebar bottom) ───────────────────────────────────────

function CopySection({ produktionId, onCopied }: { produktionId: string; onCopied: () => void }) {
  const { selectedProduction, productions } = useSelectedProduction()
  const { t } = useTerminologie()

  const [copySearch, setCopySearch] = useState('')
  const [copySourceId, setCopySourceId] = useState('')
  const [copySections, setCopySections] = useState<string[]>(['kategorien', 'labels', 'colors', 'einstellungen'])
  const [copyConfirm, setCopyConfirm] = useState(false)
  const [copying, setCopying] = useState(false)
  const [copyDropOpen, setCopyDropOpen] = useState(false)

  const inputStyle: React.CSSProperties = { fontSize: 13, padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontFamily: 'inherit', outline: 'none' }
  const btnStyle: React.CSSProperties = { fontSize: 12, padding: '6px 14px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-subtle)', cursor: 'pointer', fontFamily: 'inherit' }

  const prodLabel = (p: any) => {
    const title = p.staffelnummer ? `${p.title} ${t('staffel')} ${p.staffelnummer}` : p.title
    return p.projektnummer ? `${p.projektnummer} · ${title}` : title
  }
  const copySourceProd = productions.find(p => p.id === copySourceId)
  const copySourceName = copySourceProd ? prodLabel(copySourceProd) : ''
  const othersActive   = productions.filter(p => p.id !== produktionId && p.is_active   && (!copySearch || prodLabel(p).toLowerCase().includes(copySearch.toLowerCase())))
  const othersInactive = productions.filter(p => p.id !== produktionId && !p.is_active  && (!copySearch || prodLabel(p).toLowerCase().includes(copySearch.toLowerCase())))
  const filteredProductions = [...othersActive, ...othersInactive]

  const executeCopy = async () => {
    if (!copySourceId || !copySections.length) return
    setCopying(true)
    try {
      await api.copySettings(produktionId, { source_produktion_id: copySourceId, sections: copySections })
      onCopied()
      setCopyConfirm(false)
      setCopySourceId('')
      setCopySearch('')
    } catch (err: any) {
      alert('Fehler beim Kopieren: ' + err.message)
    } finally {
      setCopying(false)
    }
  }

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h4 style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>Von Produktion kopieren</h4>
      <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
        Übernimmt Einstellungen einer anderen Produktion in die aktuelle.
      </p>

      {/* Source autocomplete */}
      <div style={{ position: 'relative' }}>
        <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
          Quelle (Produktion)
        </label>
        <input
          style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
          placeholder="Produktion suchen..."
          value={copySourceId ? copySourceName : copySearch}
          onChange={e => { setCopySearch(e.target.value); setCopySourceId(''); setCopyDropOpen(true) }}
          onFocus={() => setCopyDropOpen(true)}
          onBlur={() => setTimeout(() => setCopyDropOpen(false), 150)}
        />
        {copyDropOpen && filteredProductions.length > 0 && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
            background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8,
            marginTop: 2, maxHeight: 220, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
          }}>
            {othersActive.length > 0 && (
              <div style={{ padding: '5px 10px 2px', fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Aktiv
              </div>
            )}
            {othersActive.map(p => (
              <div key={p.id} onMouseDown={() => { setCopySourceId(p.id); setCopySearch(''); setCopyDropOpen(false) }}
                style={{ padding: '7px 12px', cursor: 'pointer', fontSize: 13, background: copySourceId === p.id ? 'var(--bg-subtle)' : undefined }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-subtle)')}
                onMouseLeave={e => (e.currentTarget.style.background = copySourceId === p.id ? 'var(--bg-subtle)' : '')}
              >{prodLabel(p)}</div>
            ))}
            {othersInactive.length > 0 && (
              <div style={{ padding: '7px 10px 2px', fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', borderTop: othersActive.length > 0 ? '1px solid var(--border-subtle)' : undefined }}>
                Inaktiv
              </div>
            )}
            {othersInactive.map(p => (
              <div key={p.id} onMouseDown={() => { setCopySourceId(p.id); setCopySearch(''); setCopyDropOpen(false) }}
                style={{ padding: '7px 12px', cursor: 'pointer', fontSize: 13, background: copySourceId === p.id ? 'var(--bg-subtle)' : undefined, opacity: 0.7 }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-subtle)')}
                onMouseLeave={e => (e.currentTarget.style.background = copySourceId === p.id ? 'var(--bg-subtle)' : '')}
              >{prodLabel(p)}</div>
            ))}
          </div>
        )}
      </div>

      {/* Section checkboxes */}
      <div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>Bereiche kopieren</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {COPY_SECTIONS.map(sec => (
            <label key={sec.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={copySections.includes(sec.id)}
                onChange={e => setCopySections(prev =>
                  e.target.checked ? [...prev, sec.id] : prev.filter(s => s !== sec.id)
                )}
              />
              {sec.label}
            </label>
          ))}
        </div>
      </div>

      {/* Confirm / copy button */}
      {!copyConfirm ? (
        <button
          onClick={() => setCopyConfirm(true)}
          disabled={!copySourceId || !copySections.length}
          style={{
            alignSelf: 'flex-start', padding: '8px 16px', borderRadius: 8,
            background: copySourceId && copySections.length ? 'var(--text-primary)' : 'var(--bg-subtle)',
            color: copySourceId && copySections.length ? 'var(--text-inverse)' : 'var(--text-muted)',
            border: 'none', cursor: copySourceId && copySections.length ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit', fontWeight: 600, fontSize: 13,
          }}
        >
          Kopieren...
        </button>
      ) : (
        <div style={{ padding: '12px 14px', background: 'rgba(255,59,48,0.06)', borderRadius: 8, border: '1px solid rgba(255,59,48,0.3)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5 }}>
            <strong>Achtung:</strong> Die bestehenden Einstellungen von{' '}
            <strong>{selectedProduction ? [selectedProduction.projektnummer, selectedProduction.title, selectedProduction.staffelnummer != null ? `${t('staffel')} ${selectedProduction.staffelnummer}` : null].filter(Boolean).join(' · ') : ''}</strong>{' '}
            werden durch die Einstellungen von <strong>{copySourceName}</strong> ersetzt.
            Bereiche: {copySections.map(s => COPY_SECTIONS.find(c => c.id === s)?.label).join(', ')}.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={executeCopy}
              disabled={copying}
              style={{ padding: '7px 16px', borderRadius: 7, background: 'var(--sw-danger)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, fontSize: 13 }}
            >
              {copying ? 'Kopiert...' : 'Ja, ersetzen'}
            </button>
            <button
              onClick={() => setCopyConfirm(false)}
              disabled={copying}
              style={btnStyle}
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tab: Terminologie ────────────────────────────────────────────────────────────

function TermRow({ label, subtext, options, value, onSelect, disabled, last }: {
  label: string
  subtext?: string
  options: { value: string; label: string }[]
  value: string
  onSelect: (v: string) => void
  disabled?: boolean
  last?: boolean
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16,
      padding: '11px 16px',
      borderBottom: last ? 'none' : '1px solid var(--border)',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.4 }}>{label}</div>
        {subtext && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.5 }}>{subtext}</div>}
      </div>
      <div className="seg" style={{ display: 'inline-flex', flexShrink: 0 }}>
        {options.map(opt => (
          <button
            key={opt.value}
            className={value === opt.value ? 'on' : ''}
            onClick={() => onSelect(opt.value)}
            disabled={disabled}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function TerminologieTab({ productionId }: { productionId?: string }) {
  const { config: currentConfig } = useTerminologie()
  const [config, setConfig] = useState<TerminologieConfig>({ ...currentConfig })
  const [saving, setSaving] = useState(false)
  const [treatmentLabel, setTreatmentLabel] = useState<'Treatment' | 'Storylines' | 'Outline'>('Treatment')
  const [treatmentSaving, setTreatmentSaving] = useState(false)
  const [figurenLabel, setFigurenLabel] = useState<'Rollen' | 'Figuren' | 'Charaktere'>('Rollen')
  const [figurenSaving, setFigurenSaving] = useState(false)

  useEffect(() => { setConfig({ ...currentConfig }) }, [currentConfig])

  useEffect(() => {
    fetch('/api/admin/app-settings', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((d: any) => { if (d?.figuren_label) setFigurenLabel(d.figuren_label) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!productionId) return
    fetch(`/api/dk-settings/${productionId}/app-settings`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((d: any) => { if (d?.treatment_label) setTreatmentLabel(d.treatment_label) })
      .catch(() => {})
  }, [productionId])

  const saveKey = async (key: TermKey, value: string) => {
    const next = { ...config, [key]: value }
    setConfig(next)
    setSaving(true)
    await fetch('/api/admin/app-settings/terminologie', {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: JSON.stringify(next) }),
    }).catch(() => {})
    setSaving(false)
    window.dispatchEvent(new CustomEvent('app-settings-changed'))
  }

  const saveTreatmentLabel = async (val: 'Treatment' | 'Storylines' | 'Outline') => {
    if (!productionId) return
    setTreatmentLabel(val)
    setTreatmentSaving(true)
    await fetch(`/api/dk-settings/${productionId}/app-settings/treatment_label`, {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: val }),
    }).catch(() => {})
    setTreatmentSaving(false)
  }

  const saveFigurenLabel = async (val: 'Rollen' | 'Figuren' | 'Charaktere') => {
    setFigurenLabel(val)
    setFigurenSaving(true)
    await fetch('/api/admin/app-settings/figuren_label', {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: val }),
    }).catch(() => {})
    setFigurenSaving(false)
    window.dispatchEvent(new CustomEvent('app-settings-changed'))
  }

  const resetAll = async () => {
    setConfig({ ...TERM_DEFAULTS })
    setSaving(true)
    await fetch('/api/admin/app-settings/terminologie', {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: JSON.stringify(TERM_DEFAULTS) }),
    }).catch(() => {})
    setSaving(false)
    window.dispatchEvent(new CustomEvent('app-settings-changed'))
  }

  return (
    <div style={{ maxWidth: 680 }}>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 24px', lineHeight: 1.6 }}>
        In der Branche werden für dieselben Konzepte unterschiedliche Begriffe verwendet.
        Hier legst du fest, welcher Begriff in der gesamten App verwendet wird.
      </p>

      {/* Bezeichnungen */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Bezeichnungen</div>
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <TermRow
            label="Figuren / Rollen"
            subtext="Bezeichnung für Rollen in Navigation und UI"
            options={[
              { value: 'Rollen', label: 'Rollen' },
              { value: 'Figuren', label: 'Figuren' },
              { value: 'Charaktere', label: 'Charaktere' },
            ]}
            value={figurenLabel}
            onSelect={v => saveFigurenLabel(v as 'Rollen' | 'Figuren' | 'Charaktere')}
            disabled={figurenSaving}
          />
          {productionId ? (
            <TermRow
              label="Vorstufe / Treatment"
              subtext="Bezeichnung der Vorstufe vor dem Drehbuch — gilt für diese Produktion"
              options={[
                { value: 'Treatment', label: 'Treatment' },
                { value: 'Storylines', label: 'Storylines' },
                { value: 'Outline', label: 'Outline' },
              ]}
              value={treatmentLabel}
              onSelect={v => saveTreatmentLabel(v as 'Treatment' | 'Storylines' | 'Outline')}
              disabled={treatmentSaving}
              last
            />
          ) : (
            <div style={{ padding: '11px 16px', fontSize: 12, color: 'var(--text-secondary)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>Vorstufe / Treatment</span>
              <span>— Bitte eine Produktion wählen</span>
            </div>
          )}
        </div>
      </div>

      {/* Begriffe */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Begriffe</div>
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          {TERM_KEYS.map((key, i) => {
            const options = TERM_OPTIONS[key]
            const optionNames = Object.keys(options)
            const forms = options[config[key]]
            return (
              <TermRow
                key={key}
                label={TERM_LABELS[key]}
                subtext={forms ? `Singular: ${forms.s} · Plural: ${forms.p}` : undefined}
                options={optionNames.map(o => ({ value: o, label: o }))}
                value={config[key]}
                onSelect={v => saveKey(key, v)}
                disabled={saving}
                last={i === TERM_KEYS.length - 1}
              />
            )
          })}
        </div>
      </div>

      <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={resetAll}
          disabled={saving}
          style={{
            padding: '8px 18px', borderRadius: 7,
            border: '1px solid var(--border)', background: 'var(--bg-subtle)',
            fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Begriffe auf Standard zurücksetzen
        </button>
        {saving && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Wird gespeichert...</span>}
      </div>
    </div>
  )
}

// ── Main Page Export ──────────────────────────────────────────────────────────────

export default function DrehbuchkoordinationPage() {
  const [activeTab, setActiveTab] = useState('allgemein')
  const [headerSlot, setHeaderSlot] = useState<HTMLDivElement | null>(null)
  const [hasAccess, setHasAccess] = useState<boolean | null>(null)
  const [copyOpen, setCopyOpen] = useState(false)
  const [seitenformat, setSeitenformat] = useState<'a4' | 'letter'>('a4')
  const [seitenformatSaving, setSeitenformatSaving] = useState(false)
  const [margins, setMargins] = useState({ oben: 25, unten: 20, links: 25, rechts: 20 })
  const [statSections, setStatSections] = useState<StatModalSection[]>([...DEFAULT_SECTIONS])
  const navigate = useNavigate()
  const { selectedProduction, productions } = useSelectedProduction()
  const { t } = useTerminologie()

  const produktionId = selectedProduction?.id ?? ''

  // Check DK access on mount
  useEffect(() => {
    fetch('/api/dk-settings/my-productions', { credentials: 'include' })
      .then(r => {
        if (!r.ok) { setHasAccess(false); return null }
        return r.json()
      })
      .then((data: any) => {
        if (!data) return
        // If user has access to at least one production, allow
        if (Array.isArray(data) && data.length > 0) {
          // Check if the selected production is in the list
          const hasForSelected = !produktionId || data.some((p: any) => p.id === produktionId || p.produktion_id === produktionId)
          setHasAccess(hasForSelected)
        } else if (data.global || data.has_access) {
          setHasAccess(true)
        } else {
          setHasAccess(false)
        }
      })
      .catch(() => setHasAccess(false))
  }, [produktionId])

  // Load stat modal config from production settings
  useEffect(() => {
    if (!produktionId) return
    fetch(`/api/dk-settings/${produktionId}/app-settings`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((data: any) => {
        if (data?.statistik_modal_config) {
          try {
            const parsed = JSON.parse(data.statistik_modal_config)
            if (Array.isArray(parsed)) setStatSections(parsed)
          } catch {}
        }
      })
      .catch(() => {})
  }, [produktionId])

  // Seitenformat + Ränder laden (geteilt für alle Format-Template-Tabs)
  useEffect(() => {
    if (!produktionId) return
    fetch(`/api/dk-settings/${produktionId}/app-settings`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((data: any) => {
        setSeitenformat(data?.seitenformat === 'letter' ? 'letter' : 'a4')
        if (data?.page_margins) {
          try { setMargins(m => ({ ...m, ...JSON.parse(data.page_margins) })) } catch {}
        }
      })
      .catch(() => {})
  }, [produktionId])

  const saveSeitenformat = async (val: 'a4' | 'letter') => {
    setSeitenformat(val); setSeitenformatSaving(true)
    await fetch(`/api/dk-settings/${produktionId}/app-settings/seitenformat`, {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: val }),
    }).catch(() => {})
    setSeitenformatSaving(false)
  }

  const saveMargins = async (next: typeof margins) => {
    setMargins(next)
    await fetch(`/api/dk-settings/${produktionId}/app-settings/page_margins`, {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: JSON.stringify(next) }),
    }).catch(() => {})
    window.dispatchEvent(new CustomEvent('app-settings-changed', { detail: { productionId: produktionId } }))
  }

  // Arrow key tab navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) return
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return
      const idx = DK_TABS.findIndex(t => t.id === activeTab)
      if (idx === -1) return
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowUp') && idx > 0) setActiveTab(DK_TABS[idx - 1].id)
      if ((e.key === 'ArrowRight' || e.key === 'ArrowDown') && idx < DK_TABS.length - 1) setActiveTab(DK_TABS[idx + 1].id)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeTab])

  const prodLabel = selectedProduction
    ? [
        selectedProduction.projektnummer,
        selectedProduction.title,
        selectedProduction.staffelnummer != null ? `${t('staffel')} ${selectedProduction.staffelnummer}` : null,
      ].filter(Boolean).join(' · ')
    : 'Keine Produktion'

  const renderContent = () => {
    if (hasAccess === null) {
      return <div style={{ padding: '28px 32px', fontSize: 13, color: 'var(--text-secondary)' }}>Zugriff wird geprüft...</div>
    }
    if (hasAccess === false) {
      return (
        <div style={{ padding: '28px 32px', fontSize: 13, color: 'var(--text-secondary)' }}>
          <strong>Kein Zugriff</strong>
          <p style={{ marginTop: 8, lineHeight: 1.6 }}>
            Du hast keinen Zugriff auf die Drehbuchkoordination für diese Produktion.
            Wende dich an einen Administrator.
          </p>
        </div>
      )
    }

    switch (activeTab) {
      case 'allgemein':
        return produktionId ? <AllgemeinTab productionId={produktionId} /> : <NoProduction />
      case 'terminologie':
        return <TerminologieTab productionId={produktionId || undefined} />
      case 'figuren':
        return <FigurenTab />
      case 'produktion':
        return <ProduktionTab />
      case 'export-vorlagen':
        return <Placeholder label="Export-Vorlagen" />
      case 'lock-regeln':
        return <LockRegelnTab />
      case 'dokument-typen':
        return <DokumentTypenTab
          headerSlot={headerSlot}
          seitenformat={seitenformat}
          seitenformatSaving={seitenformatSaving}
          margins={margins}
          onSeitenformatChange={saveSeitenformat}
          onMarginsUpdate={setMargins}
          onMarginsSave={saveMargins}
        />
      case 'gruppen-register':
        return produktionId ? <GruppenRegisterTab /> : <NoProduction />

      case 'statistik-panel':
        return produktionId
          ? <StatistikPanelTab productionId={produktionId} sections={statSections} onSectionsChange={setStatSections} />
          : <NoProduction />
      case 'daily-regeln':
        return produktionId ? <DailyRegelnTab productionId={produktionId} /> : <NoProduction />
      case 'stockshot-templates':
        return produktionId ? <StockshotTemplatesTab productionId={produktionId} /> : <NoProduction />
      case 'vorlagen':
        return produktionId ? <VorlagenTab productionId={produktionId} /> : <NoProduction />
      case 'kopf-fusszeilen':
        return produktionId ? <KopfFusszeileTab productionId={produktionId} /> : <NoProduction />
      case 'autorenplan':
        return produktionId ? <AutorenplanTab produktionDbId={produktionId} /> : <NoProduction />
      default:
        return <Placeholder label={activeTab} />
    }
  }

  return (
    <AppShell>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '10px 24px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-page)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, lineHeight: 1.2, color: 'var(--text-primary)' }}>
              Drehbuchkoordination
            </h2>
            <button
              onClick={() => navigate('/')}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-secondary)', fontSize: 11, padding: 0, marginTop: 1,
                display: 'flex', alignItems: 'center', gap: 3,
              }}
            >
              &#8592; Zurück
            </button>
          </div>
          {/* Format+Ränder (alle Template-Tabs) + Preset-Slot (nur Drehbuch-Formatierung) */}
          {FORMAT_TEMPLATE_TABS.includes(activeTab) && produktionId ? (
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', flexShrink: 0 }}>Format:</span>
                <div className="seg" style={{ display: 'inline-flex', flexShrink: 0 }}>
                  {(['a4', 'letter'] as const).map(opt => (
                    <button key={opt} className={seitenformat === opt ? 'on' : ''}
                      onClick={() => saveSeitenformat(opt)} disabled={seitenformatSaving}
                      title={opt === 'a4' ? 'A4 — 210 × 297 mm' : 'Letter — 215,9 × 279,4 mm'}
                      style={{ fontSize: 10, padding: '1px 7px' }}>
                      {opt === 'a4' ? 'A4' : 'Letter'}
                    </button>
                  ))}
                </div>
                <div style={{ width: 1, height: 14, background: 'var(--border)', flexShrink: 0 }} />
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', flexShrink: 0 }}>Ränder mm:</span>
                {(['oben', 'unten', 'links', 'rechts'] as const).map(side => (
                  <label key={side} style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 10, color: 'var(--text-secondary)', flexShrink: 0 }}>
                    <span>{side.charAt(0).toUpperCase() + side.slice(1)}</span>
                    <input type="number" min={0} max={60} value={margins[side]}
                      onChange={e => { const v = Math.max(0, Math.min(60, parseInt(e.target.value, 10) || 0)); setMargins(m => ({ ...m, [side]: v })) }}
                      onBlur={() => saveMargins(margins)}
                      style={{ width: 36, padding: '1px 3px', borderRadius: 3, border: '1px solid var(--border)', fontSize: 10, background: 'var(--bg-surface)', color: 'var(--text-primary)', textAlign: 'center' }} />
                  </label>
                ))}
              </div>
              {/* Preset-Slot: nur DokumentTypenTab portalt hierhin */}
              <div ref={setHeaderSlot} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }} />
            </div>
          ) : (
            <div ref={setHeaderSlot} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'stretch' }} />
          )}
          <div style={{
            fontSize: 13, fontWeight: 500,
            padding: '6px 14px', borderRadius: 8,
            background: 'var(--bg-subtle)', border: '1px solid var(--border)',
            color: 'var(--text-primary)',
            flexShrink: 0,
          }}>
            {prodLabel}
          </div>
        </div>

        {/* Body: Sidebar + Content */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Sidebar */}
          <div style={{
            width: 200, flexShrink: 0,
            background: 'var(--bg-subtle)',
            borderRight: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
          }}>
            {/* Nav items */}
            <nav style={{ flex: 1, paddingTop: 8 }}>
              {DK_TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 16px',
                    fontSize: 13,
                    fontWeight: activeTab === tab.id ? 500 : 400,
                    color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                    background: activeTab === tab.id ? 'var(--bg-active, var(--bg-surface))' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-sans)',
                    transition: 'background 0.12s, color 0.12s',
                    borderRadius: 0,
                  }}
                  onMouseEnter={e => {
                    if (activeTab !== tab.id) e.currentTarget.style.background = 'var(--bg-surface)'
                  }}
                  onMouseLeave={e => {
                    if (activeTab !== tab.id) e.currentTarget.style.background = 'transparent'
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </nav>

            {/* Divider + Copy section at bottom */}
            <div style={{
              borderTop: '1px solid var(--border)',
              marginTop: 8,
            }}>
              <button
                onClick={() => setCopyOpen(v => !v)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', textAlign: 'left',
                  padding: '10px 16px',
                  fontSize: 12, fontWeight: 500,
                  color: 'var(--text-secondary)',
                  background: 'transparent',
                  border: 'none', cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                <span>&#8595; Von Produktion kopieren</span>
                <span style={{ fontSize: 10 }}>{copyOpen ? '&#9650;' : '&#9660;'}</span>
              </button>
              {copyOpen && produktionId && (
                <CopySection produktionId={produktionId} onCopied={() => {
                  // Force re-render of active tab by toggling
                  const cur = activeTab
                  setActiveTab('')
                  setTimeout(() => setActiveTab(cur), 0)
                }} />
              )}
              {copyOpen && !produktionId && (
                <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>
                  Keine Produktion ausgewählt.
                </div>
              )}
            </div>
          </div>

          {/* Content area */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Sub-Navigation: Format-Template-Tabs */}
            {FORMAT_TEMPLATE_TABS.includes(activeTab) && (
              <div style={{ padding: '0 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-page)', display: 'flex', flexShrink: 0 }}>
                {FORMAT_SUB_NAV.map(({ id, label }) => (
                  <button key={id} onClick={() => setActiveTab(id)} style={{
                    background: 'none', border: 'none', padding: '7px 14px 6px',
                    cursor: 'pointer', fontSize: 12,
                    fontWeight: activeTab === id ? 600 : 400,
                    color: activeTab === id ? '#007AFF' : 'var(--text-secondary)',
                    borderBottom: activeTab === id ? '2px solid #007AFF' : '2px solid transparent',
                  }}>
                    {label}
                  </button>
                ))}
              </div>
            )}
            <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
              {renderContent()}
            </div>
          </div>
        </div>
      </div>

    </AppShell>
  )
}

// ── Tab: Statistik-Panel Settings ─────────────────────────────────────────────────

interface StatistikConfig {
  szenenanzahl: { stockshots_mitzaehlen: boolean; flashbacks_ganzeszene_referenz_mitzaehlen: boolean }
  stoppzeit: { stockshots_mitzaehlen: boolean; flashbacks_ganzeszene_referenz_mitzaehlen: boolean; wechselschnitt_nur_erste: boolean }
}
const STATISTIK_CONFIG_DEFAULT: StatistikConfig = {
  szenenanzahl: { stockshots_mitzaehlen: false, flashbacks_ganzeszene_referenz_mitzaehlen: false },
  stoppzeit: { stockshots_mitzaehlen: false, flashbacks_ganzeszene_referenz_mitzaehlen: false, wechselschnitt_nur_erste: true },
}

function StatistikPanelTab({
  productionId,
  sections,
  onSectionsChange,
}: {
  productionId: string
  sections: StatModalSection[]
  onSectionsChange: (s: StatModalSection[]) => void
}) {
  const [saving, setSaving] = useState(false)
  const [savingCfg, setSavingCfg] = useState(false)
  const [cfg, setCfg] = useState<StatistikConfig>(STATISTIK_CONFIG_DEFAULT)
  const dragIdx = useRef<number | null>(null)
  const overIdx = useRef<number | null>(null)

  useEffect(() => {
    fetch(`/api/dk-settings/${productionId}/app-settings`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (data.statistik_config) {
          try {
            const parsed = JSON.parse(data.statistik_config)
            setCfg({
              szenenanzahl: { ...STATISTIK_CONFIG_DEFAULT.szenenanzahl, ...(parsed.szenenanzahl ?? {}) },
              stoppzeit: { ...STATISTIK_CONFIG_DEFAULT.stoppzeit, ...(parsed.stoppzeit ?? {}) },
            })
          } catch {}
        }
      })
      .catch(() => {})
  }, [productionId])

  const saveSections = async (next: StatModalSection[]) => {
    onSectionsChange(next)
    setSaving(true)
    await fetch(`/api/dk-settings/${productionId}/app-settings/statistik_modal_config`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: JSON.stringify(next) }),
    }).catch(() => {})
    setSaving(false)
  }

  const saveCfg = async (next: StatistikConfig) => {
    setCfg(next)
    setSavingCfg(true)
    await fetch(`/api/dk-settings/${productionId}/app-settings/statistik_config`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: JSON.stringify(next) }),
    }).catch(() => {})
    setSavingCfg(false)
    window.dispatchEvent(new Event('app-settings-changed'))
  }

  const toggleSz = (key: keyof StatistikConfig['szenenanzahl']) => {
    saveCfg({ ...cfg, szenenanzahl: { ...cfg.szenenanzahl, [key]: !cfg.szenenanzahl[key] } })
  }
  const toggleSt = (key: keyof StatistikConfig['stoppzeit']) => {
    saveCfg({ ...cfg, stoppzeit: { ...cfg.stoppzeit, [key]: !cfg.stoppzeit[key] } })
  }

  const toggleVisible = (id: string) => {
    const next = sections.map(s => s.id === id ? { ...s, visible: !s.visible } : s)
    saveSections(next)
  }

  const handleReorder = () => {
    if (dragIdx.current === null || overIdx.current === null || dragIdx.current === overIdx.current) return
    const arr = [...sections]
    const [moved] = arr.splice(dragIdx.current, 1)
    arr.splice(overIdx.current, 0, moved)
    dragIdx.current = null
    overIdx.current = null
    saveSections(arr)
  }

  // Matrix rows
  const matrixRows: { key: string; label: string; desc?: string; szKey?: keyof StatistikConfig['szenenanzahl']; stKey?: keyof StatistikConfig['stoppzeit']; readonly?: boolean }[] = [
    {
      key: 'notiz',
      label: 'Notizen',
      desc: 'format = notiz',
      readonly: true,
    },
    {
      key: 'stockshot',
      label: 'Stockshots / E-Shots / Archivbilder',
      desc: 'sondertyp = stockshot',
      szKey: 'stockshots_mitzaehlen',
      stKey: 'stockshots_mitzaehlen',
    },
    {
      key: 'flashback',
      label: 'Flashbacks (ganze Szene + Referenz vorhanden)',
      desc: 'sondertyp = flashback, ganze Szene markiert, Referenz gesetzt',
      szKey: 'flashbacks_ganzeszene_referenz_mitzaehlen',
      stKey: 'flashbacks_ganzeszene_referenz_mitzaehlen',
    },
    {
      key: 'wechselschnitt',
      label: 'Wechselschnitt-Partner (je Gruppe nur 1× zählen)',
      desc: 'Partnerflächen in wechselschnitt_partner werden aus der Stoppzeit herausgerechnet',
      stKey: 'wechselschnitt_nur_erste',
    },
  ]

  const colW = 110
  const labelW = 280

  return (
    <div style={{ maxWidth: 600 }}>
      {/* Szenenanzahl-Konfiguration */}
      <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>Zähl-Konfiguration</h3>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 4px', lineHeight: 1.6 }}>
        Legt fest, was in <b>allen</b> Auswertungen dieser Produktion gilt:
      </p>
      <ul style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 16px', paddingLeft: 18, lineHeight: 1.7 }}>
        <li>Kontextmenü-Statistik-Modal (Szenenübersicht)</li>
        <li>Statistik-Seite (/statistik) — alle Tabs</li>
        <li>Statistik-Panel-Vorschau (hier)</li>
        <li>Exporte mit Statistik-Anhang</li>
      </ul>

      {savingCfg && <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '0 0 8px' }}>Wird gespeichert...</p>}

      {/* Matrix-Header */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
        <div style={{ width: labelW, flexShrink: 0 }} />
        <div style={{ width: colW, flexShrink: 0, fontSize: 11, fontWeight: 700, textAlign: 'center', color: 'var(--text-secondary)' }}>
          Szenenanzahl
        </div>
        <div style={{ width: colW, flexShrink: 0, fontSize: 11, fontWeight: 700, textAlign: 'center', color: 'var(--text-secondary)' }}>
          Stoppzeit
        </div>
      </div>

      {/* Matrix-Rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 20 }}>
        {matrixRows.map(row => {
          const szVal = row.szKey ? cfg.szenenanzahl[row.szKey] : false
          const stVal = row.stKey ? cfg.stoppzeit[row.stKey] : false

          return (
            <div key={row.key} style={{
              display: 'flex', alignItems: 'center',
              padding: '8px 10px',
              background: row.readonly ? 'var(--bg-subtle)' : 'var(--bg-card, var(--bg-subtle))',
              borderRadius: 6,
              border: '1px solid var(--border)',
              opacity: row.readonly ? 0.65 : 1,
            }}>
              <div style={{ width: labelW, flexShrink: 0, paddingRight: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{row.label}</div>
                {row.desc && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{row.desc}</div>}
              </div>

              {/* Szenenanzahl-Zelle */}
              <div style={{ width: colW, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                {row.szKey ? (
                  <button
                    onClick={() => toggleSz(row.szKey!)}
                    style={{
                      padding: '3px 10px', borderRadius: 5, border: '1px solid var(--border)',
                      fontSize: 11, cursor: 'pointer',
                      background: szVal ? '#00C853' : 'var(--bg-subtle)',
                      color: szVal ? '#fff' : 'var(--text-secondary)',
                      fontWeight: 500,
                    }}
                  >
                    {szVal ? 'mitzählen' : 'ausschließen'}
                  </button>
                ) : (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    {row.readonly ? 'immer ausgeschl.' : '—'}
                  </span>
                )}
              </div>

              {/* Stoppzeit-Zelle */}
              <div style={{ width: colW, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                {row.stKey ? (
                  <button
                    onClick={() => toggleSt(row.stKey!)}
                    style={{
                      padding: '3px 10px', borderRadius: 5, border: '1px solid var(--border)',
                      fontSize: 11, cursor: 'pointer',
                      background: stVal ? '#00C853' : 'var(--bg-subtle)',
                      color: stVal ? '#fff' : 'var(--text-secondary)',
                      fontWeight: 500,
                    }}
                  >
                    {row.stKey === 'wechselschnitt_nur_erste'
                      ? (stVal ? 'nur erste' : 'alle')
                      : (stVal ? 'mitzählen' : 'ausschließen')}
                  </button>
                ) : (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    {row.readonly ? 'immer ausgeschl.' : '—'}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <button
        onClick={() => saveCfg(STATISTIK_CONFIG_DEFAULT)}
        style={{
          marginBottom: 32, padding: '6px 14px', borderRadius: 6,
          border: '1px solid var(--border)', background: 'var(--bg-subtle)',
          fontSize: 12, cursor: 'pointer',
        }}
      >
        Konfiguration auf Standard zurücksetzen
      </button>

      {/* Panel-Rubriken */}
      <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>Statistik-Panel — Rubriken</h3>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 20px', lineHeight: 1.6 }}>
        Lege fest, welche Rubriken im Statistik-Panel angezeigt werden und in welcher Reihenfolge. Ziehe die Einträge per Drag & Drop.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {sections.map((sec, i) => (
          <div
            key={sec.id}
            draggable
            onDragStart={() => { dragIdx.current = i }}
            onDragOver={e => { e.preventDefault(); overIdx.current = i }}
            onDrop={handleReorder}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px',
              background: 'var(--bg-subtle)',
              borderRadius: 6,
              userSelect: 'none',
              opacity: sec.visible ? 1 : 0.5,
              transition: 'opacity 0.15s',
            }}
          >
            <span style={{ cursor: 'grab', color: 'var(--text-muted)', fontSize: 14, lineHeight: 1 }}>&#x2807;</span>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{sec.label}</span>
            <button
              onClick={() => toggleVisible(sec.id)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: sec.visible ? 'var(--text-primary)' : 'var(--text-muted)',
                fontSize: 12, padding: '2px 8px',
              }}
            >
              {sec.visible ? 'Sichtbar' : 'Ausgeblendet'}
            </button>
          </div>
        ))}
      </div>

      {saving && <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)' }}>Wird gespeichert...</p>}

      <button
        onClick={() => saveSections([...DEFAULT_SECTIONS])}
        style={{
          marginTop: 16, padding: '6px 14px', borderRadius: 6,
          border: '1px solid var(--border)', background: 'var(--bg-subtle)',
          fontSize: 12, cursor: 'pointer',
        }}
      >
        Rubriken auf Standard zurücksetzen
      </button>
    </div>
  )
}

// ── Daily-Regeln Tab ────────────────────────────────────────────────────────────
function DailyRegelnTab({ productionId }: { productionId: string }) {
  const [enabled, setEnabled] = useState(false)
  const [nachtbildMin, setNachtbildMin] = useState(20)
  const [drehschluss, setDrehschluss] = useState('18:30')
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch(`/api/weather/daily-regeln/${encodeURIComponent(productionId)}`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (data) {
          setEnabled(!!data.enabled)
          if (data.nachtbild_dauer_min != null) setNachtbildMin(data.nachtbild_dauer_min)
          if (data.drehschluss_zeit) setDrehschluss(data.drehschluss_zeit)
        }
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [productionId])

  const save = async (next: { enabled: boolean; nachtbild_dauer_min: number; drehschluss_zeit: string }) => {
    setSaving(true)
    await fetch(`/api/dk-settings/${productionId}/app-settings/daily_regeln`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: JSON.stringify(next) }),
    }).catch(() => {})
    setSaving(false)
  }

  const handleToggle = () => {
    const next = !enabled
    setEnabled(next)
    save({ enabled: next, nachtbild_dauer_min: nachtbildMin, drehschluss_zeit: drehschluss })
  }

  const handleNachtbild = (val: number) => {
    setNachtbildMin(val)
    save({ enabled, nachtbild_dauer_min: val, drehschluss_zeit: drehschluss })
  }

  const handleDrehschluss = (val: string) => {
    setDrehschluss(val)
    save({ enabled, nachtbild_dauer_min: nachtbildMin, drehschluss_zeit: val })
  }

  if (!loaded) return <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Laden...</p>

  const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 500, marginBottom: 4 }
  const descStyle: React.CSSProperties = { fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.6 }
  const inputStyle: React.CSSProperties = {
    padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)',
    background: 'var(--bg-subtle)', fontSize: 13, fontFamily: 'var(--font-sans)',
    width: 120,
  }

  return (
    <div style={{ maxWidth: 500 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>Daily-Regeln</h3>
      <p style={descStyle}>
        Steuert die Sommer/Winter-Anzeige im Header. Bei aktivierter Anzeige wird basierend auf dem Sonnenuntergang berechnet,
        wie viele Nachtbilder vor Drehschluss möglich sind.
      </p>

      {/* Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button
          onClick={handleToggle}
          style={{
            width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
            background: enabled ? 'var(--sw-green, #00C853)' : 'var(--border)',
            position: 'relative', transition: 'background 0.2s',
          }}
        >
          <span style={{
            position: 'absolute', top: 2, left: enabled ? 20 : 2,
            width: 18, height: 18, borderRadius: '50%', background: '#fff',
            transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }} />
        </button>
        <span style={{ fontSize: 13, fontWeight: 500 }}>
          Sommer/Winter-Anzeige {enabled ? 'aktiv' : 'inaktiv'}
        </span>
      </div>

      {enabled && (
        <>
          {/* Drehlänge Nachtbild */}
          <div style={{ marginBottom: 16 }}>
            <div style={labelStyle}>Drehlänge Nachtbild (Minuten)</div>
            <p style={descStyle}>
              Wie lange dauert ein Nachtbild durchschnittlich? Wird zur Berechnung der möglichen Nachtbilder vor Drehschluss verwendet.
            </p>
            <input
              type="number"
              min={5}
              max={120}
              step={5}
              value={nachtbildMin}
              onChange={e => handleNachtbild(Number(e.target.value) || 20)}
              style={inputStyle}
            />
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 8 }}>Min.</span>
          </div>

          {/* Drehschluss */}
          <div style={{ marginBottom: 16 }}>
            <div style={labelStyle}>Drehschluss</div>
            <p style={descStyle}>
              Offizielle Drehschluss-Uhrzeit. Wenn der Sonnenuntergang davor liegt, wird "Winter + n" im Header angezeigt.
            </p>
            <input
              type="time"
              value={drehschluss}
              onChange={e => handleDrehschluss(e.target.value || '18:30')}
              style={inputStyle}
            />
          </div>

          {/* Preview */}
          <div style={{
            padding: '12px 16px', borderRadius: 8,
            background: 'var(--bg-subtle)', border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Vorschau-Beispiel</div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
              Sonnenuntergang 17:50 · Drehschluss {drehschluss}<br />
              → {(() => {
                const [h, m] = drehschluss.split(':').map(Number)
                const dsMins = h * 60 + m
                const ssMins = 17 * 60 + 50
                const n = Math.floor((dsMins - ssMins) / (nachtbildMin || 20))
                return n > 0 ? `Winter + ${n} (${n} Nachtbild${n !== 1 ? 'er' : ''} möglich)` : 'Sommer'
              })()}
            </p>
          </div>
        </>
      )}

      {saving && <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)' }}>Wird gespeichert...</p>}
    </div>
  )
}

// ── Tab: Lock-Regeln ─────────────────────────────────────────────────────────────

const GEPLANTE_REGELN: { kategorie: string; regeln: string[] }[] = [
  {
    kategorie: 'Vollständigkeit',
    regeln: [
      'Alle Szenen haben einen Szenenkopf (Motiv, I/A, DT)',
      'Keine Szene ohne Inhalt (leerer Editor)',
      'Alle Rollen in Szenen sind im Figurenregister vorhanden',
      'Stoppzeit ist bei allen Szenen gesetzt',
    ],
  },
  {
    kategorie: 'Konsistenz',
    regeln: [
      'Motivschreibweisen sind einheitlich (Groß-/Kleinschreibung, Abkürzungen)',
      'Rollennamen sind einheitlich geschrieben (z.B. „LAURA" vs. „Laura")',
      'Keine doppelten Szenennummern innerhalb einer Folge',
    ],
  },
  {
    kategorie: 'Formales',
    regeln: [
      'Seitenanzahl liegt im erlaubten Bereich (konfigurierbar, z.B. 52–56 Seiten)',
      'Alle Dialoge enden mit Satzzeichen',
      'Keine Zeile beginnt mit Leerzeichen',
    ],
  },
  {
    kategorie: 'Dramaturgie (optional)',
    regeln: [
      'Jede Hauptfigur hat mindestens X Szenen (konfigurierbar)',
      'Kein Block ohne Pre-Teaser-Szene',
      'Sonderszenen (Flashback, Stockshot) sind korrekt markiert',
    ],
  },
]

function LockRegelnTab() {
  const sectionStyle: React.CSSProperties = { marginBottom: 32 }
  const h3Style: React.CSSProperties = { fontSize: 14, fontWeight: 600, margin: '0 0 8px' }
  const subStyle: React.CSSProperties = { fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 12px' }

  return (
    <div style={{ maxWidth: 680, display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* Erklärung */}
      <section style={sectionStyle}>
        <h3 style={h3Style}>Lock-Regeln</h3>
        <p style={subStyle}>
          Hier werden die Regeln definiert, die geprüft werden, wenn ein Drehbuch gelockt wird.
          Beim Lock-Vorgang wird das Dokument auf eventuelle Fehler oder Unvollständigkeiten geprüft —
          je nach Konfiguration als harter Blocker (Lock verhindert) oder als Warnung (Lock möglich, aber mit Hinweis).
        </p>
        <p style={subStyle}>
          Perspektivisch sollen diese Regeln auch im <strong>kontinuierlichen Betrieb</strong> laufen —
          d.h. Hinweise werden bereits während der Bearbeitung angezeigt, ohne dass ein Lock ausgelöst werden muss
          (ähnlich einer Rechtschreibprüfung).
        </p>
        <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--text-secondary)' }}>
          <strong style={{ color: 'var(--text)' }}>Status:</strong> Die technische Infrastruktur (Lock-Mechanismus, Werkstufen-Status) ist vorhanden.
          Die Regel-Engine ist noch nicht implementiert. Regelwünsche können unten gemeldet werden.
        </div>
      </section>

      {/* Geplante Regeln */}
      <section style={sectionStyle}>
        <h3 style={h3Style}>Geplante Regeln — Wunschliste</h3>
        <p style={subStyle}>
          Diese Regeln sind vorgesehen und können nach Bedarf priorisiert werden.
          Neue Regelwünsche bitte direkt an den Entwickler melden.
        </p>
        {GEPLANTE_REGELN.map(gruppe => (
          <div key={gruppe.kategorie} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 6 }}>
              {gruppe.kategorie}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
              {gruppe.regeln.map(regel => (
                <div key={regel} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, padding: '6px 10px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 7 }}>
                  <span style={{ color: 'var(--text-muted)', marginTop: 1, flexShrink: 0 }}>○</span>
                  <span>{regel}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>geplant</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* Regelwunsch melden */}
      <section style={sectionStyle}>
        <h3 style={h3Style}>Regelwunsch melden</h3>
        <p style={subStyle}>
          Welche Fehler oder Inkonsistenzen soll das System beim Lock erkennen?
          Bitte so konkret wie möglich beschreiben (Bedingung + erwartetes Verhalten).
        </p>
        <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
          Direkter Kanal zum Entwickler: Nachricht über den Messenger senden oder per Kommentar in einer beliebigen Szene vermerken und taggen.
        </div>
      </section>

    </div>
  )
}

// ── Placeholder for tabs still in development ────────────────────────────────────

function Placeholder({ label }: { label: string }) {
  return (
    <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
      <strong>{label}</strong>
      <p style={{ marginTop: 8 }}>Noch in Entwicklung.</p>
    </div>
  )
}

// ── Titelseite Default Content ──────────────────────────────────────────────────

function titelseiteDefaultVorlage(): DokumentVorlagenEditorValue {
  const chip = (key: string) => ({ type: 'placeholder_chip', attrs: { key } })
  const txt  = (s: string)   => ({ type: 'text', text: s })
  const bold = (s: string)   => ({ type: 'text', text: s, marks: [{ type: 'bold' }] })

  const para = (content: any[], textAlign?: string, fontSize?: string) => {
    const attrs: Record<string, string> = {}
    if (textAlign && textAlign !== 'left') attrs.textAlign = textAlign
    if (fontSize) attrs.fontSize = fontSize
    const node: any = { type: 'paragraph', content }
    if (Object.keys(attrs).length) node.attrs = attrs
    return node
  }

  // Two-column table row: bold label left, content right
  const cell = (content: any[]): any => ({
    type: 'tableCell',
    attrs: { colspan: 1, rowspan: 1, colwidth: null },
    content: [{ type: 'paragraph', content }],
  })
  const tableRow = (label: string, value: any[]): any => ({
    type: 'tableRow',
    content: [cell([bold(label)]), cell(value)],
  })
  const table = (rows: any[]): any => ({
    type: 'table',
    content: rows,
  })

  const hr    = { type: 'horizontalRule' }
  const empty = { type: 'paragraph' }

  const body_content = {
    type: 'doc',
    content: [
      // Titel
      para([chip('{{produktion}}'), txt('  –  Staffel '), chip('{{staffel}}')], 'center', '20pt'),
      para([chip('{{fassung}}'),    txt('  –  Episode '), chip('{{folge}}')],   'center', '13pt'),
      empty, hr,

      // Produktionsdaten-Tabelle
      table([
        tableRow('Block',                  [chip('{{block}}')]),
        tableRow('Produktionsbesprechung', [txt('TT.MM.JJJJ')]),
        tableRow('Vorauss. Drehtermin',    [txt('TT.MM. – TT.MM.JJJJ')]),
        tableRow('Vorauss. Sendetermin',   [txt('JJJJ')]),
        tableRow('Gesamtlänge',            [txt('MM:SS')]),
      ]),
      empty,

      // Crew-Tabelle
      table([
        tableRow('Regie',           [chip('{{regie}}')]),
        tableRow('Writer Producer', [txt('Name')]),
        tableRow('Head of Story',   [txt('Name')]),
        tableRow('Storyliner',      [txt('Name, Name, Name')]),
        tableRow('Story Edit',      [txt('Name')]),
        tableRow('Autor',           [chip('{{autor}}')]),
        tableRow('Script Edit',     [txt('Name')]),
        tableRow('Dialogautor',     [txt('Name')]),
        tableRow('Dialog Edit',     [txt('Name')]),
      ]),

      empty, hr, empty,

      // Vertraulichkeits-Hinweis
      para(
        [bold('DIE BÜCHER SIND BIS ZUR AUSSTRAHLUNG DER EPISODEN STRENG VERTRAULICH ZU BEHANDELN. JEDER VERSTOSS WIRD ALS VERTRAGSBRUCH GEAHNDET!')],
        'center',
      ),

      empty, hr, empty,

      // Copyright
      para([txt('© 2026  '), chip('{{firmenname}}')]),
    ],
  }

  return {
    body_content,
    kopfzeile_content:       null,
    fusszeile_content:       null,
    kopfzeile_aktiv:         false,
    fusszeile_aktiv:         false,
    erste_seite_kein_header: true,
    seiten_layout:           { format: 'a4', margin_top: 25, margin_bottom: 20, margin_left: 30, margin_right: 25 },
  }
}

// ── Vorlagen Tab ────────────────────────────────────────────────────────────────

const VORLAGE_TYPES = [
  { id: 'titelseite', label: 'Titelseite' },
  { id: 'synopsis', label: 'Synopsis' },
  { id: 'recap', label: 'Recap' },
  { id: 'precap', label: 'Precap' },
  { id: 'custom', label: 'Benutzerdefiniert' },
]

function StockshotTemplatesTab({ productionId }: { productionId: string }) {
  const [templates, setTemplates] = useState<any[]>([])
  const [motive, setMotive] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<string | null>(null)
  const [editKat, setEditKat] = useState('ortswechsel')
  const [editName, setEditName] = useState('')
  const [editOneliner, setEditOneliner] = useState('')
  const [editStoppzeit, setEditStoppzeit] = useState('')
  const [editInnenAussen, setEditInnenAussen] = useState('')
  const [editStimmung, setEditStimmung] = useState('')
  const [editBodytext, setEditBodytext] = useState('')
  const [editMotivId, setEditMotivId] = useState('')

  useEffect(() => {
    Promise.all([
      api.getStockshotTemplates(productionId),
      api.getMotive(productionId),
    ]).then(([t, m]) => { setTemplates(t); setMotive(m) }).finally(() => setLoading(false))
  }, [productionId])

  const resetEdit = () => {
    setEditId(null); setEditName(''); setEditOneliner('')
    setEditStoppzeit(''); setEditInnenAussen(''); setEditStimmung(''); setEditBodytext(''); setEditMotivId('')
  }

  const openEdit = (t: any) => {
    setEditId(t.id); setEditKat(t.kategorie); setEditName(t.name)
    setEditOneliner(t.oneliner_vorlage ?? '')
    setEditStoppzeit(t.stoppzeit_sek != null ? String(t.stoppzeit_sek) : '')
    setEditInnenAussen(t.innen_aussen ?? '')
    setEditStimmung(t.stimmung ?? '')
    setEditBodytext(t.bodytext ?? '')
    setEditMotivId(t.motiv_id ?? '')
  }

  const save = async () => {
    if (!editName.trim()) return
    const payload = {
      kategorie: editKat,
      name: editName.trim(),
      oneliner_vorlage: editOneliner.trim(),
      stoppzeit_sek: editStoppzeit !== '' ? parseInt(editStoppzeit, 10) : null,
      innen_aussen: editInnenAussen || null,
      stimmung: editStimmung || null,
      bodytext: editBodytext || null,
      motiv_id: editMotivId || null,
    }
    if (editId) {
      const res = await fetch(`/api/stockshot-templates/${productionId}/${editId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify(payload),
      })
      if (res.ok) setTemplates(prev => prev.map(t => t.id === editId ? { ...t, ...payload, id: editId } : t))
    } else {
      const res = await fetch(`/api/stockshot-templates/${productionId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify(payload),
      })
      if (res.ok) { const created = await res.json(); setTemplates(prev => [...prev, created]) }
    }
    resetEdit()
  }

  const remove = async (id: string) => {
    await fetch(`/api/stockshot-templates/${productionId}/${id}`, { method: 'DELETE', credentials: 'include' })
    setTemplates(prev => prev.filter(t => t.id !== id))
  }

  const katLabel: Record<string, string> = { ortswechsel: 'Ortswechsel', zeit_vergeht: 'Zeit vergeht', stimmungswechsel: 'Stimmungswechsel' }
  const katColor: Record<string, string> = { ortswechsel: '#007AFF', zeit_vergeht: '#FF9500', stimmungswechsel: '#AF52DE' }
  const inStyle = { fontSize: 12, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)' } as const

  if (loading) return <div style={{ padding: 24, color: '#757575' }}>Laden…</div>

  return (
    <div style={{ padding: 24, maxWidth: 800 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Stockshot-Templates</h2>
      <p style={{ fontSize: 12, color: '#757575', marginBottom: 20, lineHeight: 1.6 }}>
        Templates für Stockshot-Szenen. Bei Auswahl im Editor werden alle Felder automatisch übernommen.
      </p>

      {['ortswechsel', 'zeit_vergeht', 'stimmungswechsel'].map(kat => {
        const items = templates.filter(t => t.kategorie === kat)
        return (
          <div key={kat} style={{ marginBottom: 24 }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: katColor[kat], marginBottom: 8 }}>{katLabel[kat]}</div>
            {items.length === 0 && <div style={{ fontSize: 12, color: '#999', fontStyle: 'italic', marginBottom: 8 }}>Keine Templates</div>}
            {items.map(t => {
              const motivName = motive.find(m => m.id === t.motiv_id)?.name
              return (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', marginBottom: 4, border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }}>
                  <span style={{ fontWeight: 600, minWidth: 120 }}>{t.name}</span>
                  <span style={{ color: '#757575', fontStyle: 'italic', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.oneliner_vorlage || '—'}</span>
                  {t.innen_aussen && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}>{t.innen_aussen}</span>}
                  {t.stimmung && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}>{t.stimmung}</span>}
                  {t.stoppzeit_sek != null && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{Math.floor(t.stoppzeit_sek/60)}:{String(t.stoppzeit_sek%60).padStart(2,'0')}</span>}
                  {motivName && <span style={{ fontSize: 10, color: 'var(--text-muted)', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{motivName}</span>}
                  <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#007AFF', fontSize: 11, flexShrink: 0 }} onClick={() => openEdit(t)}>Bearbeiten</button>
                  <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FF3B30', fontSize: 11, flexShrink: 0 }} onClick={() => remove(t.id)}>Löschen</button>
                </div>
              )
            })}
          </div>
        )
      })}

      <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 16, background: 'var(--bg-surface)' }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12 }}>{editId ? 'Template bearbeiten' : 'Neues Template'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div>
            <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Kategorie</label>
            <select value={editKat} onChange={e => setEditKat(e.target.value)} style={inStyle}>
              <option value="ortswechsel">Ortswechsel</option>
              <option value="zeit_vergeht">Zeit vergeht</option>
              <option value="stimmungswechsel">Stimmungswechsel</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Name *</label>
            <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="z.B. Ortswechsel Tag" style={{ ...inStyle, width: '100%' }} />
          </div>
          <div>
            <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Stoppzeit (Sek.)</label>
            <input type="number" min={0} value={editStoppzeit} onChange={e => setEditStoppzeit(e.target.value)} placeholder="z.B. 270" style={{ ...inStyle, width: '100%' }} />
          </div>
          <div>
            <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>I/A</label>
            <select value={editInnenAussen} onChange={e => setEditInnenAussen(e.target.value)} style={{ ...inStyle, width: '100%' }}>
              <option value="">—</option>
              <option value="I">I</option>
              <option value="A">A</option>
              <option value="I/A">I/A</option>
              <option value="I/AU">I/AU</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Stimmung (Tageszeit)</label>
            <select value={editStimmung} onChange={e => setEditStimmung(e.target.value)} style={{ ...inStyle, width: '100%' }}>
              <option value="">—</option>
              <option value="T">T (Tag)</option>
              <option value="N">N (Nacht)</option>
              <option value="DA">DA (Dämmerung Abend)</option>
              <option value="DZ">DZ (Dämmerung Morgen)</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Motiv</label>
            <select value={editMotivId} onChange={e => setEditMotivId(e.target.value)} style={{ ...inStyle, width: '100%' }}>
              <option value="">— kein Motiv —</option>
              {motive.filter(m => !m.parent_id).map(m => (
                <optgroup key={m.id} label={m.name}>
                  <option value={m.id}>{m.name}</option>
                  {motive.filter(c => c.parent_id === m.id).map(c => (
                    <option key={c.id} value={c.id}>  {c.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Oneliner-Vorlage (Platzhalter: {'{motiv}'}, {'{stimmung}'})</label>
          <input value={editOneliner} onChange={e => setEditOneliner(e.target.value)} placeholder="z.B. ES FOLGEN AUFNAHMEN EINES {motiv}." style={{ ...inStyle, width: '100%' }} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Szenen-Content (Bodytext)</label>
          <textarea value={editBodytext} onChange={e => setEditBodytext(e.target.value)} rows={3}
            placeholder="Wird als Szenen-Inhalt übernommen…"
            style={{ ...inStyle, width: '100%', resize: 'vertical', fontFamily: 'inherit' }} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={save} style={{ fontSize: 12, padding: '6px 16px', borderRadius: 5, background: '#007AFF', color: '#fff', border: 'none', cursor: 'pointer' }}>
            {editId ? 'Speichern' : 'Hinzufügen'}
          </button>
          {editId && (
            <button onClick={resetEdit} style={{ fontSize: 12, padding: '6px 10px', borderRadius: 5, background: 'transparent', color: '#757575', border: '1px solid var(--border)', cursor: 'pointer' }}>
              Abbrechen
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const THUMB_W = 128
const THUMB_SCALE = THUMB_W / 794

function VorlagenThumbnail({ content, ctx }: { content: any; ctx: PreviewContext }) {
  const html = renderPmToPreviewHtml(content, ctx)
  return (
    <div style={{ width: THUMB_W, height: Math.round(THUMB_W * 297 / 210), overflow: 'hidden', background: 'white', position: 'relative', borderRadius: 2, flexShrink: 0 }}>
      <div
        style={{ transformOrigin: 'top left', transform: `scale(${THUMB_SCALE})`, width: 794, pointerEvents: 'none', fontFamily: '"Courier New", monospace', fontSize: 12, lineHeight: 1.5, padding: '10px 14px' }}
        dangerouslySetInnerHTML={{ __html: html || '' }}
      />
    </div>
  )
}

function VorlagenTab({ productionId }: { productionId: string }) {
  const { selectedProduction } = useSelectedProduction()
  const produktionsLogoUrl = selectedProduction?.logo_filename
    ? `https://produktion.serienwerft.studio/uploads/logos/${selectedProduction.logo_filename}`
    : null
  const [previewMeta, setPreviewMeta] = useState<PreviewMeta>({ folgeNummer: null, airDate: null, datumsformat: 'de', firmenname: null, block: null, firmenAdresse: null, rechtsform: null, handelsregister: null, ustId: null, geschaeftsfuehrung: null, firmenEmail: null, firmenTelefon: null })
  useEffect(() => { loadPreviewMeta(productionId).then(setPreviewMeta).catch(() => {}) }, [productionId])
  const previewContext: PreviewContext = {
    produktion:    selectedProduction?.title ?? 'Rote Rosen',
    staffel:       selectedProduction?.staffelnummer != null ? String(selectedProduction.staffelnummer) : undefined,
    block:         previewMeta.block ?? undefined,
    folge:         previewMeta.folgeNummer ?? undefined,
    folgentitel:   undefined,
    fassung:       'Rohfassung',
    version:       'V1',
    werkstufe:     'Drehbuch',
    stand_datum:   formatDatum(new Date().toISOString().slice(0, 10), previewMeta.datumsformat),
    autor:         'Max Mustermann',
    regie:         undefined,
    firmenname:    previewMeta.firmenname ?? undefined,
    sender:              selectedProduction?.sender ?? undefined,
    buero_adresse:       selectedProduction?.buero_adresse ?? undefined,
    tel_produktion:      selectedProduction?.telefon ?? undefined,
    sendedatum:          formatSendedatum(previewMeta.airDate),
    produktionszeitraum: selectedProduction?.drehzeitraum ?? undefined,
    aktuelles_datum:     new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    aktuelles_uhrzeit:   new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', hour12: false }),
    aktuelles_jahr:      String(new Date().getFullYear()),
    folge_laenge_netto:  undefined,
    firmen_adresse:      previewMeta.firmenAdresse ?? undefined,
    rechtsform:          previewMeta.rechtsform ?? undefined,
    handelsregister:     previewMeta.handelsregister ?? undefined,
    ust_id:              previewMeta.ustId ?? undefined,
    geschaeftsfuehrung:  previewMeta.geschaeftsfuehrung ?? undefined,
    firmen_email:        previewMeta.firmenEmail ?? undefined,
    firmen_telefon:      previewMeta.firmenTelefon ?? undefined,
  }

  const [vorlagen, setVorlagen] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'list' | 'tiles'>('tiles')
  const [filterTyp, setFilterTyp] = useState('alle')
  const [settingAktiv, setSettingAktiv] = useState<string | null>(null)

  // Edit mode state
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editTyp, setEditTyp] = useState('titelseite')
  const [editEditorValue, setEditEditorValue] = useState<DokumentVorlagenEditorValue>(emptyVorlagenEditorValue())
  const [editZeilennummerierungUnterbinden, setEditZeilennummerierungUnterbinden] = useState(false)
  const [editorKey, setEditorKey] = useState(0)
  const [saving, setSaving] = useState(false)
  const [zoom, setZoom] = useState(0.9)
  const [activeEditor, setActiveEditor] = useState<any>(null)
  const [showPreview, setShowPreview] = useState(false)
  const sidebarFileRef = useRef<HTMLInputElement>(null)

  const handleSidebarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !activeEditor) return
    const reader = new FileReader()
    reader.onloadend = () => {
      ;(activeEditor as any).chain().focus().setResizableImage({ src: reader.result as string, width: 200 }).run()
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const load = () => {
    setLoading(true)
    api.getDokumentVorlagen(productionId).then(setVorlagen).finally(() => setLoading(false))
  }
  useEffect(load, [productionId])

  const openEdit = (v: any) => {
    setEditId(v.id)
    setEditName(v.name)
    setEditTyp(v.typ || 'custom')
    setEditEditorValue({
      body_content:            v.body_content ?? v.sektionen?.[0]?.content ?? emptyVorlagenEditorValue().body_content,
      kopfzeile_content:       v.kopfzeile_content ?? null,
      fusszeile_content:       v.fusszeile_content ?? null,
      kopfzeile_aktiv:         v.kopfzeile_aktiv ?? false,
      fusszeile_aktiv:         v.fusszeile_aktiv ?? false,
      erste_seite_kein_header: v.erste_seite_kein_header ?? true,
      seiten_layout:           v.seiten_layout ?? emptyVorlagenEditorValue().seiten_layout,
    })
    setEditZeilennummerierungUnterbinden(v.zeilennummerierung_unterbinden ?? false)
    setEditorKey(k => k + 1)
  }

  const openNew = (typ?: string) => {
    setEditId('__new__')
    setEditName(typ ? (VORLAGE_TYPES.find(t => t.id === typ)?.label ?? '') : '')
    setEditTyp(typ ?? 'titelseite')
    setEditEditorValue(typ === 'titelseite' ? titelseiteDefaultVorlage() : emptyVorlagenEditorValue())
    setEditorKey(k => k + 1)
  }

  const saveVorlage = async () => {
    if (!editName.trim()) return
    setSaving(true)
    try {
      const data = {
        name: editName,
        typ: editTyp,
        body_content:                    editEditorValue.body_content,
        kopfzeile_content:               editEditorValue.kopfzeile_content,
        fusszeile_content:               editEditorValue.fusszeile_content,
        kopfzeile_aktiv:                 editEditorValue.kopfzeile_aktiv,
        fusszeile_aktiv:                 editEditorValue.fusszeile_aktiv,
        erste_seite_kein_header:         editEditorValue.erste_seite_kein_header,
        seiten_layout:                   editEditorValue.seiten_layout,
        zeilennummerierung_unterbinden:  editZeilennummerierungUnterbinden,
      }
      if (editId === '__new__') {
        await api.createDokumentVorlageManual(productionId, data)
      } else {
        await api.updateDokumentVorlage(productionId, editId!, data)
      }
      setEditId(null)
      load()
    } catch (err: any) {
      alert('Fehler: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const deleteVorlage = async (id: string) => {
    if (!confirm('Vorlage wirklich löschen?')) return
    await api.deleteDokumentVorlage(productionId, id)
    load()
  }

  const duplicateVorlage = async (v: any) => {
    try {
      await api.createDokumentVorlageManual(productionId, {
        name:                           `Kopie von ${v.name}`,
        typ:                            v.typ,
        body_content:                   v.body_content,
        kopfzeile_content:              v.kopfzeile_content,
        fusszeile_content:              v.fusszeile_content,
        kopfzeile_aktiv:                v.kopfzeile_aktiv,
        fusszeile_aktiv:                v.fusszeile_aktiv,
        erste_seite_kein_header:        v.erste_seite_kein_header,
        seiten_layout:                  v.seiten_layout,
        zeilennummerierung_unterbinden: v.zeilennummerierung_unterbinden ?? false,
      })
      load()
    } catch (err: any) {
      alert('Fehler: ' + err.message)
    }
  }

  const setAktiv = async (id: string) => {
    setSettingAktiv(id)
    try {
      await api.setVorlageAktiv(productionId, id)
      load()
    } catch (err: any) {
      alert('Fehler: ' + err.message)
    } finally {
      setSettingAktiv(null)
    }
  }

  const inputStyle: React.CSSProperties = { fontSize: 13, padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' }
  const btnStyle:   React.CSSProperties = { fontSize: 11, padding: '4px 10px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg-subtle)', cursor: 'pointer', fontFamily: 'inherit' }

  const sidebarSep = (label: string) => (
    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, padding: '6px 14px 2px' }}>{label}</div>
  )

  // ── Edit mode ──────────────────────────────────────────────────────────────
  if (editId) {
    const pvFmt  = editEditorValue.seiten_layout?.format ?? 'a4'
    const pvW    = pvFmt === 'letter' ? 816 : 794
    const pvH    = pvFmt === 'letter' ? 1056 : 1123
    const pvMl   = (editEditorValue.seiten_layout?.margin_left   ?? 30) * (96 / 25.4)
    const pvMr   = (editEditorValue.seiten_layout?.margin_right  ?? 25) * (96 / 25.4)
    const pvMt   = (editEditorValue.seiten_layout?.margin_top    ?? 25) * (96 / 25.4)
    const pvMb   = (editEditorValue.seiten_layout?.margin_bottom ?? 25) * (96 / 25.4)
    const pvHtml = renderPmToPreviewHtml(editEditorValue.body_content, previewContext)

    return (
      <>
      <div style={{ display: 'flex', alignItems: 'flex-start', margin: '-24px -16px', minHeight: '85vh' }}>
        {/* ── Left sidebar ── */}
        <div style={{ width: 354, flexShrink: 0, position: 'sticky', top: 0, maxHeight: '100vh', overflowY: 'auto', background: 'var(--bg-subtle)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)' }}>
            <button onClick={() => setShowPreview(true)} style={{ width: '100%', padding: '7px 12px', borderRadius: 6, border: '1px solid #007AFF55', background: '#007AFF0A', color: '#007AFF', fontWeight: 500, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              Vorschau
            </button>
          </div>

          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Name</label>
              <input style={inputStyle} value={editName} onChange={e => setEditName(e.target.value)} placeholder="z.B. Titelseite Rote Rosen" />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Kategorie</label>
              <select style={{ ...inputStyle, cursor: 'pointer' }} value={editTyp} onChange={e => setEditTyp(e.target.value)}>
                {VORLAGE_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Seitenformat</label>
              <div style={{ display: 'flex', gap: 12 }}>
                {(['a4', 'letter'] as const).map(f => (
                  <label key={f} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
                    <input type="radio" name="pf" checked={(editEditorValue.seiten_layout?.format ?? 'a4') === f}
                      onChange={() => setEditEditorValue(v => ({ ...v, seiten_layout: { ...(v.seiten_layout ?? { format: 'a4', margin_top: 25, margin_bottom: 25, margin_left: 30, margin_right: 25 }), format: f } }))} />
                    {f === 'a4' ? 'A4' : 'Letter'}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Seitenränder (mm)</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 4 }}>
                {([
                  ['margin_top',    'Oben',   25],
                  ['margin_bottom', 'Unten',  25],
                  ['margin_left',   'Links',  30],
                  ['margin_right',  'Rechts', 25],
                ] as [string, string, number][]).map(([field, label, def]) => (
                  <label key={field} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)', textAlign: 'center' }}>{label}</span>
                    <input
                      type="number" min={5} max={80} step={1}
                      value={(editEditorValue.seiten_layout as any)?.[field] ?? def}
                      onChange={e => setEditEditorValue(v => ({
                        ...v,
                        seiten_layout: {
                          format: 'a4', margin_top: 25, margin_bottom: 25, margin_left: 30, margin_right: 25,
                          ...(v.seiten_layout ?? {}),
                          [field]: Number(e.target.value),
                        },
                      }))}
                      style={{ fontSize: 11, padding: '3px 4px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-subtle)', color: 'var(--text-primary)', fontFamily: 'inherit', width: '100%', textAlign: 'center' }}
                    />
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12 }}>
              <input
                type="checkbox"
                checked={editZeilennummerierungUnterbinden}
                onChange={e => setEditZeilennummerierungUnterbinden(e.target.checked)}
              />
              <span>Zeilennummerierung unterdrücken</span>
            </label>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.4, marginBottom: 0 }}>
              Deaktiviert die Zeilennummern für diesen Dokumenttyp (z.B. Titelblatt).
            </p>
          </div>

          <div style={{ borderBottom: '1px solid var(--border)' }}>
            <ToolbarContent editor={activeEditor} zone="alle" produktionsLogoUrl={produktionsLogoUrl} fileInputRef={sidebarFileRef} isBody wrap />
          </div>

          <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)' }}>
            {sidebarSep('Zoom')}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 0 2px' }}>
              <button onMouseDown={() => setZoom(z => Math.max(0.4, Math.round((z - 0.05) * 100) / 100))} style={{ width: 24, height: 24, border: '1px solid var(--border)', borderRadius: 4, background: 'transparent', cursor: 'pointer', fontSize: 14 }}>−</button>
              <span style={{ fontSize: 12, minWidth: 38, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{Math.round(zoom * 100)}%</span>
              <button onMouseDown={() => setZoom(z => Math.min(1.5, Math.round((z + 0.05) * 100) / 100))} style={{ width: 24, height: 24, border: '1px solid var(--border)', borderRadius: 4, background: 'transparent', cursor: 'pointer', fontSize: 14 }}>+</button>
              <button onMouseDown={() => setZoom(1)} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 3, border: '1px solid var(--border)', background: Math.round(zoom * 100) === 100 ? 'var(--text-primary)' : 'transparent', color: Math.round(zoom * 100) === 100 ? 'var(--text-inverse)' : 'var(--text-muted)', cursor: 'pointer', fontFamily: 'inherit' }}>1:1</button>
            </div>
          </div>

          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button onClick={saveVorlage} disabled={saving || !editName.trim()}
              style={{ padding: '8px 12px', borderRadius: 6, border: 'none', background: editName.trim() ? 'var(--text-primary)' : 'var(--bg-subtle)', color: editName.trim() ? 'var(--text-inverse)' : 'var(--text-muted)', fontWeight: 600, fontSize: 13, cursor: editName.trim() ? 'pointer' : 'default', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Speichere...' : 'Speichern'}
            </button>
            <button onClick={() => setEditId(null)} style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              Abbrechen
            </button>
          </div>
        </div>

        {/* ── Right: A4 area ── */}
        <div style={{ flex: 1, background: '#bebebe', padding: '40px 48px', minHeight: '100vh', overflowX: 'auto' }}>
          <input ref={sidebarFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleSidebarFile} />
          <DokumentVorlagenEditor
            key={`edit-${editId}-${editorKey}`}
            value={editEditorValue}
            onChange={setEditEditorValue}
            noHeaderFooter
            sidebarMode
            zoom={zoom}
            onActiveEditorChange={ed => setActiveEditor(ed)}
            produktionsLogoUrl={produktionsLogoUrl}
            previewContext={previewContext}
          />
        </div>
      </div>

      {/* Preview modal */}
      {showPreview && (
        <div onClick={() => setShowPreview(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '40px 24px' }}>
          <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#fff', fontSize: 13, width: pvW }}>
              <span style={{ flex: 1, fontWeight: 600 }}>Vorschau — Chips durch Beispieldaten ersetzt</span>
              <button onClick={() => setShowPreview(false)} style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 6, color: '#fff', fontSize: 12, padding: '4px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>Schließen</button>
            </div>
            <div style={{ width: pvW, minHeight: pvH, background: 'white', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', borderRadius: 2, color: '#000', paddingTop: pvMt, paddingBottom: pvMb, paddingLeft: pvMl, paddingRight: pvMr, boxSizing: 'border-box', position: 'relative', fontFamily: '"Courier New", monospace', fontSize: 12, lineHeight: 1.5 }}>
              <div style={{ position: 'absolute', top: 8, right: 14, fontSize: 9, color: '#ccc', textTransform: 'uppercase', letterSpacing: 0.5 }}>{pvFmt === 'a4' ? 'A4 — 210×297 mm' : 'US Letter — 8.5×11 in'}</div>
              <div dangerouslySetInnerHTML={{ __html: pvHtml || '<p style="color:#aaa;font-style:italic">Kein Inhalt.</p>' }} style={{ minHeight: 200 }} />
            </div>
            <div style={{ width: pvW, background: 'rgba(255,255,255,0.1)', borderRadius: 6, padding: '8px 14px', display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
              {Object.entries(previewContext).filter(([, v]) => v).map(([k, v]) => (
                <span key={k} style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)' }}>
                  <span style={{ color: 'rgba(255,255,255,0.4)' }}>{`{{${k}}}`} </span>{String(v)}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
      </>
    )
  }

  // ── List / Tiles mode ──────────────────────────────────────────────────────
  const filtered = filterTyp === 'alle' ? vorlagen : vorlagen.filter(v => v.typ === filterTyp)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0, flex: 1 }}>Dokument-Vorlagen</h3>
        {/* View toggle */}
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
          {(['tiles', 'list'] as const).map(m => (
            <button key={m} onClick={() => setViewMode(m)}
              style={{ padding: '4px 10px', border: 'none', borderRadius: 0, background: viewMode === m ? 'var(--text-primary)' : 'transparent', color: viewMode === m ? 'var(--text-inverse)' : 'var(--text-secondary)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
              {m === 'tiles' ? '⊞ Kacheln' : '≡ Liste'}
            </button>
          ))}
        </div>
        <button onClick={() => openNew()} style={{ ...btnStyle, fontWeight: 500, color: '#007AFF', borderColor: '#007AFF55', padding: '6px 14px', fontSize: 12 }}>
          + Neue Vorlage
        </button>
      </div>

      {/* Typ filter tabs */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[{ id: 'alle', label: 'Alle' }, ...VORLAGE_TYPES].map(t => (
          <button key={t.id} onClick={() => setFilterTyp(t.id)}
            style={{ padding: '4px 12px', borderRadius: 16, border: '1px solid var(--border)', background: filterTyp === t.id ? 'var(--text-primary)' : 'transparent', color: filterTyp === t.id ? 'var(--text-inverse)' : 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: filterTyp === t.id ? 600 : 400 }}>
            {t.label}
            {t.id !== 'alle' && (
              <span style={{ marginLeft: 5, fontSize: 10, opacity: 0.7 }}>
                {vorlagen.filter(v => v.typ === t.id).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Lade...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 13 }}>
          Keine Vorlagen vorhanden.{' '}
          <button onClick={() => openNew(filterTyp !== 'alle' ? filterTyp : undefined)} style={{ color: '#007AFF', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, textDecoration: 'underline', fontFamily: 'inherit' }}>
            Jetzt erstellen
          </button>
        </div>
      ) : viewMode === 'tiles' ? (
        // ── Tile / Card grid ────────────────────────────────────────────────
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
          {filtered.map(v => {
            const typLabel = VORLAGE_TYPES.find(t => t.id === v.typ)?.label ?? v.typ ?? 'custom'
            const isAktiv  = !!v.is_aktiv
            return (
              <div key={v.id} style={{ border: `2px solid ${isAktiv ? '#007AFF' : 'var(--border)'}`, borderRadius: 10, background: 'var(--bg-surface)', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: isAktiv ? '0 0 0 1px #007AFF33' : undefined }}>
                {/* Thumbnail */}
                <div style={{ background: '#d8d8d8', display: 'flex', justifyContent: 'center', padding: '12px 12px 8px', position: 'relative' }}>
                  <div style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.2)', borderRadius: 2, overflow: 'hidden' }}>
                    <VorlagenThumbnail content={v.body_content} ctx={previewContext} />
                  </div>
                  {isAktiv && (
                    <div style={{ position: 'absolute', top: 8, right: 8, background: '#007AFF', color: '#fff', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Standard</div>
                  )}
                </div>
                {/* Info + actions */}
                <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3, wordBreak: 'break-word' }}>{v.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{typLabel}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 'auto', paddingTop: 4 }}>
                    <button onClick={() => openEdit(v)} style={btnStyle}>Bearbeiten</button>
                    <button onClick={() => duplicateVorlage(v)} style={btnStyle} title="Duplizieren">Kopie</button>
                    {!isAktiv && (
                      <button
                        onClick={() => setAktiv(v.id)}
                        disabled={settingAktiv === v.id}
                        style={{ ...btnStyle, color: '#007AFF', borderColor: '#007AFF55' }}
                      >{settingAktiv === v.id ? '…' : 'Als Standard'}</button>
                    )}
                    <button onClick={() => deleteVorlage(v.id)} style={{ ...btnStyle, color: 'var(--sw-danger, #FF3B30)', borderColor: '#FF3B3033', marginLeft: 'auto' }}>✕</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        // ── List view ───────────────────────────────────────────────────────
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map(v => {
            const typLabel = VORLAGE_TYPES.find(t => t.id === v.typ)?.label ?? v.typ ?? 'custom'
            const isAktiv  = !!v.is_aktiv
            return (
              <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg-subtle)', borderRadius: 8, border: `1px solid ${isAktiv ? '#007AFF55' : 'var(--border)'}` }}>
                {/* Small thumbnail */}
                <div style={{ background: '#d8d8d8', borderRadius: 3, padding: '4px', flexShrink: 0, boxShadow: '0 1px 4px rgba(0,0,0,0.15)' }}>
                  <VorlagenThumbnail content={v.body_content} ctx={previewContext} />
                </div>
                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{v.name}</span>
                    {isAktiv && <span style={{ fontSize: 9, fontWeight: 700, background: '#007AFF', color: '#fff', padding: '1px 5px', borderRadius: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Standard</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{typLabel}</div>
                </div>
                {/* Actions */}
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => openEdit(v)} style={btnStyle}>Bearbeiten</button>
                  <button onClick={() => duplicateVorlage(v)} style={btnStyle} title="Duplizieren">Kopie erstellen</button>
                  {!isAktiv && (
                    <button onClick={() => setAktiv(v.id)} disabled={settingAktiv === v.id}
                      style={{ ...btnStyle, color: '#007AFF', borderColor: '#007AFF55' }}>
                      {settingAktiv === v.id ? '…' : 'Als Standard'}
                    </button>
                  )}
                  <button onClick={() => deleteVorlage(v.id)} style={{ ...btnStyle, color: 'var(--sw-danger, #FF3B30)', borderColor: '#FF3B3033' }}>✕ Löschen</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Help text */}
      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
        Pro Kategorie wird die als <strong>Standard</strong> markierte Vorlage beim Export verwendet. Mehrere Vorlagen pro Kategorie möglich.
      </p>
    </div>
  )
}


// ── Kopf-/Fußzeilen Tab ──────────────────────────────────────────────────────

const KF_TYPEN = [
  { id: 'drehbuch',  label: 'Drehbuch',  color: '#007AFF' },
  { id: 'storyline', label: 'Storyline', color: '#FF9500' },
  { id: 'notiz',     label: 'Notiz',     color: '#757575' },
] as const

function formatDatum(iso: string, fmt: 'de' | 'en'): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return fmt === 'en' ? `${m}/${d}/${y}` : `${d}.${m}.${y}`
}

interface PreviewMeta {
  folgeNummer:      number | null
  airDate:          string | null
  datumsformat:     'de' | 'en'
  firmenname:       string | null
  block:            string | null
  firmenAdresse:    string | null
  rechtsform:       string | null
  handelsregister:  string | null
  ustId:            string | null
  geschaeftsfuehrung: string | null
  firmenEmail:      string | null
  firmenTelefon:    string | null
}

function formatSendedatum(dateStr: string | null | undefined): string | undefined {
  if (!dateStr) return undefined
  try {
    const d = new Date(String(dateStr).slice(0, 10) + 'T12:00:00Z')
    const day  = d.toLocaleDateString('de-DE', { weekday: 'short', timeZone: 'UTC' })
    const date = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })
    return `${day} ${date}`
  } catch { return undefined }
}

async function loadPreviewMeta(productionId: string): Promise<PreviewMeta> {
  const [folgenRes, settingsRes, companyRes] = await Promise.allSettled([
    fetch(`/api/v2/folgen?produktion_id=${encodeURIComponent(productionId)}`, { credentials: 'include' }),
    fetch(`/api/dk-settings/${productionId}/app-settings`, { credentials: 'include' }),
    fetch('https://auth.serienwerft.studio/api/public/company-info'),
  ])
  let folgeNummer: number | null = null
  let airDate: string | null = null
  let block: string | null = null
  if (folgenRes.status === 'fulfilled' && folgenRes.value.ok) {
    const list: any[] = await folgenRes.value.json()
    if (list.length > 0) {
      const sorted = [...list].sort((a, b) => (b.folge_nummer ?? 0) - (a.folge_nummer ?? 0))
      folgeNummer = sorted[0].folge_nummer ?? null
      if (folgeNummer != null) {
        // Fetch air_date and block in parallel
        await Promise.allSettled([
          fetch(`/api/v2/folgen/air-date?produktion_id=${encodeURIComponent(productionId)}&folge_nr=${folgeNummer}`, { credentials: 'include' })
            .then(r => r.ok ? r.json() : null).then(d => { if (d?.air_date) airDate = d.air_date }).catch(() => {}),
          fetch(`/api/v2/folgen/block?produktion_id=${encodeURIComponent(productionId)}&folge_nr=${folgeNummer}`, { credentials: 'include' })
            .then(r => r.ok ? r.json() : null).then(d => { if (d?.block) block = d.block }).catch(() => {}),
        ])
      }
    }
  }
  let datumsformat: 'de' | 'en' = 'de'
  if (settingsRes.status === 'fulfilled' && settingsRes.value.ok) {
    const s: any = await settingsRes.value.json()
    if (s?.datumsformat === 'en') datumsformat = 'en'
  }
  let firmenname: string | null = null
  let firmenAdresse: string | null = null
  let rechtsform: string | null = null
  let handelsregister: string | null = null
  let ustId: string | null = null
  let geschaeftsfuehrung: string | null = null
  let firmenEmail: string | null = null
  let firmenTelefon: string | null = null
  if (companyRes.status === 'fulfilled' && companyRes.value.ok) {
    const c: any = await companyRes.value.json()
    firmenname = c?.company_name ?? null
    const addr = c?.company_address
    if (addr) firmenAdresse = [addr.street, `${addr.zip ?? ''} ${addr.city ?? ''}`.trim()].filter(Boolean).join(', ')
    const lfMap: Record<string, string> = { gmbh: 'GmbH', ag: 'AG', kg: 'KG', ohg: 'OHG', gbr: 'GbR', ug: 'UG (haftungsbeschränkt)', se: 'SE', ev: 'e.V.' }
    rechtsform = c?.company_legal_form ? (lfMap[c.company_legal_form.toLowerCase()] ?? c.company_legal_form) : null
    if (c?.company_register_court && c?.company_register_number)
      handelsregister = `${c.company_register_court} ${c.company_register_number}`
    ustId = c?.company_vat_id ?? null
    try {
      const mgmt = typeof c?.company_management === 'string' ? JSON.parse(c.company_management) : c?.company_management
      if (Array.isArray(mgmt)) geschaeftsfuehrung = mgmt.join(', ')
    } catch {}
    firmenEmail   = c?.company_email ?? null
    firmenTelefon = c?.company_phone ?? null
  }
  return { folgeNummer, airDate, datumsformat, firmenname, block, firmenAdresse, rechtsform, handelsregister, ustId, geschaeftsfuehrung, firmenEmail, firmenTelefon }
}

function KopfFusszeileTab({ productionId }: { productionId: string }) {
  const { selectedProduction } = useSelectedProduction()
  const produktionsLogoUrl = selectedProduction?.logo_filename
    ? `https://produktion.serienwerft.studio/uploads/logos/${selectedProduction.logo_filename}`
    : null
  const [previewMeta, setPreviewMeta] = useState<PreviewMeta>({ folgeNummer: null, airDate: null, datumsformat: 'de', firmenname: null, block: null, firmenAdresse: null, rechtsform: null, handelsregister: null, ustId: null, geschaeftsfuehrung: null, firmenEmail: null, firmenTelefon: null })
  useEffect(() => { loadPreviewMeta(productionId).then(setPreviewMeta).catch(() => {}) }, [productionId])
  const previewContext: PreviewContext = {
    produktion:    selectedProduction?.title ?? 'Rote Rosen',
    staffel:       selectedProduction?.staffelnummer != null ? String(selectedProduction.staffelnummer) : undefined,
    block:         previewMeta.block ?? undefined,
    folge:         previewMeta.folgeNummer ?? undefined,
    folgentitel:   undefined,
    fassung:       'Rohfassung',
    version:       'V1',
    werkstufe:     'Drehbuch',
    stand_datum:   formatDatum(new Date().toISOString().slice(0, 10), previewMeta.datumsformat),
    autor:         'Max Mustermann',
    regie:         undefined,
    firmenname:    previewMeta.firmenname ?? undefined,
    sender:              selectedProduction?.sender ?? undefined,
    buero_adresse:       selectedProduction?.buero_adresse ?? undefined,
    tel_produktion:      selectedProduction?.telefon ?? undefined,
    sendedatum:          formatSendedatum(previewMeta.airDate),
    produktionszeitraum: selectedProduction?.drehzeitraum ?? undefined,
    aktuelles_datum:     new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    aktuelles_uhrzeit:   new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', hour12: false }),
    aktuelles_jahr:      String(new Date().getFullYear()),
    folge_laenge_netto:  undefined,
    firmen_adresse:      previewMeta.firmenAdresse ?? undefined,
    rechtsform:          previewMeta.rechtsform ?? undefined,
    handelsregister:     previewMeta.handelsregister ?? undefined,
    ust_id:              previewMeta.ustId ?? undefined,
    geschaeftsfuehrung:  previewMeta.geschaeftsfuehrung ?? undefined,
    firmen_email:        previewMeta.firmenEmail ?? undefined,
    firmen_telefon:      previewMeta.firmenTelefon ?? undefined,
  }
  // activeTyp = der im Editor angezeigte Typ (Quelle); syncTypen = alle die Änderungen empfangen
  const [activeTyp, setActiveTyp] = useState<string>('drehbuch')
  const [syncTypen, setSyncTypen] = useState<Set<string>>(new Set(['drehbuch']))
  const [configs, setConfigs] = useState<Record<string, KopfZeilenEditorValue | null>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setLoading(true)
    api.getKopfFusszeilen(productionId)
      .then(rows => {
        const map: Record<string, KopfZeilenEditorValue> = {}
        for (const row of rows) {
          map[row.werkstufe_typ] = {
            kopfzeile_content:       row.kopfzeile_content,
            fusszeile_content:       row.fusszeile_content,
            kopfzeile_aktiv:         row.kopfzeile_aktiv ?? false,
            fusszeile_aktiv:         row.fusszeile_aktiv ?? false,
            erste_seite_kein_header: row.erste_seite_kein_header ?? true,
            seiten_layout:           row.seiten_layout ?? emptyKopfZeilenEditorValue().seiten_layout,
          }
        }
        setConfigs(map)
      })
      .finally(() => setLoading(false))
  }, [productionId])

  const getCurrentValue = (): KopfZeilenEditorValue =>
    configs[activeTyp] ?? emptyKopfZeilenEditorValue()

  // Änderung gilt für alle in syncTypen
  const handleChange = (v: KopfZeilenEditorValue) => {
    setConfigs(prev => {
      const next = { ...prev }
      syncTypen.forEach(t => { next[t] = v })
      return next
    })
    setDirty(prev => {
      const next = { ...prev }
      syncTypen.forEach(t => { next[t] = true })
      return next
    })
  }

  // Speichern aller dirty syncTypen
  const save = async () => {
    setSaving(true)
    try {
      const v = getCurrentValue()
      const targets = [...syncTypen].filter(t => dirty[t])
      await Promise.all(targets.map(typ =>
        api.saveKopfFusszeilenTyp(productionId, typ, {
          kopfzeile_content:       v.kopfzeile_content,
          fusszeile_content:       v.fusszeile_content,
          kopfzeile_aktiv:         v.kopfzeile_aktiv,
          fusszeile_aktiv:         v.fusszeile_aktiv,
          erste_seite_kein_header: v.erste_seite_kein_header,
          erste_seite_kein_footer: false,
          seiten_layout:           v.seiten_layout,
        })
      ))
      setDirty(prev => {
        const next = { ...prev }
        targets.forEach(t => { next[t] = false })
        return next
      })
    } catch (err: any) {
      alert('Fehler: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // Klick auf Typ-Button: Strg/Meta = zur Auswahl hinzufügen/entfernen, sonst Einzelauswahl
  const handleTypClick = (id: string, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      setSyncTypen(prev => {
        const next = new Set(prev)
        if (next.has(id) && next.size > 1) {
          next.delete(id)
          if (activeTyp === id) setActiveTyp([...next][0])
        } else {
          next.add(id)
          setActiveTyp(id)
        }
        return next
      })
    } else {
      setActiveTyp(id)
      setSyncTypen(new Set([id]))
    }
  }

  if (loading) return <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Lade...</div>

  const currentConfig = getCurrentValue()
  const isMultiSync = syncTypen.size > 1
  const isDirty = [...syncTypen].some(t => dirty[t])
  const activeColor = KF_TYPEN.find(t => t.id === activeTyp)?.color ?? '#007AFF'
  const syncLabels = KF_TYPEN.filter(t => syncTypen.has(t.id)).map(t => t.label).join(', ')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, height: '100%' }}>
      {/* Erklärleiste Mehrfachauswahl */}
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
        Mehrfachauswahl möglich — Strg+Klick zum Hinzufügen/Entfernen
      </div>

      {/* Sub-tab bar + save button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {KF_TYPEN.map(t => {
            const isActive   = activeTyp === t.id
            const isInSync   = syncTypen.has(t.id)
            return (
              <button
                key={t.id}
                onClick={e => handleTypClick(t.id, e)}
                title={`Klick = nur ${t.label} | Strg+Klick = zur Auswahl hinzufügen/entfernen`}
                style={{
                  fontSize: 13, padding: '6px 16px', borderRadius: 7, cursor: 'pointer',
                  fontFamily: 'inherit', fontWeight: isActive ? 600 : 400,
                  border: `${isActive ? 2 : 1}px solid ${isInSync ? t.color : 'var(--border)'}`,
                  background: isActive ? t.color + '22' : isInSync ? t.color + '0d' : 'transparent',
                  color: isInSync ? t.color : 'var(--text-secondary)',
                  position: 'relative',
                }}
              >
                {t.label}
                {isInSync && !isActive && (
                  <span style={{ marginLeft: 4, fontSize: 9, opacity: 0.7 }}>✓</span>
                )}
                {dirty[t.id] && <span style={{ marginLeft: 4, color: t.color, fontSize: 10 }}>●</span>}
              </button>
            )
          })}
        </div>
        {isMultiSync && (
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
            Änderungen gelten für: {syncLabels}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button
          onClick={save}
          disabled={saving || !isDirty}
          style={{
            fontSize: 13, padding: '6px 18px', borderRadius: 7,
            border: 'none', cursor: isDirty ? 'pointer' : 'default',
            background: isDirty ? activeColor : 'var(--bg-subtle)',
            color: isDirty ? '#fff' : 'var(--text-muted)',
            fontWeight: 600, fontFamily: 'inherit', transition: 'background 0.15s',
          }}
        >
          {saving ? 'Speichere...' : isMultiSync ? `Speichern (${syncTypen.size})` : 'Speichern'}
        </button>
      </div>

      {/* Hint */}
      <div style={{
        fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6,
        marginBottom: 16, padding: '8px 12px',
        background: 'var(--bg-subtle)', borderRadius: 7,
        border: `1px solid ${activeColor}33`,
      }}>
        <strong style={{ color: activeColor }}>{syncLabels}</strong>
        {' '}— Globale Kopf-/Fußzeile für die ausgewählten Fassungstypen.
        Gilt auf jeder Seite des Exports (außer ggf. erste Seite).
      </div>

      {/* Editor — KopfZeilenEditor mit SK-UX + Lineal */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <KopfZeilenEditor
          key={activeTyp}
          value={currentConfig}
          onChange={handleChange}
          previewContext={previewContext}
        />
      </div>
    </div>
  )
}

function NoProduction() {
  return (
    <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
      Keine Produktion ausgewählt. Wähle eine Produktion im Header aus.
    </div>
  )
}
