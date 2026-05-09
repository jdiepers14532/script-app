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
// Query: produktion_id (required), werkstufe_typ (optional, default 'drehbuch')
// ══════════════════════════════════════════════════════════════════════════════
statistikRouter.get('/besetzungsmatrix', async (req, res) => {
  try {
    const { produktion_id, werkstufe_typ } = req.query
    if (!produktion_id) return res.status(400).json({ error: 'produktion_id erforderlich' })

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
       JOIN character_productions cp ON cp.character_id = c.id AND cp.produktion_id = $1
       JOIN scene_characters sc ON sc.character_id = c.id AND sc.werkstufe_id IS NOT NULL
       JOIN werkstufen w ON w.id = sc.werkstufe_id AND w.typ = $2
       JOIN folgen f ON f.id = w.folge_id AND f.produktion_id = $1
       GROUP BY c.id, c.name, cp.kategorie_id, f.id, f.folge_nummer, w.id, w.typ
       ORDER BY c.name, f.folge_nummer`,
      [produktion_id, typ]
    )

    // Get episodes for columns
    const folgen = await query(
      `SELECT DISTINCT f.id, f.folge_nummer, f.folgen_titel
       FROM folgen f
       JOIN werkstufen w ON w.folge_id = f.id AND w.typ = $2
       WHERE f.produktion_id = $1
       ORDER BY f.folge_nummer`,
      [produktion_id, typ]
    )

    // Get character categories
    const kategorien = await query(
      `SELECT id, name FROM character_kategorien WHERE produktion_id = $1 ORDER BY sort_order, name`,
      [produktion_id]
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
// Query: werkstufe_id OR produktion_id (required)
// ══════════════════════════════════════════════════════════════════════════════
statistikRouter.get('/motiv-auslastung', async (req, res) => {
  try {
    const { werkstufe_id, produktion_id, werkstufe_typ } = req.query

    if (!werkstufe_id && !produktion_id) {
      return res.status(400).json({ error: 'werkstufe_id oder produktion_id erforderlich' })
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
        WHERE f.produktion_id = $1 AND w.typ = $2
      )`
      params.push(produktion_id, typ)
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
// Query: werkstufe_id OR produktion_id (required)
// ══════════════════════════════════════════════════════════════════════════════
statistikRouter.get('/komparsen-bedarf', async (req, res) => {
  try {
    const { werkstufe_id, produktion_id, werkstufe_typ } = req.query

    if (!werkstufe_id && !produktion_id) {
      return res.status(400).json({ error: 'werkstufe_id oder produktion_id erforderlich' })
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
        WHERE f.produktion_id = $1 AND w.typ = $2
      )`
      params.push(produktion_id, typ)
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
// GET /api/statistik/report
// Block- or Folge-level aggregated report (text-based, printable)
// Query: produktion_id (required), folge_ids (comma-separated folge IDs, required),
//        werkstufe_typ (optional, default 'drehbuch')
// ══════════════════════════════════════════════════════════════════════════════
statistikRouter.get('/report', async (req, res) => {
  try {
    const { produktion_id, folge_ids, werkstufe_typ } = req.query
    if (!produktion_id || !folge_ids) {
      return res.status(400).json({ error: 'produktion_id und folge_ids erforderlich' })
    }

    const ids = String(folge_ids).split(',').map(Number).filter(n => !isNaN(n))
    if (ids.length === 0) return res.status(400).json({ error: 'Keine gültigen folge_ids' })

    // Get latest werkstufe per folge — try requested typ first, then fallback
    const typPrio = werkstufe_typ ? [String(werkstufe_typ)] : ['drehbuch', 'storyline', 'notiz']
    let wsRows: any[] = []
    let usedTyp = typPrio[0]
    for (const typ of typPrio) {
      wsRows = await query(
        `SELECT DISTINCT ON (w.folge_id) w.id, w.folge_id, f.folge_nummer
         FROM werkstufen w
         JOIN folgen f ON f.id = w.folge_id
         WHERE f.id = ANY($1::int[]) AND w.typ = $2 AND f.produktion_id = $3
         ORDER BY w.folge_id, w.version_nummer DESC`,
        [ids, typ, produktion_id]
      )
      if (wsRows.length > 0) { usedTyp = typ; break }
    }

    const wsIds = wsRows.map((r: any) => r.id)
    if (wsIds.length === 0) {
      return res.json({
        bilder_insgesamt: 0, drehbuchseiten: 0, drehbuchseiten_display: '0',
        vorstopp_sek: 0, rollen_pro_bild: [], rollen: [], motive: [], drehorte: [], folgen: [],
        werkstufe_typ: usedTyp,
      })
    }

    // All scenes across selected werkstufen (exclude notiz format)
    const scenes = await query(
      `SELECT ds.scene_identity_id, ds.scene_nummer, ds.ort_name, ds.int_ext,
              ds.seiten, ds.stoppzeit_sek, ds.werkstufe_id,
              f.folge_nummer, w.folge_id
       FROM dokument_szenen ds
       JOIN werkstufen w ON w.id = ds.werkstufe_id
       JOIN folgen f ON f.id = w.folge_id
       WHERE ds.werkstufe_id = ANY($1::uuid[]) AND ds.geloescht = false
             AND COALESCE(ds.format, 'storyline') != 'notiz'
       ORDER BY f.folge_nummer, ds.scene_nummer`,
      [wsIds]
    )

    // All characters in these scenes (excluding notiz-format scenes)
    const chars = await query(
      `SELECT sc.scene_identity_id, sc.werkstufe_id, sc.character_id, sc.spiel_typ,
              sc.repliken_anzahl, sc.anzahl,
              c.name AS character_name,
              cp.darsteller_name,
              ck.name AS kategorie_name, ck.typ AS kategorie_typ,
              ds.scene_nummer, f.folge_nummer
       FROM scene_characters sc
       JOIN characters c ON c.id = sc.character_id
       LEFT JOIN character_productions cp ON cp.character_id = c.id AND cp.produktion_id = $2
       JOIN dokument_szenen ds ON ds.scene_identity_id = sc.scene_identity_id
                               AND ds.werkstufe_id = sc.werkstufe_id
                               AND ds.geloescht = false
                               AND COALESCE(ds.format, 'storyline') != 'notiz'
       JOIN werkstufen w ON w.id = sc.werkstufe_id
       JOIN folgen f ON f.id = w.folge_id
       LEFT JOIN character_kategorien ck ON ck.id = COALESCE(cp.kategorie_id, sc.kategorie_id)
       WHERE sc.werkstufe_id = ANY($1::uuid[])
       ORDER BY c.name, f.folge_nummer, ds.scene_nummer`,
      [wsIds, produktion_id]
    )

    // ── Parse seiten: "1 2/8" → 1.25, "0 4/8" → 0.5 ──
    function parseSeiten(s: string | null): number {
      if (!s) return 0
      const t = s.trim()
      const m = t.match(/^(\d+)\s+(\d+)\/(\d+)$/)
      if (m) return parseInt(m[1]) + parseInt(m[2]) / parseInt(m[3])
      const n = parseFloat(t)
      return isNaN(n) ? 0 : n
    }

    // Format seiten total as "X Y/8"
    function formatSeiten(total: number): string {
      const whole = Math.floor(total)
      const frac = total - whole
      const eighths = Math.round(frac * 8)
      if (eighths === 0 || eighths === 8) return String(whole + (eighths === 8 ? 1 : 0))
      return `${whole} ${eighths}/8`
    }

    // ── Summary ──
    const bilder_insgesamt = scenes.length
    const seitenTotal = scenes.reduce((sum: number, s: any) => sum + parseSeiten(s.seiten), 0)
    const vorstopp_sek = scenes.reduce((sum: number, s: any) => sum + (Number(s.stoppzeit_sek) || 0), 0)

    // ── Rollen pro Bild (histogram) ──
    const sceneCharCounts = new Map<string, number>()
    for (const s of scenes) {
      sceneCharCounts.set(`${s.werkstufe_id}:${s.scene_identity_id}`, 0)
    }
    for (const ch of chars) {
      const key = `${ch.werkstufe_id}:${ch.scene_identity_id}`
      sceneCharCounts.set(key, (sceneCharCounts.get(key) || 0) + 1)
    }
    const histogram = new Map<number, number>()
    for (const count of sceneCharCounts.values()) {
      histogram.set(count, (histogram.get(count) || 0) + 1)
    }
    const rollen_pro_bild = [...histogram.entries()]
      .filter(([c]) => c > 0)
      .sort((a, b) => a[0] - b[0])
      .map(([rollen_count, bilder_count]) => ({ rollen_count, bilder_count }))

    // ── Rollen (character list with scene references) ──
    const rollenMap = new Map<string, {
      character_name: string; darsteller_name: string | null
      kategorie_name: string | null; kategorie_typ: string | null
      scene_count: number; scenes: string[]
    }>()
    for (const ch of chars) {
      if (!rollenMap.has(ch.character_id)) {
        rollenMap.set(ch.character_id, {
          character_name: ch.character_name,
          darsteller_name: ch.darsteller_name || null,
          kategorie_name: ch.kategorie_name || null,
          kategorie_typ: ch.kategorie_typ || null,
          scene_count: 0, scenes: [],
        })
      }
      const r = rollenMap.get(ch.character_id)!
      r.scene_count++
      r.scenes.push(`${ch.folge_nummer}.${ch.scene_nummer}`)
    }
    const rollen = [...rollenMap.values()].sort((a, b) => b.scene_count - a.scene_count)

    // ── Motive ──
    function parseOrt(ort: string | null): { drehort: string; motiv: string } {
      if (!ort) return { drehort: 'Unbekannt', motiv: 'Unbekannt' }
      const idx = ort.indexOf(' / ')
      if (idx >= 0) return { drehort: ort.slice(0, idx).trim(), motiv: ort.slice(idx + 3).trim() }
      return { drehort: ort.trim(), motiv: ort.trim() }
    }

    const motivMap = new Map<string, { ort_name: string; drehort: string; motiv: string; scene_count: number; scenes: string[] }>()
    for (const s of scenes) {
      const key = s.ort_name || 'Unbekannt'
      if (!motivMap.has(key)) {
        const p = parseOrt(s.ort_name)
        motivMap.set(key, { ort_name: key, drehort: p.drehort, motiv: p.motiv, scene_count: 0, scenes: [] })
      }
      const m = motivMap.get(key)!
      m.scene_count++
      m.scenes.push(`${s.folge_nummer}.${s.scene_nummer}`)
    }
    const motive = [...motivMap.values()]
      .sort((a, b) => b.scene_count - a.scene_count)
      .map(({ ort_name, drehort, motiv, scene_count, scenes }) => ({ name: motiv, drehort, scene_count, scenes }))

    // ── Drehorte (aggregated by drehort) ──
    const drehortMap = new Map<string, number>()
    for (const s of scenes) {
      const { drehort } = parseOrt(s.ort_name)
      drehortMap.set(drehort, (drehortMap.get(drehort) || 0) + 1)
    }
    const drehorte = [...drehortMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, scene_count]) => ({ name, scene_count }))

    // ── Per-Folge breakdown ──
    const folgenBreakdown: { folge_nummer: number; bilder: number; seiten: number; seiten_display: string; vorstopp_sek: number }[] = []
    for (const ws of wsRows) {
      const folgeScenes = scenes.filter((s: any) => s.folge_nummer === ws.folge_nummer)
      const s = folgeScenes.reduce((sum: number, sc: any) => sum + parseSeiten(sc.seiten), 0)
      folgenBreakdown.push({
        folge_nummer: ws.folge_nummer,
        bilder: folgeScenes.length,
        seiten: s,
        seiten_display: formatSeiten(s),
        vorstopp_sek: folgeScenes.reduce((sum: number, sc: any) => sum + (Number(sc.stoppzeit_sek) || 0), 0),
      })
    }
    folgenBreakdown.sort((a, b) => a.folge_nummer - b.folge_nummer)

    // ── Interactions (character pairs sharing scenes) ──
    // Only count interactions between Rollen (not Komparsen)
    // Build map: scene_key → set of character names (excluding Komparsen)
    const sceneCharsMap = new Map<string, Set<string>>()
    for (const ch of chars) {
      if (ch.kategorie_typ === 'komparse') continue
      const key = `${ch.werkstufe_id}:${ch.scene_identity_id}`
      if (!sceneCharsMap.has(key)) sceneCharsMap.set(key, new Set())
      sceneCharsMap.get(key)!.add(ch.character_name)
    }
    // Count shared scenes per pair
    const pairCounts = new Map<string, { character_name_a: string; character_name_b: string; shared_scenes: number }>()
    for (const charSet of sceneCharsMap.values()) {
      const names = [...charSet].sort()
      for (let i = 0; i < names.length; i++) {
        for (let j = i + 1; j < names.length; j++) {
          const pairKey = `${names[i]}|${names[j]}`
          if (!pairCounts.has(pairKey)) {
            pairCounts.set(pairKey, { character_name_a: names[i], character_name_b: names[j], shared_scenes: 0 })
          }
          pairCounts.get(pairKey)!.shared_scenes++
        }
      }
    }
    const interactions = [...pairCounts.values()].sort((a, b) => b.shared_scenes - a.shared_scenes)

    res.json({
      bilder_insgesamt,
      szenen_insgesamt: bilder_insgesamt,
      drehbuchseiten: seitenTotal,
      drehbuchseiten_display: formatSeiten(seitenTotal),
      vorstopp_sek,
      rollen_pro_bild,
      rollen,
      motive,
      drehorte,
      interactions,
      folgen: folgenBreakdown,
      werkstufe_typ: usedTyp,
    })
  } catch (err) {
    console.error('statistik/report error:', err)
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// Vorlagen CRUD — saved statistic templates per staffel
// ══════════════════════════════════════════════════════════════════════════════

statistikRouter.get('/vorlagen', async (req, res) => {
  try {
    const { produktion_id } = req.query
    if (!produktion_id) return res.status(400).json({ error: 'produktion_id erforderlich' })

    const rows = await query(
      `SELECT * FROM statistik_vorlagen WHERE produktion_id = $1 ORDER BY sortierung, erstellt_am`,
      [produktion_id]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

statistikRouter.post('/vorlagen', async (req, res) => {
  try {
    const { produktion_id, name, abfrage_typ, parameter, sortierung } = req.body
    if (!produktion_id || !name || !abfrage_typ) {
      return res.status(400).json({ error: 'produktion_id, name, abfrage_typ erforderlich' })
    }

    const row = await queryOne(
      `INSERT INTO statistik_vorlagen (produktion_id, name, abfrage_typ, parameter, erstellt_von, sortierung)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [produktion_id, name, abfrage_typ, JSON.stringify(parameter || {}), req.user?.user_id, sortierung ?? 0]
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
