import Anthropic from '@anthropic-ai/sdk'
import { getProviderApiKey } from '../../../routes/ki'
import { queryOne } from '../../../db'
import { buildPrompt, Produktion, Folge } from '../prompt-builder'
import { DocumentScene } from '../scene-renderer'
import { TokenUsage } from './story-consultant'

export interface ArcPunkt {
  folge_nr: number
  scene_nr: number
  wert: number    // -5 bis +5
  notiz?: string
}

export interface ArcStrang {
  name: string
  farbe: string
  punkte: ArcPunkt[]
}

export interface VonnegutArcsResult {
  structured: { straenge: ArcStrang[] }
  usage: TokenUsage
  duration_ms: number
}

const TOOL: Anthropic.Tool = {
  name: 'vonnegut_arcs',
  description: 'Gibt die emotionalen Bögen der Stränge als strukturierten Output zurück.',
  input_schema: {
    type: 'object' as const,
    properties: {
      straenge: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name:  { type: 'string', description: 'Strang-Bezeichnung, z.B. "Flora/Raphael"' },
            farbe: { type: 'string', description: 'Hex-Farbe, z.B. "#E24B4A"' },
            punkte: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  folge_nr: { type: 'number' },
                  scene_nr: { type: 'number' },
                  wert:     { type: 'number', description: '-5 (Tiefpunkt) bis +5 (Höhepunkt)' },
                  notiz:    { type: 'string', description: 'Kurze Notiz zum Wendepunkt (optional)' },
                },
                required: ['folge_nr', 'scene_nr', 'wert'],
              },
            },
          },
          required: ['name', 'farbe', 'punkte'],
        },
      },
    },
    required: ['straenge'],
  },
}

export async function runVonnegutArcs(opts: {
  produktion: Produktion
  block_nummer: number
  dreh_von: string | null
  dreh_bis: string | null
  folgen: Folge[]
  szenen: DocumentScene[]
  roteRosenMeta?: Record<string, any> | null
}): Promise<VonnegutArcsResult> {
  const apiKey = await getProviderApiKey('claude')
  if (!apiKey) throw new Error('Kein Claude-API-Key konfiguriert')

  const modelRow = await queryOne(`SELECT value FROM app_settings WHERE key = 'analysis_model'`, [])
  const model = (modelRow?.value as string | undefined) || 'claude-sonnet-4-6'

  const prompt = buildPrompt({ method: 'vonnegut_arcs', ...opts })
  const client = new Anthropic({ apiKey, timeout: 300_000 })

  const startMs = Date.now()
  const response = await client.messages.create({
    model,
    max_tokens: 8000,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: 'vonnegut_arcs' },
    system:   prompt.system   as unknown as Anthropic.TextBlockParam[],
    messages: prompt.messages as unknown as Anthropic.MessageParam[],
  })
  const duration_ms = Date.now() - startMs

  const toolBlock = response.content.find(b => b.type === 'tool_use')
  if (!toolBlock || toolBlock.type !== 'tool_use') {
    throw new Error('Kein strukturierter Output von Claude erhalten')
  }

  const structured = (toolBlock as Anthropic.ToolUseBlock).input as { straenge: ArcStrang[] }

  const usage: TokenUsage = {
    input_tokens:                response.usage.input_tokens,
    output_tokens:               response.usage.output_tokens,
    cache_read_input_tokens:     (response.usage as any).cache_read_input_tokens     ?? 0,
    cache_creation_input_tokens: (response.usage as any).cache_creation_input_tokens ?? 0,
  }

  return { structured, usage, duration_ms }
}
