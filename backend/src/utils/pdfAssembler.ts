/**
 * PDF Assembler — Phase 3
 *
 * Lädt alle nötigen Daten (Werkstufe, Szenen, Absatzformate, KZ/FZ)
 * und rendert über Puppeteer ein vollständiges A4-PDF.
 *
 * Einstiegspunkt: assemblePdf()
 */

import puppeteer from 'puppeteer'
import * as fs from 'fs'
import * as path from 'path'
import { pool } from '../db'
import type { ExportJobOptions, OrderedExportItem, JobResult } from './exportJobQueue'
import {
  buildPdfHtml,
  buildExportFilename,
  renderPmJson,
  renderZeilenContent,
  ExportContext,
} from './exportAssembler'
import { encodeWatermark, buildPayload } from './watermark'
import { renderStatistikHtml } from './statistikHtmlRenderer'

// ── Admin Wasserzeichen-Einstellungen ─────────────────────────────────────────

interface WatermarkSettings {
  aktiv: boolean
  text: string
  opazitaet: number  // 1–30 (%)
}

let _wmSettingsCache: WatermarkSettings | null = null
let _wmSettingsCacheAt = 0
const WM_CACHE_TTL_MS = 60_000  // 1 Min — Admin ändert selten

async function loadWatermarkSettings(): Promise<WatermarkSettings> {
  const now = Date.now()
  if (_wmSettingsCache && now - _wmSettingsCacheAt < WM_CACHE_TTL_MS) return _wmSettingsCache

  try {
    const res = await pool.query('SELECT key, value FROM export_admin_settings ORDER BY key')
    const m: Record<string, string> = {}
    for (const r of res.rows) m[r.key] = r.value
    _wmSettingsCache = {
      aktiv: m['wm_sichtbar_aktiv'] === 'true',
      text: m['wm_sichtbar_text'] ?? 'VERTRAULICH',
      opazitaet: Math.min(30, Math.max(1, parseInt(m['wm_sichtbar_opazitaet'] ?? '8', 10) || 8)),
    }
    _wmSettingsCacheAt = now
    return _wmSettingsCache
  } catch {
    return { aktiv: false, text: 'VERTRAULICH', opazitaet: 8 }
  }
}

// ── Warm-Browser-Pool ─────────────────────────────────────────────────────────
// Chromium-Instanz wird warm gehalten — spart ~1–3 Sek. Kaltstart pro Export-Job.

let _warmBrowser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null

async function getWarmBrowser() {
  if (_warmBrowser) {
    try {
      await _warmBrowser.pages()  // Health-Check: wirft wenn Browser abgestürzt
      return _warmBrowser
    } catch {
      _warmBrowser = null
    }
  }
  _warmBrowser = await puppeteer.launch({
    executablePath: puppeteer.executablePath(),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    headless: true,
  })
  return _warmBrowser
}

// ── Lokale Font-CSS ───────────────────────────────────────────────────────────
// Courier Prime WOFF2 aus backend/assets/fonts/ als base64 einbetten —
// kein Netzwerkzugriff auf fonts.googleapis.com nötig.

let _localFontCss: string | null = null

function loadLocalFontCss(): string {
  if (_localFontCss !== null) return _localFontCss

  const fontsDir = path.resolve(__dirname, '../../assets/fonts')
  const variants = [
    { file: 'CourierPrime-Regular.woff2',    weight: 400, style: 'normal' },
    { file: 'CourierPrime-Bold.woff2',       weight: 700, style: 'normal' },
    { file: 'CourierPrime-Italic.woff2',     weight: 400, style: 'italic' },
    { file: 'CourierPrime-BoldItalic.woff2', weight: 700, style: 'italic' },
  ]

  const faces = variants.map(v => {
    const filePath = path.join(fontsDir, v.file)
    if (!fs.existsSync(filePath)) {
      console.warn(`[pdfAssembler] Font fehlt: ${filePath} — falle auf Courier New zurück`)
      return ''
    }
    const b64 = fs.readFileSync(filePath).toString('base64')
    return `@font-face{font-family:'Courier Prime';src:url('data:font/woff2;base64,${b64}') format('woff2');font-weight:${v.weight};font-style:${v.style};font-display:block;}`
  }).filter(Boolean)

  _localFontCss = faces.join('\n')
  return _localFontCss
}

// ── Timezone-Auflösung ────────────────────────────────────────────────────────
// Mappt ISO 3166-1 alpha-2 Ländercodes auf primäre IANA-Timezone.

