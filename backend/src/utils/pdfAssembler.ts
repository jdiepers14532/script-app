/**
 * PDF Assembler — Phase 3
 *
 * Lädt alle nötigen Daten (Werkstufe, Szenen, Absatzformate, KZ/FZ)
 * und rendert über Puppeteer ein vollständiges A4-PDF.
 *
 * Einstiegspunkt: assemblePdf()
 */

import puppeteer from 'puppeteer'
import { pool } from '../db'
import type { ExportJobOptions, JobResult } from './exportJobQueue'
import {
  buildPdfHtml,
  buildExportFilename,
  renderPmJson,
  ExportContext,
} from './exportAssembler'
import { encodeWatermark, buildPayload } from './watermark'

// ── Typen ─────────────────────────────────────────────────────────────────────

interface AbsatzFormat {
  id:           string
  name:         string
  kuerzel:      string | null
  font_family:  string
  font_size:    number
  bold:         boolean
  italic:       boolean
  underline:    boolean
  uppercase:    boolean
  text_align:   string
  margin_left:  number   // cm – zusätzlicher Einzug innerhalb des Textblocks
  margin_right: number   // cm
  space_before: number   // pt (margin-top)
  space_after:  number   // pt (margin-bottom)
  line_height:  number
}

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function formatStoppzeit(sek: number | null): string {
  if (!sek) return ''
  const m = Math.floor(sek / 60)
  const s = sek % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Absatzformat → CSS-String (inline style) */
function fmtToCss(f: AbsatzFormat): string {
  const p: string[] = [
    `font-family:"${f.font_family}","Courier New",monospace`,
    `font-size:${f.font_size}pt`,
    `font-weight:${f.bold ? 'bold' : 'normal'}`,
    `font-style:${f.italic ? 'italic' : 'normal'}`,
    f.underline ? 'text-decoration:underline' : '',
    f.uppercase ? 'text-transform:uppercase' : '',
    `text-align:${f.text_align}`,
    f.margin_left  > 0 ? `margin-left:${f.margin_left}cm`   : '',
    f.margin_right > 0 ? `margin-right:${f.margin_right}cm` : '',
    f.space_before > 0 ? `margin-top:${f.space_before}pt`   : 'margin-top:0',
    f.space_after  > 0 ? `margin-bottom:${f.space_after}pt` : 'margin-bottom:0',
    `line-height:${f.line_height}`,
  ]
  return p.filter(Boolean).join(';')
}

/**
 * Rendert den Inline-Inhalt eines Knotens über exportAssembler (renderPmJson),
 * indem er als einziger Paragraph in einem Fake-Doc verpackt wird.
 * Gibt nur den inneren HTML zurück (ohne <p>-Tags).
 */
function renderInline(nodes: any[], ctx: ExportContext): string {
  if (!nodes?.length) return ''
  const fakeDoc = { type: 'doc', content: [{ type: 'paragraph', content: nodes }] }
  const html = renderPmJson(fakeDoc, ctx)
  // Extrahiert den Inhalt zwischen <p...> und </p>
  const m = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i)
  return m ? m[1] : html
}

/** Rendert einen einzelnen `absatz`-Knoten zu HTML */
function renderAbsatzNode(
  node: any,
  fmtById: Map<string, AbsatzFormat>,
  fmtByName: Map<string, AbsatzFormat>,
  ctx: ExportContext
): string {
  if (node.type !== 'absatz') {
    // Fallback für paragraph/heading/table etc. aus Notiz-Seiten
    return renderPmJson({ type: 'doc', content: [node] }, ctx)
  }

  const fmt = (node.attrs?.format_id ? fmtById.get(node.attrs.format_id) : null)
    ?? (node.attrs?.format_name ? fmtByName.get(node.attrs.format_name) : null)

  const css    = fmt ? fmtToCss(fmt) : 'margin:0 0 8pt;line-height:1.5'
  const kz     = fmt?.kuerzel ? ` data-kuerzel="${esc(fmt.kuerzel)}"` : ''
  const inner  = renderInline(node.content ?? [], ctx)

  // Page-break Regeln für CHAR / DIA / PAR
  let breakCss = ''
  if (fmt?.kuerzel === 'CHAR')  breakCss = 'page-break-after:avoid;'
  if (fmt?.kuerzel === 'DIA')   breakCss = 'page-break-inside:avoid;'
  if (fmt?.kuerzel === 'PAR')   breakCss = 'page-break-inside:avoid;page-break-after:avoid;'

  const fullCss = breakCss ? `${css};${breakCss}` : css

  return `<p style="${fullCss}"${kz}>${inner || '&nbsp;'}</p>`
}

