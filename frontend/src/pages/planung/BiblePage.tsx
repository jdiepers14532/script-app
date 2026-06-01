import { useState, useEffect, useMemo } from 'react'
import {
  Search, Plus, X, Loader2, RefreshCw, Trash2, Clock,
  Link2, ChevronRight,
} from 'lucide-react'
import { api } from '../../api/client'
import { useSelectedProduction } from '../../contexts'

// ── Types ─────────────────────────────────────────────────────────────────────

interface BibleChar {
  id: string
  name: string
  farbe: string | null
  beziehungen_count: number
  chronologie_count: number
}

interface Beziehung {
  id: number
  beziehungstyp: string
  label: string | null
  status: 'aktiv' | 'beendet' | 'historisch'
  seit_block: string | null
  bis_block: string | null
  notiz: string | null
  related_id: string
  related_name: string
  related_farbe: string | null
}

interface ChronologieEintrag {
  id: string
  block_nummer: number | null
  beat_id: string | null
  ereignis: string
  manuell: boolean
  erstellt_am: string
  beat_text: string | null
  prosa_text: string | null
}

// ── Beziehungstyp-Labels ──────────────────────────────────────────────────────

const TYP_LABELS: Record<string, string> = {
  partner:      'Partner/in',
  ex_partner:   'Ex-Partner/in',
  eltern_von:   'Elternteil von',
  kind_von:     'Kind von',
  geschwister:  'Geschwister',
  freund:       'Freund/in',
  feind:        'Feind/in',
  kollege:      'Kolleg/in',
  vorgesetzter: 'Vorgesetzte/r',
  mitarbeiter:  'Mitarbeiter/in',
}

const STATUS_COLORS: Record<string, string> = {
  aktiv:       '#00C853',
  beendet:     '#FF9500',
  historisch:  'var(--text-muted)',
}

const ALL_TYPEN = Object.keys(TYP_LABELS)

// ── Beziehungs-Karte ──────────────────────────────────────────────────────────

