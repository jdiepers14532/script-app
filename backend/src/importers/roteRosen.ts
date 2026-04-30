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

import { Textelement, ImportResult, ParsedScene, nextId } from './types'

// ─── Detection ──────────────────────────────────────────

const TITLE_RE = /(?:Rote Rosen|Sturm der Liebe)\s+Staffel\s+(\d+)/
const DOC_TYPE_RE = /(Treatment|Drehbuch)\s+-\s+Episode\s+(\d+)/

export function isRoteRosenFormat(text: string): boolean {
  const header = text.slice(0, 2000)
  return TITLE_RE.test(header) && DOC_TYPE_RE.test(header)
}

// ─── Filename Parser ────────────────────────────────────
// Pattern: "Treatment - Rote Rosen Staffel 24 - Episode 4402 - 2026-04-30.pdf"

export interface FilenameMeta {
  document_type?: 'treatment' | 'drehbuch'
  show?: string
  staffel?: number
  episode?: number
  fassungsdatum?: string
}

const FILENAME_RE = /^(Treatment|Drehbuch)\s*-\s*(.+?)\s+Staffel\s+(\d+)\s*-\s*Episode\s+(\d+)(?:\s*-\s*(\d{4}-\d{2}-\d{2}))?/i

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
    let l = line

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

    // 7. Komparsen dedup (pdf-parse)
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
  // Second pass: strip standalone "Treatment/Drehbuch - Episode NNNN" lines
  // that appear after the cover page (footers from pdftotext)
  let pastCover = false
  const final: string[] = []
  for (const line of result) {
    const t = line.trim()
    if (SCENE_NUM_RE.test(t)) pastCover = true
    if (pastCover && FOOTER_DOC_RE.test(t)) continue
    final.push(line)
  }
  return final
}

