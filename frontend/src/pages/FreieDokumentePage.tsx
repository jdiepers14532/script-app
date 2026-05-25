import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FolderOpen, Plus, Pencil, Trash2, Link2,
  Lock, Users, Globe, Building, BookOpen, ChevronDown, ChevronRight,
  Check, X, AlertTriangle, FileText, Eye,
} from 'lucide-react'
import AppShell from '../components/AppShell'
import { useSelectedProduction, useAppSettings } from '../contexts'
import { api } from '../api/client'

// ── Label-Darstellung ─────────────────────────────────────────────────────────

// Vordefinierte Optionen für Datalist-Autocomplete
const LABEL_DEFAULTS = ['Schattenbuch', 'Casting-Szene', 'Spin-Off', 'Sonstiges']

// Backwards-compat: ältere Slug-Werte → lesbarer Text
const SLUG_MAP: Record<string, string> = {
  schattenbuch: 'Schattenbuch',
  casting_szene: 'Casting-Szene',
  spin_off: 'Spin-Off',
  sonstiges: 'Sonstiges',
  folge_sendung: 'Folge für Sendung',
}

function displayLabel(value: string): string {
  return SLUG_MAP[value] ?? value
}

// ── Sichtbarkeit ──────────────────────────────────────────────────────────────

const SICHTBARKEIT_OPTIONS = [
  { value: 'privat',     label: 'Privat',      icon: <Lock size={14} />,     desc: 'Nur du kannst sehen und bearbeiten' },
  { value: 'colab',      label: 'Colab',       icon: <Users size={14} />,    desc: 'Ausgewählte Gruppe kann bearbeiten' },
  { value: 'produktion', label: 'Produktion',  icon: <Building size={14} />, desc: 'Produktionsteam kann lesen' },
  { value: 'alle',       label: 'Alle',        icon: <Globe size={14} />,    desc: 'Jeder mit Zugriff kann lesen' },
]

function getSichtbarkeitInfo(value: string) {
  return SICHTBARKEIT_OPTIONS.find(s => s.value === value)
    ?? { label: value, icon: <Eye size={14} />, desc: '' }
}

// ── Inline-Styles ─────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  fontSize: 14,
  border: '1.5px solid var(--border)',
  borderRadius: 8,
  background: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
}

const modalFootStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
  padding: '12px 20px',
  borderTop: '1px solid var(--border)',
  flexShrink: 0,
}

// ── Freies Dokument Item ─────────────────────────────────────────────────────

