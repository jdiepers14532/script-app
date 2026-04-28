import { Router } from 'express'
import { query, queryOne } from '../db'
import { authMiddleware } from '../auth'

export const staffelFelderRouter = Router({ mergeParams: true })
export const characterFeldwerteRouter = Router({ mergeParams: true })
export const motivFeldwerteRouter = Router({ mergeParams: true })

staffelFelderRouter.use(authMiddleware)
characterFeldwerteRouter.use(authMiddleware)
motivFeldwerteRouter.use(authMiddleware)

const DEFAULT_FELDER = [
  { name: 'Beschreibung', typ: 'richtext', optionen: [], sort_order: 1, gilt_fuer: 'alle' },
  { name: 'Notizen', typ: 'text', optionen: [], sort_order: 2, gilt_fuer: 'alle' },
  { name: 'Beziehungen', typ: 'link', optionen: [], sort_order: 3, gilt_fuer: 'rolle' },
  { name: 'Adresse', typ: 'text', optionen: [], sort_order: 1, gilt_fuer: 'motiv' },
]

async function autoInitFelder(staffelId: string) {
  const existing = await query(
    'SELECT id FROM charakter_felder_config WHERE staffel_id = $1 LIMIT 1',
    [staffelId]
  )
  if (existing.length > 0) return
  for (const f of DEFAULT_FELDER) {
    await queryOne(
      `INSERT INTO charakter_felder_config (staffel_id, name, typ, optionen, sort_order, gilt_fuer)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
      [staffelId, f.name, f.typ, JSON.stringify(f.optionen), f.sort_order, f.gilt_fuer]
    )
  }
}

// GET /api/staffeln/:staffelId/charakter-felder
staffelFelderRouter.get('/', async (req, res) => {
  const { staffelId } = req.params as any
  try {
    await autoInitFelder(staffelId)
    const rows = await query(
      'SELECT * FROM charakter_felder_config WHERE staffel_id = $1 ORDER BY gilt_fuer, sort_order, id',
      [staffelId]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/staffeln/:staffelId/charakter-felder
staffelFelderRouter.post('/', async (req, res) => {
  const { staffelId } = req.params as any
  const { name, typ, optionen, sort_order, gilt_fuer } = req.body
  if (!name || !typ) return res.status(400).json({ error: 'name und typ required' })
  const validTypen = ['text', 'richtext', 'select', 'link', 'date', 'number']
  if (!validTypen.includes(typ)) return res.status(400).json({ error: 'Ungültiger Feldtyp' })
  const validGilt = ['alle', 'rolle', 'komparse', 'motiv']
  if (gilt_fuer && !validGilt.includes(gilt_fuer)) return res.status(400).json({ error: 'Ungültiger gilt_fuer Wert' })
  try {
    const maxOrder = await queryOne(
      'SELECT COALESCE(MAX(sort_order), 0) AS m FROM charakter_felder_config WHERE staffel_id = $1',
      [staffelId]
    )
    const row = await queryOne(
      `INSERT INTO charakter_felder_config (staffel_id, name, typ, optionen, sort_order, gilt_fuer)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [staffelId, name, typ, JSON.stringify(optionen ?? []), sort_order ?? maxOrder.m + 1, gilt_fuer ?? 'alle']
    )
    res.status(201).json(row)
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'Feldname bereits vorhanden' })
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/staffeln/:staffelId/charakter-felder/:id
staffelFelderRouter.put('/:feldId', async (req, res) => {
  const { staffelId } = req.params as any
  const { name, typ, optionen, sort_order, gilt_fuer } = req.body
  try {
    const row = await queryOne(
      `UPDATE charakter_felder_config SET
         name = COALESCE($1, name),
         typ = COALESCE($2, typ),
         optionen = COALESCE($3, optionen),
         sort_order = COALESCE($4, sort_order),
         gilt_fuer = COALESCE($5, gilt_fuer)
       WHERE id = $6 AND staffel_id = $7 RETURNING *`,
      [name ?? null, typ ?? null, optionen ? JSON.stringify(optionen) : null,
       sort_order ?? null, gilt_fuer ?? null, req.params.feldId, staffelId]
    )
    if (!row) return res.status(404).json({ error: 'Feld nicht gefunden' })
    res.json(row)
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'Feldname bereits vorhanden' })
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/staffeln/:staffelId/charakter-felder/:id
staffelFelderRouter.delete('/:feldId', async (req, res) => {
  const { staffelId } = req.params as any
  try {
    const row = await queryOne(
      'DELETE FROM charakter_felder_config WHERE id = $1 AND staffel_id = $2 RETURNING id',
      [req.params.feldId, staffelId]
    )
    if (!row) return res.status(404).json({ error: 'Feld nicht gefunden' })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PATCH /api/staffeln/:staffelId/charakter-felder/reorder
staffelFelderRouter.patch('/reorder', async (req, res) => {
  const { staffelId } = req.params as any
  const { order } = req.body
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order array required' })
  try {
    for (const { id, sort_order } of order) {
      await queryOne(
        'UPDATE charakter_felder_config SET sort_order = $1 WHERE id = $2 AND staffel_id = $3',
        [sort_order, id, staffelId]
      )
    }
    const rows = await query(
      'SELECT * FROM charakter_felder_config WHERE staffel_id = $1 ORDER BY gilt_fuer, sort_order, id',
      [staffelId]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── Feldwerte für Characters ──────────────────────────────────────────────────

// GET /api/characters/:id/feldwerte
characterFeldwerteRouter.get('/', async (req, res) => {
  try {
    const rows = await query(
      `SELECT fv.*, fc.name AS feld_name, fc.typ AS feld_typ, fc.optionen AS feld_optionen, fc.gilt_fuer
       FROM charakter_feldwerte fv
       JOIN charakter_felder_config fc ON fc.id = fv.feld_id
       WHERE fv.character_id = $1
       ORDER BY fc.sort_order`,
      [req.params.id]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/characters/:id/feldwerte/:feldId
characterFeldwerteRouter.put('/:feldId', async (req, res) => {
  const { wert_text, wert_json } = req.body
  try {
    const row = await queryOne(
      `INSERT INTO charakter_feldwerte (character_id, feld_id, wert_text, wert_json)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (character_id, feld_id) DO UPDATE SET
         wert_text = EXCLUDED.wert_text,
         wert_json = EXCLUDED.wert_json
       RETURNING *`,
      [req.params.id, req.params.feldId, wert_text ?? null, wert_json ? JSON.stringify(wert_json) : null]
    )
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── Feldwerte für Motive ──────────────────────────────────────────────────────

// GET /api/motive/:id/feldwerte
motivFeldwerteRouter.get('/', async (req, res) => {
  try {
    const rows = await query(
      `SELECT fv.*, fc.name AS feld_name, fc.typ AS feld_typ, fc.optionen AS feld_optionen, fc.gilt_fuer
       FROM charakter_feldwerte fv
       JOIN charakter_felder_config fc ON fc.id = fv.feld_id
       WHERE fv.motiv_id = $1
       ORDER BY fc.sort_order`,
      [req.params.id]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/motive/:id/feldwerte/:feldId
motivFeldwerteRouter.put('/:feldId', async (req, res) => {
  const { wert_text, wert_json } = req.body
  try {
    const row = await queryOne(
      `INSERT INTO charakter_feldwerte (motiv_id, feld_id, wert_text, wert_json)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (motiv_id, feld_id) DO UPDATE SET
         wert_text = EXCLUDED.wert_text,
         wert_json = EXCLUDED.wert_json
       RETURNING *`,
      [req.params.id, req.params.feldId, wert_text ?? null, wert_json ? JSON.stringify(wert_json) : null]
    )
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})
