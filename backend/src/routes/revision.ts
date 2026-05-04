import { Router } from 'express'
import { query, queryOne } from '../db'
import { authMiddleware } from '../auth'

export const stageLabelsRouter = Router({ mergeParams: true })
export const revisionColorsRouter = Router({ mergeParams: true })
export const revisionEinstellungenRouter = Router({ mergeParams: true })

stageLabelsRouter.use(authMiddleware)
revisionColorsRouter.use(authMiddleware)
revisionEinstellungenRouter.use(authMiddleware)

// ── Stage Labels ──────────────────────────────────────────────────────────────

// GET /api/produktionen/:produktionId/stage-labels
stageLabelsRouter.get('/', async (req, res) => {
  const { produktionId } = req.params as any
  try {
    const rows = await query(
      `SELECT * FROM stage_labels WHERE produktion_id = $1 ORDER BY sort_order, id`,
      [produktionId]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/produktionen/:produktionId/stage-labels
stageLabelsRouter.post('/', async (req, res) => {
  const { produktionId } = req.params as any
  const { name, sort_order, is_produktionsfassung } = req.body
  if (!name) return res.status(400).json({ error: 'name required' })
  try {
    const maxOrder = await queryOne(
      `SELECT COALESCE(MAX(sort_order), 0) AS m FROM stage_labels WHERE produktion_id = $1`,
      [produktionId]
    )
    const row = await queryOne(
      `INSERT INTO stage_labels (produktion_id, name, sort_order, is_produktionsfassung)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [produktionId, name, sort_order ?? (maxOrder.m + 1), is_produktionsfassung ?? false]
    )
    res.status(201).json(row)
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'Label-Name bereits vorhanden' })
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/produktionen/:produktionId/stage-labels/:labelId
stageLabelsRouter.put('/:labelId', async (req, res) => {
  const { produktionId } = req.params as any
  const { name, sort_order, is_produktionsfassung } = req.body
  try {
    const row = await queryOne(
      `UPDATE stage_labels SET
         name = COALESCE($1, name),
         sort_order = COALESCE($2, sort_order),
         is_produktionsfassung = COALESCE($3, is_produktionsfassung)
       WHERE id = $4 AND produktion_id = $5 RETURNING *`,
      [name ?? null, sort_order ?? null, is_produktionsfassung ?? null,
       req.params.labelId, produktionId]
    )
    if (!row) return res.status(404).json({ error: 'Stage-Label nicht gefunden' })
    res.json(row)
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'Label-Name bereits vorhanden' })
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/produktionen/:produktionId/stage-labels/:labelId
stageLabelsRouter.delete('/:labelId', async (req, res) => {
  const { produktionId } = req.params as any
  try {
    const row = await queryOne(
      `DELETE FROM stage_labels WHERE id = $1 AND produktion_id = $2 RETURNING id`,
      [req.params.labelId, produktionId]
    )
    if (!row) return res.status(404).json({ error: 'Stage-Label nicht gefunden' })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PATCH /api/produktionen/:produktionId/stage-labels/reorder — bulk sort_order update
stageLabelsRouter.patch('/reorder', async (req, res) => {
  const { produktionId } = req.params as any
  const { order } = req.body // [{ id, sort_order }]
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order array required' })
  try {
    for (const { id, sort_order } of order) {
      await queryOne(
        `UPDATE stage_labels SET sort_order = $1 WHERE id = $2 AND produktion_id = $3`,
        [sort_order, id, produktionId]
      )
    }
    const rows = await query(
      `SELECT * FROM stage_labels WHERE produktion_id = $1 ORDER BY sort_order, id`,
      [produktionId]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── Revision Colors ───────────────────────────────────────────────────────────

// GET /api/produktionen/:produktionId/revision-colors
revisionColorsRouter.get('/', async (req, res) => {
  const { produktionId } = req.params as any
  try {
    const rows = await query(
      `SELECT * FROM revision_colors WHERE produktion_id = $1 ORDER BY sort_order, id`,
      [produktionId]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/produktionen/:produktionId/revision-colors
revisionColorsRouter.post('/', async (req, res) => {
  const { produktionId } = req.params as any
  const { name, color, sort_order } = req.body
  if (!name || !color) return res.status(400).json({ error: 'name und color required' })
  try {
    const maxOrder = await queryOne(
      `SELECT COALESCE(MAX(sort_order), 0) AS m FROM revision_colors WHERE produktion_id = $1`,
      [produktionId]
    )
    const row = await queryOne(
      `INSERT INTO revision_colors (produktion_id, name, color, sort_order)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [produktionId, name, color, sort_order ?? (maxOrder.m + 1)]
    )
    res.status(201).json(row)
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'Revisions-Name bereits vorhanden' })
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/produktionen/:produktionId/revision-colors/:colorId
revisionColorsRouter.put('/:colorId', async (req, res) => {
  const { produktionId } = req.params as any
  const { name, color, sort_order } = req.body
  try {
    const row = await queryOne(
      `UPDATE revision_colors SET
         name = COALESCE($1, name),
         color = COALESCE($2, color),
         sort_order = COALESCE($3, sort_order)
       WHERE id = $4 AND produktion_id = $5 RETURNING *`,
      [name ?? null, color ?? null, sort_order ?? null, req.params.colorId, produktionId]
    )
    if (!row) return res.status(404).json({ error: 'Revisions-Farbe nicht gefunden' })
    res.json(row)
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'Revisions-Name bereits vorhanden' })
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/produktionen/:produktionId/revision-colors/:colorId
revisionColorsRouter.delete('/:colorId', async (req, res) => {
  const { produktionId } = req.params as any
  try {
    const row = await queryOne(
      `DELETE FROM revision_colors WHERE id = $1 AND produktion_id = $2 RETURNING id`,
      [req.params.colorId, produktionId]
    )
    if (!row) return res.status(404).json({ error: 'Revisions-Farbe nicht gefunden' })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PATCH /api/produktionen/:produktionId/revision-colors/reorder
revisionColorsRouter.patch('/reorder', async (req, res) => {
  const { produktionId } = req.params as any
  const { order } = req.body
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order array required' })
  try {
    for (const { id, sort_order } of order) {
      await queryOne(
        `UPDATE revision_colors SET sort_order = $1 WHERE id = $2 AND produktion_id = $3`,
        [sort_order, id, produktionId]
      )
    }
    const rows = await query(
      `SELECT * FROM revision_colors WHERE produktion_id = $1 ORDER BY sort_order, id`,
      [produktionId]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── Revision Export Einstellungen ─────────────────────────────────────────────

// GET /api/produktionen/:produktionId/revision-einstellungen
revisionEinstellungenRouter.get('/', async (req, res) => {
  const { produktionId } = req.params as any
  try {
    const row = await queryOne(
      `SELECT * FROM revision_export_einstellungen WHERE produktion_id = $1`,
      [produktionId]
    )
    res.json(row ?? { produktion_id: produktionId, memo_schwellwert_zeichen: 100 })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/produktionen/:produktionId/revision-einstellungen
revisionEinstellungenRouter.put('/', async (req, res) => {
  const { produktionId } = req.params as any
  const { memo_schwellwert_zeichen } = req.body
  if (typeof memo_schwellwert_zeichen !== 'number' || memo_schwellwert_zeichen < 0) {
    return res.status(400).json({ error: 'memo_schwellwert_zeichen muss eine nicht-negative Zahl sein' })
  }
  try {
    const row = await queryOne(
      `INSERT INTO revision_export_einstellungen (produktion_id, memo_schwellwert_zeichen)
       VALUES ($1, $2)
       ON CONFLICT (produktion_id) DO UPDATE SET
         memo_schwellwert_zeichen = EXCLUDED.memo_schwellwert_zeichen,
         updated_at = NOW()
       RETURNING *`,
      [produktionId, memo_schwellwert_zeichen]
    )
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

