// Transkriptionen — Eingangskanal A2 (Handoff 5, Phase 7):
// Sitzungs-/Besprechungs-Transkript → KI → kategorisierte Entwürfe → menschliche Sichtung.
// Entwürfe leben in anmerkung_entwurf (Staging) — NIEMALS auto-angewendet. Erst "Übernehmen"
// erzeugt einen echten anker + eine echte anmerkung (gleiche Pfade wie POST /api/anmerkungen).
import { Router, Request } from 'express'
import { pool, query, queryOne } from '../db'
import { authMiddleware } from '../auth'
import { getKiSetting, callProvider, applyPromptTemplate, effectivePrompt, recordUsage } from './ki'
import { sceneBlocks, Selektor } from '../utils/reanchor'

const QUELLEN = ['redaktion', 'produktion', 'sender', 'kunde', 'kostuem', 'ausstattung', 'requisite']

function istAutor(req: Request): boolean {
  return (req.user?.roles || []).filter(Boolean).length > 0
}

async function darfWerkstufeSehen(werkstufeId: string, userId: string, autor: boolean): Promise<boolean> {
  const row = await queryOne(`SELECT fn_werkstufe_sichtbar($1, $2, $3) AS ok`, [werkstufeId, userId, autor])
  return !!row?.ok
}

// Szenen einer Werkstufe (für KI-Kontext, Szenen-Mapping und Sichtungs-Dropdown).
async function getSzenen(werkstufeId: string): Promise<any[]> {
  return await query(
    `SELECT scene_identity_id, scene_nummer, scene_nummer_suffix, ort_name, int_ext, tageszeit, content
     FROM dokument_szenen
     WHERE werkstufe_id = $1 AND geloescht = false
     ORDER BY scene_nummer NULLS LAST, scene_nummer_suffix NULLS FIRST`,
    [werkstufeId]
  )
}

function szenenListe(szenen: any[]): string {
  return szenen.map(s => {
    const nr = `${s.scene_nummer ?? '?'}${s.scene_nummer_suffix ?? ''}`
    return `${nr}: ${s.ort_name ?? 'ohne Motiv'}${s.int_ext ? ` (${s.int_ext}${s.tageszeit ? `/${s.tageszeit}` : ''})` : ''}`
  }).join('\n')
}

// szene_hinweis (Szenennr. wie "12A" oder Motiv-Text) → Szene der Werkstufe + Match-Konfidenz.
function matchSzene(szenen: any[], hinweis: string | null): { szene: any | null; konfidenz: number | null } {
  if (!hinweis || !String(hinweis).trim()) return { szene: null, konfidenz: null }
  const h = String(hinweis).trim()

  // 1. Szenennummer (+ optionaler Suffix-Buchstabe), z.B. "12", "12A", "Szene 12a"
  const numMatch = h.match(/(\d+)\s*([A-Za-z])?/)
  if (numMatch) {
    const nummer = parseInt(numMatch[1])
    const suffix = (numMatch[2] ?? '').toUpperCase()
    const exakt = szenen.filter(s =>
      s.scene_nummer === nummer && ((s.scene_nummer_suffix ?? '').toUpperCase() === suffix))
    if (exakt.length === 1) return { szene: exakt[0], konfidenz: 0.9 }
    const nurNummer = szenen.filter(s => s.scene_nummer === nummer)
    if (nurNummer.length >= 1) return { szene: nurNummer[0], konfidenz: nurNummer.length === 1 ? 0.8 : 0.5 }
  }

  // 2. Motiv-/Ortsname (Teilstring, case-insensitiv)
  const lower = h.toLowerCase()
  const ortTreffer = szenen.filter(s => s.ort_name && (
    s.ort_name.toLowerCase().includes(lower) || lower.includes(s.ort_name.toLowerCase())))
  if (ortTreffer.length === 1) return { szene: ortTreffer[0], konfidenz: 0.7 }
  if (ortTreffer.length > 1) return { szene: ortTreffer[0], konfidenz: 0.4 }

  return { szene: null, konfidenz: null }
}

