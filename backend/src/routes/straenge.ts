import { Router } from 'express'
import { pool, query, queryOne } from '../db'
import { authMiddleware } from '../auth'

// ── Straenge Router ────────────────────────────────────────────────────────────
// Mounted at /api/straenge
export const straengeRouter = Router()
straengeRouter.use(authMiddleware)

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/straenge?produktion_id=X — all strands for a production
// ══════════════════════════════════════════════════════════════════════════════
straengeRouter.get('/', async (req, res) => {
  const { produktion_id } = req.query
  if (!produktion_id) return res.status(400).json({ error: 'produktion_id required' })
  try {
    const rows = await query(
      `SELECT s.*,
              (SELECT COUNT(*) FROM dokument_szenen_straenge dss
               JOIN dokument_szenen ds ON ds.id = dss.dokument_szene_id
               WHERE dss.strang_id = s.id AND ds.geloescht IS NOT TRUE) AS szenen_count,
              (SELECT json_agg(json_build_object(
                'character_id', sc.character_id, 'rolle', sc.rolle,
                'name', c.name
              ) ORDER BY sc.rolle, c.name)
               FROM strang_charaktere sc
               JOIN characters c ON c.id = sc.character_id
               WHERE sc.strang_id = s.id) AS charaktere
       FROM straenge s
       WHERE s.produktion_id = $1
       ORDER BY
         CASE s.status WHEN 'aktiv' THEN 0 WHEN 'ruhend' THEN 1 WHEN 'beendet' THEN 2 END,
         s.sort_order, s.name`,
      [produktion_id]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/straenge — create a new strand
// ══════════════════════════════════════════════════════════════════════════════
straengeRouter.post('/', async (req, res) => {
  const {
    produktion_id, name, untertitel, kurzinhalt, farbe, typ, label,
    future_notizen, redaktionelle_kommentare, produktionelle_kommentare,
  } = req.body
  if (!produktion_id || !name) {
    return res.status(400).json({ error: 'produktion_id and name required' })
  }
  try {
    // Determine next sort_order
    const maxSort = await queryOne(
      'SELECT COALESCE(MAX(sort_order), 0) AS mx FROM straenge WHERE produktion_id = $1',
      [produktion_id]
    )
    const row = await queryOne(
      `INSERT INTO straenge
         (produktion_id, name, untertitel, kurzinhalt, farbe, typ, label,
          sort_order, future_notizen, redaktionelle_kommentare,
          produktionelle_kommentare, erstellt_von)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [
        produktion_id, name, untertitel ?? null, kurzinhalt ?? null,
        farbe ?? '#007AFF', typ ?? 'soap', label ?? null,
        (maxSort?.mx ?? 0) + 1,
        future_notizen ?? null, redaktionelle_kommentare ?? null,
        produktionelle_kommentare ?? null, req.user?.name ?? null,
      ]
    )
    res.status(201).json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// PUT /api/straenge/:id — update a strand
// ══════════════════════════════════════════════════════════════════════════════
straengeRouter.put('/:id', async (req, res) => {
  const {
    name, untertitel, kurzinhalt, farbe, typ, label, status,
    beendet_ab_folge_id, sort_order,
    future_notizen, redaktionelle_kommentare, produktionelle_kommentare,
  } = req.body
  try {
    const row = await queryOne(
      `UPDATE straenge SET
        name = COALESCE($1, name),
        untertitel = COALESCE($2, untertitel),
        kurzinhalt = COALESCE($3, kurzinhalt),
        farbe = COALESCE($4, farbe),
        typ = COALESCE($5, typ),
        label = COALESCE($6, label),
        status = COALESCE($7, status),
        beendet_ab_folge_id = $8,
        sort_order = COALESCE($9, sort_order),
        future_notizen = COALESCE($10, future_notizen),
        redaktionelle_kommentare = COALESCE($11, redaktionelle_kommentare),
        produktionelle_kommentare = COALESCE($12, produktionelle_kommentare),
        aktualisiert_am = NOW()
       WHERE id = $13 RETURNING *`,
      [
        name ?? null, untertitel, kurzinhalt, farbe ?? null,
        typ ?? null, label, status ?? null,
        beendet_ab_folge_id !== undefined ? beendet_ab_folge_id : null,
        sort_order ?? null,
        future_notizen, redaktionelle_kommentare, produktionelle_kommentare,
        req.params.id,
      ]
    )
    if (!row) return res.status(404).json({ error: 'Strang nicht gefunden' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// DELETE /api/straenge/:id — delete a strand
// ══════════════════════════════════════════════════════════════════════════════
straengeRouter.delete('/:id', async (req, res) => {
  try {
    const row = await queryOne('DELETE FROM straenge WHERE id = $1 RETURNING id', [req.params.id])
    if (!row) return res.status(404).json({ error: 'Strang nicht gefunden' })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// PUT /api/straenge/sortierung — batch update sort_order
// ══════════════════════════════════════════════════════════════════════════════
straengeRouter.put('/sortierung', async (req, res) => {
  const { order } = req.body // UUID[] in desired order
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be UUID array' })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (let i = 0; i < order.length; i++) {
      await client.query('UPDATE straenge SET sort_order = $1 WHERE id = $2', [i + 1, order[i]])
    }
    await client.query('COMMIT')
    res.json({ ok: true })
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: String(err) })
  } finally {
    client.release()
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// STRANG-CHARAKTERE
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/straenge/:id/charaktere
straengeRouter.get('/:id/charaktere', async (req, res) => {
  try {
    const rows = await query(
      `SELECT sc.*, c.name, c.meta_json
       FROM strang_charaktere sc
       JOIN characters c ON c.id = sc.character_id
       WHERE sc.strang_id = $1
       ORDER BY sc.rolle, c.name`,
      [req.params.id]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/straenge/:id/charaktere
straengeRouter.post('/:id/charaktere', async (req, res) => {
  const { character_id, rolle } = req.body
  if (!character_id) return res.status(400).json({ error: 'character_id required' })
  try {
    const row = await queryOne(
      `INSERT INTO strang_charaktere (strang_id, character_id, rolle)
       VALUES ($1, $2, $3)
       ON CONFLICT (strang_id, character_id)
       DO UPDATE SET rolle = EXCLUDED.rolle
       RETURNING *`,
      [req.params.id, character_id, rolle ?? 'haupt']
    )
    res.status(201).json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/straenge/:id/charaktere/:characterId
straengeRouter.delete('/:id/charaktere/:characterId', async (req, res) => {
  try {
    const row = await queryOne(
      'DELETE FROM strang_charaktere WHERE strang_id = $1 AND character_id = $2 RETURNING id',
      [req.params.id, req.params.characterId]
    )
    if (!row) return res.status(404).json({ error: 'Nicht gefunden' })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// STRANG-BEATS
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/straenge/:id/beats?ebene=future
straengeRouter.get('/:id/beats', async (req, res) => {
  const { ebene } = req.query
  try {
    let sql = `SELECT sb.*, f.folge_nummer
               FROM strang_beats sb
               LEFT JOIN folgen f ON f.id = sb.folge_id
               WHERE sb.strang_id = $1`
    const params: any[] = [req.params.id]
    if (ebene) {
      sql += ' AND sb.ebene = $2'
      params.push(ebene)
    }
    sql += ' ORDER BY sb.ebene, sb.sort_order, sb.erstellt_am'
    const rows = await query(sql, params)
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/straenge/:id/beats
straengeRouter.post('/:id/beats', async (req, res) => {
  const { ebene, block_label, folge_id, beat_text, parent_beat_id } = req.body
  if (!beat_text) return res.status(400).json({ error: 'beat_text required' })
  try {
    const maxSort = await queryOne(
      'SELECT COALESCE(MAX(sort_order), 0) AS mx FROM strang_beats WHERE strang_id = $1 AND ebene = $2',
      [req.params.id, ebene ?? 'future']
    )
    const row = await queryOne(
      `INSERT INTO strang_beats (strang_id, ebene, block_label, folge_id, beat_text, sort_order, parent_beat_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        req.params.id, ebene ?? 'future', block_label ?? null,
        folge_id ?? null, beat_text, (maxSort?.mx ?? 0) + 1,
        parent_beat_id ?? null,
      ]
    )
    res.status(201).json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/straenge/beats/:id
straengeRouter.put('/beats/:beatId', async (req, res) => {
  const { beat_text, ist_abgearbeitet, sort_order, block_label, folge_id, parent_beat_id } = req.body
  try {
    const row = await queryOne(
      `UPDATE strang_beats SET
        beat_text = COALESCE($1, beat_text),
        ist_abgearbeitet = COALESCE($2, ist_abgearbeitet),
        sort_order = COALESCE($3, sort_order),
        block_label = COALESCE($4, block_label),
        folge_id = COALESCE($5, folge_id),
        parent_beat_id = $6
       WHERE id = $7 RETURNING *`,
      [
        beat_text ?? null, ist_abgearbeitet ?? null, sort_order ?? null,
        block_label ?? null, folge_id ?? null,
        parent_beat_id !== undefined ? parent_beat_id : null,
        req.params.beatId,
      ]
    )
    if (!row) return res.status(404).json({ error: 'Beat nicht gefunden' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/straenge/beats/:id
straengeRouter.delete('/beats/:beatId', async (req, res) => {
  try {
    const row = await queryOne('DELETE FROM strang_beats WHERE id = $1 RETURNING id', [req.params.beatId])
    if (!row) return res.status(404).json({ error: 'Beat nicht gefunden' })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/straenge/beats/:id/abgearbeitet — toggle
straengeRouter.put('/beats/:beatId/abgearbeitet', async (req, res) => {
  try {
    const row = await queryOne(
      `UPDATE strang_beats SET ist_abgearbeitet = NOT ist_abgearbeitet WHERE id = $1 RETURNING *`,
      [req.params.beatId]
    )
    if (!row) return res.status(404).json({ error: 'Beat nicht gefunden' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// SZENEN-ZUORDNUNG (dokument_szenen_straenge)
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/dokument-szenen/:id/straenge
straengeRouter.get('/szene/:dokumentSzeneId', async (req, res) => {
  try {
    const rows = await query(
      `SELECT dss.*, s.name, s.farbe, s.typ, s.label, s.status
       FROM dokument_szenen_straenge dss
       JOIN straenge s ON s.id = dss.strang_id
       WHERE dss.dokument_szene_id = $1
       ORDER BY dss.sort_order`,
      [req.params.dokumentSzeneId]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/straenge/szene/:dokumentSzeneId — assign strand to scene
straengeRouter.post('/szene/:dokumentSzeneId', async (req, res) => {
  const { strang_id } = req.body
  if (!strang_id) return res.status(400).json({ error: 'strang_id required' })
  try {
    const maxSort = await queryOne(
      'SELECT COALESCE(MAX(sort_order), 0) AS mx FROM dokument_szenen_straenge WHERE dokument_szene_id = $1',
      [req.params.dokumentSzeneId]
    )
    const row = await queryOne(
      `INSERT INTO dokument_szenen_straenge (dokument_szene_id, strang_id, sort_order)
       VALUES ($1, $2, $3)
       ON CONFLICT (dokument_szene_id, strang_id) DO NOTHING
       RETURNING *`,
      [req.params.dokumentSzeneId, strang_id, (maxSort?.mx ?? 0) + 1]
    )
    if (!row) return res.json({ ok: true, already_assigned: true })
    res.status(201).json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/straenge/szene/:dokumentSzeneId/:strangId — remove assignment
straengeRouter.delete('/szene/:dokumentSzeneId/:strangId', async (req, res) => {
  try {
    const row = await queryOne(
      'DELETE FROM dokument_szenen_straenge WHERE dokument_szene_id = $1 AND strang_id = $2 RETURNING id',
      [req.params.dokumentSzeneId, req.params.strangId]
    )
    if (!row) return res.status(404).json({ error: 'Zuordnung nicht gefunden' })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/straenge/bulk-szenen — bulk assign strand to multiple scenes
straengeRouter.post('/bulk-szenen', async (req, res) => {
  const { dokument_szene_ids, strang_id } = req.body
  if (!Array.isArray(dokument_szene_ids) || !strang_id) {
    return res.status(400).json({ error: 'dokument_szene_ids (array) and strang_id required' })
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    let inserted = 0
    for (const dsId of dokument_szene_ids) {
      const maxSort = await queryOne(
        'SELECT COALESCE(MAX(sort_order), 0) AS mx FROM dokument_szenen_straenge WHERE dokument_szene_id = $1',
        [dsId]
      )
      const { rowCount } = await client.query(
        `INSERT INTO dokument_szenen_straenge (dokument_szene_id, strang_id, sort_order)
         VALUES ($1, $2, $3)
         ON CONFLICT (dokument_szene_id, strang_id) DO NOTHING`,
        [dsId, strang_id, (maxSort?.mx ?? 0) + 1]
      )
      inserted += rowCount ?? 0
    }
    await client.query('COMMIT')
    res.json({ ok: true, inserted })
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: String(err) })
  } finally {
    client.release()
  }
})

// POST /api/straenge/bulk-szenen/entfernen — bulk remove strand from multiple scenes
straengeRouter.post('/bulk-szenen/entfernen', async (req, res) => {
  const { dokument_szene_ids, strang_id } = req.body
  if (!Array.isArray(dokument_szene_ids) || !strang_id) {
    return res.status(400).json({ error: 'dokument_szene_ids (array) and strang_id required' })
  }
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM dokument_szenen_straenge WHERE dokument_szene_id = ANY($1) AND strang_id = $2',
      [dokument_szene_ids, strang_id]
    )
    res.json({ ok: true, removed: rowCount })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// PLATZHALTER-SZENEN
// ══════════════════════════════════════════════════════════════════════════════

// POST /api/straenge/platzhalter-szenen — create placeholder scenes
straengeRouter.post('/platzhalter-szenen', async (req, res) => {
  const { werkstufe_id, anzahl, strang_id } = req.body
  if (!werkstufe_id || !anzahl || anzahl < 1 || anzahl > 50) {
    return res.status(400).json({ error: 'werkstufe_id and anzahl (1-50) required' })
  }

  const client = await pool.connect()
  try {
    // Get werkstufe to find folge_id
    const ws = await queryOne('SELECT * FROM werkstufen WHERE id = $1', [werkstufe_id])
    if (!ws) return res.status(404).json({ error: 'Werkstufe nicht gefunden' })

    // Get max sort_order and scene_nummer
    const maxes = await queryOne(
      `SELECT COALESCE(MAX(sort_order), 0) AS max_sort,
              COALESCE(MAX(scene_nummer), 0) AS max_num
       FROM dokument_szenen WHERE werkstufe_id = $1`,
      [werkstufe_id]
    )
    const baseSort = (maxes?.max_sort ?? 0)
    const baseNum = (maxes?.max_num ?? 0)

    await client.query('BEGIN')
    const created: any[] = []

    for (let i = 0; i < anzahl; i++) {
      // Create scene_identity
      const identity = await queryOne(
        `INSERT INTO scene_identities (folge_id, created_by) VALUES ($1, $2) RETURNING id`,
        [ws.folge_id, req.user?.user_id ?? 'system']
      )

      // Create dokument_szene (empty placeholder)
      const ds = await queryOne(
        `INSERT INTO dokument_szenen
           (werkstufe_id, scene_identity_id, element_type, format,
            sort_order, scene_nummer, int_ext, tageszeit, updated_by)
         VALUES ($1, $2, 'scene', $3, $4, $5, 'INT', 'TAG', $6) RETURNING *`,
        [
          werkstufe_id, identity.id, ws.typ === 'storyline' ? 'storyline' : 'drehbuch',
          baseSort + i + 1, baseNum + i + 1,
          req.user?.name ?? 'system',
        ]
      )

      // Assign strand if provided
      if (strang_id) {
        await client.query(
          `INSERT INTO dokument_szenen_straenge (dokument_szene_id, strang_id, sort_order)
           VALUES ($1, $2, 1) ON CONFLICT DO NOTHING`,
          [ds.id, strang_id]
        )
      }

      created.push(ds)
    }

    await client.query('COMMIT')
    res.status(201).json({ ok: true, created })
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: String(err) })
  } finally {
    client.release()
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// STORY-RADAR (Analyse-Endpoint)
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/straenge/radar?produktion_id=X&folge_id=Y
straengeRouter.get('/radar', async (req, res) => {
  const { produktion_id, folge_id } = req.query
  if (!produktion_id) return res.status(400).json({ error: 'produktion_id required' })
  try {
    // Get all active strands
    const strands = await query(
      `SELECT s.* FROM straenge s
       WHERE s.produktion_id = $1 AND s.status != 'beendet'
       ORDER BY s.sort_order`,
      [produktion_id]
    )

    const result: any[] = []
    for (const strand of strands) {
      // Future beats for this strand
      const futureBeats = await query(
        `SELECT sb.*, f.folge_nummer
         FROM strang_beats sb
         LEFT JOIN folgen f ON f.id = sb.folge_id
         WHERE sb.strang_id = $1
         ORDER BY sb.ebene, sb.sort_order`,
        [strand.id]
      )

      // Scenes assigned to this strand (optionally filtered by folge)
      let scenesSql = `
        SELECT ds.id, ds.scene_nummer, ds.ort_name, ds.zusammenfassung,
               f.folge_nummer, f.id AS folge_id
        FROM dokument_szenen_straenge dss
        JOIN dokument_szenen ds ON ds.id = dss.dokument_szene_id
        JOIN werkstufen w ON w.id = ds.werkstufe_id
        JOIN folgen f ON f.id = w.folge_id
        WHERE dss.strang_id = $1 AND ds.geloescht IS NOT TRUE`
      const scenesParams: any[] = [strand.id]
      if (folge_id) {
        scenesSql += ' AND f.id = $2'
        scenesParams.push(folge_id)
      }
      scenesSql += ' ORDER BY f.folge_nummer, ds.sort_order'
      const scenes = await query(scenesSql, scenesParams)

      // Characters
      const chars = await query(
        `SELECT sc.rolle, c.name FROM strang_charaktere sc
         JOIN characters c ON c.id = sc.character_id
         WHERE sc.strang_id = $1 ORDER BY sc.rolle, c.name`,
        [strand.id]
      )

      result.push({
        ...strand,
        beats: futureBeats,
        szenen: scenes,
        charaktere: chars,
        offene_beats: futureBeats.filter((b: any) => !b.ist_abgearbeitet).length,
      })
    }

    res.json(result)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// PACING-ANALYSE
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/straenge/pacing?produktion_id=X
straengeRouter.get('/pacing', async (req, res) => {
  const { produktion_id } = req.query
  if (!produktion_id) return res.status(400).json({ error: 'produktion_id required' })
  try {
    const warnungen: any[] = []

    // Get all active strands with their latest scene's episode
    const strands = await query(
      `SELECT s.id, s.name, s.farbe,
              (SELECT MAX(f.folge_nummer)
               FROM dokument_szenen_straenge dss
               JOIN dokument_szenen ds ON ds.id = dss.dokument_szene_id
               JOIN werkstufen w ON w.id = ds.werkstufe_id
               JOIN folgen f ON f.id = w.folge_id
               WHERE dss.strang_id = s.id AND ds.geloescht IS NOT TRUE
              ) AS letzte_folge_nummer,
              (SELECT MAX(f.folge_nummer) FROM folgen f WHERE f.produktion_id = $1) AS max_folge
       FROM straenge s
       WHERE s.produktion_id = $1 AND s.status = 'aktiv'`,
      [produktion_id]
    )

    for (const s of strands) {
      if (s.max_folge && s.letzte_folge_nummer) {
        const gap = s.max_folge - s.letzte_folge_nummer
        if (gap >= 3) {
          warnungen.push({
            typ: 'strang_luecke',
            strang_id: s.id,
            strang_name: s.name,
            farbe: s.farbe,
            nachricht: `Strang "${s.name}" hat seit ${gap} Episoden keinen Beat`,
            schwere: gap >= 5 ? 'hoch' : 'mittel',
          })
        }
      }
    }

    // Forgotten beats (only future/block level — folge-level are too granular)
    const vergesseneBeats = await query(
      `SELECT sb.id, sb.beat_text, sb.block_label, sb.ebene, s.name AS strang_name, s.farbe
       FROM strang_beats sb
       JOIN straenge s ON s.id = sb.strang_id
       WHERE s.produktion_id = $1 AND sb.ist_abgearbeitet = FALSE AND s.status = 'aktiv'
         AND sb.ebene IN ('future', 'block')
       ORDER BY s.sort_order, sb.sort_order`,
      [produktion_id]
    )
    for (const b of vergesseneBeats) {
      warnungen.push({
        typ: 'beat_offen',
        strang_name: b.strang_name,
        farbe: b.farbe,
        beat_id: b.id,
        nachricht: `Offener ${b.ebene === 'future' ? 'Future' : 'Block'}-Beat: "${(b.beat_text || '').substring(0, 60)}"`,
        schwere: b.ebene === 'future' ? 'mittel' : 'niedrig',
      })
    }

    // Character absence: main characters of active strands not appearing in recent episodes
    const charAbsence = await query(
      `WITH strang_chars AS (
        SELECT sc.character_id, c.name AS char_name, s.id AS strang_id, s.name AS strang_name, s.farbe
        FROM strang_charaktere sc
        JOIN characters c ON c.id = sc.character_id
        JOIN straenge s ON s.id = sc.strang_id
        WHERE s.produktion_id = $1 AND s.status = 'aktiv' AND sc.rolle = 'haupt'
      ),
      recent_folgen AS (
        SELECT id, folge_nummer FROM folgen WHERE produktion_id = $1 ORDER BY folge_nummer DESC LIMIT 5
      ),
      char_appearances AS (
        SELECT DISTINCT sch.character_id, f.folge_nummer
        FROM scene_characters sch
        JOIN dokument_szenen ds ON ds.scene_identity_id = (
          SELECT scene_identity_id FROM dokument_szenen WHERE id = sch.dokument_szene_id LIMIT 1
        )
        JOIN werkstufen w ON w.id = ds.werkstufe_id
        JOIN folgen f ON f.id = w.folge_id
        WHERE f.id IN (SELECT id FROM recent_folgen)
      )
      SELECT sc.character_id, sc.char_name, sc.strang_name, sc.farbe,
             COUNT(ca.folge_nummer) AS appearances
      FROM strang_chars sc
      LEFT JOIN char_appearances ca ON ca.character_id = sc.character_id
      GROUP BY sc.character_id, sc.char_name, sc.strang_name, sc.farbe
      HAVING COUNT(ca.folge_nummer) = 0`,
      [produktion_id]
    )
    for (const c of charAbsence) {
      warnungen.push({
        typ: 'figur_abwesend',
        strang_name: c.strang_name,
        farbe: c.farbe,
        nachricht: `${c.char_name} (${c.strang_name}) taucht in den letzten 5 Folgen nicht auf`,
        schwere: 'mittel',
      })
    }

    // Strand balance: check if one strand dominates an episode (>60% of scenes)
    const balanceCheck = await query(
      `WITH latest_werk AS (
        SELECT w.id AS werk_id, w.folge_id, f.folge_nummer
        FROM werkstufen w
        JOIN folgen f ON f.id = w.folge_id
        WHERE f.produktion_id = $1
        ORDER BY f.folge_nummer DESC LIMIT 1
      ),
      scene_counts AS (
        SELECT COUNT(*) AS total FROM dokument_szenen ds
        JOIN latest_werk lw ON lw.werk_id = ds.werkstufe_id
        WHERE ds.geloescht IS NOT TRUE
      ),
      strang_counts AS (
        SELECT s.name AS strang_name, s.farbe, COUNT(DISTINCT dss.dokument_szene_id) AS cnt
        FROM dokument_szenen_straenge dss
        JOIN dokument_szenen ds ON ds.id = dss.dokument_szene_id
        JOIN latest_werk lw ON lw.werk_id = ds.werkstufe_id
        JOIN straenge s ON s.id = dss.strang_id
        WHERE ds.geloescht IS NOT TRUE AND s.status = 'aktiv'
        GROUP BY s.name, s.farbe
      )
      SELECT sc.strang_name, sc.farbe, sc.cnt, tc.total,
             ROUND(sc.cnt * 100.0 / NULLIF(tc.total, 0)) AS pct
      FROM strang_counts sc, scene_counts tc
      WHERE tc.total > 0 AND sc.cnt * 100.0 / tc.total > 60`,
      [produktion_id]
    )
    for (const b of balanceCheck) {
      warnungen.push({
        typ: 'strang_balance',
        strang_name: b.strang_name,
        farbe: b.farbe,
        nachricht: `"${b.strang_name}" dominiert letzte Folge mit ${b.pct}% der Szenen (${b.cnt}/${b.total})`,
        schwere: 'mittel',
      })
    }

    // Crossing poverty: latest episode has no scene with 2+ strands
    const crossingCheck = await query(
      `WITH latest_werk AS (
        SELECT w.id AS werk_id FROM werkstufen w
        JOIN folgen f ON f.id = w.folge_id
        WHERE f.produktion_id = $1
        ORDER BY f.folge_nummer DESC LIMIT 1
      ),
      multi_strang_scenes AS (
        SELECT dss.dokument_szene_id, COUNT(DISTINCT dss.strang_id) AS strang_count
        FROM dokument_szenen_straenge dss
        JOIN dokument_szenen ds ON ds.id = dss.dokument_szene_id
        JOIN latest_werk lw ON lw.werk_id = ds.werkstufe_id
        WHERE ds.geloescht IS NOT TRUE
        GROUP BY dss.dokument_szene_id
        HAVING COUNT(DISTINCT dss.strang_id) >= 2
      )
      SELECT COUNT(*) AS crossing_count FROM multi_strang_scenes`,
      [produktion_id]
    )
    if (crossingCheck.length > 0 && parseInt(crossingCheck[0].crossing_count) === 0) {
      // Only warn if there are any strand assignments at all
      const anyAssignments = await query(
        `SELECT 1 FROM dokument_szenen_straenge dss
         JOIN dokument_szenen ds ON ds.id = dss.dokument_szene_id
         JOIN werkstufen w ON w.id = ds.werkstufe_id
         JOIN folgen f ON f.id = w.folge_id
         WHERE f.produktion_id = $1 AND ds.geloescht IS NOT TRUE
         LIMIT 1`,
        [produktion_id]
      )
      if (anyAssignments.length > 0) {
        warnungen.push({
          typ: 'kreuzung_fehlt',
          strang_name: 'Alle',
          farbe: '#8E8E93',
          nachricht: 'Letzte Folge hat keine Kreuzungsszene (Szene mit 2+ Str\u00e4ngen)',
          schwere: 'niedrig',
        })
      }
    }

    res.json({ warnungen })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// WERKSTUFE SZENEN MIT STRAENGEN (ergaenzt bestehenden Werkstufen-Szenen-Endpunkt)
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/straenge/werkstufe/:werkId — all strands for all scenes in a werkstufe
straengeRouter.get('/werkstufe/:werkId', async (req, res) => {
  try {
    const rows = await query(
      `SELECT dss.dokument_szene_id, dss.strang_id, dss.sort_order,
              s.name, s.farbe, s.typ, s.label, s.status
       FROM dokument_szenen_straenge dss
       JOIN straenge s ON s.id = dss.strang_id
       JOIN dokument_szenen ds ON ds.id = dss.dokument_szene_id
       WHERE ds.werkstufe_id = $1 AND ds.geloescht IS NOT TRUE
       ORDER BY dss.dokument_szene_id, dss.sort_order`,
      [req.params.werkId]
    )

    // Group by dokument_szene_id
    const grouped: Record<string, any[]> = {}
    for (const row of rows) {
      if (!grouped[row.dokument_szene_id]) grouped[row.dokument_szene_id] = []
      grouped[row.dokument_szene_id].push(row)
    }

    res.json(grouped)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})
