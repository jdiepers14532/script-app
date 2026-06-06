/**
 * Master-Scene-Format Import Filter (US Screenplay / BBC / ARD-ZDF Fernsehfilm)
 *
 * Standard-Master-Scene-Drehbuch: Slug-Line "INT./EXT. ORT - DAY/NIGHT", Action,
 * zentrierte/eingerückte CHARACTER-Cues, Dialog, Parentheticals, Transitions.
 *
 * Unterschied zum Fountain-Fallback: extrahiert echte Szenennummern (inkl. A/B-Suffix
 * aus Shooting Scripts) aus der Slug-Line — links und/oder am rechten Rand gespiegelt.
 *
 * US/BBC/ARD-ZDF teilen dieselbe Struktur; sie unterscheiden sich nur in Rändern/Fonts
 * (Output-Formatierung, irrelevant fürs Parsen) — daher ein gemeinsamer Parser.
 */

import { Textelement, TextelementType, ImportResult, ParsedScene, nextId, parseSceneHeading } from './types'

// INT/EXT/INT.EXT/I.E am Zeilenanfang (nach optionaler Szenennummer) + nachfolgender Text
const HEADING_CORE_RE = /^(INT\.?\/EXT\.?|EXT\.?\/INT\.?|INT\.?|EXT\.?|I\/E)\.?\s+\S/i
// Führende Szenennummer: "12 ", "12A ", "12.", "12A)" — vor INT/EXT
const LEAD_NUM_RE = /^(\d{1,4})([A-Za-z])?[.)]?\s+/
// Nachgestellte (gespiegelte) Szenennummer am rechten Rand: "... - DAY    12" / "...12A"
const TRAIL_NUM_RE = /\s+\d{1,4}[A-Za-z]?\s*$/

