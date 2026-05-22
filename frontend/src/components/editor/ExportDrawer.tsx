/**
 * ExportDrawer — Export-Panel für Werkstufen
 *
 * Öffnet sich als fester rechter Schubladen-Drawer innerhalb des Editor-Bereichs.
 * Startet einen asynchronen Export-Job, zeigt Fortschritt und lädt automatisch herunter.
 */

import { useState, useEffect, useRef } from 'react'
import { X, Download, FileText, FileCode, Loader2, CheckCircle, AlertCircle, Eye } from 'lucide-react'
import type { WerkstufeMeta } from '../../hooks/useDokument'
import { api } from '../../api/client'
import Tooltip from '../Tooltip'

type ExportFormat = 'pdf' | 'docx' | 'fountain' | 'fdx'
type JobStatus = 'idle' | 'pending' | 'running' | 'done' | 'error'

interface DokumentVorlage {
  id: string
  name: string
  typ: string
  is_aktiv: boolean
}

interface Props {
  isOpen: boolean
  onClose: () => void
  selectedWerk: WerkstufeMeta | null
  werkstufen: WerkstufeMeta[]   // alle Werkstufen dieser Folge (für Notiz-Auswahl)
  produktionId: string
}

const FORMAT_DEFS: { value: ExportFormat; label: string; ext: string; available: boolean; icon: React.ReactNode }[] = [
  { value: 'pdf',      label: 'PDF',      ext: '.pdf',      available: true,  icon: <FileText size={14} /> },
  { value: 'docx',     label: 'Word',     ext: '.docx',     available: false, icon: <FileText size={14} /> },
  { value: 'fountain', label: 'Fountain', ext: '.fountain', available: false, icon: <FileCode size={14} /> },
  { value: 'fdx',      label: 'FDX',      ext: '.fdx',      available: false, icon: <FileCode size={14} /> },
]

