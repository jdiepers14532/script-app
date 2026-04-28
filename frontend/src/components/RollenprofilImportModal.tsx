import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Upload, X, ChevronRight, Check, AlertCircle, FileText, Loader } from 'lucide-react'

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

interface Props {
  staffelId: string
  onClose: () => void
  onSuccess: (characterId: string, name: string) => void
}

export default function RollenprofilImportModal({ staffelId, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload')
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [parsed, setParsed] = useState<ParsedRollenprofil | null>(null)
  const [committing, setCommitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Nur PDF-Dateien werden unterstützt.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const resp = await fetch('/api/characters/rollenprofil-import/preview', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Unbekannter Fehler')
      setParsed(data.parsed || {})
      setStep('preview')
    } catch (err: any) {
      setError(err.message || 'Fehler beim Analysieren der PDF')
    } finally {
      setLoading(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleCommit = async () => {
    if (!parsed?.name) { setError('Name der Figur fehlt.'); return }
    setCommitting(true)
    setError(null)
    try {
      const resp = await fetch('/api/characters/rollenprofil-import/commit', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffel_id: staffelId, parsed }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Fehler beim Anlegen')
      setStep('done')
      setTimeout(() => onSuccess(data.character_id, data.name), 1200)
    } catch (err: any) {
      setError(err.message || 'Fehler beim Anlegen der Figur')
    } finally {
      setCommitting(false)
    }
  }

  const updateField = (key: string, value: string) => {
    setParsed(prev => prev ? { ...prev, [key]: value } : prev)
  }

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: 'var(--bg-surface)', borderRadius: 12, width: '100%', maxWidth: 680,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 40px rgba(0,0,0,0.3)',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Rollenprofil importieren</h2>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 0' }}>
              {step === 'upload' && 'PDF hochladen — Mistral KI extrahiert alle Felder automatisch'}
              {step === 'preview' && 'Extrahierte Daten prüfen und ggf. korrigieren'}
              {step === 'done' && 'Figur wurde erfolgreich angelegt'}
            </p>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Steps indicator */}
        <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          {(['upload', 'preview', 'done'] as const).map((s, i) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600,
                background: step === s ? 'var(--text-primary)' : s === 'done' && step === 'done' ? '#00C853' : 'var(--bg-subtle)',
                color: step === s || (s === 'done' && step === 'done') ? '#fff' : 'var(--text-secondary)',
              }}>
                {s === 'done' && step === 'done' ? <Check size={12} /> : i + 1}
              </div>
              <span style={{ fontSize: 12, color: step === s ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                {s === 'upload' ? 'Hochladen' : s === 'preview' ? 'Prüfen' : 'Fertig'}
              </span>
              {i < 2 && <ChevronRight size={14} style={{ color: 'var(--border)' }} />}
            </div>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>

          {/* Step 1: Upload */}
          {step === 'upload' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => !loading && fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${dragging ? 'var(--text-primary)' : 'var(--border)'}`,
                  borderRadius: 12, padding: 48, textAlign: 'center',
                  cursor: loading ? 'default' : 'pointer',
                  background: dragging ? 'var(--bg-subtle)' : 'transparent',
                  transition: 'all 0.15s',
                }}
              >
                {loading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: 'var(--text-secondary)' }}>
                    <Loader size={32} style={{ animation: 'spin 1s linear infinite' }} />
                    <div style={{ fontSize: 14, fontWeight: 500 }}>KI analysiert Rollenprofil…</div>
                    <div style={{ fontSize: 12 }}>Mistral OCR + Parser — das dauert einige Sekunden</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: 'var(--text-secondary)' }}>
                    <FileText size={32} />
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>PDF hierher ziehen oder klicken</div>
                    <div style={{ fontSize: 12 }}>Rollenprofil im PDF-Format — Seite/n werden per KI ausgelesen</div>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
              />
              {error && (
                <div style={{ display: 'flex', gap: 8, padding: '10px 14px', background: 'rgba(255,59,48,0.1)', borderRadius: 8, color: '#FF3B30', fontSize: 13 }}>
                  <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                  {error}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Preview + Edit */}
          {step === 'preview' && parsed && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                Die KI hat folgende Daten extrahiert. Felder können direkt bearbeitet werden.
              </p>
              {FIELD_ORDER.map(key => {
                const val = parsed[key] ?? ''
                if (!val && key !== 'name') return null
                const isLong = key === 'backstory' || key === 'cast_anbindung' || key === 'charakter' || key === 'dramaturgische_funktion'
                return (
                  <div key={key} style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 8, alignItems: 'start' }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', paddingTop: isLong ? 8 : 6 }}>
                      {FIELD_LABELS[key] || key}
                      {key === 'name' && <span style={{ color: '#FF3B30' }}> *</span>}
                    </label>
                    {isLong ? (
                      <textarea
                        value={val}
                        onChange={e => updateField(key, e.target.value)}
                        rows={key === 'backstory' ? 6 : 3}
                        style={{ fontSize: 13, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-surface)', color: 'var(--text-primary)', resize: 'vertical', fontFamily: 'inherit' }}
                      />
                    ) : (
                      <input
                        value={val}
                        onChange={e => updateField(key, e.target.value)}
                        style={{ fontSize: 13, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                      />
                    )}
                  </div>
                )
              })}
              {error && (
                <div style={{ display: 'flex', gap: 8, padding: '10px 14px', background: 'rgba(255,59,48,0.1)', borderRadius: 8, color: '#FF3B30', fontSize: 13 }}>
                  <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                  {error}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Done */}
          {step === 'done' && (
            <div style={{ textAlign: 'center', padding: '32px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#00C853', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Check size={28} color="#fff" />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{parsed?.name || 'Figur'} wurde angelegt</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>Du wirst automatisch weitergeleitet…</div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'preview' && (
          <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0 }}>
            <button
              onClick={() => { setStep('upload'); setError(null) }}
              disabled={committing}
              style={{ fontSize: 13, padding: '8px 16px', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', background: 'transparent', color: 'var(--text-primary)' }}>
              Zurück
            </button>
            <button
              onClick={handleCommit}
              disabled={committing || !parsed?.name}
              style={{ fontSize: 13, padding: '8px 20px', background: 'var(--text-primary)', color: 'var(--bg-surface)', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, opacity: committing ? 0.7 : 1 }}>
              {committing ? <><Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> Anlegen…</> : <><Upload size={13} /> Figur anlegen</>}
            </button>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>,
    document.body
  )
}
