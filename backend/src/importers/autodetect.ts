export interface DetectResult {
  format: 'fdx' | 'fountain' | 'docx' | 'pdf' | 'celtx' | 'writerduet' | 'unknown'
  confidence: number
  hint?: string
}

export function detectFormat(filename: string, buffer: Buffer): DetectResult {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  const magic = buffer.slice(0, 8).toString('hex')
  const startStr = buffer.slice(0, 500).toString('utf8')

  const isZip = magic.startsWith('504b0304')
  const isPdf = magic.startsWith('25504446')
  const isXml = startStr.trimStart().startsWith('<?xml') || startStr.trimStart().startsWith('<FinalDraft')
  const hasFdContent = startStr.includes('FinalDraft') || startStr.includes('DocumentType="Script"')

  if (ext === 'fdx') {
    if (hasFdContent) return { format: 'fdx', confidence: 0.99, hint: 'FinalDraft XML erkannt' }
    if (isXml) return { format: 'fdx', confidence: 0.85, hint: 'XML mit .fdx Endung' }
    return { format: 'fdx', confidence: 0.7, hint: 'Dateiendung .fdx' }
  }

  if (ext === 'fountain') return { format: 'fountain', confidence: 0.95, hint: 'Fountain-Dateiendung' }

  if (ext === 'docx' && isZip) return { format: 'docx', confidence: 0.98, hint: 'Word DOCX erkannt' }

  if (ext === 'pdf' || isPdf) return { format: 'pdf', confidence: 0.99, hint: 'PDF erkannt' }

  if (ext === 'celtx') {
    if (isZip) return { format: 'celtx', confidence: 0.95, hint: 'Celtx-Datei erkannt' }
    if (isXml) return { format: 'celtx', confidence: 0.8, hint: 'XML mit .celtx Endung' }
  }

  if (ext === 'wdz' && isZip) return { format: 'writerduet', confidence: 0.95, hint: 'WriterDuet erkannt' }

  // Content-based without known extension
  if (isXml && hasFdContent) return { format: 'fdx', confidence: 0.9, hint: 'FinalDraft XML ohne .fdx Endung' }
  if (isPdf) return { format: 'pdf', confidence: 0.99, hint: 'PDF Magic Bytes' }

  if (isZip) {
    // Try to peek inside ZIP
    try {
      const AdmZip = require('adm-zip')
      const zip = new AdmZip(buffer)
      const entries = zip.getEntries().map((e: any) => e.entryName)
      if (entries.some((n: string) => n.includes('script.html') || n.endsWith('.celtx'))) {
        return { format: 'celtx', confidence: 0.85, hint: 'ZIP mit Celtx-Struktur' }
      }
      if (entries.some((n: string) => n.endsWith('.json') || n.includes('script.json'))) {
        return { format: 'writerduet', confidence: 0.8, hint: 'ZIP mit JSON-Inhalt (WriterDuet?)' }
      }
      if (entries.some((n: string) => n.includes('word/document.xml'))) {
        return { format: 'docx', confidence: 0.95, hint: 'DOCX-Struktur erkannt' }
      }
    } catch {
      // ignore
    }
  }

  if (!isZip && !isPdf && !isXml) {
    if (/^\s*(INT|EXT|INT\.\/EXT)\./m.test(startStr)) {
      return { format: 'fountain', confidence: 0.85, hint: 'Szenenköpfe erkannt' }
    }
  }

  return { format: 'unknown', confidence: 0, hint: 'Format nicht erkannt' }
}
