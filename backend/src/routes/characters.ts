import { Router } from 'express'
import { query, queryOne } from '../db'
import { authMiddleware, requireScopeAccess } from '../auth'

export const charactersRouter = Router()
export const staffelCharactersRouter = Router({ mergeParams: true })
// sceneCharactersRouter removed — used szene_id (dropped in v51); new model uses scene_identity_id via dokument-szenen routes
export const charKategorienRouter = Router({ mergeParams: true })

charactersRouter.use(authMiddleware)
staffelCharactersRouter.use(authMiddleware)
charKategorienRouter.use(authMiddleware)

// ── Global Characters ─────────────────────────────────────────────────────────

// GET /api/characters?produktion_id=xxx[&include_pending=true]
// Returns characters with their production-specific data.
// Default: only is_active=TRUE (for editor autocomplete).
// include_pending=true: includes pending/inactive characters (for DK-Dashboard).
charactersRouter.get('/', async (req, res) => {
  const { produktion_id, include_pending } = req.query
  if (!produktion_id) return res.status(400).json({ error: 'produktion_id required' })
  const activeOnly = include_pending !== 'true'
  try {
    const rows = await query(
      `SELECT c.id, c.name, c.meta_json, c.created_at,
              cp.rollen_nummer, cp.komparsen_nummer, cp.kategorie_id, cp.darsteller_name,
              cp.updated_at AS prod_updated_at, cp.is_active, cp.freigabe_status,
              ck.name AS kategorie_name, ck.typ AS kategorie_typ,
              (SELECT dateiname FROM charakter_fotos WHERE character_id = c.id AND ist_primaer = TRUE LIMIT 1) AS primaer_foto_dateiname,
              (SELECT media_typ FROM charakter_fotos WHERE character_id = c.id AND ist_primaer = TRUE LIMIT 1) AS primaer_media_typ,
              (SELECT thumbnail_dateiname FROM charakter_fotos WHERE character_id = c.id AND ist_primaer = TRUE LIMIT 1) AS primaer_thumbnail_dateiname
       FROM characters c
       JOIN character_productions cp ON cp.character_id = c.id AND cp.produktion_id = $1
         ${activeOnly ? 'AND cp.is_active = TRUE' : ''}
       LEFT JOIN character_kategorien ck ON ck.id = cp.kategorie_id
       ORDER BY CASE WHEN ck.typ = 'komparse' THEN 2 ELSE 1 END, cp.rollen_nummer NULLS LAST, cp.komparsen_nummer NULLS LAST, c.name`,
      [produktion_id]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/characters — create global character + optional production link
charactersRouter.post('/', async (req, res) => {
  const { name, meta_json, produktion_id, rollen_nummer, komparsen_nummer, kategorie_id, is_komparse } = req.body
  if (!name) return res.status(400).json({ error: 'name required' })
  try {
    const char = await queryOne(
      `INSERT INTO characters (name, meta_json) VALUES ($1, $2) RETURNING *`,
      [name, meta_json ?? {}]
    )
    if (produktion_id) {
      // Kategorie automatisch vergeben wenn keine explizite übergeben wurde
      let resolvedKatId = kategorie_id ?? null
      if (!resolvedKatId) {
        const typ = is_komparse ? 'komparse' : 'rolle'
        const katRow = await queryOne(
          `SELECT id FROM character_kategorien WHERE produktion_id = $1 AND typ = $2 ORDER BY sort_order, id LIMIT 1`,
          [produktion_id, typ]
        )
        resolvedKatId = katRow?.id ?? null
      }
      await queryOne(
        `INSERT INTO character_productions (character_id, produktion_id, rollen_nummer, komparsen_nummer, kategorie_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [char.id, produktion_id, rollen_nummer ?? null, komparsen_nummer ?? null, resolvedKatId]
      )
    }
    res.status(201).json(char)
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'Nummer bereits vergeben' })
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/characters/search?q=... (global, staffel-übergreifend)
// Must be before /:id to avoid route conflict
charactersRouter.get('/search', async (req, res) => {
  const q = String(req.query.q ?? '').trim()
  if (q.length < 2) return res.json([])
  try {
    const rows = await query(
      `SELECT c.id, c.name,
              (SELECT STRING_AGG(DISTINCT s.name, ', ')
               FROM character_productions cp
               JOIN produktionen s ON s.id = cp.produktion_id
               WHERE cp.character_id = c.id) AS produktionen
       FROM characters c
       WHERE c.name ILIKE $1
       ORDER BY c.name
       LIMIT 20`,
      [`%${q}%`]
    )
    res.json(rows)
  } catch (err) { res.status(500).json({ error: String(err) }) }
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
  const { produktion_id, rollen_nummer, komparsen_nummer, kategorie_id } = req.body
  if (!produktion_id) return res.status(400).json({ error: 'produktion_id required' })
  try {
    const row = await queryOne(
      // Trigger v204 vergibt bei NULL automatisch die nächste freie Nummer.
      // Im UPDATE-Zweig darf die Auto-Vergabe eine bestehende Nummer NICHT
      // überschreiben: nur übernehmen, wenn der Client explizit eine Nummer
      // mitgab ($3/$4 roher Input, vor Trigger).
      `INSERT INTO character_productions (character_id, produktion_id, rollen_nummer, komparsen_nummer, kategorie_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (character_id, produktion_id) DO UPDATE SET
         rollen_nummer = CASE WHEN $3::int IS NULL THEN character_productions.rollen_nummer ELSE EXCLUDED.rollen_nummer END,
         komparsen_nummer = CASE WHEN $4::int IS NULL THEN character_productions.komparsen_nummer ELSE EXCLUDED.komparsen_nummer END,
         kategorie_id = EXCLUDED.kategorie_id,
         updated_at = NOW()
       RETURNING *`,
      [req.params.id, produktion_id, rollen_nummer ?? null, komparsen_nummer ?? null, kategorie_id ?? null]
    )
    res.json(row)
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'Nummer bereits vergeben' })
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/characters/:id/productions/:produktionId
charactersRouter.put('/:id/productions/:produktionId', async (req, res) => {
  const { rollen_nummer, komparsen_nummer, kategorie_id, darsteller_name } = req.body
  try {
    const row = await queryOne(
      `UPDATE character_productions SET
         rollen_nummer = COALESCE($1, rollen_nummer),
         komparsen_nummer = COALESCE($2, komparsen_nummer),
         kategorie_id = COALESCE($3, kategorie_id),
         darsteller_name = COALESCE($4, darsteller_name),
         updated_at = NOW()
       WHERE character_id = $5 AND produktion_id = $6 RETURNING *`,
      [rollen_nummer ?? null, komparsen_nummer ?? null, kategorie_id ?? null, darsteller_name ?? null, req.params.id, req.params.produktionId]
    )
    if (!row) return res.status(404).json({ error: 'Produktions-Verknüpfung nicht gefunden' })
    res.json(row)
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'Nummer bereits vergeben' })
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/characters/:id/productions/:produktionId
charactersRouter.delete('/:id/productions/:produktionId', async (req, res) => {
  try {
    const row = await queryOne(
      `DELETE FROM character_productions WHERE character_id = $1 AND produktion_id = $2 RETURNING character_id`,
      [req.params.id, req.params.produktionId]
    )
    if (!row) return res.status(404).json({ error: 'Produktions-Verknüpfung nicht gefunden' })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── Kategorien (per Produktion) ──────────────────────────────────────────────────

// GET /api/produktionen/:id/character-kategorien
charKategorienRouter.get('/', async (req, res) => {
  const { produktionId } = req.params as any
  try {
    const rows = await query(
      `SELECT * FROM character_kategorien WHERE produktion_id = $1 ORDER BY sort_order, id`,
      [produktionId]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/produktionen/:id/character-kategorien
charKategorienRouter.post('/', async (req, res) => {
  const { produktionId } = req.params as any
  const { name, typ, sort_order } = req.body
  if (!name || !typ) return res.status(400).json({ error: 'name und typ required' })
  if (!['rolle', 'komparse'].includes(typ)) return res.status(400).json({ error: 'typ muss rolle oder komparse sein' })
  try {
    const maxOrder = await queryOne(
      `SELECT COALESCE(MAX(sort_order), 0) AS m FROM character_kategorien WHERE produktion_id = $1`,
      [produktionId]
    )
    const row = await queryOne(
      `INSERT INTO character_kategorien (produktion_id, name, typ, sort_order)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [produktionId, name, typ, sort_order ?? (maxOrder.m + 1)]
    )
    res.status(201).json(row)
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'Kategoriename bereits vorhanden' })
    res.status(500).json({ error: String(err) })
  }
})

// PATCH /api/produktionen/:id/character-kategorien/reorder
charKategorienRouter.patch('/reorder', async (req, res) => {
  const { produktionId } = req.params as any
  const { order } = req.body
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order array required' })
  try {
    for (const { id, sort_order } of order) {
      await queryOne(
        `UPDATE character_kategorien SET sort_order = $1 WHERE id = $2 AND produktion_id = $3`,
        [sort_order, id, produktionId]
      )
    }
    const rows = await query(
      `SELECT * FROM character_kategorien WHERE produktion_id = $1 ORDER BY sort_order, id`,
      [produktionId]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/produktionen/:id/character-kategorien/:katId
charKategorienRouter.put('/:katId', async (req, res) => {
  const { produktionId } = req.params as any
  const { name, typ, sort_order } = req.body
  try {
    const row = await queryOne(
      `UPDATE character_kategorien SET
         name = COALESCE($1, name),
         typ = COALESCE($2, typ),
         sort_order = COALESCE($3, sort_order)
       WHERE id = $4 AND produktion_id = $5 RETURNING *`,
      [name ?? null, typ ?? null, sort_order ?? null, req.params.katId, produktionId]
    )
    if (!row) return res.status(404).json({ error: 'Kategorie nicht gefunden' })
    res.json(row)
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'Kategoriename bereits vorhanden' })
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/produktionen/:id/character-kategorien/:katId
charKategorienRouter.delete('/:katId', async (req, res) => {
  const { produktionId } = req.params as any
  try {
    const row = await queryOne(
      `DELETE FROM character_kategorien WHERE id = $1 AND produktion_id = $2 RETURNING id`,
      [req.params.katId, produktionId]
    )
    if (!row) return res.status(404).json({ error: 'Kategorie nicht gefunden' })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/characters/:id/aktivieren — set is_active = true in a production
// Requires anlage_rollen scope (or Tier-1 role)
charactersRouter.post('/:id/aktivieren',
  requireScopeAccess('anlage_rollen', req => req.body.produktion_id),
  async (req, res) => {
  const { produktion_id } = req.body
  if (!produktion_id) return res.status(400).json({ error: 'produktion_id required' })
  try {
    const row = await queryOne(
      `UPDATE character_productions SET is_active = TRUE
       WHERE character_id = $1 AND produktion_id = $2 RETURNING *`,
      [req.params.id, produktion_id]
    )
    if (!row) return res.status(404).json({ error: 'Verknüpfung nicht gefunden' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/characters/:id/beziehungen
charactersRouter.get('/:id/beziehungen', async (req, res) => {
  try {
    const rows = await query(
      `SELECT cb.id, cb.beziehungstyp, cb.label,
              c.id AS related_id, c.name AS related_name
       FROM charakter_beziehungen cb
       JOIN characters c ON c.id = cb.related_character_id
       WHERE cb.character_id = $1
       ORDER BY cb.beziehungstyp, c.name`,
      [req.params.id]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// Auto-Gegenstück-Mapping
const GEGENSTUECK: Record<string, string> = {
  eltern_von:    'kind_von',
  kind_von:      'eltern_von',
  geschwister:   'geschwister',
  partner:       'partner',
  ex_partner:    'ex_partner',
  freund:        'freund',
  feind:         'feind',
  kollege:       'kollege',
  vorgesetzter:  'mitarbeiter',
  mitarbeiter:   'vorgesetzter',
}

// POST /api/characters/:id/beziehungen
charactersRouter.post('/:id/beziehungen', async (req, res) => {
  const { related_character_id, beziehungstyp, label, status, seit_block, bis_block, notiz } = req.body
  if (!related_character_id || !beziehungstyp) return res.status(400).json({ error: 'related_character_id und beziehungstyp required' })
  try {
    const row = await queryOne(
      `INSERT INTO charakter_beziehungen
         (character_id, related_character_id, beziehungstyp, label, status, seit_block, bis_block, notiz)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.params.id, related_character_id, beziehungstyp, label ?? null,
       status ?? 'aktiv', seit_block ?? null, bis_block ?? null, notiz ?? null]
    )

    // Auto-Gegenstück anlegen (best-effort, Duplikat = kein Fehler)
    const gegTyp = GEGENSTUECK[beziehungstyp]
    if (gegTyp) {
      try {
        await queryOne(
          `INSERT INTO charakter_beziehungen
             (character_id, related_character_id, beziehungstyp, label, status, seit_block, bis_block, notiz)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (character_id, related_character_id, beziehungstyp) DO NOTHING`,
          [related_character_id, req.params.id, gegTyp, label ?? null,
           status ?? 'aktiv', seit_block ?? null, bis_block ?? null, notiz ?? null]
        )
      } catch { /* non-critical */ }
    }

    res.status(201).json({ ...row, gegenstueck_angelegt: !!gegTyp })
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'Beziehung bereits vorhanden' })
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/characters/:id/beziehungen/:relId
charactersRouter.put('/:id/beziehungen/:relId', async (req, res) => {
  const { status, seit_block, bis_block, notiz, label } = req.body
  try {
    const existing = await queryOne(
      'SELECT * FROM charakter_beziehungen WHERE id = $1 AND character_id = $2',
      [req.params.relId, req.params.id]
    )
    if (!existing) return res.status(404).json({ error: 'Beziehung nicht gefunden' })

    const row = await queryOne(
      `UPDATE charakter_beziehungen
       SET status = COALESCE($1, status),
           seit_block = $2,
           bis_block  = $3,
           notiz      = $4,
           label      = COALESCE($5, label)
       WHERE id = $6 RETURNING *`,
      [status ?? null, seit_block ?? null, bis_block ?? null, notiz ?? null, label ?? null, req.params.relId]
    )

    // Gegenstück synchronisieren (status + zeitfelder, best-effort)
    const gegTyp = GEGENSTUECK[existing.beziehungstyp]
    if (gegTyp) {
      try {
        await queryOne(
          `UPDATE charakter_beziehungen
           SET status = COALESCE($1, status), seit_block = $2, bis_block = $3, notiz = $4
           WHERE character_id = $5 AND related_character_id = $6 AND beziehungstyp = $7`,
          [status ?? null, seit_block ?? null, bis_block ?? null, notiz ?? null,
           existing.related_character_id, req.params.id, gegTyp]
        )
      } catch { /* non-critical */ }
    }

    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/characters/:id/beziehungen/:relId
charactersRouter.delete('/:id/beziehungen/:relId', async (req, res) => {
  try {
    const existing = await queryOne(
      'SELECT * FROM charakter_beziehungen WHERE id = $1 AND character_id = $2',
      [req.params.relId, req.params.id]
    )
    if (!existing) return res.status(404).json({ error: 'Beziehung nicht gefunden' })

    await queryOne('DELETE FROM charakter_beziehungen WHERE id = $1', [req.params.relId])

    // Gegenstück mitlöschen (best-effort)
    const gegTyp = GEGENSTUECK[existing.beziehungstyp]
    if (gegTyp) {
      try {
        await queryOne(
          `DELETE FROM charakter_beziehungen
           WHERE character_id = $1 AND related_character_id = $2 AND beziehungstyp = $3`,
          [existing.related_character_id, req.params.id, gegTyp]
        )
      } catch { /* non-critical */ }
    }

    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

