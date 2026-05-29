import { Router } from 'express'
import { pool, query, queryOne } from '../db'
import { authMiddleware } from '../auth'

export const ntEintraegeRouter = Router()
ntEintraegeRouter.use(authMiddleware)

// ── Server-seitiges Suffix-Parsing (spiegelt frontend parseSuffix) ─────────────
function parseSuffixServer(text: string): { name: string; suffix: string | null } {
  const patterns: Array<{ pattern: RegExp; canonical: string }> = [
    { pattern: /\s*\(?\s*one[-\s]?way\s*\)?$/i, canonical: '(ONE-WAY)' },
    { pattern: /\s*\(?\s*v\.?o\.?\s*\)?$/i, canonical: '(VO)' },
    { pattern: /\s*\(?\s*n\.?t\.?\s*\)?$/i, canonical: '(NT)' },
    { pattern: /\s*\(?\s*(?:off|o\.s\.?)\s*\)?$/i, canonical: '(OFF)' },
  ]
  for (const { pattern, canonical } of patterns) {
    if (pattern.test(text)) {
      return { name: text.replace(pattern, '').trim(), suffix: canonical }
    }
  }
  return { name: text, suffix: null }
}

// Flacher Text aus ProseMirror-Node
function extractNodeText(node: any): string {
  if (!node) return ''
  if (node.type === 'text') return node.text ?? ''
  if (Array.isArray(node.content)) return node.content.map(extractNodeText).join('')
  return ''
}

// ── NT-Figuren aus ProseMirror-Content extrahieren ────────────────────────────
interface NtCharEntry {
  nameUpper: string
  nt_typ: 'stimme' | 'vo'
  replicaTexts: string[]
}

/**
 * Analysiert den ProseMirror-JSON-Content einer Szene und liefert NT/VO-Figuren
 * mit ihrem Replikentext zurück.
 *
 * Erkannte Fälle:
 * - Suffix (NT) → nt_typ='stimme'
 * - Suffix (VO) → nt_typ='vo'
 * - ALL-OFF: alle Auftritte einer Figur haben (OFF) → nt_typ='stimme'
 * - ONE-WAY: kein NT-Eintrag (kein Replikentext, nicht im Drehplan)
 */
export function extractNtCharacters(
  content: any,
  charFormatIds: Set<string>,
  diagFormatIds: Set<string>
): NtCharEntry[] {
  const nodes: any[] = Array.isArray(content)
    ? content
    : (content?.content ?? [])

  // name → { suffixes für alle Auftritte, Repliken für NT/VO-Auftritte }
  const charMap = new Map<string, { suffixes: string[]; replicaTexts: string[] }>()
  let currentName: string | null = null
  let currentSuffix: string | null = null
  let collectReplicas = false

  for (const node of nodes) {
    const isChar =
      (node.type === 'screenplay_element' && (node.attrs?.elementType === 'character' || node.attrs?.element_type === 'character')) ||
      (node.type === 'absatz' && charFormatIds.has(node.attrs?.format_id))

    const isDiag =
      (node.type === 'screenplay_element' && (node.attrs?.elementType === 'dialogue' || node.attrs?.element_type === 'dialogue')) ||
      (node.type === 'absatz' && diagFormatIds.has(node.attrs?.format_id))

    if (isChar) {
      const rawText = extractNodeText(node).trim()
      const { name, suffix } = parseSuffixServer(rawText)
      const nameUpper = name.toUpperCase()

      if (!charMap.has(nameUpper)) {
        charMap.set(nameUpper, { suffixes: [], replicaTexts: [] })
      }
      charMap.get(nameUpper)!.suffixes.push(suffix ?? '')

      currentName = nameUpper
      currentSuffix = suffix
      // Repliken sammeln für NT und VO (nicht ONE-WAY, nicht OFF normal)
      collectReplicas = suffix === '(NT)' || suffix === '(VO)'
    } else if (isDiag && currentName && collectReplicas) {
      const diagText = extractNodeText(node).trim()
      if (diagText) {
        charMap.get(currentName)?.replicaTexts.push(diagText)
      }
    } else if (!isChar && !isDiag) {
      // Parenthetical etc. — currentName bleibt aktiv
    }
  }

  const result: NtCharEntry[] = []

  for (const [nameUpper, data] of charMap) {
    const { suffixes, replicaTexts } = data
    const hasNt = suffixes.includes('(NT)')
    const hasVo = suffixes.includes('(VO)')
    const allOff = suffixes.length > 0 && suffixes.every(s => s === '(OFF)')

    if (hasVo) {
      result.push({ nameUpper, nt_typ: 'vo', replicaTexts })
    } else if (hasNt) {
      result.push({ nameUpper, nt_typ: 'stimme', replicaTexts })
    } else if (allOff) {
      // ALL-OFF: Figur ausschließlich im Off — wie NT behandeln
      result.push({ nameUpper, nt_typ: 'stimme', replicaTexts: [] })
    }
  }

  return result
}

