import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Lock, Search, Plus, MoreHorizontal, MoreVertical, Info, MessageCircle, Image, History, ChevronDown } from 'lucide-react'
import { ENV_COLORS, ENV_COLORS_DARK } from '../data/scenes'
import { api, clearCacheByPrefix } from '../api/client'
import { useAppSettings, useTweaks, useToast } from '../contexts'
import { useTerminologie } from '../sw-ui'
import Tooltip from './Tooltip'
import PlatzhalterSzenenDialog from './PlatzhalterSzenenDialog'

interface SceneListProps {
  szenen: any[]
  selectedSzeneId: number | string | null
  onSelectSzene: (id: number | string) => void
  produktionId: string | null
  folgeNummer: number | null
  stageId: number | null // naming legacy: enthält tatsächlich die werkstufe_id (UUID) aus dem neuen Modell
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
  werkstufTyp?: string | null
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
  werkstufTyp,
  allCharacters,
}: SceneListProps) {
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
  const { sceneKuerzel } = useAppSettings()
  const { tweaks, set: setTweak } = useTweaks()
  const [hoverPopup, setHoverPopup] = useState<{ id: string | number; x: number; y: number } | null>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
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
  const [formatPickerOpen, setFormatPickerOpen] = useState(false)
  const [wrongFormatModal, setWrongFormatModal] = useState<{ pendingFormat: string; correctFormat: string } | null>(null)
  const [colorOff, setColorOff] = useState(false)

  // Allowed formats depend on werkstufe type: drehbuch-Werkstufe → drehbuch+notiz, else storyline+notiz
  const isDrehbuchWerk = !werkstufTyp || werkstufTyp === 'drehbuch'
  const isNotizWerk = werkstufTyp === 'notiz'
  const allowedFormats = isNotizWerk ? ['notiz'] : isDrehbuchWerk ? ['drehbuch', 'notiz'] : ['storyline', 'notiz']
  const nativeFormat = isNotizWerk ? 'notiz' : isDrehbuchWerk ? 'drehbuch' : 'storyline'
  const nativeLabel = isNotizWerk ? 'Dokument' : isDrehbuchWerk ? 'Drehbuch' : 'Storyline'
  const wrongLabel = isDrehbuchWerk ? 'Storyline' : 'Drehbuch'
  const [farbModus, setFarbModus] = useState<'licht' | 'strang' | 'aus'>('licht')
  const [platzhalterOpen, setPlatzhalterOpen] = useState(false)
  const [multiSelectMode, setMultiSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkStrangDropdown, setBulkStrangDropdown] = useState(false)
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [straenge, setStraenge] = useState<any[]>([])
  const [werkstufeStraenge, setWerkstufeStraenge] = useState<Record<string, any[]>>({})
  const [stimmungWarnings, setStimmungWarnings] = useState<Record<string, string>>({})
  const [selectionAnchor, setSelectionAnchor] = useState<string | null>(null)
  const [bulkPanelPos, setBulkPanelPos] = useState<{ left: number; top: number } | null>(null)
  const scenesRef = useRef<HTMLDivElement | null>(null)
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
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const formatPickerRef = useRef<HTMLDivElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const headerMenuRef = useRef<HTMLDivElement | null>(null)

  // Drag & drop state
  const [dragId, setDragId] = useState<number | string | null>(null)
  const [dragOverId, setDragOverId] = useState<number | string | null>(null)
  const [dropEndOver, setDropEndOver] = useState(false)
  const [pendingAnchorDialog, setPendingAnchorDialog] = useState<{
    ids: (number | string)[]
    notizIds: (number | string)[]
    lastRealSceneNummer: number
    lastRealSceneLabel: string
  } | null>(null)

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
      clearSelection()
      if (werkstufId) api.getWerkstufeStraenge(werkstufId).then(setWerkstufeStraenge).catch(() => {})
    } catch (e) { console.error(e) }
  }

  const handleBulkRemove = async (strangId: string) => {
    if (selectedIds.size === 0) return
    try {
      await api.bulkRemoveSzeneStrang(Array.from(selectedIds), strangId)
      clearSelection()
      if (werkstufId) api.getWerkstufeStraenge(werkstufId).then(setWerkstufeStraenge).catch(() => {})
    } catch (e) { console.error(e) }
  }

  const clearSelection = useCallback(() => {
    setMultiSelectMode(false)
    setSelectedIds(new Set())
    setSelectionAnchor(null)
    setBulkStrangDropdown(false)
    setBulkDeleteConfirm(false)
  }, [])

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    setBulkDeleting(true)
    try {
      const ids = Array.from(selectedIds)
      await api.bulkDeleteDokumentSzenen(ids)
      ids.forEach(id => onSzeneDeleted?.(id as any))
      clearSelection()
    } catch (e: any) {
      showToast('Fehler beim Löschen: ' + e.message, 'error')
    } finally {
      setBulkDeleting(false)
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        if (next.size === 0) setMultiSelectMode(false)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const selectRange = (toId: string) => {
    if (!selectionAnchor) return
    const allIds = sorted.map(s => String(s.id))
    const from = allIds.indexOf(selectionAnchor)
    const to = allIds.indexOf(toId)
    if (from === -1 || to === -1) return
    const [lo, hi] = from < to ? [from, to] : [to, from]
    setSelectedIds(new Set(allIds.slice(lo, hi + 1)))
  }

  const sorted = [...szenen].sort((a, b) => {
    const so = (a.sort_order ?? 0) - (b.sort_order ?? 0)
    if (so !== 0) return so
    const sn = (a.scene_nummer ?? 0) - (b.scene_nummer ?? 0)
    if (sn !== 0) return sn
    return (a.scene_nummer_suffix ?? '').localeCompare(b.scene_nummer_suffix ?? '')
  })

  const matchesSearch = (s: any) => searchQuery === '' ||
    (`${s.scene_nummer}${s.scene_nummer_suffix || ''}`.includes(searchQuery) ||
     (s.scene_nummer != null && `${String(s.scene_nummer).padStart(2, '0')}${s.scene_nummer_suffix || ''}`.includes(searchQuery))) ||
    (s.ort_name ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.zusammenfassung ?? '').toLowerCase().includes(searchQuery.toLowerCase())

  const filtered = sorted.filter(s =>
    matchesSearch(s) && (
      !tweaks.sceneListNurSzenen ||
      (s.format !== 'notiz' && s.scene_nummer != null && s.scene_nummer !== 0)
    )
  )

  // Track pressed modifier keys for format shortcuts (D/S/T/N + click on +)
  useEffect(() => {
    const down = (e: KeyboardEvent) => pressedKeys.current.add(e.code)
    const up = (e: KeyboardEvent) => pressedKeys.current.delete(e.code)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  // Escape clears multi-selection
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && multiSelectMode) clearSelection()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [multiSelectMode, clearSelection])

  // Floating panel position — pinned to right edge of scenes container
  useEffect(() => {
    if (!multiSelectMode || !scenesRef.current) { setBulkPanelPos(null); return }
    const update = () => {
      if (!scenesRef.current) return
      const r = scenesRef.current.getBoundingClientRect()
      setBulkPanelPos({ left: r.right + 8, top: r.top + 60 })
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [multiSelectMode])

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

  // Resolve format from pressed keys, respecting allowed formats for this werkstufe.
  // Returns { format, showWarning } — showWarning=true if key conflicts with werkstuf type.
  const getFormatFromKeys = (fallback = 'notiz'): { format: string; showWarning: boolean } => {
    if (pressedKeys.current.has('KeyN')) return { format: 'notiz', showWarning: false }
    const wantsDb = pressedKeys.current.has('KeyD')
    const wantsSl = pressedKeys.current.has('KeyS') || pressedKeys.current.has('KeyT')
    if (wantsDb) {
      if (isDrehbuchWerk) return { format: 'drehbuch', showWarning: false }
      return { format: 'storyline', showWarning: true }  // wrong key → warn, use native
    }
    if (wantsSl) {
      if (!isDrehbuchWerk) return { format: 'storyline', showWarning: false }
      return { format: 'drehbuch', showWarning: true }  // wrong key → warn, use native
    }
    return { format: fallback, showWarning: false }
  }

  const doCreateSzene = async (format: string, afterSzeneId?: number | string) => {
    setCreating(true)
    try {
      if (afterSzeneId !== undefined) {
        const newSzene = await api.createWerkstufeSzene(String(stageId), {
          int_ext: 'INT', tageszeit: 'TAG', format, after_scene_id: afterSzeneId,
        })
        // Insert new scene directly after the reference scene (use POST response, no re-fetch needed)
        const refIdx = szenen.findIndex((s: any) => String(s.id) === String(afterSzeneId))
        const updated = [...szenen]
        if (refIdx !== -1) {
          updated.splice(refIdx + 1, 0, newSzene)
        } else {
          updated.push(newSzene)
        }
        onSzenesReordered?.(updated)
        onSelectSzene(newSzene.id)
      } else {
        const newSzene = await api.createWerkstufeSzene(String(stageId), {
          int_ext: 'INT', tageszeit: 'TAG', format,
        })
        onSzeneCreated?.(newSzene)
      }
    } catch (e: any) {
      console.error('Fehler beim Erstellen der Szene', e)
      showToast('Fehler beim Erstellen der Szene: ' + (e?.message || String(e)), 'error')
    } finally {
      setCreating(false)
    }
  }

  const handleNewSzene = async (format?: string) => {
    if (!stageId || creating) return
    if (format !== undefined) { doCreateSzene(format); return }
    const { format: fmt, showWarning } = getFormatFromKeys(nativeFormat)
    if (showWarning) {
      setWrongFormatModal({ pendingFormat: fmt, correctFormat: fmt })
    } else {
      doCreateSzene(fmt)
    }
  }

  const handleInsertAfter = (e: React.MouseEvent, afterSzeneId: number | string, format: string) => {
    e.stopPropagation()
    setMenuOpenId(null)
    if (!stageId || creating) return
    doCreateSzene(format, afterSzeneId)
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

  // Shared reorder logic: optimistic update + anchor-dialog check + API call
  const doReorder = async (newIds: (number | string)[], movedSet: Set<string>) => {
    const newOrder = newIds.map(id => szenen.find(s => s.id === id)!).filter(Boolean)
    newOrder.forEach((s, i) => { s.sort_order = i + 1 })
    onSzenesReordered?.([...newOrder])
    setDragId(null)
    setDragOverId(null)

    // Check if any moved notiz element lands after the last real scene
    let lastRealIdx = -1
    for (let i = newOrder.length - 1; i >= 0; i--) {
      if (newOrder[i].format !== 'notiz' && newOrder[i].scene_nummer != null) { lastRealIdx = i; break }
    }
    const movedNotizAfterLast: (number | string)[] = []
    if (lastRealIdx !== -1) {
      for (let i = lastRealIdx + 1; i < newOrder.length; i++) {
        const s = newOrder[i]
        if (s?.format === 'notiz' && movedSet.has(String(s.id))) movedNotizAfterLast.push(s.id)
      }
    }
    if (movedNotizAfterLast.length > 0) {
      const lastReal = newOrder[lastRealIdx]
      setPendingAnchorDialog({
        ids: newIds,
        notizIds: movedNotizAfterLast,
        lastRealSceneNummer: lastReal.scene_nummer,
        lastRealSceneLabel: lastReal.scene_nummer != null
          ? `${String(lastReal.scene_nummer).padStart(2, '0')}${lastReal.scene_nummer_suffix || ''}`
          : `${lastReal.scene_nummer ?? ''}`,
      })
      return
    }

    try {
      const updated = await api.reorderWerkstufeSzenen(String(stageId), newIds)
      onSzenesReordered?.(updated)
    } catch (e) {
      console.error('Fehler beim Sortieren', e)
    }
  }

  const handleDrop = async (e: React.DragEvent, targetId: number) => {
    e.preventDefault()
    if (!dragId || dragId === targetId || !stageId) {
      setDragId(null)
      setDragOverId(null)
      return
    }

    const isMulti = selectedIds.has(String(dragId)) && selectedIds.size > 1

    if (isMulti) {
      if (selectedIds.has(String(targetId))) { setDragId(null); setDragOverId(null); return }
      const allIds = sorted.map(s => s.id)
      const selectedInOrder = allIds.filter(id => selectedIds.has(String(id)))
      const remaining = allIds.filter(id => !selectedIds.has(String(id)))
      const insertIdx = remaining.indexOf(targetId)
      if (insertIdx === -1) { setDragId(null); setDragOverId(null); return }
      const newIds = [...remaining.slice(0, insertIdx), ...selectedInOrder, ...remaining.slice(insertIdx)]
      await doReorder(newIds, selectedIds)
    } else {
      const ids = sorted.map(s => s.id)
      const fromIdx = ids.indexOf(dragId)
      const toIdx = ids.indexOf(targetId)
      if (fromIdx === -1 || toIdx === -1) { setDragId(null); setDragOverId(null); return }
      ids.splice(fromIdx, 1)
      ids.splice(toIdx, 0, dragId)
      await doReorder(ids, new Set([String(dragId)]))
    }
  }

  const handleDropToEnd = async (e: React.DragEvent) => {
    e.preventDefault()
    setDropEndOver(false)
    if (!dragId || !stageId) { setDragId(null); return }
    const isMulti = selectedIds.has(String(dragId)) && selectedIds.size > 1
    const allIds = sorted.map(s => s.id)
    const newIds = isMulti
      ? [...allIds.filter(id => !selectedIds.has(String(id))), ...allIds.filter(id => selectedIds.has(String(id)))]
      : [...allIds.filter(id => id !== dragId), dragId]
    await doReorder(newIds, isMulti ? selectedIds : new Set([String(dragId)]))
  }

  const handleDragEnd = () => {
    setDragId(null)
    setDragOverId(null)
  }

  // Touch: long-press (400ms) → enter multi-select and select that scene
  const handleTouchStart = (sceneId: string) => {
    if (multiSelectMode) return // already in mode, tap handles toggle via onClick
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null
      setMultiSelectMode(true)
      setSelectedIds(new Set([sceneId]))
      setSelectionAnchor(sceneId)
      navigator.vibrate?.(30)
    }, 400)
  }
  const handleTouchCancel = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
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
  const isMultiDrag = dragId !== null && selectedIds.has(String(dragId)) && selectedIds.size > 1

  return (
    <div ref={scenesRef} className="scenes" data-colormode={effectiveColorMode} data-multi-drag={isMultiDrag ? 'true' : undefined}>
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
        <Tooltip placement="bottom" text={isNotizWerk
          ? 'Neuer Abschnitt'
          : isTouch
            ? `Neue ${nativeLabel}-Szene`
            : `Neue Szene\n${isDrehbuchWerk ? 'D=Drehbuch' : 'S/T=Storyline'} · N=Dokument\n(Taste halten + Klick)`
        }>
          <button className="iconbtn" onClick={() => handleNewSzene()} disabled={creating || !stageId} style={{ flexShrink: 0 }}>
            <Plus size={13} />
          </button>
        </Tooltip>
        {isTouch && !isNotizWerk && (
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
                {allowedFormats.filter(f => f !== 'notiz').map(f => (
                  <button key={f} className="scene-ctx-item" onClick={() => { handleNewSzene(f); setFormatPickerOpen(false) }}>
                    {f === 'drehbuch' ? 'Drehbuch' : 'Storyline'}
                  </button>
                ))}
                <button className="scene-ctx-item" onClick={() => { handleNewSzene('notiz'); setFormatPickerOpen(false) }}>Dokument</button>
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
                {isNotizWerk ? 'Platzhalter-Abschnitte anlegen' : `Platzhalter-${t('szene', 'p')} anlegen`}
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
              {/* Kategorie: Ansicht */}
              <CategoryDivider label="Ansicht" />
              <button
                className="scene-ctx-item"
                onClick={() => { setTweak('sceneListPopup', !tweaks.sceneListPopup); setHeaderMenuOpen(false) }}
              >
                {tweaks.sceneListPopup ? 'Popup aus' : 'Popup an'}
              </button>
              <button
                className="scene-ctx-item"
                onClick={() => { setTweak('sceneListNurSzenen', !tweaks.sceneListNurSzenen); setHeaderMenuOpen(false) }}
              >
                {tweaks.sceneListNurSzenen ? 'Alle Seiten' : 'Nur Szenen'}
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
          const isMultiSelected = multiSelectMode && selectedIds.has(String(scene.id))
          const isDragging = dragId === scene.id || (isMultiDrag && selectedIds.has(String(scene.id)))
          const isDragOver = dragOverId === scene.id && !isDragging

          const sceneLabel = scene.scene_nummer != null
            ? `${String(scene.scene_nummer).padStart(2, '0')}${scene.scene_nummer_suffix || ''}`
            : ''

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
                isMultiSelected ? 'ms-selected' : '',
              ].filter(Boolean).join(' ')}
              style={{ ...rowStyle, position: 'relative', cursor: isDragActive ? 'grab' : 'pointer' }}
              onTouchStart={isTouch ? () => handleTouchStart(String(scene.id)) : undefined}
              onTouchMove={isTouch ? handleTouchCancel : undefined}
              onTouchEnd={isTouch ? handleTouchCancel : undefined}
              onClick={(e) => {
                if (isMenuOpen) return
                // Ctrl/Cmd+Click: toggle individual, activate multi-select
                if (e.ctrlKey || e.metaKey) {
                  if (!multiSelectMode) setMultiSelectMode(true)
                  toggleSelect(String(scene.id))
                  setSelectionAnchor(String(scene.id))
                  return
                }
                // Shift+Click: range from anchor (activates multi-select automatically)
                if (e.shiftKey && selectionAnchor) {
                  if (!multiSelectMode) setMultiSelectMode(true)
                  selectRange(String(scene.id))
                  return
                }
                // Touch in multi-select mode: tap = toggle
                if (isTouch && multiSelectMode) {
                  toggleSelect(String(scene.id))
                  return
                }
                // Normal click: clear any active selection, then navigate
                if (multiSelectMode) {
                  setMultiSelectMode(false)
                  setSelectedIds(new Set())
                  setSelectionAnchor(null)
                }
                onSelectSzene(scene.id)
                setSelectionAnchor(String(scene.id))
              }}
            >
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
                  {tweaks.sceneListPopup && (scene.zusammenfassung || scene.rollen_names) ? (
                    <span
                      className="sl-set"
                      onMouseEnter={e => {
                        if (hoverTimer.current) clearTimeout(hoverTimer.current)
                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                        hoverTimer.current = setTimeout(() => setHoverPopup({ id: scene.id, x: r.right + 8, y: r.top + r.height / 2 }), 300)
                      }}
                      onMouseLeave={() => {
                        if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null }
                        setHoverPopup(null)
                      }}
                    >
                      {scene.format !== 'notiz' ? (scene.ort_name || scene.zusammenfassung || '') : (scene.zusammenfassung || scene.element_type || (isNotizWerk ? 'Abschnitt' : 'Notiz'))}
                    </span>
                  ) : (
                    <span className="sl-set">{scene.format !== 'notiz' ? (scene.ort_name || scene.zusammenfassung || '') : (scene.zusammenfassung || scene.element_type || (isNotizWerk ? 'Abschnitt' : 'Notiz'))}</span>
                  )}
                </div>
                {scene.format !== 'notiz' && scene.seite_von_str && (
                  <div className="sl-page">{scene.seite_von_str === scene.seite_bis_str ? `S.${scene.seite_von_str}` : `S.${scene.seite_von_str}–${scene.seite_bis_str}`}</div>
                )}
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
                  <Tooltip text={scene.szeneninfo} placement="right">
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
                    <Tooltip text={stimmungWarnings[scene.id]} placement="right">
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
                    <div className="scene-ctx-menu" style={{ minWidth: 190 }}>
                      <CategoryDivider label="Einfügen darunter" />
                      {allowedFormats.filter(f => f !== 'notiz').map(f => (
                        <button key={f} className="scene-ctx-item" onClick={e => handleInsertAfter(e, scene.id, f)} disabled={creating}>
                          {f === 'drehbuch' ? 'Drehbuch' : 'Storyline'}
                        </button>
                      ))}
                      <button className="scene-ctx-item" onClick={e => handleInsertAfter(e, scene.id, 'notiz')} disabled={creating}>Dokument</button>
                      <button className="scene-ctx-item danger" onClick={e => handleDelete(e, scene.id)}>Löschen</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {/* Drop zone: Notiz-Element nach allen Szenen ablegen */}
        {isDragActive && dragId != null && szenen.find(s => s.id === dragId)?.format === 'notiz' && (
          <div
            onDragOver={e => { e.preventDefault(); setDropEndOver(true) }}
            onDragLeave={() => setDropEndOver(false)}
            onDrop={handleDropToEnd}
            style={{
              margin: '4px 8px 8px',
              borderRadius: 6,
              border: `2px dashed ${dropEndOver ? 'var(--accent, #007AFF)' : 'var(--border)'}`,
              background: dropEndOver ? 'var(--bg-elevated)' : 'transparent',
              color: dropEndOver ? 'var(--text-primary)' : 'var(--text-muted)',
              fontSize: 11,
              textAlign: 'center',
              padding: '6px 10px',
              transition: 'all 0.15s',
              cursor: 'copy',
            }}
          >
            Nach allen Szenen ablegen
          </div>
        )}

      </div>

      {/* Floating bulk action panel — rendered via portal next to the sidebar */}
      {multiSelectMode && selectedIds.size > 0 && bulkPanelPos && createPortal(
        <div style={{
          position: 'fixed',
          left: bulkPanelPos.left,
          top: bulkPanelPos.top,
          zIndex: 8000,
          width: 200,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
          fontSize: 12,
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '9px 13px',
            borderBottom: '1px solid var(--border)',
            fontWeight: 700,
            color: 'var(--text-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span>{selectedIds.size} {t('szene', selectedIds.size > 1 ? 'p' : 's')} gewählt</span>
            <button
              onClick={clearSelection}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', lineHeight: 1, color: 'var(--text-muted)', fontSize: 14 }}
              title="Auswahl aufheben (Esc)"
            >×</button>
          </div>

          {/* Strang zuweisen */}
          <div style={{ position: 'relative' }}>
            <button
              className="scene-ctx-item"
              style={{ width: '100%', textAlign: 'left', fontWeight: 500 }}
              onClick={() => setBulkStrangDropdown(v => !v)}
            >
              🧶 Strang zuweisen…
            </button>
            {bulkStrangDropdown && (
              <div style={{
                position: 'absolute',
                left: '100%', top: 0,
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                minWidth: 180,
                zIndex: 8001,
                overflow: 'hidden',
              }}>
                <div style={{ padding: '5px 10px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                  Hinzufügen
                </div>
                {straenge.filter(s => s.status === 'aktiv').map(s => (
                  <button key={s.id} className="scene-ctx-item" onClick={() => handleBulkAssign(s.id)}>
                    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: s.farbe, marginRight: 6, flexShrink: 0 }} />
                    {s.name}
                  </button>
                ))}
                {straenge.filter(s => s.status === 'aktiv').length === 0 && (
                  <div style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: 11 }}>Keine Stränge vorhanden</div>
                )}
                <div style={{ borderTop: '1px solid var(--border)', padding: '5px 10px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-muted)', marginTop: 2 }}>
                  Entfernen
                </div>
                {straenge.filter(s => s.status === 'aktiv').map(s => (
                  <button key={`rm-${s.id}`} className="scene-ctx-item danger" onClick={() => handleBulkRemove(s.id)}>
                    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: s.farbe, marginRight: 6, flexShrink: 0 }} />
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Löschen */}
          <button
            className="scene-ctx-item danger"
            style={{ width: '100%', textAlign: 'left', fontWeight: 500 }}
            onClick={() => setBulkDeleteConfirm(true)}
          >
            🗑 {selectedIds.size} {t('szene', selectedIds.size > 1 ? 'p' : 's')} löschen…
          </button>

          {/* Abbrechen */}
          <div style={{ borderTop: '1px solid var(--border)', padding: '6px 8px' }}>
            <button
              className="scene-ctx-item"
              style={{ width: '100%', textAlign: 'left', color: 'var(--text-muted)', fontSize: 11 }}
              onClick={clearSelection}
            >
              Abbrechen (Esc)
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Bulk delete confirmation modal */}
      {bulkDeleteConfirm && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: '24px 28px', maxWidth: 360, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.3)', border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>
              {selectedIds.size} {t('szene', selectedIds.size > 1 ? 'p' : 's')} löschen?
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.6 }}>
              Diese Aktion ist <strong>nicht rückgängig</strong> zu machen. Alle Inhalte, Rollenzuweisungen und Strang-Verknüpfungen der {selectedIds.size > 1 ? 'ausgewählten Szenen werden' : 'Szene wird'} endgültig gelöscht.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setBulkDeleteConfirm(false)}
                disabled={bulkDeleting}
                style={{ padding: '7px 16px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', fontSize: 13, cursor: 'pointer', color: 'var(--text-primary)', fontFamily: 'inherit' }}
              >
                Abbrechen
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                style={{ padding: '7px 16px', borderRadius: 6, border: 'none', background: '#FF3B30', color: '#fff', fontSize: 13, cursor: bulkDeleting ? 'not-allowed' : 'pointer', fontWeight: 600, fontFamily: 'inherit', opacity: bulkDeleting ? 0.6 : 1 }}
              >
                {bulkDeleting ? 'Löschen…' : `${selectedIds.size} ${t('szene', selectedIds.size > 1 ? 'p' : 's')} löschen`}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modals */}
      {produktionId && werkstufId && (
        <PlatzhalterSzenenDialog
          werkstufId={werkstufId}
          produktionId={produktionId}
          open={platzhalterOpen}
          onClose={() => setPlatzhalterOpen(false)}
          onCreated={() => {
            if (stageId) {
              clearCacheByPrefix(`/werkstufen/${String(stageId)}/szenen`)
              api.getWerkstufenSzenen(String(stageId)).then(s => onSzenesReordered?.(s)).catch(() => {})
            }
          }}
        />
      )}

      {/* ── Falsches Format Modal ── */}
      {wrongFormatModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-surface)', borderRadius: 10, padding: '24px 28px', maxWidth: 360, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.35)', border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 10 }}>
              {wrongLabel}-Format nicht verfügbar
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.5 }}>
              Diese Werkstufe ist vom Typ <strong>{nativeLabel}</strong>. {wrongLabel}-Szenen können nicht gemischt werden.
              Stattdessen eine <strong>{nativeLabel}</strong>-Szene erstellen?
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setWrongFormatModal(null)}
                style={{ padding: '7px 16px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', fontSize: 13, cursor: 'pointer', color: 'var(--text-primary)', fontFamily: 'inherit' }}
              >
                Abbrechen
              </button>
              <button
                onClick={() => { const m = wrongFormatModal; setWrongFormatModal(null); doCreateSzene(m.correctFormat) }}
                style={{ padding: '7px 16px', borderRadius: 6, border: 'none', background: 'var(--sw-green)', color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 500, fontFamily: 'inherit' }}
              >
                {nativeLabel}-Szene erstellen
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Notiz-Anker-Dialog ── */}
      {pendingAnchorDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: '24px 28px', maxWidth: 380, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.3)', border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Notiz positionieren</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.6 }}>
              Dieses Notiz-Element liegt nach der letzten Szene (<strong>{pendingAnchorDialog.lastRealSceneLabel}</strong>).
              Soll es an diese Szene gebunden oder als freies Dokument-Element ohne Szenen-Anker gespeichert werden?
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={async () => {
                  const anchors: Record<string, number | null> = {}
                  for (const id of pendingAnchorDialog.notizIds) anchors[String(id)] = pendingAnchorDialog.lastRealSceneNummer
                  const d = pendingAnchorDialog
                  setPendingAnchorDialog(null)
                  try { const u = await api.reorderWerkstufeSzenen(String(stageId), d.ids, anchors); onSzenesReordered?.(u) } catch (e) { console.error(e) }
                }}
                style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)', fontSize: 13, cursor: 'pointer', textAlign: 'left', color: 'var(--text-primary)', fontFamily: 'inherit', fontWeight: 500 }}
              >
                Ankern an Szene {pendingAnchorDialog.lastRealSceneLabel}
              </button>
              <button
                onClick={async () => {
                  const anchors: Record<string, number | null> = {}
                  for (const id of pendingAnchorDialog.notizIds) anchors[String(id)] = null
                  const d = pendingAnchorDialog
                  setPendingAnchorDialog(null)
                  try { const u = await api.reorderWerkstufeSzenen(String(stageId), d.ids, anchors); onSzenesReordered?.(u) } catch (e) { console.error(e) }
                }}
                style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', fontSize: 13, cursor: 'pointer', textAlign: 'left', color: 'var(--text-muted)', fontFamily: 'inherit' }}
              >
                Ohne Anker (Dokumentebene)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hover-Popup: Oneliner + Rollen */}
      {hoverPopup && (() => {
        const ps = szenen.find(s => s.id === hoverPopup.id)
        if (!ps) return null
        return createPortal(
          <div style={{
            position: 'fixed',
            left: hoverPopup.x,
            top: hoverPopup.y,
            transform: 'translateY(-50%)',
            background: '#111',
            color: '#fff',
            fontSize: 11,
            lineHeight: 1.5,
            padding: '6px 10px',
            borderRadius: 6,
            maxWidth: 260,
            whiteSpace: 'pre-line',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            zIndex: 99999,
            pointerEvents: 'none',
          }}>
            {ps.zusammenfassung && <div>{ps.zusammenfassung}</div>}
            {ps.rollen_names && (
              <div style={{ color: '#64B5F6', marginTop: ps.zusammenfassung ? 3 : 0 }}>
                {ps.rollen_names}
              </div>
            )}
          </div>,
          document.body
        )
      })()}
    </div>
  )
}
