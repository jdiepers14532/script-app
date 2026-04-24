import { Router } from 'express'
import { query, queryOne } from '../db'
import { authMiddleware } from '../auth'

export const stagesRouter = Router()
stagesRouter.use(authMiddleware)

// GET /api/stages?staffel_id=X&folge_nummer=Y
stagesRouter.get('/', async (req, res) => {
  try {
    const { staffel_id, folge_nummer } = req.query
    if (!staffel_id || !folge_nummer) {
      return res.status(400).json({ error: 'staffel_id und folge_nummer erforderlich' })
    }
    const rows = await query(
      'SELECT * FROM stages WHERE staffel_id = $1 AND folge_nummer = $2 ORDER BY version_nummer DESC',
      [staffel_id, parseInt(String(folge_nummer))]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/stages/:id
stagesRouter.get('/:id(\\d+)', async (req, res) => {
  try {
    const row = await queryOne('SELECT * FROM stages WHERE id = $1', [req.params.id])
    if (!row) return res.status(404).json({ error: 'Stage nicht gefunden' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/stages
stagesRouter.post('/', async (req, res) => {
  try {
    const { staffel_id, folge_nummer, proddb_block_id, stage_type, version_nummer, version_label, status } = req.body
    if (!staffel_id || folge_nummer == null) {
      return res.status(400).json({ error: 'staffel_id und folge_nummer erforderlich' })
    }
    const row = await queryOne(
      `INSERT INTO stages (staffel_id, folge_nummer, proddb_block_id, stage_type, version_nummer, version_label, status, erstellt_von)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        staffel_id,
        parseInt(String(folge_nummer)),
        proddb_block_id || null,
        stage_type || 'draft',
        version_nummer || 1,
        version_label || null,
        status || 'in_arbeit',
        req.user!.user_id,
      ]
    )
    res.status(201).json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/stages/:id
stagesRouter.put('/:id', async (req, res) => {
  try {
    const { status, version_label, is_locked } = req.body
    const row = await queryOne(
      `UPDATE stages SET
        status = COALESCE($1, status),
        version_label = COALESCE($2, version_label),
        is_locked = COALESCE($3, is_locked)
       WHERE id = $4 RETURNING *`,
      [status, version_label, is_locked, req.params.id]
    )
    if (!row) return res.status(404).json({ error: 'Stage nicht gefunden' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default stagesRouter
