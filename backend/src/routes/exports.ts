import { Router } from 'express'
import { query, queryOne } from '../db'
import { authMiddleware } from '../auth'
import { buildPayload, injectIntoText } from '../utils/watermark'
import { buildPdfHtml, buildExportFilename, type ExportContext } from '../utils/exportAssembler'

const router = Router()
router.use(authMiddleware)


interface Block {
  id?: string
  type: 'action' | 'dialogue' | 'parenthetical' | 'transition' | 'shot' | 'direction' | 'character' | 'heading'
  text: string
  character?: string
}

/** Extract plain text from ProseMirror inline content array */
function inlineToText(content: any[]): string {
  if (!Array.isArray(content)) return ''
  return content.map((n: any) => n.text ?? '').join('')
}

/** Resolve content blocks, prepending textbaustein for absatz nodes.
 *  Also handles ProseMirror 'paragraph', 'screenplay_element', 'doc' nodes. */
function resolveBlocks(szene: any, formatMap: Map<string, any>): Block[] {
  // szene.content may be a ProseMirror doc, an array of nodes, or already flat blocks
  let raw: any[]
  if (Array.isArray(szene.content)) {
    raw = szene.content
  } else if (szene.content?.type === 'doc' && Array.isArray(szene.content.content)) {
    raw = szene.content.content
  } else {
    return []
  }

  const blocks: Block[] = []
  for (const node of raw) {
    if (node.type === 'absatz') {
      const fmtId = node.attrs?.format_id
      const fmt = fmtId ? formatMap.get(fmtId) : null
      const text = inlineToText(node.content)
      const prefix = fmt?.textbaustein ? `${fmt.textbaustein} ` : ''
      const nameToType: Record<string, string> = {
        'Szenenueberschrift': 'heading', 'Scene Heading': 'heading',
        'Action': 'action', 'Character': 'character', 'Dialogue': 'dialogue',
        'Parenthetical': 'parenthetical', 'Transition': 'transition', 'Shot': 'shot',
      }
      const blockType = (nameToType[node.attrs?.format_name] ?? 'action') as Block['type']
      blocks.push({ type: blockType, text: prefix + text })
    } else if (node.type === 'screenplay_element') {
      const typeMap: Record<string, Block['type']> = {
        action: 'action', character: 'character', dialogue: 'dialogue',
        parenthetical: 'parenthetical', transition: 'transition', shot: 'shot',
        heading: 'heading', scene_heading: 'heading',
      }
      const blockType = typeMap[node.attrs?.element_type ?? node.attrs?.type] ?? 'action'
      const text = inlineToText(node.content)
      blocks.push({ type: blockType, text })
    } else if (node.type === 'paragraph' || node.type === 'heading') {
      const text = inlineToText(node.content)
      if (text.trim()) blocks.push({ type: 'action', text })
    } else if (typeof node.text === 'string') {
      // legacy flat block
      blocks.push({ type: (node.type as Block['type']) || 'action', text: node.text })
    }
  }
  return blocks
}

function contentToFountain(szenen: any[], formatMap: Map<string, any>): string {
  let out = ''
  for (const szene of szenen) {
    // Scene heading
    const intExt = szene.int_ext || 'INT'
    const ort = szene.ort_name || 'UNBEKANNT'
    const zeit = szene.tageszeit || 'TAG'
    out += `\n${intExt}. ${ort} - ${zeit}\n\n`

    const blocks = resolveBlocks(szene, formatMap)
    for (const block of blocks) {
      switch (block.type) {
        case 'heading':
          out += `\n${(block.text ?? '').toUpperCase()}\n\n`
          break
        case 'action':
          out += `${block.text}\n\n`
          break
        case 'character':
          out += `${' '.repeat(20)}${(block.text ?? '').toUpperCase()}\n`
          break
        case 'parenthetical':
          out += `${' '.repeat(15)}(${block.text})\n`
          break
        case 'dialogue':
          out += `${' '.repeat(10)}${block.text}\n\n`
          break
        case 'transition':
          out += `${' '.repeat(40)}${block.text}\n\n`
          break
        case 'shot':
          out += `${block.text.toUpperCase()}\n\n`
          break
        default:
          out += `${block.text}\n\n`
      }
    }
  }
  return out
}

