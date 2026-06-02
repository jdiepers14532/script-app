import { Router } from 'express'
import fetch from 'node-fetch'
import { query, queryOne } from '../db'
import { authMiddleware } from '../auth'
import { getProviderApiKey } from './ki'
import { extractText } from '../utils/tiptapText'

export const planungKiRouter = Router()
planungKiRouter.use(authMiddleware)

// ── KI-Helper ─────────────────────────────────────────────────────────────────

async function getMistralKey(): Promise<string | null> {
  return getProviderApiKey('mistral')
}

async function callMistral(apiKey: string, prompt: string, maxTokens = 3000): Promise<string> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 90000)
  try {
    const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'mistral-large-latest',
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

async function setRunStatus(runId: string, status: string, extra?: { ergebnis_json?: any; fehler?: string }) {
  const updates: string[] = ['status = $1', 'abgeschlossen_am = NOW()']
  const params: any[] = [status]
  if (extra?.ergebnis_json !== undefined) {
    params.push(JSON.stringify(extra.ergebnis_json))
    updates.push(`ergebnis_json = $${params.length}`)
  }
  if (extra?.fehler !== undefined) {
    params.push(extra.fehler)
    updates.push(`fehler = $${params.length}`)
  }
  params.push(runId)
  await query(
    `UPDATE planung_runs SET ${updates.join(', ')} WHERE id = $${params.length}`,
    params
  )
}

// ── Storyline-Abgleich ────────────────────────────────────────────────────────

async function runStorylineAbgleich(runId: string, produktionId: string) {
  try {
    await query(`UPDATE planung_runs SET status = 'running' WHERE id = $1`, [runId])

    const apiKey = await getMistralKey()
    if (!apiKey) throw new Error('Kein Mistral-API-Key konfiguriert')

    // Storyline-Werkstufen laden
    const werkstufenRows = await query(
      `SELECT DISTINCT ON (f.folge_nummer)
         w.id, f.folge_nummer
       FROM werkstufen w
       JOIN folgen f ON f.id = w.folge_id
       WHERE f.produktion_id = $1
         AND w.typ = 'storyline'
         AND w.sichtbarkeit != 'privat'
       ORDER BY f.folge_nummer, w.version_nummer DESC`,
      [produktionId]
    )

    if (werkstufenRows.length === 0) {
      await setRunStatus(runId, 'done', {
        ergebnis_json: { abweichungen: [], hinweis: 'Keine Storyline-Werkstufen gefunden.' },
      })
      return
    }

    const werkstufenIds = werkstufenRows.map((w: any) => w.id)

    // Szenen-Inhalte laden
    const szenenRows = await query(
      `SELECT ds.content, ds.scene_nummer, f.folge_nummer
       FROM dokument_szenen ds
       JOIN werkstufen w ON w.id = ds.werkstufe_id
       JOIN folgen f ON f.id = w.folge_id
       WHERE ds.werkstufe_id = ANY($1)
         AND ds.geloescht = FALSE
       ORDER BY f.folge_nummer, ds.sort_order`,
      [werkstufenIds]
    )

    // Text pro Folge zusammenführen (max 400 Zeichen pro Szene, gesamt max 6000)
    const storylineTexte: string[] = []
    let totalLen = 0
    for (const s of szenenRows) {
      if (totalLen >= 6000) break
      const text = extractText(s.content).trim()
      if (!text) continue
      const snippet = `[Folge ${s.folge_nummer}]: ${text.slice(0, 400)}`
      storylineTexte.push(snippet)
      totalLen += snippet.length
    }

    // Future-Beats laden (max 80 Beats)
    const futureBeats = await query(
      `SELECT sb.block_nummer, sb.beat_text, sb.prosa_text, s.name AS strang_name
       FROM strang_beats sb
       JOIN straenge s ON s.id = sb.strang_id
       WHERE s.produktion_id = $1 AND sb.ebene = 'future'
         AND sb.block_nummer IS NOT NULL
       ORDER BY sb.block_nummer, s.sort_order
       LIMIT 80`,
      [produktionId]
    )

    const futureText = futureBeats.map((b: any) =>
      `[Block ${b.block_nummer} / ${b.strang_name}]: ${b.beat_text || b.prosa_text || '(kein Text)'}`
    ).join('\n')

    const prompt = `Du bist ein Story-Analyst für eine deutsche TV-Soap. Vergleiche die folgenden Storyline-Texte mit den Future-Beats und identifiziere Abweichungen.

STORYLINE-TEXTE:
${storylineTexte.join('\n')}

FUTURE-BEATS:
${futureText}

Aufgabe: Finde inhaltliche Abweichungen, fehlende Entwicklungen und Widersprüche zwischen Storyline und Future-Planung.

Antworte AUSSCHLIESSLICH in diesem Format:
###JSON_START###
{
  "abweichungen": [
    {
      "strang_name": "Name des Strangs",
      "typ": "fehlt_in_future",
      "beschreibung": "Konkrete Beschreibung der Abweichung",
      "quellentext": "Relevanter Textausschnitt (max 100 Zeichen)"
    }
  ]
}
###JSON_END###

Typen: "fehlt_in_future" (Storyline-Entwicklung im Future nicht geplant), "fehlt_in_storyline" (Future-Beat hat keine Storyline-Grundlage), "widerspruch" (direkter inhaltlicher Widerspruch).
Maximal 20 Einträge. Falls keine Abweichungen: leeres Array.`

    const raw = await callMistral(apiKey, prompt)
    const parsed = parseJsonBlock(raw)

    if (!parsed) {
      await setRunStatus(runId, 'error', { fehler: 'KI-Antwort konnte nicht geparst werden' })
      return
    }

    await setRunStatus(runId, 'done', { ergebnis_json: parsed })

    // KI-Audit-Log
    await query(
      `INSERT INTO ki_audit_log (funktion, input_summary, output_summary, item_count, provider, model, tokens_in, tokens_out)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      ['storyline_abgleich', prompt.slice(0, 200), raw.slice(0, 200),
        (parsed.abweichungen || []).length, 'mistral', 'mistral-large-latest',
        Math.round(prompt.length / 4), Math.round(raw.length / 4)]
    ).catch(() => {})
  } catch (err: any) {
    await setRunStatus(runId, 'error', { fehler: String(err) }).catch(() => {})
  }
}

// ── Beziehungswiderspruch-Check ───────────────────────────────────────────────

async function runBeziehungsCheck(runId: string, produktionId: string) {
  try {
    await query(`UPDATE planung_runs SET status = 'running' WHERE id = $1`, [runId])

    const apiKey = await getMistralKey()
    if (!apiKey) throw new Error('Kein Mistral-API-Key konfiguriert')

    // Beziehungen laden
    const beziehungen = await query(
      `SELECT
         cb.beziehungstyp, cb.label, cb.status AS bez_status,
         cb.notiz,
         c1.name AS char_a, c1.id AS char_a_id,
         c2.name AS char_b
       FROM charakter_beziehungen cb
       JOIN characters c1 ON c1.id = cb.character_id
       JOIN characters c2 ON c2.id = cb.related_character_id
       JOIN character_productions cp ON cp.character_id = c1.id
         AND cp.produktion_id = $1 AND cp.ist_aktiv = TRUE
       ORDER BY c1.name, cb.beziehungstyp`,
      [produktionId]
    )

    if (beziehungen.length === 0) {
      await setRunStatus(runId, 'done', {
        ergebnis_json: { widersprueche: [], hinweis: 'Keine Bible-Beziehungen gepflegt.' },
      })
      return
    }

    // Aktive Charakter-IDs für Szenen-Lookup
    const charIds = [...new Set(beziehungen.map((b: any) => b.char_a_id))]

    // Letzte Szenen mit Beteiligung dieser Charaktere (max 30 Szenen)
    const szenenRows = await query(
      `SELECT DISTINCT ON (ds.id)
         ds.id, ds.scene_nummer, ds.content, f.folge_nummer,
         c.name AS char_name
       FROM dokument_szenen ds
       JOIN werkstufen w ON w.id = ds.werkstufe_id
       JOIN folgen f ON f.id = w.folge_id
       JOIN scene_characters sc ON sc.scene_identity_id = ds.scene_identity_id
       JOIN characters c ON c.id = sc.character_id
       WHERE f.produktion_id = $1
         AND sc.character_id = ANY($2::uuid[])
         AND ds.geloescht = FALSE
         AND w.typ IN ('drehbuch','storyline')
       ORDER BY ds.id, f.folge_nummer DESC, ds.sort_order DESC
       LIMIT 30`,
      [produktionId, charIds]
    )

    const beziehungenText = beziehungen.slice(0, 40).map((b: any) =>
      `${b.char_a} → ${b.beziehungstyp}${b.label ? ' (' + b.label + ')' : ''} → ${b.char_b}${b.bez_status && b.bez_status !== 'aktiv' ? ' [' + b.bez_status + ']' : ''}${b.notiz ? ': ' + b.notiz.slice(0, 80) : ''}`
    ).join('\n')

    const szenenText = szenenRows.slice(0, 20).map((s: any) => {
      const text = extractText(s.content).trim().slice(0, 300)
      return `[Szene ${s.scene_nummer}, Folge ${s.folge_nummer}]: ${text}`
    }).join('\n\n')

    const prompt = `Du bist ein Story-Analyst für eine deutsche TV-Soap. Prüfe ob der folgende Szenentext Widersprüche zu den definierten Figurenbeziehungen enthält.

FIGURENBEZIEHUNGEN (aus der Bible):
${beziehungenText}

SZENENTEXT (aktuelle Folgen):
${szenenText}

Aufgabe: Identifiziere konkrete Widersprüche zwischen den definierten Beziehungen und dem Szenentext (Tonfall, Verhalten, Informationsstand).

Antworte AUSSCHLIESSLICH in diesem Format:
###JSON_START###
{
  "widersprueche": [
    {
      "charakter_a": "Name",
      "charakter_b": "Name",
      "beschreibung": "Konkrete Beschreibung des Widerspruchs",
      "quellentext": "Textausschnitt der den Widerspruch zeigt (max 100 Zeichen)"
    }
  ]
}
###JSON_END###

Maximal 15 Einträge. Nur echte, klar belegbare Widersprüche.`

    const raw = await callMistral(apiKey, prompt)
    const parsed = parseJsonBlock(raw)

    if (!parsed) {
      await setRunStatus(runId, 'error', { fehler: 'KI-Antwort konnte nicht geparst werden' })
      return
    }

    await setRunStatus(runId, 'done', { ergebnis_json: parsed })

    // KI-Audit-Log
    await query(
      `INSERT INTO ki_audit_log (funktion, input_summary, output_summary, item_count, provider, model, tokens_in, tokens_out)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      ['beziehungs_check', prompt.slice(0, 200), raw.slice(0, 200),
        (parsed.widersprueche || []).length, 'mistral', 'mistral-large-latest',
        Math.round(prompt.length / 4), Math.round(raw.length / 4)]
    ).catch(() => {})
  } catch (err: any) {
    await setRunStatus(runId, 'error', { fehler: String(err) }).catch(() => {})
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/planung-ki/storyline-abgleich?produktion_id=X
// ══════════════════════════════════════════════════════════════════════════════
planungKiRouter.post('/storyline-abgleich', async (req, res) => {
  const { produktion_id } = req.query as { produktion_id?: string }
  if (!produktion_id) return res.status(400).json({ error: 'produktion_id required' })

  const userId = (req as any).user?.user_id ?? null
  try {
    const run = await queryOne(
      `INSERT INTO planung_runs (produktion_id, typ, erstellt_von)
       VALUES ($1,'storyline_abgleich',$2) RETURNING id`,
      [produktion_id, userId]
    )
    res.json({ run_id: run!.id, status: 'queued' })
    setImmediate(() => runStorylineAbgleich(run!.id, produktion_id))
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/planung-ki/beziehungs-check?produktion_id=X
// ══════════════════════════════════════════════════════════════════════════════
planungKiRouter.post('/beziehungs-check', async (req, res) => {
  const { produktion_id } = req.query as { produktion_id?: string }
  if (!produktion_id) return res.status(400).json({ error: 'produktion_id required' })

  const userId = (req as any).user?.user_id ?? null
  try {
    const run = await queryOne(
      `INSERT INTO planung_runs (produktion_id, typ, erstellt_von)
       VALUES ($1,'beziehungs_check',$2) RETURNING id`,
      [produktion_id, userId]
    )
    res.json({ run_id: run!.id, status: 'queued' })
    setImmediate(() => runBeziehungsCheck(run!.id, produktion_id))
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/planung-ki/runs/:id
// ══════════════════════════════════════════════════════════════════════════════
planungKiRouter.get('/runs/:id', async (req, res) => {
  try {
    const run = await queryOne(
      `SELECT id, typ, status, ergebnis_json, fehler, erstellt_am, abgeschlossen_am
       FROM planung_runs WHERE id = $1`,
      [req.params.id]
    )
    if (!run) return res.status(404).json({ error: 'Run nicht gefunden' })
    res.set('Cache-Control', 'no-store')
    res.json(run)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/planung-ki/runs/:id/commit-befunde
// Body: { accepted: [{beschreibung, rolle_id?, block_nummer?, typ?}] }
// Schreibt akzeptierte Einträge als Befunde (UPSERT per identitaet).
// ══════════════════════════════════════════════════════════════════════════════
planungKiRouter.post('/runs/:id/commit-befunde', async (req, res) => {
  const { id } = req.params
  const { accepted } = req.body
  if (!Array.isArray(accepted)) return res.status(400).json({ error: 'accepted muss Array sein' })

  try {
    const run = await queryOne(
      `SELECT produktion_id, typ FROM planung_runs WHERE id = $1`,
      [id]
    )
    if (!run) return res.status(404).json({ error: 'Run nicht gefunden' })

    const befundTyp = run.typ === 'storyline_abgleich' ? 'storyline_abweichung' : 'beziehungswiderspruch'
    let count = 0

    for (const item of accepted) {
      const beschreibung: string = (item.beschreibung || '').trim()
      if (!beschreibung) continue

      // Stabile Identität: hash aus typ + beschreibung-Anfang
      const identBase = beschreibung.slice(0, 80).replace(/\s+/g, '_').toLowerCase()
      const identitaet = `${befundTyp}·${identBase}`

      await query(
        `INSERT INTO befunde
           (produktion_id, typ, identitaet, rolle_id, block_nummer, beschreibung, status)
         VALUES ($1,$2,$3,$4,$5,$6,'offen')
         ON CONFLICT (produktion_id, identitaet)
         DO UPDATE SET status = 'offen', beschreibung = EXCLUDED.beschreibung`,
        [
          run.produktion_id,
          befundTyp,
          identitaet,
          item.rolle_id ?? null,
          item.block_nummer ?? null,
          beschreibung,
        ]
      )
      count++
    }

    res.json({ created: count })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})