/** Rendert ein vollständiges ProseMirror-Dokument mit Absatz-Support.
 *  content kann als {type:"doc",content:[...]} ODER als flaches Array [...] gespeichert sein. */
function renderDoc(
  doc: any,
  fmtById: Map<string, AbsatzFormat>,
  fmtByName: Map<string, AbsatzFormat>,
  ctx: ExportContext
): string {
  if (!doc) return ''
  const docObj = typeof doc === 'string' ? JSON.parse(doc) : doc
  // dokument_szenen.content kann ein flaches Array sein (ohne doc-Wrapper)
  let nodes: any[]
  if (Array.isArray(docObj)) {
    nodes = docObj
  } else if (docObj.type === 'doc') {
    nodes = docObj.content ?? []
  } else {
    nodes = [docObj]
  }
  return nodes.map(n => renderAbsatzNode(n, fmtById, fmtByName, ctx)).join('\n')
}

// ── Szenenrendering ────────────────────────────────────────────────────────────

interface SceneRow {
  scene_nummer:        number | null
  scene_nummer_suffix: string | null
  ort_name:            string | null
  int_ext:             string | null
  tageszeit:           string | null
  stoppzeit_sek:       number | null
  content:             any
  zusammenfassung:     string | null
  sort_order:          number
  format:              string | null
  sondertyp:           string | null
}

/** Rendert den Szenenkopf (aus DB-Metadaten) nach Drehbuch-Konvention */
function renderSceneHeading(
  scene: SceneRow,
  fmtByName: Map<string, AbsatzFormat>
): string {
  const num  = scene.scene_nummer != null ? String(scene.scene_nummer) : '?'
  const suf  = scene.scene_nummer_suffix ?? ''
  const motiv = esc(scene.ort_name ?? '')
  const ie    = esc(scene.int_ext ?? '')
  const dt    = esc(scene.tageszeit ?? '')
  const stop  = formatStoppzeit(scene.stoppzeit_sek)

  const headParts = [`SZ\u00a0${num}${suf}`]
  if (motiv) headParts.push(motiv)
  if (ie)    headParts.push(ie)
  if (dt)    headParts.push(dt)

  const shFmt  = fmtByName.get('Szenenueberschrift') ?? fmtByName.get('Scene Heading') ?? fmtByName.get('SH')
  const shCss  = shFmt
    ? fmtToCss({ ...shFmt, space_before: Math.max(shFmt.space_before, 18) })
    : 'font-weight:bold;text-transform:uppercase;margin-top:18pt;margin-bottom:6pt;line-height:1;page-break-after:avoid'

  const stopHtml   = stop ? `<span style="float:right;font-weight:normal;color:#555">${esc(stop)}</span>` : ''
  const sonderHtml = scene.sondertyp === 'stockshot'
    ? `<span style="font-weight:normal;font-size:9pt;opacity:0.65"> [STOCKSHOT]</span>`
    : scene.sondertyp === 'flashback'
    ? `<span style="font-weight:normal;font-size:9pt;opacity:0.65"> [FLASHBACK]</span>`
    : scene.sondertyp === 'wechselschnitt'
    ? `<span style="font-weight:normal;font-size:9pt;opacity:0.65"> [WECHSELSCHNITT]</span>`
    : ''

  return `<p style="${shCss};page-break-after:avoid" class="scene-heading">${stopHtml}${esc(headParts.join(' \u2014 '))}${sonderHtml}</p>`
}

