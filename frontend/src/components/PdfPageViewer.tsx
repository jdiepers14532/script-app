import { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import * as pdfjsLib from 'pdfjs-dist'

// Use locally bundled worker (copied to public/ at build time) to avoid CSP issues
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

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
  // Use a ref for rendering guard — avoids stale closure / race-condition on page change
  const renderingRef = useRef(false)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  // Bump this to trigger re-render from resize observer without changing page/totalPages
  const [renderTick, setRenderTick] = useState(0)

  // Load PDF document
  useEffect(() => {
    let cancelled = false
    pdfRef.current = null
    setTotalPages(0)
    setPage(1)
    const loadTask = pdfjsLib.getDocument(fileUrl)
    loadTask.promise.then(pdf => {
      if (cancelled) return
      pdfRef.current = pdf
      setTotalPages(pdf.numPages)
    }).catch(err => console.error('[PdfPageViewer] load error:', err))
    return () => { cancelled = true; loadTask.destroy() }
  }, [fileUrl])

  // Render a specific page number — no closure over state, uses refs
  const renderPage = useCallback(async (pageNum: number) => {
    const pdf = pdfRef.current
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!pdf || !canvas || !container || renderingRef.current) return

    renderingRef.current = true
    try {
      const pdfPage = await pdf.getPage(pageNum)
      const viewport = pdfPage.getViewport({ scale: 1 })

      // Scale to contain within container (both width AND height), with 24px padding each side
      const pad = 24
      const availW = container.clientWidth - pad * 2
      const availH = container.clientHeight - pad * 2
      const scale = Math.min(availW / viewport.width, availH / viewport.height)
      const scaledViewport = pdfPage.getViewport({ scale })

      canvas.width = scaledViewport.width
      canvas.height = scaledViewport.height

      const ctx = canvas.getContext('2d')!
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      await pdfPage.render({ canvasContext: ctx, viewport: scaledViewport }).promise
    } catch (err) {
      console.error('[PdfPageViewer] render error:', err)
    } finally {
      renderingRef.current = false
    }
  }, []) // stable — reads everything via refs

  // Re-render when page or pdf changes
  useEffect(() => {
    if (totalPages > 0) renderPage(page)
  }, [page, totalPages, renderTick]) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-render on resize
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(() => {
      if (pdfRef.current) setRenderTick(t => t + 1)
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={containerRef} style={{
      flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
      background: '#6b6b6b',
    }}>
      {/* Page content — centered, whole page always visible */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden', padding: 24,
      }}>
        <div style={{
          position: 'relative', lineHeight: 0,
          boxShadow: '0 4px 32px rgba(0,0,0,0.6), 0 1px 4px rgba(0,0,0,0.4)',
        }}>
          <canvas ref={canvasRef} style={{ display: 'block', background: '#fff' }} />

          {/* Crop overlays — absolutely positioned over the canvas */}
          {cropLeft > 0 && (
            <div style={{
              position: 'absolute', top: 0, left: 0, bottom: 0,
              width: `${cropLeft}%`,
              background: 'rgba(255, 59, 48, 0.18)',
              borderRight: '2px dashed rgba(255, 59, 48, 0.8)',
              pointerEvents: 'none',
            }} />
          )}
          {cropRight > 0 && (
            <div style={{
              position: 'absolute', top: 0, right: 0, bottom: 0,
              width: `${cropRight}%`,
              background: 'rgba(255, 59, 48, 0.18)',
              borderLeft: '2px dashed rgba(255, 59, 48, 0.8)',
              pointerEvents: 'none',
            }} />
          )}
          {cropBottom > 0 && (
            <div style={{
              position: 'absolute', left: 0, right: 0, bottom: 0,
              height: `${cropBottom}%`,
              background: 'rgba(255, 59, 48, 0.18)',
              borderTop: '2px dashed rgba(255, 59, 48, 0.8)',
              pointerEvents: 'none',
            }} />
          )}
        </div>
      </div>

      {/* Page navigation */}
      {totalPages > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
          padding: '6px 0', background: 'rgba(0,0,0,0.35)', flexShrink: 0,
        }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            style={{
              background: 'none', border: 'none', cursor: page <= 1 ? 'default' : 'pointer',
              opacity: page <= 1 ? 0.3 : 1, padding: 4, display: 'flex', color: '#fff',
            }}
          >
            <ChevronLeft size={16} />
          </button>
          <span style={{ fontSize: 12, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            style={{
              background: 'none', border: 'none', cursor: page >= totalPages ? 'default' : 'pointer',
              opacity: page >= totalPages ? 0.3 : 1, padding: 4, display: 'flex', color: '#fff',
            }}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
