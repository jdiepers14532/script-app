import Anthropic from '@anthropic-ai/sdk'
import { getProviderApiKey } from '../../../routes/ki'
import { queryOne } from '../../../db'
import { buildPrompt, Produktion, Folge } from '../prompt-builder'
import { DocumentScene } from '../scene-renderer'
import { TokenUsage } from './story-consultant'

export interface AgencyEpisode {
  folge_nr: number
  aktiv: number          // Anzahl aktiver Szenen
  reaktiv: number        // Anzahl reaktiver Szenen
  passiv: number         // Anzahl passiver/abwesender Szenen
  top_entscheidung?: string  // Bedeutendste aktive Entscheidung
}

export interface AgencyCharakter {
  name: string
  episoden: AgencyEpisode[]
}

export interface FigurenAgencyResult {
  structured: { charaktere: AgencyCharakter[] }
  usage: TokenUsage
  duration_ms: number
}

const TOOL: Anthropic.Tool = {
  name: 'figuren_agency',
  description: 'Gibt die Figuren-Agency-Matrix als strukturierten Output zurück.',
  input_schema: {
    type: 'object' as const,
    properties: {
      charaktere: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Figurenname' },
            episoden: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  folge_nr:        { type: 'number' },
                  aktiv:           { type: 'number', description: 'Szenen mit aktiver Agency' },
                  reaktiv:         { type: 'number', description: 'Szenen mit reaktiver Agency' },
                  passiv:          { type: 'number', description: 'Szenen ohne Agency' },
                  top_entscheidung: { type: 'string', description: 'Wichtigste aktive Entscheidung (1 Satz, optional)' },
                },
                required: ['folge_nr', 'aktiv', 'reaktiv', 'passiv'],
              },
            },
          },
          required: ['name', 'episoden'],
        },
      },
    },
    required: ['charaktere'],
  },
}

export async function runFigurenAgency(opts: {
  produktion: Produktion
  block_nummer: number
  dreh_von: string | null
  dreh_bis: string | null
  folgen: Folge[]
  szenen: DocumentScene[]
  roteRosenMeta?: Record<string, any> | null
}): Promise<FigurenAgencyResult> {
  const apiKey = await getProviderApiKey('claude')
  if (!apiKey) throw new Error('Kein Claude-API-Key konfiguriert')

  const modelRow = await queryOne(`SELECT value FROM app_settings WHERE key = 'analysis_model'`, [])
  const model = (modelRow?.value as string | undefined) || 'claude-sonnet-4-6'

  const prompt = buildPrompt({ method: 'figuren_agency', ...opts })
  const client = new Anthropic({ apiKey, timeout: 300_000 })

  const startMs = Date.now()
  const response = await client.messages.create({
    model,
    max_tokens: 8000,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: 'figuren_agency' },
    system:   prompt.system   as unknown as Anthropic.TextBlockParam[],
    messages: prompt.messages as unknown as Anthropic.MessageParam[],
  })
  const duration_ms = Date.now() - startMs

  const toolBlock = response.content.find(b => b.type === 'tool_use')
  if (!toolBlock || toolBlock.type !== 'tool_use') {
    throw new Error('Kein strukturierter Output von Claude erhalten')
  }

  const structured = (toolBlock as Anthropic.ToolUseBlock).input as { charaktere: AgencyCharakter[] }

  const usage: TokenUsage = {
    input_tokens:                response.usage.input_tokens,
    output_tokens:               response.usage.output_tokens,
    cache_read_input_tokens:     (response.usage as any).cache_read_input_tokens     ?? 0,
    cache_creation_input_tokens: (response.usage as any).cache_creation_input_tokens ?? 0,
  }

  return { structured, usage, duration_ms }
}
