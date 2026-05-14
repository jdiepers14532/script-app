import { useState, useEffect } from 'react'
import { Download, X, FileText, Code, File } from 'lucide-react'
import { api } from '../api/client'

interface ExportDialogProps {
  werkstufId: string
  onClose: () => void
  showLineNumbers?: boolean
  lineNumberMarginCm?: number
}

type Format = 'pdf' | 'fountain' | 'fdx'

const FORMAT_OPTIONS: { id: Format; label: string; ext: string; icon: React.FC<any>; desc: string }[] = [
  { id: 'pdf',      label: 'PDF / HTML', ext: 'html', icon: File,     desc: 'Druckfertig mit Kopf- und Fußzeile' },
  { id: 'fountain', label: 'Fountain',   ext: 'fountain', icon: FileText, desc: 'Portables Textformat für Drehbücher' },
  { id: 'fdx',      label: 'Final Draft', ext: 'fdx', icon: Code,     desc: 'Final Draft XML-Format' },
]

export default function ExportDialog({ werkstufId, onClose, showLineNumbers, lineNumberMarginCm }: ExportDialogProps) {
  const [formats, setFormats]   = useState<Set<Format>>(new Set(['pdf']))
  const [filename, setFilename] = useState('')
  const [loading, setLoading]   = useState(false)
  const [filenameLoading, setFilenameLoading] = useState(true)
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => {
    setFilenameLoading(true)
    api.getExportFilename(werkstufId)
      .then(r => setFilename(r.filename.replace(/\.[^.]+$/, '')))  // strip extension
      .catch(() => setFilename('Export'))
      .finally(() => setFilenameLoading(false))
  }, [werkstufId])

  const toggleFormat = (f: Format) => {
    setFormats(prev => {
      const next = new Set(prev)
      if (next.has(f)) {
        if (next.size === 1) return prev  // at least one required
        next.delete(f)
      } else {
        next.add(f)
      }
      return next
    })
  }

  const handleExport = async () => {
    setLoading(true)
    setError(null)
    try {
      for (const fmt of formats) {
        let response: Response
        if (fmt === 'fountain') response = await api.exportFountain(werkstufId)
        else if (fmt === 'fdx')  response = await api.exportFdx(werkstufId)
        else                     response = await api.exportPdf(werkstufId, { lineNumbers: showLineNumbers, lnMarginCm: lineNumberMarginCm })

        if (!response.ok) throw new Error(`Export ${fmt} fehlgeschlagen (${response.status})`)

        const blob = await response.blob()
        const url  = URL.createObjectURL(blob)
        const a    = document.createElement('a')
        const ext  = FORMAT_OPTIONS.find(o => o.id === fmt)?.ext ?? fmt
        a.href     = url
        a.download = filename ? `${filename}.${ext}` : `export.${ext}`
        a.click()
        URL.revokeObjectURL(url)
      }
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
        width: 400,
        maxWidth: 'calc(100vw - 32px)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        overflow: 'hidden',
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
              const checked = formats.has(opt.id)
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
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleFormat(opt.id)}
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
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            Die Dateiendung wird automatisch hinzugefügt.
          </div>

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
              disabled={loading || filenameLoading || formats.size === 0}
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
              {loading ? 'Exportiere…' : `${formats.size === 1 ? 'Exportieren' : `${formats.size}× Exportieren`}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