/** Rendert alle Szenen eines Drehbuchs / Storyline */
function renderMainScenes(
  scenes: SceneRow[],
  fmtById: Map<string, AbsatzFormat>,
  fmtByName: Map<string, AbsatzFormat>,
  ctx: ExportContext
): string {
  return scenes.map(scene => {
    const headHtml = renderSceneHeading(scene, fmtByName)
    const bodyHtml = scene.content ? renderDoc(scene.content, fmtById, fmtByName, ctx) : ''
    return `${headHtml}\n${bodyHtml}`
  }).join('\n')
}

/** Rendert eine Notiz-Werkstufe (ohne strukturierte Szenenköpfe) */
function renderNotizWerkstufe(
  scenes: SceneRow[],
  fmtById: Map<string, AbsatzFormat>,
  fmtByName: Map<string, AbsatzFormat>,
  ctx: ExportContext
): string {
  const parts: string[] = []
  for (const scene of scenes) {
    // Optional: Zusammenfassung als Abschnittsüberschrift
    if (scene.zusammenfassung) {
      parts.push(`<h2 style="margin-top:14pt;margin-bottom:6pt;font-size:13pt">${esc(scene.zusammenfassung)}</h2>`)
    }
    if (scene.content) {
      parts.push(renderDoc(scene.content, fmtById, fmtByName, ctx))
    }
  }
  return parts.join('\n')
}

// ── Haupt-Assembler ───────────────────────────────────────────────────────────

export interface PdfAssemblerInput {
  werkstufId: string
  userId:     string
  userName:   string
  options:    ExportJobOptions
}

/**
 * Baut das vollständige HTML für den PDF-Export auf (ohne Puppeteer).
 * Wird von assemblePdf() und assemblePreviewHtml() gemeinsam genutzt.
 */
