// ImportPanel — Tier-1 PDF-Import (deterministisch, ohne KI)
// Zeigt Upload-Bereich + Job-Liste + Tier-1-Ergebnis-Vorschau

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Upload, FileText, Trash2, Download, ChevronDown, ChevronRight,
  Loader2, CheckCircle, AlertCircle, Info, X,
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

function statusLabel(s: ImportJob['status']): string {
  switch (s) {
    case 'queued': return 'Wartend'
    case 'running': return 'Verarbeitung…'
    case 'detecting': return 'Tier-2 nötig'
    case 'chunking': return 'Chunking…'
    case 'done': return 'Fertig (Tier 1)'
    case 'error': return 'Fehler'
  }
}

function statusColor(s: ImportJob['status']): string {
  switch (s) {
    case 'done': return '#00C853'
    case 'error': return '#FF3B30'
    case 'detecting': return '#FFCC00'
    default: return '#757575'
  }
}

// ── Einzelner Job-Eintrag ─────────────────────────────────────────────────────

function JobRow({
  job,
  onDelete,
}: {
  job: ImportJob
  onDelete: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const result = job.ergebnis_json

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
          cursor: job.status === 'done' ? 'pointer' : 'default',
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
        </div>

        {/* Dateiname */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {job.source_file_name || 'Unbekannte Datei'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ color: statusColor(job.status), fontWeight: 500 }}>{statusLabel(job.status)}</span>
            {job.status === 'done' && result && (
              <>
                <span>{result.unique_blocks?.length ?? 0} Blöcke</span>
                <span>{result.strang_names?.length ?? 0} Stränge</span>
                {result.num_pages && <span>{result.num_pages} Seiten</span>}
              </>
            )}
            {job.status === 'detecting' && result?.grund && (
              <span style={{ color: '#FFCC00' }}>{result.grund}</span>
            )}
            <span>{new Date(job.erstellt_am).toLocaleString('de', { dateStyle: 'short', timeStyle: 'short' })}</span>
          </div>
        </div>

        {/* Aktionen */}
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
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
              disabled={deleting}
              style={{
                width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)',
                background: 'var(--bg)', color: '#FF3B30',
                cursor: deleting ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {deleting ? <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Trash2 size={13} />}
            </button>
          </Tooltip>
        </div>

        {/* Chevron für Tier-1-Ergebnis */}
        {job.status === 'done' && (
          <div style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </div>
        )}
      </div>

      {/* Fehler */}
      {job.status === 'error' && job.fehler && (
        <div style={{
          padding: '8px 14px 10px', borderTop: '1px solid var(--border)',
          fontSize: 12, color: '#FF3B30', lineHeight: 1.5,
        }}>
          {job.fehler}
        </div>
      )}

      {/* Tier-1-Ergebnis aufklappbar */}
      {expanded && result && (
        <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--border)' }}>
          {/* Strang-Köpfe */}
          {result.strang_names?.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                Erkannte Strang-Überschriften ({result.strang_names.length})
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {result.strang_names.map((name: string) => (
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
          {result.unique_blocks?.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                Erkannte Blöcke ({result.unique_blocks.length})
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                {result.unique_blocks.map((nr: number) => (
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
            <span>{result.blocks?.length ?? 0} Block-Einträge gesamt</span>
            <span>{result.total_chars?.toLocaleString('de') ?? 0} Zeichen</span>
            {result.num_pages && <span>{result.num_pages} PDF-Seiten</span>}
          </div>
        </div>
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
            background: 'rgba(0,122,255,0.1)', color: '#007AFF',
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

          {/* Job-Liste */}
          <div style={{ marginTop: 16 }}>
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
