import { Router } from 'express'
import multer from 'multer'
import fetch from 'node-fetch'
import mammoth from 'mammoth'
import pdfParse from 'pdf-parse'
import { query, queryOne } from '../db'
import { authMiddleware } from '../auth'
import { getProviderApiKey, recordUsage } from './ki'

export const konzeptImportRouter = Router()
konzeptImportRouter.use(authMiddleware)

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain',
    ].includes(file.mimetype)
    if (ok) cb(null, true)
    else cb(new Error('Nur PDF, DOCX oder TXT erlaubt'))
  },
})

// ── Text-Extraktion ──────────────────────────────────────────────────────────

async function extractText(
  buffer: Buffer,
  mimetype: string,
  apiKey: string | null,
): Promise<string> {
  // PDF → Mistral OCR preferred, fallback pdf-parse
  if (mimetype === 'application/pdf') {
    if (apiKey) {
      try {
        const b64 = buffer.toString('base64')
        const resp = await fetch('https://api.mistral.ai/v1/ocr', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'mistral-ocr-latest',
            document: { type: 'document_url', document_url: `data:application/pdf;base64,${b64}` },
          }),
        })
        if (resp.ok) {
          const data = await resp.json() as any
          const pages: any[] = data.pages || []
          return pages.map((p: any) => p.markdown || p.text || '').join('\n\n')
        }
      } catch { /* fall through to pdf-parse */ }
    }
    const parsed = await pdfParse(buffer)
    return parsed.text
  }

  // DOCX
  if (mimetype.includes('wordprocessingml') || mimetype === 'application/msword') {
    const { value } = await mammoth.extractRawText({ buffer })
    return value
  }

  // Plain text
  return buffer.toString('utf-8')
}

// ── KI-Extraktion ────────────────────────────────────────────────────────────

async function callMistral(apiKey: string, model: string, prompt: string, maxTokens = 8000, timeoutMs = 120000): Promise<string> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature: 0.1,
      }),
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`Mistral ${res.status}`)
    const data = await res.json() as any
    return (data.choices?.[0]?.message?.content || '').trim()
  } finally {
    clearTimeout(t)
  }
}

