import { Router } from 'express'
import { pool, query, queryOne } from '../db'
import { authMiddleware } from '../auth'

// ── Absatzformate pro Produktion ────────────────────────────────────────────
// Mounted at /api/produktionen/:produktionId/absatzformate
export const absatzformateRouter = Router({ mergeParams: true })
absatzformateRouter.use(authMiddleware)

// ── Presets (global) ────────────────────────────────────────────────────────
// Mounted at /api/absatzformat-presets
export const absatzformatPresetsRouter = Router()
absatzformatPresetsRouter.use(authMiddleware)

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/produktionen/:produktionId/absatzformate
// ══════════════════════════════════════════════════════════════════════════════
absatzformateRouter.get('/', async (req, res) => {
  try {
    const pid = (req.params as any).produktionId
    const rows = await query(
      `SELECT * FROM absatzformate WHERE produktion_id = $1 ORDER BY sort_order, name`,
      [pid]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/produktionen/:produktionId/absatzformate — create single format
// ══════════════════════════════════════════════════════════════════════════════
absatzformateRouter.post('/', async (req, res) => {
  try {
    const pid = (req.params as any).produktionId
    const {
      name, kuerzel, textbaustein, font_family, font_size,
      bold, italic, underline, uppercase, text_align,
      margin_left, margin_right, space_before, space_after, line_height,
      enter_next_format, tab_next_format, sort_order, ist_standard, kategorie,
      shortcut,
    } = req.body

    if (!name) return res.status(400).json({ error: 'name required' })

    const row = await queryOne(
      `INSERT INTO absatzformate
         (produktion_id, name, kuerzel, textbaustein, font_family, font_size,
          bold, italic, underline, uppercase, text_align,
          margin_left, margin_right, space_before, space_after, line_height,
          enter_next_format, tab_next_format, sort_order, ist_standard, kategorie,
          shortcut)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
       RETURNING *`,
      [
        pid, name, kuerzel ?? null, textbaustein ?? null,
        font_family ?? 'Courier Prime', font_size ?? 12,
        bold ?? false, italic ?? false, underline ?? false, uppercase ?? false,
        text_align ?? 'left',
        margin_left ?? 0, margin_right ?? 0, space_before ?? 12, space_after ?? 0,
        line_height ?? 1.0,
        enter_next_format ?? null, tab_next_format ?? null,
        sort_order ?? 0, ist_standard ?? false, kategorie ?? 'alle',
        shortcut ?? null,
      ]
    )
    res.status(201).json(row)
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'Absatzformat mit diesem Namen existiert bereits' })
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// PUT /api/produktionen/:produktionId/absatzformate/:id — update format
// ══════════════════════════════════════════════════════════════════════════════
absatzformateRouter.put('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const pid = (req.params as any).produktionId
    const {
      name, kuerzel, textbaustein, font_family, font_size,
      bold, italic, underline, uppercase, text_align,
      margin_left, margin_right, space_before, space_after, line_height,
      enter_next_format, tab_next_format, sort_order, ist_standard, kategorie,
      shortcut,
    } = req.body

    const row = await queryOne(
      `UPDATE absatzformate SET
        name = COALESCE($1, name),
        kuerzel = COALESCE($2, kuerzel),
        textbaustein = $3,
        font_family = COALESCE($4, font_family),
        font_size = COALESCE($5, font_size),
        bold = COALESCE($6, bold),
        italic = COALESCE($7, italic),
        underline = COALESCE($8, underline),
        uppercase = COALESCE($9, uppercase),
        text_align = COALESCE($10, text_align),
        margin_left = COALESCE($11, margin_left),
        margin_right = COALESCE($12, margin_right),
        space_before = COALESCE($13, space_before),
        space_after = COALESCE($14, space_after),
        line_height = COALESCE($15, line_height),
        enter_next_format = $16,
        tab_next_format = $17,
        sort_order = COALESCE($18, sort_order),
        ist_standard = COALESCE($19, ist_standard),
        kategorie = COALESCE($20, kategorie),
        shortcut = $21
       WHERE id = $22 AND produktion_id = $23
       RETURNING *`,
      [
        name, kuerzel, textbaustein ?? null,
        font_family, font_size,
        bold, italic, underline, uppercase, text_align,
        margin_left, margin_right, space_before, space_after, line_height,
        enter_next_format ?? null, tab_next_format ?? null,
        sort_order, ist_standard, kategorie,
        shortcut ?? null,
        id, pid,
      ]
    )
    if (!row) return res.status(404).json({ error: 'Absatzformat nicht gefunden' })
    res.json(row)
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'Name bereits vergeben' })
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// DELETE /api/produktionen/:produktionId/absatzformate/:id
// ══════════════════════════════════════════════════════════════════════════════
absatzformateRouter.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const pid = (req.params as any).produktionId
    const row = await queryOne(
      'DELETE FROM absatzformate WHERE id = $1 AND produktion_id = $2 RETURNING id',
      [id, pid]
    )
    if (!row) return res.status(404).json({ error: 'Absatzformat nicht gefunden' })
    res.status(204).send()
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/produktionen/:produktionId/absatzformate/reorder
// ══════════════════════════════════════════════════════════════════════════════
absatzformateRouter.post('/reorder', async (req, res) => {
  const pid = (req.params as any).produktionId
  const { order } = req.body // [{ id: string, sort_order: number }]
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order array required' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const entry of order) {
      await client.query(
        'UPDATE absatzformate SET sort_order = $1 WHERE id = $2 AND produktion_id = $3',
        [entry.sort_order, entry.id, pid]
      )
    }
    await client.query('COMMIT')
    const rows = await query(
      'SELECT * FROM absatzformate WHERE produktion_id = $1 ORDER BY sort_order, name',
      [pid]
    )
    res.json(rows)
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: String(err) })
  } finally {
    client.release()
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/produktionen/:produktionId/absatzformate/:id/set-standard
// Sets ist_standard=true for this format, resets others in same kategorie
// ══════════════════════════════════════════════════════════════════════════════
absatzformateRouter.post('/:id/set-standard', async (req, res) => {
  const pid = (req.params as any).produktionId
  const { id } = req.params
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const fmt = await client.query(
      'SELECT kategorie FROM absatzformate WHERE id = $1 AND produktion_id = $2',
      [id, pid]
    )
    if (fmt.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Absatzformat nicht gefunden' })
    }
    const kategorie = fmt.rows[0].kategorie
    await client.query(
      'UPDATE absatzformate SET ist_standard = false WHERE produktion_id = $1 AND kategorie = $2',
      [pid, kategorie]
    )
    const row = await client.query(
      'UPDATE absatzformate SET ist_standard = true WHERE id = $1 AND produktion_id = $2 RETURNING *',
      [id, pid]
    )
    await client.query('COMMIT')
    res.json(row.rows[0])
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: String(err) })
  } finally {
    client.release()
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/produktionen/:produktionId/absatzformate/from-preset
// Applies a preset: deletes existing formats and inserts preset formats
// ══════════════════════════════════════════════════════════════════════════════
absatzformateRouter.post('/from-preset', async (req, res) => {
  const pid = (req.params as any).produktionId
  const { preset_id } = req.body
  if (!preset_id) return res.status(400).json({ error: 'preset_id required' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const preset = await client.query('SELECT * FROM absatzformat_presets WHERE id = $1', [preset_id])
    if (preset.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Preset nicht gefunden' })
    }

    const formate = preset.rows[0].formate as any[]

    // If preset covers no storyline/notiz formats, preserve existing ones
    const kategorien = new Set((formate as any[]).map((f: any) => f.kategorie))
    const presetHasStoryline = kategorien.has('storyline') || kategorien.has('alle')
    const presetHasNotiz = kategorien.has('notiz') || kategorien.has('alle')

    if (presetHasStoryline && presetHasNotiz) {
      await client.query('DELETE FROM absatzformate WHERE produktion_id = $1', [pid])
    } else {
      const toClear = ['drehbuch', 'alle']
      if (presetHasStoryline) toClear.push('storyline')
      if (presetHasNotiz) toClear.push('notiz')
      await client.query(
        `DELETE FROM absatzformate WHERE produktion_id = $1 AND kategorie = ANY($2::text[])`,
        [pid, toClear]
      )
    }

    // Insert formats — first pass without flow references (to get UUIDs)
    const nameToId = new Map<string, string>()
    for (const fmt of formate) {
      const row = await client.query(
        `INSERT INTO absatzformate
           (produktion_id, name, kuerzel, textbaustein, font_family, font_size,
            bold, italic, underline, uppercase, text_align,
            margin_left, margin_right, space_before, space_after, line_height,
            sort_order, ist_standard, kategorie, shortcut)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
         RETURNING id`,
        [
          pid, fmt.name, fmt.kuerzel ?? null, fmt.textbaustein ?? null,
          fmt.font_family ?? 'Courier Prime', fmt.font_size ?? 12,
          fmt.bold ?? false, fmt.italic ?? false, fmt.underline ?? false,
          fmt.uppercase ?? false, fmt.text_align ?? 'left',
          fmt.margin_left ?? 0, fmt.margin_right ?? 0,
          fmt.space_before ?? 12, fmt.space_after ?? 0,
          fmt.line_height ?? 1.0,
          fmt.sort_order ?? 0, fmt.ist_standard ?? false, fmt.kategorie ?? 'alle',
          fmt.shortcut ?? null,
        ]
      )
      nameToId.set(fmt.name, row.rows[0].id)
    }

    // Second pass: wire up enter_next_format / tab_next_format by name
    for (const fmt of formate) {
      const id = nameToId.get(fmt.name)
      const enterNext = fmt.enter_next ? nameToId.get(fmt.enter_next) ?? null : null
      const tabNext = fmt.tab_next ? nameToId.get(fmt.tab_next) ?? null : null
      if (enterNext || tabNext) {
        await client.query(
          `UPDATE absatzformate SET enter_next_format = $1, tab_next_format = $2 WHERE id = $3`,
          [enterNext, tabNext, id]
        )
      }
    }

    await client.query('COMMIT')

    const rows = await query(
      'SELECT * FROM absatzformate WHERE produktion_id = $1 ORDER BY sort_order, name',
      [pid]
    )
    res.status(201).json(rows)
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: String(err) })
  } finally {
    client.release()
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/produktionen/:produktionId/absatzformate/from-produktion
// Copies all formats from another production
// ══════════════════════════════════════════════════════════════════════════════
absatzformateRouter.post('/from-produktion', async (req, res) => {
  const pid = (req.params as any).produktionId
  const { source_produktion_id } = req.body
  if (!source_produktion_id) return res.status(400).json({ error: 'source_produktion_id required' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Load source formats
    const sourceRows = await client.query(
      'SELECT * FROM absatzformate WHERE produktion_id = $1 ORDER BY sort_order',
      [source_produktion_id]
    )
    if (sourceRows.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Quell-Produktion hat keine Absatzformate' })
    }

    // Delete existing
    await client.query('DELETE FROM absatzformate WHERE produktion_id = $1', [pid])

    // Insert — first pass without flow refs
    const oldToNew = new Map<string, string>()
    for (const src of sourceRows.rows) {
      const row = await client.query(
        `INSERT INTO absatzformate
           (produktion_id, name, kuerzel, textbaustein, font_family, font_size,
            bold, italic, underline, uppercase, text_align,
            margin_left, margin_right, space_before, space_after, line_height,
            sort_order, ist_standard, kategorie)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         RETURNING id`,
        [
          pid, src.name, src.kuerzel, src.textbaustein,
          src.font_family, src.font_size,
          src.bold, src.italic, src.underline, src.uppercase, src.text_align,
          src.margin_left, src.margin_right, src.space_before, src.space_after,
          src.line_height,
          src.sort_order, src.ist_standard, src.kategorie,
        ]
      )
      oldToNew.set(src.id, row.rows[0].id)
    }

    // Second pass: wire flow refs
    for (const src of sourceRows.rows) {
      const newId = oldToNew.get(src.id)
      const enterNext = src.enter_next_format ? oldToNew.get(src.enter_next_format) ?? null : null
      const tabNext = src.tab_next_format ? oldToNew.get(src.tab_next_format) ?? null : null
      if (enterNext || tabNext) {
        await client.query(
          'UPDATE absatzformate SET enter_next_format = $1, tab_next_format = $2 WHERE id = $3',
          [enterNext, tabNext, newId]
        )
      }
    }

    await client.query('COMMIT')

    const rows = await query(
      'SELECT * FROM absatzformate WHERE produktion_id = $1 ORDER BY sort_order, name',
      [pid]
    )
    res.status(201).json(rows)
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: String(err) })
  } finally {
    client.release()
  }
})


// ══════════════════════════════════════════════════════════════════════════════
// PRESETS
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/absatzformat-presets
absatzformatPresetsRouter.get('/', async (_req, res) => {
  try {
    const rows = await query('SELECT * FROM absatzformat_presets ORDER BY ist_system DESC, name')
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/absatzformat-presets/:id
absatzformatPresetsRouter.get('/:id', async (req, res) => {
  try {
    const row = await queryOne('SELECT * FROM absatzformat_presets WHERE id = $1', [req.params.id])
    if (!row) return res.status(404).json({ error: 'Preset nicht gefunden' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/absatzformat-presets — save current production config as new preset
absatzformatPresetsRouter.post('/', async (req, res) => {
  try {
    const { name, beschreibung, formate, erstellt_von, seitenformat, page_margins } = req.body
    if (!name || !formate) return res.status(400).json({ error: 'name and formate required' })

    const row = await queryOne(
      `INSERT INTO absatzformat_presets (name, beschreibung, formate, ist_system, erstellt_von, seitenformat, page_margins)
       VALUES ($1, $2, $3, false, $4, $5, $6)
       RETURNING *`,
      [name, beschreibung ?? null, JSON.stringify(formate), erstellt_von ?? null, seitenformat ?? 'a4', page_margins ? JSON.stringify(page_margins) : null]
    )
    res.status(201).json(row)
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'Preset-Name existiert bereits' })
    res.status(500).json({ error: String(err) })
  }
})

// PATCH /api/absatzformat-presets/:id — rename or update template
// System-Presets: nur Superadmin darf ändern
absatzformatPresetsRouter.patch('/:id', async (req, res) => {
  try {
    const { name, beschreibung, szenen_kopf_template, seitenformat, page_margins } = req.body
    const isSuperadmin = (req as any).user?.roles?.includes('superadmin')
    const updates: string[] = []
    const params: any[] = []
    let n = 1

    if (name !== undefined) { updates.push(`name = $${n++}`); params.push(name) }
    if (beschreibung !== undefined) { updates.push(`beschreibung = $${n++}`); params.push(beschreibung) }
    if (szenen_kopf_template !== undefined) { updates.push(`szenen_kopf_template = $${n++}`); params.push(szenen_kopf_template) }
    if (seitenformat !== undefined) { updates.push(`seitenformat = $${n++}`); params.push(seitenformat) }
    if (page_margins !== undefined) { updates.push(`page_margins = $${n++}`); params.push(page_margins ? JSON.stringify(page_margins) : null) }

    if (updates.length === 0) return res.status(400).json({ error: 'Nichts zu aktualisieren' })

    params.push(req.params.id)
    // Superadmin darf alles; alle anderen nur non-system
    const whereClause = isSuperadmin ? `id = $${n}` : `id = $${n} AND ist_system = false`
    const row = await queryOne(
      `UPDATE absatzformat_presets SET ${updates.join(', ')} WHERE ${whereClause} RETURNING *`,
      params
    )
    if (!row) return res.status(404).json({ error: 'Preset nicht gefunden oder keine Berechtigung' })
    res.json(row)
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'Name bereits vergeben' })
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/absatzformat-presets/:id/duplicate — Preset duplizieren
absatzformatPresetsRouter.post('/:id/duplicate', async (req, res) => {
  try {
    const source = await queryOne('SELECT * FROM absatzformat_presets WHERE id = $1', [req.params.id])
    if (!source) return res.status(404).json({ error: 'Preset nicht gefunden' })

    const baseName = `${source.name} (Kopie)`
    let name = baseName
    let attempt = 1
    // Eindeutigen Namen finden
    while (true) {
      const existing = await queryOne('SELECT id FROM absatzformat_presets WHERE name = $1', [name])
      if (!existing) break
      attempt++
      name = `${baseName} ${attempt}`
    }

    const row = await queryOne(
      `INSERT INTO absatzformat_presets (name, beschreibung, formate, szenen_kopf_template, ist_system, erstellt_von, seitenformat, page_margins)
       VALUES ($1, $2, $3, $4, false, $5, $6, $7)
       RETURNING *`,
      [
        name,
        source.beschreibung ? `Kopie von: ${source.beschreibung}` : null,
        JSON.stringify(source.formate),
        source.szenen_kopf_template ?? null,
        (req as any).user?.user_id ?? null,
        source.seitenformat ?? 'a4',
        source.page_margins ?? null,
      ]
    )
    res.status(201).json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/absatzformat-presets/:id — only non-system presets
absatzformatPresetsRouter.delete('/:id', async (req, res) => {
  try {
    const row = await queryOne(
      'DELETE FROM absatzformat_presets WHERE id = $1 AND ist_system = false RETURNING id',
      [req.params.id]
    )
    if (!row) return res.status(404).json({ error: 'Preset nicht gefunden oder System-Preset' })
    res.status(204).send()
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})
