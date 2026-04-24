import AdmZip from 'adm-zip'
import { XMLParser } from 'fast-xml-parser'
import { Block, BlockType, ImportResult, ParsedScene, nextId, parseSceneHeading } from './types'

const TYPE_MAP: Record<string, BlockType> = {
  'sceneheading': 'action',
  'scene heading': 'action',
  'action': 'action',
  'character': 'character',
  'dialog': 'dialogue',
  'dialogue': 'dialogue',
  'parenthetical': 'parenthetical',
  'transition': 'transition',
  'shot': 'shot',
  'general': 'general',
}

export function parseCeltx(buffer: Buffer): ImportResult {
  const warnings: string[] = []

  let scriptContent = ''

  // Celtx files are ZIP archives
  try {
    const zip = new AdmZip(buffer)
    const entries = zip.getEntries()

    // Try to find the script content
    let scriptEntry = entries.find(e =>
      e.entryName === 'script.html' ||
      e.entryName.endsWith('.html') ||
      e.entryName === 'project.celtx' ||
      e.entryName.endsWith('.celtx')
    )

    if (!scriptEntry) {
      // Try any XML/HTML file
      scriptEntry = entries.find(e => e.entryName.endsWith('.xml') || e.entryName.endsWith('.html'))
    }

    if (!scriptEntry) {
      throw new Error('Keine Skript-Datei im Celtx-Archiv gefunden')
    }

    scriptContent = scriptEntry.getData().toString('utf8')
  } catch (err) {
    if ((err as Error).message.includes('Celtx')) throw err
    // Maybe it's a plain XML file, not ZIP
    scriptContent = buffer.toString('utf8')
    warnings.push('Celtx: Kein ZIP-Archiv, versuche direktes XML-Parsing')
  }

  // Parse as XML/HTML
  const szenen: ParsedScene[] = []
  let currentScene: ParsedScene | null = null
  let lastCharacter = ''
  let lastBlockType: BlockType | null = null
  const allCharaktere = new Set<string>()

  // Strip HTML tags and try to extract by paragraph class attributes
  // Celtx HTML format: <p class="sceneheading">...</p>
  const paraRe = /<p[^>]+class="([^"]+)"[^>]*>(.*?)<\/p>/gi
  let match
  let hasMatches = false

  while ((match = paraRe.exec(scriptContent)) !== null) {
    hasMatches = true
    const cls = match[1].toLowerCase().trim()
    const rawText = match[2].replace(/<[^>]+>/g, '').trim()

    if (!rawText) continue

    const blockType = TYPE_MAP[cls] ?? 'action'

    if (cls === 'sceneheading' || cls === 'scene heading') {
      const heading = parseSceneHeading(rawText)
      if (currentScene) szenen.push(currentScene)
      currentScene = {
        nummer: szenen.length + 1,
        int_ext: heading.int_ext,
        tageszeit: heading.tageszeit,
        ort_name: heading.ort_name || rawText,
        blocks: [],
        charaktere: [],
      }
      lastCharacter = ''
      lastBlockType = null
      continue
    }

    if (!currentScene) {
      currentScene = { nummer: 1, int_ext: 'INT', tageszeit: 'TAG', ort_name: 'Unbekannt', blocks: [], charaktere: [] }
    }

    const block: Block = { id: nextId(), type: blockType, text: rawText }

    if (blockType === 'character') {
      lastCharacter = rawText.toUpperCase().trim()
      allCharaktere.add(lastCharacter)
      block.text = lastCharacter
      currentScene.charaktere.push(lastCharacter)
    } else if (blockType === 'dialogue' || blockType === 'parenthetical') {
      if (lastCharacter) block.character = lastCharacter
    } else {
      lastCharacter = ''
    }

    currentScene.blocks.push(block)
    lastBlockType = blockType
  }

  if (!hasMatches) {
    warnings.push('Celtx: Keine bekannten Absatz-Stile gefunden, Fountain-Fallback wird verwendet')
    const { parseFountain } = require('./fountain')
    return parseFountain(scriptContent)
  }

  if (currentScene && !szenen.includes(currentScene)) szenen.push(currentScene)
  for (const sz of szenen) sz.charaktere = [...new Set(sz.charaktere)]
  const totalBlocks = szenen.reduce((sum, s) => sum + s.blocks.length, 0)

  return {
    szenen,
    meta: {
      format: 'celtx',
      total_scenes: szenen.length,
      total_blocks: totalBlocks,
      charaktere: Array.from(allCharaktere),
      warnings,
    },
  }
}
