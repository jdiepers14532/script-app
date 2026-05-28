/**
 * Prompt-Builder: Baut Anthropic-Prompt aus System-Prompt + Block-Kontext.
 *
 * Zwei Cache-Blöcke (cache_control: ephemeral):
 *  1. System-Prompt (aus Datei, methodenspezifisch)
 *  2. Block-Kontext (Header + Folgenliste + alle Szenen)
 *
 * Deterministisch: identische Reihenfolge und Whitespace bei jedem Build,
 * damit Anthropic Prompt-Caching Cache-Treffer liefert.
 */

import * as fs from 'fs'
import * as path from 'path'
import { renderSceneForPrompt, DocumentScene } from './scene-renderer'

// Compiled dist: backend/dist/lib/analysis → 4x up → repo-root → prompts/
const PROMPTS_DIR = path.join(__dirname, '..', '..', '..', '..', 'prompts')

export interface Produktion {
  id: string
  titel: string
  staffel?: string | null
}

export interface Folge {
  id: number
  folge_nummer: number
  titel?: string | null
}

export interface SystemBlock {
  type: 'text'
  text: string
  cache_control?: { type: 'ephemeral' }
}

export interface UserMessage {
  role: 'user'
  content: string
}

export interface BuiltPrompt {
  system: SystemBlock[]
  messages: UserMessage[]
}

const METHOD_PROMPT_FILES: Record<string, string> = {
  story_consultant_pur:       'story-consultant-pur-v2.md',
  story_consultant_framework: 'story-consultant-framework-v1.md',
}

function loadSystemPrompt(method: string): string {
  const filename = METHOD_PROMPT_FILES[method]
  if (!filename) throw new Error(`Unbekannte Analyse-Methode: ${method}`)
  const filePath = path.join(PROMPTS_DIR, filename)
  return fs.readFileSync(filePath, 'utf-8')
}

export function buildPrompt(opts: {
  method: string
  produktion: Produktion
  block_nummer: number
  dreh_von: string | null
  dreh_bis: string | null
  folgen: Folge[]
  szenen: DocumentScene[]
  roteRosenMeta?: Record<string, any> | null
}): BuiltPrompt {
  const {
    method, produktion, block_nummer, dreh_von, dreh_bis,
    folgen, szenen, roteRosenMeta,
  } = opts

  // ── 1. System-Prompt (gecached) ──────────────────────────────────────────────
  const systemPromptText = loadSystemPrompt(method)

  // ── 2. Block-Kontext (gecached, deterministisch) ─────────────────────────────
  const headerLines: string[] = [
    `# Block-Analyse: ${produktion.titel}`,
    `Block: ${block_nummer}`,
  ]

  if (produktion.staffel) headerLines.push(`Staffel: ${produktion.staffel}`)

  if (dreh_von && dreh_bis) {
    headerLines.push(`Drehzeitraum: ${dreh_von} – ${dreh_bis}`)
  } else if (dreh_von) {
    headerLines.push(`Drehbeginn: ${dreh_von}`)
  }

  if (roteRosenMeta) {
    if (roteRosenMeta.writer_producer) headerLines.push(`Writer Producer: ${roteRosenMeta.writer_producer}`)
    if (roteRosenMeta.head_of_story)   headerLines.push(`Head of Story: ${roteRosenMeta.head_of_story}`)
    if (roteRosenMeta.drehtermin)      headerLines.push(`Drehtermin: ${roteRosenMeta.drehtermin}`)
    if (roteRosenMeta.staffel)         headerLines.push(`Staffel (RR): ${roteRosenMeta.staffel}`)
  }

  headerLines.push('')
  headerLines.push('## Episoden im Block')

  const sortedFolgen = [...folgen].sort((a, b) => a.folge_nummer - b.folge_nummer)
  for (const folge of sortedFolgen) {
    const label = folge.titel ? `Folge ${folge.folge_nummer}: ${folge.titel}` : `Folge ${folge.folge_nummer}`
    headerLines.push(`- ${label}`)
  }

  headerLines.push('')
  headerLines.push('## Szenen')
  headerLines.push('')

  // Szenen deterministisch sortiert: folge_nummer ASC, scene_nummer ASC
  const sortedScenes = [...szenen].sort((a, b) => {
    if (a.folge_nummer !== b.folge_nummer) return a.folge_nummer - b.folge_nummer
    return (a.scene_nummer ?? 0) - (b.scene_nummer ?? 0)
  })

  const sceneParts: string[] = []
  for (const scene of sortedScenes) {
    const rendered = renderSceneForPrompt(scene)
    if (rendered) sceneParts.push(rendered)
  }

  const blockContext = headerLines.join('\n') + sceneParts.join('\n\n')

  // ── 3. User-Message (nicht gecached) ─────────────────────────────────────────
  const userMessage =
    'Analysiere diesen Block nach dem im System-Prompt definierten Schema.\n' +
    'Antworte auf Deutsch, mit Markdown-Headern.'

  return {
    system: [
      { type: 'text', text: systemPromptText,  cache_control: { type: 'ephemeral' } },
      { type: 'text', text: blockContext,       cache_control: { type: 'ephemeral' } },
    ],
    messages: [
      { role: 'user', content: userMessage },
    ],
  }
}
