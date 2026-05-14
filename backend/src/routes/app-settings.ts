import { Router } from 'express'
import { pool } from '../db'

const router = Router()

// GET /api/admin/app-settings — alle Settings (auch ohne Auth lesbar, da nur Config-Werte)
router.get('/', async (_req, res) => {
  const { rows } = await pool.query('SELECT key, value FROM app_settings')
  const settings: Record<string, string> = {}
  for (const row of rows) settings[row.key] = row.value
  res.json(settings)
})

// PUT /api/admin/app-settings/:key — Setting aktualisieren (Admin only)
router.put('/:key', async (req, res) => {
  const { key } = req.params
  const { value } = req.body

  const allowed = [
    'treatment_label',
    'scene_kuerzel',
    'scene_logging_stage',
    'figuren_label',
    'scene_env_colors',
    'scene_env_colors_dark',
    'terminologie',
    'daily_regeln',
    'stockshot_suffix',
    'stimmung_config',
    'ln_settings',
    'page_margin_mm',
    'absatzformat_preset',
    'kopf_fusszeilen',
    // PWA Admin-Steuerung (v67)
    'pwa_update_action',
    // Team-Work (v68)
    'privat_modus_ablauf_stunden',
  ]

  if (!allowed.includes(key)) {
    return res.status(400).json({ error: 'Unknown setting key' })
  }

  // pwa_update_action darf auch leeren String als Reset empfangen
  const safeValue = value ?? ''

  await pool.query(
    'INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()',
    [key, safeValue]
  )
  res.json({ key, value: safeValue })
})

export default router
