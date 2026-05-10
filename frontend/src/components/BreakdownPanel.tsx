import { useState, useEffect, useRef } from 'react'
import { Plus, X, Search, Users } from 'lucide-react'
import { api } from '../api/client'
import { useTerminologie } from '../sw-ui'

interface BreakdownPanelProps {
  szeneId?: number | string | null
  produktionId?: string | null
  sceneIdentityId?: string | null
}

export default function BreakdownPanel({ szeneId, produktionId, sceneIdentityId }: BreakdownPanelProps) {
  const { t } = useTerminologie()
  const [sceneChars, setSceneChars] = useState<any[]>([])
  const [allChars, setAllChars] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!szeneId) { setSceneChars([]); return }
    setLoading(true)
    const load = sceneIdentityId
      ? api.getSceneIdentityCharacters(sceneIdentityId)
      : typeof szeneId === 'number'
        ? api.getSceneCharacters(szeneId)
        : Promise.resolve([])
    load
      .then(setSceneChars)
      .catch(() => setSceneChars([]))
      .finally(() => setLoading(false))
  }, [szeneId, sceneIdentityId])

  useEffect(() => {
    if (!produktionId) { setAllChars([]); return }
    api.getCharacters(produktionId).then(setAllChars).catch(() => setAllChars([]))
  }, [produktionId])

  useEffect(() => {
    if (searchOpen) setTimeout(() => searchRef.current?.focus(), 50)
  }, [searchOpen])

  const sceneCharIds = new Set(sceneChars.map(c => c.character_id))

  const filtered = query.trim()
    ? allChars.filter(c => c.name.toLowerCase().includes(query.toLowerCase()) && !sceneCharIds.has(c.id))
    : allChars.filter(c => !sceneCharIds.has(c.id)).slice(0, 8)

  const handleAdd = async (char: any) => {
    if (!szeneId) return
    try {
      const sc = sceneIdentityId
        ? await api.addSceneIdentityCharacter(sceneIdentityId, { character_id: char.id })
        : typeof szeneId === 'number'
          ? await api.addSceneCharacter(szeneId, { character_id: char.id })
          : null
      if (!sc) return
      setSceneChars(prev => [...prev, { ...sc, name: char.name, kategorie_name: char.kategorie_name, kategorie_typ: char.kategorie_typ }])
      setQuery('')
      setSearchOpen(false)
    } catch {}
  }

  const handleCreateAndAdd = async () => {
    if (!szeneId || !produktionId || !query.trim()) return
    setCreating(true)
    try {
      const char = await api.createCharacter({ name: query.trim(), produktion_id: produktionId })
      const sc = sceneIdentityId
        ? await api.addSceneIdentityCharacter(sceneIdentityId, { character_id: char.id })
        : typeof szeneId === 'number'
          ? await api.addSceneCharacter(szeneId, { character_id: char.id })
          : null
      if (!sc) return
      setSceneChars(prev => [...prev, { ...sc, name: char.name }])
      setAllChars(prev => [...prev, char])
      setQuery('')
      setSearchOpen(false)
    } catch {} finally {
      setCreating(false)
    }
  }

  const handleRemove = async (characterId: string) => {
    if (!szeneId) return
    try {
      if (sceneIdentityId) {
        await api.removeSceneIdentityCharacter(sceneIdentityId, characterId)
      } else if (typeof szeneId === 'number') {
        await api.removeSceneCharacter(szeneId, characterId)
      } else return
      setSceneChars(prev => prev.filter(c => c.character_id !== characterId))
    } catch {}
  }

  // Group by typ
  const rollen = sceneChars.filter(c => c.kategorie_typ !== 'komparse')
  const komparsen = sceneChars.filter(c => c.kategorie_typ === 'komparse')

  return (
    <div className="breakdown">
      <div className="bd-head">
        <Users size={12} />
        <span className="title">Besetzung</span>
        <span className="spacer" />
        {szeneId && (
          <button
            className="btn ghost"
            style={{ padding: '2px 6px', fontSize: 11 }}
            onClick={() => setSearchOpen(v => !v)}
            title="Charakter hinzufügen"
          >
            <Plus size={11} />
          </button>
        )}
      </div>

      {/* Search / add */}
      {searchOpen && (
        <div className="bd-search">
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
            <Search size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <input
              ref={searchRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Escape' && setSearchOpen(false)}
              placeholder="Name suchen…"
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 12, color: 'var(--text-primary)' }}
            />
          </div>
          <div className="bd-suggestions">
            {filtered.map(c => (
              <button key={c.id} className="bd-sug-item" onClick={() => handleAdd(c)}>
                <span style={{ flex: 1 }}>{c.name}</span>
                {c.kategorie_name && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{c.kategorie_name}</span>}
              </button>
            ))}
            {query.trim() && !allChars.some(c => c.name.toLowerCase() === query.toLowerCase()) && (
              <button className="bd-sug-item bd-sug-new" onClick={handleCreateAndAdd} disabled={creating}>
                <Plus size={10} />
                <span>„{query}" anlegen</span>
              </button>
            )}
            {!query.trim() && filtered.length === 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '4px 0' }}>Alle hinzugefügt</div>
            )}
          </div>
        </div>
      )}

      {/* Character list */}
      <div className="bd-list">
        {!szeneId ? (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 0' }}>Keine Szene gewählt</div>
        ) : loading ? (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 0' }}>Lädt…</div>
        ) : sceneChars.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 0' }}>Noch keine Besetzung</div>
        ) : (
          <>
            {rollen.length > 0 && (
              <>
                <div className="bd-group-label">Rollen</div>
                {rollen.map(c => (
                  <div className="bd-char-row" key={c.character_id}>
                    <span className="bd-char-name">{c.name}</span>
                    {c.kategorie_name && <span className="bd-char-kat">{c.kategorie_name}</span>}
                    <button className="bd-remove" onClick={() => handleRemove(c.character_id)} title="Entfernen">
                      <X size={9} />
                    </button>
                  </div>
                ))}
              </>
            )}
            {komparsen.length > 0 && (
              <>
                <div className="bd-group-label">{t('komparse', 'p')}</div>
                {komparsen.map(c => (
                  <div className="bd-char-row" key={c.character_id}>
                    <span className="bd-char-name">{c.name}</span>
                    {c.anzahl > 1 && <span className="bd-char-kat">×{c.anzahl}</span>}
                    <button className="bd-remove" onClick={() => handleRemove(c.character_id)} title="Entfernen">
                      <X size={9} />
                    </button>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
