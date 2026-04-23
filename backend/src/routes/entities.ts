import { Router } from 'express'
import { query, queryOne } from '../db'
import { authMiddleware } from '../auth'

const router = Router()
router.use(authMiddleware)

// GET /api/entities?staffel_id=&type=&q=
router.get('/', async (req, res) => {
  try {
    const { staffel_id, type, q } = req.query
    let sql = 'SELECT * FROM entities WHERE 1=1'
    const params: any[] = []
    let i = 1

    if (staffel_id) { sql += ` AND staffel_id = $${i++}`; params.push(staffel_id) }
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
    const { entity_type, name, external_id, external_app, meta_json, staffel_id } = req.body
    if (!entity_type || !name) return res.status(400).json({ error: 'entity_type und name erforderlich' })
    const row = await queryOne(
      `INSERT INTO entities (entity_type, name, external_id, external_app, meta_json, staffel_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [entity_type, name, external_id || null, external_app || null, JSON.stringify(meta_json || {}), staffel_id || null]
    )
    res.status(201).json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/entities/:id
router.put('/:id', async (req, res) => {
  try {
    const { name, meta_json, external_id, external_app, staffel_id } = req.body
    const row = await queryOne(
      `UPDATE entities SET
        name = COALESCE($1, name),
        meta_json = COALESCE($2, meta_json),
        external_id = COALESCE($3, external_id),
        external_app = COALESCE($4, external_app),
        staffel_id = COALESCE($5, staffel_id)
       WHERE id = $6 RETURNING *`,
      [name, meta_json ? JSON.stringify(meta_json) : null, external_id, external_app, staffel_id, req.params.id]
    )
    if (!row) return res.status(404).json({ error: 'Entity nicht gefunden' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/stages/:id/entities — Extract entities from content JSONB
router.get('/stages/:stageId/entities', async (req, res) => {
  try {
    const szenen = await query(
      'SELECT content FROM szenen WHERE stage_id = $1',
      [req.params.stageId]
    )

    const entityIds = new Set<number>()
    for (const szene of szenen) {
      const content = Array.isArray(szene.content) ? szene.content : []
      for (const block of content) {
        if (block.type === 'entity_link' && block.entity_id) {
          entityIds.add(block.entity_id)
        }
      }
    }

    if (entityIds.size === 0) return res.json([])

    const ids = Array.from(entityIds)
    const placeholders = ids.map((_: any, i: number) => `$${i + 1}`).join(',')
    const entities = await query(
      `SELECT * FROM entities WHERE id IN (${placeholders})`,
      ids
    )
    res.json(entities)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default router
