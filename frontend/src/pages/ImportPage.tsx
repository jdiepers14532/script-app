import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import AppShell from '../components/AppShell'
import { FileUp, CheckCircle, AlertTriangle, ChevronRight, UploadCloud, X, FileText, Eye, List, Scissors, Pencil } from 'lucide-react'
import { useSelectedProduction, useAppSettings } from '../contexts'
import { api } from '../api/client'
import { useTerminologie } from '../sw-ui'

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
    [key: string]: any
  }
  filename_metadata?: {
    document_type?: string
    staffel?: number
    episode?: number
    fassungsdatum?: string
    show?: string
  }
}

interface CommitResult {
  folge_id: number
  werkstufe_id: string
  scenes_imported: number
  characters_created: number
  komparsen_created: number
  motive_created: number
  warnings: string[]
}

export default function ImportPage() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { selectedProduction, productions, selectProduction, selectedId } = useSelectedProduction()
  const { treatmentLabel } = useAppSettings()
  const { t } = useTerminologie()
  const STAGE_TYPES = [
    { value: 'expose', label: 'Exposé' },
    { value: 'treatment', label: treatmentLabel },
    { value: 'draft', label: 'Drehbuch (Draft)' },
    { value: 'final', label: 'Final' },
  ]
  const [step, setStep] = useState<Step>(1)
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

  // Per-scene field overrides (index → partial fields)
  const [sceneOverrides, setSceneOverrides] = useState<Record<number, Record<string, any>>>({})
  const updateScene = (idx: number, field: string, value: any) => {
    setSceneOverrides(prev => ({ ...prev, [idx]: { ...prev[idx], [field]: value } }))
  }
  const getSceneVal = (sz: any, idx: number, field: string) => sceneOverrides[idx]?.[field] ?? sz[field]

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

  // Step 3 result
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null)

  // Non-scene elements (Deckblatt, Synopsis, Memo, etc.)
  const [nonSceneElements, setNonSceneElements] = useState<Array<{ type: string; label: string; content: string }>>([])

  // PDF extraction options
  const [pdfMethod, setPdfMethod] = useState<'pdftotext' | 'mistral'>('pdftotext')
  const [pdfCropLeft, setPdfCropLeft] = useState(0)
  const [pdfCropRight, setPdfCropRight] = useState(0)
  const [pdfCropBottom, setPdfCropBottom] = useState(0)
  const [ocrAvailable, setOcrAvailable] = useState(false)

  // Check OCR availability on mount
  useEffect(() => {
    api.getOcrStatus().then(data => {
      if (data?.available) setOcrAvailable(true)
    }).catch(() => {})
  }, [])

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
        if (pdfMethod === 'pdftotext') {
          if (pdfCropLeft > 0) fd.append('pdf_crop_left', String(pdfCropLeft))
          if (pdfCropRight > 0) fd.append('pdf_crop_right', String(pdfCropRight))
          if (pdfCropBottom > 0) fd.append('pdf_crop_bottom', String(pdfCropBottom))
        }
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

  const handleCommit = async () => {
    if (!file || !selectedId || selectedFolgeNummer == null) return
    setLoading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('produktion_id', selectedId)
      fd.append('folge_nummer', String(selectedFolgeNummer))
      if (selectedBlock?.proddb_id) fd.append('proddb_block_id', selectedBlock.proddb_id)
      fd.append('stage_type', stageType)
      if (standDatum) fd.append('stand_datum', standDatum)
      if (isPdf) {
        fd.append('pdf_method', pdfMethod)
        if (pdfMethod === 'pdftotext') {
          if (pdfCropLeft > 0) fd.append('pdf_crop_left', String(pdfCropLeft))
          if (pdfCropRight > 0) fd.append('pdf_crop_right', String(pdfCropRight))
          if (pdfCropBottom > 0) fd.append('pdf_crop_bottom', String(pdfCropBottom))
        }
      }
      if (nonSceneElements.length > 0) fd.append('non_scene_elements', JSON.stringify(nonSceneElements))
      if (Object.keys(sceneOverrides).length > 0) fd.append('scene_overrides', JSON.stringify(sceneOverrides))
      const res = await fetch('/api/import/commit', { method: 'POST', body: fd, credentials: 'include' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || `Fehler ${res.status}`)
      }
      const data = await res.json()
      setCommitResult(data)
      // Save last navigation state and go directly to the imported episode
      await api.updateSettings({
        ui_settings: {
          last_produktion_id: selectedId,
          last_folge_nummer: data.folge_nummer ?? selectedFolgeNummer,
          last_stage_id: null,
          last_szene_id: null,
        },
      }).catch(() => {})
      // Dispatch event to force ScriptPage data refresh (works if already mounted via SPA)
      window.dispatchEvent(new Event('script-import-complete'))
      navigate('/?imported=' + Date.now())
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
            <h2 style={{ marginBottom: 8, fontSize: 20, fontWeight: 600 }}>Drehbuch importieren</h2>
            <p style={{ color: '#757575', marginBottom: 24, fontSize: 14 }}>
              Unterstützte Formate: Final Draft (.fdx), Fountain, Word (.docx), PDF, Celtx, WriterDuet (.wdz)
            </p>

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
                <div style={{
                  background: confidenceColor(detectResult.confidence),
                  color: '#fff', fontSize: 11, fontWeight: 600,
                  padding: '2px 8px', borderRadius: 4,
                }}>
                  {Math.round(detectResult.confidence * 100)}%
                </div>
              </div>
            )}

            {/* Format override when confidence low */}
            {detectResult && detectResult.confidence < 0.7 && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                  Format manuell wählen
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
                </label>
                {!ocrAvailable && (
                  <span style={{ fontSize: 11, color: '#999', marginTop: 4, display: 'block' }}>
                    Nicht verfügbar — Mistral API-Key muss in der Drehbuchkoordination unter KI-Einstellungen hinterlegt werden.
                  </span>
                )}
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
                      <span title="Sollte der Import fehlerhaft sein, kann es daran liegen, dass die OCR durch Fußzeilen oder Zeilennummern irritiert ist. In diesem Fall kann das Wegschneiden der selbigen helfen." style={{ cursor: 'help', fontSize: 11, color: '#999' }}>ⓘ</span>
                      <span style={{ marginLeft: 'auto' }}>
                        <button onClick={() => setShowDocPreview(false)} title="Vorschau schließen"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#999' }}>
                          <X size={14} />
                        </button>
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 11, color: '#757575' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
                        <span style={{ whiteSpace: 'nowrap' }}>L {pdfCropLeft}%</span>
                        <input type="range" min={0} max={30} value={pdfCropLeft}
                          onChange={e => setPdfCropLeft(parseInt(e.target.value))} style={{ flex: 1, height: 4 }} />
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
                        <span style={{ whiteSpace: 'nowrap' }}>R {pdfCropRight}%</span>
                        <input type="range" min={0} max={30} value={pdfCropRight}
                          onChange={e => setPdfCropRight(parseInt(e.target.value))} style={{ flex: 1, height: 4 }} />
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
                        <span style={{ whiteSpace: 'nowrap' }}>U {pdfCropBottom}%</span>
                        <input type="range" min={0} max={30} value={pdfCropBottom}
                          onChange={e => setPdfCropBottom(parseInt(e.target.value))} style={{ flex: 1, height: 4 }} />
                      </label>
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
                    <button onClick={() => setShowDocPreview(false)} title="Vorschau schließen"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#999' }}>
                      <X size={14} />
                    </button>
                  </div>
                )}
                <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                  {isPdf && fileUrl ? (
                    <>
                      <iframe
                        src={fileUrl}
                        style={{ width: '100%', height: '100%', border: 'none' }}
                        title="Dokument-Vorschau"
                      />
                      {/* Crop overlays — left, right, bottom */}
                      {pdfMethod === 'pdftotext' && pdfCropLeft > 0 && (
                        <div style={{
                          position: 'absolute', top: 0, left: 0, bottom: 0,
                          width: `${pdfCropLeft}%`,
                          background: 'rgba(255, 59, 48, 0.12)',
                          borderRight: '2px dashed rgba(255, 59, 48, 0.6)',
                          pointerEvents: 'none',
                        }} />
                      )}
                      {pdfMethod === 'pdftotext' && pdfCropRight > 0 && (
                        <div style={{
                          position: 'absolute', top: 0, right: 0, bottom: 0,
                          width: `${pdfCropRight}%`,
                          background: 'rgba(255, 59, 48, 0.12)',
                          borderLeft: '2px dashed rgba(255, 59, 48, 0.6)',
                          pointerEvents: 'none',
                        }} />
                      )}
                      {pdfMethod === 'pdftotext' && pdfCropBottom > 0 && (
                        <div style={{
                          position: 'absolute', left: 0, right: 0, bottom: 0,
                          height: `${pdfCropBottom}%`,
                          background: 'rgba(255, 59, 48, 0.12)',
                          borderTop: '2px dashed rgba(255, 59, 48, 0.6)',
                          pointerEvents: 'none',
                        }} />
                      )}
                    </>
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
                    <button onClick={() => setShowDocPreview(true)} title="Dokument-Vorschau öffnen"
                      style={{
                        background: 'none', border: '1px solid #e0e0e0', borderRadius: 4,
                        padding: '2px 6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                        fontSize: 11, color: '#757575',
                      }}>
                      <Eye size={12} /> Dokument
                    </button>
                  )}

                  {/* Metadata fields (always editable) */}
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                    <select value={editDocType || (stageType === 'treatment' ? treatmentLabel : 'Drehbuch')} onChange={e => {
                      setEditDocType(e.target.value)
                      setStageType(e.target.value === treatmentLabel ? 'treatment' : 'draft')
                    }} style={{ ...compactSelectStyle, color: '#1565C0', fontWeight: 600 }}>
                      <option value="Drehbuch">Drehbuch</option>
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

                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, fontSize: 11, color: '#757575' }}>
                    <span><b>{previewResult.total_scenes}</b> {t('szene', 'p')}</span>
                    <span><b>{previewResult.charaktere.length}</b> Rollen</span>
                    {(previewResult.komparsen?.length ?? 0) > 0 && <span><b>{previewResult.komparsen!.length}</b> {t('komparse', 'p')}</span>}
                    {(previewResult.motive?.length ?? 0) > 0 && <span><b>{previewResult.motive!.length}</b> {t('motiv', 'p')}</span>}
                    {(() => {
                      const totalSec = previewResult.szenen.reduce((sum: number, s: any) => sum + (s.dauer_sekunden || 0), 0)
                      if (totalSec === 0) return null
                      const mm = Math.floor(totalSec / 60); const ss = totalSec % 60
                      return <span><b>{mm}:{String(ss).padStart(2, '0')}</b></span>
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

                {/* Row 2: Stage type */}
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {STAGE_TYPES.map(st => (
                      <button key={st.value} onClick={() => setStageType(st.value)} style={{
                        padding: '4px 10px', borderRadius: 4, fontSize: 11, border: '1px solid',
                        borderColor: stageType === st.value ? '#000' : '#e0e0e0',
                        background: stageType === st.value ? '#000' : '#fff',
                        color: stageType === st.value ? '#fff' : '#666',
                        cursor: 'pointer', fontWeight: stageType === st.value ? 600 : 400,
                      }}>
                        {st.label}
                      </button>
                    ))}
                  </div>
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
                            <select value={elem.type} onChange={e => {
                              const updated = [...nonSceneElements]
                              updated[idx] = { ...elem, type: e.target.value }
                              setNonSceneElements(updated)
                            }} style={{ ...compactSelectStyle, fontSize: 10, padding: '1px 4px', fontWeight: 600, color: '#3949AB', background: '#E8EAF6', border: 'none' }}>
                              <option value="cover">Deckblatt</option>
                              <option value="synopsis">Synopsis</option>
                              <option value="memo">Memo</option>
                            </select>
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
                                <button onClick={() => {
                                  const lines = elem.content.split('\n')
                                  const mid = Math.ceil(lines.length / 2)
                                  const updated = [...nonSceneElements]
                                  updated.splice(idx, 1,
                                    { ...elem, content: lines.slice(0, mid).join('\n') },
                                    { ...elem, content: lines.slice(mid).join('\n'), label: elem.label + ' (2)' },
                                  )
                                  setNonSceneElements(updated)
                                }} title="Element teilen" style={{
                                  background: 'none', border: '1px solid #e0e0e0', borderRadius: 3,
                                  padding: '1px 4px', cursor: 'pointer', display: 'flex', alignItems: 'center',
                                }}>
                                  <Scissors size={10} color="#757575" />
                                </button>
                              )}
                              {/* Remove button */}
                              <button onClick={() => {
                                setNonSceneElements(nonSceneElements.filter((_, i) => i !== idx))
                              }} title="Element entfernen" style={{
                                background: 'none', border: '1px solid #e0e0e0', borderRadius: 3,
                                padding: '1px 4px', cursor: 'pointer', display: 'flex', alignItems: 'center',
                              }}>
                                <X size={10} color="#999" />
                              </button>
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
                            <button onClick={() => {
                              const merged = {
                                ...elem,
                                content: elem.content + '\n' + nonSceneElements[idx + 1].content,
                                label: elem.label,
                              }
                              const updated = [...nonSceneElements]
                              updated.splice(idx, 2, merged)
                              setNonSceneElements(updated)
                            }} title="Mit nächstem Element zusammenführen" style={{
                              background: 'none', border: '1px dashed #ccc', borderRadius: 3,
                              padding: '0px 8px', cursor: 'pointer', fontSize: 9, color: '#999',
                            }}>
                              ↕ Zusammenführen
                            </button>
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
                          fontVariantNumeric: 'tabular-nums', minWidth: 44, flexShrink: 0,
                        }}>
                          SZ {sz.nummer}
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
                          <option value="Drehbuch">Drehbuch</option>
                          <option value="Storyline">Storyline</option>
                          <option value="Notiz">Notiz</option>
                        </select>
                      </div>

                      {/* Row 2: Tags — Spieltag, Stoppzeit, Wechselschnitt */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 2 }}>
                        <span style={{ ...tagStyle('#E8EAF6', '#3949AB'), display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                          Spieltag
                          <input type="number" value={getSceneVal(sz, i, 'spieltag') ?? ''} onChange={e => updateScene(i, 'spieltag', e.target.value ? Number(e.target.value) : null)}
                            placeholder="–"
                            style={{ width: 28, fontSize: 10, fontWeight: 600, color: '#3949AB', border: 'none', background: 'transparent', padding: 0, textAlign: 'center' }} />
                        </span>
                        <span style={{ ...tagStyle('#E3F2FD', '#1565C0'), display: 'inline-flex', alignItems: 'center', gap: 2 }}>
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
                        {sz.isWechselschnitt && (
                          <span style={tagStyle('#FFF3E0', '#E65100')}>
                            Wechselschnitt{sz.wechselschnittPartner?.length > 0 ? ` mit SZ ${sz.wechselschnittPartner.join(', ')}` : ''}
                          </span>
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
                  <button onClick={handleCommit} disabled={selectedFolgeNummer == null || loading} style={{
                    background: '#000', color: '#fff', border: 'none', borderRadius: 6,
                    padding: '8px 20px', fontWeight: 600, fontSize: 13,
                    cursor: 'pointer', opacity: selectedFolgeNummer == null || loading ? 0.4 : 1,
                  }}>
                    {loading ? 'Importiere…' : `${previewResult.total_scenes} ${t('szene', 'p')} → ${t('episode')} ${selectedFolgeNummer ?? '?'} importieren`}
                  </button>
                </div>
              </div>
            </div>
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
