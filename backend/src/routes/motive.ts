import { Router } from 'express'
import * as path from 'path'
import * as fs from 'fs'
import { query, queryOne } from '../db'
import { authMiddleware } from '../auth'

export const produktionMotiveRouter = Router({ mergeParams: true })
export const motivRouter = Router({ mergeParams: true })
export const produktionDrehorteRouter = Router({ mergeParams: true })

produktionMotiveRouter.use(authMiddleware)
motivRouter.use(authMiddleware)
produktionDrehorteRouter.use(authMiddleware)

const UPLOAD_DIR = process.env.FOTO_UPLOAD_DIR || path.join(process.cwd(), 'uploads', 'fotos')
const THUMB_DIR  = path.join(UPLOAD_DIR, 'thumbnails')

// GET /api/produktionen/:produktionId/motive
produktionMotiveRouter.get('/', async (req, res) => {
  const { produktionId } = req.params as any
  try {
    const rows = await query(
      `SELECT m.*,
         d.label                  AS drehort_label,
         p.name                   AS parent_name,
         f.dateiname              AS primaer_foto_dateiname,
         f.thumbnail_dateiname    AS primaer_thumbnail_dateiname,
         f.media_typ              AS primaer_media_typ
       FROM motive m
       LEFT JOIN drehorte d ON d.id = m.drehort_id
       LEFT JOIN motive p ON p.id = m.parent_id
       LEFT JOIN motiv_fotos f ON f.motiv_id = m.id AND f.ist_primaer = TRUE
       WHERE m.produktion_id = $1
       ORDER BY d.sort_order NULLS LAST, d.label NULLS LAST, p.name NULLS FIRST, m.name`,
      [produktionId]
    )
    res.json(rows)
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

// POST /api/produktionen/:produktionId/motive
produktionMotiveRouter.post('/', async (req, res) => {
  const { produktionId } = req.params as any
  const { name, typ, motiv_nummer, drehort_id, parent_id } = req.body
  if (!name) return res.status(400).json({ error: 'name required' })
  try {
    const row = await queryOne(
      `INSERT INTO motive (produktion_id, name, typ, motiv_nummer, drehort_id, parent_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [produktionId, name.trim(), typ ?? 'interior', motiv_nummer ?? null, drehort_id ?? null, parent_id ?? null]
    )
    res.status(201).json(row)
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

// GET /api/motive/:id
motivRouter.get('/', async (req, res) => {
  const { id } = req.params as any
  try {
    const row = await queryOne('SELECT * FROM motive WHERE id = $1', [id])
    if (!row) return res.status(404).json({ error: 'Motiv nicht gefunden' })
    res.json(row)
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

// PUT /api/motive/:id
motivRouter.put('/', async (req, res) => {
  const { id } = req.params as any
  const { name, typ, motiv_nummer, drehort_id, parent_id } = req.body
  try {
    const row = await queryOne(
      `UPDATE motive SET
         name          = COALESCE($1, name),
         typ           = COALESCE($2, typ),
         motiv_nummer  = $3,
         drehort_id    = $5,
         parent_id     = $6
       WHERE id = $4 RETURNING *`,
      [name ?? null, typ ?? null, motiv_nummer ?? null, id, drehort_id ?? null, parent_id ?? null]
    )
    if (!row) return res.status(404).json({ error: 'Motiv nicht gefunden' })
    res.json(row)
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

// DELETE /api/motive/:id
motivRouter.delete('/', async (req, res) => {
  const { id } = req.params as any
  try {
    // Collect foto files before deleting (CASCADE will remove DB rows)
    const fotos = await query(
      'SELECT dateiname, thumbnail_dateiname FROM motiv_fotos WHERE motiv_id = $1',
      [id]
    )
    const row = await queryOne('DELETE FROM motive WHERE id = $1 RETURNING id', [id])
    if (!row) return res.status(404).json({ error: 'Motiv nicht gefunden' })
    // Clean up files
    for (const f of fotos) {
      if (f.dateiname) { const p = path.join(UPLOAD_DIR, f.dateiname); if (fs.existsSync(p)) fs.unlinkSync(p) }
      if (f.thumbnail_dateiname) { const p = path.join(THUMB_DIR, f.thumbnail_dateiname); if (fs.existsSync(p)) fs.unlinkSync(p) }
    }
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

// ── Drehorte CRUD ──────────────────────────────────────────────────────────────

// GET /api/produktionen/:produktionId/drehorte
produktionDrehorteRouter.get('/', async (req, res) => {
  const { produktionId } = req.params as any
  try {
    const rows = await query(
      `SELECT * FROM drehorte WHERE produktion_id = $1 ORDER BY sort_order, label`,
      [produktionId]
    )
    res.json(rows)
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

// POST /api/produktionen/:produktionId/drehorte
produktionDrehorteRouter.post('/', async (req, res) => {
  const { produktionId } = req.params as any
  const { label, sort_order } = req.body
  if (!label) return res.status(400).json({ error: 'label required' })
  try {
    const row = await queryOne(
      `INSERT INTO drehorte (produktion_id, label, sort_order)
       VALUES ($1, $2, $3)
       ON CONFLICT (produktion_id, label) DO UPDATE SET sort_order = COALESCE(EXCLUDED.sort_order, drehorte.sort_order)
       RETURNING *`,
      [produktionId, label.trim(), sort_order ?? 0]
    )
    res.status(201).json(row)
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

// DELETE /api/produktionen/:produktionId/drehorte/:id
produktionDrehorteRouter.delete('/:id', async (req, res) => {
  try {
    const row = await queryOne('DELETE FROM drehorte WHERE id = $1 RETURNING id', [req.params.id])
    if (!row) return res.status(404).json({ error: 'Drehort nicht gefunden' })
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: String(err) }) }
})
