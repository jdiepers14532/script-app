import { Router } from 'express'
import { pool, query, queryOne } from '../db'
import { authMiddleware } from '../auth'
import * as fs from 'fs'
import * as path from 'path'
import multer from 'multer'
import { pdfToText, runTier1 } from '../lib/import/tier1-parser'
import { buildTextSample, parseTier2Response } from '../lib/import/tier2'
import { buildChunks, buildCostPreview, parseTier3ChunkResponse, deduplicateBlocks } from '../lib/import/tier3'
import { getProviderConfig } from './ki'

// Modellkosten (EUR pro 1M Tokens) — Subset der Liste in ki.ts
const COST_TABLE: Record<string, { in: number; out: number }> = {
  'mistral-large-latest':      { in: 1.84, out: 5.52 },
  'mistral-medium-latest':     { in: 0.25, out: 0.74 },
  'mistral-small-latest':      { in: 0.09, out: 0.28 },
  'open-mistral-7b':           { in: 0.23, out: 0.23 },
  'gpt-4o':                    { in: 2.30, out: 9.20 },
  'gpt-4o-mini':               { in: 0.14, out: 0.55 },
  'claude-opus-4-6':           { in: 13.80, out: 69.00 },
  'claude-sonnet-4-6':         { in: 2.76, out: 13.80 },
  'claude-haiku-4-5-20251001': { in: 0.74, out: 3.68 },
}

// Ruft das konfigurierte LLM auf (Mistral / OpenAI / Gemini / Custom) für Import-Zwecke
// Kein Ollama (zu langsam für Chunking), kein Claude-spezifisches API
async function callImportProvider(provider: string, model: string, userMsg: string, maxTokens: number): Promise<string> {
  const { apiKey, baseUrl } = await getProviderConfig(provider)
  if (!apiKey && provider !== 'ollama') throw new Error(`Kein API-Key für ${provider}`)

  const messages = [{ role: 'user' as const, content: userMsg }]

  if (provider === 'mistral') {
    const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.1 }),
    })
    if (!res.ok) throw new Error(`Mistral HTTP ${res.status}: ${await res.text()}`)
    const data = await res.json() as any
    return data.choices?.[0]?.message?.content || ''
  }

  if (provider === 'openai' || provider === 'custom') {
    const base = baseUrl || 'https://api.openai.com/v1'
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.1 }),
    })
    if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}: ${await res.text()}`)
    const data = await res.json() as any
    return data.choices?.[0]?.message?.content || ''
  }

  if (provider === 'gemini') {
    const contents = [{ role: 'user', parts: [{ text: userMsg }] }]
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents, generationConfig: { maxOutputTokens: maxTokens, temperature: 0.1 } }),
      }
    )
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${await res.text()}`)
    const data = await res.json() as any
    return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  }

  throw new Error(`Provider ${provider} nicht unterstützt für Import`)
}

const storage = multer.diskStorage({
  destination: path.join(process.cwd(), 'uploads', 'import-docs'),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
    cb(null, `${Date.now()}_${safe}`)
  },
})
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } })

const router = Router()
router.use(authMiddleware)

