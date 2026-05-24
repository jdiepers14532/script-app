import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FolderOpen, Plus, Pencil, Trash2, Link2, Eye, EyeOff,
  Lock, Users, Globe, BookOpen, ChevronDown, ChevronRight,
  Check, X, AlertTriangle, FileText, Tag,
} from 'lucide-react'
import AppShell from '../components/AppShell'
import { useSelectedProduction } from '../contexts'
import { api } from '../api/client'

// ── Label-System ─────────────────────────────────────────────────────────────

const LABEL_OPTIONS = [
  { value: 'schattenbuch',  label: 'Schattenbuch',   desc: 'Alternatives Drehbuch zu einer Episode' },
  { value: 'casting_szene', label: 'Casting-Szene',  desc: 'Szenen für Casting-Zwecke' },
  { value: 'spin_off',      label: 'Spin-Off',        desc: 'Konzept für eine eigenständige Serienidee' },
  { value: 'sonstiges',     label: 'Sonstiges',       desc: 'Allgemeines freies Dokument' },
]

const SICHTBARKEIT_OPTIONS = [
  {
    value: 'dauerhaft_privat',
    label: 'Dauerhaft privat',
    desc: 'Nur du und Superadmins können dieses Dokument sehen.',
    icon: <Lock size={14} />,
  },
  {
    value: 'team',
    label: 'Team',
    desc: 'Sichtbar für alle mit Drehbuchkoordinations-Zugang.',
    icon: <Users size={14} />,
  },
  {
    value: 'alle',
    label: 'Alle Autoren',
    desc: 'Sichtbar für alle Autoren dieser Produktion.',
    icon: <Globe size={14} />,
  },
]

function getLabelInfo(value: string) {
  return LABEL_OPTIONS.find(l => l.value === value) ?? { label: value, desc: '' }
}

