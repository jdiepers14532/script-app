import { Router } from 'express'
import { query, queryOne } from '../db'
import { authMiddleware } from '../auth'

const router = Router()
router.use(authMiddleware)

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

    const szenen = await query(
      'SELECT * FROM szenen WHERE stage_id = $1 ORDER BY sort_order, scene_nummer',
      [req.params.stageId]
    )

    const fountain = contentToFountain(szenen)
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="stage-${req.params.stageId}.fountain"`)
    res.send(fountain)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/stages/:id/export/fdx
router.get('/:stageId/export/fdx', async (req, res) => {
  try {
    const stage = await queryOne('SELECT * FROM stages WHERE id = $1', [req.params.stageId])
    if (!stage) return res.status(404).json({ error: 'Stage nicht gefunden' })

    const szenen = await query(
      'SELECT * FROM szenen WHERE stage_id = $1 ORDER BY sort_order, scene_nummer',
      [req.params.stageId]
    )

    const episode = stage.episode_id
      ? await queryOne('SELECT * FROM episoden WHERE id = $1', [stage.episode_id])
      : null

    const fdx = contentToFdx(szenen, episode?.arbeitstitel || 'Drehbuch')
    res.setHeader('Content-Type', 'application/xml')
    res.setHeader('Content-Disposition', `attachment; filename="stage-${req.params.stageId}.fdx"`)
    res.send(fdx)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/stages/:id/export/pdf — Simple HTML-based PDF
router.get('/:stageId/export/pdf', async (req, res) => {
  try {
    const stage = await queryOne('SELECT * FROM stages WHERE id = $1', [req.params.stageId])
    if (!stage) return res.status(404).json({ error: 'Stage nicht gefunden' })

    const szenen = await query(
      'SELECT * FROM szenen WHERE stage_id = $1 ORDER BY sort_order, scene_nummer',
      [req.params.stageId]
    )

    const episode = stage.episode_id
      ? await queryOne('SELECT * FROM episoden WHERE id = $1', [stage.episode_id])
      : null

    // Return HTML that can be printed as PDF
    let html = `<!DOCTYPE html><html><head><meta charset="utf-8">
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
<h1>${episode?.arbeitstitel || 'Drehbuch'}</h1>`

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

// Cross-app export: GET /api/stages/:id/drehplan-export
router.get('/:stageId/drehplan-export', async (req, res) => {
  try {
    const szenen = await query(
      'SELECT * FROM szenen WHERE stage_id = $1 ORDER BY sort_order, scene_nummer',
      [req.params.stageId]
    )

    const result = szenen.map((s: any) => ({
      scene_number: s.scene_nummer,
      int_ext: s.int_ext,
      ort_name: s.ort_name,
      tageszeit: s.tageszeit,
      charaktere: extractCharaktere(s.content),
      dauer_min: s.dauer_min,
    }))
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

function extractCharaktere(content: any): string[] {
  if (!Array.isArray(content)) return []
  return content
    .filter((b: Block) => b.type === 'character')
    .map((b: Block) => b.text)
    .filter(Boolean)
}

export default router
