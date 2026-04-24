import { XMLParser } from 'fast-xml-parser'
import { Textelement, TextelementType, ImportResult, ParsedScene, nextId, parseSceneHeading } from './types'

const TYPE_MAP: Record<string, TextelementType> = {
  'Action': 'action',
  'Character': 'character',
  'Dialogue': 'dialogue',
  'Parenthetical': 'parenthetical',
  'Transition': 'transition',
  'Shot': 'shot',
  'General': 'general',
  'Page #': 'general',
  'Cast List': 'general',
  'Scene Heading': 'action', // scene headings themselves are not Textelemente — handled separately
}

function extractText(paragraph: any): string {
  if (!paragraph) return ''
  const textNodes = paragraph.Text
  if (!textNodes) return ''
  const texts = Array.isArray(textNodes) ? textNodes : [textNodes]
  return texts
    .map((t: any) => {
      if (typeof t === 'string') return t
      if (typeof t === 'number') return String(t)
      return t['#text'] ?? t._ ?? ''
    })
    .join('')
    .trim()
}

function extractCharakters(paragraph: any): string[] {
  const beats = paragraph.CharacterArcBeat
  if (!beats) return []
  const arr = Array.isArray(beats) ? beats : [beats]
  return arr
    .map((b: any) => (typeof b === 'string' ? b : b['@_Name'] ?? ''))
    .filter(Boolean)
    .map((n: string) => n.toUpperCase().trim())
}

export function parseFdx(xmlContent: string): ImportResult {
  const warnings: string[] = []

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => ['Paragraph', 'Text', 'CharacterArcBeat', 'Tag', 'Scene'].includes(name),
    textNodeName: '#text',
    allowBooleanAttributes: true,
  })

  let doc: any
  try {
    doc = parser.parse(xmlContent)
  } catch (err) {
    throw new Error(`FDX Parse-Fehler: ${err}`)
  }

  const root = doc?.FinalDraft
  if (!root) {
    throw new Error('Kein FinalDraft-Root-Element gefunden')
  }

  const version = root['@_Version'] ?? undefined
  const content = root.Content
  if (!content) {
    throw new Error('Kein <Content>-Block in FDX')
  }

  const paragraphs: any[] = Array.isArray(content.Paragraph) ? content.Paragraph : (content.Paragraph ? [content.Paragraph] : [])

  // Collect TagData characters
  const tagCharacters: string[] = []
  const tagData = root.TagData
  if (tagData) {
    const tags = Array.isArray(tagData.Tag) ? tagData.Tag : (tagData.Tag ? [tagData.Tag] : [])
    for (const tag of tags) {
      if (tag['@_Category'] === 'Cast Members' || tag['@_Category'] === 'Charakter') {
        const name = tag['@_Label'] ?? tag['@_Name'] ?? ''
        if (name) tagCharacters.push(name.toUpperCase().trim())
      }
    }
  }

  const szenen: ParsedScene[] = []
  let currentScene: ParsedScene | null = null
  let lastCharacter = ''
  const allCharaktere = new Set<string>()

  for (const para of paragraphs) {
    const ptype: string = para['@_Type'] ?? 'Action'
    const text = extractText(para)

    if (ptype === 'Scene Heading') {
      const numStr = para['@_Number'] ?? '0'
      const nummer = parseInt(numStr, 10) || 0

      if (currentScene) {
        szenen.push(currentScene)
      }

      const heading = parseSceneHeading(text)
      const sceneChars = extractCharakters(para)
      sceneChars.forEach(c => allCharaktere.add(c))

      currentScene = {
        nummer,
        int_ext: heading.int_ext,
        tageszeit: heading.tageszeit,
        ort_name: heading.ort_name || text,
        textelemente: [],
        charaktere: [...sceneChars],
      }
      lastCharacter = ''
      continue
    }

    if (!text) continue

    const textelementType = TYPE_MAP[ptype] ?? 'general'

    if (textelementType === 'general' && ptype === 'Page #') continue

    const textelement: Textelement = { id: nextId(), type: textelementType, text }

    if (textelementType === 'character') {
      lastCharacter = text.toUpperCase().trim()
      allCharaktere.add(lastCharacter)
      textelement.text = lastCharacter
    } else if (textelementType === 'dialogue' && lastCharacter) {
      textelement.character = lastCharacter
    } else if (textelementType === 'parenthetical' && lastCharacter) {
      textelement.character = lastCharacter
    } else {
      if (textelementType !== 'dialogue' && textelementType !== 'parenthetical') {
        lastCharacter = ''
      }
    }

    if (!currentScene) {
      // Before any scene heading — create a synthetic scene 0
      currentScene = {
        nummer: 0,
        int_ext: 'INT',
        tageszeit: 'TAG',
        ort_name: 'Teaser',
        textelemente: [],
        charaktere: [],
      }
    }

    currentScene.textelemente.push(textelement)
  }

  if (currentScene) {
    szenen.push(currentScene)
  }

  // Merge tag characters
  tagCharacters.forEach(c => allCharaktere.add(c))

  // Collect characters from each scene's character Textelemente
  for (const sz of szenen) {
    for (const b of sz.textelemente) {
      if (b.type === 'character') {
        sz.charaktere.push(b.text)
        allCharaktere.add(b.text)
      }
    }
    // deduplicate
    sz.charaktere = [...new Set(sz.charaktere)]
  }

  const totalTextelemente = szenen.reduce((sum, s) => sum + s.textelemente.length, 0)

  return {
    szenen,
    meta: {
      format: 'fdx',
      version,
      total_scenes: szenen.length,
      total_textelemente: totalTextelemente,
      charaktere: Array.from(allCharaktere),
      warnings,
    },
  }
}
