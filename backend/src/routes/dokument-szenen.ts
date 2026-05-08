import { Router } from 'express'
import { pool, query, queryOne } from '../db'
import { authMiddleware } from '../auth'
import { recalcSceneStats } from '../utils/recalcRepliken'

// ── Fassungs-Szenen Router ───────────────────────────────────────────────────
// Mounted at /api/fassungen/:fassungId/szenen
export const fassungsSzenenRouter = Router({ mergeParams: true })
fassungsSzenenRouter.use(authMiddleware)

// ── Einzelne Dokument-Szene Router ───────────────────────────────────────────
// Mounted at /api/dokument-szenen/:id
export const dokumentSzenenRouter = Router()
dokumentSzenenRouter.use(authMiddleware)

// ── Scene Identities Router ──────────────────────────────────────────────────
// Mounted at /api/scene-identities
export const sceneIdentitiesRouter = Router()
sceneIdentitiesRouter.use(authMiddleware)

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/fassungen/:fassungId/szenen — all scenes of a fassung
// ══════════════════════════════════════════════════════════════════════════════
fassungsSzenenRouter.get('/', async (req, res) => {
  try {
    const rows = await query(
      `SELECT ds.*, si.produktion_id AS identity_produktion_id
       FROM dokument_szenen ds
       JOIN scene_identities si ON si.id = ds.scene_identity_id
       WHERE ds.fassung_id = $1
       ORDER BY ds.sort_order, ds.scene_nummer`,
      [(req.params as any).fassungId]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/fassungen/:fassungId/szenen — add a new scene
// ══════════════════════════════════════════════════════════════════════════════
fassungsSzenenRouter.post('/', async (req, res) => {
  const fassungId = (req.params as any).fassungId
  const {
    scene_nummer, int_ext, tageszeit, ort_name, zusammenfassung,
    content, dauer_min, dauer_sek, sort_order, after_scene_id,
    scene_identity_id, // optional: reuse existing identity
  } = req.body
  const user = req.user!

  try {
    // Get fassung to determine produktion_id
    const fassung = await queryOne(
      `SELECT f.id, d.produktion_id FROM folgen_dokument_fassungen f
       JOIN folgen_dokumente d ON d.id = f.dokument_id
       WHERE f.id = $1`,
      [fassungId]
    )
    if (!fassung) return res.status(404).json({ error: 'Fassung nicht gefunden' })

    // Create or reuse scene_identity
    let identityId = scene_identity_id
    if (!identityId) {
      const identity = await queryOne(
        `INSERT INTO scene_identities (folge_id, created_by) VALUES ($1, $2) RETURNING id`,
        [fassung.folge_id, user.user_id]
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
        'SELECT MAX(scene_nummer) AS mx FROM dokument_szenen WHERE fassung_id = $1',
        [fassungId]
      )
      finalSceneNummer = (maxRow?.mx ?? 0) + 1
      const maxSort = await queryOne(
        'SELECT MAX(sort_order) AS ms FROM dokument_szenen WHERE fassung_id = $1',
        [fassungId]
      )
      finalSortOrder = (maxSort?.ms ?? 0) + 1
    }

    const row = await queryOne(
      `INSERT INTO dokument_szenen
         (fassung_id, scene_identity_id, sort_order, scene_nummer,
          int_ext, tageszeit, ort_name, zusammenfassung, content,
          dauer_min, dauer_sek, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [
        fassungId, identityId, finalSortOrder, finalSceneNummer,
        int_ext || 'INT', tageszeit || 'TAG', ort_name || null,
        zusammenfassung || null, JSON.stringify(content || []),
        dauer_min || null, dauer_sek || null, user.name || user.user_id,
      ]
    )

    // Reindex sort_orders after fractional insertion
    if (after_scene_id) {
      await pool.query(`
        WITH ranked AS (
          SELECT id, ROW_NUMBER() OVER (ORDER BY sort_order, scene_nummer) AS rn
          FROM dokument_szenen WHERE fassung_id = $1
        )
        UPDATE dokument_szenen SET sort_order = ranked.rn
        FROM ranked WHERE dokument_szenen.id = ranked.id
      `, [fassungId])
    }

    res.status(201).json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// PATCH /api/fassungen/:fassungId/szenen/reorder — reorder scenes
// ══════════════════════════════════════════════════════════════════════════════
fassungsSzenenRouter.patch('/reorder', async (req, res) => {
  const { order } = req.body // UUID[] — dokument_szenen ids in new order
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be array of scene ids' })

  const fassungId = (req.params as any).fassungId
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (let i = 0; i < order.length; i++) {
      await client.query(
        'UPDATE dokument_szenen SET sort_order = $1, updated_at = NOW() WHERE id = $2 AND fassung_id = $3',
        [i + 1, order[i], fassungId]
      )
    }
    await client.query('COMMIT')

    const { rows } = await client.query(
      'SELECT * FROM dokument_szenen WHERE fassung_id = $1 ORDER BY sort_order, scene_nummer',
      [fassungId]
    )
    res.json(rows)
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: String(err) })
  } finally {
    client.release()
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/fassungen/:fassungId/szenen/renumber — sequential renumbering
// ══════════════════════════════════════════════════════════════════════════════
fassungsSzenenRouter.post('/renumber', async (req, res) => {
  const fassungId = (req.params as any).fassungId
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: scenes } = await client.query(
      'SELECT * FROM dokument_szenen WHERE fassung_id = $1 ORDER BY sort_order, scene_nummer',
      [fassungId]
    )
    for (let i = 0; i < scenes.length; i++) {
      await client.query(
        'UPDATE dokument_szenen SET scene_nummer = $1, scene_nummer_suffix = NULL, sort_order = $2, updated_at = NOW() WHERE id = $3',
        [i + 1, i + 1, scenes[i].id]
      )
    }
    await client.query('COMMIT')
    const { rows } = await client.query(
      'SELECT * FROM dokument_szenen WHERE fassung_id = $1 ORDER BY sort_order, scene_nummer',
      [fassungId]
    )
    res.json({ scenes: rows, renumbered: true })
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: String(err) })
  } finally {
    client.release()
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/dokument-szenen/:id — single scene
// ══════════════════════════════════════════════════════════════════════════════
dokumentSzenenRouter.get('/:id', async (req, res) => {
  try {
    const row = await queryOne('SELECT * FROM dokument_szenen WHERE id = $1', [req.params.id])
    if (!row) return res.status(404).json({ error: 'Szene nicht gefunden' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// PUT /api/dokument-szenen/:id — update scene header
// ══════════════════════════════════════════════════════════════════════════════
dokumentSzenenRouter.put('/:id', async (req, res) => {
  try {
    const {
      int_ext, tageszeit, ort_name, zusammenfassung, dauer_min, dauer_sek,
      sort_order, seiten, spieltag, spielzeit, szeneninfo, content,
      is_wechselschnitt, stoppzeit_sek, notiz, motiv_id,
    } = req.body

    const row = await queryOne(
      `UPDATE dokument_szenen SET
        int_ext = COALESCE($1, int_ext),
        tageszeit = COALESCE($2, tageszeit),
        ort_name = COALESCE($3, ort_name),
        zusammenfassung = COALESCE($4, zusammenfassung),
        content = COALESCE($5, content),
        dauer_min = COALESCE($6, dauer_min),
        dauer_sek = COALESCE($7, dauer_sek),
        sort_order = COALESCE($8, sort_order),
        seiten = COALESCE($9, seiten),
        spieltag = COALESCE($10, spieltag),
        spielzeit = COALESCE($11, spielzeit),
        szeneninfo = COALESCE($12, szeneninfo),
        is_wechselschnitt = COALESCE($13, is_wechselschnitt),
        stoppzeit_sek = COALESCE($15, stoppzeit_sek),
        notiz = COALESCE($16, notiz),
        motiv_id = COALESCE($17, motiv_id),
        updated_at = NOW(),
        updated_by = $14
       WHERE id = $18 RETURNING *`,
      [
        int_ext, tageszeit, ort_name, zusammenfassung,
        content ? JSON.stringify(content) : null,
        dauer_min, dauer_sek, sort_order,
        seiten ?? null, spieltag ?? null,
        spielzeit ?? null, szeneninfo ?? null, is_wechselschnitt ?? null,
        req.user?.name ?? null,
        stoppzeit_sek !== undefined ? stoppzeit_sek : null,
        notiz !== undefined ? notiz : null,
        motiv_id !== undefined ? motiv_id : null,
        req.params.id,
      ]
    )
    if (!row) return res.status(404).json({ error: 'Szene nicht gefunden' })

    // Recalc repliken stats if content was updated
    if (content && row.werkstufe_id && row.scene_identity_id) {
      recalcSceneStats(row.werkstufe_id, row.scene_identity_id, content).catch(() => {})
    }

    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// DELETE /api/dokument-szenen/:id — delete scene from fassung
// ══════════════════════════════════════════════════════════════════════════════
dokumentSzenenRouter.delete('/:id', async (req, res) => {
  try {
    const result = await queryOne('DELETE FROM dokument_szenen WHERE id = $1 RETURNING id', [req.params.id])
    if (!result) return res.status(404).json({ error: 'Szene nicht gefunden' })
    res.status(204).send()
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/fassungen/:id1/diff/:id2 — compare two fassungen side-by-side
// ══════════════════════════════════════════════════════════════════════════════
fassungsSzenenRouter.get('/diff/:rightId', async (req, res) => {
  const leftId = (req.params as any).fassungId
  const rightId = req.params.rightId
  try {
    const [leftFassung, rightFassung] = await Promise.all([
      queryOne('SELECT f.*, d.typ FROM folgen_dokument_fassungen f JOIN folgen_dokumente d ON d.id = f.dokument_id WHERE f.id = $1', [leftId]),
      queryOne('SELECT f.*, d.typ FROM folgen_dokument_fassungen f JOIN folgen_dokumente d ON d.id = f.dokument_id WHERE f.id = $1', [rightId]),
    ])
    if (!leftFassung) return res.status(404).json({ error: 'Linke Fassung nicht gefunden' })
    if (!rightFassung) return res.status(404).json({ error: 'Rechte Fassung nicht gefunden' })

    const [leftScenes, rightScenes] = await Promise.all([
      query('SELECT * FROM dokument_szenen WHERE fassung_id = $1 ORDER BY sort_order, scene_nummer', [leftId]),
      query('SELECT * FROM dokument_szenen WHERE fassung_id = $1 ORDER BY sort_order, scene_nummer', [rightId]),
    ])

    // Match scenes by scene_identity_id
    const leftMap = new Map(leftScenes.map((s: any, i: number) => [s.scene_identity_id, { scene: s, idx: i }]))
    const rightMap = new Map(rightScenes.map((s: any, i: number) => [s.scene_identity_id, { scene: s, idx: i }]))

    // Collect all unique identity IDs in order
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
        // Compare header fields
        const fields = ['ort_name', 'int_ext', 'tageszeit', 'zusammenfassung', 'spieltag', 'spielzeit', 'szeneninfo', 'dauer_min']
        for (const f of fields) {
          if (String(left.scene[f] ?? '') !== String(right.scene[f] ?? '')) changes.push(f)
        }
        // Compare content
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
      left: { fassung: leftFassung, szenen: leftScenes },
      right: { fassung: rightFassung, szenen: rightScenes },
      matches,
    })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/dokument-szenen/:id/revisionen — revision deltas for a dokument_szene
// ══════════════════════════════════════════════════════════════════════════════
dokumentSzenenRouter.get('/:id/revisionen', async (req, res) => {
  try {
    const rows = await query(
      `SELECT sr.*
       FROM szenen_revisionen sr
       WHERE sr.dokument_szene_id = $1
       ORDER BY sr.created_at`,
      [req.params.id]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/dokument-szenen/:id/revisionen — record a delta
dokumentSzenenRouter.post('/:id/revisionen', async (req, res) => {
  const { field_type, field_name, block_index, block_type, speaker, old_value, new_value } = req.body
  if (!field_type) return res.status(400).json({ error: 'field_type required' })
  if (!['header', 'content_block'].includes(field_type)) {
    return res.status(400).json({ error: 'field_type muss header oder content_block sein' })
  }
  try {
    const row = await queryOne(
      `INSERT INTO szenen_revisionen
         (dokument_szene_id, field_type, field_name, block_index, block_type, speaker, old_value, new_value)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [req.params.id, field_type, field_name ?? null,
       block_index ?? null, block_type ?? null, speaker ?? null, old_value ?? null, new_value ?? null]
    )
    res.status(201).json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/scene-identities/:id/characters — characters linked to a scene identity
// ══════════════════════════════════════════════════════════════════════════════
sceneIdentitiesRouter.get('/:id/characters', async (req, res) => {
  try {
    const rows = await query(
      `SELECT sc.id, sc.character_id, sc.kategorie_id, sc.anzahl, sc.ist_gruppe,
              sc.spiel_typ, sc.repliken_anzahl, sc.header_o_t,
              c.name, c.meta_json,
              cp.rollen_nummer, cp.komparsen_nummer,
              COALESCE(ck.name, ck2.name) AS kategorie_name,
              COALESCE(ck.typ, ck2.typ) AS kategorie_typ
       FROM scene_characters sc
       JOIN characters c ON c.id = sc.character_id
       LEFT JOIN character_kategorien ck ON ck.id = sc.kategorie_id
       LEFT JOIN scene_identities si ON si.id = sc.scene_identity_id
       LEFT JOIN folgen fl ON fl.id = si.folge_id
       LEFT JOIN character_productions cp ON cp.character_id = sc.character_id AND cp.produktion_id = fl.produktion_id
       LEFT JOIN character_kategorien ck2 ON ck2.id = cp.kategorie_id
       WHERE sc.scene_identity_id = $1
       ORDER BY COALESCE(ck.typ, ck2.typ) NULLS LAST, c.name`,
      [req.params.id]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/scene-identities/:id/characters — add character to scene identity
sceneIdentitiesRouter.post('/:id/characters', async (req, res) => {
  const { character_id, kategorie_id, anzahl, ist_gruppe } = req.body
  if (!character_id) return res.status(400).json({ error: 'character_id required' })
  try {
    const row = await queryOne(
      `INSERT INTO scene_characters (scene_identity_id, character_id, kategorie_id, anzahl, ist_gruppe)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (scene_identity_id, character_id) WHERE scene_identity_id IS NOT NULL
       DO UPDATE SET kategorie_id = EXCLUDED.kategorie_id, anzahl = EXCLUDED.anzahl, ist_gruppe = EXCLUDED.ist_gruppe
       RETURNING *`,
      [req.params.id, character_id, kategorie_id ?? null, anzahl ?? 1, ist_gruppe ?? false]
    )
    res.status(201).json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/scene-identities/:id/characters/:characterId
sceneIdentitiesRouter.delete('/:id/characters/:characterId', async (req, res) => {
  try {
    const row = await queryOne(
      'DELETE FROM scene_characters WHERE scene_identity_id = $1 AND character_id = $2 RETURNING id',
      [req.params.id, req.params.characterId]
    )
    if (!row) return res.status(404).json({ error: 'Verknüpfung nicht gefunden' })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/scene-identities/:id/vorstopp — vorstopp entries for a scene identity
// ══════════════════════════════════════════════════════════════════════════════
sceneIdentitiesRouter.get('/:id/vorstopp', async (req, res) => {
  try {
    const all = await query(
      'SELECT * FROM szenen_vorstopp WHERE scene_identity_id = $1 ORDER BY stage, created_at DESC',
      [req.params.id]
    )
    const latest: Record<string, any> = {}
    for (const row of all) {
      if (!latest[row.stage]) latest[row.stage] = row
    }
    res.json({ all, latest_per_stage: latest })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/scene-identities/:id/vorstopp — add vorstopp entry
sceneIdentitiesRouter.post('/:id/vorstopp', async (req, res) => {
  const VALID_STAGES = ['drehbuch', 'vorbereitung', 'dreh', 'schnitt']
  const { stage, dauer_sekunden, methode, user_name } = req.body
  const user = req.user!
  if (!stage || !VALID_STAGES.includes(stage)) {
    return res.status(400).json({ error: `stage muss einer von ${VALID_STAGES.join(', ')} sein` })
  }
  if (typeof dauer_sekunden !== 'number' || dauer_sekunden < 0) {
    return res.status(400).json({ error: 'dauer_sekunden muss eine nicht-negative Zahl sein' })
  }
  try {
    const row = await queryOne(
      `INSERT INTO szenen_vorstopp (scene_identity_id, stage, user_id, user_name, dauer_sekunden, methode)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.params.id, stage, user?.user_id ?? 'unknown', user_name ?? user?.name ?? null,
       dauer_sekunden, methode ?? 'manuell']
    )
    res.status(201).json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/scene-identities — create new identity
// ══════════════════════════════════════════════════════════════════════════════
sceneIdentitiesRouter.post('/', async (req, res) => {
  const { folge_id } = req.body
  if (!folge_id) return res.status(400).json({ error: 'folge_id required' })
  try {
    const row = await queryOne(
      `INSERT INTO scene_identities (folge_id, created_by) VALUES ($1, $2) RETURNING *`,
      [folge_id, req.user?.user_id]
    )
    res.status(201).json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/scene-identities/:id/history — all fassungen/dokumente for a scene
// ══════════════════════════════════════════════════════════════════════════════
sceneIdentitiesRouter.get('/:id/history', async (req, res) => {
  try {
    const rows = await query(
      `SELECT ds.*, f.fassung_nummer, f.fassung_label, f.dokument_id,
              d.typ AS dokument_typ
       FROM dokument_szenen ds
       JOIN folgen_dokument_fassungen f ON f.id = ds.fassung_id
       JOIN folgen_dokumente d ON d.id = f.dokument_id
       WHERE ds.scene_identity_id = $1
       ORDER BY f.fassung_nummer`,
      [req.params.id]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})
