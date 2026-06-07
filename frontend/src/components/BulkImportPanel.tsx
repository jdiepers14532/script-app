import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { UploadCloud, X, CheckCircle, AlertTriangle, RefreshCw, FileText, Loader2, Trash2, Info, Lock, Search } from 'lucide-react'
import Tooltip from './Tooltip'
import { api } from '../api/client'
import BulkPreviewModal from './BulkPreviewModal'

// Kleines Info-Icon mit Tooltip — für Felder, deren Funktion nicht selbsterklärend ist.
function InfoDot({ text, placement }: { text: string; placement?: 'top' | 'bottom' | 'right' }) {
  return (
    <Tooltip text={text} placement={placement}>
      <Info size={12} color="#bbb" style={{ cursor: 'help', flexShrink: 0 }} />
    </Tooltip>
  )
}

const ACCEPTED_EXTS = ['.fdx', '.fountain', '.docx', '.pdf', '.celtx', '.wdz']
const MAX_FILES = 20
const MAX_FILE_MB = 50
const MAX_BATCH_MB = 200

const FORMAT_LABELS: Record<string, string> = {
  fdx: 'Final Draft', fountain: 'Fountain', docx: 'Word', pdf: 'PDF',
  celtx: 'Celtx', writerduet: 'WriterDuet', unknown: '?',
}

interface StageType { value: string; label: string }
interface StageLabel { id: number; name: string; is_produktionsfassung?: boolean; sort_order?: number }

