import { Router } from 'express'
import { query, queryOne, pool } from '../db'
import { authMiddleware, requireRole } from '../auth'

export const locksRouter = Router()
export const contractLocksRouter = Router()

locksRouter.use(authMiddleware)

const TIER1_ROLES = ['superadmin', 'geschaeftsfuehrung', 'herstellungsleitung']

async function hasScopeAccess(userId: string, userRoles: string[], productionId: string, scope: string): Promise<boolean> {
  if (userRoles.some(r => TIER1_ROLES.includes(r))) return true
  const { rows } = await pool.query(
    `SELECT 1 FROM dk_settings_access
     WHERE production_id = $1 AND scope = $2
       AND ((access_type = 'user' AND identifier = $3)
         OR (access_type = 'rolle' AND identifier = ANY($4::text[])))
     LIMIT 1`,
    [productionId, scope, userId, userRoles]
  )
  return rows.length > 0
}

// GET /api/folgen/:produktionId/:folgeNummer/lock
locksRouter.get('/:produktionId/:folgeNummer/lock', async (req, res) => {
  const { produktionId, folgeNummer } = req.params
  const fn = parseInt(folgeNummer)
  try {
    await query(
      "DELETE FROM episode_locks WHERE produktion_id = $1 AND folge_nummer = $2 AND lock_type = 'exclusive' AND expires_at < NOW()",
      [produktionId, fn]
    )
    const lock = await queryOne(
      'SELECT * FROM episode_locks WHERE produktion_id = $1 AND folge_nummer = $2',
      [produktionId, fn]
    )
    res.json(lock ?? null)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/folgen/:produktionId/:folgeNummer/lock
// Body: { force?: boolean, begruendung?: string }
locksRouter.post('/:produktionId/:folgeNummer/lock', async (req, res) => {
  const { produktionId, folgeNummer } = req.params
  const fn = parseInt(folgeNummer)
  const user = req.user!
  const { force, begruendung } = req.body ?? {}
  try {
    await query(
      "DELETE FROM episode_locks WHERE produktion_id = $1 AND folge_nummer = $2 AND lock_type = 'exclusive' AND expires_at < NOW()",
      [produktionId, fn]
    )
    const existing = await queryOne(
      'SELECT * FROM episode_locks WHERE produktion_id = $1 AND folge_nummer = $2',
      [produktionId, fn]
    )
    if (existing) {
      return res.status(409).json({
        error: `Folge ist bereits gesperrt von ${existing.user_name || existing.user_id}`,
        lock: existing,
      })
    }

    // ── Lock-Gate: ausstehende Budget-Freigaben prüfen ────────────────────────
    const offeneFreigaben = await query(
      `SELECT cp.character_id, c.name AS rollen_name, cp.freigabe_status
       FROM character_productions cp
       JOIN characters c ON c.id = cp.character_id
       WHERE cp.produktion_id = $1
         AND cp.freigabe_status IN ('ausstehend', 'abgelehnt')
       ORDER BY c.name`,
      [produktionId]
    )

    if (offeneFreigaben.length > 0 && !force) {
      // Prüfen ob Override überhaupt konfiguriert ist
      const cfg = await queryOne(
        `SELECT lock_override_aktiv FROM rollen_freigabe_konfiguration
         WHERE production_id = $1 LIMIT 1`,
        [produktionId]
      )
      return res.status(409).json({
        error: 'freigaben_ausstehend',
        count: offeneFreigaben.length,
        anfragen: offeneFreigaben,
        override_aktiv: cfg?.lock_override_aktiv ?? false,
      })
    }

    if (offeneFreigaben.length > 0 && force) {
      // Override: Berechtigung prüfen
      const userRoles = user.roles || [user.role]
      const hasAccess = await hasScopeAccess(user.user_id, userRoles, produktionId, 'lock_override')
      if (!hasAccess) {
        return res.status(403).json({ error: 'Keine Berechtigung für Lock-Override' })
      }
      if (!begruendung?.trim()) {
        return res.status(400).json({ error: 'Begründung ist Pflicht beim Override' })
      }
      // Audit-Eintrag
      await query(
        `INSERT INTO freigabe_overrides (typ, bezug_id, user_id, begruendung, fehlende_freigaben)
         VALUES ('lock', $1, $2, $3, $4)`,
        [
          `${produktionId}/${fn}`,
          user.user_id,
          begruendung.trim(),
          JSON.stringify(offeneFreigaben),
        ]
      )
    }

    const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000)
    const lock = await queryOne(
      `INSERT INTO episode_locks (produktion_id, folge_nummer, user_id, user_name, lock_type, expires_at)
       VALUES ($1, $2, $3, $4, 'exclusive', $5) RETURNING *`,
      [produktionId, fn, user.user_id, user.name, expiresAt]
    )
    res.status(201).json(lock)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/folgen/:produktionId/:folgeNummer/lock
locksRouter.delete('/:produktionId/:folgeNummer/lock', async (req, res) => {
  const { produktionId, folgeNummer } = req.params
  const fn = parseInt(folgeNummer)
  const user = req.user!
  try {
    const lock = await queryOne(
      'SELECT * FROM episode_locks WHERE produktion_id = $1 AND folge_nummer = $2',
      [produktionId, fn]
    )
    if (!lock) return res.status(404).json({ error: 'Kein Lock vorhanden' })
    const isAdmin = user.roles.some(r => ['superadmin', 'herstellungsleitung'].includes(r))
    if (lock.user_id !== user.user_id && !isAdmin) {
      return res.status(403).json({ error: 'Nur der Lock-Inhaber oder Admin kann den Lock freigeben' })
    }
    await query(
      'DELETE FROM episode_locks WHERE produktion_id = $1 AND folge_nummer = $2',
      [produktionId, fn]
    )
    res.status(204).send()
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/folgen/:produktionId/:folgeNummer/lock/takeover
locksRouter.post(
  '/:produktionId/:folgeNummer/lock/takeover',
  requireRole('superadmin', 'herstellungsleitung'),
  async (req, res) => {
    const { produktionId, folgeNummer } = req.params
    const fn = parseInt(folgeNummer)
    const user = req.user!
    try {
      await query(
        'DELETE FROM episode_locks WHERE produktion_id = $1 AND folge_nummer = $2',
        [produktionId, fn]
      )
      const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000)
      const lock = await queryOne(
        `INSERT INTO episode_locks (produktion_id, folge_nummer, user_id, user_name, lock_type, expires_at)
         VALUES ($1, $2, $3, $4, 'exclusive', $5) RETURNING *`,
        [produktionId, fn, user.user_id, user.name, expiresAt]
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
    const { produktion_id, folge_nummer, action, contract_ref, user_id, user_name } = req.body
    if (!produktion_id || folge_nummer == null || !action) {
      return res.status(400).json({ error: 'produktion_id, folge_nummer und action erforderlich' })
    }
    const fn = parseInt(String(folge_nummer))

    if (action === 'unlock') {
      await query(
        "DELETE FROM episode_locks WHERE produktion_id = $1 AND folge_nummer = $2 AND lock_type = 'contract'",
        [produktion_id, fn]
      )
      return res.status(204).send()
    }

    const existing = await queryOne(
      'SELECT * FROM episode_locks WHERE produktion_id = $1 AND folge_nummer = $2',
      [produktion_id, fn]
    )
    if (existing && existing.lock_type !== 'contract') {
      return res.status(409).json({ error: 'Folge bereits mit exclusive Lock gesperrt', lock: existing })
    }
    if (existing) {
      await query(
        'DELETE FROM episode_locks WHERE produktion_id = $1 AND folge_nummer = $2',
        [produktion_id, fn]
      )
    }
    const lock = await queryOne(
      `INSERT INTO episode_locks (produktion_id, folge_nummer, user_id, user_name, lock_type, contract_ref)
       VALUES ($1, $2, $3, $4, 'contract', $5) RETURNING *`,
      [produktion_id, fn, user_id || 'contract-system', user_name || 'Vertragsdatenbank', contract_ref || null]
    )
    res.status(201).json(lock)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default locksRouter