export default function ExportDrawer({ isOpen, onClose, selectedWerk, werkstufen, produktionId }: Props) {
  const [format, setFormat]                     = useState<ExportFormat>('pdf')
  const [persAusdruck, setPersAusdruck]         = useState('')
  const [selectedNotizIds, setSelectedNotizIds] = useState<Set<string>>(new Set())
  const [selectedVorlagenIds, setSelectedVorlagenIds] = useState<Set<string>>(new Set())
  const [vorlagen, setVorlagen]                 = useState<DokumentVorlage[]>([])
  const [jobStatus, setJobStatus]               = useState<JobStatus>('idle')
  const [progress, setProgress]                 = useState(0)
  const [errorMsg, setErrorMsg]                 = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const jobIdRef = useRef<string | null>(null)

  // Notiz-Werkstufen dieser Folge
  const notizWerkstufen = werkstufen.filter(w => w.typ === 'notiz')

  // Dokument-Vorlagen laden (Titelseite, Synopsis …)
  useEffect(() => {
    if (!isOpen || !produktionId) return
    api.getDokumentVorlagen(produktionId)
      .then((list: any[]) => {
        const active = list.filter((v: any) => v.is_aktiv) as DokumentVorlage[]
        setVorlagen(active)
        setSelectedVorlagenIds(new Set(active.map(v => v.id)))
      })
      .catch(() => { setVorlagen([]); setSelectedVorlagenIds(new Set()) })
  }, [isOpen, produktionId])

  // Beim Öffnen Reset — Notizen werden NICHT vorausgewählt (Nutzer wählt bewusst)
  useEffect(() => {
    if (isOpen) {
      setSelectedNotizIds(new Set())
      setJobStatus('idle')
      setProgress(0)
      setErrorMsg(null)
    }
  }, [isOpen, selectedWerk?.id])

  // Cleanup beim Schließen
  useEffect(() => {
    if (!isOpen) stopPolling()
  }, [isOpen])

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  // Verfügbare Formate je Werkstufe-Typ
  const availableFormats = FORMAT_DEFS.filter(f => {
    if (!f.available) return true  // zeigen, aber disabled
    if (!selectedWerk) return false
    if (f.value === 'fountain' || f.value === 'fdx') return selectedWerk.typ === 'drehbuch'
    return true
  })

  const isDisabledFormat = (f: typeof FORMAT_DEFS[0]) => {
    if (!f.available) return true
    if (!selectedWerk) return true
    if ((f.value === 'fountain' || f.value === 'fdx') && selectedWerk.typ !== 'drehbuch') return true
    return false
  }

  async function startExport() {
    if (!selectedWerk || jobStatus === 'running' || jobStatus === 'pending') return
    setJobStatus('pending')
    setProgress(0)
    setErrorMsg(null)

    try {
      const body: any = {
        werkstufId: selectedWerk.id,
        format,
        options: {
          dokumentVorlagenIds:    selectedVorlagenIds.size > 0 ? Array.from(selectedVorlagenIds) : undefined,
          notizWerkstufIds:       selectedNotizIds.size > 0 ? Array.from(selectedNotizIds) : undefined,
          persoenlicher_ausdruck: persAusdruck.trim() || undefined,
        },
      }
      const res = await api.post('/export/job', body)
      const jobId = res.jobId as string
      jobIdRef.current = jobId
      setJobStatus('running')

      // Polling alle 1.5 Sekunden
      pollRef.current = setInterval(async () => {
        try {
          const status = await api.get(`/export/job/${jobId}`)
          setProgress(status.progress ?? 0)

          if (status.status === 'done') {
            stopPolling()
            setJobStatus('done')
            setProgress(100)
            triggerDownload(jobId)
          } else if (status.status === 'error') {
            stopPolling()
            setJobStatus('error')
            setErrorMsg(status.error ?? 'Export fehlgeschlagen')
          }
        } catch {
          stopPolling()
          setJobStatus('error')
          setErrorMsg('Verbindung zum Server verloren')
        }
      }, 1500)
    } catch (err: any) {
      setJobStatus('error')
      setErrorMsg(err?.message ?? 'Export konnte nicht gestartet werden')
    }
  }

  function triggerDownload(jobId: string) {
    const a = document.createElement('a')
    // Direkt über den Browser-Request mit Cookie-Auth
    a.href = `/api/export/job/${jobId}/download`
    a.download = ''
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  function openPreview() {
    if (!selectedWerk) return
    const params = new URLSearchParams({ werkstufId: selectedWerk.id })
    if (selectedVorlagenIds.size > 0)
      params.set('dokumentVorlagenIds', Array.from(selectedVorlagenIds).join(','))
    if (selectedNotizIds.size > 0)
      params.set('notizWerkstufIds', Array.from(selectedNotizIds).join(','))
    window.open(`/api/export/preview?${params.toString()}`, '_blank')
  }

  function toggleNotiz(id: string) {
    setSelectedNotizIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleVorlage(id: string) {
    setSelectedVorlagenIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const TYP_LABEL: Record<string, string> = {
    titelseite: 'Titelblatt',
    synopsis:   'Synopsis',
    recap:      'Recap',
    precap:     'Pre-Cap',
    custom:     'Seite',
  }

  const isRunning = jobStatus === 'pending' || jobStatus === 'running'

  if (!isOpen) return null

  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, bottom: 0,
      width: 288, zIndex: 200,
      borderLeft: '1px solid var(--border)',
      background: 'var(--bg-surface)',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '-4px 0 20px rgba(0,0,0,0.1)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Export</span>
        <button
          onClick={onClose}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', borderRadius: 4 }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>

        {!selectedWerk ? (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Keine Werkstufe ausgewählt.</p>
        ) : (
          <>
            {/* Format-Auswahl */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Format</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {availableFormats.map(f => {
                  const disabled = isDisabledFormat(f)
                  const active   = format === f.value && !disabled
                  return (
                    <Tooltip key={f.value} text={!f.available ? 'Kommt in Phase 5/6' : disabled ? `Nur für Drehbuch verfügbar` : ''}>
                      <button
                        disabled={disabled}
                        onClick={() => !disabled && setFormat(f.value)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '7px 10px', borderRadius: 6, fontSize: 12,
                          border: `1px solid ${active ? '#007AFF' : 'var(--border)'}`,
                          background: active ? 'rgba(0,122,255,0.08)' : 'transparent',
                          color: disabled ? 'var(--text-muted)' : active ? '#007AFF' : 'var(--text-primary)',
                          cursor: disabled ? 'not-allowed' : 'pointer',
                          fontFamily: 'inherit', fontWeight: active ? 600 : 400,
                          opacity: disabled ? 0.45 : 1,
                        }}
                      >
                        {f.icon}
                        {f.label}
                        {!f.available && <span style={{ fontSize: 9, marginLeft: 'auto', opacity: 0.6 }}>bald</span>}
                      </button>
                    </Tooltip>
                  )
                })}
              </div>
            </div>

            {/* Dokument-Vorlagen (Titelblatt, Synopsis …) */}
            {vorlagen.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
                  Vorgelagerte Seiten
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {vorlagen.map(v => (
                    <label
                      key={v.id}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--text-primary)', userSelect: 'none' }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedVorlagenIds.has(v.id)}
                        onChange={() => toggleVorlage(v.id)}
                        style={{ cursor: 'pointer', accentColor: '#007AFF', width: 14, height: 14 }}
                      />
                      <span>{v.name}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>{TYP_LABEL[v.typ] ?? v.typ}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Notiz-Vorseiten */}
            {notizWerkstufen.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
                  Vorgelagerte Notizen
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {notizWerkstufen.map(w => (
                    <label
                      key={w.id}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--text-primary)', userSelect: 'none' }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedNotizIds.has(w.id)}
                        onChange={() => toggleNotiz(w.id)}
                        style={{ cursor: 'pointer', accentColor: '#007AFF', width: 14, height: 14 }}
                      />
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {w.label || `Notiz V${w.version_nummer}`}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{w.szenen_count} Sz.</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Persönlicher Ausdruck */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
                Persönlicher Ausdruck
                <span style={{ fontWeight: 400, textTransform: 'none', marginLeft: 4, color: 'var(--text-muted)', fontSize: 10 }}>(optional)</span>
              </div>
              <input
                type="text"
                value={persAusdruck}
                onChange={e => setPersAusdruck(e.target.value)}
                placeholder="z.B. Maria Schulze"
                style={{
                  width: '100%', padding: '6px 8px', fontSize: 12,
                  border: '1px solid var(--border)', borderRadius: 6,
                  background: 'var(--bg-canvas)', color: 'var(--text-primary)',
                  fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
                }}
              />
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
                Erscheint im {'{'}{'{'} persoenlicher_ausdruck {'}'}{'}'}‑Chip des Headers
              </div>
            </div>

            {/* Fortschrittsbalken */}
            {(isRunning || jobStatus === 'done' || jobStatus === 'error') && (
              <div style={{ marginBottom: 12 }}>
                <div style={{
                  height: 4, borderRadius: 2,
                  background: 'var(--border)',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%', borderRadius: 2,
                    width: `${progress}%`,
                    background: jobStatus === 'error' ? '#FF3B30' : jobStatus === 'done' ? '#00C853' : '#007AFF',
                    transition: 'width 0.3s ease',
                  }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {isRunning && <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />}
                  {jobStatus === 'done' && <CheckCircle size={11} style={{ color: '#00C853' }} />}
                  {jobStatus === 'error' && <AlertCircle size={11} style={{ color: '#FF3B30' }} />}
                  <span style={{ color: jobStatus === 'error' ? '#FF3B30' : jobStatus === 'done' ? '#00C853' : 'var(--text-muted)' }}>
                    {jobStatus === 'pending'  ? 'Wird vorbereitet…'  :
                     jobStatus === 'running'  ? `${progress}% — Rendert…` :
                     jobStatus === 'done'     ? 'Download gestartet' :
                     jobStatus === 'error'    ? (errorMsg ?? 'Fehler') : ''}
                  </span>
                </div>
              </div>
            )}

            {/* Erneut herunterladen (nach done) */}
            {jobStatus === 'done' && jobIdRef.current && (
              <button
                onClick={() => triggerDownload(jobIdRef.current!)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  width: '100%', padding: '7px 10px', marginBottom: 10,
                  borderRadius: 6, fontSize: 12, fontFamily: 'inherit',
                  border: '1px solid #00C853', background: 'transparent',
                  color: '#00C853', cursor: 'pointer',
                }}
              >
                <Download size={13} />
                Erneut herunterladen
              </button>
            )}
          </>
        )}
      </div>

      {/* Footer — Vorschau + Export */}
      {selectedWerk && (
        <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {/* Vorschau-Button */}
          <Tooltip text="HTML-Vorschau im Browser öffnen (zur Layoutkontrolle)">
            <button
              onClick={openPreview}
              disabled={isRunning}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                width: '100%', padding: '7px 14px',
                borderRadius: 7, fontSize: 12, fontWeight: 500,
                fontFamily: 'inherit', cursor: isRunning ? 'not-allowed' : 'pointer',
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                transition: 'background 0.15s',
              }}
            >
              <Eye size={13} />
              Vorschau
            </button>
          </Tooltip>

          {/* Export-Button */}
          <button
            onClick={startExport}
            disabled={isRunning || isDisabledFormat(FORMAT_DEFS.find(f => f.value === format)!)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              width: '100%', padding: '9px 14px',
              borderRadius: 7, fontSize: 13, fontWeight: 600,
              fontFamily: 'inherit', cursor: isRunning ? 'not-allowed' : 'pointer',
              border: 'none',
              background: isRunning ? 'var(--bg-subtle)' : '#007AFF',
              color: isRunning ? 'var(--text-muted)' : '#fff',
              transition: 'background 0.15s',
            }}
          >
            {isRunning
              ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Exportiert…</>
              : <><Download size={14} /> Exportieren ({format.toUpperCase()})</>
            }
          </button>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