function contentToFdx(szenen: any[], episodeTitel: string, formatMap: Map<string, any>): string {
  let lines = ['<?xml version="1.0" encoding="UTF-8"?>']
  lines.push('<FinalDraft DocumentType="Script" Template="No" Version="5">')
  lines.push('<Content>')

  for (const szene of szenen) {
    const intExt = szene.int_ext || 'INT'
    const ort = szene.ort_name || 'UNBEKANNT'
    const zeit = szene.tageszeit || 'TAG'

    lines.push(`<Paragraph Type="Scene Heading"><Text>${intExt}. ${ort} - ${zeit}</Text></Paragraph>`)

    const blocks = resolveBlocks(szene, formatMap)
    for (const block of blocks) {
      const typeMap: Record<string, string> = {
        action: 'Action', character: 'Character', dialogue: 'Dialogue',
        parenthetical: 'Parenthetical', transition: 'Transition', shot: 'Shot', heading: 'Scene Heading'
      }
      const fdxType = typeMap[block.type] || 'Action'
      const escaped = block.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      lines.push(`<Paragraph Type="${fdxType}"><Text>${escaped}</Text></Paragraph>`)
    }
  }

  lines.push('</Content>')
  lines.push('</FinalDraft>')
  return lines.join('\n')
}


// ── Export context helpers ────────────────────────────────────────────────────

function buildWerkstufeName(ws: any): string {
  return ws.typ === 'drehbuch' ? 'Drehbuch'
    : ws.typ === 'storyline' ? 'Storyline'
    : 'Notiz'
}

