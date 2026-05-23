/**
 * ExportDrawer — Phase A8: Überarbeitung zu zentriertem Modal
 *
 * - Zentriertes Modal (~640px) statt Schubladen-Drawer
 * - Dokumentstruktur: DnD-Reihenfolge mit VOR/NACH Hauptinhalt
 * - Statistik-Element: konfigurierbar via StatistikModal
 * - Filter als Akkordeon (Rollen/Komparsen/Motive)
 * - PDF-Lesezeichen opt-in
 * - Hauptinhalt deaktivierbar
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  X, Download, FileText, FileCode, Loader2, CheckCircle, AlertCircle,
  Eye, WifiOff, GripVertical, BarChart2, ChevronDown, ChevronRight,
  BookOpen, Settings,
} from 'lucide-react'
import type { WerkstufeMeta } from '../../hooks/useDokument'
import { api } from '../../api/client'
import Tooltip from '../Tooltip'
import StatistikModal, {
  DEFAULT_SECTIONS,
  type StatModalSection,
  type StatistikExportConfig,
} from '../StatistikModal'

// ── Types ──────────────────────────────────────────────────────────────────────

type ExportFormat = 'pdf' | 'docx' | 'fountain' | 'fdx'
type JobStatus = 'idle' | 'pending' | 'running' | 'done' | 'error'

interface FilterOptions {
  rollen:    string[]
  komparsen: string[]
  motive:    string[]
}

interface ExportItem {
  id: string
  type: 'notiz' | 'statistik'
  werkstufId?: string
  label: string
  enabled: boolean
  statistikConfig?: StatistikExportConfig
}

interface Props {
  isOpen: boolean
  onClose: () => void
  selectedWerk: WerkstufeMeta | null
  werkstufen: WerkstufeMeta[]
  produktionId: string
}

// ── Hilfsfunktionen ────────────────────────────────────────────────────────────

function genId() { return `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }

const FORMAT_DEFS: {
  value: ExportFormat; label: string; available: boolean
  icon: React.ReactNode; offlineOk: boolean
  supportsNotizen: boolean; supportsPersAusdruck: boolean
}[] = [
  { value: 'pdf',      label: 'PDF',      available: true,  icon: <FileText size={13} />, offlineOk: false, supportsNotizen: true,  supportsPersAusdruck: true  },
  { value: 'docx',     label: 'Word',     available: false, icon: <FileText size={13} />, offlineOk: true,  supportsNotizen: true,  supportsPersAusdruck: true  },
  { value: 'fountain', label: 'Fountain', available: false, icon: <FileCode size={13} />, offlineOk: true,  supportsNotizen: false, supportsPersAusdruck: false },
  { value: 'fdx',      label: 'FDX',      available: false, icon: <FileCode size={13} />, offlineOk: true,  supportsNotizen: false, supportsPersAusdruck: false },
]

const SEC: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, display: 'block',
}

// ── Haupt-Komponente ───────────────────────────────────────────────────────────

export default function ExportDrawer({ isOpen, onClose, selectedWerk, werkstufen, produktionId }: Props) {
  // Basis
  const [format, setFormat]                       = useState<ExportFormat>('pdf')
  const [isOnline, setIsOnline]                   = useState(navigator.onLine)
  const [persAusdruck, setPersAusdruck]           = useState('')
  const [jobStatus, setJobStatus]                 = useState<JobStatus>('idle')
  const [progress, setProgress]                   = useState(0)
  const [errorMsg, setErrorMsg]                   = useState<string | null>(null)

  // Szenen-Filter
  const [selectionMode, setSelectionMode]         = useState<'alle' | 'auswahl'>('alle')
  const [szenenAuswahl, setSzenenAuswahl]         = useState('')
  const [filterOptions, setFilterOptions]         = useState<FilterOptions | null>(null)
  const [selectedRollen, setSelectedRollen]       = useState<Set<string>>(new Set())
  const [selectedKomparsen, setSelectedKomparsen] = useState<Set<string>>(new Set())
  const [selectedMotive, setSelectedMotive]       = useState<Set<string>>(new Set())
  const [rolleAlsVermerk, setRolleAlsVermerk]     = useState(false)

  // Filter-Akkordeon
  const [rollenOpen, setRollenOpen]               = useState(false)
  const [komparsenOpen, setKomparsenOpen]         = useState(false)
  const [motiveOpen, setMotiveOpen]               = useState(false)

  // Neue A8-Features
  const [preItems, setPreItems]                   = useState<ExportItem[]>([])
  const [postItems, setPostItems]                 = useState<ExportItem[]>([])
  const [hauptinhaltAktiv, setHauptinhaltAktiv]   = useState(true)
  const [pdfBookmarks, setPdfBookmarks]           = useState(false)

  // Statistik-Modal
  const [statConfigItemId, setStatConfigItemId]   = useState<string | null>(null)
  const [folgenForStat, setFolgenForStat]         = useState<any[]>([])
  const [bloeckeForStat, setBloeckeForStat]       = useState<any[]>([])
  const [statSections]                            = useState<StatModalSection[]>(DEFAULT_SECTIONS)

  // DnD
  const dragItemRef      = useRef<{ id: string; zone: 'pre' | 'post' } | null>(null)
  const [dragOverZone, setDragOverZone] = useState<'pre' | 'post' | null>(null)

  // Jobs
  const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const jobIdRef = useRef<string | null>(null)

  const notizWerkstufen = werkstufen.filter(w => w.typ === 'notiz')

  // Beim Öffnen initialisieren
  useEffect(() => {
    if (!isOpen || !selectedWerk) return
    setJobStatus('idle'); setProgress(0); setErrorMsg(null)
    setSelectionMode('alle'); setSzenenAuswahl('')
    setSelectedRollen(new Set()); setSelectedKomparsen(new Set()); setSelectedMotive(new Set())
    setRolleAlsVermerk(false); setRollenOpen(false); setKomparsenOpen(false); setMotiveOpen(false)
    setHauptinhaltAktiv(true); setPdfBookmarks(false)

    // Pre-Items aus Notiz-Werkstufen aufbauen + einen Statistik-Platzhalter
    const notizItems: ExportItem[] = notizWerkstufen.map(w => ({
      id: genId(), type: 'notiz', werkstufId: w.id,
      label: w.label || `Notiz V${w.version_nummer}`, enabled: true,
    }))
    setPreItems([...notizItems, {
      id: genId(), type: 'statistik',
      label: 'Statistik (Konfiguration nötig)', enabled: false,
    }])
    setPostItems([])

    // Filter-Optionen laden
    setFilterOptions(null)
    api.get(`/export/filter-options?werkstufId=${selectedWerk.id}`)
      .then((data: any) => setFilterOptions({
        rollen:    data.rollen    ?? [],
        komparsen: data.komparsen ?? [],
        motive:    data.motive    ?? [],
      }))
      .catch(() => setFilterOptions({ rollen: [], komparsen: [], motive: [] }))
  }, [isOpen, selectedWerk?.id])

  useEffect(() => { if (!isOpen) stopPolling() }, [isOpen])

  useEffect(() => {
    const on  = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  // Statistik-Modal: Folgen + Blöcke laden wenn noch nicht geladen
  const openStatConfig = useCallback(async (itemId: string) => {
    if (!folgenForStat.length) {
      try {
        const [f, b] = await Promise.all([
          api.getFolgenV2(produktionId),
          api.getBloecke(produktionId),
        ])
        setFolgenForStat(f)
        setBloeckeForStat(b)
      } catch {
        setFolgenForStat([]); setBloeckeForStat([])
      }
    }
    setStatConfigItemId(itemId)
  }, [folgenForStat.length, produktionId])

  // StatistikModal: Konfiguration übernehmen
  const handleStatistikUebernehmen = useCallback((config: StatistikExportConfig) => {
    if (!statConfigItemId) return
    const updateItems = (items: ExportItem[]) =>
      items.map(it => it.id === statConfigItemId
        ? { ...it, enabled: true, statistikConfig: config, label: `Statistik Folge ${config.folge_nummer}` }
        : it
      )
    setPreItems(prev => updateItems(prev))
    setPostItems(prev => updateItems(prev))
    setStatConfigItemId(null)
  }, [statConfigItemId])

  // ── DnD ─────────────────────────────────────────────────────────────────────

  function onItemDragStart(id: string, zone: 'pre' | 'post') {
    dragItemRef.current = { id, zone }
  }

  function onZoneDrop(targetZone: 'pre' | 'post') {
    const src = dragItemRef.current
    if (!src) return
    setDragOverZone(null)

    const srcList = src.zone === 'pre' ? preItems : postItems
    const item = srcList.find(i => i.id === src.id)
    if (!item) return

    if (src.zone === targetZone) return  // gleiche Zone → keine Änderung

    // Aus Quell-Zone entfernen, in Ziel-Zone hinzufügen
    if (src.zone === 'pre') {
      setPreItems(prev => prev.filter(i => i.id !== src.id))
      setPostItems(prev => [...prev, item])
    } else {
      setPostItems(prev => prev.filter(i => i.id !== src.id))
      setPreItems(prev => [...prev, item])
    }
    dragItemRef.current = null
  }

  // ── Hilfsfunktionen ──────────────────────────────────────────────────────────

  const currentFormatDef = FORMAT_DEFS.find(f => f.value === format)!

  const isDisabledFormat = (f: typeof FORMAT_DEFS[0]) => {
    if (!f.available) return true
    if (!selectedWerk) return true
    if ((f.value === 'fountain' || f.value === 'fdx') && selectedWerk.typ !== 'drehbuch') return true
    return false
  }

  function buildPersAusdruck(): string | undefined {
    const base = persAusdruck.trim()
    if (!rolleAlsVermerk || selectedRollen.size === 0) return base || undefined
    const rollenStr = Array.from(selectedRollen).join(', ')
    return base ? `${base} · ${rollenStr}` : rollenStr
  }

  function toggle<T>(set: Set<T>, val: T): Set<T> {
    const n = new Set(set); n.has(val) ? n.delete(val) : n.add(val); return n
  }

  function toggleItem(zone: 'pre' | 'post', id: string) {
    const setter = zone === 'pre' ? setPreItems : setPostItems
    setter(prev => prev.map(it => it.id === id ? { ...it, enabled: !it.enabled } : it))
  }

  // ── Export starten ──────────────────────────────────────────────────────────

  async function startExport() {
    if (!selectedWerk || jobStatus === 'running' || jobStatus === 'pending') return
    setJobStatus('pending'); setProgress(0); setErrorMsg(null)

    try {
      // Active items in order
      const activePreItems = preItems.filter(i => i.enabled)
      const activePostItems = postItems.filter(i => i.enabled)

      const body: any = {
        werkstufId: selectedWerk.id,
        format,
        options: {
          preItems:  activePreItems.map(it => ({
            type: it.type, id: it.werkstufId, label: it.label, enabled: true,
            statistikConfig: it.statistikConfig,
          })),
          postItems: activePostItems.map(it => ({
            type: it.type, id: it.werkstufId, label: it.label, enabled: true,
            statistikConfig: it.statistikConfig,
          })),
          hauptinhaltAktiv,
          pdfBookmarks,
          persoenlicher_ausdruck: currentFormatDef.supportsPersAusdruck ? buildPersAusdruck() : undefined,
          szenenAuswahl:   selectionMode === 'auswahl' && szenenAuswahl.trim() ? szenenAuswahl.trim() : undefined,
          filterRollen:    selectionMode === 'auswahl' && selectedRollen.size > 0 ? Array.from(selectedRollen) : undefined,
          filterKomparsen: selectionMode === 'auswahl' && selectedKomparsen.size > 0 ? Array.from(selectedKomparsen) : undefined,
          filterMotive:    selectionMode === 'auswahl' && selectedMotive.size > 0 ? Array.from(selectedMotive) : undefined,
          userTimezone:    Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      }

      const res = await api.post('/export/job', body)
      const jobId = res.jobId as string
      jobIdRef.current = jobId
      setJobStatus('running')

      pollRef.current = setInterval(async () => {
        try {
          const status = await api.get(`/export/job/${jobId}`)
          setProgress(status.progress ?? 0)
          if (status.status === 'done') {
            stopPolling(); setJobStatus('done'); setProgress(100); triggerDownload(jobId)
          } else if (status.status === 'error') {
            stopPolling(); setJobStatus('error'); setErrorMsg(status.error ?? 'Export fehlgeschlagen')
          }
        } catch {
          stopPolling(); setJobStatus('error'); setErrorMsg('Verbindung zum Server verloren')
        }
      }, 1500)
    } catch (err: any) {
      setJobStatus('error')
      setErrorMsg(err?.message ?? 'Export konnte nicht gestartet werden')
    }
  }

  function triggerDownload(jobId: string) {
    const a = document.createElement('a')
    a.href = `/api/export/job/${jobId}/download`
    a.download = ''
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
  }

  function openPreview() {
    if (!selectedWerk) return
    const params = new URLSearchParams({ werkstufId: selectedWerk.id })
    window.open(`/api/export/pdf-preview?${params.toString()}`, '_blank')
  }

  const isRunning = jobStatus === 'pending' || jobStatus === 'running'
  const blockedByOffline = !isOnline && !currentFormatDef.offlineOk
  const hasAnyFilter = selectionMode === 'auswahl' && (
    szenenAuswahl.trim() || selectedRollen.size > 0 || selectedKomparsen.size > 0 || selectedMotive.size > 0
  )

  if (!isOpen) return null

  // ── Render ───────────────────────────────────────────────────────────────────

  const modal = (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 9999 }}
      />

      {/* Modal */}
      <div style={{
        position: 'fixed',
        top: '50%', left: '50%',
        transform: 'translate(-50%,-50%)',
        width: 'min(640px, 95vw)',
        maxHeight: '90vh',
        zIndex: 10000,
        background: 'var(--bg, #fff)',
        borderRadius: 12,
        boxShadow: '0 12px 48px rgba(0,0,0,0.3)',
        border: '1px solid var(--border, #e0e0e0)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', borderBottom: '1px solid var(--border)',
          background: '#111', color: '#fff', borderRadius: '12px 12px 0 0', flexShrink: 0,
        }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>
            Export
            {selectedWerk && (
              <span style={{ fontWeight: 400, opacity: 0.6, marginLeft: 8, fontSize: 12 }}>
                {selectedWerk.label || `${selectedWerk.typ} V${selectedWerk.version_nummer}`}
              </span>
            )}
          </span>
          <button onClick={onClose} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, border: 'none', background: 'rgba(255,255,255,0.12)', cursor: 'pointer', color: '#fff', borderRadius: 6 }}>
            <X size={14} />
          </button>
        </div>

        {/* Offline-Banner */}
        {!isOnline && (
          <div style={{ padding: '8px 16px', background: 'rgba(255,204,0,0.1)', borderBottom: '1px solid rgba(255,204,0,0.3)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#b8860b', flexShrink: 0 }}>
            <WifiOff size={12} />
            <strong>Offline</strong> — PDF und Vorschau nicht verfügbar
          </div>
        )}

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {!selectedWerk ? (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Keine Werkstufe ausgewählt.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

              {/* ── Linke Spalte: Dokumentstruktur ── */}
              <div>
                <span style={SEC}>Dokumentstruktur</span>

                {/* VOR HAUPTINHALT Zone */}
                <div
                  onDragOver={e => { e.preventDefault(); setDragOverZone('pre') }}
                  onDragLeave={() => setDragOverZone(null)}
                  onDrop={() => onZoneDrop('pre')}
                  style={{
                    minHeight: 36, borderRadius: 8, padding: '6px 0',
                    border: `1.5px dashed ${dragOverZone === 'pre' ? '#007AFF' : 'var(--border)'}`,
                    background: dragOverZone === 'pre' ? 'rgba(0,122,255,0.04)' : 'transparent',
                    marginBottom: 6, transition: 'border-color 0.1s, background 0.1s',
                  }}
                >
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, padding: '2px 8px 4px', opacity: 0.7 }}>
                    VOR Hauptinhalt
                  </div>
                  {preItems.map(item => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      zone="pre"
                      onToggle={() => toggleItem('pre', item.id)}
                      onDragStart={() => onItemDragStart(item.id, 'pre')}
                      onConfigureStat={() => openStatConfig(item.id)}
                    />
                  ))}
                  {preItems.length === 0 && (
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '4px 8px', fontStyle: 'italic' }}>
                      Element hierher ziehen
                    </div>
                  )}
                </div>

                {/* HAUPTINHALT */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 10px', borderRadius: 8, marginBottom: 6,
                  background: hauptinhaltAktiv ? 'rgba(0,122,255,0.06)' : 'var(--bg-subtle)',
                  border: `1px solid ${hauptinhaltAktiv ? 'rgba(0,122,255,0.3)' : 'var(--border)'}`,
                }}>
                  <input
                    type="checkbox" checked={hauptinhaltAktiv}
                    onChange={e => setHauptinhaltAktiv(e.target.checked)}
                    style={{ cursor: 'pointer', accentColor: '#007AFF', width: 14, height: 14, flexShrink: 0 }}
                  />
                  <FileText size={13} style={{ color: hauptinhaltAktiv ? '#007AFF' : 'var(--text-muted)', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: hauptinhaltAktiv ? 'var(--text-primary)' : 'var(--text-muted)', flex: 1 }}>
                    Hauptinhalt
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {selectedWerk.label || selectedWerk.typ}
                  </span>
                </div>

                {/* NACH HAUPTINHALT Zone */}
                <div
                  onDragOver={e => { e.preventDefault(); setDragOverZone('post') }}
                  onDragLeave={() => setDragOverZone(null)}
                  onDrop={() => onZoneDrop('post')}
                  style={{
                    minHeight: 36, borderRadius: 8, padding: '6px 0',
                    border: `1.5px dashed ${dragOverZone === 'post' ? '#007AFF' : 'var(--border)'}`,
                    background: dragOverZone === 'post' ? 'rgba(0,122,255,0.04)' : 'transparent',
                    transition: 'border-color 0.1s, background 0.1s',
                  }}
                >
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, padding: '2px 8px 4px', opacity: 0.7 }}>
                    NACH Hauptinhalt
                  </div>
                  {postItems.map(item => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      zone="post"
                      onToggle={() => toggleItem('post', item.id)}
                      onDragStart={() => onItemDragStart(item.id, 'post')}
                      onConfigureStat={() => openStatConfig(item.id)}
                    />
                  ))}
                  {postItems.length === 0 && (
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '4px 8px', fontStyle: 'italic' }}>
                      Element hierher ziehen
                    </div>
                  )}
                </div>

                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.4 }}>
                  Elemente per Drag &amp; Drop zwischen den Zonen verschieben.
                </div>
              </div>

              {/* ── Rechte Spalte: Export-Einstellungen ── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* Format */}
                <div>
                  <span style={SEC}>Format</span>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                    {FORMAT_DEFS.map(f => {
                      const disabled = isDisabledFormat(f)
                      const active   = format === f.value && !disabled
                      return (
                        <Tooltip key={f.value} text={!f.available ? 'Kommt bald' : disabled ? 'Nur für Drehbuch' : ''}>
                          <button
                            disabled={disabled}
                            onClick={() => !disabled && setFormat(f.value)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 5,
                              padding: '6px 9px', borderRadius: 6, fontSize: 11,
                              border: `1px solid ${active ? '#007AFF' : 'var(--border)'}`,
                              background: active ? 'rgba(0,122,255,0.08)' : 'transparent',
                              color: disabled ? 'var(--text-muted)' : active ? '#007AFF' : 'var(--text-primary)',
                              cursor: disabled ? 'not-allowed' : 'pointer',
                              fontFamily: 'inherit', fontWeight: active ? 600 : 400, opacity: disabled ? 0.45 : 1,
                            }}
                          >
                            {f.icon}{f.label}
                            {!f.available && <span style={{ fontSize: 8, marginLeft: 'auto', opacity: 0.5 }}>bald</span>}
                          </button>
                        </Tooltip>
                      )
                    })}
                  </div>
                </div>

                {/* Szenen-Auswahl */}
                <div>
                  <span style={SEC}>Szenen</span>
                  <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', marginBottom: selectionMode === 'auswahl' ? 10 : 0 }}>
                    {(['alle', 'auswahl'] as const).map(mode => (
                      <button
                        key={mode}
                        onClick={() => setSelectionMode(mode)}
                        style={{
                          flex: 1, padding: '5px 0', fontSize: 11, border: 'none',
                          background: selectionMode === mode ? '#111' : 'transparent',
                          color: selectionMode === mode ? '#fff' : 'var(--text-secondary)',
                          cursor: 'pointer', fontFamily: 'inherit', fontWeight: selectionMode === mode ? 600 : 400,
                        }}
                      >
                        {mode === 'alle' ? 'Alle' : 'Auswahl'}
                      </button>
                    ))}
                  </div>

                  {selectionMode === 'auswahl' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <input
                        type="text" value={szenenAuswahl}
                        onChange={e => setSzenenAuswahl(e.target.value)}
                        placeholder="Szenen-Nr. z. B. 1,3,5–10,42A"
                        style={{ width: '100%', padding: '5px 8px', fontSize: 11, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-canvas)', color: 'var(--text-primary)', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                      />

                      {/* Rollen-Akkordeon */}
                      {filterOptions && filterOptions.rollen.length > 0 && (
                        <FilterAccordion
                          label="Rollen" count={selectedRollen.size}
                          open={rollenOpen} onToggle={() => setRollenOpen(v => !v)}
                        >
                          <CheckList items={filterOptions.rollen} selected={selectedRollen} onToggle={v => setSelectedRollen(prev => toggle(prev, v))} />
                          {selectedRollen.size > 0 && currentFormatDef.supportsPersAusdruck && (
                            <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 10, color: '#007AFF', userSelect: 'none', marginTop: 4 }}>
                              <input type="checkbox" checked={rolleAlsVermerk} onChange={e => setRolleAlsVermerk(e.target.checked)} style={{ cursor: 'pointer', accentColor: '#007AFF', width: 11, height: 11 }} />
                              Rolle als Vermerk im pers. Ausdruck
                            </label>
                          )}
                        </FilterAccordion>
                      )}

                      {/* Komparsen-Akkordeon */}
                      {filterOptions && filterOptions.komparsen.length > 0 && (
                        <FilterAccordion
                          label="Komparsen m. Sp." count={selectedKomparsen.size}
                          open={komparsenOpen} onToggle={() => setKomparsenOpen(v => !v)}
                        >
                          <CheckList items={filterOptions.komparsen} selected={selectedKomparsen} onToggle={v => setSelectedKomparsen(prev => toggle(prev, v))} />
                        </FilterAccordion>
                      )}

                      {/* Motive-Akkordeon */}
                      {filterOptions && filterOptions.motive.length > 0 && (
                        <FilterAccordion
                          label="Motive" count={selectedMotive.size}
                          open={motiveOpen} onToggle={() => setMotiveOpen(v => !v)}
                        >
                          <CheckList items={filterOptions.motive} selected={selectedMotive} onToggle={v => setSelectedMotive(prev => toggle(prev, v))} />
                        </FilterAccordion>
                      )}

                      {hasAnyFilter && (
                        <div style={{ fontSize: 10, color: '#FF6B35', padding: '4px 7px', background: 'rgba(255,107,53,0.08)', borderRadius: 5, border: '1px solid rgba(255,107,53,0.2)' }}>
                          {[szenenAuswahl.trim() ? `Sz.\u202f${szenenAuswahl.trim()}` : null, selectedRollen.size ? `${selectedRollen.size}\u202fRolle(n)` : null, selectedKomparsen.size ? `${selectedKomparsen.size}\u202fKomp.` : null, selectedMotive.size ? `${selectedMotive.size}\u202fMotiv(e)` : null].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Persönlicher Ausdruck */}
                {currentFormatDef.supportsPersAusdruck && (
                  <div>
                    <span style={SEC}>Pers. Ausdruck <span style={{ fontWeight: 400, textTransform: 'none', marginLeft: 3, fontSize: 9 }}>(optional)</span></span>
                    <input
                      type="text" value={persAusdruck}
                      onChange={e => setPersAusdruck(e.target.value)}
                      placeholder="z. B. Maria Schulze"
                      style={{ width: '100%', padding: '6px 8px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-canvas)', color: 'var(--text-primary)', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                    />
                    {rolleAlsVermerk && selectedRollen.size > 0 && (
                      <div style={{ fontSize: 10, color: '#007AFF', marginTop: 3 }}>Chip: {buildPersAusdruck() || '–'}</div>
                    )}
                  </div>
                )}

                {/* PDF-Optionen */}
                {format === 'pdf' && (
                  <div>
                    <span style={SEC}>PDF-Optionen</span>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--text-primary)', userSelect: 'none' }}>
                      <input
                        type="checkbox" checked={pdfBookmarks}
                        onChange={e => setPdfBookmarks(e.target.checked)}
                        style={{ cursor: 'pointer', accentColor: '#007AFF', width: 13, height: 13 }}
                      />
                      <BookOpen size={12} style={{ color: pdfBookmarks ? '#007AFF' : 'var(--text-muted)' }} />
                      PDF-Lesezeichen / Inhaltsverzeichnis
                    </label>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3, marginLeft: 21 }}>
                      Erzeugt anklickbare Bookmarks im PDF-Reader
                    </div>
                  </div>
                )}

                {/* Fortschrittsbalken */}
                {(isRunning || jobStatus === 'done' || jobStatus === 'error') && (
                  <div>
                    <div style={{ height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 2, width: `${progress}%`, background: jobStatus === 'error' ? '#FF3B30' : jobStatus === 'done' ? '#00C853' : '#007AFF', transition: 'width 0.3s ease' }} />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {isRunning && <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />}
                      {jobStatus === 'done'  && <CheckCircle size={11} style={{ color: '#00C853' }} />}
                      {jobStatus === 'error' && <AlertCircle size={11} style={{ color: '#FF3B30' }} />}
                      <span style={{ color: jobStatus === 'error' ? '#FF3B30' : jobStatus === 'done' ? '#00C853' : 'var(--text-muted)' }}>
                        {jobStatus === 'pending'  ? 'Wird vorbereitet…'     :
                         jobStatus === 'running'  ? `${progress}% — Rendert…` :
                         jobStatus === 'done'     ? 'Download gestartet'    :
                         jobStatus === 'error'    ? (errorMsg ?? 'Fehler')  : ''}
                      </span>
                    </div>
                    {jobStatus === 'done' && jobIdRef.current && (
                      <button
                        onClick={() => triggerDownload(jobIdRef.current!)}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', marginTop: 6, borderRadius: 6, fontSize: 11, border: '1px solid #00C853', background: 'transparent', color: '#00C853', cursor: 'pointer', fontFamily: 'inherit' }}
                      >
                        <Download size={11} />Erneut herunterladen
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {selectedWerk && (
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', gap: 8 }}>
            {format === 'pdf' && (
              <Tooltip text={!isOnline ? 'Vorschau erfordert Internetverbindung' : 'Echte PDF-Vorschau im Browser öffnen'}>
                <button
                  onClick={openPreview}
                  disabled={isRunning || !isOnline}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 7, fontSize: 12, fontFamily: 'inherit', cursor: (isRunning || !isOnline) ? 'not-allowed' : 'pointer', border: '1px solid var(--border)', background: 'transparent', color: !isOnline ? 'var(--text-muted)' : 'var(--text-secondary)', opacity: !isOnline ? 0.5 : 1 }}
                >
                  {!isOnline ? <WifiOff size={13} /> : <Eye size={13} />}Vorschau
                </button>
              </Tooltip>
            )}
            <Tooltip text={blockedByOffline ? 'PDF-Export erfordert Internetverbindung' : ''}>
              <button
                onClick={startExport}
                disabled={isRunning || isDisabledFormat(currentFormatDef) || blockedByOffline}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, flex: 1,
                  padding: '9px 14px', borderRadius: 7, fontSize: 13, fontWeight: 600,
                  fontFamily: 'inherit', cursor: (isRunning || blockedByOffline) ? 'not-allowed' : 'pointer',
                  border: 'none',
                  background: blockedByOffline ? 'var(--bg-subtle)' : isRunning ? 'var(--bg-subtle)' : '#007AFF',
                  color: (isRunning || blockedByOffline) ? 'var(--text-muted)' : '#fff',
                  justifyContent: 'center',
                }}
              >
                {isRunning
                  ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />Exportiert…</>
                  : blockedByOffline
                  ? <><WifiOff size={14} />Offline — kein PDF</>
                  : <><Download size={14} />Exportieren ({format.toUpperCase()})</>
                }
              </button>
            </Tooltip>
          </div>
        )}

        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>

      {/* Statistik-Konfiguration Modal */}
      {statConfigItemId && (
        <StatistikModal
          onClose={() => setStatConfigItemId(null)}
          folgen={folgenForStat}
          bloecke={bloeckeForStat}
          sections={statSections}
          onExportUebernehmen={handleStatistikUebernehmen}
        />
      )}
    </>
  )

  return createPortal(modal, document.body)
}