/**
 * Auto-Upsert: wird nach jedem PUT /api/dokument-szenen/:id aufgerufen.
 * Legt NT-Einträge an, aktualisiert Replikentext, setzt veraltet=TRUE für nicht mehr NT/VO-Figuren.
 */
export async function autoUpsertNtEintraege(szeneId: string, content: any): Promise<void> {
  try {
    // Metadaten der Szene laden
    const szene = await queryOne(
      `SELECT ds.id, ds.scene_identity_id, ds.werkstufe_id,
              w.folge_id, f.produktion_id
       FROM dokument_szenen ds
       JOIN werkstufen w ON w.id = ds.werkstufe_id
       JOIN folgen f ON f.id = w.folge_id
       WHERE ds.id = $1`,
      [szeneId]
    )
    if (!szene?.scene_identity_id || !szene?.werkstufe_id) return

    // Absatzformat-IDs für CHARACTER und DIALOGUE dieser Produktion
    const charFormats = await query(
      `SELECT id FROM absatzformate WHERE produktion_id = $1 AND LOWER(name) = 'character'`,
      [szene.produktion_id]
    )
    const diagFormats = await query(
      `SELECT id FROM absatzformate WHERE produktion_id = $1 AND LOWER(name) = 'dialogue'`,
      [szene.produktion_id]
    )
    const charFormatIds = new Set(charFormats.map((r: any) => r.id))
    const diagFormatIds = new Set(diagFormats.map((r: any) => r.id))

    // NT-Figuren aus Content extrahieren
    const ntChars = extractNtCharacters(content, charFormatIds, diagFormatIds)

    // Figuren-UUIDs per Name nachschlagen
    const upsertedCharIds: string[] = []

    for (const entry of ntChars) {
      // Figur per Name in der Produktion suchen (characters hat keine produktion_id — via character_productions)
      const char = await queryOne(
        `SELECT c.id FROM characters c
         JOIN character_productions cp ON cp.character_id = c.id
         WHERE cp.produktion_id = $1 AND UPPER(c.name) = $2
         LIMIT 1`,
        [szene.produktion_id, entry.nameUpper]
      )
      if (!char?.id) continue

      const replikenText = entry.replicaTexts.join('\n') || null

      await pool.query(
        `INSERT INTO nt_eintraege
           (produktion_id, character_id, szene_id, scene_identity_id, werkstufe_id, folge_id, nt_typ, repliken_text, veraltet)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE)
         ON CONFLICT (character_id, scene_identity_id, werkstufe_id)
         DO UPDATE SET
           szene_id = EXCLUDED.szene_id,
           nt_typ = EXCLUDED.nt_typ,
           repliken_text = EXCLUDED.repliken_text,
           veraltet = FALSE,
           aktualisiert_am = NOW()`,
        [
          szene.produktion_id,
          char.id,
          szeneId,
          szene.scene_identity_id,
          szene.werkstufe_id,
          szene.folge_id ?? null,
          entry.nt_typ,
          replikenText,
        ]
      )
      upsertedCharIds.push(char.id)
    }

    // Figuren, die nicht mehr NT/VO sind → soft-delete (veraltet=TRUE)
    // NIEMALS hard-delete — Disposition.app verlinkt via .id
    if (upsertedCharIds.length > 0) {
      await pool.query(
        `UPDATE nt_eintraege
         SET veraltet = TRUE, aktualisiert_am = NOW()
         WHERE scene_identity_id = $1 AND werkstufe_id = $2
           AND veraltet = FALSE
           AND character_id != ALL($3::uuid[])`,
        [szene.scene_identity_id, szene.werkstufe_id, upsertedCharIds]
      )
    } else {
      // Keine NT-Figuren mehr → alle veralten
      await pool.query(
        `UPDATE nt_eintraege
         SET veraltet = TRUE, aktualisiert_am = NOW()
         WHERE scene_identity_id = $1 AND werkstufe_id = $2 AND veraltet = FALSE`,
        [szene.scene_identity_id, szene.werkstufe_id]
      )
    }
  } catch (err) {
    // Non-blocking — NT-Upsert darf Szenen-Speicherung nicht blockieren
    console.error('[NT] autoUpsert Fehler:', err)
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/nt-eintraege?produktion_id=X[&folge_id=Y][&nt_typ=Z][&veraltet=false]
// ══════════════════════════════════════════════════════════════════════════════
ntEintraegeRouter.get('/', async (req, res) => {
  try {
    const { produktion_id, folge_id, nt_typ, veraltet, szene_id } = req.query as Record<string, string>
    if (!produktion_id) return res.status(400).json({ error: 'produktion_id erforderlich' })

    const conditions: string[] = ['ne.produktion_id = $1']
    const params: any[] = [produktion_id]
    let pi = 2

    if (folge_id) { conditions.push(`ne.folge_id = $${pi++}`); params.push(Number(folge_id)) }
    if (nt_typ) { conditions.push(`ne.nt_typ = $${pi++}`); params.push(nt_typ) }
    if (szene_id) { conditions.push(`ne.szene_id = $${pi++}`); params.push(szene_id) }

    // Default: nur aktive (nicht veraltete) Einträge
    const zeigVeraltet = veraltet === 'true'
    if (!zeigVeraltet) { conditions.push(`ne.veraltet = FALSE`) }

    const rows = await query(
      `SELECT
         ne.id, ne.character_id, ne.szene_id, ne.scene_identity_id, ne.werkstufe_id,
         ne.folge_id, ne.nt_typ, ne.repliken_text, ne.notiz, ne.veraltet,
         ne.erstellt_am, ne.aktualisiert_am,
         c.name AS character_name,
         c.rollen_nummer, c.komparsen_nummer,
         f.folge_nummer,
         ds.scene_nummer, ds.ort_name, ds.int_ext, ds.tageszeit
       FROM nt_eintraege ne
       LEFT JOIN characters c ON c.id = ne.character_id
       LEFT JOIN folgen f ON f.id = ne.folge_id
       LEFT JOIN dokument_szenen ds ON ds.id = ne.szene_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY f.folge_nummer NULLS LAST, c.name, ne.aktualisiert_am DESC`,
      params
    )

    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/nt-eintraege/:id — einzelner Eintrag
// ══════════════════════════════════════════════════════════════════════════════
ntEintraegeRouter.get('/:id', async (req, res) => {
  try {
    const row = await queryOne(
      `SELECT ne.*, c.name AS character_name, f.folge_nummer,
              ds.scene_nummer, ds.ort_name
       FROM nt_eintraege ne
       LEFT JOIN characters c ON c.id = ne.character_id
       LEFT JOIN folgen f ON f.id = ne.folge_id
       LEFT JOIN dokument_szenen ds ON ds.id = ne.szene_id
       WHERE ne.id = $1`,
      [req.params.id]
    )
    if (!row) return res.status(404).json({ error: 'NT-Eintrag nicht gefunden' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// PATCH /api/nt-eintraege/:id — Notiz oder nt_typ manuell ändern
// ══════════════════════════════════════════════════════════════════════════════
ntEintraegeRouter.patch('/:id', async (req, res) => {
  try {
    const { notiz, nt_typ } = req.body
    const sets: string[] = ['aktualisiert_am = NOW()']
    const params: any[] = []
    let pi = 1

    if (notiz !== undefined) { sets.push(`notiz = $${pi++}`); params.push(notiz) }
    if (nt_typ !== undefined) { sets.push(`nt_typ = $${pi++}`); params.push(nt_typ) }

    params.push(req.params.id)
    const row = await queryOne(
      `UPDATE nt_eintraege SET ${sets.join(', ')} WHERE id = $${pi} RETURNING *`,
      params
    )
    if (!row) return res.status(404).json({ error: 'NT-Eintrag nicht gefunden' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/nt-eintraege/statistik?produktion_id=X&folge_ids=1,2,3
// ══════════════════════════════════════════════════════════════════════════════
ntEintraegeRouter.get('/statistik/overview', async (req, res) => {
  try {
    const { produktion_id, folge_ids } = req.query as Record<string, string>
    if (!produktion_id) return res.status(400).json({ error: 'produktion_id erforderlich' })

    const folgeIdList = folge_ids ? folge_ids.split(',').map(Number).filter(Boolean) : []
    const folgeFilter = folgeIdList.length > 0 ? `AND ne.folge_id = ANY($2::int[])` : ''
    const params: any[] = [produktion_id, ...(folgeIdList.length ? [folgeIdList] : [])]

    // Gesamtzahlen
    const totals = await queryOne(
      `SELECT
         COUNT(*) FILTER (WHERE NOT veraltet) AS gesamt,
         COUNT(*) FILTER (WHERE nt_typ = 'stimme' AND NOT veraltet) AS stimme,
         COUNT(*) FILTER (WHERE nt_typ = 'telefon' AND NOT veraltet) AS telefon,
         COUNT(*) FILTER (WHERE nt_typ = 'vo' AND NOT veraltet) AS vo,
         COUNT(DISTINCT character_id) FILTER (WHERE NOT veraltet) AS figuren_count,
         COUNT(DISTINCT scene_identity_id) FILTER (WHERE NOT veraltet) AS szenen_count
       FROM nt_eintraege ne
       WHERE ne.produktion_id = $1 ${folgeFilter}`,
      params
    )

    // Pro Figur
    const preFiguren = await query(
      `SELECT
         c.id, c.name, c.rollen_nummer,
         COUNT(*) FILTER (WHERE NOT ne.veraltet) AS szenen_count,
         array_agg(DISTINCT ne.nt_typ) FILTER (WHERE NOT ne.veraltet) AS typen
       FROM nt_eintraege ne
       JOIN characters c ON c.id = ne.character_id
       WHERE ne.produktion_id = $1 ${folgeFilter}
       GROUP BY c.id, c.name, c.rollen_nummer
       ORDER BY c.name`,
      params
    )

    res.json({ totals, figuren: preFiguren })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})
