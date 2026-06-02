import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  History, Plus, ChevronDown, ChevronRight, Check, Trash2,
  ShieldCheck, Clock, X, Loader2, FileText, GitCompare,
} from 'lucide-react'
import { api } from '../../api/client'
import { useSelectedProduction } from '../../contexts'
import Tooltip from '../../components/Tooltip'
import ImportPanel from './ImportPanel'

type VersionTyp = 'future' | 'konzept'

interface Version {
  id: string
  typ: VersionTyp
  label: string | null
  notiz: string | null
  zeitraum?: string | null
  staffel?: string | null
  freigabe_status: 'entwurf' | 'freigegeben'
  freigegeben_von: string | null
  freigegeben_am: string | null
  erstellt_von: string | null
  erstellt_am: string
  snapshot_json?: any
  aenderungen?: Aenderung[]
}

interface Aenderung {
  id: string
  art: 'inhaltlich' | 'produktionell' | null
  beschreibung: string
  referenz: string | null
  erstellt_von: string | null
  erstellt_am: string
}

// ── Snapshot-Diff ─────────────────────────────────────────────────────────────

function diffSnapshots(a: any, b: any): { added: string[]; removed: string[]; changed: string[] } {
  const aStrang = new Map<string, any>((a?.straenge || []).map((s: any) => [s.id, s]))
  const bStrang = new Map<string, any>((b?.straenge || []).map((s: any) => [s.id, s]))

  const added: string[] = []
  const removed: string[] = []
  const changed: string[] = []

  for (const [id, s] of bStrang) {
    if (!aStrang.has(id)) added.push(s.name)
    else if (aStrang.get(id)?.kurzinhalt !== s.kurzinhalt) changed.push(s.name)
  }
  for (const [id, s] of aStrang) {
    if (!bStrang.has(id)) removed.push(s.name)
  }

  // Beat-Diff für future-Versionen
  if (a?.beats && b?.beats) {
    const aBeats = new Set<string>((a.beats).map((bt: any) => bt.id))
    const bBeats = new Set<string>((b.beats).map((bt: any) => bt.id))
    const newBeats = [...bBeats].filter(id => !aBeats.has(id)).length
    const removedBeats = [...aBeats].filter(id => !bBeats.has(id)).length
    if (newBeats > 0) added.push(`+${newBeats} Beat${newBeats !== 1 ? 's' : ''}`)
    if (removedBeats > 0) removed.push(`-${removedBeats} Beat${removedBeats !== 1 ? 's' : ''}`)
  }

  return { added, removed, changed }
}

// ── Snapshot anlegen Modal ────────────────────────────────────────────────────

