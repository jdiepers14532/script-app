/**
 * ExportDrawer — Export-Panel für Werkstufen
 *
 * Öffnet sich als fester rechter Schubladen-Drawer innerhalb des Editor-Bereichs.
 * Startet einen asynchronen Export-Job, zeigt Fortschritt und lädt automatisch herunter.
 */

import { useState, useEffect, useRef } from 'react'
import { X, Download, FileText, FileCode, Loader2, CheckCircle, AlertCircle, Eye, WifiOff } from 'lucide-react'
import type { WerkstufeMeta } from '../../hooks/useDokument'
import { api } from '../../api/client'
import Tooltip from '../Tooltip'

type ExportFormat = 'pdf' | 'docx' | 'fountain' | 'fdx'
type JobStatus = 'idle' | 'pending' | 'running' | 'done' | 'error'

interface FilterOptions {
  rollen:    string[]
  komparsen: string[]
  motive:    string[]
}

interface Props {
  isOpen: boolean
  onClose: () => void
  selectedWerk: WerkstufeMeta | null
  werkstufen: WerkstufeMeta[]   // alle Werkstufen dieser Folge (für Notiz-Auswahl)
  produktionId: string
}

const FORMAT_DEFS: {
  value: ExportFormat; label: string; ext: string; available: boolean
  icon: React.ReactNode; offlineOk: boolean; offlineNote?: string
  supportsNotizen: boolean; supportsPersAusdruck: boolean
}[] = [
  { value: 'pdf',      label: 'PDF',      ext: '.pdf',      available: true,  icon: <FileText size={14} />, offlineOk: false,                            supportsNotizen: true,  supportsPersAusdruck: true  },
  { value: 'docx',     label: 'Word',     ext: '.docx',     available: false, icon: <FileText size={14} />, offlineOk: true,  offlineNote: 'Ggf. andere Schrift', supportsNotizen: true,  supportsPersAusdruck: true  },
  { value: 'fountain', label: 'Fountain', ext: '.fountain', available: false, icon: <FileCode size={14} />, offlineOk: true,                             supportsNotizen: false, supportsPersAusdruck: false },
  { value: 'fdx',      label: 'FDX',      ext: '.fdx',      available: false, icon: <FileCode size={14} />, offlineOk: true,                             supportsNotizen: false, supportsPersAusdruck: false },
]

const SEC: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6,
  display: 'block',
}

function CheckList({
  items, selected, onToggle, maxHeight = 130,
}: {
  items: string[]; selected: Set<string>; onToggle: (v: string) => void; maxHeight?: number
}) {
  if (!items.length) return null
  return (
    <div style={{ maxHeight, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
      {items.map(item => (
        <label key={item} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 11, color: 'var(--text-primary)', userSelect: 'none', padding: '1px 0' }}>
          <input
            type="checkbox"
            checked={selected.has(item)}
            onChange={() => onToggle(item)}
            style={{ cursor: 'pointer', accentColor: '#007AFF', width: 12, height: 12, flexShrink: 0 }}
          />
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item}</span>
        </label>
      ))}
    </div>
  )
}

