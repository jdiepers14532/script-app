import { Router } from 'express'
import { query, queryOne } from '../db'
import { authMiddleware } from '../auth'

export const stagesRouter = Router()
export const episodenStagesRouter = Router()

stagesRouter.use(authMiddleware)
episodenStagesRouter.use(authMiddleware)

// GET /api/stages/:id
stagesRouter.get('/:id', async (req, res) => {
  try {
    const row = await queryOne('SELECT * FROM stages WHERE id = $1', [req.params.id])
    if (!row) return res.status(404).json({ error: 'Stage nicht gefunden' })
    res.json(row)
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

// GET /api/episoden/:episodeId/stages
episodenStagesRouter.get('/:episodeId/stages', async (req, res) => {
  try {
    const rows = await query(
      'SELECT * FROM stages WHERE episode_id = $1 ORDER BY version_nummer DESC',
      [req.params.episodeId]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/episoden/:episodeId/stages
episodenStagesRouter.post('/:episodeId/stages', async (req, res) => {
  try {
    const { stage_type, version_nummer, version_label, status } = req.body
    const row = await queryOne(
      `INSERT INTO stages (episode_id, stage_type, version_nummer, version_label, status, erstellt_von)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        req.params.episodeId,
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

export default stagesRouter