function formatUhrzeit(d: Date): string {
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function formatDatum(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}

function calcBlock(folgeNr: number, data: {
  erste_folge?: number; erster_block?: number; block_label?: string; bloecke?: any[]
}): string | null {
  const bloecke = data.bloecke ?? []
  for (let i = 0; i < bloecke.length; i++) {
    const b = bloecke[i]
    if (b.folge_von != null && b.folge_bis != null && folgeNr >= b.folge_von && folgeNr <= b.folge_bis) {
      if (b.bezeichnung) return b.bezeichnung
      const blockNr = (data.erster_block ?? 1) + i
      return `${data.block_label ?? 'Block'} ${blockNr}`
    }
  }
  return null
}

function formatFolgeLaengeNetto(totalSek: number | null): string | null {
  if (totalSek == null || totalSek <= 0) return null
  const h = Math.floor(totalSek / 3600)
  const m = Math.floor((totalSek % 3600) / 60)
  const s = totalSek % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

async function loadExportContext(ws: any, userId: string, userName: string): Promise<ExportContext> {
  let folge = await queryOne(
    'SELECT folge_nummer, folgen_titel FROM folgen WHERE id = $1',
    [ws.folge_id]
  )
  const prod = await queryOne(
    'SELECT titel, produktion_db_id FROM produktionen WHERE id = $1',
    [ws.produktion_id]
  )
  // terminologie setting → episode label
  const setting = await queryOne(
    "SELECT value FROM app_settings WHERE key = 'terminologie'",
    []
  )
  let episodeTerminus = 'Folge'
  try {
    const t = typeof setting?.value === 'string' ? JSON.parse(setting.value) : setting?.value
    if (t?.episode) episodeTerminus = t.episode
  } catch {}

  const datum = ws.stand_datum
    ? String(ws.stand_datum).slice(0, 10)
    : new Date().toISOString().slice(0, 10)

  // Fetch company info from auth.app (public endpoint, no auth required)
  let firmenname: string | null = null
  let firmenAdresse: string | null = null
  let rechtsform: string | null = null
  let handelsregister: string | null = null
  let ustId: string | null = null
  let geschaeftsfuehrung: string | null = null
  let firmenEmail: string | null = null
  let firmenTelefon: string | null = null
  try {
    const r = await fetch('http://127.0.0.1:3002/api/public/company-info', { signal: AbortSignal.timeout(3000) })
    if (r.ok) {
      const d = await r.json() as any
      firmenname = d?.company_name ?? null
      const addr = d?.company_address
      if (addr) firmenAdresse = [addr.street, `${addr.zip ?? ''} ${addr.city ?? ''}`.trim()].filter(Boolean).join(', ')
      if (d?.company_legal_form) {
        const lfMap: Record<string, string> = { gmbh: 'GmbH', ag: 'AG', kg: 'KG', ohg: 'OHG', gbr: 'GbR', ug: 'UG (haftungsbeschränkt)', se: 'SE', ev: 'e.V.' }
        rechtsform = lfMap[d.company_legal_form.toLowerCase()] ?? d.company_legal_form
      }
      if (d?.company_register_court && d?.company_register_number)
        handelsregister = `${d.company_register_court} ${d.company_register_number}`
      ustId = d?.company_vat_id ?? null
      if (d?.company_management) {
        const mgmt = typeof d.company_management === 'string' ? JSON.parse(d.company_management) : d.company_management
        if (Array.isArray(mgmt)) geschaeftsfuehrung = mgmt.join(', ')
      }
      firmenEmail   = d?.company_email   ?? null
      firmenTelefon = d?.company_phone   ?? null
    }
  } catch { /* non-fatal */ }

  // Format air_date as "Mo. 12.05.2026"
  function formatSendedatum(dateStr: string | null | undefined): string | null {
    if (!dateStr) return null
    try {
      const d = new Date(String(dateStr).slice(0, 10) + 'T12:00:00Z')
      const day  = new Intl.DateTimeFormat('de-DE', { weekday: 'short', timeZone: 'UTC' }).format(d)
      const date = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(d)
      return `${day} ${date}`
    } catch { return null }
  }

  // Fetch production context from produktion.app (sender, buero_adresse, staffelnummer, drehzeitraum, block data)
  let sender: string | null = null
  let bueroAdresse: string | null = null
  let telProduktion: string | null = null
  let produktionszeitraum: string | null = null
  let staffel: string | null = null
  let block: string | null = null
  const produktionDbId = prod?.produktion_db_id
  if (produktionDbId) {
    try {
      const secret = process.env.PRODUKTION_INTERNAL_SECRET ?? 'prod-internal-2026'
      const r = await fetch(
        `http://127.0.0.1:3005/api/internal/productions/${produktionDbId}/script-context`,
        { headers: { 'x-internal-key': secret }, signal: AbortSignal.timeout(3000) }
      )
      if (r.ok) {
        const d = await r.json() as any
        sender             = d?.sender        ?? null
        bueroAdresse       = d?.buero_adresse ?? null
        telProduktion      = d?.telefon       ?? null
        produktionszeitraum = d?.drehzeitraum ?? null
        staffel            = d?.staffelnummer != null ? String(d.staffelnummer) : null
        if (folge?.folge_nummer) {
          block = calcBlock(folge.folge_nummer, {
            erste_folge:  d?.erste_folge,
            erster_block: d?.erster_block,
            block_label:  d?.block_label,
            bloecke:      Array.isArray(d?.bloecke) ? d.bloecke : [],
          })
        }
      }
      // Fetch real air_date from broadcast_events (via reihen_id)
      if (folge?.folge_nummer) {
        try {
          const ar = await fetch(
            `http://127.0.0.1:3005/api/internal/productions/${produktionDbId}/air-date?folge_nr=${folge.folge_nummer}`,
            { headers: { 'x-internal-key': secret }, signal: AbortSignal.timeout(3000) }
          )
          if (ar.ok) {
            const ad = await ar.json() as any
            folge = { ...folge, _air_date: ad?.air_date ?? null }
          }
        } catch { /* non-fatal */ }
      }
    } catch { /* non-fatal */ }
  }

  // Sum stoppzeit_sek for this werkstufe (netto length)
  let folgeLaengeNetto: string | null = null
  try {
    const sumRow = await queryOne(
      'SELECT COALESCE(SUM(stoppzeit_sek), 0)::int AS total FROM dokument_szenen WHERE werkstufe_id = $1 AND geloescht = false',
      [ws.id]
    )
    folgeLaengeNetto = formatFolgeLaengeNetto(sumRow?.total ?? null)
  } catch { /* non-fatal */ }

  const now = new Date()
  return {
    produktion:       prod?.titel ?? '',
    staffel,
    block,
    folge:            folge?.folge_nummer ?? null,
    folgentitel:      folge?.folgen_titel ?? null,
    werkstufe:        buildWerkstufeName(ws),
    fassung:          ws.label ?? null,
    version:          ws.version_nummer ?? null,
    stand_datum:      datum,
    autor:            userName,
    regie:            null,
    firmenname,
    sender,
    buero_adresse:       bueroAdresse,
    tel_produktion:      telProduktion,
    sendedatum:          formatSendedatum(folge?._air_date),
    produktionszeitraum,
    aktuelles_datum:     formatDatum(now),
    aktuelles_jahr:      now.getFullYear().toString(),
    aktuelles_uhrzeit:   formatUhrzeit(now),
    folge_laenge_netto:  folgeLaengeNetto,
    firmen_adresse:      firmenAdresse,
    rechtsform,
    handelsregister,
    ust_id:              ustId,
    geschaeftsfuehrung,
    firmen_email:        firmenEmail,
    firmen_telefon:      firmenTelefon,
    episode_terminus: episodeTerminus,
  }
}

async function loadKzFzConfig(produktionId: string, werkstufeTyp: string) {
  return queryOne(
    `SELECT * FROM kopf_fusszeilen_defaults
     WHERE produktion_id = $1 AND werkstufe_typ = $2`,
    [produktionId, werkstufeTyp]
  )
}

// ── Werkstufe-based exports (v43 Werkstufen-Modell) ─────────────────────────

/** Load absatzformate for a production as Map<id, {name, textbaustein}> */
async function loadFormatMap(produktionId: string): Promise<Map<string, any>> {
  const rows = await query(
    'SELECT id, name, textbaustein FROM absatzformate WHERE produktion_id = $1',
    [produktionId]
  )
  return new Map(rows.map((r: any) => [r.id, r]))
}

async function logWerkstufenExport(userId: string, userName: string, werkId: string, format: string): Promise<string> {
  const result = await queryOne(
    `INSERT INTO export_logs (user_id, user_name, stage_label, staffel_id, format, werkstufe_id)
     SELECT $1, $2, COALESCE(w.label, w.typ || ' V' || w.version_nummer), f.produktion_id, $3, w.id
     FROM werkstufen w JOIN folgen f ON f.id = w.folge_id
     WHERE w.id = $4
     RETURNING id`,
    [userId, userName, format, werkId]
  )
  return result?.id as string
}

interface LnInjectCfg {
  marginCm: number
  ml: number          // page left margin in mm
  fontFamily: string
  fontSizePt: number
  color: string
}

/**
 * Injects zero-height line-number markers before every 5th content block
 * in the export HTML. Counts <div class="scene-heading|action|..."> elements.
 * The marker uses position:relative + an absolute-positioned span that floats
 * into the page's left margin area.
 */
function injectLineNumbers(html: string, cfg: LnInjectCfg): string {
  let count = 0
  // marginCm = gap between number's right edge and text's left edge.
  // The span's parent is a position:relative div inside the text flow (left edge = text left).
  // We go back to the physical page edge, then use (pageMargin - gap) as column width.
  const spanStyle =
    `position:absolute;` +
    `left:calc(-${cfg.ml}mm);` +
    `width:calc(${cfg.ml}mm - ${cfg.marginCm}cm);` +
    `text-align:right;` +
    `font-family:${cfg.fontFamily};` +
    `font-size:${cfg.fontSizePt}pt;` +
    `color:${cfg.color};` +
    `top:0.2em;pointer-events:none`
  const wrapStyle = `height:0;overflow:visible;position:relative`

  return html.replace(
    /<div class="(scene-heading|action|character|dialogue|parenthetical|transition|shot|heading)">/g,
    (match) => {
      count++
      if (count % 5 !== 0) return match
      return `<div style="${wrapStyle}"><span style="${spanStyle}">${count}</span></div>${match}`
    }
  )
}

function formatStoppzeit(sek: number | null): string {
  if (!sek) return ''
  const min = Math.floor(sek / 60)
  const s = sek % 60
  return `${String(min).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// GET /api/werkstufen/:id/export/fountain
router.get('/werkstufe/:werkId/export/fountain', async (req, res) => {
  try {
    const ws = await queryOne(
      `SELECT w.*, f.produktion_id, f.folge_nummer, f.folgen_titel, p.titel AS prod_titel FROM werkstufen w
       JOIN folgen f ON f.id = w.folge_id
       JOIN produktionen p ON p.id = f.produktion_id
       WHERE w.id = $1`,
      [req.params.werkId]
    )
    if (!ws) return res.status(404).json({ error: 'Werkstufe nicht gefunden' })

    const [szenen, formatMap, ctx] = await Promise.all([
      query('SELECT * FROM dokument_szenen WHERE werkstufe_id = $1 AND geloescht = false ORDER BY sort_order, scene_nummer', [req.params.werkId]),
      loadFormatMap(ws.produktion_id),
      loadExportContext(ws, req.user!.user_id, req.user!.name),
    ])

    const exportId = await logWerkstufenExport(req.user!.user_id, req.user!.name, ws.id, 'fountain')
    const payload = buildPayload(req.user!.user_id, exportId)
    const fountain = injectIntoText(contentToFountain(szenen, formatMap), payload)

    const filename = buildExportFilename(ws,
      { folge_nummer: ws.folge_nummer, folgen_titel: ws.folgen_titel },
      { titel: ws.prod_titel }, ctx.episode_terminus, 'fountain')
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(fountain)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/werkstufen/:id/export/fdx
router.get('/werkstufe/:werkId/export/fdx', async (req, res) => {
  try {
    const ws = await queryOne(
      `SELECT w.*, f.produktion_id, f.folge_nummer, f.folgen_titel, p.titel AS prod_titel FROM werkstufen w
       JOIN folgen f ON f.id = w.folge_id
       JOIN produktionen p ON p.id = f.produktion_id
       WHERE w.id = $1`,
      [req.params.werkId]
    )
    if (!ws) return res.status(404).json({ error: 'Werkstufe nicht gefunden' })

    const [szenen, formatMap, ctx] = await Promise.all([
      query('SELECT * FROM dokument_szenen WHERE werkstufe_id = $1 AND geloescht = false ORDER BY sort_order, scene_nummer', [req.params.werkId]),
      loadFormatMap(ws.produktion_id),
      loadExportContext(ws, req.user!.user_id, req.user!.name),
    ])

    const exportId = await logWerkstufenExport(req.user!.user_id, req.user!.name, ws.id, 'fdx')
    const payload = buildPayload(req.user!.user_id, exportId)
    const wm = require('../utils/watermark').encodeWatermark(payload)
    let fdx = contentToFdx(szenen, ws.label || 'Drehbuch', formatMap)
    fdx = fdx.replace('<Content>', `<!-- ${wm} -->\n<Content>`)

    const filename = buildExportFilename(ws,
      { folge_nummer: ws.folge_nummer, folgen_titel: ws.folgen_titel },
      { titel: ws.prod_titel }, ctx.episode_terminus, 'fdx')
    res.setHeader('Content-Type', 'application/xml')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(fdx)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/werkstufen/:id/export/pdf
router.get('/werkstufe/:werkId/export/pdf', async (req, res) => {
  try {
    const ws = await queryOne(
      `SELECT w.*, f.produktion_id, f.folge_nummer, f.folgen_titel, p.titel AS prod_titel FROM werkstufen w
       JOIN folgen f ON f.id = w.folge_id
       JOIN produktionen p ON p.id = f.produktion_id
       WHERE w.id = $1`,
      [req.params.werkId]
    )
    if (!ws) return res.status(404).json({ error: 'Werkstufe nicht gefunden' })

    const [szenen, formatMap, ctx, kzFz] = await Promise.all([
      query('SELECT * FROM dokument_szenen WHERE werkstufe_id = $1 AND geloescht = false ORDER BY sort_order, scene_nummer', [req.params.werkId]),
      loadFormatMap(ws.produktion_id),
      loadExportContext(ws, req.user!.user_id, req.user!.name),
      loadKzFzConfig(ws.produktion_id, ws.typ),
    ])

    const exportId = await logWerkstufenExport(req.user!.user_id, req.user!.name, ws.id, 'pdf')
    const payload = buildPayload(req.user!.user_id, exportId)
    const wm = require('../utils/watermark').encodeWatermark(payload)

    const title = ws.label || `${ctx.episode_terminus} ${ctx.folge} ${ws.typ === 'drehbuch' ? 'Drehbuch' : ws.typ} V${ws.version_nummer}`

    // Build scene body HTML
    let bodyHtml = ''
    for (const szene of szenen) {
      const intExt = szene.int_ext || 'INT'
      const ort    = szene.ort_name || 'UNBEKANNT'
      const zeit   = szene.tageszeit || 'TAG'
      const stoppzeit = szene.stoppzeit_sek
        ? `<span class="stoppzeit">${formatStoppzeit(szene.stoppzeit_sek)}</span>`
        : ''
      bodyHtml += `<div class="scene-heading">${szene.scene_nummer ? szene.scene_nummer + '. ' : ''}${intExt}. ${ort} - ${zeit}${stoppzeit}</div>`
      const blocks = resolveBlocks(szene, formatMap)
      for (const block of blocks) {
        const cls = block.type === 'heading' ? 'heading' : block.type
        const escaped = String(block.text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        bodyHtml += `<div class="${cls}">${escaped}</div>`
      }
    }

    // Optional line numbers
    if (req.query.lineNumbers === '1') {
      const lnMarginCm = Math.max(0.5, Math.min(5, parseFloat(req.query.lnMarginCm as string || '1') || 1))
      const ml = kzFz?.seiten_layout?.margin_left ?? 30
      let fontFamily = "'Courier New', monospace"
      let fontSizePt = 10
      let color      = '#999999'
      try {
        const lnRow = await queryOne(
          `SELECT value FROM production_app_settings WHERE production_id = $1 AND key = 'ln_settings'`,
          [ws.produktion_id]
        )
        if (lnRow?.value) {
          const s = typeof lnRow.value === 'string' ? JSON.parse(lnRow.value) : lnRow.value
          if (s.fontFamily) fontFamily = s.fontFamily
          if (s.fontSizePt) fontSizePt = Number(s.fontSizePt)
          if (s.color)      color      = s.color
        }
      } catch {}
      bodyHtml = injectLineNumbers(bodyHtml, { marginCm: lnMarginCm, ml, fontFamily, fontSizePt, color })
    }

    const html = buildPdfHtml({ title, bodyHtml, kzFz, ctx, watermarkMeta: wm })

    const filename = buildExportFilename(ws,
      { folge_nummer: ws.folge_nummer, folgen_titel: ws.folgen_titel },
      { titel: ws.prod_titel }, ctx.episode_terminus, 'html')
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('X-Export-Type', 'pdf-source')
    res.send(html)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/werkstufe/:werkId/export/filename — returns suggested filename for a Werkstufe
router.get('/werkstufe/:werkId/export/filename', async (req, res) => {
  try {
    const ws = await queryOne(
      `SELECT w.*, f.produktion_id, f.folge_nummer, f.folgen_titel, p.titel AS prod_titel
       FROM werkstufen w
       JOIN folgen f ON f.id = w.folge_id
       JOIN produktionen p ON p.id = f.produktion_id
       WHERE w.id = $1`,
      [req.params.werkId]
    )
    if (!ws) return res.status(404).json({ error: 'Werkstufe nicht gefunden' })

    const setting = await queryOne("SELECT value FROM app_settings WHERE key = 'terminologie'", [])
    let episodeTerminus = 'Folge'
    try {
      const t = typeof setting?.value === 'string' ? JSON.parse(setting.value) : setting?.value
      if (t?.episode) episodeTerminus = t.episode
    } catch {}

    const base = buildExportFilename(
      ws,
      { folge_nummer: ws.folge_nummer, folgen_titel: ws.folgen_titel },
      { titel: ws.prod_titel },
      episodeTerminus,
      'pdf'
    )
    res.json({ filename: base, folge_id: ws.folge_id, typ: ws.typ, version_nummer: ws.version_nummer })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── Replacement Pages Export ──────────────────────────────────────────────────

/**
 * Extract plain text from a ProseMirror node tree (recursive).
 */
function nodeText(node: any): string {
  if (!node) return ''
  if (node.text) return node.text
  if (Array.isArray(node.content)) return node.content.map(nodeText).join('')
  return ''
}

/**
 * Get flat list of { text } objects from a dokument_szene's content.
 */
function contentBlocks(content: any): { text: string }[] {
  const raw: any[] = Array.isArray(content)
    ? content
    : (content?.content ?? [])
  return raw.map((n: any) => ({ text: nodeText(n).trim() }))
}

/**
 * Returns indices of blocks that differ between oldBlocks and newBlocks.
 * New blocks without an old counterpart are always marked changed.
 */
function diffBlockIndices(oldBlocks: { text: string }[], newBlocks: { text: string }[]): Set<number> {
  const changed = new Set<number>()
  for (let i = 0; i < newBlocks.length; i++) {
    if ((oldBlocks[i]?.text ?? '') !== newBlocks[i].text) changed.add(i)
  }
  return changed
}

function escHtml(s: string): string {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildReplacementPagesHtml(opts: {
  changedScenes: Array<{
    szene: any
    blocks: Array<{ text: string; type: string }>
    changedIdx: Set<number>
    isNew: boolean
  }>
  memos: Array<{ szene: any; changedIdx: Set<number>; blocks: Array<{ text: string; type: string }> }>
  newWs: any
  compareWs: any
  revisionColor: string
  revisionLabel: string
  prodTitel: string
  folgeNummer: number | null
  episodeTerminus: string
  formatMap: Map<string, any>
}): string {
  const { changedScenes, memos, newWs, compareWs, revisionColor, revisionLabel,
    prodTitel, folgeNummer, episodeTerminus } = opts

  const date = new Date().toLocaleDateString('de-DE')
  const colorSafe = escHtml(revisionColor)
  const labelSafe = escHtml(revisionLabel)

  const css = `
    @page { margin: 25mm 30mm 20mm 30mm; }
    body { font-family: 'Courier New', monospace; font-size: 12pt; color: #000; margin: 0; }
    .rp-cover { text-align: center; padding-top: 40mm; page-break-after: always; }
    .rp-cover h1 { font-size: 18pt; color: ${colorSafe}; letter-spacing: 0.1em; margin-bottom: 8pt; }
    .rp-cover .meta { font-size: 11pt; color: #555; margin-top: 4pt; }
    .rp-scene { page-break-before: always; padding-right: 20px; position: relative; }
    .rp-scene-heading { font-weight: bold; text-transform: uppercase; margin-bottom: 6pt; border-bottom: 1px solid #ccc; padding-bottom: 3pt; }
    .rp-scene-heading .scene-nr { color: ${colorSafe}; margin-right: 6px; font-weight: 900; }
    .rp-scene-heading .new-tag { font-size: 9pt; color: ${colorSafe}; border: 1px solid ${colorSafe}; padding: 0 4px; border-radius: 3px; margin-left: 6px; font-weight: normal; }
    .rp-block { margin-bottom: 3pt; position: relative; }
    .rp-block.character { text-align: center; font-weight: bold; margin-top: 6pt; }
    .rp-block.parenthetical { text-align: center; font-style: italic; }
    .rp-block.dialogue { margin: 0 15%; }
    .rp-block.transition { text-align: right; }
    .rp-changed { }
    .rp-changed::after {
      content: '*';
      position: absolute;
      right: -14px;
      top: 0;
      color: ${colorSafe};
      font-weight: 900;
      font-size: 14pt;
      line-height: 1;
    }
    .rp-memo-section { page-break-before: always; }
    .rp-memo-section h2 { font-size: 13pt; color: ${colorSafe}; border-bottom: 2px solid ${colorSafe}; padding-bottom: 4pt; }
    .rp-memo { margin-bottom: 14pt; padding: 8pt 12pt; border-left: 3px solid ${colorSafe}; background: #fafafa; }
    .rp-memo .memo-head { font-weight: bold; font-size: 10pt; margin-bottom: 4pt; }
    .rp-memo .memo-old { text-decoration: line-through; color: #999; font-size: 10pt; }
    .rp-memo .memo-new { font-weight: bold; color: ${colorSafe}; font-size: 10pt; }
    .rp-no-changes { text-align: center; padding: 40mm 0; color: #888; font-size: 13pt; }
  `

  let body = `<!DOCTYPE html>\n<html lang="de">\n<head>\n<meta charset="UTF-8">\n<title>Revisionsseiten — ${labelSafe}</title>\n<style>${css}</style>\n</head>\n<body>\n`

  // Cover page
  body += `<div class="rp-cover">
    <h1>REVISIONSSEITEN</h1>
    <div class="meta">${labelSafe}</div>
    <div class="meta">${escHtml(prodTitel)} · ${escHtml(episodeTerminus)} ${folgeNummer ?? ''}</div>
    <div class="meta" style="margin-top:8pt">${escHtml(newWs.typ || '')} V${newWs.version_nummer} vs. V${compareWs.version_nummer}</div>
    <div class="meta">${date}</div>
    <div class="meta" style="margin-top:24pt;color:${colorSafe};font-size:10pt">${changedScenes.length} geänderte Szene${changedScenes.length !== 1 ? 'n' : ''}${memos.length > 0 ? ` · ${memos.length} Memo${memos.length !== 1 ? 's' : ''}` : ''}</div>
  </div>\n`

  if (changedScenes.length === 0 && memos.length === 0) {
    body += `<div class="rp-no-changes">Keine Änderungen gefunden.</div>\n`
  }

  // Full changed scenes
  for (const { szene, blocks, changedIdx, isNew } of changedScenes) {
    const ie = szene.int_ext || 'INT'
    const ort = szene.ort_name || 'UNBEKANNT'
    const zeit = szene.tageszeit || 'TAG'
    const nr = szene.scene_nummer ? String(szene.scene_nummer) : ''
    body += `<div class="rp-scene">
    <div class="rp-scene-heading"><span class="scene-nr">${escHtml(nr)}.</span>${escHtml(ie)}. ${escHtml(ort)} — ${escHtml(zeit)}${isNew ? '<span class="new-tag">NEU</span>' : ''}</div>\n`
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i]
      const changed = changedIdx.has(i)
      const cls = `rp-block ${b.type}${changed ? ' rp-changed' : ''}`
      body += `  <div class="${cls}">${escHtml(b.text)}</div>\n`
    }
    body += `</div>\n`
  }

  // MEMO section
  if (memos.length > 0) {
    body += `<div class="rp-memo-section"><h2>Änderungsmemos</h2>\n`
    for (const { szene, changedIdx, blocks } of memos) {
      const ie = szene.int_ext || 'INT'
      const ort = szene.ort_name || 'UNBEKANNT'
      const nr = szene.scene_nummer ? `${szene.scene_nummer}. ` : ''
      body += `<div class="rp-memo"><div class="memo-head">${escHtml(nr)}${escHtml(ie)}. ${escHtml(ort)}</div>\n`
      for (const idx of changedIdx) {
        const b = blocks[idx]
        if (!b) continue
        body += `  <div class="memo-new">+ ${escHtml(b.text)}</div>\n`
      }
      body += `</div>\n`
    }
    body += `</div>\n`
  }

  body += `</body>\n</html>`
  return body
}

// GET /api/werkstufe/:werkId/export/replacement-pages
router.get('/werkstufe/:werkId/export/replacement-pages', async (req, res) => {
  const compareWerkId = req.query.compareWerkId as string | undefined
  if (!compareWerkId) return res.status(400).json({ error: 'compareWerkId query param required' })

  const threshold = Math.max(0, parseInt((req.query.threshold as string) || '100') || 100)
  const revisionColor = (req.query.revisionColor as string) || '#FF3B30'
  const revisionLabel = (req.query.revisionLabel as string) || 'Revision'

  try {
    // Load both werkstufen
    const [newWs, compareWs] = await Promise.all([
      queryOne(
        `SELECT w.*, f.produktion_id, f.folge_nummer, f.folgen_titel, p.titel AS prod_titel
         FROM werkstufen w JOIN folgen f ON f.id = w.folge_id JOIN produktionen p ON p.id = f.produktion_id
         WHERE w.id = $1`,
        [req.params.werkId]
      ),
      queryOne(
        `SELECT w.*, f.produktion_id, f.folge_id FROM werkstufen w JOIN folgen f ON f.id = w.folge_id WHERE w.id = $1`,
        [compareWerkId]
      ),
    ])
    if (!newWs) return res.status(404).json({ error: 'Werkstufe nicht gefunden' })
    if (!compareWs) return res.status(404).json({ error: 'Vergleichs-Werkstufe nicht gefunden' })
    if (newWs.folge_id !== compareWs.folge_id) {
      return res.status(400).json({ error: 'Werkstufen gehören nicht zur selben Folge' })
    }

    // Load scenes for both werkstufen
    const [newScenes, oldScenes, formatMap] = await Promise.all([
      query(
        `SELECT * FROM dokument_szenen WHERE werkstufe_id = $1 AND geloescht = false ORDER BY sort_order, scene_nummer`,
        [req.params.werkId]
      ),
      query(
        `SELECT * FROM dokument_szenen WHERE werkstufe_id = $1 AND geloescht = false`,
        [compareWerkId]
      ),
      loadFormatMap(newWs.produktion_id),
    ])

    // Index old scenes by scene_identity_id
    const oldByIdentity = new Map<string, any>()
    for (const s of oldScenes) {
      if (s.scene_identity_id) oldByIdentity.set(s.scene_identity_id, s)
    }

    const changedScenes: Array<{
      szene: any; blocks: Array<{ text: string; type: string }>
      changedIdx: Set<number>; isNew: boolean
    }> = []
    const memos: Array<{
      szene: any; changedIdx: Set<number>; blocks: Array<{ text: string; type: string }>
    }> = []

    for (const szene of newScenes) {
      const oldSzene = szene.scene_identity_id ? oldByIdentity.get(szene.scene_identity_id) : null
      const newBlocks = resolveBlocks(szene, formatMap).map(b => ({ text: b.text, type: b.type }))
      const oldSimple = oldSzene ? resolveBlocks(oldSzene, formatMap).map(b => ({ text: b.text })) : []

      const isNew = !oldSzene
      const changedIdx = isNew
        ? new Set<number>(newBlocks.map((_, i) => i))
        : diffBlockIndices(oldSimple, newBlocks.map(b => ({ text: b.text })))

      if (changedIdx.size === 0) continue

      // Measure changed characters
      let changedChars = 0
      for (const idx of changedIdx) {
        changedChars += (newBlocks[idx]?.text ?? '').length
      }

      if (!isNew && changedChars < threshold) {
        memos.push({ szene, changedIdx, blocks: newBlocks })
      } else {
        changedScenes.push({ szene, blocks: newBlocks, changedIdx, isNew })
      }
    }

    const setting = await queryOne("SELECT value FROM app_settings WHERE key = 'terminologie'", [])
    let episodeTerminus = 'Folge'
    try {
      const t = typeof setting?.value === 'string' ? JSON.parse(setting.value) : setting?.value
      if (t?.episode) episodeTerminus = t.episode
    } catch {}

    const html = buildReplacementPagesHtml({
      changedScenes, memos, newWs, compareWs,
      revisionColor, revisionLabel,
      prodTitel: newWs.prod_titel ?? '',
      folgeNummer: newWs.folge_nummer,
      episodeTerminus,
      formatMap,
    })

    await logWerkstufenExport(req.user!.user_id, req.user!.name, newWs.id, 'replacement-pages')

    const safeLabel = revisionLabel.replace(/[^a-zA-Z0-9äöüÄÖÜß\-_ ]/g, '').trim() || 'Revision'
    const filename = `${newWs.prod_titel ?? 'Export'} - Folge ${newWs.folge_nummer ?? ''} - ${safeLabel} - Revisionsseiten.html`
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(html)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default router