// ── Teil-Komponenten ───────────────────────────────────────────────────────────

function ItemRow({
  item, zone, onToggle, onDragStart, onConfigureStat,
}: {
  item: ExportItem
  zone: 'pre' | 'post'
  onToggle: () => void
  onDragStart: () => void
  onConfigureStat: () => void
}) {
  const isStatistik = item.type === 'statistik'
  const isConfigured = isStatistik && !!item.statistikConfig

  return (
    <div
      draggable
      onDragStart={onDragStart}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '4px 8px', borderRadius: 5, cursor: 'grab',
        opacity: item.enabled ? 1 : 0.4,
        transition: 'opacity 0.15s',
      }}
    >
      <GripVertical size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      <input
        type="checkbox" checked={item.enabled} onChange={onToggle}
        style={{ cursor: 'pointer', accentColor: '#007AFF', width: 12, height: 12, flexShrink: 0 }}
      />
      {isStatistik
        ? <BarChart2 size={11} style={{ color: isConfigured ? '#00C853' : 'var(--text-muted)', flexShrink: 0 }} />
        : <FileText size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      }
      <span style={{ flex: 1, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>
        {item.label}
      </span>
      {isStatistik && (
        <button
          onClick={e => { e.stopPropagation(); onConfigureStat() }}
          style={{
            display: 'flex', alignItems: 'center', gap: 3, padding: '2px 6px',
            borderRadius: 4, fontSize: 10, border: `1px solid ${isConfigured ? '#00C853' : 'var(--border)'}`,
            background: isConfigured ? 'rgba(0,200,83,0.08)' : 'transparent',
            color: isConfigured ? '#00C853' : 'var(--text-secondary)',
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <Settings size={9} />
          {isConfigured ? 'konfiguriert' : 'Konfigurieren'}
        </button>
      )}
    </div>
  )
}

function FilterAccordion({
  label, count, open, onToggle, children,
}: {
  label: string; count: number; open: boolean; onToggle: () => void; children: React.ReactNode
}) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
      <button
        onClick={onToggle}
        style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '6px 8px', border: 'none', background: 'var(--bg-subtle)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
      >
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</span>
        {count > 0 && (
          <span style={{ fontSize: 10, background: '#007AFF', color: '#fff', borderRadius: 10, padding: '0 5px', lineHeight: '16px', fontWeight: 600 }}>{count}</span>
        )}
      </button>
      {open && (
        <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border)' }}>
          {children}
        </div>
      )}
    </div>
  )
}

function CheckList({ items, selected, onToggle }: {
  items: string[]; selected: Set<string>; onToggle: (v: string) => void
}) {
  if (!items.length) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {items.map(item => (
        <label key={item} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11, color: 'var(--text-primary)', userSelect: 'none', padding: '1px 0' }}>
          <input
            type="checkbox" checked={selected.has(item)} onChange={() => onToggle(item)}
            style={{ cursor: 'pointer', accentColor: '#007AFF', width: 12, height: 12, flexShrink: 0 }}
          />
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item}</span>
        </label>
      ))}
    </div>
  )
}