async function assembleHtml(
  input: PdfAssemblerInput,
  setProgress: (p: number) => void
): Promise<{ html: string; title: string }> {
  const { werkstufId, userId, userName, options } = input
  const client = await pool.connect()

  try {
    // ── 1. Werkstufe + Folge + Produktion ─────────────────────────────────────
    setProgress(10)
    const wsRes = await client.query<{
      id: string; typ: string; version_nummer: number; label: string | null;
      stand_datum: string | null; folge_id: string;
      folge_nummer: number; folgen_titel: string | null;
      produktion_id: string; produktion_titel: string;
    }>(
      `SELECT w.id, w.typ, w.version_nummer, w.label, w.stand_datum,
              f.id AS folge_id, f.folge_nummer, f.folgen_titel,
              p.id AS produktion_id, p.titel AS produktion_titel
       FROM werkstufen w
       JOIN folgen f ON f.id = w.folge_id
       JOIN produktionen p ON p.id = f.produktion_id
       WHERE w.id = $1`,
      [werkstufId]
    )
    if (wsRes.rows.length === 0) throw new Error('Werkstufe nicht gefunden')
    const w = wsRes.rows[0]

    // ── 2. Absatzformate ──────────────────────────────────────────────────────
    setProgress(15)
    const fmtRes = await client.query<AbsatzFormat>(
      `SELECT id, name, kuerzel, font_family, font_size, bold, italic, underline, uppercase,
              text_align, margin_left, margin_right, space_before, space_after, line_height
       FROM absatzformate WHERE produktion_id = $1 ORDER BY sort_order, name`,
      [w.produktion_id]
    )
    const fmtById   = new Map<string, AbsatzFormat>()
    const fmtByName = new Map<string, AbsatzFormat>()
    for (const f of fmtRes.rows) {
      fmtById.set(f.id, f)
      fmtByName.set(f.name, f)
      if (f.kuerzel) fmtByName.set(f.kuerzel, f)
    }

    // ── 3. Kopf-/Fußzeilen-Defaults ──────────────────────────────────────────
    setProgress(20)
    const kzTypRes = await client.query(
      `SELECT kopfzeile_content, fusszeile_content, kopfzeile_aktiv, fusszeile_aktiv,
              erste_seite_kein_header, erste_seite_kein_footer, seiten_layout
       FROM kopf_fusszeilen_defaults
       WHERE produktion_id = $1 AND werkstufe_typ = $2`,
      [w.produktion_id, w.typ]
    )
    const kzAlleRes = await client.query(
      `SELECT kopfzeile_content, fusszeile_content, kopfzeile_aktiv, fusszeile_aktiv,
              erste_seite_kein_header, erste_seite_kein_footer, seiten_layout
       FROM kopf_fusszeilen_defaults
       WHERE produktion_id = $1 AND werkstufe_typ = 'alle'`,
      [w.produktion_id]
    )
    const kzFz = kzTypRes.rows[0] ?? kzAlleRes.rows[0] ?? null

    // ── 4. Seitenränder aus production_app_settings ───────────────────────────
    setProgress(22)
    const marginRes = await client.query(
      `SELECT value FROM production_app_settings WHERE production_id = $1 AND key = 'page_margin_mm'`,
      [w.produktion_id]
    )
    let bodyMargins = { oben: 25, unten: 20, links: 30, rechts: 30 }
    if (marginRes.rows.length > 0) {
      try {
        const v = marginRes.rows[0].value
        const parsed = typeof v === 'string' ? JSON.parse(v) : v
        bodyMargins = { ...bodyMargins, ...parsed }
      } catch { /* defaults beibehalten */ }
    }

    // ── 5. Terminologie (episode_terminus) ────────────────────────────────────
    const termRes = await client.query(
      `SELECT value FROM production_app_settings WHERE production_id = $1 AND key = 'terminologie'`,
      [w.produktion_id]
    )
    let episodeTerminus = 'Folge'
    if (termRes.rows.length > 0) {
      try {
        const v = termRes.rows[0].value
        const t = typeof v === 'string' ? JSON.parse(v) : v
        if (t?.folge) episodeTerminus = t.folge
      } catch { /* default */ }
    }

    // ── 6. ExportContext aufbauen ─────────────────────────────────────────────
    setProgress(25)
    const now = new Date()
    const ctx: ExportContext = {
      produktion:           w.produktion_titel,
      staffel:              null,
      block:                null,
      folge:                w.folge_nummer,
      folgentitel:          w.folgen_titel,
      werkstufe:            w.label ?? w.typ,
      fassung:              w.label,
      version:              w.version_nummer,
      stand_datum:          w.stand_datum ? String(w.stand_datum).slice(0, 10) : now.toISOString().slice(0, 10),
      autor:                userName,
      regie:                null,
      firmenname:           null,
      sender:               null,
      buero_adresse:        null,
      sendedatum:           null,
      produktionszeitraum:  null,
      aktuelles_datum:      now.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      aktuelles_jahr:       String(now.getFullYear()),
      aktuelles_uhrzeit:    now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
      folge_laenge_netto:   null,
      firmen_adresse:       null,
      rechtsform:           null,
      handelsregister:      null,
      ust_id:               null,
      geschaeftsfuehrung:   null,
      firmen_email:         null,
      firmen_telefon:       null,
      tel_produktion:       null,
      notiz_inhalt:         null,
      persoenlicher_ausdruck: options.persoenlicher_ausdruck ?? null,
      revision:               options.revision ?? null,
      revisions_farbe_hex:    options.revisions_farbe_hex ?? null,
      episode_terminus:       episodeTerminus,
    }

    // ── 7. Dokument-Vorlagen (Titelseite, Synopsis …) laden + rendern ─────────
    setProgress(30)
    const prefixSections: string[] = []

    const dvIds = options.dokumentVorlagenIds ?? []
    if (dvIds.length > 0) {
      const dvRes = await client.query(
        `SELECT id, name, typ, body_content
         FROM dokument_vorlagen
         WHERE id = ANY($1) AND is_aktiv = true`,
        [dvIds]
      )
      const dvMap = new Map(dvRes.rows.map((r: any) => [r.id, r]))
      for (const id of dvIds) {
        const dv = dvMap.get(id)
        if (!dv?.body_content) continue
        prefixSections.push(renderDoc(dv.body_content, fmtById, fmtByName, ctx))
      }
    }

    // Notiz-Werkstufen
    const notizIds = options.notizWerkstufIds ?? []
    for (const nid of notizIds) {
      const nszRes = await client.query<SceneRow>(
        `SELECT scene_nummer, scene_nummer_suffix, ort_name, int_ext, tageszeit,
                stoppzeit_sek, content, zusammenfassung, sort_order, format, sondertyp
         FROM dokument_szenen
         WHERE werkstufe_id = $1 AND geloescht = false
         ORDER BY sort_order`,
        [nid]
      )
      if (nszRes.rows.length > 0) {
        prefixSections.push(renderNotizWerkstufe(nszRes.rows, fmtById, fmtByName, ctx))
      }
    }

    // ── 8. Hauptszenen laden + rendern ────────────────────────────────────────
    setProgress(40)
    const szRes = await client.query<SceneRow>(
      `SELECT scene_nummer, scene_nummer_suffix, ort_name, int_ext, tageszeit,
              stoppzeit_sek, content, zusammenfassung, sort_order, format, sondertyp
       FROM dokument_szenen
       WHERE werkstufe_id = $1 AND geloescht = false
       ORDER BY sort_order`,
      [werkstufId]
    )
    setProgress(50)

    const isNotizDoc = w.typ === 'notiz'
    const mainHtml = isNotizDoc
      ? renderNotizWerkstufe(szRes.rows, fmtById, fmtByName, ctx)
      : renderMainScenes(szRes.rows, fmtById, fmtByName, ctx)

    // ── 9. Body-HTML zusammenbauen ────────────────────────────────────────────
    const wmPayload = buildPayload(userId, werkstufId)
    const wmHidden  = `<span aria-hidden="true" style="position:absolute;left:-9999px;font-size:0;line-height:0">${encodeWatermark(wmPayload)}</span>`

    let bodyHtml = wmHidden + '\n'

    if (prefixSections.length > 0) {
      bodyHtml += prefixSections.map((s, i) =>
        i === 0 ? s : `<div style="page-break-before:always">\n${s}\n</div>`
      ).join('\n')
      bodyHtml += `\n<div style="page-break-before:always">\n${mainHtml}\n</div>`
    } else {
      bodyHtml += mainHtml
    }

    // ── 10. Titel + vollständige HTML-Seite ───────────────────────────────────
    const title = buildExportFilename(
      { typ: w.typ, version_nummer: w.version_nummer, label: w.label, stand_datum: w.stand_datum },
      { folge_nummer: w.folge_nummer, folgen_titel: w.folgen_titel },
      { titel: w.produktion_titel },
      episodeTerminus,
      'pdf'
    ).replace(/\.pdf$/i, '')

    const html = buildPdfHtml({ title, bodyHtml, kzFz, ctx, bodyMargins, hasPrefix: prefixSections.length > 0 })

    return { html, title }

  } finally {
    client.release()
  }
}