function getSichtbarkeitInfo(value: string) {
  return SICHTBARKEIT_OPTIONS.find(s => s.value === value) ?? { label: value, desc: '', icon: <Eye size={14} /> }
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
  const labelInfo = getLabelInfo(dok.dokument_label)
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
          <span className="fdi-badge fdi-label">{labelInfo.label}</span>
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
}: {
  initial?: { folgen_titel?: string; dokument_label?: string; sichtbarkeit_frei?: string }
  onSave: (data: { folgen_titel: string; dokument_label: string; sichtbarkeit_frei: string }) => Promise<void>
  onClose: () => void
}) {
  const [titel, setTitel] = useState(initial?.folgen_titel ?? '')
  const [label, setLabel] = useState(initial?.dokument_label ?? 'sonstiges')
  const [sichtbarkeit, setSichtbarkeit] = useState(initial?.sichtbarkeit_frei ?? 'team')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (!titel.trim()) { setError('Bitte gib einen Titel ein.'); return }
    setSaving(true)
    try {
      await onSave({ folgen_titel: titel.trim(), dokument_label: label, sichtbarkeit_frei: sichtbarkeit })
      onClose()
    } catch (err: any) {
      setError(err?.message ?? 'Fehler beim Speichern')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
            {initial ? 'Dokument bearbeiten' : 'Neues freies Dokument'}
          </h3>
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
              className="form-input"
              placeholder="z.B. Schattenbuch Ep. 4290"
              value={titel}
              onChange={e => setTitel(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>DOKUMENTTYP</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {LABEL_OPTIONS.map(opt => (
                <label
                  key={opt.value}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
                    border: `1.5px solid ${label === opt.value ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 8, cursor: 'pointer',
                    background: label === opt.value ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'var(--bg-surface)',
                  }}
                >
                  <input type="radio" name="label" value={opt.value} checked={label === opt.value} onChange={() => setLabel(opt.value)} style={{ marginTop: 2 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{opt.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>SICHTBARKEIT</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {SICHTBARKEIT_OPTIONS.map(opt => (
                <label
                  key={opt.value}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
                    border: `1.5px solid ${sichtbarkeit === opt.value ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 8, cursor: 'pointer',
                    background: sichtbarkeit === opt.value ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'var(--bg-surface)',
                  }}
                >
                  <input type="radio" name="sichtbarkeit" value={opt.value} checked={sichtbarkeit === opt.value} onChange={() => setSichtbarkeit(opt.value)} style={{ marginTop: 2 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {opt.icon}
                      {opt.label}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{opt.desc}</div>
                    {opt.value === 'dauerhaft_privat' && (
                      <div style={{ fontSize: 11, color: '#FF9500', marginTop: 4, fontWeight: 500 }}>
                        Achtung: Diese Einstellung ist dauerhaft und kann nicht rückgängig gemacht werden.
                      </div>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
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
  const [folgen, setFolgen] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [zielFolgeId, setZielFolgeId] = useState('')
  const [labelFolgeSendung, setLabelFolgeSendung] = useState(false)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.getFolgenV2(produktionId)
      .then(rows => { setFolgen(rows); setLoading(false) })
      .catch(() => setLoading(false))
  }, [produktionId])

  const handleSave = async () => {
    if (!zielFolgeId) { setError('Bitte eine Zielfolge auswählen.'); return }
    setSaving(true)
    try {
      const result = await api.verknuepfeMitFolge(dok.id, { ziel_folge_id: zielFolgeId, label_folge_sendung: labelFolgeSendung })
      setDone(result)
    } catch (err: any) {
      setError(err?.message ?? 'Fehler beim Verknüpfen')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Mit Folge verknüpfen</h3>
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

              <div>
                <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Die Szenen aus <strong>„{dok.folgen_titel}"</strong> werden in eine neue Werkstufe
                  der gewählten Folge kopiert. Das freie Dokument bleibt als Archiv erhalten.
                </p>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>ZIELFOLGE</label>
                {loading ? (
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Lädt Folgen…</div>
                ) : (
                  <select
                    className="form-input"
                    value={zielFolgeId}
                    onChange={e => setZielFolgeId(e.target.value)}
                    style={{ width: '100%' }}
                  >
                    <option value="">— Folge auswählen —</option>
                    {folgen.map((f: any) => (
                      <option key={f.id} value={f.id}>
                        Folge {f.folge_nummer}{f.folgen_titel ? ` — ${f.folgen_titel}` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 12px', border: '1.5px solid var(--border)', borderRadius: 8 }}>
                <input
                  type="checkbox"
                  checked={labelFolgeSendung}
                  onChange={e => setLabelFolgeSendung(e.target.checked)}
                />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Als „Folge für Sendung" markieren</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                    Setzt das Label der Zielfolge auf „Folge für Sendung" — zeigt an, dass dies die offizielle Sendungsfassung ist.
                  </div>
                </div>
              </label>
            </>
          )}
        </div>

        <div className="modal-footer">
          {done ? (
            <button className="btn btn-primary" onClick={onClose}>Schließen</button>
          ) : (
            <>
              <button className="btn btn-secondary" onClick={onClose}>Abbrechen</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || !zielFolgeId}>
                {saving ? 'Verknüpfe…' : 'Verknüpfen'}
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
      <div className="modal-content" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Dokument löschen?</h3>
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
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Abbrechen</button>
          <button
            className="btn"
            style={{ background: '#FF3B30', color: '#fff' }}
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
  const { selectedProduktionId } = useSelectedProduction()

  const [dokumente, setDokumente] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  const handleCreate = async (data: { folgen_titel: string; dokument_label: string; sichtbarkeit_frei: string }) => {
    if (!selectedProduktionId) throw new Error('Keine Produktion ausgewählt')
    const dok = await api.createFreiesDokument({ produktion_id: selectedProduktionId, ...data })
    await load()
    // Direkt ins Dokument navigieren
    navigate(`/?freidok_id=${encodeURIComponent(dok.id)}`)
  }

  const handleEdit = async (data: { folgen_titel: string; dokument_label: string; sichtbarkeit_frei: string }) => {
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
              className="btn btn-primary"
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
            <button className="btn btn-primary" onClick={() => setCreateOpen(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
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
        <DokumentDialog onSave={handleCreate} onClose={() => setCreateOpen(false)} />
      )}
      {editDok && (
        <DokumentDialog
          initial={{ folgen_titel: editDok.folgen_titel, dokument_label: editDok.dokument_label, sichtbarkeit_frei: editDok.sichtbarkeit_frei }}
          onSave={handleEdit}
          onClose={() => { setEditDok(null); load() }}
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
        .fdi-main {
          flex: 1;
          min-width: 0;
        }
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
