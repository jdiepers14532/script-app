import AdmZip from 'adm-zip'
import { Block, BlockType, ImportResult, ParsedScene, nextId, parseSceneHeading } from './types'

const TYPE_MAP: Record<string, BlockType> = {
  'scene_heading': 'action',
  'sceneheading': 'action',
  'action': 'action',
  'character': 'character',
  'dialogue': 'dialogue',
  'dialog': 'dialogue',
  'parenthetical': 'parenthetical',
  'transition': 'transition',
  'shot': 'shot',
  'general': 'general',
}

export function parseWriterDuet(buffer: Buffer): ImportResult {
  const warnings: string[] = []

  let jsonContent: any = null
  let rawJson = ''

  // WriterDuet .wdz files are ZIP archives containing JSON
  try {
    const zip = new AdmZip(buffer)
    const entries = zip.getEntries()

    const jsonEntry = entries.find(e =>
      e.entryName.endsWith('.json') ||
      e.entryName === 'script.json' ||
      e.entryName === 'screenplay.json'
    )

    if (!jsonEntry) {
      throw new Error('Keine JSON-Datei im WriterDuet-Archiv gefunden')
    }

    rawJson = jsonEntry.getData().toString('utf8')
    jsonContent = JSON.parse(rawJson)
  } catch (err) {
    // Maybe it's a plain JSON file
    try {
      jsonContent = JSON.parse(buffer.toString('utf8'))
    } catch {
      throw new Error(`WriterDuet Parse-Fehler: ${err}`)
    }
  }

  const szenen: ParsedScene[] = []
  let currentScene: ParsedScene | null = null
  let lastCharacter = ''
  const allCharaktere = new Set<string>()

  // WriterDuet JSON structure varies — try common shapes
  const elements: any[] = jsonContent?.script?.elements ??
    jsonContent?.elements ??
    jsonContent?.screenplay?.elements ??
    jsonContent?.lines ??
    []

  if (!elements.length) {
    warnings.push('WriterDuet: Unbekannte JSON-Struktur, keine Elemente gefunden')
  }

  for (const el of elements) {
    const rawType: string = (el.type ?? el.element_type ?? el.kind ?? '').toLowerCase().replace(/[-\s]/g, '_')
    const text: string = el.text ?? el.content ?? el.value ?? ''

    if (!text.trim()) continue

    const blockType: BlockType = TYPE_MAP[rawType] ?? 'action'

    const isHeading = rawType === 'scene_heading' || rawType === 'sceneheading' ||
      (blockType === 'action' && /^(INT\.?\/EXT\.?|INT\.?|EXT\.?)\s+/i.test(text))

    if (isHeading) {
      const heading = parseSceneHeading(text)
      if (currentScene) szenen.push(currentScene)
      currentScene = {
        nummer: szenen.length + 1,
        int_ext: heading.int_ext,
        tageszeit: heading.tageszeit,
        ort_name: heading.ort_name || text,
        blocks: [],
        charaktere: [],
      }
      lastCharacter = ''
      continue
    }

    if (!currentScene) {
      currentScene = { nummer: 1, int_ext: 'INT', tageszeit: 'TAG', ort_name: 'Unbekannt', blocks: [], charaktere: [] }
    }

    const block: Block = { id: nextId(), type: blockType, text: text.trim() }

    if (blockType === 'character') {
      lastCharacter = text.toUpperCase().trim()
      allCharaktere.add(lastCharacter)
      block.text = lastCharacter
      currentScene.charaktere.push(lastCharacter)
    } else if (blockType === 'dialogue' || blockType === 'parenthetical') {
      if (lastCharacter) block.character = lastCharacter
    } else {
      lastCharacter = ''
    }

    currentScene.blocks.push(block)
  }

  if (currentScene && !szenen.includes(currentScene)) szenen.push(currentScene)
  for (const sz of szenen) sz.charaktere = [...new Set(sz.charaktere)]
  const totalBlocks = szenen.reduce((sum, s) => sum + s.blocks.length, 0)

  return {
    szenen,
    meta: {
      format: 'writerduet',
      total_scenes: szenen.length,
      total_blocks: totalBlocks,
      charaktere: Array.from(allCharaktere),
      warnings,
    },
  }
}
