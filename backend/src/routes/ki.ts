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

async function getKiSetting(funktion: string): Promise<any> {
  return await queryOne('SELECT * FROM ki_settings WHERE funktion = $1', [funktion])
}

/** Ersetzt {{variable}} Platzhalter im Prompt-Template */
function applyPromptTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

/** Ruft das konfigurierte LLM auf (Ollama / Mistral / Claude) */
async function callProvider(setting: any, messages: { role: string; content: string }[], maxTokens = 300): Promise<string> {
  if (setting.provider === 'ollama') {
    const prompt = messages.map(m => m.content).join('\n\n')
    return callOllama(setting.model_name, prompt)
  }
  const apiKey = await getProviderApiKey(setting.provider)
  if (!apiKey) throw new Error(`Kein API-Key für ${setting.provider}`)
  if (setting.provider === 'mistral') return callMistral(apiKey, setting.model_name, messages, maxTokens)
  if (setting.provider === 'claude') {
    const system = messages.find(m => m.role === 'system')?.content ?? ''
    const user = messages.find(m => m.role === 'user')?.content ?? ''
    return callClaude(apiKey, setting.model_name, system, user)
  }
  throw new Error(`Unbekannter Provider: ${setting.provider}`)
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
  return s.replace(/\*{1,3}/g, '').replace(/^#{1,6}\s*/gm, '').replace(/^>\s*/gm, '').replace(/^-{3,}$/gm, '').trim()
}

/** Effektiver Prompt: eigener prompt (aus DB) oder default_prompt */
function effectivePrompt(setting: any): string {
  return (setting.prompt && setting.prompt.trim()) || setting.default_prompt || ''
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
      `SELECT folgen_titel, synopsis, synopsis_300, synopsis_presse, synopsis_straenge FROM folgen WHERE id = $1`,
      [folge_id]
    )
    if (!row) return res.status(404).json({ error: 'Folge nicht gefunden' })
    const hasData = !!(row.folgen_titel || row.synopsis || row.synopsis_300 || row.synopsis_presse || row.synopsis_straenge)
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

    const prompt = `Du bist Redakteur einer deutschen TV-Soap (ARD Soap).
Schlage genau 5 verschiedene Episodentitel für Folge ${data.werkstufe.folge_nummer} vor.

REGELN:
- Genau 5 Titel, einer pro Zeile, keine Nummerierung
- Keinerlei Erklärungen, Kommentare oder Formatierungszeichen
- Jeder Titel: 2-5 Wörter, prägnant, kein Spoiler
- Stil einer deutschen TV-Soap${vorhandeneListe ? `\n\nBEREITS VERWENDETE TITEL (nicht wiederholen):\n${vorhandeneListe.substring(0, 2000)}` : ''}

SZENEN-ZUSAMMENFASSUNGEN:
${data.szenenListe}`

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

    const prompt = `Du bist Redakteur einer deutschen TV-Soap (ARD Soap).
Schreibe eine kurze Episodensynopse für das Fernsehprogramm (Folge ${data.werkstufe.folge_nummer}).
Zielgruppe: Zuschauende.

REGELN:
- Maximal 300 Wörter, Präsens
- KEINE Überschrift, kein Titel, kein Vorspann
- KEINERLEI Formatierungszeichen: kein *, kein **, kein #, keine Sternchen
- Fließtext, spannend und neugierig machend
- Kein Spoiler zur Cliffhanger-Auflösung

SZENEN-ZUSAMMENFASSUNGEN:
${data.szenenListe}`

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

    const prompt = `Du bist Dramaturg einer deutschen TV-Soap (ARD Soap).
Schreibe eine ausführliche dramaturgische Episodensynopse für die interne Redaktion (Folge ${data.werkstufe.folge_nummer}).
Zielgruppe: Autoren, Redaktion und Produktionsleitung.

REGELN:
- 400-600 Wörter, Präsens
- KEINE Überschrift, kein Titel, kein Vorspann
- KEINERLEI Formatierungszeichen: kein *, kein **, kein #, keine Sternchen, kein Markdown
- Rollennamen ausschließlich in GROSSBUCHSTABEN (z.B. LOU, DANIEL, BRITTA)
- Ein Absatz pro Handlungsstrang
- Strukturmarker am Absatzanfang: CLIFF für Cliffhanger-Strang, PEN für Pending-Strang
- Kann Spoiler enthalten
- Dramaturgisch aufgebaut

SZENEN-ZUSAMMENFASSUNGEN:
${data.szenenListe}`

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

// POST /api/ki/synopsen/generiere-alle — kombinierter Call (alle Synopsen in einem Request)
router.post('/synopsen/generiere-alle', async (req, res) => {
  try {
    const { folge_id } = req.body
    if (!folge_id) return res.status(400).json({ error: 'folge_id erforderlich' })

    const setting = await getKiSetting('synopsis_alle')
    if (!setting?.enabled) return res.json({ disabled: true, message: 'KI-Funktion nicht aktiviert' })

    const data = await loadSzenenFuerFolge(folge_id)
    if (!data) return res.status(404).json({ error: 'Keine Werkstufe gefunden' })

    // Bisherige Titel dieser Produktion als Stil-Referenz
    const vorhandeneTitelRows = await query(
      `SELECT folgen_titel FROM folgen
       WHERE produktion_id = $1 AND id != $2 AND folgen_titel IS NOT NULL AND folgen_titel != ''
       ORDER BY folge_nummer DESC LIMIT 20`,
      [data.werkstufe.produktion_id, folge_id]
    )
    const titelListe = vorhandeneTitelRows.map((r: any) => r.folgen_titel).join('\n')

    const systemPrompt = `Du bist ein professioneller Dramaturg und Redakteur einer deutschen Daily-Soap (ARD, Rote Rosen). Antworte AUSSCHLIESSLICH mit den angeforderten Abschnitten in exakt dem vorgegebenen Format. Keine Einleitung, keine Erklärungen.`

    const userPrompt = `=== SZENEN-ZUSAMMENFASSUNGEN FOLGE ${data.werkstufe.folge_nummer} ===
${data.szenenListe}
${titelListe ? `\n=== BISHERIGE EPISODENTITEL (Stilreferenz — kurz und prägnant wie diese) ===\n${titelListe}` : ''}

Erstelle folgende 5 Ausgaben EXAKT in diesem Format (Abschnitte durch ###MARKER### getrennt):

###TITEL###
[Titel 1: 1-3 Wörter, NICHT beschreibend, am Stil der bisherigen Titel orientiert]
[Titel 2]
[Titel 3]
[Titel 4]
[Titel 5]

###KURZINHALT###
**Haupthandlung:**
[2-3 Sätze zur zentralen Handlung, Präsens, keine Markdown-Artefakte]

**Nebenhandlungen:**
[1-2 Sätze pro Nebenstrang, Präsens]

**Cliffhanger:**
[1 kurzer Satz, Spannung aufbauen ohne Auflösung zu verraten]

###REDAKTION###
[Dramaturgische Inhaltsangabe. Kein blumiger Stil. Rollennamen IMMER in GROSSBUCHSTABEN. Fokus: Was wollen die Figuren konkret (Want), was brauchen sie wirklich (Need)? Entscheidende Wendepunkte benennen. Cause-and-Effect zwischen Strands. Ein Absatz pro Strang. Strangmarkierung am Absatzanfang: CLIFF für Cliffhanger-Strang, PEN für Pending-Strang. Präsens, aktiv, 300-500 Wörter. Keine Sternchen oder Markdown.]

###PRESSE###
[60-80 Wörter. Fließend, werblich, Neugier weckend. Keine Wendungen oder Cliffhanger verraten. Kein Spoiler. Keine Markdown-Formatierung.]

###STRAENGE###
[Pro Handlungsstrang eine Zeile: "FIGURENNAME: Kurzbeschreibung" — maximal 100 Zeichen pro Zeile. Keine Markdown-Formatierung.]`

    const raw = await callProvider(setting, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], 2000)

    await recordUsage(setting.provider, setting.model_name || '',
      Math.ceil(userPrompt.length / 4), Math.ceil(raw.length / 4))

    const sections = parseKiSections(raw)

    // Titel parsen (liste von Zeilen)
    const titelRaw = sections['TITEL'] || ''
    const titel = titelRaw.split('\n')
      .map((t: string) => t.replace(/^[\d\.\-\*\[\]\s]+/, '').replace(/[*#"„"[\]]/g, '').trim())
      .filter((t: string) => t.length > 0 && t.length <= 60)
      .slice(0, 5)

    res.json({
      titel,
      kurzinhalt: sections['KURZINHALT'] || '',
      redaktion: cleanKiText(sections['REDAKTION'] || ''),
      presse: cleanKiText(sections['PRESSE'] || ''),
      straenge: cleanKiText(sections['STRAENGE'] || ''),
      folge_id,
      folge_nummer: data.werkstufe.folge_nummer,
      szenen_count: data.szenen.length,
      provider: setting.provider,
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
