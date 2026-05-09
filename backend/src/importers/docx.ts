import mammoth from 'mammoth'
import { Textelement, TextelementType, InlineNode, ImportResult, ParsedScene, nextId, parseSceneHeading } from './types'

const SCENE_HEADING_RE = /^(INT\.?\/EXT\.?|INT\.?|EXT\.?|I\/E)\s+/i

// Style name -> Textelement-Typ mapping fuer Drehbuch-Word-Stile
const STYLE_MAP: Record<string, TextelementType> = {
  'szenenüberschrift': 'action',
  'scene heading': 'action',
  'szenenkopf': 'action',
  'aktion': 'action',
  'action': 'action',
  'handlung': 'action',
  'charakter': 'character',
  'character': 'character',
  'dialog': 'dialogue',
  'dialogue': 'dialogue',
  'anmerkung': 'parenthetical',
  'parenthetical': 'parenthetical',
  'überleitung': 'transition',
  'transition': 'transition',
  'einstellung': 'shot',
  'shot': 'shot',
}

// Parse HTML inline tags into ProseMirror-compatible InlineNode[]
function parseInlineHtml(html: string): InlineNode[] {
  const nodes: InlineNode[] = []
  // Regex to find text and inline tags
  const re = /(<\/?(?:strong|em|b|i|u|s|sup|sub|span)[^>]*>)|([^<]+)/gi
  const markStack: string[] = []
  let match

  while ((match = re.exec(html)) !== null) {
    const tag = match[1]
    const text = match[2]

    if (tag) {
      const isClose = tag.startsWith('</')
      const tagName = (tag.match(/<\/?(\w+)/)?.[1] || '').toLowerCase()

      if (isClose) {
        // Pop matching tag from stack
        const idx = markStack.lastIndexOf(tagName)
        if (idx >= 0) markStack.splice(idx, 1)
      } else {
        markStack.push(tagName)
      }
    } else if (text) {
      const marks: { type: 'bold' | 'italic' | 'underline' }[] = []
      for (const m of markStack) {
        if (m === 'strong' || m === 'b') marks.push({ type: 'bold' })
        else if (m === 'em' || m === 'i') marks.push({ type: 'italic' })
        else if (m === 'u') marks.push({ type: 'underline' })
      }
      // Deduplicate marks
      const uniqueMarks = marks.filter((m, i, arr) => arr.findIndex(x => x.type === m.type) === i)
      nodes.push({ type: 'text', text, ...(uniqueMarks.length > 0 ? { marks: uniqueMarks } : {}) })
    }
  }

  // Merge adjacent nodes with same marks
  const merged: InlineNode[] = []
  for (const node of nodes) {
    const last = merged[merged.length - 1]
    if (last && JSON.stringify(last.marks || []) === JSON.stringify(node.marks || [])) {
      last.text += node.text
    } else {
      merged.push({ ...node })
    }
  }

  return merged
}

// Extract alignment from HTML style attribute
function extractAlignment(attrs: string): 'left' | 'center' | 'right' | undefined {
  const styleMatch = /style="([^"]*)"/.exec(attrs)
  if (!styleMatch) return undefined
  const alignMatch = /text-align:\s*(center|right|left)/i.exec(styleMatch[1])
  if (!alignMatch) return undefined
  return alignMatch[1].toLowerCase() as 'left' | 'center' | 'right'
}

