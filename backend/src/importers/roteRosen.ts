/**
 * Rote Rosen PDF Import Filter
 *
 * Parst Treatment- und Drehbuch-PDFs im Rote-Rosen-Produktionsformat.
 * Erkennt automatisch den Dokumenttyp anhand des Headers.
 *
 * Beinhaltet einen Preprocessor, der pdf-parse-Artefakte repariert:
 * - Zusammengeklebte Zeilen (Scene-Header, INT/EXT, Footer)
 * - Doppelte Text-Runs (Dialog-Nummern, Dauer, Komparsen)
 */

import { Textelement, ImportResult, ParsedScene, NonSceneElement, nextId } from './types'

// ─── Detection ──────────────────────────────────────────

const TITLE_RE = /(?:Rote Rosen|Sturm der Liebe)\s+(?:Produktion|Staffel)\s+(\d+)/
const DOC_TYPE_RE = /(Treatment|Drehbuch)\s+-\s+Episode\s+(\d+)/

export function isRoteRosenFormat(text: string): boolean {
  const header = text.slice(0, 2000)
  return TITLE_RE.test(header) && DOC_TYPE_RE.test(header)
}

// ─── Filename Parser ────────────────────────────────────
// Pattern: "Treatment - Rote Rosen Produktion 24 - Episode 4402 - 2026-04-30.pdf"

export interface FilenameMeta {
  document_type?: 'treatment' | 'drehbuch'
  show?: string
  staffel?: number
  episode?: number
  fassungsdatum?: string
}

const FILENAME_RE = /^(Treatment|Drehbuch)\s*-\s*(.+?)\s+(?:Produktion|Staffel)\s+(\d+)\s*-\s*Episode\s+(\d+)(?:\s*-\s*(\d{4}-\d{2}-\d{2}))?/i

export function parseFilename(filename: string): FilenameMeta {
  const base = filename.replace(/\.[^.]+$/, '')
  const m = FILENAME_RE.exec(base)
  if (!m) return {}
  return {
    document_type: m[1].toLowerCase() as 'treatment' | 'drehbuch',
    show: m[2].trim(),
    staffel: parseInt(m[3], 10),
    episode: parseInt(m[4], 10),
    fassungsdatum: m[5] || undefined,
  }
}

// ─── Patterns ───────────────────────────────────────────

const SCENE_NUM_RE = /^(\d{4})\.(\d{1,3})\s*(.*)/
const INT_EXT_SPIELTAG_RE = /^([IE])\/([TNAD])(\d+)$/
const DURATION_RE = /^(\d{1,2}):(\d{2})$/
const FOOTER_STAND_RE = /^Stand:\s+\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}$/
const FOOTER_DOC_RE = /^(Treatment|Drehbuch)\s+-\s+Episode\s+\d+$/
const FOOTER_PAGE_RE = /^\d+\s+von\s+\d+$/
const DIALOG_NUM_RE = /^(\d+)\.\s+([A-ZÄÖÜ][A-ZÄÖÜ0-9\s\-']+?)(\s*\(.*?\))?\s*$/
const PAREN_RE = /^\(.*\)$/
const KOMPARSEN_RE = /^Komparsen:\s*(.*)/i
const CROSSCUT_LOCATION_RE = /^\/\/\s+(.+)/

function isMarginNumber(line: string): boolean {
  const t = line.trim()
  if (!/^\d+$/.test(t)) return false
  const n = parseInt(t, 10)
  return n > 0 && n <= 100 && n % 5 === 0
}

// ─── PDF Text Preprocessor ──────────────────────────────
// Handles both pdf-parse artifacts (concatenation, dedup) and
// pdftotext output (blank lines, scene+duration on one line).

function preprocessPdfText(text: string): string {
  const lines = text.split(/\r?\n/)
  const result: string[] = []

  for (const line of lines) {
    // Strip inline margin line numbers (multiples of 5, range 5-40) that pdftotext
    // renders inline where they appear on the page margin.
    // Only strip when between non-digit characters (avoids "5 von 33", "Block 882" etc.)
    let l = line.replace(/([a-zA-ZäöüÄÖÜß.,;:!?)])\s+(5|10|15|20|25|30|35|40)\s+([a-zA-ZäöüÄÖÜß(])/g, '$1 $3')

    // 1. Footer: "Stand: DD.MM.YYYY HH:MMTreatment - Episode NNNNN von M" (pdf-parse)
    l = l.replace(/(Stand:\s+\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2})((?:Treatment|Drehbuch)\s*-\s*Episode)/, '$1\n$2')
    l = l.replace(/((?:Treatment|Drehbuch)\s*-\s*Episode\s*\d{4})(\d+\s+von\s+\d+)/, '$1\n$2')

    // 2. Scene header concatenated: "4402.1Außendreh / A. D. GutshofE/T4" (pdf-parse)
    l = l.replace(/^(\d{4}\.\d{1,3})((?:Stu\.|Außendreh).*?)([IE]\/[TNAD]\d+)$/m, '$1\n$2\n$3')

    // 3. Scene number + duration on same line: "4402.1 1:33" (pdftotext)
    l = l.replace(/^(\d{4}\.\d{1,3})\s+(\d{1,2}:\d{2})\s*$/m, '$1\n$2')

    // 4. Duration dedup: "1:331:33" → "1:33" (pdf-parse)
    l = l.replace(/(\d{1,2}:\d{2})\1/g, '$1')

    // 5. Duration + trailing content: "1:33Bild aus Block..." (pdf-parse)
    l = l.replace(/^(\d{1,2}:\d{2})((?:Bild aus Block|Wechselschnitt|Komparsen).*)$/m, '$1\n$2')

    // 6. Dialog number dedup: "1. 1. DANIELDANIEL" → "1. DANIEL" (pdf-parse)
    l = l.replace(/^(\d+\.\s+)\1(.+)\2$/m, '$1$2')

    // 7. Split mid-line "Komparsen:" (pdftotext: "Bild aus Block... Komparsen: ...")
    l = l.replace(/^(.+\S)\s+(Komparsen:\s*.*)$/im, '$1\n$2')

    // 7b. Komparsen dedup (pdf-parse)
    l = l.replace(/(Komparsen:\s*.+?)\1$/i, '$1')

    // 8. "Bild aus Block" dedup (pdf-parse)
    l = l.replace(/(Bild aus Block\b[^.]*\.)\1$/i, '$1')

    // 9. "Wechselschnitt" dedup (pdf-parse)
    l = l.replace(/(Wechselschnitt mit Bild \d{4}\.\d+)\1$/i, '$1')

    // 10. "Bitte...Memo" dedup (pdf-parse)
    l = l.replace(/(Bitte[^.]*Memo[^.]*\.)\1$/i, '$1')

    // Split any newlines introduced by the replacements
    result.push(...l.split('\n'))
  }

  return result.join('\n')
}

// ─── Text Cleaning ──────────────────────────────────────

function stripFooterLines(lines: string[]): string[] {
  const result: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim()
    // pdf-parse: 3 consecutive footer lines
    if (FOOTER_STAND_RE.test(t) && i + 2 < lines.length) {
      const n1 = lines[i + 1].trim()
      const n2 = lines[i + 2].trim()
      if (FOOTER_DOC_RE.test(n1) && FOOTER_PAGE_RE.test(n2)) {
        i += 2
        continue
      }
    }
    // pdftotext: individual footer lines (with blank lines between)
    if (FOOTER_STAND_RE.test(t)) continue
    if (FOOTER_PAGE_RE.test(t)) continue
    // FOOTER_DOC_RE only outside cover page area (after first scene reference)
    result.push(lines[i])
  }
  // Second pass: strip standalone "Treatment/Drehbuch - Episode NNNN" lines everywhere
  // (these are page footers from pdftotext — appear on every page including before first scene)
  const final: string[] = []
  for (const line of result) {
    const t = line.trim()
    if (FOOTER_DOC_RE.test(t)) continue
    final.push(line)
  }
  return final
}

