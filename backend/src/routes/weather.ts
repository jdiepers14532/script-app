import { Router } from 'express'
import { authMiddleware } from '../auth'
import { pool } from '../db'

const router = Router()

// GET /api/weather/geocode?city=Lüneburg
// Proxies Open-Meteo geocoding (avoids CSP connect-src restrictions in browser)
router.get('/geocode', authMiddleware, async (req, res) => {
  const city = (req.query.city as string)?.trim()
  if (!city) { res.status(400).json({ error: 'city required' }); return }
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=de&format=json`
    const r = await fetch(url)
    if (!r.ok) { res.status(502).json({ error: 'geocoding unavailable' }); return }
    const data = await r.json() as any
    res.json({ results: data.results ?? [] })
  } catch (err) {
    res.status(502).json({ error: 'geocoding error' })
  }
})

// GET /api/weather/archive?lat=&lon=&start_date=&end_date=
// Proxies Open-Meteo historical archive (avoids CSP connect-src restrictions in browser)
router.get('/archive', authMiddleware, async (req, res) => {
  const { lat, lon, start_date, end_date } = req.query as Record<string, string>
  if (!lat || !lon || !start_date || !end_date) {
    res.status(400).json({ error: 'lat, lon, start_date, end_date required' }); return
  }
  // Basic validation
  if (isNaN(Number(lat)) || isNaN(Number(lon))) { res.status(400).json({ error: 'invalid coordinates' }); return }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start_date) || !/^\d{4}-\d{2}-\d{2}$/.test(end_date)) {
    res.status(400).json({ error: 'invalid date format' }); return
  }
  try {
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${Number(lat).toFixed(4)}&longitude=${Number(lon).toFixed(4)}&start_date=${start_date}&end_date=${end_date}&daily=sunrise,sunset,temperature_2m_mean,precipitation_hours&timezone=Europe%2FBerlin`
    const r = await fetch(url)
    if (!r.ok) { res.status(502).json({ error: 'archive unavailable' }); return }
    const data = await r.json()
    res.json(data)
  } catch (err) {
    res.status(502).json({ error: 'archive error' })
  }
})

// GET /api/weather/daily-regeln/:productionId — Daily-Regeln config (read-only, any authenticated user)
router.get('/daily-regeln/:productionId', authMiddleware, async (req, res) => {
  const { productionId } = req.params
  try {
    // Production-level override first
    const { rows } = await pool.query(
      `SELECT value FROM production_app_settings WHERE production_id = $1 AND key = 'daily_regeln'`,
      [productionId]
    )
    if (rows.length) {
      try { res.json(JSON.parse(rows[0].value)); return } catch { /* parse error → fallback */ }
    }
    // Global fallback
    const { rows: global } = await pool.query(`SELECT value FROM app_settings WHERE key = 'daily_regeln'`)
    if (global.length) {
      try { res.json(JSON.parse(global[0].value)); return } catch { /* parse error → default */ }
    }
    res.json({ enabled: false, nachtbild_dauer_min: 20, drehschluss_zeit: '18:30' })
  } catch {
    res.json({ enabled: false, nachtbild_dauer_min: 20, drehschluss_zeit: '18:30' })
  }
})

export default router