function SnapshotModal({
  produktionId,
  defaultTyp,
  onClose,
  onCreated,
}: {
  produktionId: string
  defaultTyp: VersionTyp
  onClose: () => void
  onCreated: (v: Version) => void
}) {
  const [typ, setTyp] = useState<VersionTyp>(defaultTyp)
  const [label, setLabel] = useState('')
  const [notiz, setNotiz] = useState('')
  const [zeitraum, setZeitraum] = useState('')
  const [staffel, setStaffel] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function handleCreate() {
    setSaving(true)
    setErr('')
    try {
      const v = await api.createPlanungVersion({
        produktion_id: produktionId,
        typ,
        label: label.trim() || undefined,
        notiz: notiz.trim() || undefined,
        zeitraum: typ === 'future' ? zeitraum.trim() || undefined : undefined,
        staffel: typ === 'konzept' ? staffel.trim() || undefined : undefined,
      })
      onCreated(v)
    } catch (e: any) {
      setErr(e.message || 'Fehler')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9000,
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        width: 460, background: 'var(--bg-surface)', borderRadius: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,0.25)', overflow: 'hidden',
      }}>
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Snapshot anlegen</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Typ */}
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Typ</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['future', 'konzept'] as VersionTyp[]).map(t => (
                <button
                  key={t}
                  onClick={() => setTyp(t)}
                  style={{
                    flex: 1, padding: '8px 12px', borderRadius: 8,
                    border: `2px solid ${typ === t ? '#007AFF' : 'var(--border)'}`,
                    background: typ === t ? 'rgba(0,122,255,0.06)' : 'var(--bg)',
                    color: typ === t ? '#007AFF' : 'var(--text-primary)',
                    cursor: 'pointer', fontSize: 13, fontWeight: typ === t ? 600 : 400,
                  }}
                >
                  {t === 'future' ? 'Future' : 'Konzept'}
                </button>
              ))}
            </div>
          </div>

          {/* Label */}
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Label (optional)</div>
            <input
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder={typ === 'future' ? 'z.B. Stand nach Redaktionsrunde' : 'z.B. Staffel 20 v1'}
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 6,
                border: '1px solid var(--border)', background: 'var(--bg)',
                fontSize: 13, color: 'var(--text-primary)', boxSizing: 'border-box',
              }}
              maxLength={120}
            />
          </div>

          {/* Zeitraum (future) / Staffel (konzept) */}
          {typ === 'future' ? (
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Zeitraum (optional)</div>
              <input
                value={zeitraum}
                onChange={e => setZeitraum(e.target.value)}
                placeholder="z.B. Blöcke 845–856"
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: 6,
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  fontSize: 13, color: 'var(--text-primary)', boxSizing: 'border-box',
                }}
                maxLength={80}
              />
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Staffel (optional)</div>
              <input
                value={staffel}
                onChange={e => setStaffel(e.target.value)}
                placeholder="z.B. Staffel 20"
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: 6,
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  fontSize: 13, color: 'var(--text-primary)', boxSizing: 'border-box',
                }}
                maxLength={80}
              />
            </div>
          )}

          {/* Notiz */}
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Notiz (optional)</div>
            <textarea
              value={notiz}
              onChange={e => setNotiz(e.target.value)}
              placeholder="Interne Anmerkung zu diesem Snapshot…"
              rows={3}
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 6,
                border: '1px solid var(--border)', background: 'var(--bg)',
                fontSize: 13, color: 'var(--text-primary)', resize: 'vertical',
                boxSizing: 'border-box', fontFamily: 'inherit',
              }}
              maxLength={500}
            />
          </div>

          {err && <div style={{ fontSize: 12, color: '#FF3B30' }}>{err}</div>}
        </div>

        <div style={{
          padding: '14px 20px', borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'flex-end', gap: 8,
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '7px 16px', borderRadius: 6, border: '1px solid var(--border)',
              background: 'transparent', cursor: 'pointer', fontSize: 13,
            }}
          >
            Abbrechen
          </button>
          <button
            onClick={handleCreate}
            disabled={saving}
            style={{
              padding: '7px 20px', borderRadius: 6, border: 'none',
              background: saving ? 'var(--border)' : '#000',
              color: saving ? 'var(--text-muted)' : '#fff',
              cursor: saving ? 'default' : 'pointer', fontSize: 13, fontWeight: 500,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {saving && <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} />}
            Snapshot anlegen
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Änderung hinzufügen ───────────────────────────────────────────────────────

function AenderungForm({
  versionId,
  versionTyp,
  onAdded,
}: {
  versionId: string
  versionTyp: VersionTyp
  onAdded: (a: Aenderung) => void
}) {
  const [art, setArt] = useState<'inhaltlich' | 'produktionell'>('inhaltlich')
  const [beschreibung, setBeschreibung] = useState('')
  const [referenz, setReferenz] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleAdd() {
    if (!beschreibung.trim()) return
    setSaving(true)
    try {
      const a = await api.addVersionAenderung(versionId, {
        version_typ: versionTyp,
        art,
        beschreibung: beschreibung.trim(),
        referenz: referenz.trim() || undefined,
      })
      onAdded(a)
      setBeschreibung('')
      setReferenz('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {(['inhaltlich', 'produktionell'] as const).map(a => (
          <button
            key={a}
            onClick={() => setArt(a)}
            style={{
              padding: '4px 10px', borderRadius: 5, fontSize: 11,
              border: `1px solid ${art === a ? '#007AFF' : 'var(--border)'}`,
              background: art === a ? 'rgba(0,122,255,0.08)' : 'var(--bg)',
              color: art === a ? '#007AFF' : 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            {a}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={beschreibung}
          onChange={e => setBeschreibung(e.target.value)}
          placeholder="Beschreibung der Änderung…"
          style={{
            flex: 1, padding: '6px 9px', borderRadius: 6,
            border: '1px solid var(--border)', background: 'var(--bg)',
            fontSize: 12, color: 'var(--text-primary)',
          }}
          maxLength={300}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
        />
        <input
          value={referenz}
          onChange={e => setReferenz(e.target.value)}
          placeholder="Referenz (opt.)"
          style={{
            width: 100, padding: '6px 9px', borderRadius: 6,
            border: '1px solid var(--border)', background: 'var(--bg)',
            fontSize: 12, color: 'var(--text-primary)',
          }}
          maxLength={80}
        />
        <button
          onClick={handleAdd}
          disabled={saving || !beschreibung.trim()}
          style={{
            padding: '6px 12px', borderRadius: 6, border: 'none',
            background: !beschreibung.trim() ? 'var(--border)' : '#000',
            color: !beschreibung.trim() ? 'var(--text-muted)' : '#fff',
            cursor: !beschreibung.trim() ? 'default' : 'pointer',
            fontSize: 12,
          }}
        >
          {saving ? <Loader2 size={12} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Plus size={12} />}
        </button>
      </div>
    </div>
  )
}

// ── Version Card ──────────────────────────────────────────────────────────────

function VersionCard({
  version,
  compareWith,
  canFreigeben,
  onFreigeben,
  onDelete,
  onUpdated,
  onAenderungAdded,
  onAenderungDeleted,
  onSelectForCompare,
}: {
  version: Version
  compareWith: Version | null
  canFreigeben: boolean
  onFreigeben: (v: Version) => void
  onDelete: (v: Version) => void
  onUpdated: (v: Version) => void
  onAenderungAdded: (versionId: string, a: Aenderung) => void
  onAenderungDeleted: (versionId: string, aId: string) => void
  onSelectForCompare: (v: Version) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [editLabel, setEditLabel] = useState(false)
  const [labelVal, setLabelVal] = useState(version.label || '')
  const [saving, setSaving] = useState(false)

  const isFreigegeben = version.freigabe_status === 'freigegeben'

  async function saveLabel() {
    setSaving(true)
    try {
      const updated = await api.updatePlanungVersion(version.id, {
        typ: version.typ,
        label: labelVal.trim() || undefined,
      })
      onUpdated({ ...version, label: updated.label })
    } finally {
      setSaving(false)
      setEditLabel(false)
    }
  }

  const snap = version.snapshot_json
  const diff = compareWith ? diffSnapshots(compareWith.snapshot_json, snap) : null

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderLeft: `3px solid ${isFreigegeben ? '#00C853' : 'var(--border)'}`,
      borderRadius: 8, background: 'var(--bg-surface)', overflow: 'hidden',
      transition: 'border-color 0.15s',
    }}>
      {/* Header */}
      <div
        style={{
          padding: '12px 16px', cursor: 'pointer',
          display: 'flex', alignItems: 'flex-start', gap: 12,
        }}
        onClick={() => setExpanded(e => !e)}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Label row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {editLabel ? (
              <input
                value={labelVal}
                onChange={e => setLabelVal(e.target.value)}
                onClick={e => e.stopPropagation()}
                onKeyDown={e => { if (e.key === 'Enter') saveLabel(); if (e.key === 'Escape') setEditLabel(false) }}
                autoFocus
                style={{
                  padding: '3px 7px', borderRadius: 5,
                  border: '1px solid #007AFF', background: 'var(--bg)',
                  fontSize: 14, fontWeight: 600, color: 'var(--text-primary)',
                  minWidth: 160,
                }}
                maxLength={120}
              />
            ) : (
              <span
                style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', cursor: 'text' }}
                onClick={e => { e.stopPropagation(); setEditLabel(true) }}
                title="Klicken zum Bearbeiten"
              >
                {version.label || `Snapshot ${new Date(version.erstellt_am).toLocaleDateString('de')}`}
              </span>
            )}
            {saving && <Loader2 size={12} style={{ animation: 'spin 0.8s linear infinite', color: 'var(--text-muted)' }} />}

            {/* Typ badge */}
            <span style={{
              padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 600,
              background: version.typ === 'future' ? 'rgba(0,122,255,0.1)' : 'rgba(175,82,222,0.1)',
              color: version.typ === 'future' ? '#007AFF' : '#AF52DE',
            }}>
              {version.typ === 'future' ? 'Future' : 'Konzept'}
            </span>

            {/* Freigabe badge */}
            {isFreigegeben ? (
              <span style={{
                padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                background: 'rgba(0,200,83,0.1)', color: '#00C853',
                display: 'flex', alignItems: 'center', gap: 3,
              }}>
                <ShieldCheck size={10} /> Freigegeben
              </span>
            ) : (
              <span style={{
                padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                background: 'rgba(0,0,0,0.05)', color: 'var(--text-muted)',
              }}>
                Entwurf
              </span>
            )}
          </div>

          {/* Meta row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Clock size={10} />
              {new Date(version.erstellt_am).toLocaleString('de', { dateStyle: 'short', timeStyle: 'short' })}
            </span>
            {(version.zeitraum || version.staffel) && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {version.zeitraum || version.staffel}
              </span>
            )}
            {snap && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {snap.straenge_count ?? snap.straenge?.length ?? 0} Stränge
                {snap.beats_count != null ? ` · ${snap.beats_count} Beats` : ''}
              </span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <Tooltip text="Für Vergleich auswählen">
            <button
              onClick={() => onSelectForCompare(version)}
              style={{
                width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)',
                background: compareWith?.id === version.id ? '#007AFF' : 'var(--bg)',
                color: compareWith?.id === version.id ? '#fff' : 'var(--text-muted)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <GitCompare size={13} />
            </button>
          </Tooltip>

          {!isFreigegeben && canFreigeben && (
            <Tooltip text="Freigeben">
              <button
                onClick={() => onFreigeben(version)}
                style={{
                  width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)',
                  background: 'var(--bg)', color: '#00C853',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Check size={13} />
              </button>
            </Tooltip>
          )}

          {!isFreigegeben && (
            <Tooltip text="Löschen (nur Entwürfe)">
              <button
                onClick={() => onDelete(version)}
                style={{
                  width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)',
                  background: 'var(--bg)', color: '#FF3B30',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Trash2 size={13} />
              </button>
            </Tooltip>
          )}
        </div>

        <div style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
      </div>

      {/* Expanded */}
      {expanded && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)' }}>
          {/* Diff-Ansicht */}
          {diff && (compareWith?.id !== version.id) && (
            <div style={{
              margin: '12px 0', padding: '10px 12px', borderRadius: 8,
              background: 'rgba(0,122,255,0.05)', border: '1px solid rgba(0,122,255,0.15)',
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#007AFF', marginBottom: 6 }}>
                Vergleich mit: {compareWith?.label || `Snapshot ${new Date(compareWith!.erstellt_am).toLocaleDateString('de')}`}
              </div>
              {diff.added.length > 0 && (
                <div style={{ fontSize: 11, color: '#00C853', marginBottom: 3 }}>
                  + {diff.added.join(', ')}
                </div>
              )}
              {diff.removed.length > 0 && (
                <div style={{ fontSize: 11, color: '#FF3B30', marginBottom: 3 }}>
                  − {diff.removed.join(', ')}
                </div>
              )}
              {diff.changed.length > 0 && (
                <div style={{ fontSize: 11, color: '#FFCC00' }}>
                  ~ {diff.changed.join(', ')}
                </div>
              )}
              {diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0 && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Keine Unterschiede</div>
              )}
            </div>
          )}

          {/* Notiz */}
          {version.notiz && (
            <div style={{
              marginTop: 12, padding: '8px 10px', borderRadius: 6,
              background: 'var(--bg)', fontSize: 12, color: 'var(--text-muted)',
              lineHeight: 1.5,
            }}>
              {version.notiz}
            </div>
          )}

          {/* Strang-Liste aus Snapshot */}
          {snap?.straenge && snap.straenge.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                Stränge im Snapshot
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {snap.straenge.map((s: any) => (
                  <span key={s.id} style={{
                    padding: '2px 8px', borderRadius: 4, fontSize: 11,
                    background: s.farbe ? `${s.farbe}22` : 'var(--bg)',
                    color: s.farbe || 'var(--text-muted)',
                    border: `1px solid ${s.farbe ? `${s.farbe}44` : 'var(--border)'}`,
                  }}>
                    {s.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Änderungslog */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>
              Änderungslog
            </div>
            {(version.aenderungen || []).length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Keine Einträge</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(version.aenderungen || []).map((a) => (
                  <div key={a.id} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 8,
                    padding: '6px 8px', borderRadius: 6, background: 'var(--bg)',
                  }}>
                    <span style={{
                      padding: '1px 5px', borderRadius: 3, fontSize: 9, fontWeight: 600,
                      background: a.art === 'inhaltlich' ? 'rgba(0,122,255,0.1)' : 'rgba(255,149,0,0.1)',
                      color: a.art === 'inhaltlich' ? '#007AFF' : '#FF9500',
                      flexShrink: 0, marginTop: 2,
                    }}>
                      {a.art || '—'}
                    </span>
                    <span style={{ flex: 1, fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                      {a.beschreibung}
                      {a.referenz && <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>({a.referenz})</span>}
                    </span>
                    <button
                      onClick={() => onAenderungDeleted(version.id, a.id)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text-muted)', padding: 2, display: 'flex', flexShrink: 0,
                      }}
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Neuen Eintrag hinzufügen */}
            <AenderungForm
              versionId={version.id}
              versionTyp={version.typ}
              onAdded={a => onAenderungAdded(version.id, a)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Hauptseite ────────────────────────────────────────────────────────────────

const FREIGABE_ROLLEN = ['superadmin', 'geschaeftsfuehrung', 'herstellungsleitung', 'produktionsleitung']

export default function VersionenPage() {
  const { selectedProduction } = useSelectedProduction()
  const [versionen, setVersionen] = useState<Version[]>([])
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<VersionTyp | 'alle'>('alle')
  const [showModal, setShowModal] = useState(false)
  const [compareBase, setCompareBase] = useState<Version | null>(null)
  const [myRoles, setMyRoles] = useState<string[]>([])

  useEffect(() => {
    api.getMe().then(me => {
      setMyRoles(me.roles || (me.role ? [me.role] : []))
    }).catch(() => {})
  }, [])

  const canFreigeben = useMemo(
    () => myRoles.some(r => FREIGABE_ROLLEN.includes(r)),
    [myRoles]
  )

  const load = useCallback(async () => {
    if (!selectedProduction) return
    setLoading(true)
    try {
      const rows = await api.getPlanungVersionen(selectedProduction.id, 'alle')
      // Für jede Version ggf. Aenderungen holen (nur on-demand → beim Expandieren)
      setVersionen(rows.map(r => ({ ...r, aenderungen: [] })))
    } finally {
      setLoading(false)
    }
  }, [selectedProduction])

  useEffect(() => { load() }, [load])

  async function handleFreigeben(v: Version) {
    if (!confirm(`Version "${v.label || 'Snapshot'}" freigeben? Das kann nicht rückgängig gemacht werden.`)) return
    const updated = await api.freigebenPlanungVersion(v.id, v.typ)
    setVersionen(prev => prev.map(x => x.id === v.id ? { ...x, ...updated } : x))
  }

  async function handleDelete(v: Version) {
    if (!confirm(`Version "${v.label || 'Snapshot'}" löschen?`)) return
    await api.deletePlanungVersion(v.id, v.typ)
    setVersionen(prev => prev.filter(x => x.id !== v.id))
  }

  function handleSelectForCompare(v: Version) {
    setCompareBase(prev => prev?.id === v.id ? null : v)
  }

  async function loadAenderungen(versionId: string, typ: VersionTyp) {
    const full = await api.getPlanungVersion(versionId, typ)
    setVersionen(prev => prev.map(x => x.id === versionId ? { ...x, aenderungen: full.aenderungen || [] } : x))
  }

  const filtered = versionen.filter(v =>
    activeTab === 'alle' || v.typ === activeTab
  )

  const counts = {
    alle: versionen.length,
    future: versionen.filter(v => v.typ === 'future').length,
    konzept: versionen.filter(v => v.typ === 'konzept').length,
  }

  if (!selectedProduction) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
        Bitte eine Produktion auswählen.
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <div style={{
        padding: '12px 24px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
        background: 'var(--bg-surface)', flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          <History size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <span style={{ fontSize: 14, fontWeight: 600 }}>Versionen &amp; Snapshots</span>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2 }}>
          {(['alle', 'future', 'konzept'] as const).map(t => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              style={{
                padding: '5px 12px', borderRadius: 6, fontSize: 12,
                border: `1px solid ${activeTab === t ? '#007AFF' : 'var(--border)'}`,
                background: activeTab === t ? 'rgba(0,122,255,0.08)' : 'var(--bg)',
                color: activeTab === t ? '#007AFF' : 'var(--text-muted)',
                cursor: 'pointer', fontWeight: activeTab === t ? 600 : 400,
              }}
            >
              {t === 'alle' ? 'Alle' : t === 'future' ? 'Future' : 'Konzept'}
              <span style={{ marginLeft: 5, opacity: 0.6 }}>({counts[t]})</span>
            </button>
          ))}
        </div>

        {compareBase && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', borderRadius: 6,
            background: 'rgba(0,122,255,0.08)', border: '1px solid rgba(0,122,255,0.2)',
            fontSize: 12, color: '#007AFF',
          }}>
            <GitCompare size={12} />
            Basis: {compareBase.label || `Snapshot ${new Date(compareBase.erstellt_am).toLocaleDateString('de')}`}
            <button
              onClick={() => setCompareBase(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#007AFF', padding: 1, display: 'flex' }}
            >
              <X size={12} />
            </button>
          </div>
        )}

        <button
          onClick={() => setShowModal(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', borderRadius: 8, border: 'none',
            background: '#000', color: '#fff', cursor: 'pointer',
            fontSize: 13, fontWeight: 500,
          }}
        >
          <Plus size={14} />
          Snapshot anlegen
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
        <ImportPanel produktionId={selectedProduction.id} />

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
            <Loader2 size={24} style={{ animation: 'spin 0.8s linear infinite', color: 'var(--text-muted)' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{
            maxWidth: 480, margin: '80px auto', textAlign: 'center', color: 'var(--text-muted)',
          }}>
            <FileText size={40} style={{ opacity: 0.2, marginBottom: 16 }} />
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)' }}>
              Noch keine Versionen
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>
              Lege einen Snapshot an, um den aktuellen Stand der{' '}
              {activeTab === 'future' ? 'Future-Beats' : activeTab === 'konzept' ? 'Story-Stränge' : 'Future oder des Konzepts'}{' '}
              einzufrieren.
            </div>
          </div>
        ) : (
          <div style={{ maxWidth: 800, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(v => (
              <VersionCard
                key={v.id}
                version={v}
                compareWith={compareBase?.id !== v.id ? compareBase : null}
                canFreigeben={canFreigeben}
                onFreigeben={handleFreigeben}
                onDelete={handleDelete}
                onUpdated={updated => setVersionen(prev => prev.map(x => x.id === updated.id ? { ...x, ...updated } : x))}
                onAenderungAdded={(vId, a) => {
                  setVersionen(prev => prev.map(x => x.id === vId
                    ? { ...x, aenderungen: [a, ...(x.aenderungen || [])] }
                    : x
                  ))
                }}
                onAenderungDeleted={(vId, aId) => {
                  setVersionen(prev => prev.map(x => x.id === vId
                    ? { ...x, aenderungen: (x.aenderungen || []).filter(a => a.id !== aId) }
                    : x
                  ))
                  api.deleteVersionAenderung(vId, aId)
                }}
                onSelectForCompare={handleSelectForCompare}
              />
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <SnapshotModal
          produktionId={selectedProduction.id}
          defaultTyp={activeTab === 'konzept' ? 'konzept' : 'future'}
          onClose={() => setShowModal(false)}
          onCreated={v => {
            setVersionen(prev => [{ ...v, aenderungen: [] }, ...prev])
            setShowModal(false)
          }}
        />
      )}
    </div>
  )
}
