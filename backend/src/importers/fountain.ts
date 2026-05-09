import { Textelement, TextelementType, InlineNode, ImportResult, ParsedScene, nextId, parseSceneHeading } from './types'

// Parse Fountain inline formatting: ***bold-italic***, **bold**, *italic*, _underline_
function parseFountainInline(text: string): { plain: string; richContent?: InlineNode[] } {
  // Check if text contains any formatting markers
  if (!/[*_]/.test(text)) return { plain: text }

  const nodes: InlineNode[] = []
  // Regex for Fountain formatting (order matters: bold-italic before bold before italic)
  const re = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_)/g
  let lastIdx = 0
  let match: RegExpExecArray | null
  let hasMarks = false

  while ((match = re.exec(text)) !== null) {
    // Text before this match
    if (match.index > lastIdx) {
      nodes.push({ type: 'text', text: text.slice(lastIdx, match.index) })
    }

    if (match[2]) {
      // ***bold-italic***
      nodes.push({ type: 'text', text: match[2], marks: [{ type: 'bold' }, { type: 'italic' }] })
      hasMarks = true
    } else if (match[3]) {
      // **bold**
      nodes.push({ type: 'text', text: match[3], marks: [{ type: 'bold' }] })
      hasMarks = true
    } else if (match[4]) {
      // *italic*
      nodes.push({ type: 'text', text: match[4], marks: [{ type: 'italic' }] })
      hasMarks = true
    } else if (match[5]) {
      // _underline_
      nodes.push({ type: 'text', text: match[5], marks: [{ type: 'underline' }] })
      hasMarks = true
    }
    lastIdx = match.index + match[0].length
  }

  // Remaining text
  if (lastIdx < text.length) {
    nodes.push({ type: 'text', text: text.slice(lastIdx) })
  }

  if (!hasMarks) return { plain: text }
  // Plain text = stripped version
  const plain = text.replace(/\*{1,3}|_/g, '')
  return { plain, richContent: nodes }
}

