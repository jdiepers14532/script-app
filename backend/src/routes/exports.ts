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

async function loadExportContext(ws: any, userId: string, userName: string): Promise<ExportContext> {
  const folge = await queryOne(
    'SELECT folge_nummer, folgen_titel FROM folgen WHERE id = $1',
    [ws.folge_id]
  )
  const prod = await queryOne(
    'SELECT titel FROM produktionen WHERE id = $1',
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

  return {
    produktion:       prod?.titel ?? '',
    staffel:          null,
    block:            null,
    folge:            folge?.folge_nummer ?? null,
    folgentitel:      folge?.folgen_titel ?? null,
    fassung:          ws.label ?? null,
    version:          ws.version_nummer ?? null,
    stand_datum:      datum,
    autor:            userName,
    regie:            null,
    firmenname:       null,
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
      `SELECT w.*, f.produktion_id, f.folge_id, f.folge_nummer, f.folgen_titel, p.titel AS prod_titel FROM werkstufen w
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
    res.json({ filename: base })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default router
