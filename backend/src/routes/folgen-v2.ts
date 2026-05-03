import { Router } from 'express'
import { query, queryOne } from '../db'
import { authMiddleware } from '../auth'

// ── Folgen v2 Router ─────────────────────────────────────────────────────────
// Mounted at /api/v2/folgen — reads from merged `folgen` table
export const folgenV2Router = Router()
folgenV2Router.use(authMiddleware)

// ══════════════════════════════════════════════════════════════════════════════
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
