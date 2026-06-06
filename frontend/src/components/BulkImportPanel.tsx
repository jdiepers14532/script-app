import { useState, useRef, useEffect, useCallback } from 'react'
import { UploadCloud, X, CheckCircle, AlertTriangle, RefreshCw, FileText, Loader2, Trash2 } from 'lucide-react'

const ACCEPTED_EXTS = ['.fdx', '.fountain', '.docx', '.pdf', '.celtx', '.wdz']
const MAX_FILES = 20
const MAX_FILE_MB = 50
const MAX_BATCH_MB = 200

const FORMAT_LABELS: Record<string, string> = {
  fdx: 'Final Draft', fountain: 'Fountain', docx: 'Word', pdf: 'PDF',
  celtx: 'Celtx', writerduet: 'WriterDuet', unknown: '?',
}

interface StageType { value: string; label: string }

interface BatchJob {
  id: string
  sort_order: number
  dateiname: string
  datei_groesse?: number
  format?: string | null
  folge_nummer: number | null
  stage_type: string
  import_label?: string | null
  status: 'wartet' | 'parst' | 'fertig' | 'fehler' | 'uebersprungen'
  fehler_text?: string | null
  werkstufe_id?: string | null
  ergebnis_json?: any
}

interface Batch {
  id: string
  status: 'offen' | 'laeuft' | 'fertig' | 'teilweise_fehler' | 'abgebrochen'
  datei_anzahl: number
  fertig_anzahl: number
  fehler_anzahl: number
  jobs: BatchJob[]
}

type Phase = 'select' | 'assign' | 'progress'

