import { Router } from 'express'
import { pool, query, queryOne } from '../db'
import { authMiddleware } from '../auth'

// ── Werkstufen Router ────────────────────────────────────────────────────────
// Mounted at /api/folgen/:folgeId/werkstufen AND /api/werkstufen
export const folgeWerkstufenRouter = Router({ mergeParams: true })
folgeWerkstufenRouter.use(authMiddleware)

export const werkstufenRouter = Router()
werkstufenRouter.use(authMiddleware)

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/folgen/:folgeId/werkstufen — all Werkstufen of a Folge
// ══════════════════════════════════════════════════════════════════════════════
folgeWerkstufenRouter.get('/', async (req, res) => {
  try {
    const folgeId = (req.params as any).folgeId
    const rows = await query(
      `SELECT w.*,
              (SELECT COUNT(*)::int FROM dokument_szenen ds
               WHERE ds.werkstufe_id = w.id AND ds.geloescht = false) AS szenen_count
       FROM werkstufen w
       WHERE w.folge_id = $1
       ORDER BY w.typ, w.version_nummer`,
      [folgeId]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/folgen/:folgeId/werkstufen — create new Werkstufe (copies predecessor)
// ══════════════════════════════════════════════════════════════════════════════
folgeWerkstufenRouter.post('/', async (req, res) => {
  const folgeId = parseInt((req.params as any).folgeId)
  const { typ, label, sichtbarkeit, vorgaenger_id } = req.body
  const user = req.user!

  if (!typ) return res.status(400).json({ error: 'typ required' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Verify folge exists
    const folge = await client.query('SELECT id FROM folgen WHERE id = $1', [folgeId])
    if (folge.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Folge nicht gefunden' })
    }

    // Determine predecessor: explicit or highest version of same typ
    let predecessorId = vorgaenger_id
    if (!predecessorId) {
      const prev = await client.query(
        `SELECT id FROM werkstufen
         WHERE folge_id = $1 AND typ = $2
         ORDER BY version_nummer DESC LIMIT 1`,
        [folgeId, typ]
      )
      if (prev.rows.length > 0) predecessorId = prev.rows[0].id
    }

    // Determine next version_nummer
    const cntRes = await client.query(
      `SELECT COALESCE(MAX(version_nummer), 0) AS m FROM werkstufen WHERE folge_id = $1 AND typ = $2`,
      [folgeId, typ]
    )
    const nextVersion = (cntRes.rows[0]?.m ?? 0) + 1

    // Create Werkstufe
    const wsRes = await client.query(
      `INSERT INTO werkstufen (folge_id, typ, version_nummer, label, sichtbarkeit, erstellt_von)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [folgeId, typ, nextVersion, label ?? null, sichtbarkeit ?? 'team', user.user_id]
    )
    const werkstufe = wsRes.rows[0]

    // Copy dokument_szenen from predecessor (if any)
    let copiedCount = 0
    if (predecessorId) {
      const copyRes = await client.query(
        `INSERT INTO dokument_szenen
           (werkstufe_id, scene_identity_id, sort_order, scene_nummer, scene_nummer_suffix,
            format, ort_name, int_ext, tageszeit, spieltag, zusammenfassung, stimmung, spielzeit,
            szeneninfo, seiten, stoppzeit_sek, dauer_min, dauer_sek, is_wechselschnitt, content, updated_by)
         SELECT $1, scene_identity_id, sort_order, scene_nummer, scene_nummer_suffix,
                format, ort_name, int_ext, tageszeit, spieltag, zusammenfassung, stimmung, spielzeit,
                szeneninfo, seiten, stoppzeit_sek, dauer_min, dauer_sek, is_wechselschnitt, content, $2
         FROM dokument_szenen
         WHERE werkstufe_id = $3 AND geloescht = false`,
        [werkstufe.id, user.name || user.user_id, predecessorId]
      )
      copiedCount = copyRes.rowCount ?? 0

      // Copy scene_characters from predecessor with new werkstufe_id
      await client.query(
        `INSERT INTO scene_characters
           (werkstufe_id, scene_identity_id, character_id, kategorie_id,
            anzahl, spiel_typ, repliken_anzahl, header_o_t)
         SELECT $1, scene_identity_id, character_id, kategorie_id,
                anzahl, spiel_typ, repliken_anzahl, header_o_t
         FROM scene_characters
         WHERE werkstufe_id = $2`,
        [werkstufe.id, predecessorId]
      )
    }

    await client.query('COMMIT')
    res.status(201).json({ ...werkstufe, copied_scenes: copiedCount })
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: String(err) })
  } finally {
    client.release()
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/werkstufen/:id — single Werkstufe
// ══════════════════════════════════════════════════════════════════════════════
werkstufenRouter.get('/:id', async (req, res) => {
  try {
    const row = await queryOne(
      `SELECT w.*,
              (SELECT COUNT(*)::int FROM dokument_szenen ds
               WHERE ds.werkstufe_id = w.id AND ds.geloescht = false) AS szenen_count,
              f.produktion_id, f.folge_nummer, f.folgen_titel
       FROM werkstufen w
       JOIN folgen f ON f.id = w.folge_id
       WHERE w.id = $1`,
      [req.params.id]
    )
    if (!row) return res.status(404).json({ error: 'Werkstufe nicht gefunden' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// PUT /api/werkstufen/:id — update status/sichtbarkeit/label
// ══════════════════════════════════════════════════════════════════════════════
werkstufenRouter.put('/:id', async (req, res) => {
  try {
    const { label, sichtbarkeit, abgegeben, bearbeitung_status } = req.body
    const row = await queryOne(
      `UPDATE werkstufen SET
        label = COALESCE($1, label),
        sichtbarkeit = COALESCE($2, sichtbarkeit),
        abgegeben = COALESCE($3, abgegeben),
        bearbeitung_status = COALESCE($4, bearbeitung_status)
       WHERE id = $5 RETURNING *`,
      [label, sichtbarkeit, abgegeben, bearbeitung_status, req.params.id]
    )
    if (!row) return res.status(404).json({ error: 'Werkstufe nicht gefunden' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// DELETE /api/werkstufen/:id — delete Werkstufe
// ══════════════════════════════════════════════════════════════════════════════
werkstufenRouter.delete('/:id', async (req, res) => {
  try {
    const row = await queryOne('DELETE FROM werkstufen WHERE id = $1 RETURNING id', [req.params.id])
    if (!row) return res.status(404).json({ error: 'Werkstufe nicht gefunden' })
    res.status(204).send()
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// Werkstufen-Szenen Router
// Mounted at /api/werkstufen/:werkId/szenen
// ══════════════════════════════════════════════════════════════════════════════
export const werkstufenSzenenRouter = Router({ mergeParams: true })
werkstufenSzenenRouter.use(authMiddleware)

// GET /api/werkstufen/:werkId/szenen — all scenes of a Werkstufe
werkstufenSzenenRouter.get('/', async (req, res) => {
  try {
    const werkId = (req.params as any).werkId
    const rows = await query(
      `SELECT ds.*, si.folge_id AS identity_folge_id
       FROM dokument_szenen ds
       JOIN scene_identities si ON si.id = ds.scene_identity_id
       WHERE ds.werkstufe_id = $1 AND ds.geloescht = false
       ORDER BY ds.sort_order, ds.scene_nummer`,
      [werkId]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/werkstufen/:werkId/szenen — add new scene
werkstufenSzenenRouter.post('/', async (req, res) => {
  const werkId = (req.params as any).werkId
  const {
    scene_nummer, int_ext, tageszeit, ort_name, zusammenfassung,
    content, stoppzeit_sek, sort_order, after_scene_id, format,
    scene_identity_id,
  } = req.body
  const user = req.user!

  try {
    // Get Werkstufe to determine folge
    const ws = await queryOne(
      `SELECT w.id, w.typ, f.produktion_id, w.folge_id FROM werkstufen w
       JOIN folgen f ON f.id = w.folge_id WHERE w.id = $1`,
      [werkId]
    )
    if (!ws) return res.status(404).json({ error: 'Werkstufe nicht gefunden' })

    // Create or reuse scene_identity
    let identityId = scene_identity_id
    if (!identityId) {
      const identity = await queryOne(
        `INSERT INTO scene_identities (folge_id, created_by) VALUES ($1, $2) RETURNING id`,
        [ws.folge_id, user.user_id]
      )
      identityId = identity.id
    }

    // Determine sort_order and scene_nummer
    let finalSortOrder = sort_order ?? 0
    let finalSceneNummer = scene_nummer

    if (after_scene_id) {
      const refScene = await queryOne(
        'SELECT sort_order, scene_nummer FROM dokument_szenen WHERE id = $1',
        [after_scene_id]
      )
      if (refScene) {
        finalSortOrder = refScene.sort_order + 0.5
        finalSceneNummer = finalSceneNummer || (refScene.scene_nummer + 1)
      }
    } else if (!finalSceneNummer) {
      const maxRow = await queryOne(
        'SELECT MAX(scene_nummer) AS mx FROM dokument_szenen WHERE werkstufe_id = $1 AND geloescht = false',
        [werkId]
      )
      finalSceneNummer = (maxRow?.mx ?? 0) + 1
      const maxSort = await queryOne(
        'SELECT MAX(sort_order) AS ms FROM dokument_szenen WHERE werkstufe_id = $1 AND geloescht = false',
        [werkId]
      )
      finalSortOrder = (maxSort?.ms ?? 0) + 1
    }

    const row = await queryOne(
      `INSERT INTO dokument_szenen
         (werkstufe_id, scene_identity_id, sort_order, scene_nummer,
          format, int_ext, tageszeit, ort_name, zusammenfassung, content,
          stoppzeit_sek, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [
        werkId, identityId, finalSortOrder, finalSceneNummer,
        format || ws.typ || 'drehbuch',
        int_ext || 'INT', tageszeit || 'TAG', ort_name || null,
        zusammenfassung || null, JSON.stringify(content || []),
        stoppzeit_sek || null, user.name || user.user_id,
      ]
    )

    // Reindex sort_orders if inserted after
    if (after_scene_id) {
      await pool.query(`
        WITH ranked AS (
          SELECT id, ROW_NUMBER() OVER (ORDER BY sort_order, scene_nummer) AS rn
          FROM dokument_szenen WHERE werkstufe_id = $1 AND geloescht = false
        )
        UPDATE dokument_szenen SET sort_order = ranked.rn
        FROM ranked WHERE dokument_szenen.id = ranked.id
      `, [werkId])
    }

    res.status(201).json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PATCH /api/werkstufen/:werkId/szenen/reorder — reorder scenes
werkstufenSzenenRouter.patch('/reorder', async (req, res) => {
  const { order } = req.body
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be array of scene ids' })

  const werkId = (req.params as any).werkId
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (let i = 0; i < order.length; i++) {
      await client.query(
        'UPDATE dokument_szenen SET sort_order = $1, updated_at = NOW() WHERE id = $2 AND werkstufe_id = $3',
        [i + 1, order[i], werkId]
      )
    }
    await client.query('COMMIT')
    const { rows } = await client.query(
      'SELECT * FROM dokument_szenen WHERE werkstufe_id = $1 AND geloescht = false ORDER BY sort_order, scene_nummer',
      [werkId]
    )
    res.json(rows)
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: String(err) })
  } finally {
    client.release()
  }
})

// POST /api/werkstufen/:werkId/szenen/renumber — sequential renumbering
werkstufenSzenenRouter.post('/renumber', async (req, res) => {
  const werkId = (req.params as any).werkId
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: scenes } = await client.query(
      'SELECT * FROM dokument_szenen WHERE werkstufe_id = $1 AND geloescht = false ORDER BY sort_order, scene_nummer',
      [werkId]
    )
    for (let i = 0; i < scenes.length; i++) {
      await client.query(
        'UPDATE dokument_szenen SET scene_nummer = $1, scene_nummer_suffix = NULL, sort_order = $2, updated_at = NOW() WHERE id = $3',
        [i + 1, i + 1, scenes[i].id]
      )
    }
    await client.query('COMMIT')
    const { rows } = await client.query(
      'SELECT * FROM dokument_szenen WHERE werkstufe_id = $1 AND geloescht = false ORDER BY sort_order, scene_nummer',
      [werkId]
    )
    res.json({ scenes: rows, renumbered: true })
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: String(err) })
  } finally {
    client.release()
  }
})

// GET /api/werkstufen/:a/szenen/diff/:b — diff between two Werkstufen
werkstufenSzenenRouter.get('/diff/:rightId', async (req, res) => {
  const leftId = (req.params as any).werkId
  const rightId = req.params.rightId
  try {
    const [leftWs, rightWs] = await Promise.all([
      queryOne('SELECT * FROM werkstufen WHERE id = $1', [leftId]),
      queryOne('SELECT * FROM werkstufen WHERE id = $1', [rightId]),
    ])
    if (!leftWs) return res.status(404).json({ error: 'Linke Werkstufe nicht gefunden' })
    if (!rightWs) return res.status(404).json({ error: 'Rechte Werkstufe nicht gefunden' })

    const [leftScenes, rightScenes] = await Promise.all([
      query('SELECT * FROM dokument_szenen WHERE werkstufe_id = $1 AND geloescht = false ORDER BY sort_order, scene_nummer', [leftId]),
      query('SELECT * FROM dokument_szenen WHERE werkstufe_id = $1 AND geloescht = false ORDER BY sort_order, scene_nummer', [rightId]),
    ])

    // Match by scene_identity_id
    const leftMap = new Map(leftScenes.map((s: any, i: number) => [s.scene_identity_id, { scene: s, idx: i }]))
    const rightMap = new Map(rightScenes.map((s: any, i: number) => [s.scene_identity_id, { scene: s, idx: i }]))

    const allIdentities = new Set<string>()
    for (const s of leftScenes) allIdentities.add(s.scene_identity_id)
    for (const s of rightScenes) allIdentities.add(s.scene_identity_id)

    const matches: any[] = []
    for (const id of allIdentities) {
      const left = leftMap.get(id)
      const right = rightMap.get(id)

      const changes: string[] = []
      if (!left) {
        changes.push('neu')
      } else if (!right) {
        changes.push('gestrichen')
      } else {
        const fields = ['ort_name', 'int_ext', 'tageszeit', 'zusammenfassung', 'spieltag', 'stimmung', 'spielzeit', 'szeneninfo', 'stoppzeit_sek']
        for (const f of fields) {
          if (String(left.scene[f] ?? '') !== String(right.scene[f] ?? '')) changes.push(f)
        }
        const lc = JSON.stringify(left.scene.content || [])
        const rc = JSON.stringify(right.scene.content || [])
        if (lc !== rc) changes.push('content')
      }

      matches.push({
        scene_identity_id: id,
        left_idx: left?.idx ?? null,
        right_idx: right?.idx ?? null,
        changes,
      })
    }

    res.json({
      left: { werkstufe: leftWs, szenen: leftScenes },
      right: { werkstufe: rightWs, szenen: rightScenes },
      matches,
    })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})