function cleanText(raw: string): string[] {
  // Replace form feed characters (pdftotext page breaks) with newline to preserve paragraph boundaries
  const noFF = raw.replace(/\f/g, '\n')
  const preprocessed = preprocessPdfText(noFF)
  const lines = preprocessed.split(/\r?\n/)
  const stripped = stripFooterLines(lines)
  // Remove margin numbers but keep blank lines (used as paragraph separators)
  return stripped.filter(l => {
    const t = l.trim()
    if (!t) return true
    if (isMarginNumber(t)) return false
    return true
  })
}

// ─── Helpers ────────────────────────────────────────────

function parseIntExtCode(code: string): { int_ext: 'INT' | 'EXT'; tageszeit: 'TAG' | 'NACHT' | 'ABEND' | 'DÄMMERUNG'; spieltag: number } {
  const m = INT_EXT_SPIELTAG_RE.exec(code.trim())
  if (!m) return { int_ext: 'INT', tageszeit: 'TAG', spieltag: 1 }
  const int_ext = m[1] === 'E' ? 'EXT' as const : 'INT' as const
  const tzMap: Record<string, 'TAG' | 'NACHT' | 'ABEND' | 'DÄMMERUNG'> = {
    T: 'TAG', N: 'NACHT', A: 'ABEND', D: 'DÄMMERUNG',
  }
  return { int_ext, tageszeit: tzMap[m[2]] || 'TAG', spieltag: parseInt(m[3], 10) }
}

function parseDurationToSeconds(durStr: string): number {
  const m = DURATION_RE.exec(durStr.trim())
  if (!m) return 0
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
}

// Heuristic: is this line a character list? (e.g. "Lou, Jess, Daniel" or "Dr. Brückner, Merle")
function isCharacterLine(line: string): boolean {
  const t = line.trim()
  if (!t || t.length > 120) return false
  if (DURATION_RE.test(t) || SCENE_NUM_RE.test(t) || INT_EXT_SPIELTAG_RE.test(t)) return false
  // Must contain at least one comma (single-name lines are ambiguous)
  if (!t.includes(',')) return false
  // Reject lines that look like sentences (end with sentence punctuation)
  if (/[!?;]/.test(t)) return false
  const parts = t.split(',').map(p => p.trim())
  // Each part must: start with uppercase, be a short name (1-4 words, max 30 chars)
  // This prevents "ob Lou plant, umzuziehen" from being detected as characters
  return parts.length >= 2 && parts.every(p =>
    p.length > 0 && p.length < 30 && p.split(/\s+/).length <= 4 &&
    /^[A-ZÄÖÜ]/.test(p)  // must start with uppercase letter
  )
}

// ─── Cover Page Metadata ────────────────────────────────

interface CoverMeta {
  typ: 'treatment' | 'drehbuch'
  staffel: number
  episode: number
  block?: number
  regie?: string
  autor?: string
  dialogautor?: string
  writerProducer?: string
  headOfStory?: string
  storyliner?: string
  storyEdit?: string
  scriptEdit?: string
  dialogEdit?: string
  drehtermin?: string
  sendetermin?: string
  gesamtlaenge?: string
}