function BeziehungCard({
  bez, characterId, onUpdate, onDelete,
}: {
  bez: Beziehung
  characterId: string
  onUpdate: (updated: Beziehung) => void
  onDelete: (id: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [status, setStatus] = useState(bez.status)
  const [seitBlock, setSeitBlock] = useState(bez.seit_block ?? '')
  const [bisBlock, setBisBlock] = useState(bez.bis_block ?? '')
  const [notiz, setNotiz] = useState(bez.notiz ?? '')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const relColor = bez.related_farbe ?? '#757575'
  const statusColor = STATUS_COLORS[bez.status] ?? 'var(--text-muted)'

  async function handleSave() {
    setSaving(true)
    try {
      await api.updateCharacterBeziehung(characterId, bez.id, {
        status, seit_block: seitBlock || null, bis_block: bisBlock || null, notiz: notiz || null,
      })
      onUpdate({ ...bez, status, seit_block: seitBlock || null, bis_block: bisBlock || null, notiz: notiz || null })
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Beziehung zu ${bez.related_name} wirklich löschen? Das Gegenstück wird ebenfalls gelöscht.`)) return
    setDeleting(true)
    try {
      onDelete(bez.id)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div style={{
      padding: '10px 12px', borderRadius: 8,
      border: `1px solid var(--border)`,
      background: 'var(--bg)',
      marginBottom: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        {/* Related char dot + name */}
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: relColor, flexShrink: 0, marginTop: 5,
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              {bez.related_name}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {TYP_LABELS[bez.beziehungstyp] ?? bez.beziehungstyp}
            </span>
            <span style={{ fontSize: 10, color: statusColor, fontWeight: 500 }}>
              {bez.status}
            </span>
            {(bez.seit_block || bez.bis_block) && (
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                {bez.seit_block && `seit Bl.${bez.seit_block}`}
                {bez.seit_block && bez.bis_block && ' – '}
                {bez.bis_block && `bis Bl.${bez.bis_block}`}
              </span>
            )}
          </div>
          {bez.notiz && !editing && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, fontStyle: 'italic' }}>{bez.notiz}</div>
          )}

          {editing && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {/* Status */}
              <div style={{ display: 'flex', gap: 4 }}>
                {(['aktiv', 'beendet', 'historisch'] as const).map(s => (
                  <button key={s} onClick={() => setStatus(s)}
                    style={{
                      padding: '3px 8px', borderRadius: 4, fontSize: 11,
                      border: `1px solid ${status === s ? STATUS_COLORS[s] : 'var(--border)'}`,
                      background: status === s ? `${STATUS_COLORS[s]}18` : 'transparent',
                      color: status === s ? STATUS_COLORS[s] : 'var(--text-muted)',
                      cursor: 'pointer',
                    }}
                  >{s}</button>
                ))}
              </div>
              {/* Seit/Bis */}
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={seitBlock} onChange={e => setSeitBlock(e.target.value)}
                  placeholder="Seit Block"
                  style={{ flex: 1, padding: '4px 7px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 11, color: 'var(--text-primary)' }} />
                <input value={bisBlock} onChange={e => setBisBlock(e.target.value)}
                  placeholder="Bis Block"
                  style={{ flex: 1, padding: '4px 7px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 11, color: 'var(--text-primary)' }} />
              </div>
              {/* Notiz */}
              <input value={notiz} onChange={e => setNotiz(e.target.value)}
                placeholder="Notiz (optional)"
                style={{ padding: '4px 7px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 11, color: 'var(--text-primary)' }} />
              <div style={{ display: 'flex', gap: 5 }}>
                <button onClick={handleSave} disabled={saving}
                  style={{ padding: '4px 10px', borderRadius: 5, border: 'none', background: '#000', color: '#fff', fontSize: 11, cursor: saving ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {saving && <Loader2 size={10} style={{ animation: 'spin 0.8s linear infinite' }} />} Speichern
                </button>
                <button onClick={() => setEditing(false)}
                  style={{ padding: '4px 10px', borderRadius: 5, border: '1px solid var(--border)', background: 'transparent', fontSize: 11, cursor: 'pointer', color: 'var(--text-muted)' }}>
                  Abbrechen
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        {!editing && (
          <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
            <button onClick={() => setEditing(true)}
              style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              <ChevronRight size={12} />
            </button>
            <button onClick={handleDelete} disabled={deleting}
              style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FF3B30' }}>
              <Trash2 size={11} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Neue-Beziehung-Form ───────────────────────────────────────────────────────

function NeueBeziehungForm({
  characterId, allChars, onCreated, onCancel,
}: {
  characterId: string
  allChars: BibleChar[]
  onCreated: (bez: Beziehung) => void
  onCancel: () => void
}) {
  const [relId, setRelId] = useState('')
  const [typ, setTyp] = useState('partner')
  const [saving, setSaving] = useState(false)

  const others = allChars.filter(c => c.id !== characterId)

  async function handleCreate() {
    if (!relId || !typ) return
    setSaving(true)
    try {
      const row = await api.addCharacterBeziehung(characterId, { related_character_id: relId, beziehungstyp: typ })
      const rel = others.find(c => c.id === relId)
      onCreated({
        id: row.id,
        beziehungstyp: row.beziehungstyp,
        label: row.label ?? null,
        status: row.status ?? 'aktiv',
        seit_block: null, bis_block: null, notiz: null,
        related_id: relId,
        related_name: rel?.name ?? '',
        related_farbe: rel?.farbe ?? null,
      })
    } finally {
      setSaving(false)
    }
  }

  const GEGENSTUECK: Record<string, string> = {
    eltern_von: 'kind_von', kind_von: 'eltern_von',
    geschwister: 'geschwister', partner: 'partner', ex_partner: 'ex_partner',
    freund: 'freund', feind: 'feind', kollege: 'kollege',
    vorgesetzter: 'mitarbeiter', mitarbeiter: 'vorgesetzter',
  }
  const gegTyp = GEGENSTUECK[typ]

  return (
    <div style={{
      padding: '12px', borderRadius: 8, border: '1px solid #007AFF44',
      background: 'rgba(0,122,255,0.04)', marginBottom: 8,
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#007AFF', marginBottom: 8 }}>Neue Beziehung</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <select value={relId} onChange={e => setRelId(e.target.value)}
          style={{ padding: '5px 8px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 12, color: 'var(--text-primary)' }}>
          <option value="">Figur wählen…</option>
          {others.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={typ} onChange={e => setTyp(e.target.value)}
          style={{ padding: '5px 8px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 12, color: 'var(--text-primary)' }}>
          {ALL_TYPEN.map(t => <option key={t} value={t}>{TYP_LABELS[t]}</option>)}
          <option value="sonstige">Sonstige</option>
        </select>
        {gegTyp && (
          <div style={{ fontSize: 10, color: '#007AFF', fontStyle: 'italic' }}>
            → Gegenstück „{TYP_LABELS[gegTyp] ?? gegTyp}" wird automatisch angelegt
          </div>
        )}
        <div style={{ display: 'flex', gap: 5 }}>
          <button onClick={handleCreate} disabled={saving || !relId}
            style={{ padding: '5px 12px', borderRadius: 5, border: 'none', background: !relId ? 'var(--border)' : '#000', color: !relId ? 'var(--text-muted)' : '#fff', fontSize: 12, cursor: saving || !relId ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
            {saving && <Loader2 size={11} style={{ animation: 'spin 0.8s linear infinite' }} />}
            Anlegen
          </button>
          <button onClick={onCancel}
            style={{ padding: '5px 10px', borderRadius: 5, border: '1px solid var(--border)', background: 'transparent', fontSize: 12, cursor: 'pointer', color: 'var(--text-muted)' }}>
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Detail Panel (right side) ─────────────────────────────────────────────────

function CharDetailPanel({
  char, prodId, allChars,
}: {
  char: BibleChar
  prodId: string
  allChars: BibleChar[]
}) {
  const [tab, setTab] = useState<'beziehungen' | 'chronologie'>('beziehungen')
  const [beziehungen, setBeziehungen] = useState<Beziehung[]>([])
  const [chronologie, setChronologie] = useState<ChronologieEintrag[]>([])
  const [loading, setLoading] = useState(false)
  const [showNeueBez, setShowNeueBez] = useState(false)
  const [syncLoading, setSyncLoading] = useState(false)
  const [showNeueChrono, setShowNeueChrono] = useState(false)
  const [neuesChrono, setNeuesChrono] = useState('')
  const [neuesChronoBlock, setNeuesChronoBlock] = useState('')
  const [savingChrono, setSavingChrono] = useState(false)

  useEffect(() => {
    setLoading(true)
    setShowNeueBez(false)
    setShowNeueChrono(false)
    api.getBibleCharacter(char.id, prodId)
      .then(data => {
        setBeziehungen(data.beziehungen ?? [])
        setChronologie(data.chronologie ?? [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [char.id, prodId])

  async function handleSync() {
    setSyncLoading(true)
    try {
      await api.syncBibleChronologie(prodId)
      const data = await api.getBibleCharacter(char.id, prodId)
      setChronologie(data.chronologie ?? [])
    } finally {
      setSyncLoading(false)
    }
  }

  async function handleAddChrono() {
    if (!neuesChrono.trim()) return
    setSavingChrono(true)
    try {
      const row = await api.createBibleChronologie({
        character_id: char.id,
        produktion_id: prodId,
        block_nummer: neuesChronoBlock ? Number(neuesChronoBlock) : null,
        ereignis: neuesChrono.trim(),
      })
      setChronologie(prev => [...prev, row].sort((a, b) => (a.block_nummer ?? 9999) - (b.block_nummer ?? 9999)))
      setNeuesChrono('')
      setNeuesChronoBlock('')
      setShowNeueChrono(false)
    } finally {
      setSavingChrono(false)
    }
  }

  async function handleDeleteChrono(id: string) {
    await api.deleteBibleChronologie(id)
    setChronologie(prev => prev.filter(e => e.id !== id))
  }

  async function handleDeleteBez(id: number) {
    await api.deleteCharacterBeziehung(char.id, id)
    setBeziehungen(prev => prev.filter(b => b.id !== id))
  }

  // Beziehungen nach Typ gruppieren
  const grouped = useMemo(() => {
    const g: Record<string, Beziehung[]> = {}
    for (const b of beziehungen) {
      if (!g[b.beziehungstyp]) g[b.beziehungstyp] = []
      g[b.beziehungstyp].push(b)
    }
    return g
  }, [beziehungen])

  const charColor = char.farbe ?? '#757575'

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px', borderBottom: '1px solid var(--border)',
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{ width: 12, height: 12, borderRadius: '50%', background: charColor, flexShrink: 0 }} />
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{char.name}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>
          {beziehungen.length} Beziehungen · {chronologie.length} Einträge
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0, paddingLeft: 20 }}>
        {([
          { key: 'beziehungen', label: `Beziehungen (${beziehungen.length})`, Icon: Link2 },
          { key: 'chronologie', label: `Chronologie (${chronologie.length})`, Icon: Clock },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              padding: '8px 16px', background: 'none', border: 'none',
              borderBottom: `2px solid ${tab === t.key ? '#000' : 'transparent'}`,
              cursor: 'pointer', fontSize: 12,
              color: tab === t.key ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: tab === t.key ? 600 : 400,
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
            <t.Icon size={12} />{t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}>
            <Loader2 size={22} style={{ animation: 'spin 0.8s linear infinite', color: 'var(--text-muted)' }} />
          </div>
        ) : tab === 'beziehungen' ? (
          <>
            {/* Neue Beziehung */}
            {showNeueBez ? (
              <NeueBeziehungForm
                characterId={char.id}
                allChars={allChars}
                onCreated={b => { setBeziehungen(prev => [...prev, b]); setShowNeueBez(false) }}
                onCancel={() => setShowNeueBez(false)}
              />
            ) : (
              <button onClick={() => setShowNeueBez(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14,
                  padding: '6px 12px', borderRadius: 6, border: '1px dashed var(--border)',
                  background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)',
                }}>
                <Plus size={12} /> Beziehung anlegen
              </button>
            )}

            {beziehungen.length === 0 && !showNeueBez && (
              <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', paddingTop: 32, fontStyle: 'italic' }}>
                Noch keine Beziehungen für {char.name}.
              </div>
            )}

            {/* Grouped by typ */}
            {Object.entries(grouped).map(([typ, list]) => (
              <div key={typ} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 6 }}>
                  {TYP_LABELS[typ] ?? typ}
                </div>
                {list.map(b => (
                  <BeziehungCard
                    key={b.id}
                    bez={b}
                    characterId={char.id}
                    onUpdate={updated => setBeziehungen(prev => prev.map(x => x.id === updated.id ? updated : x))}
                    onDelete={handleDeleteBez}
                  />
                ))}
              </div>
            ))}
          </>
        ) : (
          /* Chronologie */
          <>
            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              <button onClick={handleSync} disabled={syncLoading}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)',
                  background: 'transparent', cursor: syncLoading ? 'default' : 'pointer',
                  fontSize: 11, color: 'var(--text-muted)',
                }}>
                {syncLoading ? <Loader2 size={11} style={{ animation: 'spin 0.8s linear infinite' }} /> : <RefreshCw size={11} />}
                Aus Future-Beats ableiten
              </button>
              <button onClick={() => setShowNeueChrono(v => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)',
                  background: 'transparent', cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)',
                }}>
                <Plus size={11} /> Manuell hinzufügen
              </button>
            </div>

            {/* Neue Chrono */}
            {showNeueChrono && (
              <div style={{
                padding: 12, borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--bg)', marginBottom: 10,
              }}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <input value={neuesChronoBlock} onChange={e => setNeuesChronoBlock(e.target.value)}
                    placeholder="Block (optional)"
                    style={{ width: 100, padding: '5px 7px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg-surface)', fontSize: 11, color: 'var(--text-primary)' }} />
                  <input value={neuesChrono} onChange={e => setNeuesChrono(e.target.value)}
                    placeholder="Ereignis beschreiben…"
                    onKeyDown={e => e.key === 'Enter' && handleAddChrono()}
                    style={{ flex: 1, padding: '5px 7px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg-surface)', fontSize: 11, color: 'var(--text-primary)' }} />
                </div>
                <div style={{ display: 'flex', gap: 5 }}>
                  <button onClick={handleAddChrono} disabled={savingChrono || !neuesChrono.trim()}
                    style={{ padding: '4px 10px', borderRadius: 5, border: 'none', background: neuesChrono.trim() ? '#000' : 'var(--border)', color: neuesChrono.trim() ? '#fff' : 'var(--text-muted)', fontSize: 11, cursor: savingChrono || !neuesChrono.trim() ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                    {savingChrono && <Loader2 size={10} style={{ animation: 'spin 0.8s linear infinite' }} />} Hinzufügen
                  </button>
                  <button onClick={() => setShowNeueChrono(false)}
                    style={{ padding: '4px 8px', borderRadius: 5, border: '1px solid var(--border)', background: 'transparent', fontSize: 11, cursor: 'pointer', color: 'var(--text-muted)' }}>
                    Abbrechen
                  </button>
                </div>
              </div>
            )}

            {chronologie.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', paddingTop: 32, fontStyle: 'italic' }}>
                Noch keine Einträge. Klicke „Aus Future-Beats ableiten" um die Chronologie zu befüllen.
              </div>
            )}

            {/* Timeline */}
            <div style={{ position: 'relative' }}>
              {/* Vertical line */}
              {chronologie.length > 0 && (
                <div style={{ position: 'absolute', left: 7, top: 8, bottom: 8, width: 2, background: 'var(--border)' }} />
              )}
              {chronologie.map(e => (
                <div key={e.id} style={{ display: 'flex', gap: 12, marginBottom: 10, position: 'relative' }}>
                  {/* Dot */}
                  <div style={{
                    width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                    background: e.manuell ? charColor : 'var(--bg-surface)',
                    border: `2px solid ${e.manuell ? charColor : 'var(--border)'}`,
                    marginTop: 2, zIndex: 1,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      {e.block_nummer != null && (
                        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', background: 'var(--bg)', padding: '1px 5px', borderRadius: 4, border: '1px solid var(--border)' }}>
                          Block {e.block_nummer}
                        </span>
                      )}
                      <span style={{
                        fontSize: 10, color: e.manuell ? charColor : 'var(--text-muted)',
                        background: e.manuell ? `${charColor}18` : 'var(--bg)',
                        padding: '1px 5px', borderRadius: 4,
                        border: `1px solid ${e.manuell ? charColor + '44' : 'var(--border)'}`,
                      }}>
                        {e.manuell ? 'manuell' : 'aus Beat'}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                      {e.ereignis}
                    </div>
                  </div>
                  {e.manuell && (
                    <button onClick={() => handleDeleteChrono(e.id)}
                      style={{ width: 22, height: 22, borderRadius: 4, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FF3B30', flexShrink: 0, opacity: 0.6 }}>
                      <X size={11} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function BiblePage() {
  const { selectedProduction } = useSelectedProduction()
  const [chars, setChars] = useState<BibleChar[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const prodId = selectedProduction?.id ?? null

  useEffect(() => {
    if (!prodId) { setChars([]); return }
    setLoading(true)
    api.getBibleUebersicht(prodId)
      .then(setChars)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [prodId])

  const filtered = useMemo(() =>
    search
      ? chars.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
      : chars,
    [chars, search]
  )

  const selectedChar = chars.find(c => c.id === selectedId) ?? null

  if (!prodId) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
        Keine Produktion ausgewählt.
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

      {/* Left: Character list */}
      <div style={{
        width: 240, flexShrink: 0, borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        background: 'var(--bg-surface)',
      }}>
        {/* Search */}
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Figur suchen…"
              style={{
                width: '100%', boxSizing: 'border-box', paddingLeft: 28, paddingRight: 8,
                paddingTop: 6, paddingBottom: 6, borderRadius: 6,
                border: '1px solid var(--border)', background: 'var(--bg)',
                fontSize: 12, color: 'var(--text-primary)',
              }}
            />
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}>
              <Loader2 size={20} style={{ animation: 'spin 0.8s linear infinite', color: 'var(--text-muted)' }} />
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '24px 16px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
              {chars.length === 0 ? 'Keine aktiven Figuren.' : 'Keine Treffer.'}
            </div>
          ) : filtered.map(c => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              style={{
                width: '100%', padding: '9px 14px', border: 'none', textAlign: 'left',
                background: selectedId === c.id ? 'rgba(0,0,0,0.06)' : 'transparent',
                cursor: 'pointer', borderBottom: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.farbe ?? '#757575', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.name}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                  {c.beziehungen_count > 0 && `${c.beziehungen_count} Bezieh.`}
                  {c.beziehungen_count > 0 && c.chronologie_count > 0 && ' · '}
                  {c.chronologie_count > 0 && `${c.chronologie_count} Eintr.`}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right: Detail */}
      {selectedChar ? (
        <CharDetailPanel char={selectedChar} prodId={prodId} allChars={chars} />
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          Figur aus der Liste auswählen.
        </div>
      )}
    </div>
  )
}
