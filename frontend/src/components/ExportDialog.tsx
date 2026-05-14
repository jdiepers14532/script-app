import { useState, useEffect } from 'react'
import { Download, X, FileText, Code, File, GitCompare } from 'lucide-react'
import { api } from '../api/client'

interface ExportDialogProps {
  werkstufId: string
  onClose: () => void
  showLineNumbers?: boolean
  lineNumberMarginCm?: number
}

type Format = 'pdf' | 'fountain' | 'fdx' | 'replacement'

const TYP_LABELS: Record<string, string> = {
  drehbuch: 'Drehbuch', storyline: 'Storyline', notiz: 'Notiz', abstrakt: 'Abstrakt',
}

const FORMAT_OPTIONS: { id: Format; label: string; ext: string; icon: React.FC<any>; desc: string }[] = [
  { id: 'pdf',         label: 'PDF / HTML',        ext: 'html',     icon: File,       desc: 'Druckfertig mit Kopf- und Fußzeile' },
  { id: 'fountain',   label: 'Fountain',           ext: 'fountain', icon: FileText,   desc: 'Portables Textformat für Drehbücher' },
  { id: 'fdx',        label: 'Final Draft',        ext: 'fdx',      icon: Code,       desc: 'Final Draft XML-Format' },
  { id: 'replacement', label: 'Replacement Pages', ext: 'html',     icon: GitCompare, desc: 'Nur geänderte Seiten — Vergleich gegen ältere Fassung' },
]