function parseCoverMeta(lines: string[]): CoverMeta {
  const meta: CoverMeta = { typ: 'treatment', staffel: 0, episode: 0 }
  const joined = lines.slice(0, 80).join('\n')

  const staffelM = joined.match(TITLE_RE)
  if (staffelM) meta.staffel = parseInt(staffelM[1], 10)

  const docM = joined.match(DOC_TYPE_RE)
  if (docM) {
    meta.typ = docM[1].toLowerCase() as 'treatment' | 'drehbuch'
    meta.episode = parseInt(docM[2], 10)
  }

  const blockM = joined.match(/(?:^|\n)\s*Block\s+(\d+)/m)
  if (blockM) meta.block = parseInt(blockM[1], 10)

  const labelMap: Record<string, keyof CoverMeta> = {
    'Regie': 'regie', 'Autor': 'autor', 'Dialogautor': 'dialogautor',
    'Writer Producer': 'writerProducer', 'Head of story': 'headOfStory',
    'Story edit': 'storyEdit', 'Script edit': 'scriptEdit', 'Dialog edit': 'dialogEdit',
  }

  for (let i = 0; i < Math.min(lines.length, 60); i++) {
    const t = lines[i].trim()
    for (const [label, key] of Object.entries(labelMap)) {
      if (t === label || t.endsWith(label)) {
        const val = i + 1 < lines.length ? lines[i + 1].trim() : ''
        if (val && !Object.keys(labelMap).some(l => val === l || val.endsWith(l))) {
          ;(meta as any)[key] = val
        }
      }
    }
    if (t.startsWith('Vorauss. Drehtermin') && i + 1 < lines.length) meta.drehtermin = lines[i + 1].trim()
    if (t.startsWith('Vorauss. Sendetermin') && i + 1 < lines.length) meta.sendetermin = lines[i + 1].trim()
    if (t.startsWith('Gesamtl') && i + 1 < lines.length) meta.gesamtlaenge = lines[i + 1].trim()
  }

  // Storyliner (can span multiple lines)
  for (let i = 0; i < Math.min(lines.length, 60); i++) {
    if (lines[i].trim() === 'Storyliner' && i + 1 < lines.length) {
      const parts: string[] = []
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const v = lines[j].trim()
        if (!v || Object.keys(labelMap).some(l => v === l || v.endsWith(l))) break
        parts.push(v)
      }
      meta.storyliner = parts.join(' ')
    }
  }

  return meta
}

// ─── Find content start ─────────────────────────────────

function findContentStart(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim()
    if (/^FOLGE\s+\d+$/.test(t)) return i
    if (t === 'Memo') return i
    if (SCENE_NUM_RE.test(t)) return i
  }
  return 0
}

// ─── Parse synopsis & memo ──────────────────────────────

function parseSynopsisAndMemo(lines: string[], startIdx: number): {
  synopsis: string; recaps: string[]; precaps: string[]; scenesStart: number; folgeHeading: string | null
} {
  let synopsis = ''
  const recaps: string[] = []
  const precaps: string[] = []
  let folgeHeading: string | null = null
  let i = startIdx
  let inSection: string | null = null

  for (; i < lines.length; i++) {
    const t = lines[i].trim()
    if (SCENE_NUM_RE.test(t)) break
    if (t === 'Memo') { inSection = 'memo'; continue }
    if (t === 'Recaps') { inSection = 'recaps'; continue }
    if (/^Precaps/.test(t)) { inSection = 'precaps'; continue }
    if (t === 'Synopse') { inSection = 'synopse_header'; continue }
    if (/^FOLGE\s+\d+$/i.test(t)) { folgeHeading = t; inSection = 'synopsis'; continue }
    if (!t) continue

    if (inSection === 'recaps') recaps.push(t)
    else if (inSection === 'precaps') precaps.push(t)
    else if (inSection === 'synopsis' || inSection === 'synopse_header') synopsis += (synopsis ? '\n' : '') + t
  }

  return { synopsis, recaps, precaps, scenesStart: i, folgeHeading }
}

// ─── Scene Header Parser ────────────────────────────────

const WECHSELSCHNITT_RE = /^Wechselschnitt\s+mit\s+Bild\s+(\d{4})\.(\d+)/i

interface SceneHeader {
  episodeNr: number
  sceneNr: number
  ort_name: string
  int_ext: 'INT' | 'EXT' | 'INT/EXT'
  tageszeit: 'TAG' | 'NACHT' | 'ABEND' | 'DÄMMERUNG'
  spieltag: number
  charaktere: string[]
  zusammenfassung: string
  dauer_sekunden: number
  komparsen: string[]
  hinweise: string[]
  headerEndIdx: number
  isWechselschnitt: boolean
  wechselschnittPartner: number[]
  /** Scene numbers whose duration was listed at the top of a crosscut block.
   *  The main loop must skip these when encountered as standalone lines. */
  crosscutDurationEntries: Map<number, number>
}

/**
 * Rote Rosen scene header format (pdftotext output):
 *
 *   4402.2
 *   Ort-Name
 *   Char1, Char2
 *   I/T4
 *   Zusammenfassung text...
 *   1:54
 *   Komparsen: Name1, Name2
 *   Bild aus Block 881
 *
 * Duration can also appear BEFORE the location (right after scene number).
 *
 * Wechselschnitt (crosscut): Two scene numbers + durations listed at the top,
 * then EACH scene has its own full header + content, separated by
 * "Wechselschnitt mit Bild NNNN.X" markers:
 *
 *   4402.8     ← scene 8 number
 *   1:52       ← scene 8 duration
 *   4402.9     ← scene 9 number (pdftotext extracts from side-by-side layout)
 *   1:10       ← scene 9 duration
 *   Pferdehof  ← scene 8's location
 *   Chars      ← scene 8's characters
 *   E/T4       ← scene 8's I/E
 *   Content...
 *   Wechselschnitt mit Bild 4402.9
 *   WG         ← scene 9's location (own header!)
 *   Chars      ← scene 9's characters
 *   I/T4
 *   Content...
 *   Wechselschnitt mit Bild 4402.8
 */
/** Skip blank lines from position i, return next non-blank index */
function skipBlanks(lines: string[], i: number): number {
  while (i < lines.length && !lines[i].trim()) i++
  return i
}

