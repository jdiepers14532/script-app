import { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import * as pdfjsLib from 'pdfjs-dist'

pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

const PAD = 24

interface PdfPageViewerProps {
  fileUrl: string
  cropLeft?: number
  cropRight?: number
  cropBottom?: number
}

export default function PdfPageViewer({ fileUrl, cropLeft = 0, cropRight = 0, cropBottom = 0 }: PdfPageViewerProps) {
  // outerRef measures available space. Canvas is position:absolute inside it,
  // so it never affects clientWidth/clientHeight → no resize feedback loop.
  const outerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pdfRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null)
  const renderingRef = useRef(false)
  const pendingPageRef = useRef<number | null>(null)

  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)

  const renderPage = useCallback(async (pageNum: number) => {
    const pdf = pdfRef.current
    const canvas = canvasRef.current
    const outer = outerRef.current
    if (!pdf || !canvas || !outer) return

    // If already rendering, queue the latest request
    if (renderingRef.current) {
      pendingPageRef.current = pageNum
      return
    }

    // Read container dimensions directly — safe because canvas is absolutely positioned
    const w = outer.clientWidth
    const h = outer.clientHeight
    const availW = w - PAD * 2
    const availH = h - PAD * 2
    if (availW <= 0 || availH <= 0) return

    renderingRef.current = true
    try {
      const pdfPage = await pdf.getPage(pageNum)
      const baseViewport = pdfPage.getViewport({ scale: 1 })

      const scale = Math.min(availW / baseViewport.width, availH / baseViewport.height)
      const dpr = window.devicePixelRatio || 1

      const displayW = Math.round(baseViewport.width * scale)
      const displayH = Math.round(baseViewport.height * scale)

      canvas.width = displayW * dpr
      canvas.height = displayH * dpr
      canvas.style.width = `${displayW}px`
      canvas.style.height = `${displayH}px`

      const ctx = canvas.getContext('2d')!
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      await pdfPage.render({
        canvasContext: ctx,
        viewport: pdfPage.getViewport({ scale: scale * dpr }),
      }).promise
    } catch (err) {
      console.error('[PdfPageViewer] render error:', err)
    } finally {
      renderingRef.current = false
      // Drain pending request (e.g. page changed while rendering)
      const pending = pendingPageRef.current
      if (pending !== null) {
        pendingPageRef.current = null
        renderPage(pending)
      }
    }
  }, [])

  // Load PDF
  useEffect(() => {
    let cancelled = false
    pdfRef.current = null
    setTotalPages(0)
    setPage(1)
    const task = pdfjsLib.getDocument(fileUrl)
    task.promise.then(pdf => {
      if (cancelled) return
      pdfRef.current = pdf
      setTotalPages(pdf.numPages)
    }).catch(err => console.error('[PdfPageViewer] load error:', err))
    return () => { cancelled = true; task.destroy() }
  }, [fileUrl])

  // Render when page or PDF changes
  useEffect(() => {
    if (totalPages > 0) renderPage(page)
  }, [page, totalPages, renderPage])

  // Re-render on container resize
  useEffect(() => {
    const el = outerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      if (pdfRef.current && totalPages > 0) renderPage(page)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [page, totalPages, renderPage])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#6b6b6b' }}>

      {/* Viewer: outerRef is the measuring element, canvas is absolutely positioned */}
      <div ref={outerRef} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: PAD,
        }}>
          <div style={{
            position: 'relative', lineHeight: 0,
            boxShadow: '0 4px 32px rgba(0,0,0,0.65), 0 1px 6px rgba(0,0,0,0.4)',
          }}>
            <canvas ref={canvasRef} style={{ display: 'block', background: '#fff' }} />

            {cropLeft > 0 && (
              <div style={{
                position: 'absolute', top: 0, left: 0, bottom: 0, width: `${cropLeft}%`,
                background: 'rgba(255,59,48,0.18)', borderRight: '2px dashed rgba(255,59,48,0.85)',
                pointerEvents: 'none',
              }} />
            )}
            {cropRight > 0 && (
              <div style={{
                position: 'absolute', top: 0, right: 0, bottom: 0, width: `${cropRight}%`,
                background: 'rgba(255,59,48,0.18)', borderLeft: '2px dashed rgba(255,59,48,0.85)',
                pointerEvents: 'none',
              }} />
            )}
            {cropBottom > 0 && (
              <div style={{
                position: 'absolute', left: 0, right: 0, bottom: 0, height: `${cropBottom}%`,
                background: 'rgba(255,59,48,0.18)', borderTop: '2px dashed rgba(255,59,48,0.85)',
                pointerEvents: 'none',
              }} />
            )}
          </div>
        </div>
      </div>

      {/* Navigation */}
      {totalPages > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
          padding: '6px 0', background: 'rgba(0,0,0,0.4)', flexShrink: 0,
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
