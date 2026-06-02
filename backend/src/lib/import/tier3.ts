// Tier-3: Chunked KI-Extraktion
// Zerlegt den Dokumenttext in Abschnitte und lässt KI jeden Abschnitt parsen

import type { Tier1Block } from './tier1-parser'

export const CHUNK_SIZE = 6000    // Zeichen pro Chunk
export const CHUNK_OVERLAP = 400  // Überlappung an Chunk-Grenzen

export interface Tier3Chunk {
  index: number
  text: string
}

/**
 * Teilt den Text in Chunks auf.
 * Schneidet bevorzugt an Zeilengrenzen (kein Wort mittendrin).
 */
export function buildChunks(text: string, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP): Tier3Chunk[] {
  const chunks: Tier3Chunk[] = []
  let pos = 0

  while (pos < text.length) {
    const end = Math.min(pos + chunkSize, text.length)
    // Bis zur nächsten Zeilengrenze aufweiten (max. 200 Zeichen)
    let cutEnd = end
    if (end < text.length) {
      const nextNewline = text.indexOf('\n', end)
      if (nextNewline !== -1 && nextNewline - end < 200) {
        cutEnd = nextNewline + 1
      }
    }
    chunks.push({ index: chunks.length, text: text.slice(pos, cutEnd) })
    pos = cutEnd - overlap  // Überlappung für Kontext-Kontinuität
    if (pos >= text.length) break
  }

  return chunks
}

/** Schätzt die Token-Anzahl grob (4 Zeichen ≈ 1 Token) */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Kostenschätzung für Tier-3.
 * MODEL_COSTS_EUR muss extern übergeben werden (aus ki.ts).
 */
export interface CostPreview {
  chunks: number
  estimated_tokens_in: number
  estimated_tokens_out: number
  estimated_cost_eur: number | null  // null wenn Provider-Kosten unbekannt
  provider: string
  model: string
}

export function buildCostPreview(
  text: string,
  provider: string,
  model: string,
  promptOverheadChars: number,
  costIn: number,  // EUR pro 1M Tokens
  costOut: number,
): CostPreview {
  const chunks = buildChunks(text)
  const tokensPerChunkIn = estimateTokens(chunks[0]?.text ?? '') + estimateTokens('X'.repeat(promptOverheadChars))
  const tokensOut = 400 // ca. 10 Blöcke × 40 Tokens Output pro Chunk
  const totalIn = tokensPerChunkIn * chunks.length
  const totalOut = tokensOut * chunks.length
  const costEur = (totalIn * costIn + totalOut * costOut) / 1_000_000

  return {
    chunks: chunks.length,
    estimated_tokens_in: totalIn,
    estimated_tokens_out: totalOut,
    estimated_cost_eur: costEur,
    provider,
    model,
  }
}

/** Parst die KI-Antwort eines Tier-3-Chunk-Calls */
export function parseTier3ChunkResponse(raw: string): Tier1Block[] {
  // JSON-Array aus der Antwort extrahieren
  const arrMatch = raw.match(/\[[\s\S]*\]/)
  if (!arrMatch) return []
  try {
    const arr = JSON.parse(arrMatch[0])
    if (!Array.isArray(arr)) return []
    return arr
      .filter((item: any) => typeof item === 'object' && item !== null && typeof item.block_nummer === 'number')
      .map((item: any) => ({
        block_nummer: Number(item.block_nummer),
        charakter: item.charakter ? String(item.charakter).trim() : undefined,
        strang: item.strang ? String(item.strang).trim() : undefined,
        text: item.text ? String(item.text).trim() : '',
      }))
  } catch {
    return []
  }
}

/** Dedupliziert Blöcke: entfernt Duplikate durch Chunk-Überlappungen */
export function deduplicateBlocks(blocks: Tier1Block[]): Tier1Block[] {
  const seen = new Set<string>()
  return blocks.filter(b => {
    // Schlüssel: block_nummer + strang + erste 50 Zeichen des Texts
    const key = `${b.block_nummer}|${b.strang ?? ''}|${b.text.slice(0, 50)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