// POST /api/import-jobs/upload — PDF hochladen + Tier-1-Parse
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const { produktion_id } = req.body
    if (!produktion_id) return res.status(400).json({ error: 'produktion_id erforderlich' })
    if (!req.file) return res.status(400).json({ error: 'Keine Datei übermittelt' })

    const userId = (req as any).user?.user_id || null
    const job = await queryOne(
      `INSERT INTO import_jobs (produktion_id, status, source_file_name, source_file_path, user_id)
       VALUES ($1, 'running', $2, $3, $4) RETURNING *`,
      [produktion_id, req.file.originalname, req.file.path, userId]
    )

    try {
      const buffer = fs.readFileSync(req.file.path)
      const { text, numPages } = await pdfToText(buffer)
      const result = runTier1(text, numPages)
      const newStatus = result.success ? 'done' : 'detecting'
      const tierEreicht = result.success ? 1 : 0
      await query(
        `UPDATE import_jobs SET status=$1, tier_erreicht=$2, ergebnis_json=$3, extracted_text=$4, abgeschlossen_am=NOW() WHERE id=$5`,
        [newStatus, tierEreicht, JSON.stringify(result), text, job.id]
      )
      return res.json({ ...job, status: newStatus, tier_erreicht: tierEreicht, ergebnis_json: result })
    } catch (parseErr) {
      await query(
        `UPDATE import_jobs SET status='error', fehler=$1, abgeschlossen_am=NOW() WHERE id=$2`,
        [String(parseErr), job.id]
      )
      return res.json({ ...job, status: 'error', fehler: String(parseErr) })
    }
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/import-jobs?produktion_id=X
router.get('/', async (req, res) => {
  try {
    const { produktion_id } = req.query
    if (!produktion_id) return res.status(400).json({ error: 'produktion_id erforderlich' })
    const rows = await query(
      `SELECT id, produktion_id, status, tier_erreicht, provider, model, source_file_name,
              total_chunks, done_chunks, fehler, user_id, erstellt_am, abgeschlossen_am
       FROM import_jobs
       WHERE produktion_id = $1
       ORDER BY erstellt_am DESC
       LIMIT 50`,
      [produktion_id]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/import-jobs/:id (für Polling)
router.get('/:id', async (req, res) => {
  try {
    const row = await queryOne('SELECT * FROM import_jobs WHERE id = $1', [req.params.id])
    if (!row) return res.status(404).json({ error: 'Job nicht gefunden' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/import-jobs/:id — Job abbrechen + Datei löschen
router.delete('/:id', async (req, res) => {
  try {
    const row = await queryOne('SELECT * FROM import_jobs WHERE id = $1', [req.params.id])
    if (!row) return res.status(404).json({ error: 'Job nicht gefunden' })
    if (row.source_file_path) {
      try { fs.unlinkSync(row.source_file_path) } catch { /* bereits gelöscht */ }
    }
    await query('DELETE FROM import_jobs WHERE id = $1', [req.params.id])
    res.status(204).end()
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/import-jobs/:id/file — gespeichertes PDF herunterladen
router.get('/:id/file', async (req, res) => {
  try {
    const row = await queryOne(
      'SELECT source_file_name, source_file_path FROM import_jobs WHERE id = $1',
      [req.params.id]
    )
    if (!row) return res.status(404).json({ error: 'Job nicht gefunden' })
    if (!row.source_file_path || !fs.existsSync(row.source_file_path)) {
      return res.status(404).json({ error: 'Datei nicht gefunden' })
    }
    const fileName = row.source_file_name || 'import.pdf'
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
    fs.createReadStream(row.source_file_path).pipe(res)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── Hilfsfunktion: extrahierten Text laden (aus DB-Cache oder erneut parsen) ──
async function getExtractedText(job: any): Promise<string> {
  if (job.extracted_text) return job.extracted_text
  if (!job.source_file_path || !fs.existsSync(job.source_file_path)) {
    throw new Error('Quelldatei nicht mehr vorhanden.')
  }
  const buffer = fs.readFileSync(job.source_file_path)
  const { text } = await pdfToText(buffer)
  return text
}

// POST /api/import-jobs/:id/tier2 — KI-Strukturerkennung (ein Call)
router.post('/:id/tier2', async (req, res) => {
  try {
    const job = await queryOne('SELECT * FROM import_jobs WHERE id = $1', [req.params.id])
    if (!job) return res.status(404).json({ error: 'Job nicht gefunden' })
    if (job.status !== 'detecting') {
      return res.status(400).json({ error: `Tier-2 nur möglich wenn Status 'detecting', aktuell: ${job.status}` })
    }

    // KI-Setting laden
    const setting = await queryOne('SELECT * FROM ki_settings WHERE funktion = $1', ['import_detect'])
    if (!setting || !setting.enabled) {
      return res.status(400).json({ error: 'KI-Funktion import_detect nicht aktiviert' })
    }

    await query(`UPDATE import_jobs SET status='running' WHERE id=$1`, [job.id])

    try {
      const text = await getExtractedText(job)
      const sample = buildTextSample(text)
      const promptTemplate: string = setting.prompt || setting.default_prompt || ''
      const prompt = promptTemplate.replace('{{text_sample}}', sample)

      const raw = await callImportProvider(setting.provider, setting.model_name, prompt, 600)
      const result = parseTier2Response(raw)

      if (result.erkannt) {
        await query(
          `UPDATE import_jobs SET status='chunking', tier_erreicht=2,
           ergebnis_json = ergebnis_json || $1::jsonb,
           provider=$2, model=$3, abgeschlossen_am=NULL
           WHERE id=$4`,
          [JSON.stringify({ tier2_result: result }), setting.provider, setting.model_name, job.id]
        )
        const updated = await queryOne('SELECT id, status, tier_erreicht, provider, model, ergebnis_json FROM import_jobs WHERE id = $1', [job.id])
        return res.json(updated)
      } else {
        await query(
          `UPDATE import_jobs SET status='error',
           fehler=$1, ergebnis_json = ergebnis_json || $2::jsonb, abgeschlossen_am=NOW()
           WHERE id=$3`,
          [
            `Tier-2: ${result.notiz}`,
            JSON.stringify({ tier2_result: result }),
            job.id,
          ]
        )
        const updated = await queryOne('SELECT id, status, fehler, ergebnis_json FROM import_jobs WHERE id = $1', [job.id])
        return res.json(updated)
      }
    } catch (kiErr) {
      await query(
        `UPDATE import_jobs SET status='detecting', fehler=$1 WHERE id=$2`,
        [String(kiErr), job.id]
      )
      return res.status(500).json({ error: String(kiErr) })
    }
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/import-jobs/:id/cost-preview — Kostenschätzung für Tier-3
router.get('/:id/cost-preview', async (req, res) => {
  try {
    const job = await queryOne('SELECT * FROM import_jobs WHERE id = $1', [req.params.id])
    if (!job) return res.status(404).json({ error: 'Job nicht gefunden' })
    if (job.status !== 'chunking') {
      return res.status(400).json({ error: `Cost-Preview nur möglich wenn Status 'chunking'` })
    }

    const setting = await queryOne('SELECT * FROM ki_settings WHERE funktion = $1', ['import_extract'])
    if (!setting) return res.status(400).json({ error: 'KI-Funktion import_extract nicht konfiguriert' })

    const text = await getExtractedText(job)
    const costs = COST_TABLE[setting.model_name] ?? { in: 0, out: 0 }
    const promptLen = (setting.prompt || setting.default_prompt || '').length + 200

    const preview = buildCostPreview(
      text,
      setting.provider,
      setting.model_name,
      promptLen,
      costs.in,
      costs.out,
    )
    res.json(preview)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/import-jobs/:id/tier3 — Chunked KI-Extraktion starten (async im Hintergrund)
router.post('/:id/tier3', async (req, res) => {
  try {
    const job = await queryOne('SELECT * FROM import_jobs WHERE id = $1', [req.params.id])
    if (!job) return res.status(404).json({ error: 'Job nicht gefunden' })
    if (job.status !== 'chunking') {
      return res.status(400).json({ error: `Tier-3 nur möglich wenn Status 'chunking'` })
    }

    const setting = await queryOne('SELECT * FROM ki_settings WHERE funktion = $1', ['import_extract'])
    if (!setting || !setting.enabled) {
      return res.status(400).json({ error: 'KI-Funktion import_extract nicht aktiviert' })
    }

    // Text holen + Chunks vorbereiten
    const text = await getExtractedText(job)
    const chunks = buildChunks(text)

    await query(
      `UPDATE import_jobs SET status='running', total_chunks=$1, done_chunks=0 WHERE id=$2`,
      [chunks.length, job.id]
    )

    // Sofort antworten — Verarbeitung läuft im Hintergrund
    res.json({ id: job.id, status: 'running', total_chunks: chunks.length, done_chunks: 0 })

    // Hintergrundverarbeitung (kein await, kein return nach res.json)
    ;(async () => {
      const allBlocks: any[] = []
      const promptTemplate: string = setting.prompt || setting.default_prompt || ''
      let successChunks = 0

      for (let i = 0; i < chunks.length; i++) {
        try {
          const prompt = promptTemplate.replace('{{chunk}}', chunks[i].text)
          let raw = await callImportProvider(setting.provider, setting.model_name, prompt, 800)

          // Retry wenn kein JSON-Array gefunden
          if (!raw.includes('[')) {
            const retryPrompt = `${prompt}\n\nWICHTIG: Antworte AUSSCHLIESSLICH mit einem validen JSON-Array. Beispiel: [{"block_nummer":1,"charakter":"ANNA","strang":"ANNA - PAUL","text":"Prosatext"}]`
            raw = await callImportProvider(setting.provider, setting.model_name, retryPrompt, 800)
          }

          const chunkBlocks = parseTier3ChunkResponse(raw)
          allBlocks.push(...chunkBlocks)
          successChunks++
        } catch {
          // Chunk-Fehler nicht abbrechen — überspringen
        }

        await query(
          `UPDATE import_jobs SET done_chunks=$1 WHERE id=$2`,
          [i + 1, job.id]
        )
      }

      const dedupedBlocks = deduplicateBlocks(allBlocks)
      const uniqueBlockNums = [...new Set(dedupedBlocks.map(b => b.block_nummer))].sort((a, b) => a - b)
      const strangNames = [...new Set(dedupedBlocks.map(b => b.strang).filter(Boolean))]

      const finalResult = {
        success: dedupedBlocks.length >= 3,
        blocks: dedupedBlocks,
        unique_blocks: uniqueBlockNums,
        strang_names: strangNames,
        total_chars: text.length,
        num_pages: job.ergebnis_json?.num_pages ?? null,
        tier: 3,
        chunks_processed: successChunks,
        chunks_total: chunks.length,
      }

      await query(
        `UPDATE import_jobs SET status=$1, tier_erreicht=3,
         ergebnis_json = ergebnis_json || $2::jsonb,
         abgeschlossen_am=NOW(), done_chunks=$3
         WHERE id=$4`,
        [
          finalResult.success ? 'done' : 'error',
          JSON.stringify({ tier3_result: finalResult }),
          chunks.length,
          job.id,
        ]
      )
    })().catch(async (fatalErr) => {
      await query(
        `UPDATE import_jobs SET status='error', fehler=$1, abgeschlossen_am=NOW() WHERE id=$2`,
        [String(fatalErr), job.id]
      )
    })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── Hilfsfunktion: extrahierte Blöcke aus ergebnis_json lesen ─────────────────
function extractBlocks(ergebnisJson: any): Array<{ block_nummer: number; strang?: string; charakter?: string; text: string }> {
  if (!ergebnisJson) return []
  // Tier-3-Ergebnis hat Vorrang (vollständiger)
  const source = ergebnisJson.tier3_result ?? ergebnisJson
  return Array.isArray(source.blocks) ? source.blocks : []
}

const STRANG_COLORS = ['#007AFF', '#FF9500', '#AF52DE', '#00C853', '#FF3B30', '#FFCC00', '#32ADE6', '#FF2D55']

// GET /api/import-jobs/:id/commit-preview — Dry-Run: neue/vorhandene Stränge + Beat-Anzahl
router.get('/:id/commit-preview', async (req, res) => {
  try {
    const job = await queryOne('SELECT id, status, produktion_id, ergebnis_json, committed_at FROM import_jobs WHERE id = $1', [req.params.id])
    if (!job) return res.status(404).json({ error: 'Job nicht gefunden' })
    if (job.status !== 'done') return res.status(400).json({ error: 'Nur für abgeschlossene Jobs' })

    const blocks = extractBlocks(job.ergebnis_json)
    if (blocks.length === 0) return res.status(400).json({ error: 'Keine Blöcke in ergebnis_json' })

    // Einzigartige Strang-Namen
    const uniqueStrangNames = [...new Set(blocks.map(b => b.strang).filter(Boolean))] as string[]

    // Vorhandene Stränge in dieser Produktion
    const existingRows = await query(
      `SELECT id, name FROM straenge WHERE produktion_id = $1 AND LOWER(TRIM(name)) = ANY($2)`,
      [job.produktion_id, uniqueStrangNames.map(n => n.toLowerCase().trim())]
    )
    const existingMap = new Map<string, string>(existingRows.map((r: any) => [r.name.toLowerCase().trim(), r.id]))

    const neueStrangeNames = uniqueStrangNames.filter(n => !existingMap.has(n.toLowerCase().trim()))
    const vorhandeneStrange = uniqueStrangNames
      .filter(n => existingMap.has(n.toLowerCase().trim()))
      .map(n => ({ name: n, id: existingMap.get(n.toLowerCase().trim())! }))

    // Beat-Counts: neue vs. vorhandene
    let neueBeats = 0
    let aktualisierteBeats = 0
    for (const b of blocks) {
      if (!b.strang) continue
      const strangId = existingMap.get(b.strang.toLowerCase().trim())
      if (!strangId) {
        neueBeats++
        continue
      }
      const existing = await queryOne(
        `SELECT id FROM strang_beats WHERE strang_id = $1 AND block_nummer = $2 AND ebene = 'future' LIMIT 1`,
        [strangId, b.block_nummer]
      )
      existing ? aktualisierteBeats++ : neueBeats++
    }

    res.json({
      neue_straenge: neueStrangeNames,
      vorhandene_straenge: vorhandeneStrange,
      neue_beats: neueBeats,
      aktualisierte_beats: aktualisierteBeats,
      total_blocks: blocks.length,
      already_committed: !!job.committed_at,
    })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/import-jobs/:id/commit — Stränge + Future-Beats in DB schreiben
router.post('/:id/commit', async (req, res) => {
  try {
    const job = await queryOne('SELECT * FROM import_jobs WHERE id = $1', [req.params.id])
    if (!job) return res.status(404).json({ error: 'Job nicht gefunden' })
    if (job.status !== 'done') return res.status(400).json({ error: 'Nur für abgeschlossene Jobs' })
    if (job.committed_at) return res.status(409).json({ error: 'Job wurde bereits committed' })

    const blocks = extractBlocks(job.ergebnis_json)
    if (blocks.length === 0) return res.status(400).json({ error: 'Keine Blöcke in ergebnis_json' })

    const uniqueStrangNames = [...new Set(blocks.map(b => b.strang).filter(Boolean))] as string[]
    const userId = (req as any).user?.user_id || null

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // 1. Stränge anlegen oder finden
      const existingRows = await client.query(
        `SELECT id, name FROM straenge WHERE produktion_id = $1 AND LOWER(TRIM(name)) = ANY($2)`,
        [job.produktion_id, uniqueStrangNames.map(n => n.toLowerCase().trim())]
      )
      const strangIdMap = new Map<string, string>(
        existingRows.rows.map((r: any) => [r.name.toLowerCase().trim(), r.id])
      )

      // Aktuelle Strang-Anzahl für Farb-Zuweisung
      const countRow = await client.query(
        `SELECT COUNT(*) AS cnt FROM straenge WHERE produktion_id = $1`, [job.produktion_id]
      )
      let colorIdx = parseInt(countRow.rows[0].cnt, 10)

      for (const name of uniqueStrangNames) {
        const key = name.toLowerCase().trim()
        if (strangIdMap.has(key)) continue
        const sortRow = await client.query(
          `SELECT COALESCE(MAX(sort_order), 0) AS mx FROM straenge WHERE produktion_id = $1`, [job.produktion_id]
        )
        const color = STRANG_COLORS[colorIdx % STRANG_COLORS.length]
        colorIdx++
        const ins = await client.query(
          `INSERT INTO straenge (produktion_id, name, farbe, sort_order, erstellt_von)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [job.produktion_id, name, color, (sortRow.rows[0].mx ?? 0) + 1, userId]
        )
        strangIdMap.set(key, ins.rows[0].id)
      }

      // 2. Future-Beats schreiben (upsert per SELECT + INSERT/UPDATE)
      let createdBeats = 0
      let updatedBeats = 0
      for (const b of blocks) {
        if (!b.strang) continue
        const strangId = strangIdMap.get(b.strang.toLowerCase().trim())
        if (!strangId) continue

        const existing = await client.query(
          `SELECT id FROM strang_beats WHERE strang_id = $1 AND block_nummer = $2 AND ebene = 'future' LIMIT 1`,
          [strangId, b.block_nummer]
        )
        if (existing.rows.length > 0) {
          await client.query(
            `UPDATE strang_beats SET prosa_text = $1 WHERE id = $2`,
            [b.text || null, existing.rows[0].id]
          )
          updatedBeats++
        } else {
          await client.query(
            `INSERT INTO strang_beats (strang_id, ebene, block_nummer, prosa_text, sort_order)
             VALUES ($1, 'future', $2, $3, $2)`,
            [strangId, b.block_nummer, b.text || null]
          )
          createdBeats++
        }
      }

      await client.query('COMMIT')

      // 3. Job als committed markieren
      await query(
        `UPDATE import_jobs SET committed_at=NOW(), committed_strands=$1, committed_beats=$2 WHERE id=$3`,
        [uniqueStrangNames.length, createdBeats + updatedBeats, job.id]
      )

      res.json({
        committed_strands: uniqueStrangNames.length,
        neue_straenge: uniqueStrangNames.length - existingRows.rows.length,
        neue_beats: createdBeats,
        aktualisierte_beats: updatedBeats,
      })
    } catch (txErr) {
      await client.query('ROLLBACK')
      throw txErr
    } finally {
      client.release()
    }
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export { router as importJobsRouter }
