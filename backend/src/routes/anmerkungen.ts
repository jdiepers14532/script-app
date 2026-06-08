import { Router, Request } from 'express'
import { pool, query, queryOne } from '../db'
import { authMiddleware } from '../auth'
import {
  AnkerRow, ResolveResult, resolveContentAnker, resolveKopffeld, KOPFFELD_WHITELIST,
} from '../utils/reanchor'
import { istAutorUser, getScriptUsers } from '../utils/scriptUsers'

const TIER1_ROLES = ['superadmin', 'geschaeftsfuehrung', 'herstellungsleitung']
const STATUS_WERTE = ['offen', 'in_arbeit', 'uebernommen', 'abgelehnt']

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

// p_ist_autor (Handoff 6): Autor = für die Script-App registriert (≥1 Rolle).
function istAutor(req: Request): boolean {
  return (req.user?.roles || []).filter(Boolean).length > 0
}

// Werkstufe -> { produktion_id, folge_id }. Null wenn Werkstufe nicht existiert.
async function getWerkstufeKontext(werkstufeId: string): Promise<{ produktion_id: string; folge_id: number } | null> {
  return await queryOne(
    `SELECT f.produktion_id, w.folge_id
     FROM werkstufen w JOIN folgen f ON f.id = w.folge_id
     WHERE w.id = $1`,
    [werkstufeId]
  )
}

// Sichtbarkeits-Gate (eine Quelle der Wahrheit): darf p_user die Werkstufe sehen?
async function darfWerkstufeSehen(werkstufeId: string, userId: string, autor: boolean): Promise<boolean> {
  const row = await queryOne(
    `SELECT fn_werkstufe_sichtbar($1, $2, $3) AS ok`,
    [werkstufeId, userId, autor]
  )
  return !!row?.ok
}

// Inline-DK-Check (repliziert requireDkAccess, V4): Tier-1 frei, sonst dk_settings_access scope='dk'.
// Als Funktion statt Middleware, weil produktion_id erst per DB-Lookup auflösbar ist (Getter sync).
async function hatDkZugriff(req: Request, produktionId: string): Promise<boolean> {
  const userRoles = req.user?.roles || (req.user?.role ? [req.user.role] : [])
  if (userRoles.some(r => TIER1_ROLES.includes(r))) return true
  const rows = await query(
    `SELECT 1 FROM dk_settings_access
     WHERE production_id = $1 AND scope = 'dk'
       AND ((access_type = 'user' AND identifier = $2)
         OR (access_type = 'rolle' AND identifier = ANY($3::text[])))`,
    [produktionId, req.user!.user_id, userRoles]
  )
  return rows.length > 0
}

// Szenen-Row (content + Kopffelder) zu (werkstufe, scene). Für Anker-Auflösung.
async function getSzene(werkstufeId: string, sceneIdentityId: string): Promise<any | null> {
  return await queryOne(
    `SELECT * FROM dokument_szenen
     WHERE werkstufe_id = $1 AND scene_identity_id = $2 AND geloescht = false`,
    [werkstufeId, sceneIdentityId]
  )
}

// Anker (DB-Row) gegen die zugehörige Szene auflösen. Liefert Status + (für content) block_index/Position.
function aufloesen(anker: AnkerRow, szene: any | null): ResolveResult {
  if (anker.store === 'kopffeld') {
    const val = szene && anker.feldname ? szene[anker.feldname] : null
    return resolveKopffeld(val)
  }
  if (anker.store !== 'content') {
    // Szenen-weiter Anker (store=NULL): verankert solange die Szene existiert.
    return {
      anker_status: szene ? 'verankert' : 'verwaist',
      konfidenz: szene ? 1 : null, block_index: null, node_id: anker.node_id, position: null,
    }
  }
  return resolveContentAnker(anker, szene?.content)
}

// ══════════════════════════════════════════════════════════════════════════════
// Anmerkungen-Router — /api/anmerkungen
// ══════════════════════════════════════════════════════════════════════════════
export const anmerkungenRouter = Router()
anmerkungenRouter.use(authMiddleware)

