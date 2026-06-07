import { useEffect, useMemo, useRef, useState } from 'react'
import { X, AlertTriangle, FileText, FileSearch, Loader2 } from 'lucide-react'
import PdfPageViewer from './PdfPageViewer'

interface PreviewScene {
  nummer: number
  ort_name?: string | null
  int_ext?: string | null
  tageszeit?: string | null
  charaktere?: string[]
  dauer_sekunden?: number | null
  source_page?: number
  isWechselschnitt?: boolean
  isStockshot?: boolean
}

/**
 * Vorschau-Modal für eine einzelne Datei im Bulk-Import (Variante A):
 * PDF-Ansicht links, read-only Szenenliste rechts, plus Warnung + Neunummerierung,
 * wenn das Drehbuch nicht bei Szene 1 beginnt. Parst die Datei on-demand.
 */
export default function BulkPreviewModal({
  file, folgeNummer, pdfMistral, renumber, onToggleRenumber, onClose,
}: {
  file: File
  folgeNummer: number | null
  pdfMistral: boolean
  renumber: boolean
  onToggleRenumber: (v: boolean) => void
  onClose: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [szenen, setSzenen] = useState<PreviewScene[]>([])
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  const [fileText, setFileText] = useState<string | null>(null)
  const [targetPage, setTargetPage] = useState<number | undefined>()
  const isPdf = useMemo(() => file.name.toLowerCase().endsWith('.pdf'), [file])
  const scrollRef = useRef<HTMLDivElement>(null)

  // PDF-URL bzw. Text-Vorschau aufbauen
  useEffect(() => {
    if (isPdf) {
      const url = URL.createObjectURL(file)
      setFileUrl(url)
      return () => URL.revokeObjectURL(url)
    }
    file.text().then(setFileText).catch(() => setFileText(null))
  }, [file, isPdf])

  // Szenen parsen (on-demand)
  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null)
    const fd = new FormData()
    fd.append('file', file)
    if (pdfMistral) fd.append('pdf_method', 'mistral')
    fetch('/api/import/preview', { method: 'POST', body: fd, credentials: 'include' })
      .then(r => r.ok ? r.json() : r.json().then((e: any) => Promise.reject(e.error || `Fehler ${r.status}`)))
      .then((d: any) => { if (!cancelled) setSzenen(d.szenen || []) })
      .catch((e: any) => { if (!cancelled) setError(String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [file, pdfMistral])

  const minNr = useMemo(() => {
    const nums = szenen.map(s => s.nummer).filter(n => typeof n === 'number')
    return nums.length ? Math.min(...nums) : 1
  }, [szenen])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 12, width: 'min(1100px, 95vw)', height: 'min(820px, 92vh)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <FileText size={16} color="#757575" />
          <span style={{ fontSize: 14, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {file.name}{folgeNummer != null && <span style={{ color: '#999', fontWeight: 400 }}> · Folge {folgeNummer}</span>}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#999' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {/* Links: Dokument-Vorschau */}
          <div style={{ width: '50%', flexShrink: 0, borderRight: '1px solid #e0e0e0', background: '#f5f5f5', overflow: 'hidden', position: 'relative' }}>
            {isPdf && fileUrl ? (
              <PdfPageViewer fileUrl={fileUrl} requestPage={targetPage} />
            ) : fileText ? (
              <pre style={{ margin: 0, padding: 16, height: '100%', overflowY: 'auto', fontSize: 11, lineHeight: 1.5, fontFamily: "'Courier New', monospace", whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#333' }}>
                {fileText}
              </pre>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#999', fontSize: 13 }}>
                Vorschau nicht verfügbar
              </div>
            )}
          </div>

          {/* Rechts: Szenenliste */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            {/* Warnung + Neunummerierung */}
            {!loading && !error && minNr !== 1 && (
              <div style={{ background: '#FFF3E0', borderBottom: '1px solid #FFB74D', padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'flex-start', flexShrink: 0 }}>
                <AlertTriangle size={16} color="#E65100" style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 12, color: '#7a4a00', lineHeight: 1.5 }}>
                  <strong>Beginnt bei Szene {minNr}, nicht bei 1.</strong> Ist die Folge richtig beschriftet?
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, cursor: 'pointer', fontWeight: 600, color: '#000' }}>
                    <input type="checkbox" checked={renumber} onChange={e => onToggleRenumber(e.target.checked)} />
                    Szenen beim Import lückenlos ab 1 neu nummerieren
                  </label>
                </div>
              </div>
            )}

            <div style={{ padding: '8px 14px', borderBottom: '1px solid #e0e0e0', fontSize: 12, color: '#757575', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              {loading ? <><Loader2 size={13} className="sw-spin" /> Analysiere…</>
                : error ? <span style={{ color: 'var(--sw-danger)' }}>{error}</span>
                : <><b>{szenen.length}</b> Szenen erkannt{minNr !== 1 && renumber && <span style={{ color: '#E65100' }}> · werden ab 1 nummeriert</span>}</>}
            </div>

            <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto' }}>
              {szenen.map((sz, i) => (
                <div key={i} style={{ padding: '6px 12px', borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#000', fontVariantNumeric: 'tabular-nums', minWidth: 64, flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      SZ {renumber && minNr !== 1
                        ? (folgeNummer != null ? `${folgeNummer}.${String(i + 1).padStart(2, '0')}` : i + 1)
                        : (folgeNummer != null ? `${folgeNummer}.${String(sz.nummer).padStart(2, '0')}` : sz.nummer)}
                      {sz.source_page && (
                        <FileSearch size={11} style={{ color: '#1565C0', cursor: 'pointer', flexShrink: 0 }} onClick={() => setTargetPage(sz.source_page)} />
                      )}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: '#1B5E20', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {sz.ort_name || '—'}
                    </span>
                    {sz.int_ext && <span style={{ fontSize: 10, fontWeight: 600, color: '#78909C', flexShrink: 0 }}>{sz.int_ext}</span>}
                    {sz.tageszeit && <span style={{ fontSize: 10, fontWeight: 600, color: '#F57F17', flexShrink: 0 }}>{sz.tageszeit}</span>}
                    {sz.isWechselschnitt && <span style={{ fontSize: 9, fontWeight: 600, color: '#E65100', flexShrink: 0 }}>WS</span>}
                    {sz.isStockshot && <span style={{ fontSize: 9, flexShrink: 0 }}>📷</span>}
                  </div>
                  {(sz.charaktere?.length ?? 0) > 0 && (
                    <div style={{ fontSize: 11, color: '#555', marginTop: 1, paddingLeft: 64, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {sz.charaktere!.join(', ')}
                    </div>
                  )}
                </div>
              ))}
              {!loading && !error && szenen.length === 0 && (
                <div style={{ padding: 24, textAlign: 'center', color: '#999', fontSize: 13 }}>Keine Szenen erkannt</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
