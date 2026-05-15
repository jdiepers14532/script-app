/**
 * Export Assembler — Phase 6
 * Renders ProseMirror JSON zones to HTML, substitutes placeholder chips,
 * builds export filename, assembles full PDF HTML with header/footer.
 */

export interface ExportContext {
  produktion:    string
  staffel:       string | null
  block:         string | null
  folge:         number | null
  folgentitel:   string | null
  werkstufe:     string | null
  fassung:       string | null
  version:       number | null
  stand_datum:   string   // YYYY-MM-DD
  autor:         string
  regie:         string | null
  firmenname:    string | null
  sender:             string | null
  buero_adresse:      string | null
  sendedatum:         string | null
  produktionszeitraum: string | null
  aktuelles_datum:     string
  aktuelles_jahr:      string
  folge_laenge_netto:  string | null
  firmen_adresse:      string | null
  rechtsform:          string | null
  handelsregister:     string | null
  ust_id:              string | null
  geschaeftsfuehrung:  string | null
  firmen_email:        string | null
  firmen_telefon:      string | null
  tel_produktion:      string | null
  episode_terminus:   string  // e.g. "Folge" or "Episode"
}

// ── Placeholder resolution ────────────────────────────────────────────────────

function resolvePlaceholder(key: string, ctx: ExportContext): string {
  switch (key) {
    case '{{produktion}}':    return ctx.produktion
    case '{{staffel}}':       return ctx.staffel ?? ''
    case '{{block}}':         return ctx.block ?? ''
    case '{{folge}}':         return ctx.folge != null ? String(ctx.folge) : ''
    case '{{folgentitel}}':   return ctx.folgentitel ?? ''
    case '{{werkstufe}}':     return ctx.werkstufe ?? ''
    case '{{fassung}}':       return ctx.fassung ?? ''
    case '{{version}}':       return ctx.version != null ? `V${ctx.version}` : ''
    case '{{stand_datum}}':   return ctx.stand_datum
    case '{{autor}}':         return ctx.autor
    case '{{regie}}':         return ctx.regie ?? ''
    case '{{firmenname}}':    return ctx.firmenname ?? ''
    case '{{sender}}':        return ctx.sender ?? ''
    case '{{buero_adresse}}':       return ctx.buero_adresse ?? ''
    case '{{sendedatum}}':          return ctx.sendedatum ?? ''
    case '{{produktionszeitraum}}': return ctx.produktionszeitraum ?? ''
    case '{{aktuelles_datum}}':     return ctx.aktuelles_datum
    case '{{aktuelles_jahr}}':      return ctx.aktuelles_jahr
    case '{{folge_laenge_netto}}':  return ctx.folge_laenge_netto ?? ''
    case '{{firmen_adresse}}':      return ctx.firmen_adresse ?? ''
    case '{{rechtsform}}':          return ctx.rechtsform ?? ''
    case '{{handelsregister}}':     return ctx.handelsregister ?? ''
    case '{{ust_id}}':              return ctx.ust_id ?? ''
    case '{{geschaeftsfuehrung}}':  return ctx.geschaeftsfuehrung ?? ''
    case '{{firmen_email}}':        return ctx.firmen_email ?? ''
    case '{{firmen_telefon}}':      return ctx.firmen_telefon ?? ''
    case '{{tel_produktion}}':      return ctx.tel_produktion ?? ''
    case '{{seite}}':         return '<span class="ph-seite"></span>'
    case '{{seiten_gesamt}}': return '<span class="ph-seiten-gesamt"></span>'
    default:                  return key
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ── ProseMirror JSON → HTML ────────────────────────────────────────────────────

function renderInlineNodes(nodes: any[], ctx: ExportContext): string {
  if (!Array.isArray(nodes)) return ''
  return nodes.map(n => renderInlineNode(n, ctx)).join('')
}

function renderInlineNode(node: any, ctx: ExportContext): string {
  if (!node) return ''

  if (node.type === 'placeholder_chip') {
    const key = node.attrs?.key ?? ''
    return resolvePlaceholder(key, ctx)
  }

  if (node.type === 'hardBreak') return '<br>'

  if (node.type === 'image') {
    const src  = node.attrs?.src ?? ''
    const w    = node.attrs?.width  ? ` width="${node.attrs.width}"` : ''
    const h    = node.attrs?.height ? ` height="${node.attrs.height}"` : ''
    const aln  = node.attrs?.alignment ?? 'left'
    const style = `max-width:100%;display:block;${aln === 'center' ? 'margin:0 auto;' : aln === 'right' ? 'margin-left:auto;' : ''}`
    return `<img src="${src}"${w}${h} style="${style}">`
  }

  if (node.type === 'resizable_image') {
    const src = node.attrs?.src ?? ''
    const w   = node.attrs?.width ? `width:${node.attrs.width}px;` : 'width:120px;'
    const flt = node.attrs?.float
    const floatStyle = flt === 'left'   ? 'float:left;margin-right:10px;'
                     : flt === 'right'  ? 'float:right;margin-left:10px;'
                     : flt === 'center' ? 'display:block;margin-left:auto;margin-right:auto;'
                     : 'display:block;margin:4px 0;'
    return `<img src="${src}" style="${w}max-width:100%;${floatStyle}">`
  }

  if (node.type === 'text') {
    let html = escapeHtml(node.text ?? '')
    for (const mark of (node.marks ?? [])) {
      switch (mark.type) {
        case 'bold':      html = `<strong>${html}</strong>`; break
        case 'italic':    html = `<em>${html}</em>`; break
        case 'underline': html = `<u>${html}</u>`; break
        case 'strike':    html = `<s>${html}</s>`; break
        case 'textStyle': {
          const inlineStyles: string[] = []
          if (mark.attrs?.color)      inlineStyles.push(`color:${mark.attrs.color}`)
          if (mark.attrs?.fontFamily) inlineStyles.push(`font-family:${mark.attrs.fontFamily}`)
          if (mark.attrs?.fontSize)   inlineStyles.push(`font-size:${mark.attrs.fontSize}`)
          if (inlineStyles.length) html = `<span style="${inlineStyles.join(';')}">${html}</span>`
          break
        }
      }
    }
    return html
  }

  return ''
}

function renderNode(node: any, ctx: ExportContext): string {
  if (!node?.type) return ''

  if (node.type === 'paragraph') {
    const align = node.attrs?.textAlign
    const ff    = node.attrs?.fontFamily
    const fs    = node.attrs?.fontSize
    const fw    = node.attrs?.fontWeight
    const fst   = node.attrs?.fontStyle
    const td    = node.attrs?.textDecoration
    const lh    = node.attrs?.lineHeight
    const sa    = node.attrs?.spaceAfter
    const styles: string[] = []
    if (align && align !== 'left') styles.push(`text-align:${align}`)
    if (ff)  styles.push(`font-family:${ff}`)
    if (fs)  styles.push(`font-size:${fs}`)
    if (fw)  styles.push(`font-weight:${fw}`)
    if (fst) styles.push(`font-style:${fst}`)
    if (td)  styles.push(`text-decoration:${td}`)
    if (lh)  styles.push(`line-height:${lh}`)
    if (sa)  styles.push(`margin-bottom:${sa}`)
    const style = styles.length ? ` style="${styles.join(';')}"` : ''
    const inner = renderInlineNodes(node.content ?? [], ctx)
    return `<p${style}>${inner || '&nbsp;'}</p>`
  }

  if (node.type === 'heading') {
    const level = node.attrs?.level ?? 2
    const inner = renderInlineNodes(node.content ?? [], ctx)
    return `<h${level}>${inner}</h${level}>`
  }

  if (node.type === 'bulletList') {
    const items = (node.content ?? []).map((li: any) =>
      `<li>${renderInlineNodes(li.content?.[0]?.content ?? [], ctx)}</li>`
    ).join('')
    return `<ul>${items}</ul>`
  }

  if (node.type === 'orderedList') {
    const items = (node.content ?? []).map((li: any) =>
      `<li>${renderInlineNodes(li.content?.[0]?.content ?? [], ctx)}</li>`
    ).join('')
    return `<ol>${items}</ol>`
  }

  if (node.type === 'horizontalRule') return '<hr style="border:none;border-top:1px solid #d0d0d0;width:100%;margin:8px 0">'
  if (node.type === 'customHr') {
    const t = node.attrs?.thickness ?? 1
    const w = node.attrs?.width ?? 100
    return `<hr style="border:none;border-top:${t}px solid #555;width:${w}%;margin:8px auto;display:block">`
  }

  if (node.type === 'table') {
    const borderStyle = node.attrs?.borderStyle ?? 'default'
    const cellBorder = borderStyle === 'none'   ? 'border:none'
      : borderStyle === 'thick'  ? 'border:2px solid #333'
      : borderStyle === 'dashed' ? 'border:1px dashed #888'
      : borderStyle === 'dotted' ? 'border:1px dotted #888'
      : borderStyle === 'double' ? 'border:3px double #555'
      : 'border:1px solid #d0d0d0'
    const firstRow = node.content?.[0]
    const hasColWidths = firstRow?.content?.some((c: any) => c.attrs?.colwidth?.[0])
    const tableLayout = hasColWidths ? 'table-layout:fixed;' : ''
    const rows = (node.content ?? []).map((row: any) => {
      const rowHeight = row.attrs?.rowHeight
      const rowStyle  = rowHeight ? ` style="height:${rowHeight}px"` : ''
      const cellPad   = rowHeight ? 'padding:0 4px;overflow:hidden;' : 'padding:5px 10px;'
      const cells = (row.content ?? []).map((cell: any) => {
        const isHeader = cell.type === 'tableHeader'
        const tag      = isHeader ? 'th' : 'td'
        const extra    = isHeader ? 'background:#f5f5f5;font-weight:600;' : ''
        const cw       = cell.attrs?.colwidth?.[0]
        const widthStr = cw ? `width:${cw}px;` : ''
        const colspan  = cell.attrs?.colspan  && cell.attrs.colspan  > 1 ? ` colspan="${cell.attrs.colspan}"`  : ''
        const rowspan  = cell.attrs?.rowspan  && cell.attrs.rowspan  > 1 ? ` rowspan="${cell.attrs.rowspan}"`  : ''
        const inner    = (cell.content ?? []).map((n: any) => renderNode(n, ctx)).join('')
        return `<${tag}${colspan}${rowspan} style="${widthStr}${cellBorder};${cellPad}vertical-align:top;${extra}">${inner}</${tag}>`
      }).join('')
      return `<tr${rowStyle}>${cells}</tr>`
    }).join('')
    return `<table style="border-collapse:collapse;${tableLayout}width:100%;margin:4px 0"><tbody>${rows}</tbody></table>`
  }

  // Fallback: treat content as block container
  return (node.content ?? []).map((c: any) => renderNode(c, ctx)).join('')
}

/** Convert ProseMirror JSON doc to HTML string, resolving placeholder chips */
export function renderPmJson(json: any, ctx: ExportContext): string {
  if (!json) return ''
  const doc = typeof json === 'string' ? JSON.parse(json) : json
  const content: any[] = doc.type === 'doc' ? (doc.content ?? []) : [doc]
  return content.map(n => renderNode(n, ctx)).join('\n')
}

/**
 * Render a header/footer zone content.
 * Handles both the new 3-column format { links, mitte, rechts }
 * and the legacy single ProseMirror doc format.
 */
export function renderZeilenContent(content: any, ctx: ExportContext): string {
  if (!content) return ''

  // New 3-column format
  if ('links' in content || 'mitte' in content || 'rechts' in content) {
    const l = content.links  ? renderPmJson(content.links,  ctx) : ''
    const m = content.mitte  ? renderPmJson(content.mitte,  ctx) : ''
    const r = content.rechts ? renderPmJson(content.rechts, ctx) : ''
    // Only render if at least one column has content
    if (!l && !m && !r) return ''
    return `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;align-items:center;width:100%">` +
      `<div style="text-align:left">${l}</div>` +
      `<div style="text-align:center">${m}</div>` +
      `<div style="text-align:right">${r}</div>` +
      `</div>`
  }

  // Legacy single-doc format
  return renderPmJson(content, ctx)
}

// ── Export filename builder ────────────────────────────────────────────────────

export function buildExportFilename(
  werkstufe: { typ: string; version_nummer: number; label?: string | null; stand_datum?: string | null },
  folge: { folge_nummer: number; folgen_titel?: string | null },
  produktion: { titel: string },
  episodeTerminus: string,
  ext: string
): string {
  const datum = werkstufe.stand_datum
    ? String(werkstufe.stand_datum).slice(0, 10)
    : new Date().toISOString().slice(0, 10)

  const typLabel = werkstufe.typ === 'drehbuch' ? 'Drehbuch'
    : werkstufe.typ === 'storyline' ? 'Storyline'
    : 'Notiz'
  const version = `V${werkstufe.version_nummer}`

  // e.g. "Rote Rosen - Folge 3841 Drehbuch V2 2026-05-12"
  const parts = [
    produktion.titel,
    `${episodeTerminus} ${folge.folge_nummer}`,
    `${typLabel} ${version}`,
    datum,
  ]

  return parts.join(' - ').replace(/[/\\:*?"<>|]/g, '_') + `.${ext}`
}

// ── Full PDF HTML assembler ────────────────────────────────────────────────────

interface KzFzConfig {
  kopfzeile_content: any
  fusszeile_content: any
  kopfzeile_aktiv: boolean
  fusszeile_aktiv: boolean
  erste_seite_kein_header: boolean
  erste_seite_kein_footer: boolean
  seiten_layout: {
    format?: string
    margin_top?: number
    margin_bottom?: number
    margin_left?: number
    margin_right?: number
  }
}

export function buildPdfHtml(params: {
  title: string
  bodyHtml: string
  kzFz: KzFzConfig | null
  ctx: ExportContext
  watermarkMeta?: string
}): string {
  const { title, bodyHtml, kzFz, ctx, watermarkMeta } = params

  const layout = kzFz?.seiten_layout ?? {}
  const mt = layout.margin_top    ?? 25
  const mb = layout.margin_bottom ?? 25
  const ml = layout.margin_left   ?? 30
  const mr = layout.margin_right  ?? 25

  // Extra body margin to avoid overlap with fixed header/footer
  const headerHtml = kzFz?.kopfzeile_aktiv && kzFz.kopfzeile_content
    ? renderZeilenContent(kzFz.kopfzeile_content, ctx)
    : ''
  const footerHtml = kzFz?.fusszeile_aktiv && kzFz.fusszeile_content
    ? renderZeilenContent(kzFz.fusszeile_content, ctx)
    : ''

  const hasHeader = headerHtml.trim().length > 0
  const hasFooter = footerHtml.trim().length > 0
  const headerHeight = hasHeader ? 18 : 0  // mm
  const footerHeight = hasFooter ? 14 : 0  // mm

  const pageMarginTop    = mt + headerHeight
  const pageMarginBottom = mb + footerHeight

  const wm = watermarkMeta ? `<meta name="wm" content="${watermarkMeta}">` : ''

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
${wm}
<title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: "Courier New", monospace;
    font-size: 12pt;
    margin: 0;
    padding: ${pageMarginTop}mm ${mr}mm ${pageMarginBottom}mm ${ml}mm;
    line-height: 1.5;
    color: #000;
  }
  @page {
    size: A4;
    margin: ${pageMarginTop}mm ${mr}mm ${pageMarginBottom}mm ${ml}mm;
  }
  /* ── Scene styling ── */
  .scene-heading {
    font-weight: bold;
    text-transform: uppercase;
    background: #f0f0f0;
    padding: 4px 6px;
    margin: 20px 0 10px;
    page-break-after: avoid;
  }
  .stoppzeit { float: right; color: #666; font-weight: normal; }
  .action    { margin: 0 0 10px; }
  .character { margin-left: 40%; font-weight: bold; margin-bottom: 0; }
  .parenthetical { margin-left: 30%; margin-right: 30%; font-style: italic; }
  .dialogue  { margin-left: 20%; margin-right: 20%; }
  .transition{ text-align: right; font-weight: bold; }
  .shot      { font-weight: bold; }
  .heading   { font-weight: bold; text-transform: uppercase; }
  h1 { text-align: center; border-bottom: 1px solid #000; padding-bottom: 10px; margin-bottom: 24px; }
  /* ── Header/Footer ── */
  .page-header, .page-footer {
    position: fixed;
    left: ${ml}mm;
    right: ${mr}mm;
    font-size: 9pt;
    color: #333;
    font-family: inherit;
  }
  .page-header {
    top: ${mt}mm;
    border-bottom: 0.5pt solid #ccc;
    padding-bottom: 3pt;
  }
  .page-footer {
    bottom: ${mb}mm;
    border-top: 0.5pt solid #ccc;
    padding-top: 3pt;
  }
  .page-header p, .page-footer p {
    margin: 0;
    padding: 0;
  }
  /* Page number counters via @page margin boxes */
  @page {
    @bottom-right {
      content: "";
    }
  }
  .ph-seite::before         { content: counter(page); }
  .ph-seiten-gesamt::before { content: counter(pages); }
  /* First page: optionally hide header/footer */
  ${kzFz?.erste_seite_kein_header ? '.first-page .page-header { display: none !important; }' : ''}
  ${kzFz?.erste_seite_kein_footer ? '.first-page .page-footer { display: none !important; }' : ''}
  @media print {
    body { padding-top: 0; padding-bottom: 0; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
${hasHeader ? `<div class="page-header">${headerHtml}</div>` : ''}
${hasFooter ? `<div class="page-footer">${footerHtml}</div>` : ''}
<h1>${escapeHtml(title)}</h1>
${bodyHtml}
</body>
</html>`
}
