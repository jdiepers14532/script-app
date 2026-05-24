import { Router } from 'express'
import { query, queryOne } from '../db'
import { authMiddleware } from '../auth'

const router = Router()
router.use(authMiddleware)

// GET /api/entities?produktion_id=&type=&q=
router.get('/', async (req, res) => {
  try {
    const { produktion_id, type, q } = req.query
    let sql = 'SELECT * FROM entities WHERE 1=1'
    const params: any[] = []
    let i = 1

    if (produktion_id) { sql += ` AND produktion_id = $${i++}`; params.push(produktion_id) }
    if (type) { sql += ` AND entity_type = $${i++}`; params.push(type) }
    if (q) { sql += ` AND name ILIKE $${i++}`; params.push(`%${q}%`) }

    sql += ' ORDER BY name LIMIT 100'
    const rows = await query(sql, params)
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/entities
router.post('/', async (req, res) => {
  try {
    const { entity_type, name, external_id, external_app, meta_json, produktion_id } = req.body
    if (!entity_type || !name) return res.status(400).json({ error: 'entity_type und name erforderlich' })
    const row = await queryOne(
      `INSERT INTO entities (entity_type, name, external_id, external_app, meta_json, produktion_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [entity_type, name, external_id || null, external_app || null, JSON.stringify(meta_json || {}), produktion_id || null]
    )
    res.status(201).json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/entities/:id
router.put('/:id', async (req, res) => {
  try {
    const { name, meta_json, external_id, external_app, produktion_id } = req.body
    const row = await queryOne(
      `UPDATE entities SET
        name = COALESCE($1, name),
        meta_json = COALESCE($2, meta_json),
        external_id = COALESCE($3, external_id),
        external_app = COALESCE($4, external_app),
        produktion_id = COALESCE($5, produktion_id)
       WHERE id = $6 RETURNING *`,
      [name, meta_json ? JSON.stringify(meta_json) : null, external_id, external_app, produktion_id, req.params.id]
    )
    if (!row) return res.status(404).json({ error: 'Entity nicht gefunden' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/stages/:id/entities — removed (v51: szenen/stages tables dropped; entity extraction now via dokument-szenen)

export default router
