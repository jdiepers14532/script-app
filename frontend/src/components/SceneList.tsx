import { useState, useEffect, useRef } from 'react'
import { Lock, Search, Plus, MoreHorizontal, MoreVertical, Info, MessageCircle, CheckSquare, Square } from 'lucide-react'
import { ENV_COLORS, ENV_COLORS_DARK } from '../data/scenes'
import { api } from '../api/client'
import { useAppSettings, useTweaks } from '../contexts'
import { useTerminologie } from '../sw-ui'
import Tooltip from './Tooltip'
import PlatzhalterSzenenDialog from './PlatzhalterSzenenDialog'
import ExportDialog from './ExportDialog'

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
  onOpenStatistik?: () => void
  onOpenRadar?: () => void
  onOpenSearch?: () => void
  onOpenStrangPanel?: () => void
  onOpenStoppzeiten?: () => void
  werkstufId?: string | null
  allCharacters?: any[]
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
  onOpenStatistik,
  onOpenRadar,
  onOpenSearch,
  onOpenStrangPanel,
  onOpenStoppzeiten,
  werkstufId,
  allCharacters,
}: SceneListProps) {
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
  const { sceneKuerzel } = useAppSettings()
  const { tweaks } = useTweaks()
  const { t } = useTerminologie()
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
  const [farbModus, setFarbModus] = useState<'licht' | 'strang' | 'aus'>('licht')
  const [platzhalterOpen, setPlatzhalterOpen] = useState(false)
  const [multiSelectMode, setMultiSelectMode] = useState(false)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkStrangDropdown, setBulkStrangDropdown] = useState(false)
  const [straenge, setStraenge] = useState<any[]>([])
  const [werkstufeStraenge, setWerkstufeStraenge] = useState<Record<string, any[]>>({})
  const [stimmungWarnings, setStimmungWarnings] = useState<Record<string, string>>({})
  const effectiveColorMode = farbModus === 'aus' || colorOff ? 'off' as const : colorMode
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

  // Load strang data for color stripes
  useEffect(() => {
    if (!produktionId) return
    api.getStraenge(produktionId).then(setStraenge).catch(() => {})
  }, [produktionId])

  useEffect(() => {
    if (!werkstufId || farbModus !== 'strang') { setWerkstufeStraenge({}); return }
    api.getWerkstufeStraenge(werkstufId).then(setWerkstufeStraenge).catch(() => {})
  }, [werkstufId, farbModus])

  // Load stimmung warnings if any stockshot scenes exist
  useEffect(() => {
    if (!werkstufId) { setStimmungWarnings({}); return }
    const hasStockshot = szenen.some(s => s.sondertyp === 'stockshot' && s.stockshot_kategorie === 'stimmungswechsel')
    if (!hasStockshot) { setStimmungWarnings({}); return }
    api.getStimmungCheck(werkstufId).then(res => {
      const map: Record<string, string> = {}
      res.warnings.forEach(w => { map[w.scene_id] = w.message })
      setStimmungWarnings(map)
    }).catch(() => setStimmungWarnings({}))
  }, [werkstufId, szenen])

  const handleBulkAssign = async (strangId: string) => {
    if (selectedIds.size === 0) return
    try {
      await api.bulkAddSzeneStrang(Array.from(selectedIds), strangId)
      setMultiSelectMode(false)
      setSelectedIds(new Set())
      setBulkStrangDropdown(false)
      if (werkstufId) api.getWerkstufeStraenge(werkstufId).then(setWerkstufeStraenge).catch(() => {})
    } catch (e) { console.error(e) }
  }

  const handleBulkRemove = async (strangId: string) => {
    if (selectedIds.size === 0) return
    try {
      await api.bulkRemoveSzeneStrang(Array.from(selectedIds), strangId)
      setMultiSelectMode(false)
      setSelectedIds(new Set())
      if (werkstufId) api.getWerkstufeStraenge(werkstufId).then(setWerkstufeStraenge).catch(() => {})
    } catch (e) { console.error(e) }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const sorted = [...szenen].sort((a, b) => {
    const so = (a.sort_order ?? 0) - (b.sort_order ?? 0)
    if (so !== 0) return so
    const sn = (a.scene_nummer ?? 0) - (b.scene_nummer ?? 0)
    if (sn !== 0) return sn
    return (a.scene_nummer_suffix ?? '').localeCompare(b.scene_nummer_suffix ?? '')
  })

  const filtered = sorted.filter(s => {
    if (nurSzenen && s.format === 'notiz') return false
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
        alert(`${t('szene', 'p')} sind geloggt. Positionen wurden in ${t('szene', 'c')}info vermerkt.`)
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
          placeholder={`${t('szene')} suchen…`}
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
            <div className="scene-ctx-menu" style={{ right: 0, left: 'auto', top: '100%', minWidth: 180 }}>
              {/* Farbe submenu */}
              <div style={{ padding: '4px 10px', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Farbe</div>
              {([['licht', 'Lichtstimmung'], ['strang', 'Strang'], ['aus', 'Aus']] as const).map(([val, label]) => (
                <button key={val} className="scene-ctx-item" onClick={() => { setFarbModus(val); setColorOff(val === 'aus'); setHeaderMenuOpen(false) }}>
                  <span style={{ display: 'inline-block', width: 14, textAlign: 'center', marginRight: 4 }}>{farbModus === val ? '\u2022' : ''}</span>{label}
                </button>
              ))}
              <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
              <button
                className="scene-ctx-item"
                onClick={() => { setNurSzenen(v => !v); setHeaderMenuOpen(false) }}
              >
                {nurSzenen ? 'Alles anzeigen' : `Nur ${t('szene', 'p')}`}
              </button>
              <button
                className="scene-ctx-item"
                onClick={() => { setMultiSelectMode(v => !v); setSelectedIds(new Set()); setHeaderMenuOpen(false) }}
              >
                {multiSelectMode ? 'Auswahl beenden' : 'Mehrere ausw\u00e4hlen'}
              </button>
              <button
                className="scene-ctx-item"
                onClick={handleRenumber}
                disabled={renumbering}
              >
                {renumbering ? 'L\u00e4dt\u2026' : 'Neu nummerieren'}
              </button>
              <button
                className="scene-ctx-item"
                onClick={handleSaveTemplate}
              >
                Als Template speichern
              </button>
              <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
              <button
                className="scene-ctx-item"
                onClick={() => { onOpenStrangPanel?.(); setHeaderMenuOpen(false) }}
              >
                Str\u00e4nge verwalten
              </button>
              <button
                className="scene-ctx-item"
                onClick={() => { setPlatzhalterOpen(true); setHeaderMenuOpen(false) }}
                disabled={!werkstufId}
              >
                Platzhalter-{t('szene', 'p')} anlegen
              </button>
              {onOpenSearch && (
                <button
                  className="scene-ctx-item"
                  style={{ display: 'flex', alignItems: 'center' }}
                  onClick={() => { onOpenSearch(); setHeaderMenuOpen(false) }}
                >
                  <span style={{ flex: 1 }}>Suchen &amp; Ersetzen</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                    {isMac ? '\u2318H' : 'Ctrl+H'}
                  </span>
                </button>
              )}
              {onOpenRadar && (
                <button
                  className="scene-ctx-item"
                  onClick={() => { onOpenRadar(); setHeaderMenuOpen(false) }}
                >
                  Story-Radar
                </button>
              )}
              {onOpenStatistik && (
                <>
                  <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                  <button
                    className="scene-ctx-item"
                    onClick={() => { onOpenStatistik(); setHeaderMenuOpen(false) }}
                  >
                    Statistiken
                  </button>
                </>
              )}
              {onOpenStoppzeiten && (
                <button
                  className="scene-ctx-item"
                  disabled={!werkstufId}
                  onClick={() => { onOpenStoppzeiten(); setHeaderMenuOpen(false) }}
                >
                  Stoppzeiten-Übersicht
                </button>
              )}
              <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
              <button
                className="scene-ctx-item"
                disabled={!werkstufId}
                onClick={() => { setExportDialogOpen(true); setHeaderMenuOpen(false) }}
              >
                Exportieren\u2026
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
                ? `Für ${t('episode')} ${folgeNummer} sind noch keine ${t('szene', 'p')} importiert.`
                : `Keine ${t('szene', 'p')} vorhanden.`)
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
              {multiSelectMode && (
                <div className="sl-checkbox" onClick={e => { e.stopPropagation(); toggleSelect(String(scene.id)) }} style={{ display: 'flex', alignItems: 'center', paddingLeft: 6, cursor: 'pointer' }}>
                  {selectedIds.has(String(scene.id)) ? <CheckSquare size={14} style={{ color: 'var(--sw-green)' }} /> : <Square size={14} style={{ color: 'var(--text-muted)' }} />}
                </div>
              )}
              {farbModus === 'strang' && werkstufeStraenge[scene.id] && werkstufeStraenge[scene.id].length > 0 && (
                <div className="strang-stripes">
                  {straenge.filter(st => st.status === 'aktiv').map((st, idx) => {
                    const assigned = werkstufeStraenge[scene.id]?.some((a: any) => a.strang_id === st.id)
                    return <div key={st.id} className="strang-stripe" style={{ background: assigned ? st.farbe : 'transparent', left: 4 + idx * 4 }} />
                  })}
                </div>
              )}
              {farbModus !== 'strang' && scene.id !== selectedSzeneId && (effectiveColorMode === 'subtle' || effectiveColorMode === 'full') && (
                <div className="env-stripe" style={{ background: envColor.stripe }} />
              )}
              <div className="num">{scene.format !== 'notiz' ? sceneLabel : '·'}</div>
              <div className="sl-sondertyp-col">
                {scene.sondertyp && (
                  <span style={{
                    fontSize: 10, lineHeight: 1,
                    color: scene.sondertyp === 'wechselschnitt' ? '#007AFF' : scene.sondertyp === 'stockshot' ? '#FF9500' : '#AF52DE',
                  }} title={scene.sondertyp === 'wechselschnitt' ? 'Wechselschnitt' : scene.sondertyp === 'stockshot' ? 'Stockshot' : 'Flashback'}>
                    {scene.sondertyp === 'wechselschnitt' ? '⇄' : scene.sondertyp === 'stockshot' ? '📷' : '⏪'}
                  </span>
                )}
              </div>
              <div className="body">
                <div className="sl-line">
                  <span className="sl-set">{scene.format !== 'notiz' ? (scene.ort_name || scene.zusammenfassung || '') : (scene.zusammenfassung || scene.element_type || 'Notiz')}</span>
                </div>
              </div>
              <div className="meta">
                {scene.format !== 'notiz' ? (<>
                  <span className="sl-ie">{sceneKuerzel[(scene.int_ext ?? 'INT').toLowerCase()] ?? scene.int_ext}</span>
                  <span className="sl-sep">/</span>
                  <span className="sl-tz">{{ tag: 'T', nacht: 'N', abend: 'A', morgen: 'M' }[(scene.tageszeit ?? 'TAG').toLowerCase()] ?? scene.tageszeit}</span>
                </>) : (
                  <span className="sl-fmt">N</span>
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
                <div className="badges">
                  {unreadCount > 0 && (
                    <div className="comment-bubble" title={`${unreadCount} ungelesene Kommentare`}>
                      <MessageCircle size={11} />
                      <span>{unreadCount > 99 ? '99+' : unreadCount}</span>
                    </div>
                  )}
                  {stimmungWarnings[scene.id] && (
                    <Tooltip text={stimmungWarnings[scene.id]}>
                      <span style={{ color: '#FF9500', fontSize: 11, cursor: 'default' }}>⚠</span>
                    </Tooltip>
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

      {/* Bulk assign toolbar */}
      {multiSelectMode && selectedIds.size > 0 && (
        <div className="bulk-toolbar" style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <span style={{ fontWeight: 600 }}>{selectedIds.size} {t('szene', selectedIds.size > 1 ? 'p' : 's')}</span>
          <div style={{ position: 'relative' }}>
            <button className="btn-sm btn-primary" onClick={() => setBulkStrangDropdown(v => !v)}>Strang zuweisen</button>
            {bulkStrangDropdown && (
              <div className="scene-ctx-menu" style={{ bottom: '100%', left: 0, minWidth: 160 }}>
                {straenge.filter(s => s.status === 'aktiv').map(s => (
                  <button key={s.id} className="scene-ctx-item" onClick={() => handleBulkAssign(s.id)}>
                    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: s.farbe, marginRight: 6 }} />
                    {s.name}
                  </button>
                ))}
                <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                {straenge.filter(s => s.status === 'aktiv').map(s => (
                  <button key={`rm-${s.id}`} className="scene-ctx-item danger" onClick={() => handleBulkRemove(s.id)}>
                    Entfernen: {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="btn-sm" onClick={() => { setMultiSelectMode(false); setSelectedIds(new Set()); setBulkStrangDropdown(false) }}>Abbrechen</button>
        </div>
      )}

      {/* Modals */}
      {produktionId && werkstufId && (
        <PlatzhalterSzenenDialog
          werkstufId={werkstufId}
          produktionId={produktionId}
          open={platzhalterOpen}
          onClose={() => setPlatzhalterOpen(false)}
          onCreated={() => {
            if (stageId) api.getWerkstufenSzenen(String(stageId)).then(s => onSzenesReordered?.(s)).catch(() => {})
          }}
        />
      )}
      {exportDialogOpen && werkstufId && (
        <ExportDialog
          werkstufId={werkstufId}
          onClose={() => setExportDialogOpen(false)}
          showLineNumbers={tweaks.showLineNumbers}
          lineNumberMarginCm={tweaks.lineNumberMarginCm}
        />
      )}
    </div>
  )
}
