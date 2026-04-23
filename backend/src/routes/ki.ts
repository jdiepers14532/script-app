import { Router } from 'express'
import { query, queryOne } from '../db'
import { authMiddleware, requireRole } from '../auth'

const router = Router()

// Admin routes for KI settings
export const kiAdminRouter = Router()
kiAdminRouter.use(authMiddleware)
kiAdminRouter.use(requireRole('superadmin', 'herstellungsleitung'))

// GET /api/admin/ki-settings
kiAdminRouter.get('/', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM ki_settings ORDER BY funktion')
    // Don't expose api_key values
    const safe = rows.map((r: any) => ({ ...r, api_key: r.api_key ? '***' : null }))
    res.json(safe)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/admin/ki-settings/:funktion
kiAdminRouter.put('/:funktion', async (req, res) => {
  try {
    const { provider, api_key, model_name, enabled, dsgvo_level } = req.body
    const row = await queryOne(
      `UPDATE ki_settings SET
        provider = COALESCE($1, provider),
        api_key = COALESCE($2, api_key),
        model_name = COALESCE($3, model_name),
        enabled = COALESCE($4, enabled),
        dsgvo_level = COALESCE($5, dsgvo_level),
        updated_at = NOW()
       WHERE funktion = $6 RETURNING *`,
      [provider, api_key, model_name, enabled, dsgvo_level, req.params.funktion]
    )
    if (!row) return res.status(404).json({ error: 'KI-Funktion nicht gefunden' })
    res.json({ ...row, api_key: row.api_key ? '***' : null })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// KI inference routes
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
  } catch (e) {
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
    if (setting.provider !== 'ollama') return res.json({ summary: 'Nur Ollama wird in Tests unterstützt', disabled: true })

    const szene = await queryOne('SELECT * FROM szenen WHERE id = $1', [scene_id])
    if (!szene) return res.status(404).json({ error: 'Szene nicht gefunden' })

    const contentText = Array.isArray(szene.content)
      ? szene.content.map((b: any) => b.text).join(' ')
      : ''

    const prompt = `Fasse folgende Filmszene in 2-3 Sätzen zusammen. Ort: ${szene.ort_name || 'Unbekannt'}. Inhalt: ${contentText}`
    const summary = await callOllama(setting.model_name, prompt)

    res.json({ summary: summary.trim(), scene_id, provider: 'ollama' })
  } catch (err: any) {
    if (err.name === 'AbortError') return res.status(503).json({ error: 'Ollama nicht verfügbar' })
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/ki/entity-detect
router.post('/entity-detect', async (req, res) => {
  try {
    const { text } = req.body
    if (!text) return res.status(400).json({ error: 'text erforderlich' })

    const setting = await getKiSetting('entity_detect')
    if (!setting?.enabled) {
      // Fallback: simple regex-based entity detection
      const entities = extractEntitiesRegex(text)
      return res.json({ entities, provider: 'regex-fallback' })
    }
    if (setting.provider !== 'ollama') {
      const entities = extractEntitiesRegex(text)
      return res.json({ entities, provider: 'regex-fallback' })
    }

    const prompt = `Extrahiere alle Personen (Charaktere), Orte und Props aus folgendem Drehbuchtext. Antworte nur mit JSON-Array: [{"type":"charakter|location|prop","name":"..."}]. Text: ${text}`
    const response = await callOllama(setting.model_name, prompt)

    let entities: any[] = []
    try {
      const jsonMatch = response.match(/\[.*\]/s)
      if (jsonMatch) entities = JSON.parse(jsonMatch[0])
    } catch {
      entities = extractEntitiesRegex(text)
    }

    res.json({ entities, provider: 'ollama' })
  } catch (err: any) {
    if (err.name === 'AbortError') {
      const entities = extractEntitiesRegex(req.body.text || '')
      return res.json({ entities, provider: 'regex-fallback' })
    }
    res.status(500).json({ error: String(err) })
  }
})

function extractEntitiesRegex(text: string): any[] {
  const entities: any[] = []
  // Characters: ALL CAPS words
  const charRegex = /\b([A-ZÄÖÜ]{2,}(?:\s+[A-ZÄÖÜ]{2,})*)\b/g
  let match
  const seen = new Set<string>()
  while ((match = charRegex.exec(text)) !== null) {
    const name = match[1].trim()
    if (!seen.has(name)) {
      seen.add(name)
      entities.push({ type: 'charakter', name })
    }
  }
  return entities
}

// POST /api/ki/style-check
router.post('/style-check', async (req, res) => {
  try {
    const { stage_id } = req.body
    if (!stage_id) return res.status(400).json({ error: 'stage_id erforderlich' })

    const setting = await getKiSetting('style_check')
    if (!setting?.enabled || !setting.api_key) {
      return res.json({ issues: [], message: 'KI-Funktion nicht aktiviert oder kein API-Key konfiguriert' })
    }

    res.json({ issues: [], message: 'Style-Check benötigt externen Provider (Mistral/OpenAI)' })
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
    if (!setting?.enabled || !setting.api_key) {
      return res.json({ synopsis: 'KI-Funktion nicht aktiviert oder kein API-Key konfiguriert' })
    }

    res.json({ synopsis: 'Synopsis-Generierung benötigt externen Provider' })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default router
