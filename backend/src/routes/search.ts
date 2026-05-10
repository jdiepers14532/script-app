import { Router } from 'express'
import { pool, query, queryOne } from '../db'
import { authMiddleware } from '../auth'
import { extractText, buildSearchRegex, findMatches, replaceInContent } from '../utils/tiptapText'
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
    const { sql, params } = await buildScopeQuery(scope, scope_id, werkstufe_typ, contentTypes)

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

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Get scenes to process
    const { sql, params } = await buildScopeQuery(scope, scope_id, werkstufe_typ, contentTypesArr)
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
  contentTypes: string[] | null
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
      // Block provides folge_von/folge_bis
      // We need the produktion_id to find folgen
      params.push(scopeId)
      // Get block info: we join on folgen where folge_nummer BETWEEN block range
      // scopeId format: "produktionId:folgeVon:folgeBis"
      const parts = (scopeId || '').split(':')
      if (parts.length !== 3) {
        throw new Error('block scope_id muss Format "produktionId:folgeVon:folgeBis" haben')
      }
      params.pop() // remove the full scopeId
      const [prodId, vonStr, bisStr] = parts
      params.push(prodId, parseInt(vonStr), parseInt(bisStr))

      joinClause = `
        JOIN folgen f ON f.id = ds.folge_id_computed
      `
      // Use a subquery approach instead
      whereClause = `ds.geloescht = false`

      // Build with Werkstufen-Fallback
      return buildFallbackQuery(prodId, parseInt(vonStr), parseInt(bisStr), werkstufenTyp, contentTypes)
    }

    case 'produktion': {
      // All episodes of a production
      params.push(scopeId)
      return buildFallbackQuery(scopeId!, null, null, werkstufenTyp, contentTypes)
    }

    case 'alle': {
      // All productions — get all produktion IDs
      return buildAllProductionsQuery(werkstufenTyp, contentTypes)
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
  contentTypes: string[] | null
): Promise<{ sql: string; params: any[] }> {
  const params: any[] = [produktionId]
  let folgenFilter = ''

  if (folgeVon !== null && folgeBis !== null) {
    params.push(folgeVon, folgeBis)
    folgenFilter = `AND f.folge_nummer BETWEEN $${params.length - 1} AND $${params.length}`
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
  contentTypes: string[] | null
): Promise<{ sql: string; params: any[] }> {
  const params: any[] = []

  let contentTypeFilter = ''
  if (contentTypes && contentTypes.length > 0) {
    params.push(contentTypes)
    contentTypeFilter = `AND w.typ = ANY($${params.length}::text[])`
  }

  // For "alle": always use the latest version (highest version_nummer)
  const sql = `
    WITH latest_werkstufen AS (
      SELECT w.id AS werkstufe_id, w.folge_id, w.typ, w.version_nummer,
             f.folge_nummer, f.produktion_id,
             ROW_NUMBER() OVER (
               PARTITION BY w.folge_id
               ORDER BY w.version_nummer DESC
             ) AS rn
      FROM werkstufen w
      JOIN folgen f ON f.id = w.folge_id
      WHERE 1=1
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

export default searchRouter
