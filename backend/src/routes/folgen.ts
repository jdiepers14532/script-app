import { Router } from 'express'
import { query, queryOne } from '../db'
import { authMiddleware } from '../auth'

export const folgenRouter = Router()
folgenRouter.use(authMiddleware)

// GET /api/folgen/:staffelId/:folgeNummer — folge metadata
folgenRouter.get('/:staffelId/:folgeNummer', async (req, res) => {
  try {
    const { staffelId, folgeNummer } = req.params
    const row = await queryOne(
      'SELECT * FROM folgen_meta WHERE staffel_id = $1 AND folge_nummer = $2',
      [staffelId, parseInt(folgeNummer)]
    )
    res.json(row || { staffel_id: staffelId, folge_nummer: parseInt(folgeNummer) })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/folgen/:staffelId/:folgeNummer — upsert folge metadata
folgenRouter.put('/:staffelId/:folgeNummer', async (req, res) => {
  try {
    const { staffelId, folgeNummer } = req.params
    const { arbeitstitel, air_date, synopsis } = req.body
    const row = await queryOne(
      `INSERT INTO folgen_meta (staffel_id, folge_nummer, arbeitstitel, air_date, synopsis, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (staffel_id, folge_nummer) DO UPDATE
       SET arbeitstitel = COALESCE($3, folgen_meta.arbeitstitel),
           air_date = COALESCE($4, folgen_meta.air_date),
           synopsis = COALESCE($5, folgen_meta.synopsis),
           updated_at = NOW()
       RETURNING *`,
      [staffelId, parseInt(folgeNummer), arbeitstitel || null, air_date || null, synopsis || null]
    )
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/folgen/:staffelId/:folgeNummer/besetzung — characters for Vertragsdatenbank
folgenRouter.get('/:staffelId/:folgeNummer/besetzung', async (req, res) => {
  try {
    const { staffelId, folgeNummer } = req.params
    const szenen = await query(
      `SELECT s.content FROM stages st
       JOIN szenen s ON s.stage_id = st.id
       WHERE st.staffel_id = $1 AND st.folge_nummer = $2
       ORDER BY s.sort_order`,
      [staffelId, parseInt(folgeNummer)]
    )
    const charaktere: Set<string> = new Set()
    for (const szene of szenen) {
      const content = Array.isArray(szene.content) ? szene.content : []
      for (const te of content) {
        if (te.type === 'character' && te.text) charaktere.add(te.text)
      }
    }
    res.json({ staffel_id: staffelId, folge_nummer: parseInt(folgeNummer), charaktere: Array.from(charaktere) })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/folgen/:staffelId/:folgeNummer/synopsis — synopsis for Marketing-App
folgenRouter.get('/:staffelId/:folgeNummer/synopsis', async (req, res) => {
  try {
    const { staffelId, folgeNummer } = req.params
    const row = await queryOne(
      'SELECT * FROM folgen_meta WHERE staffel_id = $1 AND folge_nummer = $2',
      [staffelId, parseInt(folgeNummer)]
    )
    res.json({
      staffel_id: staffelId,
      folge_nummer: parseInt(folgeNummer),
      arbeitstitel: row?.arbeitstitel || null,
      synopsis: row?.synopsis || null,
    })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})
