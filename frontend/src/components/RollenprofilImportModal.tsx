import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Upload, X, ChevronRight, Check, AlertCircle, FileText, Loader, ChevronDown, ChevronUp, Minus } from 'lucide-react'
import { useTerminologie } from '../sw-ui'

function AutoResizeTextarea({ value, onChange, style }: {
  value: string
  onChange: (v: string) => void
  style?: React.CSSProperties
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const resize = useCallback(() => {
    if (ref.current) {
      ref.current.style.height = 'auto'
      ref.current.style.height = ref.current.scrollHeight + 'px'
    }
  }, [])
  useEffect(() => { resize() }, [value, resize])
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={e => onChange(e.target.value)}
      rows={1}
      style={{ ...style, resize: 'none', overflow: 'hidden' }}
    />
  )
}

interface ParsedRollenprofil {
  name?: string
  alter?: string
  kurzbeschreibung?: string
  geburtsort?: string
  familienstand?: string
  eltern?: string
  verwandte?: string
  beruf?: string
  typ?: string
  charakter?: string
  aussehen?: string
  dramaturgische_funktion?: string
  staerken?: string
  schwaechem?: string
  verletzungen?: string
  leidenschaften?: string
  wuensche?: string
  inneres_ziel?: string
  wesen?: string
  cast_anbindung?: string
  backstory?: string
  produktion?: string
  staffel?: string
  folgen_range?: string
  [key: string]: string | undefined
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  alter: 'Alter / Geburtsjahr',
  kurzbeschreibung: 'Kurzbeschreibung',
  geburtsort: 'Geburtsort',
  familienstand: 'Familienstand',
  eltern: 'Eltern',
  verwandte: 'Kinder / Verwandte',
  beruf: 'Beruf',
  typ: 'Typ',
  charakter: 'Charakter',
  aussehen: 'Aussehen / Stil',
  dramaturgische_funktion: 'Dramaturgische Funktion',
  staerken: 'Stärken',
  schwaechem: 'Schwächen',
  verletzungen: 'Verletzungen / Wunden',
  leidenschaften: 'Ticks / Running Gags / Leidenschaften',
  wuensche: 'Wünsche / Ziele',
  inneres_ziel: 'Was braucht die Figur wirklich',
  wesen: 'Wesen',
  cast_anbindung: 'Anbindung an den Cast',
  backstory: 'Backstory',
  produktion: 'Produktion',
  staffel: 'Staffel',
  folgen_range: 'Episodenbereich',
}

const FIELD_ORDER = [
  'name', 'alter', 'kurzbeschreibung', 'produktion', 'staffel', 'folgen_range',
  'geburtsort', 'familienstand', 'eltern', 'verwandte', 'beruf',
  'typ', 'charakter', 'aussehen', 'dramaturgische_funktion',
  'staerken', 'schwaechem', 'verletzungen', 'leidenschaften', 'wuensche', 'inneres_ziel',
  'wesen', 'cast_anbindung', 'backstory',
]

type FileStatus = 'pending' | 'processing' | 'done' | 'error'

interface FileItem {
  id: string
  file: File
  status: FileStatus
  parsed?: ParsedRollenprofil
  error?: string
  selected: boolean
  expanded: boolean
  character_id?: string
}

interface Props {
  produktionId: string
  onClose: () => void
  onSuccess: (characterId: string, name: string) => void
}

let idCounter = 0
function nextId() { return String(++idCounter) }

