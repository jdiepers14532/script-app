import { Router } from 'express'
import { pool } from '../db'

const router = Router()

// GET /api/admin/app-settings — all settings (public read, no auth required for GET)
router.get('/', async (_req, res) => {
  const { rows } = await pool.query('SELECT key, value FROM app_settings')
  const settings: Record<string, string> = {}
  for (const row of rows) settings[row.key] = row.value
  res.json(settings)
})

// PUT /api/admin/app-settings/:key — update a setting (admin only)
router.put('/:key', async (req, res) => {
  const { key } = req.params
  const { value } = req.body
  if (!value) return res.status(400).json({ error: 'value required' })
  const allowed = ['treatment_label', 'scene_kuerzel', 'scene_logging_stage']
  if (!allowed.includes(key)) return res.status(400).json({ error: 'Unknown setting' })
  await pool.query(
    'INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()',
    [key, value]
  )
  res.json({ key, value })
})

export default router