// ── POST /api/anmerkungen — Anker + Anmerkung anlegen ──────────────────────────
// Erstellen ist für JEDEN sichtbar-berechtigten User erlaubt (auch Nicht-Autoren:
// Review-Feedback). Nur Sichtbarkeits-Gate, kein DK-Recht.
anmerkungenRouter.post('/', async (req, res) => {
  const {
    werkstufe_id, konzept_version_id, future_version_id,
    scene_identity_id, store, node_id, feldname, selektor,
    quelle, kategorie, body,
  } = req.body
  const user = req.user!

  // Genau ein Ziel (spiegelt anker_genau_ein_ziel).
  const ziele = [werkstufe_id, konzept_version_id, future_version_id].filter(Boolean)
  if (ziele.length !== 1) {
    return res.status(400).json({ error: 'Genau ein Ziel (werkstufe_id | konzept_version_id | future_version_id) erforderlich' })
  }
  if (!quelle) return res.status(400).json({ error: 'quelle erforderlich' })
  if (body == null) return res.status(400).json({ error: 'body erforderlich' })

  // store-Validierung
  if (store && !['content', 'kopffeld'].includes(store)) {
    return res.status(400).json({ error: "store muss 'content' oder 'kopffeld' sein" })
  }
  if (store && !werkstufe_id) {
    return res.status(400).json({ error: 'store-Anker nur an einer Werkstufe möglich' })
  }
  // Weg B: content-Anker brauchen scene_identity_id (Pflicht-Scope); node_id ist optionaler Hinweis.
  if (store === 'content' && !scene_identity_id) {
    return res.status(400).json({ error: "store='content' braucht scene_identity_id" })
  }
  if (store === 'kopffeld') {
    if (!feldname) return res.status(400).json({ error: "store='kopffeld' braucht feldname" })
    if (!KOPFFELD_WHITELIST.has(feldname)) return res.status(400).json({ error: 'Unbekanntes Kopffeld' })
  }
  if (scene_identity_id && !werkstufe_id) {
    return res.status(400).json({ error: 'scene_identity_id nur an einer Werkstufe möglich' })
  }

  // Sichtbarkeits-Gate (nur bei Werkstufen-Ziel; Konzept/Future haben kein Werkstufen-Gate).
  if (werkstufe_id) {
    const sichtbar = await darfWerkstufeSehen(werkstufe_id, user.user_id, istAutor(req))
    if (!sichtbar) return res.status(403).json({ error: 'Keine Sicht auf diese Werkstufe' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const ankerRes = await client.query(
      `INSERT INTO anker
         (werkstufe_id, konzept_version_id, future_version_id, scene_identity_id,
          store, node_id, feldname, selektor)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        werkstufe_id ?? null, konzept_version_id ?? null, future_version_id ?? null,
        scene_identity_id ?? null, store ?? null, node_id ?? null, feldname ?? null,
        selektor ? JSON.stringify(selektor) : null,
      ]
    )
    const anker = ankerRes.rows[0]
    const anmRes = await client.query(
      `INSERT INTO anmerkung (anker_id, quelle, kategorie, body, erstellt_von)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [anker.id, quelle, kategorie ?? null, JSON.stringify(body), user.user_id]
    )
    await client.query('COMMIT')
    res.status(201).json({ anmerkung: anmRes.rows[0], anker })
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: String(err) })
  } finally {
    client.release()
  }
})