export default function RollenprofilImportModal({ produktionId, onClose, onSuccess }: Props) {
  const { t } = useTerminologie()
  const [step, setStep] = useState<'upload' | 'review' | 'done'>('upload')
  const [dragging, setDragging] = useState(false)
  const [files, setFiles] = useState<FileItem[]>([])
  const [committing, setCommitting] = useState(false)
  const [commitError, setCommitError] = useState<string | null>(null)
  const [committedCount, setCommittedCount] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isProcessing = files.some(f => f.status === 'processing')
  const allDone = files.length > 0 && files.every(f => f.status === 'done' || f.status === 'error')
  const selectedCount = files.filter(f => f.selected && f.status === 'done').length

  const processFile = async (item: FileItem): Promise<Partial<FileItem>> => {
    try {
      const formData = new FormData()
      formData.append('file', item.file)
      const resp = await fetch('/api/characters/rollenprofil-import/preview', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Unbekannter Fehler')
      return { status: 'done', parsed: data.parsed || {} }
    } catch (err: any) {
      return { status: 'error', error: err.message || 'Fehler beim Analysieren' }
    }
  }

  const addFiles = async (newFiles: File[]) => {
    const pdfs = newFiles.filter(f => f.name.toLowerCase().endsWith('.pdf'))
    if (pdfs.length === 0) return

    const items: FileItem[] = pdfs.map(f => ({
      id: nextId(),
      file: f,
      status: 'pending',
      selected: true,
      expanded: false,
    }))

    setFiles(prev => [...prev, ...items])

    // Process sequentially
    for (const item of items) {
      setFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: 'processing' } : f))
      const result = await processFile(item)
      setFiles(prev => prev.map(f => f.id === item.id ? { ...f, ...result } : f))
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    addFiles(Array.from(e.dataTransfer.files))
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(Array.from(e.target.files))
    e.target.value = ''
  }

  const updateParsedField = (id: string, key: string, value: string) => {
    setFiles(prev => prev.map(f =>
      f.id === id ? { ...f, parsed: { ...f.parsed, [key]: value } } : f
    ))
  }

  const toggleSelected = (id: string) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, selected: !f.selected } : f))
  }

  const toggleExpanded = (id: string) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, expanded: !f.expanded } : f))
  }

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id))
  }

  const handleCommitAll = async () => {
    const toCommit = files.filter(f => f.selected && f.status === 'done' && f.parsed?.name)
    if (toCommit.length === 0) return
    setCommitting(true)
    setCommitError(null)
    let committed = 0
    let lastId = ''
    let lastName = ''
    for (const item of toCommit) {
      try {
        // Step 1: Create character from parsed data
        const resp = await fetch('/api/characters/rollenprofil-import/commit', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ produktion_id: produktionId, parsed: item.parsed }),
        })
        const data = await resp.json()
        if (!resp.ok) throw new Error(data.error || 'Fehler')

        const characterId: string = data.character_id

        // Step 2: Attach original PDF as file (non-blocking — failure doesn't abort)
        try {
          const fd = new FormData()
          fd.append('foto', item.file, item.file.name)
          await fetch(`/api/characters/${encodeURIComponent(characterId)}/fotos`, {
            method: 'POST',
            credentials: 'include',
            body: fd,
          })
        } catch (attachErr) {
          console.warn('PDF anhängen fehlgeschlagen:', attachErr)
        }

        setFiles(prev => prev.map(f => f.id === item.id ? { ...f, character_id: characterId } : f))
        lastId = characterId
        lastName = data.name
        committed++
      } catch (err: any) {
        setFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: 'error', error: err.message } : f))
      }
    }
    setCommittedCount(committed)
    setCommitting(false)
    if (committed > 0) {
      setStep('done')
      if (committed === 1) {
        setTimeout(() => onSuccess(lastId, lastName), 1200)
      }
    }
  }

  const stepLabels = ['Hochladen', 'Prüfen', 'Fertig']
  const stepKeys = ['upload', 'review', 'done']
  const currentStepIdx = stepKeys.indexOf(step)

  const statusIcon = (item: FileItem) => {
    if (item.status === 'processing') return <Loader size={14} style={{ animation: 'spin 1s linear infinite', color: 'var(--sw-info)', flexShrink: 0 }} />
    if (item.status === 'done') return <Check size={14} style={{ color: '#00C853', flexShrink: 0 }} />
    if (item.status === 'error') return <AlertCircle size={14} style={{ color: '#FF3B30', flexShrink: 0 }} />
    return <Minus size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
  }

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: 'var(--bg-surface)', borderRadius: 12, width: '100%', maxWidth: 720,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 40px rgba(0,0,0,0.3)',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Rollenprofil importieren</h2>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 0' }}>
              {step === 'upload' && 'Einzelne oder mehrere PDFs hochladen — KI extrahiert alle Felder automatisch'}
              {step === 'review' && 'Extrahierte Daten prüfen, bearbeiten und auswählen'}
              {step === 'done' && `${committedCount} ${committedCount === 1 ? 'Figur wurde' : 'Figuren wurden'} erfolgreich angelegt`}
            </p>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Steps indicator */}
        <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          {stepLabels.map((label, i) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600,
                background: i === currentStepIdx ? 'var(--text-primary)' : (step === 'done' && i === 2) ? '#00C853' : 'var(--bg-subtle)',
                color: i === currentStepIdx || (step === 'done' && i === 2) ? '#fff' : 'var(--text-secondary)',
              }}>
                {step === 'done' && i === 2 ? <Check size={12} /> : i + 1}
              </div>
              <span style={{ fontSize: 12, color: i === currentStepIdx ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{label}</span>
              {i < 2 && <ChevronRight size={14} style={{ color: 'var(--border)' }} />}
            </div>
          ))}
          {files.length > 0 && step === 'upload' && (
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-secondary)' }}>
              {files.filter(f => f.status === 'done').length}/{files.length} verarbeitet
            </span>
          )}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ── Step 1: Upload ── */}
          {step === 'upload' && (
            <>
              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => !isProcessing && fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${dragging ? 'var(--text-primary)' : 'var(--border)'}`,
                  borderRadius: 12, padding: files.length > 0 ? '20px 24px' : 48, textAlign: 'center',
                  cursor: isProcessing ? 'default' : 'pointer',
                  background: dragging ? 'var(--bg-subtle)' : 'transparent',
                  transition: 'all 0.15s',
                  flexShrink: 0,
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: 'var(--text-secondary)' }}>
                  <FileText size={files.length > 0 ? 20 : 32} />
                  <div style={{ fontSize: files.length > 0 ? 13 : 14, fontWeight: 500, color: 'var(--text-primary)' }}>
                    {files.length > 0 ? 'Weitere PDFs hinzufügen' : 'PDFs hierher ziehen oder klicken'}
                  </div>
                  {files.length === 0 && (
                    <div style={{ fontSize: 12 }}>Mehrere Rollenprofile auf einmal — jedes wird per KI verarbeitet</div>
                  )}
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                multiple
                style={{ display: 'none' }}
                onChange={handleFileInput}
              />

              {/* File list */}
              {files.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {files.map(item => (
                    <div key={item.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 12px', borderRadius: 8,
                      background: 'var(--bg-subtle)',
                      border: item.status === 'error' ? '1px solid rgba(255,59,48,0.3)' : '1px solid transparent',
                    }}>
                      {statusIcon(item)}
                      <span style={{ fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.file.name}
                      </span>
                      {item.status === 'done' && (
                        <span style={{ fontSize: 12, color: '#00C853', flexShrink: 0 }}>{item.parsed?.name || '–'}</span>
                      )}
                      {item.status === 'error' && (
                        <span style={{ fontSize: 12, color: '#FF3B30', flexShrink: 0, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.error}</span>
                      )}
                      {item.status === 'processing' && (
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)', flexShrink: 0 }}>wird verarbeitet…</span>
                      )}
                      {item.status !== 'processing' && (
                        <button onClick={() => removeFile(item.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 2, flexShrink: 0 }}>
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Step 2: Review ── */}
          {step === 'review' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                {selectedCount} von {files.filter(f => f.status === 'done').length} Figuren ausgewählt. Zeilen aufklappen zum Bearbeiten.
              </p>
              {files.map(item => (
                <div key={item.id} style={{
                  border: `1px solid ${item.status === 'error' ? 'rgba(255,59,48,0.3)' : 'var(--border)'}`,
                  borderRadius: 10, overflow: 'hidden',
                  opacity: !item.selected && item.status === 'done' ? 0.5 : 1,
                }}>
                  {/* Row header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg-subtle)', cursor: item.status === 'done' ? 'pointer' : 'default' }}
                    onClick={() => item.status === 'done' && toggleExpanded(item.id)}>
                    {/* Checkbox */}
                    {item.status === 'done' && (
                      <div
                        onClick={e => { e.stopPropagation(); toggleSelected(item.id) }}
                        style={{
                          width: 16, height: 16, borderRadius: 4, border: `2px solid ${item.selected ? 'var(--text-primary)' : 'var(--border)'}`,
                          background: item.selected ? 'var(--text-primary)' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer',
                        }}>
                        {item.selected && <Check size={10} color="var(--bg-surface)" />}
                      </div>
                    )}
                    {item.status !== 'done' && statusIcon(item)}
                    <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>
                      {item.status === 'done' ? (item.parsed?.name || '(kein Name)') : item.file.name}
                    </span>
                    {item.status === 'done' && item.parsed?.kurzbeschreibung && (
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.parsed.kurzbeschreibung}
                      </span>
                    )}
                    {item.status === 'error' && (
                      <span style={{ fontSize: 12, color: '#FF3B30' }}>{item.error}</span>
                    )}
                    {item.status === 'done' && (
                      item.expanded ? <ChevronUp size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                        : <ChevronDown size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                    )}
                  </div>

                  {/* Expanded fields */}
                  {item.expanded && item.parsed && (
                    <div style={{ padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--border)' }}>
                      {FIELD_ORDER.map(key => {
                        const val = item.parsed![key] ?? ''
                        if (!val && key !== 'name') return null
                        return (
                          <div key={key} style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 8, alignItems: 'start' }}>
                            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', paddingTop: 8 }}>
                              {key === 'staffel' ? t('staffel') : key === 'folgen_range' ? `${t('episode', 'c')}bereich` : FIELD_LABELS[key] || key}
                              {key === 'name' && <span style={{ color: '#FF3B30' }}> *</span>}
                            </label>
                            <AutoResizeTextarea
                              value={val}
                              onChange={v => updateParsedField(item.id, key, v)}
                              style={{ fontSize: 13, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-surface)', color: 'var(--text-primary)', fontFamily: 'inherit', lineHeight: '1.5', width: '100%', boxSizing: 'border-box' as const }}
                            />
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}

              {commitError && (
                <div style={{ display: 'flex', gap: 8, padding: '10px 14px', background: 'rgba(255,59,48,0.1)', borderRadius: 8, color: '#FF3B30', fontSize: 13 }}>
                  <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                  {commitError}
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Done ── */}
          {step === 'done' && (
            <div style={{ textAlign: 'center', padding: '32px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#00C853', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Check size={28} color="#fff" />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>
                  {committedCount === 1 ? '1 Figur wurde angelegt' : `${committedCount} Figuren wurden angelegt`}
                </div>
                {committedCount === 1 && (
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>Du wirst automatisch weitergeleitet…</div>
                )}
              </div>
              {committedCount > 1 && (
                <button onClick={onClose} style={{ fontSize: 13, padding: '8px 20px', background: 'var(--text-primary)', color: 'var(--bg-surface)', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                  Schließen
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'upload' && allDone && (
          <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0 }}>
            <button
              onClick={() => setStep('review')}
              style={{ fontSize: 13, padding: '8px 20px', background: 'var(--text-primary)', color: 'var(--bg-surface)', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              Weiter zur Prüfung <ChevronRight size={14} />
            </button>
          </div>
        )}

        {step === 'review' && (
          <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <button
              onClick={() => setStep('upload')}
              disabled={committing}
              style={{ fontSize: 13, padding: '8px 16px', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', background: 'transparent', color: 'var(--text-primary)' }}>
              Zurück
            </button>
            <button
              onClick={handleCommitAll}
              disabled={committing || selectedCount === 0}
              style={{ fontSize: 13, padding: '8px 20px', background: 'var(--text-primary)', color: 'var(--bg-surface)', border: 'none', borderRadius: 8, cursor: selectedCount === 0 ? 'not-allowed' : 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, opacity: committing || selectedCount === 0 ? 0.6 : 1 }}>
              {committing
                ? <><Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> Anlegen…</>
                : <><Upload size={13} /> {selectedCount === 1 ? '1 Figur anlegen' : `${selectedCount} Figuren anlegen`}</>}
            </button>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>,
    document.body
  )
}
