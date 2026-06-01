import { useState, useRef, useEffect, useCallback } from 'react'
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
import type { KopfZeilenEditorValue, SeitenLayout } from '../sw-ui'
import AutorenplanTab from '../components/AutorenplanTab'
import KopierenModal from '../components/KopierenModal'
import WasserzeichenTab from '../components/WasserzeichenTab'

// ── Constants ────────────────────────────────────────────────────────────────────

const DK_TABS = [
  { id: 'allgemein',              label: 'Allgemein' },
  { id: 'terminologie',           label: 'Terminologie' },
  { id: 'figuren',                label: 'Figuren' },
  { id: 'produktion',            label: 'Produktion' },
  { id: 'export-vorlagen',       label: 'Export-Vorlagen',        badge: 'bald' },
  { id: 'lock-regeln',           label: 'Lock-Regeln',            badge: 'bald' },
  { id: 'dokument-typen',        label: 'Dokumenten-Formatierung' },
  { id: 'gruppen-register',      label: 'Gruppen-Register' },

  { id: 'statistik-panel',         label: 'Statistik-Panel' },
  { id: 'daily-regeln',            label: 'Daily-Regeln' },
  { id: 'autorenplan',            label: 'Autorenplan',            badge: 'beta/bald' },
  { id: 'rollen-freigabe',        label: 'Rollen-Freigabe' },
  { id: 'drehbuch-checks',        label: 'Drehbuch-Checks' },
  { id: 'inhaltskennzeichnung',   label: 'Inhaltskennzeichnung' },
  { id: 'synopsen-ki',            label: 'KI-Synopsen' },
  { id: 'verlauf-sicherung',      label: 'Verlauf & Sicherung' },
  { id: 'export-log',             label: 'Export-Log & Wasserzeichen' },
]

const FORMAT_TEMPLATE_TABS = ['dokument-typen', 'kopf-fusszeilen', 'vorlagen', 'stockshot-templates', 'freie-dok-labels', 'sonstige-dokumente']
const FORMAT_SUB_NAV = [
  { id: 'dokument-typen',       label: 'Drehbuch-Formatierung' },
  { id: 'kopf-fusszeilen',      label: 'Kopf-/Fußzeile' },
  { id: 'vorlagen',             label: 'Dokumenten-Vorlagen' },
  { id: 'stockshot-templates',  label: 'Stockshot-Templates' },
  { id: 'freie-dok-labels',     label: 'Freie Dokumente' },
  { id: 'sonstige-dokumente',   label: 'Sonstige Dokumente' },
]

const KUERZEL_FIELDS: { key: string; label: string }[] = [
  { key: 'int', label: 'Innen (INT)' },
  { key: 'ext', label: 'Außen (EXT)' },
]
const DEFAULT_KUERZEL: Record<string, string> = { int: 'I', ext: 'E' }

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

type Stimmung = { id: number | null; name: string; kuerzel: string; position: number }

