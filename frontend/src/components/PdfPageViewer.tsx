import { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import * as pdfjsLib from 'pdfjs-dist'

// Use bundled worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString()

interface PdfPageViewerProps {
  fileUrl: string
  cropLeft?: number   // 0-30%
  cropRight?: number  // 0-30%
  cropBottom?: number // 0-30%
}

export default function PdfPageViewer({ fileUrl, cropLeft = 0, cropRight = 0, cropBottom = 0 }: PdfPageViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const pdfRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [rendering, setRendering] = useState(false)

  // Load PDF document
  useEffect(() => {
    let cancelled = false
    const loadTask = pdfjsLib.getDocument(fileUrl)
    loadTask.promise.then(pdf => {
      if (cancelled) return
      pdfRef.current = pdf
      setTotalPages(pdf.numPages)
      setPage(1)
    }).catch(err => console.error('[PdfPageViewer] load error:', err))
    return () => { cancelled = true }
  }, [fileUrl])

  // Render current page
  const renderPage = useCallback(async () => {
    const pdf = pdfRef.current
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!pdf || !canvas || !container || rendering) return

    setRendering(true)
    try {
      const pdfPage = await pdf.getPage(page)
      const viewport = pdfPage.getViewport({ scale: 1 })

      // Fit to container width
      const containerWidth = container.clientWidth
      const scale = containerWidth / viewport.width
      const scaledViewport = pdfPage.getViewport({ scale })

      canvas.width = scaledViewport.width
      canvas.height = scaledViewport.height
      canvas.style.width = `${scaledViewport.width}px`
      canvas.style.height = `${scaledViewport.height}px`

      const ctx = canvas.getContext('2d')!
      await pdfPage.render({ canvasContext: ctx, viewport: scaledViewport }).promise
    } catch (err) {
      console.error('[PdfPageViewer] render error:', err)
    } finally {
      setRendering(false)
    }
  }, [page, rendering])

  // Re-render on page change or PDF load
  useEffect(() => {
    if (totalPages > 0) renderPage()
  }, [page, totalPages]) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-render on resize
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(() => { if (totalPages > 0) renderPage() })
    observer.observe(container)
    return () => observer.disconnect()
  }, [totalPages]) // eslint-disable-line react-hooks/exhaustive-deps

  const canvasHeight = canvasRef.current?.height ?? 0

  return (
    <div ref={containerRef} style={{
      flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
      background: '#e8e8e8',
    }}>
      {/* Page content */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden', position: 'relative', padding: 12,
      }}>
        <div style={{ position: 'relative', lineHeight: 0, boxShadow: '0 2px 12px rgba(0,0,0,0.15)' }}>
          <canvas ref={canvasRef} style={{ display: 'block', background: '#fff' }} />

          {/* Crop overlays — absolutely positioned over the canvas */}
          {cropLeft > 0 && (
            <div style={{
              position: 'absolute', top: 0, left: 0, bottom: 0,
              width: `${cropLeft}%`,
              background: 'rgba(255, 59, 48, 0.15)',
              borderRight: '2px dashed rgba(255, 59, 48, 0.7)',
              pointerEvents: 'none',
            }} />
          )}
          {cropRight > 0 && (
            <div style={{
              position: 'absolute', top: 0, right: 0, bottom: 0,
              width: `${cropRight}%`,
              background: 'rgba(255, 59, 48, 0.15)',
              borderLeft: '2px dashed rgba(255, 59, 48, 0.7)',
              pointerEvents: 'none',
            }} />
          )}
          {cropBottom > 0 && (
            <div style={{
              position: 'absolute', left: 0, right: 0, bottom: 0,
              height: `${cropBottom}%`,
              background: 'rgba(255, 59, 48, 0.15)',
              borderTop: '2px dashed rgba(255, 59, 48, 0.7)',
              pointerEvents: 'none',
            }} />
          )}
        </div>
      </div>

      {/* Page navigation */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
          padding: '6px 0', background: '#f0f0f0', borderTop: '1px solid #ddd',
          flexShrink: 0,
        }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            style={{
              background: 'none', border: 'none', cursor: page <= 1 ? 'default' : 'pointer',
              opacity: page <= 1 ? 0.3 : 1, padding: 4, display: 'flex',
            }}
          >
            <ChevronLeft size={16} />
          </button>
          <span style={{ fontSize: 12, color: '#555', fontVariantNumeric: 'tabular-nums' }}>
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            style={{
              background: 'none', border: 'none', cursor: page >= totalPages ? 'default' : 'pointer',
              opacity: page >= totalPages ? 0.3 : 1, padding: 4, display: 'flex',
            }}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
