import { Router } from 'express'
import { query, queryOne } from '../db'
import { authMiddleware, requireDkAccess, requireAnyDkAccess } from '../auth'

const router = Router()
router.use(authMiddleware)

const dkByProduktion = requireDkAccess(req => req.params.produktionId)
const dkAny = requireAnyDkAccess()

// ── Dokument-Typen (per Produktion) ───────────────────────────────────────────────

// GET /api/admin/dokument-typen/:produktionId
router.get('/dokument-typen/:produktionId', async (req, res) => {
  try {
    const rows = await query(
      `SELECT * FROM dokument_typ_definitionen WHERE produktion_id = $1 ORDER BY sort_order, id`,
      [req.params.produktionId]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/admin/dokument-typen/:produktionId
router.post('/dokument-typen/:produktionId', dkByProduktion,async (req, res) => {
  const { name, editor_modus, sort_order } = req.body
  if (!name) return res.status(400).json({ error: 'name required' })
  if (editor_modus && !['screenplay', 'richtext'].includes(editor_modus)) {
    return res.status(400).json({ error: 'editor_modus muss screenplay oder richtext sein' })
  }
  try {
    const row = await queryOne(
      `INSERT INTO dokument_typ_definitionen (produktion_id, name, editor_modus, sort_order, erstellt_von)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.params.produktionId, name, editor_modus ?? 'richtext', sort_order ?? 0, req.user!.user_id]
    )
    res.status(201).json(row)
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'Typ bereits vorhanden' })
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/admin/dokument-typen/:produktionId/:id
router.put('/dokument-typen/:produktionId/:id', dkByProduktion,async (req, res) => {
  const { name, editor_modus, sort_order } = req.body
  try {
    const row = await queryOne(
      `UPDATE dokument_typ_definitionen
       SET name = COALESCE($1, name),
           editor_modus = COALESCE($2, editor_modus),
           sort_order = COALESCE($3, sort_order)
       WHERE id = $4 AND produktion_id = $5 RETURNING *`,
      [name ?? null, editor_modus ?? null, sort_order ?? null, req.params.id, req.params.produktionId]
    )
    if (!row) return res.status(404).json({ error: 'Nicht gefunden' })
    res.json(row)
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'Name bereits vergeben' })
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/admin/dokument-typen/:produktionId/:id
router.delete('/dokument-typen/:produktionId/:id', dkByProduktion,async (req, res) => {
  try {
    const row = await queryOne(
      `DELETE FROM dokument_typ_definitionen WHERE id = $1 AND produktion_id = $2 RETURNING id`,
      [req.params.id, req.params.produktionId]
    )
    if (!row) return res.status(404).json({ error: 'Nicht gefunden' })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── Format-Templates ───────────────────────────────────────────────────────────

// GET /api/admin/format-templates
router.get('/format-templates', async (_req, res) => {
  try {
    const templates = await query(`SELECT * FROM editor_format_templates ORDER BY ist_standard DESC, name`)
    const withElemente = await Promise.all(templates.map(async (t: any) => {
      const elemente = await query(
        `SELECT * FROM editor_format_elemente WHERE template_id = $1 ORDER BY sort_order`,
        [t.id]
      )
      return { ...t, elemente }
    }))
    res.json(withElemente)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/admin/format-templates
router.post('/format-templates', dkAny, async (req, res) => {
  const { name } = req.body
  if (!name) return res.status(400).json({ error: 'name required' })
  try {
    const row = await queryOne(
      `INSERT INTO editor_format_templates (name, erstellt_von) VALUES ($1, $2) RETURNING *`,
      [name, req.user!.user_id]
    )
    res.status(201).json({ ...row, elemente: [] })
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'Template bereits vorhanden' })
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/admin/format-templates/:id/elemente — replace all elements
router.put('/format-templates/:id/elemente', dkAny, async (req, res) => {
  const { elemente } = req.body
  if (!Array.isArray(elemente)) return res.status(400).json({ error: 'elemente array required' })
  try {
    await queryOne(`DELETE FROM editor_format_elemente WHERE template_id = $1`, [req.params.id])
    const inserted = []
    for (const el of elemente) {
      const row = await queryOne(
        `INSERT INTO editor_format_elemente
           (template_id, element_typ, einrueckung_links, einrueckung_rechts,
            ausrichtung, grossbuchstaben, tab_folge_element, enter_folge_element, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [
          req.params.id, el.element_typ,
          el.einrueckung_links ?? 0, el.einrueckung_rechts ?? 0,
          el.ausrichtung ?? 'left', el.grossbuchstaben ?? false,
          el.tab_folge_element ?? null, el.enter_folge_element ?? null,
          el.sort_order ?? 0,
        ]
      )
      inserted.push(row)
    }
    res.json(inserted)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/admin/format-templates/:id
router.delete('/format-templates/:id', dkAny, async (req, res) => {
  try {
    const row = await queryOne(
      `DELETE FROM editor_format_templates WHERE id = $1 AND ist_standard = FALSE RETURNING id`,
      [req.params.id]
    )
    if (!row) return res.status(404).json({ error: 'Nicht gefunden oder Standard-Template kann nicht gelöscht werden' })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── Override-Rollen ────────────────────────────────────────────────────────────

// GET /api/admin/dokument-override-rollen
router.get('/dokument-override-rollen', async (_req, res) => {
  try {
    const row = await queryOne(`SELECT value FROM app_settings WHERE key = 'dokument_override_rollen'`)
    res.json({ rollen: JSON.parse(row?.value ?? '[]') })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/admin/dokument-override-rollen
router.put('/dokument-override-rollen', dkAny, async (req, res) => {
  const { rollen } = req.body
  if (!Array.isArray(rollen)) return res.status(400).json({ error: 'rollen array required' })
  try {
    await queryOne(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ('dokument_override_rollen', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [JSON.stringify(rollen)]
    )
    res.json({ rollen })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── Fassungs-Nummerierung-Modus ────────────────────────────────────────────────

// GET /api/admin/fassungs-nummerierung
router.get('/fassungs-nummerierung', async (_req, res) => {
  try {
    const row = await queryOne(`SELECT value FROM app_settings WHERE key = 'fassungs_nummerierung_modus'`)
    res.json({ modus: row?.value ?? 'global' })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/admin/fassungs-nummerierung
router.put('/fassungs-nummerierung', dkAny, async (req, res) => {
  const { modus } = req.body
  if (!['global', 'per_typ'].includes(modus)) {
    return res.status(400).json({ error: 'modus muss global oder per_typ sein' })
  }
  try {
    await queryOne(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ('fassungs_nummerierung_modus', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [modus]
    )
    res.json({ modus })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default router
