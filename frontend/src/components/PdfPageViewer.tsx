import { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react'
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
  const outerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pdfRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null)
  const renderingRef = useRef(false)
  const pendingPageRef = useRef<number | null>(null)

  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  // zoomTop: show only the top half of the page, scaled to fill the container
  const [zoomTop, setZoomTop] = useState(false)

  // canvasDisplayH is used to clip the canvas wrapper in zoom mode
  const [canvasDisplayH, setCanvasDisplayH] = useState(0)

  const renderPage = useCallback(async (pageNum: number, zoom: boolean) => {
    const pdf = pdfRef.current
    const canvas = canvasRef.current
    const outer = outerRef.current
    if (!pdf || !canvas || !outer) return

    if (renderingRef.current) {
      pendingPageRef.current = pageNum
      return
    }

    const w = outer.clientWidth
    const h = outer.clientHeight
    const availW = w - PAD * 2
    const availH = h - PAD * 2
    if (availW <= 0 || availH <= 0) return

    renderingRef.current = true
    try {
      const pdfPage = await pdf.getPage(pageNum)
      const baseViewport = pdfPage.getViewport({ scale: 1 })

      let scale: number
      if (zoom) {
        // Zoom mode: scale so that the top half fills the available area
        // (top half height = viewport.height/2, so we need scale such that
        //  scale * viewport.height/2 = availH  → scale = 2*availH/viewport.height)
        // Also respect width constraint
        const scaleByH = (availH * 2) / baseViewport.height
        const scaleByW = availW / baseViewport.width
        scale = Math.min(scaleByH, scaleByW)
      } else {
        scale = Math.min(availW / baseViewport.width, availH / baseViewport.height)
      }

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

      setCanvasDisplayH(displayH)
    } catch (err) {
      console.error('[PdfPageViewer] render error:', err)
    } finally {
      renderingRef.current = false
      const pending = pendingPageRef.current
      if (pending !== null) {
        pendingPageRef.current = null
        renderPage(pending, zoom)
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

  // Render when page / pdf / zoomTop changes
  useEffect(() => {
    if (totalPages > 0) renderPage(page, zoomTop)
  }, [page, totalPages, zoomTop, renderPage])

  // Re-render on container resize
  useEffect(() => {
    const el = outerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      if (pdfRef.current && totalPages > 0) renderPage(page, zoomTop)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [page, totalPages, zoomTop, renderPage])

  // Height of the visible clip in zoom mode (top ~50%)
  const clipH = zoomTop ? Math.round(canvasDisplayH / 2) : canvasDisplayH

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#6b6b6b' }}>

      {/* Viewer */}
      <div ref={outerRef} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: zoomTop ? 'flex-start' : 'center',
          justifyContent: 'center',
          padding: zoomTop ? `${PAD}px ${PAD}px 0` : PAD,
        }}>
          {/* Clip wrapper — limits visible area in zoom mode */}
          <div style={{
            position: 'relative', lineHeight: 0,
            overflow: 'hidden',
            height: clipH > 0 ? clipH : undefined,
            boxShadow: zoomTop
              ? '0 4px 32px rgba(0,0,0,0.65), 0 1px 6px rgba(0,0,0,0.4), 0 8px 0 #6b6b6b'
              : '0 4px 32px rgba(0,0,0,0.65), 0 1px 6px rgba(0,0,0,0.4)',
          }}>
            <canvas ref={canvasRef} style={{ display: 'block', background: '#fff' }} />

            {/* Crop overlays — only in normal mode */}
            {!zoomTop && cropLeft > 0 && (
              <div style={{
                position: 'absolute', top: 0, left: 0, bottom: 0, width: `${cropLeft}%`,
                background: 'rgba(255,59,48,0.18)', borderRight: '2px dashed rgba(255,59,48,0.85)',
                pointerEvents: 'none',
              }} />
            )}
            {!zoomTop && cropRight > 0 && (
              <div style={{
                position: 'absolute', top: 0, right: 0, bottom: 0, width: `${cropRight}%`,
                background: 'rgba(255,59,48,0.18)', borderLeft: '2px dashed rgba(255,59,48,0.85)',
                pointerEvents: 'none',
              }} />
            )}
            {!zoomTop && cropBottom > 0 && (
              <div style={{
                position: 'absolute', left: 0, right: 0, bottom: 0, height: `${cropBottom}%`,
                background: 'rgba(255,59,48,0.18)', borderTop: '2px dashed rgba(255,59,48,0.85)',
                pointerEvents: 'none',
              }} />
            )}
          </div>
        </div>
      </div>

      {/* Navigation + Zoom toggle */}
      {totalPages > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '5px 12px', background: 'rgba(0,0,0,0.4)', flexShrink: 0,
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
          <span style={{ fontSize: 12, color: '#fff', fontVariantNumeric: 'tabular-nums', minWidth: 48, textAlign: 'center' }}>
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

          {/* Separator */}
          <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.25)', margin: '0 4px' }} />

          {/* Zoom toggle */}
          <button
            onClick={() => setZoomTop(z => !z)}
            title={zoomTop ? 'Zoom aus — ganze Seite' : 'Zoom ein — obere Hälfte vergrößert'}
            style={{
              background: zoomTop ? 'rgba(255,255,255,0.2)' : 'none',
              border: zoomTop ? '1px solid rgba(255,255,255,0.4)' : '1px solid transparent',
              borderRadius: 4, cursor: 'pointer', padding: '2px 6px',
              display: 'flex', alignItems: 'center', gap: 4, color: '#fff',
            }}
          >
            {zoomTop ? <ZoomOut size={14} /> : <ZoomIn size={14} />}
            <span style={{ fontSize: 11 }}>{zoomTop ? 'Zoom' : 'Zoom'}</span>
          </button>
        </div>
      )}
    </div>
  )
}