// Zitat im Szenen-content lokalisieren → Span-Selektor (gleiches Format wie Editor-Anker).
function locateZitat(content: any, zitat: string | null): { selektor: Selektor; node_id: string | null; konfidenz: number } | null {
  const needle = (zitat ?? '').trim()
  if (needle.length < 4) return null
  const blocks = sceneBlocks(content)
  const hits: { block_index: number; node_id: string | null; text: string; i: number }[] = []
  for (const b of blocks) {
    let i = -1
    while ((i = b.text.indexOf(needle, i + 1)) !== -1) {
      hits.push({ block_index: b.block_index, node_id: b.node_id ?? null, text: b.text, i })
    }
  }
  if (hits.length === 0) return null
  const h = hits[0]
  const CTX = 30
  return {
    selektor: {
      block_index: h.block_index,
      position: { start: h.i, end: h.i + needle.length },
      quote: {
        prefix: h.text.slice(Math.max(0, h.i - CTX), h.i),
        exact: needle,
        suffix: h.text.slice(h.i + needle.length, h.i + needle.length + CTX),
      },
    },
    node_id: h.node_id,
    konfidenz: hits.length === 1 ? 1 : 0.7,
  }
}

// KI-Antwort → JSON-Array (tolerant gegenüber Markdown-Fences/Begleittext).
function parseEntwuerfe(raw: string): any[] {
  const m = raw.match(/\[[\s\S]*\]/)
  if (!m) return []
  try {
    const arr = JSON.parse(m[0])
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}

// Entwurf-Row fürs Frontend (zitat/szene_hinweis bleiben als Sichtungs-Hilfen sichtbar).
function toDto(r: any): any {
  return {
    id: r.id, quelle_session: r.quelle_session,
    vorschlag_quelle: r.vorschlag_quelle, vorschlag_kategorie: r.vorschlag_kategorie,
    body: r.body, werkstufe_id: r.werkstufe_id, scene_identity_id: r.scene_identity_id,
    store: r.store, node_id: r.node_id, selektor: r.selektor,
    szene_hinweis: r.szene_hinweis, zitat: r.zitat, konfidenz: r.konfidenz,
    status: r.status, erstellt_am: r.erstellt_am, anmerkung_id: r.anmerkung_id,
  }
}

export const transkriptionenRouter = Router()
transkriptionenRouter.use(authMiddleware)

// ── POST /api/transkriptionen/auswerten { transcript, werkstufe_id, session_label? } ──
// KI wertet das Transkript in Entwürfe aus; Server mappt Szenen-Hinweis + Zitat → Anker-Vermutung.
// Erzeugt NUR anmerkung_entwurf-Zeilen (status='offen'), keine anker/anmerkung.
transkriptionenRouter.post('/auswerten', async (req, res) => {
  const { transcript, werkstufe_id, session_label } = req.body
  const user = req.user!
  if (!transcript || !String(transcript).trim()) return res.status(400).json({ error: 'transcript erforderlich' })
  if (!werkstufe_id) return res.status(400).json({ error: 'werkstufe_id erforderlich' })

  try {
    const sichtbar = await darfWerkstufeSehen(werkstufe_id, user.user_id, istAutor(req))
    if (!sichtbar) return res.status(403).json({ error: 'Keine Sicht auf diese Werkstufe' })

    const setting = await getKiSetting('transkript_auswertung')
    if (!setting?.enabled) {
      return res.status(409).json({ error: 'KI-Funktion "Transkript-Auswertung" ist nicht aktiviert (Admin → KI)' })
    }

    const szenen = await getSzenen(werkstufe_id)
    const prompt = applyPromptTemplate(effectivePrompt(setting), {
      szenen_liste: szenenListe(szenen).substring(0, 6000),
      transcript: String(transcript).substring(0, 30000),
    })

    let raw: string
    try {
      raw = await callProvider(setting, [{ role: 'user', content: prompt }], 2500)
      await recordUsage(setting.provider, setting.model_name || '', Math.ceil(prompt.length / 4), Math.ceil(raw.length / 4))
    } catch (err) {
      return res.status(502).json({ error: `KI-Aufruf fehlgeschlagen: ${String(err)}` })
    }

    const vorschlaege = parseEntwuerfe(raw)
    if (vorschlaege.length === 0) {
      return res.json({ entwuerfe: [], hinweis: 'Keine Anmerkungen im Transkript erkannt.' })
    }

    const rows: any[] = []
    for (const v of vorschlaege) {
      const text = typeof v?.text === 'string' ? v.text.trim() : ''
      if (!text) continue
      const quelle = QUELLEN.includes(v?.quelle) ? v.quelle : 'redaktion'
      const kategorie = typeof v?.kategorie === 'string' && v.kategorie.trim() ? v.kategorie.trim() : null
      const szeneHinweis = typeof v?.szene === 'string' && v.szene.trim() ? v.szene.trim() : null
      const zitat = typeof v?.zitat === 'string' && v.zitat.trim() ? v.zitat.trim() : null

      const { szene, konfidenz: szeneKonf } = matchSzene(szenen, szeneHinweis)
      let store: string | null = null
      let nodeId: string | null = null
      let selektor: Selektor | null = null
      let konfidenz: number | null = szeneKonf
      if (szene && zitat) {
        const loc = locateZitat(szene.content, zitat)
        if (loc) {
          store = 'content'
          nodeId = loc.node_id
          selektor = loc.selektor
          konfidenz = Math.min(szeneKonf ?? 1, loc.konfidenz)
        }
      }

      const row = await queryOne(
        `INSERT INTO anmerkung_entwurf
           (quelle_session, vorschlag_quelle, vorschlag_kategorie, body,
            werkstufe_id, scene_identity_id, store, node_id, selektor,
            szene_hinweis, zitat, konfidenz, erstellt_von)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING *`,
        [
          session_label ?? null, quelle, kategorie, JSON.stringify({ text }),
          werkstufe_id, szene?.scene_identity_id ?? null, store, nodeId,
          selektor ? JSON.stringify(selektor) : null,
          szeneHinweis, zitat, konfidenz, user.user_id,
        ]
      )
      rows.push(row)
    }
    res.status(201).json({ entwuerfe: rows.map(toDto) })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── GET /api/transkriptionen/entwuerfe?werkstufe_id=&status= — Sichtungsliste ──
// Liefert die Szenenliste der Werkstufe gleich mit (Dropdown in der Sichtungs-UI).
transkriptionenRouter.get('/entwuerfe', async (req, res) => {
  const user = req.user!
  const werkstufeId = req.query.werkstufe_id as string | undefined
  const status = (req.query.status as string) || 'offen'
  if (!werkstufeId) return res.status(400).json({ error: 'werkstufe_id erforderlich' })
  try {
    const sichtbar = await darfWerkstufeSehen(werkstufeId, user.user_id, istAutor(req))
    if (!sichtbar) return res.status(403).json({ error: 'Keine Sicht auf diese Werkstufe' })

    const params: any[] = [werkstufeId]
    let statusFilter = ''
    if (status !== 'alle') { params.push(status); statusFilter = 'AND status = $2' }
    const rows = await query(
      `SELECT * FROM anmerkung_entwurf WHERE werkstufe_id = $1 ${statusFilter} ORDER BY erstellt_am ASC`,
      params
    )
    const szenen = await getSzenen(werkstufeId)
    res.setHeader('Cache-Control', 'no-store')
    res.json({
      entwuerfe: rows.map(toDto),
      szenen: szenen.map(s => ({
        scene_identity_id: s.scene_identity_id,
        scene_nummer: s.scene_nummer, scene_nummer_suffix: s.scene_nummer_suffix,
        ort_name: s.ort_name,
      })),
    })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// Entwurf laden + Sichtbarkeits-Gate. Null → Response bereits gesendet.
async function loadEntwurf(req: Request, res: any): Promise<any | null> {
  const row = await queryOne(`SELECT * FROM anmerkung_entwurf WHERE id = $1`, [req.params.id])
  if (!row) { res.status(404).json({ error: 'Entwurf nicht gefunden' }); return null }
  if (row.werkstufe_id) {
    const sichtbar = await darfWerkstufeSehen(row.werkstufe_id, req.user!.user_id, istAutor(req))
    if (!sichtbar) { res.status(403).json({ error: 'Keine Sicht auf diesen Entwurf' }); return null }
  }
  return row
}

// ── PATCH /api/transkriptionen/entwuerfe/:id — Body/Quelle/Kategorie/Szene editieren ──
// Nur offene Entwürfe. Szenen-Wechsel: Zitat in der neuen Szene neu lokalisieren (sonst szenen-weit).
transkriptionenRouter.patch('/entwuerfe/:id', async (req, res) => {
  const { body, vorschlag_quelle, vorschlag_kategorie, scene_identity_id } = req.body
  try {
    const row = await loadEntwurf(req, res)
    if (!row) return
    if (row.status !== 'offen') return res.status(409).json({ error: 'Nur offene Entwürfe sind editierbar' })
    if (vorschlag_quelle !== undefined && !QUELLEN.includes(vorschlag_quelle)) {
      return res.status(400).json({ error: 'Ungültige quelle' })
    }

    let neu = { scene_identity_id: row.scene_identity_id, store: row.store, node_id: row.node_id, selektor: row.selektor, konfidenz: row.konfidenz }
    if (scene_identity_id !== undefined && scene_identity_id !== row.scene_identity_id) {
      neu = { scene_identity_id: scene_identity_id ?? null, store: null, node_id: null, selektor: null, konfidenz: scene_identity_id ? 1 : null }
      if (scene_identity_id && row.zitat) {
        const szene = await queryOne(
          `SELECT content FROM dokument_szenen
           WHERE werkstufe_id = $1 AND scene_identity_id = $2 AND geloescht = false`,
          [row.werkstufe_id, scene_identity_id]
        )
        const loc = szene ? locateZitat(szene.content, row.zitat) : null
        if (loc) neu = { scene_identity_id, store: 'content', node_id: loc.node_id, selektor: loc.selektor as any, konfidenz: loc.konfidenz }
      }
    }

    const updated = await queryOne(
      `UPDATE anmerkung_entwurf SET
         body = COALESCE($1, body),
         vorschlag_quelle = COALESCE($2, vorschlag_quelle),
         vorschlag_kategorie = CASE WHEN $3::boolean THEN $4 ELSE vorschlag_kategorie END,
         scene_identity_id = $5, store = $6, node_id = $7, selektor = $8, konfidenz = $9
       WHERE id = $10 RETURNING *`,
      [
        body != null ? JSON.stringify(body) : null,
        vorschlag_quelle ?? null,
        vorschlag_kategorie !== undefined, vorschlag_kategorie ?? null,
        neu.scene_identity_id, neu.store, neu.node_id,
        neu.selektor ? JSON.stringify(neu.selektor) : null, neu.konfidenz,
        req.params.id,
      ]
    )
    res.json(toDto(updated))
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── POST /api/transkriptionen/entwuerfe/:id/uebernehmen — Entwurf → echter anker + anmerkung ──
// Auto-Promotion ausgeschlossen: nur dieser explizite, menschliche Schritt erzeugt Anmerkungen.
// Szene ist Pflicht (die Anmerkungs-Flächen sind szenen-skopiert — ohne Szene wäre sie unsichtbar).
transkriptionenRouter.post('/entwuerfe/:id/uebernehmen', async (req, res) => {
  const user = req.user!
  try {
    const row = await loadEntwurf(req, res)
    if (!row) return
    if (row.status !== 'offen') return res.status(409).json({ error: 'Entwurf ist bereits gesichtet' })
    if (!row.scene_identity_id) return res.status(400).json({ error: 'Bitte zuerst eine Szene zuordnen' })

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const ankerRes = await client.query(
        `INSERT INTO anker (werkstufe_id, scene_identity_id, store, node_id, selektor)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [
          row.werkstufe_id, row.scene_identity_id,
          row.store ?? null, row.node_id ?? null,
          row.selektor ? JSON.stringify(row.selektor) : null,
        ]
      )
      const anker = ankerRes.rows[0]
      const anmRes = await client.query(
        `INSERT INTO anmerkung (anker_id, quelle, kategorie, body, erstellt_von)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [anker.id, row.vorschlag_quelle ?? 'redaktion', row.vorschlag_kategorie ?? null, JSON.stringify(row.body), user.user_id]
      )
      const updRes = await client.query(
        `UPDATE anmerkung_entwurf
         SET status = 'uebernommen', gesichtet_von = $1, gesichtet_am = now(), anmerkung_id = $2
         WHERE id = $3 RETURNING *`,
        [user.user_id, anmRes.rows[0].id, req.params.id]
      )
      await client.query('COMMIT')
      res.status(201).json({ entwurf: toDto(updRes.rows[0]), anmerkung: anmRes.rows[0], anker })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── POST /api/transkriptionen/entwuerfe/:id/verwerfen ──────────────────────────
transkriptionenRouter.post('/entwuerfe/:id/verwerfen', async (req, res) => {
  const user = req.user!
  try {
    const row = await loadEntwurf(req, res)
    if (!row) return
    if (row.status !== 'offen') return res.status(409).json({ error: 'Entwurf ist bereits gesichtet' })
    const updated = await queryOne(
      `UPDATE anmerkung_entwurf
       SET status = 'verworfen', gesichtet_von = $1, gesichtet_am = now()
       WHERE id = $2 RETURNING *`,
      [user.user_id, req.params.id]
    )
    res.json(toDto(updated))
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})
