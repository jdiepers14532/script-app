import { Router } from 'express'
import { pool } from '../db.js'
import { authMiddleware } from '../auth.js'

const router = Router()

const INTERNAL_KEY = process.env.INTERNAL_SECRET || 'prod-internal-2026'
const PROD_DB_URL = 'http://127.0.0.1:3005'
const AUTH_URL = 'http://127.0.0.1:3002'

const TIER1_ROLES = ['superadmin', 'geschaeftsfuehrung', 'herstellungsleitung', 'hauptbuchhaltung']

// GET /api/me/productions
router.get('/productions', authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user.user_id
    const userRole = req.user.role || ''

    let alle_aktiven = false
    let production_ids: string[] = []

    // Tier-1-Rollen → alle aktiven Produktionen
    if (TIER1_ROLES.includes(userRole)) {
      alle_aktiven = true
    } else {
      // Auth-Service nach User-Zugriff fragen
      try {
        const accessRes = await fetch(
          `${AUTH_URL}/api/internal/user-productions?user_id=${userId}&app=script`,
          { headers: { 'x-internal-key': INTERNAL_KEY } }
        )
        if (accessRes.ok) {
          const access = await accessRes.json() as any
          alle_aktiven = access.global === true || access.alle_aktiven_projekte === true
          production_ids = access.productions || access.production_ids || []
        }
      } catch (authErr) {
        console.error('Auth user-productions error (non-fatal):', authErr)
      }
    }

    // Wenn keine Zugriffsrechte und nicht global → leere Liste
    if (!alle_aktiven && production_ids.length === 0) {
      res.json([])
      return
    }

    // Produktionen von Produktionsdatenbank holen
    const params = new URLSearchParams({ include_inactive: 'true' })
    if (!alle_aktiven && production_ids.length > 0) {
      params.set('ids', production_ids.join(','))
    }

    const prodRes = await fetch(
      `${PROD_DB_URL}/api/internal/productions?${params}`,
      { headers: { 'x-internal-key': INTERNAL_KEY } }
    )

    if (!prodRes.ok) {
      res.status(502).json({ error: 'Produktionsdatenbank nicht erreichbar' })
      return
    }

    const productions = await prodRes.json()
    res.json(productions)
  } catch (err) {
    console.error('me/productions error:', err)
    res.status(500).json({ error: 'Fehler beim Laden der Produktionen' })
  }
})

// GET /api/me/settings
router.get('/settings', authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user.user_id
    const result = await pool.query(
      'SELECT * FROM user_settings WHERE user_id = $1', [userId]
    )
    res.json(result.rows[0] || { user_id: userId, selected_production_id: null })
  } catch (err) {
    console.error('me/settings GET error:', err)
    res.status(500).json({ error: 'Fehler beim Laden der Einstellungen' })
  }
})

// PUT /api/me/settings
router.put('/settings', authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user.user_id
    const { selected_production_id } = req.body
    await pool.query(
      `INSERT INTO user_settings (user_id, selected_production_id, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE SET selected_production_id = $2, updated_at = NOW()`,
      [userId, selected_production_id || null]
    )
    res.json({ ok: true })
  } catch (err) {
    console.error('me/settings PUT error:', err)
    res.status(500).json({ error: 'Fehler beim Speichern der Einstellungen' })
  }
})

export default router
