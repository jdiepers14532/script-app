import { Router } from 'express'
import { query } from '../db'
import { authMiddleware } from '../auth'
import { assemblePreviewHtml } from '../utils/pdfAssembler'

// Lese-/Anmerkungs-Modus (Handoff 3 §3): welche Werkstufen darf der Anfragende lesen?
// Auflösung über fn_werkstufe_sichtbar (NICHT die permissive Alt-Listing-Query in werkstufen.ts).
export const lesemodusRouter = Router()
lesemodusRouter.use(authMiddleware)

// GET /api/lesemodus/werkstufen?folge_id= — sichtbare Werkstufen + Default nach Auswahlregel
// (Drehbuch > Storyline > andere; je höchste version_nummer).
lesemodusRouter.get('/werkstufen', async (req, res) => {
  const folgeId = req.query.folge_id ? parseInt(req.query.folge_id as string) : null
  if (!folgeId) return res.status(400).json({ error: 'folge_id erforderlich' })
  const user = req.user!
  const istAutor = (user.roles ?? []).filter(Boolean).length > 0
  try {
    const rows = await query(
      `SELECT w.id, w.typ, w.label, w.version_nummer, w.sichtbarkeit,
              w.eingefroren, w.ist_revisionsstufe, w.revisionsstufen_nr, w.abgegeben
       FROM werkstufen w
       WHERE w.folge_id = $1 AND fn_werkstufe_sichtbar(w.id, $2, $3)
       ORDER BY w.typ, w.version_nummer DESC`,
      [folgeId, user.user_id, istAutor]
    )
    // Default-Auswahl: Drehbuch > Storyline > andere; innerhalb höchste version_nummer.
    let pool: any[] = []
    for (const typ of ['drehbuch', 'storyline']) {
      pool = rows.filter((w: any) => w.typ === typ)
      if (pool.length) break
    }
    if (!pool.length) pool = rows
    const def = [...pool].sort((a, b) => b.version_nummer - a.version_nummer)[0] ?? null
    res.json({ werkstufen: rows, default_werkstuf_id: def?.id ?? null })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/lesemodus/entitaet-szenen?produktion_id=&typ=rolle|komparse|motiv&entity_id=&motiv_name=
// Produktionsweit: alle Szenen, in denen die Entität (Rolle/Komparse/Motiv) vorkommt —
// je Folge die sichtbare Default-Fassung (Drehbuch > Storyline > andere; höchste Version).
// Flache, nach Folge/Szene sortierte Liste; die Block→Folge-Gruppierung macht das Frontend
// (Blöcke kommen separat aus der Produktionsdatenbank).
lesemodusRouter.get('/entitaet-szenen', async (req, res) => {
  const produktionId = req.query.produktion_id as string | undefined
  const typ = req.query.typ as string | undefined
  const entityId = (req.query.entity_id as string | undefined) || null
  const motivName = (req.query.motiv_name as string | undefined) || null
  if (!produktionId || !typ) return res.status(400).json({ error: 'produktion_id und typ erforderlich' })
  if (typ !== 'motiv' && !entityId) return res.status(400).json({ error: 'entity_id erforderlich' })
  if (typ === 'motiv' && !entityId && !motivName) return res.status(400).json({ error: 'entity_id oder motiv_name erforderlich' })

  const user = req.user!
  const istAutor = (user.roles ?? []).filter(Boolean).length > 0

  // Default-Fassung pro Folge, nur aus den für den Anfragenden sichtbaren Werkstufen (fail-closed).
  const folgenWsCte = `
    WITH folgen_ws AS (
      SELECT DISTINCT ON (w.folge_id)
             w.id AS werkstufe_id, w.folge_id, f.folge_nummer,
             w.typ AS werkstufe_typ, w.label AS werkstufe_label, w.version_nummer
      FROM werkstufen w
      JOIN folgen f ON f.id = w.folge_id
      WHERE f.produktion_id = $1 AND fn_werkstufe_sichtbar(w.id, $2, $3)
      ORDER BY w.folge_id,
        CASE w.typ WHEN 'drehbuch' THEN 0 WHEN 'storyline' THEN 1 ELSE 2 END,
        w.version_nummer DESC
    )`

  try {
    let rows
    if (typ === 'motiv') {
      rows = await query(
        `${folgenWsCte}
         SELECT fw.folge_nummer, fw.werkstufe_id, fw.werkstufe_typ, fw.werkstufe_label, fw.version_nummer,
                ds.scene_identity_id, ds.scene_nummer, ds.scene_nummer_suffix,
                ds.ort_name, ds.int_ext, ds.tageszeit, ds.sort_order
         FROM folgen_ws fw
         JOIN dokument_szenen ds ON ds.werkstufe_id = fw.werkstufe_id AND ds.geloescht = false
         WHERE (($4::uuid IS NOT NULL AND ds.motiv_id = $4)
                OR ($5::text IS NOT NULL AND UPPER(ds.ort_name) = UPPER($5)))
         ORDER BY fw.folge_nummer, ds.scene_nummer NULLS LAST, ds.sort_order`,
        [produktionId, user.user_id, istAutor, entityId, motivName]
      )
    } else {
      // rolle | komparse → beide über scene_characters (character_id)
      rows = await query(
        `${folgenWsCte}
         SELECT fw.folge_nummer, fw.werkstufe_id, fw.werkstufe_typ, fw.werkstufe_label, fw.version_nummer,
                ds.scene_identity_id, ds.scene_nummer, ds.scene_nummer_suffix,
                ds.ort_name, ds.int_ext, ds.tageszeit, ds.sort_order
         FROM folgen_ws fw
         JOIN scene_characters sc ON sc.werkstufe_id = fw.werkstufe_id AND sc.character_id = $4
         JOIN dokument_szenen ds ON ds.scene_identity_id = sc.scene_identity_id
                                 AND ds.werkstufe_id = fw.werkstufe_id AND ds.geloescht = false
         ORDER BY fw.folge_nummer, ds.scene_nummer NULLS LAST, ds.sort_order`,
        [produktionId, user.user_id, istAutor, entityId]
      )
    }
    res.json({ szenen: rows })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/lesemodus/szene/:sceneIdentityId/html?werkstufe_id= — PDF-getreues Lese-HTML EINER Szene.
// Nutzt die bestehende Export-Pipeline (assemblePreviewHtml) gefiltert auf eine Szenennummer,
// ohne Titelseite/Kopf-/Fußzeile → reiner Szenenkopf + Content, exakt wie im PDF.
lesemodusRouter.get('/szene/:sceneIdentityId/html', async (req, res) => {
  const sceneIdentityId = req.params.sceneIdentityId
  const werkstufeId = req.query.werkstufe_id as string | undefined
  if (!werkstufeId) return res.status(400).json({ error: 'werkstufe_id erforderlich' })
  const user = req.user!
  const istAutor = (user.roles ?? []).filter(Boolean).length > 0

  try {
    // Fail-closed: nur sichtbare Werkstufen rendern
    const sicht = await query(`SELECT fn_werkstufe_sichtbar($1, $2, $3) AS ok`, [werkstufeId, user.user_id, istAutor])
    if (!sicht[0]?.ok) return res.status(403).json({ error: 'Keine Leseberechtigung für diese Fassung' })

    // Szenennummer (+Suffix) der Szene in dieser Werkstufe → szenenAuswahl-Filter
    const szRows = await query(
      `SELECT scene_nummer, scene_nummer_suffix FROM dokument_szenen
       WHERE scene_identity_id = $1 AND werkstufe_id = $2 AND geloescht = false LIMIT 1`,
      [sceneIdentityId, werkstufeId]
    )
    if (!szRows.length) return res.status(404).json({ error: 'Szene in dieser Fassung nicht gefunden' })
    const { scene_nummer, scene_nummer_suffix } = szRows[0]
    if (scene_nummer == null) {
      return res.status(422).json({ error: 'Szene ohne Szenennummer kann nicht einzeln gerendert werden' })
    }
    const szenenAuswahl = `${scene_nummer}${scene_nummer_suffix ?? ''}`

    const html = await assemblePreviewHtml(
      {
        werkstufId: werkstufeId,
        userId: user.user_id,
        userName: user.name,
        options: {
          szenenAuswahl,
          hauptinhaltAktiv: true,
          kzAktivOverride: false,
          fzAktivOverride: false,
          userTimezone: (req.query.tz as string) || undefined,
        },
      },
      () => {}
    )
    res.json({ html, szenenAuswahl })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})
