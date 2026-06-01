import { Router } from 'express'
import { query, queryOne } from '../db'
import { authMiddleware } from '../auth'
import { getProviderApiKey, recordUsage } from './ki'

export const planungRouter = Router()
planungRouter.use(authMiddleware)

// ── Shared KI-helper ──────────────────────────────────────────────────────────

async function getBeatKurztextSetting() {
  return await queryOne('SELECT * FROM ki_settings WHERE funktion = $1', ['beat_kurztext'])
}

async function callMistralSingle(apiKey: string, model: string, prompt: string): Promise<string> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 25000)
  try {
    const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 120,
        temperature: 0.2,
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

async function callOllamaSingle(model: string, prompt: string): Promise<string> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 30000)
  try {
    const res = await fetch('http://127.0.0.1:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false }),
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`Ollama ${res.status}`)
    const data = await res.json() as any
    return (data.response || '').trim()
  } finally {
    clearTimeout(t)
  }
}

async function logKiAudit(opts: {
  funktion: string; provider: string; model: string
  input_summary: string; output_summary: string; item_count: number
  tokens_in: number; tokens_out: number; user_id?: string
}) {
  try {
    await query(
      `INSERT INTO ki_audit_log
         (funktion, provider, model, input_summary, output_summary, item_count, tokens_in, tokens_out, user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        opts.funktion, opts.provider, opts.model,
        opts.input_summary, opts.output_summary, opts.item_count,
        opts.tokens_in, opts.tokens_out, opts.user_id ?? null,
      ]
    )
  } catch { /* non-critical */ }
}

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/planung/board?produktion_id=X
// Liefert alle Stränge + alle Future-Beats (inkl. beat_charaktere) in einem
// Query — vermeidet N+1 beim Board-Rendering.
// ══════════════════════════════════════════════════════════════════════════════
planungRouter.get('/board', async (req, res) => {
  const { produktion_id } = req.query
  if (!produktion_id) return res.status(400).json({ error: 'produktion_id required' })

  try {
    const straenge = await query(
      `SELECT id, name, farbe, sort_order, status, typ, label, kurzinhalt,
              future_notizen, redaktionelle_kommentare, produktionelle_kommentare
       FROM straenge
       WHERE produktion_id = $1
       ORDER BY
         CASE status WHEN 'aktiv' THEN 0 WHEN 'ruhend' THEN 1 ELSE 2 END,
         sort_order, name`,
      [produktion_id]
    )

    const beats = await query(
      `SELECT
         sb.id, sb.strang_id, sb.ebene, sb.block_nummer,
         sb.beat_text, sb.prosa_text, sb.ist_abgearbeitet,
         sb.sort_order, sb.erstellt_am,
         COALESCE(
           json_agg(
             json_build_object(
               'character_id', bc.character_id,
               'name',         c.name,
               'rolle',        bc.rolle
             ) ORDER BY bc.rolle, c.name
           ) FILTER (WHERE bc.beat_id IS NOT NULL),
           '[]'
         ) AS charaktere
       FROM strang_beats sb
       JOIN straenge s ON s.id = sb.strang_id
       LEFT JOIN beat_charaktere bc ON bc.beat_id = sb.id
       LEFT JOIN characters c ON c.id = bc.character_id
       WHERE s.produktion_id = $1
         AND sb.ebene = 'future'
       GROUP BY sb.id, s.sort_order
       ORDER BY s.sort_order, sb.sort_order`,
      [produktion_id]
    )

    res.json({ straenge, beats })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/planung/beats/ki-kurztext
// Preview: leitet beat_text aus prosa_text ab — kein DB-Write.
// Body: { beat_ids?: string[], produktion_id: string }
//   beat_ids   = optional; fehlt → alle Beats mit prosa_text, aber ohne beat_text
//   produktion_id = Pflicht (für Beats die über strang verknüpft sind)
// Returns: { items: [{beat_id, prosa_text, vorschlag_beat_text, fehler?}], provider, model }
// ══════════════════════════════════════════════════════════════════════════════
planungRouter.post('/beats/ki-kurztext', async (req, res) => {
  const { beat_ids, produktion_id } = req.body
  if (!produktion_id) return res.status(400).json({ error: 'produktion_id required' })

  try {
    const setting = await getBeatKurztextSetting()
    if (!setting) return res.status(503).json({ error: 'KI-Funktion beat_kurztext nicht konfiguriert' })
    if (!setting.enabled) return res.status(503).json({ error: 'KI-Funktion beat_kurztext ist deaktiviert' })

    // Load beats: explicit list or auto-detect (prosa_text vorhanden, beat_text fehlt)
    let beats: any[]
    if (Array.isArray(beat_ids) && beat_ids.length > 0) {
      beats = await query(
        `SELECT sb.id, sb.prosa_text, sb.beat_text
         FROM strang_beats sb
         JOIN straenge s ON s.id = sb.strang_id
         WHERE sb.id = ANY($1) AND s.produktion_id = $2
           AND sb.prosa_text IS NOT NULL AND sb.prosa_text <> ''`,
        [beat_ids, produktion_id]
      )
    } else {
      beats = await query(
        `SELECT sb.id, sb.prosa_text, sb.beat_text
         FROM strang_beats sb
         JOIN straenge s ON s.id = sb.strang_id
         WHERE s.produktion_id = $1 AND sb.ebene = 'future'
           AND sb.prosa_text IS NOT NULL AND sb.prosa_text <> ''
           AND (sb.beat_text IS NULL OR sb.beat_text = '')`,
        [produktion_id]
      )
    }

    if (beats.length === 0) {
      return res.json({ items: [], provider: setting.provider, model: setting.model_name })
    }
    if (beats.length > 30) beats = beats.slice(0, 30) // Hard cap

    // Get API key
    let apiKey: string | null = null
    if (setting.provider !== 'ollama') {
      apiKey = await getProviderApiKey(setting.provider)
      if (!apiKey) return res.status(503).json({ error: `Kein API-Key für ${setting.provider}` })
    }

    const promptTemplate: string = setting.prompt || setting.default_prompt || ''
    const CONCURRENCY = 5

    // Process in parallel batches
    const items: any[] = []
    for (let i = 0; i < beats.length; i += CONCURRENCY) {
      const batch = beats.slice(i, i + CONCURRENCY)
      const results = await Promise.all(batch.map(async (b: any) => {
        const prompt = promptTemplate.replace('{{prosa_text}}', b.prosa_text)
        try {
          let text: string
          if (setting.provider === 'ollama') {
            text = await callOllamaSingle(setting.model_name, prompt)
          } else {
            text = await callMistralSingle(apiKey!, setting.model_name, prompt)
          }
          return { beat_id: b.id, prosa_text: b.prosa_text, vorschlag_beat_text: text.slice(0, 200) }
        } catch (err) {
          return { beat_id: b.id, prosa_text: b.prosa_text, vorschlag_beat_text: '', fehler: String(err) }
        }
      }))
      items.push(...results)
    }

    // Estimate tokens (rough: 4 chars ≈ 1 token)
    const tokensIn = Math.ceil(items.reduce((s, it) => s + (it.prosa_text?.length ?? 0), 0) / 4)
    const tokensOut = Math.ceil(items.reduce((s, it) => s + (it.vorschlag_beat_text?.length ?? 0), 0) / 4)

    await recordUsage(setting.provider, setting.model_name, tokensIn, tokensOut)
    await logKiAudit({
      funktion: 'beat_kurztext',
      provider: setting.provider,
      model: setting.model_name,
      input_summary: `${beats.length} Beats · ProduktionId: ${produktion_id}`,
      output_summary: items.slice(0, 3).map((it: any) => it.vorschlag_beat_text).join(' | '),
      item_count: items.length,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      user_id: (req as any).user?.user_id,
    })

    res.json({ items, provider: setting.provider, model: setting.model_name })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/planung/beats/ki-kurztext/commit
// Schreibt user-bestätigte beat_text-Werte in die DB.
// Body: { updates: [{beat_id: string, beat_text: string}][] }
// Returns: { updated: number }
// ══════════════════════════════════════════════════════════════════════════════
planungRouter.post('/beats/ki-kurztext/commit', async (req, res) => {
  const { updates } = req.body
  if (!Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({ error: 'updates array required' })
  }

  try {
    let updated = 0
    for (const u of updates) {
      if (!u.beat_id || typeof u.beat_text !== 'string') continue
      const row = await queryOne(
        `UPDATE strang_beats SET beat_text = $1 WHERE id = $2 RETURNING id`,
        [u.beat_text.trim() || null, u.beat_id]
      )
      if (row) updated++
    }
    res.json({ updated })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// Rollen-Einsatzplanung (Gantt)
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/planung/einsatz?produktion_id=X
// Returns { eintraege: RollenEinsatz[], characters: Character[] }
planungRouter.get('/einsatz', async (req, res) => {
  const { produktion_id } = req.query
  if (!produktion_id) return res.status(400).json({ error: 'produktion_id required' })

  try {
    const eintraege = await query(
      `SELECT re.id, re.character_id, re.block_von, re.block_bis, re.status, re.notiz,
              re.erstellt_am, c.name AS character_name, c.farbe AS character_farbe
       FROM rollen_einsatz re
       JOIN characters c ON c.id = re.character_id
       WHERE re.produktion_id = $1
       ORDER BY c.name, re.block_von`,
      [produktion_id]
    )

    // Alle aktiven Characters der Produktion (für Zeilen-Labels)
    const characters = await query(
      `SELECT c.id, c.name, c.farbe, cp.nummer
       FROM characters c
       JOIN character_productions cp ON cp.character_id = c.id
       WHERE cp.produktion_id = $1 AND cp.ist_aktiv = TRUE
       ORDER BY c.name`,
      [produktion_id]
    )

    res.json({ eintraege, characters })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/planung/einsatz
// Body: { produktion_id, character_id, block_von, block_bis, status?, notiz? }
planungRouter.post('/einsatz', async (req, res) => {
  const { produktion_id, character_id, block_von, block_bis, status, notiz } = req.body
  if (!produktion_id || !character_id || block_von == null || block_bis == null) {
    return res.status(400).json({ error: 'produktion_id, character_id, block_von, block_bis required' })
  }
  if (block_bis < block_von) return res.status(400).json({ error: 'block_bis must be >= block_von' })

  try {
    const row = await queryOne(
      `INSERT INTO rollen_einsatz (produktion_id, character_id, block_von, block_bis, status, notiz)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [produktion_id, character_id, block_von, block_bis, status ?? 'geplant', notiz ?? null]
    )
    // Attach character name/farbe
    const char = await queryOne('SELECT name, farbe FROM characters WHERE id = $1', [character_id])
    res.status(201).json({ ...row, character_name: char?.name, character_farbe: char?.farbe })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/planung/einsatz/:id
// Body: { block_von?, block_bis?, status?, notiz? }
planungRouter.put('/einsatz/:id', async (req, res) => {
  const { id } = req.params
  const { block_von, block_bis, status, notiz } = req.body

  try {
    const existing = await queryOne('SELECT * FROM rollen_einsatz WHERE id = $1', [id])
    if (!existing) return res.status(404).json({ error: 'Eintrag nicht gefunden' })

    const newVon = block_von ?? existing.block_von
    const newBis = block_bis ?? existing.block_bis
    if (newBis < newVon) return res.status(400).json({ error: 'block_bis must be >= block_von' })

    const row = await queryOne(
      `UPDATE rollen_einsatz
       SET block_von = $1, block_bis = $2, status = $3, notiz = $4
       WHERE id = $5 RETURNING *`,
      [newVon, newBis, status ?? existing.status, notiz !== undefined ? notiz : existing.notiz, id]
    )
    const char = await queryOne('SELECT name, farbe FROM characters WHERE id = $1', [row.character_id])
    res.json({ ...row, character_name: char?.name, character_farbe: char?.farbe })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/planung/einsatz/:id
planungRouter.delete('/einsatz/:id', async (req, res) => {
  const { id } = req.params
  try {
    await query('DELETE FROM rollen_einsatz WHERE id = $1', [id])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/planung/cast-abgleich?produktion_id=X
// Vergleicht rollen_einsatz mit beat_charaktere (Future-Beats).
// Schreibt Befunde in Tabelle befunde (UPSERT per identitaet).
// Returns { befunde: Befund[], summary: { luecken, ueberschuesse, gesamt } }
// ══════════════════════════════════════════════════════════════════════════════
planungRouter.post('/cast-abgleich', async (req, res) => {
  const { produktion_id } = req.query as { produktion_id?: string }
  if (!produktion_id) return res.status(400).json({ error: 'produktion_id required' })

  try {
    // 1. Alle Einsatz-Einträge für diese Produktion
    const eintraege = await query(
      `SELECT re.character_id, re.block_von, re.block_bis, c.name AS char_name
       FROM rollen_einsatz re
       JOIN characters c ON c.id = re.character_id
       WHERE re.produktion_id = $1`,
      [produktion_id]
    )

    // 2. Alle Future-Beats mit character-Tags für diese Produktion
    const beatChars = await query(
      `SELECT bc.character_id, sb.block_nummer, c.name AS char_name
       FROM beat_charaktere bc
       JOIN strang_beats sb ON sb.id = bc.beat_id
       JOIN straenge s ON s.id = sb.strang_id
       JOIN characters c ON c.id = bc.character_id
       WHERE s.produktion_id = $1 AND sb.ebene = 'future'
         AND sb.block_nummer IS NOT NULL`,
      [produktion_id]
    )

    // Build lookup: character_id → Set of block_nummern (from beats)
    const beatBlocksByChar = new Map<string, Set<number>>()
    for (const bc of beatChars) {
      if (!beatBlocksByChar.has(bc.character_id)) beatBlocksByChar.set(bc.character_id, new Set())
      beatBlocksByChar.get(bc.character_id)!.add(bc.block_nummer)
    }

    // Build lookup: character_id → Set of block_nummern (from einsatz)
    const einsatzBlocksByChar = new Map<string, { name: string; blocks: Set<number> }>()
    for (const e of eintraege) {
      if (!einsatzBlocksByChar.has(e.character_id)) {
        einsatzBlocksByChar.set(e.character_id, { name: e.char_name, blocks: new Set() })
      }
      for (let b = e.block_von; b <= e.block_bis; b++) {
        einsatzBlocksByChar.get(e.character_id)!.blocks.add(b)
      }
    }

    // Collect all relevant character_ids and block_nummern
    const allCharIds = new Set([...einsatzBlocksByChar.keys(), ...beatBlocksByChar.keys()])
    const allBlocks = new Set<number>()
    for (const e of eintraege) {
      for (let b = e.block_von; b <= e.block_bis; b++) allBlocks.add(b)
    }
    for (const bc of beatChars) allBlocks.add(bc.block_nummer)

    const newBefunde: Array<{
      typ: string; identitaet: string; rolle_id: string
      block_nummer: number; beschreibung: string
    }> = []

    for (const charId of allCharIds) {
      const charName = einsatzBlocksByChar.get(charId)?.name
        ?? beatChars.find((bc: any) => bc.character_id === charId)?.char_name
        ?? charId

      const einsatzBlocks = einsatzBlocksByChar.get(charId)?.blocks ?? new Set<number>()
      const beatBlocks    = beatBlocksByChar.get(charId) ?? new Set<number>()

      // Lücke: Einsatz-Block ohne Future-Beat
      for (const bn of einsatzBlocks) {
        if (!beatBlocks.has(bn)) {
          newBefunde.push({
            typ: 'cast_luecke',
            identitaet: `cast_luecke·${charId}·${bn}`,
            rolle_id: charId,
            block_nummer: bn,
            beschreibung: `${charName} ist in Block ${bn} im Einsatzplan eingetragen, hat aber keinen Future-Beat.`,
          })
        }
      }

      // Überschuss: Future-Beat ohne Einsatz-Eintrag
      for (const bn of beatBlocks) {
        if (!einsatzBlocks.has(bn)) {
          newBefunde.push({
            typ: 'cast_ueberschuss',
            identitaet: `cast_ueberschuss·${charId}·${bn}`,
            rolle_id: charId,
            block_nummer: bn,
            beschreibung: `${charName} hat in Block ${bn} einen Future-Beat, ist aber nicht im Einsatzplan.`,
          })
        }
      }
    }

    // UPSERT all new befunde; auto-close resolved ones
    for (const bf of newBefunde) {
      await query(
        `INSERT INTO befunde (produktion_id, typ, identitaet, rolle_id, block_nummer, beschreibung, status)
         VALUES ($1,$2,$3,$4,$5,$6,'offen')
         ON CONFLICT (produktion_id, identitaet)
         DO UPDATE SET status = 'offen', beschreibung = EXCLUDED.beschreibung`,
        [produktion_id, bf.typ, bf.identitaet, bf.rolle_id, bf.block_nummer, bf.beschreibung]
      )
    }

    // Auto-close befunde whose cause is resolved
    const newIdentitaeten = new Set(newBefunde.map(b => b.identitaet))
    await query(
      `UPDATE befunde
       SET status = 'auto_geloest', geloest_vermerk = 'Ursache durch Änderung behoben'
       WHERE produktion_id = $1
         AND typ IN ('cast_luecke','cast_ueberschuss')
         AND status = 'offen'
         AND identitaet != ALL($2::text[])`,
      [produktion_id, [...newIdentitaeten]]
    )

    // Return all open befunde for this produktion
    const offene = await query(
      `SELECT bf.*, c.name AS character_name
       FROM befunde bf
       LEFT JOIN characters c ON c.id = bf.rolle_id
       WHERE bf.produktion_id = $1 AND bf.status = 'offen'
       ORDER BY bf.block_nummer, bf.typ`,
      [produktion_id]
    )

    res.json({
      befunde: offene,
      summary: {
        luecken:      offene.filter((b: any) => b.typ === 'cast_luecke').length,
        ueberschuesse: offene.filter((b: any) => b.typ === 'cast_ueberschuss').length,
        gesamt: offene.length,
      },
    })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// Befund-Register
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/planung/befunde?produktion_id=X&status=offen|erledigt|auto_geloest|alle
planungRouter.get('/befunde', async (req, res) => {
  const { produktion_id, status } = req.query
  if (!produktion_id) return res.status(400).json({ error: 'produktion_id required' })

  try {
    const statusFilter = status === 'alle'
      ? ''
      : status === 'erledigt'
        ? `AND bf.status = 'erledigt'`
        : status === 'auto_geloest'
          ? `AND bf.status = 'auto_geloest'`
          : `AND bf.status = 'offen'`  // default

    const befunde = await query(
      `SELECT bf.*, c.name AS character_name
       FROM befunde bf
       LEFT JOIN characters c ON c.id = bf.rolle_id
       WHERE bf.produktion_id = $1 ${statusFilter}
       ORDER BY bf.status, bf.block_nummer, bf.typ`,
      [produktion_id]
    )
    res.json(befunde)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/planung/befunde/:id/erledigen
// Body: { vermerk?: string }
planungRouter.post('/befunde/:id/erledigen', async (req, res) => {
  const { id } = req.params
  const { vermerk } = req.body
  const userId = (req as any).user?.user_id ?? null

  try {
    const row = await queryOne(
      `UPDATE befunde
       SET status = 'erledigt', erledigt_von = $1, erledigt_am = NOW(), geloest_vermerk = $2
       WHERE id = $3 RETURNING *`,
      [userId, vermerk?.trim() || null, id]
    )
    if (!row) return res.status(404).json({ error: 'Befund nicht gefunden' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/planung/freigabe-check?produktion_id=X
// Check C: Rollen-Freigabe-Status + Bildbegrenzung
// Schreibt neue Befunde per UPSERT, schließt gelöste automatisch.
planungRouter.post('/freigabe-check', async (req, res) => {
  const { produktion_id } = req.query as { produktion_id?: string }
  if (!produktion_id) return res.status(400).json({ error: 'produktion_id required' })

  try {
    const newBefunde: Array<{
      typ: string; identitaet: string; rolle_id: string | null
      block_nummer: number | null; beschreibung: string
    }> = []

    // ── Sub-Check 1: Rollen-Freigabe-Status ────────────────────────────────
    // Alle Characters im Einsatzplan, die nicht freigegeben sind
    const nichtFreigegeben = await query(
      `SELECT DISTINCT re.character_id, c.name AS char_name,
              cp.freigabe_status
       FROM rollen_einsatz re
       JOIN characters c ON c.id = re.character_id
       LEFT JOIN character_productions cp ON cp.character_id = re.character_id
         AND cp.produktion_id = re.produktion_id
       WHERE re.produktion_id = $1
         AND (cp.freigabe_status IS NULL
              OR cp.freigabe_status NOT IN ('freigegeben', 'keine'))`,
      [produktion_id]
    )

    for (const r of nichtFreigegeben) {
      const statusLabel = r.freigabe_status === 'ausstehend' ? 'ausstehend'
        : r.freigabe_status === 'abgelehnt' ? 'abgelehnt'
        : 'nicht beantragt'
      newBefunde.push({
        typ: 'freigabe_ausstehend',
        identitaet: `freigabe_ausstehend·${r.character_id}`,
        rolle_id: r.character_id,
        block_nummer: null,
        beschreibung: `${r.char_name} ist im Einsatzplan, aber noch nicht freigegeben (Status: ${statusLabel}).`,
      })
    }

    // ── Sub-Check 2: Bildbegrenzung ────────────────────────────────────────
    const config = await queryOne(
      `SELECT ot_obergrenze_pro_block
       FROM rollen_freigabe_konfiguration
       WHERE production_id = $1`,
      [produktion_id]
    )
    const obergrenze: number | null = config?.ot_obergrenze_pro_block ?? null

    if (obergrenze !== null) {
      // Beats pro Block zählen
      const beatCounts = await query(
        `SELECT sb.block_nummer, COUNT(*) AS beat_count
         FROM strang_beats sb
         JOIN straenge s ON s.id = sb.strang_id
         WHERE s.produktion_id = $1 AND sb.ebene = 'future'
           AND sb.block_nummer IS NOT NULL
         GROUP BY sb.block_nummer`,
        [produktion_id]
      )

      for (const bc of beatCounts) {
        if (Number(bc.beat_count) > obergrenze) {
          newBefunde.push({
            typ: 'bild_obergrenze',
            identitaet: `bild_obergrenze·${bc.block_nummer}`,
            rolle_id: null,
            block_nummer: bc.block_nummer,
            beschreibung: `Block ${bc.block_nummer}: ${bc.beat_count} Beats, Obergrenze ist ${obergrenze}.`,
          })
        }
      }
    }

    // UPSERT
    for (const bf of newBefunde) {
      await query(
        `INSERT INTO befunde (produktion_id, typ, identitaet, rolle_id, block_nummer, beschreibung, status)
         VALUES ($1,$2,$3,$4,$5,$6,'offen')
         ON CONFLICT (produktion_id, identitaet)
         DO UPDATE SET status = 'offen', beschreibung = EXCLUDED.beschreibung`,
        [produktion_id, bf.typ, bf.identitaet, bf.rolle_id, bf.block_nummer, bf.beschreibung]
      )
    }

    // Auto-close resolved
    const newIds = new Set(newBefunde.map(b => b.identitaet))
    await query(
      `UPDATE befunde
       SET status = 'auto_geloest', geloest_vermerk = 'Ursache durch Änderung behoben'
       WHERE produktion_id = $1
         AND typ IN ('freigabe_ausstehend','bild_obergrenze')
         AND status = 'offen'
         AND identitaet != ALL($2::text[])`,
      [produktion_id, [...newIds]]
    )

    // Return all open befunde
    const offene = await query(
      `SELECT bf.*, c.name AS character_name
       FROM befunde bf
       LEFT JOIN characters c ON c.id = bf.rolle_id
       WHERE bf.produktion_id = $1 AND bf.status = 'offen'
       ORDER BY bf.block_nummer, bf.typ`,
      [produktion_id]
    )

    res.json({
      befunde: offene,
      summary: {
        freigabe: offene.filter((b: any) => b.typ === 'freigabe_ausstehend').length,
        bilder:   offene.filter((b: any) => b.typ === 'bild_obergrenze').length,
        gesamt: offene.length,
      },
    })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/planung/cast-abgleich/check?produktion_id=X&character_id=Y&block_nummer=N
// Präventiver Check: Hat diese Rolle einen rollen_einsatz-Eintrag für diesen Block?
// Wird vom Future-Board vor dem Entfernen eines Character-Tags aufgerufen.
planungRouter.get('/cast-abgleich/check', async (req, res) => {
  const { produktion_id, character_id, block_nummer } = req.query
  if (!produktion_id || !character_id || block_nummer == null) {
    return res.status(400).json({ error: 'produktion_id, character_id, block_nummer required' })
  }
  try {
    const row = await queryOne(
      `SELECT re.id, re.status, c.name AS character_name
       FROM rollen_einsatz re
       JOIN characters c ON c.id = re.character_id
       WHERE re.produktion_id = $1
         AND re.character_id = $2
         AND re.block_von <= $3 AND re.block_bis >= $3`,
      [produktion_id, character_id, Number(block_nummer)]
    )
    res.json({ hat_einsatz: !!row, einsatz: row ?? null })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})
