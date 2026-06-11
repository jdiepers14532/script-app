/**
 * Verteiler-PDF-Generierung (Schritt 7) — ersetzt den /pdf-Stub.
 *
 * Strategie: das bestehende Export-Modul (assemblePdf) wiederverwenden und nur
 * davorhängen:
 *   - Sides-Filter  → über die bestehende options.szenenAuswahl (aus sides_figuren)
 *   - ZWC (forensisch, je Empfänger) → über userId = correlation_id (assemblePdf
 *     legt buildPayload(userId, werkstufId) ins Keywords-Feld)
 *   - sichtbares Wasserzeichen laut Profil → pdf-lib-Post-Processing auf JEDER Seite
 *   - PDF-Lesezeichen → über options.pdfBookmarks
 *
 * Revisionsmodus: in Schritt 7 nur 'voll'. nur_aenderungen/markiert = Schritt 7b.
 */
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib'
import { assemblePdf } from '../utils/pdfAssembler'
import { resolveProfilExportOptions } from './pdfProfilResolver'
import { pool } from '../db'

export interface VerteilerPdfCtx {
  werkstufeId: string
  correlationId: string          // distribution_empfaenger.id → ZWC-Payload
  name: string | null
  email: string
  werkstufe: string
  version: number | null
  sidesFiguren: string[] | null  // Snapshot; null = Vollfassung
  profil: any | null             // pdf_export_profil-Row oder null
}

/**
 * Szenen-Auswahl (Format "12,18A") aus den Sides-Figuren ableiten.
 * Gibt '0' zurück, wenn Figuren gesetzt sind aber in KEINER Szene vorkommen —
 * so rendert das Export-Modul nichts (statt versehentlich die Vollfassung, weil
 * eine leere szenenAuswahl als „kein Filter" interpretiert würde).
 */
async function sidesSzenenAuswahl(werkstufeId: string, sidesFiguren: string[]): Promise<string> {
  const { rows } = await pool.query(
    `SELECT DISTINCT ds.scene_nummer, COALESCE(ds.scene_nummer_suffix, '') AS suffix
     FROM scene_characters sc
     JOIN dokument_szenen ds
       ON ds.scene_identity_id = sc.scene_identity_id AND ds.werkstufe_id = sc.werkstufe_id
     WHERE sc.werkstufe_id = $1 AND sc.character_id = ANY($2::uuid[]) AND ds.geloescht = false
     ORDER BY ds.scene_nummer, suffix`,
    [werkstufeId, sidesFiguren]
  )
  if (!rows.length) return '0'
  return rows.map((r: any) => `${r.scene_nummer}${r.suffix || ''}`).join(',')
}

function resolveWmText(tpl: string | null | undefined, ctx: VerteilerPdfCtx): string {
  const datum = new Date().toLocaleDateString('de-DE')
  return (tpl || '{empfaenger_name} · {datum}')
    .replace(/\{empfaenger_name\}/g, ctx.name || ctx.email || '')
    .replace(/\{datum\}/g, datum)
    .replace(/\{werkstufe\}/g, ctx.werkstufe || '')
    .replace(/\{version\}/g, ctx.version != null ? String(ctx.version) : '')
}

/** Sichtbares Wasserzeichen laut Profil auf JEDER Seite stempeln (sicherheitskritisch). */
async function stampVisibleWatermark(
  bytes: Uint8Array,
  opts: { text: string; position: string; opacityPct: number; groesse: string }
): Promise<Buffer> {
  const doc = await PDFDocument.load(bytes)
  const font = await doc.embedFont(StandardFonts.HelveticaBold)
  const op = Math.max(0.03, Math.min(1, (opts.opacityPct ?? 20) / 100))
  const small = opts.groesse === 'gross' ? 16 : opts.groesse === 'klein' ? 8 : 11
  const diagSize = opts.groesse === 'gross' ? 46 : opts.groesse === 'klein' ? 22 : 32
  const col = rgb(0.5, 0.5, 0.5)
  const pos = opts.position || 'kopf_fuss'
  const kopf = pos.includes('kopf'), fuss = pos.includes('fuss'), diag = pos.includes('diagonal')
  const none = !kopf && !fuss && !diag
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize()
    if (kopf || none) {
      const w = font.widthOfTextAtSize(opts.text, small)
      page.drawText(opts.text, { x: (width - w) / 2, y: height - small - 14, size: small, font, color: col, opacity: op })
    }
    if (fuss) {
      const w = font.widthOfTextAtSize(opts.text, small)
      page.drawText(opts.text, { x: (width - w) / 2, y: 12, size: small, font, color: col, opacity: op })
    }
    if (diag) {
      const w = font.widthOfTextAtSize(opts.text, diagSize)
      const ang = Math.PI / 4
      page.drawText(opts.text, {
        x: width / 2 - (w / 2) * Math.cos(ang), y: height / 2 - (w / 2) * Math.sin(ang),
        size: diagSize, font, color: col, opacity: Math.min(op, 0.3), rotate: degrees(45),
      })
    }
  }
  return Buffer.from(await doc.save())
}

/** Entfernt das ZWC-Keywords-Feld (nur wenn Profil ZWC ausdrücklich deaktiviert). */
async function stripZwcKeywords(bytes: Uint8Array): Promise<Buffer> {
  const doc = await PDFDocument.load(bytes)
  doc.setKeywords([])
  return Buffer.from(await doc.save())
}

export async function generateVerteilerPdf(ctx: VerteilerPdfCtx): Promise<Buffer> {
  const profil = ctx.profil || {}

  // Profil-Struktur (Titelseite/Statistik/Onliner/Synopse/FSK + Layout) über den
  // GETEILTEN Resolver — exakt dasselbe Ergebnis wie die Live-Vorschau im Profil-Editor.
  // Ohne Profil: minimaler Default (nur Hauptinhalt + Lesezeichen).
  let options: any
  if (ctx.profil) {
    const resolved = await resolveProfilExportOptions(ctx.profil, ctx.werkstufeId)
    options = resolved.options
  } else {
    options = { hauptinhaltAktiv: true, pdfBookmarks: true }
  }
  // Sides-Filter: nur Szenen der Snapshot-Figuren (über bestehende szenenAuswahl)
  if (ctx.sidesFiguren && ctx.sidesFiguren.length) {
    options.szenenAuswahl = await sidesSzenenAuswahl(ctx.werkstufeId, ctx.sidesFiguren)
  }

  // assemblePdf: userId = correlation_id → ZWC (Keywords) je Empfänger.
  const res = await assemblePdf(
    { werkstufId: ctx.werkstufeId, userId: ctx.correlationId, userName: ctx.name || ctx.email, options },
    () => {}
  )
  let bytes: Buffer = res.buffer

  // ZWC-Toggle aus Profil (assemblePdf bettet immer ein → ggf. wieder entfernen)
  if (profil.wz_zwc_aktiv === false) bytes = await stripZwcKeywords(bytes)

  // Sichtbares Wasserzeichen laut Profil — auf JEDER Seite
  if (profil.wz_sichtbar_aktiv !== false) {
    bytes = await stampVisibleWatermark(bytes, {
      text: resolveWmText(profil.wz_sichtbar_inhalt, ctx),
      position: profil.wz_sichtbar_position || 'kopf_fuss',
      opacityPct: profil.wz_sichtbar_opacity ?? 20,
      groesse: profil.wz_sichtbar_groesse || 'mittel',
    })
  }
  return bytes
}