function parseJsonBlock(text: string): any | null {
  const m = text.match(/###JSON_START###([\s\S]*?)###JSON_END###/)
  if (!m) return null
  try { return JSON.parse(m[1].trim()) } catch { return null }
}

// ── Strang-Chunking ──────────────────────────────────────────────────────────
// Strategie:
//   1. Dokument hat klare H1-Strang-Sektionen (≤8)  → pro Strang ein KI-Call
//   2. Flaches Dokument (>8 H1s oder keine H1s)      → ein einziger Call mit Volldokument
//      (302k Zeichen ≈ 75k Tokens, Mistral Large hat 128k-Fenster)

const MAX_STRAND_SECTIONS = 8
const STRAND_CHUNK_MAX_CHARS = 60000
const MAX_CHARS_PER_CALL = 300000  // ~75k Tokens pro Call, sicher im 128k-Fenster (Mistral Large)

function splitIntoStrandSections(text: string): Array<{ strandName: string; raw: string }> {
  // Nur H1-Überschriften (# , nicht ##) — Strang-Gruppen-Ebene
  const pattern = /(?:^|\n)(#[ \t]+[^\n]+)(?:\r?\n|$)/gim
  const positions: Array<{ pos: number; strandName: string }> = []
  let m: RegExpExecArray | null
  while ((m = pattern.exec(text)) !== null) {
    positions.push({ pos: m.index, strandName: m[1].replace(/^#+\s*/, '').trim() })
  }
  if (positions.length === 0) return []
  const all = positions.map((p, i) => ({
    strandName: p.strandName,
    raw: text.slice(p.pos, i + 1 < positions.length ? positions[i + 1].pos : undefined).trim(),
  }))
  return all.filter(s => /Block[ \t]+\d{3,4}/i.test(s.raw))
}

async function extractItemsChunked(
  apiKey: string,
  model: string,
  fullText: string,
  buildPrompt: (chunkText: string) => string,
): Promise<{ items: any[]; totalTokIn: number; totalTokOut: number }> {
  const strandSections = splitIntoStrandSections(fullText)
  console.log(`[konzept-import] text=${fullText.length} Zeichen, strand_sektionen=${strandSections.length}`)
  let totalTokIn = 0
  let totalTokOut = 0

  // Flaches Dokument (keine Hierarchie oder zu viele Sektionen)
  // → Text in MAX_CHARS_PER_CALL-Blöcke aufteilen, je ein KI-Call, dann merge+dedup
  if (strandSections.length === 0 || strandSections.length > MAX_STRAND_SECTIONS) {
    const reason = strandSections.length === 0 ? 'keine H1-Sektionen' : `${strandSections.length} Sektionen (flache Struktur)`
    const textChunks: string[] = []
    for (let i = 0; i < fullText.length; i += MAX_CHARS_PER_CALL) {
      textChunks.push(fullText.slice(i, i + MAX_CHARS_PER_CALL))
    }
    console.log(`[konzept-import] Flat-Chunking (${reason}): ${textChunks.length} Chunk(s) à max ${MAX_CHARS_PER_CALL} Zeichen`)
    const allItems: any[] = []
    for (let ci = 0; ci < textChunks.length; ci++) {
      const prompt = buildPrompt(textChunks[ci])
      try {
        const raw = await callMistral(apiKey, model, prompt, 16000, 180000)
        totalTokIn += Math.round(prompt.length / 4)
        totalTokOut += Math.round(raw.length / 4)
        const result = parseJsonBlock(raw)
        const count = result?.items?.length ?? 0
        console.log(`[konzept-import] Flat-Chunk ${ci + 1}/${textChunks.length}: ${count} items`)
        if (result?.items) allItems.push(...result.items)
      } catch (err) {
        console.warn(`[konzept-import] Flat-Chunk ${ci + 1}/${textChunks.length} fehlgeschlagen:`, err)
      }
    }
    // Deduplizieren: gleicher Strangname + Blocknummer → erster Treffer gewinnt
    const seen = new Set<string>()
    const items = allItems.filter(it => {
      const key = `${String(it.strang_name ?? '').toLowerCase().trim()}__${it.block_nummer}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    console.log(`[konzept-import] Flat-Chunking gesamt: ${items.length} unique items`)
    return { items, totalTokIn, totalTokOut }
  }

  // Hierarchisches Dokument → pro Strang-Sektion ein KI-Call
  console.log(`[konzept-import] ${strandSections.length} Strang-Sektionen (hierarchisch)`)
  const allItems: any[] = []
  for (const section of strandSections) {
    const chunkText = section.raw.length > STRAND_CHUNK_MAX_CHARS
      ? section.raw.slice(0, STRAND_CHUNK_MAX_CHARS)
      : section.raw
    const prompt = buildPrompt(chunkText)
    try {
      const raw = await callMistral(apiKey, model, prompt, 16000, 90000)
      totalTokIn += Math.round(prompt.length / 4)
      totalTokOut += Math.round(raw.length / 4)
      const result = parseJsonBlock(raw)
      const count = result?.items?.length ?? 0
      console.log(`[konzept-import] Strang "${section.strandName}": ${count} items`)
      if (result?.items) allItems.push(...result.items)
    } catch (err) {
      console.warn(`[konzept-import] Strang "${section.strandName}" fehlgeschlagen:`, err)
    }
  }

  // Deduplizieren: gleicher Strangname + Blocknummer → erster Treffer gewinnt
  const seen = new Set<string>()
  const items = allItems.filter(it => {
    const key = `${String(it.strang_name ?? '').toLowerCase().trim()}__${it.block_nummer}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return { items, totalTokIn, totalTokOut }
}

async function getMistralSettings() {
  const s = await queryOne(
    `SELECT * FROM ki_settings WHERE funktion = 'beat_kurztext'`
  )
  const apiKey = await getProviderApiKey('mistral')
  return { apiKey, model: s?.model_mistral || 'mistral-large-latest' }
}

// ── Bestehende Stränge für Match-Erkennung ──────────────────────────────────

async function getBestehendeStrangeText(produktionId: string): Promise<string> {
  const rows = await query(
    `SELECT name, kurzinhalt FROM straenge
     WHERE produktion_id = $1 AND status = 'aktiv'
     ORDER BY sort_order, name`,
    [produktionId]
  )
  if (rows.length === 0) return 'Keine bestehenden Stränge vorhanden.'
  return rows.map((r: any) => `- ${r.name}${r.kurzinhalt ? ': ' + r.kurzinhalt.slice(0, 80) : ''}`).join('\n')
}

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/konzept-import/preview
// Form: file + quelltyp (A|B|C) + produktion_id
// ══════════════════════════════════════════════════════════════════════════════
konzeptImportRouter.post('/preview', upload.single('file'), async (req, res) => {
  const { quelltyp, produktion_id } = req.body as { quelltyp?: string; produktion_id?: string }
  if (!req.file) return res.status(400).json({ error: 'Keine Datei' })
  if (!quelltyp || !['A', 'B', 'C'].includes(quelltyp)) {
    return res.status(400).json({ error: 'quelltyp A, B oder C required' })
  }
  if (!produktion_id) return res.status(400).json({ error: 'produktion_id required' })

  try {
    const { apiKey, model } = await getMistralSettings()
    if (!apiKey) return res.status(503).json({ error: 'KI-Provider nicht konfiguriert (Mistral)' })

    const text = await extractText(req.file.buffer, req.file.mimetype, apiKey)
    const textPreview = text.slice(0, 200)

    let prompt = ''
    let kiResult: any = null

    if (quelltyp === 'A') {
      // Konzept: Stränge + Figuren extrahieren
      const bestehende = await getBestehendeStrangeText(produktion_id)
      prompt = `Du bist ein Story-Analyst für eine deutsche TV-Soap. Extrahiere aus dem folgenden Konzeptdokument alle Erzählstränge und Figuren.

Bestehende Stränge in der Datenbank (für Zuordnung nutzen):
${bestehende}

Dokument:
${text.slice(0, 30000)}

Antworte AUSSCHLIESSLICH in diesem Format:
###JSON_START###
{
  "straenge": [
    {
      "name": "Strangname",
      "kurzinhalt": "Kurze Beschreibung des Strangs (max 120 Zeichen)",
      "typ": "soap",
      "bestehender_strang_name": "Name des bestehenden Strangs falls Fortsetzung, sonst null"
    }
  ],
  "charaktere": [
    { "name": "Figurenname" }
  ]
}
###JSON_END###`

      const raw = await callMistral(apiKey, model, prompt)
      kiResult = parseJsonBlock(raw)

      const tokIn = Math.round(prompt.length / 4)
      const tokOut = Math.round(raw.length / 4)
      await recordUsage('mistral', model, tokIn, tokOut)
      await query(
        `INSERT INTO ki_audit_log (funktion, input_summary, output_summary, item_count, provider, model, tokens_in, tokens_out, user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        ['konzept_import_a', prompt.slice(0, 200), raw.slice(0, 200),
          kiResult ? (kiResult.straenge || []).length : 0,
          'mistral', model, tokIn, tokOut, (req as any).user?.user_id ?? null]
      ).catch(() => {})

      if (!kiResult) return res.status(422).json({ error: 'KI hat kein gültiges JSON geliefert' })

      // Match-Kandidaten aus bestehenden Strängen anreichern
      const bestehendeRows = await query(
        `SELECT id, name FROM straenge WHERE produktion_id = $1`,
        [produktion_id]
      )
      const straengeWithMatch = (kiResult.straenge || []).map((s: any) => {
        const match = bestehendeRows.find((r: any) =>
          r.name.toLowerCase() === (s.bestehender_strang_name || '').toLowerCase()
        )
        return { ...s, match_strang_id: match?.id ?? null }
      })

      return res.json({
        quelltyp: 'A',
        straenge: straengeWithMatch,
        charaktere: kiResult.charaktere || [],
        provider: 'mistral',
        model,
        text_preview: textPreview,
      })
    }

    if (quelltyp === 'B') {
      // Future-Prosa: {strang_name, block_nummer, prosa_text} — chunked by block
      const buildBPrompt = (chunk: string) =>
        `Du bist ein Story-Analyst für eine deutsche TV-Soap. Extrahiere aus diesem Future-Prosa-Dokument ALLE Strangentwicklungen nach Blocknummer. Erfasse lückenlos jeden Block und jeden Strang.

Dokument:
${chunk}

Antworte AUSSCHLIESSLICH in diesem Format:
###JSON_START###
{
  "items": [
    {
      "strang_name": "Name des Story-Strangs",
      "block_nummer": 845,
      "prosa_text": "Der Prosatext für diesen Block..."
    }
  ]
}
###JSON_END###`

      const { items: rawItems, totalTokIn, totalTokOut } =
        await extractItemsChunked(apiKey, model, text, buildBPrompt)

      await recordUsage('mistral', model, totalTokIn, totalTokOut)
      await query(
        `INSERT INTO ki_audit_log (funktion, input_summary, output_summary, item_count, provider, model, tokens_in, tokens_out, user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        ['konzept_import_b', text.slice(0, 200), `${rawItems.length} items`,
          rawItems.length, 'mistral', model, totalTokIn, totalTokOut,
          (req as any).user?.user_id ?? null]
      ).catch(() => {})

      if (rawItems.length === 0) return res.status(422).json({ error: 'KI hat keine Einträge extrahiert' })

      const bestehendeRows = await query(
        `SELECT id, name FROM straenge WHERE produktion_id = $1`,
        [produktion_id]
      )
      const itemsWithMatch = rawItems.map((it: any) => {
        const match = bestehendeRows.find((r: any) =>
          r.name.toLowerCase() === (it.strang_name || '').toLowerCase()
        )
        return { ...it, strang_id: match?.id ?? null }
      })

      return res.json({
        quelltyp: 'B',
        items: itemsWithMatch,
        provider: 'mistral',
        model,
        text_preview: textPreview,
      })
    }

    if (quelltyp === 'C') {
      // Future-Raster: {strang_name, block_nummer, beat_text} — chunked by block
      const buildCPrompt = (chunk: string) =>
        `Du bist ein Story-Analyst für eine deutsche TV-Soap. Extrahiere aus diesem Future-Raster ALLE Beat-Kurztext-Einträge nach Strang und Blocknummer. Erfasse lückenlos jeden Eintrag.

Dokument:
${chunk}

Antworte AUSSCHLIESSLICH in diesem Format:
###JSON_START###
{
  "items": [
    {
      "strang_name": "Name des Story-Strangs",
      "block_nummer": 845,
      "beat_text": "Kurztext des Beats (max 120 Zeichen)"
    }
  ]
}
###JSON_END###`

      const { items: rawItems, totalTokIn, totalTokOut } =
        await extractItemsChunked(apiKey, model, text, buildCPrompt)

      await recordUsage('mistral', model, totalTokIn, totalTokOut)
      await query(
        `INSERT INTO ki_audit_log (funktion, input_summary, output_summary, item_count, provider, model, tokens_in, tokens_out, user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        ['konzept_import_c', text.slice(0, 200), `${rawItems.length} items`,
          rawItems.length, 'mistral', model, totalTokIn, totalTokOut,
          (req as any).user?.user_id ?? null]
      ).catch(() => {})

      if (rawItems.length === 0) return res.status(422).json({ error: 'KI hat keine Einträge extrahiert' })

      const bestehendeRows = await query(
        `SELECT id, name FROM straenge WHERE produktion_id = $1`,
        [produktion_id]
      )
      const itemsWithMatch = rawItems.map((it: any) => {
        const match = bestehendeRows.find((r: any) =>
          r.name.toLowerCase() === (it.strang_name || '').toLowerCase()
        )
        return { ...it, strang_id: match?.id ?? null }
      })

      return res.json({
        quelltyp: 'C',
        items: itemsWithMatch,
        provider: 'mistral',
        model,
        text_preview: textPreview,
      })
    }

    res.status(400).json({ error: 'Unbekannter quelltyp' })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/konzept-import/commit
// Body: { quelltyp, produktion_id, data: [...], auto_version?: boolean }
//
// A: data = [{ name, kurzinhalt?, typ?, match_strang_id? | null, charaktere?: [{name}] }]
// B: data = [{ strang_id, strang_name, block_nummer, prosa_text }] (strang_id null → skip)
// C: data = [{ strang_id, strang_name, block_nummer, beat_text }]  (strang_id null → skip)
// ══════════════════════════════════════════════════════════════════════════════
konzeptImportRouter.post('/commit', async (req, res) => {
  const { quelltyp, produktion_id, data, auto_version } = req.body
  if (!quelltyp || !['A', 'B', 'C'].includes(quelltyp)) {
    return res.status(400).json({ error: 'quelltyp required' })
  }
  if (!produktion_id) return res.status(400).json({ error: 'produktion_id required' })
  if (!Array.isArray(data)) return res.status(400).json({ error: 'data muss Array sein' })

  const userId = (req as any).user?.user_id ?? null

  try {
    const result: { created: number; updated: number; skipped: number } = {
      created: 0, updated: 0, skipped: 0,
    }

    if (quelltyp === 'A') {
      // A: Stränge anlegen oder updaten + Figuren anlegen
      for (const item of data) {
        if (!item.name) { result.skipped++; continue }

        if (item.match_strang_id) {
          // Bestehenden Strang updaten
          await query(
            `UPDATE straenge
             SET kurzinhalt = COALESCE($1, kurzinhalt)
             WHERE id = $2 AND produktion_id = $3`,
            [item.kurzinhalt ?? null, item.match_strang_id, produktion_id]
          )
          result.updated++
        } else {
          // Neuen Strang anlegen
          const maxOrder = await queryOne(
            `SELECT COALESCE(MAX(sort_order), 0) AS mo FROM straenge WHERE produktion_id = $1`,
            [produktion_id]
          )
          await query(
            `INSERT INTO straenge (produktion_id, name, kurzinhalt, typ, sort_order, status)
             VALUES ($1,$2,$3,$4,$5,'aktiv')`,
            [produktion_id, item.name.trim(), item.kurzinhalt ?? null,
             item.typ || 'soap', (maxOrder?.mo ?? 0) + 1]
          )
          result.created++
        }
      }

      // Figuren anlegen (nur wenn nicht vorhanden)
      const alle = data.flatMap((d: any) => d.charaktere || [])
      for (const ch of alle) {
        if (!ch.name) continue
        await query(
          `INSERT INTO characters (name) VALUES ($1)
           ON CONFLICT DO NOTHING`,
          [ch.name.trim()]
        )
      }

    } else if (quelltyp === 'B') {
      // B: prosa_text auf bestehende Beats schreiben, fehlende anlegen
      for (const item of data) {
        if (!item.strang_id) { result.skipped++; continue }
        if (!item.block_nummer || !item.prosa_text) { result.skipped++; continue }

        const existing = await queryOne(
          `SELECT id FROM strang_beats
           WHERE strang_id = $1 AND block_nummer = $2 AND ebene = 'future'`,
          [item.strang_id, item.block_nummer]
        )
        if (existing) {
          await query(
            `UPDATE strang_beats SET prosa_text = $1 WHERE id = $2`,
            [item.prosa_text.trim(), existing.id]
          )
          result.updated++
        } else {
          const maxSort = await queryOne(
            `SELECT COALESCE(MAX(sort_order), 0) AS mo FROM strang_beats WHERE strang_id = $1`,
            [item.strang_id]
          )
          await query(
            `INSERT INTO strang_beats
               (strang_id, ebene, block_nummer, prosa_text, sort_order)
             VALUES ($1,'future',$2,$3,$4)`,
            [item.strang_id, item.block_nummer, item.prosa_text.trim(),
             (maxSort?.mo ?? 0) + 1]
          )
          result.created++
        }
      }

    } else if (quelltyp === 'C') {
      // C: beat_text auf bestehende Beats schreiben, fehlende anlegen
      for (const item of data) {
        if (!item.strang_id) { result.skipped++; continue }
        if (!item.block_nummer || !item.beat_text) { result.skipped++; continue }

        const existing = await queryOne(
          `SELECT id FROM strang_beats
           WHERE strang_id = $1 AND block_nummer = $2 AND ebene = 'future'`,
          [item.strang_id, item.block_nummer]
        )
        if (existing) {
          await query(
            `UPDATE strang_beats SET beat_text = $1 WHERE id = $2`,
            [item.beat_text.slice(0, 200).trim(), existing.id]
          )
          result.updated++
        } else {
          const maxSort = await queryOne(
            `SELECT COALESCE(MAX(sort_order), 0) AS mo FROM strang_beats WHERE strang_id = $1`,
            [item.strang_id]
          )
          await query(
            `INSERT INTO strang_beats
               (strang_id, ebene, block_nummer, beat_text, sort_order)
             VALUES ($1,'future',$2,$3,$4)`,
            [item.strang_id, item.block_nummer, item.beat_text.slice(0, 200).trim(),
             (maxSort?.mo ?? 0) + 1]
          )
          result.created++
        }
      }
    }

    // Auto-Version anlegen
    let version_id: string | null = null
    if (auto_version !== false) {
      const straenge = await query(
        `SELECT id, name, farbe, sort_order, status, typ, kurzinhalt
         FROM straenge WHERE produktion_id = $1 ORDER BY sort_order, name`,
        [produktion_id]
      )
      const snapshot_json = {
        import_quelltyp: quelltyp,
        straenge_count: straenge.length,
        straenge,
      }
      const labelMap: Record<string, string> = {
        A: 'Konzept-Import', B: 'Future-Prosa-Import', C: 'Future-Raster-Import',
      }
      const vRow = await queryOne(
        `INSERT INTO konzept_versionen
           (produktion_id, label, snapshot_json, erstellt_von)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [produktion_id, `${labelMap[quelltyp]} (automatisch)`,
         JSON.stringify(snapshot_json), userId]
      )
      version_id = vRow?.id ?? null
    }

    res.json({ ...result, version_id })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})