export async function parseDocx(buffer: Buffer): Promise<ImportResult> {
  const warnings: string[] = ['DOCX-Import: Stile werden heuristisch erkannt, bitte Ergebnis pruefen']

  // Convert to HTML with style info — preserve inline formatting
  const { value: html } = await mammoth.convertToHtml(
    { buffer },
    {
      styleMap: [
        "p[style-name='Szenenüberschrift'] => p.scene-heading:fresh",
        "p[style-name='Scene Heading'] => p.scene-heading:fresh",
        "p[style-name='Szenenkopf'] => p.scene-heading:fresh",
        "p[style-name='Charakter'] => p.character:fresh",
        "p[style-name='Character'] => p.character:fresh",
        "p[style-name='Dialog'] => p.dialogue:fresh",
        "p[style-name='Dialogue'] => p.dialogue:fresh",
        "p[style-name='Aktion'] => p.action:fresh",
        "p[style-name='Action'] => p.action:fresh",
        "p[style-name='Handlung'] => p.action:fresh",
        "p[style-name='Anmerkung'] => p.parenthetical:fresh",
        "p[style-name='Parenthetical'] => p.parenthetical:fresh",
        "p[style-name='Überleitung'] => p.transition:fresh",
        "p[style-name='Transition'] => p.transition:fresh",
      ],
    }
  )

  const szenen: ParsedScene[] = []
  let currentScene: ParsedScene | null = null
  let lastCharacter = ''
  let lastTextelementType: TextelementType | null = null
  const allCharaktere = new Set<string>()

  // Parse HTML paragraph by paragraph
  const paraRe = /<p([^>]*)>(.*?)<\/p>/gi
  let match
  while ((match = paraRe.exec(html)) !== null) {
    const attrs = match[1]
    const innerHtml = match[2]
    const rawText = innerHtml.replace(/<[^>]+>/g, '').trim()
    if (!rawText) continue

    // Determine class from style mapping
    const classMatch = /class="([^"]+)"/.exec(attrs)
    const classes = classMatch ? classMatch[1].split(' ') : []

    let detectedType: TextelementType | null = null
    for (const cls of classes) {
      const key = cls.toLowerCase()
      if (STYLE_MAP[key]) { detectedType = STYLE_MAP[key]; break }
    }

    // Fallback heuristic
    if (!detectedType) {
      if (SCENE_HEADING_RE.test(rawText)) {
        detectedType = 'action' // will be treated as scene heading
      } else if (/^[A-ZÄÖÜ][A-ZÄÖÜ0-9\s\-_']{1,59}$/.test(rawText)) {
        detectedType = 'character'
      } else if (/^\(.+\)$/.test(rawText)) {
        detectedType = 'parenthetical'
      } else if (/^(SCHNITT:|CUT TO:|ÜBERBLENDE:|FADE TO:)/i.test(rawText)) {
        detectedType = 'transition'
      } else if (lastTextelementType === 'character' || lastTextelementType === 'parenthetical') {
        detectedType = 'dialogue'
      } else {
        detectedType = 'action'
      }
    }

    // Scene heading treatment
    if (detectedType === 'action' && SCENE_HEADING_RE.test(rawText)) {
      const heading = parseSceneHeading(rawText)
      if (currentScene) szenen.push(currentScene)
      currentScene = {
        nummer: szenen.length + 1,
        int_ext: heading.int_ext,
        tageszeit: heading.tageszeit,
        ort_name: heading.ort_name || rawText,
        textelemente: [],
        charaktere: [],
      }
      lastCharacter = ''
      lastTextelementType = null
      continue
    }

    if (!currentScene) {
      currentScene = { nummer: 1, int_ext: 'INT', tageszeit: 'TAG', ort_name: 'Unbekannt', textelemente: [], charaktere: [] }
    }

    // Parse rich content from HTML inline tags
    const richContent = parseInlineHtml(innerHtml)
    const hasRichFormatting = richContent.some(n => n.marks && n.marks.length > 0)
    const alignment = extractAlignment(attrs)

    const textelement: Textelement = {
      id: nextId(),
      type: detectedType,
      text: rawText,
      ...(hasRichFormatting ? { richContent } : {}),
      ...(alignment && alignment !== 'left' ? { textAlign: alignment } : {}),
    }

    if (detectedType === 'character') {
      const charName = rawText.toUpperCase().trim().replace(/\s*\(.*?\)\s*$/, '')
      lastCharacter = charName
      allCharaktere.add(charName)
      textelement.text = charName
      currentScene.charaktere.push(charName)
    } else if (detectedType === 'dialogue' || detectedType === 'parenthetical') {
      if (lastCharacter) textelement.character = lastCharacter
    } else {
      lastCharacter = ''
    }

    currentScene.textelemente.push(textelement)
    lastTextelementType = detectedType
  }

  if (currentScene && !szenen.includes(currentScene)) szenen.push(currentScene)

  for (const sz of szenen) sz.charaktere = [...new Set(sz.charaktere)]
  const totalTextelemente = szenen.reduce((sum, s) => sum + s.textelemente.length, 0)

  return {
    szenen,
    meta: {
      format: 'docx',
      total_scenes: szenen.length,
      total_textelemente: totalTextelemente,
      charaktere: Array.from(allCharaktere),
      warnings,
    },
  }
}
