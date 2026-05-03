import { Router } from 'express'
import { query, queryOne } from '../db'
import { authMiddleware } from '../auth'

export const statistikRouter = Router()
statistikRouter.use(authMiddleware)

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/statistik/character-scenes
// List scenes per character in a werkstufe (or across werkstufen of a folge)
// Query: werkstufe_id OR folge_id, optional character_id, optional motiv (ort_name)
// ══════════════════════════════════════════════════════════════════════════════
statistikRouter.get('/character-scenes', async (req, res) => {
  try {
    const { werkstufe_id, folge_id, character_id, motiv } = req.query

    if (!werkstufe_id && !folge_id) {
      return res.status(400).json({ error: 'werkstufe_id oder folge_id erforderlich' })
    }

    let wsFilter = ''
    const params: any[] = []
    let pIdx = 1

    if (werkstufe_id) {
      wsFilter = `sc.werkstufe_id = $${pIdx}`
      params.push(werkstufe_id)
      pIdx++
    } else {
      wsFilter = `sc.werkstufe_id IN (SELECT id FROM werkstufen WHERE folge_id = $${pIdx})`
      params.push(folge_id)
      pIdx++
    }

    let charFilter = ''
    if (character_id) {
      charFilter = `AND sc.character_id = $${pIdx}`
      params.push(character_id)
      pIdx++
    }

    let motivFilter = ''
    if (motiv) {
      motivFilter = `AND UPPER(ds.ort_name) = UPPER($${pIdx})`
      params.push(motiv)
      pIdx++
    }

    const rows = await query(
      `SELECT sc.id, sc.character_id, c.name AS character_name,
              sc.scene_identity_id, sc.werkstufe_id,
              ds.scene_nummer, ds.ort_name, ds.int_ext, ds.tageszeit,
              sc.spiel_typ, sc.repliken_anzahl, sc.anzahl, sc.header_o_t,
              w.typ AS werkstufe_typ, w.version_nummer
       FROM scene_characters sc
       JOIN characters c ON c.id = sc.character_id
       JOIN dokument_szenen ds ON ds.scene_identity_id = sc.scene_identity_id
                               AND ds.werkstufe_id = sc.werkstufe_id
                               AND ds.geloescht = false
       JOIN werkstufen w ON w.id = sc.werkstufe_id
       WHERE ${wsFilter} ${charFilter} ${motivFilter}
       ORDER BY c.name, ds.scene_nummer`,
      params
    )

    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/statistik/character-repliken
// Repliken count per character in a werkstufe
// Query: werkstufe_id (required)
// ══════════════════════════════════════════════════════════════════════════════
statistikRouter.get('/character-repliken', async (req, res) => {
  try {
    const { werkstufe_id } = req.query
    if (!werkstufe_id) return res.status(400).json({ error: 'werkstufe_id erforderlich' })

    const rows = await query(
      `SELECT sc.character_id, c.name AS character_name,
              SUM(sc.repliken_anzahl) AS total_repliken,
              COUNT(*) AS scene_count,
              COUNT(*) FILTER (WHERE sc.spiel_typ = 'text') AS scenes_with_text,
              COUNT(*) FILTER (WHERE sc.spiel_typ = 'spiel') AS scenes_with_spiel,
              COUNT(*) FILTER (WHERE sc.spiel_typ = 'o.t.') AS scenes_ot
       FROM scene_characters sc
       JOIN characters c ON c.id = sc.character_id
       WHERE sc.werkstufe_id = $1
       GROUP BY sc.character_id, c.name
       ORDER BY total_repliken DESC, c.name`,
      [werkstufe_id]
    )

    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/statistik/character-pairs
// Characters that appear together in scenes
// Query: werkstufe_id (required), character_id (optional — filter to pairs with this character)
// ══════════════════════════════════════════════════════════════════════════════
statistikRouter.get('/character-pairs', async (req, res) => {
  try {
    const { werkstufe_id, character_id, motiv } = req.query
    if (!werkstufe_id) return res.status(400).json({ error: 'werkstufe_id erforderlich' })

    const params: any[] = [werkstufe_id]
    let charFilter = ''
    let motivJoin = ''
    let motivFilter = ''

    if (character_id) {
      charFilter = `AND (a.character_id = $2 OR b.character_id = $2)`
      params.push(character_id)
    }

    if (motiv) {
      const pIdx = params.length + 1
      motivJoin = `JOIN dokument_szenen ds ON ds.scene_identity_id = a.scene_identity_id
                                           AND ds.werkstufe_id = a.werkstufe_id
                                           AND ds.geloescht = false`
      motivFilter = `AND UPPER(ds.ort_name) = UPPER($${pIdx})`
      params.push(motiv)
    }

    const rows = await query(
      `SELECT ca.name AS character_a, cb.name AS character_b,
              COUNT(DISTINCT a.scene_identity_id) AS shared_scenes
       FROM scene_characters a
       JOIN scene_characters b ON a.scene_identity_id = b.scene_identity_id
                               AND a.werkstufe_id = b.werkstufe_id
                               AND a.character_id < b.character_id
       JOIN characters ca ON ca.id = a.character_id
       JOIN characters cb ON cb.id = b.character_id
       ${motivJoin}
       WHERE a.werkstufe_id = $1 ${charFilter} ${motivFilter}
       GROUP BY ca.name, cb.name
       ORDER BY shared_scenes DESC, ca.name, cb.name`,
      params
    )

    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/statistik/besetzungsmatrix
// Character × Episode grid: which characters appear in which episodes
// Query: staffel_id (required), werkstufe_typ (optional, default 'drehbuch')
// ══════════════════════════════════════════════════════════════════════════════
statistikRouter.get('/besetzungsmatrix', async (req, res) => {
  try {
    const { staffel_id, werkstufe_typ } = req.query
    if (!staffel_id) return res.status(400).json({ error: 'staffel_id erforderlich' })

    const typ = werkstufe_typ || 'drehbuch'

    // Get all characters with their scene appearances across episodes
    const rows = await query(
      `SELECT c.id AS character_id, c.name AS character_name,
              cp.kategorie_id,
              f.id AS folge_id, f.folge_nummer,
              w.id AS werkstufe_id, w.typ AS werkstufe_typ,
              COUNT(sc.id) AS scene_count,
              SUM(sc.repliken_anzahl) AS total_repliken,
              STRING_AGG(DISTINCT sc.spiel_typ, ',' ORDER BY sc.spiel_typ) AS spiel_typen
       FROM characters c
       JOIN character_productions cp ON cp.character_id = c.id AND cp.staffel_id = $1
       JOIN scene_characters sc ON sc.character_id = c.id AND sc.werkstufe_id IS NOT NULL
       JOIN werkstufen w ON w.id = sc.werkstufe_id AND w.typ = $2
       JOIN folgen f ON f.id = w.folge_id AND f.staffel_id = $1
       GROUP BY c.id, c.name, cp.kategorie_id, f.id, f.folge_nummer, w.id, w.typ
       ORDER BY c.name, f.folge_nummer`,
      [staffel_id, typ]
    )

    // Get episodes for columns
    const folgen = await query(
      `SELECT DISTINCT f.id, f.folge_nummer, f.folgen_titel
       FROM folgen f
       JOIN werkstufen w ON w.folge_id = f.id AND w.typ = $2
       WHERE f.staffel_id = $1
       ORDER BY f.folge_nummer`,
      [staffel_id, typ]
    )

    // Get character categories
    const kategorien = await query(
      `SELECT id, name FROM character_kategorien WHERE staffel_id = $1 ORDER BY sort_order, name`,
      [staffel_id]
    )

    res.json({ cells: rows, folgen, kategorien })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/statistik/version-compare
// Compare repliken/spiel_typ between two Werkstufen
// Query: left_id, right_id (both required)
// ══════════════════════════════════════════════════════════════════════════════
statistikRouter.get('/version-compare', async (req, res) => {
  try {
    const { left_id, right_id } = req.query
    if (!left_id || !right_id) {
      return res.status(400).json({ error: 'left_id und right_id erforderlich' })
    }

    // Get stats for both werkstufen
    const [leftStats, rightStats] = await Promise.all([
      query(
        `SELECT sc.character_id, c.name AS character_name,
                sc.scene_identity_id, sc.spiel_typ, sc.repliken_anzahl
         FROM scene_characters sc
         JOIN characters c ON c.id = sc.character_id
         WHERE sc.werkstufe_id = $1`,
        [left_id]
      ),
      query(
        `SELECT sc.character_id, c.name AS character_name,
                sc.scene_identity_id, sc.spiel_typ, sc.repliken_anzahl
         FROM scene_characters sc
         JOIN characters c ON c.id = sc.character_id
         WHERE sc.werkstufe_id = $1`,
        [right_id]
      ),
    ])

    // Aggregate per character
    const aggregate = (rows: any[]) => {
      const map = new Map<string, { name: string; scenes: number; repliken: number; text: number; spiel: number; ot: number }>()
      for (const r of rows) {
        const key = r.character_id
        if (!map.has(key)) {
          map.set(key, { name: r.character_name, scenes: 0, repliken: 0, text: 0, spiel: 0, ot: 0 })
        }
        const m = map.get(key)!
        m.scenes++
        m.repliken += r.repliken_anzahl
        if (r.spiel_typ === 'text') m.text++
        else if (r.spiel_typ === 'spiel') m.spiel++
        else m.ot++
      }
      return map
    }

    const leftAgg = aggregate(leftStats)
    const rightAgg = aggregate(rightStats)

    // Merge
    const allChars = new Set([...leftAgg.keys(), ...rightAgg.keys()])
    const comparison: any[] = []

    for (const charId of allChars) {
      const left = leftAgg.get(charId)
      const right = rightAgg.get(charId)
      comparison.push({
        character_id: charId,
        character_name: left?.name || right?.name,
        left: left || { scenes: 0, repliken: 0, text: 0, spiel: 0, ot: 0 },
        right: right || { scenes: 0, repliken: 0, text: 0, spiel: 0, ot: 0 },
        diff_scenes: (right?.scenes || 0) - (left?.scenes || 0),
        diff_repliken: (right?.repliken || 0) - (left?.repliken || 0),
      })
    }

    comparison.sort((a, b) => Math.abs(b.diff_repliken) - Math.abs(a.diff_repliken))

    // Get werkstufe metadata
    const [leftWs, rightWs] = await Promise.all([
      queryOne('SELECT w.*, f.folge_nummer FROM werkstufen w JOIN folgen f ON f.id = w.folge_id WHERE w.id = $1', [left_id]),
      queryOne('SELECT w.*, f.folge_nummer FROM werkstufen w JOIN folgen f ON f.id = w.folge_id WHERE w.id = $1', [right_id]),
    ])

    res.json({ left_werkstufe: leftWs, right_werkstufe: rightWs, comparison })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/statistik/motiv-auslastung
// How often each motiv (location) is used across scenes
// Query: werkstufe_id OR staffel_id (required)
// ══════════════════════════════════════════════════════════════════════════════
statistikRouter.get('/motiv-auslastung', async (req, res) => {
  try {
    const { werkstufe_id, staffel_id, werkstufe_typ } = req.query

    if (!werkstufe_id && !staffel_id) {
      return res.status(400).json({ error: 'werkstufe_id oder staffel_id erforderlich' })
    }

    let whereClause: string
    const params: any[] = []

    if (werkstufe_id) {
      whereClause = 'ds.werkstufe_id = $1'
      params.push(werkstufe_id)
    } else {
      const typ = werkstufe_typ || 'drehbuch'
      whereClause = `ds.werkstufe_id IN (
        SELECT w.id FROM werkstufen w
        JOIN folgen f ON f.id = w.folge_id
        WHERE f.staffel_id = $1 AND w.typ = $2
      )`
      params.push(staffel_id, typ)
    }

    const rows = await query(
      `SELECT ds.ort_name, ds.int_ext,
              COUNT(*) AS scene_count,
              SUM(ds.stoppzeit_sek) AS total_stoppzeit_sek,
              COUNT(DISTINCT sc.character_id) AS unique_characters,
              ARRAY_AGG(DISTINCT f.folge_nummer ORDER BY f.folge_nummer) AS folgen_nummern
       FROM dokument_szenen ds
       JOIN werkstufen w ON w.id = ds.werkstufe_id
       JOIN folgen f ON f.id = w.folge_id
       LEFT JOIN scene_characters sc ON sc.scene_identity_id = ds.scene_identity_id
                                     AND sc.werkstufe_id = ds.werkstufe_id
       WHERE ${whereClause} AND ds.geloescht = false AND ds.ort_name IS NOT NULL
       GROUP BY ds.ort_name, ds.int_ext
       ORDER BY scene_count DESC`,
      params
    )

    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/statistik/komparsen-bedarf
// Komparsen usage per scene/episode with headcount
// Query: werkstufe_id OR staffel_id (required)
// ══════════════════════════════════════════════════════════════════════════════
statistikRouter.get('/komparsen-bedarf', async (req, res) => {
  try {
    const { werkstufe_id, staffel_id, werkstufe_typ } = req.query

    if (!werkstufe_id && !staffel_id) {
      return res.status(400).json({ error: 'werkstufe_id oder staffel_id erforderlich' })
    }

    let whereClause: string
    const params: any[] = []

    if (werkstufe_id) {
      whereClause = 'sc.werkstufe_id = $1'
      params.push(werkstufe_id)
    } else {
      const typ = werkstufe_typ || 'drehbuch'
      whereClause = `sc.werkstufe_id IN (
        SELECT w.id FROM werkstufen w
        JOIN folgen f ON f.id = w.folge_id
        WHERE f.staffel_id = $1 AND w.typ = $2
      )`
      params.push(staffel_id, typ)
    }

    // Get komparsen category id
    const komparseKat = await queryOne(
      `SELECT id FROM character_kategorien WHERE LOWER(name) = 'komparse' LIMIT 1`
    )

    if (!komparseKat) return res.json([])

    const pIdx = params.length + 1
    const rows = await query(
      `SELECT c.name AS komparse_name,
              sc.anzahl,
              sc.spiel_typ, sc.header_o_t, sc.repliken_anzahl,
              ds.scene_nummer, ds.ort_name,
              f.folge_nummer,
              w.typ AS werkstufe_typ, w.version_nummer
       FROM scene_characters sc
       JOIN characters c ON c.id = sc.character_id
       JOIN dokument_szenen ds ON ds.scene_identity_id = sc.scene_identity_id
                               AND ds.werkstufe_id = sc.werkstufe_id
                               AND ds.geloescht = false
       JOIN werkstufen w ON w.id = sc.werkstufe_id
       JOIN folgen f ON f.id = w.folge_id
       WHERE ${whereClause} AND sc.kategorie_id = $${pIdx}
       ORDER BY f.folge_nummer, ds.scene_nummer, c.name`,
      [...params, komparseKat.id]
    )

    // Also compute summary: total headcount per episode
    const summary = await query(
      `SELECT f.folge_nummer,
              COUNT(DISTINCT sc.character_id) AS unique_komparsen,
              SUM(sc.anzahl) AS total_headcount,
              COUNT(DISTINCT sc.scene_identity_id) AS scenes_with_komparsen
       FROM scene_characters sc
       JOIN werkstufen w ON w.id = sc.werkstufe_id
       JOIN folgen f ON f.id = w.folge_id
       WHERE ${whereClause} AND sc.kategorie_id = $${pIdx}
       GROUP BY f.folge_nummer
       ORDER BY f.folge_nummer`,
      [...params, komparseKat.id]
    )

    res.json({ details: rows, summary })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/statistik/overview
// Quick overview stats for a werkstufe
// Query: werkstufe_id (required)
// ══════════════════════════════════════════════════════════════════════════════
statistikRouter.get('/overview', async (req, res) => {
  try {
    const { werkstufe_id } = req.query
    if (!werkstufe_id) return res.status(400).json({ error: 'werkstufe_id erforderlich' })

    const [scenes, chars, repliken, stoppzeit] = await Promise.all([
      queryOne(
        `SELECT COUNT(*) AS total,
                COUNT(*) FILTER (WHERE is_wechselschnitt = true) AS wechselschnitt
         FROM dokument_szenen WHERE werkstufe_id = $1 AND geloescht = false`,
        [werkstufe_id]
      ),
      queryOne(
        `SELECT COUNT(DISTINCT sc.character_id) AS total_characters,
                COUNT(DISTINCT sc.character_id) FILTER (WHERE sc.spiel_typ = 'text') AS with_text,
                COUNT(DISTINCT sc.character_id) FILTER (WHERE sc.spiel_typ = 'spiel') AS with_spiel,
                COUNT(DISTINCT sc.character_id) FILTER (WHERE sc.spiel_typ = 'o.t.') AS ot_only
         FROM scene_characters sc WHERE sc.werkstufe_id = $1`,
        [werkstufe_id]
      ),
      queryOne(
        `SELECT SUM(sc.repliken_anzahl) AS total FROM scene_characters sc WHERE sc.werkstufe_id = $1`,
        [werkstufe_id]
      ),
      queryOne(
        `SELECT SUM(stoppzeit_sek) AS total_sek
         FROM dokument_szenen WHERE werkstufe_id = $1 AND geloescht = false`,
        [werkstufe_id]
      ),
    ])

    res.json({
      scenes: { total: parseInt(scenes?.total ?? 0), wechselschnitt: parseInt(scenes?.wechselschnitt ?? 0) },
      characters: {
        total: parseInt(chars?.total_characters ?? 0),
        with_text: parseInt(chars?.with_text ?? 0),
        with_spiel: parseInt(chars?.with_spiel ?? 0),
        ot_only: parseInt(chars?.ot_only ?? 0),
      },
      repliken: parseInt(repliken?.total ?? 0),
      stoppzeit_sek: parseInt(stoppzeit?.total_sek ?? 0),
    })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// Vorlagen CRUD — saved statistic templates per staffel
// ══════════════════════════════════════════════════════════════════════════════

statistikRouter.get('/vorlagen', async (req, res) => {
  try {
    const { staffel_id } = req.query
    if (!staffel_id) return res.status(400).json({ error: 'staffel_id erforderlich' })

    const rows = await query(
      `SELECT * FROM statistik_vorlagen WHERE staffel_id = $1 ORDER BY sortierung, erstellt_am`,
      [staffel_id]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

statistikRouter.post('/vorlagen', async (req, res) => {
  try {
    const { staffel_id, name, abfrage_typ, parameter, sortierung } = req.body
    if (!staffel_id || !name || !abfrage_typ) {
      return res.status(400).json({ error: 'staffel_id, name, abfrage_typ erforderlich' })
    }

    const row = await queryOne(
      `INSERT INTO statistik_vorlagen (staffel_id, name, abfrage_typ, parameter, erstellt_von, sortierung)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [staffel_id, name, abfrage_typ, JSON.stringify(parameter || {}), req.user?.user_id, sortierung ?? 0]
    )
    res.status(201).json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

statistikRouter.put('/vorlagen/:id', async (req, res) => {
  try {
    const { name, abfrage_typ, parameter, sortierung } = req.body
    const row = await queryOne(
      `UPDATE statistik_vorlagen SET
        name = COALESCE($1, name),
        abfrage_typ = COALESCE($2, abfrage_typ),
        parameter = COALESCE($3, parameter),
        sortierung = COALESCE($4, sortierung)
       WHERE id = $5 RETURNING *`,
      [name, abfrage_typ, parameter ? JSON.stringify(parameter) : null, sortierung, req.params.id]
    )
    if (!row) return res.status(404).json({ error: 'Vorlage nicht gefunden' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

statistikRouter.delete('/vorlagen/:id', async (req, res) => {
  try {
    const row = await queryOne('DELETE FROM statistik_vorlagen WHERE id = $1 RETURNING id', [req.params.id])
    if (!row) return res.status(404).json({ error: 'Vorlage nicht gefunden' })
    res.status(204).send()
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})
