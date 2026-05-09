import { useState, useEffect, useRef } from 'react'
import { Lock, Search, Plus, MoreHorizontal, MoreVertical, Info, MessageCircle } from 'lucide-react'
import { ENV_COLORS, ENV_COLORS_DARK } from '../data/scenes'
import { api } from '../api/client'
import { useAppSettings, useTweaks } from '../contexts'
import Tooltip from './Tooltip'

interface SceneListProps {
  szenen: any[]
  selectedSzeneId: number | string | null
  onSelectSzene: (id: number | string) => void
  produktionId: string | null
  folgeNummer: number | null
  stageId: number | null
  colorMode?: 'full' | 'subtle' | 'off'
  onSzeneCreated?: (szene: any) => void
  onSzeneDeleted?: (id: number | string) => void
  onSzenesReordered?: (scenes: any[]) => void
  commentCounts?: Record<number, number>
}

export default function SceneList({
  szenen,
  selectedSzeneId,
  onSelectSzene,
  produktionId,
  folgeNummer,
  stageId,
  colorMode = 'full',
  onSzeneCreated,
  onSzeneDeleted,
  onSzenesReordered,
  commentCounts,
}: SceneListProps) {
  const { sceneKuerzel } = useAppSettings()
  const { tweaks } = useTweaks()
  const isDarkTheme = tweaks.theme === 'dark'
  const [searchQuery, setSearchQuery] = useState('')
  const [lock, setLock] = useState<any | null>(null)
  const [creating, setCreating] = useState(false)
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<number | string | null>(null)
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false)
  const [renumbering, setRenumbering] = useState(false)
  const [nurSzenen, setNurSzenen] = useState(true)
  const [colorOff, setColorOff] = useState(false)
  const effectiveColorMode = colorOff ? 'off' as const : colorMode
  const menuRef = useRef<HTMLDivElement | null>(null)
  const headerMenuRef = useRef<HTMLDivElement | null>(null)

  // Drag & drop state
  const [dragId, setDragId] = useState<number | string | null>(null)
  const [dragOverId, setDragOverId] = useState<number | string | null>(null)

  useEffect(() => {
    if (!produktionId || folgeNummer == null) { setLock(null); return }
    api.getLock(produktionId, folgeNummer)
      .then(setLock)
      .catch(() => setLock(null))
  }, [produktionId, folgeNummer])

  const sorted = [...szenen].sort((a, b) => {
    const so = (a.sort_order ?? 0) - (b.sort_order ?? 0)
    if (so !== 0) return so
    const sn = (a.scene_nummer ?? 0) - (b.scene_nummer ?? 0)
    if (sn !== 0) return sn
    return (a.scene_nummer_suffix ?? '').localeCompare(b.scene_nummer_suffix ?? '')
  })

  const filtered = sorted.filter(s => {
    if (nurSzenen && s.format && s.format !== 'drehbuch') return false
    if (searchQuery === '') return true
    return `${s.scene_nummer}${s.scene_nummer_suffix || ''}`.includes(searchQuery) ||
      (s.ort_name ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.zusammenfassung ?? '').toLowerCase().includes(searchQuery.toLowerCase())
  })

  // Close scene context menu on outside click
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

  // Close header menu on outside click
  useEffect(() => {
    if (!headerMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) {
        setHeaderMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [headerMenuOpen])

  const handleDelete = async (e: React.MouseEvent, szeneId: number | string) => {
    e.stopPropagation()
    setMenuOpenId(null)
    setDeleting(szeneId)
    try {
      await api.deleteDokumentSzene(String(szeneId))
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
      const newSzene = await api.createWerkstufeSzene(String(stageId), {
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

  const handleInsertAfter = async (e: React.MouseEvent, afterSzeneId: number | string) => {
    e.stopPropagation()
    setMenuOpenId(null)
    if (!stageId || creating) return
    setCreating(true)
    try {
      await api.createWerkstufeSzene(String(stageId), {
        int_ext: 'INT',
        tageszeit: 'TAG',
        ort_name: 'NEUE SZENE',
        after_scene_id: afterSzeneId,
      })
      // Re-fetch all scenes to get correct sort_order + suffix
      const updated = await api.getWerkstufenSzenen(String(stageId))
      onSzenesReordered?.(updated)
      // Select the newly created scene (last inserted at afterSzeneId position)
      if (updated.length > 0) {
        const inserted = updated.find((s: any) => !szenen.some(old => old.id === s.id))
        if (inserted) onSelectSzene(inserted.id)
      }
    } catch (e) {
      console.error('Fehler beim Einfügen der Szene', e)
    } finally {
      setCreating(false)
    }
  }

  const handleSaveTemplate = async () => {
    if (!stageId || !produktionId) return
    setHeaderMenuOpen(false)
    const name = prompt('Template-Name:')
    if (!name?.trim()) return
    try {
      await api.createDokumentVorlage(produktionId, { name: name.trim(), werkstufe_id: String(stageId) })
      alert('Template gespeichert.')
    } catch (err: any) {
      alert('Fehler: ' + err.message)
    }
  }

  const handleRenumber = async () => {
    if (!stageId || renumbering) return
    setHeaderMenuOpen(false)
    setRenumbering(true)
    try {
      const result = await api.renumberWerkstufeSzenen(String(stageId))
      onSzenesReordered?.(result.scenes)
      if (!result.renumbered) {
        alert('Szenen sind geloggt. Positionen wurden in Szeneninfo vermerkt.')
      }
    } catch (e: any) {
      alert('Fehler beim Neu-Nummerieren: ' + e.message)
    } finally {
      setRenumbering(false)
    }
  }

  // Drag & drop handlers
  const handleDragStart = (e: React.DragEvent, sceneId: number) => {
    e.dataTransfer.effectAllowed = 'move'
    setDragId(sceneId)
  }

  const handleDragOver = (e: React.DragEvent, sceneId: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverId(sceneId)
  }

  const handleDrop = async (e: React.DragEvent, targetId: number) => {
    e.preventDefault()
    if (!dragId || dragId === targetId || !stageId) {
      setDragId(null)
      setDragOverId(null)
      return
    }

    // Build new order: move dragId to position of targetId
    const ids = sorted.map(s => s.id)
    const fromIdx = ids.indexOf(dragId)
    const toIdx = ids.indexOf(targetId)
    if (fromIdx === -1 || toIdx === -1) { setDragId(null); setDragOverId(null); return }

    ids.splice(fromIdx, 1)
    ids.splice(toIdx, 0, dragId)

    // Optimistic update
    const newOrder = ids.map(id => szenen.find(s => s.id === id)!).filter(Boolean)
    newOrder.forEach((s, i) => { s.sort_order = i + 1 })
    onSzenesReordered?.([...newOrder])

    setDragId(null)
    setDragOverId(null)

    try {
      const updated = await api.reorderWerkstufeSzenen(String(stageId), ids)
      onSzenesReordered?.(updated)
    } catch (e) {
      console.error('Fehler beim Sortieren', e)
    }
  }

  const handleDragEnd = () => {
    setDragId(null)
    setDragOverId(null)
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

  const isDragActive = searchQuery === '' // drag only when not filtering

  return (
    <div className="scenes" data-colormode={effectiveColorMode}>
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

        {/* Header context menu */}
        <div style={{ position: 'relative', flexShrink: 0 }} ref={headerMenuRef}>
          <button
            className={`iconbtn${headerMenuOpen ? ' active' : ''}`}
            title="Aktionen"
            onClick={() => setHeaderMenuOpen(v => !v)}
            disabled={!stageId}
          >
            <MoreVertical size={13} />
          </button>
          {headerMenuOpen && (
            <div className="scene-ctx-menu" style={{ right: 0, left: 'auto', top: '100%', minWidth: 160 }}>
              <button
                className="scene-ctx-item"
                onClick={() => { setColorOff(v => !v); setHeaderMenuOpen(false) }}
              >
                {colorOff ? 'Einfärbung einblenden' : 'Einfärbung ausblenden'}
              </button>
              <button
                className="scene-ctx-item"
                onClick={() => { setNurSzenen(v => !v); setHeaderMenuOpen(false) }}
              >
                {nurSzenen ? 'Alles anzeigen' : 'Nur Szenen'}
              </button>
              <button
                className="scene-ctx-item"
                onClick={handleRenumber}
                disabled={renumbering}
              >
                {renumbering ? 'Lädt…' : 'Neu nummerieren'}
              </button>
              <button
                className="scene-ctx-item"
                onClick={handleSaveTemplate}
              >
                Als Template speichern
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Scene rows */}
      <div className="list">
        {filtered.length === 0 && (
          <div style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: 12 }}>
            {szenen.length === 0
              ? (folgeNummer != null
                ? `Für Folge ${folgeNummer} sind noch keine Szenen importiert.`
                : 'Keine Szenen vorhanden.')
              : 'Keine Treffer.'}
          </div>
        )}
        {filtered.map(scene => {
          const envKey = getEnvKey(scene)
          const envColor = (isDarkTheme ? ENV_COLORS_DARK : ENV_COLORS)[envKey]
          const isDark = !!envColor.textDark
          const rowStyle = {} as Record<string, string>
          if (effectiveColorMode === 'full') rowStyle['--row-bg'] = envColor.bg
          if (effectiveColorMode === 'subtle' || effectiveColorMode === 'full') rowStyle['--stripe'] = envColor.stripe

          const isMenuOpen = menuOpenId === scene.id
          const isDeleting = deleting === scene.id
          const isDragging = dragId === scene.id
          const isDragOver = dragOverId === scene.id && dragId !== scene.id

          const sceneLabel = `${scene.scene_nummer}${scene.scene_nummer_suffix || ''}`

          const unreadCount = commentCounts?.[scene.id] ?? 0

          return (
            <div
              key={scene.id}
              draggable={isDragActive}
              onDragStart={isDragActive ? (e) => handleDragStart(e, scene.id) : undefined}
              onDragOver={isDragActive ? (e) => handleDragOver(e, scene.id) : undefined}
              onDrop={isDragActive ? (e) => handleDrop(e, scene.id) : undefined}
              onDragEnd={isDragActive ? handleDragEnd : undefined}
              className={[
                'row',
                scene.id === selectedSzeneId ? 'active' : '',
                effectiveColorMode === 'full' && isDark ? 'on-dark' : '',
                isDeleting ? 'deleting' : '',
                isDragging ? 'dragging' : '',
                isDragOver ? 'drag-over' : '',
              ].filter(Boolean).join(' ')}
              style={{ ...rowStyle, position: 'relative', cursor: isDragActive ? 'grab' : 'pointer' }}
              onClick={() => !isMenuOpen && onSelectSzene(scene.id)}
            >
              {scene.id !== selectedSzeneId && (effectiveColorMode === 'subtle' || effectiveColorMode === 'full') && (
                <div className="env-stripe" style={{ background: envColor.stripe }} />
              )}
              <div className="num">{scene.format === 'drehbuch' ? sceneLabel : '·'}</div>
              <div className="body">
                <div className="sl-line">
                  <span className="sl-set">{scene.ort_name || scene.zusammenfassung || ({ notiz: 'Notiz', storyline: 'Storyline' }[scene.format as string] ?? scene.format)}</span>
                </div>
              </div>
              <div className="meta">
                {scene.format === 'drehbuch' ? (<>
                  <span className="sl-ie">{sceneKuerzel[(scene.int_ext ?? 'INT').toLowerCase()] ?? scene.int_ext}</span>
                  <span className="sl-sep">/</span>
                  <span className="sl-tz">{{ tag: 'T', nacht: 'N', abend: 'A', morgen: 'M' }[(scene.tageszeit ?? 'TAG').toLowerCase()] ?? scene.tageszeit}</span>
                </>) : (
                  <span className="sl-fmt">{{ notiz: 'N', storyline: 'SL' }[scene.format as string] ?? '?'}</span>
                )}
              </div>
              <div className="sl-info">
                {scene.szeneninfo && (
                  <Tooltip text={scene.szeneninfo}>
                    <Info size={11} style={{ color: 'var(--text-muted)', display: 'block' }} />
                  </Tooltip>
                )}
              </div>
              <div className="rt">
                {scene.dauer_min && <span>{scene.dauer_min} min</span>}
                <div className="badges">
                  {unreadCount > 0 && (
                    <div className="comment-bubble" title={`${unreadCount} ungelesene Kommentare`}>
                      <MessageCircle size={11} />
                      <span>{unreadCount > 99 ? '99+' : unreadCount}</span>
                    </div>
                  )}
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
                        className="scene-ctx-item"
                        onClick={e => handleInsertAfter(e, scene.id)}
                        disabled={creating}
                      >
                        Einfügen darunter
                      </button>
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
