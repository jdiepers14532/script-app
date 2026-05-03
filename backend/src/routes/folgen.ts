import { Router } from 'express'
import { query, queryOne } from '../db'
import { authMiddleware } from '../auth'
import { prodQueryOne } from '../prodDb'

export const folgenRouter = Router()
folgenRouter.use(authMiddleware)

// GET /api/folgen/:produktionId/:folgeNummer — folge metadata
folgenRouter.get('/:produktionId/:folgeNummer', async (req, res) => {
  try {
    const { produktionId, folgeNummer } = req.params
    const row = await queryOne(
      `SELECT id, produktion_id, folge_nummer, folgen_titel AS arbeitstitel, air_date, synopsis, meta_json
       FROM folgen WHERE produktion_id = $1 AND folge_nummer = $2`,
      [produktionId, parseInt(folgeNummer)]
    )
    res.json(row || { produktion_id: produktionId, folge_nummer: parseInt(folgeNummer) })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/folgen/:produktionId/:folgeNummer — upsert folge metadata
folgenRouter.put('/:produktionId/:folgeNummer', async (req, res) => {
  try {
    const { produktionId, folgeNummer } = req.params
    const { arbeitstitel, air_date, synopsis } = req.body
    const row = await queryOne(
      `INSERT INTO folgen (produktion_id, folge_nummer, folgen_titel, air_date, synopsis)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (produktion_id, folge_nummer) DO UPDATE
       SET folgen_titel = COALESCE($3, folgen.folgen_titel),
           air_date = COALESCE($4, folgen.air_date),
           synopsis = COALESCE($5, folgen.synopsis)
       RETURNING id, produktion_id, folge_nummer, folgen_titel AS arbeitstitel, air_date, synopsis, meta_json`,
      [produktionId, parseInt(folgeNummer), arbeitstitel || null, air_date || null, synopsis || null]
    )
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/folgen/:produktionId/:folgeNummer/sendedatum — live from ProdDB broadcast_events
folgenRouter.get('/:produktionId/:folgeNummer/sendedatum', async (req, res) => {
  try {
    const { produktionId, folgeNummer } = req.params
    const staffel = await queryOne('SELECT produktion_db_id FROM produktionen WHERE id = $1', [produktionId])
    if (!staffel?.produktion_db_id) return res.json(null)

    const prod = await prodQueryOne(
      'SELECT id, reihen_id FROM productions WHERE id = $1',
      [staffel.produktion_db_id]
    )
    if (!prod) return res.json(null)

    const col = prod.reihen_id ? 'reihen_id' : 'production_id'
    const target = prod.reihen_id ?? prod.id

    const event = await prodQueryOne(
      `SELECT datum::text, ist_ki_prognose FROM broadcast_events
       WHERE ${col} = $1 AND folge_nr = $2 AND ist_ausfall = FALSE
       ORDER BY datum LIMIT 1`,
      [target, parseInt(folgeNummer)]
    )
    res.json(event || null)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/folgen/:produktionId/:folgeNummer/besetzung — characters for Vertragsdatenbank
folgenRouter.get('/:produktionId/:folgeNummer/besetzung', async (req, res) => {
  try {
    const { produktionId, folgeNummer } = req.params
    const szenen = await query(
      `SELECT s.content FROM stages st
       JOIN szenen s ON s.stage_id = st.id
       WHERE st.produktion_id = $1 AND st.folge_nummer = $2
       ORDER BY s.sort_order`,
      [produktionId, parseInt(folgeNummer)]
    )
    const charaktere: Set<string> = new Set()
    for (const szene of szenen) {
      const content = Array.isArray(szene.content) ? szene.content : []
      for (const te of content) {
        if (te.type === 'character' && te.text) charaktere.add(te.text)
      }
    }
    res.json({ produktion_id: produktionId, folge_nummer: parseInt(folgeNummer), charaktere: Array.from(charaktere) })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/folgen/:produktionId/:folgeNummer/synopsis — synopsis for Marketing-App
folgenRouter.get('/:produktionId/:folgeNummer/synopsis', async (req, res) => {
  try {
    const { produktionId, folgeNummer } = req.params
    const row = await queryOne(
      `SELECT folgen_titel AS arbeitstitel, synopsis FROM folgen WHERE produktion_id = $1 AND folge_nummer = $2`,
      [produktionId, parseInt(folgeNummer)]
    )
    res.json({
      produktion_id: produktionId,
      folge_nummer: parseInt(folgeNummer),
      arbeitstitel: row?.arbeitstitel || null,
      synopsis: row?.synopsis || null,
    })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})
