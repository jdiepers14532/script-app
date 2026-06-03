import { Router } from 'express'
import { pool, query, queryOne } from '../db'
import { prodQuery } from '../prodDb'
import { authMiddleware } from '../auth'

// ── Konstanten ────────────────────────────────────────────────────────────────
const TIER1_ROLES = ['superadmin', 'geschaeftsfuehrung', 'herstellungsleitung']

// ── Berechtigungs-Middleware (settings-getrieben) ─────────────────────────────
// Liest beziehungsbaum_lesen_rollen / beziehungsbaum_schreiben_rollen aus
// app_settings. Leere/fehlende Einstellung = alle authentifizierten User erlaubt.

async function checkBeziehungenZugriff(userRoles: string[], mode: 'lesen' | 'schreiben'): Promise<boolean> {
  if (TIER1_ROLES.some(r => userRoles.includes(r))) return true
  const key = mode === 'lesen' ? 'beziehungsbaum_lesen_rollen' : 'beziehungsbaum_schreiben_rollen'
  try {
    const row = await queryOne('SELECT value FROM app_settings WHERE key = $1', [key])
    if (!row?.value) return true
    let allowed: string[] = []
    try { allowed = JSON.parse(row.value) } catch { return true }
    if (allowed.length === 0) return true
    return userRoles.some(r => allowed.includes(r))
  } catch {
    return false
  }
}

function requireBeziehungenAccess(mode: 'lesen' | 'schreiben') {
  return async (req: any, res: any, next: any) => {
    if (!req.user) return res.status(401).json({ error: 'Nicht authentifiziert' })
    const userRoles: string[] = req.user.roles || [req.user.role]
    if (TIER1_ROLES.some(r => userRoles.includes(r))) return next()

    const key = mode === 'lesen'
      ? 'beziehungsbaum_lesen_rollen'
      : 'beziehungsbaum_schreiben_rollen'
    try {
      const row = await queryOne('SELECT value FROM app_settings WHERE key = $1', [key])
      if (!row?.value) return next() // Default: alle erlaubt
      let allowed: string[] = []
      try { allowed = JSON.parse(row.value) } catch { return next() }
      if (allowed.length === 0) return next() // Leeres Array = alle erlaubt
      if (!userRoles.some(r => allowed.includes(r))) {
        return res.status(403).json({ error: 'Kein Zugriff auf Beziehungsbaum' })
      }
      next()
    } catch (err) {
      console.error('Beziehungen access check error:', err)
      return res.status(500).json({ error: 'Zugriffsprüfung fehlgeschlagen' })
    }
  }
}

// ── Snapshot-Helper ──────────────────────────────────────────────────────────
// Gibt alle Kanten für Reihe+Staffel zurück (inkl. Typ-Styling-Felder).
async function snapshotEdges(reihenId: string, staffelN: number): Promise<any[]> {
  return query(`
    SELECT cb.id, cb.character_id, cb.related_character_id, cb.beziehungstyp,
           cb.label, cb.status, cb.seit_block, cb.bis_block, cb.notiz,
           cb.reihen_id, cb.gueltig_ab_staffel, cb.gueltig_bis_staffel,
           cb.staerke, cb.herkunft, cb.quell_url, cb.quell_abruf_am,
           bt.label     AS typ_label,
           bt.kategorie AS typ_kategorie,
           bt.gerichtet,
           bt.farbe,
           bt.linienstil
    FROM charakter_beziehungen cb
    LEFT JOIN beziehungstypen bt ON bt.key = cb.beziehungstyp
    WHERE cb.reihen_id = $1
      AND cb.gueltig_ab_staffel <= $2
      AND (cb.gueltig_bis_staffel IS NULL OR cb.gueltig_bis_staffel >= $2)
    ORDER BY cb.id
  `, [reihenId, staffelN])
}

// Paar-Typ-Schlüssel für Diff-Vergleich (ungerichtet: kleinere UUID zuerst)
function edgeKey(e: any): string {
  const [a, b] = e.character_id < e.related_character_id
    ? [e.character_id, e.related_character_id]
    : [e.related_character_id, e.character_id]
  return `${a}:${b}:${e.beziehungstyp}`
}

