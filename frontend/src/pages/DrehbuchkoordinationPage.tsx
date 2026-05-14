import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import AppShell from '../components/AppShell'
import { api } from '../api/client'
import { useSelectedProduction } from '../contexts'
import { DEFAULT_ENV_COLORS, DEFAULT_ENV_COLORS_DARK, type EnvKey, type EnvColor } from '../data/scenes'
import { DEFAULT_SECTIONS, type StatModalSection } from '../components/StatistikModal'
import { useTerminologie, TERM_OPTIONS, TERM_DEFAULTS, TERM_KEYS, TERM_LABELS } from '../sw-ui'
import type { TermKey, TerminologieConfig } from '../sw-ui'
import DokumentVorlagenEditor, { emptyVorlagenEditorValue, type DokumentVorlagenEditorValue, type PreviewContext } from '../components/editor/DokumentVorlagenEditor'

// ── Constants ────────────────────────────────────────────────────────────────────

const DK_TABS = [
  { id: 'allgemein',              label: 'Allgemein' },
  { id: 'terminologie',           label: 'Terminologie' },
  { id: 'figuren',                label: 'Figuren' },
  { id: 'produktion',            label: 'Produktion' },
  { id: 'export-vorlagen',       label: 'Export-Vorlagen' },
  { id: 'lock-regeln',           label: 'Lock-Regeln' },
  { id: 'dokument-typen',        label: 'Absatzformat-Vorlagen' },
  { id: 'colab-gruppen',         label: 'Colab-Gruppen' },
  { id: 'format-templates',      label: 'Format-Templates' },
  { id: 'benachrichtigungen',    label: 'Benachrichtigungen' },
  { id: 'dokument-einstellungen', label: 'Dokument-Einstellungen' },
  { id: 'statistik-panel',         label: 'Statistik-Panel' },
  { id: 'daily-regeln',            label: 'Daily-Regeln' },
  { id: 'stockshot-templates',    label: 'Stockshot-Vorlagen' },
  { id: 'vorlagen',               label: 'Vorlagen' },
  { id: 'kopf-fusszeilen',        label: 'Kopf-/Fußzeilen' },
]

