import { Router } from 'express'
import { query, queryOne } from '../db'
import { authMiddleware } from '../auth'

// Two separate routers for different mount points
export const episodenRouter = Router()
export const bloeckeRouter = Router()

episodenRouter.use(authMiddleware)
bloeckeRouter.use(authMiddleware)

// GET /api/episoden/:id
episodenRouter.get('/:id', async (req, res) => {
  try {
    const row = await queryOne('SELECT * FROM episoden WHERE id = $1', [req.params.id])
    if (!row) return res.status(404).json({ error: 'Episode nicht gefunden' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/episoden/:id
episodenRouter.put('/:id', async (req, res) => {
  try {
    const { arbeitstitel, air_date, synopsis, meta_json } = req.body
    const row = await queryOne(
      `UPDATE episoden SET
        arbeitstitel = COALESCE($1, arbeitstitel),
        air_date = COALESCE($2, air_date),
        synopsis = COALESCE($3, synopsis),
        meta_json = COALESCE($4, meta_json),
        updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [arbeitstitel, air_date || null, synopsis, meta_json ? JSON.stringify(meta_json) : null, req.params.id]
    )
    if (!row) return res.status(404).json({ error: 'Episode nicht gefunden' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/bloecke/:blockId/episoden
bloeckeRouter.get('/:blockId/episoden', async (req, res) => {
  try {
    const block = await queryOne(
      `SELECT b.*, s.produktion_db_id FROM bloecke b
       JOIN staffeln s ON s.id = b.staffel_id
       WHERE b.id = $1`,
      [req.params.blockId]
    )

    if (block?.produktion_db_id && block.meta_json) {
      await syncEpisodenFromProdDB(block)
    }

    const rows = await query(
      'SELECT * FROM episoden WHERE block_id = $1 ORDER BY episode_nummer',
      [req.params.blockId]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/bloecke/:blockId/episoden
bloeckeRouter.post('/:blockId/episoden', async (req, res) => {
  try {
    const { episode_nummer, staffel_nummer, arbeitstitel, air_date, synopsis } = req.body
    const row = await queryOne(
      `INSERT INTO episoden (block_id, episode_nummer, staffel_nummer, arbeitstitel, air_date, synopsis)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.params.blockId, episode_nummer, staffel_nummer || 1, arbeitstitel, air_date || null, synopsis || null]
    )
    res.status(201).json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/episoden/:id/besetzung — Characters for Vertragsdatenbank
episodenRouter.get('/:id/besetzung', async (req, res) => {
  try {
    const { query: dbQuery } = await import('../db')
    const szenen = await dbQuery(
      `SELECT s.content FROM stages st
       JOIN szenen s ON s.stage_id = st.id
       WHERE st.episode_id = $1
       ORDER BY s.sort_order`,
      [req.params.id]
    )
    const charaktere: Set<string> = new Set()
    for (const szene of szenen) {
      const content = Array.isArray(szene.content) ? szene.content : []
      for (const block of content) {
        if (block.type === 'character' && block.text) {
          charaktere.add(block.text)
        }
      }
    }
    res.json({ episode_id: req.params.id, charaktere: Array.from(charaktere) })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/episoden/:id/synopsis — Synopsis for Marketing-App
episodenRouter.get('/:id/synopsis', async (req, res) => {
  try {
    const { queryOne: dbQueryOne } = await import('../db')
    const ep = await dbQueryOne('SELECT * FROM episoden WHERE id = $1', [req.params.id])
    if (!ep) return res.status(404).json({ error: 'Episode nicht gefunden' })
    res.json({ episode_id: ep.id, arbeitstitel: ep.arbeitstitel, synopsis: ep.synopsis })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

async function syncEpisodenFromProdDB(block: any): Promise<void> {
  const meta = block.meta_json || {}
  const folgeVon = meta.folge_von
  const folgeBis = meta.folge_bis
  if (folgeVon == null || folgeBis == null) return

  for (let epNr = folgeVon; epNr <= folgeBis; epNr++) {
    await query(
      `INSERT INTO episoden (block_id, episode_nummer, staffel_nummer)
       VALUES ($1, $2, $3)
       ON CONFLICT (block_id, episode_nummer) DO NOTHING`,
      [block.id, epNr, block.block_nummer]
    )
  }
}

// Default export for backward compat
export default episodenRouter
