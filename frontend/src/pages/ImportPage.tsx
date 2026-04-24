import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import AppShell from '../components/AppShell'
import { FileUp, CheckCircle, AlertTriangle, ChevronRight, UploadCloud, X } from 'lucide-react'
import { useSelectedProduction } from '../App'

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
const STAGE_TYPES = [
  { value: 'expose', label: 'Exposé' },
  { value: 'treatment', label: 'Treatment' },
  { value: 'draft', label: 'Drehbuch (Draft)' },
  { value: 'final', label: 'Final' },
]

type Step = 1 | 2 | 3

interface DetectResult {
  format: string
  confidence: number
  hint?: string
}

interface PreviewResult {
  format: string
  total_scenes: number
  total_blocks: number
  charaktere: string[]
  warnings: string[]
  preview_scenes: any[]
}

interface CommitResult {
  stage_id: number
  scenes_imported: number
  entities_created: number
  warnings: string[]
}

export default function ImportPage() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { selectedProduction } = useSelectedProduction()
  const [step, setStep] = useState<Step>(1)
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [detectResult, setDetectResult] = useState<DetectResult | null>(null)
  const [formatOverride, setFormatOverride] = useState<string>('')
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 2 settings
  const [staffeln, setStaffeln] = useState<any[]>([])
  const [selectedStaffelId, setSelectedStaffelId] = useState('')
  const [bloecke, setBloecke] = useState<any[]>([])
  const [selectedBlockId, setSelectedBlockId] = useState<number | null>(null)
  const [episoden, setEpisoden] = useState<any[]>([])
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<number | null>(null)
  const [stageType, setStageType] = useState('draft')

  // Step 3 result
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null)

  // Load staffeln on mount — prefer selectedProduction as default
  useEffect(() => {
    fetch('/api/staffeln', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        setStaffeln(data)
        // Use selectedProduction from header as default if available
        if (selectedProduction && data.find((s: any) => s.id === selectedProduction.id)) {
          setSelectedStaffelId(selectedProduction.id)
        } else if (data.length > 0) {
          setSelectedStaffelId(data[0].id)
        }
      })
      .catch(() => {})
  }, [selectedProduction?.id])

  useEffect(() => {
    if (!selectedStaffelId) return
    fetch(`/api/staffeln/${selectedStaffelId}/bloecke`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        setBloecke(data)
        if (data.length > 0) setSelectedBlockId(data[0].id)
        else setSelectedBlockId(null)
      })
      .catch(() => {})
  }, [selectedStaffelId])

  useEffect(() => {
    if (!selectedBlockId) return
    fetch(`/api/bloecke/${selectedBlockId}/episoden`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        setEpisoden(data)
        if (data.length > 0) setSelectedEpisodeId(data[0].id)
        else setSelectedEpisodeId(null)
      })
      .catch(() => {})
  }, [selectedBlockId])

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
      setStep(2)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  const handleCommit = async () => {
    if (!file || !selectedEpisodeId) return
    setLoading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('episode_id', String(selectedEpisodeId))
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
    <AppShell staffeln={staffeln} selectedStaffelId={selectedStaffelId}>
      <div style={{ padding: '32px', maxWidth: 720, margin: '0 auto' }}>
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
          <div>
            <h2 style={{ marginBottom: 8, fontSize: 20, fontWeight: 600 }}>Vorschau & Einstellungen</h2>

            {/* Meta stats */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
              <StatCard label="Szenen" value={previewResult.total_scenes} />
              <StatCard label="Blöcke" value={previewResult.total_blocks} />
              <StatCard label="Charaktere" value={previewResult.charaktere.length} />
            </div>

            {/* Warnings */}
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

            {/* Preview scenes */}
            {previewResult.preview_scenes.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#757575', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Vorschau (erste {previewResult.preview_scenes.length} Szenen)
                </div>
                {previewResult.preview_scenes.map((sz: any, i: number) => (
                  <div key={i} style={{
                    border: '1px solid #e0e0e0', borderRadius: 8, padding: 12,
                    marginBottom: 8, fontSize: 13,
                  }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                      Szene {sz.nummer} — {sz.int_ext}. {sz.ort_name} ({sz.tageszeit})
                    </div>
                    <div style={{ color: '#757575' }}>
                      {sz.blocks.length} Blöcke
                      {sz.charaktere.length > 0 && ` · ${sz.charaktere.join(', ')}`}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Episode selection */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Staffel</label>
              <select
                value={selectedStaffelId}
                onChange={e => setSelectedStaffelId(e.target.value)}
                style={selectStyle}
              >
                {staffeln.map(s => <option key={s.id} value={s.id}>{s.titel}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Block</label>
              <select
                value={selectedBlockId ?? ''}
                onChange={e => setSelectedBlockId(Number(e.target.value))}
                style={selectStyle}
              >
                {bloecke.map(b => <option key={b.id} value={b.id}>Block {b.block_nummer}{b.name ? ` — ${b.name}` : ''}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Episode</label>
              <select
                value={selectedEpisodeId ?? ''}
                onChange={e => setSelectedEpisodeId(Number(e.target.value))}
                style={selectStyle}
              >
                {episoden.map(e => (
                  <option key={e.id} value={e.id}>
                    Folge {e.episode_nummer}{e.arbeitstitel ? ` — ${e.arbeitstitel}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Stage-Typ</label>
              <div style={{ display: 'flex', gap: 8 }}>
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
                disabled={!selectedEpisodeId || loading}
                style={{
                  background: '#000', color: '#fff', border: 'none', borderRadius: 8,
                  padding: '10px 24px', fontWeight: 600, fontSize: 14,
                  cursor: 'pointer', opacity: !selectedEpisodeId || loading ? 0.4 : 1,
                }}
              >
                {loading ? 'Importiere…' : `${previewResult.total_scenes} Szenen importieren`}
              </button>
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
              {commitResult.entities_created > 0 && `, ${commitResult.entities_created} Charaktere erkannt`}
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
