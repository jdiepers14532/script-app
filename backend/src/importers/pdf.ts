import { spawnSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import pdfParse from 'pdf-parse'
import { parseFountain } from './fountain'
import { isRoteRosenFormat, parseRoteRosen } from './roteRosen'
import { ImportResult, BboxLayout, LineInfo } from './types'
import { getProviderApiKey, recordUsage } from '../routes/ki'

export interface PdftextCropOptions {
  cropLeft?: number   // percentage to cut from left (0-50)
  cropRight?: number  // percentage to cut from right (0-50)
  cropBottom?: number // percentage to cut from bottom (0-50)
}

/** Try pdftotext (poppler) first — much more reliable than pdf-parse.
 *  Uses spawnSync instead of execFileSync because pdftotext may exit
 *  with non-zero code on font warnings while still producing valid text. */
function extractWithPdftotext(buffer: Buffer, crop?: PdftextCropOptions): string | null {
  const tmpFile = path.join(os.tmpdir(), `script-import-${Date.now()}.pdf`)
  try {
    fs.writeFileSync(tmpFile, buffer)
    const args: string[] = []
    // Crop: pdftotext -x <left> -y 0 -W <width> -H <height> uses points (72/inch)
    // A4 = 595pt wide, 842pt tall.
    const left = crop?.cropLeft || 0
    const right = crop?.cropRight || 0
    const bottom = crop?.cropBottom || 0
    if (left > 0 || right > 0 || bottom > 0) {
      const xOffset = Math.round(595 * (left / 100))
      const cropWidth = Math.round(595 * ((100 - left - right) / 100))
      const cropHeight = Math.round(842 * ((100 - bottom) / 100))
      args.push('-x', String(xOffset), '-y', '0', '-W', String(cropWidth), '-H', String(cropHeight))
    }
    args.push(tmpFile, '-')
    const result = spawnSync('pdftotext', args, {
      encoding: 'utf8',
      timeout: 30000,
    })
    const text = result.stdout
    if (text && text.trim().length > 0) return text
    console.log(`[PDF Import] pdftotext failed: exit=${result.status}, stderr=${(result.stderr || '').slice(0, 200)}`)
    return null
  } catch (err) {
    console.log(`[PDF Import] pdftotext exception:`, err)
    return null
  } finally {
    try { fs.unlinkSync(tmpFile) } catch { /* ignore */ }
  }
}

/** Extract text using Mistral OCR API (mistral-ocr-latest).
 *  Returns concatenated page texts or null on failure. */
export async function extractWithMistral(buffer: Buffer): Promise<string | null> {
  const apiKey = await getProviderApiKey('mistral')
  if (!apiKey) {
    console.log('[PDF Import] Mistral OCR: no API key configured or provider inactive')
    return null
  }

  try {
    const base64Pdf = buffer.toString('base64')
    const response = await fetch('https://api.mistral.ai/v1/ocr', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'mistral-ocr-latest',
        document: {
          type: 'document_url',
          document_url: `data:application/pdf;base64,${base64Pdf}`,
        },
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.log(`[PDF Import] Mistral OCR API error: ${response.status} ${errText.slice(0, 200)}`)
      return null
    }

    const data = await response.json() as any
    // Mistral OCR returns { pages: [{ markdown: string, index: number }] }
    const pages = data.pages || data.results || []
    const texts = pages.map((p: any) => p.markdown || p.text || '').filter(Boolean)

    // Track usage (page-based pricing)
    recordUsage('mistral', 'mistral-ocr-latest', 0, 0).catch(() => {})

    const fullText = texts.join('\n\n')
    console.log(`[PDF Import] Mistral OCR: ${pages.length} pages, ${fullText.length} chars`)
    return fullText.length > 0 ? fullText : null
  } catch (err) {
    console.log('[PDF Import] Mistral OCR exception:', err)
    return null
  }
}

// ─── Bbox Layout Extraction ─────────────────────────────────────────────────

/** Run pdftotext -bbox to get word-level bounding boxes.
 *  Returns a structured layout with per-line info, or null on failure. */
export function extractBboxLayout(buffer: Buffer, crop?: PdftextCropOptions): BboxLayout | null {
  const tmpPdf = path.join(os.tmpdir(), `script-bbox-${Date.now()}.pdf`)
  const tmpHtml = tmpPdf.replace('.pdf', '.html')
  try {
    fs.writeFileSync(tmpPdf, buffer)
    const result = spawnSync('pdftotext', ['-bbox', tmpPdf, tmpHtml], {
      encoding: 'utf8',
      timeout: 30000,
    })
    if (!fs.existsSync(tmpHtml)) return null
    const html = fs.readFileSync(tmpHtml, 'utf8')
    return parseBboxHtml(html, crop)
  } catch (err) {
    console.log('[PDF Import] bbox extraction error:', err)
    return null
  } finally {
    try { fs.unlinkSync(tmpPdf) } catch { /* ignore */ }
    try { fs.unlinkSync(tmpHtml) } catch { /* ignore */ }
  }
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
}

function parseBboxHtml(html: string, crop?: PdftextCropOptions): BboxLayout | null {
  // Parse page dimensions from first <page> element
  const pageMatch = html.match(/<page width="([\d.]+)" height="([\d.]+)"/)
  if (!pageMatch) return null
  const pageWidth = parseFloat(pageMatch[1])
  const pageHeight = parseFloat(pageMatch[2])

  // Crop boundaries in pts (same logic as extractWithPdftotext)
  const left  = crop?.cropLeft  ?? 0
  const right = crop?.cropRight ?? 0
  const bot   = crop?.cropBottom ?? 0
  const xOffset  = Math.round(pageWidth  * (left / 100))
  const cropMaxX = Math.round(pageWidth  * ((100 - left - right) / 100)) + xOffset
  const cropMaxY = Math.round(pageHeight * ((100 - bot) / 100))

  // Parse words from all pages
  const allWords: Array<{
    text: string; xMin: number; yMin: number; xMax: number; yMax: number; pageIdx: number
  }> = []

  const pageBlocks = html.split(/<page /).slice(1)
  for (let pi = 0; pi < pageBlocks.length; pi++) {
    const wordRe = /xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g
    let m: RegExpExecArray | null
    while ((m = wordRe.exec(pageBlocks[pi])) !== null) {
      const xMin = parseFloat(m[1]), yMin = parseFloat(m[2])
      const xMax = parseFloat(m[3]), yMax = parseFloat(m[4])
      const text = decodeHtmlEntities(m[5]).trim()
      if (!text) continue
      // Apply crop filter (only when crop is specified)
      if ((left > 0 || right > 0) && (xMin < xOffset || xMax > cropMaxX)) continue
      if (bot > 0 && yMax > cropMaxY) continue
      allWords.push({ text, xMin, yMin, xMax, yMax, pageIdx: pi })
    }
  }

  if (allWords.length === 0) return null

  // Group words into lines: words with yMid within 2pt on the same page share a line
  type WordEntry = typeof allWords[0]
  const lineMap = new Map<string, WordEntry[]>()
  for (const w of allWords) {
    const yMid = (w.yMin + w.yMax) / 2
    let bestKey: string | null = null
    let bestDist = Infinity
    for (const key of lineMap.keys()) {
      const sep = key.indexOf(':')
      const kPage = parseInt(key.slice(0, sep), 10)
      const kY = parseFloat(key.slice(sep + 1))
      if (kPage === w.pageIdx) {
        const d = Math.abs(kY - yMid)
        if (d < 2 && d < bestDist) { bestKey = key; bestDist = d }
      }
    }
    const key = bestKey ?? `${w.pageIdx}:${yMid.toFixed(1)}`
    if (!lineMap.has(key)) lineMap.set(key, [])
    lineMap.get(key)!.push(w)
  }

  // Sort line groups by page then y-position
  const sortedEntries = [...lineMap.entries()].sort((a, b) => {
    const sa = a[0].indexOf(':'), sb = b[0].indexOf(':')
    const aPage = parseInt(a[0].slice(0, sa), 10), aY = parseFloat(a[0].slice(sa + 1))
    const bPage = parseInt(b[0].slice(0, sb), 10), bY = parseFloat(b[0].slice(sb + 1))
    return aPage !== bPage ? aPage - bPage : aY - bY
  })

  const lines: LineInfo[] = []
  for (const [, words] of sortedEntries) {
    words.sort((a, b) => a.xMin - b.xMin)
    const text = words.map(w => w.text).join(' ')
    const xMin = Math.min(...words.map(w => w.xMin))
    const xMax = Math.max(...words.map(w => w.xMax))
    const yMid = words.reduce((s, w) => s + (w.yMin + w.yMax) / 2, 0) / words.length
    const charHeight = words.reduce((s, w) => s + (w.yMax - w.yMin), 0) / words.length
    lines.push({
      text, yMid, xMin, xMax, charHeight,
      gapBefore: 0, pageIdx: words[0].pageIdx,
      isCentered: false, isLargeFont: false,
    })
  }

  if (lines.length === 0) return null

  // Calculate gap to previous line
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].pageIdx === lines[i - 1].pageIdx) {
      lines[i].gapBefore = lines[i].yMid - lines[i - 1].yMid
    }
  }

  // Median line spacing
  const gaps = lines.filter(l => l.gapBefore > 0).map(l => l.gapBefore).sort((a, b) => a - b)
  const medianLineSpacing = gaps.length > 0 ? gaps[Math.floor(gaps.length / 2)] : 12

  // Median char height
  const heights = [...lines].map(l => l.charHeight).sort((a, b) => a - b)
  const medianCharHeight = heights[Math.floor(heights.length / 2)] || 10

  // Mark centered lines and large-font lines
  for (const li of lines) {
    const center = li.xMin + (li.xMax - li.xMin) / 2
    li.isCentered = Math.abs(center - pageWidth / 2) < pageWidth * 0.12
    li.isLargeFont = li.charHeight > medianCharHeight * 1.35
  }

  return { lines, pageWidth, pageHeight, medianLineSpacing, medianCharHeight }
}