function parseSceneHeader(lines: string[], startIdx: number): SceneHeader | null {
  const t = lines[startIdx]?.trim()
  if (!t) return null

  const numM = SCENE_NUM_RE.exec(t)
  if (!numM) return null

  const episodeNr = parseInt(numM[1], 10)
  const sceneNr = parseInt(numM[2], 10)
  let locationOnSameLine = numM[3]?.trim() || ''

  let i = skipBlanks(lines, startIdx + 1)

  // Duration can appear right after scene number (before location)
  let dauer_sekunden = 0
  if (!locationOnSameLine && i < lines.length && DURATION_RE.test(lines[i].trim())) {
    dauer_sekunden = parseDurationToSeconds(lines[i].trim())
    i = skipBlanks(lines, i + 1)
  }

  // ── Crosscut duration table detection ──
  // If after scene+duration we see more scene+duration pairs, skip them.
  // These are partner durations extracted by pdftotext from a side-by-side layout.
  // Each partner will have its own full header later in the content.
  const crosscutDurationEntries = new Map<number, number>()
  if (dauer_sekunden > 0) {
    while (i < lines.length) {
      i = skipBlanks(lines, i)
      const nextLine = lines[i]?.trim() || ''
      const partnerM = SCENE_NUM_RE.exec(nextLine)
      if (!partnerM) break
      const partnerNr = parseInt(partnerM[2], 10)
      i = skipBlanks(lines, i + 1)
      let partnerDur = 0
      if (i < lines.length && DURATION_RE.test(lines[i].trim())) {
        partnerDur = parseDurationToSeconds(lines[i].trim())
        i = skipBlanks(lines, i + 1)
      }
      crosscutDurationEntries.set(partnerNr, partnerDur)
    }
  }

  // Location line
  let ort_name = locationOnSameLine
  if (!ort_name && i < lines.length) {
    const candidate = lines[i].trim()
    if (candidate && !SCENE_NUM_RE.test(candidate) && !DURATION_RE.test(candidate)) {
      ort_name = candidate
      i = skipBlanks(lines, i + 1)
    }
  }

  // Characters line (comma-separated names) — comes BEFORE INT/EXT in Rote Rosen format
  // Also handle single-character scenes by looking ahead for INT/EXT pattern
  let charaktere: string[] = []
  if (i < lines.length && isCharacterLine(lines[i])) {
    charaktere = lines[i].trim().split(',').map(c => c.trim()).filter(Boolean)
    i = skipBlanks(lines, i + 1)
  } else if (i < lines.length) {
    // Lookahead: if next non-blank line is INT/EXT, current line is likely a single character name
    const candidate = lines[i].trim()
    const nextIdx = skipBlanks(lines, i + 1)
    const nextLine = lines[nextIdx]?.trim() || ''
    if (candidate && !DURATION_RE.test(candidate) && !SCENE_NUM_RE.test(candidate) &&
        !INT_EXT_SPIELTAG_RE.test(candidate) && INT_EXT_SPIELTAG_RE.test(nextLine) &&
        candidate.length < 40 && candidate.split(/\s+/).length <= 4) {
      charaktere = candidate.split(',').map(c => c.trim()).filter(Boolean)
      i = skipBlanks(lines, i + 1)
    }
  }

  // Duration can appear between characters and I/T4 when pdftotext puts
  // location on the same line as scene number (e.g. "4402.22 Stu. 02 / ...")
  if (i < lines.length && DURATION_RE.test(lines[i].trim())) {
    if (dauer_sekunden === 0) {
      dauer_sekunden = parseDurationToSeconds(lines[i].trim())
    }
    i = skipBlanks(lines, i + 1)
  }

  // INT/EXT + Spieltag (I/T4, E/N2, etc.) — comes AFTER characters
  let int_ext: 'INT' | 'EXT' | 'INT/EXT' = 'INT'
  let tageszeit: 'TAG' | 'NACHT' | 'ABEND' | 'DÄMMERUNG' = 'TAG'
  let spieltag = 1

  if (i < lines.length && INT_EXT_SPIELTAG_RE.test(lines[i].trim())) {
    const parsed = parseIntExtCode(lines[i].trim())
    int_ext = parsed.int_ext
    tageszeit = parsed.tageszeit
    spieltag = parsed.spieltag
    i++
  }
  i = skipBlanks(lines, i)

  // Zusammenfassung: collect lines until duration, next scene, or post-header metadata
  const zusammenfassungParts: string[] = []
  while (i < lines.length) {
    const line = lines[i].trim()
    if (!line) { i++; continue }
    if (DURATION_RE.test(line)) break
    if (SCENE_NUM_RE.test(line)) break
    if (INT_EXT_SPIELTAG_RE.test(line)) break
    if (KOMPARSEN_RE.test(line)) break
    if (/^Bild aus Block/i.test(line) || WECHSELSCHNITT_RE.test(line) || /^Bitte.*Memo/i.test(line)) break
    zusammenfassungParts.push(line)
    i++
  }
  const zusammenfassung = zusammenfassungParts.join(' ')

  // If zusammenfassung loop broke on INT/EXT, parse it now
  i = skipBlanks(lines, i)
  if (i < lines.length && INT_EXT_SPIELTAG_RE.test(lines[i].trim())) {
    const parsed = parseIntExtCode(lines[i].trim())
    int_ext = parsed.int_ext
    tageszeit = parsed.tageszeit
    spieltag = parsed.spieltag
    i++
  }

  // Duration (can also appear after zusammenfassung)
  i = skipBlanks(lines, i)
  if (i < lines.length && DURATION_RE.test(lines[i].trim())) {
    if (dauer_sekunden === 0) {
      dauer_sekunden = parseDurationToSeconds(lines[i].trim())
    }
    i++
  }

  // Post-header metadata (Komparsen, Hinweise, Wechselschnitt)
  const komparsen: string[] = []
  const hinweise: string[] = []
  let isWechselschnitt = crosscutDurationEntries.size > 0
  const wechselschnittPartner: number[] = []

  while (i < lines.length) {
    const line = lines[i].trim()
    if (!line) { i++; continue }
    const kompM = KOMPARSEN_RE.exec(line)
    if (kompM) {
      let kompText = kompM[1]
      i++
      // Multi-line komparsen: if last entry looks incomplete (e.g. "4x"),
      // read continuation lines until a recognized metadata pattern
      while (i < lines.length) {
        const nextLine = lines[i].trim()
        if (!nextLine) { i++; continue }
        const lastEntry = kompText.split(',').pop()?.trim() || ''
        if (/^\d+x$/.test(lastEntry) || kompText.trimEnd().endsWith(',')) {
          if (SCENE_NUM_RE.test(nextLine) || DURATION_RE.test(nextLine) ||
              KOMPARSEN_RE.test(nextLine) || WECHSELSCHNITT_RE.test(nextLine) ||
              /^Bild aus Block/i.test(nextLine) || /^Bitte.*Memo/i.test(nextLine) ||
              DIALOG_NUM_RE.test(nextLine)) break
          kompText += ' ' + nextLine
          i++
        } else {
          break
        }
      }
      komparsen.push(...kompText.split(',').map(k => k.trim()).filter(Boolean))
      continue
    }
    const wsM = WECHSELSCHNITT_RE.exec(line)
    if (wsM) {
      isWechselschnitt = true
      wechselschnittPartner.push(parseInt(wsM[2], 10))
      hinweise.push(line)
      // In crosscut blocks, DON'T consume the marker — leave it for the
      // sub-scene splitter in the main loop to find as a split point.
      if (crosscutDurationEntries.size > 0) break
      i++; continue
    }
    if (/^Bild aus Block/i.test(line) || /^Bitte.*Memo/i.test(line)) {
      hinweise.push(line); i++; continue
    }
    break
  }

  // Post-process: if zusammenfassung starts with comma-separated names (pdftotext
  // merges character line + oneliner into one line), extract them as characters.
  // Pattern: "Lou, Jess, Daniel Lou merkt feinfühlig..." → chars=["Lou","Jess","Daniel"], zf="Lou merkt..."
  let finalZusammenfassung = zusammenfassung
  if (charaktere.length === 0 && finalZusammenfassung) {
    const charMatch = finalZusammenfassung.match(
      /^([A-ZÄÖÜ][a-zäöüß]+(?:\.\s*[A-ZÄÖÜ][a-zäöüß]+)?(?:,\s*[A-ZÄÖÜ][a-zäöüß]+(?:\.\s*[A-ZÄÖÜ][a-zäöüß]+)?)+)\s+([A-ZÄÖÜ].*)/
    )
    if (charMatch) {
      charaktere = charMatch[1].split(',').map(c => c.trim()).filter(Boolean)
      finalZusammenfassung = charMatch[2]
    } else {
      // Single character: "Richard Richard versucht..." → chars=["Richard"], zf="Richard versucht..."
      const singleMatch = finalZusammenfassung.match(
        /^([A-ZÄÖÜ][a-zäöüß]+)\s+\1\s+(.*)/
      )
      if (singleMatch) {
        charaktere = [singleMatch[1]]
        finalZusammenfassung = singleMatch[1] + ' ' + singleMatch[2]
      }
    }
  }

  return {
    episodeNr, sceneNr, ort_name, int_ext, tageszeit, spieltag,
    charaktere, zusammenfassung: finalZusammenfassung, dauer_sekunden, komparsen, hinweise,
    headerEndIdx: i,
    isWechselschnitt,
    wechselschnittPartner,
    crosscutDurationEntries,
  }
}

