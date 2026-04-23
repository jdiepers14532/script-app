import { Router } from 'express'
import { query, queryOne } from '../db'
import { authMiddleware } from '../auth'

const router = Router()

router.use(authMiddleware)

// GET /api/bloecke/:id/episoden
router.get('/bloecke/:blockId/episoden', async (req, res) => {
  try {
    const rows = await query(
      'SELECT * FROM episoden WHERE block_id = $1 ORDER BY episode_nummer',
      [req.params.blockId]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/episoden/:id
router.get('/:id', async (req, res) => {
  try {
    const row = await queryOne('SELECT * FROM episoden WHERE id = $1', [req.params.id])
    if (!row) return res.status(404).json({ error: 'Episode nicht gefunden' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/bloecke/:blockId/episoden (create episode)
router.post('/bloecke/:blockId/episoden', async (req, res) => {
  try {
    const { episode_nummer, staffel_nummer, arbeitstitel, air_date, synopsis } = req.body
    const row = await queryOne(
      `INSERT INTO episoden (block_id, episode_nummer, staffel_nummer, arbeitstitel, air_date, synopsis)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.params.blockId, episode_nummer, staffel_nummer || 1, arbeitstitel, air_date || null, synopsis || null]
    )
    res.status(201).json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/episoden/:id
router.put('/:id', async (req, res) => {
  try {
    const { arbeitstitel, air_date, synopsis, meta_json } = req.body
    const row = await queryOne(
      `UPDATE episoden SET
        arbeitstitel = COALESCE($1, arbeitstitel),
        air_date = COALESCE($2, air_date),
        synopsis = COALESCE($3, synopsis),
        meta_json = COALESCE($4, meta_json),
        updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [arbeitstitel, air_date || null, synopsis, meta_json ? JSON.stringify(meta_json) : null, req.params.id]
    )
    if (!row) return res.status(404).json({ error: 'Episode nicht gefunden' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default router