/** Reconstruct plain text from bbox layout.
 *  Inserts blank lines where the gap to the previous line exceeds 2.0× median
 *  AND is at least 4pt larger than median — this avoids treating regular
 *  line-wrapped text as paragraph breaks in documents with uniform spacing. */
export function buildTextFromLayout(layout: BboxLayout): string {
  // Paragraph gaps in Rote Rosen treatments are ~2× the line spacing.
  // Using 1.8× (not 2.0×) gives a 10% margin so we don't miss gaps that are
  // fractionally below the 2× mark due to floating-point rounding.
  const threshold = Math.max(layout.medianLineSpacing * 1.8, layout.medianLineSpacing + 4)
  const out: string[] = []
  for (const li of layout.lines) {
    if (li.gapBefore > threshold && out.length > 0 && out[out.length - 1] !== '') {
      out.push('')  // blank line = paragraph break
    }
    out.push(li.text)
  }
  return out.join(String.fromCharCode(10))
}

export interface PdfExtractOptions {
  method?: 'pdftotext' | 'mistral'
  cropPercent?: number // DEPRECATED — use crop instead
  crop?: PdftextCropOptions // left/right/bottom crop percentages
}

export async function parsePdf(buffer: Buffer, options?: PdfExtractOptions): Promise<ImportResult> {
  const method = options?.method || 'pdftotext'
  let text: string | null = null
  let usedMethod: string = method
  let layout: import('./types').BboxLayout | null = null

  // Support new crop object or legacy cropPercent (right-only)
  const crop: PdftextCropOptions | undefined = options?.crop
    ? options.crop
    : options?.cropPercent
      ? { cropRight: 100 - options.cropPercent }
      : undefined

  if (method === 'mistral') {
    text = await extractWithMistral(buffer)
    if (!text) {
      console.log('[PDF Import] Mistral OCR failed, falling back to pdftotext')
      usedMethod = 'pdftotext'
    }
  }

  if (!text) {
    // ── bbox-enhanced extraction (primary for pdftotext path) ──────────────
    // pdftotext -bbox provides word-level y-coordinates so we can detect real
    // paragraph gaps (larger line spacing) and insert blank lines accordingly.
    // This makes blank-line-based paragraph detection reliable regardless of
    // whether pdftotext emits blank lines in its plain-text output.
    layout = extractBboxLayout(buffer, crop)
    if (layout) {
      const bboxText = buildTextFromLayout(layout)
      if (bboxText.trim().length > 50) {
        text = bboxText
        usedMethod = 'pdftotext-bbox'
        console.log(
          `[PDF Import] bbox layout: ${layout.lines.length} lines, ` +
          `medianGap=${layout.medianLineSpacing.toFixed(1)}pt, ` +
          `medianChar=${layout.medianCharHeight.toFixed(1)}pt`
        )
      }
    }

    if (!text) {
      text = extractWithPdftotext(buffer, crop)
      usedMethod = 'pdftotext'
    }
  }

  if (!text || text.trim().length < 50) {
    const data = await pdfParse(buffer)
    text = data.text
    usedMethod = 'pdf-parse'
    layout = null
  }

  console.log(`[PDF Import] Extraction method: ${usedMethod}, text length: ${text.length}`)

  // Try Rote Rosen format first (structured production PDF)
  if (isRoteRosenFormat(text)) {
    return parseRoteRosen(text, usedMethod === 'mistral', layout ?? undefined)
  }

  // Fallback: parse extracted text like Fountain
  const result = parseFountain(text)

  return {
    ...result,
    meta: {
      ...result.meta,
      format: 'pdf',
      warnings: [
        'PDF-Import ist heuristisch, bitte Ergebnis prüfen',
        ...result.meta.warnings,
      ],
    },
  }
}
