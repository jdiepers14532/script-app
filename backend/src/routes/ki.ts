import { Router } from 'express'
import { query, queryOne } from '../db'
import { authMiddleware, requireRole } from '../auth'

const router = Router()

// ── Shared helpers (exported for use by other routes) ─────────────────────────

// Cost per 1M tokens in EUR (approx USD * 0.92)
const MODEL_COSTS_EUR: Record<string, { in: number; out: number }> = {
  'mistral-large-latest':      { in: 1.84, out: 5.52 },
  'mistral-medium-latest':     { in: 0.25, out: 0.74 },
  'mistral-small-latest':      { in: 0.09, out: 0.28 },
  'open-mistral-7b':           { in: 0.23, out: 0.23 },
  'open-mixtral-8x7b':         { in: 0.65, out: 0.65 },
  'mistral-ocr-latest':        { in: 0.00, out: 0.00 }, // page-based pricing
  'gpt-4o':                    { in: 2.30, out: 9.20 },
  'gpt-4o-mini':               { in: 0.14, out: 0.55 },
  'gpt-4-turbo':               { in: 9.20, out: 27.60 },
  'gpt-3.5-turbo':             { in: 0.46, out: 1.38 },
  'claude-opus-4-6':           { in: 13.80, out: 69.00 },
  'claude-sonnet-4-6':         { in: 2.76, out: 13.80 },
  'claude-haiku-4-5-20251001': { in: 0.74, out: 3.68 },
}

/** Returns the active API key for a provider, or null if not configured/active */
export async function getProviderApiKey(provider: string): Promise<string | null> {
  const row = await queryOne(
    `SELECT api_key, is_active FROM ki_providers WHERE provider = $1`,
    [provider]
  )
  if (!row || !row.is_active || !row.api_key) return null
  return row.api_key
}

/** Records token usage + cost for a provider. Fire-and-forget safe (swallows errors). */
export async function recordUsage(
  provider: string,
  model: string,
  tokensIn: number,
  tokensOut: number
): Promise<void> {
  try {
    const rates = MODEL_COSTS_EUR[model] ?? { in: 0, out: 0 }
    const costEur = (tokensIn * rates.in + tokensOut * rates.out) / 1_000_000
    await query(
      `UPDATE ki_providers SET
         tokens_in  = tokens_in  + $1,
         tokens_out = tokens_out + $2,
         cost_eur   = cost_eur   + $3,
         updated_at = NOW()
       WHERE provider = $4`,
      [tokensIn, tokensOut, costEur, provider]
    )
  } catch {
    // Non-critical — never break inference
  }
}

// ── Admin: Provider-Register ──────────────────────────────────────────────────

export const kiProviderRouter = Router()
kiProviderRouter.use(authMiddleware)
kiProviderRouter.use(requireRole('superadmin', 'herstellungsleitung'))

