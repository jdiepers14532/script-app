import { Router } from 'express'
import { query, queryOne } from '../db'
import { authMiddleware } from '../auth'

export const charactersRouter = Router()
export const staffelCharactersRouter = Router({ mergeParams: true })
export const sceneCharactersRouter = Router({ mergeParams: true })
export const charKategorienRouter = Router({ mergeParams: true })

charactersRouter.use(authMiddleware)
staffelCharactersRouter.use(authMiddleware)
sceneCharactersRouter.use(authMiddleware)
charKategorienRouter.use(authMiddleware)

// ── Global Characters ─────────────────────────────────────────────────────────

// GET /api/characters?staffel_id=xxx
// Returns characters with their production-specific data for a staffel
charactersRouter.get('/', async (req, res) => {
  const { staffel_id } = req.query
  if (!staffel_id) return res.status(400).json({ error: 'staffel_id required' })
  try {
    const rows = await query(
      `SELECT c.id, c.name, c.meta_json, c.created_at,
              cp.rollen_nummer, cp.komparsen_nummer, cp.kategorie_id, cp.updated_at AS prod_updated_at,
              ck.name AS kategorie_name, ck.typ AS kategorie_typ
       FROM characters c
       JOIN character_productions cp ON cp.character_id = c.id AND cp.staffel_id = $1
       LEFT JOIN character_kategorien ck ON ck.id = cp.kategorie_id
       ORDER BY ck.typ, cp.rollen_nummer NULLS LAST, cp.komparsen_nummer NULLS LAST, c.name`,
      [staffel_id]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/characters — create global character + optional production link
charactersRouter.post('/', async (req, res) => {
  const { name, meta_json, staffel_id, rollen_nummer, komparsen_nummer, kategorie_id } = req.body
  if (!name) return res.status(400).json({ error: 'name required' })
  try {
    const char = await queryOne(
      `INSERT INTO characters (name, meta_json) VALUES ($1, $2) RETURNING *`,
      [name, meta_json ?? {}]
    )
    if (staffel_id) {
      await queryOne(
        `INSERT INTO character_productions (character_id, staffel_id, rollen_nummer, komparsen_nummer, kategorie_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [char.id, staffel_id, rollen_nummer ?? null, komparsen_nummer ?? null, kategorie_id ?? null]
      )
    }
    res.status(201).json(char)
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'Nummer bereits vergeben' })
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/characters/:id
charactersRouter.put('/:id', async (req, res) => {
  const { name, meta_json } = req.body
  try {
    const row = await queryOne(
      `UPDATE characters SET name = COALESCE($1, name), meta_json = COALESCE($2, meta_json)
       WHERE id = $3 RETURNING *`,
      [name ?? null, meta_json ?? null, req.params.id]
    )
    if (!row) return res.status(404).json({ error: 'Charakter nicht gefunden' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/characters/:id (global delete — removes all production links)
charactersRouter.delete('/:id', async (req, res) => {
  try {
    const row = await queryOne('DELETE FROM characters WHERE id = $1 RETURNING id', [req.params.id])
    if (!row) return res.status(404).json({ error: 'Charakter nicht gefunden' })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── Production Links ──────────────────────────────────────────────────────────

// POST /api/characters/:id/productions — link to production
charactersRouter.post('/:id/productions', async (req, res) => {
  const { staffel_id, rollen_nummer, komparsen_nummer, kategorie_id } = req.body
  if (!staffel_id) return res.status(400).json({ error: 'staffel_id required' })
  try {
    const row = await queryOne(
      `INSERT INTO character_productions (character_id, staffel_id, rollen_nummer, komparsen_nummer, kategorie_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (character_id, staffel_id) DO UPDATE SET
         rollen_nummer = EXCLUDED.rollen_nummer,
         komparsen_nummer = EXCLUDED.komparsen_nummer,
         kategorie_id = EXCLUDED.kategorie_id,
         updated_at = NOW()
       RETURNING *`,
      [req.params.id, staffel_id, rollen_nummer ?? null, komparsen_nummer ?? null, kategorie_id ?? null]
    )
    res.json(row)
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'Nummer bereits vergeben' })
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/characters/:id/productions/:staffelId
charactersRouter.put('/:id/productions/:staffelId', async (req, res) => {
  const { rollen_nummer, komparsen_nummer, kategorie_id } = req.body
  try {
    const row = await queryOne(
      `UPDATE character_productions SET
         rollen_nummer = COALESCE($1, rollen_nummer),
         komparsen_nummer = COALESCE($2, komparsen_nummer),
         kategorie_id = COALESCE($3, kategorie_id),
         updated_at = NOW()
       WHERE character_id = $4 AND staffel_id = $5 RETURNING *`,
      [rollen_nummer ?? null, komparsen_nummer ?? null, kategorie_id ?? null, req.params.id, req.params.staffelId]
    )
    if (!row) return res.status(404).json({ error: 'Produktions-Verknüpfung nicht gefunden' })
    res.json(row)
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'Nummer bereits vergeben' })
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/characters/:id/productions/:staffelId
charactersRouter.delete('/:id/productions/:staffelId', async (req, res) => {
  try {
    const row = await queryOne(
      `DELETE FROM character_productions WHERE character_id = $1 AND staffel_id = $2 RETURNING character_id`,
      [req.params.id, req.params.staffelId]
    )
    if (!row) return res.status(404).json({ error: 'Produktions-Verknüpfung nicht gefunden' })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── Kategorien (per Staffel) ──────────────────────────────────────────────────

// GET /api/staffeln/:id/character-kategorien
charKategorienRouter.get('/', async (req, res) => {
  const { staffelId } = req.params as any
  try {
    const rows = await query(
      `SELECT * FROM character_kategorien WHERE staffel_id = $1 ORDER BY sort_order, id`,
      [staffelId]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/staffeln/:id/character-kategorien
charKategorienRouter.post('/', async (req, res) => {
  const { staffelId } = req.params as any
  const { name, typ, sort_order } = req.body
  if (!name || !typ) return res.status(400).json({ error: 'name und typ required' })
  if (!['rolle', 'komparse'].includes(typ)) return res.status(400).json({ error: 'typ muss rolle oder komparse sein' })
  try {
    const maxOrder = await queryOne(
      `SELECT COALESCE(MAX(sort_order), 0) AS m FROM character_kategorien WHERE staffel_id = $1`,
      [staffelId]
    )
    const row = await queryOne(
      `INSERT INTO character_kategorien (staffel_id, name, typ, sort_order)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [staffelId, name, typ, sort_order ?? (maxOrder.m + 1)]
    )
    res.status(201).json(row)
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'Kategoriename bereits vorhanden' })
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/staffeln/:id/character-kategorien/:katId
charKategorienRouter.put('/:katId', async (req, res) => {
  const { staffelId } = req.params as any
  const { name, typ, sort_order } = req.body
  try {
    const row = await queryOne(
      `UPDATE character_kategorien SET
         name = COALESCE($1, name),
         typ = COALESCE($2, typ),
         sort_order = COALESCE($3, sort_order)
       WHERE id = $4 AND staffel_id = $5 RETURNING *`,
      [name ?? null, typ ?? null, sort_order ?? null, req.params.katId, staffelId]
    )
    if (!row) return res.status(404).json({ error: 'Kategorie nicht gefunden' })
    res.json(row)
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'Kategoriename bereits vorhanden' })
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/staffeln/:id/character-kategorien/:katId
charKategorienRouter.delete('/:katId', async (req, res) => {
  const { staffelId } = req.params as any
  try {
    const row = await queryOne(
      `DELETE FROM character_kategorien WHERE id = $1 AND staffel_id = $2 RETURNING id`,
      [req.params.katId, staffelId]
    )
    if (!row) return res.status(404).json({ error: 'Kategorie nicht gefunden' })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── Scene Characters ──────────────────────────────────────────────────────────

// GET /api/szenen/:id/characters
sceneCharactersRouter.get('/', async (req, res) => {
  const { szeneId } = req.params as any
  try {
    const rows = await query(
      `SELECT sc.id, sc.character_id, sc.kategorie_id, sc.anzahl, sc.ist_gruppe,
              c.name, c.meta_json,
              cp.rollen_nummer, cp.komparsen_nummer,
              ck.name AS kategorie_name, ck.typ AS kategorie_typ
       FROM scene_characters sc
       JOIN characters c ON c.id = sc.character_id
       LEFT JOIN character_kategorien ck ON ck.id = sc.kategorie_id
       LEFT JOIN szenen sz ON sz.id = sc.szene_id
       LEFT JOIN stages st ON st.id = sz.stage_id
       LEFT JOIN character_productions cp ON cp.character_id = sc.character_id AND cp.staffel_id = st.staffel_id
       WHERE sc.szene_id = $1
       ORDER BY ck.typ NULLS LAST, c.name`,
      [szeneId]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/szenen/:id/characters
sceneCharactersRouter.post('/', async (req, res) => {
  const { szeneId } = req.params as any
  const { character_id, kategorie_id, anzahl, ist_gruppe } = req.body
  if (!character_id) return res.status(400).json({ error: 'character_id required' })
  try {
    const row = await queryOne(
      `INSERT INTO scene_characters (szene_id, character_id, kategorie_id, anzahl, ist_gruppe)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (szene_id, character_id) DO UPDATE SET
         kategorie_id = EXCLUDED.kategorie_id,
         anzahl = EXCLUDED.anzahl,
         ist_gruppe = EXCLUDED.ist_gruppe
       RETURNING *`,
      [szeneId, character_id, kategorie_id ?? null, anzahl ?? 1, ist_gruppe ?? false]
    )
    res.status(201).json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/szenen/:szeneId/characters/:characterId
sceneCharactersRouter.put('/:characterId', async (req, res) => {
  const { szeneId } = req.params as any
  const { anzahl, ist_gruppe, kategorie_id } = req.body
  try {
    const row = await queryOne(
      `UPDATE scene_characters SET
         anzahl = COALESCE($1, anzahl),
         ist_gruppe = COALESCE($2, ist_gruppe),
         kategorie_id = COALESCE($3, kategorie_id)
       WHERE szene_id = $4 AND character_id = $5 RETURNING *`,
      [anzahl ?? null, ist_gruppe ?? null, kategorie_id ?? null, szeneId, req.params.characterId]
    )
    if (!row) return res.status(404).json({ error: 'Verknüpfung nicht gefunden' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/szenen/:szeneId/characters/:characterId
sceneCharactersRouter.delete('/:characterId', async (req, res) => {
  const { szeneId } = req.params as any
  try {
    const row = await queryOne(
      `DELETE FROM scene_characters WHERE szene_id = $1 AND character_id = $2 RETURNING id`,
      [szeneId, req.params.characterId]
    )
    if (!row) return res.status(404).json({ error: 'Verknüpfung nicht gefunden' })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})
