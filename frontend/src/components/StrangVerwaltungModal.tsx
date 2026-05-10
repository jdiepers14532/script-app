import { useState, useEffect } from 'react'
import { X, Plus, ChevronDown, ChevronRight, Check, Circle } from 'lucide-react'
import { api } from '../api/client'
import Tooltip from './Tooltip'

const STRANG_FARBEN = [
  '#007AFF', '#FF9500', '#AF52DE', '#00C853', '#FF3B30',
  '#5AC8FA', '#FFCC00', '#FF2D55', '#8E8E93', '#34C759',
]

const TYP_LABELS: Record<string, string> = {
  soap: 'Beziehungsdynamik',
  genre: 'Thematischer Bogen',
  anthology: 'Anthology',
}

interface Props {
  produktionId: string
  open: boolean
  onClose: () => void
  allCharacters?: any[]
}

export default function StrangVerwaltungModal({ produktionId, open, onClose, allCharacters = [] }: Props) {
  const [straenge, setStraenge] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showFarbPicker, setShowFarbPicker] = useState<string | null>(null)
  const [expandedBeats, setExpandedBeats] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!open) return
    loadStraenge()
  }, [open, produktionId])

  const loadStraenge = async () => {
    setLoading(true)
    try {
      const data = await api.getStraenge(produktionId)
      setStraenge(data)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const handleCreate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const usedFarben = straenge.map(s => s.farbe)
      const nextFarbe = STRANG_FARBEN.find(f => !usedFarben.includes(f)) || STRANG_FARBEN[0]
      await api.createStrang({
        produktion_id: produktionId,
        name: newName.trim(),
        farbe: nextFarbe,
      })
      setNewName('')
      await loadStraenge()
    } catch (e) { console.error(e) }
    finally { setCreating(false) }
  }

  const handleUpdate = async (id: string, data: any) => {
    try {
      await api.updateStrang(id, data)
      await loadStraenge()
    } catch (e) { console.error(e) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Strang wirklich loeschen? Alle Zuordnungen gehen verloren.')) return
    try {
      await api.deleteStrang(id)
      await loadStraenge()
    } catch (e) { console.error(e) }
  }

  const handleAddCharakter = async (strangId: string, characterId: string) => {
    try {
      await api.addStrangCharakter(strangId, { character_id: characterId })
      await loadStraenge()
    } catch (e) { console.error(e) }
  }

  const handleRemoveCharakter = async (strangId: string, characterId: string) => {
    try {
      await api.removeStrangCharakter(strangId, characterId)
      await loadStraenge()
    } catch (e) { console.error(e) }
  }

  if (!open) return null

  const grouped = {
    aktiv: straenge.filter(s => s.status === 'aktiv'),
    ruhend: straenge.filter(s => s.status === 'ruhend'),
    beendet: straenge.filter(s => s.status === 'beendet'),
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box strang-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560, maxHeight: '85vh' }}>
        <div className="modal-head">
          <span>Straenge verwalten</span>
          <button className="iconbtn" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="modal-body" style={{ overflowY: 'auto', padding: '12px 16px' }}>
          {loading && <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: 8 }}>Laden...</div>}

          {/* Create new */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            <input
              className="sf-input"
              placeholder="Neuer Strang..."
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              style={{ flex: 1, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }}
            />
            <button className="btn-sm btn-primary" onClick={handleCreate} disabled={creating || !newName.trim()}>
              <Plus size={12} /> Anlegen
            </button>
          </div>

          {/* Grouped lists */}
          {(['aktiv', 'ruhend', 'beendet'] as const).map(status => {
            const items = grouped[status]
            if (items.length === 0 && status !== 'aktiv') return null
            return (
              <div key={status} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 6 }}>
                  {status === 'aktiv' ? 'Aktiv' : status === 'ruhend' ? 'Ruhend' : 'Beendet'}
                  {items.length > 0 && ` (${items.length})`}
                </div>
                {items.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '4px 0' }}>Keine Straenge</div>
                )}
                {items.map(s => (
                  <StrangCard
                    key={s.id}
                    strang={s}
                    isEditing={editingId === s.id}
                    showFarbPicker={showFarbPicker === s.id}
                    isBeatsExpanded={expandedBeats === s.id}
                    allCharacters={allCharacters}
                    onEdit={() => setEditingId(editingId === s.id ? null : s.id)}
                    onToggleFarbPicker={() => setShowFarbPicker(showFarbPicker === s.id ? null : s.id)}
                    onToggleBeats={() => setExpandedBeats(expandedBeats === s.id ? null : s.id)}
                    onUpdate={(data: any) => handleUpdate(s.id, data)}
                    onDelete={() => handleDelete(s.id)}
                    onAddCharakter={(charId: string) => handleAddCharakter(s.id, charId)}
                    onRemoveCharakter={(charId: string) => handleRemoveCharakter(s.id, charId)}
                  />
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function StrangCard({ strang, isEditing, showFarbPicker, isBeatsExpanded, allCharacters, onEdit, onToggleFarbPicker, onToggleBeats, onUpdate, onDelete, onAddCharakter, onRemoveCharakter }: any) {
  const chars = strang.charaktere || []
  const [beatText, setBeatText] = useState('')
  const [beats, setBeats] = useState<any[]>([])
  const [charSearch, setCharSearch] = useState('')
  const [charDropdown, setCharDropdown] = useState(false)

  useEffect(() => {
    if (isBeatsExpanded) {
      api.getStrangBeats(strang.id).then(setBeats).catch(() => {})
    }
  }, [isBeatsExpanded, strang.id])

  const handleAddBeat = async () => {
    if (!beatText.trim()) return
    try {
      await api.createStrangBeat(strang.id, { beat_text: beatText.trim(), ebene: 'future' })
      setBeatText('')
      const updated = await api.getStrangBeats(strang.id)
      setBeats(updated)
    } catch (e) { console.error(e) }
  }

  const handleToggleBeat = async (beatId: string) => {
    try {
      await api.toggleStrangBeatAbgearbeitet(beatId)
      const updated = await api.getStrangBeats(strang.id)
      setBeats(updated)
    } catch (e) { console.error(e) }
  }

  const handleDeleteBeat = async (beatId: string) => {
    try {
      await api.deleteStrangBeat(beatId)
      const updated = await api.getStrangBeats(strang.id)
      setBeats(updated)
    } catch (e) { console.error(e) }
  }

  const charIds = new Set(chars.map((c: any) => c.character_id))
  const filteredChars = allCharacters
    .filter((c: any) => !charIds.has(c.id))
    .filter((c: any) => !charSearch || c.name.toLowerCase().includes(charSearch.toLowerCase()))
    .slice(0, 10)

  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px',
      marginBottom: 6, background: 'var(--bg)',
      borderLeft: `4px solid ${strang.farbe}`,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Color dot — click to pick */}
        <div
          style={{
            width: 14, height: 14, borderRadius: '50%', background: strang.farbe,
            cursor: 'pointer', flexShrink: 0, border: '2px solid var(--border)',
          }}
          onClick={onToggleFarbPicker}
          title="Farbe aendern"
        />
        {/* Name */}
        {isEditing ? (
          <input
            className="sf-input"
            defaultValue={strang.name}
            autoFocus
            style={{ flex: 1, fontWeight: 600, fontSize: 13, padding: '2px 6px', border: '1px solid var(--border)', borderRadius: 4 }}
            onBlur={e => { if (e.target.value.trim() !== strang.name) onUpdate({ name: e.target.value.trim() }) }}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          />
        ) : (
          <span style={{ flex: 1, fontWeight: 600, fontSize: 13, cursor: 'pointer' }} onClick={onEdit}>{strang.name}</span>
        )}
        {/* Typ badge */}
        <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--surface)', padding: '1px 6px', borderRadius: 4 }}>
          {TYP_LABELS[strang.typ] || strang.typ}
        </span>
        {/* Szenen count */}
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{strang.szenen_count || 0} Sz.</span>
        {/* Status toggle */}
        <select
          value={strang.status}
          onChange={e => onUpdate({ status: e.target.value })}
          style={{ fontSize: 10, padding: '1px 4px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg)' }}
        >
          <option value="aktiv">Aktiv</option>
          <option value="ruhend">Ruhend</option>
          <option value="beendet">Beendet</option>
        </select>
        {/* Delete */}
        <button className="iconbtn" title="Loeschen" onClick={onDelete} style={{ color: 'var(--sw-danger)' }}><X size={12} /></button>
      </div>

      {/* Farb-Picker */}
      {showFarbPicker && (
        <div style={{ display: 'flex', gap: 4, padding: '8px 0 4px', flexWrap: 'wrap' }}>
          {STRANG_FARBEN.map(f => (
            <div
              key={f}
              onClick={() => { onUpdate({ farbe: f }); onToggleFarbPicker() }}
              style={{
                width: 22, height: 22, borderRadius: '50%', background: f, cursor: 'pointer',
                border: f === strang.farbe ? '3px solid var(--text)' : '2px solid var(--border)',
              }}
            />
          ))}
        </div>
      )}

      {/* Untertitel */}
      {isEditing && (
        <input
          className="sf-input"
          defaultValue={strang.untertitel ?? ''}
          placeholder="Untertitel..."
          style={{ width: '100%', fontSize: 11, marginTop: 6, padding: '2px 6px', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-muted)' }}
          onBlur={e => { const v = e.target.value.trim() || null; if (v !== (strang.untertitel ?? null)) onUpdate({ untertitel: v }) }}
        />
      )}
      {!isEditing && strang.untertitel && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{strang.untertitel}</div>
      )}

      {/* Typ + Label (editing) */}
      {isEditing && (
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <select
            value={strang.typ}
            onChange={e => onUpdate({ typ: e.target.value })}
            style={{ fontSize: 11, padding: '2px 4px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg)' }}
          >
            <option value="soap">Beziehungsdynamik</option>
            <option value="genre">Thematischer Bogen</option>
            <option value="anthology">Anthology</option>
          </select>
          <select
            value={strang.label ?? ''}
            onChange={e => onUpdate({ label: e.target.value || null })}
            style={{ fontSize: 11, padding: '2px 4px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg)' }}
          >
            <option value="">Kein Label</option>
            <option value="business">Business-Plot</option>
            <option value="privat">Privat-Plot</option>
          </select>
        </div>
      )}

      {/* Charakter-Chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 6, alignItems: 'center' }}>
        {chars.map((c: any) => (
          <span key={c.character_id} className="sf-char-chip" style={{ fontSize: 10 }}>
            {c.name}
            <button className="sf-char-remove" onClick={() => onRemoveCharakter(c.character_id)}><X size={8} /></button>
          </span>
        ))}
        {/* Add character */}
        <span style={{ position: 'relative' }}>
          <input
            className="sf-char-search"
            value={charSearch}
            placeholder="+"
            onChange={e => { setCharSearch(e.target.value); setCharDropdown(true) }}
            onFocus={() => setCharDropdown(true)}
            onBlur={() => setTimeout(() => setCharDropdown(false), 200)}
            style={{ width: charSearch ? 80 : 20, fontSize: 10 }}
          />
          {charDropdown && filteredChars.length > 0 && (
            <div className="sf-dropdown" style={{ position: 'absolute', top: '100%', left: 0, minWidth: 140, zIndex: 100 }}>
              {filteredChars.map((ch: any) => (
                <div key={ch.id} className="sf-dropdown-item" style={{ fontSize: 11 }}
                  onMouseDown={e => { e.preventDefault(); onAddCharakter(ch.id); setCharSearch(''); setCharDropdown(false) }}>
                  {ch.name}
                </div>
              ))}
            </div>
          )}
        </span>
      </div>

      {/* Beats section — collapsible */}
      <div style={{ marginTop: 6 }}>
        <button
          onClick={onToggleBeats}
          style={{
            display: 'flex', alignItems: 'center', gap: 4, fontSize: 10,
            color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          }}
        >
          {isBeatsExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          Beats ({beats.length || '...'})
        </button>
        {isBeatsExpanded && (
          <div style={{ marginTop: 4, paddingLeft: 8, borderLeft: `2px solid ${strang.farbe}33` }}>
            {beats.map((b: any) => (
              <div key={b.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 4, marginBottom: 3, fontSize: 11 }}>
                <button
                  onClick={() => handleToggleBeat(b.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 2, flexShrink: 0 }}
                >
                  {b.ist_abgearbeitet
                    ? <Check size={11} style={{ color: 'var(--sw-green)' }} />
                    : <Circle size={11} style={{ color: 'var(--text-muted)' }} />}
                </button>
                <span style={{ flex: 1, textDecoration: b.ist_abgearbeitet ? 'line-through' : 'none', color: b.ist_abgearbeitet ? 'var(--text-muted)' : 'var(--text)' }}>
                  {b.block_label && <span style={{ color: strang.farbe, fontWeight: 600, marginRight: 4 }}>[{b.block_label}]</span>}
                  {b.beat_text}
                </span>
                <button className="iconbtn" onClick={() => handleDeleteBeat(b.id)} style={{ flexShrink: 0 }}><X size={9} /></button>
              </div>
            ))}
            {/* Add beat */}
            <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
              <input
                className="sf-input"
                value={beatText}
                placeholder="Neuer Beat..."
                onChange={e => setBeatText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddBeat()}
                style={{ flex: 1, fontSize: 11, padding: '2px 6px', border: '1px solid var(--border)', borderRadius: 4 }}
              />
              <button className="iconbtn" onClick={handleAddBeat} disabled={!beatText.trim()}><Plus size={11} /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