// GET /api/admin/ki-providers
kiProviderRouter.get('/', async (_req, res) => {
  try {
    const rows = await query('SELECT * FROM ki_providers ORDER BY provider')
    const safe = rows.map((r: any) => ({ ...r, api_key: r.api_key ? '***' : null }))
    res.json(safe)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/admin/ki-providers/:provider
kiProviderRouter.put('/:provider', async (req, res) => {
  try {
    const { api_key, is_active, reset_costs } = req.body
    const { provider } = req.params

    // Validate provider exists
    const exists = await queryOne('SELECT provider FROM ki_providers WHERE provider = $1', [provider])
    if (!exists) return res.status(404).json({ error: 'Provider nicht gefunden' })

    let sql = `UPDATE ki_providers SET updated_at = NOW()`
    const params: any[] = []
    let idx = 1

    if (api_key !== undefined && api_key !== '') {
      sql += `, api_key = $${idx++}`; params.push(api_key)
    }
    if (is_active !== undefined) {
      sql += `, is_active = $${idx++}`; params.push(is_active)
    }
    if (reset_costs === true) {
      sql += `, tokens_in = 0, tokens_out = 0, cost_eur = 0`
    }

    sql += ` WHERE provider = $${idx} RETURNING *`
    params.push(provider)

    const row = await queryOne(sql, params)
    res.json({ ...row, api_key: row.api_key ? '***' : null })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── Admin: KI-Funktionen ──────────────────────────────────────────────────────

export const kiAdminRouter = Router()
kiAdminRouter.use(authMiddleware)
kiAdminRouter.use(requireRole('superadmin', 'herstellungsleitung'))

// GET /api/admin/ki-settings
kiAdminRouter.get('/', async (_req, res) => {
  try {
    const rows = await query('SELECT id, funktion, provider, model_name, enabled FROM ki_settings ORDER BY funktion')
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/admin/ki-settings/:funktion  — provider, model_name, enabled only (no api_key, no dsgvo_level)
kiAdminRouter.put('/:funktion', async (req, res) => {
  try {
    const { provider, model_name, enabled } = req.body
    const row = await queryOne(
      `UPDATE ki_settings SET
        provider   = COALESCE($1, provider),
        model_name = COALESCE($2, model_name),
        enabled    = COALESCE($3, enabled),
        updated_at = NOW()
       WHERE funktion = $4 RETURNING id, funktion, provider, model_name, enabled`,
      [provider ?? null, model_name ?? null, enabled ?? null, req.params.funktion]
    )
    if (!row) return res.status(404).json({ error: 'KI-Funktion nicht gefunden' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── KI inference routes ───────────────────────────────────────────────────────

router.use(authMiddleware)

async function callOllama(model: string, prompt: string): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)
  try {
    const res = await fetch('http://127.0.0.1:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false }),
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`)
    const data = await res.json() as any
    return data.response || ''
  } finally {
    clearTimeout(timeout)
  }
}

async function getKiSetting(funktion: string): Promise<any> {
  return await queryOne('SELECT * FROM ki_settings WHERE funktion = $1', [funktion])
}

async function notifyKiTrainer(app: string, task: string, input: string, label: string, source_id?: string) {
  const secret = process.env.KI_TRAINER_SECRET
  if (!secret) return
  try {
    await fetch('http://127.0.0.1:3013/api/training-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-KI-Trainer-Secret': secret },
      body: JSON.stringify({ app: 'script', task, input, label, is_correction: true, source_id }),
    })
  } catch {
    // Fire-and-forget
  }
}

// POST /api/ki/scene-summary
router.post('/scene-summary', async (req, res) => {
  try {
    const { scene_id } = req.body
    if (!scene_id) return res.status(400).json({ error: 'scene_id erforderlich' })

    const setting = await getKiSetting('scene_summary')
    if (!setting?.enabled) return res.json({ summary: 'KI-Funktion nicht aktiviert', disabled: true })
    if (setting.provider !== 'ollama') return res.json({ summary: 'Nur Ollama wird unterstützt', disabled: true })

    const szene = await queryOne('SELECT * FROM szenen WHERE id = $1', [scene_id])
    if (!szene) return res.status(404).json({ error: 'Szene nicht gefunden' })

    const contentText = Array.isArray(szene.content)
      ? szene.content.map((b: any) => b.text).join(' ')
      : ''

    const prompt = `Fasse folgende Filmszene in 2-3 Sätzen zusammen. Ort: ${szene.ort_name || 'Unbekannt'}. Inhalt: ${contentText}`
    try {
      const summary = await callOllama(setting.model_name, prompt)
      // Track usage (Ollama: cost = 0, approximate token count)
      const approxTokens = Math.ceil(prompt.length / 4)
      await recordUsage('ollama', setting.model_name, approxTokens, Math.ceil(summary.length / 4))
      res.json({ summary: summary.trim(), scene_id, provider: 'ollama' })
    } catch {
      const basicSummary = contentText ? `Szene in ${szene.ort_name || 'Unbekannt'}: ${contentText.substring(0, 100)}...` : 'Keine Inhalte vorhanden'
      res.json({ summary: basicSummary, scene_id, provider: 'fallback' })
    }
  } catch (err: any) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/ki/entity-detect
router.post('/entity-detect', async (req, res) => {
  try {
    const { text } = req.body
    if (!text) return res.status(400).json({ error: 'text erforderlich' })

    const setting = await getKiSetting('entity_detect')
    if (!setting?.enabled || setting.provider !== 'ollama') {
      return res.json({ entities: extractEntitiesRegex(text), provider: 'regex-fallback' })
    }

    const prompt = `Extrahiere alle Personen (Charaktere), Orte und Props aus folgendem Drehbuchtext. Antworte nur mit JSON-Array: [{"type":"charakter|location|prop","name":"..."}]. Text: ${text}`
    let entities: any[] = []
    try {
      const response = await callOllama(setting.model_name, prompt)
      const jsonMatch = response.match(/\[.*\]/s)
      if (jsonMatch) entities = JSON.parse(jsonMatch[0])
      else entities = extractEntitiesRegex(text)
      await recordUsage('ollama', setting.model_name, Math.ceil(prompt.length / 4), Math.ceil(response.length / 4))
    } catch {
      entities = extractEntitiesRegex(text)
    }

    res.json({ entities, provider: 'ollama' })
  } catch (err: any) {
    res.json({ entities: extractEntitiesRegex(req.body?.text || ''), provider: 'regex-fallback' })
  }
})

function extractEntitiesRegex(text: string): any[] {
  const entities: any[] = []
  const charRegex = /\b([A-ZÄÖÜ]{2,}(?:\s+[A-ZÄÖÜ]{2,})*)\b/g
  let match
  const seen = new Set<string>()
  while ((match = charRegex.exec(text)) !== null) {
    const name = match[1].trim()
    if (!seen.has(name)) { seen.add(name); entities.push({ type: 'charakter', name }) }
  }
  return entities
}

// POST /api/ki/style-check
router.post('/style-check', async (req, res) => {
  try {
    const { stage_id } = req.body
    if (!stage_id) return res.status(400).json({ error: 'stage_id erforderlich' })
    const setting = await getKiSetting('style_check')
    if (!setting?.enabled) return res.json({ issues: [], message: 'KI-Funktion nicht aktiviert' })
    const apiKey = await getProviderApiKey(setting.provider)
    if (!apiKey) return res.json({ issues: [], message: `Kein API-Key für ${setting.provider} konfiguriert` })
    res.json({ issues: [], message: 'Style-Check noch nicht implementiert' })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/ki/synopsis
router.post('/synopsis', async (req, res) => {
  try {
    const { episode_id } = req.body
    if (!episode_id) return res.status(400).json({ error: 'episode_id erforderlich' })
    const setting = await getKiSetting('synopsis')
    if (!setting?.enabled) return res.json({ synopsis: 'KI-Funktion nicht aktiviert' })
    const apiKey = await getProviderApiKey(setting.provider)
    if (!apiKey) return res.json({ synopsis: `Kein API-Key für ${setting.provider} konfiguriert` })
    res.json({ synopsis: 'Synopse-Generierung noch nicht implementiert' })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default router
