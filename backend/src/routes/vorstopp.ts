import { Router } from 'express'
import { query, queryOne } from '../db'
import { authMiddleware } from '../auth'

export const szenenVorstoppRouter = Router({ mergeParams: true })
export const vorstoppEinstellungenRouter = Router({ mergeParams: true })

szenenVorstoppRouter.use(authMiddleware)
vorstoppEinstellungenRouter.use(authMiddleware)

const VALID_STAGES = ['drehbuch', 'vorbereitung', 'dreh', 'schnitt'] as const

// ── Vorstopp pro Szene ────────────────────────────────────────────────────────
// Legacy GET/POST/DELETE routes removed (v51: szene_id dropped from szenen_vorstopp).
// Current vorstopp routes use scene_identity_id via /api/dokument-szenen/:id/vorstopp.

// ── Einstellungen (pro Produktion) ───────────────────────────────────────────────

// GET /api/produktionen/:produktionId/vorstopp-einstellungen
vorstoppEinstellungenRouter.get('/', async (req, res) => {
  const { produktionId } = req.params as any
  try {
    const row = await queryOne(
      `SELECT produktion_id, methode, menge::float8 AS menge, dauer_sekunden, updated_at FROM vorstopp_einstellungen WHERE produktion_id = $1`,
      [produktionId]
    )
    // Return defaults if not configured yet
    res.json(row ?? {
      produktion_id: produktionId,
      methode: 'seiten',
      menge: 0.125,
      dauer_sekunden: 60,
    })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/produktionen/:produktionId/vorstopp-einstellungen
vorstoppEinstellungenRouter.put('/', async (req, res) => {
  const { produktionId } = req.params as any
  const { methode, menge, dauer_sekunden } = req.body
  if (methode && !['seiten', 'zeichen', 'zeichen_mit_leerzeichen', 'woerter'].includes(methode)) {
    return res.status(400).json({ error: 'methode muss seiten, zeichen, zeichen_mit_leerzeichen oder woerter sein' })
  }
  try {
    const row = await queryOne(
      `INSERT INTO vorstopp_einstellungen (produktion_id, methode, menge, dauer_sekunden)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (produktion_id) DO UPDATE SET
         methode = EXCLUDED.methode,
         menge = EXCLUDED.menge,
         dauer_sekunden = EXCLUDED.dauer_sekunden,
         updated_at = NOW()
       RETURNING produktion_id, methode, menge::float8 AS menge, dauer_sekunden, updated_at`,
      [produktionId, methode ?? 'seiten', menge ?? 0.125, dauer_sekunden ?? 60]
    )
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── Auto-Berechnung ───────────────────────────────────────────────────────────

// POST /api/szenen/:szeneId/vorstopp/auto
// Berechnet Vorstopp automatisch aus seiten/content und Produktions-Einstellungen
// szeneId = dokument_szenen.id (UUID)
szenenVorstoppRouter.post('/auto', async (req, res) => {
  const { szeneId } = req.params as any
  try {
    const szene = await queryOne(
      `SELECT ds.seiten, ds.content, f.produktion_id
       FROM dokument_szenen ds
       JOIN werkstufen w ON w.id = ds.werkstufe_id
       JOIN folgen f ON f.id = w.folge_id
       WHERE ds.id = $1`,
      [szeneId]
    )
    if (!szene) return res.status(404).json({ error: 'Szene nicht gefunden' })

    const einst = await queryOne(
      `SELECT * FROM vorstopp_einstellungen WHERE produktion_id = $1`,
      [szene.produktion_id]
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
    } else if (einst.methode === 'zeichen_mit_leerzeichen') {
      const content = Array.isArray(szene.content) ? szene.content : []
      const text = content.map((b: any) => b.text ?? '').join(' ')
      menge_ist = text.length
      methode_used = 'auto_zeichen_mit_leerzeichen'
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
