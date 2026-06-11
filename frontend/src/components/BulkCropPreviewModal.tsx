import { useEffect, useMemo, useState } from 'react'
import { X, Scissors, BookOpen } from 'lucide-react'
import Tooltip from './Tooltip'
import PdfPageViewer from './PdfPageViewer'

/**
 * Beschnitt-Vorschau für den Bulk-Import: zeigt eine PDF des Batches mit Live-Overlays
 * für die Ränder (L/R/U) und den Seitenbereich. Die Regler steuern dieselben globalen
 * Werte wie der Block in der Auswahl-Phase — einmal eingestellt, gelten sie für alle PDFs.
 * Bei mehreren PDFs lässt sich per Dropdown prüfen, ob die Ränder überall passen.
 */
export default function BulkCropPreviewModal({
  pdfFiles,
  cropLeft, cropRight, cropBottom, pageFrom, pageTo,
  onCropLeft, onCropRight, onCropBottom, onPageFrom, onPageTo,
  onClose,
}: {
  pdfFiles: File[]
  cropLeft: number
  cropRight: number
  cropBottom: number
  pageFrom: number | ''
  pageTo: number | ''
  onCropLeft: (v: number) => void
  onCropRight: (v: number) => void
  onCropBottom: (v: number) => void
  onPageFrom: (v: number | '') => void
  onPageTo: (v: number | '') => void
  onClose: () => void
}) {
  const [fileIdx, setFileIdx] = useState(0)
  const file = pdfFiles[Math.min(fileIdx, pdfFiles.length - 1)] || null
  const fileUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => { if (fileUrl) URL.revokeObjectURL(fileUrl) }, [fileUrl])

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
          background: '#fff', borderRadius: 12, width: 'min(820px, 95vw)', height: 'min(880px, 92vh)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <Scissors size={15} color="#757575" />
          <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>Beschnitt-Vorschau — gilt für alle PDFs im Batch</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#999' }}>
            <X size={18} />
          </button>
        </div>

        {/* Datei-Auswahl (nur bei mehreren PDFs) */}
        {pdfFiles.length > 1 && (
          <div style={{ padding: '8px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, fontSize: 12, color: '#757575' }}>
            <span>Vorschau-Datei:</span>
            <select
              value={fileIdx}
              onChange={e => setFileIdx(parseInt(e.target.value, 10))}
              style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: '1px solid #e0e0e0', fontSize: 12 }}
            >
              {pdfFiles.map((f, i) => (
                <option key={f.name + i} value={i}>{f.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Beschneiden-Regler */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid #e0e0e0', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', fontSize: 11, color: '#757575', flexWrap: 'wrap' }}>
            <Tooltip text="Linken Rand abschneiden (z. B. Zeilennummern). In Prozent der Seitenbreite." placement="bottom">
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 140, flex: 1, cursor: 'help' }}>
                <span style={{ whiteSpace: 'nowrap' }}>L {cropLeft}%</span>
                <input type="range" min={0} max={30} value={cropLeft}
                  onChange={e => onCropLeft(parseInt(e.target.value))} style={{ flex: 1, height: 4 }} />
              </label>
            </Tooltip>
            <Tooltip text="Rechten Rand abschneiden (z. B. Notizspalten). In Prozent der Seitenbreite." placement="bottom">
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 140, flex: 1, cursor: 'help' }}>
                <span style={{ whiteSpace: 'nowrap' }}>R {cropRight}%</span>
                <input type="range" min={0} max={30} value={cropRight}
                  onChange={e => onCropRight(parseInt(e.target.value))} style={{ flex: 1, height: 4 }} />
              </label>
            </Tooltip>
            <Tooltip text="Unteren Rand abschneiden (z. B. Fußzeilen, Seitenzahlen). In Prozent der Seitenhöhe." placement="bottom">
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 140, flex: 1, cursor: 'help' }}>
                <span style={{ whiteSpace: 'nowrap' }}>U {cropBottom}%</span>
                <input type="range" min={0} max={30} value={cropBottom}
                  onChange={e => onCropBottom(parseInt(e.target.value))} style={{ flex: 1, height: 4 }} />
              </label>
            </Tooltip>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, fontSize: 11, color: '#757575' }}>
            <BookOpen size={12} color="#757575" />
            <span style={{ fontWeight: 600 }}>Seiten</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              von
              <input
                type="number" min={1}
                value={pageFrom}
                onChange={e => onPageFrom(e.target.value === '' ? '' : parseInt(e.target.value))}
                placeholder="1"
                style={{ width: 48, padding: '3px 5px', borderRadius: 4, border: '1px solid #e0e0e0', fontSize: 11, textAlign: 'center' }}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              bis
              <input
                type="number" min={1}
                value={pageTo}
                onChange={e => onPageTo(e.target.value === '' ? '' : parseInt(e.target.value))}
                placeholder="Ende"
                style={{ width: 48, padding: '3px 5px', borderRadius: 4, border: '1px solid #e0e0e0', fontSize: 11, textAlign: 'center' }}
              />
            </label>
            <span style={{ color: '#bbb', fontSize: 10 }}>leer = ganzes Dokument</span>
          </div>
        </div>

        {/* PDF-Vorschau mit Live-Overlays */}
        <div style={{ flex: 1, minHeight: 0, background: '#f5f5f5', position: 'relative' }}>
          {fileUrl ? (
            <PdfPageViewer
              fileUrl={fileUrl}
              cropLeft={cropLeft}
              cropRight={cropRight}
              cropBottom={cropBottom}
              pageFrom={pageFrom !== '' ? pageFrom : undefined}
              pageTo={pageTo !== '' ? pageTo : undefined}
            />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#999', fontSize: 13 }}>
              Keine PDF zum Anzeigen
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