function DokumentItem({
  dok, onOpen, onEdit, onDelete, onVerknuepfe,
}: {
  dok: any
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
  onVerknuepfe: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const sichtInfo = getSichtbarkeitInfo(dok.sichtbarkeit_frei)

  const menuItems = [
    { icon: <Pencil size={13} />, label: 'Umbenennen / Bearbeiten', action: onEdit },
    { icon: <Link2 size={13} />, label: 'Mit Folge verknüpfen', action: onVerknuepfe },
    { icon: <Trash2 size={13} />, label: 'Löschen', action: onDelete, danger: true },
  ]

  return (
    <div className="frei-dok-item" onClick={onOpen}>
      <div className="fdi-icon">
        <BookOpen size={20} />
      </div>
      <div className="fdi-main">
        <div className="fdi-title">{dok.folgen_titel ?? 'Unbenanntes Dokument'}</div>
        <div className="fdi-meta">
          <span className="fdi-badge fdi-label">{displayLabel(dok.dokument_label)}</span>
          <span className="fdi-badge fdi-sicht">
            {sichtInfo.icon}
            {sichtInfo.label}
          </span>
          {dok.werkstufen_count != null && (
            <span className="fdi-badge">{dok.werkstufen_count} Werkstufe{dok.werkstufen_count !== 1 ? 'n' : ''}</span>
          )}
        </div>
      </div>
      <div className="fdi-actions" onClick={e => e.stopPropagation()}>
        <button
          className="fdi-open-btn"
          onClick={e => { e.stopPropagation(); onOpen() }}
        >
          Öffnen
          <ChevronRight size={13} />
        </button>
        <div className="fdi-menu-wrap">
          <button
            className="fdi-menu-btn"
            onClick={e => { e.stopPropagation(); setMenuOpen(v => !v) }}
          >
            <ChevronDown size={14} />
          </button>
          {menuOpen && (
            <>
              <div className="menu-overlay" onClick={() => setMenuOpen(false)} />
              <div className="fdi-menu">
                {menuItems.map(item => (
                  <button
                    key={item.label}
                    className={`fdi-menu-item${item.danger ? ' danger' : ''}`}
                    onClick={() => { setMenuOpen(false); item.action() }}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Create/Edit Dialog ────────────────────────────────────────────────────────

function DokumentDialog({
  initial,
  onSave,
  onClose,
  produktionLabels = [],
  produktionId,
}: {
  initial?: { folgen_titel?: string; dokument_label?: string; sichtbarkeit_frei?: string; colab_gruppe_id?: number | null }
  onSave: (data: { folgen_titel: string; dokument_label: string; sichtbarkeit_frei: string; colab_gruppe_id?: number | null }) => Promise<void>
  onClose: () => void
  produktionLabels?: string[]
  produktionId?: string
}) {
  const [titel, setTitel] = useState(initial?.folgen_titel ?? '')
  const [label, setLabel] = useState(displayLabel(initial?.dokument_label ?? 'sonstiges'))
  const [sichtbarkeit, setSichtbarkeit] = useState(initial?.sichtbarkeit_frei ?? 'privat')
  const [colabGruppeId, setColabGruppeId] = useState<number | null>(initial?.colab_gruppe_id ?? null)
  const [colabGruppen, setColabGruppen] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (produktionId) {
      api.getColabGruppen(produktionId).then(setColabGruppen).catch(() => {})
    }
  }, [produktionId])

  const handleSave = async () => {
    if (!titel.trim()) { setError('Bitte gib einen Titel ein.'); return }
    if (!label.trim()) { setError('Bitte gib ein Label ein.'); return }
    setSaving(true)
    try {
      await onSave({
        folgen_titel: titel.trim(),
        dokument_label: label.trim(),
        sichtbarkeit_frei: sichtbarkeit,
        colab_gruppe_id: sichtbarkeit === 'colab' ? colabGruppeId : null,
      })
      onClose()
    } catch (err: any) {
      setError(err?.message ?? 'Fehler beim Speichern')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 480, width: '90%' }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span>{initial ? 'Dokument bearbeiten' : 'Neues freies Dokument'}</span>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '16px 20px' }}>
          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#FFF3CD', borderRadius: 6, fontSize: 13, color: '#856404' }}>
              <AlertTriangle size={14} />
              {error}
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>TITEL</label>
            <input
              autoFocus
              type="text"
              placeholder="z.B. Schattenbuch Ep. 4290"
              value={titel}
              onChange={e => setTitel(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>LABEL</label>
            <input
              type="text"
              list="label-datalist"
              placeholder="z.B. Schattenbuch, Casting-Szene…"
              value={label}
              onChange={e => setLabel(e.target.value)}
              style={inputStyle}
            />
            <datalist id="label-datalist">
              {[...LABEL_DEFAULTS, ...produktionLabels.filter(l => !LABEL_DEFAULTS.includes(l))].map(l => (
                <option key={l} value={l} />
              ))}
            </datalist>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>SICHTBARKEIT</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {SICHTBARKEIT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSichtbarkeit(opt.value)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 12px', border: `1.5px solid ${sichtbarkeit === opt.value ? '#007AFF' : 'var(--border)'}`,
                    borderRadius: 8, background: sichtbarkeit === opt.value ? 'rgba(0,122,255,0.06)' : 'transparent',
                    cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', width: '100%',
                  }}
                >
                  <span style={{ color: sichtbarkeit === opt.value ? '#007AFF' : 'var(--text-secondary)', flexShrink: 0 }}>
                    {opt.icon}
                  </span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{opt.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1 }}>{opt.desc}</div>
                  </div>
                </button>
              ))}
            </div>
            {sichtbarkeit === 'colab' && (
              <div style={{ marginTop: 10 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  Colab-Gruppe
                </label>
                <select
                  value={colabGruppeId ?? ''}
                  onChange={e => setColabGruppeId(e.target.value ? Number(e.target.value) : null)}
                  style={inputStyle}
                >
                  <option value="">Keine Gruppe gewählt</option>
                  {colabGruppen.filter(g => g.typ === 'colab').map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>
            )}
            {sichtbarkeit === 'privat' && (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
                Privat-Modus bei freien Dokumenten läuft nicht automatisch ab.
              </div>
            )}
          </div>
        </div>

        <div style={modalFootStyle}>
          <button className="btn" onClick={onClose}>Abbrechen</button>
          <button className="btn primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Speichern…' : initial ? 'Speichern' : 'Dokument anlegen'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Verknüpfe-mit-Folge Dialog ────────────────────────────────────────────────

function VerknuepfeDialog({
  dok,
  produktionId,
  onClose,
}: {
  dok: any
  produktionId: string
  onClose: () => void
}) {
  const [bloecke, setBloecke] = useState<any[]>([])
  const [alleFolgen, setAlleFolgen] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const { treatmentLabel } = useAppSettings()
  const [selectedBlockId, setSelectedBlockId] = useState<string>('')
  const [zielFolgeNr, setZielFolgeNr] = useState<number | null>(null)
  const [labelFolgeSendung, setLabelFolgeSendung] = useState(false)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      api.getBloecke(produktionId),
      api.getFolgenV2(produktionId),
    ]).then(([blocks, folgen]) => {
      setBloecke(blocks)
      setAlleFolgen(folgen)
      if (blocks.length > 0) setSelectedBlockId(blocks[0].proddb_id)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [produktionId])

  // Folgenummern für den gewählten Block (aus ProdDB-Range, wie AppShell)
  const blockFolgenNrs = useMemo(() => {
    const block = bloecke.find(b => b.proddb_id === selectedBlockId)
    if (!block || block.folge_von == null || block.folge_bis == null) return []
    const result: number[] = []
    for (let nr = block.folge_von; nr <= block.folge_bis; nr++) result.push(nr)
    return result
  }, [bloecke, selectedBlockId])

  // Map: folge_nummer → werkstufen-Typen (aus script_db)
  const folgenInfo = useMemo(() => {
    const map = new Map<number, { typ: string; max_version: number }[]>()
    for (const f of alleFolgen) {
      if (f.folge_nummer != null && Array.isArray(f.werkstufen_typen)) {
        map.set(f.folge_nummer, f.werkstufen_typen)
      }
    }
    return map
  }, [alleFolgen])

  // Kürzel für Werkstufen-Typ
  const getAbbr = (typ: string) => {
    if (typ === 'drehbuch') return 'D'
    if (typ === 'notiz') return 'N'
    if (typ === 'storyline') {
      if (treatmentLabel === 'Storylines') return 'S'
      if (treatmentLabel === 'Outline') return 'O'
      return 'T'
    }
    return typ.charAt(0).toUpperCase()
  }

  // Optionstext mit Indikator
  const getOptionLabel = (nr: number) => {
    const typen = folgenInfo.get(nr)
    if (!typen || typen.length === 0) return `Folge ${nr}`
    const indicator = [...typen]
      .sort((a, b) => a.typ.localeCompare(b.typ))
      .map(t => `${getAbbr(t.typ)} V${t.max_version}`)
      .join(' · ')
    return `Folge ${nr}  ·  ${indicator}`
  }

  // Zielfolge zurücksetzen wenn Block wechselt
  useEffect(() => { setZielFolgeNr(null) }, [selectedBlockId])

  const neuesFolge = zielFolgeNr != null && !folgenInfo.has(zielFolgeNr)

  const handleSave = async () => {
    if (zielFolgeNr == null) { setError('Bitte eine Zielfolge auswählen.'); return }
    setSaving(true)
    try {
      const result = await api.verknuepfeMitFolge(dok.id, {
        ziel_folge_nummer: zielFolgeNr,
        label_folge_sendung: labelFolgeSendung,
      })
      setDone(result)
    } catch (err: any) {
      setError(err?.message ?? 'Fehler beim Verknüpfen')
    } finally {
      setSaving(false)
    }
  }

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 12, fontWeight: 600,
    marginBottom: 6, color: 'var(--text-secondary)',
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 520, width: '90%' }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span>Mit Folge verknüpfen</span>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="modal-body" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {done ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <Check size={40} style={{ color: '#00C853', marginBottom: 12 }} />
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Erfolgreich verknüpft</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {done.szenen_kopiert} Szene{done.szenen_kopiert !== 1 ? 'n' : ''} wurden in eine neue Werkstufe der Zielfolge kopiert.
                Das freie Dokument bleibt als Archiv erhalten.
              </div>
            </div>
          ) : (
            <>
              {error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#FFF3CD', borderRadius: 6, fontSize: 13, color: '#856404' }}>
                  <AlertTriangle size={14} />{error}
                </div>
              )}

              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Die Szenen aus <strong>„{dok.folgen_titel}"</strong> werden in eine neue Werkstufe
                der gewählten Folge kopiert. Das freie Dokument bleibt als Archiv erhalten.
              </p>

              {loading ? (
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Lädt…</div>
              ) : (
                <>
                  {/* Block-Auswahl */}
                  {bloecke.length > 0 && (
                    <div>
                      <label style={labelStyle}>BLOCK</label>
                      <select
                        value={selectedBlockId}
                        onChange={e => setSelectedBlockId(e.target.value)}
                        style={inputStyle}
                      >
                        {bloecke.map((b: any) => (
                          <option key={b.proddb_id} value={b.proddb_id}>
                            Block {b.block_nummer}
                            {b.folge_von != null && b.folge_bis != null
                              ? ` (${b.folge_von}–${b.folge_bis}) · ${b.folge_bis - b.folge_von + 1} Folgen`
                              : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Folgen-Auswahl aus ProdDB-Range */}
                  <div>
                    <label style={labelStyle}>ZIELFOLGE</label>
                    <select
                      value={zielFolgeNr ?? ''}
                      onChange={e => setZielFolgeNr(e.target.value ? Number(e.target.value) : null)}
                      style={inputStyle}
                    >
                      <option value="">— Folge auswählen —</option>
                      {blockFolgenNrs.map(nr => (
                        <option key={nr} value={nr}>
                          {getOptionLabel(nr)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Bestätigung für neue Folge */}
                  {neuesFolge && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', background: 'rgba(255, 204, 0, 0.1)', border: '1.5px solid #FFCC00', borderRadius: 8, fontSize: 13 }}>
                      <AlertTriangle size={15} style={{ color: '#FFCC00', flexShrink: 0, marginTop: 1 }} />
                      <div>
                        <div style={{ fontWeight: 600, marginBottom: 3 }}>
                          Es existiert noch keine Fassung zu dieser Folge.
                        </div>
                        <div style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                          Als erste Fassung anlegen und Inhalt übernehmen?
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Folge für Sendung */}
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '10px 12px', border: '1.5px solid var(--border)', borderRadius: 8 }}>
                <input
                  type="checkbox"
                  checked={labelFolgeSendung}
                  onChange={e => setLabelFolgeSendung(e.target.checked)}
                  style={{ marginTop: 2, flexShrink: 0 }}
                />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Als „Folge für Sendung" markieren</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.5 }}>
                    Erst wenn als „Folge für Sendung" markiert, können andere Apps und die
                    Produktionsdatenbank auf das Dokument zugreifen. Ohne diese Kennzeichnung
                    wird die Verknüpfung nur intern in „Freie Dokumente" verwendet.
                  </div>
                </div>
              </label>
            </>
          )}
        </div>

        <div style={modalFootStyle}>
          {done ? (
            <button className="btn primary" onClick={onClose}>Schließen</button>
          ) : (
            <>
              <button className="btn" onClick={onClose}>Abbrechen</button>
              <button className="btn primary" onClick={handleSave} disabled={saving || zielFolgeNr == null}>
                {saving ? 'Verknüpfe…' : neuesFolge ? 'Ja, als erste Fassung anlegen' : 'Verknüpfen'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Delete Confirm ─────────────────────────────────────────────────────────────

function DeleteConfirm({ dok, onConfirm, onClose }: { dok: any; onConfirm: () => Promise<void>; onClose: () => void }) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 420, width: '90%' }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span>Dokument löschen?</span>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body" style={{ padding: '16px 20px' }}>
          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#FFF3CD', borderRadius: 6, fontSize: 13, color: '#856404', marginBottom: 12 }}>
              <AlertTriangle size={14} />{error}
            </div>
          )}
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
            Das freie Dokument <strong>„{dok.folgen_titel}"</strong> wird dauerhaft gelöscht —
            inklusive aller Werkstufen und Szenen. Diese Aktion kann nicht rückgängig gemacht werden.
          </p>
        </div>
        <div style={modalFootStyle}>
          <button className="btn" onClick={onClose}>Abbrechen</button>
          <button
            className="btn"
            style={{ background: '#FF3B30', color: '#fff', borderColor: 'transparent' }}
            disabled={deleting}
            onClick={async () => {
              setDeleting(true)
              try { await onConfirm(); onClose() }
              catch (err: any) { setError(err?.message ?? 'Fehler beim Löschen'); setDeleting(false) }
            }}
          >
            {deleting ? 'Löschen…' : 'Endgültig löschen'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Hauptseite ─────────────────────────────────────────────────────────────────

export default function FreieDokumentePage() {
  const navigate = useNavigate()
  const { selectedId: selectedProduktionId } = useSelectedProduction()

  const [dokumente, setDokumente] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [prodLabels, setProdLabels] = useState<string[]>([])

  const [createOpen, setCreateOpen] = useState(false)
  const [editDok, setEditDok] = useState<any>(null)
  const [deleteDok, setDeleteDok] = useState<any>(null)
  const [verknuepfeDok, setVerknuepfeDok] = useState<any>(null)

  const load = useCallback(async () => {
    if (!selectedProduktionId) { setDokumente([]); return }
    setLoading(true)
    setError(null)
    try {
      const rows = await api.getFreieDokumente(selectedProduktionId)
      setDokumente(rows)
    } catch (err: any) {
      setError('Fehler beim Laden: ' + (err?.message ?? String(err)))
    } finally {
      setLoading(false)
    }
  }, [selectedProduktionId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!selectedProduktionId) return
    api.getFreieDokLabels(selectedProduktionId)
      .then(rows => setProdLabels(rows.map((r: any) => r.label_name)))
      .catch(() => {})
  }, [selectedProduktionId])

  const handleCreate = async (data: { folgen_titel: string; dokument_label: string; sichtbarkeit_frei: string; colab_gruppe_id?: number | null }) => {
    if (!selectedProduktionId) throw new Error('Keine Produktion ausgewählt')
    const dok = await api.createFreiesDokument({ produktion_id: selectedProduktionId, ...data })
    await load()
    navigate(`/?freidok_id=${encodeURIComponent(dok.id)}`)
  }

  const handleEdit = async (data: { folgen_titel: string; dokument_label: string; sichtbarkeit_frei: string; colab_gruppe_id?: number | null }) => {
    await api.updateFolgeV2(editDok.id, data)
    await load()
  }

  const handleDelete = async (dok: any) => {
    await api.deleteFreiesDokument(dok.id)
    await load()
  }

  return (
    <AppShell selectedProduktionId={selectedProduktionId ?? undefined}>
      <div className="page-container" style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <FolderOpen size={22} />
            <div>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Freie Dokumente</h1>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                Szenen und Drehbücher ohne Folgenzuordnung
              </p>
            </div>
          </div>
          {selectedProduktionId && (
            <button
              className="btn primary"
              onClick={() => setCreateOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Plus size={15} />
              Neues Dokument
            </button>
          )}
        </div>

        {/* Content */}
        {!selectedProduktionId ? (
          <div className="empty-state">
            <FileText size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
            <p>Bitte zuerst eine Produktion auswählen.</p>
          </div>
        ) : loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>Lädt…</div>
        ) : error ? (
          <div style={{ padding: 16, color: '#FF3B30', fontSize: 13 }}>{error}</div>
        ) : dokumente.length === 0 ? (
          <div className="empty-state">
            <FolderOpen size={48} style={{ opacity: 0.2, marginBottom: 16 }} />
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600 }}>Noch keine freien Dokumente</h3>
            <p style={{ margin: '0 0 20px', color: 'var(--text-secondary)', fontSize: 14 }}>
              Erstelle Schattenbücher, Casting-Szenen, Spin-Off-Ideen oder andere Dokumente,
              die keiner Episode zugeordnet sind.
            </p>
            <button className="btn primary" onClick={() => setCreateOpen(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Plus size={15} />
              Erstes Dokument anlegen
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {dokumente.map(dok => (
              <DokumentItem
                key={dok.id}
                dok={dok}
                onOpen={() => navigate(`/?freidok_id=${encodeURIComponent(dok.id)}`)}
                onEdit={() => setEditDok(dok)}
                onDelete={() => setDeleteDok(dok)}
                onVerknuepfe={() => setVerknuepfeDok(dok)}
              />
            ))}
          </div>
        )}

        {/* Erklärung */}
        {dokumente.length > 0 && (
          <div style={{ marginTop: 32, padding: '16px 20px', background: 'var(--bg-subtle)', borderRadius: 10, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            <strong>Freie Dokumente</strong> sind vollwertige Drehbücher, die du mit dem vollen Editor bearbeiten
            kannst — inkl. Werkstufen, Revisionen und Export. Sie haben keine Folgennummer und sind nur
            innerhalb der Script-App sichtbar. Mit <strong>„Mit Folge verknüpfen"</strong> kannst du den Inhalt
            in eine Episode überführen.
          </div>
        )}
      </div>

      {/* Modals */}
      {createOpen && (
        <DokumentDialog
          onSave={handleCreate}
          onClose={() => setCreateOpen(false)}
          produktionLabels={prodLabels}
          produktionId={selectedProduktionId ?? undefined}
        />
      )}
      {editDok && (
        <DokumentDialog
          initial={{
            folgen_titel: editDok.folgen_titel,
            dokument_label: editDok.dokument_label,
            sichtbarkeit_frei: editDok.sichtbarkeit_frei,
            colab_gruppe_id: editDok.sichtbarkeit_frei_colab_gruppe_id,
          }}
          onSave={handleEdit}
          onClose={() => { setEditDok(null); load() }}
          produktionLabels={prodLabels}
          produktionId={selectedProduktionId ?? undefined}
        />
      )}
      {deleteDok && (
        <DeleteConfirm
          dok={deleteDok}
          onConfirm={() => handleDelete(deleteDok)}
          onClose={() => { setDeleteDok(null); load() }}
        />
      )}
      {verknuepfeDok && selectedProduktionId && (
        <VerknuepfeDialog
          dok={verknuepfeDok}
          produktionId={selectedProduktionId}
          onClose={() => { setVerknuepfeDok(null); load() }}
        />
      )}

      <style>{`
        .frei-dok-item {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 14px 16px;
          background: var(--bg-surface);
          border: 1.5px solid var(--border);
          border-radius: 10px;
          cursor: pointer;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .frei-dok-item:hover {
          border-color: var(--accent);
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        }
        .fdi-icon {
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-subtle);
          border-radius: 8px;
          flex-shrink: 0;
          color: var(--text-secondary);
        }
        .fdi-main { flex: 1; min-width: 0; }
        .fdi-title {
          font-size: 14px;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .fdi-meta {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 4px;
          flex-wrap: wrap;
        }
        .fdi-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          padding: 2px 8px;
          background: var(--bg-subtle);
          border-radius: 99px;
          color: var(--text-secondary);
          white-space: nowrap;
        }
        .fdi-actions {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }
        .fdi-open-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 6px 12px;
          font-size: 13px;
          font-weight: 500;
          background: var(--accent);
          color: #fff;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          white-space: nowrap;
        }
        .fdi-open-btn:hover { opacity: 0.9; }
        .fdi-menu-wrap { position: relative; }
        .fdi-menu-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border: 1.5px solid var(--border);
          border-radius: 6px;
          background: var(--bg-surface);
          cursor: pointer;
          color: var(--text-secondary);
        }
        .fdi-menu-btn:hover { background: var(--bg-subtle); }
        .fdi-menu {
          position: absolute;
          right: 0;
          top: calc(100% + 6px);
          background: var(--bg-surface);
          border: 1.5px solid var(--border);
          border-radius: 8px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.12);
          z-index: 1000;
          min-width: 200px;
          padding: 4px;
        }
        .fdi-menu-item {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 8px 12px;
          font-size: 13px;
          border: none;
          background: none;
          border-radius: 6px;
          cursor: pointer;
          color: var(--text-primary);
          text-align: left;
        }
        .fdi-menu-item:hover { background: var(--bg-subtle); }
        .fdi-menu-item.danger { color: #FF3B30; }
        .fdi-menu-item.danger:hover { background: #FFF0EE; }
        .empty-state {
          text-align: center;
          padding: 64px 32px;
          color: var(--text-secondary);
        }
      `}</style>
    </AppShell>
  )
}