interface BatchJob {
  id: string
  sort_order: number
  dateiname: string
  datei_groesse?: number
  format?: string | null
  folge_nummer: number | null
  stage_type: string
  import_label?: string | null
  import_sichtbarkeit?: string
  renumber?: boolean
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
  stageLabels = [],
  onImported,
}: {
  produktionId: string | null
  stageTypes: StageType[]
  stageLabels?: StageLabel[]
  onImported?: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>('select')
  const [dragging, setDragging] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [saveMetadata, setSaveMetadata] = useState(false)
  // Globale Defaults (Seite 1) — werden in den User-Settings persistiert und auf alle Folgen vorbelegt.
  const [sichtbarkeit, setSichtbarkeit] = useState('autoren')
  const [globalLabel, setGlobalLabel] = useState<string | null>(null)
  // Globale Neunummerierung (Szenen ab 1) — nicht persistiert, da pro Import situativ.
  const [globalRenumber, setGlobalRenumber] = useState(false)
  const [pdfMistral, setPdfMistral] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [batch, setBatch] = useState<Batch | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Vorschau (Variante A): on-demand Modal pro Datei + Hintergrund-Analyse für Szenenzahl/Warnung.
  const [previewJob, setPreviewJob] = useState<BatchJob | null>(null)
  const [sceneInfo, setSceneInfo] = useState<Record<string, { count: number; minNr: number } | 'loading' | 'error'>>({})
  const sweptBatchId = useRef<string | null>(null)
  // Datei-Objekt (für PDF-Vorschau/Parse) zu einem Job finden — Dateien bleiben nach Upload erhalten.
  const fileForJob = useCallback((job: BatchJob) =>
    files.find(f => f.name === job.dateiname) || files[job.sort_order] || null, [files])

  // Das Produktionsfassungs-Label sperrt beim Import die Werkstufe (read-only). Bei mehreren
  // gilt das mit der höchsten sort_order. null = keines definiert. (Analog Einzelimport.)
  const lockLabel = useMemo(() => {
    const cands = stageLabels.filter(sl => sl.is_produktionsfassung)
    if (cands.length === 0) return null
    return cands.reduce((a, b) => ((b.sort_order ?? 0) > (a.sort_order ?? 0) ? b : a))
  }, [stageLabels])
  const isLockLabel = useCallback((name?: string | null) => !!name && !!lockLabel && name === lockLabel.name, [lockLabel])

  // Globale Defaults aus User-Settings laden (einmalig) und bei Änderung debounced speichern.
  const defaultsLoaded = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (defaultsLoaded.current) return
    defaultsLoaded.current = true
    api.getSettings().then((s: any) => {
      const ui = s?.ui_settings || {}
      if (ui.last_import_label) setGlobalLabel(ui.last_import_label)
      if (ui.last_import_sichtbarkeit) setSichtbarkeit(ui.last_import_sichtbarkeit)
    }).catch(() => {})
  }, [])
  useEffect(() => {
    if (!defaultsLoaded.current) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      api.updateSettings({ ui_settings: { last_import_label: globalLabel || null, last_import_sichtbarkeit: sichtbarkeit } }).catch(() => {})
    }, 600)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [globalLabel, sichtbarkeit])

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

  // „Metadaten speichern" wirkt nur bei Fountain/FDX (dateiinterne Metadaten) — bei PDF/Word nutzlos.
  const hasMetaCapableFiles = files.some(f => /\.(fountain|fdx)$/i.test(f.name))
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
      if (globalLabel) fd.append('import_label', globalLabel)
      if (globalRenumber) fd.append('renumber', 'true')
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
  // Lock-Kopplung wie im Einzelimport: Produktionsfassungs-Label ⇄ Stufe „gelockt" (final).
  const updateJob = (id: string, patch: Partial<BatchJob>) => {
    setBatch(b => {
      if (!b) return b
      return {
        ...b,
        jobs: b.jobs.map(j => {
          if (j.id !== id) return j
          const next = { ...j, ...patch }
          if ('import_label' in patch) {
            if (isLockLabel(patch.import_label)) next.stage_type = 'final'
            else if (j.stage_type === 'final') next.stage_type = 'draft'
          }
          if ('stage_type' in patch) {
            if (patch.stage_type === 'final' && lockLabel) next.import_label = lockLabel.name
            else if (patch.stage_type !== 'final' && isLockLabel(j.import_label)) next.import_label = null
          }
          return next
        }),
      }
    })
  }

  const handleStart = async () => {
    if (!batch) return
    setBusy(true); setError(null)
    try {
      // 1. Zuordnung speichern
      const putRes = await fetch(`/api/import/batch/${batch.id}/zuordnung`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ jobs: batch.jobs.map(j => ({ id: j.id, folge_nummer: j.folge_nummer, stage_type: j.stage_type, import_label: j.import_label || null, import_sichtbarkeit: j.import_sichtbarkeit || 'autoren', renumber: j.renumber === true })) }),
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
    setSceneInfo({}); sweptBatchId.current = null; setPreviewJob(null)
  }

  const resetAll = () => {
    setBatch(null); setFiles([]); setPhase('select'); setError(null)
    setSceneInfo({}); sweptBatchId.current = null; setPreviewJob(null)
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

  // ── Hintergrund-Analyse in der Zuordnungs-Phase ──
  // Szenenzahl + Start-Szene pro Datei (pdftotext, ohne OCR — schnell), für Badge +
  // „beginnt nicht bei 1"-Warnung. Läuft einmal pro Batch, max. 3 parallel.
  useEffect(() => {
    if (phase !== 'assign' || !batch) return
    if (sweptBatchId.current === batch.id) return
    sweptBatchId.current = batch.id
    let cancelled = false
    const jobs = batch.jobs
    let idx = 0
    const worker = async () => {
      while (!cancelled && idx < jobs.length) {
        const job = jobs[idx++]
        const f = fileForJob(job)
        if (!f) continue
        setSceneInfo(prev => ({ ...prev, [job.id]: 'loading' }))
        try {
          const fd = new FormData()
          fd.append('file', f)
          const r = await fetch('/api/import/preview', { method: 'POST', body: fd, credentials: 'include' })
          if (!r.ok) throw new Error()
          const d = await r.json()
          const nums = (d.szenen || []).map((s: any) => s.nummer).filter((n: any) => typeof n === 'number')
          const minNr = nums.length ? Math.min(...nums) : 1
          if (!cancelled) setSceneInfo(prev => ({ ...prev, [job.id]: { count: (d.szenen || []).length, minNr } }))
        } catch {
          if (!cancelled) setSceneInfo(prev => ({ ...prev, [job.id]: 'error' }))
        }
      }
    }
    Promise.all(Array.from({ length: Math.min(3, jobs.length) }, () => worker()))
    return () => { cancelled = true }
  }, [phase, batch?.id, fileForJob])

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
                  <Tooltip text="Datei aus dem Batch entfernen.">
                    <button onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
                      <X size={14} color="#999" />
                    </button>
                  </Tooltip>
                </div>
              ))}
            </div>
          )}

          {/* Globale Optionen */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 16, fontSize: 13 }}>
            {hasMetaCapableFiles && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={saveMetadata} onChange={e => setSaveMetadata(e.target.checked)} />
                Metadaten speichern
                <InfoDot text={`Übernimmt zusätzlich die im Dokument eingebetteten Metadaten — Titelseite bei Fountain, Version/Template bei Final Draft. Staffel/Episode/Datum aus dem Dateinamen werden ohnehin immer gespeichert. Bei PDF/Word ohne Wirkung.`} placement="bottom" />
              </label>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={pdfMistral} onChange={e => setPdfMistral(e.target.checked)} />
              PDF: Mistral OCR
              <InfoDot text={`Gilt für alle PDFs im Batch: liest sie per Mistral-OCR statt einfacher Textextraktion ein — robuster bei Scans und schwierigen Layouts, aber langsamer.`} placement="bottom" />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={globalRenumber} onChange={e => setGlobalRenumber(e.target.checked)} />
              Szenen ab 1 neu nummerieren
              <InfoDot text={`Vorgabe für alle Folgen (auf Seite 2 pro Folge überschreibbar): nummeriert die Szenen beim Import lückenlos ab 1 neu — für Drehbücher, die nicht bei Szene 1 beginnen. Bereits bei 1 beginnende Drehbücher bleiben unverändert.`} placement="bottom" />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              Fassung:
              <select value={globalLabel ?? ''} onChange={e => setGlobalLabel(e.target.value || null)} style={{ ...inputStyle, color: globalLabel ? '#1565C0' : '#757575' }}>
                <option value="">Ohne Label</option>
                {stageLabels.map(sl => (
                  <option key={sl.id} value={sl.name}>{sl.is_produktionsfassung ? `🔒 ${sl.name}` : sl.name}</option>
                ))}
              </select>
              <InfoDot text={`Globale Fassungs-Label-Vorgabe für alle Folgen (auf Seite 2 pro Folge überschreibbar).\nQuelle: die in der Drehbuchkoordination festgelegten Labels.\nLabels mit 🔒 sind Produktionsfassungen — ihre Wahl sperrt die Werkstufe beim Import (read-only).`} placement="bottom" />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              Sichtbarkeit:
              <select value={sichtbarkeit} onChange={e => setSichtbarkeit(e.target.value)} style={inputStyle}>
                <option value="autoren">Autoren</option>
                <option value="produktion">Produktion</option>
              </select>
              <InfoDot text={`Globale Sichtbarkeit für alle Folgen (auf Seite 2 pro Folge überschreibbar):\n• Autoren — nur das Autorenteam (Standard).\n• Produktion — auch für die Produktion freigegeben.`} placement="bottom" />
            </label>
          </div>

          {isLockLabel(globalLabel) && (
            <div style={{ marginBottom: 16, padding: '10px 12px', borderRadius: 8, background: '#FFF3E0', border: '1px solid #FFB74D', fontSize: 12, color: '#7a5c00', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <Lock size={14} style={{ flexShrink: 0, marginTop: 1, color: '#E65100' }} />
              <span>
                <strong>Produktionsfassung gewählt:</strong> Alle Folgen werden als „gelockt" importiert und sofort gesperrt (read-only, danach nur noch Revisionen). Auf Seite 2 kannst du das pro Folge wieder zurücknehmen.
              </span>
            </div>
          )}

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
            Folge-Nummer und Stufe wurden aus den Dateinamen geraten, Fassung und Sichtbarkeit aus der globalen Wahl vorbelegt — pro Folge überschreibbar.
          </p>
          <div style={{ border: '1px solid #e0e0e0', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px,2fr) 50px 78px minmax(110px,1.3fr) minmax(120px,1.4fr) minmax(100px,1.1fr) 64px', gap: 8, padding: '8px 12px', background: '#f5f5f5', fontSize: 11, fontWeight: 600, color: '#757575' }}>
              <span>Datei</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                Format <InfoDot text="Automatisch erkanntes Dateiformat (Final Draft, Fountain, Word, PDF …)." placement="bottom" />
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                Folge <InfoDot text="Zielfolge, in die diese Datei importiert wird. Aus dem Dateinamen geraten — bitte prüfen. Pflichtfeld." placement="bottom" />
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                Stufe <InfoDot text={`Werkstufe, die angelegt wird (Exposé, Storyline, Drehbuch-Entwurf, gelockt). Aus dem Dateinamen geraten — bitte prüfen.`} placement="bottom" />
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                Fassung <InfoDot text={`Fassungs-Label aus der Drehbuchkoordination (vorbelegt mit der globalen Wahl von Seite 1, hier pro Folge überschreibbar). 🔒 = Produktionsfassung, sperrt die Werkstufe.`} placement="bottom" />
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                Sichtbar <InfoDot text={`Wer die Folge sehen darf (vorbelegt mit der globalen Wahl von Seite 1, hier pro Folge überschreibbar): Autoren oder Produktion.`} placement="bottom" />
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                Neu-Nr. <InfoDot text={`Szenen dieser Folge beim Import lückenlos ab 1 neu nummerieren (für Drehbücher, die nicht bei Szene 1 beginnen).`} placement="bottom" />
              </span>
            </div>
            {batch.jobs.map(job => (
              <div key={job.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(150px,2fr) 50px 78px minmax(110px,1.3fr) minmax(120px,1.4fr) minmax(100px,1.1fr) 64px', gap: 8, padding: '8px 12px', borderTop: '1px solid #f0f0f0', alignItems: 'center', fontSize: 13 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={job.dateiname}>{job.dateiname}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                    <Tooltip text="Vorschau: PDF + erkannte Szenen ansehen">
                      <button onClick={() => setPreviewJob(job)} disabled={!fileForJob(job)}
                        style={{ background: 'none', border: 'none', cursor: fileForJob(job) ? 'pointer' : 'default', padding: 0, display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: fileForJob(job) ? '#1565C0' : '#bbb' }}>
                        <Search size={12} /> Vorschau
                      </button>
                    </Tooltip>
                    {(() => {
                      const info = sceneInfo[job.id]
                      if (info === 'loading') return <span style={{ fontSize: 10, color: '#bbb', display: 'inline-flex', alignItems: 'center', gap: 3 }}><Loader2 size={10} className="sw-spin" /> …</span>
                      if (!info || info === 'error') return null
                      return (
                        <>
                          <span style={{ fontSize: 10, color: '#999' }}>{info.count} Szenen</span>
                          {info.minNr !== 1 && (
                            <Tooltip text={`Beginnt bei Szene ${info.minNr} statt 1. Über „Neu-Nr." oder die Vorschau ab 1 nummerieren.`}>
                              <span style={{ fontSize: 10, fontWeight: 600, color: '#E65100', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                <AlertTriangle size={10} /> ab {info.minNr}
                              </span>
                            </Tooltip>
                          )}
                        </>
                      )
                    })()}
                  </div>
                </div>
                <span style={{ fontSize: 11, color: '#757575' }}>{FORMAT_LABELS[job.format || 'unknown'] || job.format}</span>
                <input
                  type="number" value={job.folge_nummer ?? ''}
                  onChange={e => updateJob(job.id, { folge_nummer: e.target.value === '' ? null : parseInt(e.target.value, 10) })}
                  style={{ ...inputStyle, width: '100%', borderColor: job.folge_nummer == null ? 'var(--sw-danger)' : '#e0e0e0' }}
                  placeholder="Nr."
                />
                <select value={job.stage_type} onChange={e => updateJob(job.id, { stage_type: e.target.value })} style={{ ...inputStyle, width: '100%' }}>
                  {stageTypes.map(s => (
                    // „gelockt" (final) nur wählbar, wenn die Produktion ein Produktionsfassungs-Label hat.
                    <option key={s.value} value={s.value} disabled={s.value === 'final' && !lockLabel}>{s.label}</option>
                  ))}
                </select>
                <select
                  value={job.import_label || ''}
                  onChange={e => updateJob(job.id, { import_label: e.target.value || null })}
                  style={{ ...inputStyle, width: '100%', color: isLockLabel(job.import_label) ? '#E65100' : job.import_label ? '#1565C0' : '#999' }}
                >
                  <option value="">Ohne Label</option>
                  {stageLabels.map(sl => (
                    <option key={sl.id} value={sl.name}>{sl.is_produktionsfassung ? `🔒 ${sl.name}` : sl.name}</option>
                  ))}
                </select>
                <select
                  value={job.import_sichtbarkeit || 'autoren'}
                  onChange={e => updateJob(job.id, { import_sichtbarkeit: e.target.value })}
                  style={{ ...inputStyle, width: '100%' }}
                >
                  <option value="autoren">Autoren</option>
                  <option value="produktion">Produktion</option>
                </select>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <Tooltip text="Szenen dieser Folge beim Import lückenlos ab 1 neu nummerieren.">
                    <input
                      type="checkbox"
                      checked={job.renumber === true}
                      onChange={e => updateJob(job.id, { renumber: e.target.checked })}
                      style={{ width: 16, height: 16, cursor: 'pointer' }}
                    />
                  </Tooltip>
                </div>
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

      {/* Vorschau-Modal (Variante A) */}
      {previewJob && fileForJob(previewJob) && (
        <BulkPreviewModal
          file={fileForJob(previewJob)!}
          folgeNummer={previewJob.folge_nummer}
          pdfMistral={pdfMistral}
          renumber={batch?.jobs.find(j => j.id === previewJob.id)?.renumber === true}
          onToggleRenumber={v => updateJob(previewJob.id, { renumber: v })}
          onClose={() => setPreviewJob(null)}
        />
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
