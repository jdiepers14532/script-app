import { Router } from 'express'
import { pool, query, queryOne } from '../db'
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
        await deltaInsert('content_block', null, i, nb.type, nb.character ?? null, null, nb.text ?? '')
      } else if (ob && !nb) {
        await deltaInsert('content_block', null, i, ob.type, ob.character ?? null, ob.text ?? '', null)
      } else if (ob && nb && (ob.text !== nb.text || ob.type !== nb.type)) {
        await deltaInsert('content_block', null, i, nb.type, nb.character ?? null, ob.text ?? '', nb.text ?? '')
      }
    }
  }
}

// PUT /api/szenen/:id
szenenRouter.put('/:id', async (req, res) => {
  try {
    const { int_ext, tageszeit, ort_name, zusammenfassung, dauer_min, sort_order, seiten, spieltag, stimmung, spielzeit, storyline, szeneninfo } = req.body
    let content = req.body.content

    if (content !== undefined && content !== null) {
      const parsed = ContentSchema.safeParse(content)
      if (!parsed.success) {
        return res.status(422).json({ error: 'Ungültiges Content-Schema', details: parsed.error.issues })
      }
      content = parsed.data
    }

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
        szeneninfo = COALESCE($15, szeneninfo),
        updated_at = NOW(),
        updated_by_name = $14
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
        req.user?.name ?? null,
        szeneninfo ?? null,
      ]
    )
    if (!row) return res.status(404).json({ error: 'Szene nicht gefunden' })

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
      'SELECT * FROM szenen WHERE stage_id = $1 ORDER BY sort_order, scene_nummer, scene_nummer_suffix',
      [req.params.stageId]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PATCH /api/stages/:stageId/szenen/reorder
stagesSzenenRouter.patch('/:stageId/szenen/reorder', async (req, res) => {
  const { order } = req.body // number[] — scene ids in new order
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be array of scene ids' })

  const stageId = parseInt(req.params.stageId)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: currentScenes } = await client.query(
      'SELECT id, scene_nummer, scene_nummer_suffix, sort_order, szeneninfo, logged_since FROM szenen WHERE stage_id = $1',
      [stageId]
    )

    const sceneMap = new Map(currentScenes.map((s: any) => [s.id, s]))
    const hasLogged = currentScenes.some((s: any) => s.logged_since != null)
    const today = new Date().toLocaleDateString('de-DE')

    for (let i = 0; i < order.length; i++) {
      const sceneId = order[i]
      const scene = sceneMap.get(sceneId)
      if (!scene) continue

      let szeneninfoUpdate = scene.szeneninfo

      // If this scene is logged and its position actually changed, append a log entry
      if (hasLogged && scene.logged_since != null) {
        const oldIdx = currentScenes.findIndex((s: any) => s.id === sceneId)
        if (oldIdx !== i) {
          const prevId = i > 0 ? order[i - 1] : null
          const nextId = i < order.length - 1 ? order[i + 1] : null
          const prev = prevId ? sceneMap.get(prevId) : null
          const next = nextId ? sceneMap.get(nextId) : null
          const prevNum = prev ? `${prev.scene_nummer}${prev.scene_nummer_suffix || ''}` : 'Anfang'
          const nextNum = next ? `${next.scene_nummer}${next.scene_nummer_suffix || ''}` : 'Ende'
          const entry = `[${today}] Position geändert: jetzt zwischen Szene ${prevNum} und Szene ${nextNum}`
          szeneninfoUpdate = szeneninfoUpdate ? `${szeneninfoUpdate}\n${entry}` : entry
        }
      }

      await client.query(
        'UPDATE szenen SET sort_order = $1, szeneninfo = $2, updated_at = NOW() WHERE id = $3',
        [i + 1, szeneninfoUpdate, sceneId]
      )
    }

    await client.query('COMMIT')

    const { rows } = await client.query(
      'SELECT * FROM szenen WHERE stage_id = $1 ORDER BY sort_order, scene_nummer, scene_nummer_suffix',
      [stageId]
    )
    res.json(rows)
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: String(err) })
  } finally {
    client.release()
  }
})

