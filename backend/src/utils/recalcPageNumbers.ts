import { query, queryOne } from '../db'
import { calcContentLinesRaw } from './calcPageLength'

// Szenenkopf margins (hardcoded in pdfAssembler.ts renderSzenenkopf)
const HEADING_MARGIN_TOP_PT    = 14
const HEADING_MARGIN_BOTTOM_PT = 4

// Screenplay content line height (font-size:12pt, line-height:1)
const CONTENT_LINE_HEIGHT_PT = 12

// Page height in mm per format
const PAGE_HEIGHT_MM: Record<'a4' | 'letter', number> = { a4: 297, letter: 279.4 }
// Default top/bottom margins in mm (may be overridden by KZ/FZ config)
const DEFAULT_MARGIN_TOP_MM:    Record<'a4' | 'letter', number> = { a4: 25, letter: 25.4 }
const DEFAULT_MARGIN_BOTTOM_MM: Record<'a4' | 'letter', number> = { a4: 20, letter: 12.7 }

/**
 * Calculates the heading height in content-line equivalents from a
 * szenenkopf_template JSON (Tiptap) as rendered by pdfAssembler.
 *
 * Falls back to the default <h2> style if no template is set.
 * usablePt and linesPerPage must match the effective page geometry
 * (accounting for KZ/FZ margin expansion).
 */
function calcHeadingLines(templateJson: any, usablePt: number, linesPerPage: number): number {
  const ptPerLine = usablePt / linesPerPage

  let totalPt = HEADING_MARGIN_TOP_PT + HEADING_MARGIN_BOTTOM_PT

  if (!templateJson) {
    // Default fallback: single <h2> line, line-height:1, ~12pt font
    totalPt += 12 * 1.0
    return totalPt / ptPerLine
  }

  // Invisible h2 for PDF outline: font-size:1pt, line-height:1 (not in templateJson)
  totalPt += 1

  const doc = typeof templateJson === 'string' ? JSON.parse(templateJson) : templateJson
  const nodes: any[] = Array.isArray(doc) ? doc
    : doc.type === 'doc' ? (doc.content ?? [])
    : [doc]

  for (const node of nodes) {
    if (node.type === 'horizontalRule') {
      totalPt += 4.5  // margin:2pt×2 + border-top:0.5pt
      continue
    }
    if (node.type !== 'paragraph') continue

    const attrs      = node.attrs ?? {}
    const fontSize   = parseFloat(String(attrs.fontSize   ?? '11').replace(/[^\d.]/g, '')) || 11
    const lineHeight = parseFloat(String(attrs.lineHeight ?? '1.2'))                       || 1.2
    const spaceAfter = parseFloat(String(attrs.spaceAfter ?? '0' ).replace(/[^\d.]/g, '')) || 0

    // Each template paragraph = 1 rendered line (headings are designed compact)
    totalPt += fontSize * lineHeight + spaceAfter
  }

  return totalPt / ptPerLine
}

/**
 * Recalculates running page numbers for all scenes in a werkstufe.
 * Updates seite_von, seite_bis, seite_von_str, seite_bis_str on dokument_szenen.
 *
 * Fractions are 0-indexed: 0.0 = start of page 1, 1.0 = start of page 2, etc.
 * Every scene except the first starts on a new page (page-break-before:always).
 *
 * Phase 1: reads content JSON fresh + derives heading height from the active
 * absatzformat preset — no hardcoded constants, auto-adapts to format changes.
 * Phase 2: scenes with seitenzahlen_gesperrt=TRUE are skipped (A-page logic).
 */
