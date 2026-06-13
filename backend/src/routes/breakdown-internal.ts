/**
 * breakdown-app — interne Service-Endpoints (Handoff Phase 3, 3.1 + 3.3).
 *
 * Service-zu-Service über Shared-Secret-Header X-Breakdown-Secret (Muster wie
 * verteiler-internal/X-Mail-Service-Secret). Mounted at /api/internal — MUSS vor
 * exportsRouter stehen (dessen authMiddleware würde sonst greifen).
 *
 *   GET /api/internal/breakdown/szenen?werkstufe_id=…       → Szenen-Stammdaten + Besetzung (read-only)
 *   GET /api/internal/breakdown/vorschau-html?werkstufe_id=… → Export-Preview-HTML
 *
 * Beide rein lesend. KEIN resolve-Endpoint (der legt scene_identities an — Discovery B2/31 ⚠️).
 */
import { Router, Request, Response, NextFunction } from 'express'
import { pool } from '../db'
import { assemblePreviewHtml } from '../utils/pdfAssembler'

export const breakdownInternalRouter = Router()

// Tiptap-Dokument (dokument_szenen.content) → Klartext, getrimmt. Rein lesend, fehlertolerant.
// Sammelt alle text-Nodes, trennt Absätze mit \n; deckelt die Länge (LLM-Kosten/Kontext, Phase 6a).
const TEXT_MAX = 2500
function flattenTiptap(content: any): string | null {
  if (!content) return null
  const parts: string[] = []
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return
    if (typeof node.text === 'string') parts.push(node.text)
    if (Array.isArray(node.content)) {
      node.content.forEach(walk)
      if (node.type === 'absatz' || node.type === 'paragraph') parts.push('\n')
    }
  }
  try {
    if (Array.isArray(content)) content.forEach(walk)
    else walk(content)
  } catch { return null }
  const txt = parts.join('').replace(/\n{2,}/g, '\n').trim()
  return txt ? txt.slice(0, TEXT_MAX) : null
}

const BREAKDOWN_INTERNAL_SECRET = process.env.BREAKDOWN_INTERNAL_SECRET || ''

// Per-Route-Secret (nicht router-global): /api/internal teilt sich mehrere Router.
function checkBreakdownSecret(req: Request, res: Response, next: NextFunction) {
  if (!BREAKDOWN_INTERNAL_SECRET || req.headers['x-breakdown-secret'] !== BREAKDOWN_INTERNAL_SECRET) {
    return res.status(403).json({ error: 'Ungueltiges oder fehlendes Service-Secret' })
  }
  next()
}

// ── 3.1 Szenen-Stammdaten (read-only) ────────────────────────────────────────
// Liefert pro Szene der Werkstufe die Kopffelder + Besetzung (R-/K-Nummern).
breakdownInternalRouter.get('/breakdown/szenen', checkBreakdownSecret, async (req: Request, res: Response) => {
  const werkstufeId = req.query.werkstufe_id as string | undefined
  if (!werkstufeId) return res.status(400).json({ error: 'werkstufe_id erforderlich' })

  try {
    // Kopffelder + Szenen-Volltext (content) pro Szene, nach Szenen-Position sortiert.
    // content ist Tiptap-JSON; wird unten zu Klartext geflacht (breakdown-KI-Extraktion, Phase 6a).
    const szenenRes = await pool.query(
      `SELECT ds.scene_identity_id, ds.sort_order AS position,
              ds.scene_nummer, ds.scene_nummer_suffix,
              ds.ort_name, ds.int_ext, ds.tageszeit, ds.spieltag, ds.zusammenfassung, ds.content
       FROM dokument_szenen ds
       WHERE ds.werkstufe_id = $1
       ORDER BY ds.sort_order`,
      [werkstufeId]
    )

    // Besetzung der gesamten Werkstufe in EINER Query (B4/36-Muster, kein N+1).
    const besetzungRes = await pool.query(
      `SELECT sc.scene_identity_id, sc.character_id, c.name,
              cp.rollen_nummer, cp.komparsen_nummer,
              COALESCE(ck.typ, ck2.typ) AS kategorie_typ
       FROM scene_characters sc
       JOIN characters c ON c.id = sc.character_id
       LEFT JOIN character_kategorien ck ON ck.id = sc.kategorie_id
       LEFT JOIN scene_identities si ON si.id = sc.scene_identity_id
       LEFT JOIN folgen fl ON fl.id = si.folge_id
       LEFT JOIN character_productions cp ON cp.character_id = sc.character_id AND cp.produktion_id = fl.produktion_id
       LEFT JOIN character_kategorien ck2 ON ck2.id = cp.kategorie_id
       WHERE sc.werkstufe_id = $1
       ORDER BY COALESCE(ck.typ, ck2.typ) NULLS LAST, c.name`,
      [werkstufeId]
    )

    const besetzungBySzene = new Map<string, any[]>()
    for (const r of besetzungRes.rows) {
      const arr = besetzungBySzene.get(r.scene_identity_id) || []
      arr.push({
        character_id: r.character_id,
        name: r.name,
        kategorie_typ: r.kategorie_typ,
        rollen_nummer: r.rollen_nummer,
        komparsen_nummer: r.komparsen_nummer,
      })
      besetzungBySzene.set(r.scene_identity_id, arr)
    }

    const szenen = szenenRes.rows.map(s => ({
      scene_identity_id: s.scene_identity_id,
      position: s.position,
      scene_nummer: s.scene_nummer,
      scene_nummer_suffix: s.scene_nummer_suffix,
      ort_name: s.ort_name,
      int_ext: s.int_ext,
      tageszeit: s.tageszeit,
      spieltag: s.spieltag,
      zusammenfassung: s.zusammenfassung,
      text: flattenTiptap(s.content),   // Szenen-Volltext (Klartext, getrimmt) für breakdown-KI
      characters: besetzungBySzene.get(s.scene_identity_id) || [],
    }))

    res.json({ werkstufe_id: werkstufeId, szenen })
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message ?? err) })
  }
})

// ── 3.3 Export-Preview-HTML ──────────────────────────────────────────────────
// Liefert das druckgleiche Preview-HTML mit data-scene-identity-id/data-block-index.
breakdownInternalRouter.get('/breakdown/vorschau-html', checkBreakdownSecret, async (req: Request, res: Response) => {
  const werkstufeId = req.query.werkstufe_id as string | undefined
  if (!werkstufeId) return res.status(400).json({ error: 'werkstufe_id erforderlich' })

  try {
    // Service-Identität (Secret-Auth, kein Cookie-User) — Werte fliessen nur ins Wasserzeichen.
    const html = await assemblePreviewHtml(
      { werkstufId: werkstufeId, userId: 'breakdown-service', userName: 'breakdown-service', options: {} },
      () => {},
      true   // readMode: Browser-Lesemodus (A4, ohne KZ/FZ)
    )
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.send(html)
  } catch (err: any) {
    res.status(500).send(`<pre style="color:red">Vorschau-Fehler: ${err?.message ?? err}</pre>`)
  }
})
