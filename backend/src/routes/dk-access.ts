import { Router } from 'express'
import { pool } from '../db'
import { authMiddleware, requireRole, requireDkAccess } from '../auth'

const TIER1_ROLES = ['superadmin', 'geschaeftsfuehrung', 'herstellungsleitung']

const router = Router()
router.use(authMiddleware)

// GET /api/dk-settings/my-productions — Produktionen mit DK-Zugriff fuer aktuellen User
router.get('/my-productions', async (req: any, res) => {
  try {
    const userRoles = req.user.roles || [req.user.role]
    const isTier1 = userRoles.some((r: string) => TIER1_ROLES.includes(r))

    if (isTier1) {
      // Tier-1: alle Produktionen
      res.json({ global: true, production_ids: [] })
      return
    }

    const { rows } = await pool.query(
      `SELECT DISTINCT production_id FROM dk_settings_access
       WHERE (access_type = 'user' AND identifier = $1)
          OR (access_type = 'rolle' AND identifier = ANY($2::text[]))`,
      [req.user.user_id, userRoles]
    )
    res.json({ global: false, production_ids: rows.map((r: any) => r.production_id) })
  } catch (err) {
    console.error('dk my-productions error:', err)
    res.status(500).json({ error: 'Fehler' })
  }
})

// GET /api/dk-settings/:productionId/app-settings — produktionsspezifische Settings (merged mit global)
router.get('/:productionId/app-settings',
  requireDkAccess(req => req.params.productionId),
  async (req, res) => {
    try {
      const { productionId } = req.params
      // Global defaults
      const globalRes = await pool.query('SELECT key, value FROM app_settings')
      const settings: Record<string, string> = {}
      for (const row of globalRes.rows) settings[row.key] = row.value
      // Production overrides
      const prodRes = await pool.query(
        'SELECT key, value FROM production_app_settings WHERE production_id = $1',
        [productionId]
      )
      for (const row of prodRes.rows) settings[row.key] = row.value
      res.json(settings)
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  }
)

// PUT /api/dk-settings/:productionId/app-settings/:key — produktionsspezifisches Setting setzen
router.put('/:productionId/app-settings/:key',
  requireDkAccess(req => req.params.productionId),
  async (req, res) => {
    try {
      const { productionId, key } = req.params
      const { value } = req.body
      if (!value) return res.status(400).json({ error: 'value required' })
      const allowed = ['treatment_label', 'scene_kuerzel', 'scene_logging_stage', 'figuren_label', 'scene_env_colors', 'scene_env_colors_dark', 'statistik_modal_config', 'seitenformat', 'terminologie', 'daily_regeln', 'stockshot_suffix', 'stimmung_config', 'ln_settings', 'page_margin_mm', 'statistik_config', 'replik_settings', 'datumsformat', 'sonstige_dokumente_format']
      if (!allowed.includes(key)) return res.status(400).json({ error: 'Unknown setting' })
      await pool.query(
        `INSERT INTO production_app_settings (production_id, key, value, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (production_id, key) DO UPDATE SET value = $3, updated_at = NOW()`,
        [productionId, key, value]
      )
      res.json({ key, value })
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  }
)

// ── Glossar CRUD ──────────────────────────────────────────────────────────────

// GET /api/dk-settings/:productionId/glossar
router.get('/:productionId/glossar',
  requireDkAccess(req => req.params.productionId),
  async (req, res) => {
    try {
      const pid = req.params.productionId
      let { rows } = await pool.query(
        'SELECT id, kuerzel, name, erklaerung, kategorie, sort_order FROM dk_glossar WHERE production_id = $1 ORDER BY sort_order, kuerzel',
        [pid]
      )
      // Auto-seed aus dk_glossar_defaults wenn noch keine Einträge vorhanden
      if (rows.length === 0) {
        const { rows: defaults } = await pool.query(
          'SELECT kuerzel, name, erklaerung, kategorie, sort_order FROM dk_glossar_defaults ORDER BY sort_order'
        )
        if (defaults.length > 0) {
          const values = defaults.map((_, i) => `($1, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5}, $${i * 5 + 6})`).join(', ')
          const params: any[] = [pid]
          defaults.forEach(d => params.push(d.kuerzel, d.name, d.erklaerung, d.kategorie ?? 'kuerzel', d.sort_order))
          const inserted = await pool.query(
            `INSERT INTO dk_glossar (production_id, kuerzel, name, erklaerung, kategorie, sort_order) VALUES ${values} RETURNING id, kuerzel, name, erklaerung, kategorie, sort_order`,
            params
          )
          rows = inserted.rows
        }
      }
      res.json(rows)
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  }
)

// POST /api/dk-settings/:productionId/glossar
router.post('/:productionId/glossar',
  requireDkAccess(req => req.params.productionId),
  async (req, res) => {
    try {
      const { kuerzel, name, erklaerung, kategorie } = req.body
      const kat = (['transition', 'shot', 'kuerzel', 'fachbegriff', 'sonstige'].includes(kategorie)) ? kategorie : 'kuerzel'
      const { rows } = await pool.query(
        `INSERT INTO dk_glossar (production_id, kuerzel, name, erklaerung, kategorie, sort_order)
         VALUES ($1, $2, $3, $4, $5, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM dk_glossar WHERE production_id = $1))
         RETURNING id, kuerzel, name, erklaerung, kategorie, sort_order`,
        [req.params.productionId, (kuerzel ?? '').trim(), (name ?? '').trim(), (erklaerung ?? '').trim(), kat]
      )
      res.json(rows[0])
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  }
)

// PUT /api/dk-settings/:productionId/glossar/:id
router.put('/:productionId/glossar/:id',
  requireDkAccess(req => req.params.productionId),
  async (req, res) => {
    try {
      const { kuerzel, name, erklaerung, kategorie } = req.body
      const kat = (['transition', 'shot', 'kuerzel', 'fachbegriff', 'sonstige'].includes(kategorie)) ? kategorie : 'kuerzel'
      const { rows } = await pool.query(
        `UPDATE dk_glossar SET kuerzel = $1, name = $2, erklaerung = $3, kategorie = $4, updated_at = NOW()
         WHERE id = $5 AND production_id = $6
         RETURNING id, kuerzel, name, erklaerung, kategorie, sort_order`,
        [(kuerzel ?? '').trim(), (name ?? '').trim(), (erklaerung ?? '').trim(), kat, req.params.id, req.params.productionId]
      )
      if (!rows[0]) return res.status(404).json({ error: 'Not found' })
      res.json(rows[0])
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  }
)

// DELETE /api/dk-settings/:productionId/glossar/:id
router.delete('/:productionId/glossar/:id',
  requireDkAccess(req => req.params.productionId),
  async (req, res) => {
    try {
      await pool.query('DELETE FROM dk_glossar WHERE id = $1 AND production_id = $2', [req.params.id, req.params.productionId])
      res.json({ ok: true })
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  }
)

// ── Admin: DK-Zugriffsverwaltung ──────────────────────────────────────────────

const adminRouter = Router()
adminRouter.use(authMiddleware)
adminRouter.use(requireRole('superadmin', 'geschaeftsfuehrung', 'herstellungsleitung'))

// GET /api/admin/dk-access/:productionId
adminRouter.get('/:productionId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM dk_settings_access WHERE production_id = $1 ORDER BY access_type, identifier',
      [req.params.productionId]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/admin/dk-access/:productionId — Zugriffsliste komplett ersetzen
adminRouter.put('/:productionId', async (req: any, res) => {
  try {
    const { productionId } = req.params
    const { entries } = req.body  // [{ access_type, identifier }]
    if (!Array.isArray(entries)) return res.status(400).json({ error: 'entries array required' })

    await pool.query('DELETE FROM dk_settings_access WHERE production_id = $1', [productionId])
    for (const entry of entries) {
      if (!entry.access_type || !entry.identifier) continue
      await pool.query(
        `INSERT INTO dk_settings_access (production_id, access_type, identifier, created_by)
         VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
        [productionId, entry.access_type, entry.identifier, req.user.user_id]
      )
    }
    const { rows } = await pool.query(
      'SELECT * FROM dk_settings_access WHERE production_id = $1 ORDER BY access_type, identifier',
      [productionId]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export { router as dkSettingsRouter, adminRouter as dkAccessAdminRouter }