export async function recalcPageNumbers(werkstufeId: string): Promise<void> {
  // Fetch lock status + produktion_id in one query
  const ws = await queryOne(
    `SELECT w.seitenzahlen_gesperrt, f.produktion_id
     FROM werkstufen w
     JOIN folgen f ON f.id = w.folge_id
     WHERE w.id = $1`,
    [werkstufeId]
  ) as { seitenzahlen_gesperrt: boolean; produktion_id: string } | null

  if (ws?.seitenzahlen_gesperrt) return

  // Resolve active absatzformat preset for this production
  let szenenkopfTemplate: any = null
  let seitenformat: 'a4' | 'letter' = 'a4'

  if (ws?.produktion_id) {
    const pas = await queryOne(
      `SELECT value FROM production_app_settings
       WHERE production_id = $1 AND key = 'absatzformat_preset_id'`,
      [ws.produktion_id]
    ) as { value: string } | null

    if (pas?.value) {
      const presetId = pas.value.replace(/^"|"$/g, '').trim()
      if (presetId) {
        const preset = await queryOne(
          `SELECT szenen_kopf_template, seitenformat FROM absatzformat_presets WHERE id = $1`,
          [presetId]
        ) as { szenen_kopf_template: any; seitenformat: string } | null

        if (preset) {
          szenenkopfTemplate = preset.szenen_kopf_template
          seitenformat = preset.seitenformat === 'letter' ? 'letter' : 'a4'
        }
      }
    }
  }

  // ── Effective page geometry: account for KZ/FZ margin expansion ────────────
  // pdfAssembler expands top/bottom margins when KZ/FZ is active.
  // If we use the nominal margins (25/20mm), LINES_PER_PAGE is wrong for such docs.
  let effectiveTopMm    = DEFAULT_MARGIN_TOP_MM[seitenformat]
  let effectiveBottomMm = DEFAULT_MARGIN_BOTTOM_MM[seitenformat]

  if (ws?.produktion_id) {
    const wsTyp = await queryOne(
      `SELECT typ FROM werkstufen WHERE id = $1`,
      [werkstufeId]
    ) as { typ: string } | null

    // Query KZ/FZ config: type-specific first, then fallback (typ IS NULL)
    const kzFz = (wsTyp?.typ
      ? await queryOne(
          `SELECT kopfzeile_aktiv, fusszeile_aktiv, seiten_layout,
                  (kopfzeile_aktiv AND kopfzeile_content IS NOT NULL) AS has_hdr,
                  (fusszeile_aktiv AND fusszeile_content IS NOT NULL) AS has_ftr
           FROM kopf_fusszeilen_defaults
           WHERE produktion_id = $1 AND werkstufe_typ = $2`,
          [ws.produktion_id, wsTyp.typ]
        )
      : null
    ) ?? await queryOne(
      `SELECT kopfzeile_aktiv, fusszeile_aktiv, seiten_layout,
              (kopfzeile_aktiv AND kopfzeile_content IS NOT NULL) AS has_hdr,
              (fusszeile_aktiv AND fusszeile_content IS NOT NULL) AS has_ftr
       FROM kopf_fusszeilen_defaults
       WHERE produktion_id = $1 AND werkstufe_typ IS NULL`,
      [ws.produktion_id]
    ) as { has_hdr: boolean; has_ftr: boolean; seiten_layout: any } | null

    if (kzFz) {
      const sl     = kzFz.seiten_layout ?? {}
      const hmt    = sl.header_abstand_rand ?? 10   // mm from top edge
      const hmb    = sl.footer_abstand_rand ?? 10   // mm from bottom edge
      const baseTop    = sl.margin_top    ?? effectiveTopMm
      const baseBottom = sl.margin_bottom ?? effectiveBottomMm
      // Same formula as pdfAssembler buildKzFzHtml (lines 1573-1574)
      if (kzFz.has_hdr) effectiveTopMm    = Math.max(baseTop,    hmt + 14 + 4)
      if (kzFz.has_ftr) effectiveBottomMm = Math.max(baseBottom, hmb + 10 + 4)
    }
  }

  const pageHeightMm = PAGE_HEIGHT_MM[seitenformat]
  const usablePt     = (pageHeightMm - effectiveTopMm - effectiveBottomMm) * (72 / 25.4)
  const LINES_PER_PAGE = Math.max(30, Math.floor(usablePt / CONTENT_LINE_HEIGHT_PT))
  const headingLines   = calcHeadingLines(szenenkopfTemplate, usablePt, LINES_PER_PAGE)

  // Load all non-deleted scenes WITH content JSON
  const scenes = await query(
    `SELECT ds.id, ds.content, ds.format,
            COALESCE(dv.ist_titelseite, FALSE) AS ist_titelseite
     FROM dokument_szenen ds
     LEFT JOIN dokument_vorlagen dv ON dv.id = ds.vorlage_id
     WHERE ds.werkstufe_id = $1 AND ds.geloescht IS NOT TRUE
     ORDER BY ds.sort_order ASC`,
    [werkstufeId]
  ) as Array<{ id: string; content: any; format: string | null; ist_titelseite: boolean }>

  if (scenes.length === 0) return

  let currentFraction = 0.0

  const ids:    string[] = []
  const svArr:  number[] = []
  const sbArr:  number[] = []
  const svsArr: string[] = []
  const sbsArr: string[] = []

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i]

    // Titelseite is not counted in screenplay page numbering
    if (scene.ist_titelseite) continue

    // PDF: every scene except the first has page-break-before:always
    if (i > 0) {
      currentFraction = Math.ceil(currentFraction)
    }

    // Float line count (no ceiling rounding — avoids accumulated page-boundary errors)
    const contentLines  = calcContentLinesRaw(scene.content)
    const totalLines    = scene.format !== 'notiz' ? headingLines + contentLines : contentLines
    const pageLenFraction = totalLines / LINES_PER_PAGE

    const seite_von = currentFraction
    const seite_bis = currentFraction + pageLenFraction

    ids.push(scene.id)
    svArr.push(seite_von)
    sbArr.push(seite_bis)
    svsArr.push(String(Math.floor(seite_von) + 1))
    sbsArr.push(String(Math.floor(seite_bis - 0.0001) + 1))

    currentFraction = seite_bis
  }

  // Bulk update via unnest
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
