/**
 * Scene-Renderer: ProseMirror-JSON (dokument_szenen.content) → Klartext für Analyse-Prompts
 *
 * Output-Format pro Szene (deterministische Reihenfolge für Anthropic Prompt Caching):
 *
 *   === Szene 4487.29 ===
 *   INT/EXT: Außendreh · Tageszeit: TAG · Spieltag: 53
 *   Ort: A. D. Stadtcafé
 *   Figuren: Flora, Raphael
 *   Komparsen: —
 *   Marker: CLIFF
 *   Zusammenfassung: Flora gibt sich einem leidenschaftlichen Kuss hin ...
 *   Inhalt:
 *   Feierabend. Das Café ist leer ...
 */

/** Marker-Regex: extrahiert Branchen-Kürzel aus der Zusammenfassung */
const MARKER_RE = /^(PEN|CLIFF|DPU|IPU|SOLO|SBSA|WS|CA|1W|2W|NMDP|SBSA)\b/i

export interface DocumentScene {
  id: string
  werkstufe_id: string
  folge_nummer: number
  scene_nummer: number | null
  scene_nummer_suffix: string | null
  int_ext: string
  tageszeit: string
  ort_name: string | null
  spieltag: number | null
  zusammenfassung: string | null
  szeneninfo: string | null
  content: any[]
  format: string
  sondertyp: string | null
  element_type: string
  geloescht: boolean
  charaktere?: string[] | null
  komparsen?: string[] | null
  wechselschnitt_partner?: number[] | null
}

export function renderSceneForPrompt(scene: DocumentScene): string {
  if (scene.element_type !== 'scene') return ''
  if (scene.scene_nummer == null) return ''
  if (scene.geloescht) return ''

  const suffix = scene.scene_nummer_suffix || ''
  const sceneLabel = `${scene.folge_nummer}.${scene.scene_nummer}${suffix}`

  const lines: string[] = []

  lines.push(`=== Szene ${sceneLabel} ===`)
  lines.push(
    `INT/EXT: ${scene.int_ext || 'INT'} · Tageszeit: ${scene.tageszeit || 'TAG'} · Spieltag: ${scene.spieltag ?? '—'}`
  )
  lines.push(`Ort: ${scene.ort_name || '—'}`)

  // Figuren (ohne Komparsen)
  const figuren = (scene.charaktere || []).filter(Boolean)
  lines.push(figuren.length ? `Figuren: ${figuren.join(', ')}` : `Figuren: —`)

  // Komparsen
  const komparsen = (scene.komparsen || []).filter(Boolean)
  lines.push(komparsen.length ? `Komparsen: ${komparsen.join(', ')}` : `Komparsen: —`)

  // Marker aus Zusammenfassung extrahieren
  const markerMatch = scene.zusammenfassung ? MARKER_RE.exec(scene.zusammenfassung.trim()) : null
  if (markerMatch) {
    lines.push(`Marker: ${markerMatch[1].toUpperCase()}`)
  }

  // Sondertyp
  if (scene.sondertyp === 'wechselschnitt') {
    const partner = (scene.wechselschnitt_partner || [])
      .map(n => `${scene.folge_nummer}.${n}`)
      .join(', ')
    lines.push(`Wechselschnitt${partner ? ` mit: ${partner}` : ''}`)
  } else if (scene.sondertyp === 'stockshot') {
    lines.push(`Stockshot`)
  } else if (scene.sondertyp === 'flashback') {
    lines.push(`Flashback`)
  }

  if (scene.zusammenfassung) {
    lines.push(`Zusammenfassung: ${scene.zusammenfassung}`)
  }

  if (scene.szeneninfo) {
    lines.push(`Info: ${scene.szeneninfo}`)
  }

  // Content
  const contentText = renderContent(scene.content || []).trim()
  if (contentText) {
    lines.push(`Inhalt:`)
    lines.push(contentText)
  }

  return lines.join('\n')
}

// ── ProseMirror → Klartext ────────────────────────────────────────────────────

function renderContent(nodes: any[]): string {
  if (!Array.isArray(nodes)) return ''
  const parts: string[] = []

  for (const node of nodes) {
    if (!node) continue
    const rendered = renderNode(node)
    if (rendered.trim()) parts.push(rendered)
  }

  return parts.join('\n')
}

function renderNode(node: any): string {
  if (!node?.type) return ''

  // Inline text node
  if (node.type === 'text') return node.text || ''

  const inner = node.content?.length
    ? node.content.map((n: any) => renderNode(n)).join('')
    : ''

  switch (node.type) {
    case 'screenplay_element': {
      const elemType = node.attrs?.element_type || 'action'
      if (elemType === 'character')      return `FIGUR: ${inner}`
      if (elemType === 'dialogue')       return `    ${inner}`
      if (elemType === 'parenthetical')  return `    (${inner})`
      if (elemType === 'direction')      return `(Anweisung: ${inner})`
      if (elemType === 'shot')           return `(Kamera: ${inner})`
      if (elemType === 'transition')     return `--- ${inner} ---`
      return inner  // action, general, heading
    }
    case 'absatz':
      return inner

    case 'paragraph':
    case 'doc':
      return renderContent(node.content || [])

    case 'hardBreak':
      return '\n'

    default:
      return inner
  }
}
