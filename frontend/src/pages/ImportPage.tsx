import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import AppShell from '../components/AppShell'
import { FileUp, CheckCircle, AlertTriangle, ChevronRight, UploadCloud, X, FileText, Eye, List, Scissors, Pencil, BookOpen, FileSearch, Lock, Info } from 'lucide-react'
import { useSelectedProduction, useAppSettings } from '../contexts'
import { api } from '../api/client'
import { useTerminologie } from '../sw-ui'
import Tooltip from '../components/Tooltip'
import PdfPageViewer from '../components/PdfPageViewer'
import BulkImportPanel from '../components/BulkImportPanel'
import * as pdfjsLib from 'pdfjs-dist'

const ACCEPTED_EXTS = ['.fdx', '.fountain', '.docx', '.pdf', '.celtx', '.wdz']


const FORMAT_LABELS: Record<string, string> = {
  fdx: 'Final Draft (.fdx)',
  fountain: 'Fountain (.fountain)',
  docx: 'Word (.docx)',
  pdf: 'PDF (.pdf)',
  celtx: 'Celtx (.celtx)',
  writerduet: 'WriterDuet (.wdz)',
  unknown: 'Unbekannt',
}
const STAGE_TO_FORMAT: Record<string, string> = {
  expose: 'Notiz', treatment: 'Storyline', draft: 'Drehbuch', final: 'Drehbuch',
}

type Step = 1 | 2 | 3

interface DetectResult {
  format: string
  confidence: number
  hint?: string
  file_hash?: string
  duplicate?: {
    werkstufe_id: string
    label: string
    typ: string
    folge_nummer: number
    produktion: string
  } | null
}

interface EpisodeSummary {
  episode_nr: number
  scene_count: number
  charaktere: string[]
}

interface PreviewResult {
  format: string
  total_scenes: number
  total_textelemente: number
  charaktere: string[]
  komparsen?: string[]
  motive?: string[]
  warnings: string[]
  szenen: any[]
  rote_rosen_meta?: {
    document_type?: string
    staffel?: number
    episode?: number
    block_import?: boolean
    [key: string]: any
  }
  filename_metadata?: {
    document_type?: string
    staffel?: number
    episode?: number
    fassungsdatum?: string
    show?: string
  }
  episodes?: EpisodeSummary[]  // set for block (multi-episode) PDFs
}

interface CommitResult {
  folge_id: number
  werkstufe_id: string
  scenes_imported: number
  characters_created: number
  komparsen_created: number
  motive_created: number
  warnings: string[]
  unbekannte_stimmungen?: string[]
}

