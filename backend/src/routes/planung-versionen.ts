import { Router } from 'express'
import { query, queryOne } from '../db'
import { authMiddleware } from '../auth'

export const planungVersionenRouter = Router()
planungVersionenRouter.use(authMiddleware)

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/planung-versionen?produktion_id=X&typ=future|konzept|alle
// ══════════════════════════════════════════════════════════════════════════════
planungVersionenRouter.get('/', async (req, res) => {
  const { produktion_id, typ } = req.query
  if (!produktion_id) return res.status(400).json({ error: 'produktion_id required' })

  try {
    const result: any[] = []

    if (!typ || typ === 'future' || typ === 'alle') {
      const rows = await query(
        `SELECT id, produktion_id, zeitraum, label, notiz,
                freigabe_status, freigegeben_von, freigegeben_am,
                erstellt_von, erstellt_am,
                'future' AS typ
         FROM future_versionen
         WHERE produktion_id = $1
         ORDER BY erstellt_am DESC`,
        [produktion_id]
      )
      result.push(...rows)
    }

    if (!typ || typ === 'konzept' || typ === 'alle') {
      const rows = await query(
        `SELECT id, produktion_id, staffel, label, notiz,
                freigabe_status, freigegeben_von, freigegeben_am,
                erstellt_von, erstellt_am,
                'konzept' AS typ
         FROM konzept_versionen
         WHERE produktion_id = $1
         ORDER BY erstellt_am DESC`,
        [produktion_id]
      )
      result.push(...rows)
    }

    result.sort((a, b) => new Date(b.erstellt_am).getTime() - new Date(a.erstellt_am).getTime())
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/planung-versionen
// Body: { produktion_id, typ:'future'|'konzept', label?, notiz?, zeitraum?, staffel? }
// ══════════════════════════════════════════════════════════════════════════════
planungVersionenRouter.post('/', async (req, res) => {
  const { produktion_id, typ, label, notiz, zeitraum, staffel } = req.body
  if (!produktion_id || !typ) {
    return res.status(400).json({ error: 'produktion_id und typ required' })
  }
  if (!['future', 'konzept'].includes(typ)) {
    return res.status(400).json({ error: 'typ muss future oder konzept sein' })
  }

  const userId = (req as any).user?.user_id ?? null

  try {
    let snapshot_json: any

    if (typ === 'future') {
      // Snapshot: alle Stränge + Future-Beats + beat_charaktere
      const straenge = await query(
        `SELECT id, name, farbe, sort_order, status, typ, label, kurzinhalt,
                future_notizen, redaktionelle_kommentare, produktionelle_kommentare
         FROM straenge WHERE produktion_id = $1 ORDER BY sort_order, name`,
        [produktion_id]
      )

      const beats = await query(
        `SELECT
           sb.id, sb.strang_id, sb.block_nummer, sb.beat_text, sb.prosa_text,
           sb.sort_order, sb.ist_abgearbeitet,
           COALESCE(
             json_agg(
               json_build_object(
                 'character_id', bc.character_id,
                 'rolle',        bc.rolle
               ) ORDER BY bc.rolle
             ) FILTER (WHERE bc.beat_id IS NOT NULL),
             '[]'
           ) AS charaktere
         FROM strang_beats sb
         JOIN straenge s ON s.id = sb.strang_id
         LEFT JOIN beat_charaktere bc ON bc.beat_id = sb.id
         WHERE s.produktion_id = $1 AND sb.ebene = 'future'
         GROUP BY sb.id
         ORDER BY sb.strang_id, sb.sort_order`,
        [produktion_id]
      )

      snapshot_json = {
        straenge_count: straenge.length,
        beats_count: beats.length,
        straenge,
        beats,
      }
    } else {
      // Konzept-Snapshot: Stränge mit Metadaten
      const straenge = await query(
        `SELECT id, name, farbe, sort_order, status, typ, label, kurzinhalt,
                future_notizen, redaktionelle_kommentare, produktionelle_kommentare
         FROM straenge WHERE produktion_id = $1 ORDER BY sort_order, name`,
        [produktion_id]
      )
      snapshot_json = {
        straenge_count: straenge.length,
        straenge,
      }
    }

    let row: any
    if (typ === 'future') {
      row = await queryOne(
        `INSERT INTO future_versionen
           (produktion_id, zeitraum, label, notiz, snapshot_json, erstellt_von)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [produktion_id, zeitraum ?? null, label ?? null, notiz ?? null,
         JSON.stringify(snapshot_json), userId]
      )
    } else {
      row = await queryOne(
        `INSERT INTO konzept_versionen
           (produktion_id, staffel, label, notiz, snapshot_json, erstellt_von)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [produktion_id, staffel ?? null, label ?? null, notiz ?? null,
         JSON.stringify(snapshot_json), userId]
      )
    }

    res.status(201).json({ ...row, typ })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/planung-versionen/:id?typ=future|konzept
// ══════════════════════════════════════════════════════════════════════════════
planungVersionenRouter.get('/:id', async (req, res) => {
  const { id } = req.params
  const { typ } = req.query

  try {
    let row: any = null

    if (!typ || typ === 'future') {
      row = await queryOne(
        `SELECT *, 'future' AS typ FROM future_versionen WHERE id = $1`,
        [id]
      )
    }
    if (!row && (!typ || typ === 'konzept')) {
      row = await queryOne(
        `SELECT *, 'konzept' AS typ FROM konzept_versionen WHERE id = $1`,
        [id]
      )
    }
    if (!row) return res.status(404).json({ error: 'Version nicht gefunden' })

    // Aenderungslog
    const aenderungen = await query(
      `SELECT * FROM versions_aenderungen
       WHERE version_id = $1 AND version_typ = $2
       ORDER BY erstellt_am DESC`,
      [id, row.typ]
    )

    res.json({ ...row, aenderungen })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// PUT /api/planung-versionen/:id
// Body: { typ:'future'|'konzept', label?, notiz?, zeitraum?, staffel? }
// ══════════════════════════════════════════════════════════════════════════════
planungVersionenRouter.put('/:id', async (req, res) => {
  const { id } = req.params
  const { typ, label, notiz, zeitraum, staffel } = req.body

  try {
    let row: any = null
    if (!typ || typ === 'future') {
      row = await queryOne(
        `UPDATE future_versionen
         SET label = COALESCE($1, label),
             notiz = COALESCE($2, notiz),
             zeitraum = COALESCE($3, zeitraum)
         WHERE id = $4 RETURNING *, 'future' AS typ`,
        [label ?? null, notiz ?? null, zeitraum ?? null, id]
      )
    }
    if (!row && (!typ || typ === 'konzept')) {
      row = await queryOne(
        `UPDATE konzept_versionen
         SET label = COALESCE($1, label),
             notiz = COALESCE($2, notiz),
             staffel = COALESCE($3, staffel)
         WHERE id = $4 RETURNING *, 'konzept' AS typ`,
        [label ?? null, notiz ?? null, staffel ?? null, id]
      )
    }
    if (!row) return res.status(404).json({ error: 'Version nicht gefunden' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/planung-versionen/:id/freigeben
// Body: { typ:'future'|'konzept' }
// ══════════════════════════════════════════════════════════════════════════════
planungVersionenRouter.post('/:id/freigeben', async (req, res) => {
  const { id } = req.params
  const { typ } = req.body
  const userId = (req as any).user?.user_id ?? null

  try {
    let row: any = null
    if (!typ || typ === 'future') {
      row = await queryOne(
        `UPDATE future_versionen
         SET freigabe_status = 'freigegeben',
             freigegeben_von = $1,
             freigegeben_am  = NOW()
         WHERE id = $2 RETURNING *, 'future' AS typ`,
        [userId, id]
      )
    }
    if (!row && (!typ || typ === 'konzept')) {
      row = await queryOne(
        `UPDATE konzept_versionen
         SET freigabe_status = 'freigegeben',
             freigegeben_von = $1,
             freigegeben_am  = NOW()
         WHERE id = $2 RETURNING *, 'konzept' AS typ`,
        [userId, id]
      )
    }
    if (!row) return res.status(404).json({ error: 'Version nicht gefunden' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// DELETE /api/planung-versionen/:id?typ=future|konzept
// Nur Entwürfe löschbar
// ══════════════════════════════════════════════════════════════════════════════
planungVersionenRouter.delete('/:id', async (req, res) => {
  const { id } = req.params
  const { typ } = req.query

  try {
    let deleted = false
    if (!typ || typ === 'future') {
      const r = await queryOne(
        `DELETE FROM future_versionen
         WHERE id = $1 AND freigabe_status = 'entwurf' RETURNING id`,
        [id]
      )
      if (r) deleted = true
    }
    if (!deleted && (!typ || typ === 'konzept')) {
      const r = await queryOne(
        `DELETE FROM konzept_versionen
         WHERE id = $1 AND freigabe_status = 'entwurf' RETURNING id`,
        [id]
      )
      if (r) deleted = true
    }
    if (!deleted) {
      return res.status(400).json({ error: 'Version nicht gefunden oder bereits freigegeben' })
    }
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/planung-versionen/:id/aenderungen
// Body: { version_typ:'future'|'konzept', art:'inhaltlich'|'produktionell', beschreibung, referenz? }
// ══════════════════════════════════════════════════════════════════════════════
planungVersionenRouter.post('/:id/aenderungen', async (req, res) => {
  const { id } = req.params
  const { version_typ, art, beschreibung, referenz } = req.body
  if (!version_typ || !beschreibung) {
    return res.status(400).json({ error: 'version_typ und beschreibung required' })
  }
  const userId = (req as any).user?.user_id ?? null

  try {
    const row = await queryOne(
      `INSERT INTO versions_aenderungen
         (version_id, version_typ, art, beschreibung, referenz, erstellt_von)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [id, version_typ, art ?? null, beschreibung.trim(), referenz?.trim() ?? null, userId]
    )
    res.status(201).json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/planung-versionen/:id/aenderungen/:aId
planungVersionenRouter.delete('/:id/aenderungen/:aId', async (req, res) => {
  const { aId } = req.params
  try {
    await query('DELETE FROM versions_aenderungen WHERE id = $1', [aId])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})
