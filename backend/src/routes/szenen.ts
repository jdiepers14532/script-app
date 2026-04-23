import { Router } from 'express'
import { query, queryOne } from '../db'
import { authMiddleware } from '../auth'

const router = Router()

router.use(authMiddleware)

// GET /api/stages/:stageId/szenen
router.get('/stages/:stageId/szenen', async (req, res) => {
  try {
    const rows = await query(
      'SELECT * FROM szenen WHERE stage_id = $1 ORDER BY sort_order, scene_nummer',
      [req.params.stageId]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/stages/:stageId/szenen
router.post('/stages/:stageId/szenen', async (req, res) => {
  try {
    const { scene_nummer, int_ext, tageszeit, ort_name, zusammenfassung, content, dauer_min, sort_order } = req.body
    const row = await queryOne(
      `INSERT INTO szenen (stage_id, scene_nummer, int_ext, tageszeit, ort_name, zusammenfassung, content, dauer_min, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        req.params.stageId,
        scene_nummer,
        int_ext || 'INT',
        tageszeit || 'TAG',
        ort_name || null,
        zusammenfassung || null,
        JSON.stringify(content || []),
        dauer_min || null,
        sort_order || 0,
      ]
    )
    res.status(201).json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/szenen/:id
router.get('/:id', async (req, res) => {
  try {
    const row = await queryOne('SELECT * FROM szenen WHERE id = $1', [req.params.id])
    if (!row) return res.status(404).json({ error: 'Szene nicht gefunden' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/szenen/:id
router.put('/:id', async (req, res) => {
  try {
    const { int_ext, tageszeit, ort_name, zusammenfassung, content, dauer_min, sort_order } = req.body
    const row = await queryOne(
      `UPDATE szenen SET
        int_ext = COALESCE($1, int_ext),
        tageszeit = COALESCE($2, tageszeit),
        ort_name = COALESCE($3, ort_name),
        zusammenfassung = COALESCE($4, zusammenfassung),
        content = COALESCE($5, content),
        dauer_min = COALESCE($6, dauer_min),
        sort_order = COALESCE($7, sort_order),
        updated_at = NOW()
       WHERE id = $8 RETURNING *`,
      [
        int_ext,
        tageszeit,
        ort_name,
        zusammenfassung,
        content ? JSON.stringify(content) : null,
        dauer_min,
        sort_order,
        req.params.id,
      ]
    )
    if (!row) return res.status(404).json({ error: 'Szene nicht gefunden' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/szenen/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await queryOne('DELETE FROM szenen WHERE id = $1 RETURNING id', [req.params.id])
    if (!result) return res.status(404).json({ error: 'Szene nicht gefunden' })
    res.status(204).send()
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default router
