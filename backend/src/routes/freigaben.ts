/**
 * freigaben.ts — Zentrale Freigaben-Übersicht (Phase 5)
 *
 * GET /api/freigaben/meine                         — offene Anfragen für den aktuellen User als Genehmiger
 * GET /api/freigaben/matrix?prod=&folge_id=        — Matrix aller offenen Anfragen (DK), gruppiert nach Folge
 * POST /api/freigaben/batch-entscheiden            — Batch-Entscheidung (Genehmiger ODER DK-Override)
 */

import { Router } from 'express'
import { query, queryOne } from '../db'
import { recalcAnfrageStatus, recalcSzenenAnfrageStatus } from './rollen-freigabe'
import { requireDkAccess } from '../middleware/auth'

export const freigabenRouter = Router()

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/freigaben/meine
// Alle offenen Budget- und Dispo-Anfragen, bei denen der aktuelle User als Genehmiger eingetragen ist.
// ─────────────────────────────────────────────────────────────────────────────
freigabenRouter.get('/meine', async (req, res) => {
  try {
    const userId = (req as any).user?.user_id
    if (!userId) return res.status(401).json({ error: 'Nicht eingeloggt' })

    // Budget-Anfragen (rollen_freigabe_anfragen)
    const budgetRows = await query(
      `SELECT rfa.id AS anfrage_id,
              rfa.character_id,
              c.name AS rollen_name,
              rfa.production_id,
              rfa.beantragt_am,
              rfa.notiz,
              rfa.erneut_anfrage_notiz,
              rfgs.id AS gs_id,
              rfgs.token_gueltig_bis,
              f.folge_nummer,
              ds.scene_nummer,
              ds.ort_name,
              ds.id AS szene_id
       FROM rollen_freigabe_anfragen rfa
       JOIN characters c ON c.id = rfa.character_id
       JOIN rollen_freigabe_genehmiger_status rfgs
         ON rfgs.anfrage_id = rfa.id AND rfgs.user_id = $1 AND rfgs.entschieden IS NULL
       LEFT JOIN dokument_szenen ds ON ds.id::TEXT = rfa.szene_id
       LEFT JOIN werkstufen w ON w.id = ds.werkstufe_id
       LEFT JOIN folgen f ON f.id = w.folge_id
       WHERE rfa.status = 'ausstehend'
         AND rfgs.token_gueltig_bis > NOW()
       ORDER BY f.folge_nummer ASC NULLS LAST, rfa.beantragt_am ASC`,
      [userId]
    )

    // Dispo-Anfragen (szenen_freigabe_anfragen)
    const dispoRows = await query(
      `SELECT sfa.id AS anfrage_id,
              sfa.character_id,
              c.name AS rollen_name,
              sfa.production_id,
              sfa.scene_identity_id,
              sfa.beantragt_am,
              sfa.notiz,
              sfa.erneut_anfrage_notiz,
              sfgs.id AS gs_id,
              sfgs.token_gueltig_bis,
              f.folge_nummer,
              ds.scene_nummer,
              ds.ort_name,
              ds.id AS szene_id
       FROM szenen_freigabe_anfragen sfa
       JOIN characters c ON c.id = sfa.character_id
       JOIN szenen_freigabe_genehmiger_status sfgs
         ON sfgs.anfrage_id = sfa.id AND sfgs.user_id = $1 AND sfgs.entschieden IS NULL
       LEFT JOIN dokument_szenen ds
         ON ds.scene_identity_id = sfa.scene_identity_id
         AND ds.werkstufe_id = (
           SELECT w2.id FROM werkstufen w2
           WHERE w2.folge_id = (
             SELECT w3.folge_id FROM dokument_szenen ds3
             JOIN werkstufen w3 ON w3.id = ds3.werkstufe_id
             WHERE ds3.scene_identity_id = sfa.scene_identity_id
             LIMIT 1
           )
           AND w2.typ = 'drehbuch' AND w2.geloescht = false
           ORDER BY w2.version_nummer DESC LIMIT 1
         )
       LEFT JOIN werkstufen w ON w.id = ds.werkstufe_id
       LEFT JOIN folgen f ON f.id = w.folge_id
       WHERE sfa.status = 'ausstehend'
         AND sfgs.token_gueltig_bis > NOW()
       ORDER BY f.folge_nummer ASC NULLS LAST, sfa.beantragt_am ASC`,
      [userId]
    )

    res.json({
      budget: budgetRows.map((r: any) => ({ ...r, typ: 'budget' })),
      dispo: dispoRows.map((r: any) => ({ ...r, typ: 'dispo' })),
    })
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/freigaben/matrix?prod=&folge_id=
// Matrix aller offenen Anfragen einer Produktion, optional gefiltert auf eine Folge.
// Gruppiert nach Folge > Szene. DK-Ansicht.
// ─────────────────────────────────────────────────────────────────────────────
freigabenRouter.get('/matrix', requireDkAccess, async (req, res) => {
  try {
    const { prod, folge_id } = req.query as Record<string, string>
    if (!prod) return res.status(400).json({ error: 'prod erforderlich' })

    const folgeFilter = folge_id ? 'AND f.id = $2' : ''
    const params: any[] = [prod]
    if (folge_id) params.push(folge_id)

    // Budget: character_productions mit offenem Status + scene_characters-Verortung
    const budgetRows = await query(
      `SELECT DISTINCT ON (c.id, f.id)
              rfa.id AS anfrage_id,
              c.id AS character_id,
              c.name AS rollen_name,
              cp.freigabe_status,
              f.id AS folge_id,
              f.folge_nummer,
              ds.id AS szene_id,
              ds.scene_identity_id,
              ds.scene_nummer,
              ds.ort_name,
              rfa.notiz
       FROM character_productions cp
       JOIN characters c ON c.id = cp.character_id
       LEFT JOIN rollen_freigabe_anfragen rfa
         ON rfa.character_id = cp.character_id AND rfa.production_id = cp.produktion_id AND rfa.status IN ('ausstehend', 'abgelehnt')
       LEFT JOIN scene_characters sc ON sc.character_id = cp.character_id
       LEFT JOIN dokument_szenen ds ON ds.scene_identity_id = sc.scene_identity_id AND ds.werkstufe_id = sc.werkstufe_id
       LEFT JOIN werkstufen w ON w.id = ds.werkstufe_id
       LEFT JOIN folgen f ON f.id = w.folge_id
       WHERE cp.produktion_id = $1
         AND cp.freigabe_status IN ('ausstehend', 'abgelehnt')
         ${folgeFilter}
       ORDER BY c.id, f.id, f.folge_nummer ASC NULLS LAST`,
      params
    )

    // Dispo: scene_characters.status != 'bestaetigt'
    const dispoRows = await query(
      `SELECT sfa.id AS anfrage_id,
              c.id AS character_id,
              c.name AS rollen_name,
              sc.status AS dispo_status,
              f.id AS folge_id,
              f.folge_nummer,
              ds.id AS szene_id,
              ds.scene_identity_id,
              ds.scene_nummer,
              ds.ort_name,
              sfa.notiz
       FROM scene_characters sc
       JOIN characters c ON c.id = sc.character_id
       JOIN dokument_szenen ds ON ds.scene_identity_id = sc.scene_identity_id AND ds.werkstufe_id = sc.werkstufe_id
       JOIN werkstufen w ON w.id = ds.werkstufe_id
       JOIN folgen f ON f.id = w.folge_id
       LEFT JOIN szenen_freigabe_anfragen sfa
         ON sfa.character_id = sc.character_id AND sfa.scene_identity_id = sc.scene_identity_id AND sfa.status IN ('ausstehend', 'abgelehnt')
       WHERE f.produktion_id = $1
         AND sc.status != 'bestaetigt'
         ${folgeFilter}
       ORDER BY f.folge_nummer ASC, ds.scene_nummer ASC`,
      params
    )

    // Zusammenführen: nach Folge gruppieren
    const folgeMap = new Map<string, {
      folge_id: string; folge_nummer: number;
      scenes: Map<string, {
        szene_id: string; scene_identity_id: string; scene_nummer: string; ort_name: string;
        items: Array<{
          character_id: string; rollen_name: string; typ: 'budget' | 'dispo';
          status: string; anfrage_id: string | null; notiz: string | null
        }>
      }>
    }>()

    const ensureScene = (folgeId: string, folgeNr: number, szeneId: string, sceneIdentityId: string, sceneNr: string, ortName: string) => {
      if (!folgeMap.has(folgeId)) {
        folgeMap.set(folgeId, { folge_id: folgeId, folge_nummer: folgeNr, scenes: new Map() })
      }
      const folge = folgeMap.get(folgeId)!
      if (!folge.scenes.has(sceneIdentityId ?? szeneId)) {
        folge.scenes.set(sceneIdentityId ?? szeneId, {
          szene_id: szeneId, scene_identity_id: sceneIdentityId, scene_nummer: sceneNr ?? '?', ort_name: ortName ?? '',
          items: [],
        })
      }
      return folge.scenes.get(sceneIdentityId ?? szeneId)!
    }

    for (const r of budgetRows) {
      if (!r.folge_id) continue
      const scene = ensureScene(r.folge_id, r.folge_nummer, r.szene_id, r.scene_identity_id, r.scene_nummer, r.ort_name)
      scene.items.push({
        character_id: r.character_id, rollen_name: r.rollen_name,
        typ: 'budget', status: r.freigabe_status,
        anfrage_id: r.anfrage_id ?? null, notiz: r.notiz ?? null,
      })
    }

    for (const r of dispoRows) {
      if (!r.folge_id) continue
      const scene = ensureScene(r.folge_id, r.folge_nummer, r.szene_id, r.scene_identity_id, r.scene_nummer, r.ort_name)
      scene.items.push({
        character_id: r.character_id, rollen_name: r.rollen_name,
        typ: 'dispo', status: r.dispo_status,
        anfrage_id: r.anfrage_id ?? null, notiz: r.notiz ?? null,
      })
    }

    const result = Array.from(folgeMap.values()).map(f => ({
      ...f,
      scenes: Array.from(f.scenes.values()),
    }))

    res.json(result)
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/freigaben/batch-entscheiden
// Batch-Entscheidung für mehrere Anfragen in einem Zug.
// Zwei Modi:
//   - Genehmiger-Modus (kein DK-Zugang nötig): entscheidet eigene gs-Einträge
//   - DK-Override (Anfrage muss production_id haben, wird gegen DK-Zugang geprüft)
// Body: { items: [{ typ, anfrage_id, production_id?, entscheidung, notiz? }] }
// ─────────────────────────────────────────────────────────────────────────────
freigabenRouter.post('/batch-entscheiden', async (req, res) => {
  try {
    const userId = (req as any).user?.user_id
    if (!userId) return res.status(401).json({ error: 'Nicht eingeloggt' })

    const { items } = req.body as {
      items: Array<{
        typ: 'budget' | 'dispo'
        anfrage_id: string
        entscheidung: 'freigeben' | 'ablehnen'
        notiz?: string
        modus?: 'genehmiger' | 'dk'
      }>
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items erforderlich' })
    }

    const ergebnisse: Array<{ anfrage_id: string; typ: string; ok: boolean; error?: string }> = []

    for (const item of items) {
      try {
        if (item.typ === 'budget') {
          // Genehmiger-Modus: User muss genehmiger_status-Eintrag haben
          const gs = await queryOne(
            `SELECT id FROM rollen_freigabe_genehmiger_status
             WHERE anfrage_id = $1::int AND user_id = $2 AND entschieden IS NULL`,
            [item.anfrage_id, userId]
          )
          if (!gs) { ergebnisse.push({ anfrage_id: item.anfrage_id, typ: item.typ, ok: false, error: 'Nicht autorisiert' }); continue }

          // Selbst-Genehmigungsschutz
          const anfrage = await queryOne(`SELECT beantragt_von_user_id FROM rollen_freigabe_anfragen WHERE id = $1`, [item.anfrage_id])
          if (anfrage?.beantragt_von_user_id === userId) {
            ergebnisse.push({ anfrage_id: item.anfrage_id, typ: item.typ, ok: false, error: 'Keine Selbstgenehmigung' }); continue
          }

          await query(
            `UPDATE rollen_freigabe_genehmiger_status SET entschieden = $1, entschieden_am = NOW() WHERE anfrage_id = $2::int AND user_id = $3`,
            [item.entscheidung === 'freigeben' ? 'freigegeben' : 'abgelehnt', item.anfrage_id, userId]
          )
          if (item.notiz?.trim()) {
            await query(`UPDATE rollen_freigabe_anfragen SET notiz = $1 WHERE id = $2`, [item.notiz.trim(), item.anfrage_id])
          }
          await recalcAnfrageStatus(Number(item.anfrage_id))
          ergebnisse.push({ anfrage_id: item.anfrage_id, typ: item.typ, ok: true })

        } else if (item.typ === 'dispo') {
          const gs = await queryOne(
            `SELECT id FROM szenen_freigabe_genehmiger_status
             WHERE anfrage_id = $1 AND user_id = $2 AND entschieden IS NULL`,
            [item.anfrage_id, userId]
          )
          if (!gs) { ergebnisse.push({ anfrage_id: item.anfrage_id, typ: item.typ, ok: false, error: 'Nicht autorisiert' }); continue }

          const anfrage = await queryOne(`SELECT beantragt_von_user_id FROM szenen_freigabe_anfragen WHERE id = $1`, [item.anfrage_id])
          if (anfrage?.beantragt_von_user_id === userId) {
            ergebnisse.push({ anfrage_id: item.anfrage_id, typ: item.typ, ok: false, error: 'Keine Selbstgenehmigung' }); continue
          }

          await query(
            `UPDATE szenen_freigabe_genehmiger_status SET entschieden = $1, entschieden_am = NOW() WHERE anfrage_id = $2 AND user_id = $3`,
            [item.entscheidung === 'freigeben' ? 'freigegeben' : 'abgelehnt', item.anfrage_id, userId]
          )
          if (item.notiz?.trim()) {
            await query(`UPDATE szenen_freigabe_anfragen SET notiz = $1 WHERE id = $2`, [item.notiz.trim(), item.anfrage_id])
          }
          await recalcSzenenAnfrageStatus(item.anfrage_id)
          ergebnisse.push({ anfrage_id: item.anfrage_id, typ: item.typ, ok: true })
        }
      } catch (itemErr) {
        ergebnisse.push({ anfrage_id: item.anfrage_id, typ: item.typ, ok: false, error: String(itemErr) })
      }
    }

    res.json({ ergebnisse })
  } catch (err) { res.status(500).json({ error: String(err) }) }
})