// ── Überlappungscheck: gibt true zurück wenn ein Segment kollodiert ────────────
// Bedingung: [newAb, newBis] überlappt existierendes [ab, bis], richtungsunabhängig
async function hasOverlap(
  reihenId: string,
  charId: string, relatedId: string,
  typ: string,
  ab: number, bis: number | null,
  excludeId?: number
): Promise<boolean> {
  const INFINITY = 999999
  const bisVal = bis ?? INFINITY
  const rows = await query(`
    SELECT 1 FROM charakter_beziehungen
    WHERE reihen_id = $1
      AND beziehungstyp = $2
      AND ((character_id = $3 AND related_character_id = $4)
        OR (character_id = $4 AND related_character_id = $3))
      AND gueltig_ab_staffel <= $6
      AND COALESCE(gueltig_bis_staffel, $7) >= $5
      ${excludeId !== undefined ? 'AND id <> $8' : ''}
    LIMIT 1
  `, excludeId !== undefined
    ? [reihenId, typ, charId, relatedId, ab, bisVal, INFINITY, excludeId]
    : [reihenId, typ, charId, relatedId, ab, bisVal, INFINITY])
  return rows.length > 0
}

// ═════════════════════════════════════════════════════════════════════════════
// Router: GET /api/beziehungstypen
// ═════════════════════════════════════════════════════════════════════════════
export const beziehungstypenRouter = Router()
beziehungstypenRouter.use(authMiddleware)