/** Parse a sub-scene header within a crosscut block (no scene number line). */
function parseSubSceneHeader(
  lines: string[], startIdx: number, endIdx: number, parent: SceneHeader
): SceneHeader | null {
  let i = startIdx
  // Skip blank lines or scene numbers (partner ref from pdftotext)
  while (i < endIdx) {
    const t = lines[i]?.trim()
    if (!t) { i++; continue }
    // If we hit a scene number from the crosscut entries, skip it + its duration
    if (SCENE_NUM_RE.test(t)) {
      i++
      if (i < endIdx && DURATION_RE.test(lines[i]?.trim() || '')) i++
      continue
    }
    break
  }
  if (i >= endIdx) return null

  // Location
  let ort_name = ''
  const locCandidate = lines[i]?.trim() || ''
  if (!DURATION_RE.test(locCandidate) && !INT_EXT_SPIELTAG_RE.test(locCandidate)) {
    ort_name = locCandidate
    i++
  }

  // Characters
  let charaktere: string[] = []
  if (i < endIdx && isCharacterLine(lines[i])) {
    charaktere = lines[i].trim().split(',').map(c => c.trim()).filter(Boolean)
    i++
  }

  // INT/EXT
  let int_ext = parent.int_ext
  let tageszeit = parent.tageszeit
  let spieltag = parent.spieltag
  if (i < endIdx && INT_EXT_SPIELTAG_RE.test(lines[i]?.trim() || '')) {
    const parsed = parseIntExtCode(lines[i].trim())
    int_ext = parsed.int_ext
    tageszeit = parsed.tageszeit
    spieltag = parsed.spieltag
    i++
  }

  // Zusammenfassung
  const parts: string[] = []
  while (i < endIdx) {
    const line = lines[i]?.trim() || ''
    if (!line) { i++; continue }
    if (DURATION_RE.test(line)) break
    if (SCENE_NUM_RE.test(line)) break
    if (KOMPARSEN_RE.test(line)) break
    if (WECHSELSCHNITT_RE.test(line)) break
    if (/^Bild aus Block/i.test(line) || /^Bitte.*Memo/i.test(line)) break
    parts.push(line)
    i++
  }

  let dauer_sekunden = 0
  if (i < endIdx && DURATION_RE.test(lines[i]?.trim() || '')) {
    dauer_sekunden = parseDurationToSeconds(lines[i].trim())
    i++
  }

  const komparsen: string[] = []
  const hinweise: string[] = []
  while (i < endIdx) {
    const line = lines[i]?.trim() || ''
    if (!line) { i++; continue }
    const kompM = KOMPARSEN_RE.exec(line)
    if (kompM) {
      let kompText = kompM[1]
      i++
      while (i < endIdx) {
        const nextLine = lines[i]?.trim() || ''
        if (!nextLine) { i++; continue }
        const lastEntry = kompText.split(',').pop()?.trim() || ''
        if (/^\d+x$/.test(lastEntry) || kompText.trimEnd().endsWith(',')) {
          if (SCENE_NUM_RE.test(nextLine) || DURATION_RE.test(nextLine) ||
              KOMPARSEN_RE.test(nextLine) || WECHSELSCHNITT_RE.test(nextLine) ||
              /^Bild aus Block/i.test(nextLine) || /^Bitte.*Memo/i.test(nextLine)) break
          kompText += ' ' + nextLine
          i++
        } else {
          break
        }
      }
      komparsen.push(...kompText.split(',').map(k => k.trim()).filter(Boolean))
      continue
    }
    if (WECHSELSCHNITT_RE.test(line)) { hinweise.push(line); i++; continue }
    if (/^Bild aus Block/i.test(line) || /^Bitte.*Memo/i.test(line)) { hinweise.push(line); i++; continue }
    break
  }

  return {
    episodeNr: parent.episodeNr, sceneNr: 0,
    ort_name, int_ext, tageszeit, spieltag,
    charaktere, zusammenfassung: parts.join(' '),
    dauer_sekunden, komparsen, hinweise,
    headerEndIdx: i,
    isWechselschnitt: true,
    wechselschnittPartner: [],
    crosscutDurationEntries: new Map(),
  }
}

