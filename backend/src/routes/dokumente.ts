import { Router } from 'express'
import { query, queryOne } from '../db'
import { authMiddleware } from '../auth'

// GET/POST /api/folgen/:produktionId/:folgeNummer/dokumente
export const folgenDokumenteRouter = Router({ mergeParams: true })
folgenDokumenteRouter.use(authMiddleware)

// GET /api/folgen/:produktionId/:folgeNummer/dokumente
// Returns all document types with latest fassung metadata for this Folge
folgenDokumenteRouter.get('/', async (req, res) => {
  const { produktionId, folgeNummer } = req.params as any
  try {
    const rows = await query(
      `SELECT
        d.id, d.typ, d.erstellt_von, d.erstellt_am,
        f.id AS fassung_id, f.fassung_nummer, f.fassung_label,
        f.sichtbarkeit, f.abgegeben, f.zuletzt_geaendert_am, f.zuletzt_geaendert_von,
        f.erstellt_von AS fassung_erstellt_von, f.erstellt_am AS fassung_erstellt_am
       FROM folgen_dokumente d
       LEFT JOIN LATERAL (
         SELECT * FROM folgen_dokument_fassungen
         WHERE dokument_id = d.id
         ORDER BY fassung_nummer DESC LIMIT 1
       ) f ON TRUE
       WHERE d.produktion_id = $1 AND d.folge_nummer = $2
       ORDER BY d.typ`,
      [produktionId, parseInt(folgeNummer)]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/folgen/:produktionId/:folgeNummer/dokumente
// Create a new document (and initial fassung)
folgenDokumenteRouter.post('/', async (req, res) => {
  const { produktionId, folgeNummer } = req.params as any
  const { typ } = req.body
  if (!typ) return res.status(400).json({ error: 'typ required' })

  const user = req.user!
  try {
    const dok = await queryOne(
      `INSERT INTO folgen_dokumente (produktion_id, folge_nummer, typ, erstellt_von)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [produktionId, parseInt(folgeNummer), typ, user.user_id]
    )

    // Determine fassung_nummer based on fassungs_nummerierung_modus
    const setting = await queryOne(`SELECT value FROM app_settings WHERE key = 'fassungs_nummerierung_modus'`)
    const modus = setting?.value ?? 'global'

    let fassungsNummer = 1
    if (modus === 'global') {
      // Count all fassungen across all dokumente of this folge
      const cnt = await queryOne(
        `SELECT COALESCE(MAX(f.fassung_nummer), 0) AS m
         FROM folgen_dokument_fassungen f
         JOIN folgen_dokumente d ON d.id = f.dokument_id
         WHERE d.produktion_id = $1 AND d.folge_nummer = $2`,
        [produktionId, parseInt(folgeNummer)]
      )
      fassungsNummer = (cnt?.m ?? 0) + 1
    }
    // mode 'per_typ': starts at 1 (default fassungsNummer = 1)

    // Get default template
    const tmpl = await queryOne(`SELECT id FROM editor_format_templates WHERE ist_standard = TRUE LIMIT 1`)

    const fassung = await queryOne(
      `INSERT INTO folgen_dokument_fassungen
         (dokument_id, fassung_nummer, sichtbarkeit, erstellt_von, format_template_id)
       VALUES ($1, $2, 'privat', $3, $4) RETURNING *`,
      [dok.id, fassungsNummer, user.user_id, tmpl?.id ?? null]
    )

    // Add creator as autor
    await queryOne(
      `INSERT INTO folgen_dokument_autoren (fassung_id, user_id, user_name, rolle)
       VALUES ($1, $2, $3, 'autor') ON CONFLICT DO NOTHING`,
      [fassung.id, user.user_id, user.name]
    )

    // Audit
    await queryOne(
      `INSERT INTO folgen_dokument_audit (dokument_id, fassung_id, user_id, user_name, ereignis)
       VALUES ($1, $2, $3, $4, 'erstellt')`,
      [dok.id, fassung.id, user.user_id, user.name]
    )

    res.status(201).json({ ...dok, fassung })
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'Dokument dieses Typs bereits vorhanden' })
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/folgen/:produktionId/:folgeNummer/dokumente/:dokumentId
export const dokumentRouter = Router({ mergeParams: true })
dokumentRouter.use(authMiddleware)

dokumentRouter.get('/', async (req, res) => {
  const { dokumentId } = req.params as any
  try {
    const dok = await queryOne('SELECT * FROM folgen_dokumente WHERE id = $1', [dokumentId])
    if (!dok) return res.status(404).json({ error: 'Dokument nicht gefunden' })
    res.json(dok)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/folgen/:produktionId/:folgeNummer/dokumente/:dokumentId — admin only
dokumentRouter.delete('/', async (req, res) => {
  const { dokumentId } = req.params as any
  const user = req.user!
  const adminRoles = ['superadmin', 'herstellungsleitung']
  if (!user.roles.some(r => adminRoles.includes(r))) {
    return res.status(403).json({ error: 'Nur Admins können Dokumente löschen' })
  }
  try {
    const row = await queryOne('DELETE FROM folgen_dokumente WHERE id = $1 RETURNING id', [dokumentId])
    if (!row) return res.status(404).json({ error: 'Dokument nicht gefunden' })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})
