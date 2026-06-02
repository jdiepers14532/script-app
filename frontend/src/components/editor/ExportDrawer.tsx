/**
 * ExportDrawer — zentriertes Export-Modal
 *
 * - Dokumentstruktur: DnD-Reihenfolge mit VOR/NACH Szenen
 * - Statistik-Element: konfigurierbar via StatistikModal
 * - Filter: Picker-Modal (Rollen / Komparsen / Motive)
 * - PDF-Lesezeichen opt-in
 * - Szenen deaktivierbar
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  X, Download, FileText, FileCode, Loader2, CheckCircle, AlertCircle,
  Eye, WifiOff, GripVertical, BarChart2, Settings, BookOpen, Filter,
  ChevronDown, Table2, List, Save, Shield,
} from 'lucide-react'
import type { WerkstufeMeta } from '../../hooks/useDokument'
import { api } from '../../api/client'
import Tooltip from '../Tooltip'
import { useSelectedProduction } from '../../contexts'
import { useTerminologie } from '../../sw-ui'
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
  type: 'notiz' | 'statistik' | 'onliner' | 'synopse' | 'fsk'
  werkstufId?: string   // Notiz-Werkstufe UUID (gesamtes Notiz-Dokument)
  szeneId?: string      // dokument_szenen.id (einzelne Notiz-Zeile aus aktueller Werkstufe)
  vorlageId?: string    // dokument_vorlagen.id (Titelseite direkt)
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
  folgeNummer: number | null
}

interface ExportPreset {
  statistik_enabled: boolean
  statistik_mode?: 'folge' | 'block'
  onliner_enabled: boolean
  onliner_mode?: 'folge' | 'block'
  synopse_enabled: boolean
  synopse_mode?: 'folge' | 'block'
  titelseite_enabled?: boolean
  fsk_enabled?: boolean
}

// ── Dateiname-Builder ──────────────────────────────────────────────────────────

type FilenameChipKey = 'titel' | 'staffel' | 'folge' | 'werkstufe' | 'fassung' | 'label' | 'datum'

interface FilenameChip {
  key: FilenameChipKey
  label: string
  enabled: boolean
}

const FILENAME_CHIP_DEFAULTS: FilenameChip[] = [
  { key: 'titel',     label: 'Titel',     enabled: true },
  { key: 'staffel',   label: 'Staffel',   enabled: true },
  { key: 'folge',     label: 'Folge',     enabled: true },
  { key: 'werkstufe', label: 'Werkstufe', enabled: true },
  { key: 'fassung',   label: 'Fassung',   enabled: true },
  { key: 'label',     label: 'Label',     enabled: true },
  { key: 'datum',     label: 'Datum',     enabled: true },
]

function formatDatumForFilename(isoDate: string | null | undefined, fmt: 'de' | 'en'): string {
  const s = isoDate ? String(isoDate).slice(0, 10) : new Date().toISOString().slice(0, 10)
  const [y, m, d] = s.split('-')
  if (!y || !m || !d) return s
  return fmt === 'de' ? `${d}.${m}.${y}` : `${m}-${d}-${y}`
}

function assembleFilename(
  chips: FilenameChip[],
  werk: WerkstufeMeta | null,
  folgeNummer: number | null,
  produktionTitel: string,
  staffelnummer: number | null,
  datumsformat: 'de' | 'en',
  ext: string,
  drehbuchLabel: string,
): string {
  if (!werk) return `export.${ext}`
  const typLabel = werk.typ === 'drehbuch' ? drehbuchLabel
    : werk.typ === 'storyline' ? 'Storyline' : 'Notiz'
  const values: Record<FilenameChipKey, string> = {
    titel:     produktionTitel,
    staffel:   staffelnummer != null ? `S${staffelnummer}` : '',
    folge:     String(folgeNummer),
    werkstufe: typLabel,
    fassung:   `V${werk.version_nummer}`,
    label:     werk.label ?? '',
    datum:     formatDatumForFilename(werk.stand_datum ?? werk.erstellt_am, datumsformat),
  }
  const parts = chips.filter(c => c.enabled).map(c => values[c.key]).filter(Boolean)
  return (parts.join(' - ').replace(/[/\\:*?"<>|]/g, '_') || 'export') + `.${ext}`
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

export default function ExportDrawer({ isOpen, onClose, selectedWerk, werkstufen, produktionId, folgeNummer }: Props) {
  const { selectedProduction } = useSelectedProduction()
  const { t } = useTerminologie()

  // Basis
  const [format, setFormat]                       = useState<ExportFormat>('pdf')
  const [isOnline, setIsOnline]                   = useState(navigator.onLine)
  const [persAusdruck, setPersAusdruck]           = useState('')
  const [jobStatus, setJobStatus]                 = useState<JobStatus>('idle')
  const [progress, setProgress]                   = useState(0)
  const [errorMsg, setErrorMsg]                   = useState<string | null>(null)

  // Dateiname-Builder
  const [filenameChips, setFilenameChips]         = useState<FilenameChip[]>(FILENAME_CHIP_DEFAULTS)
  const [chipDragIdx, setChipDragIdx]             = useState<number | null>(null)
  const [datumsformat, setDatumsformat]           = useState<'de' | 'en'>('de')
  const saveAsModeRef                             = useRef(false)
  const [saveAsMode, setSaveAsMode]               = useState(false)
  const dirHandleRef                              = useRef<any>(null)
  const [savedDirName, setSavedDirName]           = useState<string | null>(null)

  // Offene Wasserzeichen
  const [wzKleinAktiv, setWzKleinAktiv]           = useState(false)
  const [wzGrossAktiv, setWzGrossAktiv]           = useState(false)
  const [wzGrossFarbe, setWzGrossFarbe]           = useState('#CCCCCC')

  // Szenen-Filter
  const [szenenAuswahl, setSzenenAuswahl]         = useState('')
  const [filterOptions, setFilterOptions]         = useState<FilterOptions | null>(null)
  const [selectedRollen, setSelectedRollen]       = useState<Set<string>>(new Set())
  const [selectedKomparsen, setSelectedKomparsen] = useState<Set<string>>(new Set())
  const [selectedMotive, setSelectedMotive]       = useState<Set<string>>(new Set())
  const [rolleAlsVermerk, setRolleAlsVermerk]     = useState(false)

  // Filter-Picker Modal
  const [filterPickerOpen, setFilterPickerOpen]   = useState<'rollen' | 'komparsen' | 'motive' | null>(null)

  // Dokumentstruktur
  const [preItems, setPreItems]                   = useState<ExportItem[]>([])
  const [postItems, setPostItems]                 = useState<ExportItem[]>([])
  const [szenenAktiv, setSzenenAktiv]             = useState(true)
  const [pdfBookmarks, setPdfBookmarks]           = useState(false)

  // PDF-Layout / KZ-FZ
  const [pdfOrientation, setPdfOrientation]       = useState<'portrait' | 'landscape'>('portrait')
  const [kzFzModus, setKzFzModus]                 = useState<'standard' | 'kz' | 'fz' | 'keine'>('standard')
  const [fzText, setFzText]                       = useState('')

  // Statistik / Folge-Picker Modal
  const [statConfigItemId, setStatConfigItemId]     = useState<string | null>(null)
  const [statConfigItemType, setStatConfigItemType] = useState<'statistik' | 'onliner' | 'synopse'>('statistik')
  const [folgenForStat, setFolgenForStat]           = useState<any[]>([])
  const [bloeckeForStat, setBloeckeForStat]         = useState<any[]>([])
  const [statSections]                              = useState<StatModalSection[]>(DEFAULT_SECTIONS)

  // DnD
  const dragItemRef      = useRef<{ id: string; zone: 'pre' | 'post' } | null>(null)
  const [dragOverZone, setDragOverZone] = useState<'pre' | 'post' | null>(null)

  // Jobs
  const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const jobIdRef = useRef<string | null>(null)

  const notizWerkstufen = werkstufen.filter(w => w.typ === 'notiz')

  // Beim Öffnen initialisieren — nicht zurücksetzen wenn ein Job läuft
  useEffect(() => {
    if (!isOpen || !selectedWerk) return
    if (jobStatus === 'running' || jobStatus === 'pending') return
    setJobStatus('idle'); setProgress(0); setErrorMsg(null)
    setSzenenAuswahl('')
    setSelectedRollen(new Set()); setSelectedKomparsen(new Set()); setSelectedMotive(new Set())
    setRolleAlsVermerk(false)
    setSzenenAktiv(true); setPdfBookmarks(true)
    setWzKleinAktiv(false); setWzGrossAktiv(false); setWzGrossFarbe('#CCCCCC')
    setPdfOrientation('portrait'); setKzFzModus('standard'); setFzText('')
    fetch('https://auth.serienwerft.studio/api/public/company-info')
      .then(r => r.ok ? r.json() : null)
      .then((d: any) => { if (d?.company_name) setFzText(d.company_name) })
      .catch(() => {})

    // Notiz-Werkstufen als Pre-Items (gesamte Notiz-Dokumente)
    const notizWerkItems: ExportItem[] = notizWerkstufen.map(w => ({
      id: genId(), type: 'notiz', werkstufId: w.id,
      label: w.label || `${w.typ === 'notiz' ? 'Notiz' : 'Dokument'} V${w.version_nummer}`, enabled: true,
    }))

    // Placeholder bis alle Daten geladen sind
    setPreItems([...notizWerkItems,
      { id: genId(), type: 'statistik', label: 'Statistik (Konfiguration nötig)', enabled: false },
      { id: genId(), type: 'onliner',   label: 'Onliner (Konfiguration nötig)',   enabled: false },
      { id: genId(), type: 'synopse',   label: 'Synopsen (Konfiguration nötig)',  enabled: false },
      { id: genId(), type: 'fsk',       label: 'FSK & Inhaltskennzeichnung',      enabled: false },
    ])
    setPostItems([])

    const folgeId = selectedWerk.folge_id
    const defaultSections = DEFAULT_SECTIONS.map((s: StatModalSection) => s.id)

    const buildAutoConfig = (
      type: 'statistik' | 'onliner' | 'synopse',
      enabled: boolean,
      mode?: 'folge' | 'block'
    ): Partial<ExportItem> => {
      if (!enabled) return { enabled: false }
      if (folgeId && (mode === 'folge' || !mode)) {
        const config: StatistikExportConfig = {
          folge_ids: [folgeId], folge_nummer: folgeNummer ?? undefined, mode: 'folge', sections: defaultSections,
        }
        const prefix = type === 'onliner' ? 'Onliner' : type === 'synopse' ? 'Synopsen' : 'Statistik'
        return { enabled: true, statistikConfig: config, label: `${prefix} Folge ${folgeNummer}` }
      }
      return { enabled: true }
    }

    // Alles parallel laden — einmaliger setPreItems-Aufruf, keine Race Conditions
    Promise.all([
      api.getSettings().catch(() => null),
      api.getExportTitelseiteVorlagen(produktionId).catch(() => [] as { id: string; name: string }[]),
      selectedWerk.typ !== 'notiz'
        ? api.getExportNotizSzenen(selectedWerk.id).catch(() => null)
        : Promise.resolve(null),
    ]).then(([settings, titelseiteRows, notizResult]) => {
      const preset: Partial<ExportPreset> = (settings as any)?.ui_settings?.[`export_preset_${produktionId}`] ?? {}

      // Notiz-Szenen-Items sortieren
      const notizPreAdd: ExportItem[] = []
      const notizPostAdd: ExportItem[] = []
      if ((notizResult as any)?.items?.length) {
        for (const it of (notizResult as any).items) {
          const item: ExportItem = { id: genId(), type: 'notiz', szeneId: it.id, label: it.label, enabled: true }
          const min = (notizResult as any).blockSortOrderMin
          if (min == null || it.sort_order < min) notizPreAdd.push(item)
          else notizPostAdd.push(item)
        }
      }

      // Titelseite-Items aus Vorlagen — enabled-Status aus Preset
      const titelseiteItems: ExportItem[] = (titelseiteRows ?? []).map(v => ({
        id: genId(), type: 'notiz' as const, vorlageId: v.id, label: v.name,
        enabled: preset.titelseite_enabled ?? true,
      }))

      setPreItems([
        ...titelseiteItems,
        ...notizPreAdd,
        ...notizWerkItems,
        { id: genId(), type: 'statistik', label: 'Statistik (Konfiguration nötig)', enabled: false,
          ...buildAutoConfig('statistik', preset.statistik_enabled ?? false, preset.statistik_mode) },
        { id: genId(), type: 'onliner',   label: 'Onliner (Konfiguration nötig)',   enabled: false,
          ...buildAutoConfig('onliner',   preset.onliner_enabled ?? false,   preset.onliner_mode) },
        { id: genId(), type: 'synopse',   label: 'Synopsen (Konfiguration nötig)',  enabled: false,
          ...buildAutoConfig('synopse',   preset.synopse_enabled ?? false,   preset.synopse_mode) },
        { id: genId(), type: 'fsk',       label: 'FSK & Inhaltskennzeichnung',      enabled: preset.fsk_enabled ?? false },
      ])
      if (notizPostAdd.length) setPostItems(notizPostAdd)
    })

    // Filter-Optionen laden
    setFilterOptions(null)
    api.get(`/export/filter-options?werkstufId=${selectedWerk.id}`)
      .then((data: any) => setFilterOptions({
        rollen:    data.rollen    ?? [],
        komparsen: data.komparsen ?? [],
        motive:    data.motive    ?? [],
      }))
      .catch(() => setFilterOptions({ rollen: [], komparsen: [], motive: [] }))

    // Datumsformat für Dateiname-Builder laden
    api.get(`/dk-settings/${encodeURIComponent(produktionId)}/app-settings`)
      .then((data: any) => { if (data?.datumsformat === 'en') setDatumsformat('en') })
      .catch(() => {})
  }, [isOpen, selectedWerk?.id])

  // Polling beim Schließen NICHT stoppen — Hintergrund-Export läuft weiter

  useEffect(() => {
    const on  = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  // Statistik / Onliner / Synopsen: Folgen + Blöcke laden wenn noch nicht geladen
  const openStatConfig = useCallback(async (itemId: string, itemType: 'statistik' | 'onliner' | 'synopse' = 'statistik') => {
    if (!folgenForStat.length) {
      try {
        const [f, b] = await Promise.all([
          api.getFolgenV2(produktionId),
          api.getBloecke(produktionId),
        ])
        // Freie Dokumente (ist_frei=true / folge_nummer=null) für Onliner/Synopsen ausschließen
        setFolgenForStat(f.filter((folge: any) => !folge.ist_frei && folge.folge_nummer != null))
        setBloeckeForStat(b)
      } catch {
        setFolgenForStat([]); setBloeckeForStat([])
      }
    }
    setStatConfigItemId(itemId)
    setStatConfigItemType(itemType)
  }, [folgenForStat.length, produktionId])

  const handleStatistikUebernehmen = useCallback((config: StatistikExportConfig) => {
    if (!statConfigItemId) return
    const suffix = config.mode === 'block' ? `Block ${config.folge_nummer}` : `Folge ${config.folge_nummer}`
    const id = statConfigItemId
    const updateItems = (items: ExportItem[]) =>
      items.map(it => {
        if (it.id !== id) return it
        const prefix = it.type === 'onliner' ? 'Onliner' : it.type === 'synopse' ? 'Synopsen' : 'Statistik'
        return { ...it, enabled: true, statistikConfig: config, label: `${prefix} ${suffix}` }
      })
    const newPre = updateItems(preItems)
    const newPost = updateItems(postItems)
    setPreItems(newPre)
    setPostItems(newPost)
    // Preset mit Mode speichern
    const allItems = [...newPre, ...newPost]
    const stat = allItems.find(it => it.type === 'statistik')
    const onl  = allItems.find(it => it.type === 'onliner')
    const syn  = allItems.find(it => it.type === 'synopse')
    const tit  = allItems.find(it => it.vorlageId != null)
    const preset: ExportPreset = {
      statistik_enabled: stat?.enabled ?? false,
      statistik_mode:    stat?.statistikConfig?.mode,
      onliner_enabled:   onl?.enabled ?? false,
      onliner_mode:      onl?.statistikConfig?.mode,
      synopse_enabled:   syn?.enabled ?? false,
      synopse_mode:      syn?.statistikConfig?.mode,
      titelseite_enabled: tit?.enabled ?? false,
      fsk_enabled: allItems.find(it => it.type === 'fsk')?.enabled ?? false,
    }
    api.updateSettings({ ui_settings: { [`export_preset_${produktionId}`]: preset } }).catch(() => {})
    setStatConfigItemId(null)
  }, [statConfigItemId, preItems, postItems, produktionId])

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
    if (!item || src.zone === targetZone) return
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
    setter(prev => {
      const next = prev.map(it => it.id === id ? { ...it, enabled: !it.enabled } : it)
      const changed = next.find(it => it.id === id)
      const shouldSavePreset =
        changed?.type === 'statistik' || changed?.type === 'onliner' || changed?.type === 'synopse' ||
        changed?.type === 'fsk' || changed?.vorlageId != null
      if (shouldSavePreset) {
        const allItems = zone === 'pre' ? [...next, ...postItems] : [...preItems, ...next]
        const stat = allItems.find(it => it.type === 'statistik')
        const onl  = allItems.find(it => it.type === 'onliner')
        const syn  = allItems.find(it => it.type === 'synopse')
        const tit  = allItems.find(it => it.vorlageId != null)
        const preset: ExportPreset = {
          statistik_enabled: stat?.enabled ?? false,
          statistik_mode:    stat?.statistikConfig?.mode,
          onliner_enabled:   onl?.enabled ?? false,
          onliner_mode:      onl?.statistikConfig?.mode,
          synopse_enabled:   syn?.enabled ?? false,
          synopse_mode:      syn?.statistikConfig?.mode,
          titelseite_enabled: tit?.enabled ?? false,
          fsk_enabled: allItems.find(it => it.type === 'fsk')?.enabled ?? false,
        }
        api.updateSettings({ ui_settings: { [`export_preset_${produktionId}`]: preset } }).catch(() => {})
      }
      return next
    })
  }

  // ── Export starten ──────────────────────────────────────────────────────────

  async function startExport() {
    if (!selectedWerk || jobStatus === 'running' || jobStatus === 'pending') return
    setJobStatus('pending'); setProgress(0); setErrorMsg(null)

    try {
      const body: any = {
        werkstufId: selectedWerk.id,
        format,
        options: {
          preItems:  preItems.filter(i => i.enabled).map(it => ({
            type: it.type, id: it.werkstufId, szeneId: it.szeneId, vorlageId: it.vorlageId, label: it.label, enabled: true,
            statistikConfig: it.statistikConfig,
          })),
          postItems: postItems.filter(i => i.enabled).map(it => ({
            type: it.type, id: it.werkstufId, szeneId: it.szeneId, vorlageId: it.vorlageId, label: it.label, enabled: true,
            statistikConfig: it.statistikConfig,
          })),
          hauptinhaltAktiv: szenenAktiv,
          pdfBookmarks,
          persoenlicher_ausdruck: currentFormatDef.supportsPersAusdruck ? buildPersAusdruck() : undefined,
          szenenAuswahl:   szenenAuswahl.trim() || undefined,
          filterRollen:    selectedRollen.size > 0 ? Array.from(selectedRollen) : undefined,
          filterKomparsen: selectedKomparsen.size > 0 ? Array.from(selectedKomparsen) : undefined,
          filterMotive:    selectedMotive.size > 0 ? Array.from(selectedMotive) : undefined,
          userTimezone:    Intl.DateTimeFormat().resolvedOptions().timeZone,
          wz_klein_aktiv:  format === 'pdf' ? (wzKleinAktiv && !!buildPersAusdruck()) : undefined,
          wz_gross_aktiv:  format === 'pdf' ? (wzGrossAktiv && !!buildPersAusdruck()) : undefined,
          wz_gross_farbe:  format === 'pdf' && wzGrossAktiv ? wzGrossFarbe : undefined,
          pdfLandscape:    format === 'pdf' ? (pdfOrientation === 'landscape') : undefined,
          kzAktivOverride: format === 'pdf' && kzFzModus !== 'standard' ? (kzFzModus === 'kz') : undefined,
          fzAktivOverride: format === 'pdf' && kzFzModus !== 'standard' ? (kzFzModus === 'fz') : undefined,
          fzTextOverride:  format === 'pdf' && kzFzModus === 'fz' && fzText.trim() ? fzText.trim() : undefined,
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

  async function triggerDownload(jobId: string) {
    // Vorausgewählter Speicherort via showSaveFilePicker
    if (dirHandleRef.current) {
      try {
        const res = await fetch(`/api/export/job/${jobId}/download`, { credentials: 'include' })
        if (!res.ok) { setJobStatus('error'); setErrorMsg(`Download fehlgeschlagen (${res.status})`); return }
        const blob = await res.blob()
        const writable = await dirHandleRef.current.createWritable()
        await writable.write(blob)
        await writable.close()
        dirHandleRef.current = null
        setSavedDirName(null)
        return
      } catch (e: any) {
        if (e.name !== 'AbortError') { setJobStatus('error'); setErrorMsg('Speichern am gewählten Pfad fehlgeschlagen') }
        return
      }
    }
    if (saveAsModeRef.current) {
      saveAsModeRef.current = false
      setSaveAsMode(false)
      return triggerSaveAs(jobId)
    }
    try {
      const res = await fetch(`/api/export/job/${jobId}/download`, { credentials: 'include' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        setJobStatus('error')
        setErrorMsg(err.error || `Download fehlgeschlagen (${res.status})`)
        return
      }
      const blob = await res.blob()
      // octet-stream verhindert, dass der Browser die PDF automatisch öffnet
      const downloadBlob = new Blob([await blob.arrayBuffer()], { type: 'application/octet-stream' })
      const url = URL.createObjectURL(downloadBlob)
      const a = document.createElement('a')
      a.href = url; a.download = customFilename
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 10000)
    } catch {
      setJobStatus('error')
      setErrorMsg('Download fehlgeschlagen — Verbindung zum Server verloren')
    }
  }

  async function openPreview() {
    if (!selectedWerk) return
    // Fenster SYNCHRON öffnen (im User-Gesture-Kontext) — sonst blockiert der
    // Browser-Popup-Blocker window.open() nach dem asynchronen fetch().
    const win = window.open('', '_blank')
    if (win) {
      win.document.write(
        '<html><body style="margin:0;background:#555;height:100vh;display:flex;' +
        'align-items:center;justify-content:center;color:#fff;font-family:sans-serif;font-size:14px">' +
        'PDF wird generiert\u2026</body></html>'
      )
    }
    try {
      const body = {
        werkstufId: selectedWerk.id,
        options: {
          preItems:  preItems.filter(i => i.enabled).map(it => ({
            type: it.type, id: it.werkstufId, szeneId: it.szeneId, vorlageId: it.vorlageId, label: it.label, enabled: true,
            statistikConfig: it.statistikConfig,
          })),
          postItems: postItems.filter(i => i.enabled).map(it => ({
            type: it.type, id: it.werkstufId, szeneId: it.szeneId, vorlageId: it.vorlageId, label: it.label, enabled: true,
            statistikConfig: it.statistikConfig,
          })),
          hauptinhaltAktiv: szenenAktiv,
          szenenAuswahl:   szenenAuswahl.trim() || undefined,
          filterRollen:    selectedRollen.size > 0    ? Array.from(selectedRollen)    : undefined,
          filterKomparsen: selectedKomparsen.size > 0 ? Array.from(selectedKomparsen) : undefined,
          filterMotive:    selectedMotive.size > 0    ? Array.from(selectedMotive)    : undefined,
          persoenlicher_ausdruck: buildPersAusdruck(),
          wz_klein_aktiv:  wzKleinAktiv && !!buildPersAusdruck(),
          wz_gross_aktiv:  wzGrossAktiv && !!buildPersAusdruck(),
          wz_gross_farbe:  wzGrossAktiv ? wzGrossFarbe : undefined,
          pdfLandscape:    pdfOrientation === 'landscape',
          kzAktivOverride: kzFzModus !== 'standard' ? (kzFzModus === 'kz') : undefined,
          fzAktivOverride: kzFzModus !== 'standard' ? (kzFzModus === 'fz') : undefined,
          fzTextOverride:  kzFzModus === 'fz' && fzText.trim() ? fzText.trim() : undefined,
        },
      }
      const res = await fetch('/api/export/pdf-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('PDF-Vorschau fehlgeschlagen')
      const pdfBlob = await res.blob()
      const url = URL.createObjectURL(pdfBlob)
      if (win) win.location.href = url
      else window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 120_000)
    } catch {
      const fallback = `/api/export/preview?werkstufId=${selectedWerk.id}`
      if (win) win.location.href = fallback
      else window.open(fallback, '_blank')
    }
  }

  // ── Dateiname-Builder ─────────────────────────────────────────────────────

  const extForFormat: Record<ExportFormat, string> = { pdf: 'pdf', docx: 'docx', fountain: 'fountain', fdx: 'fdx' }

  const customFilename = useMemo(() => assembleFilename(
    filenameChips,
    selectedWerk,
    folgeNummer,
    selectedProduction?.title ?? '',
    selectedProduction?.staffelnummer ?? null,
    datumsformat,
    extForFormat[format],
    t('drehbuch'),
  ), [filenameChips, selectedWerk, folgeNummer, selectedProduction, datumsformat, format, t])

  async function chooseSavePath() {
    if (!('showSaveFilePicker' in window)) {
      alert('Pfadauswahl wird nur in Chrome/Edge unterstützt.')
      return
    }
    const mimeTypes: Record<ExportFormat, Record<string, string[]>> = {
      pdf:      { 'application/pdf': ['.pdf'] },
      docx:     { 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] },
      fountain: { 'text/plain': ['.fountain'] },
      fdx:      { 'text/xml': ['.fdx'] },
    }
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: customFilename,
        types: [{ description: 'Dokument', accept: mimeTypes[format] }],
      })
      dirHandleRef.current = handle
      setSavedDirName(handle.name)
    } catch (e: any) {
      if (e.name !== 'AbortError') console.warn('Pfadauswahl fehlgeschlagen', e)
    }
  }

  async function triggerSaveAs(jobId: string) {
    try {
      const res = await fetch(`/api/export/job/${jobId}/download`, { credentials: 'include' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        setJobStatus('error'); setErrorMsg(err.error || `Download fehlgeschlagen (${res.status})`); return
      }
      const blob = await res.blob()
      if ('showSaveFilePicker' in window) {
        try {
          const mimeTypes: Record<ExportFormat, Record<string, string[]>> = {
            pdf: { 'application/pdf': ['.pdf'] },
            docx: { 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] },
            fountain: { 'text/plain': ['.fountain'] },
            fdx: { 'text/xml': ['.fdx'] },
          }
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: customFilename,
            types: [{ description: 'Dokument', accept: mimeTypes[format] }],
          })
          const writable = await handle.createWritable()
          await writable.write(blob)
          await writable.close()
          return
        } catch (e: any) {
          if (e.name === 'AbortError') return // Nutzer hat abgebrochen
          // Fallback auf normalen Download
        }
      }
      const downloadBlob = new Blob([await blob.arrayBuffer()], { type: 'application/octet-stream' })
      const url = URL.createObjectURL(downloadBlob)
      const a = document.createElement('a')
      a.href = url; a.download = customFilename
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 10000)
    } catch {
      setJobStatus('error'); setErrorMsg('Download fehlgeschlagen')
    }
  }

  // ── Header-Label-Aufbau ───────────────────────────────────────────────────

  function buildHeaderSub(): string {
    if (!selectedWerk) return ''
    const typ = selectedWerk.typ === 'drehbuch' ? t('drehbuch')
      : selectedWerk.typ === 'storyline' ? 'Storyline'
      : selectedWerk.typ === 'notiz' ? 'Notiz' : selectedWerk.typ
    const ver = `V${selectedWerk.version_nummer}`
    const lbl = selectedWerk.label ? ` · ${selectedWerk.label}` : ''
    return `${typ} ${ver}${lbl}`
  }

  const isRunning = jobStatus === 'pending' || jobStatus === 'running'
  const blockedByOffline = !isOnline && !currentFormatDef.offlineOk
  const hasAnyFilter = !!(szenenAuswahl.trim() || selectedRollen.size > 0 || selectedKomparsen.size > 0 || selectedMotive.size > 0)

  // ── Floating Pill (Drawer geschlossen, Job läuft im Hintergrund) ─────────────
  if (!isOpen) {
    const bgActive = jobStatus === 'running' || jobStatus === 'pending' || jobStatus === 'done' || jobStatus === 'error'
    if (!bgActive) return null
    return createPortal(
      <div style={{
        position: 'fixed', bottom: 20, right: 20, zIndex: 10001,
        background: 'var(--bg, #fff)', borderRadius: 10,
        boxShadow: '0 4px 24px rgba(0,0,0,0.22)',
        border: '1px solid var(--border, #e0e0e0)',
        padding: '12px 14px', minWidth: 240, maxWidth: 300,
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            {isRunning   && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite', color: '#007AFF', flexShrink: 0 }} />}
            {jobStatus === 'done'  && <CheckCircle size={14} style={{ color: '#00C853', flexShrink: 0 }} />}
            {jobStatus === 'error' && <AlertCircle size={14} style={{ color: '#FF3B30', flexShrink: 0 }} />}
            <span>{isRunning ? 'PDF wird exportiert…' : jobStatus === 'done' ? 'PDF erstellt & heruntergeladen' : 'Export fehlgeschlagen'}</span>
          </div>
          {(jobStatus === 'done' || jobStatus === 'error') && (
            <button onClick={() => { setJobStatus('idle'); setProgress(0); setErrorMsg(null) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, display: 'flex' }}>
              <X size={14} />
            </button>
          )}
        </div>
        {isRunning && (
          <div>
            <div style={{ height: 3, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progress}%`, background: '#007AFF', borderRadius: 2, transition: 'width 0.3s ease' }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{progress}%</div>
          </div>
        )}
        {jobStatus === 'done' && (
          <button onClick={() => { setJobStatus('idle'); setProgress(0); setErrorMsg(null) }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '7px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600, background: '#00C853', color: '#fff', border: 'none', cursor: 'pointer' }}>
            OK
          </button>
        )}
        {jobStatus === 'error' && <div style={{ fontSize: 11, color: '#FF3B30' }}>{errorMsg}</div>}
      </div>,
      document.body
    )
  }

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
        width: 'min(680px, 95vw)',
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
          <div>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Export</span>
            {selectedWerk && (
              <span style={{ fontWeight: 400, opacity: 0.55, marginLeft: 8, fontSize: 11 }}>
                {buildHeaderSub()}
              </span>
            )}
          </div>
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
            <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

              {/* ── Linke Spalte: Dokumentstruktur ── */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ ...SEC, marginBottom: 0 }}>Dokumentstruktur</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      onClick={() => { setPreItems(p => p.map(i => ({ ...i, enabled: true }))); setPostItems(p => p.map(i => ({ ...i, enabled: true }))) }}
                      style={{ fontSize: 10, padding: '1px 7px', borderRadius: 4, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontFamily: 'inherit' }}
                    >Alle</button>
                    <button
                      onClick={() => { setPreItems(p => p.map(i => ({ ...i, enabled: false }))); setPostItems(p => p.map(i => ({ ...i, enabled: false }))) }}
                      style={{ fontSize: 10, padding: '1px 7px', borderRadius: 4, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontFamily: 'inherit' }}
                    >Keine</button>
                  </div>
                </div>

              {/* VOR SZENEN Zone */}
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
                    VOR Szenen
                  </div>
                  {preItems.map(item => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      zone="pre"
                      onToggle={() => toggleItem('pre', item.id)}
                      onDragStart={() => onItemDragStart(item.id, 'pre')}
                      onConfigureStat={() => openStatConfig(item.id, item.type as 'statistik' | 'onliner' | 'synopse')}
                    />
                  ))}
                  {preItems.length === 0 && (
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '4px 8px', fontStyle: 'italic' }}>
                      Element hierher ziehen
                    </div>
                  )}
                </div>

                {/* SZENEN-BLOCK */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 10px', borderRadius: 8, marginBottom: 6,
                  background: szenenAktiv ? 'rgba(0,122,255,0.06)' : 'var(--bg-subtle)',
                  border: `1px solid ${szenenAktiv ? 'rgba(0,122,255,0.3)' : 'var(--border)'}`,
                }}>
                  <input
                    type="checkbox" checked={szenenAktiv}
                    onChange={e => setSzenenAktiv(e.target.checked)}
                    style={{ cursor: 'pointer', accentColor: '#007AFF', width: 14, height: 14, flexShrink: 0 }}
                  />
                  <FileText size={13} style={{ color: szenenAktiv ? '#007AFF' : 'var(--text-muted)', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: szenenAktiv ? 'var(--text-primary)' : 'var(--text-muted)', flex: 1 }}>
                    Szenen
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {selectedWerk.label || selectedWerk.typ}
                  </span>
                </div>

                {/* NACH SZENEN Zone */}
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
                    NACH Szenen
                  </div>
                  {postItems.map(item => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      zone="post"
                      onToggle={() => toggleItem('post', item.id)}
                      onDragStart={() => onItemDragStart(item.id, 'post')}
                      onConfigureStat={() => openStatConfig(item.id, item.type as 'statistik' | 'onliner' | 'synopse')}
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

                {/* PDF-Optionen */}
                {format === 'pdf' && (
                  <div style={{ marginTop: 14 }}>
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
                        <Tooltip key={f.value} placement="bottom" text={!f.available ? 'Kommt bald' : disabled ? `Nur für ${t('drehbuch')}` : ''}>
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

                {/* Seitenlayout — nur PDF */}
                {format === 'pdf' && (
                  <div>
                    <span style={SEC}>Seitenlayout</span>
                    <div style={{ display: 'flex', gap: 5 }}>
                      {(['portrait', 'landscape'] as const).map(ori => {
                        const active = pdfOrientation === ori
                        return (
                          <button
                            key={ori}
                            onClick={() => setPdfOrientation(ori)}
                            style={{
                              flex: 1, padding: '6px 9px', borderRadius: 6, fontSize: 11,
                              border: `1px solid ${active ? '#007AFF' : 'var(--border)'}`,
                              background: active ? 'rgba(0,122,255,0.08)' : 'transparent',
                              color: active ? '#007AFF' : 'var(--text-primary)',
                              cursor: 'pointer', fontFamily: 'inherit', fontWeight: active ? 600 : 400,
                            }}
                          >
                            {ori === 'portrait' ? '↕ Hochformat' : '↔ Querformat'}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Kopf-/Fußzeile — nur PDF */}
                {format === 'pdf' && (
                  <div style={{ paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                    <span style={SEC}>Kopf-/Fußzeile</span>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 6 }}>
                      {([
                        { val: 'standard', label: 'Standard' },
                        { val: 'kz',       label: 'Nur KZ' },
                        { val: 'fz',       label: 'Nur FZ' },
                        { val: 'keine',    label: 'Keine' },
                      ] as const).map(opt => {
                        const active = kzFzModus === opt.val
                        return (
                          <button
                            key={opt.val}
                            onClick={() => setKzFzModus(opt.val)}
                            style={{
                              padding: '5px 8px', borderRadius: 6, fontSize: 11,
                              border: `1px solid ${active ? '#007AFF' : 'var(--border)'}`,
                              background: active ? 'rgba(0,122,255,0.08)' : 'transparent',
                              color: active ? '#007AFF' : 'var(--text-primary)',
                              cursor: 'pointer', fontFamily: 'inherit', fontWeight: active ? 600 : 400,
                            }}
                          >
                            {opt.label}
                          </button>
                        )
                      })}
                    </div>
                    {kzFzModus === 'standard' && (
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        KZ + FZ gemäß DK-Einstellungen
                      </div>
                    )}
                    {kzFzModus === 'fz' && (
                      <textarea
                        value={fzText}
                        onChange={e => setFzText(e.target.value)}
                        placeholder="Fußzeilen-Text (leer = Fußzeile ohne Inhalt)"
                        rows={2}
                        style={{
                          width: '100%', padding: '5px 8px', fontSize: 11,
                          border: '1px solid var(--border)', borderRadius: 6,
                          background: 'var(--bg-canvas)', color: 'var(--text-primary)',
                          fontFamily: 'inherit', resize: 'vertical', outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    )}
                  </div>
                )}

                {/* Szenen-Filter */}
                <div>
                  <span style={SEC}>Szenen-Filter <span style={{ fontWeight: 400, textTransform: 'none', marginLeft: 3, fontSize: 9 }}>(optional)</span></span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input
                      type="text" value={szenenAuswahl}
                      onChange={e => setSzenenAuswahl(e.target.value)}
                      placeholder="Szenen-Nr. z. B. 1,3,5–10,42A"
                      style={{ width: '100%', padding: '5px 8px', fontSize: 11, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-canvas)', color: 'var(--text-primary)', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                    />

                    {/* Filter-Picker Buttons */}
                    {filterOptions && (filterOptions.rollen.length > 0 || filterOptions.komparsen.length > 0 || filterOptions.motive.length > 0) && (
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {filterOptions.rollen.length > 0 && (
                          <FilterPickerButton
                            label="Rollen"
                            count={selectedRollen.size}
                            onClick={() => setFilterPickerOpen('rollen')}
                          />
                        )}
                        {filterOptions.komparsen.length > 0 && (
                          <FilterPickerButton
                            label="Komparsen"
                            count={selectedKomparsen.size}
                            onClick={() => setFilterPickerOpen('komparsen')}
                          />
                        )}
                        {filterOptions.motive.length > 0 && (
                          <FilterPickerButton
                            label="Motive"
                            count={selectedMotive.size}
                            onClick={() => setFilterPickerOpen('motive')}
                          />
                        )}
                      </div>
                    )}

                    {hasAnyFilter && (
                      <div style={{ fontSize: 10, color: '#FF6B35', padding: '4px 7px', background: 'rgba(255,107,53,0.08)', borderRadius: 5, border: '1px solid rgba(255,107,53,0.2)' }}>
                        {[szenenAuswahl.trim() ? `Sz.\u202f${szenenAuswahl.trim()}` : null, selectedRollen.size ? `${selectedRollen.size}\u202fRolle(n)` : null, selectedKomparsen.size ? `${selectedKomparsen.size}\u202fKomp.` : null, selectedMotive.size ? `${selectedMotive.size}\u202fMotiv(e)` : null].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </div>
                </div>

                {/* Persönlicher Ausdruck */}
                {currentFormatDef.supportsPersAusdruck && (
                  <div>
                    <Tooltip placement="right" text={'Erscheint im Textfeld "pers. Ausdruck" wenn in Dokumentenvorlage so angelegt.'}>
                      <span style={SEC}>Pers. Ausdruck <span style={{ fontWeight: 400, textTransform: 'none', marginLeft: 3, fontSize: 9 }}>(optional)</span></span>
                    </Tooltip>
                    <input
                      type="text" value={persAusdruck}
                      onChange={e => {
                        const val = e.target.value
                        setPersAusdruck(val)
                        if (val.trim() && !wzKleinAktiv) setWzKleinAktiv(true)
                      }}
                      placeholder="z. B. Maria Schulze"
                      style={{ width: '100%', padding: '6px 8px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-canvas)', color: 'var(--text-primary)', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                    />
                    {rolleAlsVermerk && selectedRollen.size > 0 && (
                      <div style={{ fontSize: 10, color: '#007AFF', marginTop: 3 }}>Chip: {buildPersAusdruck() || '–'}</div>
                    )}
                    {selectedRollen.size > 0 && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 10, color: '#007AFF', userSelect: 'none', marginTop: 5 }}>
                        <input type="checkbox" checked={rolleAlsVermerk} onChange={e => setRolleAlsVermerk(e.target.checked)} style={{ cursor: 'pointer', accentColor: '#007AFF', width: 11, height: 11 }} />
                        Rolle als Vermerk einfügen
                      </label>
                    )}
                  </div>
                )}

                {/* Wasserzeichen (nur PDF) */}
                {format === 'pdf' && (
                  <>
                    {/* Admin Wasserzeichen (nur Status, nicht änderbar) */}
                    <div style={{ paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                      <span style={SEC}>Wasserzeichen (Admin)</span>
                      <Tooltip text="Immer aktiv — jedes PDF enthält unsichtbare Metadaten zur Rückverfolgung">
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'default', fontSize: 12, color: 'var(--text-muted)', userSelect: 'none', opacity: 0.6 }}>
                          <input type="checkbox" checked readOnly disabled style={{ width: 13, height: 13 }} />
                          <Shield size={12} />
                          Verstecktes Wasserzeichen (ZWC)
                        </label>
                      </Tooltip>
                    </div>

                    {/* Offene Wasserzeichen */}
                    <div style={{ paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                      <span style={SEC}>Offene Wasserzeichen</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--text-primary)', userSelect: 'none' }}>
                          <input
                            type="checkbox" checked={wzKleinAktiv}
                            onChange={e => setWzKleinAktiv(e.target.checked)}
                            style={{ cursor: 'pointer', accentColor: '#007AFF', width: 13, height: 13 }}
                          />
                          Klein (Kopfzeile)
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--text-primary)', userSelect: 'none' }}>
                          <input
                            type="checkbox" checked={wzGrossAktiv}
                            onChange={e => setWzGrossAktiv(e.target.checked)}
                            style={{ cursor: 'pointer', accentColor: '#007AFF', width: 13, height: 13 }}
                          />
                          Groß (diagonal)
                        </label>
                        {wzGrossAktiv && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 21 }}>
                            <input
                              type="color" value={wzGrossFarbe}
                              onChange={e => setWzGrossFarbe(e.target.value)}
                              style={{ width: 24, height: 24, border: 'none', borderRadius: 4, cursor: 'pointer', padding: 0, background: 'none' }}
                            />
                            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Farbe</span>
                            <button
                              onClick={() => setWzGrossFarbe('#CCCCCC')}
                              style={{ fontSize: 9, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', fontFamily: 'inherit' }}
                            >
                              Reset
                            </button>
                          </div>
                        )}
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                          Pers. Ausdruck wird als Wasserzeichen eingefügt
                        </div>
                      </div>
                    </div>

                    {/* Dateiname-Vorschau */}
                    <div style={{ paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                      <span style={SEC}>Dateiname</span>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace', wordBreak: 'break-all', lineHeight: 1.4 }}>
                        {customFilename}
                      </div>
                    </div>
                  </>
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
                    {isRunning && (
                      <button
                        onClick={onClose}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 8px', marginTop: 4, borderRadius: 5, fontSize: 11, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}
                      >
                        Im Hintergrund weiterführen
                      </button>
                    )}
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

            {/* ── Dateiname-Builder ── */}
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <span style={SEC}>Dateiname</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                {/* Chip-Zeile */}
                <div style={{
                  flex: 1, display: 'flex', flexWrap: 'wrap', gap: 4,
                  padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 8,
                  minHeight: 34, alignItems: 'center', background: 'var(--bg-canvas)',
                }}>
                  {filenameChips.map((chip, i) => (
                    <div
                      key={chip.key}
                      draggable
                      onDragStart={() => setChipDragIdx(i)}
                      onDragOver={e => e.preventDefault()}
                      onDrop={() => {
                        if (chipDragIdx === null || chipDragIdx === i) { setChipDragIdx(null); return }
                        setFilenameChips(prev => {
                          const next = [...prev]
                          const [moved] = next.splice(chipDragIdx, 1)
                          next.splice(i, 0, moved)
                          return next
                        })
                        setChipDragIdx(null)
                      }}
                      onDragEnd={() => setChipDragIdx(null)}
                      onClick={() => setFilenameChips(prev => prev.map((c, j) => j === i ? { ...c, enabled: !c.enabled } : c))}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        padding: '2px 7px', borderRadius: 10, fontSize: 10, fontWeight: 600,
                        cursor: 'grab', userSelect: 'none', transition: 'opacity 0.15s',
                        background: chip.enabled ? 'var(--text-primary)' : 'var(--border)',
                        color: chip.enabled ? 'var(--bg, #fff)' : 'var(--text-muted)',
                        opacity: chip.enabled ? 1 : 0.55,
                        outline: chipDragIdx === i ? '2px solid #007AFF' : 'none',
                      }}
                    >
                      <GripVertical size={9} style={{ opacity: 0.5, flexShrink: 0 }} />
                      {chip.label}
                    </div>
                  ))}
                </div>
                {/* Pfad-Button: Ordner vorauswählen (kein Export) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flexShrink: 0 }}>
                  <Tooltip placement="top" text="Speicherordner wählen — Export speichert dann direkt dort (Chrome/Edge)">
                    <button
                      onClick={chooseSavePath}
                      disabled={isRunning}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '6px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                        fontFamily: 'inherit', cursor: isRunning ? 'not-allowed' : 'pointer',
                        border: `1px solid ${savedDirName ? '#007AFF' : 'var(--border)'}`,
                        background: savedDirName ? 'rgba(0,122,255,0.08)' : 'transparent',
                        color: isRunning ? 'var(--text-muted)' : savedDirName ? '#007AFF' : 'var(--text-primary)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <Save size={12} />Pfad
                    </button>
                  </Tooltip>
                  {savedDirName && (
                    <div style={{ fontSize: 9, color: '#007AFF', fontFamily: 'monospace', textAlign: 'center', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {savedDirName}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
          )}
        </div>

        {/* Footer */}
        {selectedWerk && (
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', gap: 8 }}>
            {format === 'pdf' && (
              <Tooltip placement="top" text={!isOnline ? 'Vorschau erfordert Internetverbindung' : 'PDF-Vorschau im Browser öffnen (inkl. Dokumentstruktur)'}>
                <button
                  onClick={openPreview}
                  disabled={isRunning || !isOnline}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 7, fontSize: 12, fontFamily: 'inherit', cursor: (isRunning || !isOnline) ? 'not-allowed' : 'pointer', border: '1px solid var(--border)', background: 'transparent', color: !isOnline ? 'var(--text-muted)' : 'var(--text-secondary)', opacity: !isOnline ? 0.5 : 1 }}
                >
                  {!isOnline ? <WifiOff size={13} /> : <Eye size={13} />}Vorschau
                </button>
              </Tooltip>
            )}
            <Tooltip placement="top" text={blockedByOffline ? 'PDF-Export erfordert Internetverbindung' : ''}>
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
      {statConfigItemId && statConfigItemType === 'statistik' && (
        <StatistikModal
          onClose={() => setStatConfigItemId(null)}
          folgen={folgenForStat}
          bloecke={bloeckeForStat}
          sections={statSections}
          initialFolgeNummer={folgeNummer}
          onExportUebernehmen={handleStatistikUebernehmen}
        />
      )}
      {/* Onliner / Synopsen Konfiguration */}
      {statConfigItemId && (statConfigItemType === 'onliner' || statConfigItemType === 'synopse') && (
        <FolgePickerModal
          title={statConfigItemType === 'onliner' ? 'Onliner konfigurieren' : 'Synopsen konfigurieren'}
          folgen={folgenForStat}
          bloecke={bloeckeForStat}
          initialFolgeNummer={folgeNummer}
          onConfirm={handleStatistikUebernehmen}
          onClose={() => setStatConfigItemId(null)}
        />
      )}

      {/* Filter-Picker Modal */}
      {filterPickerOpen && filterOptions && (
        <FilterPickerModal
          title={filterPickerOpen === 'rollen' ? 'Rollen' : filterPickerOpen === 'komparsen' ? 'Komparsen m. Sprechertext' : 'Motive'}
          items={filterPickerOpen === 'rollen' ? filterOptions.rollen : filterPickerOpen === 'komparsen' ? filterOptions.komparsen : filterOptions.motive}
          selected={filterPickerOpen === 'rollen' ? selectedRollen : filterPickerOpen === 'komparsen' ? selectedKomparsen : selectedMotive}
          onToggle={val => {
            if (filterPickerOpen === 'rollen')    setSelectedRollen(prev => toggle(prev, val))
            if (filterPickerOpen === 'komparsen') setSelectedKomparsen(prev => toggle(prev, val))
            if (filterPickerOpen === 'motive')    setSelectedMotive(prev => toggle(prev, val))
          }}
          onSelectAll={() => {
            const items = filterPickerOpen === 'rollen' ? filterOptions.rollen : filterPickerOpen === 'komparsen' ? filterOptions.komparsen : filterOptions.motive
            if (filterPickerOpen === 'rollen')    setSelectedRollen(new Set(items))
            if (filterPickerOpen === 'komparsen') setSelectedKomparsen(new Set(items))
            if (filterPickerOpen === 'motive')    setSelectedMotive(new Set(items))
          }}
          onClear={() => {
            if (filterPickerOpen === 'rollen')    setSelectedRollen(new Set())
            if (filterPickerOpen === 'komparsen') setSelectedKomparsen(new Set())
            if (filterPickerOpen === 'motive')    setSelectedMotive(new Set())
          }}
          onClose={() => setFilterPickerOpen(null)}
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
  const needsConfig  = item.type === 'statistik' || item.type === 'onliner' || item.type === 'synopse'
  const isConfigured = needsConfig && !!item.statistikConfig

  const typeIcon = item.type === 'statistik'
    ? <BarChart2 size={11} style={{ color: isConfigured ? '#00C853' : 'var(--text-muted)', flexShrink: 0 }} />
    : item.type === 'onliner'
    ? <Table2    size={11} style={{ color: isConfigured ? '#00C853' : 'var(--text-muted)', flexShrink: 0 }} />
    : item.type === 'synopse'
    ? <List      size={11} style={{ color: isConfigured ? '#00C853' : 'var(--text-muted)', flexShrink: 0 }} />
    : item.type === 'fsk'
    ? <Shield    size={11} style={{ color: item.enabled ? '#FF9500' : 'var(--text-muted)', flexShrink: 0 }} />
    : item.vorlageId
    ? <FileText  size={11} style={{ color: '#007AFF', flexShrink: 0 }} />
    : <FileText  size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />

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
        type="checkbox" checked={item.enabled}
        onChange={() => {
          // Unkonfigurierte Elemente direkt konfigurieren statt nur aktivieren
          if (needsConfig && !isConfigured && !item.enabled) {
            onConfigureStat()
          } else {
            onToggle()
          }
        }}
        style={{ cursor: 'pointer', accentColor: '#007AFF', width: 12, height: 12, flexShrink: 0 }}
      />
      {typeIcon}
      <span style={{ flex: 1, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>
        {item.label}
      </span>
      {needsConfig && (
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

function FilterPickerButton({ label, count, onClick }: { label: string; count: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '4px 9px', borderRadius: 6, fontSize: 11,
        border: `1px solid ${count > 0 ? '#007AFF' : 'var(--border)'}`,
        background: count > 0 ? 'rgba(0,122,255,0.07)' : 'transparent',
        color: count > 0 ? '#007AFF' : 'var(--text-secondary)',
        cursor: 'pointer', fontFamily: 'inherit',
      }}
    >
      <Filter size={10} />
      {label}
      {count > 0 && (
        <span style={{ background: '#007AFF', color: '#fff', borderRadius: 8, padding: '0 4px', fontSize: 10, fontWeight: 700, lineHeight: '15px' }}>
          {count}
        </span>
      )}
      <ChevronDown size={9} style={{ opacity: 0.5 }} />
    </button>
  )
}

// ── FolgePickerModal — minimaler Folgen/Block-Picker für Onliner & Synopsen ────

function FolgePickerModal({
  title, folgen, bloecke, initialFolgeNummer, onConfirm, onClose,
}: {
  title: string
  folgen: any[]
  bloecke: any[]
  initialFolgeNummer?: number | null
  onConfirm: (config: StatistikExportConfig) => void
  onClose: () => void
}) {
  // Nur Folgen mit drehbuch- oder storyline-Werkstufen sind für Onliner/Synopsen relevant
  const wsFolgen = useMemo(() =>
    folgen.filter((f: any) =>
      Array.isArray(f.werkstufen_typen) &&
      f.werkstufen_typen.some((w: any) => w.typ === 'drehbuch' || w.typ === 'storyline')
    ),
    [folgen]
  )
  const [mode, setMode] = useState<'folge' | 'block'>('folge')
  const [selectedFolgeId, setSelectedFolgeId] = useState<number | null>(() => {
    const pool = wsFolgen.length ? wsFolgen : folgen
    if (initialFolgeNummer != null) {
      const match = pool.find((f: any) => f.folge_nummer === initialFolgeNummer)
      if (match) return match.id
    }
    return pool.length ? pool[0].id : null
  })
  const [selectedBlockIdx, setSelectedBlockIdx] = useState(0)

  const selectedFolgeIds = useMemo(() => {
    if (mode === 'block' && bloecke[selectedBlockIdx]) {
      const block = bloecke[selectedBlockIdx]
      return wsFolgen
        .filter(f => f.folge_nummer >= block.folge_von && f.folge_nummer <= block.folge_bis)
        .map(f => f.id)
    }
    if (mode === 'folge' && selectedFolgeId) return [selectedFolgeId]
    return []
  }, [mode, selectedBlockIdx, bloecke, selectedFolgeId, wsFolgen])

  function handleConfirm() {
    if (!selectedFolgeIds.length) return
    const folgeNummer = mode === 'folge' && selectedFolgeId
      ? (folgen.find((f: any) => f.id === selectedFolgeId)?.folge_nummer ?? 0)
      : (bloecke[selectedBlockIdx]?.folge_von ?? 0)
    onConfirm({ folge_ids: selectedFolgeIds, folge_nummer: folgeNummer, mode, sections: [], includedSceneNumbers: null })
  }

  const btnBase: React.CSSProperties = {
    padding: '5px 0', border: 'none', cursor: 'pointer', fontSize: 12, flex: 1, fontFamily: 'inherit',
  }

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 10100 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%,-50%)',
        width: 'min(360px, 92vw)',
        zIndex: 10101,
        background: 'var(--bg, #fff)',
        borderRadius: 10,
        boxShadow: '0 8px 32px rgba(0,0,0,0.28)',
        border: '1px solid var(--border, #e0e0e0)',
        padding: 20,
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2 }}>
            <X size={16} />
          </button>
        </div>

        {/* Folge / Block Toggle */}
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 5, overflow: 'hidden' }}>
          <button onClick={() => setMode('folge')} style={{ ...btnBase, background: mode === 'folge' ? 'var(--text)' : 'var(--bg)', color: mode === 'folge' ? 'var(--bg)' : 'var(--text)' }}>
            Pro Folge
          </button>
          <button onClick={() => setMode('block')} style={{ ...btnBase, background: mode === 'block' ? 'var(--text)' : 'var(--bg)', color: mode === 'block' ? 'var(--bg)' : 'var(--text)', borderLeft: '1px solid var(--border)' }}>
            Pro Block
          </button>
        </div>

        {mode === 'folge' && (
          <select
            value={selectedFolgeId ?? ''}
            onChange={e => setSelectedFolgeId(Number(e.target.value) || null)}
            style={{ padding: '6px 8px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, width: '100%', fontFamily: 'inherit' }}
          >
            {(wsFolgen.length ? wsFolgen : folgen).map((f: any) => (
              <option key={f.id} value={f.id}>
                Folge {f.folge_nummer}{f.folgen_titel ? ` \u2013 ${f.folgen_titel}` : ''}
              </option>
            ))}
          </select>
        )}
        {mode === 'block' && bloecke.length > 0 && (
          <select
            value={selectedBlockIdx}
            onChange={e => setSelectedBlockIdx(Number(e.target.value))}
            style={{ padding: '6px 8px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, width: '100%', fontFamily: 'inherit' }}
          >
            {bloecke.map((b: any, i: number) => (
              <option key={i} value={i}>Block {b.block_nummer} ({b.folge_von}–{b.folge_bis})</option>
            ))}
          </select>
        )}
        {mode === 'block' && bloecke.length === 0 && (
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Keine Blöcke konfiguriert</span>
        )}

        <button
          onClick={handleConfirm}
          disabled={!selectedFolgeIds.length}
          style={{
            padding: '8px 14px', borderRadius: 6, border: 'none', fontFamily: 'inherit',
            cursor: selectedFolgeIds.length ? 'pointer' : 'not-allowed',
            background: selectedFolgeIds.length ? '#00C853' : '#e0e0e0',
            color: selectedFolgeIds.length ? '#fff' : '#999',
            fontSize: 13, fontWeight: 600,
          }}
        >
          Übernehmen
        </button>
      </div>
    </>,
    document.body
  )
}

// ── FilterPickerModal ──────────────────────────────────────────────────────────

function FilterPickerModal({
  title, items, selected, onToggle, onSelectAll, onClear, onClose,
}: {
  title: string
  items: string[]
  selected: Set<string>
  onToggle: (v: string) => void
  onSelectAll: () => void
  onClear: () => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const filtered = search.trim()
    ? items.filter(i => i.toLowerCase().includes(search.trim().toLowerCase()))
    : items

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 10100 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%,-50%)',
        width: 'min(380px, 90vw)',
        maxHeight: '70vh',
        zIndex: 10101,
        background: 'var(--bg, #fff)',
        borderRadius: 10,
        boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
        border: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{title} filtern</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={onSelectAll} style={{ fontSize: 10, color: '#007AFF', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>Alle</button>
            <span style={{ color: 'var(--border)', fontSize: 12 }}>|</span>
            <button onClick={onClear} style={{ fontSize: 10, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>Keine</button>
            <button onClick={onClose} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, border: 'none', background: 'var(--bg-subtle)', cursor: 'pointer', color: 'var(--text-muted)', borderRadius: 5 }}>
              <X size={12} />
            </button>
          </div>
        </div>

        {/* Suche */}
        <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <input
            autoFocus
            type="text" value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`${title} suchen…`}
            style={{ width: '100%', padding: '5px 8px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-canvas)', color: 'var(--text-primary)', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        {/* Liste */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
          {filtered.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '12px', textAlign: 'center' }}>Keine Treffer</div>
          ) : filtered.map(item => (
            <label key={item} style={{
              display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
              fontSize: 12, color: 'var(--text-primary)', userSelect: 'none',
              padding: '5px 6px', borderRadius: 5,
              background: selected.has(item) ? 'rgba(0,122,255,0.06)' : 'transparent',
            }}>
              <input
                type="checkbox" checked={selected.has(item)} onChange={() => onToggle(item)}
                style={{ cursor: 'pointer', accentColor: '#007AFF', width: 13, height: 13, flexShrink: 0 }}
              />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item}</span>
            </label>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {selected.size > 0 ? `${selected.size} ausgewählt` : 'Keine Auswahl — alle Szenen'}
          </span>
          <button
            onClick={onClose}
            style={{ padding: '6px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', background: '#007AFF', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Fertig
          </button>
        </div>
      </div>
    </>,
    document.body
  )
}