export default function ExportDialog({ werkstufId, onClose, showLineNumbers, lineNumberMarginCm }: ExportDialogProps) {
  const [format, setFormat]   = useState<Format>('pdf')
  const [filename, setFilename] = useState('')
  const [loading, setLoading]   = useState(false)
  const [filenameLoading, setFilenameLoading] = useState(true)
  const [error, setError]       = useState<string | null>(null)

  // Meta from filename endpoint
  const [folgeId, setFolgeId] = useState<string | null>(null)
  const [currentTyp, setCurrentTyp] = useState<string>('drehbuch')
  const [currentVersion, setCurrentVersion] = useState<number>(1)

  // Replacement pages options
  const [compareWerkId, setCompareWerkId] = useState<string>('')
  const [revisionLabel, setRevisionLabel] = useState('Revision')
  const [revisionColor, setRevisionColor] = useState('#FF3B30')
  const [threshold, setThreshold] = useState(100)
  const [siblings, setSiblings] = useState<any[]>([])
  const [siblingsLoading, setSiblingsLoading] = useState(false)

  useEffect(() => {
    setFilenameLoading(true)
    api.getExportFilename(werkstufId)
      .then(r => {
        setFilename(r.filename.replace(/\.[^.]+$/, ''))
        setFolgeId(r.folge_id ?? null)
        setCurrentTyp(r.typ ?? 'drehbuch')
        setCurrentVersion(r.version_nummer ?? 1)
      })
      .catch(() => setFilename('Export'))
      .finally(() => setFilenameLoading(false))
  }, [werkstufId])

  // Load sibling werkstufen when replacement format is selected
  useEffect(() => {
    if (format !== 'replacement' || !folgeId) return
    setSiblingsLoading(true)
    api.getFolgeWerkstufen(folgeId)
      .then(ws => {
        const others = ws.filter((w: any) => w.id !== werkstufId)
        setSiblings(others)
        if (others.length > 0 && !compareWerkId) setCompareWerkId(others[0].id)
      })
      .catch(() => setSiblings([]))
      .finally(() => setSiblingsLoading(false))
  }, [format, folgeId, werkstufId])

  const handleExport = async () => {
    setLoading(true)
    setError(null)
    try {
      let response: Response

      if (format === 'replacement') {
        if (!compareWerkId) throw new Error('Bitte eine Vergleichs-Fassung auswählen')
        response = await api.exportReplacementPages(werkstufId, {
          compareWerkId,
          threshold,
          revisionColor,
          revisionLabel,
        })
      } else if (format === 'fountain') {
        response = await api.exportFountain(werkstufId)
      } else if (format === 'fdx') {
        response = await api.exportFdx(werkstufId)
      } else {
        response = await api.exportPdf(werkstufId, { lineNumbers: showLineNumbers, lnMarginCm: lineNumberMarginCm })
      }

      if (!response.ok) throw new Error(`Export fehlgeschlagen (${response.status})`)

      const blob = await response.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      const opt  = FORMAT_OPTIONS.find(o => o.id === format)
      const ext  = opt?.ext ?? 'html'
      const base = format === 'replacement'
        ? `${filename} - ${revisionLabel} - Revisionsseiten`
        : filename
      a.href     = url
      a.download = base ? `${base}.${ext}` : `export.${ext}`
      a.click()
      URL.revokeObjectURL(url)
      onClose()
    } catch (err: any) {
      setError(err.message ?? 'Unbekannter Fehler')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--bg-surface, #fff)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        width: 420,
        maxWidth: 'calc(100vw - 32px)',
        maxHeight: 'calc(100vh - 40px)',
        overflowY: 'auto',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 18px',
          borderBottom: '1px solid var(--border)',
        }}>
          <Download size={15} style={{ color: 'var(--text-secondary)' }} />
          <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>Fassung exportieren</span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-muted)', lineHeight: 1 }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '18px 18px 20px' }}>
          {/* Format selection */}
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
            Format
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
            {FORMAT_OPTIONS.map(opt => {
              const Icon = opt.icon
              const checked = format === opt.id
              return (
                <label
                  key={opt.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                    border: `1px solid ${checked ? 'var(--sw-primary, #007AFF)' : 'var(--border)'}`,
                    background: checked ? 'var(--sw-primary-bg, #007AFF15)' : 'transparent',
                    transition: 'all 0.15s',
                  }}
                >
                  <input
                    type="radio"
                    name="export-format"
                    checked={checked}
                    onChange={() => setFormat(opt.id)}
                    style={{ accentColor: 'var(--sw-primary, #007AFF)', width: 14, height: 14, flexShrink: 0 }}
                  />
                  <Icon size={14} style={{ color: checked ? 'var(--sw-primary, #007AFF)' : 'var(--text-secondary)', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: checked ? 600 : 400 }}>{opt.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{opt.desc}</div>
                  </div>
                </label>
              )
            })}
          </div>

          {/* Replacement Pages options */}
          {format === 'replacement' && (
            <div style={{ marginBottom: 20, padding: '14px 14px', background: 'var(--bg-subtle)', borderRadius: 8, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Revisionsoptionen
              </div>

              {/* Compare werkstufe */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 4 }}>
                  Vergleichen mit (ältere Fassung)
                </label>
                {siblingsLoading ? (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Lädt…</div>
                ) : siblings.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#FF9500' }}>Keine anderen Fassungen dieser Episode vorhanden.</div>
                ) : (
                  <select
                    value={compareWerkId}
                    onChange={e => setCompareWerkId(e.target.value)}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, background: 'var(--bg-surface)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                  >
                    {siblings.map((w: any) => (
                      <option key={w.id} value={w.id}>
                        {TYP_LABELS[w.typ] ?? w.typ} V{w.version_nummer}{w.label ? ` — ${w.label}` : ''}
                        {w.id === werkstufId ? ' (aktuell)' : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Revision label */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 4 }}>
                  Revisionsname (z.B. „Blaue Seiten")
                </label>
                <input
                  value={revisionLabel}
                  onChange={e => setRevisionLabel(e.target.value)}
                  placeholder="Revision"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, background: 'var(--bg-surface)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                />
              </div>

              {/* Revision color + threshold */}
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 4 }}>
                    Revisionsfarbe
                  </label>
                  <input
                    type="color"
                    value={revisionColor}
                    onChange={e => setRevisionColor(e.target.value)}
                    style={{ width: 44, height: 32, borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', padding: 2 }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 4 }}>
                    MEMO-Schwellwert (Zeichen)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={1000}
                    value={threshold}
                    onChange={e => setThreshold(Math.max(0, parseInt(e.target.value) || 0))}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, background: 'var(--bg-surface)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                  />
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
                    Änderungen unter diesem Zeichenlimit → Memo statt voller Seite
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Filename */}
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
            Dateiname
          </div>
          <input
            value={filenameLoading ? 'Lädt…' : filename}
            onChange={e => setFilename(e.target.value)}
            disabled={filenameLoading}
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '8px 10px', borderRadius: 7, fontSize: 12,
              border: '1px solid var(--border)',
              background: 'var(--bg-input, var(--bg-surface))',
              color: 'var(--text-primary)',
              fontFamily: 'inherit',
            }}
          />
          {format === 'replacement' && revisionLabel && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              Gespeichert als: <em>{filename} - {revisionLabel} - Revisionsseiten.html</em>
            </div>
          )}
          {format !== 'replacement' && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              Die Dateiendung wird automatisch hinzugefügt.
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{ marginTop: 14, padding: '8px 12px', borderRadius: 7, background: '#FF3B3015', color: '#FF3B30', fontSize: 12 }}>
              {error}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <button
              onClick={onClose}
              style={{
                padding: '8px 18px', borderRadius: 8, fontSize: 13,
                border: '1px solid var(--border)', background: 'transparent',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Abbrechen
            </button>
            <button
              onClick={handleExport}
              disabled={loading || filenameLoading || (format === 'replacement' && (!compareWerkId || siblings.length === 0))}
              style={{
                padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                border: 'none', cursor: loading ? 'default' : 'pointer',
                background: 'var(--sw-primary, #007AFF)',
                color: '#fff', fontFamily: 'inherit',
                opacity: loading || filenameLoading ? 0.7 : 1,
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <Download size={13} />
              {loading ? 'Exportiere…' : 'Exportieren'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
