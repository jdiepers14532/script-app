import { detectFormat } from './autodetect'
import { parseFdx } from './fdx'
import { parseFountain } from './fountain'
import { parseDocx } from './docx'
import { parsePdf, PdfExtractOptions } from './pdf'
import { parseCeltx } from './celtx'
import { parseWriterDuet } from './writerduet'
import { ImportResult } from './types'

export { detectFormat } from './autodetect'
export type { DetectResult } from './autodetect'
export type { ImportResult, ParsedScene, Textelement, TextelementType, NonSceneElement } from './types'

export interface ParseOptions {
  pdfMethod?: 'pdftotext' | 'mistral'
  pdfCropPercent?: number
}

export async function parseScript(filename: string, buffer: Buffer, options?: ParseOptions): Promise<ImportResult> {
  const detected = detectFormat(filename, buffer)

  if (detected.confidence < 0.5) {
    throw new Error(`Format nicht erkannt: ${detected.hint ?? 'Unbekanntes Format'}`)
  }

  switch (detected.format) {
    case 'fdx':
      return parseFdx(buffer.toString('utf8'))
    case 'fountain':
      return parseFountain(buffer.toString('utf8'))
    case 'docx':
      return parseDocx(buffer)
    case 'pdf': {
      const pdfOpts: PdfExtractOptions = {}
      if (options?.pdfMethod) pdfOpts.method = options.pdfMethod
      if (options?.pdfCropPercent) pdfOpts.cropPercent = options.pdfCropPercent
      return parsePdf(buffer, pdfOpts)
    }
    case 'celtx':
      return parseCeltx(buffer)
    case 'writerduet':
      return parseWriterDuet(buffer)
    default:
      throw new Error('Unbekanntes Format')
  }
}
