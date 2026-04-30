import pdfParse from 'pdf-parse'
import { parseFountain } from './fountain'
import { isRoteRosenFormat, parseRoteRosen } from './roteRosen'
import { ImportResult } from './types'

export async function parsePdf(buffer: Buffer): Promise<ImportResult> {
  const data = await pdfParse(buffer)
  const text = data.text

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
