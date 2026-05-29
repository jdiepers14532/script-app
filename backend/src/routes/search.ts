import { Router } from 'express'
import { pool, query, queryOne } from '../db'
import { authMiddleware } from '../auth'
import { extractText, buildSearchRegex, findMatches, replaceInContent, replaceCharacterNodes } from '../utils/tiptapText'
import { recalcSceneStats } from '../utils/recalcRepliken'
import { calcPageLength } from '../utils/calcPageLength'

export const searchRouter = Router()
searchRouter.use(authMiddleware)

// Werkstufen-Typ Rangfolge (Index = Prioritaet, hoeher = weiter in Pipeline)
const WERKSTUFE_RANG: Record<string, number> = {
  notiz: 0,
  storyline: 1,
  treatment: 2,
  drehbuch: 3,
}
const RANG_ORDER = ['notiz', 'storyline', 'treatment', 'drehbuch']

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/search — Suche ausfuehren (read-only)
// ══════════════════════════════════════════════════════════════════════════════
searchRouter.get('/', async (req, res) => {
  try {
    const {
      query: searchQuery,
      scope,
      scope_id,
      werkstufe_typ,
      content_types,
      case_sensitive,
      whole_words,
      regex: useRegex,
      limit: limitStr,
      offset: offsetStr,
      include_frei,
      include_private,
    } = req.query as Record<string, string>

    if (!searchQuery || !scope) {
      return res.status(400).json({ error: 'query und scope erforderlich' })
    }

    // Parse options
    const caseSensitive = case_sensitive === 'true'
    const wholeWords = whole_words === 'true'
    const isRegex = useRegex === 'true'
    const limit = Math.min(parseInt(limitStr) || 500, 1000)
    const offset = parseInt(offsetStr) || 0
    const contentTypes = content_types ? content_types.split(',') : null

    // Validate regex
    let searchRegex: RegExp
    try {
      searchRegex = buildSearchRegex(searchQuery, {
        case_sensitive: caseSensitive,
        whole_words: wholeWords,
        regex: isRegex,
      })
    } catch (err) {
      return res.status(400).json({ error: `Ungueltiger regulaerer Ausdruck: ${(err as Error).message}` })
    }

    // Build the scene query based on scope
    const includeFrei = include_frei === 'true'
    const includePrivate = include_private === 'true'
    const userId = req.user!.user_id
    const { sql, params } = await buildScopeQuery(scope, scope_id, werkstufe_typ, contentTypes, includeFrei, includePrivate, userId)

    const rows = await query(sql, params)

    // Search through results
    const results: any[] = []
    let totalMatches = 0
    let lockedCount = 0
    let fallbackCount = 0

    for (const row of rows) {
      const plaintext = extractText(row.content)
      if (!plaintext) continue

      const matches = findMatches(plaintext, searchRegex)
      if (matches.length === 0) continue

      totalMatches += matches.length
      if (row.is_locked) lockedCount++
      if (row.is_fallback) fallbackCount++

      for (const match of matches) {
        results.push({
          dokument_szene_id: row.id,
          scene_identity_id: row.scene_identity_id,
          scene_nummer: row.scene_nummer,
          ort_name: row.ort_name,
          folge_id: row.folge_id,
          folge_nummer: row.folge_nummer,
          werkstufe_id: row.werkstufe_id,
          werkstufe_typ: row.werkstufe_typ,
          werkstufe_version: row.version_nummer,
          is_fallback: row.is_fallback || false,
          is_locked: row.is_locked || false,
          locked_by: row.locked_by || null,
          snippet: match.snippet,
          match_position: match.position,
          match_length: match.length,
        })
      }
    }

    // Apply pagination
    const paginatedResults = results.slice(offset, offset + limit)

    res.json({
      results: paginatedResults,
      total: totalMatches,
      total_scenes: new Set(results.map(r => r.dokument_szene_id)).size,
      locked_count: lockedCount,
      fallback_count: fallbackCount,
      has_more: offset + limit < results.length,
    })
  } catch (err) {
    console.error('Search error:', err)
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/replace — Ersetzen ausfuehren
// ══════════════════════════════════════════════════════════════════════════════
searchRouter.post('/replace', async (req, res) => {
  const {
    query: searchQuery,
    replacement,
    scope,
    scope_id,
    werkstufe_typ,
    content_types,
    case_sensitive,
    whole_words,
    regex: useRegex,
    exclude_ids,
    include_frei,
    include_private,
  } = req.body

  if (!searchQuery || replacement === undefined || !scope) {
    return res.status(400).json({ error: 'query, replacement und scope erforderlich' })
  }

  // Build regex
  let searchRegex: RegExp
  try {
    searchRegex = buildSearchRegex(searchQuery, {
      case_sensitive: case_sensitive || false,
      whole_words: whole_words || false,
      regex: useRegex || false,
    })
  } catch (err) {
    return res.status(400).json({ error: `Ungueltiger regulaerer Ausdruck: ${(err as Error).message}` })
  }

  const excludeSet = new Set<string>(exclude_ids || [])
  const contentTypesArr = content_types && content_types.length > 0 ? content_types : null
  const includeFrei = include_frei === 'true'
  const includePrivate = include_private === 'true'
  const userId = req.user!.user_id

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Get scenes to process
    const { sql, params } = await buildScopeQuery(scope, scope_id, werkstufe_typ, contentTypesArr, includeFrei, includePrivate, userId)
    const rawResult = await client.query(sql, params as any[])
    const rows = rawResult.rows as any[]

    let replacedCount = 0
    let skippedLocked = 0
    let skippedExcluded = 0
    const affectedScenes: any[] = []

    for (const row of rows) {
      // Skip excluded
      if (excludeSet.has(row.id)) {
        skippedExcluded++
        continue
      }

      // Skip locked
      if (row.is_locked) {
        const plaintext = extractText(row.content)
        if (plaintext && findMatches(plaintext, searchRegex).length > 0) {
          skippedLocked++
        }
        continue
      }

      // Check if content has matches
      const plaintext = extractText(row.content)
      if (!plaintext) continue

      searchRegex.lastIndex = 0
      if (!searchRegex.test(plaintext)) continue

      // Replace in content
      const { content: newContent, count } = replaceInContent(row.content, searchRegex, replacement)
      if (count === 0) continue

      // Update in DB
      await client.query(
        `UPDATE dokument_szenen SET content = $1, bearbeitet_von = $2, bearbeitet_am = NOW() WHERE id = $3`,
        [JSON.stringify(newContent), req.user!.user_id, row.id]
      )

      replacedCount += count
      affectedScenes.push({
        dokument_szene_id: row.id,
        folge_nummer: row.folge_nummer,
        scene_nummer: row.scene_nummer,
        replacements_in_scene: count,
      })
    }

    await client.query('COMMIT')

    // Recalc stats for affected scenes (outside transaction for performance)
    for (const scene of affectedScenes) {
      try {
        const ds = await queryOne(
          `SELECT werkstufe_id, scene_identity_id, content FROM dokument_szenen WHERE id = $1`,
          [scene.dokument_szene_id]
        )
        if (ds) {
          await recalcSceneStats(ds.werkstufe_id, ds.scene_identity_id, ds.content)
        }
      } catch (e) {
        console.error('recalcSceneStats error for', scene.dokument_szene_id, e)
      }
    }

    res.json({
      replaced_count: replacedCount,
      skipped_locked: skippedLocked,
      skipped_excluded: skippedExcluded,
      affected_scenes: affectedScenes,
    })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Replace error:', err)
    res.status(500).json({ error: String(err) })
  } finally {
    client.release()
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// Helper: Build scope-dependent SQL query
// ══════════════════════════════════════════════════════════════════════════════
async function buildScopeQuery(
  scope: string,
  scopeId: string | undefined,
  werkstufenTyp: string | undefined,
  contentTypes: string[] | null,
  includeFrei = false,
  includePrivate = false,
  userId?: string
): Promise<{ sql: string; params: any[] }> {
  const params: any[] = []
  let whereClause = 'ds.geloescht = false'
  let joinClause = ''
  let werkstufenFilter = ''

  // Content type filter
  if (contentTypes && contentTypes.length > 0) {
    params.push(contentTypes)
    werkstufenFilter += ` AND w.typ = ANY($${params.length}::text[])`
  }

  switch (scope) {
    case 'szene': {
      // Single scene by dokument_szene_id
      params.push(scopeId)
      whereClause += ` AND ds.id = $${params.length}`
      break
    }

    case 'episode': {
      // All scenes of a werkstufe (identified by werkstufe_id)
      params.push(scopeId)
      whereClause += ` AND ds.werkstufe_id = $${params.length}`
      break
    }

    case 'block': {
      // All episodes in a block — scopeId = blockId (from ProdDB)
      // scopeId format: "produktionId:folgeVon:folgeBis"
      const parts = (scopeId || '').split(':')
      if (parts.length !== 3) {
        throw new Error('block scope_id muss Format "produktionId:folgeVon:folgeBis" haben')
      }
      const [prodId, vonStr, bisStr] = parts

      // Build with Werkstufen-Fallback
      return buildFallbackQuery(prodId, parseInt(vonStr), parseInt(bisStr), werkstufenTyp, contentTypes, includeFrei, includePrivate, userId)
    }

    case 'produktion': {
      // All episodes of a production
      params.push(scopeId)
      return buildFallbackQuery(scopeId!, null, null, werkstufenTyp, contentTypes, includeFrei, includePrivate, userId)
    }

    case 'alle': {
      // All productions — get all produktion IDs
      return buildAllProductionsQuery(werkstufenTyp, contentTypes, includeFrei, includePrivate, userId)
    }

    default:
      throw new Error(`Unbekannter scope: ${scope}`)
  }

  // Simple query for szene/episode scope (no fallback needed)
  const sql = `
    SELECT ds.id, ds.scene_identity_id, ds.scene_nummer, ds.ort_name,
           ds.content, ds.werkstufe_id, ds.sort_order,
           w.typ AS werkstufe_typ, w.version_nummer, w.folge_id,
           f.folge_nummer,
           false AS is_fallback,
           CASE WHEN el.id IS NOT NULL THEN true ELSE false END AS is_locked,
           el.user_name AS locked_by
    FROM dokument_szenen ds
    JOIN werkstufen w ON w.id = ds.werkstufe_id ${werkstufenFilter}
    JOIN folgen f ON f.id = w.folge_id
    LEFT JOIN episode_locks el ON el.produktion_id = f.produktion_id
      AND el.folge_nummer = f.folge_nummer
      AND (el.expires_at IS NULL OR el.expires_at > NOW())
    WHERE ${whereClause}
    ORDER BY f.folge_nummer, ds.sort_order
  `
  return { sql, params }
}

/**
 * Baut eine Query mit Werkstufen-Fallback fuer Block/Produktion-Scope.
 * Fuer jede Folge: nehme die hoechste Version des gewaehlten Typs.
 * Wenn nicht vorhanden: naechst hoeheren Typ.
 */
async function buildFallbackQuery(
  produktionId: string,
  folgeVon: number | null,
  folgeBis: number | null,
  werkstufenTyp: string | undefined,
  contentTypes: string[] | null,
  includeFrei = false,
  includePrivate = false,
  userId?: string
): Promise<{ sql: string; params: any[] }> {
  const params: any[] = [produktionId]
  let folgenFilter = ''

  if (folgeVon !== null && folgeBis !== null) {
    params.push(folgeVon, folgeBis)
    folgenFilter = `AND f.folge_nummer BETWEEN $${params.length - 1} AND $${params.length}`
  }

  // Freie-Dokumente-Filter
  let freiFilter = 'AND (f.ist_frei IS NULL OR f.ist_frei = false)'
  if (includeFrei && includePrivate) {
    freiFilter = '' // alles einschließen
  } else if (includeFrei && userId) {
    params.push(userId)
    freiFilter = `AND (f.ist_frei IS NULL OR f.ist_frei = false OR f.sichtbarkeit_frei != 'privat' OR f.ersteller_user_id = $${params.length})`
  } else if (includeFrei) {
    freiFilter = `AND (f.ist_frei IS NULL OR f.ist_frei = false OR f.sichtbarkeit_frei != 'privat')`
  }

  // Content type filter
  let contentTypeFilter = ''
  if (contentTypes && contentTypes.length > 0) {
    params.push(contentTypes)
    contentTypeFilter = `AND w.typ = ANY($${params.length}::text[])`
  }

  // Determine preferred typ and fallback order
  const preferredTyp = werkstufenTyp || 'drehbuch'
  const preferredRang = WERKSTUFE_RANG[preferredTyp] ?? 3
  // Fallback: from preferred downwards, then upwards
  const fallbackOrder = RANG_ORDER
    .map((typ, idx) => ({ typ, idx, dist: Math.abs(idx - preferredRang) }))
    .sort((a, b) => {
      // Prefer higher types first (closer to drehbuch)
      if (a.idx >= preferredRang && b.idx >= preferredRang) return a.idx - b.idx
      if (a.idx >= preferredRang) return -1
      if (b.idx >= preferredRang) return 1
      return b.idx - a.idx // fallback: highest first
    })
    .map(x => x.typ)

  // Build fallback array for SQL
  params.push(fallbackOrder)
  const fallbackParamIdx = params.length

  params.push(preferredTyp)
  const preferredParamIdx = params.length

  // Use DISTINCT ON with a custom ordering to get the best werkstufe per folge
  // Strategy: for each folge, rank werkstufen by proximity to preferred type, then by version DESC
  const sql = `
    WITH ranked_werkstufen AS (
      SELECT w.id AS werkstufe_id, w.folge_id, w.typ, w.version_nummer,
             f.folge_nummer, f.produktion_id,
             -- Rank: exact match first, then by array position in fallback order
             CASE WHEN w.typ = $${preferredParamIdx} THEN 0 ELSE 1 END AS type_rank,
             array_position($${fallbackParamIdx}::text[], w.typ) AS fallback_pos,
             ROW_NUMBER() OVER (
               PARTITION BY w.folge_id
               ORDER BY
                 CASE WHEN w.typ = $${preferredParamIdx} THEN 0 ELSE 1 END,
                 array_position($${fallbackParamIdx}::text[], w.typ),
                 w.version_nummer DESC
             ) AS rn
      FROM werkstufen w
      JOIN folgen f ON f.id = w.folge_id
      WHERE f.produktion_id = $1
        ${folgenFilter}
        ${freiFilter}
        ${contentTypeFilter}
    )
    SELECT ds.id, ds.scene_identity_id, ds.scene_nummer, ds.ort_name,
           ds.content, ds.werkstufe_id, ds.sort_order,
           rw.typ AS werkstufe_typ, rw.version_nummer, rw.folge_id,
           rw.folge_nummer,
           CASE WHEN rw.typ != $${preferredParamIdx} THEN true ELSE false END AS is_fallback,
           CASE WHEN el.id IS NOT NULL THEN true ELSE false END AS is_locked,
           el.user_name AS locked_by
    FROM ranked_werkstufen rw
    JOIN dokument_szenen ds ON ds.werkstufe_id = rw.werkstufe_id AND ds.geloescht = false
    LEFT JOIN episode_locks el ON el.produktion_id = rw.produktion_id
      AND el.folge_nummer = rw.folge_nummer
      AND (el.expires_at IS NULL OR el.expires_at > NOW())
    WHERE rw.rn = 1
    ORDER BY rw.folge_nummer, ds.sort_order
  `
  return { sql, params }
}

/**
 * Suche ueber alle Produktionen: fuer jede Produktion die letzte Fassung.
 */
async function buildAllProductionsQuery(
  werkstufenTyp: string | undefined,
  contentTypes: string[] | null,
  includeFrei = false,
  includePrivate = false,
  userId?: string
): Promise<{ sql: string; params: any[] }> {
  const params: any[] = []

  let contentTypeFilter = ''
  if (contentTypes && contentTypes.length > 0) {
    params.push(contentTypes)
    contentTypeFilter = `AND w.typ = ANY($${params.length}::text[])`
  }

  let freiFilter = 'AND (f.ist_frei IS NULL OR f.ist_frei = false)'
  if (includeFrei && includePrivate) {
    freiFilter = ''
  } else if (includeFrei && userId) {
    params.push(userId)
    freiFilter = `AND (f.ist_frei IS NULL OR f.ist_frei = false OR f.sichtbarkeit_frei != 'privat' OR f.ersteller_user_id = $${params.length})`
  } else if (includeFrei) {
    freiFilter = `AND (f.ist_frei IS NULL OR f.ist_frei = false OR f.sichtbarkeit_frei != 'privat')`
  }

  // For "alle": always use the latest version (highest version_nummer)
  const sql = `
    WITH latest_werkstufen AS (
      SELECT w.id AS werkstufe_id, w.folge_id, w.typ, w.version_nummer,
             f.folge_nummer, f.produktion_id,
             ROW_NUMBER() OVER (
               PARTITION BY w.folge_id
               ORDER BY CASE WHEN w.typ = 'drehbuch' THEN 2 WHEN w.typ = 'storyline' THEN 1 ELSE 0 END DESC,
                        w.version_nummer DESC
             ) AS rn
      FROM werkstufen w
      JOIN folgen f ON f.id = w.folge_id
      WHERE 1=1
        ${freiFilter}
        ${contentTypeFilter}
    )
    SELECT ds.id, ds.scene_identity_id, ds.scene_nummer, ds.ort_name,
           ds.content, ds.werkstufe_id, ds.sort_order,
           lw.typ AS werkstufe_typ, lw.version_nummer, lw.folge_id,
           lw.folge_nummer,
           false AS is_fallback,
           CASE WHEN el.id IS NOT NULL THEN true ELSE false END AS is_locked,
           el.user_name AS locked_by
    FROM latest_werkstufen lw
    JOIN dokument_szenen ds ON ds.werkstufe_id = lw.werkstufe_id AND ds.geloescht = false
    LEFT JOIN episode_locks el ON el.produktion_id = lw.produktion_id
      AND el.folge_nummer = lw.folge_nummer
      AND (el.expires_at IS NULL OR el.expires_at > NOW())
    WHERE lw.rn = 1
    ORDER BY lw.produktion_id, lw.folge_nummer, ds.sort_order
  `
  return { sql, params }
}

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/search/entity-check — Prüft ob Eingabe ein Rollenname oder Motiv ist
// ══════════════════════════════════════════════════════════════════════════════
searchRouter.get('/entity-check', async (req, res) => {
  try {
    const { q, produktion_id } = req.query as Record<string, string>
    if (!q || q.trim().length < 2 || !produktion_id) {
      return res.json({ type: 'none', matches: [] })
    }

    const term = q.trim()

    // 1. Exakter Match in characters (für diese Produktion)
    const rollen = await query(
      `SELECT c.id, c.name, cp.rollen_nummer, cp.kategorie_id
       FROM characters c
       JOIN character_productions cp ON cp.character_id = c.id
       WHERE cp.produktion_id = $1
         AND LOWER(c.name) = LOWER($2)
       ORDER BY cp.rollen_nummer NULLS LAST
       LIMIT 10`,
      [produktion_id, term]
    )
    if (rollen.length > 0) {
      return res.json({ type: 'rolle', matches: rollen })
    }

    // 2. Prefix-Match in characters (z.B. "Brit" → "BRITTA")
    const rollenPrefix = await query(
      `SELECT c.id, c.name, cp.rollen_nummer, cp.kategorie_id
       FROM characters c
       JOIN character_productions cp ON cp.character_id = c.id
       WHERE cp.produktion_id = $1
         AND LOWER(c.name) LIKE LOWER($2 || '%')
       ORDER BY cp.rollen_nummer NULLS LAST
       LIMIT 5`,
      [produktion_id, term]
    )
    if (rollenPrefix.length === 1) {
      // Eindeutiger Prefix-Match → als Rolle behandeln
      return res.json({ type: 'rolle', matches: rollenPrefix })
    }

    // 3. Exakter Match in motive
    const motiveExakt = await query(
      `SELECT id, name, typ, motiv_nummer
       FROM motive
       WHERE produktion_id = $1
         AND LOWER(name) = LOWER($2)
       ORDER BY motiv_nummer NULLS LAST
       LIMIT 10`,
      [produktion_id, term]
    )
    if (motiveExakt.length > 0) {
      return res.json({ type: 'motiv', matches: motiveExakt })
    }

    // 4. Contains-Match in motive (z.B. "Krankenhaus" → "Krankenhaus Flur")
    const motive = await query(
      `SELECT id, name, typ, motiv_nummer
       FROM motive
       WHERE produktion_id = $1
         AND LOWER(name) ILIKE '%' || LOWER($2) || '%'
       ORDER BY motiv_nummer NULLS LAST
       LIMIT 5`,
      [produktion_id, term]
    )
    if (motive.length > 0 && motive.length <= 3) {
      // Nur bei wenigen Treffern als Motiv-Match behandeln
      return res.json({ type: 'motiv', matches: motive })
    }

    res.json({ type: 'none', matches: [] })
  } catch (err) {
    console.error('Entity-check error:', err)
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/search/szenen — Strukturierte Szenen-Suche (Kombi-Filter)
// ══════════════════════════════════════════════════════════════════════════════
searchRouter.get('/szenen', async (req, res) => {
  try {
    const {
      produktion_id,
      scope,
      scope_id,
      werkstufe_typ,
      rolle_ids,    // komma-separierte character IDs
      motiv_ids,    // komma-separierte motiv IDs
      rolle_names,  // komma-separierte Namen (alternativ zu IDs)
      ia,           // 'innen'|'aussen'|'exterior'|'interior' oder leer
      dt,           // 'tag'|'nacht'|'day'|'night' oder leer
      freitext,     // optionaler Zusatz-Text
      include_frei,
      include_private,
    } = req.query as Record<string, string>

    if (!produktion_id) {
      return res.status(400).json({ error: 'produktion_id erforderlich' })
    }

    const rolleIdList = rolle_ids ? rolle_ids.split(',').filter(Boolean) : []
    const motivIdList = motiv_ids ? motiv_ids.split(',').filter(Boolean) : []
    const rolleNameList = rolle_names ? rolle_names.split(',').filter(Boolean) : []
    const includeFrei = include_frei === 'true'
    const includePrivate = include_private === 'true'
    const effectiveScope = scope || 'produktion'

    // Baue die WHERE-Bedingungen auf
    const params: any[] = [produktion_id]
    const joins: string[] = []
    const conditions: string[] = []

    // --- Scope-Filter ---
    let freiFilter = ''
    if (!includeFrei) {
      freiFilter = 'AND (f.ist_frei IS NULL OR f.ist_frei = false)'
    } else if (!includePrivate) {
      freiFilter = `AND (f.ist_frei IS NULL OR f.ist_frei = false OR f.sichtbarkeit_frei != 'privat' OR f.ersteller_user_id = $${params.length + 1})`
      params.push(req.user!.user_id)
    }

    if (effectiveScope === 'episode' && scope_id) {
      params.push(scope_id)
      conditions.push(`lw.folge_id = $${params.length}`)
    } else if (effectiveScope === 'szene' && scope_id) {
      // scope=szene: scene_identity_id → zugehörige folge via si join
      params.push(scope_id)
      conditions.push(`si.id = $${params.length}`)
    } else if (effectiveScope === 'block' && scope_id) {
      const parts = scope_id.split(':')
      if (parts.length === 3) {
        const [, vonStr, bisStr] = parts
        params.push(parseInt(vonStr), parseInt(bisStr))
        conditions.push(`lw.folge_nummer BETWEEN $${params.length - 1} AND $${params.length}`)
      }
    }

    // --- Rollen-Filter via IDs ---
    rolleIdList.forEach((roleId, i) => {
      const alias = `sc_role_${i}`
      // Verknüpfe über characters-Tabelle
      params.push(roleId)
      joins.push(`JOIN scene_characters ${alias} ON ${alias}.scene_identity_id = si.id AND ${alias}.character_id = $${params.length}`)
    })

    // --- Rollen-Filter via Namen (via characters-Tabelle) ---
    rolleNameList.forEach((roleName, i) => {
      const scAlias = `sc_name_${i}`
      const cAlias = `c_name_${i}`
      params.push(roleName)
      joins.push(`JOIN scene_characters ${scAlias} ON ${scAlias}.scene_identity_id = si.id JOIN characters ${cAlias} ON ${cAlias}.id = ${scAlias}.character_id AND LOWER(${cAlias}.name) = LOWER($${params.length})`)
    })

    // --- Motiv-Filter (motiv_id liegt auf dokument_szenen = ds) ---
    if (motivIdList.length > 0) {
      params.push(motivIdList)
      conditions.push(`ds.motiv_id = ANY($${params.length}::uuid[])`)
    }

    // --- I/A-Filter (ds.int_ext: 'INT'/'EXT'/'I-A'/...) ---
    if (ia && ia !== '') {
      const iaLower = ia.toLowerCase()
      if (iaLower.startsWith('i') || iaLower === 'int') {
        conditions.push(`UPPER(COALESCE(ds.int_ext, '')) IN ('I', 'INT', 'INNEN', 'INTERIOR', 'I-A')`)
      } else if (iaLower.startsWith('a') || iaLower.startsWith('e') || iaLower === 'ext') {
        conditions.push(`UPPER(COALESCE(ds.int_ext, '')) IN ('A', 'EXT', 'AUSSEN', 'EXTERIOR', 'AUSSEN')`)
      }
    }

    // --- DT-Filter (ds.tageszeit: 'TAG'/'NACHT'/...) ---
    if (dt && dt !== '') {
      const dtLower = dt.toLowerCase()
      if (dtLower === 'tag' || dtLower === 'day' || dtLower === 't') {
        conditions.push(`UPPER(COALESCE(ds.tageszeit, '')) IN ('T', 'TAG', 'DAY', 'TAGÜBER')`)
      } else if (dtLower === 'nacht' || dtLower === 'night' || dtLower === 'n') {
        conditions.push(`UPPER(COALESCE(ds.tageszeit, '')) IN ('N', 'NACHT', 'NIGHT')`)
      }
    }

    const whereStr = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : ''
    const joinsStr = joins.join('\n')

    // Werkstufen-Priorität
    const prefTyp = werkstufe_typ || 'drehbuch'
    params.push(prefTyp)
    const prefTypIdx = params.length

    // Hauptquery: latest_werkstufen CTE + JOIN
    const sql = `
      WITH latest_werkstufen AS (
        SELECT w.id AS werkstufe_id, w.folge_id, w.typ, w.version_nummer,
               f.folge_nummer, f.produktion_id, f.ist_frei,
               ROW_NUMBER() OVER (
                 PARTITION BY w.folge_id
                 ORDER BY
                   CASE WHEN w.typ = 'drehbuch' THEN 2 WHEN w.typ = 'storyline' THEN 1 ELSE 0 END DESC,
                   w.version_nummer DESC
               ) AS rn
        FROM werkstufen w
        JOIN folgen f ON f.id = w.folge_id
        WHERE f.produktion_id = $1
          ${freiFilter}
      )
      SELECT DISTINCT
        si.id AS scene_identity_id,
        ds.scene_nummer,
        COALESCE(ds.ort_name, '') AS ort_name,
        COALESCE(ds.int_ext, '') AS innen_aussen,
        COALESCE(ds.tageszeit, '') AS tag_nacht,
        ds.stoppzeit_sek,
        ds.motiv_id,
        lw.werkstufe_id,
        lw.typ AS werkstufe_typ,
        lw.version_nummer,
        lw.folge_id,
        lw.folge_nummer,
        lw.ist_frei,
        CASE WHEN lw.typ != $${prefTypIdx} THEN true ELSE false END AS is_fallback,
        ds.id AS dokument_szene_id,
        ds.sort_order,
        -- Rollen dieser Szene (aggregiert, Name via characters-Tabelle)
        (SELECT COALESCE(json_agg(json_build_object('name', ch.name) ORDER BY scc.repliken_anzahl DESC NULLS LAST), '[]')
         FROM scene_characters scc
         JOIN characters ch ON ch.id = scc.character_id
         WHERE scc.scene_identity_id = si.id
         LIMIT 20) AS rollen
      FROM latest_werkstufen lw
      JOIN dokument_szenen ds ON ds.werkstufe_id = lw.werkstufe_id AND ds.geloescht = false AND ds.element_type = 'scene'
      JOIN scene_identities si ON si.id = ds.scene_identity_id
      ${joinsStr}
      WHERE lw.rn = 1
        ${whereStr}
      ORDER BY lw.folge_nummer, ds.scene_nummer NULLS LAST, ds.sort_order
      LIMIT 500
    `

    const rows = await query(sql, params)

    // Wenn freitext angegeben: zusätzlich Content-Filter
    let filtered = rows
    if (freitext && freitext.trim().length > 0) {
      const searchRegex = buildSearchRegex(freitext.trim(), { case_sensitive: false })
      filtered = rows.filter((row: any) => {
        // Content wird nicht geladen für Szenen-Suche (Performance)
        // Freitext-Filter nur über ort_name und andere Metadaten
        // Für echtes Content-Filtering: separater searchBackend-Call
        return true // Freitext-Filter im Frontend via Snippet-Overlay
      })
    }

    res.json({
      szenen: filtered,
      total: filtered.length,
      has_freitext: !!freitext,
    })
  } catch (err) {
    console.error('Szenen-search error:', err)
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/search/replace-rollenname — Ersetzt Rollenname in Character-Nodes
// ══════════════════════════════════════════════════════════════════════════════
searchRouter.post('/replace-rollenname', async (req, res) => {
  const { old_name, new_name, produktion_id } = req.body
  if (!old_name || !new_name || !produktion_id) {
    return res.status(400).json({ error: 'old_name, new_name, produktion_id erforderlich' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // 1. characters-Tabelle aktualisieren
    const charResult = await client.query(
      `UPDATE characters SET name = $1
       WHERE LOWER(name) = LOWER($2)
         AND id IN (
           SELECT character_id FROM character_productions WHERE produktion_id = $3
         )`,
      [new_name, old_name, produktion_id]
    )
    const charactersUpdated = charResult.rowCount ?? 0

    // 2. scene_characters-Tabelle aktualisieren
    const scResult = await client.query(
      `UPDATE scene_characters SET name = $1
       WHERE LOWER(name) = LOWER($2)
         AND scene_identity_id IN (
           SELECT si.id FROM scene_identities si
           JOIN werkstufen w ON w.id = si.werkstufe_id
           JOIN folgen f ON f.id = w.folge_id
           WHERE f.produktion_id = $3
         )`,
      [new_name, old_name, produktion_id]
    )
    const sceneCharactersUpdated = scResult.rowCount ?? 0

    // 3. Tiptap character-Nodes in dokument_szenen aktualisieren
    // Lade alle relevanten Szenen
    const szenenRows = await client.query(
      `SELECT ds.id, ds.content
       FROM dokument_szenen ds
       JOIN werkstufen w ON w.id = ds.werkstufe_id
       JOIN folgen f ON f.id = w.folge_id
       WHERE f.produktion_id = $1
         AND ds.geloescht = false`,
      [produktion_id]
    )

    let contentNodesUpdated = 0
    for (const row of szenenRows.rows) {
      if (!row.content) continue
      const { content: newContent, count } = replaceCharacterNodes(row.content, old_name, new_name)
      if (count > 0) {
        await client.query(
          `UPDATE dokument_szenen SET content = $1, bearbeitet_von = $2, bearbeitet_am = NOW() WHERE id = $3`,
          [JSON.stringify(newContent), req.user!.user_id, row.id]
        )
        contentNodesUpdated += count
      }
    }

    await client.query('COMMIT')

    res.json({
      characters_updated: charactersUpdated,
      scene_characters_updated: sceneCharactersUpdated,
      content_nodes_updated: contentNodesUpdated,
      total: charactersUpdated + sceneCharactersUpdated + contentNodesUpdated,
    })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Replace-rollenname error:', err)
    res.status(500).json({ error: String(err) })
  } finally {
    client.release()
  }
})

export default searchRouter
