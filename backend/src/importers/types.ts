export type TextelementType = 'action' | 'dialogue' | 'character' | 'parenthetical' | 'transition' | 'shot' | 'direction' | 'general'

export interface Textelement {
  id: string
  type: TextelementType
  text: string
  character?: string
}

export interface ParsedScene {
  nummer: number
  int_ext: 'INT' | 'EXT' | 'INT/EXT'
  tageszeit: 'TAG' | 'NACHT' | 'ABEND' | 'DÄMMERUNG'
  ort_name: string
  zusammenfassung?: string
  textelemente: Textelement[]
  charaktere: string[]
  spieltag?: number
  dauer_sekunden?: number
}

export interface ImportResult {
  szenen: ParsedScene[]
  meta: {
    format: string
    version?: string
    total_scenes: number
    total_textelemente: number
    charaktere: string[]
    warnings: string[]
    roteRosenMeta?: Record<string, any>
  }
}

let _textelementCounter = 0
export function nextId(): string {
  return `te${Date.now()}_${++_textelementCounter}`
}

export function parseSceneHeading(text: string): { int_ext: 'INT' | 'EXT' | 'INT/EXT'; ort_name: string; tageszeit: 'TAG' | 'NACHT' | 'ABEND' | 'DÄMMERUNG' } {
  const tageszeitMap: Record<string, 'TAG' | 'NACHT' | 'ABEND' | 'DÄMMERUNG'> = {
    'TAG': 'TAG', 'DAY': 'TAG',
    'NACHT': 'NACHT', 'NIGHT': 'NACHT',
    'ABEND': 'ABEND', 'EVENING': 'ABEND',
    'DÄMMERUNG': 'DÄMMERUNG', 'DUSK': 'DÄMMERUNG', 'DAWN': 'DÄMMERUNG',
    'MORGEN': 'TAG', 'MORNING': 'TAG',
    'MITTAG': 'TAG', 'NACHMITTAG': 'TAG',
  }

  let int_ext: 'INT' | 'EXT' | 'INT/EXT' = 'INT'
  let rest = text.trim()

  if (/^INT\.?\/EXT\.?\s*/i.test(rest)) {
    int_ext = 'INT/EXT'
    rest = rest.replace(/^INT\.?\/EXT\.?\s*/i, '')
  } else if (/^EXT\.?\s/i.test(rest) || rest.toUpperCase().startsWith('EXT.')) {
    int_ext = 'EXT'
    rest = rest.replace(/^EXT\.?\s*/i, '')
  } else if (/^INT\.?\s/i.test(rest) || rest.toUpperCase().startsWith('INT.')) {
    int_ext = 'INT'
    rest = rest.replace(/^INT\.?\s*/i, '')
  }

  let tageszeit: 'TAG' | 'NACHT' | 'ABEND' | 'DÄMMERUNG' = 'TAG'
  let ort_name = rest.trim()

  const dashIdx = rest.lastIndexOf(' - ')
  if (dashIdx > 0) {
    const tzCandidate = rest.slice(dashIdx + 3).trim().toUpperCase()
    if (tageszeitMap[tzCandidate]) {
      tageszeit = tageszeitMap[tzCandidate]
      ort_name = rest.slice(0, dashIdx).trim()
    }
  }

  // Strip trailing dot from ort_name
  ort_name = ort_name.replace(/\.$/, '').trim()

  return { int_ext, ort_name, tageszeit }
}
