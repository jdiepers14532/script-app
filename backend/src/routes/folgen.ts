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
      `SELECT id, produktion_id, folge_nummer, folgen_titel AS arbeitstitel, synopsis
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
    const { arbeitstitel, synopsis } = req.body
    const row = await queryOne(
      `INSERT INTO folgen (produktion_id, folge_nummer, folgen_titel, synopsis)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (produktion_id, folge_nummer) DO UPDATE
       SET folgen_titel = COALESCE($3, folgen.folgen_titel),
           synopsis = COALESCE($4, folgen.synopsis)
       RETURNING id, produktion_id, folge_nummer, folgen_titel AS arbeitstitel, synopsis`,
      [produktionId, parseInt(folgeNummer), arbeitstitel || null, synopsis || null]
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
    const rows = await query(
      `SELECT DISTINCT c.name
       FROM scene_characters sc
       JOIN characters c ON c.id = sc.character_id
       JOIN scene_identities si ON si.id = sc.scene_identity_id
       JOIN folgen f ON f.id = si.folge_id
       WHERE f.produktion_id = $1 AND f.folge_nummer = $2
       ORDER BY c.name`,
      [produktionId, parseInt(folgeNummer)]
    )
    const charaktere = rows.map((r: any) => r.name)
    res.json({ produktion_id: produktionId, folge_nummer: parseInt(folgeNummer), charaktere })
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
