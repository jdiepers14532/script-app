import { Router } from 'express'
import { query, queryOne } from '../db'
import { authMiddleware } from '../auth'
import { buildPayload, injectIntoText } from '../utils/watermark'

const router = Router()
router.use(authMiddleware)

async function logExport(userId: string, userName: string, stage: any, format: string): Promise<string> {
  const result = await queryOne(
    `INSERT INTO export_logs (user_id, user_name, stage_id, stage_label, produktion_id, format)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [userId, userName, stage.id, stage.version_label || stage.stage_type, stage.produktion_id, format]
  )
  return result?.id as string
}

interface Block {
  id: string
  type: 'action' | 'dialogue' | 'parenthetical' | 'transition' | 'shot' | 'direction' | 'character' | 'heading'
  text: string
  character?: string
}

function contentToFountain(szenen: any[]): string {
  let out = ''
  for (const szene of szenen) {
    // Scene heading
    const intExt = szene.int_ext || 'INT'
    const ort = szene.ort_name || 'UNBEKANNT'
    const zeit = szene.tageszeit || 'TAG'
    out += `\n${intExt}. ${ort} - ${zeit}\n\n`

    const blocks: Block[] = Array.isArray(szene.content) ? szene.content : []
    for (const block of blocks) {
      switch (block.type) {
        case 'heading':
          out += `\n${block.text.toUpperCase()}\n\n`
          break
        case 'action':
          out += `${block.text}\n\n`
          break
        case 'character':
          out += `${' '.repeat(20)}${block.text.toUpperCase()}\n`
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

function contentToFdx(szenen: any[], episodeTitel: string): string {
  let lines = ['<?xml version="1.0" encoding="UTF-8"?>']
  lines.push('<FinalDraft DocumentType="Script" Template="No" Version="5">')
  lines.push('<Content>')

  for (const szene of szenen) {
    const intExt = szene.int_ext || 'INT'
    const ort = szene.ort_name || 'UNBEKANNT'
    const zeit = szene.tageszeit || 'TAG'

    lines.push(`<Paragraph Type="Scene Heading"><Text>${intExt}. ${ort} - ${zeit}</Text></Paragraph>`)

    const blocks: Block[] = Array.isArray(szene.content) ? szene.content : []
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

// GET /api/stages/:id/export/fountain
router.get('/:stageId/export/fountain', async (req, res) => {
  try {
    const stage = await queryOne('SELECT * FROM stages WHERE id = $1', [req.params.stageId])
    if (!stage) return res.status(404).json({ error: 'Stage nicht gefunden' })
    const szenen = await query('SELECT * FROM szenen WHERE stage_id = $1 ORDER BY sort_order, scene_nummer', [req.params.stageId])
    const exportId = await logExport(req.user!.user_id, req.user!.name, stage, 'fountain')
    const payload = buildPayload(req.user!.user_id, exportId)
    const fountain = injectIntoText(contentToFountain(szenen), payload)
    const label = (stage.version_label || stage.stage_type || 'fassung').replace(/[^a-zA-Z0-9_-]/g, '_')
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${label}.fountain"`)
    res.send(fountain)
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

// GET /api/stages/:id/export/fdx
router.get('/:stageId/export/fdx', async (req, res) => {
  try {
    const stage = await queryOne('SELECT * FROM stages WHERE id = $1', [req.params.stageId])
    if (!stage) return res.status(404).json({ error: 'Stage nicht gefunden' })
    const szenen = await query('SELECT * FROM szenen WHERE stage_id = $1 ORDER BY sort_order, scene_nummer', [req.params.stageId])
    const exportId = await logExport(req.user!.user_id, req.user!.name, stage, 'fdx')
    const payload = buildPayload(req.user!.user_id, exportId)
    const wm = require('../utils/watermark').encodeWatermark(payload)
    let fdx = contentToFdx(szenen, stage.version_label || 'Drehbuch')
    fdx = fdx.replace('<Content>', `<!-- ${wm} -->\n<Content>`)
    const label = (stage.version_label || stage.stage_type || 'fassung').replace(/[^a-zA-Z0-9_-]/g, '_')
    res.setHeader('Content-Type', 'application/xml')
    res.setHeader('Content-Disposition', `attachment; filename="${label}.fdx"`)
    res.send(fdx)
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

// GET /api/stages/:id/export/pdf
router.get('/:stageId/export/pdf', async (req, res) => {
  try {
    const stage = await queryOne('SELECT * FROM stages WHERE id = $1', [req.params.stageId])
    if (!stage) return res.status(404).json({ error: 'Stage nicht gefunden' })
    const szenen = await query('SELECT * FROM szenen WHERE stage_id = $1 ORDER BY sort_order, scene_nummer', [req.params.stageId])
    const exportId = await logExport(req.user!.user_id, req.user!.name, stage, 'pdf')
    const payload = buildPayload(req.user!.user_id, exportId)
    const wm = require('../utils/watermark').encodeWatermark(payload)
    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="wm" content="${wm}">
<style>body{font-family:"Courier New",monospace;font-size:12pt;margin:1.5cm 2.5cm;line-height:1.5}.heading{font-weight:bold;text-transform:uppercase;margin:20px 0 10px}.action{margin:0 0 10px}.character{margin-left:40%;margin-bottom:0;font-weight:bold}.parenthetical{margin-left:30%;margin-right:30%;font-style:italic}.dialogue{margin-left:20%;margin-right:20%}.transition{text-align:right;font-weight:bold}.shot{font-weight:bold}h1{text-align:center;border-bottom:1px solid #000;padding-bottom:10px}.scene-heading{font-weight:bold;text-transform:uppercase;background:#f0f0f0;padding:5px;margin:20px 0 10px}</style></head><body>
<h1>${stage.version_label || 'Drehbuch'}</h1>`
    for (const szene of szenen) {
      html += `<div class="scene-heading">${szene.scene_nummer}. ${szene.int_ext || 'INT'}. ${szene.ort_name || 'UNBEKANNT'} - ${szene.tageszeit || 'TAG'}</div>`
      const blocks: Block[] = Array.isArray(szene.content) ? szene.content : []
      for (const block of blocks) {
        const cls = block.type === 'heading' ? 'heading' : block.type
        const escaped = String(block.text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        html += `<div class="${cls}">${escaped}</div>`
      }
    }
    html += '</body></html>'
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('X-Export-Type', 'pdf-source')
    res.send(html)
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

// ── Fassung-based exports (new dokument_szenen system) ──────────────────────

async function logFassungExport(userId: string, userName: string, fassungId: string, format: string): Promise<string> {
  const result = await queryOne(
    `INSERT INTO export_logs (user_id, user_name, stage_label, produktion_id, format)
     SELECT $1, $2, COALESCE(f.fassung_label, 'Fassung ' || f.fassung_nummer), d.produktion_id, $3
     FROM folgen_dokument_fassungen f JOIN folgen_dokumente d ON d.id = f.dokument_id
     WHERE f.id = $4
     RETURNING id`,
    [userId, userName, format, fassungId]
  )
  return result?.id as string
}

// GET /api/fassungen/:id/export/fountain
router.get('/fassung/:fassungId/export/fountain', async (req, res) => {
  try {
    const fassung = await queryOne(
      `SELECT f.*, d.typ, d.produktion_id FROM folgen_dokument_fassungen f
       JOIN folgen_dokumente d ON d.id = f.dokument_id WHERE f.id = $1`,
      [req.params.fassungId]
    )
    if (!fassung) return res.status(404).json({ error: 'Fassung nicht gefunden' })

    const szenen = await query(
      'SELECT * FROM dokument_szenen WHERE fassung_id = $1 ORDER BY sort_order, scene_nummer',
      [req.params.fassungId]
    )

    const exportId = await logFassungExport(req.user!.user_id, req.user!.name, fassung.id, 'fountain')
    const payload = buildPayload(req.user!.user_id, exportId)
    const fountain = injectIntoText(contentToFountain(szenen), payload)

    const label = (fassung.fassung_label || `Fassung_${fassung.fassung_nummer}`).replace(/[^a-zA-Z0-9_-]/g, '_')
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${label}.fountain"`)
    res.send(fountain)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/fassungen/:id/export/fdx
router.get('/fassung/:fassungId/export/fdx', async (req, res) => {
  try {
    const fassung = await queryOne(
      `SELECT f.*, d.typ FROM folgen_dokument_fassungen f
       JOIN folgen_dokumente d ON d.id = f.dokument_id WHERE f.id = $1`,
      [req.params.fassungId]
    )
    if (!fassung) return res.status(404).json({ error: 'Fassung nicht gefunden' })

    const szenen = await query(
      'SELECT * FROM dokument_szenen WHERE fassung_id = $1 ORDER BY sort_order, scene_nummer',
      [req.params.fassungId]
    )

    const exportId = await logFassungExport(req.user!.user_id, req.user!.name, fassung.id, 'fdx')
    const payload = buildPayload(req.user!.user_id, exportId)
    const wm = require('../utils/watermark').encodeWatermark(payload)
    let fdx = contentToFdx(szenen, fassung.fassung_label || 'Drehbuch')
    fdx = fdx.replace('<Content>', `<!-- ${wm} -->\n<Content>`)

    const label = (fassung.fassung_label || `Fassung_${fassung.fassung_nummer}`).replace(/[^a-zA-Z0-9_-]/g, '_')
    res.setHeader('Content-Type', 'application/xml')
    res.setHeader('Content-Disposition', `attachment; filename="${label}.fdx"`)
    res.send(fdx)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/fassungen/:id/export/pdf
router.get('/fassung/:fassungId/export/pdf', async (req, res) => {
  try {
    const fassung = await queryOne(
      `SELECT f.*, d.typ FROM folgen_dokument_fassungen f
       JOIN folgen_dokumente d ON d.id = f.dokument_id WHERE f.id = $1`,
      [req.params.fassungId]
    )
    if (!fassung) return res.status(404).json({ error: 'Fassung nicht gefunden' })

    const szenen = await query(
      'SELECT * FROM dokument_szenen WHERE fassung_id = $1 ORDER BY sort_order, scene_nummer',
      [req.params.fassungId]
    )

    const exportId = await logFassungExport(req.user!.user_id, req.user!.name, fassung.id, 'pdf')
    const payload = buildPayload(req.user!.user_id, exportId)
    const wm = require('../utils/watermark').encodeWatermark(payload)

    const title = fassung.fassung_label || 'Drehbuch'
    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="wm" content="${wm}">
<style>
  body { font-family: "Courier New", monospace; font-size: 12pt; margin: 1.5cm 2.5cm; line-height: 1.5; }
  .heading { font-weight: bold; text-transform: uppercase; margin: 20px 0 10px; }
  .action { margin: 0 0 10px; }
  .character { margin-left: 40%; margin-bottom: 0; font-weight: bold; }
  .parenthetical { margin-left: 30%; margin-right: 30%; font-style: italic; }
  .dialogue { margin-left: 20%; margin-right: 20%; }
  .transition { text-align: right; font-weight: bold; }
  .shot { font-weight: bold; }
  h1 { text-align: center; border-bottom: 1px solid #000; padding-bottom: 10px; }
  .scene-heading { font-weight: bold; text-transform: uppercase; background: #f0f0f0; padding: 5px; margin: 20px 0 10px; }
</style></head><body>
<h1>${title}</h1>`

    for (const szene of szenen) {
      const intExt = szene.int_ext || 'INT'
      const ort = szene.ort_name || 'UNBEKANNT'
      const zeit = szene.tageszeit || 'TAG'
      html += `<div class="scene-heading">${szene.scene_nummer}. ${intExt}. ${ort} - ${zeit}</div>`

      const blocks: Block[] = Array.isArray(szene.content) ? szene.content : []
      for (const block of blocks) {
        const cls = block.type === 'heading' ? 'heading' : block.type
        const escaped = String(block.text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        html += `<div class="${cls}">${escaped}</div>`
      }
    }

    html += '</body></html>'
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('X-Export-Type', 'pdf-source')
    res.send(html)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── Werkstufe-based exports (v43 Werkstufen-Modell) ─────────────────────────

async function logWerkstufenExport(userId: string, userName: string, werkId: string, format: string): Promise<string> {
  const result = await queryOne(
    `INSERT INTO export_logs (user_id, user_name, stage_label, produktion_id, format)
     SELECT $1, $2, COALESCE(w.label, w.typ || ' V' || w.version_nummer), f.produktion_id, $3
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
      `SELECT w.*, f.produktion_id, f.folge_nummer FROM werkstufen w
       JOIN folgen f ON f.id = w.folge_id WHERE w.id = $1`,
      [req.params.werkId]
    )
    if (!ws) return res.status(404).json({ error: 'Werkstufe nicht gefunden' })

    const szenen = await query(
      'SELECT * FROM dokument_szenen WHERE werkstufe_id = $1 AND geloescht = false ORDER BY sort_order, scene_nummer',
      [req.params.werkId]
    )

    const exportId = await logWerkstufenExport(req.user!.user_id, req.user!.name, ws.id, 'fountain')
    const payload = buildPayload(req.user!.user_id, exportId)
    const fountain = injectIntoText(contentToFountain(szenen), payload)

    const label = (ws.label || `${ws.typ}_V${ws.version_nummer}`).replace(/[^a-zA-Z0-9_-]/g, '_')
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${label}.fountain"`)
    res.send(fountain)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/werkstufen/:id/export/fdx
router.get('/werkstufe/:werkId/export/fdx', async (req, res) => {
  try {
    const ws = await queryOne(
      `SELECT w.*, f.produktion_id FROM werkstufen w
       JOIN folgen f ON f.id = w.folge_id WHERE w.id = $1`,
      [req.params.werkId]
    )
    if (!ws) return res.status(404).json({ error: 'Werkstufe nicht gefunden' })

    const szenen = await query(
      'SELECT * FROM dokument_szenen WHERE werkstufe_id = $1 AND geloescht = false ORDER BY sort_order, scene_nummer',
      [req.params.werkId]
    )

    const exportId = await logWerkstufenExport(req.user!.user_id, req.user!.name, ws.id, 'fdx')
    const payload = buildPayload(req.user!.user_id, exportId)
    const wm = require('../utils/watermark').encodeWatermark(payload)
    let fdx = contentToFdx(szenen, ws.label || 'Drehbuch')
    fdx = fdx.replace('<Content>', `<!-- ${wm} -->\n<Content>`)

    const label = (ws.label || `${ws.typ}_V${ws.version_nummer}`).replace(/[^a-zA-Z0-9_-]/g, '_')
    res.setHeader('Content-Type', 'application/xml')
    res.setHeader('Content-Disposition', `attachment; filename="${label}.fdx"`)
    res.send(fdx)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/werkstufen/:id/export/pdf
router.get('/werkstufe/:werkId/export/pdf', async (req, res) => {
  try {
    const ws = await queryOne(
      `SELECT w.*, f.produktion_id FROM werkstufen w
       JOIN folgen f ON f.id = w.folge_id WHERE w.id = $1`,
      [req.params.werkId]
    )
    if (!ws) return res.status(404).json({ error: 'Werkstufe nicht gefunden' })

    const szenen = await query(
      'SELECT * FROM dokument_szenen WHERE werkstufe_id = $1 AND geloescht = false ORDER BY sort_order, scene_nummer',
      [req.params.werkId]
    )

    const exportId = await logWerkstufenExport(req.user!.user_id, req.user!.name, ws.id, 'pdf')
    const payload = buildPayload(req.user!.user_id, exportId)
    const wm = require('../utils/watermark').encodeWatermark(payload)

    const title = ws.label || `${ws.typ} V${ws.version_nummer}`
    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="wm" content="${wm}">
<style>
  body { font-family: "Courier New", monospace; font-size: 12pt; margin: 1.5cm 2.5cm; line-height: 1.5; }
  .heading { font-weight: bold; text-transform: uppercase; margin: 20px 0 10px; }
  .action { margin: 0 0 10px; }
  .character { margin-left: 40%; margin-bottom: 0; font-weight: bold; }
  .parenthetical { margin-left: 30%; margin-right: 30%; font-style: italic; }
  .dialogue { margin-left: 20%; margin-right: 20%; }
  .transition { text-align: right; font-weight: bold; }
  .shot { font-weight: bold; }
  h1 { text-align: center; border-bottom: 1px solid #000; padding-bottom: 10px; }
  .scene-heading { font-weight: bold; text-transform: uppercase; background: #f0f0f0; padding: 5px; margin: 20px 0 10px; }
  .stoppzeit { float: right; color: #666; font-weight: normal; }
</style></head><body>
<h1>${title}</h1>`

    for (const szene of szenen) {
      const intExt = szene.int_ext || 'INT'
      const ort = szene.ort_name || 'UNBEKANNT'
      const zeit = szene.tageszeit || 'TAG'
      const stoppzeit = szene.stoppzeit_sek ? `<span class="stoppzeit">${formatStoppzeit(szene.stoppzeit_sek)}</span>` : ''
      html += `<div class="scene-heading">${szene.scene_nummer}. ${intExt}. ${ort} - ${zeit}${stoppzeit}</div>`

      const blocks: Block[] = Array.isArray(szene.content) ? szene.content : []
      for (const block of blocks) {
        const cls = block.type === 'heading' ? 'heading' : block.type
        const escaped = String(block.text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        html += `<div class="${cls}">${escaped}</div>`
      }
    }

    html += '</body></html>'
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('X-Export-Type', 'pdf-source')
    res.send(html)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// Cross-app export: GET /api/stages/:id/drehplan-export
router.get('/:stageId/drehplan-export', async (req, res) => {
  try {
    const szenen = await query('SELECT * FROM szenen WHERE stage_id = $1 ORDER BY sort_order, scene_nummer', [req.params.stageId])
    const result = szenen.map((s: any) => ({
      scene_number: s.scene_nummer, int_ext: s.int_ext, ort_name: s.ort_name,
      tageszeit: s.tageszeit,
      charaktere: Array.isArray(s.content) ? s.content.filter((b: any) => b.type === 'character').map((b: any) => b.text).filter(Boolean) : [],
      dauer_min: s.dauer_min,
    }))
    res.json(result)
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

// GET /api/stages/:id/export/revision-summary
router.get('/:stageId/export/revision-summary', async (req, res) => {
  try {
    const stage = await queryOne(
      `SELECT s.*, rc.name AS revision_name, rc.color AS revision_color, re.memo_schwellwert_zeichen
       FROM stages s LEFT JOIN revision_colors rc ON rc.id = s.revision_color_id
       LEFT JOIN revision_export_einstellungen re ON re.produktion_id = s.produktion_id
       WHERE s.id = $1`, [req.params.stageId])
    if (!stage) return res.status(404).json({ error: 'Stage nicht gefunden' })
    const deltas = await query(
      `SELECT sr.*, sz.scene_nummer, sz.ort_name FROM szenen_revisionen sr
       JOIN szenen sz ON sz.id = sr.szene_id WHERE sr.stage_id = $1
       ORDER BY sz.scene_nummer, sr.block_index`, [req.params.stageId])
    const memoSchwelle = stage.memo_schwellwert_zeichen ?? 100
    const sceneMap: Map<number, { scene_nummer: number; ort_name: string; changes: any[]; has_content_change: boolean }> = new Map()
    for (const d of deltas) {
      if (!sceneMap.has(d.szene_id)) sceneMap.set(d.szene_id, { scene_nummer: d.scene_nummer, ort_name: d.ort_name, changes: [], has_content_change: false })
      const entry = sceneMap.get(d.szene_id)!
      entry.changes.push(d)
      if (d.field_type === 'content_block') entry.has_content_change = true
    }
    const changedScenes = Array.from(sceneMap.values()).sort((a, b) => a.scene_nummer - b.scene_nummer)
    res.json({
      revision_color: stage.revision_color ? { name: stage.revision_name, color: stage.revision_color } : null,
      changed_scenes: changedScenes.map(s => ({ scene_nummer: s.scene_nummer, ort_name: s.ort_name, change_count: s.changes.length, has_content_change: s.has_content_change })),
      replacement_pages: changedScenes.filter(s => s.has_content_change).map(s => ({ scene_nummer: s.scene_nummer, ort_name: s.ort_name })),
      memo_entries: deltas.filter((d: any) => d.field_type === 'header' && Math.max(String(d.old_value ?? '').length, String(d.new_value ?? '').length) < memoSchwelle)
        .map((d: any) => ({ scene_nummer: d.scene_nummer, ort_name: d.ort_name, field_name: d.field_name, old_value: d.old_value, new_value: d.new_value })),
      memo_schwellwert_zeichen: memoSchwelle,
    })
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

export default router