const LAND_TO_TIMEZONE: Record<string, string> = {
  DE: 'Europe/Berlin',   AT: 'Europe/Vienna',    CH: 'Europe/Zurich',
  FR: 'Europe/Paris',    IT: 'Europe/Rome',       ES: 'Europe/Madrid',
  PT: 'Europe/Lisbon',   GB: 'Europe/London',     IE: 'Europe/Dublin',
  NL: 'Europe/Amsterdam', BE: 'Europe/Brussels',  LU: 'Europe/Luxembourg',
  DK: 'Europe/Copenhagen', SE: 'Europe/Stockholm', NO: 'Europe/Oslo',
  FI: 'Europe/Helsinki', IS: 'Atlantic/Reykjavik',
  PL: 'Europe/Warsaw',   CZ: 'Europe/Prague',     SK: 'Europe/Bratislava',
  HU: 'Europe/Budapest', RO: 'Europe/Bucharest',  BG: 'Europe/Sofia',
  GR: 'Europe/Athens',   HR: 'Europe/Zagreb',     SI: 'Europe/Ljubljana',
  RS: 'Europe/Belgrade', BA: 'Europe/Sarajevo',   ME: 'Europe/Podgorica',
  AL: 'Europe/Tirane',   MK: 'Europe/Skopje',     MD: 'Europe/Chisinau',
  UA: 'Europe/Kyiv',     BY: 'Europe/Minsk',      RU: 'Europe/Moscow',
  TR: 'Europe/Istanbul', CY: 'Asia/Nicosia',
  IL: 'Asia/Jerusalem',  AE: 'Asia/Dubai',         SA: 'Asia/Riyadh',
  IN: 'Asia/Kolkata',    CN: 'Asia/Shanghai',      JP: 'Asia/Tokyo',
  KR: 'Asia/Seoul',      SG: 'Asia/Singapore',     TH: 'Asia/Bangkok',
  ID: 'Asia/Jakarta',    MY: 'Asia/Kuala_Lumpur',  VN: 'Asia/Ho_Chi_Minh',
  PK: 'Asia/Karachi',    KZ: 'Asia/Almaty',
  US: 'America/New_York', CA: 'America/Toronto',  MX: 'America/Mexico_City',
  BR: 'America/Sao_Paulo', AR: 'America/Argentina/Buenos_Aires',
  CL: 'America/Santiago', CO: 'America/Bogota',   PE: 'America/Lima',
  AU: 'Australia/Sydney', NZ: 'Pacific/Auckland',
  ZA: 'Africa/Johannesburg', NG: 'Africa/Lagos', EG: 'Africa/Cairo',
  MA: 'Africa/Casablanca', KE: 'Africa/Nairobi', ET: 'Africa/Addis_Ababa',
}

/** Gibt die IANA-Timezone für einen Ländercode zurück.
 *  Speicherformat: UTC — Anzeige nach Konvertierung.
 *  Fallback-Reihenfolge: ProdDB.land → userTimezone (Browser) → UTC */
function resolveTimezone(land: string | null, userTimezone?: string): string {
  if (land) {
    const tz = LAND_TO_TIMEZONE[land.toUpperCase()]
    if (tz) return tz
  }
  if (userTimezone) {
    // Validierung: Intl wirft wenn unbekannt
    try { Intl.DateTimeFormat(undefined, { timeZone: userTimezone }); return userTimezone } catch { /* noop */ }
  }
  return 'UTC'   // Neutral-Fallback — kein Timezone-Raten
}

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
  spieltag:            number | null
  stoppzeit_sek:       number | null
  content:             any
  zusammenfassung:     string | null
  sort_order:          number
  format:              string | null
  sondertyp:           string | null
  scene_identity_id:   string | null
  rollen:              string[]
  spielzeit:           string | null
}

// ── Szenenkopf-Template-Renderer ──────────────────────────────────────────────

const DEFAULT_SCENE_KUERZEL: Record<string, string> = { int: 'I', ext: 'E', tag: 'T', nacht: 'N', daemmerung: 'D', abend: 'A' }

