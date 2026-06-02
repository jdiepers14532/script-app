// ImportPanel — 3-Tier PDF-Import
// Tier 1: deterministisch (Regex), Tier 2: KI-Strukturerkennung, Tier 3: KI-Chunked-Extraktion

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Upload, FileText, Trash2, Download, ChevronDown, ChevronRight,
  Loader2, CheckCircle, AlertCircle, Info, X, Zap, Eye, Play,
} from 'lucide-react'
import { api } from '../../api/client'
import Tooltip from '../../components/Tooltip'

interface ImportJob {
  id: string
  produktion_id: string
  status: 'queued' | 'running' | 'detecting' | 'chunking' | 'done' | 'error'
  tier_erreicht: number | null
  source_file_name: string | null
  total_chunks: number | null
  done_chunks: number
  fehler: string | null
  erstellt_am: string
  abgeschlossen_am: string | null
  ergebnis_json: any | null
}

interface CostPreview {
  chunks: number
  estimated_tokens_in: number
  estimated_tokens_out: number
  estimated_cost_eur: number | null
  provider: string
  model: string
}

function statusLabel(s: ImportJob['status']): string {
  switch (s) {
    case 'queued': return 'Wartend'
    case 'running': return 'Verarbeitung…'
    case 'detecting': return 'Struktur unklar — Tier-2 nötig'
    case 'chunking': return 'Bereit für Tier-3'
    case 'done': return 'Fertig'
    case 'error': return 'Fehler'
  }
}

function statusColor(s: ImportJob['status']): string {
  switch (s) {
    case 'done': return '#00C853'
    case 'error': return '#FF3B30'
    case 'detecting': return '#FFCC00'
    case 'chunking': return '#FF9500'
    default: return '#757575'
  }
}

function tierLabel(tier: number | null): string {
  if (tier === 1) return 'Tier 1 (Regex)'
  if (tier === 2) return 'Tier 2 (KI-Detect)'
  if (tier === 3) return 'Tier 3 (KI-Extract)'
  return ''
}

// ── Cost-Preview-Dialog ───────────────────────────────────────────────────────

