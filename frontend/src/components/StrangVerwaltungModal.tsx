import { useState, useEffect } from 'react'
import { X, Plus, ChevronDown, ChevronRight, Check, Circle, Upload } from 'lucide-react'
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
    if (!confirm('Strang wirklich l\u00f6schen? Alle Zuordnungen gehen verloren.')) return
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
    <div className="strang-panel">
      {/* Header */}
      <div className="strang-panel-head">
        <span style={{ fontWeight: 700, fontSize: 14 }}>Str\u00e4nge verwalten</span>
        <button className="iconbtn" onClick={onClose} title="Schlie\u00dfen"><X size={14} /></button>
      </div>

      {/* Content */}
      <div className="strang-panel-body">
        {loading && <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: 8 }}>Laden...</div>}

        {/* Create new */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, padding: '0 4px' }}>
          <input
            placeholder="Neuer Strang..."
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
          />
          <button className="btn-sm btn-primary" onClick={handleCreate} disabled={creating || !newName.trim()} style={{ padding: '8px 14px' }}>
            <Plus size={12} style={{ marginRight: 4 }} /> Anlegen
          </button>
        </div>

        {/* Grouped lists */}
        {(['aktiv', 'ruhend', 'beendet'] as const).map(status => {
          const items = grouped[status]
          if (items.length === 0 && status !== 'aktiv') return null
          return (
            <div key={status} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: 8, padding: '0 4px' }}>
                {status === 'aktiv' ? 'Aktiv' : status === 'ruhend' ? 'Ruhend' : 'Beendet'}
                {items.length > 0 && ` (${items.length})`}
              </div>
              {items.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 4px' }}>Noch keine Str\u00e4nge angelegt.</div>
              )}
              <div style={{ display: 'grid', gap: 8 }}>
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
            </div>
          )
        })}
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
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [importBlockLabel, setImportBlockLabel] = useState('')
  const [importing, setImporting] = useState(false)

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
    <div className="strang-card" style={{ borderLeftColor: strang.farbe }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{ width: 16, height: 16, borderRadius: '50%', background: strang.farbe, cursor: 'pointer', flexShrink: 0, border: '2px solid var(--border)' }}
          onClick={onToggleFarbPicker}
          title="Farbe \u00e4ndern"
        />
        {isEditing ? (
          <input
            defaultValue={strang.name}
            autoFocus
            style={{ flex: 1, fontWeight: 600, fontSize: 13, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
            onBlur={e => { if (e.target.value.trim() !== strang.name) onUpdate({ name: e.target.value.trim() }) }}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          />
        ) : (
          <span style={{ flex: 1, fontWeight: 600, fontSize: 13, cursor: 'pointer' }} onClick={onEdit}>{strang.name}</span>
        )}
        <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-subtle)', padding: '2px 8px', borderRadius: 4 }}>
          {TYP_LABELS[strang.typ] || strang.typ}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{strang.szenen_count || 0} Sz.</span>
        <select
          value={strang.status}
          onChange={e => onUpdate({ status: e.target.value })}
          style={{ fontSize: 10, padding: '2px 6px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
        >
          <option value="aktiv">Aktiv</option>
          <option value="ruhend">Ruhend</option>
          <option value="beendet">Beendet</option>
        </select>
        <button className="iconbtn" title="L\u00f6schen" onClick={onDelete} style={{ color: 'var(--sw-danger)' }}><X size={12} /></button>
      </div>

      {/* Farb-Picker */}
      {showFarbPicker && (
        <div style={{ display: 'flex', gap: 6, padding: '10px 0 4px', flexWrap: 'wrap' }}>
          {STRANG_FARBEN.map(f => (
            <div
              key={f}
              onClick={() => { onUpdate({ farbe: f }); onToggleFarbPicker() }}
              style={{ width: 24, height: 24, borderRadius: '50%', background: f, cursor: 'pointer', border: f === strang.farbe ? '3px solid var(--text-primary)' : '2px solid var(--border)', transition: 'transform 0.1s' }}
            />
          ))}
        </div>
      )}

      {/* Untertitel */}
      {isEditing && (
        <input
          defaultValue={strang.untertitel ?? ''}
          placeholder="Untertitel..."
          style={{ width: '100%', fontSize: 11, marginTop: 8, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-surface)', color: 'var(--text-secondary)' }}
          onBlur={e => { const v = e.target.value.trim() || null; if (v !== (strang.untertitel ?? null)) onUpdate({ untertitel: v }) }}
        />
      )}
      {!isEditing && strang.untertitel && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{strang.untertitel}</div>
      )}

      {/* Typ + Label (editing) */}
      {isEditing && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <select value={strang.typ} onChange={e => onUpdate({ typ: e.target.value })}
            style={{ fontSize: 11, padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-surface)', color: 'var(--text-primary)' }}>
            <option value="soap">Beziehungsdynamik</option>
            <option value="genre">Thematischer Bogen</option>
            <option value="anthology">Anthology</option>
          </select>
          <select value={strang.label ?? ''} onChange={e => onUpdate({ label: e.target.value || null })}
            style={{ fontSize: 11, padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-surface)', color: 'var(--text-primary)' }}>
            <option value="">Kein Label</option>
            <option value="business">Business-Plot</option>
            <option value="privat">Privat-Plot</option>
          </select>
        </div>
      )}

      {/* Charakter-Chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8, alignItems: 'center' }}>
        {chars.map((c: any) => (
          <span key={c.character_id} className="sf-char-chip" style={{ fontSize: 10 }}>
            {c.name}
            <button className="sf-char-remove" onClick={() => onRemoveCharakter(c.character_id)}><X size={8} /></button>
          </span>
        ))}
        <span style={{ position: 'relative' }}>
          <input
            className="sf-char-search"
            value={charSearch}
            placeholder="+ Figur"
            onChange={e => { setCharSearch(e.target.value); setCharDropdown(true) }}
            onFocus={() => setCharDropdown(true)}
            onBlur={() => setTimeout(() => setCharDropdown(false), 200)}
            style={{ width: charSearch ? 100 : 50, fontSize: 10 }}
          />
          {charDropdown && filteredChars.length > 0 && (
            <div className="sf-dropdown" style={{ position: 'absolute', top: '100%', left: 0, minWidth: 160, zIndex: 100 }}>
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

      {/* Beats section */}
      <div style={{ marginTop: 8 }}>
        <button onClick={onToggleBeats}
          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          {isBeatsExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          Beats ({beats.length || '\u2026'})
        </button>
        {isBeatsExpanded && (
          <div style={{ marginTop: 6, paddingLeft: 10, borderLeft: `2px solid ${strang.farbe}44` }}>
            {beats.map((b: any) => (
              <div key={b.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 4, fontSize: 11 }}>
                <button onClick={() => handleToggleBeat(b.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 2, flexShrink: 0 }}>
                  {b.ist_abgearbeitet
                    ? <Check size={12} style={{ color: 'var(--sw-green)' }} />
                    : <Circle size={12} style={{ color: 'var(--text-muted)' }} />}
                </button>
                <span style={{ flex: 1, textDecoration: b.ist_abgearbeitet ? 'line-through' : 'none', color: b.ist_abgearbeitet ? 'var(--text-muted)' : 'var(--text-primary)', lineHeight: 1.5 }}>
                  {b.block_label && <span style={{ color: strang.farbe, fontWeight: 600, marginRight: 4 }}>[{b.block_label}]</span>}
                  {b.beat_text}
                </span>
                <button className="iconbtn" onClick={() => handleDeleteBeat(b.id)} style={{ flexShrink: 0 }}><X size={9} /></button>
              </div>
            ))}
            {/* Add beat */}
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <input
                value={beatText}
                placeholder="Neuer Beat..."
                onChange={e => setBeatText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddBeat()}
                style={{ flex: 1, fontSize: 11, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
              />
              <button className="iconbtn" onClick={handleAddBeat} disabled={!beatText.trim()}><Plus size={12} /></button>
            </div>
            {/* Future-Import */}
            <div style={{ marginTop: 10 }}>
              <button onClick={() => setShowImport(!showImport)}
                style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--sw-info)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                <Upload size={11} />
                {showImport ? 'Import schlie\u00dfen' : 'Future-Text importieren'}
              </button>
              {showImport && (
                <div style={{ marginTop: 6, padding: 12, background: 'var(--bg-subtle)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                    Jede Zeile = ein Beat. Aufz\u00e4hlungszeichen (-, *, \u2022) werden entfernt.
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                    <input
                      value={importBlockLabel}
                      placeholder="Block-Label (z.B. 870)"
                      onChange={e => setImportBlockLabel(e.target.value)}
                      style={{ width: 140, fontSize: 11, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <textarea
                    value={importText}
                    onChange={e => setImportText(e.target.value)}
                    placeholder={'- Lou trifft Daniel\n- Jess entdeckt Geheimnis\n- Franka vermittelt'}
                    rows={6}
                    style={{ width: '100%', fontSize: 11, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6, resize: 'vertical', fontFamily: 'inherit', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                  />
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                    <button className="btn-sm" onClick={() => { setShowImport(false); setImportText(''); setImportBlockLabel('') }}>Abbrechen</button>
                    <button className="btn-sm btn-primary" disabled={!importText.trim() || importing}
                      onClick={async () => {
                        setImporting(true)
                        try {
                          const result = await api.importFutureBeats(strang.id, { text: importText, block_label: importBlockLabel || undefined, ebene: 'future' })
                          setImportText('')
                          setImportBlockLabel('')
                          setShowImport(false)
                          const updated = await api.getStrangBeats(strang.id)
                          setBeats(updated)
                        } catch (e: any) { alert('Fehler: ' + e.message) }
                        finally { setImporting(false) }
                      }}>
                      {importing ? 'Importiere\u2026' : `Importieren`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
