import { useState, useEffect, useRef } from 'react'
import { Lock, Search, Plus, MoreHorizontal } from 'lucide-react'
import { ENV_COLORS } from '../data/scenes'
import { api } from '../api/client'

interface SceneListProps {
  szenen: any[]
  selectedSzeneId: number | null
  onSelectSzene: (id: number) => void
  staffelId: string | null
  folgeNummer: number | null
  stageId: number | null
  colorMode?: 'full' | 'subtle' | 'off'
  onSzeneCreated?: (szene: any) => void
  onSzeneDeleted?: (id: number) => void
}

export default function SceneList({
  szenen,
  selectedSzeneId,
  onSelectSzene,
  staffelId,
  folgeNummer,
  stageId,
  colorMode = 'subtle',
  onSzeneCreated,
  onSzeneDeleted,
}: SceneListProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [lock, setLock] = useState<any | null>(null)
  const [creating, setCreating] = useState(false)
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<number | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!staffelId || folgeNummer == null) { setLock(null); return }
    api.getLock(staffelId, folgeNummer)
      .then(setLock)
      .catch(() => setLock(null))
  }, [staffelId, folgeNummer])

  const filtered = szenen
    .filter(s =>
      searchQuery === '' ||
      String(s.scene_nummer).includes(searchQuery) ||
      (s.ort_name ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.zusammenfassung ?? '').toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => (a.scene_nummer ?? 0) - (b.scene_nummer ?? 0))

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpenId) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpenId])

  const handleDelete = async (e: React.MouseEvent, szeneId: number) => {
    e.stopPropagation()
    setMenuOpenId(null)
    setDeleting(szeneId)
    try {
      await api.deleteSzene(szeneId)
      onSzeneDeleted?.(szeneId)
    } catch (err: any) {
      alert('Fehler beim Löschen: ' + err.message)
    } finally {
      setDeleting(null)
    }
  }

  const handleNewSzene = async () => {
    if (!stageId || creating) return
    setCreating(true)
    try {
      const nextNum = szenen.length > 0 ? Math.max(...szenen.map(s => s.scene_nummer ?? 0)) + 1 : 1
      const newSzene = await api.createSzene(stageId, {
        scene_nummer: nextNum,
        int_ext: 'INT',
        tageszeit: 'TAG',
        ort_name: 'NEUE SZENE',
      })
      onSzeneCreated?.(newSzene)
    } catch (e) {
      console.error('Fehler beim Erstellen der Szene', e)
    } finally {
      setCreating(false)
    }
  }

  const getEnvKey = (s: any): keyof typeof ENV_COLORS => {
    const ie = (s.int_ext ?? '').toLowerCase()
    const tz = (s.tageszeit ?? 'TAG').toUpperCase()
    if (tz === 'NACHT') {
      if (ie === 'int') return 'n_i'
      if (ie === 'ext') return 'n_e'
      return 'n_ie'
    }
    if (tz === 'ABEND') return 'evening_i'
    if (ie === 'int') return 'd_i'
    if (ie === 'ext') return 'd_e'
    return 'd_ie'
  }

  return (
    <div className="scenes" data-colormode={colorMode}>
      {/* Search bar + actions */}
      <div className="searchbar" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Search size={11} style={{
          position: 'absolute', left: 20, top: '50%',
          transform: 'translateY(-50%)',
          color: 'var(--text-muted)', pointerEvents: 'none',
        }} />
        <input
          placeholder="Szene suchen…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{ flex: 1 }}
        />
        {lock && (
          <span title={`Gelockt von ${lock.user_name || lock.user_id}`} style={{ flexShrink: 0 }}>
            <Lock size={11} style={{ color: 'var(--sw-warning)', display: 'block' }} />
          </span>
        )}
        <button className="iconbtn" title="Neue Szene" onClick={handleNewSzene} disabled={creating || !stageId} style={{ flexShrink: 0 }}>
          <Plus size={13} />
        </button>
      </div>

      {/* Scene rows */}
      <div className="list">
        {filtered.length === 0 && (
          <div style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: 12 }}>
            {szenen.length === 0 ? 'Keine Szenen vorhanden.' : 'Keine Treffer.'}
          </div>
        )}
        {filtered.map(scene => {
          const envKey = getEnvKey(scene)
          const envColor = ENV_COLORS[envKey]
          const isDark = !!envColor.textDark
          const rowStyle = {} as Record<string, string>
          if (colorMode === 'full') rowStyle['--row-bg'] = envColor.bg
          if (colorMode === 'subtle' || colorMode === 'full') rowStyle['--stripe'] = envColor.stripe

          const isMenuOpen = menuOpenId === scene.id
          const isDeleting = deleting === scene.id

          return (
            <div
              key={scene.id}
              className={`row${scene.id === selectedSzeneId ? ' active' : ''}${colorMode === 'full' && isDark ? ' on-dark' : ''}${isDeleting ? ' deleting' : ''}`}
              style={{ ...rowStyle, position: 'relative' }}
              onClick={() => !isMenuOpen && onSelectSzene(scene.id)}
            >
              {scene.id !== selectedSzeneId && (colorMode === 'subtle' || colorMode === 'full') && (
                <div className="env-stripe" style={{ background: envColor.stripe }} />
              )}
              <div className="num">{scene.scene_nummer}</div>
              <div className="body">
                <div className="title-line">
                  <span className="ie">{scene.int_ext}</span>
                  <span className="set">{scene.ort_name}</span>
                </div>
                <div className="meta">
                  <span className="env-dot" style={{ background: envColor.stripe }} />
                  <span>{scene.tageszeit}</span>
                  {scene.zusammenfassung && (
                    <>
                      <span>·</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>
                        {scene.zusammenfassung}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="rt">
                {scene.dauer_min && <span>{scene.dauer_min} min</span>}
                <div className="badges">
                  {scene.is_locked && <Lock size={11} className="lock-ico" />}
                </div>
                {/* Context menu trigger */}
                <div className="scene-ctx-wrap" ref={isMenuOpen ? menuRef : null}>
                  <button
                    className={`scene-ctx-btn${isMenuOpen ? ' open' : ''}`}
                    onClick={e => { e.stopPropagation(); setMenuOpenId(isMenuOpen ? null : scene.id) }}
                    title="Optionen"
                    disabled={isDeleting}
                  >
                    <MoreHorizontal size={13} />
                  </button>
                  {isMenuOpen && (
                    <div className="scene-ctx-menu">
                      <button
                        className="scene-ctx-item danger"
                        onClick={e => handleDelete(e, scene.id)}
                      >
                        Löschen
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