// ── GET /api/anmerkungen?folge_id=&werkstufe_id= — Liste mit Sichtbarkeits-Gate ─
// Jede Anmerkung mit serverseitig aufgelöstem Anker.
anmerkungenRouter.get('/', async (req, res) => {
  const user = req.user!
  const autor = istAutor(req)
  const folgeId = req.query.folge_id ? parseInt(req.query.folge_id as string) : null
  const werkstufeId = (req.query.werkstufe_id as string) || null
  if (!folgeId && !werkstufeId) {
    return res.status(400).json({ error: 'folge_id oder werkstufe_id erforderlich' })
  }

  try {
    const params: any[] = [user.user_id, autor]
    const where: string[] = []
    if (werkstufeId) {
      params.push(werkstufeId)
      where.push(`a.werkstufe_id = $${params.length}`)
    }
    if (folgeId) {
      params.push(folgeId)
      where.push(`a.werkstufe_id IN (SELECT id FROM werkstufen WHERE folge_id = $${params.length})`)
    }
    // Sichtbarkeits-Gate: nur Werkstufen-Anker, die der Anfragende sehen darf.
    // (Konzept/Future-Anker hier ausgeblendet — eigener Viewer, Schritt 1 = Werkstufen-Fläche.)
    const rows = await query(
      `SELECT an.*, a.werkstufe_id, a.konzept_version_id, a.future_version_id,
              a.scene_identity_id, a.store, a.node_id, a.feldname, a.selektor,
              a.anker_status, a.konfidenz,
              (SELECT COALESCE(array_agg(g.user_id ORDER BY g.gelesen_am), '{}')
                 FROM anmerkung_gelesen g WHERE g.anmerkung_id = an.id) AS gelesen_von,
              EXISTS (SELECT 1 FROM anmerkung_gelesen g
                       WHERE g.anmerkung_id = an.id AND g.user_id = $1) AS gelesen_von_mir
       FROM anmerkung an
       JOIN anker a ON a.id = an.anker_id
       WHERE a.werkstufe_id IS NOT NULL
         AND fn_werkstufe_sichtbar(a.werkstufe_id, $1, $2)
         ${where.length ? 'AND ' + where.join(' AND ') : ''}
       ORDER BY an.erstellt_am DESC`,
      params
    )

    // Anker je (werkstufe, scene) auflösen — Szene einmal pro Schlüssel laden.
    const szeneCache = new Map<string, any>()
    const items = []
    for (const r of rows) {
      const ankerRow: AnkerRow = {
        id: r.anker_id, store: r.store, node_id: r.node_id, feldname: r.feldname,
        selektor: r.selektor, scene_identity_id: r.scene_identity_id, werkstufe_id: r.werkstufe_id,
      }
      let szene: any | null = null
      if (r.werkstufe_id && r.scene_identity_id) {
        const key = `${r.werkstufe_id}:${r.scene_identity_id}`
        if (!szeneCache.has(key)) szeneCache.set(key, await getSzene(r.werkstufe_id, r.scene_identity_id))
        szene = szeneCache.get(key)
      }
      const aufgeloest = aufloesen(ankerRow, szene)
      items.push({
        anmerkung: {
          id: r.id, anker_id: r.anker_id, quelle: r.quelle, kategorie: r.kategorie,
          status: r.status, body: r.body, erstellt_von: r.erstellt_von, erstellt_am: r.erstellt_am,
          aufgeloest_von: r.aufgeloest_von, aufgeloest_am: r.aufgeloest_am, aufloesung: r.aufloesung,
          gelesen_von: r.gelesen_von ?? [], gelesen_von_mir: !!r.gelesen_von_mir,
        },
        anker: {
          id: r.anker_id, werkstufe_id: r.werkstufe_id, scene_identity_id: r.scene_identity_id,
          store: r.store, node_id: aufgeloest.node_id ?? r.node_id, feldname: r.feldname,
          selektor: r.selektor, anker_status: aufgeloest.anker_status,
          konfidenz: aufgeloest.konfidenz, block_index: aufgeloest.block_index, position: aufgeloest.position,
        },
      })
    }
    res.json({ items })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── GET /api/anmerkungen/taggbare-user — Auswahl fürs Person-Tagging ───────────
// Liefert die für die Script-App registrierten Nutzer (id, name). Das eigentliche
// Sichtbarkeits-Gate pro getaggtem User erfolgt serverseitig in POST …/tags.
anmerkungenRouter.get('/taggbare-user', async (_req, res) => {
  try {
    const users = await getScriptUsers()
    res.json(users.map(u => ({ id: u.id, name: u.name })))
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── GET /api/anmerkungen/counts?werkstufe_id= — Aggregat pro Szene für die Szenenliste ──
// total = alle Anmerkungen der Szene (alle Status); offen_ungelesen = offen/in_arbeit, die ICH
// noch nicht als gelesen markiert habe (steuert rot/grau pro Person).
anmerkungenRouter.get('/counts', async (req, res) => {
  const user = req.user!
  const autor = istAutor(req)
  const werkstufeId = req.query.werkstufe_id as string | undefined
  if (!werkstufeId) return res.status(400).json({ error: 'werkstufe_id erforderlich' })
  try {
    const rows = await query(
      `SELECT a.scene_identity_id,
              count(*)::int AS total,
              count(*) FILTER (WHERE an.status IN ('offen','in_arbeit')
                AND NOT EXISTS (SELECT 1 FROM anmerkung_gelesen g
                                WHERE g.anmerkung_id = an.id AND g.user_id = $1))::int AS offen_ungelesen
       FROM anmerkung an JOIN anker a ON a.id = an.anker_id
       WHERE a.werkstufe_id = $2 AND a.scene_identity_id IS NOT NULL
         AND fn_werkstufe_sichtbar(a.werkstufe_id, $1, $3)
       GROUP BY a.scene_identity_id`,
      [user.user_id, werkstufeId, autor]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── POST /api/anmerkungen/:id/gelesen — eigenen Lesestatus togglen (per User) ───
anmerkungenRouter.post('/:id/gelesen', async (req, res) => {
  const user = req.user!
  try {
    const row = await queryOne(
      `SELECT a.werkstufe_id
       FROM anmerkung an JOIN anker a ON a.id = an.anker_id WHERE an.id = $1`,
      [req.params.id]
    )
    if (!row) return res.status(404).json({ error: 'Anmerkung nicht gefunden' })
    if (row.werkstufe_id) {
      const sichtbar = await darfWerkstufeSehen(row.werkstufe_id, user.user_id, istAutor(req))
      if (!sichtbar) return res.status(403).json({ error: 'Keine Sicht auf diese Anmerkung' })
    }
    const existing = await queryOne(
      `SELECT 1 FROM anmerkung_gelesen WHERE anmerkung_id = $1 AND user_id = $2`,
      [req.params.id, user.user_id]
    )
    if (existing) {
      await query(`DELETE FROM anmerkung_gelesen WHERE anmerkung_id = $1 AND user_id = $2`, [req.params.id, user.user_id])
      res.json({ gelesen: false })
    } else {
      await query(`INSERT INTO anmerkung_gelesen (anmerkung_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [req.params.id, user.user_id])
      res.json({ gelesen: true })
    }
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── GET /api/anmerkungen/:id/kommentare — Thread laden (Sichtbarkeits-Gate) ─────
anmerkungenRouter.get('/:id/kommentare', async (req, res) => {
  const user = req.user!
  try {
    const row = await queryOne(
      `SELECT a.werkstufe_id
       FROM anmerkung an JOIN anker a ON a.id = an.anker_id WHERE an.id = $1`,
      [req.params.id]
    )
    if (!row) return res.status(404).json({ error: 'Anmerkung nicht gefunden' })
    if (row.werkstufe_id) {
      const sichtbar = await darfWerkstufeSehen(row.werkstufe_id, user.user_id, istAutor(req))
      if (!sichtbar) return res.status(403).json({ error: 'Keine Sicht auf diese Anmerkung' })
    }
    const kommentare = await query(
      `SELECT id, anmerkung_id, autor, body, erstellt_am
       FROM anmerkung_kommentar WHERE anmerkung_id = $1 ORDER BY erstellt_am ASC`,
      [req.params.id]
    )
    res.json(kommentare)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── PATCH /api/anmerkungen/:id/status — Übernehmen/Ablehnen (Autor + Freeze-Guard) ─
anmerkungenRouter.patch('/:id/status', async (req, res) => {
  const { status, aufloesung } = req.body
  const user = req.user!
  if (!STATUS_WERTE.includes(status)) {
    return res.status(400).json({ error: 'Ungültiger Status' })
  }
  try {
    const row = await queryOne(
      `SELECT an.id, a.werkstufe_id, a.konzept_version_id, a.future_version_id
       FROM anmerkung an JOIN anker a ON a.id = an.anker_id
       WHERE an.id = $1`,
      [req.params.id]
    )
    if (!row) return res.status(404).json({ error: 'Anmerkung nicht gefunden' })

    // Produktion bestimmen (für DK-Recht) + Freeze-Guard nur bei Werkstufen-Ziel.
    let produktionId: string | null = null
    if (row.werkstufe_id) {
      const ws = await queryOne(
        `SELECT w.eingefroren, f.produktion_id
         FROM werkstufen w JOIN folgen f ON f.id = w.folge_id WHERE w.id = $1`,
        [row.werkstufe_id]
      )
      if (!ws) return res.status(404).json({ error: 'Werkstufe nicht gefunden' })
      // FREEZE-GUARD (inline, V4): eingefrorene Werkstufe -> kein Auflösen.
      if (ws.eingefroren) return res.status(403).json({ code: 'FROZEN', error: 'Werkstufe ist eingefroren' })
      produktionId = ws.produktion_id
    } else {
      const v = await queryOne(
        `SELECT produktion_id FROM ${row.konzept_version_id ? 'konzept_versionen' : 'future_versionen'} WHERE id = $1`,
        [row.konzept_version_id ?? row.future_version_id]
      )
      produktionId = v?.produktion_id ?? null
    }

    // Auflösen = Autor-/DK-Recht (requireDkAccess: Tier-1 oder dk_settings_access scope='dk').
    if (!produktionId || !(await hatDkZugriff(req, produktionId))) {
      return res.status(403).json({ error: 'Kein Recht zum Auflösen (Übernehmen/Ablehnen)' })
    }

    // Übernehmen = NUR Status + Audit, KEIN Auto-Content. Ablehnen berührt keinen content.
    const istAufloesung = status === 'uebernommen' || status === 'abgelehnt'
    const updated = await queryOne(
      `UPDATE anmerkung SET
         status = $1,
         aufloesung = CASE WHEN $2 THEN $3 ELSE aufloesung END,
         aufgeloest_von = CASE WHEN $2 THEN $4 ELSE NULL END,
         aufgeloest_am = CASE WHEN $2 THEN now() ELSE NULL END
       WHERE id = $5 RETURNING *`,
      [status, istAufloesung, aufloesung ?? null, user.user_id, req.params.id]
    )
    res.json(updated)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── POST /api/anmerkungen/:id/kommentare — Thread ──────────────────────────────
anmerkungenRouter.post('/:id/kommentare', async (req, res) => {
  const { body } = req.body
  const user = req.user!
  if (body == null) return res.status(400).json({ error: 'body erforderlich' })
  try {
    const row = await queryOne(
      `SELECT a.werkstufe_id
       FROM anmerkung an JOIN anker a ON a.id = an.anker_id WHERE an.id = $1`,
      [req.params.id]
    )
    if (!row) return res.status(404).json({ error: 'Anmerkung nicht gefunden' })
    // Sichtbarkeits-Gate: nur kommentieren, was man sehen darf.
    if (row.werkstufe_id) {
      const sichtbar = await darfWerkstufeSehen(row.werkstufe_id, user.user_id, istAutor(req))
      if (!sichtbar) return res.status(403).json({ error: 'Keine Sicht auf diese Anmerkung' })
    }
    const kommentar = await queryOne(
      `INSERT INTO anmerkung_kommentar (anmerkung_id, autor, body)
       VALUES ($1, $2, $3) RETURNING *`,
      [req.params.id, user.user_id, JSON.stringify(body)]
    )
    res.status(201).json(kommentar)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── POST /api/anmerkungen/:id/tags — Person-Tagging ────────────────────────────
// Pro getaggtem User Sichtbarkeits-Gate (kein Leak). Event-/Inbox-Emission folgt in Handoff 5
// (braucht v197 benachrichtigung) — hier nur die anmerkung_tag-Zeilen.
anmerkungenRouter.post('/:id/tags', async (req, res) => {
  const { user_ids } = req.body
  const user = req.user!
  if (!Array.isArray(user_ids) || user_ids.length === 0) {
    return res.status(400).json({ error: 'user_ids[] erforderlich' })
  }
  try {
    const row = await queryOne(
      `SELECT a.werkstufe_id
       FROM anmerkung an JOIN anker a ON a.id = an.anker_id WHERE an.id = $1`,
      [req.params.id]
    )
    if (!row) return res.status(404).json({ error: 'Anmerkung nicht gefunden' })

    const getaggt: string[] = []
    const uebersprungen: string[] = []
    for (const uid of user_ids) {
      const targetId = String(uid)
      // Sichtbarkeits-Gate des GETAGGTEN Users (p_ist_autor = hat Script-Rolle).
      if (row.werkstufe_id) {
        const autorTarget = await istAutorUser(targetId)
        const sichtbar = await darfWerkstufeSehen(row.werkstufe_id, targetId, autorTarget)
        if (!sichtbar) { uebersprungen.push(targetId); continue }
      }
      await query(
        `INSERT INTO anmerkung_tag (anmerkung_id, getaggter_user_id, erstellt_von)
         VALUES ($1, $2, $3)
         ON CONFLICT (anmerkung_id, getaggter_user_id) DO NOTHING`,
        [req.params.id, targetId, user.user_id]
      )
      getaggt.push(targetId)
      // Handoff 5: hier Event emittieren + benachrichtigung-Zeile (v197) anlegen.
    }
    res.status(201).json({ getaggt, uebersprungen })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// Anker-Router — /api/anker
// ══════════════════════════════════════════════════════════════════════════════
export const ankerRouter = Router()
ankerRouter.use(authMiddleware)

// ── POST /api/anker/resolve { werkstufe_id, anker_ids? } ───────────────────────
// Auflösung für Liste/Inbox/"prüfen"-Queue. Persistiert anker_status/konfidenz/node_id
// (node_id-Update bei szenenweitem Fund — Handoff 1 §3.2b).
ankerRouter.post('/resolve', async (req, res) => {
  const { werkstufe_id, anker_ids } = req.body
  const user = req.user!
  if (!werkstufe_id) return res.status(400).json({ error: 'werkstufe_id erforderlich' })
  try {
    const kontext = await getWerkstufeKontext(werkstufe_id)
    if (!kontext) return res.status(404).json({ error: 'Werkstufe nicht gefunden' })
    const sichtbar = await darfWerkstufeSehen(werkstufe_id, user.user_id, istAutor(req))
    if (!sichtbar) return res.status(403).json({ error: 'Keine Sicht auf diese Werkstufe' })

    const params: any[] = [werkstufe_id]
    let idFilter = ''
    if (Array.isArray(anker_ids) && anker_ids.length > 0) {
      params.push(anker_ids)
      idFilter = `AND id = ANY($2::uuid[])`
    }
    const anker = await query(
      `SELECT id, store, node_id, feldname, selektor, scene_identity_id, werkstufe_id
       FROM anker WHERE werkstufe_id = $1 ${idFilter}`,
      params
    )

    const szeneCache = new Map<string, any>()
    const result = []
    for (const a of anker as AnkerRow[]) {
      let szene: any | null = null
      if (a.scene_identity_id) {
        const key = `${a.werkstufe_id}:${a.scene_identity_id}`
        if (!szeneCache.has(key)) szeneCache.set(key, await getSzene(a.werkstufe_id!, a.scene_identity_id))
        szene = szeneCache.get(key)
      }
      const r = aufloesen(a, szene)
      // Persistieren: anker_status + konfidenz (Anker-Status). block_index/Quote bleiben im
      // selektor (nicht-autoritativer Hinweis) unangetastet; node_id optional aktualisiert.
      await query(
        `UPDATE anker SET anker_status = $1, konfidenz = $2,
           node_id = COALESCE($3, node_id) WHERE id = $4`,
        [r.anker_status, r.konfidenz, r.node_id, a.id]
      )
      result.push({ anker_id: a.id, anker_status: r.anker_status, konfidenz: r.konfidenz, block_index: r.block_index, node_id: r.node_id, position: r.position })
    }
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})
