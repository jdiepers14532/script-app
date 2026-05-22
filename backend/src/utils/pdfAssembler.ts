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

/** Absatzformat → CSS-String (inline style)
 *  WICHTIG: Einfache Anführungszeichen für font-family, da dieser String als
 *  HTML-Attributwert in style="..." gesetzt wird. Doppelte Anführungszeichen
 *  würden das Attribut vorzeitig beenden und alle folgenden CSS-Regeln ignorieren. */
function fmtToCss(f: AbsatzFormat): string {
  const p: string[] = [
    `font-family:'${f.font_family}','Courier New',monospace`,
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

// Mapping alter screenplay_element-Typen auf Absatzformat-Namen (Serienwerft Daily-Standard)
const SCREENPLAY_ELEM_TO_FORMAT: Record<string, string> = {
  scene_heading:  'Szenenueberschrift',
  action:         'Action',
  character:      'Character',
  dialogue:       'Dialogue',
  parenthetical:  'Parenthetical',
  transition:     'Transition',
  shot:           'Shot',
}

/** Rendert einen einzelnen `absatz`- oder `screenplay_element`-Knoten zu HTML */
function renderAbsatzNode(
  node: any,
  fmtById: Map<string, AbsatzFormat>,
  fmtByName: Map<string, AbsatzFormat>,
  ctx: ExportContext
): string {
  // Fallback für paragraph/heading/table etc. aus Notiz-Seiten
  if (node.type !== 'absatz' && node.type !== 'screenplay_element') {
    return renderPmJson({ type: 'doc', content: [node] }, ctx)
  }

  let fmt: AbsatzFormat | undefined

  if (node.type === 'absatz') {
    // Neueres Format: Lookup via UUID, dann via Name
    fmt = (node.attrs?.format_id ? fmtById.get(node.attrs.format_id) : undefined)
      ?? (node.attrs?.format_name ? fmtByName.get(node.attrs.format_name) : undefined)
  } else {
    // Älteres Format (vor AbsatzExtension-Migration): screenplay_element
    const elementType = node.attrs?.element_type ?? 'action'
    const formatName = SCREENPLAY_ELEM_TO_FORMAT[elementType] ?? 'Action'
    fmt = fmtByName.get(formatName)
  }

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
  scene_identity_id:   string | null
  rollen:              string[]
}

// ── Szenenkopf-Template-Renderer ──────────────────────────────────────────────

/** Wert eines sk_chip-Keys aus den Szenendaten */
function skChipValue(key: string, scene: SceneRow, folgeNummer: number): string {
  switch (key) {
    case 'episode':      return String(folgeNummer)
    case 'szene_nr':     return scene.scene_nummer != null
      ? `${scene.scene_nummer}${scene.scene_nummer_suffix ?? ''}` : '?'
    case 'motiv':        return esc(scene.ort_name ?? '')
    case 'innen_aussen': return esc(scene.int_ext ?? '')
    case 'dt':           return esc(scene.tageszeit ?? '')
    case 'stoppzeit':    return esc(formatStoppzeit(scene.stoppzeit_sek))
    case 'oneliner':     return esc(scene.zusammenfassung ?? '')
    case 'sondertyp':    return esc(scene.sondertyp ?? '')
    case 'rollen':       return esc((scene.rollen ?? []).join(', '))
    default:             return ''
  }
}

/**
 * Rendert die Inline-Nodes einer Paragraph-Zeile im Szenenkopf-Template.
 * Gibt HTML und ein Array von "Spalten" zurück — aufgeteilt an tab_char-Nodes.
 * sk_if/sk_endif-Blöcke werden ausgewertet.
 */
function renderSKInlineSegments(
  nodes: any[],
  scene: SceneRow,
  folgeNummer: number
): string[] {
  const segments: string[] = ['']
  let skipDepth = 0

  for (const node of nodes) {
    if (node.type === 'sk_if') {
      const val = skChipValue(node.attrs?.ref_key ?? '', scene, folgeNummer)
      if (!val.trim()) skipDepth++
      continue
    }
    if (node.type === 'sk_endif') {
      if (skipDepth > 0) skipDepth--
      continue
    }
    if (skipDepth > 0) continue

    if (node.type === 'tab_char') {
      segments.push('')
      continue
    }

    const marks: any[] = node.marks ?? []
    const bold      = marks.some((m: any) => m.type === 'bold')
    const italic    = marks.some((m: any) => m.type === 'italic')
    const underline = marks.some((m: any) => m.type === 'underline')

    let content = ''
    if (node.type === 'sk_chip') {
      content = skChipValue(node.attrs?.key ?? '', scene, folgeNummer)
    } else if (node.type === 'text') {
      content = esc(node.text ?? '')
    }

    if (!content) continue
    if (bold)      content = `<strong>${content}</strong>`
    if (italic)    content = `<em>${content}</em>`
    if (underline) content = `<u>${content}</u>`
    segments[segments.length - 1] += content
  }

  return segments
}

/**
 * Rendert eine Paragraph-Zeile des Szenenkopf-Templates.
 * Tab-Stops werden als Flex-Spalten realisiert.
 * Gibt '' zurück wenn die Zeile leer ist (wird dann übersprungen).
 */
function renderSKParagraph(
  node: any,
  scene: SceneRow,
  folgeNummer: number
): string {
  const attrs      = node.attrs ?? {}
  const ff         = attrs.fontFamily ?? "'Courier Prime','Courier New',monospace"
  const fs         = attrs.fontSize   ?? '11pt'
  const lh         = attrs.lineHeight ?? '1.2'
  const tabStops: { pos: number; align: string }[] = attrs.tabStops ?? []

  const fst = attrs.fontStyle  ?? ''  // 'italic' / ''
  const fw  = attrs.fontWeight ?? ''  // 'bold'   / ''

  const segments = renderSKInlineSegments(node.content ?? [], scene, folgeNummer)
  const allEmpty  = segments.every(s => !s.trim())
  if (allEmpty) return ''

  let baseStyle = `font-family:${ff};font-size:${fs};line-height:${lh};margin:0;padding:0`
  if (fst) baseStyle += `;font-style:${fst}`
  if (fw)  baseStyle += `;font-weight:${fw}`

  if (segments.length === 1 || tabStops.length === 0) {
    return `<p style="${baseStyle}">${segments[0] || '&nbsp;'}</p>`
  }

  // Flex-Row für Tab-Stop-Spalten.
  // stop = Tab-Stop BEFORE segment i — bestimmt Ausrichtung des Segments.
  // (tabStops[0] ist der Stop, der Segment 0 von Segment 1 trennt,
  //  also: Segment i wird durch tabStops[i-1] ausgerichtet.)
  const cells = segments.map((content, i) => {
    const stop = tabStops[i - 1]  // Tab-Stop vor diesem Segment
    let cellStyle = ''
    if (i === 0) {
      // Erste Spalte: feste Breite bis zum ersten Tab-Stop
      const w = tabStops[0]?.pos ?? 4
      cellStyle = `width:${w}cm;flex-shrink:0`
    } else if (stop?.align === 'right') {
      cellStyle = `flex:1;text-align:right`
    } else if (stop?.align === 'center') {
      cellStyle = `flex:1;text-align:center`
    } else {
      cellStyle = `flex:1;text-align:left`
    }
    return `<span style="${cellStyle}">${content || ''}</span>`
  }).join('')

  return `<div style="display:flex;align-items:baseline;${baseStyle}">${cells}</div>`
}

/**
 * Rendert das konfigurierte Szenenkopf-Template (Tiptap-JSON aus absatzformat_presets)
 * für eine Szene. Gibt ein HTML-Div mit page-break-after:avoid zurück.
 * Fallback wenn kein Template: klassischer Einzeiler.
 */
function renderSzenenkopf(
  templateJson: any,
  scene: SceneRow,
  folgeNummer: number
): string {
  // Fallback wenn kein Template konfiguriert
  if (!templateJson) {
    const num  = scene.scene_nummer != null ? `${scene.scene_nummer}${scene.scene_nummer_suffix ?? ''}` : '?'
    const parts = [`SZ\u00a0${num}`]
    if (scene.ort_name)  parts.push(esc(scene.ort_name))
    if (scene.int_ext)   parts.push(esc(scene.int_ext))
    if (scene.tageszeit) parts.push(esc(scene.tageszeit))
    return `<p style="font-weight:bold;text-transform:uppercase;margin:14pt 0 4pt;line-height:1;page-break-after:avoid">${parts.join(' \u2014 ')}</p>`
  }

  const doc   = typeof templateJson === 'string' ? JSON.parse(templateJson) : templateJson
  const nodes: any[] = Array.isArray(doc) ? doc
    : doc.type === 'doc' ? (doc.content ?? [])
    : [doc]

  const parts: string[] = []
  for (const node of nodes) {
    if (node.type === 'horizontalRule') {
      parts.push('<hr style="border:none;border-top:0.5pt solid #888;margin:2pt 0;width:100%">')
    } else if (node.type === 'paragraph') {
      const rendered = renderSKParagraph(node, scene, folgeNummer)
      if (rendered) parts.push(rendered)
    }
  }

  if (parts.length === 0) return ''
  return `<div style="margin-top:14pt;margin-bottom:4pt;page-break-after:avoid">${parts.join('\n')}</div>`
}

/** Rendert alle Szenen eines Drehbuchs / Storyline */
function renderMainScenes(
  scenes: SceneRow[],
  fmtById: Map<string, AbsatzFormat>,
  fmtByName: Map<string, AbsatzFormat>,
  ctx: ExportContext,
  szenenkopfTemplate: any,
  folgeNummer: number
): string {
  return scenes.map(scene => {
    // Notiz-Format-Szenen bekommen keinen strukturierten Szenenkopf
    const headHtml = scene.format !== 'notiz'
      ? renderSzenenkopf(szenenkopfTemplate, scene, folgeNummer)
      : ''
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

    // ── 5. Szenenkopf-Template aus aktivem Absatzformat-Preset ───────────────
    let szenenkopfTemplate: any = null
    const presetIdRes = await client.query(
      `SELECT value FROM production_app_settings WHERE production_id = $1 AND key = 'absatzformat_preset_id'`,
      [w.produktion_id]
    )
    if (presetIdRes.rows.length > 0) {
      const rawPresetId = presetIdRes.rows[0].value
      // value ist TEXT — ggf. JSON-String mit Anführungszeichen
      const presetId = typeof rawPresetId === 'string'
        ? rawPresetId.replace(/^"|"$/g, '').trim()
        : String(rawPresetId)
      if (presetId) {
        const tmplRes = await client.query(
          `SELECT szenen_kopf_template FROM absatzformat_presets WHERE id = $1`,
          [presetId]
        )
        if (tmplRes.rows.length > 0) {
          szenenkopfTemplate = tmplRes.rows[0].szenen_kopf_template ?? null
        }
      }
    }

    // ── 7. Terminologie (episode_terminus) ────────────────────────────────────
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
              stoppzeit_sek, content, zusammenfassung, sort_order, format, sondertyp,
              scene_identity_id
       FROM dokument_szenen
       WHERE werkstufe_id = $1 AND geloescht = false
       ORDER BY sort_order`,
      [werkstufId]
    )

    // Charakternamen (Rollen) pro Szene für den rollen-Chip im Szenenkopf
    const charRes = await client.query<{ scene_identity_id: string; rollen: string[] }>(
      `SELECT sc.scene_identity_id,
              array_agg(c.name ORDER BY c.name) AS rollen
       FROM scene_characters sc
       JOIN characters c ON c.id = sc.character_id
       WHERE sc.werkstufe_id = $1 AND COALESCE(sc.ist_gruppe, false) = false
       GROUP BY sc.scene_identity_id`,
      [werkstufId]
    )
    const charMap = new Map<string, string[]>(
      charRes.rows.map(r => [r.scene_identity_id, r.rollen])
    )
    const mainScenes = szRes.rows.map(s => ({
      ...s,
      rollen: s.scene_identity_id ? (charMap.get(s.scene_identity_id) ?? []) : [],
    }))

    setProgress(50)

    const isNotizDoc = w.typ === 'notiz'
    const mainHtml = isNotizDoc
      ? renderNotizWerkstufe(szRes.rows, fmtById, fmtByName, ctx)
      : renderMainScenes(mainScenes, fmtById, fmtByName, ctx, szenenkopfTemplate, w.folge_nummer)

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

    const html = buildPdfHtml({ title, bodyHtml, kzFz, ctx, bodyMargins })

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
      // Kein margin-Parameter — CSS @page { margin } übernimmt die Seitenränder auf jeder Seite
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
