import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import AppShell from '../components/AppShell'
import { FileUp, CheckCircle, AlertTriangle, ChevronRight, UploadCloud, X } from 'lucide-react'
import { useSelectedProduction, useAppSettings } from '../contexts'

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
  const { selectedProduction, productions } = useSelectedProduction()
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
  const [selectedProduktionId, setSelectedProduktionId] = useState('')
  const [bloecke, setBloecke] = useState<any[]>([])
  const [selectedBlock, setSelectedBlock] = useState<any | null>(null)
  const [selectedFolgeNummer, setSelectedFolgeNummer] = useState<number | null>(null)
  const [stageType, setStageType] = useState('draft')

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

  // Step 3 result
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null)

  // Set selectedProduktionId from context
  useEffect(() => {
    if (selectedProduction) {
      setSelectedProduktionId(selectedProduction.id)
    } else if (productions.length > 0) {
      setSelectedProduktionId(productions[0].id)
    }
  }, [selectedProduction?.id, productions.length])

  // Load Blöcke from ProdDB (live, no sync)
  useEffect(() => {
    if (!selectedProduktionId) return
    fetch(`/api/produktionen/${selectedProduktionId}/bloecke`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        setBloecke(data)
        const first = data.length > 0 ? data[0] : null
        setSelectedBlock(first)
        setSelectedFolgeNummer(first?.folge_von ?? null)
      })
      .catch(() => {})
  }, [selectedProduktionId])

  // When block changes, reset folge to first of that block
  useEffect(() => {
    setSelectedFolgeNummer(selectedBlock?.folge_von ?? null)
  }, [selectedBlock?.proddb_id])

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
      }

      // Auto-fill folge from detected episode number
      const detectedEpisode = data.rote_rosen_meta?.episode || data.filename_metadata?.episode
      if (detectedEpisode && allFolgen.some(f => f.nr === detectedEpisode)) {
        handleFolgeSelect(detectedEpisode)
      }

      setStep(2)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  const handleCommit = async () => {
    if (!file || !selectedProduktionId || selectedFolgeNummer == null) return
    setLoading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('produktion_id', selectedProduktionId)
      fd.append('folge_nummer', String(selectedFolgeNummer))
      if (selectedBlock?.proddb_id) fd.append('proddb_block_id', selectedBlock.proddb_id)
      fd.append('stage_type', stageType)
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
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const confidenceColor = (c: number) =>
    c >= 0.9 ? 'var(--sw-green)' : c >= 0.7 ? 'var(--sw-warning)' : 'var(--sw-danger)'

  return (
    <AppShell hideProductionSelector>
      <div style={{ padding: '32px', ...(step !== 2 ? { maxWidth: 720, margin: '0 auto' } : {}) }}>
        {/* Stepper */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 32 }}>
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
          <div style={{ display: 'flex', gap: 40, alignItems: 'flex-start' }}>
            {/* Left: Szenenvorschau */}
            <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', maxHeight: 'calc(100vh - 160px)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#757575', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {previewResult.total_scenes} Szenen
              </div>
              {previewResult.szenen.map((sz: any, i: number) => (
                <div key={i} style={{
                  padding: '6px 8px', borderBottom: '1px solid #f0f0f0', fontSize: 13,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 40, flexShrink: 0, fontVariantNumeric: 'tabular-nums', fontSize: 11, color: '#bbb', textAlign: 'right' }}>
                      SZ {sz.nummer}
                    </span>
                    {sz.isWechselschnitt && (
                      <span style={{ fontSize: 9, background: '#E3F2FD', color: '#1565C0', padding: '1px 5px', borderRadius: 3, fontWeight: 600, flexShrink: 0 }}>
                        WS
                      </span>
                    )}
                    <span style={{ width: 36, flexShrink: 0, fontSize: 11, color: sz.int_ext === 'EXT' ? '#00C853' : '#757575', fontWeight: 500 }}>
                      {sz.int_ext}
                    </span>
                    <span style={{ flex: '0 1 250px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {sz.ort_name || '—'}
                    </span>
                    <span style={{ width: 36, flexShrink: 0, fontSize: 11, color: '#aaa' }}>
                      {sz.tageszeit}
                    </span>
                    {sz.spieltag != null && (
                      <span style={{ width: 30, flexShrink: 0, fontSize: 10, color: '#bbb', fontWeight: 500 }}>
                        ST{sz.spieltag}
                      </span>
                    )}
                    {sz.dauer_sekunden > 0 && (
                      <span style={{ width: 40, flexShrink: 0, fontSize: 11, color: '#007AFF', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                        {Math.floor(sz.dauer_sekunden / 60)}:{String(sz.dauer_sekunden % 60).padStart(2, '0')}
                      </span>
                    )}
                    <span style={{ flex: 1, fontSize: 12, color: '#757575', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {sz.charaktere.join(', ')}
                    </span>
                  </div>
                  {sz.zusammenfassung && (
                    <div style={{ marginTop: 2, marginLeft: 48, fontSize: 11, color: '#999', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {sz.zusammenfassung}
                    </div>
                  )}
                  {sz.szeneninfo && (
                    <div style={{ marginTop: 1, marginLeft: 48, fontSize: 10, color: '#90CAF9', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {sz.szeneninfo}
                    </div>
                  )}
                  {sz.komparsen?.length > 0 && (
                    <div style={{ marginTop: 1, marginLeft: 48, fontSize: 10, color: '#CE93D8' }}>
                      Komp: {sz.komparsen.join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Right: Einstellungen */}
            <div style={{ width: 360, flexShrink: 0 }}>
              <h2 style={{ marginBottom: 20, fontSize: 20, fontWeight: 600 }}>Einstellungen</h2>

              <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                <StatCard label="Szenen" value={previewResult.total_scenes} />
                <StatCard label="Rollen" value={previewResult.charaktere.length} />
                {(previewResult.komparsen?.length ?? 0) > 0 && (
                  <StatCard label="Komparsen" value={previewResult.komparsen!.length} />
                )}
                {(previewResult.motive?.length ?? 0) > 0 && (
                  <StatCard label="Motive" value={previewResult.motive!.length} />
                )}
              </div>

              {/* Auto-detected metadata info */}
              {(previewResult.rote_rosen_meta || previewResult.filename_metadata) && (
                <div style={{
                  background: '#e3f2fd', border: '1px solid #90caf9', borderRadius: 8,
                  padding: 12, marginBottom: 16, fontSize: 13, color: '#1565c0',
                }}>
                  Erkannt: {previewResult.rote_rosen_meta?.document_type === 'treatment' ? 'Treatment' : previewResult.rote_rosen_meta?.document_type === 'drehbuch' ? 'Drehbuch' : previewResult.filename_metadata?.document_type || 'PDF'}
                  {(previewResult.rote_rosen_meta?.episode || previewResult.filename_metadata?.episode) &&
                    ` — Episode ${previewResult.rote_rosen_meta?.episode || previewResult.filename_metadata?.episode}`}
                  {previewResult.filename_metadata?.fassungsdatum &&
                    ` — Stand ${previewResult.filename_metadata.fassungsdatum}`}
                  {previewResult.rote_rosen_meta?.regie &&
                    ` — Regie: ${previewResult.rote_rosen_meta.regie}`}
                </div>
              )}

              {previewResult.warnings.length > 0 && (
                <div style={{
                  background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 8,
                  padding: 12, marginBottom: 16,
                }}>
                  {previewResult.warnings.map((w, i) => (
                    <div key={i} style={{ display: 'flex', gap: 6, fontSize: 13, color: '#795548', marginBottom: i < previewResult.warnings.length - 1 ? 4 : 0 }}>
                      <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                      {w}
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Staffel</label>
                <select value={selectedProduktionId} onChange={e => setSelectedProduktionId(e.target.value)} style={selectStyle}>
                  {productions.filter(p => p.is_active).length > 0 && (
                    <optgroup label="Aktive Produktionen">
                      {productions.filter(p => p.is_active).map(p => {
                        const label = p.staffelnummer ? `${p.title} Staffel ${p.staffelnummer}` : p.title
                        return <option key={p.id} value={p.id}>{p.projektnummer ? `${p.projektnummer} · ${label}` : label}</option>
                      })}
                    </optgroup>
                  )}
                  {productions.filter(p => !p.is_active).length > 0 && (
                    <optgroup label="Inaktive Produktionen">
                      {productions.filter(p => !p.is_active).map(p => {
                        const label = p.staffelnummer ? `${p.title} Staffel ${p.staffelnummer}` : p.title
                        return <option key={p.id} value={p.id}>{p.projektnummer ? `${p.projektnummer} · ${label}` : label}</option>
                      })}
                    </optgroup>
                  )}
                </select>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Block</label>
                <select value={selectedBlock?.proddb_id ?? ''} onChange={e => {
                  const b = bloecke.find(b => b.proddb_id === e.target.value)
                  setSelectedBlock(b ?? null)
                }} style={selectStyle}>
                  {bloecke.map(b => (
                    <option key={b.proddb_id} value={b.proddb_id}>
                      Block {b.block_nummer}{b.folge_von != null ? ` (Folgen ${b.folge_von}–${b.folge_bis})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Folge</label>
                <select value={selectedFolgeNummer ?? ''} onChange={e => handleFolgeSelect(Number(e.target.value))} style={selectStyle}>
                  {allFolgen.map(({ nr, block }) => (
                    <option key={nr} value={nr} style={{ fontWeight: block.proddb_id === selectedBlock?.proddb_id ? 700 : 400 }}>
                      Folge {nr}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Stage-Typ</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {STAGE_TYPES.map(st => (
                    <button
                      key={st.value}
                      onClick={() => setStageType(st.value)}
                      style={{
                        padding: '6px 14px', borderRadius: 6, fontSize: 13,
                        border: '1px solid',
                        borderColor: stageType === st.value ? '#000' : '#e0e0e0',
                        background: stageType === st.value ? '#000' : '#fff',
                        color: stageType === st.value ? '#fff' : '#000',
                        cursor: 'pointer', fontWeight: stageType === st.value ? 600 : 400,
                      }}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <div style={{ color: 'var(--sw-danger)', fontSize: 13, marginBottom: 16, display: 'flex', gap: 6 }}>
                  <AlertTriangle size={14} />
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={() => setStep(1)}
                  style={{
                    background: '#f5f5f5', color: '#000', border: 'none', borderRadius: 8,
                    padding: '10px 20px', fontWeight: 500, fontSize: 14, cursor: 'pointer',
                  }}
                >
                  Zurück
                </button>
                <button
                  onClick={handleCommit}
                  disabled={selectedFolgeNummer == null || loading}
                  style={{
                    background: '#000', color: '#fff', border: 'none', borderRadius: 8,
                    padding: '10px 24px', fontWeight: 600, fontSize: 14,
                    cursor: 'pointer', opacity: selectedFolgeNummer == null || loading ? 0.4 : 1,
                  }}
                >
                  {loading ? 'Importiere…' : `${previewResult.total_scenes} Szenen → Folge ${selectedFolgeNummer ?? '?'} importieren`}
                </button>
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

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div style={{
      flex: 1, border: '1px solid #e0e0e0', borderRadius: 8, padding: '12px 16px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 12, color: '#757575' }}>{label}</div>
    </div>
  )
}

const selectStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 6,
  border: '1px solid #e0e0e0', fontSize: 14,
  background: '#fff', cursor: 'pointer',
}
