/**
 * PDF-Profil-Resolver (Phase 5) — Single Source of Truth für „Profil → Export-Optionen".
 *
 * Wird von ZWEI Stellen genutzt, damit Vorschau und echter Versand identisch sind:
 *   - Live-Vorschau:   POST /api/pdf-export-profil/:id/preview  (routes/verteiler.ts)
 *   - Versand-PDF:     generateVerteilerPdf                     (lib/verteilerPdf.ts)
 *
 * Mappt die TYP-Struktur des Profils (`struktur_json`: preItems/postItems/szenenAktiv mit
 * Typen titelseite/statistik/onliner/synopse/fsk) + Layout-Felder (orientation, kz/fz,
 * lesezeichen) auf `ExportJobOptions` für `assemblePdf`. Konkrete Werkstufen-/Folge-Bezüge
 * werden erst hier (zur Render-Zeit) gegen die übergebene Werkstufe aufgelöst.
 *
 * statistik/onliner/synopse brauchen `statistikConfig` mit Folge-Bezug — sonst überspringt
 * assemblePdf sie still. Block-Modus ist serverseitig (keine Block-Spalte in `folgen`) nicht
 * auflösbar → wir lösen immer gegen die EINE Folge der Werkstufe auf (Folge-Modus).
 */
import { pool } from '../db'
import type { OrderedExportItem, ExportJobOptions } from '../utils/exportJobQueue'

const STRUKTUR_LABELS: Record<string, string> = {
  titelseite: 'Titelseite', statistik: 'Statistik', onliner: 'Onliner',
  synopse: 'Synopsen', fsk: 'FSK & Inhaltskennzeichnung',
}
// Default-Sektionen der Statistik-Seite — identisch zu routes/exports.ts (Bestands-Default).
const STAT_DEFAULT_SECTIONS = ['uebersicht', 'rollen', 'motive']

export interface FolgeCtx { folge_id: number; folge_nummer: number }

/** Folge (id + Nummer) der Werkstufe auflösen — Basis für statistik/onliner/synopse. */
export async function resolveFolgeCtx(werkstufId: string): Promise<FolgeCtx | null> {
  const { rows } = await pool.query(
    `SELECT f.id AS folge_id, f.folge_nummer AS folge_nummer
       FROM werkstufen w JOIN folgen f ON f.id = w.folge_id
      WHERE w.id = $1 LIMIT 1`,
    [werkstufId]
  )
  if (!rows.length || rows[0].folge_id == null) return null
  return { folge_id: Number(rows[0].folge_id), folge_nummer: Number(rows[0].folge_nummer) }
}

/** Profil-Slots (preItems/postItems) → geordnete Export-Items. */
function profilSlotsToItems(
  slots: any[],
  titelseiteVorlagen: { id: string; name: string }[],
  folgeCtx: FolgeCtx | null,
): { items: OrderedExportItem[]; skipped: string[] } {
  const items: OrderedExportItem[] = []
  const skipped: string[] = []
  for (const slot of (slots || [])) {
    if (!slot || slot.enabled === false) continue
    const label = STRUKTUR_LABELS[slot.type] || slot.type
    switch (slot.type) {
      case 'titelseite':
        for (const v of titelseiteVorlagen) items.push({ type: 'notiz', vorlageId: v.id, label: v.name, enabled: true })
        break
      case 'fsk':
        items.push({ type: 'fsk', enabled: true, label: STRUKTUR_LABELS.fsk })
        break
      case 'statistik':
      case 'onliner':
      case 'synopse':
        if (!folgeCtx) { skipped.push(label); break }
        items.push({
          type: slot.type, enabled: true, label: `${label} Folge ${folgeCtx.folge_nummer}`,
          statistikConfig: {
            folge_ids: [folgeCtx.folge_id],
            folge_nummer: folgeCtx.folge_nummer,
            mode: 'folge',
            sections: STAT_DEFAULT_SECTIONS,
            includedSceneNumbers: null,
          },
        })
        break
    }
  }
  return { items, skipped }
}

/** Kopf-/Fußzeilen-Overrides aus dem Profil (entspricht ExportDrawer kzFzModus). */
function profilKzFzOverrides(modus: string | null, fzText: string | null): Partial<ExportJobOptions> {
  if (!modus || modus === 'standard') return {}
  if (modus === 'kz')    return { kzAktivOverride: true,  fzAktivOverride: false }
  if (modus === 'keine') return { kzAktivOverride: false, fzAktivOverride: false }
  // 'fz'
  return { kzAktivOverride: false, fzAktivOverride: true, fzTextOverride: (fzText || '').trim() || undefined }
}

export interface ProfilResolveResult {
  options: ExportJobOptions
  /** Element-Labels, die nicht aufgelöst werden konnten (z.B. Statistik ohne Folge). */
  skipped: string[]
}

/**
 * Profil-Row + Werkstufe → vollständige `ExportJobOptions` für assemblePdf.
 * Liefert zusätzlich `skipped` (für den X-Preview-Skipped-Hinweis der Vorschau).
 */
export async function resolveProfilExportOptions(
  profil: any,
  werkstufId: string,
): Promise<ProfilResolveResult> {
  const vorlagen = await pool.query(
    `SELECT id, name FROM dokument_vorlagen
      WHERE produktion_id = $1 AND ist_titelseite = true ORDER BY created_at DESC`,
    [profil.produktion_id]
  ).then(r => r.rows as { id: string; name: string }[])

  const folgeCtx = await resolveFolgeCtx(werkstufId)

  const sj: any = (profil.struktur_json && typeof profil.struktur_json === 'object') ? profil.struktur_json : {}
  const pre  = profilSlotsToItems(sj.preItems, vorlagen, folgeCtx)
  const post = profilSlotsToItems(sj.postItems, vorlagen, folgeCtx)

  const options: ExportJobOptions = {
    preItems: pre.items,
    postItems: post.items,
    hauptinhaltAktiv: sj.szenenAktiv !== false,
    pdfBookmarks: profil.lesezeichen_aktiv !== false,
    pdfLandscape: profil.pdf_orientation === 'landscape',
    ...profilKzFzOverrides(profil.kz_fz_modus, profil.fz_text),
  }

  const skipped = [...new Set([...pre.skipped, ...post.skipped])]
  return { options, skipped }
}
