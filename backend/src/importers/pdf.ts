import { spawnSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import pdfParse from 'pdf-parse'
import { parseFountain } from './fountain'
import { isRoteRosenFormat, parseRoteRosen } from './roteRosen'
import { ImportResult } from './types'
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

export interface PdfExtractOptions {
  method?: 'pdftotext' | 'mistral'
  cropPercent?: number // DEPRECATED — use crop instead
  crop?: PdftextCropOptions // left/right/bottom crop percentages
}

export async function parsePdf(buffer: Buffer, options?: PdfExtractOptions): Promise<ImportResult> {
  const method = options?.method || 'pdftotext'
  let text: string | null = null
  let usedMethod: string = method

  if (method === 'mistral') {
    text = await extractWithMistral(buffer)
    if (!text) {
      console.log('[PDF Import] Mistral OCR failed, falling back to pdftotext')
      usedMethod = 'pdftotext'
    }
  }

  if (!text) {
    // Support new crop object or legacy cropPercent (right-only)
    const crop: PdftextCropOptions | undefined = options?.crop
      ? options.crop
      : options?.cropPercent
        ? { cropRight: 100 - options.cropPercent }
        : undefined
    text = extractWithPdftotext(buffer, crop)
    usedMethod = 'pdftotext'
  }

  if (!text || text.trim().length < 50) {
    const data = await pdfParse(buffer)
    text = data.text
    usedMethod = 'pdf-parse'
  }

  console.log(`[PDF Import] Extraction method: ${usedMethod}, text length: ${text.length}`)

  // Try Rote Rosen format first (structured production PDF)
  if (isRoteRosenFormat(text)) {
    return parseRoteRosen(text)
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
