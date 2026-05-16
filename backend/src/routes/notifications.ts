import { Router } from 'express'
import { pool, query } from '../db'
import { authMiddleware } from '../auth'

export const notificationsRouter = Router()
notificationsRouter.use(authMiddleware)

// ── Helper: create a notification (non-critical, never throws) ────────────────
export async function createNotification(data: {
  user_id: string
  typ: string
  titel: string
  nachricht: string
  payload?: Record<string, unknown>
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO script_notifications (user_id, typ, titel, nachricht, payload)
       VALUES ($1, $2, $3, $4, $5)`,
      [data.user_id, data.typ, data.titel, data.nachricht, JSON.stringify(data.payload ?? {})]
    )
  } catch (err) {
    console.error('[Notifications] Failed to create:', err)
  }
}

// ── GET /api/notifications — eigene (ungelesen zuerst, max 50) ─────────────────
notificationsRouter.get('/', async (req, res) => {
  const user = req.user!
  try {
    const rows = await query(
      `SELECT * FROM script_notifications
       WHERE user_id = $1
       ORDER BY gelesen ASC, erstellt_am DESC
       LIMIT 50`,
      [user.user_id]
    )
    const unread_count = (rows as any[]).filter(r => !r.gelesen).length
    res.json({ notifications: rows, unread_count })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── PUT /api/notifications/read-all ───────────────────────────────────────────
notificationsRouter.put('/read-all', async (req, res) => {
  const user = req.user!
  try {
    await pool.query(
      `UPDATE script_notifications SET gelesen = true
       WHERE user_id = $1 AND gelesen = false`,
      [user.user_id]
    )
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── PUT /api/notifications/:id/read ──────────────────────────────────────────
notificationsRouter.put('/:id/read', async (req, res) => {
  const user = req.user!
  try {
    await pool.query(
      `UPDATE script_notifications SET gelesen = true
       WHERE id = $1 AND user_id = $2`,
      [req.params.id, user.user_id]
    )
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── DELETE /api/notifications/:id ────────────────────────────────────────────
notificationsRouter.delete('/:id', async (req, res) => {
  const user = req.user!
  try {
    await pool.query(
      `DELETE FROM script_notifications WHERE id = $1 AND user_id = $2`,
      [req.params.id, user.user_id]
    )
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})
