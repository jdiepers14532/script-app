import { Router } from 'express'
import { pool } from '../db'
import { authMiddleware, requireRole } from '../auth'

const ADMIN_ROLES: [string, ...string[]] = ['superadmin', 'geschaeftsfuehrung', 'herstellungsleitung']

const router = Router()
router.use(authMiddleware)

// GET /api/theme-presets — für alle authentifizierten User
router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT value FROM app_settings WHERE key = 'theme_presets'"
    )
    res.json(rows[0] ? JSON.parse(rows[0].value) : [])
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/theme-presets — neues Preset speichern (Admin only)
router.post('/', requireRole(...ADMIN_ROLES), async (req: any, res) => {
  try {
    const { name, mode, overrides, colorSchemeId } = req.body
    if (!name?.trim() || !mode || !overrides) {
      return res.status(400).json({ error: 'name, mode, overrides required' })
    }
    const { rows } = await pool.query(
      "SELECT value FROM app_settings WHERE key = 'theme_presets'"
    )
    const presets: any[] = rows[0] ? JSON.parse(rows[0].value) : []
    const newPreset = {
      id: `custom-${Date.now()}`,
      name: name.trim(),
      mode,
      overrides,
      colorSchemeId: colorSchemeId ?? null,
      isCustom: true,
      createdBy: req.user?.user_id ?? null,
    }
    presets.push(newPreset)
    await pool.query(
      "INSERT INTO app_settings (key, value) VALUES ('theme_presets', $1) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()",
      [JSON.stringify(presets)]
    )
    res.json(newPreset)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/theme-presets/:id — Preset löschen (Admin only)
router.delete('/:id', requireRole(...ADMIN_ROLES), async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT value FROM app_settings WHERE key = 'theme_presets'"
    )
    const presets: any[] = rows[0] ? JSON.parse(rows[0].value) : []
    const filtered = presets.filter((p: any) => p.id !== _req.params.id)
    await pool.query(
      "INSERT INTO app_settings (key, value) VALUES ('theme_presets', $1) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()",
      [JSON.stringify(filtered)]
    )
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default router
