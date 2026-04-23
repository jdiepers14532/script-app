import { Router } from 'express'
import { pool } from '../db'

const router = Router()

router.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ status: 'ok', service: 'script-backend', ts: new Date().toISOString() })
  } catch (err) {
    res.status(500).json({ status: 'error', error: String(err) })
  }
})

export default router
