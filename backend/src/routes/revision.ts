import { Router } from 'express'
import { query, queryOne, pool } from '../db'
import { authMiddleware } from '../auth'

export const stageLabelsRouter = Router({ mergeParams: true })
export const revisionColorsRouter = Router({ mergeParams: true })
export const revisionEinstellungenRouter = Router({ mergeParams: true })
export const revisionFarbenPresetsRouter = Router()

stageLabelsRouter.use(authMiddleware)
revisionColorsRouter.use(authMiddleware)
revisionEinstellungenRouter.use(authMiddleware)

// ── Stage Labels ──────────────────────────────────────────────────────────────

// GET /api/produktionen/:produktionId/stage-labels
stageLabelsRouter.get('/', async (req, res) => {
  const { produktionId } = req.params as any
  try {
    const rows = await query(
      `SELECT * FROM stage_labels WHERE produktion_id = $1 ORDER BY sort_order, id`,
      [produktionId]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/produktionen/:produktionId/stage-labels
stageLabelsRouter.post('/', async (req, res) => {
  const { produktionId } = req.params as any
  const { name, sort_order, is_produktionsfassung } = req.body
  if (!name) return res.status(400).json({ error: 'name required' })
  try {
    const maxOrder = await queryOne(
      `SELECT COALESCE(MAX(sort_order), 0) AS m FROM stage_labels WHERE produktion_id = $1`,
      [produktionId]
    )
    const row = await queryOne(
      `INSERT INTO stage_labels (produktion_id, name, sort_order, is_produktionsfassung)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [produktionId, name, sort_order ?? (maxOrder.m + 1), is_produktionsfassung ?? false]
    )
    res.status(201).json(row)
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'Label-Name bereits vorhanden' })
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/produktionen/:produktionId/stage-labels/:labelId
// Rename propagiert transaktional: R1 (stage_labels.name) + R2 (werkstufen.label, production-scoped)
// + R3 (lock_trigger_fassungslabel). Läuft auch für gesperrte/eingefrorene Werkstufen.
stageLabelsRouter.put('/:labelId', async (req, res) => {
  const { produktionId } = req.params as any
  const { name, sort_order, is_produktionsfassung } = req.body
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Lock the row before any changes (verhindert parallele Renames desselben Labels)
    const current = await client.query(
      `SELECT id, name FROM stage_labels WHERE id = $1 AND produktion_id = $2 FOR UPDATE`,
      [req.params.labelId, produktionId]
    )
    if (current.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Stage-Label nicht gefunden' })
    }
    const oldName = current.rows[0].name
    const newName = typeof name === 'string' && name.trim() !== '' ? name.trim() : null
    const isRename = newName !== null && newName !== oldName

    let affectedWerkstufen = 0
    let triggerUpdated = false

    if (isRename) {
      // Advisory lock per Produktion — serialisiert Renames + parallele Label-Sets auf Werkstufen
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [produktionId])
      // Expliziter Kollisionscheck (saubere Fehlermeldung statt raw UNIQUE-Violation)
      const collision = await client.query(
        `SELECT id FROM stage_labels WHERE produktion_id = $1 AND name = $2 AND id != $3`,
        [produktionId, newName, req.params.labelId]
      )
      if (collision.rows.length > 0) {
        await client.query('ROLLBACK')
        return res.status(409).json({ error: 'label_name_collision', message: 'Ein Label mit diesem Namen existiert bereits in dieser Produktion.' })
      }
    }

    // R1: stage_labels.name + optionale Felder in einer Anweisung
    const updatedRow = await client.query(
      `UPDATE stage_labels SET
         name               = COALESCE($1, name),
         sort_order         = COALESCE($2, sort_order),
         is_produktionsfassung = COALESCE($3, is_produktionsfassung)
       WHERE id = $4 AND produktion_id = $5 RETURNING *`,
      [newName, sort_order ?? null, is_produktionsfassung ?? null, req.params.labelId, produktionId]
    )

    if (isRename) {
      // R2: werkstufen.label — production-scoped, erfasst alle Typen + alle Bearbeitungs-Status
      const r2 = await client.query(
        `UPDATE werkstufen w SET label = $1
         FROM folgen f
         WHERE w.folge_id = f.id AND f.produktion_id = $2 AND w.label = $3`,
        [newName, produktionId, oldName]
      )
      affectedWerkstufen = r2.rowCount ?? 0
      // R3: lock_trigger_fassungslabel
      const r3 = await client.query(
        `UPDATE rollen_freigabe_konfiguration SET lock_trigger_fassungslabel = $1
         WHERE production_id = $2 AND lock_trigger_fassungslabel = $3`,
        [newName, produktionId, oldName]
      )
      triggerUpdated = (r3.rowCount ?? 0) > 0
    }

    await client.query('COMMIT')
    res.json({ ...updatedRow.rows[0], renamed: isRename, affectedWerkstufen, triggerUpdated })
  } catch (err: any) {
    await client.query('ROLLBACK')
    if (err.code === '23505') return res.status(409).json({ error: 'label_name_collision', message: 'Label-Name bereits vorhanden' })
    res.status(500).json({ error: String(err) })
  } finally {
    client.release()
  }
})

// DELETE /api/produktionen/:produktionId/stage-labels/:labelId
// ?force=true           — Löschen auch wenn in Benutzung (Werkstufen werden auf NULL gesetzt)
// ?replacementName=...  — optionales Ersatz-Label statt NULL
// 409 label_in_use      — Label in Benutzung, kein force
// 422 Hard-Block        — aktive gesperrte Produktionsfassung (auch mit force nicht möglich)
stageLabelsRouter.delete('/:labelId', async (req, res) => {
  const { produktionId } = req.params as any
  const force = req.query.force === 'true'
  const replacementName = (req.query.replacementName as string | undefined)?.trim() || null
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // Advisory lock — serialisiert Delete + parallele Renames/Label-Sets
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [produktionId])

    // Lock row
    const current = await client.query(
      `SELECT id, name, is_produktionsfassung FROM stage_labels WHERE id = $1 AND produktion_id = $2 FOR UPDATE`,
      [req.params.labelId, produktionId]
    )
    if (current.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Stage-Label nicht gefunden' })
    }
    const { name: labelName, is_produktionsfassung: isProdFassung } = current.rows[0]

    // Impact: betroffene Werkstufen
    const r2Impact = await client.query(
      `SELECT COUNT(*)::int AS cnt FROM werkstufen w
       JOIN folgen f ON f.id = w.folge_id
       WHERE f.produktion_id = $1 AND w.label = $2`,
      [produktionId, labelName]
    )
    const affectedWerkstufen: number = r2Impact.rows[0].cnt

    // Impact: Gate-Trigger
    const r3Impact = await client.query(
      `SELECT COUNT(*)::int AS cnt FROM rollen_freigabe_konfiguration
       WHERE production_id = $1 AND lock_trigger_fassungslabel = $2`,
      [produktionId, labelName]
    )
    const isTrigger: boolean = r3Impact.rows[0].cnt > 0

    // 422 Hard-Block: Produktionsfassung-Label mit gesperrten Werkstufen — auch mit force verboten
    if (isProdFassung) {
      const lockedCnt = await client.query(
        `SELECT COUNT(*)::int AS cnt FROM werkstufen w
         JOIN folgen f ON f.id = w.folge_id
         WHERE f.produktion_id = $1 AND w.label = $2
           AND w.bearbeitung_status = 'gesperrt'`,
        [produktionId, labelName]
      )
      const lockedProduktionsfassungen: number = lockedCnt.rows[0].cnt
      if (lockedProduktionsfassungen > 0) {
        await client.query('ROLLBACK')
        return res.status(422).json({
          error: 'cannot_delete_active_produktionsfassung',
          message: 'Das Label ist als Produktionsfassung markiert und hat gesperrte Werkstufen — Löschen nicht möglich.',
          lockedProduktionsfassungen,
        })
      }
    }

    // 409 label_in_use — Benutzung vorhanden, kein force
    if ((affectedWerkstufen > 0 || isTrigger) && !force) {
      await client.query('ROLLBACK')
      return res.status(409).json({
        error: 'label_in_use',
        message: 'Das Label ist in Verwendung.',
        affectedWerkstufen,
        isTrigger,
        isProduktionsfassung: isProdFassung,
      })
    }

    // Durchführen (force oder keine Benutzung)
    let werkstufenUnlabeled = 0
    if (affectedWerkstufen > 0) {
      // R2: werkstufen auf NULL oder Ersatz-Label setzen
      const r2Del = await client.query(
        `UPDATE werkstufen w SET label = $1
         FROM folgen f
         WHERE w.folge_id = f.id AND f.produktion_id = $2 AND w.label = $3`,
        [replacementName, produktionId, labelName]
      )
      werkstufenUnlabeled = r2Del.rowCount ?? 0
    }

    let gateDisabled = false
    if (isTrigger) {
      // R3: Gate-Trigger nullen — AUDIT (kein lautloses Verschwinden der Freigabepflicht)
      await client.query(
        `UPDATE rollen_freigabe_konfiguration SET lock_trigger_fassungslabel = NULL
         WHERE production_id = $1 AND lock_trigger_fassungslabel = $2`,
        [produktionId, labelName]
      )
      const userId = (req as any).user?.user_id ?? 'unknown'
      console.log(`[label-delete] Gate deaktiviert: produktion=${produktionId} label="${labelName}" replacement=${replacementName ?? 'NULL'} user=${userId}`)
      gateDisabled = true
    }

    // R1: Label löschen
    await client.query(
      `DELETE FROM stage_labels WHERE id = $1 AND produktion_id = $2`,
      [req.params.labelId, produktionId]
    )

    await client.query('COMMIT')
    res.json({ deleted: true, werkstufenUnlabeled, gateDisabled })
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: String(err) })
  } finally {
    client.release()
  }
})

// PATCH /api/produktionen/:produktionId/stage-labels/reorder — bulk sort_order update
stageLabelsRouter.patch('/reorder', async (req, res) => {
  const { produktionId } = req.params as any
  const { order } = req.body // [{ id, sort_order }]
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order array required' })
  try {
    for (const { id, sort_order } of order) {
      await queryOne(
        `UPDATE stage_labels SET sort_order = $1 WHERE id = $2 AND produktion_id = $3`,
        [sort_order, id, produktionId]
      )
    }
    const rows = await query(
      `SELECT * FROM stage_labels WHERE produktion_id = $1 ORDER BY sort_order, id`,
      [produktionId]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── Revision Colors ───────────────────────────────────────────────────────────

// GET /api/produktionen/:produktionId/revision-colors
revisionColorsRouter.get('/', async (req, res) => {
  const { produktionId } = req.params as any
  try {
    const rows = await query(
      `SELECT * FROM revision_colors WHERE produktion_id = $1 ORDER BY sort_order, id`,
      [produktionId]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/produktionen/:produktionId/revision-colors
revisionColorsRouter.post('/', async (req, res) => {
  const { produktionId } = req.params as any
  const { name, color, sort_order } = req.body
  if (!name || !color) return res.status(400).json({ error: 'name und color required' })
  try {
    const maxOrder = await queryOne(
      `SELECT COALESCE(MAX(sort_order), 0) AS m FROM revision_colors WHERE produktion_id = $1`,
      [produktionId]
    )
    const row = await queryOne(
      `INSERT INTO revision_colors (produktion_id, name, color, sort_order)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [produktionId, name, color, sort_order ?? (maxOrder.m + 1)]
    )
    res.status(201).json(row)
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'Revisions-Name bereits vorhanden' })
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/produktionen/:produktionId/revision-colors/:colorId
revisionColorsRouter.put('/:colorId', async (req, res) => {
  const { produktionId } = req.params as any
  const { name, color, sort_order } = req.body
  try {
    const row = await queryOne(
      `UPDATE revision_colors SET
         name = COALESCE($1, name),
         color = COALESCE($2, color),
         sort_order = COALESCE($3, sort_order)
       WHERE id = $4 AND produktion_id = $5 RETURNING *`,
      [name ?? null, color ?? null, sort_order ?? null, req.params.colorId, produktionId]
    )
    if (!row) return res.status(404).json({ error: 'Revisions-Farbe nicht gefunden' })
    res.json(row)
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'Revisions-Name bereits vorhanden' })
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/produktionen/:produktionId/revision-colors/:colorId
revisionColorsRouter.delete('/:colorId', async (req, res) => {
  const { produktionId } = req.params as any
  try {
    const row = await queryOne(
      `DELETE FROM revision_colors WHERE id = $1 AND produktion_id = $2 RETURNING id`,
      [req.params.colorId, produktionId]
    )
    if (!row) return res.status(404).json({ error: 'Revisions-Farbe nicht gefunden' })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/produktionen/:produktionId/revision-colors/wga-preset
const WGA_COLORS = [
  { name: 'Weiß',       color: '#FFFFFF' },
  { name: 'Blau',       color: '#AECFED' },
  { name: 'Pink',       color: '#FFB3C6' },
  { name: 'Gelb',       color: '#FFF2A0' },
  { name: 'Grün',       color: '#B5EAB5' },
  { name: 'Goldenrod',  color: '#EDCA74' },
  { name: 'Buff',       color: '#F5DEB3' },
  { name: 'Lachs',      color: '#FFB89A' },
  { name: 'Kirsche',    color: '#E07070' },
  { name: 'Tan',        color: '#CDB99A' },
  { name: 'Lavendel',   color: '#D8C8F0' },
]

revisionColorsRouter.post('/wga-preset', async (req, res) => {
  const { produktionId } = req.params as any
  try {
    const existing = await query(
      `SELECT name FROM revision_colors WHERE produktion_id = $1`,
      [produktionId]
    )
    const existingNames = new Set(existing.map((r: any) => r.name))
    const maxOrder = await queryOne(
      `SELECT COALESCE(MAX(sort_order), 0) AS m FROM revision_colors WHERE produktion_id = $1`,
      [produktionId]
    )
    let order = maxOrder.m
    for (const c of WGA_COLORS) {
      if (existingNames.has(c.name)) continue
      order++
      await queryOne(
        `INSERT INTO revision_colors (produktion_id, name, color, sort_order) VALUES ($1, $2, $3, $4)`,
        [produktionId, c.name, c.color, order]
      )
    }
    const rows = await query(
      `SELECT * FROM revision_colors WHERE produktion_id = $1 ORDER BY sort_order, id`,
      [produktionId]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PATCH /api/produktionen/:produktionId/revision-colors/reorder
revisionColorsRouter.patch('/reorder', async (req, res) => {
  const { produktionId } = req.params as any
  const { order } = req.body
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order array required' })
  try {
    for (const { id, sort_order } of order) {
      await queryOne(
        `UPDATE revision_colors SET sort_order = $1 WHERE id = $2 AND produktion_id = $3`,
        [sort_order, id, produktionId]
      )
    }
    const rows = await query(
      `SELECT * FROM revision_colors WHERE produktion_id = $1 ORDER BY sort_order, id`,
      [produktionId]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── Globale Revisions-Farben-Presets ──────────────────────────────────────────

revisionFarbenPresetsRouter.use(authMiddleware)

// GET /api/revision-farben-presets
revisionFarbenPresetsRouter.get('/', async (_req, res) => {
  try {
    const rows = await query(`SELECT * FROM revision_farben_presets ORDER BY erstellt_am`, [])
    res.json(rows)
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

// POST /api/revision-farben-presets
revisionFarbenPresetsRouter.post('/', async (req, res) => {
  const { name, farben } = req.body
  const user = (req as any).user
  if (!name || !Array.isArray(farben)) return res.status(400).json({ error: 'name und farben[] required' })
  try {
    const row = await queryOne(
      `INSERT INTO revision_farben_presets (name, farben, erstellt_von) VALUES ($1, $2, $3) RETURNING *`,
      [name, JSON.stringify(farben), user?.name ?? null]
    )
    res.status(201).json(row)
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'Preset-Name bereits vorhanden' })
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/revision-farben-presets/:id
revisionFarbenPresetsRouter.delete('/:id', async (req, res) => {
  try {
    const row = await queryOne(`DELETE FROM revision_farben_presets WHERE id = $1 RETURNING id`, [req.params.id])
    if (!row) return res.status(404).json({ error: 'Preset nicht gefunden' })
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

// ── Revision Export Einstellungen ─────────────────────────────────────────────

// GET /api/produktionen/:produktionId/revision-einstellungen
revisionEinstellungenRouter.get('/', async (req, res) => {
  const { produktionId } = req.params as any
  try {
    const row = await queryOne(
      `SELECT * FROM revision_export_einstellungen WHERE produktion_id = $1`,
      [produktionId]
    )
    res.json(row ?? { produktion_id: produktionId, memo_schwellwert_zeichen: 100 })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/produktionen/:produktionId/revision-einstellungen
revisionEinstellungenRouter.put('/', async (req, res) => {
  const { produktionId } = req.params as any
  const { memo_schwellwert_zeichen } = req.body
  if (typeof memo_schwellwert_zeichen !== 'number' || memo_schwellwert_zeichen < 0) {
    return res.status(400).json({ error: 'memo_schwellwert_zeichen muss eine nicht-negative Zahl sein' })
  }
  try {
    const row = await queryOne(
      `INSERT INTO revision_export_einstellungen (produktion_id, memo_schwellwert_zeichen)
       VALUES ($1, $2)
       ON CONFLICT (produktion_id) DO UPDATE SET
         memo_schwellwert_zeichen = EXCLUDED.memo_schwellwert_zeichen,
         updated_at = NOW()
       RETURNING *`,
      [produktionId, memo_schwellwert_zeichen]
    )
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

