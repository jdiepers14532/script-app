import { Router } from 'express'
import { query, queryOne } from '../db'
import { authMiddleware, requireRole } from '../auth'

export const locksRouter = Router()
export const contractLocksRouter = Router()

locksRouter.use(authMiddleware)

// GET /api/folgen/:staffelId/:folgeNummer/lock
locksRouter.get('/:staffelId/:folgeNummer/lock', async (req, res) => {
  const { staffelId, folgeNummer } = req.params
  const fn = parseInt(folgeNummer)
  try {
    await query(
      "DELETE FROM episode_locks WHERE staffel_id = $1 AND folge_nummer = $2 AND lock_type = 'exclusive' AND expires_at < NOW()",
      [staffelId, fn]
    )
    const lock = await queryOne(
      'SELECT * FROM episode_locks WHERE staffel_id = $1 AND folge_nummer = $2',
      [staffelId, fn]
    )
    res.json(lock ?? null)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/folgen/:staffelId/:folgeNummer/lock
locksRouter.post('/:staffelId/:folgeNummer/lock', async (req, res) => {
  const { staffelId, folgeNummer } = req.params
  const fn = parseInt(folgeNummer)
  const user = req.user!
  try {
    await query(
      "DELETE FROM episode_locks WHERE staffel_id = $1 AND folge_nummer = $2 AND lock_type = 'exclusive' AND expires_at < NOW()",
      [staffelId, fn]
    )
    const existing = await queryOne(
      'SELECT * FROM episode_locks WHERE staffel_id = $1 AND folge_nummer = $2',
      [staffelId, fn]
    )
    if (existing) {
      return res.status(409).json({
        error: `Folge ist bereits gesperrt von ${existing.user_name || existing.user_id}`,
        lock: existing,
      })
    }
    const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000)
    const lock = await queryOne(
      `INSERT INTO episode_locks (staffel_id, folge_nummer, user_id, user_name, lock_type, expires_at)
       VALUES ($1, $2, $3, $4, 'exclusive', $5) RETURNING *`,
      [staffelId, fn, user.user_id, user.name, expiresAt]
    )
    res.status(201).json(lock)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/folgen/:staffelId/:folgeNummer/lock
locksRouter.delete('/:staffelId/:folgeNummer/lock', async (req, res) => {
  const { staffelId, folgeNummer } = req.params
  const fn = parseInt(folgeNummer)
  const user = req.user!
  try {
    const lock = await queryOne(
      'SELECT * FROM episode_locks WHERE staffel_id = $1 AND folge_nummer = $2',
      [staffelId, fn]
    )
    if (!lock) return res.status(404).json({ error: 'Kein Lock vorhanden' })
    const isAdmin = user.roles.some(r => ['superadmin', 'herstellungsleitung'].includes(r))
    if (lock.user_id !== user.user_id && !isAdmin) {
      return res.status(403).json({ error: 'Nur der Lock-Inhaber oder Admin kann den Lock freigeben' })
    }
    await query(
      'DELETE FROM episode_locks WHERE staffel_id = $1 AND folge_nummer = $2',
      [staffelId, fn]
    )
    res.status(204).send()
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/folgen/:staffelId/:folgeNummer/lock/takeover
locksRouter.post(
  '/:staffelId/:folgeNummer/lock/takeover',
  requireRole('superadmin', 'herstellungsleitung'),
  async (req, res) => {
    const { staffelId, folgeNummer } = req.params
    const fn = parseInt(folgeNummer)
    const user = req.user!
    try {
      await query(
        'DELETE FROM episode_locks WHERE staffel_id = $1 AND folge_nummer = $2',
        [staffelId, fn]
      )
      const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000)
      const lock = await queryOne(
        `INSERT INTO episode_locks (staffel_id, folge_nummer, user_id, user_name, lock_type, expires_at)
         VALUES ($1, $2, $3, $4, 'exclusive', $5) RETURNING *`,
        [staffelId, fn, user.user_id, user.name, expiresAt]
      )
      res.json(lock)
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  }
)

// POST /api/locks/contract-update — Webhook from Vertragsdatenbank
contractLocksRouter.post('/contract-update', async (req, res) => {
  try {
    const { staffel_id, folge_nummer, action, contract_ref, user_id, user_name } = req.body
    if (!staffel_id || folge_nummer == null || !action) {
      return res.status(400).json({ error: 'staffel_id, folge_nummer und action erforderlich' })
    }
    const fn = parseInt(String(folge_nummer))

    if (action === 'unlock') {
      await query(
        "DELETE FROM episode_locks WHERE staffel_id = $1 AND folge_nummer = $2 AND lock_type = 'contract'",
        [staffel_id, fn]
      )
      return res.status(204).send()
    }

    const existing = await queryOne(
      'SELECT * FROM episode_locks WHERE staffel_id = $1 AND folge_nummer = $2',
      [staffel_id, fn]
    )
    if (existing && existing.lock_type !== 'contract') {
      return res.status(409).json({ error: 'Folge bereits mit exclusive Lock gesperrt', lock: existing })
    }
    if (existing) {
      await query(
        'DELETE FROM episode_locks WHERE staffel_id = $1 AND folge_nummer = $2',
        [staffel_id, fn]
      )
    }
    const lock = await queryOne(
      `INSERT INTO episode_locks (staffel_id, folge_nummer, user_id, user_name, lock_type, contract_ref)
       VALUES ($1, $2, $3, $4, 'contract', $5) RETURNING *`,
      [staffel_id, fn, user_id || 'contract-system', user_name || 'Vertragsdatenbank', contract_ref || null]
    )
    res.status(201).json(lock)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default locksRouter
