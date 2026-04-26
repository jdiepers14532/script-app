import { Router } from 'express'
import { query, queryOne } from '../db'
import { authMiddleware } from '../auth'
import { z } from 'zod'

export const szenenRouter = Router()
export const stagesSzenenRouter = Router()

szenenRouter.use(authMiddleware)
stagesSzenenRouter.use(authMiddleware)

const TextelementSchema = z.object({
  id: z.string(),
  type: z.enum(['action', 'dialogue', 'parenthetical', 'transition', 'shot', 'direction', 'character', 'heading']),
  text: z.string(),
  character: z.string().optional(),
  entity_id: z.number().optional(),
})

const ContentSchema = z.array(TextelementSchema)

// GET /api/szenen/:id
szenenRouter.get('/:id', async (req, res) => {
  try {
    const row = await queryOne('SELECT * FROM szenen WHERE id = $1', [req.params.id])
    if (!row) return res.status(404).json({ error: 'Szene nicht gefunden' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// Helper: record revision deltas if stage is in revision mode
async function recordRevisionDeltas(
  szeneId: string,
  stageId: number,
  oldSzene: any,
  body: any,
  newContent: any[] | null
) {
  // Only record if stage has a revision_color_id set
  const stage = await queryOne(
    `SELECT revision_color_id FROM stages WHERE id = $1`,
    [stageId]
  )
  if (!stage?.revision_color_id) return

  const deltaInsert = (
    fieldType: string, fieldName: string | null,
    blockIndex: number | null, blockType: string | null,
    speaker: string | null, oldVal: string | null, newVal: string | null
  ) => queryOne(
    `INSERT INTO szenen_revisionen
       (szene_id, stage_id, field_type, field_name, block_index, block_type, speaker, old_value, new_value)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [szeneId, stageId, fieldType, fieldName, blockIndex, blockType, speaker, oldVal, newVal]
  ).catch(() => {})

  // Header fields
  const headerFields = ['int_ext', 'tageszeit', 'ort_name', 'zusammenfassung', 'seiten', 'spieltag', 'stimmung', 'spielzeit', 'storyline'] as const
  for (const f of headerFields) {
    if (body[f] !== undefined && String(body[f] ?? '') !== String(oldSzene[f] ?? '')) {
      await deltaInsert('header', f, null, null, null, String(oldSzene[f] ?? ''), String(body[f] ?? ''))
    }
  }

  // Content block deltas
  if (newContent !== null) {
    const oldBlocks: any[] = Array.isArray(oldSzene.content) ? oldSzene.content : []
    const maxLen = Math.max(oldBlocks.length, newContent.length)
    for (let i = 0; i < maxLen; i++) {
      const ob = oldBlocks[i]
      const nb = newContent[i]
      if (!ob && nb) {
        // Added block
        await deltaInsert('content_block', null, i, nb.type, nb.character ?? null, null, nb.text ?? '')
      } else if (ob && !nb) {
        // Removed block
        await deltaInsert('content_block', null, i, ob.type, ob.character ?? null, ob.text ?? '', null)
      } else if (ob && nb && (ob.text !== nb.text || ob.type !== nb.type)) {
        // Changed block
        await deltaInsert('content_block', null, i, nb.type, nb.character ?? null, ob.text ?? '', nb.text ?? '')
      }
    }
  }
}

// PUT /api/szenen/:id
szenenRouter.put('/:id', async (req, res) => {
  try {
    const { int_ext, tageszeit, ort_name, zusammenfassung, dauer_min, sort_order, seiten, spieltag, stimmung, spielzeit, storyline } = req.body
    let content = req.body.content

    // Validate content schema if provided
    if (content !== undefined && content !== null) {
      const parsed = ContentSchema.safeParse(content)
      if (!parsed.success) {
        return res.status(422).json({ error: 'Ungültiges Content-Schema', details: parsed.error.issues })
      }
      content = parsed.data
    }

    // Fetch current state before update (for delta recording)
    const oldSzene = await queryOne(
      `SELECT sz.*, st.id AS stage_id_val, st.revision_color_id
       FROM szenen sz JOIN stages st ON st.id = sz.stage_id
       WHERE sz.id = $1`,
      [req.params.id]
    )

    const row = await queryOne(
      `UPDATE szenen SET
        int_ext = COALESCE($1, int_ext),
        tageszeit = COALESCE($2, tageszeit),
        ort_name = COALESCE($3, ort_name),
        zusammenfassung = COALESCE($4, zusammenfassung),
        content = COALESCE($5, content),
        dauer_min = COALESCE($6, dauer_min),
        sort_order = COALESCE($7, sort_order),
        seiten = COALESCE($9, seiten),
        spieltag = COALESCE($10, spieltag),
        stimmung = COALESCE($11, stimmung),
        spielzeit = COALESCE($12, spielzeit),
        storyline = COALESCE($13, storyline),
        updated_at = NOW()
       WHERE id = $8 RETURNING *`,
      [
        int_ext,
        tageszeit,
        ort_name,
        zusammenfassung,
        content ? JSON.stringify(content) : null,
        dauer_min,
        sort_order,
        req.params.id,
        seiten ?? null,
        spieltag ?? null,
        stimmung ?? null,
        spielzeit ?? null,
        storyline ?? null,
      ]
    )
    if (!row) return res.status(404).json({ error: 'Szene nicht gefunden' })

    // Record deltas asynchronously (non-blocking, don't fail the save if this errors)
    if (oldSzene?.stage_id_val) {
      recordRevisionDeltas(
        req.params.id,
        oldSzene.stage_id_val,
        oldSzene,
        req.body,
        content ?? null
      ).catch(() => {})
    }

    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/szenen/:id
szenenRouter.delete('/:id', async (req, res) => {
  try {
    const result = await queryOne('DELETE FROM szenen WHERE id = $1 RETURNING id', [req.params.id])
    if (!result) return res.status(404).json({ error: 'Szene nicht gefunden' })
    res.status(204).send()
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/stages/:stageId/szenen
stagesSzenenRouter.get('/:stageId/szenen', async (req, res) => {
  try {
    const rows = await query(
      'SELECT * FROM szenen WHERE stage_id = $1 ORDER BY sort_order, scene_nummer',
      [req.params.stageId]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/stages/:stageId/szenen
stagesSzenenRouter.post('/:stageId/szenen', async (req, res) => {
  try {
    const { scene_nummer, int_ext, tageszeit, ort_name, zusammenfassung, content, dauer_min, sort_order } = req.body
    const row = await queryOne(
      `INSERT INTO szenen (stage_id, scene_nummer, int_ext, tageszeit, ort_name, zusammenfassung, content, dauer_min, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        req.params.stageId,
        scene_nummer,
        int_ext || 'INT',
        tageszeit || 'TAG',
        ort_name || null,
        zusammenfassung || null,
        JSON.stringify(content || []),
        dauer_min || null,
        sort_order || 0,
      ]
    )
    res.status(201).json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default szenenRouter
