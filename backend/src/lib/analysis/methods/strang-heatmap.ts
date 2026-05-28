import Anthropic from '@anthropic-ai/sdk'
import { getProviderApiKey } from '../../../routes/ki'
import { queryOne } from '../../../db'
import { buildPrompt, Produktion, Folge } from '../prompt-builder'
import { DocumentScene } from '../scene-renderer'
import { TokenUsage } from './story-consultant'

export interface StrangHeatmapSzene {
  folge_nr: number
  scene_nr: number
  intensitaet: number  // 1–5
  funktion?: string
}

export interface StrangHeatmapStrang {
  name: string
  farbe: string
  szenen: StrangHeatmapSzene[]
}

export interface StrangHeatmapResult {
  structured: { straenge: StrangHeatmapStrang[] }
  usage: TokenUsage
  duration_ms: number
}

const TOOL: Anthropic.Tool = {
  name: 'strang_heatmap',
  description: 'Gibt die Strang-Verteilung als strukturierten Output zurück.',
  input_schema: {
    type: 'object' as const,
    properties: {
      straenge: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name:  { type: 'string', description: 'Strang-Bezeichnung, z.B. "Flora/Raphael/Tom"' },
            farbe: { type: 'string', description: 'Hex-Farbe, z.B. "#E24B4A"' },
            szenen: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  folge_nr:   { type: 'number' },
                  scene_nr:   { type: 'number' },
                  intensitaet: { type: 'number', description: '1 (schwach) bis 5 (zentral)' },
                  funktion:   { type: 'string', description: 'Optionaler Marker wie CLIFF, PEN, DPU' },
                },
                required: ['folge_nr', 'scene_nr', 'intensitaet'],
              },
            },
          },
          required: ['name', 'farbe', 'szenen'],
        },
      },
    },
    required: ['straenge'],
  },
}

export async function runStrangHeatmap(opts: {
  produktion: Produktion
  block_nummer: number
  dreh_von: string | null
  dreh_bis: string | null
  folgen: Folge[]
  szenen: DocumentScene[]
  roteRosenMeta?: Record<string, any> | null
}): Promise<StrangHeatmapResult> {
  const apiKey = await getProviderApiKey('claude')
  if (!apiKey) throw new Error('Kein Claude-API-Key konfiguriert')

  const modelRow = await queryOne(`SELECT value FROM app_settings WHERE key = 'analysis_model'`, [])
  const model = (modelRow?.value as string | undefined) || 'claude-sonnet-4-6'

  const prompt = buildPrompt({ method: 'strang_heatmap', ...opts })
  const client = new Anthropic({ apiKey, timeout: 300_000 })

  const startMs = Date.now()
  const response = await client.messages.create({
    model,
    max_tokens: 8000,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: 'strang_heatmap' },
    system:   prompt.system   as unknown as Anthropic.TextBlockParam[],
    messages: prompt.messages as unknown as Anthropic.MessageParam[],
  })
  const duration_ms = Date.now() - startMs

  const toolBlock = response.content.find(b => b.type === 'tool_use')
  if (!toolBlock || toolBlock.type !== 'tool_use') {
    throw new Error('Kein strukturierter Output von Claude erhalten')
  }

  const structured = (toolBlock as Anthropic.ToolUseBlock).input as { straenge: StrangHeatmapStrang[] }

  const usage: TokenUsage = {
    input_tokens:                response.usage.input_tokens,
    output_tokens:               response.usage.output_tokens,
    cache_read_input_tokens:     (response.usage as any).cache_read_input_tokens     ?? 0,
    cache_creation_input_tokens: (response.usage as any).cache_creation_input_tokens ?? 0,
  }

  return { structured, usage, duration_ms }
}
