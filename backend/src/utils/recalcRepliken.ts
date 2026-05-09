import { query, queryOne } from '../db'

/**
 * Count repliken per character from ProseMirror content JSON.
 * Returns Map<UPPERCASE_NAME, count>.
 */
export function countReplikenFromContent(content: any): Map<string, number> {
  const counts = new Map<string, number>()
  if (!content?.content || !Array.isArray(content.content)) return counts

  for (const node of content.content) {
    if (node?.type !== 'screenplay_element') continue
    if (node?.attrs?.element_type !== 'character') continue
    const text = node?.content?.[0]?.text
    if (!text) continue
    const name = text.trim().toUpperCase()
    if (name) counts.set(name, (counts.get(name) || 0) + 1)
  }
  return counts
}

/**
 * Detect if a character name appears in action elements of ProseMirror content.
 * Uses stem-based fuzzy matching.
 */
export function isInActionContent(content: any, charName: string): boolean {
  if (!content?.content || !Array.isArray(content.content)) return false
  const nameUpper = charName.toUpperCase()
  const stem = nameUpper.replace(/(INNEN|EN|ER|E)$/, '').slice(0, Math.max(4, nameUpper.length - 3))

  for (const node of content.content) {
    if (node?.type !== 'screenplay_element') continue
    if (node?.attrs?.element_type !== 'action') continue
    const text = node?.content?.[0]?.text
    if (!text) continue
    const textUpper = text.toUpperCase()
    if (textUpper.includes(nameUpper) || (stem.length >= 4 && textUpper.includes(stem))) {
      return true
    }
  }
  return false
}

/**
 * Count total CHARACTER blocks in a scene's content (for replik numbering).
 */
export function countTotalRepliken(content: any): number {
  if (!content?.content || !Array.isArray(content.content)) return 0
  let count = 0
  for (const node of content.content) {
    if (node?.type === 'screenplay_element' && node?.attrs?.element_type === 'character') count++
    if (node?.type === 'absatz') {
      // Check if absatz maps to a character format (via format_name)
      const name = (node?.attrs?.format_name ?? '').toLowerCase()
      if (name === 'character' || name === 'rolle' || name === 'figur') count++
    }
  }
  return count
}

/**
 * Update replik_count on dokument_szenen after content save.
 */
export async function updateReplikCount(szeneId: string, content: any): Promise<void> {
  const count = countTotalRepliken(content)
  await query(
    'UPDATE dokument_szenen SET replik_count = $1 WHERE id = $2',
    [count, szeneId]
  )
}

/**
 * Recalculate repliken_anzahl and spiel_typ for all characters linked to a scene
 * in a specific werkstufe. Call after content save.
 */
export async function recalcSceneStats(
  werkstufeId: string,
  sceneIdentityId: string,
  content: any
): Promise<void> {
  const replikenMap = countReplikenFromContent(content)

  // Get all character links for this scene+werkstufe
  const links = await query(
    `SELECT sc.id, c.name, sc.header_o_t, sc.spiel_typ
     FROM scene_characters sc
     JOIN characters c ON c.id = sc.character_id
     WHERE sc.scene_identity_id = $1 AND sc.werkstufe_id = $2`,
    [sceneIdentityId, werkstufeId]
  )

  for (const link of links) {
    const nameUpper = link.name.toUpperCase()
    const repliken = replikenMap.get(nameUpper) || 0
    const inAction = isInActionContent(content, link.name)

    // Determine spiel_typ: content can only upgrade, not downgrade
    let spiel_typ = link.header_o_t ? 'o.t.' : 'spiel'
    if (repliken > 0) spiel_typ = 'text'
    else if (inAction && !link.header_o_t) spiel_typ = 'spiel'

    await query(
      `UPDATE scene_characters SET repliken_anzahl = $1, spiel_typ = $2
       WHERE id = $3`,
      [repliken, spiel_typ, link.id]
    )
  }
}
