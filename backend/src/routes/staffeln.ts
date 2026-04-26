import { Router } from 'express'
import { query, queryOne, pool } from '../db'
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

// GET /api/staffeln/:id/bloecke — live from ProdDB, no local copy
router.get('/:id/bloecke', async (req, res) => {
  try {
    const staffel = await queryOne('SELECT * FROM staffeln WHERE id = $1', [req.params.id])
    if (!staffel) return res.status(404).json({ error: 'Staffel nicht gefunden' })
    if (!staffel.produktion_db_id) return res.json([])

    const prod = await prodQueryOne(
      'SELECT erster_block, bloecke FROM productions WHERE id = $1',
      [staffel.produktion_db_id]
    )
    if (!prod?.bloecke?.length) return res.json([])

    res.json(prod.bloecke.map((entry: any, i: number) => ({
      proddb_id: entry.id,
      block_nummer: prod.erster_block + i,
      team_index: entry.team_index ?? null,
      folge_von: entry.folge_von ?? null,
      folge_bis: entry.folge_bis ?? null,
      dreh_von: entry.dreh_von || null,
      dreh_bis: entry.dreh_bis || null,
      drehtage: entry.drehtage || null,
    })))
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/staffeln/:id/copy-settings — copy settings from another staffel (atomic)
router.post('/:id/copy-settings', async (req, res) => {
  const { source_staffel_id, sections } = req.body
  const targetId = req.params.id
  if (!source_staffel_id || !Array.isArray(sections) || !sections.length) {
    return res.status(400).json({ error: 'source_staffel_id und sections erforderlich' })
  }
  const allowed = ['kategorien', 'labels', 'colors', 'einstellungen']
  const invalid = (sections as string[]).filter(s => !allowed.includes(s))
  if (invalid.length) return res.status(400).json({ error: `Ungültige Sections: ${invalid.join(', ')}` })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    if (sections.includes('kategorien')) {
      await client.query('DELETE FROM character_kategorien WHERE staffel_id = $1', [targetId])
      const src = await client.query('SELECT * FROM character_kategorien WHERE staffel_id = $1 ORDER BY sort_order, id', [source_staffel_id])
      for (const row of src.rows) {
        await client.query(
          'INSERT INTO character_kategorien (staffel_id, name, typ, sort_order) VALUES ($1, $2, $3, $4)',
          [targetId, row.name, row.typ, row.sort_order]
        )
      }
    }

    if (sections.includes('labels')) {
      await client.query('DELETE FROM stage_labels WHERE staffel_id = $1', [targetId])
      const src = await client.query('SELECT * FROM stage_labels WHERE staffel_id = $1 ORDER BY sort_order, id', [source_staffel_id])
      for (const row of src.rows) {
        await client.query(
          'INSERT INTO stage_labels (staffel_id, name, sort_order, is_produktionsfassung) VALUES ($1, $2, $3, $4)',
          [targetId, row.name, row.sort_order, row.is_produktionsfassung]
        )
      }
    }

    if (sections.includes('colors')) {
      await client.query('DELETE FROM revision_colors WHERE staffel_id = $1', [targetId])
      const src = await client.query('SELECT * FROM revision_colors WHERE staffel_id = $1 ORDER BY sort_order, id', [source_staffel_id])
      for (const row of src.rows) {
        await client.query(
          'INSERT INTO revision_colors (staffel_id, name, color, sort_order) VALUES ($1, $2, $3, $4)',
          [targetId, row.name, row.color, row.sort_order]
        )
      }
    }

    if (sections.includes('einstellungen')) {
      const src = await client.query('SELECT * FROM revision_export_einstellungen WHERE staffel_id = $1', [source_staffel_id])
      if (src.rows.length) {
        const e = src.rows[0]
        await client.query(
          `INSERT INTO revision_export_einstellungen (staffel_id, memo_schwellwert_zeichen)
           VALUES ($1, $2)
           ON CONFLICT (staffel_id) DO UPDATE SET memo_schwellwert_zeichen = $2`,
          [targetId, e.memo_schwellwert_zeichen]
        )
      }
    }

    await client.query('COMMIT')
    res.json({ ok: true })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('copy-settings error:', err)
    res.status(500).json({ error: String(err) })
  } finally {
    client.release()
  }
})

// POST /api/staffeln/sync — called by Produktionsdatenbank on production sync
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

export default router