export default function ExportDrawer({ isOpen, onClose, selectedWerk, werkstufen, produktionId }: Props) {
  const [format, setFormat]                       = useState<ExportFormat>('pdf')
  const [isOnline, setIsOnline]                   = useState(navigator.onLine)
  const [persAusdruck, setPersAusdruck]           = useState('')
  const [selectedNotizIds, setSelectedNotizIds]   = useState<Set<string>>(new Set())
  const [jobStatus, setJobStatus]                 = useState<JobStatus>('idle')
  const [progress, setProgress]                   = useState(0)
  const [errorMsg, setErrorMsg]                   = useState<string | null>(null)

  // Szenen-Filter
  const [selectionMode, setSelectionMode]         = useState<'alle' | 'auswahl'>('alle')
  const [szenenAuswahl, setSzenenAuswahl]         = useState('')
  const [filterOptions, setFilterOptions]         = useState<FilterOptions | null>(null)
  const [selectedRollen, setSelectedRollen]       = useState<Set<string>>(new Set())
  const [selectedKomparsen, setSelectedKomparsen] = useState<Set<string>>(new Set())
  const [selectedMotive, setSelectedMotive]       = useState<Set<string>>(new Set())
  // "Rolle als Vermerk im pers. Ausdruck" — erscheint wenn mind. eine Rolle gewählt
  const [rolleAlsVermerk, setRolleAlsVermerk]     = useState(false)

  const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const jobIdRef = useRef<string | null>(null)

  const notizWerkstufen = werkstufen.filter(w => w.typ === 'notiz')

  // Beim Öffnen: Reset + Filter-Optionen laden + Notizen alle vorauswählen
  useEffect(() => {
    if (!isOpen || !selectedWerk) return
    setJobStatus('idle')
    setProgress(0)
    setErrorMsg(null)
    setSelectionMode('alle')
    setSzenenAuswahl('')
    setSelectedRollen(new Set())
    setSelectedKomparsen(new Set())
    setSelectedMotive(new Set())
    setRolleAlsVermerk(false)
    setSelectedNotizIds(new Set(notizWerkstufen.map(w => w.id)))
    setFilterOptions(null)
    api.get(`/export/filter-options?werkstufId=${selectedWerk.id}`)
      .then((data: any) => setFilterOptions({
        rollen:    data.rollen    ?? [],
        komparsen: data.komparsen ?? [],
        motive:    data.motive    ?? [],
      }))
      .catch(() => setFilterOptions({ rollen: [], komparsen: [], motive: [] }))
  }, [isOpen, selectedWerk?.id])

  useEffect(() => { if (!isOpen) stopPolling() }, [isOpen])

  useEffect(() => {
    const on  = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online',  on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  const currentFormatDef = FORMAT_DEFS.find(f => f.value === format)!

  const availableFormats = FORMAT_DEFS.filter(f => {
    if (!f.available) return true
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

  /** Baut den persoenlicher_ausdruck-Wert zusammen (inkl. optionalem Rollen-Vermerk) */
  function buildPersAusdruck(): string | undefined {
    const base = persAusdruck.trim()
    if (!rolleAlsVermerk || selectedRollen.size === 0) return base || undefined
    const rollenStr = Array.from(selectedRollen).join(', ')
    return base ? `${base} · ${rollenStr}` : rollenStr
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
          notizWerkstufIds:     currentFormatDef.supportsNotizen && selectedNotizIds.size > 0
            ? Array.from(selectedNotizIds) : undefined,
          persoenlicher_ausdruck: currentFormatDef.supportsPersAusdruck
            ? buildPersAusdruck() : undefined,
          szenenAuswahl:        selectionMode === 'auswahl' && szenenAuswahl.trim()
            ? szenenAuswahl.trim() : undefined,
          filterRollen:         selectionMode === 'auswahl' && selectedRollen.size > 0
            ? Array.from(selectedRollen) : undefined,
          filterKomparsen:      selectionMode === 'auswahl' && selectedKomparsen.size > 0
            ? Array.from(selectedKomparsen) : undefined,
          filterMotive:         selectionMode === 'auswahl' && selectedMotive.size > 0
            ? Array.from(selectedMotive) : undefined,
        },
      }
      const res = await api.post('/export/job', body)
      const jobId = res.jobId as string
      jobIdRef.current = jobId
      setJobStatus('running')

      pollRef.current = setInterval(async () => {
        try {
          const status = await api.get(`/export/job/${jobId}`)
          setProgress(status.progress ?? 0)
          if (status.status === 'done') {
            stopPolling(); setJobStatus('done'); setProgress(100); triggerDownload(jobId)
          } else if (status.status === 'error') {
            stopPolling(); setJobStatus('error'); setErrorMsg(status.error ?? 'Export fehlgeschlagen')
          }
        } catch {
          stopPolling(); setJobStatus('error'); setErrorMsg('Verbindung zum Server verloren')
        }
      }, 1500)
    } catch (err: any) {
      setJobStatus('error')
      setErrorMsg(err?.message ?? 'Export konnte nicht gestartet werden')
    }
  }

  function triggerDownload(jobId: string) {
    const a = document.createElement('a')
    a.href = `/api/export/job/${jobId}/download`
    a.download = ''
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  function openPreview() {
    if (!selectedWerk) return
    const params = new URLSearchParams({ werkstufId: selectedWerk.id })
    if (selectedNotizIds.size > 0 && currentFormatDef.supportsNotizen)
      params.set('notizWerkstufIds', Array.from(selectedNotizIds).join(','))
    window.open(`/api/export/pdf-preview?${params.toString()}`, '_blank')
  }

  function toggle<T>(set: Set<T>, val: T): Set<T> {
    const n = new Set(set); n.has(val) ? n.delete(val) : n.add(val); return n
  }

  const isRunning = jobStatus === 'pending' || jobStatus === 'running'
  const blockedByOffline = !isOnline && !currentFormatDef.offlineOk

  const hasAnyFilter = selectionMode === 'auswahl' && (
    szenenAuswahl.trim() || selectedRollen.size > 0 ||
    selectedKomparsen.size > 0 || selectedMotive.size > 0
  )

  if (!isOpen) return null

  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, bottom: 0, width: 288, zIndex: 200,
      borderLeft: '1px solid var(--border)', background: 'var(--bg-surface)',
      display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 20px rgba(0,0,0,0.1)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Export</span>
        <button onClick={onClose} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', borderRadius: 4 }}>
          <X size={14} />
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
        {!selectedWerk ? (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Keine Werkstufe ausgewählt.</p>
        ) : (
          <>
            {/* Offline-Banner */}
            {!isOnline && (
              <div style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 8, background: 'rgba(255,204,0,0.12)', border: '1px solid rgba(255,204,0,0.4)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 600, fontSize: 12, color: '#b8860b' }}>
                  <WifiOff size={13} />Sie sind offline
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  <strong>PDF-Export</strong> und <strong>Vorschau</strong> erfordern Internetverbindung.<br />
                  <strong>.fountain</strong> und <strong>.fdx</strong> funktionieren offline.
                </div>
              </div>
            )}

            {/* ── Format ── */}
            <div style={{ marginBottom: 14 }}>
              <span style={SEC}>Format</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {availableFormats.map(f => {
                  const disabled = isDisabledFormat(f)
                  const active   = format === f.value && !disabled
                  const offlineBlocked = !isOnline && !f.offlineOk && f.available
                  const tooltipText = !f.available ? 'Kommt in Phase 5/6'
                    : disabled ? 'Nur für Drehbuch verfügbar'
                    : offlineBlocked ? 'Erfordert Internetverbindung'
                    : f.offlineOk && f.available ? 'Funktioniert auch offline' : ''
                  return (
                    <Tooltip key={f.value} text={tooltipText}>
                      <button
                        disabled={disabled}
                        onClick={() => !disabled && setFormat(f.value)}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', borderRadius: 6, fontSize: 12, border: `1px solid ${active ? '#007AFF' : 'var(--border)'}`, background: active ? 'rgba(0,122,255,0.08)' : 'transparent', color: disabled ? 'var(--text-muted)' : active ? '#007AFF' : 'var(--text-primary)', cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: active ? 600 : 400, opacity: disabled ? 0.45 : 1 }}
                      >
                        {f.icon}{f.label}
                        {!f.available && <span style={{ fontSize: 9, marginLeft: 'auto', opacity: 0.6 }}>bald</span>}
                        {f.available && f.offlineOk && !disabled && <span style={{ fontSize: 9, marginLeft: 'auto', color: '#00C853', opacity: 0.8 }}>✓ offline</span>}
                        {offlineBlocked && <WifiOff size={9} style={{ marginLeft: 'auto', color: '#FFCC00' }} />}
                      </button>
                    </Tooltip>
                  )
                })}
              </div>
            </div>

            {/* ── Szenen-Auswahl ── */}
            <div style={{ marginBottom: 14 }}>
              <span style={SEC}>Szenen</span>
              <div className="seg" style={{ display: 'flex', marginBottom: selectionMode === 'auswahl' ? 10 : 0 }}>
                {(['alle', 'auswahl'] as const).map(mode => (
                  <button
                    key={mode}
                    className={selectionMode === mode ? 'on' : ''}
                    onClick={() => setSelectionMode(mode)}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    {mode === 'alle' ? 'Alle Szenen' : 'Nur Auswahl'}
                  </button>
                ))}
              </div>

              {selectionMode === 'auswahl' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

                  {/* Szenen-Nummern */}
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>
                      Szenen-Nr. (z.\u202fB. 1,3,5\u201310,42A)
                    </div>
                    <input
                      type="text"
                      value={szenenAuswahl}
                      onChange={e => setSzenenAuswahl(e.target.value)}
                      placeholder="1,3,5–10,42A"
                      style={{ width: '100%', padding: '5px 8px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-canvas)', color: 'var(--text-primary)', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>

                  {/* Rollen */}
                  {filterOptions && filterOptions.rollen.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                        Rollen
                        {selectedRollen.size > 0 && <span style={{ fontSize: 10, background: '#007AFF', color: '#fff', borderRadius: 10, padding: '0 5px', lineHeight: '16px', fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>{selectedRollen.size}</span>}
                      </div>
                      <CheckList items={filterOptions.rollen} selected={selectedRollen} onToggle={v => setSelectedRollen(prev => toggle(prev, v))} />
                      {/* Rolle als Vermerk im pers. Ausdruck */}
                      {selectedRollen.size > 0 && currentFormatDef.supportsPersAusdruck && (
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 10, color: '#007AFF', userSelect: 'none', marginTop: 5, padding: '3px 0' }}>
                          <input
                            type="checkbox"
                            checked={rolleAlsVermerk}
                            onChange={e => setRolleAlsVermerk(e.target.checked)}
                            style={{ cursor: 'pointer', accentColor: '#007AFF', width: 12, height: 12, flexShrink: 0 }}
                          />
                          Rolle als Vermerk im pers. Ausdruck
                        </label>
                      )}
                    </div>
                  )}

                  {/* Komparsen mit Spiel */}
                  {filterOptions && filterOptions.komparsen.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                        Komparsen m.\u202fSp.
                        {selectedKomparsen.size > 0 && <span style={{ fontSize: 10, background: '#007AFF', color: '#fff', borderRadius: 10, padding: '0 5px', lineHeight: '16px', fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>{selectedKomparsen.size}</span>}
                      </div>
                      <CheckList items={filterOptions.komparsen} selected={selectedKomparsen} onToggle={v => setSelectedKomparsen(prev => toggle(prev, v))} />
                    </div>
                  )}

                  {/* Motive */}
                  {filterOptions && filterOptions.motive.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                        Motive
                        {selectedMotive.size > 0 && <span style={{ fontSize: 10, background: '#007AFF', color: '#fff', borderRadius: 10, padding: '0 5px', lineHeight: '16px', fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>{selectedMotive.size}</span>}
                      </div>
                      <CheckList items={filterOptions.motive} selected={selectedMotive} onToggle={v => setSelectedMotive(prev => toggle(prev, v))} />
                    </div>
                  )}

                  {/* Aktive Filter — Zusammenfassung */}
                  {hasAnyFilter && (
                    <div style={{ fontSize: 10, color: '#FF6B35', lineHeight: 1.4, padding: '4px 7px', background: 'rgba(255,107,53,0.08)', borderRadius: 5, border: '1px solid rgba(255,107,53,0.2)' }}>
                      {[
                        szenenAuswahl.trim() ? `Sz.\u202f${szenenAuswahl.trim()}` : null,
                        selectedRollen.size ? `${selectedRollen.size}\u202fRolle(n)` : null,
                        selectedKomparsen.size ? `${selectedKomparsen.size}\u202fKomp.` : null,
                        selectedMotive.size ? `${selectedMotive.size}\u202fMotiv(e)` : null,
                      ].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Notiz-Seiten (nur wenn Format es unterstützt) ── */}
            {currentFormatDef.supportsNotizen && notizWerkstufen.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <span style={SEC}>Notiz-Seiten</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {notizWerkstufen.map(w => (
                    <label key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--text-primary)', userSelect: 'none' }}>
                      <input
                        type="checkbox"
                        checked={selectedNotizIds.has(w.id)}
                        onChange={() => setSelectedNotizIds(prev => toggle(prev, w.id))}
                        style={{ cursor: 'pointer', accentColor: '#007AFF', width: 14, height: 14, flexShrink: 0 }}
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

            {/* ── Persönlicher Ausdruck (nur wenn Format es unterstützt) ── */}
            {currentFormatDef.supportsPersAusdruck && (
              <div style={{ marginBottom: 16 }}>
                <span style={SEC}>
                  Persönlicher Ausdruck
                  <span style={{ fontWeight: 400, textTransform: 'none', marginLeft: 4, color: 'var(--text-muted)', fontSize: 10 }}>(optional)</span>
                </span>
                <input
                  type="text"
                  value={persAusdruck}
                  onChange={e => setPersAusdruck(e.target.value)}
                  placeholder="z.B. Maria Schulze"
                  style={{ width: '100%', padding: '6px 8px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-canvas)', color: 'var(--text-primary)', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                />
                {/* Vorschau des kombinierten Werts wenn Rollen-Vermerk aktiv */}
                {rolleAlsVermerk && selectedRollen.size > 0 && (
                  <div style={{ fontSize: 10, color: '#007AFF', marginTop: 3 }}>
                    Chip: {buildPersAusdruck() || <em style={{ color: 'var(--text-muted)' }}>leer</em>}
                  </div>
                )}
                {(!rolleAlsVermerk || selectedRollen.size === 0) && (
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
                    Erscheint im {'{'}{'{'} persoenlicher_ausdruck {'}'}{'}'}‑Chip
                  </div>
                )}
              </div>
            )}

            {/* ── Fortschrittsbalken ── */}
            {(isRunning || jobStatus === 'done' || jobStatus === 'error') && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 2, width: `${progress}%`, background: jobStatus === 'error' ? '#FF3B30' : jobStatus === 'done' ? '#00C853' : '#007AFF', transition: 'width 0.3s ease' }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {isRunning && <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />}
                  {jobStatus === 'done'  && <CheckCircle size={11} style={{ color: '#00C853' }} />}
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

            {jobStatus === 'done' && jobIdRef.current && (
              <button
                onClick={() => triggerDownload(jobIdRef.current!)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '7px 10px', marginBottom: 10, borderRadius: 6, fontSize: 12, fontFamily: 'inherit', border: '1px solid #00C853', background: 'transparent', color: '#00C853', cursor: 'pointer' }}
              >
                <Download size={13} />Erneut herunterladen
              </button>
            )}
          </>
        )}
      </div>

      {/* Footer — Vorschau + Export */}
      {selectedWerk && (
        <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {format === 'pdf' && (
            <Tooltip text={!isOnline ? 'Vorschau erfordert Internetverbindung' : 'Echte PDF-Vorschau im Browser öffnen (identisch mit Export)'}>
              <button
                onClick={openPreview}
                disabled={isRunning || !isOnline}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', padding: '7px 14px', borderRadius: 7, fontSize: 12, fontWeight: 500, fontFamily: 'inherit', cursor: (isRunning || !isOnline) ? 'not-allowed' : 'pointer', border: '1px solid var(--border)', background: 'transparent', color: !isOnline ? 'var(--text-muted)' : 'var(--text-secondary)', opacity: !isOnline ? 0.5 : 1, transition: 'background 0.15s' }}
              >
                {!isOnline ? <WifiOff size={13} /> : <Eye size={13} />}
                Vorschau
              </button>
            </Tooltip>
          )}
          <Tooltip text={blockedByOffline ? 'PDF-Export erfordert Internetverbindung. Bitte gehen Sie online.' : ''}>
            <button
              onClick={startExport}
              disabled={isRunning || isDisabledFormat(currentFormatDef) || blockedByOffline}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '9px 14px', borderRadius: 7, fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: (isRunning || blockedByOffline) ? 'not-allowed' : 'pointer', border: 'none', background: blockedByOffline ? 'var(--bg-subtle)' : isRunning ? 'var(--bg-subtle)' : '#007AFF', color: (isRunning || blockedByOffline) ? 'var(--text-muted)' : '#fff', transition: 'background 0.15s' }}
            >
              {isRunning
                ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Exportiert…</>
                : blockedByOffline
                ? <><WifiOff size={14} /> Offline — kein PDF möglich</>
                : <><Download size={14} /> Exportieren ({format.toUpperCase()})</>
              }
            </button>
          </Tooltip>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