function AllgemeinTab({ productionId }: { productionId: string }) {
  const { t } = useTerminologie()
  const [datumsformat, setDatumsformat] = useState<'de' | 'en'>('de')
  const [datumsformatSaving, setDatumsformatSaving] = useState(false)
  const [kuerzel, setKuerzel] = useState<Record<string, string>>(DEFAULT_KUERZEL)
  const [roles, setRoles] = useState<string[] | null>(null)
  const [kuerzelSaving, setKuerzelSaving] = useState(false)

  // Stimmungen
  const [stimmungen, setStimmungen] = useState<Stimmung[]>([])
  const [stimmungenLoading, setStimmungenLoading] = useState(true)
  const [newStimmungName, setNewStimmungName] = useState('')
  const [newStimmungKuerzel, setNewStimmungKuerzel] = useState('')
  const [stimmungAddError, setStimmungAddError] = useState('')
  const dragIndex = useRef<number | null>(null)
  const dragOverIndex = useRef<number | null>(null)
  const [envColors, setEnvColors] = useState<Record<EnvKey, EnvColor>>({ ...DEFAULT_ENV_COLORS })
  const [envColorsDark, setEnvColorsDark] = useState<Record<EnvKey, EnvColor>>({ ...DEFAULT_ENV_COLORS_DARK })
  const [envColorsSaving, setEnvColorsSaving] = useState(false)
  const [envColorsCustom, setEnvColorsCustom] = useState(false)
  const [lnFont, setLnFont] = useState("'Courier Prime', 'Courier New', monospace")
  const [lnSize, setLnSize] = useState(10)
  const [lnColor, setLnColor] = useState('#999999')
  const [lnSaving, setLnSaving] = useState(false)
  const [replikColor, setReplikColor] = useState('#000000')
  const [replikMode, setReplikMode] = useState<'continuous' | 'per_scene'>('continuous')
  const [replikSaving, setReplikSaving] = useState(false)

  useEffect(() => {
    api.getStimmungen(productionId)
      .then(data => setStimmungen(data))
      .catch(() => {})
      .finally(() => setStimmungenLoading(false))
  }, [productionId])

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
        if (data?.replik_settings) {
          try {
            const s = JSON.parse(data.replik_settings)
            if (s.color) setReplikColor(s.color)
            if (s.mode === 'continuous' || s.mode === 'per_scene') setReplikMode(s.mode)
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

  const saveReplikSettings = async () => {
    setReplikSaving(true)
    await api.updateDkAppSetting(productionId, 'replik_settings', JSON.stringify({
      color: replikColor, mode: replikMode,
    })).catch(() => {})
    window.dispatchEvent(new CustomEvent('app-settings-changed', { detail: { productionId } }))
    setReplikSaving(false)
  }

  const addStimmung = async () => {
    if (!newStimmungName.trim() || !newStimmungKuerzel.trim()) {
      setStimmungAddError('Name und Kürzel erforderlich')
      return
    }
    setStimmungAddError('')
    try {
      const created = await api.createStimmung(productionId, newStimmungName.trim(), newStimmungKuerzel.trim())
      setStimmungen(prev => [created, ...prev.map(s => ({ ...s, position: s.position + 1 }))])
      setNewStimmungName('')
      setNewStimmungKuerzel('')
      window.dispatchEvent(new CustomEvent('stimmungen-changed', { detail: { productionId } }))
    } catch {
      setStimmungAddError('Fehler beim Anlegen — Name evtl. bereits vorhanden')
    }
  }

  const deleteStimmung = async (id: number) => {
    if (stimmungen.length <= 1) return
    try {
      const updated = await api.deleteStimmung(productionId, id)
      setStimmungen(Array.isArray(updated) ? updated : stimmungen.filter(s => s.id !== id))
      window.dispatchEvent(new CustomEvent('stimmungen-changed', { detail: { productionId } }))
    } catch {}
  }

  const updateStimmungField = async (id: number, name: string, kuerzel: string) => {
    try {
      const updated = await api.updateStimmung(productionId, id, name, kuerzel)
      setStimmungen(prev => prev.map(s => s.id === id ? { ...s, ...updated } : s))
      window.dispatchEvent(new CustomEvent('stimmungen-changed', { detail: { productionId } }))
    } catch {}
  }

  const onDragStart = (i: number) => { dragIndex.current = i }
  const onDragOver = (e: React.DragEvent, i: number) => { e.preventDefault(); dragOverIndex.current = i }
  const onDrop = async () => {
    const from = dragIndex.current
    const to = dragOverIndex.current
    if (from === null || to === null || from === to) return
    const reordered = [...stimmungen]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(to, 0, moved)
    const withPos = reordered.map((s, i) => ({ ...s, position: i }))
    setStimmungen(withPos)
    dragIndex.current = null
    dragOverIndex.current = null
    const entries = withPos.filter(s => s.id !== null).map(s => ({ id: s.id as number, position: s.position }))
    if (entries.length > 0) {
      try {
        await api.reorderStimmungen(productionId, entries)
        window.dispatchEvent(new CustomEvent('stimmungen-changed', { detail: { productionId } }))
      } catch {}
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

      {/* ── Stimmungen (Tageszeit) ── */}
      <section>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>Stimmungen (Tageszeit)</h3>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.6 }}>
          Definiert die möglichen Tageszeiten und ihre Reihenfolge im Verlauf des Tages.
          Die <strong>letzte Stimmung</strong> in der Liste markiert das Ende des Tages —
          danach beginnt ein neuer Spieltag.
        </p>
        {stimmungenLoading ? (
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Lädt...</span>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
              {stimmungen.map((s, i) => {
                const isLast = i === stimmungen.length - 1
                const isFirst = i === 0
                return (
                  <div
                    key={s.id ?? s.name}
                    draggable
                    onDragStart={() => onDragStart(i)}
                    onDragOver={e => onDragOver(e, i)}
                    onDrop={onDrop}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 10px', borderRadius: 8,
                      border: `1px solid ${isLast ? 'var(--sw-info, #007AFF)' : isFirst ? 'var(--sw-warning, #FF9500)' : 'var(--border)'}`,
                      background: isLast ? 'color-mix(in srgb, var(--sw-info, #007AFF) 6%, var(--bg))' : isFirst ? 'color-mix(in srgb, var(--sw-warning, #FF9500) 6%, var(--bg))' : 'var(--bg-surface)',
                      cursor: 'grab',
                    }}
                  >
                    {/* Drag-Handle */}
                    <span style={{ color: 'var(--text-muted)', fontSize: 12, cursor: 'grab', userSelect: 'none', minWidth: 16 }}>⠿</span>

                    {/* Name */}
                    <input
                      defaultValue={s.name}
                      onBlur={e => { if (s.id && e.target.value.trim() !== s.name) updateStimmungField(s.id, e.target.value.trim(), s.kuerzel) }}
                      style={{ flex: 1, fontSize: 13, fontWeight: 500, padding: '3px 6px', border: '1px solid var(--border)', borderRadius: 5, background: 'var(--bg)', color: 'var(--text-primary)', minWidth: 0 }}
                    />

                    {/* Kürzel */}
                    <input
                      defaultValue={s.kuerzel}
                      maxLength={3}
                      onBlur={e => { if (s.id && e.target.value.trim() !== s.kuerzel) updateStimmungField(s.id, s.name, e.target.value.trim()) }}
                      style={{ width: 44, fontSize: 13, fontWeight: 600, padding: '3px 6px', border: '1px solid var(--border)', borderRadius: 5, background: 'var(--bg)', color: 'var(--text-primary)', textAlign: 'center', textTransform: 'uppercase' }}
                    />

                    {/* Tageswechsel-Badge */}
                    {isFirst ? (
                      <Tooltip text="Erste Stimmung des Tages — hier beginnt ein neuer Spieltag" placement="top">
                        <span style={{ fontSize: 13, whiteSpace: 'nowrap', minWidth: 24, textAlign: 'center' }}>🐓</span>
                      </Tooltip>
                    ) : isLast ? (
                      <Tooltip text="Letzte Stimmung des Tages — danach beginnt ein neuer Spieltag" placement="top">
                        <span style={{ fontSize: 11, color: 'var(--sw-info, #007AFF)', fontWeight: 600, whiteSpace: 'nowrap', minWidth: 24, textAlign: 'center' }}>☽</span>
                      </Tooltip>
                    ) : (
                      <span style={{ minWidth: 24 }} />
                    )}

                    {/* Löschen */}
                    <button
                      onClick={() => s.id && deleteStimmung(s.id)}
                      disabled={stimmungen.length <= 1}
                      title="Löschen"
                      style={{ padding: '3px 7px', fontSize: 12, borderRadius: 5, border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', cursor: stimmungen.length <= 1 ? 'not-allowed' : 'pointer', opacity: stimmungen.length <= 1 ? 0.4 : 1 }}
                    >✕</button>
                  </div>
                )
              })}
            </div>

            {/* Neue Stimmung hinzufügen */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                value={newStimmungName}
                onChange={e => setNewStimmungName(e.target.value)}
                placeholder="Name (z.B. DÄMMERUNG)"
                onKeyDown={e => e.key === 'Enter' && addStimmung()}
                style={{ flex: 1, minWidth: 120, fontSize: 12, padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-subtle)', color: 'var(--text-primary)' }}
              />
              <input
                value={newStimmungKuerzel}
                onChange={e => setNewStimmungKuerzel(e.target.value.toUpperCase())}
                placeholder="Kürzel"
                maxLength={3}
                onKeyDown={e => e.key === 'Enter' && addStimmung()}
                style={{ width: 60, fontSize: 12, padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-subtle)', color: 'var(--text-primary)', textAlign: 'center', textTransform: 'uppercase' }}
              />
              <button
                onClick={addStimmung}
                style={{ padding: '5px 14px', borderRadius: 6, border: 'none', background: 'var(--text-primary)', color: '#fff', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >+ Stimmung hinzufügen</button>
            </div>
            {stimmungAddError && <p style={{ fontSize: 11, color: 'var(--sw-danger, #FF3B30)', margin: '6px 0 0' }}>{stimmungAddError}</p>}
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '8px 0 0', lineHeight: 1.5 }}>
              Reihenfolge per Drag &amp; Drop ändern. Neue Stimmungen werden oben eingefügt.
              Die Abkürzungen (max. 3 Zeichen) erscheinen im Szenenkopf.
            </p>
          </>
        )}
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
              style={{ padding: '5px 10px', whiteSpace: 'nowrap' }}
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
          Abkürzungen für Innen/Außen in der einzeiligen {t('szene', 'c')}übersicht. Tageszeit-Kürzel werden aus den Stimmungen oben übernommen.
        </p>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          {KUERZEL_FIELDS.map(({ key, label }) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500, whiteSpace: 'nowrap' }}>{label}</span>
              <input
                type="text"
                maxLength={4}
                value={kuerzel[key] ?? ''}
                onChange={e => setKuerzel(prev => ({ ...prev, [key]: e.target.value }))}
                onBlur={() => saveKuerzel(kuerzel)}
                style={{ width: 44, flexShrink: 0, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-surface)', fontSize: 13, fontFamily: 'inherit', textTransform: 'uppercase', textAlign: 'center' }}
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
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>Replikennummern</h3>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.6 }}>
          Einstellungen für die Repliknummerierung im {t('drehbuch')}-Editor.
          Betrifft alle Nutzer dieser Produktion.
        </p>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
          <label style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ color: 'var(--text-secondary)' }}>Farbe</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="color" value={replikColor} onChange={e => setReplikColor(e.target.value)}
                style={{ width: 32, height: 28, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: 0, background: 'none' }} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{replikColor}</span>
            </div>
          </label>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>Nummerierungsmodus</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
              <input type="radio" name="replikMode" value="continuous" checked={replikMode === 'continuous'}
                onChange={() => setReplikMode('continuous')} style={{ marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 500 }}>Durchnummeriert</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  Eine laufende Nummerierung über alle Szenen — Replik 1 bis n.
                  Wird automatisch aktualisiert wenn Szenen umsortiert werden.
                </div>
              </div>
            </label>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
              <input type="radio" name="replikMode" value="per_scene" checked={replikMode === 'per_scene'}
                onChange={() => setReplikMode('per_scene')} style={{ marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 500 }}>Pro Szene neu beginnen</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  Jede Szene startet bei Replik 1.
                </div>
              </div>
            </label>
          </div>
        </div>
        <div style={{ padding: 12, background: 'var(--bg-subtle)', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Vorschau:</div>
          <div style={{ display: 'flex', gap: 16 }}>
            {(replikMode === 'per_scene' ? [1, 2, 3] : [14, 15, 16]).map(n => (
              <span key={n} style={{ fontSize: 12, fontWeight: 700, color: replikColor }}>{n}. <span style={{ color: 'var(--text-primary)', fontWeight: 400 }}>FIGUR</span></span>
            ))}
          </div>
        </div>
        <button onClick={saveReplikSettings} disabled={replikSaving}
          style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: 'var(--text-primary)', color: '#fff', fontSize: 12, cursor: 'pointer' }}>
          {replikSaving ? 'Wird gespeichert…' : 'Speichern'}
        </button>
      </section>

    </div>
  )
}

// ── Glossar-Sektion ───────────────────────────────────────────────────────────

type GlossarKategorie = 'transition' | 'shot' | 'kuerzel' | 'fachbegriff' | 'sonstige'
  | 'dramaturgie' | 'emotional_bogen' | 'serien_struktur' | 'format_produktion' | 'app_architektur'

type GlossarEntry = { id: number; kuerzel: string; name: string; erklaerung: string; term_en: string; kategorie: GlossarKategorie; sort_order: number }
type GlossarDraft = { kuerzel: string; name: string; erklaerung: string; term_en: string; kategorie: GlossarKategorie }

const GLOSSAR_KATEGORIEN: { value: GlossarKategorie; label: string; importFilter: boolean }[] = [
  { value: 'kuerzel',          label: 'Abkürzung',                              importFilter: true  },
  { value: 'transition',       label: 'Übergang / Transition',                  importFilter: true  },
  { value: 'shot',             label: 'Shot-Bezeichnung',                       importFilter: true  },
  { value: 'dramaturgie',      label: 'Dramaturgie & Erzähltheorie',            importFilter: false },
  { value: 'emotional_bogen',  label: 'Emotionaler Bogen',                      importFilter: false },
  { value: 'serien_struktur',  label: 'Serien-Struktur',                        importFilter: false },
  { value: 'format_produktion',label: 'Drehbuch-Format & Produktion',           importFilter: false },
  { value: 'app_architektur',  label: 'App-Architektur',                        importFilter: false },
  { value: 'fachbegriff',      label: 'Produktionsbegriff (sonstige)',           importFilter: false },
  { value: 'sonstige',         label: 'Sonstige',                               importFilter: false },
]

// Kategorien, für die ein Kürzel optional (nicht Pflicht) ist
const KAT_KUERZEL_OPTIONAL = new Set<GlossarKategorie>([
  'dramaturgie', 'emotional_bogen', 'serien_struktur', 'format_produktion', 'app_architektur', 'fachbegriff', 'sonstige',
])

function GlossarSection({ productionId }: { productionId: string }) {
  const [entries, setEntries] = useState<GlossarEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterKat, setFilterKat] = useState<GlossarKategorie | 'alle'>('alle')
  const [langMode, setLangMode] = useState<'de' | 'en'>('de')
  const [editId, setEditId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<GlossarDraft>({ kuerzel: '', name: '', erklaerung: '', term_en: '', kategorie: 'kuerzel' })
  const [newDraft, setNewDraft] = useState<GlossarDraft | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/dk-settings/${productionId}/glossar`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false))
  }, [productionId])

  const filtered = entries.filter(e => {
    if (filterKat !== 'alle' && e.kategorie !== filterKat) return false
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return e.kuerzel.toLowerCase().includes(q) || e.name.toLowerCase().includes(q)
      || e.erklaerung.toLowerCase().includes(q) || e.term_en.toLowerCase().includes(q)
  })

  const startEdit = (e: GlossarEntry) => {
    setEditId(e.id)
    setEditDraft({ kuerzel: e.kuerzel, name: e.name, erklaerung: e.erklaerung, term_en: e.term_en ?? '', kategorie: e.kategorie ?? 'kuerzel' })
    setNewDraft(null)
  }

  const saveEdit = async () => {
    if (!editId) return
    setSaving(true)
    try {
      const r = await fetch(`/api/dk-settings/${productionId}/glossar/${editId}`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editDraft),
      })
      if (r.ok) {
        const updated = await r.json()
        setEntries(prev => prev.map(e => e.id === editId ? updated : e))
      }
    } finally { setSaving(false); setEditId(null) }
  }

  const cancelEdit = () => setEditId(null)

  const saveNew = async () => {
    if (!newDraft || !newDraft.name.trim()) return
    if (!KAT_KUERZEL_OPTIONAL.has(newDraft.kategorie) && !newDraft.kuerzel.trim()) return
    setSaving(true)
    try {
      const r = await fetch(`/api/dk-settings/${productionId}/glossar`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newDraft),
      })
      if (r.ok) {
        const created = await r.json()
        setEntries(prev => [...prev, created])
        setNewDraft(null)
      }
    } finally { setSaving(false) }
  }

  const deleteEntry = async (id: number) => {
    await fetch(`/api/dk-settings/${productionId}/glossar/${id}`, { method: 'DELETE', credentials: 'include' })
    setEntries(prev => prev.filter(e => e.id !== id))
    setDeleteConfirm(null)
  }

  const inputSt: React.CSSProperties = {
    padding: '4px 8px', borderRadius: 5, border: '1px solid var(--border)',
    background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit',
  }

  const katLabel = (k: GlossarKategorie) => GLOSSAR_KATEGORIEN.find(x => x.value === k)?.label ?? k

  return (
    <section style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px', flexShrink: 0 }}>Glossar</h3>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.6, flexShrink: 0 }}>
        Fachbegriffe, Abkürzungen und Erklärungen für diese Produktion — inkl. englischer Entsprechungen.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Suchen (DE / EN)…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...inputSt, width: 180 }}
        />
        <select value={filterKat} onChange={e => setFilterKat(e.target.value as GlossarKategorie | 'alle')}
          style={{ ...inputSt, fontSize: 11 }}>
          <option value="alle">Alle Kategorien ({entries.length})</option>
          {GLOSSAR_KATEGORIEN.map(k => {
            const cnt = entries.filter(e => e.kategorie === k.value).length
            return cnt > 0 ? <option key={k.value} value={k.value}>{k.label} ({cnt})</option> : null
          })}
        </select>
        {(search || filterKat !== 'alle') && (
          <button onClick={() => { setSearch(''); setFilterKat('alle') }}
            style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)' }}>
            ✕ Filter
          </button>
        )}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', fontSize: 11 }}>
          <button onClick={() => setLangMode('de')}
            style={{ padding: '3px 10px', border: 'none', background: langMode === 'de' ? 'var(--text-primary)' : 'transparent', color: langMode === 'de' ? '#fff' : 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}>DE</button>
          <button onClick={() => setLangMode('en')}
            style={{ padding: '3px 10px', border: 'none', background: langMode === 'en' ? 'var(--text-primary)' : 'transparent', color: langMode === 'en' ? '#fff' : 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}>EN</button>
        </div>
        <button
          onClick={() => { setNewDraft({ kuerzel: '', name: '', erklaerung: '', term_en: '', kategorie: 'kuerzel' }); setEditId(null) }}
          disabled={!!newDraft}
          style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: 'var(--text-primary)', color: '#fff', fontSize: 12, cursor: 'pointer' }}>
          + Eintrag
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
      {loading ? (
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Lädt…</span>
      ) : (
        <>
          {entries.length === 0 && !newDraft && (
            <div style={{ padding: '12px 16px', background: 'var(--bg-subtle)', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12 }}>
              <span style={{ color: 'var(--text-secondary)' }}>Noch keine Einträge.</span>
            </div>
          )}

          {filtered.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--bg-surface)' }}>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '4px 8px 6px', fontWeight: 600, fontSize: 11, color: 'var(--text-secondary)' }}>Begriff</th>
                  <th style={{ textAlign: 'left', padding: '4px 8px 6px', fontWeight: 600, fontSize: 11, color: 'var(--text-secondary)', width: 80 }}>Abkürzung</th>
                  <th style={{ textAlign: 'left', padding: '4px 8px 6px', fontWeight: 600, fontSize: 11, color: 'var(--text-secondary)' }}>Erklärung</th>
                  <th style={{ textAlign: 'left', padding: '4px 8px 6px', fontWeight: 600, fontSize: 11, color: 'var(--text-secondary)', width: 45 }}>Kategorie</th>
                  <th style={{ width: 64 }} />
                </tr>
              </thead>
              <tbody>
                {filtered.map(entry => (
                  <tr key={entry.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    {editId === entry.id ? (
                      <>
                        <td style={{ padding: '6px 8px', verticalAlign: 'top' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <input value={editDraft.name} onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))}
                              placeholder="Name (DE)" style={{ ...inputSt, width: '100%' }} autoFocus />
                            <input value={editDraft.term_en} onChange={e => setEditDraft(d => ({ ...d, term_en: e.target.value }))}
                              placeholder="Term (EN)" style={{ ...inputSt, width: '100%', fontStyle: 'italic' }} />
                          </div>
                        </td>
                        <td style={{ padding: '6px 8px', verticalAlign: 'top' }}>
                          <input value={editDraft.kuerzel} onChange={e => setEditDraft(d => ({ ...d, kuerzel: e.target.value }))}
                            placeholder="Kürzel" style={{ ...inputSt, width: 64, textTransform: 'uppercase' }} />
                        </td>
                        <td style={{ padding: '6px 8px', verticalAlign: 'top' }}>
                          <textarea value={editDraft.erklaerung} onChange={e => setEditDraft(d => ({ ...d, erklaerung: e.target.value }))}
                            rows={3} style={{ ...inputSt, width: '100%', resize: 'vertical' }} />
                        </td>
                        <td style={{ padding: '6px 8px', verticalAlign: 'top' }}>
                          <select value={editDraft.kategorie}
                            onChange={e => setEditDraft(d => ({ ...d, kategorie: e.target.value as GlossarKategorie }))}
                            style={{ ...inputSt, fontSize: 11, padding: '2px 6px', width: '100%' }}>
                            {GLOSSAR_KATEGORIEN.map(k => (
                              <option key={k.value} value={k.value}>{k.label}</option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: '6px 8px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                          <button onClick={saveEdit} disabled={saving}
                            style={{ padding: '3px 8px', borderRadius: 4, border: 'none', background: 'var(--text-primary)', color: '#fff', fontSize: 11, cursor: 'pointer', marginRight: 4 }}>
                            {saving ? '…' : 'OK'}
                          </button>
                          <button onClick={cancelEdit}
                            style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', fontSize: 11, cursor: 'pointer' }}>
                            ✕
                          </button>
                        </td>
                      </>
                    ) : deleteConfirm === entry.id ? (
                      <>
                        <td colSpan={4} style={{ padding: '8px', color: 'var(--text-secondary)', fontSize: 12 }}>
                          <strong style={{ color: 'var(--text-primary)' }}>{entry.kuerzel || entry.name}</strong> wirklich löschen?
                        </td>
                        <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                          <button onClick={() => deleteEntry(entry.id)}
                            style={{ padding: '3px 8px', borderRadius: 4, border: 'none', background: '#FF3B30', color: '#fff', fontSize: 11, cursor: 'pointer', marginRight: 4 }}>
                            Löschen
                          </button>
                          <button onClick={() => setDeleteConfirm(null)}
                            style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', fontSize: 11, cursor: 'pointer' }}>
                            Abbrechen
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={{ padding: '8px', verticalAlign: 'top' }}>
                          <div style={{ fontWeight: 600, lineHeight: 1.3 }}>
                            {langMode === 'en' && entry.term_en ? entry.term_en : entry.name}
                          </div>
                        </td>
                        <td style={{ padding: '8px', verticalAlign: 'top' }}>
                          {entry.kuerzel && (
                            <span style={{ display: 'inline-block', fontWeight: 700, fontSize: 11, background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 5px' }}>
                              {entry.kuerzel}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '8px', color: 'var(--text-secondary)', verticalAlign: 'top', lineHeight: 1.5 }}>{entry.erklaerung}</td>
                        <td style={{ padding: '8px', verticalAlign: 'top' }}>
                          <span style={{ fontSize: 10, color: 'var(--text-secondary)', background: 'var(--bg-subtle)', borderRadius: 4, padding: '2px 5px', display: 'inline-block', wordBreak: 'break-word' }}>
                            {katLabel(entry.kategorie)}
                          </span>
                        </td>
                        <td style={{ padding: '6px 8px', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                          <button onClick={() => startEdit(entry)}
                            title="Bearbeiten"
                            style={{ padding: '3px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', fontSize: 11, cursor: 'pointer', marginRight: 4 }}>
                            ✎
                          </button>
                          <button onClick={() => setDeleteConfirm(entry.id)}
                            title="Löschen"
                            style={{ padding: '3px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', fontSize: 11, cursor: 'pointer', color: '#FF3B30' }}>
                            ✕
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {(search || filterKat !== 'alle') && filtered.length === 0 && entries.length > 0 && (
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>Keine Einträge für diese Suche / Kategorie.</p>
          )}

          {newDraft && (
            <div style={{ marginTop: 12, padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-subtle)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 600 }}>KÜRZEL {KAT_KUERZEL_OPTIONAL.has(newDraft.kategorie) ? '(optional)' : ''}</span>
                  <input value={newDraft.kuerzel} onChange={e => setNewDraft(d => d ? { ...d, kuerzel: e.target.value } : d)}
                    placeholder="z. B. NMDP" autoFocus
                    style={{ ...inputSt, width: 90, textTransform: 'uppercase' }} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 140 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 600 }}>NAME (DE)</span>
                  <input value={newDraft.name} onChange={e => setNewDraft(d => d ? { ...d, name: e.target.value } : d)}
                    placeholder="Vollständiger Name"
                    style={{ ...inputSt, width: '100%' }} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 140 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 600 }}>TERM (EN)</span>
                  <input value={newDraft.term_en} onChange={e => setNewDraft(d => d ? { ...d, term_en: e.target.value } : d)}
                    placeholder="English term"
                    style={{ ...inputSt, width: '100%', fontStyle: 'italic' }} />
                </label>
              </div>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 600 }}>ERKLÄRUNG</span>
                <textarea value={newDraft.erklaerung} onChange={e => setNewDraft(d => d ? { ...d, erklaerung: e.target.value } : d)}
                  placeholder="Bedeutung und Verwendung…"
                  rows={2} style={{ ...inputSt, width: '100%', resize: 'vertical' }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 600 }}>KATEGORIE</span>
                <select value={newDraft.kategorie}
                  onChange={e => setNewDraft(d => d ? { ...d, kategorie: e.target.value as GlossarKategorie } : d)}
                  style={{ ...inputSt, fontSize: 12 }}>
                  {GLOSSAR_KATEGORIEN.map(k => (
                    <option key={k.value} value={k.value}>{k.label}</option>
                  ))}
                </select>
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={saveNew}
                  disabled={saving || !newDraft.name.trim() || (!KAT_KUERZEL_OPTIONAL.has(newDraft.kategorie) && !newDraft.kuerzel.trim())}
                  style={{ padding: '5px 14px', borderRadius: 6, border: 'none', background: 'var(--text-primary)', color: '#fff', fontSize: 12, cursor: 'pointer' }}>
                  {saving ? 'Wird gespeichert…' : 'Hinzufügen'}
                </button>
                <button onClick={() => setNewDraft(null)}
                  style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', fontSize: 12, cursor: 'pointer' }}>
                  Abbrechen
                </button>
              </div>
            </div>
          )}
        </>
      )}
      </div>
    </section>
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

  // Suffix-Settings (P4 + VO)
  const [suffixOff, setSuffixOff] = useState(true)
  const [suffixNt, setSuffixNt] = useState(true)
  const [suffixOneway, setSuffixOneway] = useState(true)
  const [suffixVo, setSuffixVo] = useState(true)
  const [offFigurenImSzenenkopf, setOffFigurenImSzenenkopf] = useState(false)
  const [acAlleDeaktiviert, setAcAlleDeaktiviert] = useState(false)
  const [actionAcEnabled, setActionAcEnabled] = useState(true)
  const [actionAcTriggerChars, setActionAcTriggerChars] = useState(4)
  const [actionAutoCaps, setActionAutoCaps] = useState(true)
  const [charAcDeaktiviert, setCharAcDeaktiviert] = useState(false)
  const [charAcAlleErlaubt, setCharAcAlleErlaubt] = useState(true)
  const [suffixSaving, setSuffixSaving] = useState(false)

  useEffect(() => {
    fetch('/api/admin/app-settings', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((d: any) => {
        if (d?.figuren_label) setFigurenLabel(d.figuren_label)
        if (d?.suffix_settings) {
          try {
            const s = JSON.parse(d.suffix_settings)
            if (s.suffix_off_enabled !== undefined) setSuffixOff(s.suffix_off_enabled)
            if (s.suffix_nt_enabled !== undefined) setSuffixNt(s.suffix_nt_enabled)
            if (s.suffix_oneway_enabled !== undefined) setSuffixOneway(s.suffix_oneway_enabled)
            if (s.suffix_vo_enabled !== undefined) setSuffixVo(s.suffix_vo_enabled)
            if (s.off_figuren_im_szenenkopf !== undefined) setOffFigurenImSzenenkopf(s.off_figuren_im_szenenkopf)
            if (s.ac_alle_deaktiviert !== undefined) setAcAlleDeaktiviert(s.ac_alle_deaktiviert)
            if (s.action_ac_enabled !== undefined) setActionAcEnabled(s.action_ac_enabled)
            if (s.action_ac_trigger_chars !== undefined) setActionAcTriggerChars(s.action_ac_trigger_chars)
            if (s.action_auto_caps !== undefined) setActionAutoCaps(s.action_auto_caps)
            if (s.char_ac_deaktiviert !== undefined) setCharAcDeaktiviert(s.char_ac_deaktiviert)
            if (s.char_ac_alle_erlaubt !== undefined) setCharAcAlleErlaubt(s.char_ac_alle_erlaubt)
          } catch {}
        }
      })
      .catch(() => {})
  }, [])

  const saveSuffixSettings = async (patch: Record<string, any>) => {
    setSuffixSaving(true)
    const current = {
      suffix_off_enabled: suffixOff,
      suffix_nt_enabled: suffixNt,
      suffix_oneway_enabled: suffixOneway,
      suffix_vo_enabled: suffixVo,
      off_figuren_im_szenenkopf: offFigurenImSzenenkopf,
      ac_alle_deaktiviert: acAlleDeaktiviert,
      action_ac_enabled: actionAcEnabled,
      action_ac_trigger_chars: actionAcTriggerChars,
      action_auto_caps: actionAutoCaps,
      char_ac_deaktiviert: charAcDeaktiviert,
      char_ac_alle_erlaubt: charAcAlleErlaubt,
      ...patch,
    }
    try {
      await fetch('/api/admin/app-settings/suffix_settings', {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: JSON.stringify(current) }),
      })
      window.dispatchEvent(new CustomEvent('app-settings-changed'))
    } catch {} finally { setSuffixSaving(false) }
  }

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
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

        {/* Charakter-Suffixe & Autovervollständigung */}
        <section style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 6px' }}>Charakter-Suffixe & Autovervollständigung</h3>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
              Steuert die automatische Erkennung von OFF-, NT- und ONE-WAY-Suffixen in CHARACTER-Zeilen sowie die Großbuchstaben-Erkennung in Action-Zeilen.
            </p>
          </div>

          {/* Suffix-Erkennung */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ fontSize: 12, fontWeight: 600, margin: 0 }}>Suffix-Erkennung in CHARACTER-Zeilen</p>
            {([
              { label: 'OFF / O.S. erkennen', value: suffixOff, key: 'suffix_off_enabled', set: setSuffixOff },
              { label: 'NT (Nur Ton) erkennen', value: suffixNt, key: 'suffix_nt_enabled', set: setSuffixNt },
              { label: 'ONE-WAY erkennen', value: suffixOneway, key: 'suffix_oneway_enabled', set: setSuffixOneway },
              { label: 'VO / V.O. (Voice Over) erkennen', value: suffixVo, key: 'suffix_vo_enabled', set: setSuffixVo },
            ] as const).map(row => (
              <label key={row.key} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={row.value} disabled={suffixSaving} onChange={e => {
                  row.set(e.target.checked as any)
                  saveSuffixSettings({ [row.key]: e.target.checked })
                }} />
                <span style={{ fontSize: 13 }}>{row.label}</span>
              </label>
            ))}
          </div>

          {/* OFF im Szenenkopf */}
          <div style={{ paddingTop: 4, borderTop: '1px solid var(--border-subtle)' }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" style={{ marginTop: 2 }} checked={offFigurenImSzenenkopf} disabled={suffixSaving} onChange={e => {
                setOffFigurenImSzenenkopf(e.target.checked)
                saveSuffixSettings({ off_figuren_im_szenenkopf: e.target.checked })
              }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>OFF-Figuren im Szenenkopf aufführen</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.5 }}>
                  Standard (aus): OFF-Figuren erscheinen nur in der Szenen-Notiz, nicht unter Rollen.<br />
                  Ein: OFF-Figuren werden mit <code style={{ fontSize: 10 }}>(OFF)</code> unter Rollen eingetragen — Drehplanung disponiert sie ans Set.
                </div>
              </div>
            </label>
          </div>

          {/* Master-Toggle: Alles deaktivieren */}
          <div style={{ paddingTop: 4, borderTop: '1px solid var(--border-subtle)' }}>
            <Tooltip text={'⚠️ Schaltet die gesamte Autovervollständigung ab — sowohl Figuren- als auch Action-Zeilen.\nBetrifft alle Nutzer sofort und ohne weitere Bestätigung.\n\n🚨 Gefahr: Ohne Autovervollständigung können Figurennamen frei getippt werden, ohne dass sie in der Datenbank erfasst werden. Das führt zu Inkonsistenzen zwischen Drehbuchtext und Figurendatenbank — Figuren, die im Text vorkommen, werden möglicherweise nicht zu den Dreharbeiten bestellt.\n\nEinzelne Einstellungen bleiben gespeichert und werden beim Reaktivieren wiederhergestellt.'}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={acAlleDeaktiviert} disabled={suffixSaving} onChange={e => {
                  setAcAlleDeaktiviert(e.target.checked)
                  saveSuffixSettings({ ac_alle_deaktiviert: e.target.checked })
                }} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>Gesamte Autovervollständigung deaktivieren (für alle User)</span>
              </label>
            </Tooltip>
          </div>

          {/* Autovervollständigung Action */}
          <div style={{ paddingTop: 4, borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 10, opacity: acAlleDeaktiviert ? 0.4 : 1 }}>
            <p style={{ fontSize: 12, fontWeight: 600, margin: 0 }}>Autovervollständigung in Action-Zeilen</p>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={actionAcEnabled} disabled={suffixSaving || acAlleDeaktiviert} onChange={e => {
                setActionAcEnabled(e.target.checked)
                saveSuffixSettings({ action_ac_enabled: e.target.checked })
              }} />
              <span style={{ fontSize: 13 }}>Aktiviert (Großbuchstaben-Wörter in Action werden erkannt)</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, minWidth: 220 }}>Mindestlänge Großbuchstaben-Wort</span>
              <input type="number" min={2} max={10} value={actionAcTriggerChars} disabled={suffixSaving || acAlleDeaktiviert || !actionAcEnabled}
                style={{ width: 56, fontSize: 13, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--text)' }}
                onChange={e => setActionAcTriggerChars(Number(e.target.value))}
                onBlur={e => saveSuffixSettings({ action_ac_trigger_chars: Number(e.target.value) })}
              />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Zeichen</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={actionAutoCaps} disabled={suffixSaving || acAlleDeaktiviert || !actionAcEnabled} onChange={e => {
                setActionAutoCaps(e.target.checked)
                saveSuffixSettings({ action_auto_caps: e.target.checked })
              }} />
              <span style={{ fontSize: 13 }}>Namen in Action-Zeilen nach Einfügen großschreiben</span>
            </label>
          </div>

          {/* Figuren-AC */}
          <div style={{ paddingTop: 4, borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 10, opacity: acAlleDeaktiviert ? 0.4 : 1 }}>
            <p style={{ fontSize: 12, fontWeight: 600, margin: 0 }}>Autovervollständigung für {figurenLabel}</p>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={charAcDeaktiviert} disabled={suffixSaving || acAlleDeaktiviert} onChange={e => {
                setCharAcDeaktiviert(e.target.checked)
                saveSuffixSettings({ char_ac_deaktiviert: e.target.checked })
              }} />
              <span style={{ fontSize: 13 }}>Deaktiviert (kein Quellenpool-Wechsel für alle User)</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={charAcAlleErlaubt} disabled={suffixSaving || acAlleDeaktiviert || charAcDeaktiviert} onChange={e => {
                setCharAcAlleErlaubt(e.target.checked)
                saveSuffixSettings({ char_ac_alle_erlaubt: e.target.checked })
              }} />
              <span style={{ fontSize: 13 }}>Option „Alle {figurenLabel}" im Quellenpool anzeigen</span>
            </label>
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
    <div>

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
          Beispiel: 92 Seiten = 52 Min. → jede Seite ≈ 33 Sek.
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

// ── Tab: Sonstige Dokumente ──────────────────────────────────────────────────

const SONSTIGE_FONT_FAMILIES = ['Courier New', 'Courier Prime', 'Inter', 'Arial', 'Helvetica', 'Times New Roman', 'Georgia']

interface SonstigeFormat {
  fontFamily: string
  fontSize: number
  lineHeight: number
}

const SONSTIGE_DEFAULTS: SonstigeFormat = { fontFamily: 'Courier New', fontSize: 10, lineHeight: 1.5 }

interface OnlinerSonstigeFormat {
  tableFontFamily: string
  tableFontSize: number
  tableLineHeight: number
  headingFontFamily: string
  headingFontSize: number
  headingBold: boolean
  refColWidthPt: number
}

const ONLINER_SONSTIGE_DEFAULTS: OnlinerSonstigeFormat = {
  tableFontFamily: 'Courier New',
  tableFontSize: 10,
  tableLineHeight: 1.4,
  headingFontFamily: 'Courier New',
  headingFontSize: 13,
  headingBold: true,
  refColWidthPt: 52,
}

function SonstigeDokumenteTab({ produktionId }: { produktionId: string }) {
  const [statistik, setStatistik] = useState<SonstigeFormat>(SONSTIGE_DEFAULTS)
  const [onliner,   setOnliner]   = useState<OnlinerSonstigeFormat>(ONLINER_SONSTIGE_DEFAULTS)
  const [saving, setSaving]       = useState(false)
  const [msg, setMsg]             = useState<string | null>(null)

  useEffect(() => {
    if (!produktionId) return
    fetch(`/api/dk-settings/${produktionId}/app-settings`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(s => {
        if (s?.sonstige_dokumente_format) {
          try {
            const v = typeof s.sonstige_dokumente_format === 'string'
              ? JSON.parse(s.sonstige_dokumente_format) : s.sonstige_dokumente_format
            if (v?.statistik) setStatistik({ ...SONSTIGE_DEFAULTS,         ...v.statistik })
            if (v?.onliner)   setOnliner(  { ...ONLINER_SONSTIGE_DEFAULTS, ...v.onliner   })
          } catch {}
        }
      })
      .catch(() => {})
  }, [produktionId])

  async function handleSave() {
    setSaving(true); setMsg(null)
    try {
      const value = JSON.stringify({ statistik, onliner })
      const r = await fetch(`/api/dk-settings/${produktionId}/app-settings/sonstige_dokumente_format`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      })
      if (!r.ok) throw new Error(await r.text())
      setMsg('Gespeichert')
    } catch (e) {
      setMsg('Fehler beim Speichern')
    } finally {
      setSaving(false)
      setTimeout(() => setMsg(null), 2500)
    }
  }

  const secStyle: React.CSSProperties = {
    border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px',
    display: 'flex', flexDirection: 'column', gap: 16,
  }
  const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }
  const labelStyle: React.CSSProperties = { fontSize: 12, color: 'var(--text-secondary)', minWidth: 120 }
  const inputStyle: React.CSSProperties = {
    border: '1px solid var(--border)', borderRadius: 6, padding: '5px 9px',
    fontSize: 13, background: 'var(--bg-secondary)', color: 'var(--text-primary)', width: 80,
  }
  const subheadStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
    textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 4,
  }

  return (
    <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Statistik */}
      <div style={secStyle}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Statistik</div>
        <div style={rowStyle}>
          <span style={labelStyle}>Schriftart</span>
          <select
            value={statistik.fontFamily}
            onChange={e => setStatistik(p => ({ ...p, fontFamily: e.target.value }))}
            style={{ ...inputStyle, width: 180 }}
          >
            {SONSTIGE_FONT_FAMILIES.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Schriftgröße (pt)</span>
          <input
            type="number" min={6} max={24} step={0.5}
            value={statistik.fontSize}
            onChange={e => setStatistik(p => ({ ...p, fontSize: parseFloat(e.target.value) || p.fontSize }))}
            style={inputStyle}
          />
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Zeilenabstand</span>
          <input
            type="number" min={1} max={3} step={0.1}
            value={statistik.lineHeight}
            onChange={e => setStatistik(p => ({ ...p, lineHeight: parseFloat(e.target.value) || p.lineHeight }))}
            style={inputStyle}
          />
        </div>
      </div>

      {/* Onliner */}
      <div style={secStyle}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Onliner</div>

        <div style={subheadStyle}>Überschrift</div>
        <div style={rowStyle}>
          <span style={labelStyle}>Schriftart</span>
          <select
            value={onliner.headingFontFamily}
            onChange={e => setOnliner(p => ({ ...p, headingFontFamily: e.target.value }))}
            style={{ ...inputStyle, width: 180 }}
          >
            {SONSTIGE_FONT_FAMILIES.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Schriftgröße (pt)</span>
          <input
            type="number" min={6} max={36} step={0.5}
            value={onliner.headingFontSize}
            onChange={e => setOnliner(p => ({ ...p, headingFontSize: parseFloat(e.target.value) || p.headingFontSize }))}
            style={inputStyle}
          />
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Fettschrift</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={onliner.headingBold}
              onChange={e => setOnliner(p => ({ ...p, headingBold: e.target.checked }))}
            />
            Fett
          </label>
        </div>

        <div style={subheadStyle}>Tabelle</div>
        <div style={rowStyle}>
          <span style={labelStyle}>Schriftart</span>
          <select
            value={onliner.tableFontFamily}
            onChange={e => setOnliner(p => ({ ...p, tableFontFamily: e.target.value }))}
            style={{ ...inputStyle, width: 180 }}
          >
            {SONSTIGE_FONT_FAMILIES.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Schriftgröße (pt)</span>
          <input
            type="number" min={6} max={24} step={0.5}
            value={onliner.tableFontSize}
            onChange={e => setOnliner(p => ({ ...p, tableFontSize: parseFloat(e.target.value) || p.tableFontSize }))}
            style={inputStyle}
          />
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Zeilenabstand</span>
          <input
            type="number" min={1} max={3} step={0.1}
            value={onliner.tableLineHeight}
            onChange={e => setOnliner(p => ({ ...p, tableLineHeight: parseFloat(e.target.value) || p.tableLineHeight }))}
            style={inputStyle}
          />
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>Ref-Spalte (pt)</span>
          <input
            type="number" min={20} max={120} step={1}
            value={onliner.refColWidthPt}
            onChange={e => setOnliner(p => ({ ...p, refColWidthPt: parseInt(e.target.value) || p.refColWidthPt }))}
            style={inputStyle}
          />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={handleSave} disabled={saving}
          style={{ padding: '7px 18px', fontSize: 13, fontWeight: 600, borderRadius: 8, border: 'none', background: '#007AFF', color: '#fff', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}
        >
          {saving ? 'Speichern…' : 'Speichern'}
        </button>
        {msg && <span style={{ fontSize: 12, color: msg.startsWith('Fehler') ? '#FF3B30' : '#00C853' }}>{msg}</span>}
      </div>
    </div>
  )
}

// ── Tab: Dokument-Typen (Absatzformate) ─────────────────────────────────────────

const PRESET_HAS_INFO = new Set([
  'US Master Scene Format (A4)',
  'WGA Sitcom Multi-Camera',
  'BBC TV Drama',
  'Theaterstück (Samuel French)',
  'ARD/ZDF Fernsehfilm',
])

const PRESET_INFO_HEADER: Record<string, { title: string; subtitle: string }> = {
  'US Master Scene Format (A4)':    { title: 'US Master Scene Format', subtitle: '10 CPI · 6 LPI · Courier 12pt' },
  'WGA Sitcom Multi-Camera':        { title: 'WGA Sitcom Multi-Camera', subtitle: 'Doppelter Zeilenabstand · Shot-Card-Format' },
  'BBC TV Drama':                   { title: 'BBC TV Drama Format', subtitle: 'BBC Writers Room Standard · A4' },
  'Theaterstück (Samuel French)':   { title: 'Theaterstück — Samuel French', subtitle: 'Englischsprachiger Bühnenstandard · kein INT./EXT.' },
  'ARD/ZDF Fernsehfilm':            { title: 'ARD/ZDF Fernsehfilm', subtitle: 'Kein verbindlicher Formatstandard' },
}

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
  const { t: tDok } = useTerminologie()
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
  const [isAdmin, setIsAdmin] = useState(false)
  const [showOverwriteSystem, setShowOverwriteSystem] = useState(false)
  const [overwritePresetId, setOverwritePresetId] = useState<string | null>(null)
  // US Master Scene Format Info Modal
  const [showUsInfo, setShowUsInfo] = useState(false)
  const [usInfoPos, setUsInfoPos] = useState({ x: 120, y: 80 })
  const usInfoElRef = useRef<HTMLDivElement>(null)
  const usInfoDragRef = useRef<{ ox: number; oy: number } | null>(null)
  const startDragUsInfo = (clientX: number, clientY: number) => {
    const el = usInfoElRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    usInfoDragRef.current = { ox: clientX - rect.left, oy: clientY - rect.top }
    const onMove = (e: MouseEvent) => {
      if (!usInfoDragRef.current) return
      setUsInfoPos({ x: e.clientX - usInfoDragRef.current.ox, y: e.clientY - usInfoDragRef.current.oy })
    }
    const onUp = () => {
      usInfoDragRef.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const load = async () => {
    if (!produktionId) return
    setLoading(true)
    try {
      const [fResult, p] = await Promise.all([
        api.getAbsatzformate(produktionId),
        api.getAbsatzformatPresets(),
      ])
      setFormate(fResult.formate)
      setPresets(p)
      // Restore the last applied preset for this production (or default to first preset)
      if (fResult.applied_preset_id && p.find((pr: any) => pr.id === fResult.applied_preset_id)) {
        setSelectedPresetId(fResult.applied_preset_id)
      } else if (p.length > 0) {
        setSelectedPresetId(p[0].id)
      }
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { load() }, [produktionId])
  useEffect(() => {
    api.getMe().then(me => setIsAdmin(
      !!(me.roles?.includes('superadmin') || me.roles?.includes('admin'))
    )).catch(() => {})
  }, [])

  const selectedPreset = presets.find(p => p.id === selectedPresetId) ?? null
  const templateValue = templateEdit !== null ? templateEdit : (selectedPreset?.szenen_kopf_template ?? '')
  const templateDirty = templateEdit !== null && templateEdit !== (selectedPreset?.szenen_kopf_template ?? '')
  // System-Presets: nur Superadmin darf speichern
  const canEditTemplate = selectedPreset && (!selectedPreset.ist_system || isAdmin)

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
    const preset = presets.find(p => p.id === selectedPresetId)
    const presetName = preset?.name ?? 'Preset'

    // Pre-flight: find format names in current production that don't exist in the new preset
    const presetFormatNames = new Set<string>(
      (preset?.formate ?? []).map((f: any) => f.name as string)
    )
    const missing = formate.map(f => f.name).filter(n => !presetFormatNames.has(n))

    if (missing.length > 0) {
      if (!confirm(
        `Wollen Sie wirklich das Format ändern?\n\n` +
        `Folgende Formate aus dem aktuellen Preset existieren in „${presetName}" nicht:\n` +
        missing.map(n => `  • ${n}`).join('\n') + '\n\n' +
        `Dieser Wechsel kann die Formatierung bestehender Szenen zerstören.\n\n` +
        `Trotzdem fortfahren?`
      )) return
    } else if (formate.length > 0) {
      if (!confirm(`Preset „${presetName}" anwenden? Alle Formatnamen sind im neuen Preset vorhanden — bestehende Szenen werden automatisch neu zugeordnet.\n\nFortfahren?`)) return
    }

    setMsg(null)
    try {
      const result = await api.applyAbsatzformatPreset(produktionId, selectedPresetId)
      const newFormate = Array.isArray(result) ? result : (result?.formate ?? [])
      const remapped = result?.remapped_scenes ?? null
      setFormate(newFormate)
      setMsg(remapped != null
        ? `Preset angewendet. ${remapped} Szene(n) neu zugeordnet.`
        : 'Preset angewendet.')
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
      await api.patchAbsatzformatPreset(selectedPresetId, { formate: presetFormate, seitenformat, page_margins: margins, szenen_kopf_template: templateValue })
      setShowUpdatePreset(false); setTemplateEdit(null)
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
        szenen_kopf_template: templateValue,
      })
      setShowSavePreset(false); setPresetName(''); setTemplateEdit(null)
      await load(); setSelectedPresetId(saved.id); setMsg('Preset gespeichert.')
    } catch (e: any) { setMsg(e.message ?? 'Fehler') }
  }

  const handleOverwriteSystemPreset = async () => {
    if (!overwritePresetId) return
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
      await api.patchAbsatzformatPreset(overwritePresetId, { formate: presetFormate, seitenformat, page_margins: margins, szenen_kopf_template: templateValue })
      setShowSavePreset(false); setShowOverwriteSystem(false); setOverwritePresetId(null); setPresetName(''); setTemplateEdit(null)
      await load(); setSelectedPresetId(overwritePresetId); setMsg('System-Preset aktualisiert.')
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
    <div style={{ width: '100%', minWidth: 0 }}>
      {headerBarContent}

      {/* Szenenkopf-Vorlage (kein Border) */}
      {selectedPreset && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>Szenenkopf-Vorlage</span>
            {selectedPreset.ist_system && !isAdmin && (
              <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'var(--bg-subtle)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                System-Preset — nur lesbar
              </span>
            )}
            {selectedPreset.ist_system && isAdmin && (
              <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: '#007AFF22', color: '#007AFF', border: '1px solid #007AFF55' }}>
                System-Preset — Superadmin
              </span>
            )}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-primary)', marginBottom: 8 }}>
            Definiert den Szenenkopf für den {tDok('drehbuch')}-Export. Jede Zeile mit leeren Feldern werden ausgeblendet.
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
        {selectedPreset && PRESET_HAS_INFO.has(selectedPreset.name) && (
          <button
            onClick={() => setShowUsInfo(true)}
            title={`Erklärung zum ${selectedPreset.name}`}
            style={{
              width: 18, height: 18, borderRadius: '50%', border: '1.5px solid #007AFF',
              background: 'transparent', color: '#007AFF', fontSize: 11, fontWeight: 700,
              cursor: 'pointer', padding: 0, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >i</button>
        )}
        <div style={{ flex: 1 }} />
        <label style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Filter:</label>
        <select value={filterKat} onChange={e => setFilterKat(e.target.value)} style={selectStyle}>
          <option value="alle">Alle</option>
          <option value="drehbuch">{tDok('drehbuch')}</option>
          <option value="storyline">Storyline</option>
          <option value="sl_db">SL/DB</option>
          <option value="notiz">Notiz</option>
        </select>
      </div>

      {msg && <p style={{ fontSize: 12, color: 'var(--sw-info)', marginBottom: 8 }}>{msg}</p>}
      {loading && <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Lädt...</p>}

      {/* Absatzformate-Tabelle */}
      <div style={{ overflowX: 'auto', width: '100%' }}>
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
          <th style={{ textAlign: 'center', padding: '6px 4px', fontWeight: 600 }}><Tooltip text="Einzug links in cm, gemessen ab dem linken Textrand (nach dem globalen Seitenrand)">Einzug L</Tooltip></th>
          <th style={{ textAlign: 'center', padding: '6px 4px', fontWeight: 600 }}><Tooltip text="Einzug rechts in cm, gemessen ab dem rechten Textrand (nach dem globalen Seitenrand)">Einzug R</Tooltip></th>
          <th style={{ textAlign: 'center', padding: '6px 4px', fontWeight: 600 }}><Tooltip text="Abstand vor dem Absatz (pt)">Ab.v.</Tooltip></th>
          <th style={{ textAlign: 'center', padding: '6px 4px', fontWeight: 600 }}><Tooltip text="Abstand nach dem Absatz (pt)">Ab.n.</Tooltip></th>
          <th style={{ textAlign: 'center', padding: '6px 4px', fontWeight: 600 }} title="Zeilenabstand (1.0 = einfach)">ZA</th>
          <th style={{ textAlign: 'left', padding: '6px 4px', fontWeight: 600 }}>Enter→</th>
          <th style={{ textAlign: 'left', padding: '6px 4px', fontWeight: 600 }}>Tab→</th>
          <th style={{ padding: '6px 4px' }} />
        </tr></thead>
        <tbody>
          {filtered.map(f => editId === f.id ? (
            <tr key={f.id} style={{ borderBottom: '2px solid var(--border)', background: 'var(--bg-subtle)' }}>
              <td colSpan={18} style={{ padding: '12px 8px' }}>
                <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
                  {/* ── Form ── */}
                  <div style={{ flex: '0 0 auto', minWidth: 380 }}>
                    {/* Row 1: Name / Prefix / Kürzel / Kategorie */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 60px 90px', gap: 6, marginBottom: 6 }}>
                      <label style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Name
                        <input value={editData.name} onChange={e => setEditData({ ...editData, name: e.target.value })} style={{ ...inputStyle, marginTop: 2 }} />
                      </label>
                      <label style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Prefix
                        <input value={editData.textbaustein ?? ''} onChange={e => setEditData({ ...editData, textbaustein: e.target.value || null })} placeholder="—" style={{ ...inputStyle, marginTop: 2 }} />
                      </label>
                      <label style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Kürzel
                        <input value={editData.kuerzel ?? ''} onChange={e => setEditData({ ...editData, kuerzel: e.target.value })} style={{ ...inputStyle, marginTop: 2 }} />
                      </label>
                      <label style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Kategorie
                        <select value={editData.kategorie} onChange={e => setEditData({ ...editData, kategorie: e.target.value })} style={{ ...selectStyle, marginTop: 2, width: '100%' }}>
                          <option value="alle">alle</option><option value="drehbuch">drehbuch</option><option value="storyline">storyline</option><option value="sl_db">SL/DB</option><option value="notiz">notiz</option>
                        </select>
                      </label>
                    </div>
                    {/* Row 2: Schrift / Größe / Stil */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 52px auto', gap: 6, marginBottom: 6 }}>
                      <label style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Schrift
                        <select value={editData.font_family} onChange={e => setEditData({ ...editData, font_family: e.target.value })} style={{ ...selectStyle, marginTop: 2, width: '100%' }}>
                          {FONT_FAMILIES.map(ff => <option key={ff} value={ff}>{ff}</option>)}
                        </select>
                      </label>
                      <label style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Größe (pt)
                        <input type="number" className="no-spin" value={editData.font_size} onChange={e => setEditData({ ...editData, font_size: parseFloat(e.target.value) })} style={{ ...inputStyle, marginTop: 2, textAlign: 'center' }} />
                      </label>
                      <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Stil
                        <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                          {[
                            { key: 'bold', label: 'B', style: { fontWeight: 'bold' } },
                            { key: 'italic', label: 'I', style: { fontStyle: 'italic' } },
                            { key: 'underline', label: 'U', style: { textDecoration: 'underline' } },
                            { key: 'uppercase', label: 'UC', style: {} },
                          ].map(({ key, label, style }) => (
                            <button key={key} onClick={() => setEditData({ ...editData, [key]: !editData[key] })}
                              style={{ padding: '2px 7px', borderRadius: 4, border: '1px solid var(--border)', background: editData[key] ? 'var(--text-primary)' : 'transparent', color: editData[key] ? '#fff' : 'var(--text-secondary)', fontSize: 11, cursor: 'pointer', fontWeight: key === 'bold' ? 'bold' : 'normal', ...style }}>
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    {/* Row 3: Ausrichtung / Einzug L / Einzug R */}
                    <div style={{ display: 'grid', gridTemplateColumns: '90px 90px 90px', gap: 6, marginBottom: 6 }}>
                      <label style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Ausrichtung
                        <select value={editData.text_align} onChange={e => setEditData({ ...editData, text_align: e.target.value })} style={{ ...selectStyle, marginTop: 2, width: '100%' }}>
                          <option value="left">Links</option><option value="center">Zentriert</option><option value="right">Rechts</option><option value="justify">Blocksatz</option>
                        </select>
                      </label>
                      <label style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                        <Tooltip text="Einzug in cm, ab dem linken Textrand (nach dem globalen Seitenrand des Dokuments)">Einzug L (cm)</Tooltip>
                        <input type="number" className="no-spin" step="0.1" min="0" value={editData.margin_left ?? 0} onChange={e => setEditData({ ...editData, margin_left: parseFloat(e.target.value) || 0 })} style={{ ...inputStyle, marginTop: 2, textAlign: 'center' }} />
                      </label>
                      <label style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                        <Tooltip text="Einzug in cm, ab dem rechten Textrand (nach dem globalen Seitenrand des Dokuments)">Einzug R (cm)</Tooltip>
                        <input type="number" className="no-spin" step="0.1" min="0" value={editData.margin_right ?? 0} onChange={e => setEditData({ ...editData, margin_right: parseFloat(e.target.value) || 0 })} style={{ ...inputStyle, marginTop: 2, textAlign: 'center' }} />
                      </label>
                    </div>
                    {/* Row 4: Abstände / Zeilenabstand */}
                    <div style={{ display: 'grid', gridTemplateColumns: '90px 90px 90px', gap: 6, marginBottom: 6 }}>
                      <label style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Abstand vor (pt)
                        <input type="number" className="no-spin" step="1" min="0" value={editData.space_before ?? 0} onChange={e => setEditData({ ...editData, space_before: parseInt(e.target.value) || 0 })} style={{ ...inputStyle, marginTop: 2, textAlign: 'center' }} />
                      </label>
                      <label style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Abstand nach (pt)
                        <input type="number" className="no-spin" step="1" min="0" value={editData.space_after ?? 0} onChange={e => setEditData({ ...editData, space_after: parseInt(e.target.value) || 0 })} style={{ ...inputStyle, marginTop: 2, textAlign: 'center' }} />
                      </label>
                      <label style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Zeilenabstand
                        <input type="number" className="no-spin" step="0.1" min="0.5" max="4" value={editData.line_height ?? 1.0} onChange={e => setEditData({ ...editData, line_height: parseFloat(e.target.value) || 1.0 })} style={{ ...inputStyle, marginTop: 2, textAlign: 'center' }} />
                      </label>
                    </div>
                    {/* Row 5: Enter→ / Tab→ / Standard */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 6, marginBottom: 10 }}>
                      <label style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Enter →
                        <select value={editData.enter_next_format ?? ''} onChange={e => setEditData({ ...editData, enter_next_format: e.target.value || null })} style={{ ...selectStyle, marginTop: 2, width: '100%' }}>
                          <option value="">—</option>
                          {formate.map(o => <option key={o.id} value={o.id}>{o.kuerzel || o.name}</option>)}
                        </select>
                      </label>
                      <label style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Tab →
                        <select value={editData.tab_next_format ?? ''} onChange={e => setEditData({ ...editData, tab_next_format: e.target.value || null })} style={{ ...selectStyle, marginTop: 2, width: '100%' }}>
                          <option value="">—</option>
                          {formate.map(o => <option key={o.id} value={o.id}>{o.kuerzel || o.name}</option>)}
                        </select>
                      </label>
                      <div style={{ paddingTop: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button onClick={() => handleSetStandard(f.id)} title={editData.ist_standard ? 'Ist Standard' : 'Als Standard setzen'}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: editData.ist_standard ? '#FFCC00' : 'var(--text-muted)', lineHeight: 1, padding: 0 }}>★</button>
                        <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>Standard</span>
                      </div>
                    </div>
                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={saveEdit} style={{ padding: '5px 14px', borderRadius: 5, border: 'none', background: '#00C853', color: '#fff', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>Speichern</button>
                      <button onClick={cancelEdit} style={{ padding: '5px 10px', borderRadius: 5, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer' }}>Abbrechen</button>
                    </div>
                  </div>

                  {/* ── Live-Vorschau ── */}
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>Vorschau</div>
                    <div style={{ border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-primary)', padding: '16px 20px', minHeight: 80 }}>
                      <div style={{
                        fontFamily: editData.font_family || 'inherit',
                        fontSize: `${editData.font_size || 12}pt`,
                        fontWeight: editData.bold ? 'bold' : 'normal',
                        fontStyle: editData.italic ? 'italic' : 'normal',
                        textDecoration: editData.underline ? 'underline' : 'none',
                        textTransform: editData.uppercase ? 'uppercase' : 'none',
                        textAlign: (editData.text_align || 'left') as any,
                        marginLeft: `${(editData.margin_left ?? 0) * 37.8}px`,
                        marginRight: `${(editData.margin_right ?? 0) * 37.8}px`,
                        paddingTop: `${editData.space_before ?? 0}px`,
                        paddingBottom: `${editData.space_after ?? 0}px`,
                        lineHeight: editData.line_height ?? 1.0,
                        color: 'var(--text-primary)',
                        wordBreak: 'break-word',
                      }}>
                        {editData.textbaustein || editData.name || 'Beispieltext'}
                      </div>
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 5 }}>
                      {editData.font_family} · {editData.font_size}pt
                      {editData.bold ? ' · Fett' : ''}{editData.italic ? ' · Kursiv' : ''}{editData.underline ? ' · Unterstrichen' : ''}{editData.uppercase ? ' · Großbuchstaben' : ''}
                      {editData.margin_left ? ` · Einzug L ${editData.margin_left}cm` : ''}{editData.margin_right ? ` · Einzug R ${editData.margin_right}cm` : ''}
                    </div>
                  </div>
                </div>
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
              <td style={{ padding: '6px 4px', color: 'var(--text-secondary)' }}>{f.kategorie === 'alle' ? '*' : f.kategorie === 'drehbuch' ? 'DB' : f.kategorie === 'notiz' ? 'NZ' : f.kategorie === 'sl_db' ? 'SL/DB' : 'SL'}</td>
              <td style={{ padding: '6px 4px', color: 'var(--text-secondary)', fontSize: 10 }}>{f.font_family} {f.font_size}</td>
              <td style={{ padding: '6px 4px', textAlign: 'center', color: 'var(--text-secondary)' }}>{f.font_size}</td>
              <td style={{ padding: '6px 4px', textAlign: 'center', fontSize: 10 }}>
                {f.bold && <b>B</b>}{f.italic && <i> I</i>}{f.underline && <u> U</u>}{f.uppercase && <span> UC</span>}
                {!f.bold && !f.italic && !f.underline && !f.uppercase && '-'}
              </td>
              <td style={{ padding: '6px 4px', color: 'var(--text-secondary)' }}>{f.text_align === 'left' ? 'L' : f.text_align === 'center' ? 'C' : f.text_align === 'justify' ? 'B' : 'R'}</td>
              <td style={{ padding: '6px 4px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 10 }}>{f.margin_left ? f.margin_left + ' cm' : '-'}</td>
              <td style={{ padding: '6px 4px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 10 }}>{f.margin_right ? f.margin_right + ' cm' : '-'}</td>
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
      </div>

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
              <div><strong>Szenenkopf-Vorlage:</strong> {templateValue ? 'wird gespeichert' : 'leer'}</div>
            </div>
            {isAdmin && presets.some(p => p.ist_system) && (
              <div style={{ marginBottom: 14 }}>
                {!showOverwriteSystem ? (
                  <button
                    onClick={() => { setShowOverwriteSystem(true); setOverwritePresetId(presets.find(p => p.ist_system)?.id ?? null) }}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 11, textDecoration: 'underline' }}
                  >
                    System-Preset überschreiben
                  </button>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <select value={overwritePresetId ?? ''} onChange={e => setOverwritePresetId(e.target.value)}
                      style={{ fontSize: 11, padding: '3px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}>
                      {presets.filter(p => p.ist_system).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <button onClick={handleOverwriteSystemPreset} disabled={!overwritePresetId}
                      style={{ padding: '3px 10px', borderRadius: 4, border: 'none', background: '#FF9500', color: '#fff', fontSize: 11, cursor: 'pointer', opacity: overwritePresetId ? 1 : 0.5 }}>
                      Überschreiben
                    </button>
                    <button onClick={() => { setShowOverwriteSystem(false); setOverwritePresetId(null) }}
                      style={{ background: 'none', border: 'none', padding: '0 2px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1 }}>
                      ✕
                    </button>
                  </div>
                )}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowSavePreset(false); setPresetName(''); setShowOverwriteSystem(false); setOverwritePresetId(null) }}
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

      {/* Preset Info Modal — generisch für alle Formate mit PRESET_HAS_INFO */}
      {showUsInfo && selectedPreset && PRESET_HAS_INFO.has(selectedPreset.name) && createPortal(
        <div ref={usInfoElRef} style={{
          position: 'fixed', left: usInfoPos.x, top: usInfoPos.y,
          width: 560, minWidth: 320, maxWidth: '92vw',
          minHeight: 300, maxHeight: '90vh',
          background: 'var(--bg-surface)',
          borderRadius: 12,
          boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
          zIndex: 99999,
          overflow: 'hidden',
          resize: 'both',
          display: 'flex', flexDirection: 'column',
          border: '1px solid rgba(127,127,127,0.2)',
        }}>
          {/* Drag-Header */}
          <div
            onMouseDown={e => { e.preventDefault(); startDragUsInfo(e.clientX, e.clientY) }}
            onTouchStart={e => startDragUsInfo(e.touches[0].clientX, e.touches[0].clientY)}
            style={{
              background: '#0d1117', color: '#e6edf3', padding: '11px 16px',
              display: 'flex', alignItems: 'center', gap: 10,
              cursor: 'grab', userSelect: 'none', flexShrink: 0,
              borderBottom: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, flex: 1, letterSpacing: 0.2 }}>
              {PRESET_INFO_HEADER[selectedPreset.name]?.title ?? selectedPreset.name}
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#c9d1d9', fontFamily: 'Courier Prime, Courier, monospace', whiteSpace: 'nowrap' }}>
              {PRESET_INFO_HEADER[selectedPreset.name]?.subtitle ?? ''}
            </span>
            <button onClick={() => setShowUsInfo(false)} style={{
              background: 'rgba(255,255,255,0.1)', border: 'none', color: '#e6edf3',
              cursor: 'pointer', width: 22, height: 22, borderRadius: '50%',
              fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, padding: 0, marginLeft: 4,
            }}>✕</button>
          </div>

          {/* Scrollable Content */}
          <div style={{ overflow: 'auto', flex: 1, padding: '16px 18px', fontSize: 12, lineHeight: 1.6, color: 'var(--text-primary)' }}>

            {/* ══ US Master Scene Format ══════════════════════════════════════════ */}
            {selectedPreset.name === 'US Master Scene Format (A4)' && (<>
              {/* Sektion: Das Raster */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
                  Das Monospace-Raster
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 10 }}>
                  Das US-Drehbuchformat ist kein „Layout" im typografischen Sinn, sondern ein festes Zeichenraster. Es funktioniert nur, weil Courier eine Monospace-Schrift ist: jedes Zeichen — ob „i" oder „W" — belegt exakt dieselbe Breite. Dadurch ist jede Position auf der Seite über Zeichen und Zeilen eindeutig adressierbar, unabhängig von der Software.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                  <div style={{ background: '#007AFF12', border: '1px solid #007AFF35', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
                    <div style={{ fontSize: 26, fontWeight: 800, color: '#007AFF', fontFamily: 'Courier Prime, Courier, monospace', lineHeight: 1 }}>10</div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-primary)', marginTop: 3 }}>CPI</div>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>10 Zeichen = 1 Zoll</div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Zeichenbreite 2,54 mm</div>
                  </div>
                  <div style={{ background: '#00C85312', border: '1px solid #00C85335', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
                    <div style={{ fontSize: 26, fontWeight: 800, color: '#00C853', fontFamily: 'Courier Prime, Courier, monospace', lineHeight: 1 }}>6</div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-primary)', marginTop: 3 }}>LPI</div>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>6 Zeilen = 1 Zoll</div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Zeilenhöhe 4,23 mm</div>
                  </div>
                </div>
                <div style={{ background: '#FF950012', border: '1px solid #FF950045', borderRadius: 8, padding: '9px 13px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>⏱</span>
                  <div>
                    <div style={{ fontWeight: 700, color: '#FF9500', fontSize: 12 }}>1 Seite ≈ 1 Filmminute</div>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Diese Regel gilt nur, solange Schrift, Zeichenbreite und Zeilenhöhe unverändert bleiben.</div>
                  </div>
                </div>
              </div>

              {/* Sektion: Einzüge */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
                  Einzüge der Elemente (Textspalte = 60 Zeichen)
                </div>
                {([
                  { label: 'Scene Heading / Action', indent: 0,  width: 60, color: '#007AFF', desc: '0 Z. — volle Spalte (1,5″ / 3,81 cm vom Blattrand)' },
                  { label: 'Dialogue',               indent: 10, width: 35, color: '#00C853', desc: '10 Z. Einzug · 35 Z. breit (2,5″ / 6,35 cm)' },
                  { label: 'Parenthetical',          indent: 16, width: 20, color: '#AF52DE', desc: '16 Z. Einzug · 20 Z. breit (3,1″ / 7,87 cm)' },
                  { label: 'Character',              indent: 22, width: 38, color: '#FF9500', desc: '22 Z. Einzug · UPPERCASE (3,7″ / 9,40 cm)' },
                  { label: 'Transition', indent: 0, width: 10, color: '#8b949e', desc: 'rechtsbündig — kein fixer Einzug', rightAlign: true },
                ] as { label: string; indent: number; width: number; color: string; desc: string; rightAlign?: boolean }[]).map(el => (
                  <div key={el.label} style={{ marginBottom: 7 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, minWidth: 170, color: 'var(--text-primary)' }}>{el.label}</span>
                      <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{el.desc}</span>
                    </div>
                    <div style={{ position: 'relative', height: 10, background: 'var(--bg-subtle)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{
                        position: 'absolute',
                        ...(el.rightAlign
                          ? { right: 0, width: `${(el.width / 60) * 100}%` }
                          : { left: `${(el.indent / 60) * 100}%`, width: `${(el.width / 60) * 100}%` }),
                        height: '100%', background: el.color, opacity: 0.65, borderRadius: 2,
                      }} />
                    </div>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-muted)', marginTop: 4 }}>
                  <span>← linker Seitenrand (3,81 cm)</span>
                  <span>60 Zeichen = 15,24 cm →</span>
                </div>
              </div>

              {/* Sektion: Letter vs. A4 */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
                  Seitenränder — US Letter vs. A4 (dieses Preset)
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-subtle)' }}>
                      <th style={{ textAlign: 'left', padding: '5px 8px', fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>Element</th>
                      <th style={{ textAlign: 'right', padding: '5px 8px', fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>US Letter</th>
                      <th style={{ textAlign: 'right', padding: '5px 8px', fontWeight: 600, color: '#007AFF', borderBottom: '1px solid var(--border)' }}>A4 (dieses Preset)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {([
                      { label: 'Blatt',        letter: '21,59 × 27,94 cm', a4: '21,0 × 29,7 cm',        ok: false, bold: false },
                      { label: 'Rand links',   letter: '3,81 cm',           a4: '3,81 cm ✓',             ok: true,  bold: false },
                      { label: 'Rand rechts',  letter: '2,54 cm',           a4: '1,95 cm',               ok: false, bold: false },
                      { label: 'Rand oben',    letter: '2,54 cm',           a4: '2,54 cm ✓',             ok: true,  bold: false },
                      { label: 'Rand unten',   letter: '2,54 cm',           a4: '4,30 cm',               ok: false, bold: false },
                      { label: 'Textspalte',   letter: '15,24 cm / 60 Z.',  a4: '15,24 cm / 60 Z. ✓',   ok: true,  bold: true  },
                      { label: 'Texthöhe',     letter: '22,86 cm / 54 Zl.', a4: '22,86 cm / 54 Zl. ✓', ok: true,  bold: true  },
                    ] as { label: string; letter: string; a4: string; ok: boolean; bold: boolean }[]).map((row, i) => (
                      <tr key={row.label} style={{ background: row.bold ? '#007AFF08' : (i % 2 === 0 ? 'transparent' : 'var(--bg-subtle)') }}>
                        <td style={{ padding: '4px 8px', color: 'var(--text-primary)', fontWeight: row.bold ? 600 : 400 }}>{row.label}</td>
                        <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--text-secondary)', fontFamily: 'Courier Prime, Courier, monospace', fontSize: 10 }}>{row.letter}</td>
                        <td style={{ padding: '4px 8px', textAlign: 'right', color: row.ok ? '#00C853' : 'var(--text-primary)', fontFamily: 'Courier Prime, Courier, monospace', fontSize: 10, fontWeight: row.bold ? 600 : 400 }}>{row.a4}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-muted)', padding: '7px 10px', background: 'var(--bg-subtle)', borderRadius: 6, lineHeight: 1.6 }}>
                  Das Raster (10 CPI / 6 LPI) bleibt 1:1 erhalten — nur der rechte Rand schrumpft von 2,54 cm auf 1,95 cm.<br />
                  So bleibt die <em>Minuten-pro-Seite-Regel</em> auf A4 korrekt.
                </div>
              </div>

              {/* Sektion: Verwendet für */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
                  Verwendet für
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  Gängiges Format für <strong style={{ color: 'var(--text-primary)' }}>Feature Film · One-Hour Drama · Sitcom Single-Camera</strong>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {['Breaking Bad', 'Game of Thrones', 'The Wire', 'Succession', 'The Sopranos', 'Mad Men', 'Better Call Saul'].map(show => (
                    <span key={show} style={{ fontSize: 10, background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px', color: 'var(--text-secondary)' }}>
                      {show}
                    </span>
                  ))}
                </div>
                <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  Alle großen US-Dramen verwenden das US Master Scene Format ohne Abweichungen — es ist seit den 1980ern der de-facto-Standard der amerikanischen Filmindustrie.
                </div>
              </div>
            </>)}

            {/* ══ WGA Sitcom Multi-Camera ═════════════════════════════════════════ */}
            {selectedPreset.name === 'WGA Sitcom Multi-Camera' && (<>
              {/* Sektion: Was ist das Multi-Camera-Format? */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
                  Das Multi-Camera-Format
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  Das WGA Multi-Camera-Format wurde für Sitcoms entwickelt, die gleichzeitig mit mehreren Kameras vor Live-Publikum gedreht werden. Das Skript dient dabei als <strong style={{ color: 'var(--text-primary)' }}>Shot Card</strong> — ein Arbeitsdokument für Kameramänner, Regie und Schauspiel-Crew.
                </div>
              </div>

              {/* Sektion: Shot-Card-Konzept visuell */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
                  Wozu die breiten Seitenränder?
                </div>
                <div style={{ position: 'relative', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', fontSize: 10, fontFamily: 'Courier Prime, Courier, monospace' }}>
                  {/* Header */}
                  <div style={{ background: 'var(--bg-subtle)', padding: '5px 10px', fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 0.5 }}>
                    SEITE ALS SHOT CARD — schematisch
                  </div>
                  {/* Seitendiagramm */}
                  <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr 72px', minHeight: 110 }}>
                    <div style={{ background: '#FF950015', borderRight: '2px dashed #FF950060', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 6, gap: 4 }}>
                      <span style={{ fontSize: 8, fontWeight: 700, color: '#FF9500', textAlign: 'center', lineHeight: 1.2 }}>LINKER RAND</span>
                      <span style={{ fontSize: 7, color: 'var(--text-muted)', textAlign: 'center' }}>3,81 cm</span>
                      <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2, width: '100%' }}>
                        {['A-CAM', 'B-CAM', 'C-CAM'].map(c => (
                          <div key={c} style={{ fontSize: 7, background: '#FF950025', borderRadius: 2, padding: '1px 4px', color: '#FF9500', textAlign: 'center' }}>{c}</div>
                        ))}
                      </div>
                    </div>
                    <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 0.3 }}>INT. WOHNZIMMER — TAG</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', lineHeight: 2 }}>JOEY SCHAUT VERWIRRT AUF SEINEN FREUND.</div>
                      <div style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--text-primary)' }}>CHANDLER</div>
                      <div style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 2, marginLeft: 10, marginRight: 10 }}>Ich habe keine Ahnung, was hier passiert.</div>
                    </div>
                    <div style={{ background: '#007AFF15', borderLeft: '2px dashed #007AFF60', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 6, gap: 4 }}>
                      <span style={{ fontSize: 8, fontWeight: 700, color: '#007AFF', textAlign: 'center', lineHeight: 1.2 }}>RECHTER RAND</span>
                      <span style={{ fontSize: 7, color: 'var(--text-muted)', textAlign: 'center' }}>3,81 cm</span>
                      <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2, width: '100%' }}>
                        {['DOLLY', 'ZOOM', 'MARK'].map(c => (
                          <div key={c} style={{ fontSize: 7, background: '#007AFF25', borderRadius: 2, padding: '1px 4px', color: '#007AFF', textAlign: 'center' }}>{c}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  Beide Seitenränder (je 3,81 cm) bleiben bewusst leer — Kameramänner und Regisseur tragen dort während der Probe die Camera-Assignments und Blocking-Notizen ein.
                </div>
              </div>

              {/* Sektion: Doppelter Zeilenabstand */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
                  Warum doppelter Zeilenabstand?
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div style={{ background: 'var(--bg-subtle)', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Single-Camera (US Master)</div>
                    <div style={{ fontSize: 9, color: 'var(--text-secondary)', fontFamily: 'Courier Prime, Courier, monospace', lineHeight: 1.4 }}>
                      ACTION LINE<br />
                      ACTION LINE<br />
                      ACTION LINE
                    </div>
                    <div style={{ marginTop: 6, fontSize: 9, color: 'var(--text-muted)' }}>Zeilenabstand: 1,0 — kein Annotationsraum</div>
                  </div>
                  <div style={{ background: '#FF950010', border: '1px solid #FF950030', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#FF9500', marginBottom: 4 }}>Multi-Camera (dieses Preset)</div>
                    <div style={{ fontSize: 9, color: 'var(--text-secondary)', fontFamily: 'Courier Prime, Courier, monospace', lineHeight: 2 }}>
                      ACTION LINE<br />
                      ACTION LINE<br />
                      ACTION LINE
                    </div>
                    <div style={{ marginTop: 6, fontSize: 9, color: 'var(--text-muted)' }}>Zeilenabstand: 2,0 — Platz für Blocking-Notizen</div>
                  </div>
                </div>
              </div>

              {/* Sektion: Typische Produktionen */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
                  Typisch für
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {['Friends', 'The Big Bang Theory', 'Two and a Half Men', 'How I Met Your Mother', 'Seinfeld', 'Cheers', 'Frasier'].map(show => (
                    <span key={show} style={{ fontSize: 10, background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px', color: 'var(--text-secondary)' }}>
                      {show}
                    </span>
                  ))}
                </div>
                <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  <em>The Office (US)</em> und <em>Modern Family</em> wurden zwar als Sitcoms verkauft, aber im Single-Camera-Format gedreht — sie verwenden das US Master Scene Format, nicht dieses Preset.
                </div>
              </div>
            </>)}

            {/* ══ BBC TV Drama ════════════════════════════════════════════════════ */}
            {selectedPreset.name === 'BBC TV Drama' && (<>
              {/* Sektion: Was ist das BBC-Format? */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
                  BBC Writers Room Standard
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  Das BBC TV Drama Format ist der offizielle Standard des <strong style={{ color: 'var(--text-primary)' }}>BBC Writers Room</strong> — der zentralen Drehbuch-Entwicklungsabteilung der BBC. Es entspricht weitgehend dem US Master Scene Format, ist aber explizit auf A4 ausgelegt und verwendet leicht andere Ränder.
                </div>
              </div>

              {/* Sektion: Unterschiede zum US Master */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
                  Unterschiede zum US Master Scene Format
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-subtle)' }}>
                      <th style={{ textAlign: 'left', padding: '5px 8px', fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>Aspekt</th>
                      <th style={{ textAlign: 'left', padding: '5px 8px', fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>US Master</th>
                      <th style={{ textAlign: 'left', padding: '5px 8px', fontWeight: 600, color: '#007AFF', borderBottom: '1px solid var(--border)' }}>BBC TV Drama</th>
                    </tr>
                  </thead>
                  <tbody>
                    {([
                      { aspect: 'Papierformat', us: 'US Letter', bbc: 'A4 ✓', match: false },
                      { aspect: 'Rand links',   us: '3,81 cm',   bbc: '3,81 cm ✓', match: true },
                      { aspect: 'Rand rechts',  us: '1,95 cm',   bbc: '2,54 cm', match: false },
                      { aspect: 'Rand unten',   us: '4,30 cm',   bbc: '3,00 cm', match: false },
                      { aspect: 'Character',    us: 'linksbündig (3,7″)', bbc: 'zentriert ✓', match: false },
                      { aspect: 'Action',       us: 'Gemischt', bbc: 'Gemischt ✓', match: true },
                      { aspect: 'Zeilenabstand', us: 'einfach', bbc: 'einfach ✓', match: true },
                    ] as { aspect: string; us: string; bbc: string; match: boolean }[]).map((row, i) => (
                      <tr key={row.aspect} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-subtle)' }}>
                        <td style={{ padding: '4px 8px', color: 'var(--text-secondary)', fontWeight: 500 }}>{row.aspect}</td>
                        <td style={{ padding: '4px 8px', color: 'var(--text-muted)', fontFamily: 'Courier Prime, Courier, monospace', fontSize: 10 }}>{row.us}</td>
                        <td style={{ padding: '4px 8px', color: row.match ? '#00C853' : 'var(--text-primary)', fontFamily: 'Courier Prime, Courier, monospace', fontSize: 10 }}>{row.bbc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Sektion: Character zentriert */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
                  Character: zentriert statt eingerückt
                </div>
                <div style={{ background: 'var(--bg-subtle)', borderRadius: 8, padding: '10px 14px', fontFamily: 'Courier Prime, Courier, monospace', fontSize: 10, lineHeight: 1.8 }}>
                  <div style={{ color: 'var(--text-muted)' }}>INT. FLAT — DAY</div>
                  <div style={{ color: 'var(--text-secondary)', marginTop: 4 }}>Sarah picks up the phone.</div>
                  <div style={{ textAlign: 'center', fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>SARAH</div>
                  <div style={{ marginLeft: '20%', marginRight: '20%', color: 'var(--text-secondary)' }}>Hello?</div>
                </div>
                <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  Der Figurenname steht bei BBC zentriert über dem Dialog — im US-Format ist er bei ca. 3,7″ (9,40 cm) linksbündig eingerückt.
                </div>
              </div>

              {/* Sektion: Bekannte Produktionen */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
                  Bekannte Produktionen
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {['Sherlock', 'Doctor Who', 'Fleabag', 'Broadchurch', 'Peaky Blinders', 'Luther', 'Happy Valley'].map(show => (
                    <span key={show} style={{ fontSize: 10, background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px', color: 'var(--text-secondary)' }}>
                      {show}
                    </span>
                  ))}
                </div>
              </div>
            </>)}

            {/* ══ Theaterstück (Samuel French) ════════════════════════════════════ */}
            {selectedPreset.name === 'Theaterstück (Samuel French)' && (<>
              {/* Sektion: Was ist Samuel French? */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
                  Der Samuel French Standard
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  <strong style={{ color: 'var(--text-primary)' }}>Samuel French</strong> ist der älteste und meistgenutzte Theaterverlag der englischsprachigen Welt (gegr. 1830). Das Samuel French Format ist de-facto-Standard für englischsprachige Bühnenstücke — von Broadway bis West End. Es unterscheidet sich grundlegend vom Film-/TV-Drehbuchformat.
                </div>
              </div>

              {/* Sektion: Kein Slug-Line-System */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
                  Kein INT./EXT./TAG-System
                </div>
                <div style={{ background: '#FF3B3012', border: '1px solid #FF3B3030', borderRadius: 8, padding: '10px 14px', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  Theater kennt keine Außen-/Innenräume im filmischen Sinn und keinen Schnitt. Statt Szenenköpfen gibt es <strong style={{ color: 'var(--text-primary)' }}>Akte und Szenen</strong>. Der Szenenkopf-Template ist daher auf <code style={{ background: 'var(--bg-subtle)', padding: '1px 4px', borderRadius: 3 }}>{'{{motiv}}'}</code> vereinfacht — nur der Schauplatz.
                </div>
              </div>

              {/* Sektion: Format-Elemente */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
                  Format-Elemente im Vergleich
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-subtle)' }}>
                      <th style={{ textAlign: 'left', padding: '5px 8px', fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>Element</th>
                      <th style={{ textAlign: 'left', padding: '5px 8px', fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>Formatierung</th>
                      <th style={{ textAlign: 'left', padding: '5px 8px', fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>Entspricht (Film)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {([
                      { el: 'Akt',            fmt: 'ZENTRIERT · FETT · CAPS',    film: 'Act Break' },
                      { el: 'Szene',          fmt: 'ZENTRIERT · CAPS',           film: '—' },
                      { el: 'Regieanweisung', fmt: 'Kursiv · eingerückt 1,5 cm', film: 'Action' },
                      { el: 'Figurenname',    fmt: 'ZENTRIERT · CAPS',           film: 'Character' },
                      { el: 'Dialog',         fmt: 'Volle Spaltenbreite · 1,2 Zl.', film: 'Dialogue' },
                    ] as { el: string; fmt: string; film: string }[]).map((row, i) => (
                      <tr key={row.el} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-subtle)' }}>
                        <td style={{ padding: '4px 8px', color: 'var(--text-primary)', fontWeight: 500 }}>{row.el}</td>
                        <td style={{ padding: '4px 8px', color: 'var(--text-secondary)', fontSize: 10 }}>{row.fmt}</td>
                        <td style={{ padding: '4px 8px', color: 'var(--text-muted)', fontFamily: 'Courier Prime, Courier, monospace', fontSize: 10 }}>{row.film}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Sektion: Muster */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
                  Beispiel
                </div>
                <div style={{ background: 'var(--bg-subtle)', borderRadius: 8, padding: '12px 16px', fontFamily: 'Courier Prime, Courier, monospace', fontSize: 10, lineHeight: 1.8 }}>
                  <div style={{ textAlign: 'center', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-primary)' }}>ACT ONE</div>
                  <div style={{ textAlign: 'center', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 6 }}>SCENE I</div>
                  <div style={{ fontStyle: 'italic', marginLeft: '10%', marginRight: '10%', color: 'var(--text-muted)' }}>
                    The lights come up on a sparse living room. JOHN stands by the window, looking out.
                  </div>
                  <div style={{ textAlign: 'center', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-primary)', marginTop: 8 }}>JOHN</div>
                  <div style={{ color: 'var(--text-secondary)' }}>I thought you'd never come back.</div>
                </div>
              </div>

              {/* Sektion: Verlage */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
                  Verlage &amp; Standards
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  Englischsprachig: <strong style={{ color: 'var(--text-primary)' }}>Samuel French</strong> (New York/London) · <strong style={{ color: 'var(--text-primary)' }}>Dramatists Play Service</strong> · <strong style={{ color: 'var(--text-primary)' }}>Concord Theatricals</strong>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: 4 }}>
                  Deutschsprachig: <strong style={{ color: 'var(--text-primary)' }}>S. Fischer Verlage</strong> · <strong style={{ color: 'var(--text-primary)' }}>Suhrkamp</strong> · <strong style={{ color: 'var(--text-primary)' }}>Rowohlt Theater</strong> · <strong style={{ color: 'var(--text-primary)' }}>Verlag der Autoren</strong>
                </div>
                <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  Deutsche Bühnenverlage haben kein einheitliches Format-Vorschriften-System. Dieses Preset orientiert sich am Samuel French Standard als internationalem Referenz.
                </div>
              </div>
            </>)}

            {/* ══ ARD/ZDF Fernsehfilm ═════════════════════════════════════════════ */}
            {selectedPreset.name === 'ARD/ZDF Fernsehfilm' && (<>
              <div style={{ marginBottom: 16 }}>
                <div style={{ background: '#FF950015', border: '1px solid #FF950040', borderRadius: 8, padding: '12px 14px', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  <strong style={{ color: '#FF9500', fontSize: 12 }}>ARD und ZDF haben keine standardisierten Formatvorlagen.</strong>
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
                  Hintergrund
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  Anders als in den USA (WGA) oder Großbritannien (BBC Writers Room) gibt es in Deutschland keine sendereigenen oder verbandsverbindlichen Formatvorgaben für Drehbücher. ARD und ZDF veröffentlichen keine offiziellen Style Guides für Autoren.
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
                  Was stattdessen gilt
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  In der Praxis orientieren sich deutsche TV-Autoren an den Empfehlungen ihrer Produktionsfirma oder Redaktion. Verbreitet sind Formate, die dem <strong style={{ color: 'var(--text-primary)' }}>US Master Scene Format</strong> ähneln — mit Anpassungen für A4, deutschen Slugline-Konventionen (INT./EXT. · TAG/NACHT) und Courier 12pt.
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
                  Dieses Preset
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  Das ARD/ZDF-Preset in dieser App basiert auf der gängigen Praxis bei deutschen Fernsehfilmen und Mehrteiler-Produktionen — es ist kein offizieller Standard, sondern eine praxisnahe Vorlage.
                </div>
              </div>
            </>)}

          </div>
        </div>,
        document.body
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
              <div><strong>Szenenkopf-Vorlage:</strong> {templateValue ? 'wird gespeichert' : 'leer'}</div>
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
            <option value="alle">alle</option><option value="drehbuch">drehbuch</option><option value="storyline">storyline</option><option value="sl_db">SL/DB</option><option value="notiz">notiz</option>
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
            <option value="left">Links</option><option value="center">Mitte</option><option value="right">Rechts</option><option value="justify">Blocksatz</option>
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

const COPY_SECTIONS = [
  { id: 'kategorien',   label: 'Kategorien' },
  { id: 'labels',       label: 'Labels' },
  { id: 'colors',       label: 'Farben' },
  { id: 'einstellungen', label: 'Einstellungen' },
]

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
  const { config: currentConfig, t: tTerm2 } = useTerminologie()
  const [config, setConfig] = useState<TerminologieConfig>({ ...currentConfig })
  const [saving, setSaving] = useState(false)
  const [glossarOpen, setGlossarOpen] = useState(false)
  const [glossarWidth, setGlossarWidth] = useState(720)
  const glossarDragRef = useRef<{ startX: number; startW: number } | null>(null)
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
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 24 }}>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
          In der Branche werden für dieselben Konzepte unterschiedliche Begriffe verwendet.
          Hier legst du fest, welcher Begriff in der gesamten App verwendet wird.
        </p>
        {productionId ? (
          <button
            onClick={() => setGlossarOpen(true)}
            style={{ flexShrink: 0, padding: '6px 14px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-subtle)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Glossar
          </button>
        ) : null}
      </div>

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
              subtext={`Bezeichnung der Vorstufe vor dem ${tTerm2('drehbuch')} — gilt für diese Produktion`}
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

      {glossarOpen && productionId && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setGlossarOpen(false) }}
        >
          <div style={{ position: 'relative', background: 'var(--bg-surface)', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.25)', padding: 24, width: glossarWidth, maxWidth: '92vw', minWidth: 480, maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {/* Resize-Handle rechts */}
            <div
              onMouseDown={e => {
                e.preventDefault()
                glossarDragRef.current = { startX: e.clientX, startW: glossarWidth }
                const onMove = (cx: number) => {
                  if (!glossarDragRef.current) return
                  setGlossarWidth(Math.max(480, Math.min(window.innerWidth * 0.95, glossarDragRef.current.startW + cx - glossarDragRef.current.startX)))
                }
                const onMouseMove = (ev: MouseEvent) => onMove(ev.clientX)
                const onTouchMove = (ev: TouchEvent) => { ev.preventDefault(); onMove(ev.touches[0].clientX) }
                const stop = () => {
                  glossarDragRef.current = null
                  document.removeEventListener('mousemove', onMouseMove)
                  document.removeEventListener('mouseup', stop)
                  document.removeEventListener('touchmove', onTouchMove)
                  document.removeEventListener('touchend', stop)
                }
                document.addEventListener('mousemove', onMouseMove)
                document.addEventListener('mouseup', stop)
                document.addEventListener('touchmove', onTouchMove, { passive: false })
                document.addEventListener('touchend', stop)
              }}
              onTouchStart={e => {
                glossarDragRef.current = { startX: e.touches[0].clientX, startW: glossarWidth }
                const onMove = (cx: number) => {
                  if (!glossarDragRef.current) return
                  setGlossarWidth(Math.max(480, Math.min(window.innerWidth * 0.95, glossarDragRef.current.startW + cx - glossarDragRef.current.startX)))
                }
                const onTouchMove = (ev: TouchEvent) => { ev.preventDefault(); onMove(ev.touches[0].clientX) }
                const stop = () => {
                  glossarDragRef.current = null
                  document.removeEventListener('touchmove', onTouchMove)
                  document.removeEventListener('touchend', stop)
                }
                document.addEventListener('touchmove', onTouchMove, { passive: false })
                document.addEventListener('touchend', stop)
              }}
              style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 8, cursor: 'ew-resize', borderRadius: '0 12px 12px 0', zIndex: 10 }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexShrink: 0 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Glossar</h2>
              <button
                onClick={() => setGlossarOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, lineHeight: 1, color: 'var(--text-secondary)', padding: '0 4px' }}
              >✕</button>
            </div>
            <GlossarSection productionId={productionId} />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tab: Private Dokumente ────────────────────────────────────────────────────

type FilterType = '1' | '2' | '3'

const FILTER_LABELS: Record<FilterType, string> = {
  '1': 'Folge für Sendung',
  '2': 'Mit Folge verknüpft',
  '3': 'Alle privaten',
}

const SICHT_COLORS: Record<string, string> = {
  privat: '#757575', colab: '#007AFF', team: '#32ADE6', produktion: '#AF52DE', alle: '#00C853',
}
const SICHT_LABELS: Record<string, string> = {
  privat: 'Privat', colab: 'Colab', team: 'Team', produktion: 'Produktion', alle: 'Alle',
}

function NotifyDialog({
  dok,
  neueSichtbarkeit,
  colabGruppeId,
  onConfirm,
  onClose,
}: {
  dok: any
  neueSichtbarkeit: string
  colabGruppeId?: string | null
  onConfirm: (perEmail: boolean, anderweitig: boolean) => Promise<void>
  onClose: () => void
}) {
  const [step, setStep] = useState<'ask' | 'confirm'>('ask')
  const [bestaetigt, setBestaetigt] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleEmail = async () => {
    setSaving(true)
    try { await onConfirm(true, false); onClose() }
    catch (e: any) { setError(e.message); setSaving(false) }
  }
  const handleNein = () => setStep('confirm')
  const handleConfirm = async () => {
    if (!bestaetigt) return
    setSaving(true)
    try { await onConfirm(false, true); onClose() }
    catch (e: any) { setError(e.message); setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.4)', display: 'grid', placeItems: 'center' }}>
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, width: 460, padding: 0, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Autor informieren?</span>
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {step === 'ask' ? (
            <>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--text-primary)' }}>
                Die Sichtbarkeit von <strong>„{dok.folgen_titel}"</strong> wurde auf{' '}
                <strong style={{ color: SICHT_COLORS[neueSichtbarkeit] }}>{SICHT_LABELS[neueSichtbarkeit]}</strong> geändert.
              </p>
              <div style={{ padding: '10px 14px', background: 'rgba(255,204,0,0.08)', border: '1px solid rgba(255,204,0,0.3)', borderRadius: 8, fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.6 }}>
                Autoren sollten über Änderungen an ihren Dokumenten informiert werden —
                das ist wichtig für das Vertrauen in das System.
              </div>
              {error && <div style={{ fontSize: 13, color: '#FF3B30' }}>{error}</div>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
                <button className="btn" onClick={handleNein} disabled={saving}>Nein, ich informiere selbst</button>
                <button className="btn primary" onClick={handleEmail} disabled={saving}>
                  {saving ? 'Sendet…' : 'Ja, Email senden'}
                </button>
              </div>
            </>
          ) : (
            <>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--text-primary)' }}>
                Bitte bestätige bevor du fortfährst:
              </p>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '10px 12px', border: `1.5px solid ${bestaetigt ? '#00C853' : 'var(--border)'}`, borderRadius: 8, fontSize: 13, lineHeight: 1.5 }}>
                <input type="checkbox" checked={bestaetigt} onChange={e => setBestaetigt(e.target.checked)} style={{ marginTop: 2, flexShrink: 0 }} />
                <span>Der Autor wurde von mir informiert.</span>
              </label>
              {error && <div style={{ fontSize: 13, color: '#FF3B30' }}>{error}</div>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
                <button className="btn" onClick={onClose} disabled={saving}>Abbrechen</button>
                <button className="btn primary" onClick={handleConfirm} disabled={!bestaetigt || saving}>
                  {saving ? 'Speichert…' : 'Bestätigen'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function SichtbarkeitChangeModal({
  dok,
  produktionId,
  onDone,
  onClose,
}: {
  dok: any
  produktionId: string
  onDone: () => void
  onClose: () => void
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [colabGruppeId, setColabGruppeId] = useState<string | null>(null)
  const [gruppen, setGruppen] = useState<any[]>([])
  const [notifyOpen, setNotifyOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.getColabGruppen(produktionId).then(setGruppen).catch(() => {})
  }, [produktionId])

  const options = [
    { value: 'colab',      label: 'Colab',      desc: 'Ausgewählte Colab-Gruppe kann bearbeiten' },
    { value: 'team',       label: 'Team',        desc: 'Ausgewählte Team-Gruppe kann lesen' },
    { value: 'produktion', label: 'Produktion',  desc: 'Produktionsteam kann lesen' },
    { value: 'alle',       label: 'Alle',        desc: 'Jeder mit Zugriff kann lesen' },
  ]

  const handleSave = async () => {
    if (!selected) return
    setSaving(true)
    setNotifyOpen(true)
    setSaving(false)
  }

  const handleNotifyConfirm = async (perEmail: boolean, anderweitig: boolean) => {
    await api.changePrivatDokSichtbarkeit(dok.folge_id, {
      neue_sichtbarkeit: selected!,
      colab_gruppe_id: (selected === 'colab' || selected === 'team') ? colabGruppeId : null,
      per_email_informiert: perEmail,
      anderweitig_bestaetigt: anderweitig,
    })
    onDone()
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.4)', display: 'grid', placeItems: 'center' }} onClick={onClose}>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, width: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Sichtbarkeit ändern</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {dok.folge_nummer ? `Folge ${dok.folge_nummer}` : ''}{dok.folge_nummer && dok.folgen_titel ? ' — ' : ''}{dok.folgen_titel ?? ''}
              </div>
            </div>
            <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 4 }}>✕</button>
          </div>
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {options.map(o => (
              <button key={o.value} onClick={() => { setSelected(o.value); setColabGruppeId(null) }} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                border: `1px solid ${selected === o.value ? (SICHT_COLORS[o.value] ?? '#000') : 'var(--border)'}`,
                borderRadius: 8, background: selected === o.value ? `${SICHT_COLORS[o.value]}22` : 'transparent',
                cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', width: '100%',
              }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: SICHT_COLORS[o.value] ?? '#757575', flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{o.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1 }}>{o.desc}</div>
                </div>
              </button>
            ))}
            {selected === 'colab' && (
              <select
                value={colabGruppeId ?? ''}
                onChange={e => setColabGruppeId(e.target.value || null)}
                style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-surface)', fontSize: 13, marginTop: 4 }}
              >
                <option value="">Keine Gruppe gewählt</option>
                {gruppen.filter(g => g.typ === 'colab').map(g => <option key={g.id} value={String(g.id)}>{g.name}</option>)}
              </select>
            )}
            {selected === 'team' && (
              <select
                value={colabGruppeId ?? ''}
                onChange={e => setColabGruppeId(e.target.value || null)}
                style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-surface)', fontSize: 13, marginTop: 4 }}
              >
                <option value="">Keine Gruppe gewählt</option>
                {gruppen.filter(g => g.typ === 'team').map(g => <option key={g.id} value={String(g.id)}>{g.name}</option>)}
              </select>
            )}
          </div>
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn" onClick={onClose}>Abbrechen</button>
            <button className="btn primary" onClick={handleSave} disabled={saving || !selected}>
              Ändern
            </button>
          </div>
        </div>
      </div>
      {notifyOpen && selected && (
        <NotifyDialog
          dok={dok}
          neueSichtbarkeit={selected}
          colabGruppeId={colabGruppeId}
          onConfirm={handleNotifyConfirm}
          onClose={() => { setNotifyOpen(false); onClose() }}
        />
      )}
    </>
  )
}

type SortCol = 'folge_nummer' | 'folgen_titel' | 'werk_typ' | 'version_nummer' | 'werk_label' | 'ersteller_name' | 'privat_seit'

function AuditLogTab({ produktionId }: { produktionId: string }) {
  const [log, setLog] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!produktionId) return
    setLoading(true)
    api.getPrivateDokAuditLog(produktionId, 200, 0)
      .then(setLog).catch(() => setLog([]))
      .finally(() => setLoading(false))
  }, [produktionId])

  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }) + ' ' + new Date(d).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '—'

  const tdStyle: React.CSSProperties = { padding: '7px 10px', fontSize: 12, borderBottom: '1px solid var(--border)', verticalAlign: 'middle' }
  const thStyle: React.CSSProperties = { padding: '8px 10px', fontWeight: 600, fontSize: 11, color: 'var(--text-secondary)', textAlign: 'left', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 1, whiteSpace: 'nowrap' }

  return (
    <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px' }}>Audit-Log</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
          Protokoll aller Sichtbarkeitsänderungen an privaten Dokumenten.
        </p>
      </div>
      {!produktionId ? (
        <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>Bitte zuerst eine Produktion auswählen.</div>
      ) : loading ? (
        <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>Lädt…</div>
      ) : log.length === 0 ? (
        <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>Noch keine Einträge.</div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={thStyle}>Zeitpunkt</th>
                <th style={thStyle}>Folge</th>
                <th style={thStyle}>Titel</th>
                <th style={thStyle}>Von</th>
                <th style={thStyle}>Nach</th>
                <th style={thStyle}>Autor</th>
                <th style={thStyle}>Geändert von</th>
                <th style={thStyle}>Info</th>
              </tr>
            </thead>
            <tbody>
              {log.map(e => (
                <tr key={e.id} style={{ background: 'var(--bg-surface)' }}>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{fmtDate(e.geaendert_am)}</td>
                  <td style={tdStyle}>{e.folge_nummer ?? <span style={{ color: 'var(--text-secondary)' }}>—</span>}</td>
                  <td style={{ ...tdStyle, maxWidth: 180 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.folgen_titel ?? '—'}</div>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ padding: '2px 7px', borderRadius: 99, fontSize: 11, background: `${SICHT_COLORS[e.alte_sichtbarkeit] ?? '#757575'}22`, color: SICHT_COLORS[e.alte_sichtbarkeit] ?? '#757575' }}>
                      {SICHT_LABELS[e.alte_sichtbarkeit] ?? e.alte_sichtbarkeit}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ padding: '2px 7px', borderRadius: 99, fontSize: 11, background: `${SICHT_COLORS[e.neue_sichtbarkeit] ?? '#757575'}22`, color: SICHT_COLORS[e.neue_sichtbarkeit] ?? '#757575' }}>
                      {SICHT_LABELS[e.neue_sichtbarkeit] ?? e.neue_sichtbarkeit}
                    </span>
                  </td>
                  <td style={tdStyle}>{e.autor_name ?? <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>unbekannt</span>}</td>
                  <td style={tdStyle}>{e.geaendert_von_name ?? <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>unbekannt</span>}</td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap', fontSize: 11, color: 'var(--text-secondary)' }}>
                    {e.per_email_informiert ? '✉ Email' : e.anderweitig_bestaetigt ? '✓ Manuell' : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function PrivateDokumenteTab({ produktionId }: { produktionId: string }) {
  const [view, setView] = useState<'liste' | 'audit'>('liste')
  const [filter, setFilter] = useState<FilterType>('1')
  const [settings, setSettings] = useState<{ filter_2_enabled: boolean; filter_3_enabled: boolean }>({ filter_2_enabled: false, filter_3_enabled: false })
  const [dokumente, setDokumente] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [changeDok, setChangeDok] = useState<any>(null)
  const [search, setSearch] = useState('')
  const [sortCol, setSortCol] = useState<SortCol>('privat_seit')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const load = async () => {
    setLoading(true)
    try { setDokumente(await api.getPrivateDokumente(produktionId || '', filter)) }
    catch { setDokumente([]) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    api.getPrivateDokSettings().then(s => setSettings(s)).catch(() => {})
  }, [])

  useEffect(() => { load() }, [filter, produktionId])

  const activeFilters: FilterType[] = ['1', ...(settings.filter_2_enabled ? ['2' as FilterType] : []), ...(settings.filter_3_enabled ? ['3' as FilterType] : [])]
  const showTabs = activeFilters.length > 1

  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }) + ' ' + new Date(d).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '—'

  const handleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const q = search.toLowerCase()
  const filtered = dokumente.filter(d =>
    !q ||
    String(d.folge_nummer ?? '').includes(q) ||
    (d.folgen_titel ?? '').toLowerCase().includes(q) ||
    (d.werk_typ ?? '').toLowerCase().includes(q) ||
    (d.werk_label ?? '').toLowerCase().includes(q) ||
    (d.ersteller_name ?? '').toLowerCase().includes(q)
  )

  const sorted = [...filtered].sort((a, b) => {
    let va = a[sortCol] ?? ''
    let vb = b[sortCol] ?? ''
    if (sortCol === 'version_nummer' || sortCol === 'folge_nummer') {
      va = Number(va) || 0
      vb = Number(vb) || 0
      return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number)
    }
    if (sortCol === 'privat_seit') {
      va = va ? new Date(va as string).getTime() : 0
      vb = vb ? new Date(vb as string).getTime() : 0
      return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number)
    }
    return sortDir === 'asc'
      ? String(va).localeCompare(String(vb), 'de')
      : String(vb).localeCompare(String(va), 'de')
  })

  const SortIcon = ({ col }: { col: SortCol }) => (
    <span style={{ marginLeft: 4, opacity: sortCol === col ? 1 : 0.3, fontSize: 10 }}>
      {sortCol === col ? (sortDir === 'asc' ? '▲' : '▼') : '▲▼'}
    </span>
  )

  const thStyle = (col: SortCol): React.CSSProperties => ({
    padding: '8px 10px', fontWeight: 600, fontSize: 11, color: 'var(--text-secondary)',
    textAlign: 'left', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
    background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)',
    position: 'sticky', top: 0, zIndex: 1,
  })

  const tdStyle: React.CSSProperties = {
    padding: '8px 10px', fontSize: 12, borderBottom: '1px solid var(--border)',
    verticalAlign: 'middle',
  }

  if (view === 'audit') return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'absolute', top: 20, right: 28, display: 'flex', gap: 4 }}>
        <button onClick={() => setView('liste')} style={{ padding: '4px 12px', fontSize: 11, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)' }}>Liste</button>
        <button onClick={() => setView('audit')} style={{ padding: '4px 12px', fontSize: 11, borderRadius: 6, border: '1px solid #007AFF', background: 'rgba(0,122,255,0.08)', cursor: 'pointer', color: '#007AFF', fontWeight: 600 }}>Audit-Log</button>
      </div>
      <AuditLogTab produktionId={produktionId} />
    </div>
  )

  return (
    <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px' }}>Private Dokumente</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
            Episoden und Dokumente mit mindestens einer privaten Fassung — Sichtbarkeit kann hier im Namen der Produktion geändert werden.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0, marginTop: 2 }}>
          <button onClick={() => setView('liste')} style={{ padding: '4px 12px', fontSize: 11, borderRadius: 6, border: '1px solid #007AFF', background: 'rgba(0,122,255,0.08)', cursor: 'pointer', color: '#007AFF', fontWeight: 600 }}>Liste</button>
          <button onClick={() => setView('audit')} style={{ padding: '4px 12px', fontSize: 11, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)' }}>Audit-Log</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {showTabs && activeFilters.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '5px 14px', fontSize: 12, fontWeight: 500, borderRadius: 6, cursor: 'pointer',
            border: `1px solid ${filter === f ? '#007AFF' : 'var(--border)'}`,
            background: filter === f ? 'rgba(0,122,255,0.08)' : 'transparent',
            color: filter === f ? '#007AFF' : 'var(--text-secondary)',
          }}>
            {FILTER_LABELS[f]}
          </button>
        ))}
        <input
          type="text"
          placeholder="Suchen…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding: '5px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-surface)', minWidth: 180, marginLeft: 'auto' }}
        />
        {!loading && <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{sorted.length} Einträge</span>}
      </div>

      {!produktionId ? (
        <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
          Bitte zuerst eine Produktion auswählen.
        </div>
      ) : loading ? (
        <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>Lädt…</div>
      ) : sorted.length === 0 ? (
        <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
          {dokumente.length === 0 ? 'Keine privaten Dokumente in diesem Filter.' : 'Keine Treffer für die Suche.'}
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={thStyle('folge_nummer')} onClick={() => handleSort('folge_nummer')}>
                  Folge <SortIcon col="folge_nummer" />
                </th>
                <th style={thStyle('folgen_titel')} onClick={() => handleSort('folgen_titel')}>
                  Titel <SortIcon col="folgen_titel" />
                </th>
                <th style={thStyle('werk_typ')} onClick={() => handleSort('werk_typ')}>
                  Werktyp <SortIcon col="werk_typ" />
                </th>
                <th style={thStyle('version_nummer')} onClick={() => handleSort('version_nummer')}>
                  Version <SortIcon col="version_nummer" />
                </th>
                <th style={thStyle('werk_label')} onClick={() => handleSort('werk_label')}>
                  Label <SortIcon col="werk_label" />
                </th>
                <th style={thStyle('ersteller_name')} onClick={() => handleSort('ersteller_name')}>
                  Autor <SortIcon col="ersteller_name" />
                </th>
                <th style={thStyle('privat_seit')} onClick={() => handleSort('privat_seit')}>
                  Privat seit <SortIcon col="privat_seit" />
                </th>
                <th style={{ ...thStyle('privat_seit'), cursor: 'default', width: 120 }} />
              </tr>
            </thead>
            <tbody>
              {sorted.map(dok => (
                <tr key={dok.werk_id} style={{ background: 'var(--bg-surface)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-subtle)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-surface)')}
                >
                  <td style={tdStyle}>
                    {dok.folge_nummer ? (
                      <span style={{ fontWeight: 600 }}>{dok.folge_nummer}</span>
                    ) : (
                      <span style={{ padding: '1px 6px', background: 'rgba(0,200,83,0.1)', color: '#00C853', borderRadius: 99, fontSize: 10, fontWeight: 600 }}>Frei</span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, maxWidth: 220 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {dok.folgen_titel ?? <span style={{ color: 'var(--text-secondary)' }}>—</span>}
                    </div>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ padding: '2px 7px', background: 'var(--bg-subtle)', borderRadius: 99, fontSize: 11, whiteSpace: 'nowrap' }}>
                      {dok.werk_typ ?? '—'}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    {dok.version_nummer != null ? `v${dok.version_nummer}` : '—'}
                  </td>
                  <td style={{ ...tdStyle, maxWidth: 160 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                      {dok.werk_label ?? '—'}
                    </div>
                  </td>
                  <td style={tdStyle}>
                    {dok.ersteller_name ?? <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>unbekannt</span>}
                  </td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                    {fmtDate(dok.privat_seit)}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <button
                      className="btn"
                      style={{ fontSize: 11, padding: '4px 10px', whiteSpace: 'nowrap' }}
                      onClick={() => setChangeDok(dok)}
                    >
                      Sichtbarkeit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {changeDok && (
        <SichtbarkeitChangeModal
          dok={changeDok}
          produktionId={produktionId}
          onDone={() => { setChangeDok(null); load() }}
          onClose={() => setChangeDok(null)}
        />
      )}
    </div>
  )
}

// ── Main Page Export ──────────────────────────────────────────────────────────────

export default function DrehbuchkoordinationPage() {
  const [activeTab, setActiveTab] = useState('allgemein')
  const [headerSlot, setHeaderSlot] = useState<HTMLDivElement | null>(null)
  const [hasAccess, setHasAccess] = useState<boolean | null>(null)
  const [hasPrivateDokAccess, setHasPrivateDokAccess] = useState(false)
  const [kopierenModalOpen, setKopierenModalOpen] = useState(false)
  const [seitenformat, setSeitenformat] = useState<'a4' | 'letter'>('a4')
  const [seitenformatSaving, setSeitenformatSaving] = useState(false)
  const [margins, setMargins] = useState({ oben: 25, unten: 20, links: 25, rechts: 20 })
  const [isNarrow, setIsNarrow] = useState(() => window.innerWidth < 768)
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768)
  const [statSections, setStatSections] = useState<StatModalSection[]>([...DEFAULT_SECTIONS])
  const navigate = useNavigate()
  const { selectedProduction, productions } = useSelectedProduction()
  const { t } = useTerminologie()

  const produktionId = selectedProduction?.id ?? ''

  // Check Private-Dokumente access
  useEffect(() => {
    api.getPrivateDokSettings()
      .then(() => setHasPrivateDokAccess(true))
      .catch(() => setHasPrivateDokAccess(false))
  }, [])

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
        if (data?.page_margin_mm) {
          try { setMargins(m => ({ ...m, ...JSON.parse(data.page_margin_mm) })) } catch {}
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
    await fetch(`/api/dk-settings/${produktionId}/app-settings/page_margin_mm`, {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: JSON.stringify(next) }),
    }).catch(() => {})
    window.dispatchEvent(new CustomEvent('app-settings-changed', { detail: { productionId: produktionId } }))
  }

  // Arrow key tab navigation:
  // ↑↓ = Sidebar (DK_TABS), ←→ = Sub-Tabs (FORMAT_SUB_NAV wenn aktiv)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) return
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return

      const isInSubNav = FORMAT_TEMPLATE_TABS.includes(activeTab)

      if (isInSubNav) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          const subIdx = FORMAT_SUB_NAV.findIndex(t => t.id === activeTab)
          if (subIdx === -1) return
          if (e.key === 'ArrowLeft' && subIdx > 0) setActiveTab(FORMAT_SUB_NAV[subIdx - 1].id)
          if (e.key === 'ArrowRight' && subIdx < FORMAT_SUB_NAV.length - 1) setActiveTab(FORMAT_SUB_NAV[subIdx + 1].id)
        }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          // ↑↓ verlässt Sub-Nav — navigiert DK_TABS vom dokument-typen-Eintrag aus
          const parentIdx = DK_TABS.findIndex(t => t.id === 'dokument-typen')
          if (e.key === 'ArrowUp' && parentIdx > 0) setActiveTab(DK_TABS[parentIdx - 1].id)
          if (e.key === 'ArrowDown' && parentIdx < DK_TABS.length - 1) setActiveTab(DK_TABS[parentIdx + 1].id)
        }
      } else {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          const idx = DK_TABS.findIndex(t => t.id === activeTab)
          if (idx === -1) return
          if (e.key === 'ArrowUp' && idx > 0) setActiveTab(DK_TABS[idx - 1].id)
          if (e.key === 'ArrowDown' && idx < DK_TABS.length - 1) setActiveTab(DK_TABS[idx + 1].id)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeTab])

  useEffect(() => {
    const check = () => {
      const narrow = window.innerWidth < 768
      setIsNarrow(narrow)
      if (!narrow) setSidebarOpen(true)
    }
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Sidebar auf Tablet schließen wenn Tab wechselt
  useEffect(() => {
    if (isNarrow) setSidebarOpen(false)
  }, [activeTab]) // eslint-disable-line

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
        return produktionId ? <VorlagenTab productionId={produktionId} seitenformat={seitenformat} margins={margins} /> : <NoProduction />
      case 'kopf-fusszeilen':
        return produktionId ? <KopfFusszeileTab productionId={produktionId} seitenformat={seitenformat} margins={margins} /> : <NoProduction />
      case 'freie-dok-labels':
        return produktionId ? <FreieDokLabelsTab produktionId={produktionId} /> : <NoProduction />
      case 'sonstige-dokumente':
        return produktionId ? <SonstigeDokumenteTab produktionId={produktionId} /> : <NoProduction />
      case 'autorenplan':
        return produktionId ? <AutorenplanTab produktionDbId={produktionId} /> : <NoProduction />
      case 'rollen-freigabe':
        return produktionId ? <RollenFreigabeTab produktionId={produktionId} /> : <NoProduction />
      case 'drehbuch-checks':
        return produktionId ? <DrehbuchChecksTab produktionId={produktionId} /> : <NoProduction />
      case 'inhaltskennzeichnung':
        return produktionId ? <InhaltskennzeichnungTab produktionId={produktionId} /> : <NoProduction />
      case 'synopsen-ki':
        return produktionId ? <SynopsenKiTab produktionId={produktionId} /> : <NoProduction />
      case 'verlauf-sicherung':
        return <VerlaufSicherungTab produktionId={produktionId} />
      case 'export-log':
        return <WasserzeichenTab />
      case 'private-dokumente':
        return <PrivateDokumenteTab produktionId={produktionId} />
      default:
        return <Placeholder label={activeTab} />
    }
  }

  return (
    <>
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
          {/* Hamburger — nur auf Tablet/schmalem Viewport */}
          {isNarrow && (
            <button
              onClick={() => setSidebarOpen(o => !o)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 36, height: 36, flexShrink: 0,
                background: sidebarOpen ? 'var(--bg-surface)' : 'none',
                border: '1px solid var(--border)',
                borderRadius: 7, cursor: 'pointer',
                fontSize: 15, color: 'var(--text-primary)',
              }}
              aria-label={sidebarOpen ? 'Menü schließen' : 'Menü öffnen'}
            >
              {sidebarOpen ? '✕' : '☰'}
            </button>
          )}
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
          {/* Format+Ränder (Formatierung/KZ-FZ/Vorlagen) + Preset-Slot (nur Drehbuch-Formatierung) */}
          {FORMAT_TEMPLATE_TABS.filter(t => t !== 'stockshot-templates' && t !== 'freie-dok-labels').includes(activeTab) && produktionId ? (
            <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              {/* Label links */}
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', flexShrink: 0, whiteSpace: 'nowrap', background: 'var(--bg-subtle)', borderRadius: 5, padding: '3px 8px' }}>
                Standard-Einstellungen<br />für das gesamte Dokument:
              </span>
              {/* Format + Preset übereinander, linksbündig */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                {/* Zeile 1: Format + Ränder */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', flexShrink: 0 }}>Format:</span>
                  {activeTab === 'dokument-typen' ? (
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
                  ) : (
                    <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-primary)', flexShrink: 0 }}>
                      {seitenformat === 'a4' ? 'A4' : 'Letter'}
                    </span>
                  )}
                  <div style={{ width: 1, height: 14, background: 'var(--border)', flexShrink: 0 }} />
                  <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', flexShrink: 0 }}>Ränder mm:</span>
                  {activeTab === 'dokument-typen' ? (
                    (['oben', 'unten', 'links', 'rechts'] as const).map(side => (
                      <label key={side} style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 10, color: 'var(--text-secondary)', flexShrink: 0 }}>
                        <span>{side.charAt(0).toUpperCase() + side.slice(1)}</span>
                        <input type="number" min={0} max={60} value={margins[side]}
                          onChange={e => { const v = Math.max(0, Math.min(60, parseInt(e.target.value, 10) || 0)); setMargins(m => ({ ...m, [side]: v })) }}
                          onBlur={() => saveMargins(margins)}
                          style={{ width: 36, padding: '1px 3px', borderRadius: 3, border: '1px solid var(--border)', fontSize: 10, background: 'var(--bg-surface)', color: 'var(--text-primary)', textAlign: 'center' }} />
                      </label>
                    ))
                  ) : (
                    <span style={{ fontSize: 10, color: 'var(--text-primary)', flexShrink: 0 }}>
                      O:{margins.oben} U:{margins.unten} L:{margins.links} R:{margins.rechts}
                    </span>
                  )}
                </div>
                {/* Zeile 2: Preset-Slot (nur DokumentTypenTab portalt hierhin) */}
                <div ref={setHeaderSlot} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }} />
              </div>
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

          {/* Overlay für mobiles Sidebar-Menü */}
          {isNarrow && sidebarOpen && (
            <div
              onClick={() => setSidebarOpen(false)}
              style={{
                position: 'fixed', inset: 0,
                background: 'rgba(0,0,0,0.45)',
                zIndex: 99,
                touchAction: 'none',
              }}
            />
          )}

          {/* Sidebar */}
          <div style={{
            width: 200, flexShrink: 0,
            background: 'var(--bg-subtle)',
            borderRight: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            ...(isNarrow ? {
              position: 'fixed',
              top: 0,
              bottom: 0,
              left: 0,
              zIndex: 100,
              transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
              transition: 'transform 0.25s ease',
            } : {}),
          }}>
            {/* Nav items */}
            <nav style={{ flex: 1, paddingTop: 8 }}>
              {[...DK_TABS, ...(hasPrivateDokAccess ? [{ id: 'private-dokumente', label: 'Private Dokumente' }] : [])].map(tab => (
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
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {tab.id === 'drehbuch-checks' ? `${t('drehbuch', 'c')}-Checks` : tab.label}
                    {(tab as { badge?: string }).badge && (
                      <span style={{
                        fontSize: 9,
                        fontWeight: 600,
                        padding: '1px 5px',
                        borderRadius: 4,
                        background: 'var(--bg-subtle)',
                        color: 'var(--text-secondary)',
                        letterSpacing: '0.03em',
                        lineHeight: 1.6,
                        flexShrink: 0,
                      }}>
                        {(tab as { badge?: string }).badge}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </nav>

            {/* Divider + Copy button at bottom */}
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, padding: '10px 16px' }}>
              <button
                onClick={() => produktionId && setKopierenModalOpen(true)}
                disabled={!produktionId}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  width: '100%', textAlign: 'left',
                  padding: '7px 10px',
                  fontSize: 12, fontWeight: 500,
                  color: produktionId ? 'var(--text-secondary)' : 'var(--text-muted)',
                  background: 'var(--bg-subtle)',
                  border: '1px solid var(--border)', borderRadius: 7,
                  cursor: produktionId ? 'pointer' : 'not-allowed',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                <span style={{ fontSize: 14 }}>↓</span>
                <span>Von Produktion kopieren</span>
              </button>
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
                    {id === 'dokument-typen' ? `${t('drehbuch', 'c')}-Formatierung` : label}
                  </button>
                ))}
              </div>
            )}
            <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
              <div style={{ maxWidth: 1100, margin: '0 auto' }}>
                {renderContent()}
              </div>
            </div>
          </div>
        </div>
      </div>

    </AppShell>

    {kopierenModalOpen && produktionId && (
      <KopierenModal
        produktionId={produktionId}
        onClose={() => setKopierenModalOpen(false)}
        onCopied={() => {
          setKopierenModalOpen(false)
          const cur = activeTab
          setActiveTab('')
          setTimeout(() => setActiveTab(cur), 0)
        }}
      />
    )}
    </>
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
    <div>
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
    <div>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

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

// ── Rollen-Freigabe Tab ──────────────────────────────────────────────────────

type FreigabeConfig = {
  freigabe_aktiv: boolean
  erinnerung_nach_tagen: number
  deckt_rollen: boolean
  deckt_motive: boolean
  deckt_neue_szenen: boolean
  quorum: 'first_responder' | 'alle'
  lock_trigger_fassungslabel: string | null
  lock_trigger_werkstufen_typ: string | null
  lock_override_aktiv: boolean
  lock_override_rollen: string[]
  ot_obergrenze_pro_block: number | null
}

const DEFAULT_CONFIG: FreigabeConfig = {
  freigabe_aktiv: false, erinnerung_nach_tagen: 3,
  deckt_rollen: true, deckt_motive: false, deckt_neue_szenen: false,
  quorum: 'first_responder', lock_trigger_fassungslabel: null, lock_trigger_werkstufen_typ: null,
  lock_override_aktiv: false, lock_override_rollen: [],
  ot_obergrenze_pro_block: null,
}

const STUFE_LABELS: Record<string, string> = { obligatorisch: 'Obligatorisch', review: 'Review', notify: 'Info' }
const TYP_LABELS: Record<string, string> = { budget: 'Budget', dispo: 'Dispo' }

function ToggleBtn({ on, onToggle, disabled }: { on: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      style={{
        width: 40, height: 22, borderRadius: 11, border: 'none', cursor: disabled ? 'default' : 'pointer',
        background: on ? '#00C853' : 'var(--border)', position: 'relative', transition: 'background 0.2s', flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: on ? 21 : 3,
        width: 16, height: 16, borderRadius: '50%', background: '#fff',
        transition: 'left 0.2s',
      }} />
    </button>
  )
}

type OtBlock = {
  block_nummer: number; folge_von: number; folge_bis: number
  dreh_von: string | null; dreh_bis: string | null
  ot_anzahl: number; ueberschritten: boolean
}
type OtMengenData = {
  ot_obergrenze_pro_block: number | null
  blocks: OtBlock[] | null
  linked: boolean
  error?: string
}

function RollenFreigabeTab({ produktionId }: { produktionId: string }) {
  const [config, setConfig] = useState<FreigabeConfig>(DEFAULT_CONFIG)
  const [genehmiger, setGenehmiger] = useState<any[]>([])
  const [meta, setMeta] = useState<{ users: any[]; roles: any[] }>({ users: [], roles: [] })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [otData, setOtData] = useState<OtMengenData | null>(null)
  const [otInputVal, setOtInputVal] = useState<string>('')
  // New genehmiger form
  const [werkstufenItems, setWerkstufenItems] = useState<{ label: string; typ: string }[]>([])
  const [newTyp, setNewTyp] = useState<'user' | 'rolle'>('user')
  const [newUserId, setNewUserId] = useState('')
  const [newRolle, setNewRolle] = useState('')
  const [newFreigabeTyp, setNewFreigabeTyp] = useState('budget')
  const [newStufe, setNewStufe] = useState('obligatorisch')

  const apiFetch = (url: string, opts?: RequestInit) =>
    fetch(`/api${url}`, { credentials: 'include', ...opts }).then(r => r.json())
  const apiPut = (url: string, body: any) =>
    apiFetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const apiPost = (url: string, body: any) =>
    apiFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const apiDelete = (url: string) =>
    apiFetch(url, { method: 'DELETE' })

  const loadOtData = () =>
    apiFetch(`/rollen-freigabe/${produktionId}/ot-mengenkontrolle`).then(setOtData).catch(() => {})

  useEffect(() => {
    Promise.all([
      apiFetch(`/rollen-freigabe/${produktionId}/config`),
      apiFetch(`/rollen-freigabe/${produktionId}/genehmiger`),
      apiFetch('/rollen-freigabe/meta'),
      apiFetch(`/rollen-freigabe/${produktionId}/ot-mengenkontrolle`),
      apiFetch(`/rollen-freigabe/${produktionId}/werkstufen-labels`),
    ]).then(([cfg, gen, m, ot, labels]) => {
      const merged = { ...DEFAULT_CONFIG, ...cfg }
      setConfig(merged)
      setOtInputVal(merged.ot_obergrenze_pro_block != null ? String(merged.ot_obergrenze_pro_block) : '')
      setGenehmiger(Array.isArray(gen) ? gen : [])
      if (m && !m.error) setMeta(m)
      if (ot && !ot.error) setOtData(ot)
      if (Array.isArray(labels)) setWerkstufenItems(labels)
    }).finally(() => setLoading(false))
  }, [produktionId])

  async function patchConfig(patch: Partial<FreigabeConfig>) {
    setSaving(true)
    try {
      const updated = await apiPut(`/rollen-freigabe/${produktionId}/config`, { ...config, ...patch })
      if (!updated?.error) setConfig(prev => ({ ...prev, ...updated }))
    } finally { setSaving(false) }
  }

  async function addGenehmiger() {
    const identifier = newTyp === 'user' ? newUserId : newRolle
    if (!identifier) return
    const body = newTyp === 'user'
      ? { user_id: identifier, freigabe_typ: newFreigabeTyp, stufe: newStufe }
      : { rolle: identifier, freigabe_typ: newFreigabeTyp, stufe: newStufe }
    const g = await apiPost(`/rollen-freigabe/${produktionId}/genehmiger`, body)
    if (g && !g.error) {
      setGenehmiger(prev => [...prev, g])
      setNewUserId(''); setNewRolle('')
    }
  }

  async function removeGenehmiger(id: number) {
    await apiDelete(`/rollen-freigabe/${produktionId}/genehmiger/${id}`)
    setGenehmiger(prev => prev.filter(g => g.id !== id))
  }

  async function changeStufe(g: any, stufe: string) {
    const updated = await apiPut(`/rollen-freigabe/${produktionId}/genehmiger/${g.id}`, { stufe })
    if (!updated?.error) setGenehmiger(prev => prev.map(x => x.id === g.id ? { ...x, stufe } : x))
  }

  const sec: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 12, marginTop: 28 }
  const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }
  const lbl: React.CSSProperties = { fontSize: 13, color: 'var(--text-secondary)', flex: 1 }
  const sel: React.CSSProperties = { padding: '5px 9px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13, background: 'var(--bg-surface)', color: 'var(--text-primary)' }

  if (loading) return <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Lade...</div>

  const budgetGenehmiger = genehmiger.filter(g => g.freigabe_typ === 'budget')
  const dispoGenehmiger = genehmiger.filter(g => g.freigabe_typ === 'dispo')

  const renderGenehmiger = (list: any[]) => {
    if (list.length === 0) return (
      <div style={{ color: 'var(--text-secondary)', fontSize: 13, padding: '8px 0' }}>Noch keine Genehmiger konfiguriert.</div>
    )
    return list.map(g => {
      const name = g.user_id
        ? (meta.users.find(u => u.id === g.user_id)?.name || g.user_id)
        : `Rolle: ${g.rolle}`
      return (
        <div key={g.id} style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
          padding: '7px 10px', borderRadius: 8,
          border: '1px solid var(--border)', background: 'var(--bg-surface)',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>{name}</span>
            {g.user_id && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>(User)</span>}
          </div>
          <select
            value={g.stufe}
            onChange={e => changeStufe(g, e.target.value)}
            style={{ ...sel, fontSize: 11 }}
          >
            <option value="obligatorisch">Obligatorisch</option>
            <option value="review">Review</option>
            <option value="notify">Info</option>
          </select>
          <button
            onClick={() => removeGenehmiger(g.id)}
            style={{ padding: '3px 7px', borderRadius: 5, border: '1px solid var(--border)', background: 'none', color: '#FF3B30', cursor: 'pointer', fontSize: 12 }}
          >✕</button>
        </div>
      )
    })
  }

  return (
    <div>
      {/* Link */}
      <div style={{ marginBottom: 16 }}>
        <a href="/freigaben" style={{ fontSize: 13, color: '#007AFF', textDecoration: 'none' }}>
          → Ausstehende Freigaben anzeigen
        </a>
      </div>

      {/* ── Workflow ── */}
      <p style={sec}>Workflow</p>
      <div style={row}>
        <span style={lbl}>
          <Tooltip text="Schaltet das gesamte Freigabe-System ein oder aus. Wenn deaktiviert, können Rollen und Szenen ohne Genehmigung hinzugefügt werden.">
            Freigabe-Workflow aktiv
          </Tooltip>
        </span>
        <ToggleBtn on={config.freigabe_aktiv} onToggle={() => patchConfig({ freigabe_aktiv: !config.freigabe_aktiv })} disabled={saving} />
      </div>
      <div style={row}>
        <span style={lbl}>
          <Tooltip text="Fall B: Neue Rollen oder Motive, die noch nicht in der Datenbank existieren, müssen vor der Anlage genehmigt werden. Granularität: pro Rolle/Motiv und Produktion. Zuständig: Herstellungs-/Produktionsleitung.">
            Budget-Freigabe (Rollenvergabe)
          </Tooltip>
        </span>
        <ToggleBtn on={config.deckt_rollen} onToggle={() => patchConfig({ deckt_rollen: !config.deckt_rollen })} disabled={saving || !config.freigabe_aktiv} />
      </div>
      <div style={row}>
        <span style={lbl}>
          <Tooltip text="Fall A: Cast-Änderungen und neue Szenen-Einsätze nach dem Lock benötigen eine Genehmigung. Granularität: pro Szene. Zuständig: Drehplanung/Aufnahmeleitung.">
            Dispo-Freigabe (Szenen-Einsatz)
          </Tooltip>
        </span>
        <ToggleBtn on={config.deckt_motive} onToggle={() => patchConfig({ deckt_motive: !config.deckt_motive })} disabled={saving || !config.freigabe_aktiv} />
      </div>
      <div style={row}>
        <span style={lbl}>
          <Tooltip text={'Legt fest, wie viele Genehmiger zustimmen müssen.\n\nFirst-Responder: Der erste Genehmiger, der entscheidet, bestimmt das Ergebnis für alle.\n\nAlle: Alle obligatorischen Genehmiger müssen zustimmen, bevor die Anfrage gilt.'}>
            Quorum
          </Tooltip>
        </span>
        <select
          value={config.quorum}
          onChange={e => patchConfig({ quorum: e.target.value as any })}
          disabled={saving || !config.freigabe_aktiv}
          style={sel}
        >
          <option value="first_responder">First-Responder (erster Genehmiger entscheidet)</option>
          <option value="alle">Alle (alle obligatorischen müssen zustimmen)</option>
        </select>
      </div>
      <div style={row}>
        <span style={lbl}>
          <Tooltip text="Anzahl Tage, nach denen automatisch eine Erinnerungsmail an noch ausstehende Genehmiger gesendet wird.">
            Erinnerung nach
          </Tooltip>
        </span>
        <select
          value={config.erinnerung_nach_tagen}
          onChange={e => patchConfig({ erinnerung_nach_tagen: parseInt(e.target.value) })}
          disabled={saving}
          style={sel}
        >
          {[1, 2, 3, 5, 7, 14].map(d => (
            <option key={d} value={d}>{d} Tag{d !== 1 ? 'en' : ''}</option>
          ))}
        </select>
      </div>

      {/* ── Lock-Gate ── */}
      <p style={sec}>
        <Tooltip text="Steuert das Zusammenspiel zwischen offenen Freigabe-Anfragen und dem Folgen-Lock.">
          Lock-Gate
        </Tooltip>
      </p>
      <div style={row}>
        <span style={lbl}>
          <Tooltip text="Erlaubt der DK, eine Folge trotz noch offener Freigabe-Anfragen zu sperren. Ohne diesen Override kann erst gesperrt werden, wenn alle Anfragen entschieden sind.">
            Override erlaubt (trotz offener Freigaben sperren)
          </Tooltip>
        </span>
        <ToggleBtn on={config.lock_override_aktiv} onToggle={() => patchConfig({ lock_override_aktiv: !config.lock_override_aktiv })} disabled={saving} />
      </div>
      <div style={row}>
        <span style={lbl}>
          <Tooltip text="Ab dieser Fassung (inkl. aller jüngeren Fassungen desselben Typs) ist der Lock-Gate aktiv — Änderungen erfordern eine Dispo-Freigabe. Storyline-Fassungen sind davon unabhängig.">
            Lock-Trigger ab Fassung
          </Tooltip>
        </span>
        <select
          value={config.lock_trigger_fassungslabel && config.lock_trigger_werkstufen_typ
            ? `${config.lock_trigger_fassungslabel}|||${config.lock_trigger_werkstufen_typ}`
            : ''}
          onChange={e => {
            const raw = e.target.value
            if (!raw) {
              setConfig(prev => ({ ...prev, lock_trigger_fassungslabel: null, lock_trigger_werkstufen_typ: null }))
              patchConfig({ lock_trigger_fassungslabel: null, lock_trigger_werkstufen_typ: null })
            } else {
              const [label, typ] = raw.split('|||')
              setConfig(prev => ({ ...prev, lock_trigger_fassungslabel: label, lock_trigger_werkstufen_typ: typ }))
              patchConfig({ lock_trigger_fassungslabel: label, lock_trigger_werkstufen_typ: typ })
            }
          }}
          style={{ ...sel, flex: 1 }}
          disabled={saving}
        >
          <option value="">— kein automatischer Trigger —</option>
          {werkstufenItems.map(item => {
            const key = `${item.label}|||${item.typ}`
            const typLabel = item.typ === 'drehbuch' ? 'Drehbuch' : item.typ === 'storyline' ? 'Storyline' : item.typ
            return <option key={key} value={key}>{item.label} ({typLabel})</option>
          })}
        </select>
      </div>

      {/* ── o.T.-Mengenkontrolle ── */}
      <p style={sec}>o.T.-Mengenkontrolle</p>
      <div style={row}>
        <span style={lbl}>
          <Tooltip text="Maximale Anzahl o.T.-Komparsen-Einsätze pro Block (Summe aller anzahl-Werte mit spiel_typ=o.t.). Leer lassen = keine Begrenzung.">
            Obergrenze o.T. pro Block
          </Tooltip>
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="number"
            min={1}
            value={otInputVal}
            onChange={e => setOtInputVal(e.target.value)}
            onBlur={() => {
              const v = otInputVal === '' ? null : parseInt(otInputVal)
              if (v === null || (!isNaN(v) && v > 0)) {
                patchConfig({ ot_obergrenze_pro_block: v }).then(loadOtData)
              }
            }}
            placeholder="unbegrenzt"
            style={{ ...sel, width: 110 }}
            disabled={saving}
          />
          {otInputVal !== '' && (
            <button
              onClick={() => { setOtInputVal(''); patchConfig({ ot_obergrenze_pro_block: null }).then(loadOtData) }}
              style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}
              title="Limit entfernen"
            >✕</button>
          )}
        </div>
      </div>

      {/* Mengenkontrolle-Tabelle */}
      {otData && (
        <div style={{ marginBottom: 16 }}>
          {!otData.linked && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>
              ℹ️ Produktion noch nicht mit der Produktionsdatenbank verknüpft — Block-Daten nicht verfügbar.
            </div>
          )}
          {otData.linked && otData.error && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>
              ℹ️ {otData.error}
            </div>
          )}
          {otData.linked && otData.blocks && otData.blocks.length > 0 && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 600, color: 'var(--text-muted)', fontSize: 11 }}>Block</th>
                    <th style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 600, color: 'var(--text-muted)', fontSize: 11 }}>Folgen</th>
                    <th style={{ textAlign: 'right', padding: '6px 10px', fontWeight: 600, color: 'var(--text-muted)', fontSize: 11 }}>o.T. Einsätze</th>
                    <th style={{ textAlign: 'right', padding: '6px 10px', fontWeight: 600, color: 'var(--text-muted)', fontSize: 11 }}>Limit</th>
                    <th style={{ textAlign: 'center', padding: '6px 10px', fontWeight: 600, color: 'var(--text-muted)', fontSize: 11 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {otData.blocks.map((blk, i) => {
                    const hasLimit = otData.ot_obergrenze_pro_block != null
                    const pct = hasLimit ? Math.min(100, Math.round(blk.ot_anzahl / otData.ot_obergrenze_pro_block! * 100)) : 0
                    const badgeColor = !hasLimit ? '#757575' : blk.ueberschritten ? '#FF3B30' : blk.ot_anzahl > otData.ot_obergrenze_pro_block! * 0.85 ? '#FF9500' : '#00C853'
                    const badgeLabel = !hasLimit ? '—' : blk.ueberschritten ? '⚠ Überschritten' : `${pct}%`
                    return (
                      <tr key={blk.block_nummer} style={{ borderBottom: i < otData.blocks!.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <td style={{ padding: '7px 10px', fontWeight: 600 }}>Block {blk.block_nummer}</td>
                        <td style={{ padding: '7px 10px', color: 'var(--text-secondary)' }}>
                          {blk.folge_von}–{blk.folge_bis}
                          {(blk.dreh_von || blk.dreh_bis) && (
                            <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-muted)' }}>
                              ({[blk.dreh_von, blk.dreh_bis].filter(Boolean).join(' – ')})
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600, color: blk.ueberschritten ? '#FF3B30' : 'var(--text-primary)' }}>
                          {blk.ot_anzahl}
                        </td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                          {hasLimit ? otData.ot_obergrenze_pro_block : '–'}
                        </td>
                        <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                          <span style={{
                            fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                            background: `${badgeColor}22`, color: badgeColor,
                          }}>{badgeLabel}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div style={{ padding: '6px 10px', fontSize: 10, color: 'var(--text-muted)', borderTop: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
                Basis: aktuellste Drehbuch-Werkstufe pro Folge · Zählt Summe aller o.T.-Komparsen-Anzahlen
                <button
                  onClick={loadOtData}
                  style={{ marginLeft: 10, fontSize: 10, color: '#007AFF', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  Aktualisieren
                </button>
              </div>
            </div>
          )}
          {otData.linked && otData.blocks?.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>
              Noch keine Folgen importiert — Mengenkontrolle zeigt 0 Einträge.
            </div>
          )}
        </div>
      )}

      {/* ── Genehmiger ── */}
      <p style={sec}>
        <Tooltip text="Fall B (Budget/Inhalt): Genehmiger für neue Rollen und Motive, die noch nicht in der Datenbank existieren. Granularität: pro Rolle/Motiv und Produktion.">
          Budget-Genehmiger
        </Tooltip>
      </p>
      {renderGenehmiger(budgetGenehmiger)}

      <p style={{ ...sec, marginTop: 20 }}>
        <Tooltip text="Fall A (Dispo/Logistik): Genehmiger für Cast-Änderungen und neue Szenen-Einsätze nach dem Lock. Granularität: pro Szene.">
          Dispo-Genehmiger
        </Tooltip>
      </p>
      {renderGenehmiger(dispoGenehmiger)}

      {/* Neuer Genehmiger */}
      <div style={{ marginTop: 16, padding: 14, borderRadius: 8, border: '1px dashed var(--border)', background: 'var(--bg-subtle)' }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: 'var(--text-secondary)' }}>NEUER GENEHMIGER</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8, alignItems: 'center' }}>
          <select value={newTyp} onChange={e => setNewTyp(e.target.value as any)} style={sel}>
            <option value="user">User</option>
            <option value="rolle">Rolle</option>
          </select>
          {newTyp === 'user' ? (
            <select value={newUserId} onChange={e => setNewUserId(e.target.value)} style={{ ...sel, flex: 1, minWidth: 160 }}>
              <option value="">– User wählen –</option>
              {meta.users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
            </select>
          ) : (
            <select value={newRolle} onChange={e => setNewRolle(e.target.value)} style={{ ...sel, flex: 1, minWidth: 160 }}>
              <option value="">– Rolle wählen –</option>
              {meta.roles.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
            </select>
          )}
          <select value={newFreigabeTyp} onChange={e => setNewFreigabeTyp(e.target.value)} style={sel}>
            <option value="budget">Budget</option>
            <option value="dispo">Dispo</option>
          </select>
          <select value={newStufe} onChange={e => setNewStufe(e.target.value)} style={sel}>
            <option value="obligatorisch">Obligatorisch</option>
            <option value="review">Review</option>
            <option value="notify">Info</option>
          </select>
          <button
            onClick={addGenehmiger}
            disabled={newTyp === 'user' ? !newUserId : !newRolle}
            style={{
              padding: '7px 14px', borderRadius: 6, border: 'none',
              background: '#000', color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: (newTyp === 'user' ? newUserId : newRolle) ? 'pointer' : 'not-allowed',
              opacity: (newTyp === 'user' ? newUserId : newRolle) ? 1 : 0.4, minHeight: 36,
            }}
          >
            Hinzufügen
          </button>
        </div>
      </div>
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
    <div style={{ padding: 24 }}>
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
        style={{ transformOrigin: 'top left', transform: `scale(${THUMB_SCALE})`, width: 794, pointerEvents: 'none', fontFamily: '"Courier New", monospace', fontSize: '12pt', lineHeight: 1.5, padding: '10px 14px' }}
        dangerouslySetInnerHTML={{ __html: html || '' }}
      />
    </div>
  )
}

function VorlagenTab({ productionId, seitenformat, margins }: { productionId: string; seitenformat: 'a4' | 'letter'; margins: { oben: number; unten: number; links: number; rechts: number } }) {
  const { selectedProduction } = useSelectedProduction()
  const { t: tVorlage } = useTerminologie()
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
    werkstufe:     tVorlage('drehbuch'),
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
    aktuelles_uhrzeit:     new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', hour12: false }),
    aktuelles_uhrzeit_utc: new Date().toLocaleTimeString('de-DE', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false }) + '\u202f(UTC)',
    aktuelles_jahr:        String(new Date().getFullYear()),
    folge_laenge_netto:  undefined,
    firmen_adresse:      previewMeta.firmenAdresse ?? undefined,
    rechtsform:          previewMeta.rechtsform ?? undefined,
    handelsregister:     previewMeta.handelsregister ?? undefined,
    ust_id:              previewMeta.ustId ?? undefined,
    geschaeftsfuehrung:  previewMeta.geschaeftsfuehrung ?? undefined,
    firmen_email:        previewMeta.firmenEmail ?? undefined,
    firmen_telefon:      previewMeta.firmenTelefon ?? undefined,
    druckauswahl:        'Auswahl: Szenen 1–10',
    synopsis_kurzinhalt:  'Haupthandlung: LOU trifft eine schwere Entscheidung über ihren Neustart. Nebenhandlungen: BRITTA engagiert sich im Ehrenamt. Cliffhanger: Ein unerwarteter Brief verändert alles.',
    synopsis_redaktion:   'LOU steht vor einer Weichenstellung: Soll sie für einen beruflichen Neustart nach München gehen? Als RICHARD sich einmischt, eskaliert der Konflikt zwischen Hoffnung und Abschied. BRITTA findet im Ehrenamt unerwartet neue Kraft.',
    synopsis_presse:      'Wird LOU ihr Leben komplett auf den Kopf stellen? Eine überraschende Begegnung zwingt sie zu einer Entscheidung – mit weitreichenden Folgen für alle Beteiligten.',
    synopsis_pressetext:  'LOU steht vor einer Entscheidung, die ihr Leben für immer verändern könnte. BRITTA findet unterdessen neue Kraft im Ehrenamt.',
    synopsis_straenge:    'LOU: Entscheidung München / Trennung von Richard\nBRITTA: Ehrenamt Krankenhaus, Job-Angebot',
    synopsis_lektor:      'Want & Need: LOU — Want: Neustart in München / Need: Selbstakzeptanz\nWendepunkte: 1. Richard taucht auf (Sz. 4) 2. Brief aus München (Sz. 12)\nAkt 1 (Sz. 1–5): Ausgangslage\nAkt 2 (Sz. 6–14): Eskalation CLIFF\nAkt 3 (Sz. 15–20): LOU PEN offen',
    synopsis_deskriptoren: 'ANGST (leicht): LOU reagiert mit Panikattacke auf Nachricht (Sz. 4)',
    synopsis_fsk:          'FSK 12: Leichte Angst-Sequenz in Sz. 4, keine weiteren Einschränkungen.',
  }

  // KZ/FZ-Einstellungen laden — seiten_layout wird als externalSeitenLayout für den Vorlagen-Editor verwendet
  const [kzFzLayout, setKzFzLayout] = useState<SeitenLayout | null>(null)
  useEffect(() => {
    api.getKopfFusszeilenTyp(productionId, 'alle')
      .then((row: any) => { if (row?.seiten_layout) setKzFzLayout(row.seiten_layout) })
      .catch(() => {})
  }, [productionId])
  const effectiveExternalLayout: SeitenLayout = kzFzLayout ?? {
    format: seitenformat,
    margin_top: margins.oben, margin_bottom: margins.unten,
    margin_left: margins.links, margin_right: margins.rechts,
  }

  const [vorlagen, setVorlagen] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'list' | 'tiles'>('tiles')
  const [filterTyp, setFilterTyp] = useState('alle')
  const [settingAktiv, setSettingAktiv] = useState<string | null>(null)
  const [settingTitelseite, setSettingTitelseite] = useState<string | null>(null)

  // Edit mode state
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editTyp, setEditTyp] = useState('titelseite')
  const [editEditorValue, setEditEditorValue] = useState<DokumentVorlagenEditorValue>(emptyVorlagenEditorValue())
  const [editZeilennummerierungUnterbinden, setEditZeilennummerierungUnterbinden] = useState(false)
  const [editorKey, setEditorKey] = useState(0)
  const [saving, setSaving] = useState(false)
  const [zoom, setZoom] = useState(1.0)
  const [activeEditor, setActiveEditor] = useState<any>(null)
  const [showPreview, setShowPreview] = useState(false)
  const sidebarFileRef = useRef<HTMLInputElement>(null)
  const rightPanelRef = useRef<HTMLDivElement>(null)
  const zoomAutoFitDone = useRef(false)

  // Auto-fit zoom: once on first template open, scale A4 (794px) to fit the panel
  useEffect(() => {
    if (!editId || zoomAutoFitDone.current) return
    const raf = requestAnimationFrame(() => {
      const el = rightPanelRef.current
      if (!el) return
      const availW = el.clientWidth - 96 // 48px padding × 2
      if (availW > 0 && availW < 794) {
        setZoom(Math.max(0.5, Math.round((availW / 794) * 20) / 20))
      }
      zoomAutoFitDone.current = true
    })
    return () => cancelAnimationFrame(raf)
  }, [editId])

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
      // Immer globale Ränder/Format übernehmen — nicht per-Vorlage konfigurierbar
      seiten_layout: {
        format:        seitenformat,
        margin_top:    margins.oben,
        margin_bottom: margins.unten,
        margin_left:   margins.links,
        margin_right:  margins.rechts,
      },
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

  const unsetAktiv = async (id: string) => {
    setSettingAktiv(id)
    try {
      await api.unsetVorlageAktiv(productionId, id)
      load()
    } catch (err: any) {
      alert('Fehler: ' + err.message)
    } finally {
      setSettingAktiv(null)
    }
  }

  const setTitelseite = async (id: string) => {
    setSettingTitelseite(id)
    try {
      await api.setVorlageTitelseite(productionId, id)
      load()
    } catch (err: any) {
      alert('Fehler: ' + err.message)
    } finally {
      setSettingTitelseite(null)
    }
  }

  const unsetTitelseite = async (id: string) => {
    setSettingTitelseite(id)
    try {
      await api.unsetVorlageTitelseite(productionId, id)
      load()
    } catch (err: any) {
      alert('Fehler: ' + err.message)
    } finally {
      setSettingTitelseite(null)
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
    const pvMl   = (editEditorValue.seiten_layout?.margin_left   ?? effectiveExternalLayout.margin_left)   * (96 / 25.4)
    const pvMr   = (editEditorValue.seiten_layout?.margin_right  ?? effectiveExternalLayout.margin_right)  * (96 / 25.4)
    const pvMt   = (editEditorValue.seiten_layout?.margin_top    ?? effectiveExternalLayout.margin_top)    * (96 / 25.4)
    const pvMb   = (editEditorValue.seiten_layout?.margin_bottom ?? effectiveExternalLayout.margin_bottom) * (96 / 25.4)
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
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                Name
                <Tooltip text="Dieser Titel wird als PDF-Lesezeichen verwendet.\nGib einen aussagekräftigen Namen ein, damit er im PDF-Inhaltsverzeichnis erkennbar ist.">
                  <span style={{ cursor: 'help', opacity: 0.6, fontSize: 10 }}>ⓘ</span>
                </Tooltip>
              </label>
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
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '4px 0' }}>
                {seitenformat === 'a4' ? 'A4 (210 × 297 mm)' : 'Letter (215,9 × 279,4 mm)'}
                <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginTop: 2 }}>
                  Standard-Einstellung aus {tVorlage('drehbuch')}-Formatierung
                </span>
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Seitenränder (mm)</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 4 }}>
                {([
                  ['Oben',   margins.oben],
                  ['Unten',  margins.unten],
                  ['Links',  margins.links],
                  ['Rechts', margins.rechts],
                ] as [string, number][]).map(([label, val]) => (
                  <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{label}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-primary)', padding: '3px 4px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-page)', width: '100%', textAlign: 'center' }}>{val}</span>
                  </div>
                ))}
              </div>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginTop: 4 }}>
                Standard-Einstellung aus {tVorlage('drehbuch')}-Formatierung
              </span>
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
        <div ref={rightPanelRef} style={{ flex: 1, background: '#bebebe', padding: '40px 48px', minHeight: '100vh', overflowX: 'auto' }}>
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
            externalSeitenLayout={effectiveExternalLayout}
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
            <div style={{ width: pvW, minHeight: pvH, background: 'white', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', borderRadius: 2, color: '#000', paddingTop: pvMt, paddingBottom: pvMb, paddingLeft: pvMl, paddingRight: pvMr, boxSizing: 'border-box', position: 'relative', fontFamily: '"Courier New", monospace', fontSize: '12pt', lineHeight: 1.5 }}>
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
            const typLabel      = VORLAGE_TYPES.find(t => t.id === v.typ)?.label ?? v.typ ?? 'custom'
            const isAktiv       = !!v.is_aktiv
            const isTitelseite  = !!v.ist_titelseite
            return (
              <div key={v.id} style={{ border: `2px solid ${isTitelseite ? '#FF3B30' : isAktiv ? '#007AFF' : 'var(--border)'}`, borderRadius: 10, background: 'var(--bg-surface)', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: isTitelseite ? '0 0 0 1px #FF3B3033' : isAktiv ? '0 0 0 1px #007AFF33' : undefined }}>
                {/* Thumbnail */}
                <div style={{ background: '#d8d8d8', display: 'flex', justifyContent: 'center', padding: '12px 12px 8px', position: 'relative' }}>
                  <div style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.2)', borderRadius: 2, overflow: 'hidden' }}>
                    <VorlagenThumbnail content={v.body_content} ctx={previewContext} />
                  </div>
                  {isTitelseite && (
                    <button
                      onClick={() => unsetTitelseite(v.id)}
                      disabled={settingTitelseite === v.id}
                      title="Titelseite-Markierung entfernen"
                      style={{ position: 'absolute', top: 8, left: 8, background: '#FF3B30', color: '#fff', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, border: 'none', cursor: 'pointer' }}
                    >{settingTitelseite === v.id ? '…' : 'Titelseite ✕'}</button>
                  )}
                  {isAktiv && (
                    <button
                      onClick={() => unsetAktiv(v.id)}
                      disabled={settingAktiv === v.id}
                      title="Standard entfernen"
                      style={{ position: 'absolute', top: 8, right: 8, background: '#007AFF', color: '#fff', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: 0.5, border: 'none', cursor: 'pointer' }}
                    >{settingAktiv === v.id ? '…' : 'Standard ✕'}</button>
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
                    {!isTitelseite && (
                      <button
                        onClick={() => setTitelseite(v.id)}
                        disabled={settingTitelseite === v.id}
                        title="Diese Vorlage als Titelseite für den Export markieren"
                        style={{ ...btnStyle, color: '#FF3B30', borderColor: '#FF3B3033' }}
                      >{settingTitelseite === v.id ? '…' : 'Als Titelseite'}</button>
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
            const typLabel     = VORLAGE_TYPES.find(t => t.id === v.typ)?.label ?? v.typ ?? 'custom'
            const isAktiv      = !!v.is_aktiv
            const isTitelseite = !!v.ist_titelseite
            return (
              <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg-subtle)', borderRadius: 8, border: `1px solid ${isTitelseite ? '#FF3B3055' : isAktiv ? '#007AFF55' : 'var(--border)'}` }}>
                {/* Small thumbnail */}
                <div style={{ background: '#d8d8d8', borderRadius: 3, padding: '4px', flexShrink: 0, boxShadow: '0 1px 4px rgba(0,0,0,0.15)' }}>
                  <VorlagenThumbnail content={v.body_content} ctx={previewContext} />
                </div>
                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{v.name}</span>
                    {isTitelseite && (
                      <button
                        onClick={() => unsetTitelseite(v.id)}
                        disabled={settingTitelseite === v.id}
                        title="Titelseite-Markierung entfernen"
                        style={{ fontSize: 9, fontWeight: 700, background: '#FF3B30', color: '#fff', padding: '1px 6px', borderRadius: 3, border: 'none', cursor: 'pointer' }}
                      >{settingTitelseite === v.id ? '…' : 'Titelseite ✕'}</button>
                    )}
                    {isAktiv && (
                      <button
                        onClick={() => unsetAktiv(v.id)}
                        disabled={settingAktiv === v.id}
                        title="Standard entfernen"
                        style={{ fontSize: 9, fontWeight: 700, background: '#007AFF', color: '#fff', padding: '1px 6px', borderRadius: 3, textTransform: 'uppercase', letterSpacing: 0.5, border: 'none', cursor: 'pointer' }}
                      >{settingAktiv === v.id ? '…' : 'Standard ✕'}</button>
                    )}
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
                  {!isTitelseite && (
                    <button onClick={() => setTitelseite(v.id)} disabled={settingTitelseite === v.id}
                      title="Diese Vorlage als Titelseite für den Export markieren"
                      style={{ ...btnStyle, color: '#FF3B30', borderColor: '#FF3B3033' }}>
                      {settingTitelseite === v.id ? '…' : 'Als Titelseite'}
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
        Pro Kategorie wird die als <strong>Standard</strong> markierte Vorlage beim Export verwendet. Eine Vorlage kann als <strong style={{ color: '#FF3B30' }}>Titelseite</strong> markiert werden — sie erscheint beim Export automatisch als erstes Dokument und ermöglicht die Titelseiten-Erkennung im Export-Modal.
      </p>
    </div>
  )
}


// ── Kopf-/Fußzeilen Tab ──────────────────────────────────────────────────────

const KF_TYPEN = [
  { id: 'drehbuch',  label: 'Drehbuch',  color: '#007AFF' },
  { id: 'storyline', label: 'Storyline', color: '#FF9500' },
  { id: 'notiz',     label: 'Dokument',  color: '#757575' },
] as const

function formatDatum(iso: string, fmt: 'de' | 'en'): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return fmt === 'en' ? `${m}/${d}/${y.slice(2)}` : `${d}.${m}.${y.slice(2)}`
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
    const dayDot = day.endsWith('.') ? day : day + '.'
    return `${dayDot}, ${date}`
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

function KopfFusszeileTab({ productionId, seitenformat, margins }: { productionId: string; seitenformat: 'a4' | 'letter'; margins: DokTypenMargins }) {
  const { selectedProduction } = useSelectedProduction()
  const { t: tKf } = useTerminologie()
  const kfTypen = [
    { id: 'drehbuch',  label: tKf('drehbuch'),  color: '#007AFF' },
    { id: 'storyline', label: 'Storyline', color: '#FF9500' },
    { id: 'notiz',     label: 'Dokument',  color: '#757575' },
  ] as const
  const produktionsLogoUrl = selectedProduction?.logo_filename
    ? `https://produktion.serienwerft.studio/uploads/logos/${selectedProduction.logo_filename}`
    : null

  // Globale Ränder aus der Drehbuch-Formatierung — überschreiben die gespeicherten seiten_layout-Werte
  const forcedLayout: SeitenLayout = {
    format:        seitenformat,
    margin_top:    margins.oben,
    margin_bottom: margins.unten,
    margin_left:   margins.links,
    margin_right:  margins.rechts,
  }
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
    werkstufe:     tKf('drehbuch'),
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
    aktuelles_uhrzeit:     new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', hour12: false }),
    aktuelles_uhrzeit_utc: new Date().toLocaleTimeString('de-DE', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false }) + '\u202f(UTC)',
    aktuelles_jahr:        String(new Date().getFullYear()),
    folge_laenge_netto:  undefined,
    firmen_adresse:      previewMeta.firmenAdresse ?? undefined,
    rechtsform:          previewMeta.rechtsform ?? undefined,
    handelsregister:     previewMeta.handelsregister ?? undefined,
    ust_id:              previewMeta.ustId ?? undefined,
    geschaeftsfuehrung:  previewMeta.geschaeftsfuehrung ?? undefined,
    firmen_email:        previewMeta.firmenEmail ?? undefined,
    firmen_telefon:      previewMeta.firmenTelefon ?? undefined,
    druckauswahl:        'Auswahl: Szenen 1–10',
    synopsis_kurzinhalt:  'Haupthandlung: LOU trifft eine schwere Entscheidung über ihren Neustart. Nebenhandlungen: BRITTA engagiert sich im Ehrenamt. Cliffhanger: Ein unerwarteter Brief verändert alles.',
    synopsis_redaktion:   'LOU steht vor einer Weichenstellung: Soll sie für einen beruflichen Neustart nach München gehen? Als RICHARD sich einmischt, eskaliert der Konflikt.',
    synopsis_presse:      'Wird LOU ihr Leben komplett auf den Kopf stellen? Eine überraschende Begegnung zwingt sie zu einer Entscheidung.',
    synopsis_pressetext:  'LOU steht vor einer Entscheidung, die ihr Leben für immer verändern könnte.',
    synopsis_straenge:    'LOU: Entscheidung München / Trennung von Richard\nBRITTA: Ehrenamt Krankenhaus',
    synopsis_lektor:      'Want & Need: LOU — Want: Neustart / Need: Selbstakzeptanz\nWendepunkte: 1. Richard taucht auf (Sz. 4)\nAkt 1 (Sz. 1–5): Ausgangslage',
    synopsis_deskriptoren: 'ANGST (leicht): LOU reagiert mit Panikattacke auf Nachricht (Sz. 4)',
    synopsis_fsk:          'FSK 12: Leichte Angst-Sequenz in Sz. 4.',
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
            seiten_layout:           row.seiten_layout ?? forcedLayout,
          }
        }
        setConfigs(map)
      })
      .finally(() => setLoading(false))
  }, [productionId])

  const getCurrentValue = (): KopfZeilenEditorValue =>
    configs[activeTyp] ?? { ...emptyKopfZeilenEditorValue(), seiten_layout: forcedLayout }

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
  const activeColor = kfTypen.find(t => t.id === activeTyp)?.color ?? '#007AFF'
  const syncLabels = kfTypen.filter(t => syncTypen.has(t.id)).map(t => t.label).join(', ')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, height: '100%' }}>
      {/* Erklärleiste Mehrfachauswahl */}
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
        Mehrfachauswahl möglich — Strg+Klick zum Hinzufügen/Entfernen
      </div>

      {/* Sub-tab bar + save button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {kfTypen.map(t => {
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
          defaultLayout={forcedLayout}
          previewContext={previewContext}
        />
      </div>
    </div>
  )
}

// ── Freie Dokumente Labels Tab ────────────────────────────────────────────────
function FreieDokLabelsTab({ produktionId }: { produktionId: string }) {
  const [labels, setLabels] = useState<any[]>([])
  const [newLabel, setNewLabel] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const rows = await api.getFreieDokLabels(produktionId)
    setLabels(rows)
  }, [produktionId])

  useEffect(() => { load() }, [load])

  const handleAdd = async () => {
    if (!newLabel.trim() || saving) return
    setSaving(true)
    try {
      await api.createFreieDokLabel({ produktion_id: produktionId, label_name: newLabel.trim() })
      setNewLabel('')
      await load()
    } catch {}
    setSaving(false)
  }

  const handleDelete = async (id: number) => {
    await api.deleteFreieDokLabel(id)
    await load()
  }

  const inputSt: React.CSSProperties = {
    flex: 1, padding: '8px 12px', fontSize: 13,
    border: '1.5px solid var(--border)', borderRadius: 8,
    background: 'var(--bg-surface)', color: 'var(--text-primary)',
    fontFamily: 'inherit', outline: 'none',
  }

  const sectionHead: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)',
    letterSpacing: '0.07em', marginBottom: 6,
  }

  return (
    <div>
      {/* Sticky header — top:-28px gleicht padding-top:28px des Scroll-Containers aus */}
      <div style={{
        position: 'sticky',
        top: -28,
        zIndex: 10,
        background: 'var(--bg-page)',
        paddingTop: 28,
        paddingBottom: 14,
        marginLeft: -32,
        marginRight: -32,
        paddingLeft: 32,
        paddingRight: 32,
        borderBottom: '1px solid var(--border)',
        marginBottom: 20,
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Labels für Freie Dokumente</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Diese Labels erscheinen als Vorschläge (Autovervollständigung) beim Anlegen eines freien Dokuments.
        </div>
      </div>

      {/* Standard-Labels */}
      <div style={sectionHead}>STANDARD (immer verfügbar)</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
        {['Schattenbuch', 'Casting-Szene', 'Spin-Off', 'Sonstiges'].map(l => (
          <div key={l} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 12px', background: 'var(--bg-subtle)',
            border: '1.5px solid var(--border)', borderRadius: 8,
          }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{l}</span>
            <span style={{
              fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)',
              background: 'var(--border)', borderRadius: 4, padding: '2px 7px',
            }}>Standard</span>
          </div>
        ))}
      </div>

      {/* Produktions-Labels */}
      <div style={sectionHead}>DIESE PRODUKTION</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
        {labels.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '8px 0' }}>
            Noch keine produktionsspezifischen Labels.
          </div>
        )}
        {labels.map((l: any) => (
          <div key={l.id} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 12px', background: 'var(--bg-surface)',
            border: '1.5px solid var(--border)', borderRadius: 8,
          }}>
            <span style={{ fontSize: 13 }}>{l.label_name}</span>
            <button
              onClick={() => handleDelete(l.id)}
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#FF3B30', padding: '2px 8px', fontSize: 18, lineHeight: 1 }}
            >×</button>
          </div>
        ))}
      </div>

      {/* Neu hinzufügen */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          placeholder="Neues Label, z.B. Pilotfilm…"
          value={newLabel}
          onChange={e => setNewLabel(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          style={inputSt}
        />
        <button className="btn primary" onClick={handleAdd} disabled={saving || !newLabel.trim()}>
          Hinzufügen
        </button>
      </div>
    </div>
  )
}

// ── Tab: Drehbuch-Checks ─────────────────────────────────────────────────────

const CHECK_DEFAULTS: Record<string, { label: string; auto: boolean; ki: boolean; defaultEnabled: boolean; tooltip: string }> = {
  motiv_leer: {
    label: 'Motiv angegeben?', auto: true, ki: false, defaultEnabled: true,
    tooltip: 'Prüft ob das Motiv-Feld ausgefüllt ist.\n\nEin fehlendes Motiv verhindert korrekte Breakdowns und den Drehplan-Export. Besonders wichtig bei Szenen, die direkt nach dem Import angelegt werden.',
  },
  rollen_konsistenz: {
    label: 'Rollen-Konsistenz', auto: true, ki: false, defaultEnabled: true,
    tooltip: 'Vergleicht die Rollen im Szenenkopf mit den GROSSBUCHSTABEN-Namen im Szenentext.\n\nZwei Richtungen:\n• Name im Text → fehlt im Szenenkopf (vergessen einzutragen)\n• Name im Szenenkopf → nie im Text (eingetragen, aber nicht aufgetreten)\n\nNur Figuren aus der Figurendatenbank dieser Produktion werden geprüft.',
  },
  sondertyp_wechselschnitt: {
    label: 'Sondertypen & Wechselschnitte', auto: true, ki: false, defaultEnabled: true,
    tooltip: 'Zwei Prüfungen:\n\n① Sondertyp "Wechselschnitt" gesetzt, aber kein Telefonpartner angegeben.\n\n② Im Szenentext steht "WECHSELSCHNITT" oder "WS:", aber der Sondertyp ist nicht markiert — möglicherweise vergessen.',
  },
  strang_zuordnung: {
    label: 'Strang-Zuordnung', auto: true, ki: false, defaultEnabled: true,
    tooltip: 'Prüft ob die Szene mindestens einem Story-Strang zugeordnet ist.\n\nWird nur ausgelöst wenn für diese Produktion Stränge angelegt wurden. Szenen ohne Strang fehlen in Pacing-Analysen und im Story-Radar.\n\nHinweis: Nicht jede Szene muss einem Strang gehören (z.B. reine Produktionsszenen).',
  },
  duplikat_motiv: {
    label: 'Duplikat-Motiv im Block', auto: true, ki: false, defaultEnabled: true,
    tooltip: 'Erkennt wenn dieselbe Motivkombination (Motiv + I/A + Tageszeit) bereits in einer anderen Szene derselben Folge vorkommt.\n\nDoppelte Motive sind oft ein Hinweis auf einen Fehler beim Kopieren. Absichtliche Wiederholungen (Rahmenhandlung) können einzeln ignoriert werden.',
  },
  fehlender_dialog: {
    label: 'Fehlender Dialog', auto: true, ki: false, defaultEnabled: true,
    tooltip: 'Prüft ob nach jedem Character-Element tatsächlich ein Dialog-Element folgt.\n\nEine Rolle ohne Dialog ist ein typischer Schreibfehler: Name eingetragen, Dialog vergessen.\n\nBei Auto=EIN: Szenenwechsel wird blockiert bis korrigiert. Bei manuell: erscheint als Fehler-Badge.',
  },
  stoppzeit_plausibilitaet: {
    label: 'Stoppzeit-Plausibilität', auto: false, ki: false, defaultEnabled: false,
    tooltip: 'Vergleicht die eingetragene Stoppzeit mit der geschätzten Spielzeit aus der Textlänge.\n\nFaustregel: 1 Seite ≈ 1 Minute ≈ ~1.800 Zeichen. Warnung bei mehr als Faktor 4 Abweichung.\n\nNur für Drehbuch-Format. Standardmäßig deaktiviert, da die Schätzung ungenau ist.',
  },
  spieltag_inkonsistent: {
    label: 'Dramaturgischer Tag (Spieltag)', auto: false, ki: false, defaultEnabled: true,
    tooltip: 'Prüft ob die Spieltag-Nummern (SP1, SP2, …) über alle Folgen hinweg korrekt sind.\n\nEin Tageswechsel tritt auf wenn die letzte Stimmung des Tages (Standard: NACHT) auf eine frühere Stimmung folgt.\n\nDie Stimmungs-Reihenfolge ist in DK-Einstellungen → Allgemein konfigurierbar.\n\nDieser Check läuft immer folgenübergreifend — nicht je Szene.',
  },
  oneliner_qualitaet: {
    label: 'Oneliner-Qualität', auto: false, ki: true, defaultEnabled: false,
    tooltip: 'Prüft ob der Oneliner den emotionalen Kern oder Wendepunkt der Szene wiedergibt.\n\n✨ KI-Feature: Nutzt Mistral AI zur Analyse — verursacht API-Kosten. Wird deshalb nur manuell ausgeführt, nie beim Autosave.\n\nEmpfohlen nur wenn alle Szenen konsequent mit Onelinern gepflegt werden.',
  },
}

function DrehbuchChecksTab({ produktionId }: { produktionId: string }) {
  const { t: tChecks } = useTerminologie()
  const [config, setConfig] = useState<Record<string, { enabled: boolean; auto: boolean }>>({})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/dk-settings/${produktionId}/app-settings`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(s => {
        if (s?.drehbuch_checks) {
          try {
            const v = typeof s.drehbuch_checks === 'string' ? JSON.parse(s.drehbuch_checks) : s.drehbuch_checks
            // Merge with defaults
            const merged: Record<string, { enabled: boolean; auto: boolean }> = {}
            for (const [key, meta] of Object.entries(CHECK_DEFAULTS)) {
              merged[key] = { enabled: meta.defaultEnabled, auto: meta.auto, ...v[key] }
            }
            setConfig(merged)
          } catch { setConfig({}) }
        } else {
          const defaults: Record<string, { enabled: boolean; auto: boolean }> = {}
          for (const [key, meta] of Object.entries(CHECK_DEFAULTS)) {
            defaults[key] = { enabled: meta.defaultEnabled, auto: meta.auto }
          }
          setConfig(defaults)
        }
      })
      .catch(() => {})
  }, [produktionId])

  const save = async (next: Record<string, { enabled: boolean; auto: boolean }>) => {
    setSaving(true)
    try {
      await fetch(`/api/dk-settings/${produktionId}/app-settings/drehbuch_checks`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: JSON.stringify(next) }),
      })
      setMsg('Gespeichert')
      setTimeout(() => setMsg(null), 2000)
    } catch { setMsg('Fehler') } finally { setSaving(false) }
  }

  const toggle = (key: string, field: 'enabled' | 'auto') => {
    const next = { ...config, [key]: { ...config[key], [field]: !config[key]?.[field] } }
    setConfig(next)
    save(next)
  }

  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
    borderBottom: '1px solid var(--border)', fontSize: 13,
  }
  const labelStyle: React.CSSProperties = { flex: 1, color: 'var(--text-primary)' }
  const tagStyle = (color: string): React.CSSProperties => ({
    fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 999,
    background: `${color}20`, border: `1px solid ${color}60`, color,
  })

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
        Steuert, welche Qualitätschecks beim Autosave (Auto-Check) oder manuell per Kontextmenü ausgeführt werden.
        KI-Checks ✨ werden nur manuell ausgeführt und verursachen API-Kosten.
      </p>

      <div style={{ marginBottom: 8, display: 'grid', gridTemplateColumns: '1fr 80px 80px', gap: 8, fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        <span>Check</span>
        <span style={{ textAlign: 'center' }}>Aktiv</span>
        <span style={{ textAlign: 'center' }}>Auto</span>
      </div>

      {Object.entries(CHECK_DEFAULTS).map(([key, meta]) => {
        const cfg = config[key] ?? { enabled: meta.defaultEnabled, auto: meta.auto }
        return (
          <div key={key} style={rowStyle}>
            <div style={labelStyle}>
              <Tooltip text={meta.tooltip} placement="right">
                <span style={{ borderBottom: '1px dotted var(--text-muted)', cursor: 'help' }}>{meta.label}</span>
              </Tooltip>
              {meta.ki && <span style={{ ...tagStyle('#AF52DE'), marginLeft: 6 }}>✨ KI</span>}
              {!meta.auto && !meta.ki && <span style={{ ...tagStyle('#757575'), marginLeft: 6 }}>nur manuell</span>}
            </div>
            {/* Aktiv-Toggle */}
            <div style={{ width: 80, textAlign: 'center' }}>
              <label style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={cfg.enabled}
                  onChange={() => toggle(key, 'enabled')}
                  style={{ accentColor: '#007AFF', width: 16, height: 16 }}
                />
              </label>
            </div>
            {/* Auto-Toggle — KI-Checks sind immer nur manuell */}
            <div style={{ width: 80, textAlign: 'center' }}>
              {meta.ki ? (
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>
              ) : (
                <label style={{ cursor: cfg.enabled ? 'pointer' : 'not-allowed', display: 'inline-flex', alignItems: 'center', opacity: cfg.enabled ? 1 : 0.4 }}>
                  <input
                    type="checkbox"
                    checked={cfg.auto}
                    disabled={!cfg.enabled}
                    onChange={() => toggle(key, 'auto')}
                    style={{ accentColor: '#007AFF', width: 16, height: 16 }}
                  />
                </label>
              )}
            </div>
          </div>
        )
      })}

      {(saving || msg) && (
        <div style={{ marginTop: 12, fontSize: 12, color: msg === 'Gespeichert' ? 'var(--sw-green)' : msg ? 'var(--sw-danger)' : 'var(--text-muted)' }}>
          {saving ? 'Wird gespeichert…' : msg}
        </div>
      )}
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

// ══════════════════════════════════════════════════════════════════════════════
// Verlauf & Sicherung Tab
// Konfiguriert Snapshot-Intervalle für Szenen- und Dokument-Verlauf
// ══════════════════════════════════════════════════════════════════════════════
function VerlaufSicherungTab({ produktionId }: { produktionId: string | null }) {
  const DEFAULTS = { szenenIntervalMin: 5, werkIntervalMin: 30, werkOnSwitch: true, szenenMax: 50, werkMax: 30 }
  const [cfg, setCfg] = useState(DEFAULTS)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const url = produktionId
      ? `/api/dk-settings/${encodeURIComponent(produktionId)}/app-settings`
      : '/api/admin/app-settings'
    fetch(url, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((d: any) => {
        if (d?.snapshot_settings) {
          try { setCfg({ ...DEFAULTS, ...JSON.parse(d.snapshot_settings) }) } catch {}
        }
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [produktionId]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (next: typeof DEFAULTS) => {
    setSaving(true)
    setSaved(false)
    const url = produktionId
      ? `/api/dk-settings/${encodeURIComponent(produktionId)}/app-settings/snapshot_settings`
      : '/api/admin/app-settings/snapshot_settings'
    await fetch(url, {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: JSON.stringify(next) }),
    }).catch(() => {})
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    window.dispatchEvent(new CustomEvent('app-settings-changed'))
  }

  const update = (patch: Partial<typeof DEFAULTS>) => {
    const next = { ...cfg, ...patch }
    setCfg(next)
    save(next)
  }

  if (!loaded) return <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Laden…</p>

  const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, marginBottom: 3 }
  const descStyle: React.CSSProperties = { fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 14px', lineHeight: 1.6 }
  const numInput: React.CSSProperties = {
    padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)',
    background: 'var(--bg-subtle)', fontSize: 13, fontFamily: 'var(--font-sans)',
    width: 80, color: 'var(--text-primary)',
  }
  const toggle = (val: boolean, onChange: (v: boolean) => void) => (
    <button
      onClick={() => onChange(!val)}
      style={{
        width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
        background: val ? 'var(--sw-green, #00C853)' : 'var(--border)',
        position: 'relative', transition: 'background 0.2s', flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 2, left: val ? 20 : 2,
        width: 18, height: 18, borderRadius: '50%', background: '#fff',
        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </button>
  )

  return (
    <div>
      <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 4px' }}>Verlauf & Auto-Sicherung</h3>
      <p style={{ ...descStyle, marginBottom: 24 }}>
        Steuert, wie oft die App automatisch Sicherungen anlegt. Änderungen gelten sofort und werden
        für {produktionId ? 'diese Produktion' : 'alle Produktionen'} gespeichert.
      </p>

      {/* ── Szenen-Verlauf ── */}
      <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 20, marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 14 }}>
          Szenen-Verlauf
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={labelStyle}>Auto-Sicherung alle … Minuten</div>
            <p style={descStyle}>Nach der letzten Änderung in einer Szene. 0 = deaktiviert.</p>
            <input
              type="number" min={0} max={60} step={1}
              value={cfg.szenenIntervalMin}
              onChange={e => update({ szenenIntervalMin: Math.max(0, Math.min(60, parseInt(e.target.value) || 0)) })}
              style={numInput}
            />
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 8 }}>Min. (Standard: 5)</span>
          </div>

          <div>
            <div style={labelStyle}>Max. Einträge je Szene</div>
            <p style={descStyle}>Älteste Sicherungen werden automatisch gelöscht wenn das Limit erreicht ist.</p>
            <input
              type="number" min={10} max={200} step={5}
              value={cfg.szenenMax}
              onChange={e => update({ szenenMax: Math.max(10, Math.min(200, parseInt(e.target.value) || 50)) })}
              style={numInput}
            />
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 8 }}>Einträge (Standard: 50)</span>
          </div>
        </div>
      </div>

      {/* ── Dokument-Verlauf ── */}
      <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 20, marginBottom: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 14 }}>
          Dokument-Verlauf (alle Szenen der Werkstufe)
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={labelStyle}>Auto-Sicherung alle … Minuten</div>
            <p style={descStyle}>Während aktiver Arbeit in der Werkstufe. 0 = deaktiviert.</p>
            <input
              type="number" min={0} max={480} step={5}
              value={cfg.werkIntervalMin}
              onChange={e => update({ werkIntervalMin: Math.max(0, Math.min(480, parseInt(e.target.value) || 0)) })}
              style={numInput}
            />
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 8 }}>Min. (Standard: 30)</span>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              {toggle(cfg.werkOnSwitch, v => update({ werkOnSwitch: v }))}
              <span style={{ ...labelStyle, marginBottom: 0 }}>Bei Werkstufen-Wechsel sichern</span>
            </div>
            <p style={{ ...descStyle, marginBottom: 0 }}>
              Legt automatisch einen Snapshot der aktuellen Werkstufe an, wenn du zu einer anderen Werkstufe wechselst.
            </p>
          </div>

          <div>
            <div style={labelStyle}>Max. Einträge je Werkstufe</div>
            <p style={descStyle}>Älteste Einträge werden automatisch gelöscht. Einträge vom Typ "Vor Wiederherstellung" zählen mit.</p>
            <input
              type="number" min={5} max={100} step={5}
              value={cfg.werkMax}
              onChange={e => update({ werkMax: Math.max(5, Math.min(100, parseInt(e.target.value) || 30)) })}
              style={numInput}
            />
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 8 }}>Einträge (Standard: 30)</span>
          </div>
        </div>
      </div>

      {/* Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {saving && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Speichert…</span>}
        {saved && !saving && <span style={{ fontSize: 12, color: '#00C853', fontWeight: 600 }}>✓ Gespeichert</span>}
        <button
          onClick={() => { setCfg(DEFAULTS); save(DEFAULTS) }}
          style={{
            padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)',
            background: 'transparent', cursor: 'pointer', fontSize: 12,
            color: 'var(--text-secondary)',
          }}
        >
          Auf Standard zurücksetzen
        </button>
      </div>
    </div>
  )
}

// ── Tab: KI-Synopsen-Einstellungen ──────────────────────────────────────────────

const SYNOPSIS_DEFAULTS = {
  temp_titel:             0.65,
  temp_struktur:          0.35,
  titel_max_woerter:      3,
  redaktion_min_woerter:  300,
  redaktion_max_woerter:  500,
  presse_max_woerter:     80,
  pressetext_min_zeichen: 280,
  pressetext_max_zeichen: 330,
  strang_max_zeichen:     100,
}

function SynopsenKiTab({ produktionId }: { produktionId: string }) {
  const [cfg, setCfg] = useState<typeof SYNOPSIS_DEFAULTS>(SYNOPSIS_DEFAULTS)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch(`/api/dk-settings/${produktionId}/app-settings`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(s => {
        if (s?.synopsis_settings) {
          try {
            const v = typeof s.synopsis_settings === 'string' ? JSON.parse(s.synopsis_settings) : s.synopsis_settings
            setCfg({ ...SYNOPSIS_DEFAULTS, ...v })
          } catch { /* use defaults */ }
        }
      })
      .catch(() => {})
  }, [produktionId])

  const save = async (next: typeof SYNOPSIS_DEFAULTS) => {
    setSaving(true); setSaved(false)
    try {
      await fetch(`/api/dk-settings/${produktionId}/app-settings/synopsis_settings`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: JSON.stringify(next) }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch { /* noop */ } finally { setSaving(false) }
  }

  const patch = (key: keyof typeof SYNOPSIS_DEFAULTS, val: number) => {
    const next = { ...cfg, [key]: val }
    setCfg(next)
    save(next)
  }

  const numInput = (label: string, key: keyof typeof SYNOPSIS_DEFAULTS, min: number, max: number, step = 1, hint?: string) => (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 100px 1fr', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <div>
        <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{hint}</div>}
      </div>
      <input
        type="number"
        min={min} max={max} step={step}
        value={cfg[key]}
        onChange={e => patch(key, Number(e.target.value))}
        style={{
          width: 80, padding: '5px 8px', borderRadius: 6,
          border: '1px solid var(--border)', background: 'var(--surface)',
          color: 'var(--text-primary)', fontSize: 13, textAlign: 'center',
        }}
      />
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        Default: {SYNOPSIS_DEFAULTS[key]}
      </span>
    </div>
  )

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24 }}>
        Steuert Temperatur und Wort-/Zeichenlimiten für die KI-Synopsen-Generierung.
        Werte fließen direkt in die Prompts ein. Änderungen wirken sofort beim nächsten Generieren.
      </p>

      <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, marginTop: 0 }}>
        Temperatur
      </h3>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, marginTop: 0 }}>
        0.0 = deterministisch · 1.0 = sehr kreativ. Titel brauchen etwas mehr Kreativität als Inhaltstexte.
      </p>
      <div style={{ marginBottom: 20 }}>
        {numInput('Titel (kreativ)', 'temp_titel', 0, 1, 0.05, 'Erster KI-Call für Titelvorschläge')}
        {numInput('Inhaltstexte (präzise)', 'temp_struktur', 0, 1, 0.05, 'Zweiter Call: Kurzinhalt, Redaktion, Strang, Presse, Pressetext')}
      </div>

      <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
        Titel
      </h3>
      <div style={{ marginBottom: 20 }}>
        {numInput('Maximale Wortanzahl', 'titel_max_woerter', 1, 6, 1, 'Ziel-Länge pro Titel im Prompt')}
      </div>

      <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
        Inhaltstexte
      </h3>
      <div style={{ marginBottom: 20 }}>
        {numInput('Redaktion — Mindestwörter', 'redaktion_min_woerter', 100, 600, 10)}
        {numInput('Redaktion — Maximalwörter', 'redaktion_max_woerter', 200, 800, 10)}
        {numInput('Presse — Maximalwörter', 'presse_max_woerter', 30, 200, 5, 'Programm-Presse (werblich)')}
        {numInput('Pressetext — Mindestzeichen', 'pressetext_min_zeichen', 100, 400, 10, 'Sachlicher Pressetext')}
        {numInput('Pressetext — Maximalzeichen', 'pressetext_max_zeichen', 150, 500, 10)}
        {numInput('Strang — Maximalzeichen/Zeile', 'strang_max_zeichen', 50, 200, 5, 'Per-Zeile-Limit für die Strang-Synopse')}
      </div>

      {(saving || saved) && (
        <div style={{ fontSize: 12, color: saving ? 'var(--text-muted)' : '#00C853', fontWeight: 600 }}>
          {saving ? 'Speichert…' : '✓ Gespeichert'}
        </div>
      )}
    </div>
  )
}

// ── Inhaltskennzeichnung Tab ──────────────────────────────────────────────────

const FSK_LEVELS = [
  { value: '0',  label: 'FSK 0',  color: '#00C853', desc: 'Ohne Altersbeschränkung' },
  { value: '6',  label: 'FSK 6',  color: '#00C853', desc: 'Ab 6 Jahren freigegeben' },
  { value: '12', label: 'FSK 12', color: '#FF9500', desc: 'Ab 12 Jahren freigegeben' },
  { value: '16', label: 'FSK 16', color: '#FF6B00', desc: 'Ab 16 Jahren freigegeben' },
  { value: '18', label: 'FSK 18', color: '#FF3B30', desc: 'Keine Jugendfreigabe' },
]

interface DeskriptorVorlage {
  id: number | null
  name: string
  sort_order: number
}

function InhaltskennzeichnungTab({ produktionId }: { produktionId: string }) {
  const [vorlagen, setVorlagen] = useState<DeskriptorVorlage[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [addError, setAddError] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const dragIdx = useRef<number | null>(null)
  const dragOverIdx = useRef<number | null>(null)

  useEffect(() => {
    setLoading(true)
    api.getDeskriptorVorlagen(produktionId)
      .then(rows => setVorlagen(rows))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [produktionId])

  const addVorlage = async () => {
    if (!newName.trim()) return
    setAddError('')
    try {
      const created = await api.createDeskriptorVorlage(produktionId, newName)
      setVorlagen(prev => [...prev, created])
      setNewName('')
    } catch {
      setAddError('Fehler — Name evtl. bereits vorhanden')
    }
  }

  const deleteVorlage = async (id: number) => {
    try {
      const updated = await api.deleteDeskriptorVorlage(produktionId, id)
      setVorlagen(Array.isArray(updated) ? updated : vorlagen.filter(v => v.id !== id))
    } catch {}
  }

  const saveEdit = async () => {
    if (editId === null || !editName.trim()) return
    try {
      const updated = await api.updateDeskriptorVorlage(produktionId, editId, editName)
      setVorlagen(prev => prev.map(v => v.id === editId ? { ...v, ...updated } : v))
      setEditId(null)
    } catch {}
  }

  const onDragEnd = async () => {
    const from = dragIdx.current
    const to = dragOverIdx.current
    if (from === null || to === null || from === to) return
    dragIdx.current = null
    dragOverIdx.current = null
    const reordered = [...vorlagen]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(to, 0, moved)
    const withOrder = reordered.map((v, i) => ({ ...v, sort_order: i }))
    setVorlagen(withOrder)
    const withIds = withOrder.filter(v => v.id !== null) as { id: number; sort_order: number }[]
    if (withIds.length > 0) {
      try {
        await api.reorderDeskriptorVorlagen(produktionId, withIds.map(v => ({ id: v.id, sort_order: v.sort_order })))
      } catch {}
    }
  }

  const SEC: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', display: 'block', marginBottom: 8 }

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24 }}>
        Konfiguriert die verfügbaren Inhaltsdeskriptoren für die Synopsen-Erfassung dieser Produktion.
        Die Deskriptoren folgen dem Standard der{' '}
        <strong>FSK (Freiwillige Selbstkontrolle der Filmwirtschaft)</strong>,
        eingeführt 2021 auf Basis von §14 JuSchG (Jugendschutzgesetz).
        Für TV-Ausstrahlungen ist ergänzend die{' '}
        <strong>FSF (Freiwillige Selbstkontrolle Fernsehen)</strong> zuständig.
      </p>

      {/* FSK-Einstufungen — informativ */}
      <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12, marginTop: 0 }}>
        FSK-Einstufungen
      </h3>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 0, marginBottom: 12 }}>
        Die Einstufung erfolgt im Synopsen-Dialog pro Folge. Die fünf FSK-Stufen sind fest definiert
        und können nicht geändert werden.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        {FSK_LEVELS.map(f => (
          <div key={f.value} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', borderRadius: 8,
            border: `1px solid ${f.color}33`,
            background: `${f.color}11`,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 6,
              background: f.color, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 800, color: '#fff', flexShrink: 0,
            }}>
              {f.value}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{f.label}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{f.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Deskriptor-Vorlagen */}
      <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
        Inhaltsdeskriptoren
      </h3>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 0, marginBottom: 12 }}>
        Diese Liste steht im Synopsen-Dialog zur Auswahl. Reihenfolge per Drag &amp; Drop.
        Standard orientiert sich an den{' '}
        <a href="https://www.fsk.de" target="_blank" rel="noopener noreferrer"
          style={{ color: '#007AFF', textDecoration: 'none' }}>
          FSK-Inhaltsdeskriptoren
        </a>{' '}(fsk.de) und dem{' '}
        <a href="https://www.fsf.de" target="_blank" rel="noopener noreferrer"
          style={{ color: '#007AFF', textDecoration: 'none' }}>
          FSF-System
        </a>{' '}(fsf.de) für Fernsehen.
      </p>

      {loading ? (
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Lädt…</span>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
            {vorlagen.map((v, i) => (
              <div
                key={v.id ?? `default-${i}`}
                draggable={v.id !== null}
                onDragStart={() => { dragIdx.current = i }}
                onDragOver={e => { e.preventDefault(); dragOverIdx.current = i }}
                onDragEnd={onDragEnd}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 10px', borderRadius: 7,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  cursor: v.id !== null ? 'grab' : 'default',
                  opacity: v.id === null ? 0.5 : 1,
                }}
              >
                <span style={{ fontSize: 14, color: 'var(--text-muted)', userSelect: 'none', flexShrink: 0 }}>⋮⋮</span>

                {editId === v.id ? (
                  <>
                    <input
                      autoFocus
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditId(null) }}
                      style={{ flex: 1, padding: '3px 7px', fontSize: 12, borderRadius: 5, border: '1px solid #007AFF', background: 'var(--bg-canvas)', color: 'var(--text-primary)', fontFamily: 'inherit', outline: 'none' }}
                    />
                    <button onClick={saveEdit} style={{ padding: '3px 8px', borderRadius: 5, fontSize: 11, border: '1px solid #00C853', background: 'transparent', color: '#00C853', cursor: 'pointer', fontFamily: 'inherit' }}>
                      ✓
                    </button>
                    <button onClick={() => setEditId(null)} style={{ padding: '3px 8px', borderRadius: 5, fontSize: 11, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'inherit' }}>
                      ✕
                    </button>
                  </>
                ) : (
                  <>
                    <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)' }}>{v.name}</span>
                    {v.id !== null && (
                      <>
                        <button onClick={() => { setEditId(v.id!); setEditName(v.name) }}
                          style={{ padding: '3px 8px', borderRadius: 5, fontSize: 11, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}>
                          Umbenennen
                        </button>
                        <button onClick={() => deleteVorlage(v.id!)}
                          style={{ padding: '3px 8px', borderRadius: 5, fontSize: 11, border: '1px solid rgba(255,59,48,0.3)', background: 'transparent', color: '#FF3B30', cursor: 'pointer', fontFamily: 'inherit' }}>
                          ✕
                        </button>
                      </>
                    )}
                    {v.id === null && (
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>Default (noch nicht gespeichert)</span>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Neuen Deskriptor hinzufügen */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              value={newName}
              onChange={e => { setNewName(e.target.value); setAddError('') }}
              onKeyDown={e => e.key === 'Enter' && addVorlage()}
              placeholder="z. B. Bedrohliche Szenen"
              style={{ flex: 1, padding: '7px 10px', fontSize: 12, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-canvas)', color: 'var(--text-primary)', fontFamily: 'inherit', outline: 'none' }}
            />
            <button
              onClick={addVorlage}
              disabled={!newName.trim()}
              style={{ padding: '7px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, border: 'none', background: newName.trim() ? '#007AFF' : 'var(--border)', color: newName.trim() ? '#fff' : 'var(--text-muted)', cursor: newName.trim() ? 'pointer' : 'default', fontFamily: 'inherit' }}
            >
              + Hinzufügen
            </button>
          </div>
          {addError && <div style={{ fontSize: 11, color: '#FF3B30', marginTop: 6 }}>{addError}</div>}

          <div style={{ marginTop: 20, padding: '10px 12px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <span style={SEC}>Hinweis</span>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
              Deskriptoren werden pro Folge im Synopsen-Dialog erfasst, zusammen mit Schweregrad
              (leicht / mittel / stark) und einer Begründung. Die Einschätzung ist keine offizielle
              FSK-/FSF-Freigabe, sondern dient der internen Produktionsdokumentation.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
