/**
 * Story-Consultant Runner — Methode 1 (Pur) + Methode 2 (Framework)
 *
 * Beide Methoden nutzen denselben Code-Pfad; der Unterschied liegt
 * im System-Prompt (wird im Prompt-Builder geladen).
 *
 * Modell: konfigurierbar über app_settings.analysis_model
 * API-Key: aus ki_providers WHERE provider = 'claude'
 */

import Anthropic from '@anthropic-ai/sdk'
import { getProviderApiKey } from '../../../routes/ki'
import { queryOne } from '../../../db'
import { buildPrompt, Produktion, Folge } from '../prompt-builder'
import { DocumentScene } from '../scene-renderer'

export interface TokenUsage {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

export interface StoryConsultantResult {
  markdown: string
  usage: TokenUsage
  duration_ms: number
}

// Preise in EUR-Cent pro Million Tokens (USD × 0.92 × 100)
// Stand Mai 2026, Opus 4.6
const CLAUDE_COSTS_EUR_CENT_PER_M: Record<string, {
  input: number; output: number; cache_write: number; cache_read: number
}> = {
  'claude-opus-4-6': {
    input:       Math.round(15    * 0.92 * 100),  // 1380
    output:      Math.round(75    * 0.92 * 100),  // 6900
    cache_write: Math.round(18.75 * 0.92 * 100),  // 1725
    cache_read:  Math.round(1.5   * 0.92 * 100),  //  138
  },
  'claude-sonnet-4-6': {
    input:       Math.round(3    * 0.92 * 100),
    output:      Math.round(15   * 0.92 * 100),
    cache_write: Math.round(3.75 * 0.92 * 100),
    cache_read:  Math.round(0.3  * 0.92 * 100),
  },
}

export function calcCostEurCent(usage: TokenUsage, model: string): number {
  const costs = CLAUDE_COSTS_EUR_CENT_PER_M[model]
  if (!costs) return 0
  return Math.round(
    (usage.input_tokens              * costs.input +
     usage.output_tokens             * costs.output +
     usage.cache_creation_input_tokens * costs.cache_write +
     usage.cache_read_input_tokens   * costs.cache_read) / 1_000_000
  )
}

export async function runStoryConsultant(opts: {
  method: 'story_consultant_pur' | 'story_consultant_framework'
  produktion: Produktion
  block_nummer: number
  dreh_von: string | null
  dreh_bis: string | null
  folgen: Folge[]
  szenen: DocumentScene[]
  roteRosenMeta?: Record<string, any> | null
}): Promise<StoryConsultantResult> {
  const apiKey = await getProviderApiKey('claude')
  if (!apiKey) throw new Error('Kein Claude-API-Key konfiguriert (Admin → KI-Provider)')

  const modelRow = await queryOne(
    `SELECT value FROM app_settings WHERE key = 'analysis_model'`,
    []
  )
  const model = (modelRow?.value as string | undefined) || 'claude-opus-4-6'

  const prompt = buildPrompt(opts)

  const client = new Anthropic({ apiKey, timeout: 600_000 })

  const startMs = Date.now()
  const response = await client.messages.create({
    model,
    max_tokens: 16000,
    system:   prompt.system   as unknown as Anthropic.TextBlockParam[],
    messages: prompt.messages as unknown as Anthropic.MessageParam[],
  })
  const duration_ms = Date.now() - startMs

  const firstContent = response.content[0]
  if (!firstContent || firstContent.type !== 'text') {
    throw new Error('Unerwarteter Response-Typ von Claude')
  }

  const usage: TokenUsage = {
    input_tokens:                response.usage.input_tokens,
    output_tokens:               response.usage.output_tokens,
    cache_read_input_tokens:     (response.usage as any).cache_read_input_tokens     ?? 0,
    cache_creation_input_tokens: (response.usage as any).cache_creation_input_tokens ?? 0,
  }

  return {
    markdown:    firstContent.text,
    usage,
    duration_ms,
  }
}