// POST /api/stages/:stageId/szenen/renumber
stagesSzenenRouter.post('/:stageId/szenen/renumber', async (req, res) => {
  const stageId = parseInt(req.params.stageId)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: scenes } = await client.query(
      'SELECT * FROM szenen WHERE stage_id = $1 ORDER BY sort_order, scene_nummer, scene_nummer_suffix',
      [stageId]
    )

    const hasLogged = scenes.some((s: any) => s.logged_since != null)
    const today = new Date().toLocaleDateString('de-DE')

    if (!hasLogged) {
      // Renumber sequentially 1, 2, 3... clear suffixes
      for (let i = 0; i < scenes.length; i++) {
        await client.query(
          'UPDATE szenen SET scene_nummer = $1, scene_nummer_suffix = NULL, sort_order = $2, updated_at = NOW() WHERE id = $3',
          [i + 1, i + 1, scenes[i].id]
        )
      }
    } else {
      // Logging active: keep numbers, log position changes in szeneninfo
      // Sort by scene_nummer + suffix to get "expected" order
      const expectedOrder = [...scenes].sort((a: any, b: any) => {
        if (a.scene_nummer !== b.scene_nummer) return a.scene_nummer - b.scene_nummer
        const sa = a.scene_nummer_suffix || ''
        const sb = b.scene_nummer_suffix || ''
        return sa.localeCompare(sb)
      })

      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i] // current sort_order position
        if (!scene.logged_since) continue

        const expectedIdx = expectedOrder.findIndex((s: any) => s.id === scene.id)
        if (expectedIdx !== i) {
          // Position doesn't match scene_nummer order — log it
          const prev = i > 0 ? scenes[i - 1] : null
          const next = i < scenes.length - 1 ? scenes[i + 1] : null
          const prevNum = prev ? `${prev.scene_nummer}${prev.scene_nummer_suffix || ''}` : 'Anfang'
          const nextNum = next ? `${next.scene_nummer}${next.scene_nummer_suffix || ''}` : 'Ende'
          const entry = `[${today}] Neu nummeriert: steht jetzt zwischen Szene ${prevNum} und Szene ${nextNum}`
          const newInfo = scene.szeneninfo ? `${scene.szeneninfo}\n${entry}` : entry
          await client.query(
            'UPDATE szenen SET szeneninfo = $1, updated_at = NOW() WHERE id = $2',
            [newInfo, scene.id]
          )
        }
      }
    }

    await client.query('COMMIT')

    const { rows } = await client.query(
      'SELECT * FROM szenen WHERE stage_id = $1 ORDER BY sort_order, scene_nummer, scene_nummer_suffix',
      [stageId]
    )
    res.json({ scenes: rows, renumbered: !hasLogged })
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: String(err) })
  } finally {
    client.release()
  }
})

// POST /api/stages/:stageId/szenen/auto-spieltag
// Calculates spieltag for all scenes in order: increments when tageszeit switches from NACHT to non-NACHT
stagesSzenenRouter.post('/:stageId/szenen/auto-spieltag', async (req, res) => {
  const stageId = parseInt(req.params.stageId)
  const client = await pool.connect()
  try {
    const { rows: scenes } = await client.query(
      'SELECT id, tageszeit FROM szenen WHERE stage_id = $1 ORDER BY sort_order, scene_nummer, scene_nummer_suffix',
      [stageId]
    )

    let spieltag = 1
    let prevTageszeit: string | null = null
    const updates: { id: number; spieltag: number }[] = []

    for (const row of scenes) {
      const tz = (row.tageszeit ?? 'TAG').toUpperCase()
      if (prevTageszeit === 'NACHT' && tz !== 'NACHT') spieltag++
      updates.push({ id: row.id, spieltag })
      prevTageszeit = tz
    }

    await client.query('BEGIN')
    for (const u of updates) {
      await client.query('UPDATE szenen SET spieltag = $1 WHERE id = $2', [u.spieltag, u.id])
    }
    await client.query('COMMIT')

    const { rows: updated } = await client.query(
      'SELECT * FROM szenen WHERE stage_id = $1 ORDER BY sort_order, scene_nummer, scene_nummer_suffix',
      [stageId]
    )
    res.json(updated)
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    res.status(500).json({ error: String(err) })
  } finally {
    client.release()
  }
})