const SCENE_HEADING_RE = /^(INT\.?\/EXT\.?|INT\.?|EXT\.?|I\/E)\s+.+/i
const FORCED_SCENE_HEADING_RE = /^\./
const CHARACTER_RE = /^[A-ZÄÖÜ][A-ZÄÖÜ0-9\s\-_']*$/ // all uppercase
const FORCED_CHARACTER_RE = /^@/
const TRANSITION_RE = /^(SCHNITT:|ÜBERBLENDE:|CUT TO:|FADE TO:|DISSOLVE TO:|SMASH CUT TO:)/i
const FORCED_TRANSITION_RE = /^>\s*.+\s*<$/
const PARENTHETICAL_RE = /^\(.+\)$/
const SHOT_RE = /^(NAHAUFNAHME|TOTALE|HALBTOTALE|KAMERAFAHRT|ZOOM|SCHWENK|SCHUSS|POV|INSERT|CLOSE ON|WIDE SHOT|MEDIUM SHOT)/i
const NOTE_RE = /^\[\[.+\]\]$/
const PAGE_BREAK_RE = /^={3,}$/

export function parseFountain(content: string): ImportResult {
  const warnings: string[] = []
  const lines = content.split(/\r?\n/)
  const szenen: ParsedScene[] = []
  let currentScene: ParsedScene | null = null
  let lastCharacter = ''
  let lastTextelementType: TextelementType | null = null
  const allCharaktere = new Set<string>()

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    // Skip notes, page breaks, blank lines
    if (!trimmed || NOTE_RE.test(trimmed) || PAGE_BREAK_RE.test(trimmed)) {
      // Blank line resets character context for dialogue
      if (!trimmed && lastTextelementType === 'dialogue') {
        lastCharacter = ''
        lastTextelementType = null
      }
      i++
      continue
    }

    // Scene heading
    const isForcedHeading = FORCED_SCENE_HEADING_RE.test(trimmed)
    const isNaturalHeading = SCENE_HEADING_RE.test(trimmed)
    if (isNaturalHeading || isForcedHeading) {
      const headingText = isForcedHeading ? trimmed.slice(1) : trimmed
      const heading = parseSceneHeading(headingText)

      if (currentScene) szenen.push(currentScene)

      currentScene = {
        nummer: szenen.length + 1,
        int_ext: heading.int_ext,
        tageszeit: heading.tageszeit,
        ort_name: heading.ort_name || headingText,
        textelemente: [],
        charaktere: [],
      }
      lastCharacter = ''
      lastTextelementType = null
      i++
      continue
    }

    // Transitions
    if (FORCED_TRANSITION_RE.test(trimmed) || TRANSITION_RE.test(trimmed)) {
      const text = trimmed.replace(/^>\s*/, '').replace(/\s*<$/, '')
      const textelement: Textelement = { id: nextId(), type: 'transition', text }
      ensureScene(currentScene, szenen)
      if (!currentScene) {
        currentScene = makeFallbackScene(szenen.length + 1)
        szenen.push(currentScene)
      }
      currentScene.textelemente.push(textelement)
      lastTextelementType = 'transition'
      lastCharacter = ''
      i++
      continue
    }

    // Shot
    if (SHOT_RE.test(trimmed)) {
      const textelement: Textelement = { id: nextId(), type: 'shot', text: trimmed }
      if (!currentScene) { currentScene = makeFallbackScene(szenen.length + 1); szenen.push(currentScene) }
      currentScene.textelemente.push(textelement)
      lastTextelementType = 'shot'
      i++
      continue
    }

    // Parenthetical
    if (PARENTHETICAL_RE.test(trimmed)) {
      const textelement: Textelement = { id: nextId(), type: 'parenthetical', text: trimmed }
      if (lastCharacter) textelement.character = lastCharacter
      if (!currentScene) { currentScene = makeFallbackScene(szenen.length + 1); szenen.push(currentScene) }
      currentScene.textelemente.push(textelement)
      lastTextelementType = 'parenthetical'
      i++
      continue
    }

    // Character
    const isForcedChar = FORCED_CHARACTER_RE.test(trimmed)
    const isChar = CHARACTER_RE.test(trimmed) && trimmed.length > 0 && trimmed.length < 60
    if (isForcedChar || isChar) {
      // Look ahead: next non-empty line should be dialogue or parenthetical
      let nextNonEmpty = ''
      for (let j = i + 1; j < lines.length; j++) {
        const t = lines[j].trim()
        if (t) { nextNonEmpty = t; break }
      }
      const looksLikeCharacter = nextNonEmpty && !SCENE_HEADING_RE.test(nextNonEmpty) && !TRANSITION_RE.test(nextNonEmpty)
      if (looksLikeCharacter || isForcedChar) {
        const charName = isForcedChar ? trimmed.slice(1).toUpperCase().trim() : trimmed.toUpperCase().trim()
        // Strip extension like (V.O.), (O.S.), (CONT'D)
        const cleanName = charName.replace(/\s*\(.*?\)\s*$/, '').trim()
        lastCharacter = cleanName
        allCharaktere.add(cleanName)

        const textelement: Textelement = { id: nextId(), type: 'character', text: cleanName }
        if (!currentScene) { currentScene = makeFallbackScene(szenen.length + 1); szenen.push(currentScene) }
        currentScene.textelemente.push(textelement)
        currentScene.charaktere.push(cleanName)
        lastTextelementType = 'character'
        i++
        continue
      }
    }

    // Dialogue (after character)
    if (lastTextelementType === 'character' || lastTextelementType === 'dialogue' || lastTextelementType === 'parenthetical') {
      const { plain, richContent } = parseFountainInline(trimmed)
      const textelement: Textelement = { id: nextId(), type: 'dialogue', text: plain, ...(richContent ? { richContent } : {}) }
      if (lastCharacter) textelement.character = lastCharacter
      if (!currentScene) { currentScene = makeFallbackScene(szenen.length + 1); szenen.push(currentScene) }
      currentScene.textelemente.push(textelement)
      lastTextelementType = 'dialogue'
      i++
      continue
    }

    // Default: action
    const { plain: actionPlain, richContent: actionRich } = parseFountainInline(trimmed)
    const textelement: Textelement = { id: nextId(), type: 'action', text: actionPlain, ...(actionRich ? { richContent: actionRich } : {}) }
    if (!currentScene) { currentScene = makeFallbackScene(szenen.length + 1); szenen.push(currentScene) }
    currentScene.textelemente.push(textelement)
    lastTextelementType = 'action'
    lastCharacter = ''
    i++
  }

  if (currentScene && !szenen.includes(currentScene)) {
    szenen.push(currentScene)
  }

  // Deduplicate characters per scene
  for (const sz of szenen) {
    sz.charaktere = [...new Set(sz.charaktere)]
  }

  const totalTextelemente = szenen.reduce((sum, s) => sum + s.textelemente.length, 0)

  return {
    szenen,
    meta: {
      format: 'fountain',
      total_scenes: szenen.length,
      total_textelemente: totalTextelemente,
      charaktere: Array.from(allCharaktere),
      warnings,
    },
  }
}

function ensureScene(currentScene: ParsedScene | null, szenen: ParsedScene[]): void {
  // no-op, just for type safety checks elsewhere
}

function makeFallbackScene(nummer: number): ParsedScene {
  return {
    nummer,
    int_ext: 'INT',
    tageszeit: 'TAG',
    ort_name: 'Unbekannt',
    textelemente: [],
    charaktere: [],
  }
}
