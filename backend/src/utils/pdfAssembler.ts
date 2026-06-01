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
import { request as httpsRequest } from 'https'
import { request as httpRequest } from 'http'
import { PDFDocument, PDFName, PDFNumber, PDFString, PDFNull, PDFHexString } from 'pdf-lib'
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
import { renderStatistikHtml, renderOnlinerHtml, StatistikFormatConfig, OnlinerFormatConfig, StatistikExportConfig } from './statistikHtmlRenderer'

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

// ── Externe Bilder → Base64 inlinen (für Puppeteer header/footer template) ───
// Puppeteer lädt keine externen URLs in headerTemplate/footerTemplate.
// Diese Funktion ersetzt http(s)://... src-Attribute durch data URIs.

async function inlineExternalImages(html: string): Promise<string> {
  const regex = /<img([^>]*)\ssrc="(https?:\/\/[^"]+)"([^>]*\/?>)/gi
  const matches = [...html.matchAll(regex)]
  for (const match of matches) {
    try {
      const b64 = await fetchAsBase64(match[2])
      if (b64) html = html.replace(match[0], `<img${match[1]} src="${b64}"${match[3]}`)
    } catch { /* keep original URL on error */ }
  }
  return html
}

function fetchAsBase64(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const req = url.startsWith('https') ? httpsRequest : httpRequest
    req(url, (res) => {
      if (!res.statusCode || res.statusCode >= 400) { resolve(null); return }
      const ct = res.headers['content-type'] ?? 'image/png'
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => resolve(`data:${ct};base64,${Buffer.concat(chunks).toString('base64')}`))
      res.on('error', () => resolve(null))
    }).on('error', () => resolve(null)).setTimeout(5000, function(this: any) { this.destroy(); resolve(null) }).end()
  })
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

/** HTML-Attribut-Wert escapen (zusätzlich: " → &quot;) */
function escAttr(s: string): string {
  return esc(s).replace(/"/g, '&quot;')
}

/**
 * Fügt einer bereits generierten PDF-Datei (als Uint8Array) ein Inhaltsverzeichnis
 * (PDF-Outline/Bookmarks) hinzu. Verwendet pdf-lib für die Post-Processing-Schicht,
 * da Chromes outline:true + h2-Tags in der Praxis nicht zuverlässig funktioniert.
 *
 * bookmarks: Array von { label, pageIndex } — pageIndex 0-basiert.
 * Gibt die modifizierten PDF-Bytes zurück.
 */
async function addPdfOutline(
  inputBytes: Uint8Array,
  bookmarks: { label: string; pageIndex: number }[]
): Promise<Uint8Array> {
  if (bookmarks.length === 0) return inputBytes

  const pdfDoc = await PDFDocument.load(inputBytes)
  const ctx    = pdfDoc.context
  const pageCount = pdfDoc.getPageCount()
  const pageRefs  = pdfDoc.getPages().map(p => p.ref)

  // Outline-Root-Ref vorab reservieren, damit Items darauf zeigen können
  const outlineRootRef = ctx.nextRef()

  // Bookmark-Items erstellen (als indirekte Objekte)
  const itemRefs = bookmarks.map(bm => {
    const pi = Math.max(0, Math.min(bm.pageIndex, pageCount - 1))
    const ref = ctx.nextRef()
    // Ziel: Seitenanfang (XYZ mit null = aktuelle Position beibehalten)
    const destArray = ctx.obj([pageRefs[pi], PDFName.of('XYZ'), PDFNull, PDFNull, PDFNumber.of(0)])
    ctx.assign(ref, ctx.obj({
      Title:  PDFHexString.fromText(bm.label),
      Parent: outlineRootRef,
      Dest:   destArray,
    }))
    return ref
  })

  // /Prev + /Next-Verlinkung zwischen Items setzen
  for (let i = 0; i < itemRefs.length; i++) {
    const dict = ctx.lookup(itemRefs[i])
    if (dict && 'set' in dict) {
      const d = dict as import('pdf-lib').PDFDict
      if (i > 0) d.set(PDFName.of('Prev'), itemRefs[i - 1])
      if (i < itemRefs.length - 1) d.set(PDFName.of('Next'), itemRefs[i + 1])
    }
  }

  // Outline-Root anlegen
  ctx.assign(outlineRootRef, ctx.obj({
    Type:  PDFName.of('Outlines'),
    Count: PDFNumber.of(bookmarks.length),
    First: itemRefs[0],
    Last:  itemRefs[itemRefs.length - 1],
  }))

  // /Outlines im PDF-Katalog registrieren + "Bookmarks-Panel beim Öffnen" aktivieren
  pdfDoc.catalog.set(PDFName.of('Outlines'),     outlineRootRef)
  pdfDoc.catalog.set(PDFName.of('PageMode'),     PDFName.of('UseOutlines'))

  const saved = await pdfDoc.save()
  return saved
}

/**
 * Liest die native PDF-Outline (generiert von Puppeteer outline:true) aus einem
 * bereits gerenderten PDF aus. Wird für den Titelseite-Split-Pfad benötigt:
 * Outline aus Hauptinhalt extrahieren → Seitennummern um Titelseiten-Anzahl versetzen.
 */
async function extractPdfOutline(
  pdfBytes: Uint8Array
): Promise<{ label: string; pageIndex: number }[]> {
  const doc  = await PDFDocument.load(pdfBytes)
  const ctx  = doc.context
  const pageRefs = doc.getPages().map(p => p.ref)
  const result: { label: string; pageIndex: number }[] = []

  const outlinesObj = doc.catalog.get(PDFName.of('Outlines'))
  if (!outlinesObj) return result

  const outlineRoot = ctx.lookup(outlinesObj) as any
  if (!outlineRoot?.get) return result

  let itemRef: any = outlineRoot.get(PDFName.of('First'))
  while (itemRef) {
    const item = ctx.lookup(itemRef) as any
    if (!item?.get) break

    // Titel (PDF-String oder Hex-String)
    const titleObj = item.get(PDFName.of('Title'))
    let label = (titleObj instanceof PDFString || titleObj instanceof PDFHexString)
      ? titleObj.decodeText()
      : ''

    // Workaround für einen Chromium-Bug (outline:true): Bei Lesezeichen-Titeln, die das Zeichen
    // ß (U+00DF) enthalten, speichert Chrome den Titel manchmal als exakt doppelten String
    // (z.B. "4402.1 Außendreh...4402.1 Außendreh..."). Erkennung: Länge gerade UND
    // erste Hälfte == zweite Hälfte → nur erste Hälfte verwenden.
    if (label.length > 0 && label.length % 2 === 0) {
      const half = label.length / 2
      if (label.slice(0, half) === label.slice(half)) label = label.slice(0, half)
    }

    // Dest: [pageRef, /XYZ, x, y, zoom]
    let pageIndex = 0
    const dest = item.get(PDFName.of('Dest'))
    if (dest?.array?.length > 0) {
      const pageRefObj = dest.array[0]
      if (pageRefObj && 'objectNumber' in pageRefObj) {
        const idx = pageRefs.findIndex(r => r.objectNumber === pageRefObj.objectNumber)
        if (idx >= 0) pageIndex = idx
      }
    }

    if (label) result.push({ label, pageIndex })
    itemRef = item.get(PDFName.of('Next'))
  }
  return result
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
  scene_heading:  'Standard',
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
  vorlage_name:        string | null
}

// ── Szenenkopf-Template-Renderer ──────────────────────────────────────────────

const DEFAULT_SCENE_KUERZEL: Record<string, string> = {
  // int/ext
  int: 'I', ext: 'E',
  // Tageszeiten (DB-Werte uppercase → toLowerCase vor Lookup)
  tag: 'T', morgen: 'M', abend: 'A', nacht: 'N',
  daemmerung: 'D', dämmerung: 'D',
}

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
      // Letzte right-aligned Zelle bei 3+ Segmenten: auf content-width schrumpfen,
      // damit die vorherige flex:1-Zelle (z.B. Motiv) den Großteil des Platzes bekommt.
      // Bei nur 2 Segmenten (z.B. Stoppzeit-Zeile) bleibt flex:1, damit die Zelle
      // die volle verbleibende Breite nutzt und den Inhalt rechtsbündig ausrichtet.
      cellStyle = (i === segments.length - 1 && segments.length > 2)
        ? `flex:0 0 auto;text-align:right;padding-left:8pt`
        : `flex:1;text-align:right`
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
/** Baut den Bookmark-Label-Text für eine Szene */
function buildBookmarkLabel(scene: SceneRow, folgeNummer: number, kuerzel: Record<string, string>): string {
  const szNr = scene.scene_nummer != null
    ? `${scene.scene_nummer}${scene.scene_nummer_suffix ?? ''}` : '?'
  const ie = (scene.int_ext ?? '').toLowerCase()
  const tz = (scene.tageszeit ?? '').toLowerCase()
  const ieKurz = kuerzel[ie] ?? DEFAULT_SCENE_KUERZEL[ie] ?? (scene.int_ext?.charAt(0) ?? '')
  const tzKurz = kuerzel[tz] ?? DEFAULT_SCENE_KUERZEL[tz] ?? (scene.tageszeit ? scene.tageszeit.charAt(0).toUpperCase() : '')
  return [
    `${folgeNummer}.${szNr}`,
    scene.ort_name     ? esc(scene.ort_name) : '',
    ieKurz             ? esc(ieKurz)         : '',
    tzKurz             ? esc(tzKurz)         : '',
    scene.spieltag != null ? String(scene.spieltag) : '',
    scene.rollen?.length   ? scene.rollen.map(r => esc(r)).join(' ') : '',
  ].filter(Boolean).join(' ')
}

function renderSzenenkopf(
  templateJson: any,
  scene: SceneRow,
  folgeNummer: number,
  pageBreakBefore = false,
  bodyMarginLeftCm = 0,
  kuerzel: Record<string, string> = {},
  synopseMode = false
): string {
  const pbStyle = pageBreakBefore ? 'page-break-before:always;' : ''

  // <h2> statt <p>: Puppeteer outline:true liest h2-Tags für native PDF-Lesezeichen.
  // CSS-Reset (h2 { all: unset; display: block }) in exportAssembler sorgt für
  // identisches visuelles Rendering wie bisher.
  if (!templateJson) {
    const num  = scene.scene_nummer != null ? `${scene.scene_nummer}${scene.scene_nummer_suffix ?? ''}` : '?'
    const parts = [`SZ\u00a0${num}`]
    if (scene.ort_name)  parts.push(esc(scene.ort_name))
    if (scene.int_ext)   parts.push(esc(scene.int_ext))
    if (scene.tageszeit) parts.push(esc(scene.tageszeit))
    return `<h2 style="${pbStyle}font-weight:bold;text-transform:uppercase;margin:14pt 0 4pt;line-height:1;page-break-after:avoid">${parts.join(' \u2014 ')}</h2>`
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

  // Template-Fall: unsichtbares <h2> für die PDF-Outline (weißer Text auf weißem Hintergrund).
  // Chrome's generateDocumentOutline ignoriert opacity:0 und height:0 — aber weißer Text
  // auf weißem Hintergrund wird erkannt, weil das Element gerendert wird (layout ≠ 0).
  const label = buildBookmarkLabel(scene, folgeNummer, kuerzel)
  // Im Synopsen-Modus kein page-break-after:avoid auf dem Content-Div:
  // Dort folgt die nächste Szene (kein Drehbuch-Content), und das avoid
  // würde Chrome dazu bringen, Szenen zusammenzuhalten und Seiten vorzeitig umzubrechen.
  const contentDivStyle = synopseMode
    ? 'margin-top:14pt;margin-bottom:4pt;break-inside:avoid;page-break-inside:avoid'
    : 'margin-top:14pt;margin-bottom:4pt;page-break-after:avoid;break-inside:avoid;page-break-inside:avoid'
  return `<h2 style="${pbStyle}color:white;font-size:1pt;line-height:1;margin:0;padding:0;page-break-after:avoid">${label}</h2>` +
         `<div style="${contentDivStyle}">${parts.join('\n')}</div>`
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
    let headHtml: string
    if (scene.format !== 'notiz') {
      headHtml = renderSzenenkopf(szenenkopfTemplate, scene, folgeNummer, index > 0, bodyMarginLeftCm, kuerzel)
    } else {
      // Notiz-Format: unsichtbares <h2> für PDF-Lesezeichen + sichtbarer Abschnittstitel
      const pbStyle = index > 0 ? 'page-break-before:always;' : ''
      if (scene.vorlage_name) {
        // Unsichtbares h2 für Chrome generateDocumentOutline (PDF-Lesezeichen)
        const bookmarkH2 = `<h2 style="${pbStyle}color:white;font-size:1pt;line-height:1;margin:0;padding:0;page-break-after:avoid">${esc(scene.vorlage_name)}</h2>`
        // Sichtbarer Abschnittstitel
        const visibleDiv = `<div style="font-size:10pt;font-weight:bold;margin:0 0 6pt;letter-spacing:0.02em">${esc(scene.vorlage_name)}</div>`
        headHtml = `${bookmarkH2}${visibleDiv}`
      } else {
        headHtml = `<div style="${pbStyle}height:0;overflow:hidden"></div>`
      }
    }
    const bodyHtml = scene.content ? renderDoc(scene.content, fmtById, fmtByName, ctx) : ''
    return `${headHtml}\n${bodyHtml}`
  }).join('\n')
}