const KUERZEL_FIELDS = [
  { key: 'int',       label: 'Innen (INT)' },
  { key: 'ext',       label: 'Aussen (EXT)' },
  { key: 'tag',       label: 'Tag' },
  { key: 'nacht',     label: 'Nacht' },
  { key: 'daemmerung',label: 'Daemmerung' },
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

const EREIGNIS_KEYS = ['neue_hauptrolle', 'neue_episodenrolle', 'neuer_komparse', 'neue_location', 'uebernahme_schauspieler', 'uebernahme_komparse'] as const

function useEreignisLabels() {
  const { t } = useTerminologie()
  return {
    neue_hauptrolle:         'Neue Hauptrolle angelegt',
    neue_episodenrolle:      'Neue Episodenrolle angelegt',
    neuer_komparse:          `Neuer ${t('komparse')} angelegt`,
    neue_location:           'Neuer Drehort angelegt',
    uebernahme_schauspieler: `${t('darsteller')} Cross-${t('staffel')} uebernommen`,
    uebernahme_komparse:     `${t('komparse')} Cross-${t('staffel')} uebernommen`,
  } as Record<string, string>
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
              <span style={{ color: '#FF3B30' }}>Alle Werte werden geloescht!</span>
              <button onClick={() => onConfirmDelete(f.id)} style={{ fontSize: 11, padding: '2px 8px', background: '#FF3B30', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Loeschen</button>
              <button onClick={onCancelDelete} style={{ fontSize: 11, padding: '2px 8px', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', background: 'transparent' }}>Abbrechen</button>
            </span>
          ) : (
            <button onClick={() => onDelete(f.id)} style={{ fontSize: 11, padding: '2px 6px', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', background: 'transparent', color: 'var(--text-secondary)' }}>Loeschen</button>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Tab: Allgemein (production-specific endpoints) ───────────────────────────────

function AllgemeinTab({ productionId }: { productionId: string }) {
  const { t } = useTerminologie()
  const [treatmentLabel, setTreatmentLabel] = useState<'Treatment' | 'Storylines' | 'Outline' | null>(null)
  const [seitenformat, setSeitenformat] = useState<'a4' | 'letter'>('a4')
  const [seitenformatSaving, setSeitenformatSaving] = useState(false)
  const [datumsformat, setDatumsformat] = useState<'de' | 'en'>('de')
  const [datumsformatSaving, setDatumsformatSaving] = useState(false)
  const [kuerzel, setKuerzel] = useState<Record<string, string>>(DEFAULT_KUERZEL)
  const [roles, setRoles] = useState<string[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [kuerzelSaving, setKuerzelSaving] = useState(false)
  const [envColors, setEnvColors] = useState<Record<EnvKey, EnvColor>>({ ...DEFAULT_ENV_COLORS })
  const [envColorsDark, setEnvColorsDark] = useState<Record<EnvKey, EnvColor>>({ ...DEFAULT_ENV_COLORS_DARK })
  const [envColorsSaving, setEnvColorsSaving] = useState(false)
  const [envColorsCustom, setEnvColorsCustom] = useState(false)

  useEffect(() => {
    // Treatment label from production-specific endpoint
    fetch(`/api/dk-settings/${productionId}/app-settings`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((data: any) => {
        if (data?.treatment_label) setTreatmentLabel(data.treatment_label)
        if (data?.seitenformat === 'letter') setSeitenformat('letter')
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

  const saveSeitenformat = async (val: 'a4' | 'letter') => {
    setSeitenformat(val)
    setSeitenformatSaving(true)
    await fetch(`/api/dk-settings/${productionId}/app-settings/seitenformat`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: val }),
    }).catch(() => {})
    setSeitenformatSaving(false)
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

  const saveTreatmentLabel = async (val: 'Treatment' | 'Storylines' | 'Outline') => {
    setTreatmentLabel(val)
    setSaving(true)
    await fetch(`/api/dk-settings/${productionId}/app-settings/treatment_label`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: val }),
    }).catch(() => {})
    setSaving(false)
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

  return (
    <div style={{ maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 32 }}>

      <section>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>Treatment-Bezeichnung</h3>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.6 }}>
          Legt fest, wie die Vorstufe vor dem Drehbuch in allen Apps dieser Produktion bezeichnet wird.
        </p>
        <div className="seg" style={{ display: 'inline-flex' }}>
          {(['Treatment', 'Storylines', 'Outline'] as const).map(opt => (
            <button
              key={opt}
              className={treatmentLabel === opt ? 'on' : ''}
              onClick={() => saveTreatmentLabel(opt)}
              disabled={saving}
            >
              {opt}
            </button>
          ))}
        </div>
        {saving && <span style={{ marginLeft: 12, fontSize: 12, color: 'var(--text-secondary)' }}>Wird gespeichert...</span>}
      </section>

      <section>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>Seitenformat</h3>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.6 }}>
          Standard-Papierformat fuer neue Dokumente dieser Produktion.
        </p>
        <div className="seg" style={{ display: 'inline-flex' }}>
          {(['a4', 'letter'] as const).map(opt => (
            <button
              key={opt}
              className={seitenformat === opt ? 'on' : ''}
              onClick={() => saveSeitenformat(opt)}
              disabled={seitenformatSaving}
            >
              {opt === 'a4' ? 'A4 (210 × 297 mm)' : 'US Letter (8.5 × 11 in)'}
            </button>
          ))}
        </div>
        {seitenformatSaving && <span style={{ marginLeft: 12, fontSize: 12, color: 'var(--text-secondary)' }}>Wird gespeichert...</span>}
      </section>

      <section>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>Datumsformat</h3>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.6 }}>
          Format fuer Datumsangaben in Kopf-/Fusszeilen und Exporten dieser Produktion.
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
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>{t('szene', 'c')}-Kuerzel</h3>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.6 }}>
          Abkuerzungen fuer die einzeilige {t('szene', 'c')}uebersicht.
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
          Zuruecksetzen
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
          Auf Standard zuruecksetzen
        </button>
        {envColorsSaving && <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--text-secondary)' }}>Wird gespeichert...</span>}
      </section>

      <section>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>Zugriff</h3>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.6 }}>
          User mit Zugriff auf die Script-App werden in der Auth-App verwaltet.
        </p>
        <div className="admin-roles-list">
          {roles === null
            ? <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Laedt...</span>
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
  const [saving, setSaving] = useState(false)
  const [newFeld, setNewFeld] = useState<{ name: string; typ: string; gilt_fuer: string; optionen: string } | null>(null)
  const [feldSaving, setFeldSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const [presetLoading, setPresetLoading] = useState(false)
  const [presetDone, setPresetDone] = useState(false)

  useEffect(() => {
    fetch('/api/admin/app-settings', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((d: any) => { if (d?.figuren_label) setFigurenLabel(d.figuren_label) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!produktionId) return
    api.getCharakterFelder(produktionId).then(setFelder).catch(() => {})
  }, [produktionId])

  const saveFigurenLabel = async (val: 'Rollen' | 'Figuren' | 'Charaktere') => {
    setFigurenLabel(val)
    setSaving(true)
    await fetch('/api/admin/app-settings/figuren_label', {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: val }),
    }).catch(() => {})
    setSaving(false)
    window.dispatchEvent(new CustomEvent('app-settings-changed'))
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
      <section>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>Bezeichnung (Figuren/Rollen)</h3>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.6 }}>
          Legt fest, wie Rollen in Navigation und UI bezeichnet werden.
        </p>
        <div className="seg" style={{ display: 'inline-flex' }}>
          {(['Rollen', 'Figuren', 'Charaktere'] as const).map(opt => (
            <button key={opt} className={figurenLabel === opt ? 'on' : ''} onClick={() => saveFigurenLabel(opt)} disabled={saving}>
              {opt}
            </button>
          ))}
        </div>
        {saving && <span style={{ marginLeft: 12, fontSize: 12, color: 'var(--text-secondary)' }}>Wird gespeichert...</span>}
      </section>

      {!produktionId && (
        <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Bitte eine Produktion auswaehlen, um Felder zu konfigurieren.</p>
      )}

      {produktionId && (
        <>
          <section>
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>Felder fuer {figurenLabel} & {t('komparse', 'p')}</h3>
            <FeldListe felder={rollenFelder} onDelete={id => setDeleteConfirm(id)} deleteConfirm={deleteConfirm} onConfirmDelete={handleDeleteFeld} onCancelDelete={() => setDeleteConfirm(null)} />
          </section>

          <section>
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>Felder fuer {t('motiv', 'p')}</h3>
            <FeldListe felder={motivFelder} onDelete={id => setDeleteConfirm(id)} deleteConfirm={deleteConfirm} onConfirmDelete={handleDeleteFeld} onCancelDelete={() => setDeleteConfirm(null)} />
          </section>

          {/* Rollenprofil preset */}
          <section>
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>Rollenprofil-Standardfelder</h3>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.6 }}>
              Fuegt die Standard-Rollenprofil-Felder hinzu (Alter, Geburtsort, Charakter, Backstory usw.). Bereits vorhandene Felder werden nicht ueberschrieben.
            </p>
            <button
              onClick={handleRollenprofilPreset}
              disabled={presetLoading}
              style={{ fontSize: 12, padding: '7px 14px', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', background: presetDone ? '#00C853' : 'transparent', color: presetDone ? '#fff' : 'var(--text)', transition: 'background 0.2s, color 0.2s' }}
            >
              {presetLoading ? 'Wird hinzugefuegt...' : presetDone ? 'Felder hinzugefuegt' : 'Rollenprofil-Felder hinzufuegen'}
            </button>
          </section>

          {/* Add field form */}
          {newFeld ? (
            <section style={{ padding: 16, background: 'var(--bg-subtle)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
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
            </section>
          ) : (
            <button onClick={() => setNewFeld({ name: '', typ: 'text', gilt_fuer: 'alle', optionen: '' })}
              style={{ alignSelf: 'flex-start', fontSize: 12, padding: '7px 14px', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', background: 'transparent', color: 'var(--text)' }}>
              + Feld hinzufuegen
            </button>
          )}
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

  const [kategorien, setKategorien] = useState<any[]>([])
  const [labels, setLabels] = useState<any[]>([])
  const [colors, setColors] = useState<any[]>([])
  const [memoSchwelle, setMemoSchwelle] = useState<number>(100)
  const [vorstoppEin, setVorstoppEin] = useState<{ methode: string; menge: number; dauer_sekunden: number }>({
    methode: 'seiten', menge: 54, dauer_sekunden: 60,
  })
  const [saving, setSaving] = useState<Record<string, boolean>>({})

  // New-item input state
  const [newKat, setNewKat] = useState({ name: '', typ: 'rolle' as 'rolle' | 'komparse' })
  const [newLabel, setNewLabel] = useState({ name: '', is_produktionsfassung: false })
  const [newColor, setNewColor] = useState({ name: '', color: '#4A90D9' })

  useEffect(() => {
    if (!produktionId) return
    api.getCharKategorien(produktionId).then(setKategorien).catch(() => setKategorien([]))
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

  // ── Character Kategorien ──
  const addKat = async () => {
    if (!newKat.name.trim()) return
    set('kat', true)
    try {
      const r = await api.createCharKategorie(produktionId, newKat)
      setKategorien(prev => [...prev, r])
      setNewKat({ name: '', typ: 'rolle' })
    } catch {} finally { set('kat', false) }
  }
  const delKat = async (id: number) => {
    try { await api.deleteCharKategorie(produktionId, id); setKategorien(prev => prev.filter(k => k.id !== id)) } catch {}
  }
  const reorderKat = async (ordered: any[]) => {
    setKategorien(ordered)
    const order = ordered.map((k, i) => ({ id: k.id, sort_order: i + 1 }))
    try { const r = await api.reorderCharKategorien(produktionId, order); setKategorien(r) } catch {}
  }

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
        Keine Produktion ausgewaehlt. Waehle eine Produktion im Header aus.
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 640 }}>

      {/* ── Character Kategorien ── */}
      <section style={sectionStyle}>
        <h3 style={h3Style}>Charakter-Kategorien</h3>
        <p style={subStyle}>Definiert die Kategorien fuer Rollen und {t('komparse', 'p')} in dieser Produktion. Reihenfolge per Drag &amp; Drop.</p>

        <SortableList
          items={kategorien}
          onReorder={reorderKat}
          renderItem={(k, handle) => (
            <div style={rowStyle}>
              {handle}
              <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-subtle)', padding: '2px 7px', borderRadius: 99, fontWeight: 600, textTransform: 'uppercase', flexShrink: 0 }}>
                {k.typ === 'komparse' ? t('komparse') : 'Rolle'}
              </span>
              <span style={{ flex: 1, fontSize: 13 }}>{k.name}</span>
              <button style={delBtnStyle} onClick={() => delKat(k.id)} title="Loeschen">x</button>
            </div>
          )}
        />

        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input
            style={{ ...inputStyle, flex: 1 }}
            placeholder="Neue Kategorie..."
            value={newKat.name}
            onChange={e => setNewKat(v => ({ ...v, name: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && addKat()}
          />
          <select style={inputStyle} value={newKat.typ} onChange={e => setNewKat(v => ({ ...v, typ: e.target.value as any }))}>
            <option value="rolle">Rolle</option>
            <option value="komparse">{t('komparse')}</option>
          </select>
          <button style={btnStyle} onClick={addKat} disabled={busy('kat') || !newKat.name.trim()}>
            {busy('kat') ? '...' : '+ Hinzufuegen'}
          </button>
        </div>
      </section>

      {/* ── Stage Labels ── */}
      <section style={sectionStyle}>
        <h3 style={h3Style}>Fassungs-Labels</h3>
        <p style={subStyle}>Labels fuer Fassungen (Stages) dieser Produktion. Ein Label kann als Produktionsfassung markiert werden -- dieses loest den Schloss-Mechanismus aus.</p>

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
              <button style={delBtnStyle} onClick={() => delLabel(l.id)} title="Loeschen">x</button>
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
            {busy('lbl') ? '...' : '+ Hinzufuegen'}
          </button>
        </div>
      </section>

      {/* ── Revision Colors ── */}
      <section style={sectionStyle}>
        <h3 style={h3Style}>Revisions-Farben (WGA-Standard)</h3>
        <p style={subStyle}>Farbmarkierung fuer Revisionsstaende. Reihenfolge bestimmt die Revisions-Sequenz.</p>

        <SortableList
          items={colors}
          onReorder={reorderColors}
          renderItem={(c, handle) => (
            <div style={rowStyle}>
              {handle}
              <span style={{ width: 16, height: 16, borderRadius: 4, background: c.color, flexShrink: 0, border: '1px solid rgba(0,0,0,0.1)' }} />
              <span style={{ flex: 1, fontSize: 13 }}>{c.name}</span>
              <code style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.color}</code>
              <button style={delBtnStyle} onClick={() => delColor(c.id)} title="Loeschen">x</button>
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
            {busy('col') ? '...' : '+ Hinzufuegen'}
          </button>
        </div>
      </section>

      {/* ── Revision Export Einstellungen ── */}
      <section style={sectionStyle}>
        <h3 style={h3Style}>Revisions-Export</h3>
        <p style={subStyle}>Aenderungen mit weniger als dieser Zeichenanzahl werden im Export als kurze Notiz (Memo-Zeile) statt als vollstaendiger Absatz dargestellt.</p>
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
        <p style={subStyle}>Basis fuer die automatische Vorstopp-Berechnung aus der Seitenanzahl einer Szene.</p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Methode</span>
            <select
              style={inputStyle}
              value={vorstoppEin.methode}
              onChange={e => setVorstoppEin(v => ({ ...v, methode: e.target.value }))}
            >
              <option value="seiten">Seiten</option>
              <option value="sekunden">Sekunden direkt</option>
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {vorstoppEin.methode === 'seiten' ? 'Sekunden pro Seite (1/8)' : 'Menge'}
            </span>
            <input
              type="number"
              style={{ ...inputStyle, width: 120 }}
              value={vorstoppEin.menge}
              min={0}
              step={0.5}
              onChange={e => setVorstoppEin(v => ({ ...v, menge: parseFloat(e.target.value) || 0 }))}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Dauer gesamt (Sek.)</span>
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

function DokumentTypenTab() {
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
  const [presetName, setPresetName] = useState('')
  const [filterKat, setFilterKat] = useState<string>('alle')

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

  const handleApplyPreset = async (presetId: string) => {
    if (!confirm('Alle bestehenden Absatzformate dieser Produktion werden ersetzt. Fortfahren?')) return
    setMsg(null)
    try {
      const result = await api.applyAbsatzformatPreset(produktionId, presetId)
      setFormate(result); setMsg('Preset angewendet.')
    } catch (e: any) { setMsg(e.message ?? 'Fehler') }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Absatzformat "${name}" loeschen?`)) return
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
      await api.createAbsatzformatPreset({ name: presetName.trim(), formate: presetFormate })
      setShowSavePreset(false); setPresetName(''); await load(); setMsg('Preset gespeichert.')
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

  if (!produktionId) return <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Bitte zuerst eine Produktion waehlen.</p>

  return (
    <div style={{ maxWidth: 900 }}>
      {/* Preset-Auswahl */}
      <section style={{ marginBottom: 20, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, fontWeight: 500 }}>Preset:</label>
        <select
          onChange={e => { if (e.target.value) handleApplyPreset(e.target.value); e.target.value = '' }}
          style={{ ...selectStyle, minWidth: 200 }}
          defaultValue=""
        >
          <option value="" disabled>Preset anwenden...</option>
          {presets.map(p => (
            <option key={p.id} value={p.id}>{p.name} {p.ist_system ? '(System)' : ''}</option>
          ))}
        </select>
        <button onClick={() => setShowSavePreset(true)}
          style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 11, cursor: 'pointer', background: 'transparent', color: 'var(--text-primary)' }}>
          Als Preset speichern...
        </button>
        {formate.length > 0 && (
          <button onClick={async () => {
            if (!confirm('Bestehende Szenen-Inhalte von screenplay_element auf absatz-Nodes migrieren?')) return
            try {
              const result = await api.migrateAbsatzformatContent(produktionId)
              setMsg(`${result.migrated_scenes} von ${result.total_scenes} Szenen migriert`)
            } catch (e: any) { setMsg(e.message) }
          }}
            style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 11, cursor: 'pointer', background: 'transparent', color: 'var(--text-secondary)' }}>
            Content migrieren
          </button>
        )}
        <div style={{ flex: 1 }} />
        <label style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Filter:</label>
        <select value={filterKat} onChange={e => setFilterKat(e.target.value)} style={selectStyle}>
          <option value="alle">Alle</option>
          <option value="drehbuch">Drehbuch</option>
          <option value="storyline">Storyline</option>
          <option value="notiz">Notiz</option>
        </select>
      </section>

      {msg && <p style={{ fontSize: 12, color: 'var(--sw-info)', marginBottom: 8 }}>{msg}</p>}
      {loading && <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Laedt...</p>}

      {/* Absatzformate-Tabelle */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead><tr style={{ borderBottom: '2px solid var(--border)', background: 'var(--bg-subtle)' }}>
          <th style={{ padding: '6px 2px', width: 16 }} />
          <th style={{ textAlign: 'left', padding: '6px 6px', fontWeight: 600 }}>Name</th>
          <th style={{ textAlign: 'left', padding: '6px 4px', fontWeight: 600 }}>Prefix</th>
          <th style={{ textAlign: 'left', padding: '6px 4px', fontWeight: 600 }}>Kuerzel</th>
          <th style={{ textAlign: 'left', padding: '6px 4px', fontWeight: 600 }}>Kat.</th>
          <th style={{ textAlign: 'left', padding: '6px 4px', fontWeight: 600 }}>Schrift</th>
          <th style={{ textAlign: 'center', padding: '6px 4px', fontWeight: 600 }}>Groesse</th>
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
                <label style={{ fontSize: 10, marginRight: 4 }}><input type="checkbox" checked={editData.bold} onChange={e => setEditData({ ...editData, bold: e.target.checked })} /> B</label>
                <label style={{ fontSize: 10, marginRight: 4 }}><input type="checkbox" checked={editData.italic} onChange={e => setEditData({ ...editData, italic: e.target.checked })} /> I</label>
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
              <td style={{ padding: '6px 6px', fontWeight: f.ist_standard ? 600 : 400 }}>
                {f.name}
              </td>
              <td style={{ padding: '6px 4px', color: f.textbaustein ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: f.textbaustein ? 600 : 400, fontSize: 10 }}>{f.textbaustein ?? '—'}</td>
              <td style={{ padding: '6px 4px', color: 'var(--text-secondary)' }}>{f.kuerzel ?? '-'}</td>
              <td style={{ padding: '6px 4px', color: 'var(--text-secondary)' }}>{f.kategorie === 'alle' ? '*' : f.kategorie === 'drehbuch' ? 'DB' : f.kategorie === 'notiz' ? 'NZ' : 'SL'}</td>
              <td style={{ padding: '6px 4px', color: 'var(--text-secondary)', fontSize: 10 }}>{f.font_family} {f.font_size}</td>
              <td style={{ padding: '6px 4px', textAlign: 'center', color: 'var(--text-secondary)' }}>{f.font_size}</td>
              <td style={{ padding: '6px 4px', textAlign: 'center', fontSize: 10 }}>
                {f.bold && <b>B</b>}{f.italic && <i>I</i>}{f.uppercase && <span>UC</span>}
                {!f.bold && !f.italic && !f.uppercase && '-'}
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
            <tr><td colSpan={17} style={{ padding: 16, color: 'var(--text-muted)', textAlign: 'center' }}>
              Keine Absatzformate. Waehle ein Preset aus, um zu starten.
            </td></tr>
          )}
        </tbody>
      </table>

      {/* Add button */}
      <div style={{ marginTop: 12 }}>
        {!showAdd ? (
          <button onClick={() => setShowAdd(true)}
            style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 11, cursor: 'pointer', background: 'transparent', color: 'var(--text-primary)' }}>
            + Format hinzufuegen
          </button>
        ) : (
          <AbsatzformatAddForm formate={formate} onAdd={handleAdd} onCancel={() => setShowAdd(false)} />
        )}
      </div>

      {/* Save-as-Preset Dialog */}
      {showSavePreset && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 24, minWidth: 320, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Als Preset speichern</h3>
            <input value={presetName} onChange={e => setPresetName(e.target.value)} placeholder="Preset-Name"
              style={{ ...inputStyle, width: '100%', marginBottom: 12, padding: '8px 12px', fontSize: 13 }} />
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Speichert die {formate.length} aktuellen Absatzformate als wiederverwendbares Preset.
            </p>
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
    </div>
  )
}

// ── Sub-Component: Add Absatzformat Form ─────────────────────────────────────────

function AbsatzformatAddForm({ formate, onAdd, onCancel }: { formate: any[]; onAdd: (d: any) => void; onCancel: () => void }) {
  const [data, setData] = useState({
    name: '', kuerzel: '', kategorie: 'alle', font_family: 'Courier Prime', font_size: 12,
    bold: false, italic: false, uppercase: false, text_align: 'left',
    margin_left: 0, margin_right: 0, space_before: 12, space_after: 0, line_height: 1.0,
    enter_next_format: null as string | null, tab_next_format: null as string | null,
    textbaustein: '', sort_order: formate.length + 1,
    shortcut: '' as string,
  })

  const inputStyle = { padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', fontSize: 11, background: 'var(--bg-surface)', color: 'var(--text-primary)' } as const

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginTop: 8, background: 'var(--bg-subtle)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, fontSize: 11 }}>
        <div><label style={{ display: 'block', fontSize: 10, color: 'var(--text-secondary)', marginBottom: 2 }}>Name *</label>
          <input value={data.name} onChange={e => setData({ ...data, name: e.target.value })} style={{ ...inputStyle, width: '100%' }} /></div>
        <div><label style={{ display: 'block', fontSize: 10, color: 'var(--text-secondary)', marginBottom: 2 }}>Kuerzel</label>
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
        <div><label style={{ display: 'block', fontSize: 10, color: 'var(--text-secondary)', marginBottom: 2 }}>Groesse (pt)</label>
          <input type="number" className="no-spin" value={data.font_size} onChange={e => setData({ ...data, font_size: parseFloat(e.target.value) })} style={{ ...inputStyle, width: '100%' }} /></div>
        <div><label style={{ display: 'block', fontSize: 10, color: 'var(--text-secondary)', marginBottom: 2 }}>Ausrichtung</label>
          <select value={data.text_align} onChange={e => setData({ ...data, text_align: e.target.value })} style={{ ...inputStyle, width: '100%' }}>
            <option value="left">Links</option><option value="center">Mitte</option><option value="right">Rechts</option>
          </select></div>
        <div><label style={{ display: 'block', fontSize: 10, color: 'var(--text-secondary)', marginBottom: 2 }}>Stil</label>
          <div style={{ display: 'flex', gap: 6, paddingTop: 4 }}>
            <label><input type="checkbox" checked={data.bold} onChange={e => setData({ ...data, bold: e.target.checked })} /> B</label>
            <label><input type="checkbox" checked={data.italic} onChange={e => setData({ ...data, italic: e.target.checked })} /> I</label>
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

// ── Tab: Colab-Gruppen ───────────────────────────────────────────────────────────

function ColabGruppenTab() {
  const { selectedProduction } = useSelectedProduction()
  const produktionId = selectedProduction?.id ?? ''
  const [gruppen, setGruppen] = useState<any[]>([])
  const [name, setName] = useState('')
  const [typ, setTyp] = useState<'colab' | 'produktion'>('colab')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [mitglieder, setMitglieder] = useState<Record<number, any[]>>({})
  const [newUserId, setNewUserId] = useState('')
  const [newUserName, setNewUserName] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  const load = async () => {
    if (!produktionId) return
    try { setGruppen(await api.getColabGruppen(produktionId)) } catch {}
  }

  useEffect(() => { load() }, [produktionId])

  const loadMitglieder = async (gruppeId: number) => {
    try {
      const res = await fetch(`/api/admin/colab-gruppen/${gruppeId}/mitglieder`, { credentials: 'include' })
      const data = await res.json()
      setMitglieder(prev => ({ ...prev, [gruppeId]: data }))
    } catch {}
  }

  const handleCreate = async () => {
    if (!name.trim() || !produktionId) return
    try {
      await api.createColabGruppe(produktionId, { name: name.trim(), typ })
      setName(''); await load(); setMsg('Gruppe erstellt.')
    } catch (e: any) { setMsg(e.message) }
  }

  const handleDelete = async (gruppeId: number) => {
    if (!confirm('Gruppe loeschen?')) return
    try { await api.deleteColabGruppe(produktionId, gruppeId); await load() } catch (e: any) { setMsg(e.message) }
  }

  const handleAddMitglied = async (gruppeId: number) => {
    if (!newUserId.trim()) return
    try {
      await fetch(`/api/admin/colab-gruppen/${gruppeId}/mitglieder`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: newUserId.trim(), user_name: newUserName.trim() || newUserId.trim() }),
      })
      setNewUserId(''); setNewUserName(''); loadMitglieder(gruppeId)
    } catch {}
  }

  const handleRemoveMitglied = async (gruppeId: number, userId: string) => {
    try {
      await fetch(`/api/admin/colab-gruppen/${gruppeId}/mitglieder/${userId}`, { method: 'DELETE', credentials: 'include' })
      loadMitglieder(gruppeId)
    } catch {}
  }

  return (
    <div>
      {!produktionId && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Bitte zuerst eine Produktion waehlen.</p>}
      {produktionId && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Gruppenname"
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, width: 200 }} />
            <select value={typ} onChange={e => setTyp(e.target.value as any)}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, background: 'var(--bg-surface)' }}>
              <option value="colab">Colab</option>
              <option value="produktion">Produktion</option>
            </select>
            <button onClick={handleCreate} disabled={!name.trim()}
              style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: 'var(--text-primary)', color: '#fff', fontSize: 12, cursor: 'pointer' }}>
              Erstellen
            </button>
          </div>
          {msg && <p style={{ fontSize: 12, color: 'var(--sw-info)', marginBottom: 8 }}>{msg}</p>}
          <div style={{ marginTop: 16 }}>
            {gruppen.map(g => (
              <div key={g.id} style={{ border: '1px solid var(--border)', borderRadius: 8, marginBottom: 8, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', gap: 8, cursor: 'pointer', background: 'var(--bg-surface)' }}
                  onClick={() => { setExpandedId(expandedId === g.id ? null : g.id); if (expandedId !== g.id) loadMitglieder(g.id) }}>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{g.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-subtle)', padding: '2px 6px', borderRadius: 4 }}>{g.typ}</span>
                  <button onClick={e => { e.stopPropagation(); handleDelete(g.id) }}
                    style={{ fontSize: 11, color: '#FF3B30', background: 'none', border: 'none', cursor: 'pointer' }}>Loeschen</button>
                </div>
                {expandedId === g.id && (
                  <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                      <input value={newUserId} onChange={e => setNewUserId(e.target.value)} placeholder="User-ID"
                        style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', fontSize: 11, width: 120 }} />
                      <input value={newUserName} onChange={e => setNewUserName(e.target.value)} placeholder="Name"
                        style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', fontSize: 11, width: 140 }} />
                      <button onClick={() => handleAddMitglied(g.id)}
                        style={{ padding: '4px 10px', borderRadius: 4, border: 'none', background: 'var(--text-primary)', color: '#fff', fontSize: 11, cursor: 'pointer' }}>+</button>
                    </div>
                    {(mitglieder[g.id] ?? []).map((m: any) => (
                      <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, fontSize: 12 }}>
                        <span style={{ flex: 1 }}>{m.user_name ?? m.user_id}</span>
                        <button onClick={() => handleRemoveMitglied(g.id, m.user_id)}
                          style={{ fontSize: 11, color: '#FF3B30', background: 'none', border: 'none', cursor: 'pointer' }}>x</button>
                      </div>
                    ))}
                    {(mitglieder[g.id] ?? []).length === 0 && <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Keine Mitglieder.</p>}
                  </div>
                )}
              </div>
            ))}
            {gruppen.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Keine Gruppen.</p>}
          </div>
        </>
      )}
    </div>
  )
}

// ── Tab: Format-Templates ────────────────────────────────────────────────────────

function FormatTemplatesTab() {
  const [templates, setTemplates] = useState<any[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [elemente, setElemente] = useState<any[]>([])
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    api.getFormatTemplates().then(setTemplates).catch(() => {})
  }, [])

  const loadElemente = async (id: number) => {
    setSelectedId(id)
    try {
      const ts = await api.getFormatTemplates()
      const found = ts.find((x: any) => x.id === id)
      setElemente(found?.elemente ?? [])
    } catch {}
  }

  const handleSaveElemente = async () => {
    if (!selectedId) return
    try {
      await api.updateFormatElemente(selectedId, elemente)
      setMsg('Gespeichert.')
    } catch (e: any) { setMsg(e.message) }
  }

  const updateEl = (idx: number, field: string, val: any) => {
    setElemente(prev => prev.map((e, i) => i === idx ? { ...e, [field]: val } : e))
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {templates.map(t => (
          <button key={t.id} onClick={() => loadElemente(t.id)}
            style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, cursor: 'pointer',
              background: selectedId === t.id ? 'var(--text-primary)' : 'transparent',
              color: selectedId === t.id ? '#fff' : 'var(--text-primary)' }}>
            {t.name}{t.ist_standard ? ' (Standard)' : ''}
          </button>
        ))}
      </div>
      {selectedId && (
        <>
          {msg && <p style={{ fontSize: 12, color: 'var(--sw-info)', marginBottom: 8 }}>{msg}</p>}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Element', 'Links %', 'Rechts %', 'Ausrichtung', 'Grossbuchst.', 'Tab-Folge', 'Enter-Folge'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-secondary)', fontWeight: 500 }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {elemente.map((e, i) => (
                  <tr key={e.element_typ} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 8px', fontWeight: 500 }}>{e.element_typ}</td>
                    <td style={{ padding: '6px 4px' }}><input type="number" value={e.einrueckung_links} onChange={ev => updateEl(i, 'einrueckung_links', +ev.target.value)}
                      style={{ width: 48, padding: '2px 4px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11 }} /></td>
                    <td style={{ padding: '6px 4px' }}><input type="number" value={e.einrueckung_rechts} onChange={ev => updateEl(i, 'einrueckung_rechts', +ev.target.value)}
                      style={{ width: 48, padding: '2px 4px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11 }} /></td>
                    <td style={{ padding: '6px 4px' }}>
                      <select value={e.ausrichtung} onChange={ev => updateEl(i, 'ausrichtung', ev.target.value)}
                        style={{ padding: '2px 4px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11, background: 'var(--bg-surface)' }}>
                        {['left','center','right'].map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                      <input type="checkbox" checked={!!e.grossbuchstaben} onChange={ev => updateEl(i, 'grossbuchstaben', ev.target.checked)} />
                    </td>
                    <td style={{ padding: '6px 4px' }}><input value={e.tab_folge_element ?? ''} onChange={ev => updateEl(i, 'tab_folge_element', ev.target.value)}
                      style={{ width: 90, padding: '2px 4px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11 }} /></td>
                    <td style={{ padding: '6px 4px' }}><input value={e.enter_folge_element ?? ''} onChange={ev => updateEl(i, 'enter_folge_element', ev.target.value)}
                      style={{ width: 90, padding: '2px 4px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11 }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={handleSaveElemente} style={{ marginTop: 16, padding: '8px 20px', borderRadius: 6, border: 'none', background: 'var(--text-primary)', color: '#fff', fontSize: 12, cursor: 'pointer' }}>
            Speichern
          </button>
        </>
      )}
    </div>
  )
}

// ── Tab: Benachrichtigungen ──────────────────────────────────────────────────────

function BenachrichtigungenTab() {
  const { selectedProduction } = useSelectedProduction()
  const produktionId = selectedProduction?.id ?? ''
  const EREIGNIS_LABELS = useEreignisLabels()
  const [settings, setSettings] = useState<Record<string, { empfaenger: string; aktiv: boolean }>>({})
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!produktionId) return
    fetch(`/api/admin/benachrichtigungen/${produktionId}`, { credentials: 'include' })
      .then(r => r.json())
      .then((data: any[]) => {
        const map: Record<string, { empfaenger: string; aktiv: boolean }> = {}
        EREIGNIS_KEYS.forEach(k => {
          const found = data.find(d => d.ereignis === k)
          map[k] = { empfaenger: (found?.empfaenger_user_ids ?? []).join(', '), aktiv: found?.aktiv ?? true }
        })
        setSettings(map)
      }).catch(() => {})
  }, [produktionId])

  const handleSave = async () => {
    if (!produktionId) return
    try {
      const body = Object.entries(settings).map(([ereignis, v]) => ({
        ereignis,
        empfaenger_user_ids: v.empfaenger.split(',').map(s => s.trim()).filter(Boolean),
        aktiv: v.aktiv,
      }))
      await fetch(`/api/admin/benachrichtigungen/${produktionId}`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      setMsg('Gespeichert.')
    } catch (e: any) { setMsg(e.message) }
  }

  return (
    <div>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 20, marginTop: 0 }}>
        User-IDs (kommagetrennt) die bei diesen Ereignissen eine Benachrichtigung erhalten.
      </p>
      {!produktionId && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Bitte zuerst eine Produktion waehlen.</p>}
      {produktionId && (
        <>
          {msg && <p style={{ fontSize: 12, color: 'var(--sw-info)', marginBottom: 12 }}>{msg}</p>}
          {Object.entries(EREIGNIS_LABELS).map(([k, label]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <input type="checkbox" checked={settings[k]?.aktiv ?? true}
                onChange={e => setSettings(prev => ({ ...prev, [k]: { ...prev[k], aktiv: e.target.checked } }))} />
              <span style={{ fontSize: 12, width: 280 }}>{label}</span>
              <input value={settings[k]?.empfaenger ?? ''} placeholder="user-id1, user-id2"
                onChange={e => setSettings(prev => ({ ...prev, [k]: { ...prev[k], empfaenger: e.target.value } }))}
                style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12 }} />
            </div>
          ))}
          <button onClick={handleSave} style={{ marginTop: 12, padding: '8px 20px', borderRadius: 6, border: 'none', background: 'var(--text-primary)', color: '#fff', fontSize: 12, cursor: 'pointer' }}>
            Speichern
          </button>
        </>
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

function DokumentEinstellungenTab() {
  const { selectedProduction } = useSelectedProduction()
  const produktionId = selectedProduction?.id ?? null
  const [overrideRollen, setOverrideRollen] = useState<string[]>([])
  const [numModus, setNumModus] = useState<'global' | 'per_typ'>('global')
  const [newRolle, setNewRolle] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  // Line number settings
  const [lnFont, setLnFont] = useState("'Courier Prime', 'Courier New', monospace")
  const [lnSize, setLnSize] = useState(10)
  const [lnColor, setLnColor] = useState('#999999')
  const [lnMargin, setLnMargin] = useState(1)

  // Page margin
  const [pageMarginMm, setPageMarginMm] = useState(25)

  useEffect(() => {
    api.getOverrideRollen().then((d: any) => setOverrideRollen(d.rollen ?? [])).catch(() => {})
    api.getFassungsNummerierung().then((d: any) => setNumModus((d.modus ?? 'global') as 'global' | 'per_typ')).catch(() => {})
    if (produktionId) {
      api.getDkAppSettings(produktionId).then((data: any) => {
        if (data?.ln_settings) {
          try {
            const s = JSON.parse(data.ln_settings)
            if (s.fontFamily) setLnFont(s.fontFamily)
            if (typeof s.fontSizePt === 'number') setLnSize(s.fontSizePt)
            if (s.color) setLnColor(s.color)
            if (typeof s.marginCm === 'number') setLnMargin(s.marginCm)
          } catch {}
        }
        if (data?.page_margin_mm) {
          const v = parseFloat(data.page_margin_mm)
          if (v >= 10 && v <= 50) setPageMarginMm(v)
        }
      }).catch(() => {})
    }
  }, [produktionId])

  const handleSave = async () => {
    try {
      await api.updateOverrideRollen(overrideRollen)
      await api.updateFassungsNummerierung(numModus)
      if (produktionId) {
        await api.updateDkAppSetting(produktionId, 'ln_settings', JSON.stringify({
          fontFamily: lnFont, fontSizePt: lnSize, color: lnColor, marginCm: lnMargin,
        }))
        await api.updateDkAppSetting(produktionId, 'page_margin_mm', String(pageMarginMm))
        window.dispatchEvent(new CustomEvent('app-settings-changed', { detail: { productionId: produktionId } }))
      }
      setMsg('Gespeichert.')
    } catch (e: any) { setMsg(e.message) }
  }

  const addRolle = () => {
    const r = newRolle.trim()
    if (!r || overrideRollen.includes(r)) return
    setOverrideRollen(prev => [...prev, r]); setNewRolle('')
  }

  return (
    <div style={{ maxWidth: 600 }}>

      <section style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Fassungs-Nummerierung</h3>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Global: Alle Dokument-Typen teilen eine gemeinsame Nummerierung pro Folge.
          Pro Typ: Jeder Typ beginnt bei Fassung 1.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['global', 'per_typ'] as const).map(m => (
            <button key={m} onClick={() => setNumModus(m)}
              style={{ padding: '6px 16px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, cursor: 'pointer',
                background: numModus === m ? 'var(--text-primary)' : 'transparent',
                color: numModus === m ? '#fff' : 'var(--text-primary)' }}>
              {m === 'global' ? 'Global' : 'Pro Typ'}
            </button>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Status-Override-Rollen</h3>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Nutzer mit diesen Rollen koennen alle Dokumente lesen und bearbeiten,
          unabhaengig von der Sichtbarkeits-Einstellung.
        </p>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <input value={newRolle} onChange={e => setNewRolle(e.target.value)} placeholder="z.B. herstellungsleitung"
            onKeyDown={e => e.key === 'Enter' && addRolle()}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, width: 220 }} />
          <button onClick={addRolle}
            style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: 'var(--text-primary)', color: '#fff', fontSize: 12, cursor: 'pointer' }}>
            Hinzufuegen
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {overrideRollen.map(r => (
            <span key={r} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 99,
              background: 'var(--bg-subtle)', border: '1px solid var(--border)', fontSize: 12 }}>
              {r}
              <button onClick={() => setOverrideRollen(prev => prev.filter(x => x !== r))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, lineHeight: 1, padding: 0 }}>x</button>
            </span>
          ))}
          {overrideRollen.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Keine Override-Rollen.</span>}
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Zeilennummern (Standard-Einstellungen)</h3>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Standard-Darstellung der Zeilennummern fuer alle Nutzer dieser Produktion.
          Nutzer koennen den Abstand in ihren Ansichts-Einstellungen individuell ueberschreiben.
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
            <span style={{ color: 'var(--text-secondary)' }}>Groesse (pt)</span>
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

          <label style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ color: 'var(--text-secondary)' }}>Abstand vom Textrand (cm)</span>
            <input type="number" min={0.5} max={3} step={0.1} value={lnMargin}
              onChange={e => setLnMargin(Math.max(0.5, Math.min(3, parseFloat(e.target.value) || 1)))}
              style={{ width: 60, fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-subtle)', color: 'var(--text-primary)', textAlign: 'center' }} />
          </label>
        </div>

        <div style={{ padding: 12, background: 'var(--bg-subtle)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Vorschau:</span>
          <div style={{ marginTop: 6, fontFamily: lnFont, fontSize: `${lnSize}pt`, color: lnColor }}>
            5 &nbsp;&nbsp; 10 &nbsp;&nbsp; 15 &nbsp;&nbsp; 20
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Seitenrand</h3>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Abstand vom physischen Papierrand zum Textbereich (alle Seiten).
          Standard: 25 mm (≈ 1 Zoll). Gilt fuer alle Editoren dieser Produktion.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="number" min={10} max={50} step={1} value={pageMarginMm}
            onChange={e => setPageMarginMm(Math.max(10, Math.min(50, parseInt(e.target.value) || 25)))}
            style={{ width: 60, fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-subtle)', color: 'var(--text-primary)', textAlign: 'center' }} />
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>mm</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
            ({Math.round(pageMarginMm * 96 / 25.4)} px)
          </span>
        </div>
      </section>

      {msg && <p style={{ fontSize: 12, color: 'var(--sw-info)', marginBottom: 8 }}>{msg}</p>}
      <button onClick={handleSave}
        style={{ padding: '8px 24px', borderRadius: 6, border: 'none', background: 'var(--text-primary)', color: '#fff', fontSize: 12, cursor: 'pointer' }}>
        Speichern
      </button>
    </div>
  )
}

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
        Uebernimmt Einstellungen einer anderen Produktion in die aktuelle.
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

function TerminologieTab() {
  const { config: currentConfig } = useTerminologie()
  const [config, setConfig] = useState<TerminologieConfig>({ ...currentConfig })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setConfig({ ...currentConfig })
  }, [currentConfig])

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
    <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 32 }}>
      <section>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>Begriffe anpassen</h3>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 20px', lineHeight: 1.6 }}>
          In der Branche werden fuer dieselben Konzepte unterschiedliche Begriffe verwendet.
          Hier legst du fest, welcher Begriff jeweils in der gesamten App verwendet wird.
        </p>
      </section>

      {TERM_KEYS.map(key => {
        const options = TERM_OPTIONS[key]
        const optionNames = Object.keys(options)
        return (
          <section key={key}>
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>{TERM_LABELS[key]}</h3>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.6 }}>
              Singular: <strong>{options[config[key]]?.s ?? optionNames[0]}</strong> · Plural: <strong>{options[config[key]]?.p ?? optionNames[0]}</strong>
            </p>
            <div className="seg" style={{ display: 'inline-flex' }}>
              {optionNames.map(opt => (
                <button
                  key={opt}
                  className={config[key] === opt ? 'on' : ''}
                  onClick={() => saveKey(key, opt)}
                  disabled={saving}
                >
                  {opt}
                </button>
              ))}
            </div>
          </section>
        )
      })}

      <section>
        <button
          onClick={resetAll}
          disabled={saving}
          style={{
            padding: '8px 18px', borderRadius: 7,
            border: '1px solid var(--border)', background: 'var(--bg-subtle)',
            fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Alle auf Standard zuruecksetzen
        </button>
        {saving && <span style={{ marginLeft: 12, fontSize: 12, color: 'var(--text-secondary)' }}>Wird gespeichert...</span>}
      </section>
    </div>
  )
}

// ── Main Page Export ──────────────────────────────────────────────────────────────

export default function DrehbuchkoordinationPage() {
  const [activeTab, setActiveTab] = useState('allgemein')
  const [hasAccess, setHasAccess] = useState<boolean | null>(null)
  const [copyOpen, setCopyOpen] = useState(false)
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

  // Arrow key tab navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return
      const idx = DK_TABS.findIndex(t => t.id === activeTab)
      if (idx === -1) return
      if (e.key === 'ArrowLeft' && idx > 0) setActiveTab(DK_TABS[idx - 1].id)
      if (e.key === 'ArrowRight' && idx < DK_TABS.length - 1) setActiveTab(DK_TABS[idx + 1].id)
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
      return <div style={{ padding: '28px 32px', fontSize: 13, color: 'var(--text-secondary)' }}>Zugriff wird geprueft...</div>
    }
    if (hasAccess === false) {
      return (
        <div style={{ padding: '28px 32px', fontSize: 13, color: 'var(--text-secondary)' }}>
          <strong>Kein Zugriff</strong>
          <p style={{ marginTop: 8, lineHeight: 1.6 }}>
            Du hast keinen Zugriff auf die Drehbuchkoordination fuer diese Produktion.
            Wende dich an einen Administrator.
          </p>
        </div>
      )
    }

    switch (activeTab) {
      case 'allgemein':
        return produktionId ? <AllgemeinTab productionId={produktionId} /> : <NoProduction />
      case 'terminologie':
        return <TerminologieTab />
      case 'figuren':
        return <FigurenTab />
      case 'produktion':
        return <ProduktionTab />
      case 'export-vorlagen':
        return <Placeholder label="Export-Vorlagen" />
      case 'lock-regeln':
        return <Placeholder label="Lock-Regeln" />
      case 'dokument-typen':
        return <DokumentTypenTab />
      case 'colab-gruppen':
        return <ColabGruppenTab />
      case 'format-templates':
        return <FormatTemplatesTab />
      case 'benachrichtigungen':
        return <BenachrichtigungenTab />
      case 'dokument-einstellungen':
        return <DokumentEinstellungenTab />
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
          padding: '14px 24px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-page)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}>
          <button
            onClick={() => navigate('/')}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-secondary)', fontSize: 13, padding: '2px 6px 2px 0',
              flexShrink: 0,
            }}
          >
            &#8592; Zurueck
          </button>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: 'var(--text-primary)', flex: 1 }}>
            Drehbuchkoordination
          </h2>
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
                  Keine Produktion ausgewaehlt.
                </div>
              )}
            </div>
          </div>

          {/* Content area */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
            {renderContent()}
          </div>
        </div>
      </div>

    </AppShell>
  )
}

// ── Tab: Statistik-Panel Settings ─────────────────────────────────────────────────

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
  const dragIdx = useRef<number | null>(null)
  const overIdx = useRef<number | null>(null)

  const save = async (next: StatModalSection[]) => {
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

  const toggleVisible = (id: string) => {
    const next = sections.map(s => s.id === id ? { ...s, visible: !s.visible } : s)
    save(next)
  }

  const handleReorder = () => {
    if (dragIdx.current === null || overIdx.current === null || dragIdx.current === overIdx.current) return
    const arr = [...sections]
    const [moved] = arr.splice(dragIdx.current, 1)
    arr.splice(overIdx.current, 0, moved)
    dragIdx.current = null
    overIdx.current = null
    save(arr)
  }

  return (
    <div style={{ maxWidth: 500 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>Statistik-Panel</h3>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 20px', lineHeight: 1.6 }}>
        Lege fest, welche Rubriken im Statistik-Panel angezeigt werden und in welcher Reihenfolge. Ziehe die Eintraege per Drag & Drop.
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
        onClick={() => save([...DEFAULT_SECTIONS])}
        style={{
          marginTop: 16, padding: '6px 14px', borderRadius: 6,
          border: '1px solid var(--border)', background: 'var(--bg-subtle)',
          fontSize: 12, cursor: 'pointer',
        }}
      >
        Auf Standard zuruecksetzen
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
        wie viele Nachtbilder vor Drehschluss moeglich sind.
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
              Wie lange dauert ein Nachtbild durchschnittlich? Wird zur Berechnung der moeglichen Nachtbilder vor Drehschluss verwendet.
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
                return n > 0 ? `Winter + ${n} (${n} Nachtbild${n !== 1 ? 'er' : ''} moeglich)` : 'Sommer'
              })()}
            </p>
          </div>
        </>
      )}

      {saving && <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)' }}>Wird gespeichert...</p>}
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
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<string | null>(null)
  const [editKat, setEditKat] = useState('ortswechsel')
  const [editName, setEditName] = useState('')
  const [editOneliner, setEditOneliner] = useState('')

  useEffect(() => {
    api.getStockshotTemplates(productionId).then(setTemplates).finally(() => setLoading(false))
  }, [productionId])

  const save = async () => {
    if (!editName.trim()) return
    if (editId) {
      const res = await fetch(`/api/stockshot-templates/${productionId}/${editId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: editName.trim(), oneliner_vorlage: editOneliner.trim(), kategorie: editKat }),
      })
      if (res.ok) {
        const updated = await res.json()
        setTemplates(prev => prev.map(t => t.id === editId ? updated : t))
      }
    } else {
      const res = await fetch(`/api/stockshot-templates/${productionId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ kategorie: editKat, name: editName.trim(), oneliner_vorlage: editOneliner.trim() }),
      })
      if (res.ok) {
        const created = await res.json()
        setTemplates(prev => [...prev, created])
      }
    }
    setEditId(null); setEditName(''); setEditOneliner('')
  }

  const remove = async (id: string) => {
    await fetch(`/api/stockshot-templates/${productionId}/${id}`, { method: 'DELETE', credentials: 'include' })
    setTemplates(prev => prev.filter(t => t.id !== id))
  }

  const katLabel: Record<string, string> = { ortswechsel: 'Ortswechsel', zeit_vergeht: 'Zeit vergeht', stimmungswechsel: 'Stimmungswechsel' }
  const katColor: Record<string, string> = { ortswechsel: '#007AFF', zeit_vergeht: '#FF9500', stimmungswechsel: '#AF52DE' }

  if (loading) return <div style={{ padding: 24, color: '#757575' }}>Laden…</div>

  return (
    <div style={{ padding: 24, maxWidth: 700 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Stockshot-Vorlagen</h2>
      <p style={{ fontSize: 12, color: '#757575', marginBottom: 20, lineHeight: 1.6 }}>
        Vorlagen fuer Stockshot-Oneliner nach Kategorie. Platzhalter: <code>{'{motiv}'}</code>, <code>{'{stimmung}'}</code>
      </p>

      {['ortswechsel', 'zeit_vergeht', 'stimmungswechsel'].map(kat => {
        const items = templates.filter(t => t.kategorie === kat)
        return (
          <div key={kat} style={{ marginBottom: 24 }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: katColor[kat], marginBottom: 8 }}>{katLabel[kat]}</div>
            {items.length === 0 && <div style={{ fontSize: 12, color: '#999', fontStyle: 'italic', marginBottom: 8 }}>Keine Vorlagen</div>}
            {items.map(t => (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', marginBottom: 4,
                border: '1px solid var(--border)', borderRadius: 6, fontSize: 12,
              }}>
                <span style={{ fontWeight: 600, minWidth: 100 }}>{t.name}</span>
                <span style={{ flex: 1, color: '#757575', fontStyle: 'italic' }}>{t.oneliner_vorlage || '—'}</span>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#007AFF', fontSize: 11 }}
                  onClick={() => { setEditId(t.id); setEditKat(t.kategorie); setEditName(t.name); setEditOneliner(t.oneliner_vorlage ?? '') }}>
                  Bearbeiten
                </button>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FF3B30', fontSize: 11 }}
                  onClick={() => remove(t.id)}>
                  Loeschen
                </button>
              </div>
            ))}
          </div>
        )
      })}

      <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, background: 'var(--bg-surface)' }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>{editId ? 'Vorlage bearbeiten' : 'Neue Vorlage'}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={editKat} onChange={e => setEditKat(e.target.value)} style={{ fontSize: 12, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)' }}>
            <option value="ortswechsel">Ortswechsel</option>
            <option value="zeit_vergeht">Zeit vergeht</option>
            <option value="stimmungswechsel">Stimmungswechsel</option>
          </select>
          <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Name" style={{ fontSize: 12, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', width: 120 }} />
          <input value={editOneliner} onChange={e => setEditOneliner(e.target.value)} placeholder="Oneliner-Vorlage…" style={{ fontSize: 12, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', flex: 1, minWidth: 160 }} />
          <button onClick={save} style={{ fontSize: 12, padding: '4px 12px', borderRadius: 4, background: '#007AFF', color: '#fff', border: 'none', cursor: 'pointer' }}>
            {editId ? 'Speichern' : 'Hinzufuegen'}
          </button>
          {editId && (
            <button onClick={() => { setEditId(null); setEditName(''); setEditOneliner('') }} style={{ fontSize: 12, padding: '4px 8px', borderRadius: 4, background: 'transparent', color: '#757575', border: '1px solid var(--border)', cursor: 'pointer' }}>
              Abbrechen
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function VorlagenTab({ productionId }: { productionId: string }) {
  const { selectedProduction } = useSelectedProduction()
  const produktionsLogoUrl = selectedProduction?.logo_filename
    ? `https://produktion.serienwerft.studio/uploads/logos/${selectedProduction.logo_filename}`
    : null
  const [previewMeta, setPreviewMeta] = useState<{ folgeNummer: number | null; datumsformat: 'de' | 'en' }>({ folgeNummer: null, datumsformat: 'de' })
  useEffect(() => { loadPreviewMeta(productionId).then(setPreviewMeta).catch(() => {}) }, [productionId])
  const previewContext: PreviewContext = {
    produktion:  selectedProduction?.title ?? 'Rote Rosen',
    staffel:     selectedProduction?.staffelnummer != null ? String(selectedProduction.staffelnummer) : '22',
    block:       '5',
    folge:       previewMeta.folgeNummer ?? 3841,
    folgentitel: 'Beispieltitel',
    fassung:     'Vorlage',
    version:     'V1',
    stand_datum: formatDatum(new Date().toISOString().slice(0, 10), previewMeta.datumsformat),
    autor:       'Max Mustermann',
    regie:       'Erika Muster',
    firmenname:  'Serienwerft GmbH',
  }
  const [vorlagen, setVorlagen] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editTyp, setEditTyp] = useState('custom')
  const [editEditorValue, setEditEditorValue] = useState<DokumentVorlagenEditorValue>(emptyVorlagenEditorValue())
  const [editorKey, setEditorKey] = useState(0)
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    api.getDokumentVorlagen(productionId).then(setVorlagen).finally(() => setLoading(false))
  }
  useEffect(load, [productionId])

  const startEdit = (v: any) => {
    setEditId(v.id)
    setEditName(v.name)
    setEditTyp(v.typ || 'custom')
    setEditEditorValue({
      body_content:            v.body_content   ?? v.sektionen?.[0]?.content ?? emptyVorlagenEditorValue().body_content,
      kopfzeile_content:       v.kopfzeile_content ?? null,
      fusszeile_content:       v.fusszeile_content ?? null,
      kopfzeile_aktiv:         v.kopfzeile_aktiv ?? false,
      fusszeile_aktiv:         v.fusszeile_aktiv ?? false,
      erste_seite_kein_header: v.erste_seite_kein_header ?? true,
      seiten_layout:           v.seiten_layout ?? emptyVorlagenEditorValue().seiten_layout,
    })
  }

  const startNew = (typ?: string) => {
    setEditId('__new__')
    setEditName(typ === 'titelseite' ? 'Titelseite' : '')
    setEditTyp(typ ?? 'custom')
    setEditEditorValue(typ === 'titelseite' ? titelseiteDefaultVorlage() : emptyVorlagenEditorValue())
  }

  const saveVorlage = async () => {
    setSaving(true)
    try {
      const data = {
        name: editName,
        typ: editTyp,
        body_content:            editEditorValue.body_content,
        kopfzeile_content:       editEditorValue.kopfzeile_content,
        fusszeile_content:       editEditorValue.fusszeile_content,
        kopfzeile_aktiv:         editEditorValue.kopfzeile_aktiv,
        fusszeile_aktiv:         editEditorValue.fusszeile_aktiv,
        erste_seite_kein_header: editEditorValue.erste_seite_kein_header,
        seiten_layout:           editEditorValue.seiten_layout,
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
    if (!confirm('Vorlage wirklich loeschen?')) return
    await api.deleteDokumentVorlage(productionId, id)
    load()
  }

  const inputStyle: React.CSSProperties = { fontSize: 13, padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' }
  const btnStyle: React.CSSProperties = { fontSize: 12, padding: '6px 14px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-subtle)', cursor: 'pointer', fontFamily: 'inherit' }

  if (loading) return <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Lade...</div>

  // Edit mode — side-by-side: form left (sticky), editor right
  if (editId) {
    return (
      <div>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>
            {editId === '__new__' ? 'Neue Vorlage' : 'Vorlage bearbeiten'}
          </span>
          <button onClick={saveVorlage} disabled={saving || !editName.trim()}
            style={{ ...btnStyle, background: 'var(--text-primary)', color: 'var(--text-inverse)', fontWeight: 600 }}>
            {saving ? 'Speichere...' : 'Speichern'}
          </button>
          <button onClick={() => setEditId(null)} style={btnStyle}>Abbrechen</button>
        </div>

        {/* Side-by-side */}
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>

          {/* Left: form — sticky so it stays visible while scrolling the A4 page */}
          <div style={{
            width: 220, flexShrink: 0,
            position: 'sticky', top: 0,
            display: 'flex', flexDirection: 'column', gap: 14,
          }}>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Name</label>
              <input style={inputStyle} value={editName} onChange={e => setEditName(e.target.value)} placeholder="z.B. Titelseite" />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Typ</label>
              <select style={{ ...inputStyle, cursor: 'pointer' }} value={editTyp} onChange={e => setEditTyp(e.target.value)}>
                {VORLAGE_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            {editTyp === 'titelseite' && (
              <div style={{
                padding: '10px 12px', background: '#007AFF0A', border: '1px solid #007AFF33',
                borderRadius: 8, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 8,
              }}>
                <span style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Standard-Titelseite laden (Rote Rosen).
                </span>
                <button
                  onClick={() => { setEditEditorValue(titelseiteDefaultVorlage()); setEditorKey(k => k + 1) }}
                  style={{ ...btnStyle, color: '#007AFF', borderColor: '#007AFF55' }}
                >
                  Vorlage laden
                </button>
              </div>
            )}
          </div>

          {/* Right: editor */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <DokumentVorlagenEditor
              key={`${editId}-${editorKey}`}
              value={editEditorValue}
              onChange={setEditEditorValue}
              noHeaderFooter
              produktionsLogoUrl={produktionsLogoUrl}
              previewContext={previewContext}
            />
          </div>

        </div>
      </div>
    )
  }

  // List mode
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Dokument-Vorlagen</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => startNew('titelseite')}
            style={{ ...btnStyle, fontWeight: 500, color: '#007AFF', borderColor: '#007AFF55' }}
          >
            + Titelseite
          </button>
          <button onClick={() => startNew()} style={{ ...btnStyle, fontWeight: 500 }}>+ Neue Vorlage</button>
        </div>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
        Vorlagen fuer Titelseite, Synopsis, Recap und Precap. Beim Import werden passende Vorlagen automatisch zugewiesen.
        Platzhalter wie {'{{autor}}'} werden beim Einfuegen durch echte Werte ersetzt.
      </p>

      {vorlagen.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '24px 0', textAlign: 'center' }}>
          Keine Vorlagen vorhanden.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {vorlagen.map(v => (
            <div key={v.id} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 14px', background: 'var(--bg-subtle)', borderRadius: 8,
              border: '1px solid var(--border)',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{v.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                  Typ: {VORLAGE_TYPES.find(t => t.id === v.typ)?.label || v.typ || 'custom'}
                </div>
              </div>
              <button onClick={() => startEdit(v)} style={{ ...btnStyle, fontSize: 11 }}>Bearbeiten</button>
              <button onClick={() => deleteVorlage(v.id)} style={{ ...btnStyle, fontSize: 11, color: 'var(--sw-danger, #FF3B30)' }}>Loeschen</button>
            </div>
          ))}
        </div>
      )}
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

async function loadPreviewMeta(productionId: string): Promise<{ folgeNummer: number | null; datumsformat: 'de' | 'en' }> {
  const [folgenRes, settingsRes] = await Promise.allSettled([
    fetch(`/api/v2/folgen?produktion_id=${encodeURIComponent(productionId)}`, { credentials: 'include' }),
    fetch(`/api/dk-settings/${productionId}/app-settings`, { credentials: 'include' }),
  ])
  let folgeNummer: number | null = null
  if (folgenRes.status === 'fulfilled' && folgenRes.value.ok) {
    const list: any[] = await folgenRes.value.json()
    if (list.length > 0) {
      const sorted = [...list].sort((a, b) => (b.folge_nummer ?? 0) - (a.folge_nummer ?? 0))
      folgeNummer = sorted[0].folge_nummer ?? null
    }
  }
  let datumsformat: 'de' | 'en' = 'de'
  if (settingsRes.status === 'fulfilled' && settingsRes.value.ok) {
    const s: any = await settingsRes.value.json()
    if (s?.datumsformat === 'en') datumsformat = 'en'
  }
  return { folgeNummer, datumsformat }
}

function KopfFusszeileTab({ productionId }: { productionId: string }) {
  const { selectedProduction } = useSelectedProduction()
  const produktionsLogoUrl = selectedProduction?.logo_filename
    ? `https://produktion.serienwerft.studio/uploads/logos/${selectedProduction.logo_filename}`
    : null
  const [previewMeta, setPreviewMeta] = useState<{ folgeNummer: number | null; datumsformat: 'de' | 'en' }>({ folgeNummer: null, datumsformat: 'de' })
  useEffect(() => { loadPreviewMeta(productionId).then(setPreviewMeta).catch(() => {}) }, [productionId])
  const previewContext: PreviewContext = {
    produktion:  selectedProduction?.title ?? 'Rote Rosen',
    staffel:     selectedProduction?.staffelnummer != null ? String(selectedProduction.staffelnummer) : '22',
    block:       '5',
    folge:       previewMeta.folgeNummer ?? 3841,
    folgentitel: 'Beispieltitel',
    fassung:     'Drehbuch',
    version:     'V1',
    stand_datum: formatDatum(new Date().toISOString().slice(0, 10), previewMeta.datumsformat),
    autor:       'Max Mustermann',
    regie:       'Erika Muster',
    firmenname:  'Serienwerft GmbH',
  }
  const [activeTyp, setActiveTyp] = useState<'drehbuch' | 'storyline' | 'notiz'>('drehbuch')
  const [configs, setConfigs] = useState<Record<string, DokumentVorlagenEditorValue | null>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setLoading(true)
    api.getKopfFusszeilen(productionId)
      .then(rows => {
        const map: Record<string, DokumentVorlagenEditorValue> = {}
        for (const row of rows) {
          map[row.werkstufe_typ] = {
            body_content:            null,
            kopfzeile_content:       row.kopfzeile_content,
            fusszeile_content:       row.fusszeile_content,
            kopfzeile_aktiv:         row.kopfzeile_aktiv ?? false,
            fusszeile_aktiv:         row.fusszeile_aktiv ?? false,
            erste_seite_kein_header: row.erste_seite_kein_header ?? true,
            seiten_layout:           row.seiten_layout ?? emptyVorlagenEditorValue().seiten_layout,
          }
        }
        setConfigs(map)
      })
      .finally(() => setLoading(false))
  }, [productionId])

  const getCurrentValue = (): DokumentVorlagenEditorValue =>
    configs[activeTyp] ?? { ...emptyVorlagenEditorValue(), body_content: null }

  const handleChange = (v: DokumentVorlagenEditorValue) => {
    setConfigs(prev => ({ ...prev, [activeTyp]: v }))
    setDirty(prev => ({ ...prev, [activeTyp]: true }))
  }

  const save = async () => {
    setSaving(true)
    try {
      const v = getCurrentValue()
      await api.saveKopfFusszeilenTyp(productionId, activeTyp, {
        kopfzeile_content:       v.kopfzeile_content,
        fusszeile_content:       v.fusszeile_content,
        kopfzeile_aktiv:         v.kopfzeile_aktiv,
        fusszeile_aktiv:         v.fusszeile_aktiv,
        erste_seite_kein_header: v.erste_seite_kein_header,
        erste_seite_kein_footer: false,
        seiten_layout:           v.seiten_layout,
      })
      setDirty(prev => ({ ...prev, [activeTyp]: false }))
    } catch (err: any) {
      alert('Fehler: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Lade...</div>

  const currentConfig = getCurrentValue()
  const isDirty = dirty[activeTyp] ?? false
  const activeColor = KF_TYPEN.find(t => t.id === activeTyp)?.color ?? '#007AFF'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, height: '100%' }}>
      {/* Sub-tab bar + save button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {KF_TYPEN.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTyp(t.id)}
              style={{
                fontSize: 13, padding: '6px 16px', borderRadius: 7, cursor: 'pointer',
                fontFamily: 'inherit', fontWeight: activeTyp === t.id ? 600 : 400,
                border: `1px solid ${activeTyp === t.id ? t.color : 'var(--border)'}`,
                background: activeTyp === t.id ? t.color + '15' : 'transparent',
                color: activeTyp === t.id ? t.color : 'var(--text-secondary)',
              }}
            >
              {t.label}
              {dirty[t.id] && <span style={{ marginLeft: 5, color: t.color, fontSize: 10 }}>●</span>}
            </button>
          ))}
        </div>
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
          {saving ? 'Speichere...' : 'Speichern'}
        </button>
      </div>

      {/* Hint */}
      <div style={{
        fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6,
        marginBottom: 16, padding: '8px 12px',
        background: 'var(--bg-subtle)', borderRadius: 7,
        border: `1px solid ${activeColor}33`,
      }}>
        <strong style={{ color: activeColor }}>
          {KF_TYPEN.find(t => t.id === activeTyp)?.label}
        </strong>
        {' '}— Globale Kopf-/Fußzeile für alle{' '}
        {activeTyp === 'drehbuch' ? 'Drehbuch-' : activeTyp === 'storyline' ? 'Storyline-' : 'Notiz-'}
        Fassungen dieser Produktion. Gilt auf jeder Seite des Exports (außer ggf. erste Seite).
      </div>

      {/* Editor — noBody=true, only KZ + FZ zones */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <DokumentVorlagenEditor
          key={activeTyp}
          value={currentConfig}
          onChange={handleChange}
          noBody
          produktionsLogoUrl={produktionsLogoUrl}
          previewContext={previewContext}
        />
      </div>
    </div>
  )
}

function NoProduction() {
  return (
    <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
      Keine Produktion ausgewaehlt. Waehle eine Produktion im Header aus.
    </div>
  )
}
