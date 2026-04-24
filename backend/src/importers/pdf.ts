import pdfParse from 'pdf-parse'
import { parseFountain } from './fountain'
import { ImportResult } from './types'

export async function parsePdf(buffer: Buffer): Promise<ImportResult> {
  const data = await pdfParse(buffer)
  const text = data.text

  // Parse extracted text like Fountain
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