export default function ImportPage() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { selectedProduction, productions, selectProduction, selectedId } = useSelectedProduction()
  const { treatmentLabel } = useAppSettings()
  const { t } = useTerminologie()
  const STAGE_TYPES = [
    { value: 'expose', label: 'Exposé', tip: `Legt eine Exposé-Werkstufe an.\nSzenen-Default-Editor: Notiz.\nVersionszählung läuft getrennt pro Stufentyp.` },
    { value: 'treatment', label: treatmentLabel, tip: `Legt eine ${treatmentLabel}-Werkstufe an.\nSzenen-Default-Editor: Storyline (Fließtext).` },
    { value: 'draft', label: `${t('drehbuch')} (Entwurf)`, tip: `Legt eine bearbeitbare ${t('drehbuch')}-Werkstufe an (Status: Entwurf).\nSzenen-Default-Editor: Drehbuch.` },
    { value: 'final', label: `${t('drehbuch')} (gelockt)`, tip: '' },
  ]
  const [step, setStep] = useState<Step>(1)
  const [bulkMode, setBulkMode] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [detectResult, setDetectResult] = useState<DetectResult | null>(null)
  const [formatOverride, setFormatOverride] = useState<string>('')
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 2 settings
  const [bloecke, setBloecke] = useState<any[]>([])
  const [selectedBlock, setSelectedBlock] = useState<any | null>(null)
  const [selectedFolgeNummer, setSelectedFolgeNummer] = useState<number | null>(null)
  const [stageType, setStageType] = useState('draft')
  const pendingAutoEpisode = useRef<number | null>(null)
  const [editDocType, setEditDocType] = useState<string | null>(null)
  const [editEpisode, setEditEpisode] = useState<number | null>(null)
  const [standDatum, setStandDatum] = useState('')
  const [importLabel, setImportLabel] = useState<string | null>(null)
  const [importSichtbarkeit, setImportSichtbarkeit] = useState('autoren')
  const [stageLabels, setStageLabels] = useState<Array<{ id: number; name: string; is_produktionsfassung?: boolean; sort_order?: number }>>([])
  // Das Produktionsfassungs-Label sperrt beim Import die Werkstufe (read-only → nur noch
  // Revisionen). Bei mehreren gilt das mit der höchsten sort_order. null = keines definiert.
  const lockLabel = useMemo(() => {
    const cands = stageLabels.filter(sl => sl.is_produktionsfassung)
    if (cands.length === 0) return null
    return cands.reduce((a, b) => ((b.sort_order ?? 0) > (a.sort_order ?? 0) ? b : a))
  }, [stageLabels])
  const importDefaultsLoaded = useRef(false)


  // Per-scene field overrides (index → partial fields)
  const [sceneOverrides, setSceneOverrides] = useState<Record<number, Record<string, any>>>({})
  const updateScene = (idx: number, field: string, value: any) => {
    setSceneOverrides(prev => ({ ...prev, [idx]: { ...prev[idx], [field]: value } }))
  }
  const getSceneVal = (sz: any, idx: number, field: string) => sceneOverrides[idx]?.[field] ?? sz[field]

  // Block import state (multi-episode PDFs)
  const [selectedEpisodes, setSelectedEpisodes] = useState<Set<number>>(new Set())
  const [blockImportResults, setBlockImportResults] = useState<Array<{
    episode_nr: number; success: boolean; scenes_imported?: number; error?: string
  }> | null>(null)
  const [blockImporting, setBlockImporting] = useState(false)

  // All folgen across all blocks
  const allFolgen: { nr: number; block: any }[] = []
  for (const b of bloecke) {
    if (b.folge_von != null && b.folge_bis != null) {
      for (let nr = b.folge_von; nr <= b.folge_bis; nr++) allFolgen.push({ nr, block: b })
    }
  }

  const handleFolgeSelect = (nr: number) => {
    const entry = allFolgen.find(f => f.nr === nr)
    if (!entry) return
    if (entry.block.proddb_id !== selectedBlock?.proddb_id) setSelectedBlock(entry.block)
    setSelectedFolgeNummer(nr)
  }

  const handleBlockSelect = (block: any) => {
    setSelectedBlock(block)
    setSelectedFolgeNummer(block?.folge_von ?? null)
  }

  // Document preview
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  const [fileTextContent, setFileTextContent] = useState<string | null>(null)
  const [showDocPreview, setShowDocPreview] = useState(true)

  const isPdf = useMemo(() => file?.name.toLowerCase().endsWith('.pdf') ?? false, [file])

  useEffect(() => {
    if (!file) { setFileUrl(null); setFileTextContent(null); return }
    if (file.name.toLowerCase().endsWith('.pdf')) {
      const url = URL.createObjectURL(file)
      setFileUrl(url)
      setFileTextContent(null)
      return () => URL.revokeObjectURL(url)
    } else {
      setFileUrl(null)
      file.text().then(t => setFileTextContent(t)).catch(() => {})
    }
  }, [file])

  // Get total page count for PDF files (used in Step 1 page range UI)
  useEffect(() => {
    if (!fileUrl || !isPdf) { setPdfTotalPages(null); return }
    const task = pdfjsLib.getDocument(fileUrl)
    task.promise.then(pdf => setPdfTotalPages(pdf.numPages)).catch(() => setPdfTotalPages(null))
    return () => { task.destroy() }
  }, [fileUrl, isPdf])

  // Step 3 result
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null)

  // Non-scene elements (Deckblatt, Synopsis, Memo, etc.)
  const [nonSceneElements, setNonSceneElements] = useState<Array<{ type: string; label: string; content: string }>>([])

  // PDF extraction options
  const [pdfMethod, setPdfMethod] = useState<'pdftotext' | 'mistral'>('pdftotext')
  // Layout-Konvention für PDFs: 'auto' = automatische Erkennung
  const [pdfLayout, setPdfLayout] = useState<'auto' | 'daily' | 'master-scene'>('auto')
  const [pdfCropLeft, setPdfCropLeft] = useState(0)
  const [pdfCropRight, setPdfCropRight] = useState(0)
  const [pdfCropBottom, setPdfCropBottom] = useState(0)
  const cropSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cropSettingsLoaded = useRef(false)
  const [pdfPageFrom, setPdfPageFrom] = useState<number | ''>('')
  const [pdfPageTo, setPdfPageTo] = useState<number | ''>('')
  const [pdfTotalPages, setPdfTotalPages] = useState<number | null>(null)
  const [pdfTargetPage, setPdfTargetPage] = useState<number | undefined>()
  const [ocrAvailable, setOcrAvailable] = useState(false)

  // Check OCR availability on mount
  useEffect(() => {
    api.getOcrStatus().then(data => {
      if (data?.mistral_available) setOcrAvailable(true)
    }).catch(() => {})
  }, [])

  // Load saved PDF crop settings on mount
  useEffect(() => {
    api.getSettings().then((data: any) => {
      const crop = data?.ui_settings?.pdf_crop
      if (crop) {
        if (crop.left != null) setPdfCropLeft(crop.left)
        if (crop.right != null) setPdfCropRight(crop.right)
        if (crop.bottom != null) setPdfCropBottom(crop.bottom)
      }
      cropSettingsLoaded.current = true
    }).catch(() => { cropSettingsLoaded.current = true })
  }, [])

  // Debounced save of PDF crop settings when they change
  useEffect(() => {
    if (!cropSettingsLoaded.current) return
    if (cropSaveTimer.current) clearTimeout(cropSaveTimer.current)
    cropSaveTimer.current = setTimeout(() => {
      api.updateSettings({ ui_settings: { pdf_crop: { left: pdfCropLeft, right: pdfCropRight, bottom: pdfCropBottom } } }).catch(() => {})
    }, 800)
    return () => { if (cropSaveTimer.current) clearTimeout(cropSaveTimer.current) }
  }, [pdfCropLeft, pdfCropRight, pdfCropBottom])

  // Load Blöcke from ProdDB (same as ScriptPage: api.getBloecke)
  useEffect(() => {
    if (!selectedId) return
    api.getBloecke(selectedId).then(data => {
      if (!Array.isArray(data)) return
      setBloecke(data)
      // Auto-select from pending detected episode
      const ep = pendingAutoEpisode.current
      if (ep != null) {
        const match = data.find((b: any) => b.folge_von != null && b.folge_bis != null && ep >= b.folge_von && ep <= b.folge_bis)
        if (match) {
          setSelectedBlock(match)
          setSelectedFolgeNummer(ep)
          pendingAutoEpisode.current = null
          return
        }
      }
      const first = data.length > 0 ? data[0] : null
      setSelectedBlock(first)
      setSelectedFolgeNummer(first?.folge_von ?? null)
    }).catch(() => {})
  }, [selectedId])

  // Load stage labels for the selected production
  useEffect(() => {
    if (!selectedId) { setStageLabels([]); return }
    api.getStageLabels(selectedId).then(data => {
      if (Array.isArray(data)) setStageLabels(data)
    }).catch(() => {})
  }, [selectedId])

  // Load last import defaults from user settings (once)
  useEffect(() => {
    if (importDefaultsLoaded.current) return
    importDefaultsLoaded.current = true
    api.getSettings().then(s => {
      const ui = s?.ui_settings || {}
      if (ui.last_import_label) setImportLabel(ui.last_import_label)
      if (ui.last_import_sichtbarkeit) setImportSichtbarkeit(ui.last_import_sichtbarkeit)
    }).catch(() => {})
  }, [])

  const handleFile = useCallback(async (f: File) => {
    setFile(f)
    setError(null)
    setDetectResult(null)
    setFormatOverride('')
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('file', f)
      const res = await fetch('/api/import/detect', { method: 'POST', body: fd, credentials: 'include' })
      const data = await res.json()
      setDetectResult(data)
    } catch (err) {
      setError('Fehler bei der Format-Erkennung')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [handleFile])

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) handleFile(f)
  }

  const handleStep1Next = async () => {
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (isPdf) {
        fd.append('pdf_method', pdfMethod)
        if (pdfLayout !== 'auto') fd.append('pdf_layout', pdfLayout)
        if (pdfMethod === 'pdftotext') {
          if (pdfCropLeft > 0) fd.append('pdf_crop_left', String(pdfCropLeft))
          if (pdfCropRight > 0) fd.append('pdf_crop_right', String(pdfCropRight))
          if (pdfCropBottom > 0) fd.append('pdf_crop_bottom', String(pdfCropBottom))
        }
        if (pdfPageFrom !== '') fd.append('pdf_page_from', String(pdfPageFrom))
        if (pdfPageTo !== '') fd.append('pdf_page_to', String(pdfPageTo))
      }
      const res = await fetch('/api/import/preview', { method: 'POST', body: fd, credentials: 'include' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || `Fehler ${res.status}`)
      }
      const data = await res.json()
      setPreviewResult(data)

      // Auto-fill stage_type from detected metadata
      const rrMeta = data.rote_rosen_meta || data.filename_metadata
      if (rrMeta?.document_type) {
        if (rrMeta.document_type === 'treatment') setStageType('treatment')
        else if (rrMeta.document_type === 'drehbuch') setStageType('draft')
        setEditDocType(rrMeta.document_type === 'treatment' ? treatmentLabel : 'Drehbuch')
      }

      // Stand-Datum from filename
      if (data.filename_metadata?.fassungsdatum) {
        setStandDatum(data.filename_metadata.fassungsdatum)
      }

      // Auto-fill folge from detected episode number
      const detectedEpisode = data.rote_rosen_meta?.episode || data.filename_metadata?.episode
      if (detectedEpisode) {
        setEditEpisode(detectedEpisode)
        pendingAutoEpisode.current = detectedEpisode
      }

      // Block import: auto-select all episodes + set header to first detected episode
      if (data.episodes && data.episodes.length > 1) {
        setSelectedEpisodes(new Set(data.episodes.map((e: EpisodeSummary) => e.episode_nr)))
        const firstBlockEp = data.episodes[0].episode_nr
        if (!detectedEpisode && firstBlockEp) {
          setEditEpisode(firstBlockEp)
          pendingAutoEpisode.current = firstBlockEp
          // Immediate block matching if production already loaded
          const matchBlock = bloecke.find((b: any) => b.folge_von != null && b.folge_bis != null && firstBlockEp >= b.folge_von && firstBlockEp <= b.folge_bis)
          if (matchBlock) {
            setSelectedBlock(matchBlock)
            setSelectedFolgeNummer(firstBlockEp)
            pendingAutoEpisode.current = null
          }
        }
      }

      // Auto-recognize production from staffel
      if (data.rote_rosen_meta?.staffel) {
        const matchProd = productions.find(p => p.staffelnummer === data.rote_rosen_meta.staffel)
        if (matchProd) {
          if (matchProd.id !== selectedId) {
            selectProduction(matchProd.id) // triggers bloecke reload → consumes pendingAutoEpisode
          } else if (detectedEpisode) {
            // Production already selected → bloecke already loaded → immediate match
            const matchBlock = bloecke.find((b: any) => b.folge_von != null && b.folge_bis != null && detectedEpisode >= b.folge_von && detectedEpisode <= b.folge_bis)
            if (matchBlock) {
              setSelectedBlock(matchBlock)
              setSelectedFolgeNummer(detectedEpisode)
              pendingAutoEpisode.current = null
            }
          }
        }
      } else if (detectedEpisode) {
        // No staffel detected → use current production, try immediate episode match
        const matchBlock = bloecke.find((b: any) => b.folge_von != null && b.folge_bis != null && detectedEpisode >= b.folge_von && detectedEpisode <= b.folge_bis)
        if (matchBlock) {
          setSelectedBlock(matchBlock)
          setSelectedFolgeNummer(detectedEpisode)
          pendingAutoEpisode.current = null
        }
      }

      // Use non-scene elements from backend parser (or empty)
      setNonSceneElements(data.non_scene_elements || [])

      setStep(2)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  // Build common PDF params for commit calls
  const buildCommitFormData = (folgeNummer: number, episodeFilter?: number): FormData => {
    const fd = new FormData()
    fd.append('file', file!)
    fd.append('produktion_id', selectedId!)
    fd.append('folge_nummer', String(folgeNummer))
    if (selectedBlock?.proddb_id) fd.append('proddb_block_id', selectedBlock.proddb_id)
    fd.append('stage_type', stageType)
    if (standDatum) fd.append('stand_datum', standDatum)
    if (isPdf) {
      fd.append('pdf_method', pdfMethod)
      if (pdfLayout !== 'auto') fd.append('pdf_layout', pdfLayout)
      if (pdfMethod === 'pdftotext') {
        if (pdfCropLeft > 0) fd.append('pdf_crop_left', String(pdfCropLeft))
        if (pdfCropRight > 0) fd.append('pdf_crop_right', String(pdfCropRight))
        if (pdfCropBottom > 0) fd.append('pdf_crop_bottom', String(pdfCropBottom))
      }
      if (pdfPageFrom !== '') fd.append('pdf_page_from', String(pdfPageFrom))
      if (pdfPageTo !== '') fd.append('pdf_page_to', String(pdfPageTo))
    }
    if (nonSceneElements.length > 0) fd.append('non_scene_elements', JSON.stringify(nonSceneElements))
    if (Object.keys(sceneOverrides).length > 0) fd.append('scene_overrides', JSON.stringify(sceneOverrides))
    if (episodeFilter != null) fd.append('episode_filter', String(episodeFilter))
    if (importLabel) fd.append('import_label', importLabel)
    if (importSichtbarkeit !== 'autoren') fd.append('import_sichtbarkeit', importSichtbarkeit)
    return fd
  }

  // Block import: import each selected episode separately
  const handleBlockImport = async () => {
    if (!file || !selectedId || !previewResult?.episodes) return
    const episodesToImport = previewResult.episodes.filter(e => selectedEpisodes.has(e.episode_nr))
    if (episodesToImport.length === 0) return
    setBlockImporting(true)
    setError(null)
    const results: typeof blockImportResults = []
    for (const ep of episodesToImport) {
      try {
        const fd = buildCommitFormData(ep.episode_nr, ep.episode_nr)
        const res = await fetch('/api/import/commit', { method: 'POST', body: fd, credentials: 'include' })
        if (!res.ok) {
          const err = await res.json()
          results.push({ episode_nr: ep.episode_nr, success: false, error: err.error || `Fehler ${res.status}` })
        } else {
          const data = await res.json()
          results.push({ episode_nr: ep.episode_nr, success: true, scenes_imported: data.scenes_imported })
        }
      } catch (err) {
        results.push({ episode_nr: ep.episode_nr, success: false, error: String(err) })
      }
    }
    setBlockImportResults(results)
    setBlockImporting(false)
    // Save last imported episode + import defaults so ScriptPage auto-selects it
    const lastSuccess = [...results].reverse().find(r => r.success)
    if (lastSuccess && selectedId) {
      await api.updateSettings({
        ui_settings: {
          last_produktion_id: selectedId,
          last_folge_nummer: lastSuccess.episode_nr,
          last_stage_id: null,
          last_szene_id: null,
          last_import_label: importLabel || null,
          last_import_sichtbarkeit: importSichtbarkeit,
        },
      }).catch(() => {})
    }
    window.dispatchEvent(new Event('script-import-complete'))
    if (results.every(r => r.success)) {
      setStep(3)
    }
  }

  const handleCommit = async () => {
    if (!file || !selectedId || selectedFolgeNummer == null) return
    setLoading(true)
    setError(null)
    try {
      const fd = buildCommitFormData(selectedFolgeNummer)
      const res = await fetch('/api/import/commit', { method: 'POST', body: fd, credentials: 'include' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || `Fehler ${res.status}`)
      }
      const data = await res.json()
      setCommitResult(data)
      // Save last navigation state + import defaults
      await api.updateSettings({
        ui_settings: {
          last_produktion_id: selectedId,
          last_folge_nummer: data.folge_nummer ?? selectedFolgeNummer,
          last_stage_id: null,
          last_szene_id: null,
          last_import_label: importLabel || null,
          last_import_sichtbarkeit: importSichtbarkeit,
        },
      }).catch(() => {})
      window.dispatchEvent(new Event('script-import-complete'))
      if (data.unbekannte_stimmungen?.length) {
        // Unbekannte Stimmungen → Step 3 zeigen mit Hinweis
        setStep(3)
      } else {
        navigate('/?imported=' + Date.now())
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  const handleReanalyze = async () => {
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (isPdf) {
        fd.append('pdf_method', pdfMethod)
        if (pdfLayout !== 'auto') fd.append('pdf_layout', pdfLayout)
        if (pdfMethod === 'pdftotext') {
          if (pdfCropLeft > 0) fd.append('pdf_crop_left', String(pdfCropLeft))
          if (pdfCropRight > 0) fd.append('pdf_crop_right', String(pdfCropRight))
          if (pdfCropBottom > 0) fd.append('pdf_crop_bottom', String(pdfCropBottom))
        }
        if (pdfPageFrom !== '') fd.append('pdf_page_from', String(pdfPageFrom))
        if (pdfPageTo !== '') fd.append('pdf_page_to', String(pdfPageTo))
      }
      const res = await fetch('/api/import/preview', { method: 'POST', body: fd, credentials: 'include' })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || `Fehler ${res.status}`) }
      const data = await res.json()
      setPreviewResult(data)
      setNonSceneElements(data.non_scene_elements || [])
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setStep(1)
    setFile(null)
    setDetectResult(null)
    setPreviewResult(null)
    setCommitResult(null)
    setError(null)
    setFormatOverride('')
    setEditDocType(null)
    setEditEpisode(null)
    setStandDatum('')
    setNonSceneElements([])
    setSceneOverrides({})
    setPdfPageFrom('')
    setPdfPageTo('')
    setPdfTargetPage(undefined)
    setImportLabel(null)
    setImportSichtbarkeit('autoren')
    pendingAutoEpisode.current = null
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const confidenceColor = (c: number) =>
    c >= 0.9 ? 'var(--sw-green)' : c >= 0.7 ? 'var(--sw-warning)' : 'var(--sw-danger)'

  return (
    <AppShell
      {...(step === 2 ? {
        bloecke,
        selectedBlock,
        onSelectBlock: handleBlockSelect,
        selectedFolgeNummer,
        onSelectFolge: (nr: number) => setSelectedFolgeNummer(nr),
      } : {})}
    >
      <div style={{ ...(step === 2 ? { padding: '16px 0 0 0' } : { padding: 32, maxWidth: 720, margin: '0 auto' }) }}>
        {/* Stepper */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: step === 2 ? 16 : 32, ...(step === 2 ? { paddingLeft: 16 } : {}) }}>
          {[1, 2, 3].map(s => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: step === s ? '#000' : step > s ? 'var(--sw-green)' : '#e0e0e0',
                color: step === s ? '#fff' : step > s ? '#fff' : '#757575',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 600,
              }}>
                {step > s ? <CheckCircle size={14} /> : s}
              </div>
              <span style={{ fontSize: 12, color: step === s ? '#000' : '#757575', fontWeight: step === s ? 600 : 400 }}>
                {s === 1 ? 'Upload' : s === 2 ? 'Einstellungen' : 'Fertig'}
              </span>
              {s < 3 && <ChevronRight size={12} color="#ccc" />}
            </div>
          ))}
        </div>

        {/* Step 1 */}
        {step === 1 && (
          <div>
            <h2 style={{ marginBottom: 8, fontSize: 20, fontWeight: 600 }}>{t('drehbuch')} importieren</h2>
            <p style={{ color: '#757575', marginBottom: 16, fontSize: 14 }}>
              Unterstützte Formate: Final Draft (.fdx), Fountain, Word (.docx), PDF, Celtx, WriterDuet (.wdz)
            </p>

            {/* Modus-Umschalter: Einzeldatei vs. Mehrere Dateien (Bulk) */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '1px solid #e0e0e0' }}>
              {[
                { v: false, label: 'Einzeldatei', tip: 'Eine Datei importieren — mit Szenen-Vorschau, manueller Korrektur jeder Szene und PDF-Optionen (Beschneiden, Seitenbereich, OCR) vor dem Import.' },
                { v: true, label: 'Mehrere Dateien', tip: `Bis zu 20 Dateien gleichzeitig importieren (Batch). Folge-Nummer und Stufe werden aus den Dateinamen geraten und in einer Tabelle bestätigt — keine Einzelszenen-Vorschau.` },
              ].map(m => (
                <Tooltip key={String(m.v)} text={m.tip} placement="bottom">
                  <button
                    onClick={() => setBulkMode(m.v)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: '8px 4px',
                      fontSize: 14, fontWeight: bulkMode === m.v ? 600 : 400,
                      color: bulkMode === m.v ? '#000' : '#757575',
                      borderBottom: `2px solid ${bulkMode === m.v ? '#000' : 'transparent'}`, marginBottom: -1,
                    }}
                  >
                    {m.label}
                  </button>
                </Tooltip>
              ))}
            </div>

            {bulkMode ? (
              <BulkImportPanel
                produktionId={selectedId || null}
                stageTypes={STAGE_TYPES.map(s => ({ value: s.value, label: s.label }))}
                stageLabels={stageLabels}
              />
            ) : (
            <>
            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${dragging ? '#000' : '#e0e0e0'}`,
                borderRadius: 12, padding: '48px 32px',
                textAlign: 'center', cursor: 'pointer',
                background: dragging ? '#f5f5f5' : '#fafafa',
                transition: 'all 0.15s',
                marginBottom: 24,
              }}
            >
              <UploadCloud size={32} color={dragging ? '#000' : '#ccc'} style={{ marginBottom: 12 }} />
              <div style={{ fontWeight: 500, marginBottom: 4 }}>
                {file ? file.name : 'Datei hierher ziehen oder klicken'}
              </div>
              <div style={{ fontSize: 12, color: '#757575' }}>
                {ACCEPTED_EXTS.join(', ')} — max. 50 MB
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_EXTS.join(',')}
                onChange={handleFileInput}
                style={{ display: 'none' }}
              />
            </div>

            {/* Detect result */}
            {detectResult && (
              <div style={{
                border: '1px solid #e0e0e0', borderRadius: 8, padding: 16,
                marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    {FORMAT_LABELS[detectResult.format] ?? detectResult.format}
                  </div>
                  <div style={{ fontSize: 12, color: '#757575' }}>
                    {detectResult.hint ?? ''}
                  </div>
                </div>
                <Tooltip text={`Sicherheit der automatischen Format-Erkennung.\nGrün ≥ 90 % · Gelb ≥ 70 % · Rot darunter.\nBei niedriger Sicherheit unten das Format manuell wählen.`}>
                  <div style={{
                    background: confidenceColor(detectResult.confidence),
                    color: '#fff', fontSize: 11, fontWeight: 600,
                    padding: '2px 8px', borderRadius: 4, cursor: 'help',
                  }}>
                    {Math.round(detectResult.confidence * 100)}%
                  </div>
                </Tooltip>
              </div>
            )}

            {/* Duplicate warning */}
            {detectResult?.duplicate && (
              <div style={{
                border: '1px solid var(--sw-warning)', borderRadius: 8, padding: 12,
                marginBottom: 16, background: '#FFFDE7', display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <AlertTriangle size={16} color="#F9A825" />
                <div style={{ fontSize: 12 }}>
                  <strong>Duplikat erkannt</strong> — Diese Datei wurde bereits importiert als{' '}
                  <em>{detectResult.duplicate.label}</em> ({detectResult.duplicate.typ}, Ep. {detectResult.duplicate.folge_nummer}, {detectResult.duplicate.produktion}).
                  Import ist trotzdem möglich.
                </div>
              </div>
            )}

            {/* Format override when confidence low */}
            {detectResult && detectResult.confidence < 0.7 && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                  Format manuell wählen
                  <InfoDot text="Die automatische Erkennung war unsicher. Wähle hier das tatsächliche Dateiformat, damit der Parser die Szenen korrekt einliest." />
                </label>
                <select
                  value={formatOverride || detectResult.format}
                  onChange={e => setFormatOverride(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #e0e0e0', fontSize: 14, width: '100%' }}
                >
                  {Object.entries(FORMAT_LABELS).filter(([k]) => k !== 'unknown').map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
            )}

            {/* PDF OCR Toggle — always shown for PDFs, disabled when Mistral not configured */}
            {isPdf && detectResult && (
              <div style={{
                border: '1px solid #e0e0e0', borderRadius: 8, padding: 16,
                marginBottom: 16, opacity: ocrAvailable ? 1 : 0.6,
              }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: ocrAvailable ? 'pointer' : 'not-allowed' }}>
                  <input
                    type="checkbox"
                    checked={pdfMethod === 'mistral'}
                    onChange={e => setPdfMethod(e.target.checked ? 'mistral' : 'pdftotext')}
                    disabled={!ocrAvailable}
                  />
                  Mistral OCR verwenden (bessere Texterkennung)
                  <InfoDot text={`Statt der einfachen PDF-Textextraktion liest Mistral das Dokument per OCR aus.\nDeutlich robuster bei gescannten PDFs, ungewöhnlichen Schriften oder verschobenen Layouts — dafür langsamer.\nFür digital erzeugte PDFs ist die normale Extraktion meist ausreichend.`} />
                </label>
                {!ocrAvailable && (
                  <span style={{ fontSize: 11, color: '#999', marginTop: 4, display: 'block' }}>
                    Nicht verfügbar — Mistral API-Key muss in den Admin-Einstellungen hinterlegt werden.
                  </span>
                )}
              </div>
            )}

            {/* PDF Layout/Format — Szenenstruktur-Konvention; 'auto' erkennt anhand der Signatur */}
            {isPdf && detectResult && (
              <div style={{ border: '1px solid #e0e0e0', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, marginBottom: 6 }}>
                  Layout / Format
                  <InfoDot text={`Szenenstruktur-Konvention des Drehbuchs:\n• Automatisch — erkennt das Layout anhand der Szenenkopf-Signatur.\n• Daily — deutsches Episode.Szene-Format (z. B. 12.05), wie bei Rote Rosen.\n• Master Scene — internationales Format (US / BBC / ARD-ZDF) mit durchnummerierten Szenen.\nNur ändern, wenn Szenen falsch erkannt werden.`} />
                </label>
                <select
                  value={pdfLayout}
                  onChange={e => setPdfLayout(e.target.value as 'auto' | 'daily' | 'master-scene')}
                  style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #e0e0e0', borderRadius: 6, background: '#fff' }}
                >
                  <option value="auto">Automatisch erkennen</option>
                  <option value="daily">Daily (dt. Episode.Szene-Format)</option>
                  <option value="master-scene">Master Scene (US / BBC / ARD-ZDF)</option>
                </select>
                <span style={{ fontSize: 11, color: '#999', marginTop: 4, display: 'block' }}>
                  Bei falsch erkannten Szenen das passende Layout explizit wählen.
                </span>
              </div>
            )}

            {error && (
              <div style={{ color: 'var(--sw-danger)', fontSize: 13, marginBottom: 16, display: 'flex', gap: 6 }}>
                <AlertTriangle size={14} />
                {error}
              </div>
            )}

            <button
              onClick={handleStep1Next}
              disabled={!file || loading || (detectResult !== null && detectResult.format === 'unknown' && !formatOverride)}
              style={{
                background: '#000', color: '#fff', border: 'none', borderRadius: 8,
                padding: '10px 24px', fontWeight: 600, fontSize: 14,
                cursor: 'pointer', opacity: !file || loading ? 0.4 : 1,
              }}
            >
              {loading ? 'Analysiere…' : 'Weiter'}
            </button>
            </>
            )}
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && previewResult && (
          <div style={{ display: 'flex', gap: 0, alignItems: 'stretch', height: 'calc(100vh - 160px)' }}>

            {/* Left: Document Preview */}
            {showDocPreview && (
              <div style={{
                width: '50%', flexShrink: 0, borderRight: '1px solid #e0e0e0',
                display: 'flex', flexDirection: 'column', background: '#f5f5f5',
              }}>
                {/* Crop controls for PDF — visual feedback via overlays */}
                {isPdf && pdfMethod === 'pdftotext' && (
                  <div style={{
                    padding: '8px 12px', borderBottom: '1px solid #e0e0e0',
                    background: '#fff', flexShrink: 0,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <Scissors size={12} color="#757575" />
                      <span style={{ fontSize: 11, color: '#757575', fontWeight: 600 }}>Beschneiden</span>
                      <InfoDot text="Sollte der Import fehlerhaft sein, kann es daran liegen, dass die Texterkennung durch Fußzeilen oder Zeilennummern irritiert ist. Das Wegschneiden der Ränder hilft dann. Die Werte werden pro Benutzer gespeichert." placement="bottom" />
                      <span style={{ marginLeft: 'auto' }}>
                        <Tooltip text="Vorschau schließen — mehr Platz für die Szenenliste.">
                          <button onClick={() => setShowDocPreview(false)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#999' }}>
                            <X size={14} />
                          </button>
                        </Tooltip>
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 11, color: '#757575' }}>
                      <Tooltip text="Linken Rand abschneiden (z. B. Zeilennummern). In Prozent der Seitenbreite." placement="bottom">
                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, cursor: 'help' }}>
                          <span style={{ whiteSpace: 'nowrap' }}>L {pdfCropLeft}%</span>
                          <input type="range" min={0} max={30} value={pdfCropLeft}
                            onChange={e => setPdfCropLeft(parseInt(e.target.value))} style={{ flex: 1, height: 4 }} />
                        </label>
                      </Tooltip>
                      <Tooltip text="Rechten Rand abschneiden (z. B. Notizspalten). In Prozent der Seitenbreite." placement="bottom">
                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, cursor: 'help' }}>
                          <span style={{ whiteSpace: 'nowrap' }}>R {pdfCropRight}%</span>
                          <input type="range" min={0} max={30} value={pdfCropRight}
                            onChange={e => setPdfCropRight(parseInt(e.target.value))} style={{ flex: 1, height: 4 }} />
                        </label>
                      </Tooltip>
                      <Tooltip text="Unteren Rand abschneiden (z. B. Fußzeilen, Seitenzahlen). In Prozent der Seitenhöhe." placement="bottom">
                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, cursor: 'help' }}>
                          <span style={{ whiteSpace: 'nowrap' }}>U {pdfCropBottom}%</span>
                          <input type="range" min={0} max={30} value={pdfCropBottom}
                            onChange={e => setPdfCropBottom(parseInt(e.target.value))} style={{ flex: 1, height: 4 }} />
                        </label>
                      </Tooltip>
                    </div>
                  </div>
                )}
                {/* Header with close button (only for non-PDF or when crop controls are hidden) */}
                {!(isPdf && pdfMethod === 'pdftotext') && (
                  <div style={{
                    padding: '8px 12px', borderBottom: '1px solid #e0e0e0',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: '#fff', flexShrink: 0,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <FileText size={14} color="#757575" />
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#333' }}>
                        {file?.name}
                      </span>
                    </div>
                    <Tooltip text="Vorschau schließen — mehr Platz für die Szenenliste.">
                      <button onClick={() => setShowDocPreview(false)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#999' }}>
                        <X size={14} />
                      </button>
                    </Tooltip>
                  </div>
                )}
                {/* Page range bar — shown for all PDFs */}
                {isPdf && (
                  <div style={{
                    padding: '5px 12px', borderBottom: '1px solid #e0e0e0',
                    background: '#fff', flexShrink: 0,
                    display: 'flex', gap: 8, alignItems: 'center',
                  }}>
                    <BookOpen size={11} color="#757575" />
                    <span style={{ fontSize: 11, color: '#757575', fontWeight: 600 }}>Seiten</span>
                    <InfoDot text={`Nur einen Teil des PDFs importieren. Leer lassen = ganzes Dokument.\nNützlich, um Deckblatt/Anhang auszulassen oder einzelne Folgen aus einem Block zu ziehen.\nNach Änderung „Neu analysieren" klicken.`} placement="bottom" />
                    {pdfTotalPages && (
                      <span style={{ fontSize: 10, color: '#bbb' }}>{pdfTotalPages} ges.</span>
                    )}
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#757575' }}>
                      von
                      <input
                        type="number" min={1} max={pdfTotalPages || undefined}
                        value={pdfPageFrom}
                        onChange={e => setPdfPageFrom(e.target.value === '' ? '' : parseInt(e.target.value))}
                        placeholder="1"
                        style={{ width: 46, padding: '2px 5px', borderRadius: 4, border: '1px solid #e0e0e0', fontSize: 11, textAlign: 'center' }}
                      />
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#757575' }}>
                      bis
                      <input
                        type="number" min={1} max={pdfTotalPages || undefined}
                        value={pdfPageTo}
                        onChange={e => setPdfPageTo(e.target.value === '' ? '' : parseInt(e.target.value))}
                        placeholder={pdfTotalPages ? String(pdfTotalPages) : 'Ende'}
                        style={{ width: 46, padding: '2px 5px', borderRadius: 4, border: '1px solid #e0e0e0', fontSize: 11, textAlign: 'center' }}
                      />
                    </label>
                    <Tooltip text="Szenenvorschau mit den aktuellen PDF-Einstellungen (Seitenbereich, Beschneiden, OCR) neu einlesen. Bereits vorgenommene Szenen-Korrekturen gehen dabei verloren.">
                      <button
                        onClick={handleReanalyze}
                        disabled={loading}
                        style={{
                          marginLeft: 'auto', padding: '2px 8px', borderRadius: 4,
                          border: '1px solid #e0e0e0', background: '#f5f5f5',
                          fontSize: 11, cursor: loading ? 'default' : 'pointer',
                          display: 'flex', alignItems: 'center', gap: 3,
                          color: '#555', opacity: loading ? 0.5 : 1,
                        }}
                      >
                        ↻ Neu analysieren
                      </button>
                    </Tooltip>
                  </div>
                )}
                {isPdf && (
                  <div style={{
                    padding: '6px 12px', background: '#fffbea', borderBottom: '1px solid #ffe082',
                    fontSize: 12, color: '#7a5c00', lineHeight: 1.4,
                  }}>
                    ⚠️ Bitte Fußzeilen oder Zeilennummern abschneiden, damit der Import fehlerfrei erfolgt.
                  </div>
                )}
                <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                  {isPdf && fileUrl ? (
                    <PdfPageViewer
                      fileUrl={fileUrl}
                      cropLeft={pdfMethod === 'pdftotext' ? pdfCropLeft : 0}
                      cropRight={pdfMethod === 'pdftotext' ? pdfCropRight : 0}
                      cropBottom={pdfMethod === 'pdftotext' ? pdfCropBottom : 0}
                      pageFrom={pdfPageFrom !== '' ? pdfPageFrom : undefined}
                      pageTo={pdfPageTo !== '' ? pdfPageTo : undefined}
                      requestPage={pdfTargetPage}
                    />
                  ) : fileTextContent ? (
                    <pre style={{
                      margin: 0, padding: 16, height: '100%', overflowY: 'auto',
                      fontSize: 11, lineHeight: 1.5, fontFamily: "'Courier New', monospace",
                      whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#333',
                    }}>
                      {fileTextContent}
                    </pre>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#999', fontSize: 13 }}>
                      Vorschau nicht verfügbar
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Right: Scene list + Settings */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

              {/* Settings bar */}
              <div style={{
                padding: '12px 16px', borderBottom: '1px solid #e0e0e0', background: '#fff', flexShrink: 0,
              }}>
                {/* Row 1: Format badge + stats */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                    background: '#000', color: '#fff', textTransform: 'uppercase', letterSpacing: 0.3,
                  }}>
                    {FORMAT_LABELS[previewResult.format] ?? previewResult.format}
                  </span>
                  {!showDocPreview && (
                    <Tooltip text="Original-Dokument links neben der Szenenliste anzeigen — zum Abgleich beim Korrigieren.">
                      <button onClick={() => setShowDocPreview(true)}
                        style={{
                          background: 'none', border: '1px solid #e0e0e0', borderRadius: 4,
                          padding: '2px 6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                          fontSize: 11, color: '#757575',
                        }}>
                        <Eye size={12} /> Dokument
                      </button>
                    </Tooltip>
                  )}

                  {/* Metadata fields (always editable) */}
                  <Tooltip text={`Zielangaben für den Import:\n• Dokumenttyp — bestimmt die Werkstufe (${t('drehbuch')} oder ${treatmentLabel}).\n• Episode — in welche Folge importiert wird.\n• Stand-Datum — Datum der Fassung (aus dem Dateinamen vorbefüllt).\nAlle drei sind editierbar, falls die Erkennung danebenlag.`} placement="bottom">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'help' }}>
                    <select value={editDocType || (stageType === 'treatment' ? treatmentLabel : 'Drehbuch')} onChange={e => {
                      setEditDocType(e.target.value)
                      setStageType(e.target.value === treatmentLabel ? 'treatment' : 'draft')
                    }} style={{ ...compactSelectStyle, color: '#1565C0', fontWeight: 600 }}>
                      <option value="Drehbuch">{t('drehbuch')}</option>
                      <option value={treatmentLabel}>{treatmentLabel}</option>
                    </select>
                    <span style={{ color: '#999' }}>—</span>
                    <select value={editEpisode ?? selectedFolgeNummer ?? ''} onChange={e => {
                      const ep = e.target.value ? Number(e.target.value) : null
                      setEditEpisode(ep)
                      if (ep) handleFolgeSelect(ep)
                    }} style={{ ...compactSelectStyle, color: '#1565C0' }}>
                      <option value="">Ep. —</option>
                      {allFolgen.map(({ nr, block }) => (
                        <option key={nr} value={nr} style={{ fontWeight: block.proddb_id === selectedBlock?.proddb_id ? 700 : 400 }}>
                          Ep. {nr}
                        </option>
                      ))}
                    </select>
                    <span style={{ color: '#999' }}>—</span>
                    <input type="text" value={standDatum} onChange={e => setStandDatum(e.target.value)}
                      placeholder="Stand-Datum" style={{ ...compactSelectStyle, width: 90, color: '#1565C0' }} />
                  </span>
                  </Tooltip>

                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, fontSize: 11, color: '#757575' }}>
                    <span><b>{previewResult.total_scenes}</b> {t('szene', 'p')}</span>
                    <span><b>{previewResult.charaktere.length}</b> Rollen</span>
                    {(previewResult.komparsen?.length ?? 0) > 0 && <span><b>{previewResult.komparsen!.length}</b> {t('komparse', 'p')}</span>}
                    {(previewResult.motive?.length ?? 0) > 0 && <span><b>{previewResult.motive!.length}</b> {t('motiv', 'p')}</span>}
                    {(() => {
                      const totalSec = previewResult.szenen.reduce((sum: number, s: any) => sum + (s.dauer_sekunden || 0), 0)
                      if (totalSec === 0) return null
                      const mm = Math.floor(totalSec / 60); const ss = totalSec % 60
                      return <Tooltip text="Summe der Stoppzeiten aller Szenen (mm:ss) — geschätzte Gesamtlänge." placement="bottom"><span style={{ cursor: 'help' }}><b>{mm}:{String(ss).padStart(2, '0')}</b></span></Tooltip>
                    })()}
                  </div>
                </div>

                {previewResult.warnings.length > 0 && (
                  <div style={{
                    background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 6,
                    padding: '6px 10px', marginBottom: 8, display: 'flex', gap: 6, flexWrap: 'wrap',
                  }}>
                    {previewResult.warnings.map((w, i) => (
                      <span key={i} style={{ fontSize: 11, color: '#795548', display: 'flex', gap: 4, alignItems: 'center' }}>
                        <AlertTriangle size={11} /> {w}
                      </span>
                    ))}
                  </div>
                )}

                {/* Row 2: Stage type + Fassungslabel + Sichtbarkeit */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {STAGE_TYPES.map(st => {
                      const isLockStage = st.value === 'final'
                      // „gelockt" nur möglich, wenn die Produktion ein Produktionsfassungs-Label hat.
                      const disabled = isLockStage && !lockLabel
                      const tip = isLockStage
                        ? (lockLabel
                            ? `Legt eine gesperrte ${t('drehbuch')}-Werkstufe an: setzt das Produktionsfassungs-Label „${lockLabel.name}" und sperrt sie sofort (read-only). Änderungen danach nur noch als Revision.`
                            : `Kein Produktionsfassungs-Label definiert.\nLege in den DK-Einstellungen ein Fassungs-Label mit „Produktionsfassung" an, um gelockt importieren zu können.`)
                        : st.tip
                      const active = stageType === st.value
                      const btn = (
                        <button key={st.value} disabled={disabled} onClick={() => {
                          setStageType(st.value)
                          if (isLockStage && lockLabel) {
                            // Lock-Stufe → Produktionsfassungs-Label vorauswählen (löst Sperre aus)
                            setImportLabel(lockLabel.name)
                          } else if (!isLockStage && lockLabel && importLabel === lockLabel.name) {
                            // Weg von der Lock-Stufe → Lock-Label wieder entfernen
                            setImportLabel(null)
                          }
                        }} style={{
                          padding: '4px 10px', borderRadius: 4, fontSize: 11, border: '1px solid',
                          borderColor: active ? '#000' : '#e0e0e0',
                          background: active ? '#000' : '#fff',
                          color: disabled ? '#bbb' : active ? '#fff' : '#666',
                          cursor: disabled ? 'not-allowed' : 'pointer', fontWeight: active ? 600 : 400,
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                        }}>
                          {isLockStage && <Lock size={10} />}{st.label}
                        </button>
                      )
                      return <Tooltip key={st.value} text={tip}>{btn}</Tooltip>
                    })}
                  </div>
                  <div style={{ width: 1, height: 16, background: '#e0e0e0' }} />
                  <span style={{ fontSize: 11, color: '#757575', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    Fassung:
                    <InfoDot text={`Fassungs-Label für diese Werkstufe (z. B. „Rohfassung", „Sendefassung"). Optional und später änderbar.\nLabels mit 🔒 sind Produktionsfassungen — ihre Auswahl sperrt die Werkstufe beim Import (read-only, danach nur noch Revisionen).`} placement="bottom" />
                  </span>
                  <select
                    value={importLabel ?? ''}
                    onChange={e => {
                      const val = e.target.value || null
                      setImportLabel(val)
                      // Lock-Status und Stage-Button synchron halten:
                      // Produktionsfassungs-Label gewählt → Stufe „gelockt", sonst zurück auf „Entwurf".
                      if (lockLabel && val === lockLabel.name) setStageType('final')
                      else if (stageType === 'final') setStageType('draft')
                    }}
                    style={{ fontSize: 11, padding: '3px 6px', borderRadius: 4, border: '1px solid #e0e0e0', background: '#fff', color: importLabel ? '#1565C0' : '#999' }}
                  >
                    <option value="">Ohne Label</option>
                    {stageLabels.map(sl => (
                      <option key={sl.id} value={sl.name}>{sl.is_produktionsfassung ? `🔒 ${sl.name}` : sl.name}</option>
                    ))}
                  </select>
                  {lockLabel && importLabel === lockLabel.name && (
                    <Tooltip text={`Diese Werkstufe wird beim Import sofort gesperrt (read-only). Änderungen danach nur noch als Revision.`}>
                      <span style={{ fontSize: 11, color: '#FF9500', display: 'inline-flex', alignItems: 'center', gap: 3, fontWeight: 600 }}>
                        <Lock size={11} /> wird gesperrt
                      </span>
                    </Tooltip>
                  )}
                  <span style={{ fontSize: 11, color: '#757575', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    Sichtbarkeit:
                    <InfoDot text={`Wer die importierte Werkstufe sehen darf:\n• Autoren — nur das Autorenteam (Standard, für Arbeitsfassungen).\n• Produktion — auch für die Produktion freigegeben.`} placement="bottom" />
                  </span>
                  <select
                    value={importSichtbarkeit}
                    onChange={e => setImportSichtbarkeit(e.target.value)}
                    style={{ fontSize: 11, padding: '3px 6px', borderRadius: 4, border: '1px solid #e0e0e0', background: '#fff', color: '#333' }}
                  >
                    <option value="autoren">Autoren</option>
                    <option value="produktion">Produktion</option>
                  </select>
                </div>
              </div>

              {/* Scene list */}
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {/* Non-scene elements: Deckblatt, Synopsis, Recaps, Precaps */}
                {nonSceneElements.length > 0 && (
                  <div style={{ borderBottom: '2px solid #e0e0e0' }}>
                    {nonSceneElements.map((elem, idx) => (
                      <div key={idx}>
                        <div style={{ padding: '6px 12px', background: '#FAFAFA', borderTop: idx > 0 ? '1px solid #f0f0f0' : undefined }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: elem.content.length > 80 ? 3 : 0 }}>
                            <Tooltip text={`Dieser Textblock gehört zu keiner Szene (Deckblatt, Synopsis, Memo o. Ä.) und wird als Notiz importiert. Typ hier korrigieren.`} placement="bottom">
                            <select value={elem.type} onChange={e => {
                              const updated = [...nonSceneElements]
                              updated[idx] = { ...elem, type: e.target.value }
                              setNonSceneElements(updated)
                            }} style={{ ...compactSelectStyle, fontSize: 10, padding: '1px 4px', fontWeight: 600, color: '#3949AB', background: '#E8EAF6', border: 'none' }}>
                              <option value="cover">Deckblatt</option>
                              <option value="synopsis">Synopsis</option>
                              <option value="memo">Memo</option>
                            </select>
                            </Tooltip>
                            <span style={{
                              fontSize: 9, fontWeight: 600, padding: '0px 4px', borderRadius: 3,
                              background: '#F3E5F5', color: '#7B1FA2',
                              textTransform: 'uppercase', letterSpacing: 0.3,
                            }}>Notiz</span>
                            {elem.label !== elem.type && (
                              <span style={{ fontSize: 10, color: '#999' }}>{elem.label}</span>
                            )}
                            <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
                              {/* Split button: splits at first paragraph break */}
                              {elem.content.includes('\n') && (
                                <Tooltip text="In zwei Elemente aufteilen — falls hier zwei Notizen zusammengefasst wurden.">
                                <button onClick={() => {
                                  const lines = elem.content.split('\n')
                                  const mid = Math.ceil(lines.length / 2)
                                  const updated = [...nonSceneElements]
                                  updated.splice(idx, 1,
                                    { ...elem, content: lines.slice(0, mid).join('\n') },
                                    { ...elem, content: lines.slice(mid).join('\n'), label: elem.label + ' (2)' },
                                  )
                                  setNonSceneElements(updated)
                                }} style={{
                                  background: 'none', border: '1px solid #e0e0e0', borderRadius: 3,
                                  padding: '1px 4px', cursor: 'pointer', display: 'flex', alignItems: 'center',
                                }}>
                                  <Scissors size={10} color="#757575" />
                                </button>
                                </Tooltip>
                              )}
                              {/* Remove button */}
                              <Tooltip text="Diesen Textblock nicht importieren.">
                              <button onClick={() => {
                                setNonSceneElements(nonSceneElements.filter((_, i) => i !== idx))
                              }} style={{
                                background: 'none', border: '1px solid #e0e0e0', borderRadius: 3,
                                padding: '1px 4px', cursor: 'pointer', display: 'flex', alignItems: 'center',
                              }}>
                                <X size={10} color="#999" />
                              </button>
                              </Tooltip>
                            </div>
                          </div>
                          {elem.content && (
                            <textarea
                              value={elem.content}
                              onChange={e => {
                                const updated = [...nonSceneElements]
                                updated[idx] = { ...elem, content: e.target.value }
                                setNonSceneElements(updated)
                              }}
                              style={{
                                width: '100%', fontSize: 10, color: '#666', fontStyle: 'italic',
                                border: '1px solid #e8e8e8', borderRadius: 3, padding: '4px 6px',
                                resize: 'vertical', minHeight: 32, maxHeight: 120,
                                fontFamily: 'inherit', background: '#fff',
                              }}
                              rows={Math.min(4, elem.content.split('\n').length)}
                            />
                          )}
                        </div>
                        {/* Merge button between adjacent elements */}
                        {idx < nonSceneElements.length - 1 && (
                          <div style={{ display: 'flex', justifyContent: 'center', background: '#FAFAFA', padding: '1px 0' }}>
                            <Tooltip text="Mit dem nächsten Element zu einer Notiz zusammenführen.">
                            <button onClick={() => {
                              const merged = {
                                ...elem,
                                content: elem.content + '\n' + nonSceneElements[idx + 1].content,
                                label: elem.label,
                              }
                              const updated = [...nonSceneElements]
                              updated.splice(idx, 2, merged)
                              setNonSceneElements(updated)
                            }} style={{
                              background: 'none', border: '1px dashed #ccc', borderRadius: 3,
                              padding: '0px 8px', cursor: 'pointer', fontSize: 9, color: '#999',
                            }}>
                              ↕ Zusammenführen
                            </button>
                            </Tooltip>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {previewResult.szenen.map((sz: any, i: number) => {
                  return (
                    <div key={i} style={{
                      padding: '6px 12px', borderBottom: '1px solid #f0f0f0',
                      background: i % 2 === 0 ? '#fff' : '#fafafa',
                    }}>
                      {/* Row 1: SZ-Nummer, Motiv (parsed), INT/EXT, Tageszeit */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2, minWidth: 0 }}>
                        <span style={{
                          fontSize: 12, fontWeight: 700, color: '#000',
                          fontVariantNumeric: 'tabular-nums', minWidth: 60, flexShrink: 0,
                          display: 'inline-flex', alignItems: 'center', gap: 3,
                        }}>
                          SZ {(sz.episodeNr ?? selectedFolgeNummer) != null ? `${sz.episodeNr ?? selectedFolgeNummer}.${String(sz.nummer).padStart(2, '0')}` : sz.nummer}
                          {sz.source_page && (
                            <Tooltip text={`Im PDF zur Quellseite dieser Szene (S. ${sz.source_page}) springen.`}>
                              <FileSearch
                                size={11}
                                style={{ color: '#1565C0', cursor: 'pointer', flexShrink: 0 }}
                                onClick={() => setPdfTargetPage(sz.source_page)}
                              />
                            </Tooltip>
                          )}
                        </span>
                        <input type="text"
                          value={getSceneVal(sz, i, 'ort_name') || ''}
                          onChange={e => updateScene(i, 'ort_name', e.target.value)}
                          placeholder={`${t('motiv')}…`}
                          style={{
                            flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: '#1B5E20',
                            border: '1px solid transparent', background: 'transparent',
                            padding: '0px 4px', borderRadius: 3,
                          }}
                          onFocus={e => { e.target.style.borderColor = '#c8e6c9'; e.target.style.background = '#fff' }}
                          onBlur={e => { e.target.style.borderColor = 'transparent'; e.target.style.background = 'transparent' }}
                        />
                        <select value={getSceneVal(sz, i, 'int_ext') || 'INT'} onChange={e => updateScene(i, 'int_ext', e.target.value)} style={{
                          fontSize: 10, fontWeight: 600, flexShrink: 0, padding: '0px 2px', borderRadius: 3,
                          background: getSceneVal(sz, i, 'int_ext') === 'EXT' ? '#E8F5E9' : '#ECEFF1',
                          color: getSceneVal(sz, i, 'int_ext') === 'EXT' ? '#2E7D32' : '#78909C',
                          border: '1px solid transparent', cursor: 'pointer', appearance: 'none' as any,
                        }}>
                          <option value="INT">INT</option>
                          <option value="EXT">EXT</option>
                          <option value="INT/EXT">INT/EXT</option>
                        </select>
                        <select value={getSceneVal(sz, i, 'tageszeit') || 'TAG'} onChange={e => updateScene(i, 'tageszeit', e.target.value)} style={{
                          fontSize: 10, fontWeight: 600, flexShrink: 0, padding: '0px 4px', borderRadius: 3,
                          background: '#FFF8E1', color: '#F57F17', border: '1px solid transparent',
                          cursor: 'pointer',
                        }}>
                          <option value="TAG">TAG</option>
                          <option value="NACHT">NACHT</option>
                          <option value="ABEND">ABEND</option>
                          <option value="DÄMMERUNG">DÄMMERUNG</option>
                        </select>
                        <select value={getSceneVal(sz, i, 'format') || STAGE_TO_FORMAT[stageType] || 'Drehbuch'}
                          onChange={e => updateScene(i, 'format', e.target.value)} style={{
                          fontSize: 9, fontWeight: 600, padding: '0px 4px', borderRadius: 3,
                          background: '#F3E5F5', color: '#7B1FA2', flexShrink: 0,
                          textTransform: 'uppercase', letterSpacing: 0.3,
                          border: '1px solid transparent', cursor: 'pointer',
                        }}>
                          <option value="Drehbuch">{t('drehbuch')}</option>
                          <option value="Storyline">Storyline</option>
                          <option value="Notiz">Notiz</option>
                        </select>
                      </div>

                      {/* Row 2: Tags — Spieltag, Stoppzeit, Wechselschnitt */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 2 }}>
                        <Tooltip text="Spieltag innerhalb der erzählten Handlung (nicht der Drehtag). Optional." placement="bottom">
                        <span style={{ ...tagStyle('#E8EAF6', '#3949AB'), display: 'inline-flex', alignItems: 'center', gap: 2, cursor: 'help' }}>
                          Spieltag
                          <input type="number" value={getSceneVal(sz, i, 'spieltag') ?? ''} onChange={e => updateScene(i, 'spieltag', e.target.value ? Number(e.target.value) : null)}
                            placeholder="–"
                            style={{ width: 28, fontSize: 10, fontWeight: 600, color: '#3949AB', border: 'none', background: 'transparent', padding: 0, textAlign: 'center' }} />
                        </span>
                        </Tooltip>
                        <Tooltip text="Stoppzeit = geplante Länge der Szene (mm:ss). Summiert sich zur Gesamtlänge oben." placement="bottom">
                        <span style={{ ...tagStyle('#E3F2FD', '#1565C0'), display: 'inline-flex', alignItems: 'center', gap: 2, cursor: 'help' }}>
                          Stopp
                          <input type="text"
                            value={(() => {
                              const sek = getSceneVal(sz, i, 'dauer_sekunden') ?? sz.dauer_sekunden ?? 0
                              if (!sek) return ''
                              return `${Math.floor(sek / 60)}:${String(sek % 60).padStart(2, '0')}`
                            })()}
                            onChange={e => {
                              const v = e.target.value
                              const m = v.match(/^(\d{1,3}):(\d{0,2})$/)
                              if (m) {
                                updateScene(i, 'dauer_sekunden', parseInt(m[1]) * 60 + (parseInt(m[2]) || 0))
                              } else if (/^\d+$/.test(v)) {
                                updateScene(i, 'dauer_sekunden', parseInt(v))
                              } else if (v === '') {
                                updateScene(i, 'dauer_sekunden', 0)
                              }
                            }}
                            placeholder="0:00"
                            style={{ width: 36, fontSize: 10, fontWeight: 600, color: '#1565C0', border: 'none', background: 'transparent', padding: 0, textAlign: 'center' }}
                          />
                        </span>
                        </Tooltip>
                        {sz.isWechselschnitt && (
                          <span style={tagStyle('#FFF3E0', '#E65100')}>
                            Wechselschnitt{sz.wechselschnittPartner?.length > 0 ? ` mit SZ ${sz.wechselschnittPartner.join(', ')}` : ''}
                          </span>
                        )}
                        {sz.isStockshot && (
                          <span style={tagStyle('#FFF3E0', '#E65100')}>📷 Stockshot</span>
                        )}
                        {sz.isStockshotVerdacht && !sz.isStockshot && (
                          <Tooltip text="Mögliche Stockshot-Szene (Archiv-/Einspielmaterial) erkannt. Ankreuzen, um sie als Stockshot zu markieren." placement="bottom">
                          <label style={{ ...tagStyle('#FFF8E1', '#F57F17'), cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <input type="checkbox"
                              checked={getSceneVal(sz, i, 'isStockshot') === true}
                              onChange={e => updateScene(i, 'isStockshot', e.target.checked || undefined)}
                              style={{ margin: 0, width: 12, height: 12, accentColor: '#E65100' }}
                            />
                            📷 Stockshot?
                          </label>
                          </Tooltip>
                        )}
                        {sz.textelemente?.length > 0 && (
                          <span style={tagStyle('#F5F5F5', '#757575')}>{sz.textelemente.length} Elemente</span>
                        )}
                      </div>

                      {/* Row 3: Rollen — structured display or edit mode */}
                      <div style={{ fontSize: 11, color: '#333', marginBottom: 1 }}>
                        {sceneOverrides[i]?.charaktere != null ? (
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            <span style={{ color: '#999', marginRight: 4, flexShrink: 0 }}>Rollen: </span>
                            <input type="text"
                              value={(sceneOverrides[i].charaktere as string[]).join(', ')}
                              onChange={e => updateScene(i, 'charaktere', e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean))}
                              placeholder="Rollen kommagetrennt…"
                              autoFocus
                              style={{ flex: 1, fontSize: 11, color: '#333', border: '1px solid #e0e0e0', background: '#fff', padding: '1px 4px', borderRadius: 3 }}
                            />
                            <button onClick={() => { const next = { ...sceneOverrides }; delete next[i]?.charaktere; if (next[i] && Object.keys(next[i]).length === 0) delete next[i]; setSceneOverrides({ ...next }) }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', marginLeft: 2 }} title="Zurücksetzen">
                              <X size={10} color="#999" />
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1px 0', alignItems: 'center' }}>
                            <span style={{ color: '#999', marginRight: 4 }}>Rollen: </span>
                            {(sz.charaktere_detail || sz.charaktere.map((n: string) => ({ name: n, repliken: 0 }))).map((c: any, ci: number) => (
                              <span key={ci} style={{ display: 'inline-flex', alignItems: 'center' }}>
                                {ci > 0 && <span style={{ marginRight: 3 }}>, </span>}
                                {c.name}
                                {c.repliken > 0 && <span style={tagStyle('#E3F2FD', '#1565C0')}>{c.repliken} Repl.</span>}
                              </span>
                            ))}
                            {sz.charaktere.length === 0 && <span style={{ color: '#ccc' }}>—</span>}
                            <button onClick={() => updateScene(i, 'charaktere', sz.charaktere.length > 0 ? [...sz.charaktere] : [])}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', marginLeft: 4 }} title="Rollen bearbeiten">
                              <Pencil size={10} color="#bbb" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Row 4: Komparsen — structured display or edit mode */}
                      <div style={{ fontSize: 11, color: '#7B1FA2', marginBottom: 1 }}>
                        {sceneOverrides[i]?.komparsen != null ? (
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            <span style={{ color: '#999', marginRight: 4, flexShrink: 0 }}>{t('komparse', 'p')}:</span>
                            <input type="text"
                              value={(sceneOverrides[i].komparsen as string[]).join(', ')}
                              onChange={e => updateScene(i, 'komparsen', e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean))}
                              placeholder={`${t('komparse', 'p')} kommagetrennt…`}
                              autoFocus
                              style={{ flex: 1, fontSize: 11, color: '#7B1FA2', border: '1px solid #e0e0e0', background: '#fff', padding: '1px 4px', borderRadius: 3 }}
                            />
                            <button onClick={() => { const next = { ...sceneOverrides }; delete next[i]?.komparsen; if (next[i] && Object.keys(next[i]).length === 0) delete next[i]; setSceneOverrides({ ...next }) }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', marginLeft: 2 }} title="Zurücksetzen">
                              <X size={10} color="#999" />
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1px 0', alignItems: 'center' }}>
                            <span style={{ color: '#999', marginRight: 4 }}>{t('komparse', 'p')}:</span>
                            {(sz.komparsen_detail || sz.komparsen?.map((n: string) => ({ name: n, anzahl: 1, hat_spiel: false, hat_text: false, repliken: 0 })) || []).map((k: any, ki: number) => (
                              <span key={ki} style={{ display: 'inline-flex', alignItems: 'center' }}>
                                {ki > 0 && <span style={{ marginRight: 3 }}>, </span>}
                                {k.anzahl > 1 && <span style={{ fontWeight: 600 }}>{k.anzahl}× </span>}
                                {k.name}
                                {k.hat_text && <span style={tagStyle('#F3E5F5', '#7B1FA2')}>Text:{k.repliken}</span>}
                                {!k.hat_text && k.hat_spiel && <span style={tagStyle('#FFF3E0', '#E65100')}>Spiel</span>}
                                {!k.hat_text && !k.hat_spiel && <span style={tagStyle('#F5F5F5', '#9E9E9E')}>o.T.</span>}
                              </span>
                            ))}
                            {(!sz.komparsen || sz.komparsen.length === 0) && <span style={{ color: '#ccc' }}>—</span>}
                            <button onClick={() => updateScene(i, 'komparsen', sz.komparsen?.length > 0 ? [...sz.komparsen] : [])}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', marginLeft: 4 }} title={`${t('komparse', 'p')} bearbeiten`}>
                              <Pencil size={10} color="#bbb" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Row 5: Zusammenfassung (editable) */}
                      <input type="text" value={getSceneVal(sz, i, 'zusammenfassung') || ''} onChange={e => updateScene(i, 'zusammenfassung', e.target.value)}
                        placeholder="Zusammenfassung…"
                        style={{ width: '100%', fontSize: 10, color: '#666', fontStyle: 'italic', border: '1px solid transparent', background: 'transparent', padding: '1px 4px', borderRadius: 3 }}
                        onFocus={e => { e.target.style.borderColor = '#e0e0e0'; e.target.style.background = '#fff' }}
                        onBlur={e => { e.target.style.borderColor = 'transparent'; e.target.style.background = 'transparent' }}
                      />

                      {/* Row 6: Szeneninfo (editable) */}
                      <input type="text" value={getSceneVal(sz, i, 'szeneninfo') || ''} onChange={e => updateScene(i, 'szeneninfo', e.target.value)}
                        placeholder={`${t('szene', 'c')}info…`}
                        style={{ width: '100%', fontSize: 10, color: '#1565C0', fontStyle: 'italic', border: '1px solid transparent', background: 'transparent', padding: '1px 4px', borderRadius: 3 }}
                        onFocus={e => { e.target.style.borderColor = '#e0e0e0'; e.target.style.background = '#fff' }}
                        onBlur={e => { e.target.style.borderColor = 'transparent'; e.target.style.background = 'transparent' }}
                      />
                    </div>
                  )
                })}
              </div>

              {/* Block import panel (multi-episode PDFs) */}
              {previewResult.episodes && previewResult.episodes.length > 1 && (
                <div style={{ padding: '12px 16px', borderTop: '1px solid #e0e0e0', background: '#fafafa', flexShrink: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
                    {previewResult.episodes.length} Folgen erkannt — bitte Auswahl bestätigen:
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {previewResult.episodes.map(ep => (
                      <label key={ep.episode_nr} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                        <input
                          type="checkbox"
                          checked={selectedEpisodes.has(ep.episode_nr)}
                          onChange={e => {
                            const next = new Set(selectedEpisodes)
                            if (e.target.checked) next.add(ep.episode_nr)
                            else next.delete(ep.episode_nr)
                            setSelectedEpisodes(next)
                          }}
                        />
                        <span>Folge {ep.episode_nr} ({ep.scene_count} {t('szene', 'p')})</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Bottom bar: actions */}
              <div style={{
                padding: '10px 16px', borderTop: '1px solid #e0e0e0', background: '#fff',
                display: 'flex', gap: 12, alignItems: 'center', flexShrink: 0,
              }}>
                {error && (
                  <div style={{ color: 'var(--sw-danger)', fontSize: 12, display: 'flex', gap: 4, alignItems: 'center', flex: 1 }}>
                    <AlertTriangle size={12} /> {error}
                  </div>
                )}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
                  <button onClick={() => setStep(1)} style={{
                    background: '#f5f5f5', color: '#000', border: 'none', borderRadius: 6,
                    padding: '8px 16px', fontWeight: 500, fontSize: 13, cursor: 'pointer',
                  }}>
                    Zurück
                  </button>
                  {previewResult.episodes && previewResult.episodes.length > 1 ? (
                    <button
                      onClick={handleBlockImport}
                      disabled={selectedEpisodes.size === 0 || blockImporting}
                      style={{
                        background: '#000', color: '#fff', border: 'none', borderRadius: 6,
                        padding: '8px 20px', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                        opacity: selectedEpisodes.size === 0 || blockImporting ? 0.4 : 1,
                      }}
                    >
                      {blockImporting ? 'Importiere…' : `${selectedEpisodes.size} Folge${selectedEpisodes.size !== 1 ? 'n' : ''} importieren`}
                    </button>
                  ) : (
                    <button onClick={handleCommit} disabled={selectedFolgeNummer == null || loading} style={{
                      background: '#000', color: '#fff', border: 'none', borderRadius: 6,
                      padding: '8px 20px', fontWeight: 600, fontSize: 13,
                      cursor: 'pointer', opacity: selectedFolgeNummer == null || loading ? 0.4 : 1,
                    }}>
                      {loading ? 'Importiere…' : `${previewResult.total_scenes} ${t('szene', 'p')} → ${t('episode')} ${selectedFolgeNummer ?? '?'} importieren`}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3 — Block import results */}
        {step === 3 && blockImportResults && (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%', background: '#e8f5e9',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <CheckCircle size={28} color="var(--sw-green)" />
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Block-Import abgeschlossen</h2>
            <p style={{ color: '#757575', fontSize: 14, marginBottom: 20 }}>
              {blockImportResults.filter(r => r.success).length} von {blockImportResults.length} Folgen erfolgreich importiert
            </p>
            <div style={{ maxWidth: 400, margin: '0 auto 24px', textAlign: 'left' }}>
              {blockImportResults.map(r => (
                <div key={r.episode_nr} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                  marginBottom: 6, borderRadius: 6,
                  background: r.success ? '#f1f8e9' : '#fce4ec',
                  border: `1px solid ${r.success ? '#c8e6c9' : '#f48fb1'}`,
                }}>
                  {r.success
                    ? <CheckCircle size={14} color="var(--sw-green)" />
                    : <AlertTriangle size={14} color="var(--sw-danger)" />
                  }
                  <span style={{ fontSize: 13, fontWeight: 500 }}>
                    Folge {r.episode_nr}
                    {r.success && r.scenes_imported != null && ` — ${r.scenes_imported} ${t('szene', 'p')}`}
                    {!r.success && r.error && `: ${r.error}`}
                  </span>
                </div>
              ))}
            </div>
            <button
              onClick={() => navigate('/?imported=' + Date.now())}
              style={{ background: '#000', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 24px', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
            >
              Zum Drehbuch
            </button>
          </div>
        )}

        {/* Step 3 */}
        {step === 3 && commitResult && (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%', background: '#e8f5e9',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <CheckCircle size={28} color="var(--sw-green)" />
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Import erfolgreich</h2>
            <p style={{ color: '#757575', fontSize: 14, marginBottom: 24 }}>
              {commitResult.scenes_imported} {t('szene', 'p')} importiert
              {commitResult.characters_created > 0 && `, ${commitResult.characters_created} Rollen angelegt`}
              {commitResult.komparsen_created > 0 && `, ${commitResult.komparsen_created} ${t('komparse', 'p')} angelegt`}
              {commitResult.motive_created > 0 && `, ${commitResult.motive_created} ${t('motiv', 'p')} angelegt`}
            </p>

            {(commitResult.unbekannte_stimmungen?.length ?? 0) > 0 && (
              <div style={{
                background: '#fff8e1', border: '1px solid #f59e0b', borderRadius: 8,
                padding: 16, marginBottom: 24, textAlign: 'left',
              }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
                  <AlertTriangle size={16} color="#b45309" style={{ flexShrink: 0, marginTop: 1 }} />
                  <strong style={{ fontSize: 13, color: '#92400e' }}>
                    {commitResult.unbekannte_stimmungen!.length} unbekannte Stimmung{commitResult.unbekannte_stimmungen!.length > 1 ? 'en' : ''} importiert
                  </strong>
                </div>
                <p style={{ fontSize: 12, color: '#78350f', margin: '0 0 8px', lineHeight: 1.6 }}>
                  Folgende Stimmungen wurden in die DK-Settings aufgenommen, aber noch nicht in die Tagesreihenfolge eingeordnet:{' '}
                  <strong>{commitResult.unbekannte_stimmungen!.join(', ')}</strong>
                </p>
                <p style={{ fontSize: 12, color: '#78350f', margin: '0 0 12px', lineHeight: 1.6 }}>
                  Bitte in <strong>DK-Settings › Allgemein</strong> die Reihenfolge prüfen und festlegen, welche Stimmung die letzte des Tages ist (Tageswechsel-Trigger).
                </p>
                <a
                  href="/drehbuchkoordination"
                  style={{ fontSize: 12, fontWeight: 600, color: '#92400e', textDecoration: 'underline' }}
                >
                  Zu DK-Settings › Allgemein
                </a>
              </div>
            )}

            {commitResult.warnings.length > 0 && (
              <div style={{
                background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 8,
                padding: 12, marginBottom: 24, textAlign: 'left',
              }}>
                {commitResult.warnings.map((w, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, fontSize: 13, color: '#795548', marginBottom: i < commitResult.warnings.length - 1 ? 4 : 0 }}>
                    <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                    {w}
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                onClick={() => navigate('/')}
                style={{
                  background: '#000', color: '#fff', border: 'none', borderRadius: 8,
                  padding: '10px 24px', fontWeight: 600, fontSize: 14, cursor: 'pointer',
                }}
              >
                Zur {t('episode','c')}übersicht
              </button>
              <button
                onClick={reset}
                style={{
                  background: '#f5f5f5', color: '#000', border: 'none', borderRadius: 8,
                  padding: '10px 20px', fontWeight: 500, fontSize: 14, cursor: 'pointer',
                }}
              >
                Weiterer Import
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}

// Kleines Info-Icon mit Tooltip — für Felder, deren Funktion nicht selbsterklärend ist.
function InfoDot({ text, placement }: { text: string; placement?: 'top' | 'bottom' | 'right' }) {
  return (
    <Tooltip text={text} placement={placement}>
      <Info size={12} color="#bbb" style={{ cursor: 'help', flexShrink: 0 }} />
    </Tooltip>
  )
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div style={{
      flex: 1, border: '1px solid #e0e0e0', borderRadius: 8, padding: '12px 16px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 12, color: '#757575' }}>{label}</div>
    </div>
  )
}

function tagStyle(bg: string, color: string): React.CSSProperties {
  return {
    fontSize: 10, fontWeight: 600, padding: '0px 5px', borderRadius: 3,
    background: bg, color, whiteSpace: 'nowrap', marginLeft: 3,
  }
}

const selectStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 6,
  border: '1px solid #e0e0e0', fontSize: 14,
  background: '#fff', cursor: 'pointer',
}

const compactSelectStyle: React.CSSProperties = {
  padding: '4px 8px', borderRadius: 4,
  border: '1px solid #e0e0e0', fontSize: 12,
  background: '#fff', cursor: 'pointer',
}