beziehungstypenRouter.get('/', requireBeziehungenAccess('lesen'), async (_req, res) => {
  try {
    const rows = await query(
      'SELECT * FROM beziehungstypen ORDER BY sortierung, key'
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ═════════════════════════════════════════════════════════════════════════════
// Router: /api/beziehungen
// ═════════════════════════════════════════════════════════════════════════════
export const beziehungenRouter = Router()
beziehungenRouter.use(authMiddleware)

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/beziehungen?reihe=<uuid>&staffel=<N>[&produktion_id=<TEXT>]
// Momentaufnahme für Staffel N: Nodes + Edges.
// produktion_id optional — falls angegeben, werden Nodes mit darsteller_name +
// kategorie aus character_productions angereichert.
// ─────────────────────────────────────────────────────────────────────────────
beziehungenRouter.get('/', requireBeziehungenAccess('lesen'), async (req, res) => {
  const { reihe, staffel, produktion_id } = req.query as Record<string, string>
  if (!reihe || !staffel) {
    return res.status(400).json({ error: 'reihe und staffel sind erforderlich' })
  }
  const staffelN = parseInt(staffel, 10)
  if (isNaN(staffelN)) {
    return res.status(400).json({ error: 'staffel muss eine Ganzzahl sein' })
  }

  try {
    const edges = await snapshotEdges(reihe, staffelN)

    const characterIds = [
      ...new Set([
        ...edges.map((e: any) => e.character_id),
        ...edges.map((e: any) => e.related_character_id),
      ]),
    ]

    if (characterIds.length === 0) {
      return res.json({ nodes: [], edges })
    }

    let nodes: any[]
    if (produktion_id) {
      nodes = await query(`
        SELECT c.id, c.name, c.meta_json,
               cp.darsteller_name, cp.kategorie_id,
               ck.name  AS kategorie_name,
               ck.typ   AS kategorie_typ,
               (SELECT dateiname FROM charakter_fotos
                WHERE character_id = c.id AND ist_primaer = TRUE LIMIT 1) AS foto_dateiname
        FROM characters c
        LEFT JOIN character_productions cp
          ON cp.character_id = c.id AND cp.produktion_id = $2
        LEFT JOIN character_kategorien ck ON ck.id = cp.kategorie_id
        WHERE c.id = ANY($1::uuid[])
      `, [characterIds, produktion_id])
    } else {
      nodes = await query(`
        SELECT c.id, c.name, c.meta_json,
               (SELECT dateiname FROM charakter_fotos
                WHERE character_id = c.id AND ist_primaer = TRUE LIMIT 1) AS foto_dateiname
        FROM characters c
        WHERE c.id = ANY($1::uuid[])
      `, [characterIds])
    }

    res.json({ nodes, edges })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/beziehungen/diff?reihe=<uuid>&von=<N>&bis=<M>
// Mengendifferenz zwischen zwei Staffel-Snapshots: neu / geändert / entfallen
// ─────────────────────────────────────────────────────────────────────────────
beziehungenRouter.get('/diff', requireBeziehungenAccess('lesen'), async (req, res) => {
  const { reihe, von, bis } = req.query as Record<string, string>
  if (!reihe || !von || !bis) {
    return res.status(400).json({ error: 'reihe, von und bis sind erforderlich' })
  }
  const vonN = parseInt(von, 10)
  const bisN = parseInt(bis, 10)
  if (isNaN(vonN) || isNaN(bisN)) {
    return res.status(400).json({ error: 'von und bis müssen Ganzzahlen sein' })
  }
  if (bisN < vonN) {
    return res.status(400).json({ error: 'bis muss >= von sein' })
  }

  try {
    const [edgesVon, edgesBis] = await Promise.all([
      snapshotEdges(reihe, vonN),
      snapshotEdges(reihe, bisN),
    ])

    const vonMap = new Map(edgesVon.map((e: any) => [edgeKey(e), e]))
    const bisMap = new Map(edgesBis.map((e: any) => [edgeKey(e), e]))

    const neu = edgesBis.filter((e: any) => !vonMap.has(edgeKey(e)))
    const entfallen = edgesVon.filter((e: any) => !bisMap.has(edgeKey(e)))
    const geaendert = edgesBis.filter((e: any) => {
      const vonEdge = vonMap.get(edgeKey(e))
      if (!vonEdge) return false
      // Unterschied = anderes DB-Segment (id), anderer Status oder andere Stärke
      return vonEdge.id !== e.id || vonEdge.status !== e.status || vonEdge.staerke !== e.staerke
    })

    res.json({ neu, geaendert, entfallen, von: vonN, bis: bisN })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/beziehungen/layout?reihe=<uuid>
// Canvas-Positionen für alle Figuren einer Reihe laden
// ─────────────────────────────────────────────────────────────────────────────
beziehungenRouter.get('/layout', requireBeziehungenAccess('lesen'), async (req, res) => {
  const { reihe } = req.query as Record<string, string>
  if (!reihe) return res.status(400).json({ error: 'reihe ist erforderlich' })
  try {
    const rows = await query(
      'SELECT character_id, x, y FROM figuren_layout WHERE reihen_id = $1',
      [reihe]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/beziehungen/layout?reihe=<uuid>
// Canvas-Positionen speichern: [{character_id, x, y}, ...]
// Upsert — überschreibt vorhandene Positionen, fügt neue ein.
// ─────────────────────────────────────────────────────────────────────────────
beziehungenRouter.put('/layout', requireBeziehungenAccess('schreiben'), async (req, res) => {
  const { reihe } = req.query as Record<string, string>
  if (!reihe) return res.status(400).json({ error: 'reihe ist erforderlich' })
  const entries: Array<{ character_id: string; x: number; y: number }> = req.body
  if (!Array.isArray(entries)) return res.status(400).json({ error: 'Array erforderlich' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const e of entries) {
      if (!e.character_id || e.x === undefined || e.y === undefined) continue
      await client.query(`
        INSERT INTO figuren_layout (reihen_id, character_id, x, y)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (reihen_id, character_id) DO UPDATE SET x = $3, y = $4
      `, [reihe, e.character_id, e.x, e.y])
    }
    await client.query('COMMIT')
    const rows = await query(
      'SELECT character_id, x, y FROM figuren_layout WHERE reihen_id = $1',
      [reihe]
    )
    res.json(rows)
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: String(err) })
  } finally {
    client.release()
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/beziehungen/mein-zugriff
// Gibt { lesen, schreiben } zurück — Frontend prüft Berechtigungen ohne Seiteneffekt.
// ─────────────────────────────────────────────────────────────────────────────
beziehungenRouter.get('/mein-zugriff', async (req: any, res) => {
  if (!req.user) return res.status(401).json({ error: 'Nicht authentifiziert' })
  const userRoles: string[] = req.user.roles || [req.user.role]
  const [lesen, schreiben] = await Promise.all([
    checkBeziehungenZugriff(userRoles, 'lesen'),
    checkBeziehungenZugriff(userRoles, 'schreiben'),
  ])
  res.json({ lesen, schreiben })
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/beziehungen/reihen
// Liste aller Reihen aus der Produktionsdatenbank (via direkte DB-Verbindung)
// ─────────────────────────────────────────────────────────────────────────────
beziehungenRouter.get('/reihen', requireBeziehungenAccess('lesen'), async (_req, res) => {
  try {
    const rows = await prodQuery('SELECT id, name, typ FROM reihen ORDER BY name')
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/beziehungen/staffeln?reihen_id=<uuid>
// Staffeln (Produktionen mit staffelnummer) einer Reihe aus der Produktions-DB
// ─────────────────────────────────────────────────────────────────────────────
beziehungenRouter.get('/staffeln', requireBeziehungenAccess('lesen'), async (req, res) => {
  const { reihen_id } = req.query as Record<string, string>
  if (!reihen_id) return res.status(400).json({ error: 'reihen_id ist erforderlich' })
  try {
    const rows = await prodQuery(`
      SELECT id, title, staffelnummer
      FROM productions
      WHERE reihen_id = $1
        AND staffelnummer IS NOT NULL
        AND is_active = TRUE
      ORDER BY staffelnummer
    `, [reihen_id])
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/beziehungen/figuren-suche?q=<name>&limit=<N>
// Fuzzy-Suche nach Figuren-Namen (pg_trgm + ILIKE) — für Seed-Pipeline-Mapping.
// ─────────────────────────────────────────────────────────────────────────────
beziehungenRouter.get('/figuren-suche', requireBeziehungenAccess('lesen'), async (req, res) => {
  const q = ((req.query.q as string) ?? '').trim()
  if (q.length < 2) return res.json([])
  const limit = Math.min(parseInt((req.query.limit as string) || '10', 10), 50)

  try {
    const rows = await query(`
      SELECT id, name
      FROM characters
      WHERE name ILIKE '%' || $1 || '%'
         OR (length($1) >= 3 AND name % $1)
      ORDER BY
        (lower(name) LIKE lower($1) || '%')::int DESC,
        similarity(name, $1) DESC,
        name
      LIMIT $2
    `, [q, limit])
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/beziehungen — Kante anlegen
// Body: { reihen_id, character_id, related_character_id, beziehungstyp,
//         gueltig_ab_staffel, gueltig_bis_staffel?, status?, staerke?,
//         label?, notiz?, seit_block?, bis_block? }
// ─────────────────────────────────────────────────────────────────────────────
beziehungenRouter.post('/', requireBeziehungenAccess('schreiben'), async (req, res) => {
  const {
    reihen_id, character_id, related_character_id, beziehungstyp,
    gueltig_ab_staffel, gueltig_bis_staffel,
    status = 'aktiv', staerke, label, notiz, seit_block, bis_block,
  } = req.body

  if (!reihen_id || !character_id || !related_character_id || !beziehungstyp) {
    return res.status(400).json({ error: 'reihen_id, character_id, related_character_id und beziehungstyp sind erforderlich' })
  }
  if (gueltig_ab_staffel === undefined || gueltig_ab_staffel === null) {
    return res.status(400).json({ error: 'gueltig_ab_staffel ist erforderlich' })
  }
  if (character_id === related_character_id) {
    return res.status(400).json({ error: 'Quelle und Ziel dürfen nicht identisch sein' })
  }
  if (gueltig_bis_staffel !== undefined && gueltig_bis_staffel !== null
      && gueltig_bis_staffel < gueltig_ab_staffel) {
    return res.status(400).json({ error: 'gueltig_bis_staffel muss >= gueltig_ab_staffel sein' })
  }

  // Beziehungstyp muss existieren
  const typ = await queryOne('SELECT key FROM beziehungstypen WHERE key = $1', [beziehungstyp])
  if (!typ) return res.status(400).json({ error: `Unbekannter Beziehungstyp: ${beziehungstyp}` })

  // Überlappungscheck im API-Layer (Exclusion-Constraint kommt später)
  const overlap = await hasOverlap(
    reihen_id, character_id, related_character_id, beziehungstyp,
    gueltig_ab_staffel, gueltig_bis_staffel ?? null
  )
  if (overlap) {
    return res.status(409).json({
      error: 'Für dieses Figuren-Paar und diesen Typ existiert bereits ein überschneidendes Zeitintervall',
    })
  }

  try {
    const row = await queryOne(`
      INSERT INTO charakter_beziehungen
        (reihen_id, character_id, related_character_id, beziehungstyp,
         gueltig_ab_staffel, gueltig_bis_staffel,
         status, staerke, label, notiz, seit_block, bis_block, herkunft)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'manuell')
      RETURNING *
    `, [
      reihen_id, character_id, related_character_id, beziehungstyp,
      gueltig_ab_staffel, gueltig_bis_staffel ?? null,
      status, staerke ?? null, label ?? null, notiz ?? null,
      seit_block ?? null, bis_block ?? null,
    ])
    res.status(201).json(row)
  } catch (err: any) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Diese Kante existiert bereits (gleicher Typ + Startstaffel)' })
    }
    if (err.code === '23503') {
      return res.status(400).json({ error: 'Ungültige Figur-IDs oder Beziehungstyp' })
    }
    res.status(500).json({ error: String(err) })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/beziehungen/:id — Kante ändern
// Body: Felder die geändert werden sollen. Typisches Anwendungsfall:
//   { gueltig_bis_staffel: N } = Beziehung "beenden"
//   { status: 'geheim' }       = Status wechseln
// Warnhinweis im Handoff: Statuswechsel über Staffeln = neue Zeile, nicht PATCH.
// PATCH ist für Korrekturen, nicht für narrative Übergänge.
// ─────────────────────────────────────────────────────────────────────────────
beziehungenRouter.patch('/:id', requireBeziehungenAccess('schreiben'), async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) return res.status(400).json({ error: 'Ungültige ID' })

  const allowed = [
    'gueltig_bis_staffel', 'status', 'staerke', 'label', 'notiz',
    'seit_block', 'bis_block', 'beziehungstyp', 'reihen_id',
  ]
  const updates: Record<string, any> = {}
  for (const key of allowed) {
    if (key in req.body) updates[key] = req.body[key]
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Keine änderbaren Felder im Body' })
  }

  // Existierende Zeile laden für Validierungen
  const existing = await queryOne('SELECT * FROM charakter_beziehungen WHERE id = $1', [id])
  if (!existing) return res.status(404).json({ error: 'Kante nicht gefunden' })

  const newAb = existing.gueltig_ab_staffel
  const newBis = updates.gueltig_bis_staffel !== undefined
    ? updates.gueltig_bis_staffel
    : existing.gueltig_bis_staffel

  if (newBis !== null && newBis !== undefined && newBis < newAb) {
    return res.status(400).json({ error: 'gueltig_bis_staffel muss >= gueltig_ab_staffel sein' })
  }

  // Überlappungscheck wenn Range geändert wird
  if (updates.gueltig_bis_staffel !== undefined || updates.gueltig_ab_staffel !== undefined) {
    const overlap = await hasOverlap(
      existing.reihen_id,
      existing.character_id, existing.related_character_id,
      updates.beziehungstyp ?? existing.beziehungstyp,
      newAb, newBis,
      id
    )
    if (overlap) {
      return res.status(409).json({
        error: 'Für dieses Figuren-Paar und diesen Typ existiert bereits ein überschneidendes Zeitintervall',
      })
    }
  }

  try {
    const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`)
    const values = Object.values(updates)
    const row = await queryOne(
      `UPDATE charakter_beziehungen SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
      [id, ...values]
    )
    res.json(row)
  } catch (err: any) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Diese Kante existiert bereits (gleicher Typ + Startstaffel)' })
    }
    res.status(500).json({ error: String(err) })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/beziehungen/:id — Kante löschen
// ─────────────────────────────────────────────────────────────────────────────
beziehungenRouter.delete('/:id', requireBeziehungenAccess('schreiben'), async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) return res.status(400).json({ error: 'Ungültige ID' })
  try {
    const row = await queryOne(
      'DELETE FROM charakter_beziehungen WHERE id = $1 RETURNING id',
      [id]
    )
    if (!row) return res.status(404).json({ error: 'Kante nicht gefunden' })
    res.json({ ok: true, id: row.id })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ═════════════════════════════════════════════════════════════════════════════
// Seed-Review Endpoints
// ═════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/beziehungen/seed?batch=<uuid>&status=<s1,s2,...>
// Kandidaten listen (batch und status optional)
// ─────────────────────────────────────────────────────────────────────────────
beziehungenRouter.get('/seed', requireBeziehungenAccess('schreiben'), async (req, res) => {
  const { batch, status } = req.query as Record<string, string>
  const conditions: string[] = []
  const params: any[] = []

  if (batch) {
    params.push(batch)
    conditions.push(`batch_id = $${params.length}`)
  }
  if (status) {
    const statusList = status.split(',').map(s => s.trim()).filter(Boolean)
    if (statusList.length > 0) {
      params.push(statusList)
      conditions.push(`status = ANY($${params.length}::text[])`)
    }
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  try {
    const rows = await query(
      `SELECT * FROM beziehung_seed_kandidaten ${where} ORDER BY erstellt_am DESC`,
      params
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/beziehungen/seed/import
// Batch ins Staging einlesen.
// Body: { batch_id, quell_url, quell_abruf_am, kandidaten: [{ ...felder }] }
// ─────────────────────────────────────────────────────────────────────────────
beziehungenRouter.post('/seed/import', requireBeziehungenAccess('schreiben'), async (req, res) => {
  const { batch_id, quell_url, quell_abruf_am, kandidaten } = req.body
  if (!batch_id || !quell_url || !quell_abruf_am) {
    return res.status(400).json({ error: 'batch_id, quell_url und quell_abruf_am sind erforderlich' })
  }
  if (!Array.isArray(kandidaten) || kandidaten.length === 0) {
    return res.status(400).json({ error: 'kandidaten muss ein nichtleeres Array sein' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const inserted: any[] = []
    for (const k of kandidaten) {
      const row = await client.query(`
        INSERT INTO beziehung_seed_kandidaten (
          batch_id, quell_url, quell_abruf_am,
          roh_quelle_name, roh_ziel_name,
          match_quelle_id, match_ziel_id, match_konfidenz,
          typ_key, staffel_hinweis, gueltig_ab_staffel, gueltig_bis_staffel,
          evidenz_zitat, ki_konfidenz, status
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
                  COALESCE($15,'neu'))
        RETURNING *
      `, [
        batch_id,
        k.quell_url ?? quell_url,
        k.quell_abruf_am ?? quell_abruf_am,
        k.roh_quelle_name,
        k.roh_ziel_name,
        k.match_quelle_id ?? null,
        k.match_ziel_id ?? null,
        k.match_konfidenz ?? null,
        k.typ_key ?? null,
        k.staffel_hinweis ?? null,
        k.gueltig_ab_staffel ?? null,
        k.gueltig_bis_staffel ?? null,
        k.evidenz_zitat ?? null,
        k.ki_konfidenz ?? null,
        k.status ?? null,
      ])
      inserted.push(row.rows[0])
    }
    await client.query('COMMIT')
    res.status(201).json({ inserted: inserted.length, batch_id, rows: inserted })
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: String(err) })
  } finally {
    client.release()
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/beziehungen/seed/:id/freigeben
// Promote: ggf. Figuren anlegen (mit meta_json-Markierung A.5), dann Kante
// in charakter_beziehungen schreiben.
// Body: {
//   reihen_id, gueltig_ab_staffel, gueltig_bis_staffel?,
//   anlegen_quelle?: boolean,  // neue Figur für Quelle anlegen
//   anlegen_ziel?: boolean,    // neue Figur für Ziel anlegen
//   quelle_id?: uuid,          // Override: diese Figur verwenden (statt match_quelle_id)
//   ziel_id?: uuid,            // Override: diese Figur verwenden (statt match_ziel_id)
// }
// ─────────────────────────────────────────────────────────────────────────────
beziehungenRouter.post('/seed/:id/freigeben', requireBeziehungenAccess('schreiben'), async (req: any, res) => {
  const { id } = req.params
  const {
    reihen_id,
    gueltig_ab_staffel,
    gueltig_bis_staffel,
    anlegen_quelle = false,
    anlegen_ziel = false,
    quelle_id: quelleIdOverride,
    ziel_id: zielIdOverride,
  } = req.body

  if (!reihen_id || gueltig_ab_staffel === undefined) {
    return res.status(400).json({ error: 'reihen_id und gueltig_ab_staffel sind erforderlich' })
  }

  const kandidat = await queryOne(
    'SELECT * FROM beziehung_seed_kandidaten WHERE id = $1',
    [id]
  )
  if (!kandidat) return res.status(404).json({ error: 'Kandidat nicht gefunden' })
  if (kandidat.status === 'bestaetigt') {
    return res.status(409).json({ error: 'Kandidat wurde bereits freigegeben' })
  }
  if (!kandidat.typ_key) {
    return res.status(400).json({ error: 'Typ (typ_key) ist nicht gesetzt — vor Freigabe zuweisen' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Figuren-IDs bestimmen: Override > match > anlegen
    let quelleId: string | null = quelleIdOverride ?? kandidat.match_quelle_id ?? null
    let zielId: string | null = zielIdOverride ?? kandidat.match_ziel_id ?? null
    let erstelltQuelle = false
    let erstelltZiel = false

    if (!quelleId) {
      if (!anlegen_quelle) {
        await client.query('ROLLBACK')
        return res.status(400).json({
          error: 'Quell-Figur nicht gemappt. anlegen_quelle=true setzen oder quelle_id angeben.',
        })
      }
      const newChar = await client.query(`
        INSERT INTO characters (name, meta_json)
        VALUES ($1, $2::jsonb)
        RETURNING id
      `, [
        kandidat.roh_quelle_name,
        JSON.stringify({
          herkunft: 'wiki_seed',
          seed_quell_url: kandidat.quell_url,
          seed_batch_id: kandidat.batch_id,
          dedup_geprueft: false,
        }),
      ])
      quelleId = newChar.rows[0].id
      erstelltQuelle = true
    }

    if (!zielId) {
      if (!anlegen_ziel) {
        await client.query('ROLLBACK')
        return res.status(400).json({
          error: 'Ziel-Figur nicht gemappt. anlegen_ziel=true setzen oder ziel_id angeben.',
        })
      }
      const newChar = await client.query(`
        INSERT INTO characters (name, meta_json)
        VALUES ($1, $2::jsonb)
        RETURNING id
      `, [
        kandidat.roh_ziel_name,
        JSON.stringify({
          herkunft: 'wiki_seed',
          seed_quell_url: kandidat.quell_url,
          seed_batch_id: kandidat.batch_id,
          dedup_geprueft: false,
        }),
      ])
      zielId = newChar.rows[0].id
      erstelltZiel = true
    }

    // Kante in charakter_beziehungen schreiben
    const bisVal = gueltig_bis_staffel ?? null
    const edgeRow = await client.query(`
      INSERT INTO charakter_beziehungen
        (reihen_id, character_id, related_character_id, beziehungstyp,
         gueltig_ab_staffel, gueltig_bis_staffel,
         status, herkunft, quell_url, quell_abruf_am)
      VALUES ($1,$2,$3,$4,$5,$6,'aktiv','wiki_seed',$7,$8)
      ON CONFLICT (character_id, related_character_id, beziehungstyp, gueltig_ab_staffel)
        DO UPDATE SET
          reihen_id = EXCLUDED.reihen_id,
          gueltig_bis_staffel = EXCLUDED.gueltig_bis_staffel,
          herkunft = EXCLUDED.herkunft,
          quell_url = EXCLUDED.quell_url,
          quell_abruf_am = EXCLUDED.quell_abruf_am
      RETURNING id
    `, [
      reihen_id, quelleId, zielId, kandidat.typ_key,
      gueltig_ab_staffel, bisVal,
      kandidat.quell_url, kandidat.quell_abruf_am,
    ])

    // Kandidat auf bestätigt setzen
    await client.query(`
      UPDATE beziehung_seed_kandidaten
      SET status = 'bestaetigt',
          reviewer = $1,
          reviewed_am = NOW(),
          match_quelle_id = $2,
          match_ziel_id = $3,
          erzeugt_quelle_figur = $4,
          erzeugt_ziel_figur = $5
      WHERE id = $6
    `, [req.user.user_id, quelleId, zielId, erstelltQuelle, erstelltZiel, id])

    await client.query('COMMIT')

    res.json({
      ok: true,
      kante_id: edgeRow.rows[0].id,
      quelle_id: quelleId,
      ziel_id: zielId,
      erzeugt_quelle_figur: erstelltQuelle,
      erzeugt_ziel_figur: erstelltZiel,
    })
  } catch (err: any) {
    await client.query('ROLLBACK')
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Diese Kante existiert bereits' })
    }
    res.status(500).json({ error: String(err) })
  } finally {
    client.release()
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/beziehungen/seed/:id/ablehnen
// Kandidat ablehnen
// ─────────────────────────────────────────────────────────────────────────────
beziehungenRouter.post('/seed/:id/ablehnen', requireBeziehungenAccess('schreiben'), async (req: any, res) => {
  const { id } = req.params
  try {
    const row = await queryOne(`
      UPDATE beziehung_seed_kandidaten
      SET status = 'abgelehnt', reviewer = $1, reviewed_am = NOW()
      WHERE id = $2
      RETURNING id, status
    `, [req.user.user_id, id])
    if (!row) return res.status(404).json({ error: 'Kandidat nicht gefunden' })
    res.json({ ok: true, id: row.id, status: row.status })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})