function CostPreviewDialog({
  jobId,
  onClose,
  onStart,
}: {
  jobId: string
  onClose: () => void
  onStart: () => void
}) {
  const [preview, setPreview] = useState<CostPreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    api.get(`/import-jobs/${jobId}/cost-preview`)
      .then(p => setPreview(p))
      .catch(e => setErr(e.message || 'Fehler'))
      .finally(() => setLoading(false))
  }, [jobId])

  async function handleStart() {
    setStarting(true)
    try {
      await api.post(`/import-jobs/${jobId}/tier3`)
      onStart()
    } catch (e: any) {
      setErr(e.message || 'Fehler beim Starten')
      setStarting(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9000,
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        width: 440, background: 'var(--bg-surface)', borderRadius: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,0.25)', overflow: 'hidden',
      }}>
        <div style={{
          padding: '14px 18px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7 }}>
            <Zap size={14} style={{ color: '#FF9500' }} />
            Tier-3 Kostenschätzung
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 20 }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
              <Loader2 size={20} style={{ animation: 'spin 0.8s linear infinite', color: 'var(--text-muted)' }} />
            </div>
          ) : err ? (
            <div style={{ fontSize: 12, color: '#FF3B30' }}>{err}</div>
          ) : preview && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Das Dokument wird in <strong style={{ color: 'var(--text-primary)' }}>{preview.chunks} Abschnitte</strong> aufgeteilt.
                Jeder Abschnitt wird einzeln vom KI-Modell analysiert.
              </div>

              <div style={{
                padding: '12px 14px', borderRadius: 8, background: 'var(--bg)',
                border: '1px solid var(--border)', display: 'grid',
                gridTemplateColumns: '1fr 1fr', gap: '8px 16px',
              }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Provider / Modell</span>
                <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}>{preview.provider} / {preview.model}</span>

                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Chunks</span>
                <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{preview.chunks}</span>

                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Tokens (Input)</span>
                <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{preview.estimated_tokens_in.toLocaleString('de')}</span>

                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Tokens (Output)</span>
                <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{preview.estimated_tokens_out.toLocaleString('de')}</span>

                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Geschätzte Kosten</span>
                <span style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 700 }}>
                  {preview.estimated_cost_eur !== null
                    ? `≈ ${preview.estimated_cost_eur < 0.01 ? '< 0,01' : preview.estimated_cost_eur.toFixed(2)} €`
                    : 'Unbekannt'}
                </span>
              </div>

              <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Die Extraktion läuft im Hintergrund. Fortschritt wird live angezeigt.
              </div>
            </div>
          )}
        </div>

        <div style={{
          padding: '12px 18px', borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'flex-end', gap: 8,
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '7px 16px', borderRadius: 6, border: '1px solid var(--border)',
              background: 'transparent', cursor: 'pointer', fontSize: 13,
            }}
          >
            Abbrechen
          </button>
          <button
            onClick={handleStart}
            disabled={starting || loading || !!err || !preview}
            style={{
              padding: '7px 20px', borderRadius: 6, border: 'none',
              background: starting || !preview ? 'var(--border)' : '#000',
              color: starting || !preview ? 'var(--text-muted)' : '#fff',
              cursor: starting || !preview ? 'default' : 'pointer',
              fontSize: 13, fontWeight: 500,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {starting && <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} />}
            <Play size={13} />
            Tier-3 starten
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Einzelner Job-Eintrag ─────────────────────────────────────────────────────

function JobRow({
  job: initialJob,
  onDelete,
  onUpdate,
}: {
  job: ImportJob
  onDelete: (id: string) => void
  onUpdate: (job: ImportJob) => void
}) {
  const [job, setJob] = useState(initialJob)
  const [expanded, setExpanded] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [tier2Running, setTier2Running] = useState(false)
  const [showCostPreview, setShowCostPreview] = useState(false)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Job-Daten von außen aktualisieren (nach Upload)
  useEffect(() => { setJob(initialJob) }, [initialJob])

  // Polling während running
  useEffect(() => {
    if (job.status === 'running') {
      pollingRef.current = setInterval(async () => {
        try {
          const updated = await api.getImportJob(job.id)
          setJob(updated)
          onUpdate(updated)
          if (updated.status !== 'running') {
            clearInterval(pollingRef.current!)
            pollingRef.current = null
          }
        } catch { /* ignorieren */ }
      }, 2000)
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [job.status, job.id, onUpdate])

  async function handleDelete() {
    if (!confirm(`Import-Job "${job.source_file_name || job.id}" löschen?`)) return
    setDeleting(true)
    try {
      await api.deleteImportJob(job.id)
      onDelete(job.id)
    } finally {
      setDeleting(false)
    }
  }

  async function handleTier2() {
    setTier2Running(true)
    try {
      const updated = await api.post(`/import-jobs/${job.id}/tier2`)
      setJob(updated)
      onUpdate(updated)
    } catch (e: any) {
      // Status bleibt detecting, Fehlermeldung im Job
      const refreshed = await api.getImportJob(job.id)
      setJob(refreshed)
      onUpdate(refreshed)
    } finally {
      setTier2Running(false)
    }
  }

  function handleTier3Started(updatedJob: ImportJob) {
    setShowCostPreview(false)
    setJob(updatedJob)
    onUpdate(updatedJob)
  }

  const result = job.ergebnis_json
  const tier3Result = result?.tier3_result
  const displayResult = tier3Result ?? result

  // Fortschritt in %
  const progress = job.total_chunks && job.total_chunks > 0
    ? Math.round((job.done_chunks / job.total_chunks) * 100)
    : null

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderLeft: `3px solid ${statusColor(job.status)}`,
      borderRadius: 8, background: 'var(--bg-surface)', overflow: 'hidden',
    }}>
      {/* Header-Zeile */}
      <div
        style={{
          padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
          cursor: (job.status === 'done') ? 'pointer' : 'default',
        }}
        onClick={() => job.status === 'done' && setExpanded(e => !e)}
      >
        {/* Status-Icon */}
        <div style={{ flexShrink: 0, color: statusColor(job.status) }}>
          {job.status === 'done' && <CheckCircle size={14} />}
          {job.status === 'error' && <AlertCircle size={14} />}
          {(job.status === 'running' || job.status === 'queued') && (
            <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} />
          )}
          {job.status === 'detecting' && <Info size={14} />}
          {job.status === 'chunking' && <Zap size={14} />}
        </div>

        {/* Info-Block */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {job.source_file_name || 'Unbekannte Datei'}
          </div>

          {/* Progress-Bar (Tier 3) */}
          {job.status === 'running' && job.total_chunks && (
            <div style={{ marginTop: 4, marginBottom: 2 }}>
              <div style={{
                height: 3, borderRadius: 2, background: 'var(--border)',
                overflow: 'hidden', width: '100%',
              }}>
                <div style={{
                  height: '100%', borderRadius: 2, background: '#007AFF',
                  width: `${progress ?? 0}%`, transition: 'width 0.5s',
                }} />
              </div>
            </div>
          )}

          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ color: statusColor(job.status), fontWeight: 500 }}>
              {job.status === 'running' && job.total_chunks
                ? `${job.done_chunks}/${job.total_chunks} Chunks (${progress}%)`
                : statusLabel(job.status)}
            </span>
            {job.tier_erreicht != null && job.status === 'done' && (
              <span style={{
                padding: '1px 5px', borderRadius: 3, fontSize: 10, fontWeight: 600,
                background: 'rgba(0,200,83,0.1)', color: '#00C853',
              }}>
                {tierLabel(job.tier_erreicht)}
              </span>
            )}
            {job.status === 'done' && displayResult && (
              <>
                <span>{displayResult.unique_blocks?.length ?? 0} Blöcke</span>
                <span>{displayResult.strang_names?.length ?? 0} Stränge</span>
                {displayResult.num_pages && <span>{displayResult.num_pages} Seiten</span>}
              </>
            )}
            <span>{new Date(job.erstellt_am).toLocaleString('de', { dateStyle: 'short', timeStyle: 'short' })}</span>
          </div>
        </div>

        {/* Aktions-Buttons */}
        <div style={{ display: 'flex', gap: 5, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          {/* Tier-2 Button */}
          {job.status === 'detecting' && (
            <Tooltip text="Tier-2: KI-Strukturerkennung starten">
              <button
                onClick={handleTier2}
                disabled={tier2Running}
                style={{
                  height: 28, padding: '0 10px', borderRadius: 6,
                  border: '1px solid #FFCC00',
                  background: 'rgba(255,204,0,0.1)', color: '#B8860B',
                  cursor: tier2Running ? 'default' : 'pointer', fontSize: 11, fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                {tier2Running
                  ? <Loader2 size={11} style={{ animation: 'spin 0.8s linear infinite' }} />
                  : <Zap size={11} />}
                Tier-2
              </button>
            </Tooltip>
          )}

          {/* Tier-3 Button */}
          {job.status === 'chunking' && (
            <Tooltip text="Tier-3: Kostenschätzung + KI-Extraktion starten">
              <button
                onClick={() => setShowCostPreview(true)}
                style={{
                  height: 28, padding: '0 10px', borderRadius: 6,
                  border: '1px solid #FF9500',
                  background: 'rgba(255,149,0,0.1)', color: '#CC6600',
                  cursor: 'pointer', fontSize: 11, fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <Eye size={11} />
                Tier-3
              </button>
            </Tooltip>
          )}

          <Tooltip text="Original-PDF herunterladen">
            <a
              href={`/api/import-jobs/${job.id}/file`}
              download
              style={{
                width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)',
                background: 'var(--bg)', color: 'var(--text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                textDecoration: 'none',
              }}
            >
              <Download size={13} />
            </a>
          </Tooltip>

          <Tooltip text="Job löschen">
            <button
              onClick={handleDelete}
              disabled={deleting || job.status === 'running'}
              style={{
                width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)',
                background: 'var(--bg)', color: '#FF3B30',
                cursor: (deleting || job.status === 'running') ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: job.status === 'running' ? 0.4 : 1,
              }}
            >
              {deleting ? <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Trash2 size={13} />}
            </button>
          </Tooltip>
        </div>

        {/* Chevron */}
        {job.status === 'done' && (
          <div style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </div>
        )}
      </div>

      {/* Tier-2-Notiz (detecting mit Fehler) */}
      {job.status === 'detecting' && result?.tier2_result && (
        <div style={{
          padding: '6px 14px 10px', borderTop: '1px solid var(--border)',
          fontSize: 11, color: '#B8860B', lineHeight: 1.5,
        }}>
          {result.tier2_result.notiz}
        </div>
      )}

      {/* Fehler */}
      {job.status === 'error' && job.fehler && (
        <div style={{
          padding: '8px 14px 10px', borderTop: '1px solid var(--border)',
          fontSize: 12, color: '#FF3B30', lineHeight: 1.5,
        }}>
          {job.fehler}
        </div>
      )}

      {/* Ergebnis-Vorschau (Tier 1 oder Tier 3) */}
      {expanded && displayResult && (
        <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--border)' }}>
          {/* Strang-Köpfe */}
          {displayResult.strang_names?.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                Erkannte Strang-Überschriften ({displayResult.strang_names.length})
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {displayResult.strang_names.map((name: string) => (
                  <span key={name} style={{
                    padding: '2px 8px', borderRadius: 4, fontSize: 11,
                    background: 'rgba(0,122,255,0.07)', color: '#007AFF',
                    border: '1px solid rgba(0,122,255,0.2)',
                  }}>
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Block-Übersicht */}
          {displayResult.unique_blocks?.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                Erkannte Blöcke ({displayResult.unique_blocks.length})
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                {displayResult.unique_blocks.map((nr: number) => (
                  <span key={nr} style={{
                    padding: '1px 7px', borderRadius: 4, fontSize: 11,
                    background: 'var(--bg)', border: '1px solid var(--border)',
                    color: 'var(--text-muted)',
                  }}>
                    {nr}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Statistik */}
          <div style={{
            marginTop: 12, display: 'flex', gap: 16, flexWrap: 'wrap',
            padding: '8px 10px', borderRadius: 6, background: 'var(--bg)',
            fontSize: 12, color: 'var(--text-muted)',
          }}>
            <span>{displayResult.blocks?.length ?? 0} Block-Einträge gesamt</span>
            <span>{displayResult.total_chars?.toLocaleString('de') ?? 0} Zeichen</span>
            {displayResult.num_pages && <span>{displayResult.num_pages} PDF-Seiten</span>}
            {displayResult.chunks_processed != null && (
              <span>{displayResult.chunks_processed}/{displayResult.chunks_total} Chunks verarbeitet</span>
            )}
          </div>
        </div>
      )}

      {/* Cost-Preview-Dialog */}
      {showCostPreview && (
        <CostPreviewDialog
          jobId={job.id}
          onClose={() => setShowCostPreview(false)}
          onStart={async () => {
            const updated = await api.getImportJob(job.id)
            handleTier3Started(updated)
          }}
        />
      )}
    </div>
  )
}

// ── Haupt-Komponente ──────────────────────────────────────────────────────────

export default function ImportPanel({ produktionId }: { produktionId: string }) {
  const [open, setOpen] = useState(false)
  const [jobs, setJobs] = useState<ImportJob[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [uploadErr, setUploadErr] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadJobs = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await api.getImportJobs(produktionId)
      setJobs(rows)
    } finally {
      setLoading(false)
    }
  }, [produktionId])

  useEffect(() => {
    if (open) loadJobs()
  }, [open, loadJobs])

  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setUploadErr('Nur PDF-Dateien werden unterstützt.')
      return
    }
    if (file.size > 50 * 1024 * 1024) {
      setUploadErr('Datei zu groß (max. 50 MB).')
      return
    }
    setUploadErr('')
    setUploading(true)
    try {
      const job = await api.uploadImportDoc(produktionId, file)
      setJobs(prev => [job, ...prev])
    } catch (e: any) {
      setUploadErr(e.message || 'Upload fehlgeschlagen.')
    } finally {
      setUploading(false)
    }
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) handleFile(f)
    e.target.value = ''
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) handleFile(f)
  }

  const pendingCount = jobs.filter(j => j.status === 'detecting' || j.status === 'chunking' || j.status === 'running').length

  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 10,
      background: 'var(--bg-surface)', overflow: 'hidden', marginBottom: 16,
    }}>
      {/* Header */}
      <div
        style={{
          padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 10,
          cursor: 'pointer', userSelect: 'none',
        }}
        onClick={() => setOpen(o => !o)}
      >
        <Upload size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>Future-Dokument importieren</span>
        {jobs.length > 0 && !open && (
          <span style={{
            padding: '1px 7px', borderRadius: 10, fontSize: 11, fontWeight: 500,
            background: pendingCount > 0 ? 'rgba(255,149,0,0.1)' : 'rgba(0,122,255,0.1)',
            color: pendingCount > 0 ? '#FF9500' : '#007AFF',
          }}>
            {jobs.length}
          </span>
        )}
        {open ? <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />}
      </div>

      {/* Body */}
      {open && (
        <div style={{ padding: '0 18px 18px', borderTop: '1px solid var(--border)' }}>
          {/* Drop-Zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => !uploading && fileInputRef.current?.click()}
            style={{
              marginTop: 14,
              border: `2px dashed ${dragOver ? '#007AFF' : 'var(--border)'}`,
              borderRadius: 8, padding: '28px 20px', textAlign: 'center',
              background: dragOver ? 'rgba(0,122,255,0.04)' : 'var(--bg)',
              cursor: uploading ? 'default' : 'pointer',
              transition: 'border-color 0.15s, background 0.15s',
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              style={{ display: 'none' }}
              onChange={onFileInput}
            />
            {uploading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <Loader2 size={24} style={{ animation: 'spin 0.8s linear infinite', color: '#007AFF' }} />
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Datei wird analysiert…</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <FileText size={28} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
                <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                  PDF hierhin ziehen oder klicken
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  RR-Future-Dokument · max. 50 MB
                </span>
              </div>
            )}
          </div>

          {/* Fehlermeldung */}
          {uploadErr && (
            <div style={{
              marginTop: 8, display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 12, color: '#FF3B30',
            }}>
              <X size={12} />
              {uploadErr}
            </div>
          )}

          {/* Tier-Erklärung */}
          <div style={{
            marginTop: 12, padding: '8px 12px', borderRadius: 6,
            background: 'var(--bg)', border: '1px solid var(--border)',
            fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6,
          }}>
            <strong style={{ color: 'var(--text-primary)' }}>Tier 1</strong> (automatisch): Regex-Parser erkennt BLOCK/STRANG-Struktur.{' '}
            <strong style={{ color: 'var(--text-primary)' }}>Tier 2</strong>: KI-Strukturerkennung bei unklarem Format (ein Call).{' '}
            <strong style={{ color: 'var(--text-primary)' }}>Tier 3</strong>: Vollständige KI-Extraktion in Chunks (mit Kostenschätzung).
          </div>

          {/* Job-Liste */}
          <div style={{ marginTop: 14 }}>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
                <Loader2 size={18} style={{ animation: 'spin 0.8s linear infinite', color: 'var(--text-muted)' }} />
              </div>
            ) : jobs.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>
                Noch keine Imports für diese Produktion.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {jobs.map(job => (
                  <JobRow
                    key={job.id}
                    job={job}
                    onDelete={id => setJobs(prev => prev.filter(j => j.id !== id))}
                    onUpdate={updated => setJobs(prev => prev.map(j => j.id === updated.id ? updated : j))}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