// POST /api/stages/:stageId/szenen/set-logging
// Sets logged_since = NOW() on all scenes of this stage (one-time, at Abgabe)
stagesSzenenRouter.post('/:stageId/szenen/set-logging', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE szenen SET logged_since = NOW() WHERE stage_id = $1 AND logged_since IS NULL RETURNING id`,
      [req.params.stageId]
    )
    res.json({ updated: rows.length })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/stages/:stageId/szenen
stagesSzenenRouter.post('/:stageId/szenen', async (req, res) => {
  try {
    const {
      scene_nummer, int_ext, tageszeit, ort_name, zusammenfassung,
      content, dauer_min, sort_order, after_scene_id,
    } = req.body
    const stageId = parseInt(req.params.stageId)

    let finalSceneNummer = scene_nummer
    let finalSuffix: string | null = null
    let finalSortOrder = sort_order ?? 0
    let needReindex = false

    if (after_scene_id) {
      const refScene = await queryOne(
        'SELECT scene_nummer, scene_nummer_suffix, sort_order, logged_since FROM szenen WHERE id = $1',
        [after_scene_id]
      )
      if (refScene) {
        const loggedCount = await queryOne(
          'SELECT COUNT(*) as cnt FROM szenen WHERE stage_id = $1 AND logged_since IS NOT NULL',
          [stageId]
        )
        const hasLogged = parseInt(loggedCount?.cnt || '0') > 0

        if (hasLogged) {
          // Suffix logic: find next available letter for this scene_nummer
          const baseNum = refScene.scene_nummer
          const existing = await query(
            `SELECT scene_nummer_suffix FROM szenen
             WHERE stage_id = $1 AND scene_nummer = $2 AND scene_nummer_suffix IS NOT NULL
             ORDER BY scene_nummer_suffix`,
            [stageId, baseNum]
          )
          const usedSuffixes = existing.map((s: any) => s.scene_nummer_suffix)
          const nextSuffix = 'abcdefghijklmnopqrstuvwxyz'.split('').find(l => !usedSuffixes.includes(l)) || 'z'
          finalSceneNummer = baseNum
          finalSuffix = nextSuffix
        } else {
          finalSceneNummer = scene_nummer || (refScene.scene_nummer + 1)
        }
        // Insert directly after reference scene in sort_order
        finalSortOrder = refScene.sort_order + 0.5
        needReindex = true
      }
    } else if (!finalSceneNummer) {
      // Append to end: max scene_nummer + 1
      const maxRow = await queryOne(
        'SELECT MAX(scene_nummer) as mx FROM szenen WHERE stage_id = $1',
        [stageId]
      )
      finalSceneNummer = (maxRow?.mx ?? 0) + 1
      // sort_order: max sort_order + 1
      const maxSort = await queryOne(
        'SELECT MAX(sort_order) as ms FROM szenen WHERE stage_id = $1',
        [stageId]
      )
      finalSortOrder = (maxSort?.ms ?? 0) + 1
    }

    const row = await queryOne(
      `INSERT INTO szenen (stage_id, scene_nummer, scene_nummer_suffix, int_ext, tageszeit, ort_name, zusammenfassung, content, dauer_min, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        stageId,
        finalSceneNummer,
        finalSuffix,
        int_ext || 'INT',
        tageszeit || 'TAG',
        ort_name || null,
        zusammenfassung || null,
        JSON.stringify(content || []),
        dauer_min || null,
        finalSortOrder,
      ]
    )

    // Reindex sort_orders to integers after fractional insertion
    if (needReindex) {
      await pool.query(`
        WITH ranked AS (
          SELECT id, ROW_NUMBER() OVER (ORDER BY sort_order, scene_nummer, scene_nummer_suffix) AS rn
          FROM szenen WHERE stage_id = $1
        )
        UPDATE szenen SET sort_order = ranked.rn
        FROM ranked WHERE szenen.id = ranked.id
      `, [stageId])
    }

    res.status(201).json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default szenenRouter