const CHARACTER_RE = /^[A-ZÄÖÜ][A-ZÄÖÜ0-9\s\-_'.]*$/
const PARENTHETICAL_RE = /^\(.+\)$/
const TRANSITION_RE = /^(CUT TO:|FADE (IN|OUT)|FADE TO:|DISSOLVE TO:|SMASH CUT TO:|MATCH CUT TO:|SCHNITT:|ÜBERBLENDE:)/i
const TRANSITION_TAIL_RE = /\bTO:\s*$/
const SHOT_RE = /^(CLOSE ON|CLOSE UP|WIDE SHOT|MEDIUM SHOT|POV|INSERT|ANGLE ON|PUSH IN|PAN|ZOOM)/i
const FOOTER_PAGE_RE = /^\d+\s*\.?$/                 // bloße Seitenzahl
const FOOTER_CONT_RE = /^\(?(MORE|CONT(?:INUED|'D)?)\)?\.?$/i

interface SceneHead {
  nummer: number | null
  suffix?: string
  headingText: string
}

/** Erkennt eine Slug-Line und extrahiert Szenennummer (+Suffix) sowie den INT/EXT-Teil. */
function parseSlug(line: string): SceneHead | null {
  let rest = line
  let nummer: number | null = null
  let suffix: string | undefined

  const leadM = LEAD_NUM_RE.exec(rest)
  if (leadM && HEADING_CORE_RE.test(rest.slice(leadM[0].length))) {
    nummer = parseInt(leadM[1], 10)
    suffix = leadM[2] ? leadM[2].toUpperCase() : undefined
    rest = rest.slice(leadM[0].length)
    // Rechten gespiegelten Szenennummer-Rand nur entfernen, wenn links eine Nummer stand
    rest = rest.replace(TRAIL_NUM_RE, '').trim()
  }

  if (!HEADING_CORE_RE.test(rest)) return null
  return { nummer, suffix, headingText: rest.trim() }
}

/** Heuristik für Auto-Detect: mehrere INT/EXT-Slug-Lines vorhanden. */
export function isMasterScene(text: string): boolean {
  const lines = text.slice(0, 20000).split(/\r?\n/)
  let slugs = 0
  for (const raw of lines) {
    if (parseSlug(raw.trim())) { slugs++; if (slugs >= 3) return true }
  }
  return false
}

export function parseMasterScene(content: string): ImportResult {
  const warnings: string[] = []
  const lines = content.split(/\r?\n/)
  const szenen: ParsedScene[] = []
  const allCharaktere = new Set<string>()
  let currentScene: ParsedScene | null = null
  let lastCharacter = ''
  let lastType: TextelementType | null = null
  let seq = 0

  // currentScene ist stets "in Arbeit" und NICHT in szenen — gepusht wird erst beim
  // nächsten Heading oder am Ende (wie im Fountain-Parser).
  const ensureScene = () => {
    if (!currentScene) {
      seq++
      currentScene = { nummer: seq, int_ext: 'INT', tageszeit: 'TAG', ort_name: 'Unbekannt', textelemente: [], charaktere: [] }
    }
    return currentScene
  }

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()

    if (!trimmed || FOOTER_PAGE_RE.test(trimmed) || FOOTER_CONT_RE.test(trimmed)) {
      if (!trimmed && lastType === 'dialogue') { lastCharacter = ''; lastType = null }
      continue
    }

    // Scene heading (Slug-Line)
    const slug = parseSlug(trimmed)
    if (slug) {
      const heading = parseSceneHeading(slug.headingText)
      if (currentScene) szenen.push(currentScene)
      seq++
      currentScene = {
        nummer: slug.nummer ?? seq,
        nummerSuffix: slug.suffix,
        int_ext: heading.int_ext,
        tageszeit: heading.tageszeit,
        ort_name: heading.ort_name || slug.headingText,
        textelemente: [],
        charaktere: [],
      }
      lastCharacter = ''
      lastType = null
      continue
    }

    // Transition
    if (TRANSITION_RE.test(trimmed) || (TRANSITION_TAIL_RE.test(trimmed) && trimmed === trimmed.toUpperCase() && trimmed.length < 40)) {
      const sc = ensureScene()
      sc.textelemente.push({ id: nextId(), type: 'transition', text: trimmed })
      lastType = 'transition'; lastCharacter = ''
      continue
    }

    // Shot / camera direction
    if (SHOT_RE.test(trimmed)) {
      const sc = ensureScene()
      sc.textelemente.push({ id: nextId(), type: 'shot', text: trimmed })
      lastType = 'shot'
      continue
    }

    // Parenthetical (wirkt) — nur im Dialogkontext
    if (PARENTHETICAL_RE.test(trimmed) && (lastType === 'character' || lastType === 'dialogue')) {
      const sc = ensureScene()
      const te: Textelement = { id: nextId(), type: 'parenthetical', text: trimmed }
      if (lastCharacter) te.character = lastCharacter
      sc.textelemente.push(te)
      lastType = 'parenthetical'
      continue
    }

    // Character cue (ALL CAPS, kurz, gefolgt von Dialog/Parenthetical)
    const charTest = trimmed.replace(/\s*\(.*?\)\s*$/, '').trim() // (V.O.)/(CONT'D) abstreifen
    if (CHARACTER_RE.test(charTest) && charTest.length > 0 && trimmed.length < 60) {
      let nextNonEmpty = ''
      for (let j = i + 1; j < lines.length; j++) { const t = lines[j].trim(); if (t) { nextNonEmpty = t; break } }
      const followedByContent = nextNonEmpty && !parseSlug(nextNonEmpty) && !TRANSITION_RE.test(nextNonEmpty)
      if (followedByContent) {
        const cleanName = charTest.toUpperCase()
        lastCharacter = cleanName
        allCharaktere.add(cleanName)
        const sc = ensureScene()
        sc.textelemente.push({ id: nextId(), type: 'character', text: cleanName })
        sc.charaktere.push(cleanName)
        lastType = 'character'
        continue
      }
    }

    // Dialogue (nach Character/Parenthetical/Dialogue)
    if (lastType === 'character' || lastType === 'dialogue' || lastType === 'parenthetical') {
      const sc = ensureScene()
      const te: Textelement = { id: nextId(), type: 'dialogue', text: trimmed }
      if (lastCharacter) te.character = lastCharacter
      sc.textelemente.push(te)
      lastType = 'dialogue'
      continue
    }

    // Default: action
    const sc = ensureScene()
    sc.textelemente.push({ id: nextId(), type: 'action', text: trimmed })
    lastType = 'action'; lastCharacter = ''
  }

  if (currentScene && !szenen.includes(currentScene)) szenen.push(currentScene)

  for (const sz of szenen) sz.charaktere = [...new Set(sz.charaktere)]

  const totalTextelemente = szenen.reduce((s, sc) => s + sc.textelemente.length, 0)
  if (szenen.length === 0) warnings.push('Keine Szenen erkannt — Master-Scene-Parser, bitte Ergebnis prüfen.')

  return {
    szenen,
    meta: {
      format: 'master-scene',
      total_scenes: szenen.length,
      total_textelemente: totalTextelemente,
      charaktere: Array.from(allCharaktere),
      warnings,
    },
  }
}