export default function BulkImportPanel({
  produktionId,
  stageTypes,
  onImported,
}: {
  produktionId: string | null
  stageTypes: StageType[]
  onImported?: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>('select')
  const [dragging, setDragging] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [saveMetadata, setSaveMetadata] = useState(false)
  const [sichtbarkeit, setSichtbarkeit] = useState('autoren')
  const [pdfMistral, setPdfMistral] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [batch, setBatch] = useState<Batch | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
  const inputStyle = { padding: coarse ? '11px 12px' : '8px 10px', borderRadius: 6, border: '1px solid #e0e0e0', fontSize: 14 }

  // ── Datei-Auswahl ──
  const addFiles = useCallback((incoming: FileList | File[]) => {
    setError(null)
    const arr = Array.from(incoming)
    const accepted = arr.filter(f => ACCEPTED_EXTS.some(ext => f.name.toLowerCase().endsWith(ext)))
    if (accepted.length < arr.length) {
      setError('Einige Dateien haben ein nicht unterstütztes Format und wurden ignoriert.')
    }
    setFiles(prev => {
      const byName = new Map(prev.map(f => [f.name + f.size, f]))
      for (const f of accepted) byName.set(f.name + f.size, f)
      const merged = Array.from(byName.values())
      if (merged.length > MAX_FILES) {
        setError(`Maximal ${MAX_FILES} Dateien pro Batch — überzählige ignoriert.`)
        return merged.slice(0, MAX_FILES)
      }
      return merged
    })
  }, [])

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files)
  }

  const totalBytes = files.reduce((s, f) => s + f.size, 0)
  const oversize = files.find(f => f.size > MAX_FILE_MB * 1024 * 1024)
  const batchTooBig = totalBytes > MAX_BATCH_MB * 1024 * 1024

  // ── Upload → Batch anlegen ──
  const handleUpload = async () => {
    if (!produktionId || files.length === 0) return
    setBusy(true); setError(null)
    try {
      const fd = new FormData()
      fd.append('produktion_id', produktionId)
      fd.append('save_metadata', String(saveMetadata))
      fd.append('import_sichtbarkeit', sichtbarkeit)
      if (pdfMistral) fd.append('pdf_method', 'mistral')
      for (const f of files) fd.append('files', f)
      const res = await fetch('/api/import/batch', { method: 'POST', body: fd, credentials: 'include' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload fehlgeschlagen')
      setBatch(data)
      setPhase('assign')
    } catch (err: any) {
      setError(String(err.message || err))
    } finally {
      setBusy(false)
    }
  }

  // ── Zuordnung bearbeiten ──
  const updateJob = (id: string, patch: Partial<BatchJob>) => {
    setBatch(b => b ? { ...b, jobs: b.jobs.map(j => j.id === id ? { ...j, ...patch } : j) } : b)
  }

  const handleStart = async () => {
    if (!batch) return
    setBusy(true); setError(null)
    try {
      // 1. Zuordnung speichern
      const putRes = await fetch(`/api/import/batch/${batch.id}/zuordnung`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ jobs: batch.jobs.map(j => ({ id: j.id, folge_nummer: j.folge_nummer, stage_type: j.stage_type, import_label: j.import_label || null })) }),
      })
      const putData = await putRes.json()
      if (!putRes.ok) throw new Error(putData.error || 'Zuordnung fehlgeschlagen')
      // 2. Start
      const startRes = await fetch(`/api/import/batch/${batch.id}/start`, { method: 'POST', credentials: 'include' })
      const startData = await startRes.json()
      if (!startRes.ok) throw new Error(startData.error || 'Start fehlgeschlagen')
      setBatch(b => b ? { ...b, status: 'laeuft' } : b)
      setPhase('progress')
    } catch (err: any) {
      setError(String(err.message || err))
    } finally {
      setBusy(false)
    }
  }

  const handleRetry = async () => {
    if (!batch) return
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/import/batch/${batch.id}/retry`, { method: 'POST', credentials: 'include' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Retry fehlgeschlagen')
      setBatch(b => b ? { ...b, status: 'laeuft' } : b)
    } catch (err: any) {
      setError(String(err.message || err))
    } finally {
      setBusy(false)
    }
  }

  const handleDiscard = async () => {
    if (batch) {
      try { await fetch(`/api/import/batch/${batch.id}`, { method: 'DELETE', credentials: 'include' }) } catch {}
    }
    setBatch(null); setFiles([]); setPhase('select'); setError(null)
  }

  const resetAll = () => {
    setBatch(null); setFiles([]); setPhase('select'); setError(null)
    onImported?.()
  }

  // ── Polling im Progress-Zustand ──
  useEffect(() => {
    if (phase !== 'progress' || !batch?.id) return
    let cancelled = false
    const poll = async () => {
      try {
        const res = await fetch(`/api/import/batch/${batch.id}`, { credentials: 'include' })
        if (!res.ok) return
        const data: Batch = await res.json()
        if (cancelled) return
        setBatch(data)
        if (data.status !== 'laeuft' && pollRef.current) {
          clearInterval(pollRef.current); pollRef.current = null
        }
      } catch { /* transient */ }
    }
    poll()
    pollRef.current = setInterval(poll, 1500)
    return () => {
      cancelled = true
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }
  }, [phase, batch?.id])

  const fmtMB = (b: number) => (b / 1024 / 1024).toFixed(1)

  // ─────────────────────────── RENDER ───────────────────────────
  const missingFolge = batch?.jobs.filter(j => j.folge_nummer == null).length ?? 0
  const done = batch && batch.status !== 'laeuft' && phase === 'progress'
  const failed = batch?.jobs.filter(j => j.status === 'fehler') ?? []

  return (
    <div style={{ position: 'relative' }}>
      <style>{`@keyframes sw-spin { to { transform: rotate(360deg) } } .sw-spin { animation: sw-spin 0.8s linear infinite }`}</style>

      {/* ── Phase SELECT ── */}
      {phase === 'select' && (
        <div>
          {!produktionId && (
            <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: '#FFFDE7', border: '1px solid var(--sw-warning)', fontSize: 13 }}>
              Bitte zuerst oben eine Produktion auswählen.
            </div>
          )}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? '#000' : '#e0e0e0'}`, borderRadius: 12,
              padding: '40px 32px', textAlign: 'center', cursor: 'pointer',
              background: dragging ? '#f5f5f5' : '#fafafa', transition: 'all 0.15s', marginBottom: 16,
            }}
          >
            <UploadCloud size={32} color={dragging ? '#000' : '#ccc'} style={{ marginBottom: 12 }} />
            <div style={{ fontWeight: 500, marginBottom: 4 }}>Mehrere Dateien hierher ziehen oder klicken</div>
            <div style={{ fontSize: 12, color: '#757575' }}>
              {ACCEPTED_EXTS.join(', ')} — max. {MAX_FILES} Dateien, je {MAX_FILE_MB} MB, {MAX_BATCH_MB} MB gesamt
            </div>
            <input
              ref={fileInputRef} type="file" multiple accept={ACCEPTED_EXTS.join(',')}
              onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }}
              style={{ display: 'none' }}
            />
          </div>

          {files.length > 0 && (
            <div style={{ border: '1px solid #e0e0e0', borderRadius: 8, marginBottom: 16, overflow: 'hidden' }}>
              <div style={{ padding: '8px 12px', background: '#f5f5f5', fontSize: 12, fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                <span>{files.length} Datei(en)</span>
                <span style={{ color: batchTooBig ? 'var(--sw-danger)' : '#757575', fontWeight: 400 }}>{fmtMB(totalBytes)} MB gesamt</span>
              </div>
              {files.map((f, i) => (
                <div key={f.name + i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderTop: '1px solid #f0f0f0', fontSize: 13 }}>
                  <FileText size={14} color="#757575" />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                  <span style={{ fontSize: 11, color: f.size > MAX_FILE_MB * 1024 * 1024 ? 'var(--sw-danger)' : '#999' }}>{fmtMB(f.size)} MB</span>
                  <button onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }} title="Entfernen">
                    <X size={14} color="#999" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Globale Optionen */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 16, fontSize: 13 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={saveMetadata} onChange={e => setSaveMetadata(e.target.checked)} />
              Metadaten speichern
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={pdfMistral} onChange={e => setPdfMistral(e.target.checked)} />
              PDF: Mistral OCR
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              Sichtbarkeit:
              <select value={sichtbarkeit} onChange={e => setSichtbarkeit(e.target.value)} style={inputStyle}>
                <option value="autoren">Autoren</option>
                <option value="produktion">Produktion</option>
              </select>
            </label>
          </div>

          {error && <ErrorLine text={error} />}
          {oversize && <ErrorLine text={`„${oversize.name}" überschreitet ${MAX_FILE_MB} MB.`} />}
          {batchTooBig && <ErrorLine text={`Batch überschreitet ${MAX_BATCH_MB} MB.`} />}

          <button
            onClick={handleUpload}
            disabled={!produktionId || files.length === 0 || busy || !!oversize || batchTooBig}
            style={primaryBtn(!produktionId || files.length === 0 || busy || !!oversize || batchTooBig)}
          >
            {busy ? 'Lade hoch…' : `${files.length || ''} Datei(en) hochladen`}
          </button>
        </div>
      )}

      {/* ── Phase ASSIGN ── */}
      {phase === 'assign' && batch && (
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Zuordnung prüfen</h3>
          <p style={{ fontSize: 13, color: '#757575', marginBottom: 16 }}>
            Folge-Nummer und Stufe wurden aus den Dateinamen geraten — bitte kontrollieren.
          </p>
          <div style={{ border: '1px solid #e0e0e0', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) 64px 90px 1fr 120px', gap: 8, padding: '8px 12px', background: '#f5f5f5', fontSize: 11, fontWeight: 600, color: '#757575' }}>
              <span>Datei</span><span>Format</span><span>Folge</span><span>Stufe</span><span>Label (optional)</span>
            </div>
            {batch.jobs.map(job => (
              <div key={job.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) 64px 90px 1fr 120px', gap: 8, padding: '8px 12px', borderTop: '1px solid #f0f0f0', alignItems: 'center', fontSize: 13 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={job.dateiname}>{job.dateiname}</span>
                <span style={{ fontSize: 11, color: '#757575' }}>{FORMAT_LABELS[job.format || 'unknown'] || job.format}</span>
                <input
                  type="number" value={job.folge_nummer ?? ''}
                  onChange={e => updateJob(job.id, { folge_nummer: e.target.value === '' ? null : parseInt(e.target.value, 10) })}
                  style={{ ...inputStyle, width: '100%', borderColor: job.folge_nummer == null ? 'var(--sw-danger)' : '#e0e0e0' }}
                  placeholder="Nr."
                />
                <select value={job.stage_type} onChange={e => updateJob(job.id, { stage_type: e.target.value })} style={{ ...inputStyle, width: '100%' }}>
                  {stageTypes.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <input
                  type="text" value={job.import_label || ''} onChange={e => updateJob(job.id, { import_label: e.target.value || null })}
                  style={{ ...inputStyle, width: '100%' }} placeholder="—"
                />
              </div>
            ))}
          </div>

          {missingFolge > 0 && <ErrorLine text={`${missingFolge} Datei(en) ohne Folge-Nummer — bitte ergänzen.`} />}
          {error && <ErrorLine text={error} />}

          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={handleDiscard} disabled={busy} style={secondaryBtn(busy)}>
              <Trash2 size={14} style={{ marginRight: 6 }} /> Verwerfen
            </button>
            <button onClick={handleStart} disabled={busy || missingFolge > 0} style={primaryBtn(busy || missingFolge > 0)}>
              {busy ? 'Starte…' : `Import starten (${batch.jobs.length})`}
            </button>
          </div>
        </div>
      )}

      {/* ── Phase PROGRESS ── */}
      {phase === 'progress' && batch && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            {batch.status === 'laeuft'
              ? <Loader2 size={18} className="sw-spin" />
              : batch.fehler_anzahl > 0 ? <AlertTriangle size={18} color="var(--sw-warning)" /> : <CheckCircle size={18} color="var(--sw-green)" />}
            <h3 style={{ fontSize: 16, fontWeight: 600 }}>
              {batch.status === 'laeuft' ? 'Import läuft…' : batch.fehler_anzahl > 0 ? 'Mit Fehlern abgeschlossen' : 'Import abgeschlossen'}
            </h3>
            <span style={{ marginLeft: 'auto', fontSize: 13, color: '#757575' }}>
              {batch.fertig_anzahl}/{batch.datei_anzahl} fertig{batch.fehler_anzahl > 0 ? `, ${batch.fehler_anzahl} Fehler` : ''}
            </span>
          </div>

          <div style={{ border: '1px solid #e0e0e0', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
            {batch.jobs.map(job => (
              <div key={job.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderTop: '1px solid #f0f0f0', fontSize: 13 }}>
                <JobStatusIcon status={job.status} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={job.dateiname}>
                  {job.dateiname}
                  {job.folge_nummer != null && <span style={{ color: '#999' }}> · Folge {job.folge_nummer}</span>}
                </span>
                {job.status === 'fertig' && job.ergebnis_json && (
                  <span style={{ fontSize: 11, color: '#757575' }}>
                    {job.ergebnis_json.scenes_imported} Szenen
                  </span>
                )}
                {job.status === 'fehler' && (
                  <span style={{ fontSize: 11, color: 'var(--sw-danger)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={job.fehler_text || ''}>
                    {job.fehler_text}
                  </span>
                )}
              </div>
            ))}
          </div>

          {error && <ErrorLine text={error} />}

          {done && (
            <div style={{ display: 'flex', gap: 12 }}>
              {failed.length > 0 && (
                <button onClick={handleRetry} disabled={busy} style={secondaryBtn(busy)}>
                  <RefreshCw size={14} style={{ marginRight: 6 }} /> {failed.length} fehlgeschlagene wiederholen
                </button>
              )}
              <button onClick={resetAll} style={primaryBtn(false)}>Neuer Import</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function JobStatusIcon({ status }: { status: BatchJob['status'] }) {
  if (status === 'fertig') return <CheckCircle size={16} color="var(--sw-green)" />
  if (status === 'fehler') return <AlertTriangle size={16} color="var(--sw-danger)" />
  if (status === 'parst') return <Loader2 size={16} className="sw-spin" color="#007AFF" />
  return <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid #e0e0e0' }} />
}

function ErrorLine({ text }: { text: string }) {
  return (
    <div style={{ color: 'var(--sw-danger)', fontSize: 13, marginBottom: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
      <AlertTriangle size={14} /> {text}
    </div>
  )
}

function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    background: '#000', color: '#fff', border: 'none', borderRadius: 8,
    padding: '11px 24px', fontWeight: 600, fontSize: 14, cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.4 : 1, display: 'inline-flex', alignItems: 'center',
  }
}
function secondaryBtn(disabled: boolean): React.CSSProperties {
  return {
    background: '#fff', color: '#000', border: '1px solid #e0e0e0', borderRadius: 8,
    padding: '11px 20px', fontWeight: 600, fontSize: 14, cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.5 : 1, display: 'inline-flex', alignItems: 'center',
  }
}
