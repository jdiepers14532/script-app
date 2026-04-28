import { Router } from 'express'
import { query, queryOne } from '../db'
import { authMiddleware } from '../auth'

export const staffelMotiveRouter = Router({ mergeParams: true })
export const motivRouter = Router({ mergeParams: true })

staffelMotiveRouter.use(authMiddleware)
motivRouter.use(authMiddleware)

// GET /api/staffeln/:staffelId/motive
staffelMotiveRouter.get('/', async (req, res) => {
  const { staffelId } = req.params as any
  try {
    const rows = await query(
      `SELECT m.*,
              (SELECT dateiname FROM motiv_fotos WHERE motiv_id = m.id AND ist_primaer = TRUE LIMIT 1) AS primaer_foto_dateiname,
              (SELECT media_typ FROM motiv_fotos WHERE motiv_id = m.id AND ist_primaer = TRUE LIMIT 1) AS primaer_media_typ,
              (SELECT thumbnail_dateiname FROM motiv_fotos WHERE motiv_id = m.id AND ist_primaer = TRUE LIMIT 1) AS primaer_thumbnail_dateiname
       FROM motive m WHERE m.staffel_id = $1 ORDER BY m.motiv_nummer NULLS LAST, m.name`,
      [staffelId]
    )
    res.json(rows)
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

// POST /api/staffeln/:staffelId/motive
staffelMotiveRouter.post('/', async (req, res) => {
  const { staffelId } = req.params as any
  const { name, motiv_nummer, typ, meta_json } = req.body
  if (!name) return res.status(400).json({ error: 'name required' })
  try {
    const row = await queryOne(
      `INSERT INTO motive (staffel_id, name, motiv_nummer, typ, meta_json)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [staffelId, name, motiv_nummer ?? null, typ ?? 'interior', meta_json ?? {}]
    )
    res.status(201).json(row)
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

// PUT /api/motive/:id
motivRouter.put('/', async (req, res) => {
  const { id } = req.params as any
  const { name, motiv_nummer, typ, meta_json } = req.body
  try {
    const row = await queryOne(
      `UPDATE motive SET
         name = COALESCE($1, name),
         motiv_nummer = COALESCE($2, motiv_nummer),
         typ = COALESCE($3, typ),
         meta_json = COALESCE($4, meta_json)
       WHERE id = $5 RETURNING *`,
      [name ?? null, motiv_nummer ?? null, typ ?? null, meta_json ?? null, id]
    )
    if (!row) return res.status(404).json({ error: 'Motiv nicht gefunden' })
    res.json(row)
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

// DELETE /api/motive/:id
motivRouter.delete('/', async (req, res) => {
  const { id } = req.params as any
  try {
    const row = await queryOne('DELETE FROM motive WHERE id = $1 RETURNING id', [id])
    if (!row) return res.status(404).json({ error: 'Motiv nicht gefunden' })
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: String(err) }) }
})
