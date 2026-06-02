// Tier-1 Parser: Rein deterministisch, ohne KI
// Erkennt Block/Strang-Struktur in RR-Future-Dokumenten (und ähnlichen Formaten)
//
// Dokument-Struktur (RR-Future):
//   STRANG-HEADING (ALL-CAPS mit " - " Trennern)
//   BLOCK NNN [CHARAKTER]
//   Prosa-Text...
//
// Ergebnis: strukturiertes Objekt mit allen gefundenen Blöcken pro Strang

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse') as (data: Buffer) => Promise<{ text: string; numpages: number; info: any }>

export interface Tier1Block {
  block_nummer: number
  charakter?: string
  strang?: string
  text: string            // Prosa-Text dieses Blocks in diesem Strang
}

export interface Tier1Result {
  success: boolean          // true wenn ≥ 3 Blöcke erkannt
  blocks: Tier1Block[]      // alle Block-Einträge (ein Block-Nummer kann mehrfach vorkommen — einmal pro Strang)
  unique_blocks: number[]   // sortierte Liste aller eindeutigen Block-Nummern
  strang_names: string[]    // erkannte Strang-Überschriften (ALL-CAPS)
  total_chars: number       // Zeichenlänge des extrahierten Rohtexts
  num_pages?: number        // Seitenanzahl des PDFs (falls vorhanden)
  grund?: string            // Begründung warum Tier-1 unzureichend (für Tier-2-Prompt)
}

// Strang-Heading: Zeile nur aus GROSSBUCHSTABEN, Leerzeichen, Bindestrichen, Umlauten
// UND mindestens ein " - " oder " – " Trenner → min. 2 Namen
const STRANG_HEADING_RE = /^[A-ZÄÖÜ][A-ZÄÖÜ\s]{1,}(?:\s*[-–]\s*[A-ZÄÖÜ][A-ZÄÖÜ\s]+)+$/

// Block-Heading: Zeile beginnt mit BLOCK NNN (optional mit Charakternamen dahinter)
// Toleriert Markdown-Artefakte am Zeilanfang
const BLOCK_HEADING_RE = /^(?:[#*_`\s>]*)\s*BLOCK\s+(\d+)\s*(?:[-–]?\s*([A-ZÄÖÜ][A-Za-zÄÖÜäöüß\s\-]*))?$/i

/** Extrahiert Text aus einem PDF-Buffer via pdf-parse */
export async function pdfToText(buffer: Buffer): Promise<{ text: string; numPages: number }> {
  const data = await pdfParse(buffer)
  return { text: data.text, numPages: data.numpages }
}

/** Bereinigt eine Zeile von Markdown-Artefakten */
function cleanLine(line: string): string {
  return line
    .replace(/^[*#_`>\s]+/, '')  // führende Markdown-Marker entfernen
    .replace(/[*#_`]+$/, '')     // nachfolgende Marker entfernen
    .trim()
}

/** Prüft ob eine Zeile ein Strang-Heading ist */
function isStrangHeading(line: string): boolean {
  if (line.length < 5) return false
  if (line.startsWith('BLOCK')) return false
  // Muss mindestens einen " - " oder " – " Trenner enthalten
  if (!line.includes(' - ') && !line.includes(' – ')) return false
  return STRANG_HEADING_RE.test(line)
}

/** Führt den Tier-1-Parse-Lauf auf dem extrahierten Text aus */
export function runTier1(text: string, numPages?: number): Tier1Result {
  const lines = text.split('\n')
  const blocks: Tier1Block[] = []
  const strangNames: string[] = []
  const uniqueBlockNums = new Set<number>()

  let currentStrang: string | undefined
  let currentBlock: { block_nummer: number; charakter?: string; strang?: string; textLines: string[] } | null = null

  const finalizeBlock = () => {
    if (!currentBlock) return
    const text = currentBlock.textLines.join(' ').replace(/\s+/g, ' ').trim()
    blocks.push({
      block_nummer: currentBlock.block_nummer,
      charakter: currentBlock.charakter,
      strang: currentBlock.strang,
      text,
    })
    currentBlock = null
  }

  for (const rawLine of lines) {
    const line = cleanLine(rawLine)
    if (!line) continue

    // Block-Heading erkennen?
    const blockMatch = line.match(BLOCK_HEADING_RE)
    if (blockMatch) {
      finalizeBlock()
      const blockNr = parseInt(blockMatch[1], 10)
      const charakter = blockMatch[2]?.trim() || undefined
      uniqueBlockNums.add(blockNr)
      currentBlock = { block_nummer: blockNr, charakter, strang: currentStrang, textLines: [] }
      continue
    }

    // Strang-Heading erkennen?
    if (isStrangHeading(line)) {
      // Wenn aktueller Block sehr wenig Text hat und Strang-Heading kommt → Block abschließen
      finalizeBlock()
      currentStrang = line
      if (!strangNames.includes(line)) strangNames.push(line)
      continue
    }

    // Prosa-Text zu aktuellem Block hinzufügen
    if (currentBlock) {
      currentBlock.textLines.push(line)
    }
  }
  finalizeBlock()

  const uniqueBlocks = Array.from(uniqueBlockNums).sort((a, b) => a - b)

  // Erfolgs-Kriterium: mindestens 3 Block-Einträge erkannt
  const success = blocks.length >= 3

  let grund: string | undefined
  if (blocks.length === 0) {
    grund = 'Keine BLOCK-Strukturen gefunden. Möglicherweise unbekanntes Dokumentformat oder kein Future-Dokument.'
  } else if (blocks.length < 3) {
    grund = `Nur ${blocks.length} Block-Eintrag/Einträge gefunden — zu wenig für sicheren Tier-1-Import.`
  }

  return {
    success,
    blocks,
    unique_blocks: uniqueBlocks,
    strang_names: strangNames,
    total_chars: text.length,
    num_pages: numPages,
    grund,
  }
}
