import { Router } from 'express'
import { query, queryOne, pool } from '../db'
import { authMiddleware } from '../auth'
import { prodQueryOne } from '../prodDb'

const router = Router()

router.use(authMiddleware)

// GET /api/produktionen/:id
router.get('/:id', async (req, res) => {
  try {
    const row = await queryOne('SELECT * FROM produktionen WHERE id = $1', [req.params.id])
    if (!row) return res.status(404).json({ error: 'Produktion nicht gefunden' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/produktionen/:id/bloecke — live from ProdDB, no local copy
router.get('/:id/bloecke', async (req, res) => {
  try {
    const produktion = await queryOne('SELECT * FROM produktionen WHERE id = $1', [req.params.id])
    if (!produktion) return res.status(404).json({ error: 'Produktion nicht gefunden' })
    if (!produktion.produktion_db_id) return res.json([])

    const prod = await prodQueryOne(
      'SELECT erster_block, bloecke FROM productions WHERE id = $1',
      [produktion.produktion_db_id]
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

// POST /api/produktionen/:id/copy-settings — copy settings from another staffel (atomic)
router.post('/:id/copy-settings', async (req, res) => {
  const { source_produktion_id, sections } = req.body
  const targetId = req.params.id
  if (!source_produktion_id || !Array.isArray(sections) || !sections.length) {
    return res.status(400).json({ error: 'source_produktion_id und sections erforderlich' })
  }
  const allowed = ['kategorien', 'labels', 'colors', 'einstellungen', 'absatzformate', 'vorlagen']
  const invalid = (sections as string[]).filter(s => !allowed.includes(s))
  if (invalid.length) return res.status(400).json({ error: `Ungültige Sections: ${invalid.join(', ')}` })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    if (sections.includes('kategorien')) {
      await client.query('DELETE FROM character_kategorien WHERE produktion_id = $1', [targetId])
      const src = await client.query('SELECT * FROM character_kategorien WHERE produktion_id = $1 ORDER BY sort_order, id', [source_produktion_id])
      for (const row of src.rows) {
        await client.query(
          'INSERT INTO character_kategorien (produktion_id, name, typ, sort_order) VALUES ($1, $2, $3, $4)',
          [targetId, row.name, row.typ, row.sort_order]
        )
      }
    }

    if (sections.includes('labels')) {
      await client.query('DELETE FROM stage_labels WHERE produktion_id = $1', [targetId])
      const src = await client.query('SELECT * FROM stage_labels WHERE produktion_id = $1 ORDER BY sort_order, id', [source_produktion_id])
      for (const row of src.rows) {
        await client.query(
          'INSERT INTO stage_labels (produktion_id, name, sort_order, is_produktionsfassung) VALUES ($1, $2, $3, $4)',
          [targetId, row.name, row.sort_order, row.is_produktionsfassung]
        )
      }
    }

    if (sections.includes('colors')) {
      await client.query('DELETE FROM revision_colors WHERE produktion_id = $1', [targetId])
      const src = await client.query('SELECT * FROM revision_colors WHERE produktion_id = $1 ORDER BY sort_order, id', [source_produktion_id])
      for (const row of src.rows) {
        await client.query(
          'INSERT INTO revision_colors (produktion_id, name, color, sort_order) VALUES ($1, $2, $3, $4)',
          [targetId, row.name, row.color, row.sort_order]
        )
      }
    }

    if (sections.includes('einstellungen')) {
      const src = await client.query('SELECT * FROM revision_export_einstellungen WHERE produktion_id = $1', [source_produktion_id])
      if (src.rows.length) {
        const e = src.rows[0]
        await client.query(
          `INSERT INTO revision_export_einstellungen (produktion_id, memo_schwellwert_zeichen)
           VALUES ($1, $2)
           ON CONFLICT (produktion_id) DO UPDATE SET memo_schwellwert_zeichen = $2`,
          [targetId, e.memo_schwellwert_zeichen]
        )
      }
    }

    if (sections.includes('absatzformate')) {
      await client.query('DELETE FROM absatzformate WHERE produktion_id = $1', [targetId])
      const src = await client.query(
        'SELECT * FROM absatzformate WHERE produktion_id = $1 ORDER BY sort_order',
        [source_produktion_id]
      )
      for (const row of src.rows) {
        await client.query(
          `INSERT INTO absatzformate (produktion_id, name, kuerzel, kategorie, font_family, font_size,
            bold, italic, underline, uppercase, text_align, margin_left, margin_right,
            space_before, space_after, line_height, sort_order, ist_standard, textbaustein,
            enter_next, tab_next, shortcut)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
          [targetId, row.name, row.kuerzel, row.kategorie, row.font_family, row.font_size,
            row.bold, row.italic, row.underline, row.uppercase, row.text_align,
            row.margin_left, row.margin_right, row.space_before, row.space_after,
            row.line_height, row.sort_order, row.ist_standard, row.textbaustein,
            row.enter_next, row.tab_next, row.shortcut]
        )
      }
    }

    if (sections.includes('vorlagen')) {
      await client.query('DELETE FROM dokument_vorlagen WHERE produktion_id = $1', [targetId])
      const src = await client.query(
        'SELECT * FROM dokument_vorlagen WHERE produktion_id = $1 ORDER BY created_at',
        [source_produktion_id]
      )
      for (const row of src.rows) {
        await client.query(
          `INSERT INTO dokument_vorlagen (produktion_id, name, typ, sektionen, meta_fields, created_by)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [targetId, row.name, row.typ, JSON.stringify(row.sektionen), JSON.stringify(row.meta_fields), row.created_by]
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

// POST /api/produktionen/sync — called by Produktionsdatenbank on production sync
router.post('/sync', async (req, res) => {
  const { production_id, title, staffelnummer, projektnummer } = req.body
  if (!production_id || !title) {
    return res.status(400).json({ error: 'production_id und title erforderlich' })
  }
  try {
    const label = staffelnummer ? `${title} Staffel ${staffelnummer}` : title
    await query(
      `INSERT INTO produktionen (id, titel, produktion_db_id, meta_json)
       VALUES ($1, $2, $3::uuid, $4)
       ON CONFLICT (id) DO UPDATE SET titel = $2, produktion_db_id = $3::uuid, meta_json = $4, updated_at = NOW()`,
      [
        production_id,
        label,
        production_id,
        JSON.stringify({ projektnummer: projektnummer ?? null, staffelnummer: staffelnummer ?? null })
      ]
    )
    res.json({ ok: true, produktion_id: production_id })
  } catch (err) {
    console.error('produktionen/sync error:', err)
    res.status(500).json({ error: String(err) })
  }
})

export default router
