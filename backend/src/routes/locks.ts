import { Router } from 'express'
import { query, queryOne } from '../db'
import { authMiddleware, requireRole } from '../auth'

export const locksRouter = Router()
export const contractLocksRouter = Router()

locksRouter.use(authMiddleware)

// GET /api/episoden/:id/lock
locksRouter.get('/:episodeId/lock', async (req, res) => {
  try {
    // Clean up expired locks first
    await query(
      "DELETE FROM episode_locks WHERE episode_id = $1 AND lock_type = 'exclusive' AND expires_at < NOW()",
      [req.params.episodeId]
    )
    const lock = await queryOne('SELECT * FROM episode_locks WHERE episode_id = $1', [req.params.episodeId])
    if (!lock) return res.status(404).json({ error: 'Kein Lock vorhanden' })
    res.json(lock)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/episoden/:id/lock
locksRouter.post('/:episodeId/lock', async (req, res) => {
  try {
    const episodeId = parseInt(req.params.episodeId)
    const user = req.user!

    // Clean up expired exclusive locks
    await query(
      "DELETE FROM episode_locks WHERE episode_id = $1 AND lock_type = 'exclusive' AND expires_at < NOW()",
      [episodeId]
    )

    // Check if already locked
    const existing = await queryOne('SELECT * FROM episode_locks WHERE episode_id = $1', [episodeId])
    if (existing) {
      return res.status(409).json({
        error: `Episode ist bereits gesperrt von ${existing.user_name || existing.user_id}`,
        lock: existing
      })
    }

    // Create exclusive lock (4h timeout)
    const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000)
    const lock = await queryOne(
      `INSERT INTO episode_locks (episode_id, user_id, user_name, lock_type, expires_at)
       VALUES ($1, $2, $3, 'exclusive', $4) RETURNING *`,
      [episodeId, user.user_id, user.name, expiresAt]
    )
    res.status(201).json(lock)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/episoden/:id/lock
locksRouter.delete('/:episodeId/lock', async (req, res) => {
  try {
    const user = req.user!
    const lock = await queryOne('SELECT * FROM episode_locks WHERE episode_id = $1', [req.params.episodeId])
    if (!lock) return res.status(404).json({ error: 'Kein Lock vorhanden' })

    // Only lock owner or admin can release
    const isAdmin = user.roles.some(r => ['superadmin', 'herstellungsleitung'].includes(r))
    if (lock.user_id !== user.user_id && !isAdmin) {
      return res.status(403).json({ error: 'Nur der Lock-Inhaber oder Admin kann den Lock freigeben' })
    }

    await query('DELETE FROM episode_locks WHERE episode_id = $1', [req.params.episodeId])
    res.status(204).send()
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/episoden/:id/lock/takeover
locksRouter.post('/:episodeId/lock/takeover', requireRole('superadmin', 'herstellungsleitung'), async (req, res) => {
  try {
    const user = req.user!
    await query('DELETE FROM episode_locks WHERE episode_id = $1', [req.params.episodeId])
    const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000)
    const lock = await queryOne(
      `INSERT INTO episode_locks (episode_id, user_id, user_name, lock_type, expires_at)
       VALUES ($1, $2, $3, 'exclusive', $4) RETURNING *`,
      [req.params.episodeId, user.user_id, user.name, expiresAt]
    )
    res.json(lock)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/locks/contract-update — Webhook from Vertragsdatenbank
contractLocksRouter.post('/contract-update', async (req, res) => {
  try {
    const { episode_id, action, contract_ref, user_id, user_name } = req.body
    if (!episode_id || !action) return res.status(400).json({ error: 'episode_id und action erforderlich' })

    if (action === 'unlock') {
      await query(
        "DELETE FROM episode_locks WHERE episode_id = $1 AND lock_type = 'contract'",
        [episode_id]
      )
      return res.status(204).send()
    }

    // action === 'lock'
    // Check if already locked by someone else
    const existing = await queryOne('SELECT * FROM episode_locks WHERE episode_id = $1', [episode_id])
    if (existing && existing.lock_type !== 'contract') {
      return res.status(409).json({ error: 'Episode bereits mit exclusive Lock gesperrt', lock: existing })
    }
    if (existing) {
      await query('DELETE FROM episode_locks WHERE episode_id = $1', [episode_id])
    }

    const lock = await queryOne(
      `INSERT INTO episode_locks (episode_id, user_id, user_name, lock_type, contract_ref)
       VALUES ($1, $2, $3, 'contract', $4) RETURNING *`,
      [episode_id, user_id || 'contract-system', user_name || 'Vertragsdatenbank', contract_ref || null]
    )
    res.status(201).json(lock)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default locksRouter
