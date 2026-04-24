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

// POST /api/staffeln/sync
// Upsert eine Produktion aus der Produktionsdatenbank in die staffeln-Tabelle
router.post('/sync', async (req, res) => {
  const { production_id, title, staffelnummer, projektnummer } = req.body
  if (!production_id || !title) {
    return res.status(400).json({ error: 'production_id und title erforderlich' })
  }
  try {
    const label = staffelnummer ? `${title} Staffel ${staffelnummer}` : title
    await query(
      `INSERT INTO staffeln (id, titel, show_type, produktion_db_id, meta_json)
       VALUES ($1, $2, 'daily_soap', $3::uuid, $4)
       ON CONFLICT (id) DO UPDATE SET titel = $2, produktion_db_id = $3::uuid, meta_json = $4, updated_at = NOW()`,
      [
        production_id,
        label,
        production_id,
        JSON.stringify({ projektnummer: projektnummer ?? null, staffelnummer: staffelnummer ?? null })
      ]
    )
    res.json({ ok: true, staffel_id: production_id })
  } catch (err) {
    console.error('staffeln/sync error:', err)
    res.status(500).json({ error: String(err) })
  }
})

export default router
