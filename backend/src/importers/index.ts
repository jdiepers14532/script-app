import { detectFormat } from './autodetect'
import { parseFdx } from './fdx'
import { parseFountain } from './fountain'
import { parseDocx } from './docx'
import { parsePdf } from './pdf'
import { parseCeltx } from './celtx'
import { parseWriterDuet } from './writerduet'
import { ImportResult } from './types'

export { detectFormat } from './autodetect'
export type { DetectResult } from './autodetect'
export type { ImportResult, ParsedScene, Block, BlockType } from './types'

export async function parseScript(filename: string, buffer: Buffer): Promise<ImportResult> {
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
    case 'pdf':
      return parsePdf(buffer)
    case 'celtx':
      return parseCeltx(buffer)
    case 'writerduet':
      return parseWriterDuet(buffer)
    default:
      throw new Error('Unbekanntes Format')
  }
}
