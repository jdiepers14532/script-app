import { Router } from 'express'
import { query, queryOne } from '../db'
import { authMiddleware } from '../auth'

const router = Router()
router.use(authMiddleware)

// GET /api/szenen/:id/versionen
router.get('/:szeneId/versionen', async (req, res) => {
  try {
    const rows = await query(
      'SELECT * FROM szenen_versionen WHERE szene_id = $1 ORDER BY created_at DESC LIMIT 50',
      [req.params.szeneId]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/szenen/:id/versionen — Auto-save snapshot
router.post('/:szeneId/versionen', async (req, res) => {
  try {
    const { content_snapshot, change_summary } = req.body
    if (!content_snapshot) return res.status(400).json({ error: 'content_snapshot erforderlich' })
    const user = req.user!
    const row = await queryOne(
      `INSERT INTO szenen_versionen (szene_id, user_id, user_name, content_snapshot, change_summary)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.params.szeneId, user.user_id, user.name, JSON.stringify(content_snapshot), change_summary || null]
    )
    res.status(201).json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/szenen/:id/versionen/:vid/restore
router.post('/:szeneId/versionen/:vid/restore', async (req, res) => {
  try {
    const version = await queryOne(
      'SELECT * FROM szenen_versionen WHERE id = $1 AND szene_id = $2',
      [req.params.vid, req.params.szeneId]
    )
    if (!version) return res.status(404).json({ error: 'Version nicht gefunden' })

    // Restore: update szene content from snapshot
    const szene = await queryOne(
      `UPDATE szenen SET content = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [JSON.stringify(version.content_snapshot), req.params.szeneId]
    )
    if (!szene) return res.status(404).json({ error: 'Szene nicht gefunden' })

    // Also create a new version snapshot of the restored state
    const user = req.user!
    await queryOne(
      `INSERT INTO szenen_versionen (szene_id, user_id, user_name, content_snapshot, change_summary)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.params.szeneId, user.user_id, user.name, JSON.stringify(version.content_snapshot), `Wiederherstellung von Version ${version.id}`]
    )

    res.json({ szene, restored_from: version.id })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default router