function cleanText(raw: string): string[] {
  // Strip form feed characters (pdftotext page breaks) before any processing
  const noFF = raw.replace(/\f/g, '')
  const preprocessed = preprocessPdfText(noFF)
  const lines = preprocessed.split(/\r?\n/)
  const stripped = stripFooterLines(lines)
  // Remove margin numbers and blank lines
  return stripped.filter(l => {
    const t = l.trim()
    if (!t) return false
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

// Heuristic: is this line a character list? (e.g. "Lou, Jess, Daniel")
function isCharacterLine(line: string): boolean {
  const t = line.trim()
  if (!t || t.length > 80) return false
  if (DURATION_RE.test(t) || SCENE_NUM_RE.test(t) || INT_EXT_SPIELTAG_RE.test(t)) return false
  // Character lines don't contain sentence-ending punctuation
  if (/[.!?;]/.test(t)) return false
  const parts = t.split(',').map(p => p.trim())
  // Each part should be a short name (1-3 words)
  return parts.every(p => p.length > 0 && p.length < 30 && p.split(/\s+/).length <= 4)
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
  synopsis: string; recaps: string[]; precaps: string[]; scenesStart: number
} {
  let synopsis = ''
  const recaps: string[] = []
  const precaps: string[] = []
  let i = startIdx
  let inSection: string | null = null

  for (; i < lines.length; i++) {
    const t = lines[i].trim()
    if (SCENE_NUM_RE.test(t)) break
    if (t === 'Memo') { inSection = 'memo'; continue }
    if (t === 'Recaps') { inSection = 'recaps'; continue }
    if (/^Precaps/.test(t)) { inSection = 'precaps'; continue }
    if (t === 'Synopse') { inSection = 'synopse_header'; continue }
    if (/^FOLGE\s+\d+$/.test(t)) { inSection = 'synopsis'; continue }
    if (!t) continue

    if (inSection === 'recaps') recaps.push(t)
    else if (inSection === 'precaps') precaps.push(t)
    else if (inSection === 'synopsis' || inSection === 'synopse_header') synopsis += (synopsis ? '\n' : '') + t
  }

  return { synopsis, recaps, precaps, scenesStart: i }
}

// ─── Scene Header Parser ────────────────────────────────

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
}

function parseSceneHeader(lines: string[], startIdx: number): SceneHeader | null {
  const t = lines[startIdx]?.trim()
  if (!t) return null

  const numM = SCENE_NUM_RE.exec(t)
  if (!numM) return null

  const episodeNr = parseInt(numM[1], 10)
  const sceneNr = parseInt(numM[2], 10)
  let locationOnSameLine = numM[3]?.trim() || ''

  let i = startIdx + 1

  // Location line
  let ort_name = locationOnSameLine
  if (!ort_name && i < lines.length) {
    ort_name = lines[i].trim()
    i++
  }

  // INT/EXT + Spieltag
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

  // Characters line (only if it looks like a character list)
  let charaktere: string[] = []
  if (i < lines.length && isCharacterLine(lines[i])) {
    charaktere = lines[i].trim().split(',').map(c => c.trim()).filter(Boolean)
    i++
  } else if (i < lines.length) {
    // pdftotext may merge characters + zusammenfassung on one line:
    // "Lou, Jess, Daniel Lou merkt feinfühlig, dass..."
    // Try to split: find where a name repeats (start of zusammenfassung)
    const candidate = lines[i].trim()
    if (!DURATION_RE.test(candidate) && !SCENE_NUM_RE.test(candidate)) {
      const commaIdx = candidate.indexOf(',')
      if (commaIdx > 0 && commaIdx < 30) {
        // Extract potential names before the text body
        const firstName = candidate.slice(0, commaIdx).trim()
        // Check if firstName reappears later (start of zusammenfassung)
        const restAfterComma = candidate.slice(commaIdx + 1)
        const nameRepeatIdx = restAfterComma.search(new RegExp(`\\b${firstName}\\b`))
        if (nameRepeatIdx > 0) {
          const charPart = candidate.slice(0, commaIdx + 1 + nameRepeatIdx).trim().replace(/\s+$/, '')
          const textPart = candidate.slice(commaIdx + 1 + nameRepeatIdx).trim()
          const possibleChars = charPart.split(',').map(c => c.trim()).filter(Boolean)
          if (possibleChars.length >= 1 && possibleChars.every(p => p.length < 30 && p.split(/\s+/).length <= 4)) {
            charaktere = possibleChars
            if (textPart) lines.splice(i, 1, textPart)
            else i++
          }
        }
      }
    }
  }

  // Zusammenfassung: collect lines until duration (MM:SS)
  const zusammenfassungParts: string[] = []
  while (i < lines.length) {
    const line = lines[i].trim()
    if (!line) { i++; continue }
    if (DURATION_RE.test(line)) break
    if (SCENE_NUM_RE.test(line)) break
    zusammenfassungParts.push(line)
    i++
  }
  const zusammenfassung = zusammenfassungParts.join(' ')

  // Duration
  let dauer_sekunden = 0
  if (i < lines.length && DURATION_RE.test(lines[i].trim())) {
    dauer_sekunden = parseDurationToSeconds(lines[i].trim())
    i++
  }

  // Post-header metadata
  const komparsen: string[] = []
  const hinweise: string[] = []
  while (i < lines.length) {
    const line = lines[i].trim()
    if (!line) { i++; continue }
    const kompM = KOMPARSEN_RE.exec(line)
    if (kompM) {
      komparsen.push(...kompM[1].split(',').map(k => k.trim()).filter(Boolean))
      i++; continue
    }
    if (/^Bild aus Block/i.test(line) || /^Wechselschnitt/i.test(line) || /^Bitte.*Memo/i.test(line)) {
      hinweise.push(line); i++; continue
    }
    break
  }

  return {
    episodeNr, sceneNr, ort_name, int_ext, tageszeit, spieltag,
    charaktere, zusammenfassung, dauer_sekunden, komparsen, hinweise,
    headerEndIdx: i,
  }
}

// ─── Content Parsers ────────────────────────────────────

function parseTreatmentContent(lines: string[], startIdx: number, endIdx: number): Textelement[] {
  const elems: Textelement[] = []
  const contentLines: string[] = []

  for (let i = startIdx; i < endIdx; i++) {
    const t = lines[i].trim()
    if (!t) {
      if (contentLines.length > 0) {
        elems.push({ id: nextId(), type: 'action', text: contentLines.join(' ') })
        contentLines.length = 0
      }
      continue
    }
    if (/^Anm(erkung|\.)/i.test(t)) {
      if (contentLines.length > 0) {
        elems.push({ id: nextId(), type: 'action', text: contentLines.join(' ') })
        contentLines.length = 0
      }
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
      if (contentLines.length > 0) {
        elems.push({ id: nextId(), type: 'action', text: contentLines.join(' ') })
        contentLines.length = 0
      }
      elems.push({ id: nextId(), type: 'shot', text: t })
      continue
    }
    contentLines.push(t)
  }

  if (contentLines.length > 0) {
    elems.push({ id: nextId(), type: 'action', text: contentLines.join(' ') })
  }
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
    if (/^Anm(erkung|\.)/i.test(t)) {
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

  console.log(`[RoteRosen] cleanText produced ${lines.length} lines, first 10:`, lines.slice(0, 10))
  // Log lines that match scene number pattern
  const sceneLines = lines.filter(l => SCENE_NUM_RE.test(l.trim()))
  console.log(`[RoteRosen] Found ${sceneLines.length} lines matching SCENE_NUM_RE:`, sceneLines.slice(0, 5))

  const coverMeta = parseCoverMeta(lines)
  const docType = coverMeta.typ
  const contentStart = findContentStart(lines)
  const { synopsis, recaps, precaps, scenesStart } = parseSynopsisAndMemo(lines, contentStart)

  const szenen: ParsedScene[] = []
  const allCharaktere = new Map<string, string>() // UPPER → display name
  let i = scenesStart

  while (i < lines.length) {
    const t = lines[i]?.trim()
    if (!t) { i++; continue }
    if (!SCENE_NUM_RE.test(t)) { i++; continue }

    const header = parseSceneHeader(lines, i)
    if (!header) { i++; continue }

    // Debug: log scene header details for first few scenes
    if (szenen.length < 12) {
      const context = lines.slice(i, Math.min(i + 8, lines.length))
      console.log(`[RoteRosen] Scene ${header.sceneNr} at line ${i}:`, {
        context,
        ort_name: header.ort_name,
        int_ext: header.int_ext,
        spieltag: header.spieltag,
        charaktere: header.charaktere,
        dauer_sekunden: header.dauer_sekunden,
        headerEndIdx: header.headerEndIdx,
      })
    }

    // Find end of scene content (next scene number or EOF)
    let contentEnd = lines.length
    for (let j = header.headerEndIdx; j < lines.length; j++) {
      if (SCENE_NUM_RE.test(lines[j]?.trim() || '')) {
        contentEnd = j
        break
      }
    }

    let textelemente: Textelement[] = []
    let sceneChars: string[] = []

    if (docType === 'treatment') {
      textelemente = parseTreatmentContent(lines, header.headerEndIdx, contentEnd)
    } else {
      const parsed = parseDrehbuchContent(lines, header.headerEndIdx, contentEnd)
      textelemente = parsed.elems
      sceneChars = parsed.chars
    }

    // Merge characters: prefer header casing (mixed case) over UPPERCASE from dialog
    const charMap = new Map<string, string>()
    for (const c of header.charaktere) charMap.set(c.toUpperCase(), c)
    for (const c of sceneChars) {
      const key = c.toUpperCase()
      if (!charMap.has(key)) charMap.set(key, c)
    }
    const charaktere = Array.from(charMap.values())
    for (const c of charaktere) allCharaktere.set(c.toUpperCase(), c)

    if (header.komparsen.length > 0) {
      textelemente.unshift({ id: nextId(), type: 'direction', text: `Komparsen: ${header.komparsen.join(', ')}` })
    }
    for (const h of header.hinweise) {
      textelemente.unshift({ id: nextId(), type: 'direction', text: h })
    }

    szenen.push({
      nummer: header.sceneNr,
      int_ext: header.int_ext,
      tageszeit: header.tageszeit,
      ort_name: header.ort_name,
      zusammenfassung: header.zusammenfassung || undefined,
      textelemente,
      charaktere,
      komparsen: header.komparsen.length > 0 ? header.komparsen : undefined,
      spieltag: header.spieltag,
      dauer_sekunden: header.dauer_sekunden,
    })

    i = contentEnd
  }

  if (szenen.length === 0) {
    warnings.push('Keine Szenen erkannt. Möglicherweise unbekanntes PDF-Layout.')
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
