import { Router } from 'express'
import { query, queryOne } from '../db'
import { authMiddleware } from '../auth'

const router = Router()

router.use(authMiddleware)

// GET /api/staffeln
router.get('/', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM staffeln ORDER BY titel')
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/staffeln/:id
router.get('/:id', async (req, res) => {
  try {
    const row = await queryOne('SELECT * FROM staffeln WHERE id = $1', [req.params.id])
    if (!row) return res.status(404).json({ error: 'Staffel nicht gefunden' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/staffeln/:id/bloecke
router.get('/:id/bloecke', async (req, res) => {
  try {
    const rows = await query(
      'SELECT * FROM bloecke WHERE staffel_id = $1 ORDER BY sort_order, block_nummer',
      [req.params.id]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default router
