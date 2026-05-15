import { Router } from 'express'
import { query, queryOne } from '../db'
import { authMiddleware } from '../auth'

const PROD_DB_URL  = process.env.PROD_DB_URL  ?? 'http://127.0.0.1:3005'
const INTERNAL_KEY = process.env.PRODUKTION_INTERNAL_SECRET ?? 'prod-internal-2026'

// ── Folgen v2 Router ─────────────────────────────────────────────────────────
// Mounted at /api/v2/folgen — reads from merged `folgen` table
export const folgenV2Router = Router()
folgenV2Router.use(authMiddleware)

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/v2/folgen/air-date?produktion_id=X&folge_nr=N
// Liefert das echte Sendedatum aus der Produktionsdatenbank (broadcast_events)
folgenV2Router.get('/air-date', async (req, res) => {
  try {
    const { produktion_id, folge_nr } = req.query
    if (!produktion_id || !folge_nr) return res.json({ air_date: null })

    const prod = await queryOne(
      'SELECT produktion_db_id FROM produktionen WHERE id = $1',
      [produktion_id]
    )
    if (!prod?.produktion_db_id) return res.json({ air_date: null })

    const r = await fetch(
      `${PROD_DB_URL}/api/internal/productions/${prod.produktion_db_id}/air-date?folge_nr=${encodeURIComponent(String(folge_nr))}`,
      { headers: { 'x-internal-key': INTERNAL_KEY }, signal: AbortSignal.timeout(3000) }
    )
    if (!r.ok) return res.json({ air_date: null })
    const d = await r.json() as any
    res.json({ air_date: d?.air_date ?? null })
  } catch (err) {
    res.json({ air_date: null })
  }
})

// GET /api/v2/folgen?produktion_id=X — all Folgen of a Produktion
// ══════════════════════════════════════════════════════════════════════════════
folgenV2Router.get('/', async (req, res) => {
  try {
    const { produktion_id } = req.query
    if (!produktion_id) return res.status(400).json({ error: 'produktion_id required' })

    const rows = await query(
      `SELECT f.*,
              (SELECT COUNT(*)::int FROM werkstufen w WHERE w.folge_id = f.id) AS werkstufen_count
       FROM folgen f
       WHERE f.produktion_id = $1
       ORDER BY f.folge_nummer`,
      [produktion_id]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/v2/folgen/:id — single Folge
// ══════════════════════════════════════════════════════════════════════════════
folgenV2Router.get('/:id', async (req, res) => {
  try {
    const row = await queryOne(
      `SELECT f.*,
              (SELECT COUNT(*)::int FROM werkstufen w WHERE w.folge_id = f.id) AS werkstufen_count
       FROM folgen f
       WHERE f.id = $1`,
      [req.params.id]
    )
    if (!row) return res.status(404).json({ error: 'Folge nicht gefunden' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/v2/folgen — create Folge
// ══════════════════════════════════════════════════════════════════════════════
folgenV2Router.post('/', async (req, res) => {
  const { produktion_id, folge_nummer, folgen_titel } = req.body
  const user = req.user!
  if (!produktion_id || !folge_nummer) return res.status(400).json({ error: 'produktion_id und folge_nummer required' })

  try {
    const row = await queryOne(
      `INSERT INTO folgen (produktion_id, folge_nummer, folgen_titel, erstellt_von)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (produktion_id, folge_nummer) DO NOTHING
       RETURNING *`,
      [produktion_id, folge_nummer, folgen_titel ?? null, user.user_id]
    )
    if (!row) {
      // Already exists — return existing
      const existing = await queryOne(
        'SELECT * FROM folgen WHERE produktion_id = $1 AND folge_nummer = $2',
        [produktion_id, folge_nummer]
      )
      return res.json(existing)
    }

    res.status(201).json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// PUT /api/v2/folgen/:id — update Folge (Titel, etc.)
// ══════════════════════════════════════════════════════════════════════════════
folgenV2Router.put('/:id', async (req, res) => {
  const { folgen_titel, air_date, synopsis } = req.body
  try {
    const row = await queryOne(
      `UPDATE folgen SET
        folgen_titel = COALESCE($1, folgen_titel),
        air_date = COALESCE($2, air_date),
        synopsis = COALESCE($3, synopsis)
       WHERE id = $4 RETURNING *`,
      [folgen_titel, air_date, synopsis, req.params.id]
    )
    if (!row) return res.status(404).json({ error: 'Folge nicht gefunden' })

    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})
