import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import AppShell from '../components/AppShell'
import { FileUp, CheckCircle, AlertTriangle, ChevronRight, UploadCloud, X, FileText, Eye, List, Scissors } from 'lucide-react'
import { useSelectedProduction, useAppSettings } from '../contexts'
import { api } from '../api/client'

const ACCEPTED_EXTS = ['.fdx', '.fountain', '.docx', '.pdf', '.celtx', '.wdz']

/** Parse "Stu. 02 / Gartenhaus / Küche" → { drehort, motiv, untermotiv } */
function parseOrtDisplay(raw: string): { drehort: string | null; motiv: string; untermotiv: string | null } {
  const normalized = raw.replace(/^A\.\s*D\.\s*/i, 'Außendreh / ').replace(/\s*\/\s*/g, ' / ')
  const parts = normalized.split(' / ').map(p => p.trim()).filter(Boolean)
  if (parts.length >= 3) return { drehort: parts[0], motiv: parts[1], untermotiv: parts.slice(2).join(' / ') }
  if (parts.length === 2) {
    if (/^(Stu\.|Studio|Außendreh|Innendreh)/i.test(parts[0])) return { drehort: parts[0], motiv: parts[1], untermotiv: null }
    return { drehort: null, motiv: parts[0], untermotiv: parts[1] }
  }
  return { drehort: null, motiv: parts[0] || raw, untermotiv: null }
}
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
        setEditDocType(rrMeta.document_type === 'treatment' ? 'Treatment' : 'Drehbuch')
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

      // Build non-scene elements from metadata
      const elems: Array<{ type: string; label: string; content: string }> = []
      if (data.rote_rosen_meta) {
        const rrm = data.rote_rosen_meta
        const coverParts = [
          rrm.staffel ? `Staffel ${rrm.staffel}` : '',
          rrm.episode ? `Episode ${rrm.episode}` : '',
          rrm.block ? `Block ${rrm.block}` : '',
          rrm.regie ? `Regie: ${rrm.regie}` : '',
          rrm.autor ? `Autor: ${rrm.autor}` : '',
          rrm.gesamtlaenge || '',
        ].filter(Boolean).join(' · ')
        elems.push({ type: 'cover', label: 'Deckblatt', content: coverParts })
        if (rrm.synopsis) elems.push({ type: 'synopsis', label: 'Synopsis', content: rrm.synopsis })
        if (rrm.recaps?.length > 0) {
          elems.push({ type: 'memo', label: 'Recaps', content: rrm.recaps.join('\n') })
        }
        if (rrm.precaps?.length > 0) {
          elems.push({ type: 'memo', label: 'Precaps', content: rrm.precaps.join('\n') })
        }
      }
      setNonSceneElements(elems)

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
      if (nonSceneElements.length > 0) fd.append('non_scene_elements', JSON.stringify(nonSceneElements))
      if (Object.keys(sceneOverrides).length > 0) fd.append('scene_overrides', JSON.stringify(sceneOverrides))
      const res = await fetch('/api/import/commit', { method: 'POST', body: fd, credentials: 'include' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || `Fehler ${res.status}`)
      }
      const data = await res.json()
      setCommitResult(data)
      setStep(3)
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
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  {isPdf && fileUrl ? (
                    <iframe
                      src={fileUrl}
                      style={{ width: '100%', height: '100%', border: 'none' }}
                      title="Dokument-Vorschau"
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
                    <select value={editDocType || (stageType === 'treatment' ? 'Treatment' : 'Drehbuch')} onChange={e => {
                      setEditDocType(e.target.value)
                      setStageType(e.target.value === 'Treatment' ? 'treatment' : 'draft')
                    }} style={{ ...compactSelectStyle, color: '#1565C0', fontWeight: 600 }}>
                      <option value="Drehbuch">Drehbuch</option>
                      <option value="Treatment">Treatment</option>
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
                    <span><b>{previewResult.total_scenes}</b> Szenen</span>
                    <span><b>{previewResult.charaktere.length}</b> Rollen</span>
                    {(previewResult.komparsen?.length ?? 0) > 0 && <span><b>{previewResult.komparsen!.length}</b> Komparsen</span>}
                    {(previewResult.motive?.length ?? 0) > 0 && <span><b>{previewResult.motive!.length}</b> Motive</span>}
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
                  const durMin = sz.dauer_sekunden > 0 ? Math.floor(sz.dauer_sekunden / 60) : 0
                  const durSec = sz.dauer_sekunden > 0 ? sz.dauer_sekunden % 60 : 0
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
                        {(() => {
                          if (!sz.ort_name) return <span style={{ fontSize: 12, color: '#999', flex: 1 }}>—</span>
                          const { drehort, motiv, untermotiv } = parseOrtDisplay(sz.ort_name)
                          return (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flex: 1, minWidth: 0, overflow: 'hidden' }}>
                              {drehort && (
                                <span style={{
                                  fontSize: 10, fontWeight: 600, padding: '0px 5px', borderRadius: 3,
                                  background: '#E0E0E0', color: '#616161', whiteSpace: 'nowrap', flexShrink: 0,
                                }}>
                                  {drehort}
                                </span>
                              )}
                              <span style={{
                                fontSize: 12, fontWeight: 600, color: '#1B5E20',
                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                              }}>
                                {motiv}
                              </span>
                              {untermotiv && (
                                <>
                                  <span style={{ color: '#ccc', fontSize: 10, flexShrink: 0 }}>/</span>
                                  <span style={{
                                    fontSize: 11, fontWeight: 500, color: '#2E7D32',
                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                  }}>
                                    {untermotiv}
                                  </span>
                                </>
                              )}
                            </span>
                          )
                        })()}
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
                          fontSize: 10, color: '#999', flexShrink: 0, border: '1px solid transparent',
                          background: 'transparent', cursor: 'pointer', padding: '0px 2px', appearance: 'none' as any,
                        }}>
                          <option value="TAG">TAG</option>
                          <option value="NACHT">NACHT</option>
                          <option value="ABEND">ABEND</option>
                          <option value="DÄMMERUNG">DÄMMERUNG</option>
                        </select>
                        <span style={{
                          fontSize: 9, fontWeight: 600, padding: '0px 4px', borderRadius: 3,
                          background: '#F3E5F5', color: '#7B1FA2', flexShrink: 0,
                          textTransform: 'uppercase', letterSpacing: 0.3,
                        }}>
                          {STAGE_TO_FORMAT[stageType] || 'Drehbuch'}
                        </span>
                      </div>

                      {/* Row 2: Tags — Spieltag, Stoppzeit, Wechselschnitt */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 2 }}>
                        {(getSceneVal(sz, i, 'spieltag') != null || sz.spieltag != null) && (
                          <span style={{ ...tagStyle('#E8EAF6', '#3949AB'), display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                            Spieltag
                            <input type="number" value={getSceneVal(sz, i, 'spieltag') ?? ''} onChange={e => updateScene(i, 'spieltag', e.target.value ? Number(e.target.value) : null)}
                              style={{ width: 28, fontSize: 10, fontWeight: 600, color: '#3949AB', border: 'none', background: 'transparent', padding: 0, textAlign: 'center' }} />
                          </span>
                        )}
                        {sz.dauer_sekunden > 0 && (
                          <span style={tagStyle('#E3F2FD', '#1565C0')}>{durMin}:{String(durSec).padStart(2, '0')}</span>
                        )}
                        {sz.isWechselschnitt && (
                          <span style={tagStyle('#FFF3E0', '#E65100')}>
                            Wechselschnitt{sz.wechselschnittPartner?.length > 0 ? ` mit SZ ${sz.wechselschnittPartner.join(', ')}` : ''}
                          </span>
                        )}
                        {sz.textelemente?.length > 0 && (
                          <span style={tagStyle('#F5F5F5', '#757575')}>{sz.textelemente.length} Elemente</span>
                        )}
                      </div>

                      {/* Row 3: Rollen with repliken count */}
                      {sz.charaktere.length > 0 && (
                        <div style={{ fontSize: 11, color: '#333', marginBottom: 1, display: 'flex', flexWrap: 'wrap', gap: '1px 0', alignItems: 'center' }}>
                          <span style={{ color: '#999', marginRight: 4 }}>Rollen: </span>
                          {(sz.charaktere_detail || sz.charaktere.map((n: string) => ({ name: n, repliken: 0 }))).map((c: any, ci: number) => (
                            <span key={ci} style={{ display: 'inline-flex', alignItems: 'center' }}>
                              {ci > 0 && <span style={{ marginRight: 3 }}>, </span>}
                              {c.name}
                              {c.repliken > 0 && (
                                <span style={tagStyle('#E3F2FD', '#1565C0')}>{c.repliken} Repl.</span>
                              )}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Row 4: Komparsen with details */}
                      {sz.komparsen?.length > 0 && (
                        <div style={{ fontSize: 11, color: '#7B1FA2', marginBottom: 1, display: 'flex', flexWrap: 'wrap', gap: '1px 0', alignItems: 'center' }}>
                          <span style={{ color: '#999', marginRight: 4 }}>Komparsen: </span>
                          {(sz.komparsen_detail || sz.komparsen.map((n: string) => ({ name: n, anzahl: 1, hat_spiel: false, hat_text: false, repliken: 0 }))).map((k: any, ki: number) => (
                            <span key={ki} style={{ display: 'inline-flex', alignItems: 'center' }}>
                              {ki > 0 && <span style={{ marginRight: 3 }}>, </span>}
                              {k.anzahl > 1 && <span style={{ fontWeight: 600 }}>{k.anzahl}× </span>}
                              {k.name}
                              {k.hat_text && (
                                <span style={tagStyle('#F3E5F5', '#7B1FA2')}>Text:{k.repliken}</span>
                              )}
                              {!k.hat_text && k.hat_spiel && (
                                <span style={tagStyle('#FFF3E0', '#E65100')}>Spiel</span>
                              )}
                              {!k.hat_text && !k.hat_spiel && (
                                <span style={tagStyle('#F5F5F5', '#9E9E9E')}>o.T.</span>
                              )}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Row 5: Zusammenfassung (editable) */}
                      {(getSceneVal(sz, i, 'zusammenfassung') || sz.zusammenfassung) && (
                        <input type="text" value={getSceneVal(sz, i, 'zusammenfassung') || ''} onChange={e => updateScene(i, 'zusammenfassung', e.target.value)}
                          style={{ width: '100%', fontSize: 10, color: '#666', fontStyle: 'italic', border: '1px solid transparent', background: 'transparent', padding: '1px 0' }}
                          onFocus={e => { e.target.style.borderColor = '#e0e0e0'; e.target.style.background = '#fff' }}
                          onBlur={e => { e.target.style.borderColor = 'transparent'; e.target.style.background = 'transparent' }}
                        />
                      )}

                      {/* Row 6: Szeneninfo (editable) */}
                      {(getSceneVal(sz, i, 'szeneninfo') || sz.szeneninfo) && (
                        <input type="text" value={getSceneVal(sz, i, 'szeneninfo') || ''} onChange={e => updateScene(i, 'szeneninfo', e.target.value)}
                          style={{ width: '100%', fontSize: 10, color: '#1565C0', fontStyle: 'italic', border: '1px solid transparent', background: 'transparent', padding: '1px 0' }}
                          onFocus={e => { e.target.style.borderColor = '#e0e0e0'; e.target.style.background = '#fff' }}
                          onBlur={e => { e.target.style.borderColor = 'transparent'; e.target.style.background = 'transparent' }}
                        />
                      )}
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
                    {loading ? 'Importiere…' : `${previewResult.total_scenes} Szenen → Folge ${selectedFolgeNummer ?? '?'} importieren`}
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
              {commitResult.scenes_imported} Szenen importiert
              {commitResult.characters_created > 0 && `, ${commitResult.characters_created} Rollen angelegt`}
              {commitResult.komparsen_created > 0 && `, ${commitResult.komparsen_created} Komparsen angelegt`}
              {commitResult.motive_created > 0 && `, ${commitResult.motive_created} Motive angelegt`}
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
                Zur Folgenübersicht
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
