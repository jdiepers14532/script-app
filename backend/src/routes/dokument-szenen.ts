import { Router } from 'express'
import { pool, query, queryOne } from '../db'
import { authMiddleware } from '../auth'
import { recalcSceneStats, updateReplikCount } from '../utils/recalcRepliken'
import { calcPageLength } from '../utils/calcPageLength'

// ── Einzelne Dokument-Szene Router ───────────────────────────────────────────
// Mounted at /api/dokument-szenen/:id
export const dokumentSzenenRouter = Router()
dokumentSzenenRouter.use(authMiddleware)

// ── Scene Identities Router ──────────────────────────────────────────────────
// Mounted at /api/scene-identities
export const sceneIdentitiesRouter = Router()
sceneIdentitiesRouter.use(authMiddleware)

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/dokument-szenen/resolve?werkstufe_id=X&scene_identity_id=Y
// ══════════════════════════════════════════════════════════════════════════════
dokumentSzenenRouter.get('/resolve', async (req, res) => {
  const { werkstufe_id, scene_identity_id } = req.query
  if (!werkstufe_id || !scene_identity_id) {
    return res.status(400).json({ error: 'werkstufe_id and scene_identity_id required' })
  }
  try {
    const row = await queryOne(
      'SELECT * FROM dokument_szenen WHERE werkstufe_id = $1 AND scene_identity_id = $2',
      [werkstufe_id, scene_identity_id]
    )
    if (!row) return res.status(404).json({ error: 'Szene nicht in dieser Werkstufe gefunden' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/dokument-szenen/:id — single scene
// ══════════════════════════════════════════════════════════════════════════════
dokumentSzenenRouter.get('/:id', async (req, res) => {
  try {
    const row = await queryOne(
      `SELECT ds.*,
        (SELECT ds2.scene_nummer
         FROM dokument_szenen ds2
         JOIN werkstufen w_l ON w_l.id = ds2.werkstufe_id
         WHERE ds2.scene_identity_id = ds.flashback_referenz_id
           AND w_l.folge_id = (SELECT folge_id FROM werkstufen WHERE id = ds.flashback_referenz_werkstufe_id)
           AND ds2.geloescht = false
         ORDER BY w_l.version_nummer DESC LIMIT 1) AS flashback_referenz_scene_nummer,
        (SELECT f.folge_nummer FROM werkstufen w JOIN folgen f ON f.id = w.folge_id
         WHERE w.id = ds.flashback_referenz_werkstufe_id) AS flashback_referenz_folge_nummer,
        (SELECT ds2.ort_name
         FROM dokument_szenen ds2
         JOIN werkstufen w_l ON w_l.id = ds2.werkstufe_id
         WHERE ds2.scene_identity_id = ds.flashback_referenz_id
           AND w_l.folge_id = (SELECT folge_id FROM werkstufen WHERE id = ds.flashback_referenz_werkstufe_id)
           AND ds2.geloescht = false
         ORDER BY w_l.version_nummer DESC LIMIT 1) AS flashback_referenz_ort_name
       FROM dokument_szenen ds WHERE ds.id = $1`,
      [req.params.id]
    )
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
    // Tier 2: Conflict Detection via X-Client-Version (ISO timestamp)
    const clientVersion = req.headers['x-client-version'] as string | undefined
    if (clientVersion) {
      const current = await queryOne(
        'SELECT updated_at FROM dokument_szenen WHERE id = $1',
        [req.params.id]
      )
      if (current?.updated_at) {
        const serverTs = new Date(current.updated_at).getTime()
        const clientTs = new Date(clientVersion).getTime()
        if (!isNaN(serverTs) && !isNaN(clientTs) && serverTs > clientTs) {
          return res.status(409).json({
            error: 'Konflikt: Szene wurde inzwischen von jemand anderem geändert',
            server_version: current.updated_at,
          })
        }
      }
    }

    const {
      int_ext, tageszeit, ort_name, zusammenfassung,
      sort_order, seiten, spieltag, spielzeit, szeneninfo, content,
      stoppzeit_sek, notiz, motiv_id, format,
      sondertyp, stockshot_kategorie, stockshot_neu_drehen,
      flashback_referenz_id, flashback_ganze_szene, flashback_referenz_werkstufe_id,
      flashback_referenz_freitext,
      vorlage_id, clear_content,
      ws_spezifikation, element_type, wysiwyg_merged,
    } = req.body

    // When clear_content is true, wipe the scene body
    const effectiveContent = clear_content ? { type: 'doc', content: [] } : content

    // Load old content for revision diff (before overwriting)
    let oldContent: any[] | null = null
    if (effectiveContent) {
      const old = await queryOne('SELECT content FROM dokument_szenen WHERE id = $1', [req.params.id])
      if (old?.content) {
        try { oldContent = typeof old.content === 'string' ? JSON.parse(old.content) : (Array.isArray(old.content) ? old.content : old.content?.content ?? null) }
        catch { oldContent = null }
      }
    }

    // Calculate page_length if content is provided
    const pageLength = effectiveContent ? calcPageLength(effectiveContent) : null

    const row = await queryOne(
      `UPDATE dokument_szenen SET
        int_ext = COALESCE($1, int_ext),
        tageszeit = COALESCE($2, tageszeit),
        ort_name = COALESCE($3, ort_name),
        zusammenfassung = COALESCE($4, zusammenfassung),
        content = COALESCE($5, content),
        sort_order = COALESCE($6, sort_order),
        seiten = COALESCE($7, seiten),
        spieltag = COALESCE($8, spieltag),
        spielzeit = COALESCE($9, spielzeit),
        szeneninfo = COALESCE($10, szeneninfo),
        stoppzeit_sek = COALESCE($12, stoppzeit_sek),
        notiz = COALESCE($13, notiz),
        motiv_id = COALESCE($14, motiv_id),
        format = COALESCE($16, format),
        page_length = COALESCE($17, page_length),
        sondertyp = CASE WHEN $18::text = '__null__' THEN NULL ELSE COALESCE($18, sondertyp) END,
        stockshot_kategorie = CASE WHEN $19::text = '__null__' THEN NULL ELSE COALESCE($19, stockshot_kategorie) END,
        stockshot_neu_drehen = COALESCE($20, stockshot_neu_drehen),
        flashback_referenz_id = CASE WHEN $21::text = '__null__' THEN NULL ELSE COALESCE($21::uuid, flashback_referenz_id) END,
        flashback_ganze_szene = COALESCE($23, flashback_ganze_szene),
        flashback_referenz_werkstufe_id = CASE WHEN $24::text = '__null__' THEN NULL ELSE COALESCE($24::uuid, flashback_referenz_werkstufe_id) END,
        flashback_referenz_freitext = CASE WHEN $25::text = '__null__' THEN NULL ELSE COALESCE($25, flashback_referenz_freitext) END,
        vorlage_id = CASE WHEN $22::text = '__null__' THEN NULL ELSE COALESCE($22::uuid, vorlage_id) END,
        ws_spezifikation = CASE WHEN $26::text = '__null__' THEN NULL ELSE COALESCE($26, ws_spezifikation) END,
        element_type = CASE WHEN $27::text = '__null__' THEN NULL ELSE COALESCE($27, element_type) END,
        wysiwyg_merged = COALESCE($28, wysiwyg_merged),
        updated_at = NOW(),
        updated_by = $11
       WHERE id = $15 RETURNING *`,
      [
        int_ext, tageszeit, ort_name, zusammenfassung,
        effectiveContent ? JSON.stringify(effectiveContent) : null,
        sort_order,
        seiten ?? null, spieltag ?? null,
        spielzeit ?? null, szeneninfo ?? null,
        req.user?.name ?? null,
        stoppzeit_sek !== undefined ? stoppzeit_sek : null,
        notiz !== undefined ? notiz : null,
        motiv_id !== undefined ? motiv_id : null,
        req.params.id,
        format ?? null,
        pageLength,
        sondertyp !== undefined ? (sondertyp === null ? '__null__' : sondertyp) : null,
        stockshot_kategorie !== undefined ? (stockshot_kategorie === null ? '__null__' : stockshot_kategorie) : null,
        stockshot_neu_drehen ?? null,
        flashback_referenz_id !== undefined ? (flashback_referenz_id === null ? '__null__' : flashback_referenz_id) : null,
        vorlage_id !== undefined ? (vorlage_id === null ? '__null__' : vorlage_id) : null,
        flashback_ganze_szene !== undefined ? flashback_ganze_szene : null,
        flashback_referenz_werkstufe_id !== undefined ? (flashback_referenz_werkstufe_id === null ? '__null__' : flashback_referenz_werkstufe_id) : null,
        flashback_referenz_freitext !== undefined ? (flashback_referenz_freitext === null ? '__null__' : flashback_referenz_freitext) : null,
        ws_spezifikation !== undefined ? (ws_spezifikation === null ? '__null__' : ws_spezifikation) : null,
        element_type !== undefined ? (element_type === null ? '__null__' : element_type) : null,
        wysiwyg_merged !== undefined ? wysiwyg_merged : null,
      ]
    )
    if (!row) return res.status(404).json({ error: 'Szene nicht gefunden' })

    // Recalc repliken stats if content was updated
    if (effectiveContent && row.werkstufe_id && row.scene_identity_id) {
      recalcSceneStats(row.werkstufe_id, row.scene_identity_id, effectiveContent).catch(() => {})
    }
    // Update replik_count for numbering
    if (effectiveContent) {
      updateReplikCount(row.id, { content: effectiveContent }).catch(() => {})
    }

    // Revision delta tracking: wenn Werkstufe eine Revision-Farbe hat, Diffs aufzeichnen
    if (effectiveContent && row.werkstufe_id) {
      recordRevisionDeltas(req.params.id, row.werkstufe_id, oldContent, effectiveContent).catch(() => {})
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
// GET /api/dokument-szenen/:id/snapshots — list last 50 snapshots
// ══════════════════════════════════════════════════════════════════════════════
dokumentSzenenRouter.get('/:id/snapshots', async (req, res) => {
  try {
    const rows = await query(
      `SELECT id, created_by, created_by_name, created_at,
              szene_nummer, szene_info, text_preview, is_current
         FROM dokument_szenen_snapshots
        WHERE szene_id = $1
        ORDER BY created_at DESC
        LIMIT 50`,
      [req.params.id]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/dokument-szenen/:id/snapshots — create snapshot (prune >50)
// ══════════════════════════════════════════════════════════════════════════════
dokumentSzenenRouter.post('/:id/snapshots', async (req, res) => {
  const { content, szene_nummer, szene_info, text_preview } = req.body
  if (!content || typeof content !== 'object') {
    return res.status(400).json({ error: 'content (Tiptap JSON) erforderlich' })
  }
  const userId = req.user?.user_id ?? null
  const userName = req.user?.name ?? null
  try {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      // Neue Auto-Speicherung: is_current zurücksetzen
      await client.query(
        `UPDATE dokument_szenen_snapshots SET is_current = FALSE WHERE szene_id = $1`,
        [req.params.id]
      )
      const snap = await client.query(
        `INSERT INTO dokument_szenen_snapshots
           (szene_id, content, created_by, created_by_name, szene_nummer, szene_info, text_preview)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, created_at, created_by_name, szene_nummer, szene_info`,
        [
          req.params.id, JSON.stringify(content),
          userId, userName,
          szene_nummer ?? null, szene_info ?? null,
          text_preview ? String(text_preview).slice(0, 150) : null,
        ]
      )
      // Prune: keep only 50 newest
      await client.query(
        `DELETE FROM dokument_szenen_snapshots
          WHERE szene_id = $1
            AND id NOT IN (
              SELECT id FROM dokument_szenen_snapshots
               WHERE szene_id = $1
               ORDER BY created_at DESC
               LIMIT 50
            )`,
        [req.params.id]
      )
      await client.query('COMMIT')
      res.status(201).json(snap.rows[0])
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/dokument-szenen/:id/snapshots/:snapId — full content of one snapshot
// ══════════════════════════════════════════════════════════════════════════════
dokumentSzenenRouter.get('/:id/snapshots/:snapId', async (req, res) => {
  try {
    const row = await queryOne(
      `SELECT id, szene_id, content, created_by, created_at
         FROM dokument_szenen_snapshots
        WHERE id = $1 AND szene_id = $2`,
      [req.params.snapId, req.params.id]
    )
    if (!row) return res.status(404).json({ error: 'Snapshot nicht gefunden' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/dokument-szenen/:id/snapshots/:snapId/restore — restore snapshot
// ══════════════════════════════════════════════════════════════════════════════
dokumentSzenenRouter.post('/:id/snapshots/:snapId/restore', async (req, res) => {
  try {
    const snap = await queryOne(
      `SELECT content, created_at, created_by_name FROM dokument_szenen_snapshots WHERE id = $1 AND szene_id = $2`,
      [req.params.snapId, req.params.id]
    )
    if (!snap) return res.status(404).json({ error: 'Snapshot nicht gefunden' })

    // Write content back to the scene; track who restored
    const updated = await queryOne(
      `UPDATE dokument_szenen
          SET content = $1, updated_at = now(), updated_by = $2
        WHERE id = $3
        RETURNING id, content, updated_at, updated_by`,
      [JSON.stringify(snap.content), req.user?.name ?? null, req.params.id]
    )
    // Aktueller-Stand-Marker: diesen Snapshot markieren, alle anderen zurücksetzen
    await pool.query(
      'UPDATE dokument_szenen_snapshots SET is_current = FALSE WHERE szene_id = $1',
      [req.params.id]
    )
    await pool.query(
      'UPDATE dokument_szenen_snapshots SET is_current = TRUE WHERE id = $1',
      [req.params.snapId]
    )
    res.json(updated)
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
// Wechselschnitt-Partner CRUD
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/dokument-szenen/:id/wechselschnitt-partner
dokumentSzenenRouter.get('/:id/wechselschnitt-partner', async (req, res) => {
  try {
    const rows = await query(
      `SELECT wp.*, si.folge_id,
              (SELECT ds2.scene_nummer FROM dokument_szenen ds2
               WHERE ds2.scene_identity_id = wp.partner_identity_id
                 AND ds2.werkstufe_id = (SELECT werkstufe_id FROM dokument_szenen WHERE id = $1)
               LIMIT 1) AS partner_scene_nummer
       FROM wechselschnitt_partner wp
       JOIN scene_identities si ON si.id = wp.partner_identity_id
       WHERE wp.dokument_szene_id = $1
       ORDER BY wp.position`,
      [req.params.id]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/dokument-szenen/:id/wechselschnitt-partner — replace all partners + reciprocal linking
dokumentSzenenRouter.put('/:id/wechselschnitt-partner', async (req, res) => {
  const { partners } = req.body // [{ partner_identity_id, position }]
  if (!Array.isArray(partners)) return res.status(400).json({ error: 'partners array required' })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('DELETE FROM wechselschnitt_partner WHERE dokument_szene_id = $1', [req.params.id])
    for (const p of partners) {
      await client.query(
        'INSERT INTO wechselschnitt_partner (dokument_szene_id, partner_identity_id, position) VALUES ($1, $2, $3)',
        [req.params.id, p.partner_identity_id, p.position ?? 0]
      )
    }
    // Reciprocal: ensure partner scenes have sondertyp=wechselschnitt + point back to current scene
    const currentRes = await client.query(
      'SELECT scene_identity_id, werkstufe_id FROM dokument_szenen WHERE id = $1',
      [req.params.id]
    )
    const { scene_identity_id: currentIdentityId, werkstufe_id: werkstufId } = currentRes.rows[0] ?? {}
    if (currentIdentityId && werkstufId && partners.length > 0) {
      for (const p of partners) {
        const partnerRes = await client.query(
          'SELECT id, sondertyp FROM dokument_szenen WHERE scene_identity_id = $1 AND werkstufe_id = $2 LIMIT 1',
          [p.partner_identity_id, werkstufId]
        )
        if (!partnerRes.rows[0]) continue
        const { id: partnerDsId, sondertyp } = partnerRes.rows[0]
        if (sondertyp !== 'wechselschnitt') {
          await client.query(
            "UPDATE dokument_szenen SET sondertyp = 'wechselschnitt', updated_at = NOW() WHERE id = $1",
            [partnerDsId]
          )
        }
        const existing = await client.query(
          'SELECT 1 FROM wechselschnitt_partner WHERE dokument_szene_id = $1 AND partner_identity_id = $2',
          [partnerDsId, currentIdentityId]
        )
        if (existing.rows.length === 0) {
          const posRes = await client.query(
            'SELECT COALESCE(MAX(position), -1) + 1 AS next FROM wechselschnitt_partner WHERE dokument_szene_id = $1',
            [partnerDsId]
          )
          await client.query(
            'INSERT INTO wechselschnitt_partner (dokument_szene_id, partner_identity_id, position) VALUES ($1, $2, $3)',
            [partnerDsId, currentIdentityId, posRes.rows[0].next ?? 0]
          )
        }
      }
    }
    await client.query('COMMIT')
    const rows = await query('SELECT * FROM wechselschnitt_partner WHERE dokument_szene_id = $1 ORDER BY position', [req.params.id])
    res.json(rows)
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: String(err) })
  } finally {
    client.release()
  }
})

// PUT /api/dokument-szenen/:id/bulk-tageszeit-propagate — update tageszeit for all following scenes in same werkstufe
dokumentSzenenRouter.put('/:id/bulk-tageszeit-propagate', async (req, res) => {
  const { tageszeit, increment_spieltag } = req.body
  if (!tageszeit) return res.status(400).json({ error: 'tageszeit required' })
  try {
    const current = await queryOne(
      'SELECT sort_order, werkstufe_id FROM dokument_szenen WHERE id = $1',
      [req.params.id]
    )
    if (!current) return res.status(404).json({ error: 'Szene nicht gefunden' })
    let sql: string
    if (increment_spieltag) {
      sql = `UPDATE dokument_szenen
             SET tageszeit = $1,
                 spieltag = CASE WHEN spieltag IS NOT NULL THEN spieltag + 1 ELSE NULL END,
                 updated_at = NOW()
             WHERE werkstufe_id = $2 AND sort_order > $3 AND geloescht IS NOT TRUE
             RETURNING id`
    } else {
      sql = `UPDATE dokument_szenen
             SET tageszeit = $1, updated_at = NOW()
             WHERE werkstufe_id = $2 AND sort_order > $3 AND geloescht IS NOT TRUE
             RETURNING id`
    }
    const rows = await query(sql, [tageszeit, current.werkstufe_id, current.sort_order])
    res.json({ updated_count: rows.length })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/dokument-szenen/:id/wechselschnitt-beteiligt — is this scene a partner in another WS?
dokumentSzenenRouter.get('/:id/wechselschnitt-beteiligt', async (req, res) => {
  try {
    const scene = await queryOne('SELECT scene_identity_id, werkstufe_id FROM dokument_szenen WHERE id = $1', [req.params.id])
    if (!scene?.scene_identity_id) return res.json([])
    const rows = await query(
      `SELECT wp.dokument_szene_id, ds.scene_nummer
       FROM wechselschnitt_partner wp
       JOIN dokument_szenen ds ON ds.id = wp.dokument_szene_id
       WHERE wp.partner_identity_id = $1 AND ds.werkstufe_id = $2`,
      [scene.scene_identity_id, scene.werkstufe_id]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/dokument-szenen/:id/revisionen — Revision deltas for a scene
// ══════════════════════════════════════════════════════════════════════════════
dokumentSzenenRouter.get('/:id/revisionen', async (req, res) => {
  try {
    const ds = await queryOne(
      `SELECT ds.id, ds.werkstufe_id, w.revision_color_id, rc.color AS revision_color
       FROM dokument_szenen ds
       LEFT JOIN werkstufen w ON w.id = ds.werkstufe_id
       LEFT JOIN revision_colors rc ON rc.id = w.revision_color_id
       WHERE ds.id = $1`,
      [req.params.id]
    )
    if (!ds) return res.status(404).json({ error: 'Szene nicht gefunden' })

    const rows = await query(
      `SELECT field_type, block_index, block_type, old_value, new_value
       FROM szenen_revisionen WHERE dokument_szene_id = $1`,
      [req.params.id]
    )

    const result = rows.map((r: any) => ({
      ...r,
      revision_color: ds.revision_color ?? null,
    }))
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// Stockshot-Archiv
// ══════════════════════════════════════════════════════════════════════════════

// Mounted at /api/stockshot-archiv
export const stockshotArchivRouter = Router()
stockshotArchivRouter.use(authMiddleware)

// GET /api/stockshot-archiv/:produktionId
stockshotArchivRouter.get('/:produktionId', async (req, res) => {
  try {
    const rows = await query(
      'SELECT * FROM stockshot_archiv WHERE produktion_id = $1 ORDER BY motiv_name, lichtstimmung',
      [req.params.produktionId]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/stockshot-archiv/:produktionId/check?motiv=X&lichtstimmung=Y
stockshotArchivRouter.get('/:produktionId/check', async (req, res) => {
  const { motiv, lichtstimmung } = req.query as Record<string, string>
  if (!motiv || !lichtstimmung) return res.status(400).json({ error: 'motiv + lichtstimmung required' })
  try {
    const row = await queryOne(
      'SELECT id FROM stockshot_archiv WHERE produktion_id = $1 AND motiv_name = $2 AND lichtstimmung = $3',
      [req.params.produktionId, motiv, lichtstimmung]
    )
    res.json({ exists: !!row })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/stockshot-archiv/:produktionId
stockshotArchivRouter.post('/:produktionId', async (req, res) => {
  const { motiv_name, motiv_id, lichtstimmung, quelle_folge_nr, quelle_szene_id } = req.body
  if (!motiv_name || !lichtstimmung) return res.status(400).json({ error: 'motiv_name + lichtstimmung required' })
  try {
    const row = await queryOne(
      `INSERT INTO stockshot_archiv (produktion_id, motiv_name, motiv_id, lichtstimmung, quelle_folge_nr, quelle_szene_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (produktion_id, motiv_name, lichtstimmung) DO UPDATE SET
         motiv_id = COALESCE($3, stockshot_archiv.motiv_id),
         quelle_folge_nr = COALESCE($5, stockshot_archiv.quelle_folge_nr),
         quelle_szene_id = COALESCE($6, stockshot_archiv.quelle_szene_id)
       RETURNING *`,
      [req.params.produktionId, motiv_name, motiv_id ?? null, lichtstimmung, quelle_folge_nr ?? null, quelle_szene_id ?? null]
    )
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/stockshot-archiv/:produktionId/:id
stockshotArchivRouter.delete('/:produktionId/:id', async (req, res) => {
  try {
    const row = await queryOne('SELECT id FROM stockshot_archiv WHERE id = $1 AND produktion_id = $2', [req.params.id, req.params.produktionId])
    if (!row) return res.status(404).json({ error: 'Not found' })
    await query('DELETE FROM stockshot_archiv WHERE id = $1', [req.params.id])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/stockshot-archiv/:produktionId/import-from/:sourceProduktionId
stockshotArchivRouter.post('/:produktionId/import-from/:sourceProduktionId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `INSERT INTO stockshot_archiv (produktion_id, motiv_name, motiv_id, lichtstimmung, quelle_folge_nr, quelle_szene_id)
       SELECT $1, motiv_name, NULL, lichtstimmung, quelle_folge_nr, NULL
       FROM stockshot_archiv WHERE produktion_id = $2
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [req.params.produktionId, req.params.sourceProduktionId]
    )
    res.json({ imported: rows.length })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// Stockshot-Templates
// ══════════════════════════════════════════════════════════════════════════════

export const stockshotTemplatesRouter = Router()
stockshotTemplatesRouter.use(authMiddleware)

// GET /api/stockshot-templates/:produktionId
stockshotTemplatesRouter.get('/:produktionId', async (req, res) => {
  try {
    const rows = await query(
      'SELECT * FROM stockshot_templates WHERE produktion_id = $1 ORDER BY kategorie, sortierung',
      [req.params.produktionId]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/stockshot-templates/:produktionId
stockshotTemplatesRouter.post('/:produktionId', async (req, res) => {
  const { kategorie, name, oneliner_vorlage, sortierung, stoppzeit_sek, innen_aussen, stimmung, bodytext, motiv_id } = req.body
  if (!kategorie || !name) return res.status(400).json({ error: 'kategorie + name required' })
  try {
    const row = await queryOne(
      `INSERT INTO stockshot_templates (produktion_id, kategorie, name, oneliner_vorlage, sortierung, stoppzeit_sek, innen_aussen, stimmung, bodytext, motiv_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [req.params.produktionId, kategorie, name, oneliner_vorlage ?? '', sortierung ?? 0,
       stoppzeit_sek ?? null, innen_aussen ?? null, stimmung ?? null, bodytext ?? null, motiv_id ?? null]
    )
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/stockshot-templates/:produktionId/:id
stockshotTemplatesRouter.put('/:produktionId/:id', async (req, res) => {
  const { name, oneliner_vorlage, sortierung, stoppzeit_sek, innen_aussen, stimmung, bodytext, motiv_id } = req.body
  try {
    const row = await queryOne(
      `UPDATE stockshot_templates SET
        name = COALESCE($1, name),
        oneliner_vorlage = COALESCE($2, oneliner_vorlage),
        sortierung = COALESCE($3, sortierung),
        stoppzeit_sek = $6,
        innen_aussen = $7,
        stimmung = $8,
        bodytext = $9,
        motiv_id = $10
       WHERE id = $4 AND produktion_id = $5 RETURNING *`,
      [name ?? null, oneliner_vorlage ?? null, sortierung ?? null, req.params.id, req.params.produktionId,
       stoppzeit_sek ?? null, innen_aussen ?? null, stimmung ?? null, bodytext ?? null, motiv_id ?? null]
    )
    if (!row) return res.status(404).json({ error: 'Template nicht gefunden' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/stockshot-templates/:produktionId/:id
stockshotTemplatesRouter.delete('/:produktionId/:id', async (req, res) => {
  try {
    const result = await queryOne(
      'DELETE FROM stockshot_templates WHERE id = $1 AND produktion_id = $2 RETURNING id',
      [req.params.id, req.params.produktionId]
    )
    if (!result) return res.status(404).json({ error: 'Template nicht gefunden' })
    res.status(204).send()
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// Stimmungs-Validierung
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/dokument-szenen/stimmung-check/:werkstufId — check mood consistency
dokumentSzenenRouter.get('/stimmung-check/:werkstufId', async (req, res) => {
  try {
    const scenes = await query(
      `SELECT id, scene_nummer, scene_nummer_suffix, ort_name, tageszeit, sondertyp, stockshot_kategorie
       FROM dokument_szenen
       WHERE werkstufe_id = $1 AND geloescht IS NOT TRUE
       ORDER BY sort_order`,
      [req.params.werkstufId]
    )
    const warnings: { scene_id: string; scene_nummer: number; message: string }[] = []
    let currentStimmung: string | null = null
    let stimmungSource: number | null = null

    for (const s of scenes) {
      if (false) {
        // stockshot_stimmung removed — stimmung-check no longer generates warnings
      } else if (currentStimmung && s.sondertyp !== 'stockshot') {
        const sceneTz = (s.tageszeit ?? '').toUpperCase()
        if (sceneTz && sceneTz !== currentStimmung) {
          warnings.push({
            scene_id: s.id,
            scene_nummer: s.scene_nummer,
            message: `Tageszeit "${sceneTz}" widerspricht Stimmungswechsel "${currentStimmung}" (ab Sz. ${stimmungSource})`,
          })
        }
      }
    }
    res.json({ warnings, scene_count: scenes.length })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── Autoren-Stoppzeit: Auto-Berechnung ───────────────────────────────────────

function extractTextFromProseMirror(node: any): string {
  if (!node) return ''
  if (node.type === 'text') return node.text ?? ''
  if (Array.isArray(node.content)) {
    return node.content.map(extractTextFromProseMirror).join(' ')
  }
  return ''
}

async function calcStoppzeit(pageLength: number | null, content: any, einst: any): Promise<number | null> {
  if (!einst) return null
  let menge_ist = 0
  if (einst.methode === 'seiten') {
    if (!pageLength) return null
    menge_ist = pageLength / 8  // page_length is in 1/8 page units
  } else if (einst.methode === 'zeichen') {
    const text = extractTextFromProseMirror(content)
    menge_ist = text.replace(/\s/g, '').length
  } else if (einst.methode === 'woerter') {
    const text = extractTextFromProseMirror(content)
    menge_ist = text.trim().split(/\s+/).filter(Boolean).length
  } else {
    return null
  }
  if (menge_ist <= 0 || !einst.menge) return null
  const ratio = einst.dauer_sekunden / einst.menge
  return Math.round(menge_ist * ratio)
}

// POST /api/dokument-szenen/:id/stoppzeit-auto
// Berechnet stoppzeit_sek aus page_length / Zeichenanzahl und vorstopp_einstellungen
dokumentSzenenRouter.post('/:id/stoppzeit-auto', authMiddleware, async (req, res) => {
  const { id } = req.params
  try {
    const row = await queryOne(
      `SELECT ds.id, ds.page_length, ds.content,
              f.produktion_id
       FROM dokument_szenen ds
       JOIN werkstufen w ON w.id = ds.werkstufe_id
       JOIN folgen f ON f.id = w.folge_id
       WHERE ds.id = $1`,
      [id]
    )
    if (!row) return res.status(404).json({ error: 'Szene nicht gefunden' })

    const einst = await queryOne(
      `SELECT * FROM vorstopp_einstellungen WHERE produktion_id = $1`,
      [row.produktion_id]
    )
    if (!einst) return res.status(400).json({ error: 'Keine Stoppzeit-Einstellungen konfiguriert (DK-Einstellungen → Stoppzeit)' })

    const stoppzeit_sek = await calcStoppzeit(row.page_length, row.content, einst)
    if (stoppzeit_sek === null) return res.status(400).json({ error: 'Keine verwertbaren Daten für Berechnung' })

    const updated = await queryOne(
      `UPDATE dokument_szenen SET stoppzeit_sek = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [stoppzeit_sek, id]
    )
    res.json(updated)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/dokument-szenen/stoppzeit-auto-folge/:werkstufId
// Batch-Berechnung für alle Szenen einer Werkstufe
dokumentSzenenRouter.post('/stoppzeit-auto-folge/:werkstufId', authMiddleware, async (req, res) => {
  const { werkstufId } = req.params
  try {
    const folgeRow = await queryOne(
      `SELECT f.produktion_id FROM werkstufen w JOIN folgen f ON f.id = w.folge_id WHERE w.id = $1`,
      [werkstufId]
    )
    if (!folgeRow) return res.status(404).json({ error: 'Werkstufe nicht gefunden' })

    const einst = await queryOne(
      `SELECT * FROM vorstopp_einstellungen WHERE produktion_id = $1`,
      [folgeRow.produktion_id]
    )
    if (!einst) return res.status(400).json({ error: 'Keine Stoppzeit-Einstellungen konfiguriert' })

    const szenen = await query(
      `SELECT id, page_length, content FROM dokument_szenen WHERE werkstufe_id = $1 AND geloescht IS NOT TRUE`,
      [werkstufId]
    )

    let updated = 0
    for (const s of szenen) {
      const stoppzeit_sek = await calcStoppzeit(s.page_length, s.content, einst)
      if (stoppzeit_sek !== null) {
        await queryOne(
          `UPDATE dokument_szenen SET stoppzeit_sek = $1, updated_at = NOW() WHERE id = $2`,
          [stoppzeit_sek, s.id]
        )
        updated++
      }
    }
    res.json({ updated, total: szenen.length })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── Revision Delta Helper ─────────────────────────────────────────────────────
// Wird nach jedem PUT aufgerufen, wenn die Werkstufe eine Revision-Farbe hat.
// Vergleicht alte vs. neue Blöcke und schreibt Deltas in szenen_revisionen.
// Baseline-Einträge (old_value = new_value) werden überschrieben aber nicht gelöscht —
// wird der Block auf den Originalwert zurückgesetzt, verschwinden die * wieder.
async function recordRevisionDeltas(
  szeneId: string,
  werkstufId: string,
  oldBlocks: any[] | null,
  newBlocks: any[]
): Promise<void> {
  // Nur aufzeichnen wenn Werkstufe eine Revision-Farbe hat
  const ws = await queryOne(
    'SELECT revision_color_id FROM werkstufen WHERE id = $1',
    [werkstufId]
  )
  if (!ws?.revision_color_id) return

  if (!oldBlocks) return // Kein Vergleich möglich

  const maxLen = Math.max(oldBlocks.length, newBlocks.length)
  for (let i = 0; i < maxLen; i++) {
    const oldB = oldBlocks[i] ?? null
    const newB = newBlocks[i] ?? null
    const oldJson = oldB ? JSON.stringify(oldB) : null
    const newJson = newB ? JSON.stringify(newB) : null

    if (oldJson === newJson) {
      // Block unverändert — wenn ein Eintrag existiert und new_value == old_value (Baseline),
      // dann ist der Block auf den Ursprungswert zurückgekehrt → Eintrag löschen (kein * mehr)
      await pool.query(
        `DELETE FROM szenen_revisionen
         WHERE dokument_szene_id = $1 AND block_index = $2
           AND new_value = old_value`,
        [szeneId, i]
      )
    } else {
      // Block hat sich geändert — UPSERT: old_value nur setzen wenn noch kein Eintrag existiert
      await pool.query(
        `INSERT INTO szenen_revisionen (dokument_szene_id, field_type, block_index, block_type, old_value, new_value)
         VALUES ($1, 'content_block', $2, $3, $4, $5)
         ON CONFLICT (dokument_szene_id, block_index) WHERE field_type = 'content_block'
         DO UPDATE SET new_value = EXCLUDED.new_value`,
        [szeneId, i, (newB ?? oldB)?.type ?? 'unknown', oldJson, newJson]
      )
    }
  }
}
