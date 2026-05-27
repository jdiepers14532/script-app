import { query, queryOne } from '../db'

/**
 * Recalculates running page numbers for all scenes in a werkstufe.
 * Updates seite_von, seite_bis, seite_von_str, seite_bis_str on dokument_szenen.
 *
 * Fractions are 0-indexed: 0.0 = start of page 1, 1.0 = start of page 2, etc.
 * page_length is stored in 1/8 units (8 = one full page).
 *
 * Phase 2: scenes with seitenzahlen_gesperrt=TRUE on the werkstufe will be
 * skipped (locked page numbers), and A-page suffixes will be preserved.
 */
export async function recalcPageNumbers(werkstufeId: string): Promise<void> {
  // Check if page numbers are locked (Phase 2 — skip recalc if locked)
  const ws = await queryOne(
    'SELECT seitenzahlen_gesperrt FROM werkstufen WHERE id = $1',
    [werkstufeId]
  ) as { seitenzahlen_gesperrt: boolean } | null
  if (ws?.seitenzahlen_gesperrt) return

  // Get all non-deleted scenes in sort order
  const scenes = await query(
    `SELECT id, page_length, format
     FROM dokument_szenen
     WHERE werkstufe_id = $1 AND geloescht IS NOT TRUE
     ORDER BY sort_order ASC`,
    [werkstufeId]
  ) as Array<{ id: string; page_length: number | null; format: string | null }>

  if (scenes.length === 0) return

  // Running fractional page position (0-indexed: 0.0 = start of page 1)
  let currentFraction = 0.0

  const ids:    string[]  = []
  const svArr:  number[]  = []
  const sbArr:  number[]  = []
  const svsArr: string[]  = []
  const sbsArr: string[]  = []

  for (const scene of scenes) {
    const pageLenFraction = Math.max(1, scene.page_length ?? 1) / 8
    const seite_von = currentFraction
    const seite_bis = currentFraction + pageLenFraction

    // Which integer pages does this scene span?
    // floor(fraction) + 1 gives the 1-indexed page number for a given 0-indexed fraction
    const startPage = Math.floor(seite_von) + 1
    // For end page: fraction seite_bis is where the NEXT scene starts.
    // The last content of this scene is at seite_bis - epsilon.
    const endPage = Math.floor(seite_bis - 0.0001) + 1

    ids.push(scene.id)
    svArr.push(seite_von)
    sbArr.push(seite_bis)
    svsArr.push(String(startPage))
    sbsArr.push(String(endPage))

    currentFraction = seite_bis
  }

  // Bulk update via unnest for efficiency
  await query(
    `UPDATE dokument_szenen ds
     SET seite_von     = u.sv,
         seite_bis     = u.sb,
         seite_von_str = u.svs,
         seite_bis_str = u.sbs
     FROM (
       SELECT
         unnest($1::uuid[])    AS id,
         unnest($2::numeric[]) AS sv,
         unnest($3::numeric[]) AS sb,
         unnest($4::text[])    AS svs,
         unnest($5::text[])    AS sbs
     ) u
     WHERE ds.id = u.id`,
    [ids, svArr, sbArr, svsArr, sbsArr]
  )
}

/**
 * Format a page range for display in the UI.
 * Returns e.g. "S.12" or "S.12–13" or "S.12A–12B" (Phase 3).
 */
export function formatPageRange(seite_von_str: string | null, seite_bis_str: string | null): string {
  if (!seite_von_str) return ''
  if (!seite_bis_str || seite_von_str === seite_bis_str) return `S.${seite_von_str}`
  return `S.${seite_von_str}–${seite_bis_str}`
}
