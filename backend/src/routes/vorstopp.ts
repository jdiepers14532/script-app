import { Router } from 'express'
import { query, queryOne } from '../db'
import { authMiddleware } from '../auth'

export const szenenVorstoppRouter = Router({ mergeParams: true })
export const vorstoppEinstellungenRouter = Router({ mergeParams: true })

szenenVorstoppRouter.use(authMiddleware)
vorstoppEinstellungenRouter.use(authMiddleware)

const VALID_STAGES = ['drehbuch', 'vorbereitung', 'dreh', 'schnitt'] as const

// ── Vorstopp pro Szene ────────────────────────────────────────────────────────

// GET /api/szenen/:szeneId/vorstopp
// Returns all entries, plus latest_per_stage summary
szenenVorstoppRouter.get('/', async (req, res) => {
  const { szeneId } = req.params as any
  try {
    const all = await query(
      `SELECT * FROM szenen_vorstopp WHERE szene_id = $1 ORDER BY stage, created_at DESC`,
      [szeneId]
    )
    // Build latest_per_stage map
    const latest: Record<string, any> = {}
    for (const row of all) {
      if (!latest[row.stage]) latest[row.stage] = row
    }
    res.json({ all, latest_per_stage: latest })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/szenen/:szeneId/vorstopp
szenenVorstoppRouter.post('/', async (req, res) => {
  const { szeneId } = req.params as any
  const { stage, dauer_sekunden, methode, user_name } = req.body
  const user = (req as any).user
  if (!stage || !VALID_STAGES.includes(stage)) {
    return res.status(400).json({ error: `stage muss einer von ${VALID_STAGES.join(', ')} sein` })
  }
  if (typeof dauer_sekunden !== 'number' || dauer_sekunden < 0) {
    return res.status(400).json({ error: 'dauer_sekunden muss eine nicht-negative Zahl sein' })
  }
  try {
    const row = await queryOne(
      `INSERT INTO szenen_vorstopp (szene_id, stage, user_id, user_name, dauer_sekunden, methode)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [szeneId, stage, user?.id ?? 'unknown', user_name ?? user?.name ?? null,
       dauer_sekunden, methode ?? 'manuell']
    )
    res.status(201).json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/szenen/:szeneId/vorstopp/:id
szenenVorstoppRouter.delete('/:id', async (req, res) => {
  const { szeneId } = req.params as any
  try {
    const row = await queryOne(
      `DELETE FROM szenen_vorstopp WHERE id = $1 AND szene_id = $2 RETURNING id`,
      [req.params.id, szeneId]
    )
    if (!row) return res.status(404).json({ error: 'Eintrag nicht gefunden' })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── Einstellungen (pro Staffel) ───────────────────────────────────────────────

// GET /api/staffeln/:staffelId/vorstopp-einstellungen
vorstoppEinstellungenRouter.get('/', async (req, res) => {
  const { staffelId } = req.params as any
  try {
    const row = await queryOne(
      `SELECT * FROM vorstopp_einstellungen WHERE staffel_id = $1`,
      [staffelId]
    )
    // Return defaults if not configured yet
    res.json(row ?? {
      staffel_id: staffelId,
      methode: 'seiten',
      menge: 0.125,
      dauer_sekunden: 60,
    })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/staffeln/:staffelId/vorstopp-einstellungen
vorstoppEinstellungenRouter.put('/', async (req, res) => {
  const { staffelId } = req.params as any
  const { methode, menge, dauer_sekunden } = req.body
  if (methode && !['seiten', 'zeichen', 'woerter'].includes(methode)) {
    return res.status(400).json({ error: 'methode muss seiten, zeichen oder woerter sein' })
  }
  try {
    const row = await queryOne(
      `INSERT INTO vorstopp_einstellungen (staffel_id, methode, menge, dauer_sekunden)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (staffel_id) DO UPDATE SET
         methode = EXCLUDED.methode,
         menge = EXCLUDED.menge,
         dauer_sekunden = EXCLUDED.dauer_sekunden,
         updated_at = NOW()
       RETURNING *`,
      [staffelId, methode ?? 'seiten', menge ?? 0.125, dauer_sekunden ?? 60]
    )
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── Auto-Berechnung ───────────────────────────────────────────────────────────

// POST /api/szenen/:szeneId/vorstopp/auto
// Berechnet Vorstopp automatisch aus seiten/content und Produktions-Einstellungen
szenenVorstoppRouter.post('/auto', async (req, res) => {
  const { szeneId } = req.params as any
  try {
    const szene = await queryOne(
      `SELECT sz.seiten, sz.content, sz.stage_id, st.staffel_id
       FROM szenen sz JOIN stages st ON st.id = sz.stage_id
       WHERE sz.id = $1`,
      [szeneId]
    )
    if (!szene) return res.status(404).json({ error: 'Szene nicht gefunden' })

    const einst = await queryOne(
      `SELECT * FROM vorstopp_einstellungen WHERE staffel_id = $1`,
      [szene.staffel_id]
    )
    if (!einst) return res.status(400).json({ error: 'Keine Vorstopp-Einstellungen für diese Produktion konfiguriert' })

    let menge_ist = 0
    let methode_used: string

    if (einst.methode === 'seiten' && szene.seiten) {
      // Parse "2 5/8" → 2.625
      const parts = String(szene.seiten).trim().split(' ')
      let total = 0
      for (const p of parts) {
        if (p.includes('/')) {
          const [n, d] = p.split('/').map(Number)
          total += n / d
        } else {
          total += parseFloat(p) || 0
        }
      }
      menge_ist = total
      methode_used = 'auto_seiten'
    } else if (einst.methode === 'zeichen') {
      const content = Array.isArray(szene.content) ? szene.content : []
      const text = content.map((b: any) => b.text ?? '').join(' ')
      menge_ist = text.replace(/\s/g, '').length
      methode_used = 'auto_zeichen'
    } else if (einst.methode === 'woerter') {
      const content = Array.isArray(szene.content) ? szene.content : []
      const text = content.map((b: any) => b.text ?? '').join(' ')
      menge_ist = text.trim().split(/\s+/).filter(Boolean).length
      methode_used = 'auto_woerter'
    } else {
      return res.status(400).json({ error: 'Keine verwertbaren Daten für Auto-Berechnung' })
    }

    const ratio = einst.dauer_sekunden / einst.menge
    const dauer_sekunden = Math.round(menge_ist * ratio)

    res.json({ dauer_sekunden, methode: methode_used!, menge_ist, einstellungen: einst })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})