// ─── Content Parsers ────────────────────────────────────

// Textbaustein keywords that should start a new paragraph if found mid-text.
// Only split when preceded by sentence-end punctuation (. ! ?) to avoid false positives.
const TEXTBAUSTEIN_SPLIT_RE = /[.!?]\s+(Anmerkung(?:en)?|Status\s+[Qq]uo\s*:)/

function parseTreatmentContent(lines: string[], startIdx: number, endIdx: number): Textelement[] {
  const elems: Textelement[] = []
  const contentLines: string[] = []

  function flushContent() {
    if (contentLines.length === 0) return
    const joined = contentLines.join(' ')
    contentLines.length = 0
    // Check if a textbaustein keyword appears mid-text (after sentence-end) and split there
    const m = TEXTBAUSTEIN_SPLIT_RE.exec(joined)
    if (m && m.index > 0) {
      // Split after the punctuation mark (include it in "before" part)
      const splitAt = m.index + 1 // after the . ! or ?
      const before = joined.slice(0, splitAt).trim()
      if (before) elems.push({ id: nextId(), type: 'action', text: before })
      // Text from the keyword onwards
      const after = joined.slice(splitAt).trim()
      if (after) elems.push({ id: nextId(), type: 'action', text: after })
    } else {
      elems.push({ id: nextId(), type: 'action', text: joined })
    }
  }

  for (let i = startIdx; i < endIdx; i++) {
    const t = lines[i].trim()
    if (!t) {
      flushContent()
      continue
    }
    if (/^Anm(erkungen?|\.)/i.test(t)) {
      flushContent()
      const anmParts = [t]
      let j = i + 1
      while (j < endIdx) {
        const next = lines[j].trim()
        if (!next || SCENE_NUM_RE.test(next)) break
        anmParts.push(next)
        j++
      }
      elems.push({ id: nextId(), type: 'direction', text: anmParts.join(' ') })
      i = j - 1
      continue
    }
    // Crosscut location labels: "Pferdehof:" or "WG:"
    if (/^[A-ZÄÖÜ][a-zäöü]+:$/.test(t) || /^WG:$/.test(t)) {
      flushContent()
      elems.push({ id: nextId(), type: 'shot', text: t })
      continue
    }
    contentLines.push(t)
  }

  flushContent()
  return elems
}

function parseDrehbuchContent(lines: string[], startIdx: number, endIdx: number): { elems: Textelement[]; chars: string[] } {
  const elems: Textelement[] = []
  const chars = new Set<string>()
  let lastCharacter = ''
  let lastType = ''
  let actionBuffer: string[] = []

  function flushAction() {
    if (actionBuffer.length > 0) {
      elems.push({ id: nextId(), type: 'action', text: actionBuffer.join(' ') })
      actionBuffer = []
    }
  }

  for (let i = startIdx; i < endIdx; i++) {
    const t = lines[i].trim()

    if (!t) {
      flushAction()
      lastType = ''
      continue
    }

    // Cross-cut location marker: "// A. D. PFERDEHOF"
    if (CROSSCUT_LOCATION_RE.test(t)) {
      flushAction()
      elems.push({ id: nextId(), type: 'shot', text: t })
      lastType = 'shot'; lastCharacter = ''
      continue
    }

    // Numbered dialog: "1. DANIEL" or "28. BRITTA (ONE-WAY)"
    const dialogM = DIALOG_NUM_RE.exec(t)
    if (dialogM) {
      flushAction()
      const charName = dialogM[2].trim()
      const extension = dialogM[3]?.trim() || ''
      const fullName = extension ? `${charName} ${extension}` : charName
      const cleanName = charName.replace(/\s*\(.*?\)\s*/g, '').trim()
      chars.add(cleanName)
      lastCharacter = fullName
      elems.push({ id: nextId(), type: 'character', text: fullName, character: cleanName })
      lastType = 'character'
      continue
    }

    // Parenthetical
    if (PAREN_RE.test(t) && (lastType === 'character' || lastType === 'dialogue' || lastType === 'parenthetical')) {
      flushAction()
      const cleanChar = lastCharacter.replace(/\s*\(.*?\)\s*/g, '').trim()
      elems.push({ id: nextId(), type: 'parenthetical', text: t, character: cleanChar })
      lastType = 'parenthetical'
      continue
    }

    // Dialog text (follows character or parenthetical)
    // In Rote Rosen Drehbuch format, dialog is in a narrow centered column (≤36 chars).
    // Lines > 40 chars after dialog are typically Regieanweisungen (action).
    if (lastType === 'character' || lastType === 'dialogue' || lastType === 'parenthetical') {
      if (t.length <= 40) {
        const cleanChar = lastCharacter.replace(/\s*\(.*?\)\s*/g, '').trim()
        elems.push({ id: nextId(), type: 'dialogue', text: t, character: cleanChar })
        lastType = 'dialogue'
        continue
      }
      // Long line → switch to action mode
      flushAction()
      lastCharacter = ''
    }

    // Anmerkung
    if (/^Anm(erkungen?|\.)/i.test(t)) {
      flushAction()
      const anmParts = [t]
      let j = i + 1
      while (j < endIdx) {
        const next = lines[j].trim()
        if (!next || SCENE_NUM_RE.test(next) || DIALOG_NUM_RE.test(next)) break
        anmParts.push(next)
        j++
      }
      elems.push({ id: nextId(), type: 'direction', text: anmParts.join(' ') })
      i = j - 1
      lastType = 'direction'; lastCharacter = ''
      continue
    }

    // Default: action
    actionBuffer.push(t)
    lastType = 'action'; lastCharacter = ''
  }

  flushAction()
  return { elems, chars: Array.from(chars) }
}

