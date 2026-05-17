import { useState, useEffect, useRef, useMemo } from 'react'
import { Lock, Search, Plus, MoreHorizontal, MoreVertical, Info, MessageCircle, CheckSquare, Square, Image, History, ChevronDown } from 'lucide-react'
import { ENV_COLORS, ENV_COLORS_DARK } from '../data/scenes'
import { api } from '../api/client'
import { useAppSettings, useTweaks, useToast } from '../contexts'
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
  const { showToast } = useToast()
  const isDarkTheme = tweaks.theme === 'dark'
  const [searchQuery, setSearchQuery] = useState('')
  const [lock, setLock] = useState<any | null>(null)
  const [creating, setCreating] = useState(false)
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<number | string | null>(null)
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false)
  const [renumbering, setRenumbering] = useState(false)
  const [notizSectionOpen, setNotizSectionOpen] = useState(false)
  const [formatPickerOpen, setFormatPickerOpen] = useState(false)
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

  const FARB_CYCLE: Array<'licht' | 'strang' | 'aus'> = ['licht', 'strang', 'aus']
  const FARB_LABELS: Record<string, string> = { licht: 'Lichtstimmung', strang: 'Strang', aus: 'Aus' }
  const nextFarbModus = FARB_CYCLE[(FARB_CYCLE.indexOf(farbModus) + 1) % FARB_CYCLE.length]

  const CategoryDivider = ({ label }: { label: string }) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '5px 10px 2px', marginTop: 2,
    }}>
      <span style={{
        fontSize: 9, fontWeight: 600, color: 'var(--text-muted)',
        textTransform: 'uppercase', letterSpacing: '0.5px', flexShrink: 0,
      }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  )
  const isTouch = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches, [])
  const pressedKeys = useRef<Set<string>>(new Set())
  const formatPickerRef = useRef<HTMLDivElement | null>(null)
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

  const matchesSearch = (s: any) => searchQuery === '' ||
    `${s.scene_nummer}${s.scene_nummer_suffix || ''}`.includes(searchQuery) ||
    (s.ort_name ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.zusammenfassung ?? '').toLowerCase().includes(searchQuery.toLowerCase())

  const filteredRegular = sorted.filter(s => s.format !== 'notiz' && matchesSearch(s))
  const filteredNotizen = sorted.filter(s => s.format === 'notiz' && matchesSearch(s))

  // Track pressed modifier keys for format shortcuts (D/S/T/N + click on +)
  useEffect(() => {
    const down = (e: KeyboardEvent) => pressedKeys.current.add(e.code)
    const up = (e: KeyboardEvent) => pressedKeys.current.delete(e.code)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  // Close format picker on outside click
  useEffect(() => {
    if (!formatPickerOpen) return
    const handler = (e: MouseEvent) => {
      if (formatPickerRef.current && !formatPickerRef.current.contains(e.target as Node)) {
        setFormatPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [formatPickerOpen])

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
      if (err.message?.includes('Not Found') || err.message?.includes('404') || err.message?.includes('nicht gefunden')) {
        // Szene existiert nicht mehr in der DB — aus State entfernen
        onSzeneDeleted?.(szeneId)
      } else {
        showToast('Fehler beim Löschen: ' + err.message, 'error')
      }
    } finally {
      setDeleting(null)
    }
  }

  const getFormatFromKeys = (fallback = 'notiz') => {
    if (pressedKeys.current.has('KeyD')) return 'drehbuch'
    if (pressedKeys.current.has('KeyS') || pressedKeys.current.has('KeyT')) return 'storyline'
    if (pressedKeys.current.has('KeyN')) return 'notiz'
    return fallback
  }

  const handleNewSzene = async (format?: string) => {
    if (!stageId || creating) return
    const fmt = format ?? getFormatFromKeys('notiz')
    setCreating(true)
    try {
      const newSzene = await api.createWerkstufeSzene(String(stageId), {
        int_ext: 'INT',
        tageszeit: 'TAG',
        format: fmt,
      })
      onSzeneCreated?.(newSzene)
    } catch (e) {
      console.error('Fehler beim Erstellen der Szene', e)
    } finally {
      setCreating(false)
    }
  }

  const handleInsertAfter = async (e: React.MouseEvent, afterSzeneId: number | string, format?: string) => {
    e.stopPropagation()
    setMenuOpenId(null)
    if (!stageId || creating) return
    const fmt = format ?? getFormatFromKeys('drehbuch')
    setCreating(true)
    try {
      await api.createWerkstufeSzene(String(stageId), {
        int_ext: 'INT',
        tageszeit: 'TAG',
        after_scene_id: afterSzeneId,
        format: fmt,
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
      showToast('Template gespeichert.', 'success')
    } catch (err: any) {
      showToast('Fehler: ' + err.message, 'error')
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
        showToast(`${t('szene', 'p')} sind geloggt. Positionen wurden in ${t('szene', 'c')}info vermerkt.`, 'info')
      }
    } catch (e: any) {
      showToast('Fehler beim Neu-Nummerieren: ' + e.message, 'error')
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
        <Tooltip text={isTouch ? 'Neue Szene' : 'Neue Szene\nD=Drehbuch · S/T=Storyline · N=Notiz\n(Taste halten + Klick)'}>
          <button className="iconbtn" onClick={() => handleNewSzene()} disabled={creating || !stageId} style={{ flexShrink: 0 }}>
            <Plus size={13} />
          </button>
        </Tooltip>
        {isTouch && (
          <div style={{ position: 'relative', flexShrink: 0 }} ref={formatPickerRef}>
            <button
              className="iconbtn"
              style={{ padding: '2px 3px' }}
              onClick={() => setFormatPickerOpen(v => !v)}
              disabled={creating || !stageId}
            >
              <ChevronDown size={10} />
            </button>
            {formatPickerOpen && (
              <div className="scene-ctx-menu" style={{ right: 0, left: 'auto', top: '100%', minWidth: 130 }}>
                <button className="scene-ctx-item" onClick={() => { handleNewSzene('drehbuch'); setFormatPickerOpen(false) }}>Drehbuch</button>
                <button className="scene-ctx-item" onClick={() => { handleNewSzene('storyline'); setFormatPickerOpen(false) }}>Storyline</button>
                <button className="scene-ctx-item" onClick={() => { handleNewSzene('notiz'); setFormatPickerOpen(false) }}>Notiz</button>
              </div>
            )}
          </div>
        )}

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
            <div className="scene-ctx-menu" style={{ right: 0, left: 'auto', top: '100%', minWidth: 190 }} onMouseLeave={() => setHeaderMenuOpen(false)}>
              {/* Top — no category */}
              {onOpenSearch && (
                <button
                  className="scene-ctx-item"
                  style={{ display: 'flex', alignItems: 'center' }}
                  onClick={() => { onOpenSearch(); setHeaderMenuOpen(false) }}
                >
                  <span style={{ flex: 1 }}>Suchen &amp; Ersetzen</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                    {isMac ? '⌘H' : 'Ctrl+H'}
                  </span>
                </button>
              )}
              <button
                className="scene-ctx-item"
                onClick={() => { setMultiSelectMode(v => !v); setSelectedIds(new Set()) }}
              >
                {multiSelectMode ? 'Auswahl beenden' : 'Mehrere auswählen'}
              </button>
              {/* Kategorie: Farbe */}
              <CategoryDivider label="Farbe" />
              <button
                className="scene-ctx-item"
                onClick={() => { setFarbModus(nextFarbModus); setColorOff(nextFarbModus === 'aus') }}
              >
                {FARB_LABELS[nextFarbModus]}
              </button>

              {/* Kategorie: Verwalten */}
              <CategoryDivider label="Verwalten" />
              <button
                className="scene-ctx-item"
                onClick={() => { onOpenStrangPanel?.(); setHeaderMenuOpen(false) }}
              >
                Stränge verwalten
              </button>
              <button
                className="scene-ctx-item"
                onClick={() => { setPlatzhalterOpen(true); setHeaderMenuOpen(false) }}
                disabled={!werkstufId}
              >
                Platzhalter-{t('szene', 'p')} anlegen
              </button>
              {onOpenRadar && (
                <button
                  className="scene-ctx-item"
                  onClick={() => { onOpenRadar(); setHeaderMenuOpen(false) }}
                >
                  Story-Radar
                </button>
              )}
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

              {/* Kategorie: Auswertung */}
              <CategoryDivider label="Auswertung" />
              {onOpenStatistik && (
                <button
                  className="scene-ctx-item"
                  onClick={() => { onOpenStatistik(); setHeaderMenuOpen(false) }}
                >
                  Statistiken
                </button>
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
              <button
                className="scene-ctx-item"
                disabled={!werkstufId}
                onClick={() => { setExportDialogOpen(true); setHeaderMenuOpen(false) }}
              >
                Exportieren…
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Scene rows */}
      <div className="list">
        {filteredRegular.length === 0 && filteredNotizen.length === 0 && (
          <div style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: 12 }}>
            {szenen.length === 0
              ? (folgeNummer != null
                ? `Für ${t('episode')} ${folgeNummer} sind noch keine ${t('szene', 'p')} importiert.`
                : `Keine ${t('szene', 'p')} vorhanden.`)
              : 'Keine Treffer.'}
          </div>
        )}
        {filteredRegular.map(scene => {
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
              style={{ ...rowStyle, position: 'relative', cursor: isDragActive ? 'grab' : 'pointer', ...(multiSelectMode ? { gridTemplateColumns: '20px 30px 14px 1fr 32px 18px auto' } : {}) }}
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
                    {scene.sondertyp === 'wechselschnitt' ? '⇄' : scene.sondertyp === 'stockshot' ? <Image size={10} /> : <History size={10} />}
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
                      <CategoryDivider label="Einfügen darunter" />
                      <button className="scene-ctx-item" onClick={e => handleInsertAfter(e, scene.id, 'drehbuch')} disabled={creating}>Drehbuch</button>
                      <button className="scene-ctx-item" onClick={e => handleInsertAfter(e, scene.id, 'storyline')} disabled={creating}>Storyline</button>
                      <button className="scene-ctx-item" onClick={e => handleInsertAfter(e, scene.id, 'notiz')} disabled={creating}>Notiz</button>
                      <button className="scene-ctx-item danger" onClick={e => handleDelete(e, scene.id)}>Löschen</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {/* ── Notizen Section ── */}
        {filteredNotizen.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <button
              onClick={() => setNotizSectionOpen(v => !v)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px 5px', border: 'none',
                borderBottom: notizSectionOpen ? '1px solid var(--border-subtle)' : 'none',
                background: 'transparent', cursor: 'pointer',
                color: 'var(--text-muted)', fontSize: 11, fontWeight: 500, fontFamily: 'inherit',
              }}
            >
              <span style={{ flex: 1, textAlign: 'left' }}>Notizen ({filteredNotizen.length})</span>
              <ChevronDown size={11} style={{ transform: notizSectionOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
            </button>
            {notizSectionOpen && filteredNotizen.map(scene => {
              const isMenuOpen = menuOpenId === scene.id
              const isDeleting = deleting === scene.id
              const unreadCount = commentCounts?.[scene.id] ?? 0
              return (
                <div
                  key={scene.id}
                  className={['row', scene.id === selectedSzeneId ? 'active' : '', isDeleting ? 'deleting' : ''].filter(Boolean).join(' ')}
                  style={{ position: 'relative', cursor: 'pointer', opacity: 0.75 }}
                  onClick={() => !isMenuOpen && onSelectSzene(scene.id)}
                >
                  <div className="num">·</div>
                  <div className="sl-sondertyp-col" />
                  <div className="body">
                    <div className="sl-line">
                      <span className="sl-set" style={{ fontStyle: 'italic' }}>{scene.zusammenfassung || 'Notiz'}</span>
                    </div>
                  </div>
                  <div className="meta"><span className="sl-fmt">N</span></div>
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
                    </div>
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
                          <button className="scene-ctx-item danger" onClick={e => handleDelete(e, scene.id)}>Löschen</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
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