/** Gibt das vollständige HTML für die Browser-Vorschau zurück (kein Puppeteer). */
export async function assemblePreviewHtml(
  input: PdfAssemblerInput,
  setProgress: (p: number) => void
): Promise<string> {
  const { html } = await assembleHtml(input, setProgress)
  return html
}

export async function assemblePdf(
  input: PdfAssemblerInput,
  setProgress: (p: number) => void
): Promise<JobResult> {
  const { html, title } = await assembleHtml(input, setProgress)

  // ── 11. Puppeteer → PDF ───────────────────────────────────────────────────
  setProgress(55)
  const browser = await puppeteer.launch({
    executablePath: puppeteer.executablePath(),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    headless: true,
  })
  setProgress(60)

  let pdfBytes: Uint8Array
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60_000 })
    setProgress(75)
    pdfBytes = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: false,
      margin: { top: '0', bottom: '0', left: '0', right: '0' },
    })
    setProgress(90)
  } finally {
    await browser.close()
  }

  // Werkstufe-Metadaten für Dateiname erneut aus DB (bereits im assembleHtml geholt,
  // hier nochmal kompakt via title)
  const filename = title.replace(/\s*[-–]\s*$/, '') + '.pdf'

  return {
    buffer:   Buffer.from(pdfBytes),
    mimeType: 'application/pdf',
    filename,
  }
}
