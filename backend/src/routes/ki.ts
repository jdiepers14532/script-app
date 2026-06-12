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

/** Returns api_key + base_url for a provider (base_url null if not set or provider inactive) */
export async function getProviderConfig(provider: string): Promise<{ apiKey: string | null; baseUrl: string | null }> {
  const row = await queryOne(
    `SELECT api_key, is_active, base_url FROM ki_providers WHERE provider = $1`,
    [provider]
  )
  if (!row || !row.is_active) return { apiKey: null, baseUrl: null }
  return { apiKey: row.api_key || null, baseUrl: row.base_url || null }
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

// GET /api/admin/ki-providers/available-models
kiProviderRouter.get('/available-models', (_req, res) => {
  res.json({
    ollama:  ['llama3.2', 'llama3.1', 'llama3.1:8b', 'llama3.1:70b', 'mistral', 'codellama', 'phi3'],
    mistral: ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest', 'open-mistral-7b', 'open-mixtral-8x7b', 'mistral-ocr-latest'],
    openai:  ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    claude:  ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
    gemini:  ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro'],
    custom:  [],
  })
})

// PUT /api/admin/ki-providers/:provider
kiProviderRouter.put('/:provider', async (req, res) => {
  try {
    const { api_key, is_active, reset_costs, base_url } = req.body
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
    if (base_url !== undefined) {
      sql += `, base_url = $${idx++}`; params.push(base_url === '' ? null : base_url)
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
    const rows = await query('SELECT id, funktion, provider, model_name, enabled, prompt, default_prompt FROM ki_settings ORDER BY funktion')
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/admin/ki-settings/:funktion
kiAdminRouter.put('/:funktion', async (req, res) => {
  try {
    const { provider, model_name, enabled, prompt } = req.body
    const row = await queryOne(
      `UPDATE ki_settings SET
        provider   = COALESCE($1, provider),
        model_name = COALESCE($2, model_name),
        enabled    = COALESCE($3, enabled),
        prompt     = COALESCE($4, prompt),
        updated_at = NOW()
       WHERE funktion = $5 RETURNING id, funktion, provider, model_name, enabled, prompt, default_prompt`,
      [provider ?? null, model_name ?? null, enabled ?? null, prompt ?? null, req.params.funktion]
    )
    if (!row) return res.status(404).json({ error: 'KI-Funktion nicht gefunden' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/admin/ki-settings/:funktion/prompt — Prompt auf Default zurücksetzen
kiAdminRouter.delete('/:funktion/prompt', async (req, res) => {
  try {
    const row = await queryOne(
      `UPDATE ki_settings SET prompt = NULL, updated_at = NOW()
       WHERE funktion = $1 RETURNING id, funktion, provider, model_name, enabled, prompt, default_prompt`,
      [req.params.funktion]
    )
    if (!row) return res.status(404).json({ error: 'KI-Funktion nicht gefunden' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── KI inference routes ───────────────────────────────────────────────────────

router.use(authMiddleware)

async function callMistral(apiKey: string, model: string, messages: { role: string; content: string }[], maxTokens = 300, temperature = 0.1): Promise<string> {
  const controller = new AbortController()
  const timeoutMs = maxTokens > 600 ? 60000 : 20000
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`Mistral HTTP ${res.status}`)
    const data = await res.json() as any
    return data.choices?.[0]?.message?.content || ''
  } finally {
    clearTimeout(timeout)
  }
}

async function callClaude(apiKey: string, model: string, system: string, userMsg: string): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20000)
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 300, system, messages: [{ role: 'user', content: userMsg }] }),
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`Claude HTTP ${res.status}`)
    const data = await res.json() as any
    return data.content?.[0]?.text || ''
  } finally {
    clearTimeout(timeout)
  }
}

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

async function callOpenAI(apiKey: string, model: string, messages: { role: string; content: string }[], maxTokens = 300, baseUrl?: string): Promise<string> {
  const controller = new AbortController()
  const timeoutMs = maxTokens > 600 ? 60000 : 20000
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const endpoint = (baseUrl?.replace(/\/$/, '') ?? 'https://api.openai.com/v1') + '/chat/completions'
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.1 }),
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`)
    const data = await res.json() as any
    return data.choices?.[0]?.message?.content || ''
  } finally {
    clearTimeout(timeout)
  }
}

async function callGemini(apiKey: string, model: string, messages: { role: string; content: string }[], maxTokens = 300): Promise<string> {
  const controller = new AbortController()
  const timeoutMs = maxTokens > 600 ? 60000 : 20000
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: { maxOutputTokens: maxTokens, temperature: 0.1 },
        }),
        signal: controller.signal,
      }
    )
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`)
    const data = await res.json() as any
    return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  } finally {
    clearTimeout(timeout)
  }
}

async function getKiSetting(funktion: string): Promise<any> {
  return await queryOne('SELECT * FROM ki_settings WHERE funktion = $1', [funktion])
}

/** Ersetzt {{variable}} Platzhalter im Prompt-Template */
function applyPromptTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

/** Ruft das konfigurierte LLM auf (Ollama / Mistral / Claude / OpenAI / Gemini / Custom) */
async function callProvider(setting: any, messages: { role: string; content: string }[], maxTokens = 300, temperature?: number): Promise<string> {
  if (setting.provider === 'ollama') {
    const prompt = messages.map(m => m.content).join('\n\n')
    return callOllama(setting.model_name, prompt)
  }
  const { apiKey, baseUrl } = await getProviderConfig(setting.provider)
  if (!apiKey) throw new Error(`Kein API-Key für ${setting.provider}`)
  if (setting.provider === 'mistral') return callMistral(apiKey, setting.model_name, messages, maxTokens, temperature)
  if (setting.provider === 'claude') {
    const system = messages.find(m => m.role === 'system')?.content ?? ''
    const user = messages.find(m => m.role === 'user')?.content ?? ''
    return callClaude(apiKey, setting.model_name, system, user)
  }
  if (setting.provider === 'openai') return callOpenAI(apiKey, setting.model_name, messages, maxTokens)
  if (setting.provider === 'gemini') return callGemini(apiKey, setting.model_name, messages, maxTokens)
  if (setting.provider === 'custom') return callOpenAI(apiKey, setting.model_name, messages, maxTokens, baseUrl ?? undefined)
  throw new Error(`Unbekannter Provider: ${setting.provider}`)
}

/** Parst Deskriptoren-Rohtext → strukturiertes Objekt */
function parseDeskriptorenData(raw: string): { deskriptoren: any[] } {
  const lines = raw.split('\n').map((l: string) => l.trim()).filter(Boolean)
  if (!lines.length || (lines.length === 1 && lines[0].toUpperCase() === 'KEINE')) {
    return { deskriptoren: [] }
  }
  const valide = ['leicht', 'mittel', 'stark']
  const deskriptoren = lines.map((line: string) => {
    const parts = line.split('|')
    if (parts.length < 3) return null
    const stufe = parts[1].trim().toLowerCase()
    return {
      kategorie: parts[0].trim().replace(/^[*\-\s]+/, ''),
      stufe: valide.includes(stufe) ? stufe : 'leicht',
      beschreibung: parts.slice(2).join('|').trim(),
    }
  }).filter(Boolean)
  return { deskriptoren }
}

/** Parst FSK-Rohtext → { rating, begruendung } */
function parseFskData(raw: string): { rating: string; begruendung: string } {
  const lines = raw.split('\n').map((l: string) => l.trim()).filter(Boolean)
  const firstLine = lines[0] ?? ''
  const match = firstLine.match(/\b(0|6|12|16|18)\b/)
  const rating = match ? match[1] : '12'
  const begruendung = (match ? lines.slice(1) : lines).join('\n').trim()
  return { rating, begruendung }
}

/** Parst ###SECTION###-Marker aus KI-Antwort → Record<sectionName, content> */
function parseKiSections(raw: string): Record<string, string> {
  const sections: Record<string, string> = {}
  const parts = raw.split(/###([A-ZÄÖÜ_]+)###/)
  for (let i = 1; i + 1 < parts.length; i += 2) {
    sections[parts[i].trim()] = parts[i + 1].trim()
  }
  return sections
}

/** Entfernt KI-Markdown-Artefakte aus Text */
function cleanKiText(s: string): string {
  return s
    .replace(/\*{1,3}/g, '')
    .replace(/_{1,2}([^_\n]+)_{1,2}/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^>\s*/gm, '')
    .replace(/^-{3,}$/gm, '')
    .trim()
}

/** Effektiver Prompt: eigener prompt (aus DB) oder default_prompt */
function effectivePrompt(setting: any): string {
  return (setting.prompt && setting.prompt.trim()) || setting.default_prompt || ''
}

/**
 * Effektiver Prompt mit Produktions-Override:
 * Reihenfolge: production_app_settings.ki_prompt_overrides[funktion] > ki_settings.prompt > ki_settings.default_prompt
 */
async function effectivePromptForProduction(setting: any, productionId?: string): Promise<string> {
  if (productionId) {
    try {
      const row = await queryOne(
        `SELECT value FROM production_app_settings WHERE production_id = $1 AND key = 'ki_prompt_overrides'`,
        [productionId]
      )
      if (row?.value) {
        const overrides = typeof row.value === 'string' ? JSON.parse(row.value) : row.value
        const override = overrides?.[setting.funktion]?.trim()
        if (override) return override
      }
    } catch { /* Fallback auf globale Einstellung */ }
  }
  return effectivePrompt(setting)
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

    const szene = await queryOne('SELECT * FROM dokument_szenen WHERE id = $1', [scene_id])
    if (!szene) return res.status(404).json({ error: 'Szene nicht gefunden' })

    const { extractText } = await import('../utils/tiptapText')
    const contentText = extractText(szene.content) || ''

    const promptTemplate = effectivePrompt(setting) ||
      'Fasse folgende Filmszene in 1-2 Sätzen zusammen.\n\nOrt: {{ort}}\nSzene:\n{{content}}'
    const prompt = applyPromptTemplate(promptTemplate, {
      ort: szene.ort_name || 'Unbekannt',
      content: contentText.substring(0, 2000),
    })

    try {
      const summary = await callProvider(setting, [{ role: 'user', content: prompt }])
      await recordUsage(setting.provider, setting.model_name || '', Math.ceil(prompt.length / 4), Math.ceil(summary.length / 4))
      res.json({ summary: summary.trim(), scene_id, provider: setting.provider })
    } catch {
      const fallback = contentText ? `${szene.ort_name || 'Szene'}: ${contentText.substring(0, 120)}…` : 'Keine Inhalte'
      res.json({ summary: fallback, scene_id, provider: 'fallback' })
    }
  } catch (err: any) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/ki/diff-summary — dramaturgische Zusammenfassung eines Fassungsvergleichs.
// Body: { base_werkstufe_id (Original/ältere Fassung), other_werkstufe_id (aktuelle/neuere) }
// Sammelt nur die geänderten/neuen/gestrichenen Szenen (Plaintext alt+neu) und lässt die KI
// zusammenfassen, was sich erzählerisch und in der Figurenführung geändert hat.
router.post('/diff-summary', async (req, res) => {
  try {
    const { base_werkstufe_id, other_werkstufe_id } = req.body ?? {}
    if (!base_werkstufe_id || !other_werkstufe_id) {
      return res.status(400).json({ error: 'base_werkstufe_id und other_werkstufe_id erforderlich' })
    }

    const setting = await getKiSetting('diff_summary')
    if (!setting?.enabled) return res.json({ summary: null, disabled: true })

    const [baseWs, otherWs] = await Promise.all([
      queryOne(
        `SELECT w.id, w.typ, w.version_nummer, w.label, w.ist_revisionsstufe, w.revisionsstufen_nr,
                w.folge_id, f.folge_nummer
         FROM werkstufen w JOIN folgen f ON f.id = w.folge_id WHERE w.id = $1`,
        [base_werkstufe_id]
      ),
      queryOne(
        `SELECT w.id, w.typ, w.version_nummer, w.label, w.ist_revisionsstufe, w.revisionsstufen_nr,
                w.folge_id, f.folge_nummer
         FROM werkstufen w JOIN folgen f ON f.id = w.folge_id WHERE w.id = $1`,
        [other_werkstufe_id]
      ),
    ])
    if (!baseWs || !otherWs) return res.status(404).json({ error: 'Werkstufe nicht gefunden' })
    if (String(baseWs.folge_id) !== String(otherWs.folge_id)) {
      return res.status(400).json({ error: 'Werkstufen gehören zu unterschiedlichen Folgen' })
    }

    const { extractText } = await import('../utils/tiptapText')
    const loadSzenen = (werkId: string) => query(
      `SELECT scene_identity_id, scene_nummer, scene_nummer_suffix, ort_name, zusammenfassung,
              content, sort_order, format
       FROM dokument_szenen
       WHERE werkstufe_id = $1 AND geloescht = FALSE
       ORDER BY sort_order`,
      [werkId]
    )
    const [baseSzenen, otherSzenen] = await Promise.all([loadSzenen(base_werkstufe_id), loadSzenen(other_werkstufe_id)])

    const SZENE_CAP = 4000   // Zeichen je Textseite einer Szene
    const TOTAL_CAP = 60000  // Zeichen gesamt für den Änderungs-Block

    const szLabel = (s: any) => {
      const nr = s.scene_nummer != null ? `${s.scene_nummer}${s.scene_nummer_suffix ?? ''}` : '?'
      return `SZENE ${nr}${s.ort_name ? ` (${s.ort_name})` : ''}`
    }
    const cap = (t: string) => t.length > SZENE_CAP ? `${t.slice(0, SZENE_CAP)}\n[gekürzt]` : t

    const baseMap = new Map<string, any>(baseSzenen.filter((s: any) => s.scene_identity_id).map((s: any) => [s.scene_identity_id, s]))
    const parts: string[] = []
    let changedCount = 0, addedCount = 0, removedCount = 0

    for (const s of otherSzenen) {
      const base = s.scene_identity_id ? baseMap.get(s.scene_identity_id) : undefined
      const neuText = (extractText(s.content) || '').trim()
      if (!base) {
        addedCount++
        parts.push(`NEUE ${szLabel(s)}:\n${cap(neuText) || '(ohne Text)'}`)
        continue
      }
      baseMap.delete(s.scene_identity_id)
      const altText = (extractText(base.content) || '').trim()
      const kopfDiffs: string[] = []
      if ((base.ort_name ?? '') !== (s.ort_name ?? '')) kopfDiffs.push(`Motiv: "${base.ort_name ?? ''}" → "${s.ort_name ?? ''}"`)
      if ((base.zusammenfassung ?? '') !== (s.zusammenfassung ?? '')) kopfDiffs.push(`Oneliner: "${base.zusammenfassung ?? ''}" → "${s.zusammenfassung ?? ''}"`)
      if (altText === neuText && kopfDiffs.length === 0) continue
      changedCount++
      const kopf = kopfDiffs.length ? `\n[${kopfDiffs.join(' · ')}]` : ''
      if (altText === neuText) {
        parts.push(`GEÄNDERTE ${szLabel(s)}:${kopf}\n(Text unverändert)`)
      } else {
        parts.push(`GEÄNDERTE ${szLabel(s)}:${kopf}\nALT:\n${cap(altText)}\nNEU:\n${cap(neuText)}`)
      }
    }
    // Übrig in baseMap = in der neuen Fassung gestrichen
    for (const s of baseMap.values()) {
      removedCount++
      const altText = (extractText(s.content) || '').trim()
      parts.push(`GESTRICHENE ${szLabel(s)}:\n${cap(altText) || '(ohne Text)'}`)
    }

    if (parts.length === 0) {
      return res.json({ summary: 'Keine inhaltlichen Unterschiede zwischen den beiden Fassungen gefunden.', changed: 0, added: 0, removed: 0, provider: 'none' })
    }

    let aenderungen = ''
    let truncated = false
    for (const p of parts) {
      if (aenderungen.length + p.length > TOTAL_CAP) { truncated = true; break }
      aenderungen += (aenderungen ? '\n\n---\n\n' : '') + p
    }
    if (truncated) aenderungen += '\n\n[Weitere Änderungen aus Platzgründen gekürzt.]'

    const wsLabel = (ws: any) => ws.ist_revisionsstufe
      ? `Revisionsstufe ${ws.revisionsstufen_nr}`
      : `${ws.typ} V${ws.version_nummer}${ws.label ? ` (${ws.label})` : ''}`

    const prompt = applyPromptTemplate(effectivePrompt(setting), {
      folge_nummer: String(otherWs.folge_nummer ?? ''),
      base_label:   wsLabel(baseWs),
      other_label:  wsLabel(otherWs),
      aenderungen,
    })

    const summary = await callProvider(setting, [{ role: 'user', content: prompt }], 2000)
    await recordUsage(setting.provider, setting.model_name || '', Math.ceil(prompt.length / 4), Math.ceil(summary.length / 4))
    res.json({
      summary: summary.trim(),
      changed: changedCount, added: addedCount, removed: removedCount, truncated,
      provider: setting.provider, model: setting.model_name,
    })
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message ?? err) })
  }
})

// POST /api/ki/entity-detect
router.post('/entity-detect', async (req, res) => {
  try {
    const { text } = req.body
    if (!text) return res.status(400).json({ error: 'text erforderlich' })

    const setting = await getKiSetting('entity_detect')
    if (!setting?.enabled) {
      return res.json({ entities: extractEntitiesRegex(text), provider: 'regex-fallback' })
    }

    const promptTemplate = effectivePrompt(setting) ||
      'Extrahiere alle Personen, Orte und Props. Antworte NUR mit JSON-Array: [{"type":"charakter|location|prop","name":"..."}]\n\nText:\n{{text}}'
    const prompt = applyPromptTemplate(promptTemplate, { text: text.substring(0, 3000) })

    let entities: any[] = []
    try {
      const response = await callProvider(setting, [{ role: 'user', content: prompt }])
      const jsonMatch = response.match(/\[[\s\S]*\]/)
      entities = jsonMatch ? JSON.parse(jsonMatch[0]) : extractEntitiesRegex(text)
      await recordUsage(setting.provider, setting.model_name || '', Math.ceil(prompt.length / 4), Math.ceil(response.length / 4))
    } catch {
      entities = extractEntitiesRegex(text)
    }
    res.json({ entities, provider: setting.provider })
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

// POST /api/ki/synopsis — Episoden-Synopse aus allen Szenen einer Folge
router.post('/synopsis', async (req, res) => {
  try {
    const { folge_id } = req.body
    if (!folge_id) return res.status(400).json({ error: 'folge_id erforderlich' })

    const setting = await getKiSetting('synopsis_generate')
    if (!setting?.enabled) return res.json({ synopsis: null, disabled: true, message: 'KI-Funktion nicht aktiviert' })

    // Aktuellste Werkstufe der Folge laden (Drehbuch > Storyline > andere)
    const werkstufe = await queryOne(
      `SELECT w.id, w.typ, w.version_nummer, f.folge_nummer
       FROM werkstufen w JOIN folgen f ON f.id = w.folge_id
       WHERE w.folge_id = $1
       ORDER BY CASE WHEN w.typ='drehbuch' THEN 3 WHEN w.typ='storyline' THEN 2 WHEN w.typ='treatment' THEN 1 ELSE 0 END DESC,
                w.version_nummer DESC LIMIT 1`,
      [folge_id]
    )
    if (!werkstufe) return res.status(404).json({ error: 'Keine Werkstufe für diese Folge' })

    // Alle Szenen laden und Plaintext extrahieren
    const { extractText } = await import('../utils/tiptapText')
    const szenen = await query(
      `SELECT ds.scene_nummer, ds.ort_name, ds.int_ext, ds.tageszeit, ds.zusammenfassung, ds.content
       FROM dokument_szenen ds
       WHERE ds.werkstufe_id = $1 AND ds.element_type = 'scene' AND ds.geloescht = false
       ORDER BY ds.sort_order, ds.scene_nummer NULLS LAST`,
      [werkstufe.id]
    )

    // Szenen-Liste für den Prompt aufbauen (Zusammenfassung oder Plaintext-Snippet)
    const szenenListe = szenen.map((s: any) => {
      const header = [s.scene_nummer ? `Sz. ${s.scene_nummer}` : '', s.ort_name, s.int_ext, s.tageszeit].filter(Boolean).join(' · ')
      const text = s.zusammenfassung || extractText(s.content)?.substring(0, 200) || ''
      return `${header}\n${text}`
    }).join('\n\n')

    const promptTemplate = effectivePrompt(setting) ||
      'Erstelle eine Episoden-Synopse (max. 300 Wörter, Präsens, sachlich).\n\nFolge {{folge_nummer}}:\n{{szenen_liste}}'
    const prompt = applyPromptTemplate(promptTemplate, {
      folge_nummer: String(werkstufe.folge_nummer),
      szenen_liste: szenenListe.substring(0, 8000),
      werkstufe_typ: werkstufe.typ,
    })

    const synopsis = await callProvider(setting, [
      { role: 'system', content: 'Du bist ein Redaktionsassistent für eine deutsche TV-Soap. Erstelle prägnante Episoden-Synopsen.' },
      { role: 'user', content: prompt },
    ])
    await recordUsage(setting.provider, setting.model_name || '', Math.ceil(prompt.length / 4), Math.ceil(synopsis.length / 4))

    res.json({
      synopsis: synopsis.trim(),
      folge_id,
      folge_nummer: werkstufe.folge_nummer,
      werkstufe_typ: werkstufe.typ,
      version_nummer: werkstufe.version_nummer,
      szenen_count: szenen.length,
      provider: setting.provider,
    })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── Synopsen-Generierung (Titel / Kurz / Lang) ────────────────────────────────

/** Gemeinsame Hilfsfunktion: Szenen einer Folge laden */
async function loadSzenenFuerFolge(folge_id: number | string) {
  const { extractText } = await import('../utils/tiptapText')
  const werkstufe = await queryOne(
    `SELECT w.id, w.typ, w.version_nummer, f.folge_nummer, f.produktion_id
     FROM werkstufen w JOIN folgen f ON f.id = w.folge_id
     WHERE w.folge_id = $1
     ORDER BY CASE WHEN w.typ='drehbuch' THEN 3 WHEN w.typ='storyline' THEN 2 WHEN w.typ='treatment' THEN 1 ELSE 0 END DESC,
              w.version_nummer DESC LIMIT 1`,
    [folge_id]
  )
  if (!werkstufe) return null
  const szenen = await query(
    `SELECT ds.scene_nummer, ds.ort_name, ds.int_ext, ds.tageszeit, ds.zusammenfassung, ds.content
     FROM dokument_szenen ds
     WHERE ds.werkstufe_id = $1 AND ds.element_type = 'scene' AND ds.geloescht = false
     ORDER BY ds.sort_order, ds.scene_nummer NULLS LAST`,
    [werkstufe.id]
  )
  const szenenListe = szenen.map((s: any) => {
    const header = [s.scene_nummer ? `Sz. ${s.scene_nummer}` : '', s.ort_name, s.int_ext, s.tageszeit].filter(Boolean).join(' · ')
    const text = s.zusammenfassung || extractText(s.content)?.substring(0, 200) || ''
    return `${header}\n${text}`
  }).join('\n\n')
  return { werkstufe, szenen, szenenListe: szenenListe.substring(0, 8000) }
}

// GET /api/ki/synopsen/check?folge_id=X — prüft ob Titel/Synopsen schon vorhanden
router.get('/synopsen/check', async (req, res) => {
  try {
    const { folge_id } = req.query
    if (!folge_id) return res.status(400).json({ error: 'folge_id fehlt' })
    const row = await queryOne(
      `SELECT folgen_titel, synopsis, synopsis_300, synopsis_kurzinhalt, synopsis_presse, synopsis_straenge, synopsis_pressetext, synopsis_lektor, synopsis_deskriptoren, synopsis_fsk FROM folgen WHERE id = $1`,
      [folge_id]
    )
    if (!row) return res.status(404).json({ error: 'Folge nicht gefunden' })
    const hasData = !!(row.folgen_titel || row.synopsis || row.synopsis_300 || row.synopsis_kurzinhalt || row.synopsis_presse || row.synopsis_straenge || row.synopsis_pressetext || row.synopsis_lektor || row.synopsis_deskriptoren || row.synopsis_fsk)
    res.json({ hasData, ...row })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/ki/synopsen/titel — 5 Titel-Vorschläge
router.post('/synopsen/titel', async (req, res) => {
  try {
    const { folge_id } = req.body
    if (!folge_id) return res.status(400).json({ error: 'folge_id erforderlich' })
    const setting = await getKiSetting('synopsis_titel')
    if (!setting?.enabled) return res.json({ titel: [], disabled: true, message: 'KI-Funktion nicht aktiviert' })
    const data = await loadSzenenFuerFolge(folge_id)
    if (!data) return res.status(404).json({ error: 'Keine Werkstufe gefunden' })

    // Bereits vergebene Titel in dieser Produktion laden
    const vorhandene = await query(
      `SELECT folgen_titel FROM folgen WHERE produktion_id = $1 AND id != $2 AND folgen_titel IS NOT NULL AND folgen_titel != ''`,
      [data.werkstufe.produktion_id, folge_id]
    )
    const vorhandeneListe = vorhandene.map((r: any) => r.folgen_titel).join('\n')

    const promptTemplate = effectivePrompt(setting) ||
      'Du bist Redakteur einer deutschen TV-Soap (ARD Soap).\nSchlage genau 5 verschiedene Episodentitel für Folge {{folge_nummer}} vor.\n\nREGELN:\n- Genau 5 Titel, einer pro Zeile, keine Nummerierung\n- Keinerlei Erklärungen, Kommentare oder Formatierungszeichen\n- Jeder Titel: 2-5 Wörter, prägnant, kein Spoiler\n- Stil einer deutschen TV-Soap\n\nSZENEN-ZUSAMMENFASSUNGEN:\n{{szenen_liste}}'
    const prompt = applyPromptTemplate(promptTemplate, {
      folge_nummer: String(data.werkstufe.folge_nummer),
      szenen_liste: data.szenenListe,
    }) + (vorhandeneListe ? `\n\nBEREITS VERWENDETE TITEL (nicht wiederholen):\n${vorhandeneListe.substring(0, 2000)}` : '')

    const raw = await callProvider(setting, [
      { role: 'system', content: 'Du bist Redakteur einer deutschen TV-Soap. Antworte ausschließlich mit den 5 Titeln, einen pro Zeile.' },
      { role: 'user', content: prompt },
    ])
    await recordUsage(setting.provider, setting.model_name || '', Math.ceil(prompt.length / 4), Math.ceil(raw.length / 4))

    const titel = raw.split('\n')
      .map((t: string) => t.replace(/^[\d\.\-\*\s]+/, '').replace(/[*#]/g, '').trim())
      .filter((t: string) => t.length > 0)
      .slice(0, 5)

    res.json({ titel, folge_id, folge_nummer: data.werkstufe.folge_nummer })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/ki/synopsen/kurz — Synopsis 300 (Zuschauende)
router.post('/synopsen/kurz', async (req, res) => {
  try {
    const { folge_id } = req.body
    if (!folge_id) return res.status(400).json({ error: 'folge_id erforderlich' })
    const setting = await getKiSetting('synopsis_kurz')
    if (!setting?.enabled) return res.json({ text: null, disabled: true, message: 'KI-Funktion nicht aktiviert' })
    const data = await loadSzenenFuerFolge(folge_id)
    if (!data) return res.status(404).json({ error: 'Keine Werkstufe gefunden' })

    const promptTemplate = effectivePrompt(setting) ||
      'Du bist Redakteur einer deutschen TV-Soap (ARD Soap).\nSchreibe eine kurze Episodensynopse für das Fernsehprogramm (Folge {{folge_nummer}}).\nZielgruppe: Zuschauende.\n\nREGELN:\n- Maximal 300 Wörter, Präsens\n- KEINE Überschrift, kein Titel, kein Vorspann\n- KEINERLEI Formatierungszeichen: kein *, kein **, kein #, keine Sternchen\n- Fließtext, spannend und neugierig machend\n- Kein Spoiler zur Cliffhanger-Auflösung\n\nSZENEN-ZUSAMMENFASSUNGEN:\n{{szenen_liste}}'
    const prompt = applyPromptTemplate(promptTemplate, {
      folge_nummer: String(data.werkstufe.folge_nummer),
      szenen_liste: data.szenenListe,
    })

    const raw = await callProvider(setting, [
      { role: 'system', content: 'Du bist Redakteur einer deutschen TV-Soap. Antworte nur mit der Synopsis, ohne Kommentare oder Formatierung.' },
      { role: 'user', content: prompt },
    ])
    await recordUsage(setting.provider, setting.model_name || '', Math.ceil(prompt.length / 4), Math.ceil(raw.length / 4))

    // KI-Formatierungsartefakte entfernen
    const text = raw.replace(/\*{1,3}/g, '').replace(/^#{1,6}\s*/gm, '').replace(/^>\s*/gm, '').replace(/^-{3,}$/gm, '').trim()
    res.json({ text, folge_id, szenen_count: data.szenen.length })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/ki/synopsen/lang — Dramaturgische Synopsis (Autoren/Produktion)
router.post('/synopsen/lang', async (req, res) => {
  try {
    const { folge_id } = req.body
    if (!folge_id) return res.status(400).json({ error: 'folge_id erforderlich' })
    const setting = await getKiSetting('synopsis_lang')
    if (!setting?.enabled) return res.json({ text: null, disabled: true, message: 'KI-Funktion nicht aktiviert' })
    const data = await loadSzenenFuerFolge(folge_id)
    if (!data) return res.status(404).json({ error: 'Keine Werkstufe gefunden' })

    const promptTemplate = effectivePrompt(setting) ||
      'Du bist Dramaturg einer deutschen TV-Soap (ARD Soap).\nSchreibe eine ausführliche dramaturgische Episodensynopse für die interne Redaktion (Folge {{folge_nummer}}).\nZielgruppe: Autoren, Redaktion und Produktionsleitung.\n\nREGELN:\n- 400-600 Wörter, Präsens\n- KEINE Überschrift, kein Titel, kein Vorspann\n- KEINERLEI Formatierungszeichen: kein *, kein **, kein #, keine Sternchen, kein Markdown\n- Rollennamen ausschließlich in GROSSBUCHSTABEN (z.B. LOU, DANIEL, BRITTA)\n- Ein Absatz pro Handlungsstrang\n- Strukturmarker am Absatzanfang: CLIFF für Cliffhanger-Strang, PEN für Pending-Strang\n- Kann Spoiler enthalten\n- Dramaturgisch aufgebaut\n\nSZENEN-ZUSAMMENFASSUNGEN:\n{{szenen_liste}}'
    const prompt = applyPromptTemplate(promptTemplate, {
      folge_nummer: String(data.werkstufe.folge_nummer),
      szenen_liste: data.szenenListe,
    })

    const raw = await callProvider(setting, [
      { role: 'system', content: 'Du bist Dramaturg einer deutschen TV-Soap. Antworte nur mit der Synopsis. Rollennamen IMMER in GROSSBUCHSTABEN. Keine Formatierung außer Absätze.' },
      { role: 'user', content: prompt },
    ])
    await recordUsage(setting.provider, setting.model_name || '', Math.ceil(prompt.length / 4), Math.ceil(raw.length / 4))

    const text = raw.replace(/\*{1,3}/g, '').replace(/^#{1,6}\s*/gm, '').replace(/^>\s*/gm, '').replace(/^-{3,}$/gm, '').trim()
    res.json({ text, folge_id, szenen_count: data.szenen.length })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/ki/synopsen/generiere-alle — kombinierter Call (alle 6 Synopsen in zwei Requests)
router.post('/synopsen/generiere-alle', async (req, res) => {
  try {
    const { folge_id } = req.body
    if (!folge_id) return res.status(400).json({ error: 'folge_id erforderlich' })

    const setting = await getKiSetting('synopsis_alle')
    if (!setting?.enabled) return res.json({ disabled: true, message: 'KI-Funktion nicht aktiviert' })

    const data = await loadSzenenFuerFolge(folge_id)
    if (!data) return res.status(404).json({ error: 'Keine Werkstufe gefunden' })

    // DK-Einstellungen für Synopsen (Temperatur + Limiten)
    const dkRow = await queryOne(
      `SELECT value FROM production_app_settings WHERE production_id = $1 AND key = 'synopsis_settings'`,
      [data.werkstufe.produktion_id]
    )
    const dk = dkRow?.value ? JSON.parse(dkRow.value) : {}
    const tempTitel     = dk.temp_titel            ?? 0.65
    const tempStruktur  = dk.temp_struktur          ?? 0.35
    const titelMaxW     = dk.titel_max_woerter      ?? 3
    const redaktionMin  = dk.redaktion_min_woerter  ?? 300
    const redaktionMax  = dk.redaktion_max_woerter  ?? 500
    const presseMax     = dk.presse_max_woerter     ?? 80
    const pressetextMin = dk.pressetext_min_zeichen ?? 280
    const pressetextMax = dk.pressetext_max_zeichen ?? 330
    const strangMax     = dk.strang_max_zeichen     ?? 300

    // Handlungsstränge der Folge laden
    const strangRows = await query(
      `SELECT DISTINCT s.name
       FROM straenge s
       JOIN dokument_szenen_straenge dss ON dss.strang_id = s.id
       JOIN dokument_szenen ds ON ds.id = dss.dokument_szene_id
       WHERE ds.werkstufe_id = $1
       ORDER BY s.name`,
      [data.werkstufe.id]
    )
    const strangNamen: string[] = strangRows.map((r: any) => r.name)

    // Deskriptor-Vorlagen der Produktion laden (Fallback: defaults)
    const DEFAULT_DESKRIPTOR_LABELS = [
      'Gewaltdarstellungen', 'Sexualisierte Darstellungen', 'Beängstigende Szenen',
      'Sprache (Schimpfwörter)', 'Drogen, Alkohol & Tabak', 'Diskriminierung',
      'Suizid & Selbstverletzung', 'Thematisch belastend',
    ]
    const deskVorlagenRows = await query(
      `SELECT name FROM deskriptor_vorlagen WHERE production_id = $1 ORDER BY sort_order ASC`,
      [data.werkstufe.produktion_id]
    )
    const deskriptorLabels: string[] = deskVorlagenRows.length > 0
      ? deskVorlagenRows.map((r: any) => r.name)
      : DEFAULT_DESKRIPTOR_LABELS

    // Bisherige Titel als Stil-Referenz
    const vorhandeneTitelRows = await query(
      `SELECT folgen_titel FROM folgen
       WHERE produktion_id = $1 AND id != $2 AND folgen_titel IS NOT NULL AND folgen_titel != ''
       ORDER BY folge_nummer DESC LIMIT 20`,
      [data.werkstufe.produktion_id, folge_id]
    )
    const titelListe = vorhandeneTitelRows.map((r: any) => r.folgen_titel).join('\n')

    const szenenListe = data.szenenListe
    const folgeNr = String(data.werkstufe.folge_nummer)
    const strangHinweis = strangNamen.length > 0
      ? `\nDIE FOLGE HAT FOLGENDE HANDLUNGSSTRÄNGE: ${strangNamen.join(', ')}\n`
      : ''

    // ── Call 1: Titel (temp_titel, kreativ) ──────────────────────────────────
    const titelPrompt = `=== SZENEN-ZUSAMMENFASSUNGEN FOLGE ${folgeNr} ===
${szenenListe}
${titelListe ? `\n=== BISHERIGE EPISODENTITEL (Stilreferenz) ===\n${titelListe}\n` : ''}
Schlage 5 verschiedene Episodentitel vor.

REGELN:
- Maximal ${titelMaxW} Wörter, prägnant, NICHT beschreibend
- Am Stil der bisherigen Titel orientieren
- Keinerlei Nummerierung, kein Kommentar — NUR die Titel, einer pro Zeile`

    // ── Call 2: Inhalts-Synopsen (temp_struktur, präzise) ────────────────────
    const contentPrompt = `=== SZENEN-ZUSAMMENFASSUNGEN FOLGE ${folgeNr} ===
${szenenListe}
${strangHinweis}
Erstelle folgende 4 Ausgaben EXAKT in diesem Format (Abschnitte durch ###MARKER### getrennt):

###KURZINHALT###
**Haupthandlung:**
[2-3 Sätze zur zentralen Handlung, Präsens, kein Markdown außer **Fettdruck** für Abschnittsköpfe]

**Nebenhandlungen:**
[1-2 Sätze pro Nebenstrang, Präsens]

**Cliffhanger:**
[1 kurzer Satz, Spannung aufbauen ohne Auflösung]

###REDAKTION###
[Dramaturgische Inhaltsangabe. Rollennamen IMMER in GROSSBUCHSTABEN. Sachlicher, präziser Stil — keine Metakommentare, kein "Want und Need" als Label. CLIFF für Cliffhanger-Strang, PEN für Pending-Strang. Ein Absatz pro Strang. Präsens, aktiv. ${redaktionMin}-${redaktionMax} Wörter. Kein Markdown.]

###STRANG###
[Je Handlungsstrang eine Zeile: "STRANGNAME: Kurzbeschreibung" — maximal ${strangMax} Zeichen pro Zeile. Kein Markdown.
WICHTIG: Führe ALLE erkannten Handlungsstränge auf, auch wenn sie keinem bekannten Namen zugeordnet werden können.${strangNamen.length > 0 ? ` Bekannte Strang-Namen (bevorzugen wenn passend): ${strangNamen.join(', ')}.` : ' Identifiziere alle Handlungsstränge aus den Szenen.'}]

###PROGRAMMPRESSE###
[Programm-Presse-Text. Fließend, neugierig machend, kein Spoiler. Kein Markdown. Ziel: 300–450 Zeichen.]

###PRESSETEXT###
[Exakt ${pressetextMin}-${pressetextMax} Zeichen (zähle genau!). Sachlich, knapp, kein werblicher Ton. Kein Spoiler. Kein Markdown. Kein Zeilenumbruch.
PFLICHT: Verwende AUSSCHLIESSLICH Figurennamen aus den Szenen — KEINE Schauspieler- oder Darsteller-Namen. Füge KEINE Informationen hinzu, die nicht explizit aus den Szenen stammen. Eine erfundene oder falsche Information ist 1000-mal schlimmer als eine ausgelassene.]`

    const systemPrompt = `Du bist Dramaturg und Redakteur einer deutschen Daily-Soap (ARD, Rote Rosen). Antworte AUSSCHLIESSLICH mit den angeforderten Abschnitten im exakt vorgegebenen Format. Keine Einleitung, keine Erklärungen. KEINERLEI Markdown-Formatierung: kein **, kein *, kein _, kein #.`

    const lektorPrompt = `=== SZENEN-ZUSAMMENFASSUNGEN FOLGE ${folgeNr} ===
${szenenListe}
${strangHinweis}
Erstelle eine CHRONOLOGISCHE Inhaltsangabe der Folge als Fließtext. Rollennamen IMMER in GROSSBUCHSTABEN. Präsens. 300–400 Wörter. Keine Kapitelüberschriften, keine Abschnittstruktur, kein Markdown.

Füge direkt hinter relevante Sätze folgende Marker ein — nur den Marker, kein Kommentar:
- (Sz. X) — bei jeder konkreten Behauptung als Szenenreferenz
- [Want] — wenn der Satz ein äußeres Ziel einer Figur ausdrückt
- [Need] — wenn der Satz eine innere Notwendigkeit ausdrückt
- [Akt 1 Ende] / [Akt 2 Ende] — genau an der Stelle im Fließtext wo ein Akt endet
- [Cliff] — am Ende eines Cliffhanger-Strangs
- [Pen] — bei einem offenen Pending-Ende

Beispiel-Stil:
"LOU trifft RICHARD im Café (Sz. 3). Sie möchte wissen, ob er nach München zieht [Want]. RICHARD weicht aus und lügt sie an (Sz. 5). LOU spürt, dass etwas nicht stimmt (Sz. 6) [Need]. [Akt 1 Ende] BRITTA meldet sich für das Ehrenamt im Krankenhaus an (Sz. 9) [Want]. Am Abend wartet LOU vergeblich auf eine Nachricht (Sz. 21) [Cliff]."

Schreibe die gesamte Folge in diesem Stil — chronologisch, ein durchgehender Fließtext.`

    // ── Call 4: Inhaltsdeskriptoren + FSK ────────────────────────────────────
    const deskriptorenPrompt = `=== SZENEN-ZUSAMMENFASSUNGEN FOLGE ${folgeNr} ===
${szenenListe}

Analysiere die Folge auf jugendschutzrelevante Inhalte.

###DESKRIPTOREN###
Liste ALLE zutreffenden Kategorien im Format: KATEGORIE|STUFE|Kurzbeschreibung mit Szenenreferenz (Sz. X)
Stufen: leicht, mittel, stark
Kategorien (verwende EXAKT diese Bezeichnungen, keine anderen): ${deskriptorLabels.join(', ')}
Beispiel:
${deskriptorLabels[0]}|leicht|Verbale Auseinandersetzung zwischen LOU und RICHARD (Sz. 5)
${deskriptorLabels[2] ?? deskriptorLabels[0]}|mittel|BRITTA erfährt Diagnose, reagiert mit Panikattacke (Sz. 12)
Wenn keine Deskriptoren zutreffen: "KEINE"

###FSK###
Erste Zeile: empfohlene FSK-Altersfreigabe (eine Zahl: 0, 6, 12, 16 oder 18)
Danach: kurze Begründung (2-4 Sätze) mit konkreten Szenenreferenzen (Sz. X)`

    // Vier Calls parallel
    const [titelRaw, contentRaw, lektorRaw, deskRaw] = await Promise.all([
      callProvider(setting, [
        { role: 'system', content: 'Du bist Redakteur einer deutschen TV-Soap. Antworte ausschließlich mit den 5 Titeln, einen pro Zeile. Maximal 3 Wörter pro Titel.' },
        { role: 'user', content: titelPrompt },
      ], 200, tempTitel),
      callProvider(setting, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: contentPrompt },
      ], 2200, tempStruktur),
      callProvider(setting, [
        { role: 'system', content: 'Du bist Lektor und Dramaturg einer deutschen Daily-Soap. Erstelle eine chronologische Fließtext-Inhaltsangabe mit eingebetteten Markern [Want], [Need], [Akt X Ende], [Cliff], [Pen] und Szenenreferenzen (Sz. X). Rollennamen IMMER in GROSSBUCHSTABEN. Kein Markdown, keine Abschnittsüberschriften, nur Fließtext.' },
        { role: 'user', content: lektorPrompt },
      ], 1200, tempStruktur),
      callProvider(setting, [
        { role: 'system', content: 'Du bist Jugendschutzbeauftragter einer deutschen TV-Produktionsfirma. Analysiere Episodeninhalte sachlich und vollständig. Antworte nur mit den angeforderten Abschnitten im exakten Format. Kein Markdown.' },
        { role: 'user', content: deskriptorenPrompt },
      ], 800, tempStruktur),
    ])

    await recordUsage(setting.provider, setting.model_name || '',
      Math.ceil((titelPrompt.length + contentPrompt.length + lektorPrompt.length + deskriptorenPrompt.length) / 4),
      Math.ceil((titelRaw.length + contentRaw.length + lektorRaw.length + deskRaw.length) / 4))

    const titel = titelRaw.split('\n')
      .map((t: string) => t.replace(/^[\d\.\-\*\[\]\s]+/, '').replace(/[*#"„"[\]]/g, '').trim())
      .filter((t: string) => t.length > 0 && t.length <= 80)
      .slice(0, 5)

    const sections = parseKiSections(contentRaw)
    const deskSections = parseKiSections(deskRaw)
    const deskriptoren = parseDeskriptorenData(deskSections['DESKRIPTOREN'] || deskRaw.split('###FSK###')[0] || '')
    const fsk = parseFskData(deskSections['FSK'] || '')
    const missingSections = ['KURZINHALT', 'REDAKTION', 'STRANG', 'PROGRAMMPRESSE', 'PRESSETEXT']
      .filter(k => !sections[k])

    res.json({
      titel,
      kurzinhalt:    sections['KURZINHALT']       || '',
      redaktion:     cleanKiText(sections['REDAKTION']        || ''),
      straenge:      cleanKiText(sections['STRANG']           || ''),
      presse:        cleanKiText(sections['PROGRAMMPRESSE']   || ''),
      pressetext:    cleanKiText(sections['PRESSETEXT']       || ''),
      lektor:        lektorRaw.trim(),
      deskriptoren:  deskriptoren.deskriptoren,
      fsk_rating:    fsk.rating,
      fsk_begruendung: fsk.begruendung,
      folge_id,
      folge_nummer: data.werkstufe.folge_nummer,
      szenen_count: data.szenen.length,
      provider: setting.provider,
      ...(missingSections.length > 0 ? { missing_sections: missingSections } : {}),
    })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/ki/synopsen/titel-mehr — 5 weitere Titelvorschläge (mit Ausschluss)
router.post('/synopsen/titel-mehr', async (req, res) => {
  try {
    const { folge_id, ausgeschlossene_titel = [] } = req.body
    if (!folge_id) return res.status(400).json({ error: 'folge_id erforderlich' })

    const setting = await getKiSetting('synopsis_titel')
    if (!setting?.enabled) return res.json({ titel: [], disabled: true, message: 'KI-Funktion nicht aktiviert' })

    const data = await loadSzenenFuerFolge(folge_id)
    if (!data) return res.status(404).json({ error: 'Keine Werkstufe gefunden' })

    const vorhandeneTitelRows = await query(
      `SELECT folgen_titel FROM folgen WHERE produktion_id = $1 AND id != $2 AND folgen_titel IS NOT NULL AND folgen_titel != ''
       ORDER BY folge_nummer DESC LIMIT 20`,
      [data.werkstufe.produktion_id, folge_id]
    )
    const stilReferenz = vorhandeneTitelRows.map((r: any) => r.folgen_titel).join('\n')

    const ausschlussListe = [
      ...vorhandeneTitelRows.map((r: any) => r.folgen_titel),
      ...(Array.isArray(ausgeschlossene_titel) ? ausgeschlossene_titel : []),
    ].join('\n')

    const prompt = `Du bist Redakteur einer deutschen Daily-Soap (ARD Rote Rosen).
Schlage 5 NEUE Episodentitel für Folge ${data.werkstufe.folge_nummer} vor.

REGELN:
- Maximal 1-3 Wörter, prägnant, NICHT beschreibend
- Am Stil dieser bisherigen Titel orientieren (kurz, treffend):
${stilReferenz}
- Diese Titel NICHT wiederholen oder variieren:
${ausschlussListe.substring(0, 2000)}
- Keine Nummerierung, keine Erklärungen, ein Titel pro Zeile

SZENEN-ZUSAMMENFASSUNGEN:
${data.szenenListe}`

    const raw = await callProvider(setting, [
      { role: 'system', content: 'Du bist Redakteur einer deutschen TV-Soap. Antworte ausschließlich mit 5 Titeln, einen pro Zeile. Maximal 3 Wörter pro Titel.' },
      { role: 'user', content: prompt },
    ], 150)

    await recordUsage(setting.provider, setting.model_name || '', Math.ceil(prompt.length / 4), Math.ceil(raw.length / 4))

    const titel = raw.split('\n')
      .map((t: string) => t.replace(/^[\d\.\-\*\s]+/, '').replace(/[*#"„"]/g, '').trim())
      .filter((t: string) => t.length > 0)
      .slice(0, 5)

    res.json({ titel, folge_id })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/ki/query-expand
// Analysiert eine natürlichsprachliche Suchanfrage via LLM und extrahiert
// Charakternamen (mit DB-Lookup auf character_productions) und Schlüsselwörter.
router.post('/query-expand', async (req, res) => {
  try {
    const { query: searchQuery, produktion_id } = req.body
    if (!searchQuery) return res.status(400).json({ error: 'query erforderlich' })

    const setting = await getKiSetting('query_expand')
    let extractedCharacters: string[] = []
    let keywords: string[] = []
    let provider = 'regex-fallback'

    if (setting?.enabled) {
      const apiKey = setting.provider !== 'ollama' ? await getProviderApiKey(setting.provider) : null
      const hasProvider = setting.provider === 'ollama' || !!apiKey

      if (hasProvider) {
        const system = `Du analysierst Suchanfragen für ein deutsches TV-Drehbuch-Archiv. Extrahiere Charakternamen und Stichwörter. Antworte NUR mit JSON, ohne Erklärung.`
        const userMsg = `Suchanfrage: "${searchQuery}"\n\nExtrahiere:\n- characters: Eigennamen von Personen/Charakteren\n- keywords: sonstige relevante Stichwörter (keine Stoppwörter)\n\nJSON: {"characters":["Name1"],"keywords":["wort1"]}`

        try {
          let response: string
          if (setting.provider === 'ollama') {
            response = await callOllama(setting.model_name, system + '\n\n' + userMsg)
          } else if (setting.provider === 'mistral') {
            response = await callMistral(apiKey!, setting.model_name,
              [{ role: 'system', content: system }, { role: 'user', content: userMsg }])
          } else {
            response = await callClaude(apiKey!, setting.model_name, system, userMsg)
          }
          const match = response.match(/\{[\s\S]*\}/)
          if (match) {
            const parsed = JSON.parse(match[0])
            extractedCharacters = (parsed.characters || []).map((s: string) => s.trim()).filter(Boolean)
            keywords = (parsed.keywords || []).map((s: string) => s.trim()).filter(Boolean)
          }
          await recordUsage(setting.provider, setting.model_name || '',
            Math.ceil(userMsg.length / 4), Math.ceil(response.length / 4))
          provider = setting.provider
        } catch {
          // Fallback unten
        }
      }
    }

    // Regex-Fallback: Großgeschriebene Wörter = Charaktere, Rest = Keywords
    if (extractedCharacters.length === 0 && keywords.length === 0) {
      const stopwords = new Set(['auf', 'und', 'oder', 'mit', 'in', 'an', 'die', 'der', 'das', 'ein', 'eine', 'einer',
        'trifft', 'geht', 'kommt', 'ist', 'sind', 'hat', 'haben', 'wird', 'wird', 'wenn', 'aber', 'weil'])
      const words = searchQuery.split(/\s+/).filter((w: string) => w.length >= 3 && !stopwords.has(w.toLowerCase()))
      extractedCharacters = words.filter((w: string) => /^[A-ZÄÖÜ]/.test(w))
      keywords = words.filter((w: string) => !/^[A-ZÄÖÜ]/.test(w))
    }

    // Charaktere in der Produktions-DB nachschlagen
    let resolvedCharacters: { id: string; name: string }[] = []
    if (extractedCharacters.length > 0 && produktion_id) {
      const nameLower = extractedCharacters.map((n: string) => n.toLowerCase())
      const rows = await query(
        `SELECT DISTINCT c.id::text, c.name
         FROM characters c
         JOIN character_productions cp ON cp.character_id = c.id
         WHERE cp.produktion_id = $1
           AND LOWER(c.name) = ANY($2::text[])`,
        [produktion_id, nameLower]
      )
      resolvedCharacters = rows.map((r: any) => ({ id: r.id, name: r.name }))
    }

    res.json({
      characters: resolvedCharacters,
      unresolved_names: extractedCharacters.filter(
        n => !resolvedCharacters.find(r => r.name.toLowerCase() === n.toLowerCase())
      ),
      keywords,
      provider,
    })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default router
export { getKiSetting, callProvider, applyPromptTemplate, effectivePrompt, effectivePromptForProduction }
