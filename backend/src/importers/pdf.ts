import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import pdfParse from 'pdf-parse'
import { parseFountain } from './fountain'
import { isRoteRosenFormat, parseRoteRosen } from './roteRosen'
import { ImportResult } from './types'

/** Try pdftotext (poppler) first — much more reliable than pdf-parse */
function extractWithPdftotext(buffer: Buffer): string | null {
  const tmpFile = path.join(os.tmpdir(), `script-import-${Date.now()}.pdf`)
  try {
    fs.writeFileSync(tmpFile, buffer)
    const text = execFileSync('pdftotext', [tmpFile, '-'], {
      encoding: 'utf8',
      timeout: 30000,
    })
    return text
  } catch {
    return null
  } finally {
    try { fs.unlinkSync(tmpFile) } catch { /* ignore */ }
  }
}

export async function parsePdf(buffer: Buffer): Promise<ImportResult> {
  // Try pdftotext first (poppler-utils), fall back to pdf-parse
  let text = extractWithPdftotext(buffer)
  let usedPdftotext = !!text

  if (!text || text.trim().length < 50) {
    const data = await pdfParse(buffer)
    text = data.text
    usedPdftotext = false
  }

  console.log(`[PDF Import] Extraction method: ${usedPdftotext ? 'pdftotext' : 'pdf-parse'}, text length: ${text.length}`)

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