/** Wert eines sk_chip-Keys aus den Szenendaten */
function skChipValue(key: string, scene: SceneRow, folgeNummer: number, kuerzel: Record<string, string> = {}): string {
  switch (key) {
    case 'episode':           return String(folgeNummer)
    case 'szene_nr':          return scene.scene_nummer != null
      ? `${scene.scene_nummer}${scene.scene_nummer_suffix ?? ''}` : '?'
    case 'motiv':             return esc(scene.ort_name ?? '')
    case 'innen_aussen':      return esc(scene.int_ext ?? '')
    case 'innen_aussen_kurz': {
      const ie = (scene.int_ext ?? '').toLowerCase()
      return esc(kuerzel[ie] ?? DEFAULT_SCENE_KUERZEL[ie] ?? scene.int_ext?.charAt(0) ?? '')
    }
    case 'tageszeit_lang':    return esc(scene.tageszeit ?? '')
    case 'tageszeit_kurz': {
      const tzKey = (scene.tageszeit ?? '').toLowerCase()
      return esc(kuerzel[tzKey] ?? DEFAULT_SCENE_KUERZEL[tzKey] ?? (scene.tageszeit ? scene.tageszeit.charAt(0) : ''))
    }
    case 'spielzeit':         return esc(scene.spielzeit ?? '')
    case 'dt':                return scene.spieltag != null ? String(scene.spieltag) : ''
    case 'stoppzeit':         return esc(formatStoppzeit(scene.stoppzeit_sek))
    case 'oneliner':          return esc(scene.zusammenfassung ?? '')
    case 'sondertyp':         return esc(scene.sondertyp ?? '')
    case 'rollen':            return esc((scene.rollen ?? []).join(', '))
    default:                  return ''
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
  folgeNummer: number,
  kuerzel: Record<string, string> = {}
): string[] {
  const segments: string[] = ['']
  let skipDepth = 0

  for (const node of nodes) {
    if (node.type === 'sk_if') {
      const val = skChipValue(node.attrs?.ref_key ?? '', scene, folgeNummer, kuerzel)
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
    const marksBold      = marks.some((m: any) => m.type === 'bold')
    const marksItalic    = marks.some((m: any) => m.type === 'italic')
    const marksUnderline = marks.some((m: any) => m.type === 'underline')

    let content = ''
    let bold = marksBold, italic = marksItalic, underline = marksUnderline
    if (node.type === 'sk_chip') {
      content = skChipValue(node.attrs?.key ?? '', scene, folgeNummer, kuerzel)
      // Chip-Formatierung kann via Editor-Toolbar als attrs ODER via marks (DB-Update) gesetzt sein
      bold      = bold      || node.attrs?.fontWeight === 'bold'
      italic    = italic    || node.attrs?.fontStyle === 'italic'
      underline = underline || node.attrs?.textDecoration === 'underline'
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
  folgeNummer: number,
  bodyMarginLeftCm: number,
  kuerzel: Record<string, string> = {}
): string {
  const attrs      = node.attrs ?? {}
  const ff         = attrs.fontFamily ?? "'Courier Prime','Courier New',monospace"
  const fs         = attrs.fontSize   ?? '11pt'
  const lh         = attrs.lineHeight ?? '1.2'
  const tabStops: { pos: number; align: string }[] = attrs.tabStops ?? []

  const fst = attrs.fontStyle      ?? ''  // 'italic' / ''
  const fw  = attrs.fontWeight     ?? ''  // 'bold'   / ''
  const td  = attrs.textDecoration ?? ''  // 'underline' / ''
  const tt  = attrs.textTransform  ?? ''  // 'uppercase' / ''
  const sa  = attrs.spaceAfter     ?? ''  // e.g. '8pt' / ''

  const segments = renderSKInlineSegments(node.content ?? [], scene, folgeNummer, kuerzel)
  const allEmpty  = segments.every(s => !s.trim())
  if (allEmpty) return ''

  let baseStyle = `font-family:${ff};font-size:${fs};line-height:${lh};margin:0;padding:0`
  if (fst) baseStyle += `;font-style:${fst}`
  if (fw)  baseStyle += `;font-weight:${fw}`
  if (td)  baseStyle += `;text-decoration:${td}`
  if (tt)  baseStyle += `;text-transform:${tt}`
  if (sa)  baseStyle += `;margin-bottom:${sa}`

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
      // Erste Spalte: feste Breite bis zum ersten Tab-Stop.
      // Tab-Stop-Positionen sind cm ab physischem Papierrand gespeichert —
      // Flex-Container startet aber am Body-Content-Bereich (nach bml).
      // → bodyMarginLeftCm abziehen, damit der Stop relativ zum Content stimmt.
      const w = Math.max(0, (tabStops[0]?.pos ?? 4) - bodyMarginLeftCm)
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
  folgeNummer: number,
  pageBreakBefore = false,
  bodyMarginLeftCm = 0,
  kuerzel: Record<string, string> = {}
): string {
  const pbStyle = pageBreakBefore ? 'page-break-before:always;' : ''

  // Fallback wenn kein Template konfiguriert
  if (!templateJson) {
    const num  = scene.scene_nummer != null ? `${scene.scene_nummer}${scene.scene_nummer_suffix ?? ''}` : '?'
    const parts = [`SZ\u00a0${num}`]
    if (scene.ort_name)  parts.push(esc(scene.ort_name))
    if (scene.int_ext)   parts.push(esc(scene.int_ext))
    if (scene.tageszeit) parts.push(esc(scene.tageszeit))
    return `<p style="${pbStyle}font-weight:bold;text-transform:uppercase;margin:14pt 0 4pt;line-height:1;page-break-after:avoid">${parts.join(' \u2014 ')}</p>`
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
      const rendered = renderSKParagraph(node, scene, folgeNummer, bodyMarginLeftCm, kuerzel)
      if (rendered) parts.push(rendered)
    }
  }

  if (parts.length === 0) return ''
  return `<div style="${pbStyle}margin-top:14pt;margin-bottom:4pt;page-break-after:avoid">${parts.join('\n')}</div>`
}

/** Rendert alle Szenen eines Drehbuchs / Storyline */
function renderMainScenes(
  scenes: SceneRow[],
  fmtById: Map<string, AbsatzFormat>,
  fmtByName: Map<string, AbsatzFormat>,
  ctx: ExportContext,
  kuerzel: Record<string, string>,
  szenenkopfTemplate: any,
  folgeNummer: number,
  bodyMarginLeftCm = 0
): string {
  return scenes.map((scene, index) => {
    // Notiz-Format-Szenen bekommen keinen strukturierten Szenenkopf
    const headHtml = scene.format !== 'notiz'
      ? renderSzenenkopf(szenenkopfTemplate, scene, folgeNummer, index > 0, bodyMarginLeftCm, kuerzel)
      : (index > 0 ? '<div style="page-break-before:always"></div>' : '')
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
interface AssembleHtmlResult {
  html: string
  title: string
  headerHtml: string
  footerHtml: string
  hmt: number
  hmb: number
  hml: number
  hmr: number
  pageMarginTop: number
  pageMarginBottom: number
  bml: number
  bmr: number
}

// ── Szenen-Auswahl parsen ─────────────────────────────────────────────────────

interface SzeneSpec { nr: number; suffix: string }

/** Parst "1,3,5-10,42A" → [{nr:1,suffix:''}, {nr:3,suffix:''}, ...] oder null wenn leer. */
function parseSzenenAuswahl(raw: string | undefined): SzeneSpec[] | null {
  if (!raw?.trim()) return null
  const specs: SzeneSpec[] = []
  for (const tok of raw.split(',').map(t => t.trim()).filter(Boolean)) {
    const range = tok.match(/^(\d+)-(\d+)$/)
    if (range) {
      const from = parseInt(range[1], 10)
      const to   = parseInt(range[2], 10)
      for (let i = Math.min(from, to); i <= Math.max(from, to); i++) {
        specs.push({ nr: i, suffix: '' })
      }
      continue
    }
    const withSuffix = tok.match(/^(\d+)([A-Za-z]+)$/)
    if (withSuffix) {
      specs.push({ nr: parseInt(withSuffix[1], 10), suffix: withSuffix[2].toUpperCase() })
      continue
    }
    if (/^\d+$/.test(tok)) {
      specs.push({ nr: parseInt(tok, 10), suffix: '' })
    }
  }
  return specs.length ? specs : null
}

// ── Druckauswahl-Text bauen ───────────────────────────────────────────────────

function buildDruckauswahl(options: import('./exportJobQueue').ExportJobOptions): string | null {
  const auswahl = options.szenenAuswahl?.trim()
    ? `Auswahl: Szenen ${options.szenenAuswahl.trim()}`
    : null
  const filterParts: string[] = []
  if (options.filterRollen?.length)   filterParts.push(options.filterRollen.join(', '))
  if (options.filterMotive?.length)   filterParts.push(options.filterMotive.join(', '))
  if (options.filterKomparsen?.length) filterParts.push(`Komp.\u202fm.\u202fSp.: ${options.filterKomparsen.join(', ')}`)
  const filter = filterParts.length ? `Nur Szenen mit ${filterParts.join(' \u0026 ')}` : null
  const parts = [auswahl, filter].filter(Boolean) as string[]
  return parts.length ? parts.join(' \u0026 ') : null
}

async function assembleHtml(
  input: PdfAssemblerInput,
  setProgress: (p: number) => void,
  previewMode = false
): Promise<AssembleHtmlResult> {
  const { werkstufId, userId, userName, options } = input
  const client = await pool.connect()

  try {
    // ── 1. Werkstufe + Folge + Produktion ─────────────────────────────────────
    setProgress(10)
    const wsRes = await client.query<{
      id: string; typ: string; version_nummer: number; label: string | null;
      stand_datum: string | null; folge_id: string;
      folge_nummer: number; folgen_titel: string | null;
      produktion_id: string; produktion_titel: string; produktion_db_id: string | null;
    }>(
      `SELECT w.id, w.typ, w.version_nummer, w.label, w.stand_datum,
              f.id AS folge_id, f.folge_nummer, f.folgen_titel,
              p.id AS produktion_id, p.titel AS produktion_titel, p.produktion_db_id
       FROM werkstufen w
       JOIN folgen f ON f.id = w.folge_id
       JOIN produktionen p ON p.id = f.produktion_id
       WHERE w.id = $1`,
      [werkstufId]
    )
    if (wsRes.rows.length === 0) throw new Error('Werkstufe nicht gefunden')
    const w = wsRes.rows[0]

    // ── 1b. Land aus Produktionsdatenbank (für Timezone) ──────────────────────
    let produktionLand: string | null = null
    if (w.produktion_db_id) {
      try {
        const PROD_DB_URL  = process.env.PROD_DB_URL  ?? 'http://127.0.0.1:3005'
        const INTERNAL_KEY = process.env.PRODUKTION_INTERNAL_SECRET ?? 'prod-internal-2026'
        const r = await fetch(
          `${PROD_DB_URL}/api/internal/productions/${w.produktion_db_id}/script-context`,
          { headers: { 'x-internal-key': INTERNAL_KEY } }
        )
        if (r.ok) {
          const data = await r.json() as { land?: string | null }
          produktionLand = data.land ?? null
        }
      } catch { /* Fehler nicht kritisch — Timezone-Fallback greift */ }
    }

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

    // ── 4b. Szenen-Kürzel aus production_app_settings ─────────────────────────
    const kuerzelRes = await client.query(
      `SELECT value FROM production_app_settings WHERE production_id = $1 AND key = 'scene_kuerzel'`,
      [w.produktion_id]
    )
    let sceneKuerzel: Record<string, string> = { ...DEFAULT_SCENE_KUERZEL }
    if (kuerzelRes.rows.length > 0) {
      try {
        const v = kuerzelRes.rows[0].value
        const parsed = typeof v === 'string' ? JSON.parse(v) : v
        sceneKuerzel = { ...DEFAULT_SCENE_KUERZEL, ...parsed }
      } catch { /* defaults */ }
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
    const druckauswahl = buildDruckauswahl(options)
    const now = new Date()
    const tz = resolveTimezone(produktionLand, options.userTimezone)
    const tzOpts = { timeZone: tz } as const
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
      aktuelles_datum:      now.toLocaleDateString('de-DE', { ...tzOpts, day: '2-digit', month: '2-digit', year: 'numeric' }),
      aktuelles_jahr:       new Intl.DateTimeFormat('de-DE', { ...tzOpts, year: 'numeric' }).format(now),
      aktuelles_uhrzeit:    now.toLocaleTimeString('de-DE', { ...tzOpts, hour: '2-digit', minute: '2-digit' }),
      aktuelles_uhrzeit_utc: now.toLocaleTimeString('de-DE', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' }) + '\u202f(UTC)',
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
      druckauswahl:           druckauswahl,
      episode_terminus:       episodeTerminus,
    }

    // ── 7. Geordnete Pre-/Post-Sektionen aufbauen ─────────────────────────────
    setProgress(30)

    /** Rendert ein einzelnes OrderedExportItem zu HTML */
    async function renderOrderedItem(item: OrderedExportItem): Promise<string | null> {
      if (!item.enabled) return null
      if (item.type === 'notiz') {
        // Einzelne Notiz-Zeile aus dem aktuellen Drehbuch (szeneId = dokument_szenen.id)
        if (item.szeneId) {
          const szRes = await client.query<SceneRow>(
            `SELECT scene_nummer, scene_nummer_suffix, ort_name, int_ext, tageszeit, spieltag,
                    stoppzeit_sek, content, zusammenfassung, sort_order, format, sondertyp,
                    scene_identity_id, spielzeit
             FROM dokument_szenen WHERE id = $1 AND geloescht = false`,
            [item.szeneId]
          )
          if (!szRes.rows.length) return null
          const row = szRes.rows[0]
          const heading = item.label
            ? `<h2 style="font-size:12pt;font-weight:bold;margin:0 0 8pt;letter-spacing:0.02em">${esc(item.label)}</h2>`
            : ''
          const content = row.content ? renderDoc(row.content, fmtById, fmtByName, ctx) : ''
          return `${heading}${content}`
        }
        // Gesamte Notiz-Werkstufe (id = werkstufe_id)
        if (item.id) {
          const nszRes = await client.query<SceneRow>(
            `SELECT scene_nummer, scene_nummer_suffix, ort_name, int_ext, tageszeit, spieltag,
                    stoppzeit_sek, content, zusammenfassung, sort_order, format, sondertyp,
                    scene_identity_id, spielzeit
             FROM dokument_szenen
             WHERE werkstufe_id = $1 AND geloescht = false
             ORDER BY sort_order`,
            [item.id]
          )
          if (!nszRes.rows.length) return null
          const label = item.label ?? ''
          const heading = label
            ? `<h2 style="font-size:12pt;font-weight:bold;margin:0 0 8pt;letter-spacing:0.02em">${esc(label)}</h2>`
            : ''
          return `${heading}${renderNotizWerkstufe(nszRes.rows, fmtById, fmtByName, ctx)}`
        }
      }
      if (item.type === 'statistik' && item.statistikConfig) {
        return renderStatistikHtml(item.statistikConfig)
      }
      return null
    }

    // Backward compat: Legacy notizWerkstufIds → in preItems umwandeln wenn kein preItems gesetzt
    const resolvedPreItems: OrderedExportItem[] = options.preItems ?? (options.notizWerkstufIds ?? []).map(id => ({
      type: 'notiz' as const, id, enabled: true
    }))
    const resolvedPostItems: OrderedExportItem[] = options.postItems ?? []

    const preSections: string[] = []
    for (const item of resolvedPreItems) {
      const html = await renderOrderedItem(item)
      if (html) preSections.push(html)
    }
    const postSections: string[] = []
    for (const item of resolvedPostItems) {
      const html = await renderOrderedItem(item)
      if (html) postSections.push(html)
    }

    // ── 8. Hauptszenen laden ──────────────────────────────────────────────────
    setProgress(40)
    const szRes = await client.query<SceneRow>(
      `SELECT scene_nummer, scene_nummer_suffix, ort_name, int_ext, tageszeit, spieltag,
              stoppzeit_sek, content, zusammenfassung, sort_order, format, sondertyp,
              scene_identity_id, spielzeit
       FROM dokument_szenen
       WHERE werkstufe_id = $1 AND geloescht = false
       ORDER BY sort_order`,
      [werkstufId]
    )

    // Rollen pro Szene (für rollen-Chip + filterRollen)
    const charRes = await client.query<{ scene_identity_id: string; rollen: string[] }>(
      `SELECT sc.scene_identity_id,
              array_agg(c.name ORDER BY c.name) AS rollen
       FROM scene_characters sc
       JOIN characters c ON c.id = sc.character_id
       LEFT JOIN character_kategorien ck ON ck.id = sc.kategorie_id
       WHERE sc.werkstufe_id = $1 AND COALESCE(ck.typ, 'rolle') <> 'komparse'
       GROUP BY sc.scene_identity_id`,
      [werkstufId]
    )
    const charMap = new Map<string, string[]>(
      charRes.rows.map(r => [r.scene_identity_id, r.rollen])
    )

    // Komparsen pro Szene (für filterKomparsen)
    let komparsenIds = new Set<string>()
    if (options.filterKomparsen?.length) {
      const kompRes = await client.query<{ scene_identity_id: string }>(
        `SELECT DISTINCT sc.scene_identity_id
         FROM scene_characters sc
         JOIN characters c ON c.id = sc.character_id
         LEFT JOIN character_kategorien ck ON ck.id = sc.kategorie_id
         WHERE sc.werkstufe_id = $1 AND ck.typ = 'komparse'
           AND sc.scene_identity_id IS NOT NULL
           AND c.name = ANY($2)`,
        [werkstufId, options.filterKomparsen]
      )
      komparsenIds = new Set(kompRes.rows.map(r => r.scene_identity_id))
    }

    const allRows = szRes.rows.map(s => ({
      ...s,
      rollen: s.scene_identity_id ? (charMap.get(s.scene_identity_id) ?? []) : [],
    }))

    // ── Szenenblock + Filter ──────────────────────────────────────────────────
    // Block-Grenze: ALLE Rows mit scene_nummer != null (unabhängig vom Format)
    // format='notiz' + scene_nummer=null → werden nur über preItems/postItems eingebunden
    const szSpecs = parseSzenenAuswahl(options.szenenAuswahl)
    const blockDefiningRows = allRows.filter(s => s.scene_nummer != null)

    let mainScenes: typeof allRows

    if (blockDefiningRows.length === 0) {
      // Keine Szenen → alle Rows direkt übernehmen
      mainScenes = allRows
    } else {
      const minSort = Math.min(...blockDefiningRows.map(s => s.sort_order))
      const maxSort = Math.max(...blockDefiningRows.map(s => s.sort_order))

      // Szenenblock: alle Rows mit sort_order in [minSort, maxSort]
      const sceneBlockRows = allRows.filter(s => s.sort_order >= minSort && s.sort_order <= maxSort)

      // Filter nur auf echte Szenen anwenden (format !== 'notiz', scene_nummer != null)
      let filteredReal = sceneBlockRows.filter(s => s.format !== 'notiz' && s.scene_nummer != null)
      if (szSpecs) {
        filteredReal = filteredReal.filter(s =>
          szSpecs.some(sp =>
            s.scene_nummer === sp.nr &&
            (s.scene_nummer_suffix ?? '').toUpperCase() === sp.suffix
          )
        )
      }
      if (options.filterRollen?.length) {
        const rollenSet = new Set(options.filterRollen)
        filteredReal = filteredReal.filter(s => s.rollen.some(r => rollenSet.has(r)))
      }
      if (options.filterMotive?.length) {
        const motivSet = new Set(options.filterMotive.map(m => m.toLowerCase()))
        filteredReal = filteredReal.filter(s => s.ort_name && motivSet.has(s.ort_name.toLowerCase()))
      }
      if (options.filterKomparsen?.length) {
        filteredReal = filteredReal.filter(s => s.scene_identity_id && komparsenIds.has(s.scene_identity_id))
      }

      // Verankerte Notiz-Elemente im Block (format='notiz', scene_nummer != null):
      // behalten wenn ihre scene_nummer in der gefilterten Menge liegt
      const hasActiveFilter = !!(szSpecs || options.filterRollen?.length || options.filterMotive?.length || options.filterKomparsen?.length)
      const keptSceneNummern = new Set(filteredReal.map(s => s.scene_nummer))
      const filteredNotizInBlock = sceneBlockRows.filter(s => {
        if (s.format !== 'notiz' || s.scene_nummer == null) return false
        if (!hasActiveFilter) return true
        return keptSceneNummern.has(s.scene_nummer)
      })

      // Block sortiert zusammensetzen — freie Notiz-Elemente (scene_nummer=null) NICHT enthalten
      mainScenes = [...filteredReal, ...filteredNotizInBlock]
        .sort((a, b) => a.sort_order - b.sort_order)
    }

    setProgress(50)

    const isNotizDoc = w.typ === 'notiz'
    const hauptinhaltAktiv = options.hauptinhaltAktiv !== false  // default: true

    let mainHtml = ''
    if (hauptinhaltAktiv) {
      mainHtml = isNotizDoc
        ? renderNotizWerkstufe(szRes.rows, fmtById, fmtByName, ctx)
        : renderMainScenes(mainScenes, fmtById, fmtByName, ctx, sceneKuerzel, szenenkopfTemplate, w.folge_nummer, bodyMargins.links / 10)
    }

    // ── 9. Body-HTML zusammenbauen ────────────────────────────────────────────
    const wmPayload = buildPayload(userId, werkstufId)
    const wmHidden  = `<span aria-hidden="true" style="position:absolute;left:-9999px;font-size:0;line-height:0">${encodeWatermark(wmPayload)}</span>`

    // Alle Sektionen in Reihenfolge: preSections → Hauptinhalt → postSections
    // Jede Sektion bekommt einen page-break-before (außer der allerersten)
    const allSections: string[] = [
      ...preSections,
      ...(mainHtml ? [mainHtml] : []),
      ...postSections,
    ]

    let bodyHtml = wmHidden + '\n'
    if (allSections.length === 0) {
      bodyHtml += '<div style="color:#888;font-size:10pt">Kein Inhalt für diesen Export ausgewählt.</div>'
    } else {
      bodyHtml += allSections.map((s, i) =>
        i === 0 ? s : `<div style="page-break-before:always">\n${s}\n</div>`
      ).join('\n')
    }

    // ── 10. Titel + vollständige HTML-Seite ───────────────────────────────────
    const title = buildExportFilename(
      { typ: w.typ, version_nummer: w.version_nummer, label: w.label, stand_datum: w.stand_datum },
      { folge_nummer: w.folge_nummer, folgen_titel: w.folgen_titel },
      { titel: w.produktion_titel },
      episodeTerminus,
      'pdf'
    ).replace(/\.pdf$/i, '')

    const html = buildPdfHtml({
      title, bodyHtml, kzFz, ctx, bodyMargins,
      localFontCss: loadLocalFontCss(),
      // Preview: KZ/FZ als position:fixed im Browser sichtbar; PDF: Puppeteer übernimmt
      puppeteerHeaderFooter: !previewMode,
    })

    // ── KZ/FZ für Puppeteer displayHeaderFooter vorberechnen ──────────────────
    const hmt = 10, hmb = 10
    const bml = bodyMargins.links
    const bmr = bodyMargins.rechts
    // Header-Padding immer mit Body-Rändern ausrichten — nicht aus KZ/FZ seiten_layout (könnte veraltet sein)
    const hml = bml
    const hmr = bmr
    const headerHtml = kzFz?.kopfzeile_aktiv && kzFz.kopfzeile_content
      ? renderZeilenContent(kzFz.kopfzeile_content, ctx)
      : ''
    const footerHtml = kzFz?.fusszeile_aktiv && kzFz.fusszeile_content
      ? renderZeilenContent(kzFz.fusszeile_content, ctx)
      : ''
    const hasHdr = headerHtml.trim().length > 0
    const hasFtr = footerHtml.trim().length > 0
    const pageMarginTop    = hasHdr ? Math.max(bodyMargins.oben,  hmt + 14 + 4) : bodyMargins.oben
    const pageMarginBottom = hasFtr ? Math.max(bodyMargins.unten, hmb + 10 + 4) : bodyMargins.unten

    return { html, title, headerHtml, footerHtml, hmt, hmb, hml, hmr, pageMarginTop, pageMarginBottom, bml, bmr }

  } finally {
    client.release()
  }
}

/** Gibt das vollständige HTML für die Browser-Vorschau zurück (kein Puppeteer).
 *  KZ/FZ werden als position:fixed gerendert (sichtbar im Browser). */
export async function assemblePreviewHtml(
  input: PdfAssemblerInput,
  setProgress: (p: number) => void
): Promise<string> {
  const { html } = await assembleHtml(input, setProgress, true)
  return html
}

export async function assemblePdf(
  input: PdfAssemblerInput,
  setProgress: (p: number) => void
): Promise<JobResult> {
  const { html, title, headerHtml, footerHtml, hmt, hmb, hml, hmr, pageMarginTop, pageMarginBottom, bml, bmr } =
    await assembleHtml(input, setProgress)

  // ── 11. Puppeteer → PDF ───────────────────────────────────────────────────
  setProgress(55)

  // Admin-Wasserzeichen-Einstellungen laden
  const wmSettings = await loadWatermarkSettings()

  // Warm-Pool: bestehende Browser-Instanz wiederverwenden (kein Kaltstart)
  const browser = await getWarmBrowser()
  setProgress(60)

  // ph-seite / ph-seiten-gesamt → Puppeteer-eigene pageNumber/totalPages-Klassen
  const toPuppeteerTpl = (raw: string) =>
    raw
      .replace(/<span class="ph-seite"><\/span>/g, '<span class="pageNumber" style="font-size:9pt"></span>')
      .replace(/<span class="ph-seiten-gesamt"><\/span>/g, '<span class="totalPages" style="font-size:9pt"></span>')

  // Minimaler CSS-Reset für das Puppeteer-Template-Rendering
  const tplReset = '<style>*{margin:0;padding:0;box-sizing:border-box}p{line-height:1.3}</style>'

  // Sichtbares Diagonal-Wasserzeichen (per-Seite overlay via headerTemplate)
  // position:absolute + overflow:visible → überlagert den gesamten Seitenbereich ohne Platz zu belegen
  const wmOverlay = wmSettings.aktiv
    ? `<div style="position:absolute;top:0;left:0;width:210mm;height:297mm;display:flex;align-items:center;justify-content:center;opacity:${wmSettings.opazitaet / 100};pointer-events:none;overflow:hidden;z-index:9999">` +
      `<span style="font-size:80px;font-weight:900;color:#000;font-family:Arial,sans-serif;white-space:nowrap;transform:rotate(-45deg);display:block">` +
      wmSettings.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') +
      `</span></div>`
    : ''

  // headerTemplate: KZ (falls vorhanden) + Wasserzeichen-Overlay
  // Das Overlay ist position:absolute → nimmt keinen Platz ein, überlagert nur
  const headerTemplate = (headerHtml.trim() || wmOverlay)
    ? `${tplReset}<div style="position:relative;width:100%;height:${pageMarginTop}mm">${wmOverlay}${headerHtml.trim() ? `<div style="display:flex;flex-direction:column;justify-content:flex-start;padding:${hmt}mm ${hmr}mm 0 ${hml}mm;font-size:9pt;font-family:'Courier New',monospace;color:#333">${toPuppeteerTpl(headerHtml)}</div>` : ''}</div>`
    : '<div style="font-size:0"></div>'

  const footerTemplate = footerHtml.trim()
    ? `${tplReset}<div style="width:100%;height:${pageMarginBottom}mm;display:flex;flex-direction:column;justify-content:flex-end;padding:0 ${hmr}mm ${hmb}mm ${hml}mm;font-size:9pt;font-family:'Courier New',monospace;color:#333">${toPuppeteerTpl(footerHtml)}</div>`
    : '<div style="font-size:0"></div>'

  const pdfBookmarks = input.options.pdfBookmarks === true

  let pdfBytes: Uint8Array
  // Kein try/finally mit browser.close() — Warm-Pool behält die Instanz
  const page = await browser.newPage()
  try {
    // 'load' statt 'networkidle0': lokale Fonts brauchen kein Netzwerk-Idle
    await page.setContent(html, { waitUntil: 'load', timeout: 60_000 })
    setProgress(75)
    pdfBytes = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate,
      footerTemplate,
      // PDF-Lesezeichen/Inhaltsverzeichnis — erfordert H-Tag-Hierarchie im HTML
      outline: pdfBookmarks,
      tagged: pdfBookmarks,
      // margin übernimmt Seitenränder — kein @page-margin im HTML nötig
      margin: {
        top:    `${pageMarginTop}mm`,
        bottom: `${pageMarginBottom}mm`,
        left:   `${bml}mm`,
        right:  `${bmr}mm`,
      },
    })
    setProgress(90)
  } finally {
    await page.close()  // Nur den Tab schließen, Browser bleibt warm
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
