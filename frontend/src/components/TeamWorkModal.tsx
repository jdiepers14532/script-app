import { useState, useEffect, useCallback, useRef } from 'react'
import { X, Plus, Trash2, Users, UserPlus, UserMinus, ChevronRight, Search } from 'lucide-react'
import { api } from '../api/client'

const BLUE = '#007AFF'
const GREEN = '#00C853'
const RED = '#FF3B30'
const PURPLE = '#AF52DE'

interface Mitglied {
  id: string
  user_id: string
  user_name: string
  hinzugefuegt_am: string
}

interface ColabGruppe {
  id: string
  name: string
  beschreibung?: string
  erstellt_von: string
  erstellt_am: string
  mitglieder: Mitglied[] | null
}

interface AppUser {
  user_id: string
  user_name: string
  email: string
}

interface TeamWorkModalProps {
  produktionId: string
  currentUserId?: string
  currentUserName?: string
  onClose: () => void
}

export default function TeamWorkModal({
  produktionId,
  currentUserId,
  currentUserName,
  onClose,
}: TeamWorkModalProps) {
  const [gruppen, setGruppen] = useState<ColabGruppe[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedGruppe, setSelectedGruppe] = useState<ColabGruppe | null>(null)
  const [view, setView] = useState<'list' | 'detail' | 'new'>('list')
  const [newName, setNewName] = useState('')
  const [newBeschreibung, setNewBeschreibung] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Member search
  const [memberQuery, setMemberQuery] = useState('')
  const [memberResults, setMemberResults] = useState<AppUser[]>([])
  const [memberSearching, setMemberSearching] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadGruppen = useCallback(async () => {
    try {
      const data = await api.getColabGruppen(produktionId)
      setGruppen(Array.isArray(data) ? data : [])
    } catch {
      setError('Gruppen konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [produktionId])

  useEffect(() => { loadGruppen() }, [loadGruppen])

  // Debounced user search
  useEffect(() => {
    if (view !== 'detail') return
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (!memberQuery.trim()) { setMemberResults([]); return }
    setMemberSearching(true)
    searchTimer.current = setTimeout(async () => {
      try {
        const results = await api.searchAppUsers(memberQuery)
        // Filter out already-members
        const existingIds = new Set((selectedGruppe?.mitglieder ?? []).map(m => m.user_id))
        setMemberResults(results.filter(u => !existingIds.has(u.user_id)))
      } catch { setMemberResults([]) }
      finally { setMemberSearching(false) }
    }, 300)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [memberQuery, view, selectedGruppe])

  async function createGruppe() {
    if (!newName.trim()) return
    setSaving(true)
    setError(null)
    try {
      const gruppe = await api.createColabGruppe({
        produktion_id: produktionId,
        name: newName.trim(),
        beschreibung: newBeschreibung.trim() || undefined,
      })
      setGruppen(prev => [...prev, gruppe])
      setSelectedGruppe(gruppe)
      setView('detail')
      setNewName('')
      setNewBeschreibung('')
    } catch {
      setError('Gruppe konnte nicht erstellt werden.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteGruppe(id: string) {
    if (!confirm('Gruppe wirklich löschen?')) return
    try {
      await api.deleteColabGruppeById(id)
      setGruppen(prev => prev.filter(g => g.id !== id))
      if (selectedGruppe?.id === id) { setSelectedGruppe(null); setView('list') }
    } catch {
      setError('Gruppe konnte nicht gelöscht werden.')
    }
  }

  async function addMember(user: AppUser) {
    if (!selectedGruppe) return
    setSaving(true)
    try {
      const m = await api.addColabMitglied(selectedGruppe.id, {
        user_id: user.user_id,
        user_name: user.user_name,
      })
      const updated = { ...selectedGruppe, mitglieder: [...(selectedGruppe.mitglieder ?? []), m] }
      setSelectedGruppe(updated)
      setGruppen(prev => prev.map(g => g.id === selectedGruppe.id ? updated : g))
      setMemberQuery('')
      setMemberResults([])
    } catch {
      setError('Mitglied konnte nicht hinzugefügt werden.')
    } finally {
      setSaving(false)
    }
  }

  async function addSelf() {
    if (!currentUserId || !currentUserName) return
    await addMember({ user_id: currentUserId, user_name: currentUserName, email: '' })
  }

  async function removeMember(userId: string) {
    if (!selectedGruppe) return
    try {
      await api.removeColabMitglied(selectedGruppe.id, userId)
      const updated = { ...selectedGruppe, mitglieder: (selectedGruppe.mitglieder ?? []).filter(m => m.user_id !== userId) }
      setSelectedGruppe(updated)
      setGruppen(prev => prev.map(g => g.id === selectedGruppe.id ? updated : g))
    } catch {
      setError('Mitglied konnte nicht entfernt werden.')
    }
  }

  const isMember = selectedGruppe?.mitglieder?.some(m => m.user_id === currentUserId)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} onClick={onClose} />
      <div style={{
        position: 'relative', background: 'var(--bg-surface)', borderRadius: 14,
        boxShadow: '0 8px 40px rgba(0,0,0,0.25)', width: 480, maxWidth: '95vw',
        maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 14px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {view !== 'list' && (
              <button onClick={() => { setView('list'); setSelectedGruppe(null); setError(null); setMemberQuery(''); setMemberResults([]) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px 4px', fontSize: 13 }}>
                ←
              </button>
            )}
            <Users size={16} style={{ color: BLUE }} />
            <span style={{ fontWeight: 700, fontSize: 15 }}>
              {view === 'list' && 'Team-Work'}
              {view === 'new' && 'Neue Gruppe'}
              {view === 'detail' && selectedGruppe?.name}
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4, display: 'flex' }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
          {error && (
            <div style={{ background: 'rgba(255,59,48,0.1)', border: `1px solid ${RED}`, borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 12, color: RED }}>
              {error}
            </div>
          )}

          {/* ── Liste ── */}
          {view === 'list' && (
            <>
              {/* Team vs. Colab Erklärung */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                {[
                  { color: BLUE, icon: '👁', title: 'Team-Sichtbarkeit', desc: 'Nur Mitglieder sehen die Werkstufe — kein gemeinsames Tippen' },
                  { color: PURPLE, icon: '🤝', title: 'Colab-Modus', desc: 'Mitglieder sehen und bearbeiten gemeinsam in Echtzeit (Yjs)' },
                ].map(c => (
                  <div key={c.title} style={{ background: c.color + '10', border: `1px solid ${c.color}33`, borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 13, marginBottom: 3 }}>{c.icon} <strong style={{ color: c.color }}>{c.title}</strong></div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{c.desc}</div>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
                Dieselbe Gruppe kann als Team- <em>oder</em> Colab-Sichtbarkeit verwendet werden — du wählst das im Sichtbarkeits-Menü der Werkstufe.
              </p>

              {loading ? (
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', padding: 24 }}>Lädt…</div>
              ) : gruppen.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', padding: 24 }}>
                  Noch keine Gruppen. Erstelle deine erste Gruppe.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                  {gruppen.map(g => (
                    <div key={g.id}
                      style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-subtle)', borderRadius: 10, padding: '12px 14px', cursor: 'pointer', border: '1px solid var(--border)', gap: 10 }}
                      onClick={() => { setSelectedGruppe(g); setView('detail') }}
                    >
                      <Users size={14} style={{ color: BLUE, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{g.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                          {(g.mitglieder?.length ?? 0)} Mitglied{(g.mitglieder?.length ?? 0) !== 1 ? 'er' : ''}
                          {g.beschreibung && ` · ${g.beschreibung}`}
                        </div>
                      </div>
                      <ChevronRight size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={() => { setView('new'); setError(null) }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '10px 16px', borderRadius: 10,
                  border: `1px dashed ${BLUE}`, background: BLUE + '08',
                  color: BLUE, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                <Plus size={14} />
                Neue Gruppe erstellen
              </button>
            </>
          )}

          {/* ── Neue Gruppe ── */}
          {view === 'new' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Name *</label>
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="z.B. Autoren-Team A"
                  autoFocus
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-subtle)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }}
                  onKeyDown={e => { if (e.key === 'Enter') createGruppe() }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Beschreibung (optional)</label>
                <input
                  value={newBeschreibung}
                  onChange={e => setNewBeschreibung(e.target.value)}
                  placeholder="Wofür ist diese Gruppe?"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-subtle)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
              <button
                onClick={createGruppe}
                disabled={!newName.trim() || saving}
                style={{
                  padding: '10px 20px', borderRadius: 9,
                  background: newName.trim() ? BLUE : 'var(--bg-subtle)',
                  color: newName.trim() ? '#fff' : 'var(--text-muted)',
                  border: 'none', cursor: newName.trim() ? 'pointer' : 'default',
                  fontWeight: 600, fontSize: 13, alignSelf: 'flex-end',
                }}
              >
                {saving ? 'Erstelle…' : 'Gruppe erstellen'}
              </button>
            </div>
          )}

          {/* ── Detail ── */}
          {view === 'detail' && selectedGruppe && (
            <>
              {selectedGruppe.beschreibung && (
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>{selectedGruppe.beschreibung}</p>
              )}

              {/* Self-join */}
              {currentUserId && !isMember && (
                <button
                  onClick={addSelf}
                  disabled={saving}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: '9px 14px', borderRadius: 9,
                    border: `1px solid ${BLUE}`, background: BLUE + '10',
                    color: BLUE, fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: 16,
                  }}
                >
                  <UserPlus size={14} />
                  Mir selbst beitreten
                </button>
              )}
              {currentUserId && isMember && (
                <div style={{ fontSize: 12, color: GREEN, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <UserPlus size={13} /> Du bist Mitglied dieser Gruppe
                </div>
              )}

              {/* Mitglieder */}
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                Mitglieder ({selectedGruppe.mitglieder?.length ?? 0})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                {(selectedGruppe.mitglieder ?? []).length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>Noch keine Mitglieder</div>
                )}
                {(selectedGruppe.mitglieder ?? []).map(m => (
                  <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: BLUE, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                      {m.user_name.slice(0, 2).toUpperCase()}
                    </div>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{m.user_name}</span>
                    {m.user_id === currentUserId && <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-subtle)', padding: '2px 6px', borderRadius: 4 }}>Du</span>}
                    <button
                      onClick={() => removeMember(m.user_id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'flex', borderRadius: 4 }}
                      title="Mitglied entfernen"
                    >
                      <UserMinus size={13} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Person suchen & hinzufügen */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  Person hinzufügen
                </div>
                <div style={{ position: 'relative' }}>
                  <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                  <input
                    value={memberQuery}
                    onChange={e => setMemberQuery(e.target.value)}
                    placeholder="Name oder E-Mail suchen…"
                    style={{ width: '100%', padding: '8px 11px 8px 30px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-subtle)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }}
                  />
                </div>
                {memberSearching && <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '6px 0' }}>Suche…</div>}
                {memberResults.length > 0 && (
                  <div style={{ marginTop: 6, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'var(--bg-surface)' }}>
                    {memberResults.map(u => (
                      <button
                        key={u.user_id}
                        onClick={() => addMember(u)}
                        disabled={saving}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                          padding: '9px 12px', border: 'none', borderBottom: '1px solid var(--border)',
                          background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                        }}
                      >
                        <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#007AFF22', color: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                          {u.user_name.slice(0, 2).toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{u.user_name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
                        </div>
                        <UserPlus size={13} style={{ color: BLUE, flexShrink: 0 }} />
                      </button>
                    ))}
                  </div>
                )}
                {!memberSearching && memberQuery.trim() && memberResults.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '6px 0' }}>Keine Person gefunden.</div>
                )}
              </div>

              {/* Gruppe löschen */}
              {selectedGruppe.erstellt_von === currentUserId && (
                <button
                  onClick={() => deleteGruppe(selectedGruppe.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: RED, fontSize: 12, cursor: 'pointer' }}
                >
                  <Trash2 size={13} />
                  Gruppe löschen
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