/**
 * Rendert alle Szenenköpfe der angegebenen Folgen im Format des konfigurierten
 * Szenenkopf-Templates — für den Synopsen-Export.
 */
async function buildSynopsenHtml(
  client: any,
  config: StatistikExportConfig,
  szenenkopfTemplate: any,
  kuerzel: Record<string, string>,
  bodyMarginLeftCm: number,
  pageContentHeightMm = 257  // A4 minus Standardränder oben/unten
): Promise<string> {
  const { folge_ids: folgeIds } = config
  if (!folgeIds.length) {
    return `<div style="color:#c00;font-family:sans-serif">Synopsen: Keine Folge-IDs angegeben.</div>`
  }

  const folgeRes = await client.query(
    `SELECT f.id, f.folge_nummer, f.folgen_titel, f.produktion_id FROM folgen f WHERE f.id = $1`,
    [folgeIds[0]]
  )
  if (!folgeRes.rows.length) {
    return `<div style="color:#c00;font-family:sans-serif">Synopsen: Folge ${folgeIds[0]} nicht gefunden.</div>`
  }
  const folge = folgeRes.rows[0]

  let wsIds: string[] = []
  for (const typ of ['drehbuch', 'storyline']) {
    const r = await client.query(
      `SELECT DISTINCT ON (w.folge_id) w.id
       FROM werkstufen w
       JOIN folgen f ON f.id = w.folge_id
       WHERE f.id = ANY($1::int[]) AND w.typ = $2 AND f.produktion_id = $3
       ORDER BY w.folge_id, w.version_nummer DESC`,
      [folgeIds, typ, folge.produktion_id]
    )
    if (r.rows.length) { wsIds = r.rows.map((row: any) => row.id); break }
  }

  if (!wsIds.length) {
    return `<div style="color:#888;font-family:sans-serif;font-size:9pt">Keine Werkstufe für diese Folge verfügbar.</div>`
  }

  const scenesRes = await client.query(
    `SELECT ds.scene_nummer, ds.scene_nummer_suffix, ds.ort_name, ds.int_ext,
            ds.tageszeit, ds.spieltag, ds.stoppzeit_sek, ds.zusammenfassung,
            ds.spielzeit, ds.scene_identity_id, f.folge_nummer
     FROM dokument_szenen ds
     JOIN werkstufen w ON w.id = ds.werkstufe_id
     JOIN folgen f ON f.id = w.folge_id
     WHERE ds.werkstufe_id = ANY($1::uuid[])
       AND ds.geloescht = false
       AND COALESCE(ds.format, 'storyline') != 'notiz'
     ORDER BY f.folge_nummer, ds.scene_nummer, COALESCE(ds.scene_nummer_suffix, '')`,
    [wsIds]
  )

  if (!scenesRes.rows.length) {
    return `<div style="color:#888;font-size:9pt">Keine Szenen gefunden.</div>`
  }

  // Rollen pro Szene (für rollen-Chip im Szenenkopf-Template)
  const charRes = await client.query(
    `SELECT sc.scene_identity_id,
            array_agg(DISTINCT c.name ORDER BY c.name) AS rollen
     FROM scene_characters sc
     JOIN characters c ON c.id = sc.character_id
     LEFT JOIN character_kategorien ck ON ck.id = sc.kategorie_id
     WHERE sc.werkstufe_id = ANY($1::uuid[]) AND COALESCE(ck.typ, 'rolle') <> 'komparse'
     GROUP BY sc.scene_identity_id`,
    [wsIds]
  )
  const charMap = new Map<string, string[]>(
    charRes.rows.map((r: any) => [r.scene_identity_id, r.rollen])
  )

  // ── Server-seitige Seitenumbruch-Berechnung ────────────────────────────────
  // Statt CSS break-inside:avoid (Chrome 130 Bug bei Tabellen) oder DOM-Messung
  // (fragile Puppeteer-Koordinaten) zählen wir die Zeilen jedes Szenenkopfes aus
  // dem gerenderten HTML und berechnen Seitenumbrüche vorab.
  //
  // Jede Zeile entspricht einem <p>-Element (einspaltig) oder <div style="display:flex">
  // (mehrspaltig mit Tab-Stops) aus renderSKParagraph, plus <hr>-Elemente.
  // Standard: font-size 11pt × line-height 1.2 = 13.2pt/Zeile + 18pt Randabstände pro Szenenkopf.
  //
  // Kein CSS break-inside:avoid auf der äußeren <div> (Backup für Chrome) + expliziter
  // page-break-before wenn die Seite voll ist (primärer Mechanismus).

  const LINE_HEIGHT_PT = 13.2   // 11pt × 1.2 (renderSKParagraph-Defaults)
  const HEAD_MARGIN_PT = 18     // 14pt margin-top + 4pt margin-bottom
  const pageHeightPt   = Math.max(100, pageContentHeightMm) * (72 / 25.4)
  let   accumPt        = 0
  const parts: string[] = []

  for (const row of scenesRes.rows) {
    const sceneRow: SceneRow = {
      scene_nummer:        row.scene_nummer,
      scene_nummer_suffix: row.scene_nummer_suffix,
      ort_name:            row.ort_name,
      int_ext:             row.int_ext,
      tageszeit:           row.tageszeit,
      spieltag:            row.spieltag,
      stoppzeit_sek:       row.stoppzeit_sek,
      content:             null,
      zusammenfassung:     row.zusammenfassung,
      sort_order:          0,
      format:              null,
      sondertyp:           null,
      scene_identity_id:   row.scene_identity_id,
      rollen:              row.scene_identity_id ? (charMap.get(row.scene_identity_id) ?? []) : [],
      spielzeit:           row.spielzeit,
      vorlage_name:        null,
    }
    const html = renderSzenenkopf(szenenkopfTemplate, sceneRow, row.folge_nummer, false, bodyMarginLeftCm, kuerzel, true)
    if (!html) continue

    // Zeilen zählen: <p ...> = einspaltige Zeile, display:flex = mehrspaltige Zeile, <hr = Trennlinie
    const lineCount = Math.max(1,
      (html.match(/<p /g)              ?? []).length +
      (html.match(/display:flex/g)     ?? []).length +
      (html.match(/<hr /g)             ?? []).length
    )

    // Zusammenfassung (Oneliner) umbrechen sich in der flex:1-Spalte — jede zusätzliche
    // Zeile muss zur Höhenschätzung addiert werden, damit der server-seitige Seitenumbruch
    // korrekt sitzt und Chrome nicht mitten im Szenenkopf umbrechen muss.
    // Verfügbare Breite: Seiteninhalt (21cm - 2×bml) abzüglich der festen ersten Spalte
    // (TabStop 0 bei 5cm → 5-bml cm). Zeichen je Zeile: 11pt Courier Prime ≈ 0.233cm/Zeichen.
    const onelinerColCm = Math.max(5,
      (21.0 - 2 * bodyMarginLeftCm) - Math.max(0, 5.0 - bodyMarginLeftCm)
    )
    const charsPerLine = Math.max(40, Math.floor(onelinerColCm / 0.233))
    const zfLen = (row.zusammenfassung ?? '').length
    const onelinerExtraLines = zfLen > 0 ? Math.max(0, Math.ceil(zfLen / charsPerLine) - 1) : 0

    const scenePt = HEAD_MARGIN_PT + (lineCount + onelinerExtraLines) * LINE_HEIGHT_PT

    // Neue Seite wenn Szenenkopf nicht mehr passt (aber nie ganz am Anfang)
    if (accumPt > 0 && accumPt + scenePt > pageHeightPt) {
      parts.push('<div style="page-break-before:always;height:0;overflow:hidden;margin:0;padding:0"></div>')
      accumPt = 0
    }
    accumPt += scenePt

    // Kein break-inside:avoid — der server-seitige page-break-before steuert die Paginierung.
    // break-inside:avoid würde Chrome dazu bringen, ganze Szenen auf die nächste Seite zu schieben.
    parts.push(`<div>${html}</div>`)
  }

  if (!parts.length) return '<div style="color:#888;font-size:9pt">Keine Szenen gefunden.</div>'
  return `<div>${parts.join('\n')}</div>`
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
  /** Separates HTML für ist_titelseite-Vorlagen (kein KZ/FZ, eigene Ränder) — null wenn keine */
  titelseiteHtml: string | null
  /** Seitenränder für den Titelseite-Render (aus dokument_vorlagen.seiten_layout) */
  titelseiteMargins: { oben: number; unten: number; links: number; rechts: number } | null
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

    // ── 1b. Produktionsdatenbank (Timezone + Export-Kontext-Felder) ───────────
    let produktionLand: string | null = null
    let prodDbCtx: {
      firma_name?: string | null; sender?: string | null; buero_adresse?: string | null
      staffelnummer?: number | null; drehzeitraum?: string | null
      block_label?: string | null; erster_block?: number | null; erste_folge?: number | null
      bloecke?: Array<{ folge_von: number; folge_bis: number; dreh_von: string; dreh_bis: string; team_index: number }> | null
    } = {}
    let sendedatumRaw: string | null = null
    if (w.produktion_db_id) {
      const PROD_DB_URL  = process.env.PROD_DB_URL  ?? 'http://127.0.0.1:3005'
      const INTERNAL_KEY = process.env.PRODUKTION_INTERNAL_SECRET ?? 'prod-internal-2026'
      try {
        const r = await fetch(
          `${PROD_DB_URL}/api/internal/productions/${w.produktion_db_id}/script-context`,
          { headers: { 'x-internal-key': INTERNAL_KEY } }
        )
        if (r.ok) {
          const data = await r.json() as typeof prodDbCtx & { land?: string | null }
          produktionLand = data.land ?? null
          prodDbCtx = data
        }
      } catch { /* Fehler nicht kritisch — Timezone-Fallback greift */ }
      // Sendedatum aus Ausstrahlungskalender
      if (w.folge_nummer) {
        try {
          const r = await fetch(
            `${PROD_DB_URL}/api/internal/productions/${w.produktion_db_id}/air-date?folge_nr=${w.folge_nummer}`,
            { headers: { 'x-internal-key': INTERNAL_KEY } }
          )
          if (r.ok) {
            const data = await r.json() as { air_date?: string | null }
            sendedatumRaw = data.air_date ?? null
          }
        } catch { /* kein Sendedatum */ }
      }
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

    // ── 4. Seitenränder: Fallback page_margin_mm → kzFz.seiten_layout (Single Source of Truth) ──
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
    // kzFz.seiten_layout überschreibt page_margin_mm — ist die maßgebliche Quelle nach v119
    if (kzFz?.seiten_layout) {
      const sl = kzFz.seiten_layout as Record<string, number | undefined>
      if (sl.margin_top    != null) bodyMargins.oben   = sl.margin_top
      if (sl.margin_bottom != null) bodyMargins.unten  = sl.margin_bottom
      if (sl.margin_left   != null) bodyMargins.links  = sl.margin_left
      if (sl.margin_right  != null) bodyMargins.rechts = sl.margin_right
    }

    // ── 4b. Szenen-Kürzel: INT/EXT aus production_app_settings, Tageszeiten aus tageszeit_stimmungen ──
    const kuerzelRes = await client.query(
      `SELECT value FROM production_app_settings WHERE production_id = $1 AND key = 'scene_kuerzel'`,
      [w.produktion_id]
    )
    // Nur INT/EXT-Kürzel aus scene_kuerzel übernehmen
    let sceneKuerzel: Record<string, string> = { int: DEFAULT_SCENE_KUERZEL.int, ext: DEFAULT_SCENE_KUERZEL.ext }
    if (kuerzelRes.rows.length > 0) {
      try {
        const v = kuerzelRes.rows[0].value
        const parsed = typeof v === 'string' ? JSON.parse(v) : v
        if (parsed.int) sceneKuerzel.int = parsed.int
        if (parsed.ext) sceneKuerzel.ext = parsed.ext
      } catch { /* defaults */ }
    }
    // Tageszeit-Kürzel aus tageszeit_stimmungen
    const stimmungenKuerzelRes = await client.query(
      `SELECT name, kuerzel FROM tageszeit_stimmungen WHERE production_id = $1`,
      [w.produktion_id]
    )
    if (stimmungenKuerzelRes.rows.length > 0) {
      for (const row of stimmungenKuerzelRes.rows) {
        if (row.name && row.kuerzel) sceneKuerzel[row.name.toLowerCase()] = row.kuerzel
      }
    } else {
      // Fallback wenn noch keine Stimmungen konfiguriert
      Object.assign(sceneKuerzel, { tag: 'T', morgen: 'M', abend: 'A', nacht: 'N', daemmerung: 'D', dämmerung: 'D' })
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
    const WERKSTUF_TYP_LABEL: Record<string, string> = {
      drehbuch:  'Drehbuch',
      storyline: 'Storyline',
      notiz:     'Notiz',
    }
    const toGermanShortDate = (d: Date | string): string => {
      // normalize: Date object or string → YYYY-MM-DD ISO
      const iso = (d instanceof Date ? d : new Date(d as string)).toISOString().slice(0, 10)
      const [year, month, day] = iso.split('-')
      return `${day}.${month}.${year.slice(2)}`
    }
    // Block-Nummer + Drehzeitraum aus bloecke-Array berechnen
    let berechneterBlock: string | null = null
    let berechneterDrehzeitraum: string | null = null
    if (prodDbCtx.bloecke?.length && w.folge_nummer) {
      const bloecke = prodDbCtx.bloecke
      // Einmalige Dreh-Perioden (unique dreh_von, sortiert), entsprechen Blocknummern
      const uniquePeriods = [...new Set(bloecke.map(b => b.dreh_von))].sort()
      const folgeBlock = bloecke.find(b => w.folge_nummer >= b.folge_von && w.folge_nummer <= b.folge_bis)
      if (folgeBlock) {
        const periodIndex = uniquePeriods.indexOf(folgeBlock.dreh_von)
        const blockNr = (prodDbCtx.erster_block ?? 1) + periodIndex
        const label = prodDbCtx.block_label ?? 'Block'
        berechneterBlock = `${label} ${blockNr}`
        // Alle Einträge dieser Periode (beide Teams) für den Zeitraum
        const periodeEntries = bloecke.filter(b => b.dreh_von === folgeBlock.dreh_von)
        const drehVon = new Date(Math.min(...periodeEntries.map(b => new Date(b.dreh_von).getTime())))
        const drehBis = new Date(Math.max(...periodeEntries.map(b => new Date(b.dreh_bis).getTime())))
        const fmtDate = (d: Date): string =>
          d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
        berechneterDrehzeitraum = `${fmtDate(drehVon)} – ${fmtDate(drehBis)}`
      }
    }

    const ctx: ExportContext = {
      produktion:           w.produktion_titel ?? '',
      staffel:              null,
      block:                berechneterBlock,
      folge:                w.folge_nummer,
      folgentitel:          w.folgen_titel,
      werkstufe:            WERKSTUF_TYP_LABEL[w.typ] ?? w.typ,
      fassung:              w.label,
      version:              w.version_nummer,
      stand_datum:          w.stand_datum
        ? toGermanShortDate(w.stand_datum)
        : toGermanShortDate(now),
      autor:                userName,
      regie:                null,
      firmenname:           prodDbCtx.firma_name ?? null,
      sender:               prodDbCtx.sender ?? null,
      buero_adresse:        prodDbCtx.buero_adresse ?? null,
      sendedatum:           sendedatumRaw ? toGermanShortDate(sendedatumRaw) : null,
      produktionszeitraum:  prodDbCtx.drehzeitraum ?? berechneterDrehzeitraum,
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
      buero_strasse:          prodDbCtx.buero_adresse
        ? (String(prodDbCtx.buero_adresse).split('\n')[0]?.trim() || null)
        : null,
      buero_plz_ort:          prodDbCtx.buero_adresse
        ? (String(prodDbCtx.buero_adresse).split('\n')[1]?.trim() || null)
        : null,
    }

    // ── 6b. Titelseite-Metadaten aus production_app_settings ─────────────────
    try {
      const metaRes = await client.query(
        `SELECT value FROM production_app_settings WHERE production_id = $1 AND key = 'titelseite_meta'`,
        [w.produktion_id]
      )
      if (metaRes.rows.length > 0) {
        const meta = typeof metaRes.rows[0].value === 'string'
          ? JSON.parse(metaRes.rows[0].value) : metaRes.rows[0].value
        if (meta.block)               ctx.block = meta.block
        if (meta.staffel)             ctx.staffel = meta.staffel
        if (meta.sendedatum)          ctx.sendedatum = meta.sendedatum
        if (meta.produktionszeitraum) ctx.produktionszeitraum = meta.produktionszeitraum
        if (meta.firmenname)          ctx.firmenname = meta.firmenname
        if (meta.sender)              ctx.sender = meta.sender
        if (meta.buero_adresse)       ctx.buero_adresse = meta.buero_adresse
        if (meta.buero_strasse)       ctx.buero_strasse = meta.buero_strasse
        if (meta.buero_plz_ort)       ctx.buero_plz_ort = meta.buero_plz_ort
        if (meta.firmen_adresse)      ctx.firmen_adresse = meta.firmen_adresse
        if (meta.rechtsform)          ctx.rechtsform = meta.rechtsform
        if (meta.handelsregister)     ctx.handelsregister = meta.handelsregister
        if (meta.ust_id)              ctx.ust_id = meta.ust_id
        if (meta.geschaeftsfuehrung)  ctx.geschaeftsfuehrung = meta.geschaeftsfuehrung
        if (meta.firmen_email)        ctx.firmen_email = meta.firmen_email
        if (meta.firmen_telefon)      ctx.firmen_telefon = meta.firmen_telefon
        if (meta.tel_produktion)      ctx.tel_produktion = meta.tel_produktion
      }
    } catch { /* meta nicht kritisch */ }

    // ── 7. Sonstige-Dokumente-Format laden ────────────────────────────────────
    let statistikFormat: StatistikFormatConfig | undefined
    let onlinerFormat: OnlinerFormatConfig | undefined
    try {
      const sfRes = await client.query(
        `SELECT value FROM production_app_settings WHERE production_id = $1 AND key = 'sonstige_dokumente_format'`,
        [w.produktion_id]
      )
      if (sfRes.rows.length) {
        const parsed = typeof sfRes.rows[0].value === 'string'
          ? JSON.parse(sfRes.rows[0].value) : sfRes.rows[0].value
        statistikFormat = parsed?.statistik ?? undefined
        onlinerFormat   = parsed?.onliner   ?? undefined
      }
    } catch { /* kein Format → Defaults */ }

    // ── 8. Geordnete Pre-/Post-Sektionen aufbauen ─────────────────────────────
    setProgress(30)

    // Nutzbare Seitenhöhe für server-seitige Seitenumbruch-Berechnung (Synopsen).
    // Gleiche Logik wie pageMarginTop/Bottom weiter unten — aber früh berechnet
    // damit buildSynopsenHtml die Werte nutzen kann (closure-Zugriff).
    const _sl0     = kzFz?.seiten_layout ?? {} as Record<string, number | undefined>
    const _hasKz   = !!(kzFz?.kopfzeile_aktiv && kzFz?.kopfzeile_content)
    const _hasFz   = !!(kzFz?.fusszeile_aktiv && kzFz?.fusszeile_content)
    const _pmt0    = _hasKz ? Math.max(bodyMargins.oben,  (_sl0.header_abstand_rand ?? 10) + 14 + 4) : bodyMargins.oben
    const _pmb0    = _hasFz ? Math.max(bodyMargins.unten, (_sl0.footer_abstand_rand ?? 10) + 10 + 4) : bodyMargins.unten
    const pageContentHeightMm = Math.max(100, 297 - _pmt0 - _pmb0)

    /** Rendert ein einzelnes OrderedExportItem zu HTML */
    async function renderOrderedItem(item: OrderedExportItem): Promise<string | null> {
      if (!item.enabled) return null
      if (item.type === 'notiz') {
        // Vorlage direkt (z.B. Titelseite direkt via ExportDrawer hinzugefügt, ohne szeneId)
        if (item.vorlageId) {
          const vorRes = await client.query<{ body_content: any }>(
            'SELECT body_content FROM dokument_vorlagen WHERE id = $1',
            [item.vorlageId]
          )
          if (!vorRes.rows[0]?.body_content) return null
          return renderPmJson(vorRes.rows[0].body_content, ctx)
        }
        // Einzelne Notiz-Zeile aus dem aktuellen Drehbuch (szeneId = dokument_szenen.id)
        if (item.szeneId) {
          const szRes = await client.query<SceneRow & { vorlage_id: string | null }>(
            `SELECT ds.scene_nummer, ds.scene_nummer_suffix, ds.ort_name, ds.int_ext, ds.tageszeit,
                    ds.spieltag, ds.stoppzeit_sek, ds.content, ds.zusammenfassung, ds.sort_order,
                    ds.format, ds.sondertyp, ds.scene_identity_id, ds.spielzeit, ds.vorlage_id
             FROM dokument_szenen ds WHERE ds.id = $1 AND ds.geloescht = false`,
            [item.szeneId]
          )
          if (!szRes.rows.length) return null
          const row = szRes.rows[0]

          // Titelseite: body_content der Vorlage rendern (enthält Chips + borderStyle)
          if (row.vorlage_id) {
            const vorRes = await client.query<{ ist_titelseite: boolean; body_content: any }>(
              `SELECT ist_titelseite, body_content FROM dokument_vorlagen WHERE id = $1`,
              [row.vorlage_id]
            )
            if (vorRes.rows[0]?.ist_titelseite && vorRes.rows[0].body_content) {
              return renderPmJson(vorRes.rows[0].body_content, ctx)
            }
          }

          // Notiz-Szene: unsichtbares <h2> für PDF-Lesezeichen (item.label), dann Content
          const rendered = row.content ? renderDoc(row.content, fmtById, fmtByName, ctx) : null
          if (!rendered) return null
          // Unsichtbare Notiz-Elemente überspringen (verhindert leere Seite 1)
          // &nbsp; und andere HTML-Entities werden explizit entfernt
          if (!rendered.replace(/<[^>]*>/g, '').replace(/&[a-zA-Z#][a-zA-Z0-9]+;/g, ' ').trim()) return null
          const bookmarkH2 = item.label
            ? `<h2 style="color:white;font-size:1pt;line-height:1;margin:0;padding:0">${esc(item.label)}</h2>`
            : ''
          return `${bookmarkH2}${rendered}`
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
        const bookmarkH2 = item.label
          ? `<h2 style="color:white;font-size:1pt;line-height:1;margin:0;padding:0">${esc(item.label)}</h2>`
          : ''
        return `${bookmarkH2}${await renderStatistikHtml(item.statistikConfig, statistikFormat)}`
      }
      if (item.type === 'onliner' && item.statistikConfig) {
        const bookmarkH2 = item.label
          ? `<h2 style="color:white;font-size:1pt;line-height:1;margin:0;padding:0">${esc(item.label)}</h2>`
          : ''
        return `${bookmarkH2}${await renderOnlinerHtml(item.statistikConfig, onlinerFormat)}`
      }
      if (item.type === 'synopse' && item.statistikConfig) {
        const bookmarkH2 = item.label
          ? `<h2 style="color:white;font-size:1pt;line-height:1;margin:0;padding:0;page-break-after:avoid">${esc(item.label)}</h2>`
          : ''
        return `${bookmarkH2}${await buildSynopsenHtml(client, item.statistikConfig, szenenkopfTemplate, sceneKuerzel, bodyMargins.links / 10, pageContentHeightMm)}`
      }
      if (item.type === 'fsk') {
        const folgeRes = await client.query(
          'SELECT synopsis_fsk, synopsis_deskriptoren, folge_nummer, folgen_titel FROM folgen WHERE id = $1',
          [w.folge_id]
        )
        if (!folgeRes.rows[0]) return null
        const folge = folgeRes.rows[0]
        let fskRating: string | null = null
        let fskBegruendung = ''
        let deskriptoren: { kategorie: string; stufe: string; beschreibung: string }[] = []
        if (folge.synopsis_fsk) {
          try { const p = JSON.parse(folge.synopsis_fsk); fskRating = p.rating ?? null; fskBegruendung = p.begruendung ?? '' } catch {}
        }
        if (folge.synopsis_deskriptoren) {
          try { deskriptoren = JSON.parse(folge.synopsis_deskriptoren) } catch {}
        }
        if (!fskRating && deskriptoren.length === 0) return null

        const FSK_COLORS: Record<string, string> = { '0': '#00C853', '6': '#00C853', '12': '#FF9500', '16': '#FF6B00', '18': '#FF3B30' }
        const STUFE_COLORS: Record<string, string> = { leicht: '#00C853', mittel: '#FF9500', stark: '#FF3B30' }
        const fskColor = fskRating ? (FSK_COLORS[fskRating] ?? '#999') : '#999'

        const title = item.label || `FSK & Inhaltskennzeichnung — Folge ${folge.folge_nummer}${folge.folgen_titel ? ' – ' + folge.folgen_titel : ''}`
        const bookmarkH2 = `<h2 style="color:white;font-size:1pt;line-height:1;margin:0;padding:0">${esc(title)}</h2>`

        const deskriptorenHtml = deskriptoren.length > 0
          ? `<div style="margin-top:12pt;">
               <div style="font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#555;margin-bottom:6pt;">Inhaltsdeskriptoren</div>
               ${deskriptoren.map(d => {
                 const sc = STUFE_COLORS[d.stufe] ?? '#999'
                 return `<div style="margin-bottom:6pt;padding:6pt 8pt;border:1pt solid ${sc}33;border-radius:4pt;background:${sc}0d;">
                   <span style="font-weight:700;font-size:9pt;color:${sc};">${esc(d.kategorie)}</span>
                   <span style="font-size:8pt;font-weight:700;color:${sc};margin-left:6pt;padding:1pt 5pt;border-radius:3pt;background:${sc}22;">${esc(d.stufe.toUpperCase())}</span>
                   ${d.beschreibung ? `<div style="font-size:9pt;color:#333;margin-top:3pt;">${esc(d.beschreibung)}</div>` : ''}
                 </div>`
               }).join('')}
             </div>`
          : ''

        const fskBadge = fskRating
          ? `<div style="display:inline-flex;align-items:center;gap:8pt;margin-bottom:6pt;">
               <div style="width:36pt;height:36pt;border-radius:4pt;background:${fskColor};display:flex;align-items:center;justify-content:center;font-size:16pt;font-weight:900;color:white;flex-shrink:0;">${esc(fskRating)}</div>
               <div>
                 <div style="font-size:13pt;font-weight:700;color:${fskColor};">FSK ${esc(fskRating)}</div>
                 ${fskBegruendung ? `<div style="font-size:9pt;color:#555;margin-top:2pt;">${esc(fskBegruendung)}</div>` : ''}
               </div>
             </div>`
          : ''

        const html = `${bookmarkH2}
          <div style="padding-top:12pt;">
            <div style="font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#999;margin-bottom:10pt;">FSK &amp; Inhaltskennzeichnung</div>
            ${fskBadge}
            ${deskriptorenHtml}
            <div style="margin-top:14pt;font-size:8pt;color:#aaa;border-top:0.5pt solid #ddd;padding-top:6pt;">
              Interne Einschätzung — keine offizielle FSK-/FSF-Freigabe.
              Standard: FSK-Inhaltsdeskriptoren §14 JuSchG (2021) · fsk.de
            </div>
          </div>`
        return html
      }
      return null
    }

    // Backward compat: Legacy notizWerkstufIds → in preItems umwandeln wenn kein preItems gesetzt
    const resolvedPreItems: OrderedExportItem[] = options.preItems ?? (options.notizWerkstufIds ?? []).map(id => ({
      type: 'notiz' as const, id, enabled: true
    }))
    const resolvedPostItems: OrderedExportItem[] = options.postItems ?? []

    // Titelseiten-Erkennung: preItems mit szeneId und ist_titelseite=true werden
    // separat gerendert (kein KZ/FZ, eigene Ränder) — alle anderen gehen in den Hauptrender
    const titelseiteHtmlParts: string[] = []
    let titelseiteMargins: { oben: number; unten: number; links: number; rechts: number } | null = null
    const preSections: string[] = []
    for (const item of resolvedPreItems) {
      if (item.enabled) {
        // Titelseite via vorlageId (direkt hinzugefügt ohne szeneId)
        if (item.type === 'notiz' && item.vorlageId) {
          const vorRes = await client.query<{ ist_titelseite: boolean; seiten_layout: any }>(
            'SELECT ist_titelseite, seiten_layout FROM dokument_vorlagen WHERE id = $1',
            [item.vorlageId]
          )
          if (vorRes.rows[0]?.ist_titelseite) {
            const html = await renderOrderedItem(item)
            if (html) titelseiteHtmlParts.push(html)
            if (!titelseiteMargins) {
              const sl: Record<string, number | undefined> = vorRes.rows[0].seiten_layout ?? {}
              titelseiteMargins = {
                oben:   sl.margin_top    ?? bodyMargins.oben,
                unten:  sl.margin_bottom ?? bodyMargins.unten,
                links:  sl.margin_left   ?? bodyMargins.links,
                rechts: sl.margin_right  ?? bodyMargins.rechts,
              }
            }
            continue
          }
        }
        // Titelseite via szeneId (szene hat vorlage mit ist_titelseite=true)
        if (item.type === 'notiz' && item.szeneId) {
          const vorRes = await client.query<{ ist_titelseite: boolean; seiten_layout: any }>(
            `SELECT dv.ist_titelseite, dv.seiten_layout
             FROM dokument_szenen ds
             LEFT JOIN dokument_vorlagen dv ON dv.id = ds.vorlage_id
             WHERE ds.id = $1`,
            [item.szeneId]
          )
          if (vorRes.rows[0]?.ist_titelseite) {
            const html = await renderOrderedItem(item)
            if (html) titelseiteHtmlParts.push(html)
            if (!titelseiteMargins) {
              const sl: Record<string, number | undefined> = vorRes.rows[0].seiten_layout ?? {}
              titelseiteMargins = {
                oben:   sl.margin_top    ?? bodyMargins.oben,
                unten:  sl.margin_bottom ?? bodyMargins.unten,
                links:  sl.margin_left   ?? bodyMargins.links,
                rechts: sl.margin_right  ?? bodyMargins.rechts,
              }
            }
            continue
          }
        }
      }
      const html = await renderOrderedItem(item)
      // Leerinhalt-Guard: HTML-Entities (&nbsp; etc.) werden entfernt bevor auf sichtbaren Text geprüft wird.
      // Verhindert dass eine Notiz-Sektion mit nur unsichtbarem Inhalt eine leere Seite 1 erzeugt.
      if (html && html.replace(/<[^>]*>/g, '').replace(/&[a-zA-Z#][a-zA-Z0-9]+;/g, ' ').trim()) {
        preSections.push(html)
      }
    }
    const titelseiteHtml = titelseiteHtmlParts.length > 0
      ? titelseiteHtmlParts.join('\n')
      : null

    const postSections: string[] = []
    for (const item of resolvedPostItems) {
      // Titelseite-Guard: falls Titelseite versehentlich in postItems gelandet ist,
      // nicht als normale Sektion rendern (würde am Ende des Dokuments erscheinen)
      if (item.enabled && item.type === 'notiz') {
        let isTitelseite = false
        if (item.vorlageId) {
          const vorRes = await client.query<{ ist_titelseite: boolean }>(
            'SELECT ist_titelseite FROM dokument_vorlagen WHERE id = $1', [item.vorlageId]
          )
          isTitelseite = !!vorRes.rows[0]?.ist_titelseite
        } else if (item.szeneId) {
          const vorRes = await client.query<{ ist_titelseite: boolean }>(
            `SELECT dv.ist_titelseite FROM dokument_szenen ds
             LEFT JOIN dokument_vorlagen dv ON dv.id = ds.vorlage_id WHERE ds.id = $1`, [item.szeneId]
          )
          isTitelseite = !!vorRes.rows[0]?.ist_titelseite
        }
        if (isTitelseite) continue  // Titelseite gehört nicht ans Ende
      }
      const html = await renderOrderedItem(item)
      if (html && html.replace(/<[^>]*>/g, '').replace(/&[a-zA-Z#][a-zA-Z0-9]+;/g, ' ').trim()) {
        postSections.push(html)
      }
    }

    // ── 8. Hauptszenen laden ──────────────────────────────────────────────────
    setProgress(40)
    const szRes = await client.query<SceneRow>(
      `SELECT ds.scene_nummer, ds.scene_nummer_suffix, ds.ort_name, ds.int_ext, ds.tageszeit, ds.spieltag,
              ds.stoppzeit_sek, ds.content, ds.zusammenfassung, ds.sort_order, ds.format, ds.sondertyp,
              ds.scene_identity_id, ds.spielzeit, dv.name AS vorlage_name
       FROM dokument_szenen ds
       LEFT JOIN dokument_vorlagen dv ON dv.id = ds.vorlage_id
       WHERE ds.werkstufe_id = $1 AND ds.geloescht = false
         AND (dv.ist_titelseite IS NOT TRUE)
       ORDER BY ds.sort_order`,
      [werkstufId]
    )

    // Rollen pro Szene (für rollen-Chip + filterRollen)
    const charRes = await client.query<{ scene_identity_id: string; rollen: string[] }>(
      `SELECT sc.scene_identity_id,
              array_agg(DISTINCT c.name ORDER BY c.name) AS rollen
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
    // wmPayload wird nach der PDF-Erzeugung via pdf-lib in die Metadaten eingeschrieben (s.u.).

    // Alle Sektionen in Reihenfolge: preSections → Hauptinhalt → postSections
    // Jede Sektion bekommt einen page-break-before (außer der allerersten)
    const allSections: string[] = [
      ...preSections,
      ...(mainHtml ? [mainHtml] : []),
      ...postSections,
    ]

    let bodyHtml = ''
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
    // Abstand vom physischen Papierrand aus seiten_layout der Vorlage; Default 10mm
    const kzSl = kzFz?.seiten_layout ?? {}
    const hmt = kzSl.header_abstand_rand ?? 10
    const hmb = kzSl.footer_abstand_rand ?? 10
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

    return { html, title, headerHtml, footerHtml, hmt, hmb, hml, hmr, pageMarginTop, pageMarginBottom, bml, bmr, titelseiteHtml, titelseiteMargins }

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

/** Rendert eine einzelne HTML-Seite mit Puppeteer zu PDF. */
async function renderHtmlToPdf(
  browser: any,
  html: string,
  opts: {
    displayHeaderFooter: boolean
    headerTemplate?: string
    footerTemplate?: string
    margin: { top: string; bottom: string; left: string; right: string }
    outline?: boolean
    /** Optionaler Hook zwischen setContent und pdf() — z.B. für JS-Seitenumbruch-Fixup */
    onBeforePdf?: (page: any) => Promise<void>
  }
): Promise<Uint8Array> {
  const page = await browser.newPage()
  try {
    await page.setContent(html, { waitUntil: 'load', timeout: 60_000 })
    if (opts.onBeforePdf) await opts.onBeforePdf(page)
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: opts.displayHeaderFooter,
      headerTemplate: opts.headerTemplate ?? '<div style="font-size:0"></div>',
      footerTemplate: opts.footerTemplate ?? '<div style="font-size:0"></div>',
      outline: opts.outline ?? false,
      margin: opts.margin,
    })
  } finally {
    await page.close()
  }
}


/** Fügt zwei PDFs zusammen: alle Seiten von a, dann alle Seiten von b. */
async function mergePdfs(a: Uint8Array, b: Uint8Array): Promise<Uint8Array> {
  const [docA, docB] = await Promise.all([
    PDFDocument.load(a),
    PDFDocument.load(b),
  ])
  const merged = await PDFDocument.create()
  const pagesA = await merged.copyPages(docA, docA.getPageIndices())
  const pagesB = await merged.copyPages(docB, docB.getPageIndices())
  for (const p of pagesA) merged.addPage(p)
  for (const p of pagesB) merged.addPage(p)
  return merged.save()
}

/**
 * Entfernt Leerseiten aus einem Puppeteer-generierten PDF.
 * Heuristik: komprimierter Content-Stream < 300 Byte = Leerseite.
 * Fehler werden still ignoriert — im Zweifel bleibt das Original.
 */
function resolveStreamLen(obj: any, ctx: any): number | null {
  if (!obj) return null
  // Single stream: hat 'dict' mit 'Length'-Eintrag
  if (typeof obj.dict?.get === 'function') {
    const l = obj.dict.get(PDFName.of('Length'))
    return l instanceof PDFNumber ? l.asNumber() : null
  }
  // PDFArray: Summe aller Teil-Streams
  if (Array.isArray(obj.array)) {
    let total = 0
    for (const ref of obj.array) {
      const s = ctx.lookup(ref)
      const l = resolveStreamLen(s, ctx)
      if (l === null) return null  // unbekannte Struktur → behalten
      total += l
    }
    return total
  }
  return null
}

async function removeEmptyPages(pdfBytes: Uint8Array): Promise<Uint8Array> {
  try {
    const pdfDoc = await PDFDocument.load(pdfBytes)
    if (pdfDoc.getPageCount() <= 1) return pdfBytes

    const ctx = pdfDoc.context
    const toRemove: number[] = []

    for (let i = 0; i < pdfDoc.getPageCount(); i++) {
      try {
        const page = pdfDoc.getPage(i)
        const contentsEntry = page.node.get(PDFName.of('Contents'))
        if (!contentsEntry) { toRemove.push(i); continue }
        const len = resolveStreamLen(ctx.lookup(contentsEntry as any), ctx)
        if (len !== null && len < 300) toRemove.push(i)
      } catch { /* Seite nicht prüfbar → behalten */ }
    }

    // Nie alle Seiten entfernen
    if (!toRemove.length || toRemove.length >= pdfDoc.getPageCount()) return pdfBytes

    for (const idx of [...toRemove].reverse()) pdfDoc.removePage(idx)
    return await pdfDoc.save()
  } catch {
    return pdfBytes
  }
}

export async function assemblePdf(
  input: PdfAssemblerInput,
  setProgress: (p: number) => void
): Promise<JobResult> {
  const { html, title, headerHtml, footerHtml, hmt, hmb, hml, hmr, pageMarginTop, pageMarginBottom, bml, bmr, titelseiteHtml, titelseiteMargins } =
    await assembleHtml(input, setProgress)

  // ── 11. Puppeteer → PDF ───────────────────────────────────────────────────
  setProgress(55)

  // Warm-Pool: bestehende Browser-Instanz wiederverwenden (kein Kaltstart)
  const browser = await getWarmBrowser()
  setProgress(60)

  // Externe Bilder in header/footer HTML inlinen (Puppeteer-Einschränkung)
  const [inlinedHeader, inlinedFooter] = await Promise.all([
    headerHtml.trim() ? inlineExternalImages(headerHtml) : Promise.resolve(headerHtml),
    footerHtml.trim() ? inlineExternalImages(footerHtml) : Promise.resolve(footerHtml),
  ])

  // ph-seite / ph-seiten-gesamt → Puppeteer-eigene pageNumber/totalPages-Klassen
  const toPuppeteerTpl = (raw: string) =>
    raw
      .replace(/<span class="ph-seite"><\/span>/g, '<span class="pageNumber" style="font-size:9pt"></span>')
      .replace(/<span class="ph-seiten-gesamt"><\/span>/g, '<span class="totalPages" style="font-size:9pt"></span>')

  // Minimaler CSS-Reset für das Puppeteer-Template-Rendering
  const tplReset = '<style>*{margin:0;padding:0;box-sizing:border-box}p{line-height:1.3}</style>'

  // ── Offene Benutzer-Wasserzeichen ─────────────────────────────────────────
  // Text = persoenlicher_ausdruck; Groß = diagonal über die Seite; Klein = Kopfzeile zentriert
  const escWzText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const userWzRaw   = (input.options.persoenlicher_ausdruck ?? '').trim()
  const userWzText  = escWzText(userWzRaw)
  const wzKleinOn   = !!(input.options.wz_klein_aktiv && userWzText)
  const wzGrossOn   = !!(input.options.wz_gross_aktiv && userWzText)

  // Schriftgröße: Text soll ¾ der A4-Diagonale (≈ 273mm = 774pt) einnehmen.
  // Arial Bold Zeichenbreite ≈ 0.55em. Winkel: A4-Diagonale atan(297/210) ≈ 54.74°.
  const A4_DIAG_PT  = Math.sqrt(210 * 210 + 297 * 297) * 0.75 * 2.835  // pt
  const wzFontPt    = wzGrossOn
    ? Math.max(8, Math.min(250, Math.round(A4_DIAG_PT / (userWzRaw.length * 0.55))))
    : 20
  const wzFarbe     = /^#[0-9a-fA-F]{3,6}$/.test(input.options.wz_gross_farbe ?? '')
    ? input.options.wz_gross_farbe!
    : '#CCCCCC'

  // Groß: position:absolute relativ zum Header-Div, ragt visuell über die gesamte Seite
  const wzUserGross = wzGrossOn
    ? `<div style="position:absolute;top:0;left:0;width:210mm;height:297mm;display:flex;align-items:center;justify-content:center;opacity:0.25;pointer-events:none;overflow:hidden;z-index:9998">` +
      `<span style="font-size:${wzFontPt}pt;font-weight:bold;font-family:Arial,sans-serif;white-space:nowrap;transform:rotate(-54.74deg);display:block;color:${wzFarbe}">${userWzText}</span></div>`
    : ''

  // Klein: absolut am oberen Rand des Headers, sehr klein, zentriert
  const wzUserKlein = wzKleinOn
    ? `<div style="position:absolute;top:2mm;left:0;width:100%;text-align:center;font-size:6.5pt;font-family:Arial,sans-serif;color:#777;pointer-events:none;z-index:9998;line-height:1">${userWzText}</div>`
    : ''

  // headerTemplate: KZ (falls vorhanden) + User-WZ
  const headerTemplate = (inlinedHeader.trim() || wzUserGross || wzUserKlein)
    ? `${tplReset}<div style="position:relative;width:100%;height:${pageMarginTop}mm">${wzUserGross}${wzUserKlein}${inlinedHeader.trim() ? `<div style="display:flex;flex-direction:column;justify-content:flex-start;padding:${hmt}mm ${hmr}mm 0 ${hml}mm;font-size:9pt;font-family:'Courier New',monospace;color:#333">${toPuppeteerTpl(inlinedHeader)}</div>` : ''}</div>`
    : '<div style="font-size:0"></div>'

  const footerTemplate = inlinedFooter.trim()
    ? `${tplReset}<div style="width:100%;height:${pageMarginBottom}mm;display:flex;flex-direction:column;justify-content:flex-end;padding:0 ${hmr}mm ${hmb}mm ${hml}mm;font-size:9pt;font-family:'Courier New',monospace;color:#333">${toPuppeteerTpl(inlinedFooter)}</div>`
    : '<div style="font-size:0"></div>'

  const pdfBookmarks = input.options.pdfBookmarks === true

  let pdfBytes: Uint8Array

  // ── Titelseite-Split-Render ────────────────────────────────────────────────
  // ist_titelseite=true → separate Render (kein KZ/FZ, eigene Ränder, Wasserzeichen via position:fixed)
  if (titelseiteHtml && titelseiteMargins) {
    // Benutzer-Wasserzeichen auf Titelseite (position:fixed, da kein headerTemplate)
    const wzTitelGross = wzGrossOn
      ? `<div style="position:fixed;top:0;left:0;width:210mm;height:297mm;display:flex;align-items:center;justify-content:center;opacity:0.25;pointer-events:none;overflow:hidden;z-index:9998">` +
        `<span style="font-size:${wzFontPt}pt;font-weight:bold;font-family:Arial,sans-serif;white-space:nowrap;transform:rotate(-54.74deg);display:block;color:${wzFarbe}">${userWzText}</span></div>`
      : ''
    const wzTitelKlein = wzKleinOn
      ? `<div style="position:fixed;top:3mm;left:0;width:100%;text-align:center;font-size:6.5pt;font-family:Arial,sans-serif;color:#777;pointer-events:none;z-index:9998;line-height:1">${userWzText}</div>`
      : ''

    const titelseiteBodyHtml = wzTitelGross + wzTitelKlein + titelseiteHtml

    const titelseiteFullHtml = buildPdfHtml({
      title,
      bodyHtml: titelseiteBodyHtml,
      kzFz: null,
      ctx: {} as any,  // ctx wird für KZ/FZ-Rendering benötigt — leer da kein KZ/FZ
      bodyMargins: titelseiteMargins,
      localFontCss: loadLocalFontCss(),
      puppeteerHeaderFooter: true,
    })

    setProgress(63)
    const titelseiteBytes = await renderHtmlToPdf(browser, titelseiteFullHtml, {
      displayHeaderFooter: false,
      margin: {
        top:    `${titelseiteMargins.oben}mm`,
        bottom: `${titelseiteMargins.unten}mm`,
        left:   `${titelseiteMargins.links}mm`,
        right:  `${titelseiteMargins.rechts}mm`,
      },
    })
    setProgress(70)

    // Hauptrender (ohne Titelseite) — normaler KZ/FZ-Render
    const mainBytes = await renderHtmlToPdf(browser, html, {
      displayHeaderFooter: true,
      headerTemplate,
      footerTemplate,
      outline: pdfBookmarks,
      margin: {
        top:    `${pageMarginTop}mm`,
        bottom: `${pageMarginBottom}mm`,
        left:   `${bml}mm`,
        right:  `${bmr}mm`,
      },
    })
    setProgress(85)

    // Titelseite-Seiten + Hauptseiten zusammenführen
    pdfBytes = await mergePdfs(titelseiteBytes, mainBytes)

    // Lesezeichen: native Outline aus Hauptinhalt extrahieren, Seitennummern
    // um Titelseiten-Anzahl versetzen, dann in das Merged-PDF einbauen.
    if (pdfBookmarks) {
      const bmEntries = await extractPdfOutline(mainBytes)
      const titelseiteDoc = await PDFDocument.load(titelseiteBytes)
      const offset = titelseiteDoc.getPageCount()
      const allEntries = [
        { pageIndex: 0, label: 'Titelseite' },
        ...bmEntries.map(e => ({ ...e, pageIndex: e.pageIndex + offset })),
      ]
      pdfBytes = await addPdfOutline(pdfBytes, allEntries)
    }
    setProgress(90)

  } else {
    // ── Normaler Einzelrender (kein ist_titelseite) ──────────────────────────
    const page = await browser.newPage()
    try {
      await page.setContent(html, { waitUntil: 'load', timeout: 60_000 })
      setProgress(75)

      // outline:true → Chrome generiert PDF-Lesezeichen nativ aus <h2>-Tags.
      // Akkurat, da der Browser selbst weiß auf welcher Seite jedes Element landet.
      pdfBytes = await page.pdf({
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate,
        footerTemplate,
        outline: pdfBookmarks,
        margin: {
          top:    `${pageMarginTop}mm`,
          bottom: `${pageMarginBottom}mm`,
          left:   `${bml}mm`,
          right:  `${bmr}mm`,
        },
      })
      setProgress(90)
    } finally {
      await page.close()
    }
  }

  // Leerseiten entfernen (z.B. durch Seitenumbruch-Artefakte am Anfang)
  pdfBytes = await removeEmptyPages(pdfBytes)

  // Wasserzeichen-Payload in PDF-Metadaten einschreiben (Keywords-Feld).
  // ZWC im HTML-Body wird von Chromium nicht in die Textebene übernommen;
  // pdf-lib schreibt direkt ins Info-Dictionary des fertigen PDFs.
  // PDF-Metadaten: Wasserzeichen + KI-Opt-out.
  // Keywords-Feld: wmPayload für Rückverfolgung.
  // Subject-Feld: Standard-Opt-out-Signal (respektiert von seriösen KI-Anbietern).
  // Producer/Creator: Herkunftsnachweis.
  const wmPayloadFinal = buildPayload(input.userId, input.werkstufId)
  {
    const wmDoc = await PDFDocument.load(pdfBytes)
    if (wmPayloadFinal) wmDoc.setKeywords([wmPayloadFinal])
    wmDoc.setSubject('noai noimageai — KI-Training nicht gestattet. Urheberrechtlich geschützt. © Serienwerft Studio Hamburg GmbH.')
    wmDoc.setProducer('Serienwerft Script-App — Unauthorized AI training of this document is prohibited.')
    wmDoc.setCreator('Serienwerft Studio Hamburg GmbH')
    pdfBytes = await wmDoc.save()
  }

  const filename = title.replace(/\s*[-–]\s*$/, '') + '.pdf'

  return {
    buffer:   Buffer.from(pdfBytes),
    mimeType: 'application/pdf',
    filename,
  }
}