// ─── Main Parser ────────────────────────────────────────

export function parseRoteRosen(rawText: string): ImportResult {
  const lines = cleanText(rawText)
  const warnings: string[] = []

  const coverMeta = parseCoverMeta(lines)
  const docType = coverMeta.typ
  const contentStart = findContentStart(lines)
  const { synopsis, recaps, precaps, scenesStart, folgeHeading } = parseSynopsisAndMemo(lines, contentStart)

  const szenen: ParsedScene[] = []
  const allCharaktere = new Map<string, string>() // UPPER → display name
  let i = scenesStart

  // Helper: build a ParsedScene from a SceneHeader + content range
  function buildScene(header: SceneHeader, contentStartIdx: number, contentEndIdx: number): ParsedScene {
    let textelemente: Textelement[] = []
    let sceneChars: string[] = []

    if (docType === 'treatment') {
      textelemente = parseTreatmentContent(lines, contentStartIdx, contentEndIdx)
    } else {
      const parsed = parseDrehbuchContent(lines, contentStartIdx, contentEndIdx)
      textelemente = parsed.elems
      sceneChars = parsed.chars
    }

    const charMap = new Map<string, string>()
    for (const c of header.charaktere) charMap.set(c.toUpperCase(), c)
    // For crosscut scenes, only use header characters — the dialog section
    // contains intercut content with characters from ALL crosscut partners
    if (!header.isWechselschnitt) {
      for (const c of sceneChars) {
        const key = c.toUpperCase()
        if (!charMap.has(key)) charMap.set(key, c)
      }
    }
    const charaktere = Array.from(charMap.values())
    for (const c of charaktere) allCharaktere.set(c.toUpperCase(), c)

    // Komparsen are stored as scene header metadata (szene.komparsen → scene_characters),
    // not as body text in the editor content.

    let finalIntExt = header.int_ext
    if (header.ort_name && /^Außendreh/i.test(header.ort_name) && finalIntExt === 'INT') {
      finalIntExt = 'EXT'
    }

    // Build szeneninfo from hinweise
    const szeneninfo = header.hinweise.length > 0 ? header.hinweise.join('\n') : undefined

    return {
      nummer: header.sceneNr,
      int_ext: finalIntExt,
      tageszeit: header.tageszeit,
      ort_name: header.ort_name,
      zusammenfassung: header.zusammenfassung || undefined,
      textelemente,
      charaktere,
      komparsen: header.komparsen.length > 0 ? header.komparsen : undefined,
      spieltag: header.spieltag,
      dauer_sekunden: header.dauer_sekunden,
      isWechselschnitt: header.isWechselschnitt,
      wechselschnittPartner: header.wechselschnittPartner.length > 0
        ? header.wechselschnittPartner : undefined,
      szeneninfo,
    }
  }

  while (i < lines.length) {
    const t = lines[i]?.trim()
    if (!t) { i++; continue }
    if (!SCENE_NUM_RE.test(t)) { i++; continue }

    const header = parseSceneHeader(lines, i)
    if (!header) { i++; continue }

    // Find end of this scene's entire block (next scene number not consumed
    // by the crosscut duration table, or EOF)
    const crosscutPartnerNrs = new Set(header.crosscutDurationEntries.keys())
    let blockEnd = lines.length
    for (let j = header.headerEndIdx; j < lines.length; j++) {
      const lineJ = lines[j]?.trim() || ''
      const scM = SCENE_NUM_RE.exec(lineJ)
      if (scM) {
        const nr = parseInt(scM[2], 10)
        if (!crosscutPartnerNrs.has(nr)) {
          blockEnd = j
          break
        }
      }
    }

    // ── Handle crosscut sub-scenes within the block ──
    if (header.isWechselschnitt && crosscutPartnerNrs.size > 0) {
      // Find "Wechselschnitt mit Bild NNNN.X" markers in the content.
      // Each marker means "cut to scene X" — the next section contains scene X's header.
      const subSceneSplits: { idx: number; targetNr: number }[] = []
      for (let j = header.headerEndIdx; j < blockEnd; j++) {
        const wsM = WECHSELSCHNITT_RE.exec(lines[j]?.trim() || '')
        if (wsM) {
          subSceneSplits.push({ idx: j, targetNr: parseInt(wsM[2], 10) })
        }
      }

      if (subSceneSplits.length > 0) {
        const processedNrs = new Set<number>([header.sceneNr])

        // Find main scene's dialog content (from "back to main" marker)
        // and parse sub-scenes from their markers
        let mainDialogStart = header.headerEndIdx
        let mainDialogEnd = subSceneSplits[0].idx
        const subSceneResults: ParsedScene[] = []

        for (let s = 0; s < subSceneSplits.length; s++) {
          const { idx: markerIdx, targetNr } = subSceneSplits[s]
          const sectionEnd = s + 1 < subSceneSplits.length ? subSceneSplits[s + 1].idx : blockEnd

          if (targetNr === header.sceneNr) {
            // "Wechselschnitt mit Bild 4402.8" = back to main scene's dialog
            mainDialogStart = markerIdx + 1
            mainDialogEnd = sectionEnd
          } else if (!processedNrs.has(targetNr)) {
            // New sub-scene (e.g. scene 9)
            const subHeader = parseSubSceneHeader(lines, markerIdx + 1, sectionEnd, header)
            if (subHeader) {
              subHeader.sceneNr = targetNr
              subHeader.dauer_sekunden = header.crosscutDurationEntries.get(targetNr) || subHeader.dauer_sekunden
              subHeader.isWechselschnitt = true
              subHeader.wechselschnittPartner = [header.sceneNr]
              // Auto-generate szeneninfo for crosscut partner
              subHeader.hinweise.push(`Wechselschnitt mit Bild ${header.episodeNr}.${header.sceneNr}`)
              subSceneResults.push(buildScene(subHeader, subHeader.headerEndIdx, sectionEnd))
              processedNrs.add(targetNr)
            }
          }
        }

        // Push main scene first (dialog from "back to main" section), then sub-scenes
        szenen.push(buildScene(header, mainDialogStart, mainDialogEnd))
        szenen.push(...subSceneResults)
      } else {
        // No Wechselschnitt markers found — just create the main scene
        szenen.push(buildScene(header, header.headerEndIdx, blockEnd))
      }
    } else {
      // Normal (non-crosscut) scene
      szenen.push(buildScene(header, header.headerEndIdx, blockEnd))
    }

    i = blockEnd
  }

  if (szenen.length === 0) {
    warnings.push('Keine Szenen erkannt. Möglicherweise unbekanntes PDF-Layout.')
  }

  // ── Build non-scene elements (cover, synopsis, recap, precap) ──
  const nonSceneElements: NonSceneElement[] = []

  // Titelseite (cover page) — built from parsed cover metadata
  const coverParts: string[] = []
  if (coverMeta.staffel) coverParts.push(`Staffel ${coverMeta.staffel}`)
  if (coverMeta.episode) coverParts.push(`Folge ${coverMeta.episode}`)
  if (coverMeta.block) coverParts.push(`Block ${coverMeta.block}`)
  if (coverMeta.autor) coverParts.push(`Autor: ${coverMeta.autor}`)
  if (coverMeta.dialogautor) coverParts.push(`Dialogautor: ${coverMeta.dialogautor}`)
  if (coverMeta.regie) coverParts.push(`Regie: ${coverMeta.regie}`)
  if (coverMeta.drehtermin) coverParts.push(`Drehtermin: ${coverMeta.drehtermin}`)
  if (coverMeta.sendetermin) coverParts.push(`Sendetermin: ${coverMeta.sendetermin}`)
  if (coverParts.length > 0) {
    nonSceneElements.push({
      type: 'titelseite',
      label: 'Titelseite',
      content: coverParts.join('\n'),
    })
  }

  // Synopsis (with optional "FOLGE XXXX" heading)
  if (synopsis || folgeHeading) {
    const synopsisContent = [folgeHeading, synopsis].filter(Boolean).join('\n\n')
    nonSceneElements.push({
      type: 'synopsis',
      label: folgeHeading || 'Synopsis',
      content: synopsisContent,
    })
  }

  // Recaps
  for (const [ri, recap] of recaps.entries()) {
    nonSceneElements.push({
      type: 'recap',
      label: recaps.length > 1 ? `Recap ${ri + 1}` : 'Recap',
      content: recap,
    })
  }

  // Precaps
  for (const [pi, precap] of precaps.entries()) {
    nonSceneElements.push({
      type: 'precap',
      label: precaps.length > 1 ? `Precap ${pi + 1}` : 'Precap',
      content: precap,
    })
  }

  // Build metadata
  const metaObj: Record<string, any> = {
    rote_rosen_format: true, document_type: docType,
    staffel: coverMeta.staffel, episode: coverMeta.episode,
  }
  if (coverMeta.block) metaObj.block = coverMeta.block
  if (coverMeta.regie) metaObj.regie = coverMeta.regie
  if (coverMeta.autor) metaObj.autor = coverMeta.autor
  if (coverMeta.dialogautor) metaObj.dialogautor = coverMeta.dialogautor
  if (coverMeta.writerProducer) metaObj.writer_producer = coverMeta.writerProducer
  if (coverMeta.headOfStory) metaObj.head_of_story = coverMeta.headOfStory
  if (coverMeta.storyliner) metaObj.storyliner = coverMeta.storyliner
  if (coverMeta.storyEdit) metaObj.story_edit = coverMeta.storyEdit
  if (coverMeta.scriptEdit) metaObj.script_edit = coverMeta.scriptEdit
  if (coverMeta.dialogEdit) metaObj.dialog_edit = coverMeta.dialogEdit
  if (coverMeta.drehtermin) metaObj.drehtermin = coverMeta.drehtermin
  if (coverMeta.sendetermin) metaObj.sendetermin = coverMeta.sendetermin
  if (coverMeta.gesamtlaenge) metaObj.gesamtlaenge = coverMeta.gesamtlaenge
  if (synopsis) metaObj.synopsis = synopsis
  if (recaps.length > 0) metaObj.recaps = recaps
  if (precaps.length > 0) metaObj.precaps = precaps

  const totalTextelemente = szenen.reduce((sum, s) => sum + s.textelemente.length, 0)

  return {
    szenen,
    nonSceneElements: nonSceneElements.length > 0 ? nonSceneElements : undefined,
    meta: {
      format: `rote-rosen-${docType}`,
      total_scenes: szenen.length,
      total_textelemente: totalTextelemente,
      charaktere: Array.from(allCharaktere.values()),
      warnings,
      roteRosenMeta: metaObj,
    },
  }
}
