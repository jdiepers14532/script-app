import { Router } from 'express'
import { query, queryOne } from '../db'
import { authMiddleware } from '../auth'
import { prodQueryOne } from '../prodDb'

const router = Router()

router.use(authMiddleware)

// GET /api/staffeln
router.get('/', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM staffeln ORDER BY titel')
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/staffeln/:id
router.get('/:id', async (req, res) => {
  try {
    const row = await queryOne('SELECT * FROM staffeln WHERE id = $1', [req.params.id])
    if (!row) return res.status(404).json({ error: 'Staffel nicht gefunden' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/staffeln/:id/bloecke
router.get('/:id/bloecke', async (req, res) => {
  try {
    const staffel = await queryOne('SELECT * FROM staffeln WHERE id = $1', [req.params.id])
    if (!staffel) return res.status(404).json({ error: 'Staffel nicht gefunden' })

    if (staffel.produktion_db_id) {
      await syncBloeckeFromProdDB(req.params.id, staffel.produktion_db_id)
    }

    const rows = await query(
      'SELECT * FROM bloecke WHERE staffel_id = $1 ORDER BY sort_order, block_nummer',
      [req.params.id]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/staffeln/sync
router.post('/sync', async (req, res) => {
  const { production_id, title, staffelnummer, projektnummer } = req.body
  if (!production_id || !title) {
    return res.status(400).json({ error: 'production_id und title erforderlich' })
  }
  try {
    const label = staffelnummer ? `${title} Staffel ${staffelnummer}` : title
    await query(
      `INSERT INTO staffeln (id, titel, show_type, produktion_db_id, meta_json)
       VALUES ($1, $2, 'daily_soap', $3::uuid, $4)
       ON CONFLICT (id) DO UPDATE SET titel = $2, produktion_db_id = $3::uuid, meta_json = $4, updated_at = NOW()`,
      [
        production_id,
        label,
        production_id,
        JSON.stringify({ projektnummer: projektnummer ?? null, staffelnummer: staffelnummer ?? null })
      ]
    )
    res.json({ ok: true, staffel_id: production_id })
  } catch (err) {
    console.error('staffeln/sync error:', err)
    res.status(500).json({ error: String(err) })
  }
})

async function syncBloeckeFromProdDB(staffelId: string, prodDbId: string): Promise<void> {
  const prod = await prodQueryOne(
    'SELECT erster_block, bloecke FROM productions WHERE id = $1',
    [prodDbId]
  )
  if (!prod?.bloecke?.length) return

  const bloeckeJson: any[] = prod.bloecke
  // Each consecutive pair (team_index 0 + 1) = one Block
  const pairCount = Math.ceil(bloeckeJson.length / 2)

  for (let pairIdx = 0; pairIdx < pairCount; pairIdx++) {
    const entry0 = bloeckeJson[pairIdx * 2]
    const entry1 = bloeckeJson[pairIdx * 2 + 1]
    const blockNummer = prod.erster_block + pairIdx

    await query(
      `INSERT INTO bloecke (staffel_id, block_nummer, name, sort_order, meta_json)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (staffel_id, block_nummer) DO UPDATE
       SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order, meta_json = EXCLUDED.meta_json`,
      [
        staffelId,
        blockNummer,
        `Block ${blockNummer}`,
        pairIdx,
        JSON.stringify({
          proddb_id_0: entry0?.id ?? null,
          proddb_id_1: entry1?.id ?? null,
          dreh_von: entry0?.dreh_von || null,
          dreh_bis: entry1?.dreh_bis || entry0?.dreh_bis || null,
          folge_von_a: entry0?.folge_von ?? null,
          folge_bis_a: entry0?.folge_bis ?? null,
          folge_von_b: entry1?.folge_von ?? null,
          folge_bis_b: entry1?.folge_bis ?? null,
        }),
      ]
    )
  }
}

export default router
