import { Router } from 'express'
import { query, queryOne } from '../db'
import { authMiddleware } from '../auth'

export const fassungenRouter = Router({ mergeParams: true })
fassungenRouter.use(authMiddleware)

// ── Authorization helper ───────────────────────────────────────────────────────

type AccessLevel = 'rw' | 'review' | 'r' | null

async function checkFassungAccess(fassungId: string, userId: string, userRoles: string[]): Promise<AccessLevel> {
  const fassung = await queryOne(
    'SELECT * FROM folgen_dokument_fassungen WHERE id = $1',
    [fassungId]
  )
  if (!fassung) return null

  const overrideSetting = await queryOne(`SELECT value FROM app_settings WHERE key = 'dokument_override_rollen'`)
  const overrideRollen: string[] = JSON.parse(overrideSetting?.value ?? '[]')
  if (userRoles.some(r => overrideRollen.includes(r))) return 'rw'

  switch (fassung.sichtbarkeit) {
    case 'privat': {
      const dok = await queryOne('SELECT erstellt_von FROM folgen_dokumente WHERE id = $1', [fassung.dokument_id])
      return dok?.erstellt_von === userId ? 'rw' : null
    }
    case 'colab': {
      const autor = await queryOne(
        `SELECT rolle FROM folgen_dokument_autoren WHERE fassung_id = $1 AND user_id = $2`,
        [fassungId, userId]
      )
      return autor?.rolle === 'autor' ? 'rw' : null
    }
    case 'review': {
      const autor = await queryOne(
        `SELECT rolle FROM folgen_dokument_autoren WHERE fassung_id = $1 AND user_id = $2`,
        [fassungId, userId]
      )
      return autor ? 'review' : null
    }
    case 'produktion': {
      const autor = await queryOne(
        `SELECT rolle FROM folgen_dokument_autoren WHERE fassung_id = $1 AND user_id = $2`,
        [fassungId, userId]
      )
      return autor ? 'review' : null
    }
    case 'alle':
      return 'r'
    default:
      return null
  }
}

// ── Fassungen CRUD ─────────────────────────────────────────────────────────────

// GET /api/dokumente/:dokumentId/fassungen — list (meta, no inhalt)
fassungenRouter.get('/', async (req, res) => {
  const { dokumentId } = req.params as any
  const user = req.user!
  try {
    const rows = await query(
      `SELECT f.id, f.fassung_nummer, f.fassung_label, f.sichtbarkeit,
              f.abgegeben, f.abgegeben_am, f.abgegeben_von,
              f.erstellt_von, f.erstellt_am, f.zuletzt_geaendert_am, f.zuletzt_geaendert_von,
              f.seitenformat, f.colab_gruppe_id, f.produktion_gruppe_id, f.format_template_id
       FROM folgen_dokument_fassungen f
       WHERE f.dokument_id = $1
       ORDER BY f.fassung_nummer`,
      [dokumentId]
    )

    // Filter by access
    const overrideSetting = await queryOne(`SELECT value FROM app_settings WHERE key = 'dokument_override_rollen'`)
    const overrideRollen: string[] = JSON.parse(overrideSetting?.value ?? '[]')
    const isOverride = user.roles.some(r => overrideRollen.includes(r))

    if (isOverride) return res.json(rows)

    const dok = await queryOne('SELECT erstellt_von FROM folgen_dokumente WHERE id = $1', [dokumentId])
    const filtered = []
    for (const f of rows) {
      if (f.sichtbarkeit === 'alle') { filtered.push(f); continue }
      if (f.sichtbarkeit === 'privat' && dok?.erstellt_von === user.user_id) { filtered.push(f); continue }
      const autor = await queryOne(
        `SELECT 1 FROM folgen_dokument_autoren WHERE fassung_id = $1 AND user_id = $2`,
        [f.id, user.user_id]
      )
      if (autor) filtered.push(f)
    }
    res.json(filtered)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/dokumente/:dokumentId/fassungen — create new Fassung
fassungenRouter.post('/', async (req, res) => {
  const { dokumentId } = req.params as any
  const { fassung_label, sichtbarkeit, colab_gruppe_id, seitenformat } = req.body
  const user = req.user!
  try {
    const dok = await queryOne('SELECT * FROM folgen_dokumente WHERE id = $1', [dokumentId])
    if (!dok) return res.status(404).json({ error: 'Dokument nicht gefunden' })

    const setting = await queryOne(`SELECT value FROM app_settings WHERE key = 'fassungs_nummerierung_modus'`)
    const modus = setting?.value ?? 'global'

    let nextNummer = 1
    if (modus === 'global') {
      const cnt = await queryOne(
        `SELECT COALESCE(MAX(f.fassung_nummer), 0) AS m
         FROM folgen_dokument_fassungen f
         JOIN folgen_dokumente d ON d.id = f.dokument_id
         WHERE d.staffel_id = $1 AND d.folge_nummer = $2`,
        [dok.staffel_id, dok.folge_nummer]
      )
      nextNummer = (cnt?.m ?? 0) + 1
    } else {
      const cnt = await queryOne(
        `SELECT COALESCE(MAX(fassung_nummer), 0) AS m FROM folgen_dokument_fassungen WHERE dokument_id = $1`,
        [dokumentId]
      )
      nextNummer = (cnt?.m ?? 0) + 1
    }

    // Copy inhalt from latest fassung if exists
    const latest = await queryOne(
      `SELECT inhalt, format_template_id FROM folgen_dokument_fassungen
       WHERE dokument_id = $1 ORDER BY fassung_nummer DESC LIMIT 1`,
      [dokumentId]
    )

    const fassung = await queryOne(
      `INSERT INTO folgen_dokument_fassungen
         (dokument_id, fassung_nummer, fassung_label, sichtbarkeit, colab_gruppe_id,
          seitenformat, inhalt, format_template_id, erstellt_von)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        dokumentId, nextNummer, fassung_label ?? null,
        sichtbarkeit ?? 'privat', colab_gruppe_id ?? null,
        seitenformat ?? 'a4',
        latest?.inhalt ?? {},
        latest?.format_template_id ?? null,
        user.user_id,
      ]
    )

    // Add creator as autor
    await queryOne(
      `INSERT INTO folgen_dokument_autoren (fassung_id, user_id, user_name, rolle)
       VALUES ($1, $2, $3, 'autor') ON CONFLICT DO NOTHING`,
      [fassung.id, user.user_id, user.name]
    )

    await queryOne(
      `INSERT INTO folgen_dokument_audit (dokument_id, fassung_id, user_id, user_name, ereignis)
       VALUES ($1, $2, $3, $4, 'erstellt')`,
      [dokumentId, fassung.id, user.user_id, user.name]
    )

    res.status(201).json(fassung)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/dokumente/:dokumentId/fassungen/:fassungId — get incl. inhalt
fassungenRouter.get('/:fassungId', async (req, res) => {
  const { fassungId } = req.params as any
  const user = req.user!
  try {
    const access = await checkFassungAccess(fassungId, user.user_id, user.roles)
    if (!access) return res.status(403).json({ error: 'Kein Zugriff' })
    const fassung = await queryOne('SELECT * FROM folgen_dokument_fassungen WHERE id = $1', [fassungId])
    res.json({ ...fassung, _access: access })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/dokumente/:dokumentId/fassungen/:fassungId — save inhalt
fassungenRouter.put('/:fassungId', async (req, res) => {
  const { fassungId } = req.params as any
  const { inhalt, fassung_label, seitenformat } = req.body
  const user = req.user!
  try {
    const access = await checkFassungAccess(fassungId, user.user_id, user.roles)
    if (!access || access === 'r') return res.status(403).json({ error: 'Kein Schreibzugriff' })

    const fassung = await queryOne('SELECT * FROM folgen_dokument_fassungen WHERE id = $1', [fassungId])
    if (fassung?.abgegeben) return res.status(409).json({ error: 'Abgegebene Fassung kann nicht bearbeitet werden' })

    // Extract plaintext for FTS (simple: traverse ProseMirror JSON text nodes)
    let plaintextIndex: string | null = null
    if (inhalt) {
      try {
        plaintextIndex = extractPlaintext(inhalt)
      } catch (_) { /* ignore */ }
    }

    const updated = await queryOne(
      `UPDATE folgen_dokument_fassungen
       SET inhalt = COALESCE($1, inhalt),
           plaintext_index = COALESCE($2, plaintext_index),
           fassung_label = COALESCE($3, fassung_label),
           seitenformat = COALESCE($4, seitenformat),
           zuletzt_geaendert_von = $5,
           zuletzt_geaendert_am = NOW()
       WHERE id = $6 RETURNING *`,
      [inhalt ?? null, plaintextIndex, fassung_label ?? null, seitenformat ?? null, user.user_id, fassungId]
    )

    await queryOne(
      `INSERT INTO folgen_dokument_audit (dokument_id, fassung_id, user_id, user_name, ereignis)
       SELECT dokument_id, $1, $2, $3, 'gespeichert' FROM folgen_dokument_fassungen WHERE id = $1`,
      [fassungId, user.user_id, user.name]
    )

    res.json(updated)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/dokumente/:dokumentId/fassungen/:fassungId/abgabe — freeze
fassungenRouter.post('/:fassungId/abgabe', async (req, res) => {
  const { dokumentId, fassungId } = req.params as any
  const { erstelle_naechste } = req.body  // boolean
  const user = req.user!
  try {
    const access = await checkFassungAccess(fassungId, user.user_id, user.roles)
    if (!access || access === 'r') return res.status(403).json({ error: 'Kein Zugriff' })

    const frozen = await queryOne(
      `UPDATE folgen_dokument_fassungen
       SET abgegeben = TRUE, abgegeben_von = $1, abgegeben_am = NOW()
       WHERE id = $2 AND abgegeben = FALSE RETURNING *`,
      [user.user_id, fassungId]
    )
    if (!frozen) return res.status(409).json({ error: 'Fassung bereits abgegeben oder nicht gefunden' })

    await queryOne(
      `INSERT INTO folgen_dokument_audit (dokument_id, fassung_id, user_id, user_name, ereignis)
       VALUES ($1, $2, $3, $4, 'abgegeben')`,
      [dokumentId, fassungId, user.user_id, user.name]
    )

    let naechste = null
    if (erstelle_naechste) {
      // Delegate to POST /fassungen — compute next nummer
      const setting = await queryOne(`SELECT value FROM app_settings WHERE key = 'fassungs_nummerierung_modus'`)
      const modus = setting?.value ?? 'global'
      const dok = await queryOne('SELECT * FROM folgen_dokumente WHERE id = $1', [dokumentId])

      let nextNummer = 1
      if (modus === 'global') {
        const cnt = await queryOne(
          `SELECT COALESCE(MAX(f.fassung_nummer), 0) AS m
           FROM folgen_dokument_fassungen f
           JOIN folgen_dokumente d ON d.id = f.dokument_id
           WHERE d.staffel_id = $1 AND d.folge_nummer = $2`,
          [dok.staffel_id, dok.folge_nummer]
        )
        nextNummer = (cnt?.m ?? 0) + 1
      } else {
        const cnt = await queryOne(
          `SELECT COALESCE(MAX(fassung_nummer), 0) AS m FROM folgen_dokument_fassungen WHERE dokument_id = $1`,
          [dokumentId]
        )
        nextNummer = (cnt?.m ?? 0) + 1
      }

      naechste = await queryOne(
        `INSERT INTO folgen_dokument_fassungen
           (dokument_id, fassung_nummer, sichtbarkeit, inhalt, format_template_id, erstellt_von)
         SELECT $1, $2, 'privat', inhalt, format_template_id, $3
         FROM folgen_dokument_fassungen WHERE id = $4 RETURNING *`,
        [dokumentId, nextNummer, user.user_id, fassungId]
      )

      await queryOne(
        `INSERT INTO folgen_dokument_autoren (fassung_id, user_id, user_name, rolle)
         VALUES ($1, $2, $3, 'autor') ON CONFLICT DO NOTHING`,
        [naechste.id, user.user_id, user.name]
      )

      await queryOne(
        `INSERT INTO folgen_dokument_audit (dokument_id, fassung_id, user_id, user_name, ereignis)
         VALUES ($1, $2, $3, $4, 'erstellt')`,
        [dokumentId, naechste.id, user.user_id, user.name]
      )
    }

    res.json({ frozen, naechste })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/dokumente/:dokumentId/fassungen/:fassungId/sichtbarkeit
fassungenRouter.put('/:fassungId/sichtbarkeit', async (req, res) => {
  const { fassungId, dokumentId } = req.params as any
  const { sichtbarkeit, colab_gruppe_id, produktion_gruppe_id } = req.body
  const user = req.user!

  const validStates = ['privat', 'colab', 'review', 'produktion', 'alle']
  if (!validStates.includes(sichtbarkeit)) {
    return res.status(400).json({ error: `sichtbarkeit muss sein: ${validStates.join('|')}` })
  }

  try {
    const access = await checkFassungAccess(fassungId, user.user_id, user.roles)
    if (!access || access === 'r' || access === 'review') {
      return res.status(403).json({ error: 'Kein Zugriff' })
    }

    const prev = await queryOne('SELECT sichtbarkeit FROM folgen_dokument_fassungen WHERE id = $1', [fassungId])
    const updated = await queryOne(
      `UPDATE folgen_dokument_fassungen
       SET sichtbarkeit = $1, colab_gruppe_id = $2, produktion_gruppe_id = $3
       WHERE id = $4 RETURNING *`,
      [sichtbarkeit, colab_gruppe_id ?? null, produktion_gruppe_id ?? null, fassungId]
    )

    await queryOne(
      `INSERT INTO folgen_dokument_audit (dokument_id, fassung_id, user_id, user_name, ereignis, details)
       VALUES ($1, $2, $3, $4, 'status_geaendert', $5)`,
      [dokumentId, fassungId, user.user_id, user.name, JSON.stringify({ von: prev?.sichtbarkeit, nach: sichtbarkeit })]
    )

    res.json(updated)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── Autoren ────────────────────────────────────────────────────────────────────

// GET /api/dokumente/:dokumentId/fassungen/:fassungId/autoren
fassungenRouter.get('/:fassungId/autoren', async (req, res) => {
  const { fassungId } = req.params as any
  const user = req.user!
  try {
    const access = await checkFassungAccess(fassungId, user.user_id, user.roles)
    if (!access) return res.status(403).json({ error: 'Kein Zugriff' })
    const rows = await query('SELECT * FROM folgen_dokument_autoren WHERE fassung_id = $1 ORDER BY hinzugefuegt_am', [fassungId])
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/dokumente/:dokumentId/fassungen/:fassungId/autoren
fassungenRouter.post('/:fassungId/autoren', async (req, res) => {
  const { fassungId, dokumentId } = req.params as any
  const { user_id, user_name, rolle, cursor_farbe } = req.body
  const reqUser = req.user!
  if (!user_id || !rolle) return res.status(400).json({ error: 'user_id und rolle required' })
  if (!['autor', 'reviewer'].includes(rolle)) return res.status(400).json({ error: 'rolle muss autor oder reviewer sein' })

  try {
    const access = await checkFassungAccess(fassungId, reqUser.user_id, reqUser.roles)
    if (!access || access === 'r' || access === 'review') {
      return res.status(403).json({ error: 'Kein Zugriff' })
    }

    const row = await queryOne(
      `INSERT INTO folgen_dokument_autoren (fassung_id, user_id, user_name, rolle, cursor_farbe)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (fassung_id, user_id) DO UPDATE SET rolle = $4, cursor_farbe = COALESCE($5, folgen_dokument_autoren.cursor_farbe)
       RETURNING *`,
      [fassungId, user_id, user_name ?? null, rolle, cursor_farbe ?? '#007AFF']
    )

    const ereignis = rolle === 'autor' ? 'autor_hinzugefuegt' : 'reviewer_hinzugefuegt'
    await queryOne(
      `INSERT INTO folgen_dokument_audit (dokument_id, fassung_id, user_id, user_name, ereignis, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [dokumentId, fassungId, reqUser.user_id, reqUser.name, ereignis, JSON.stringify({ target_user_id: user_id })]
    )

    res.status(201).json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/dokumente/:dokumentId/fassungen/:fassungId/autoren/:userId
fassungenRouter.delete('/:fassungId/autoren/:userId', async (req, res) => {
  const { fassungId, userId } = req.params as any
  const reqUser = req.user!
  try {
    const access = await checkFassungAccess(fassungId, reqUser.user_id, reqUser.roles)
    if (!access || access === 'r' || access === 'review') {
      return res.status(403).json({ error: 'Kein Zugriff' })
    }
    const row = await queryOne(
      'DELETE FROM folgen_dokument_autoren WHERE fassung_id = $1 AND user_id = $2 RETURNING id',
      [fassungId, userId]
    )
    if (!row) return res.status(404).json({ error: 'Autor nicht gefunden' })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── Annotationen ───────────────────────────────────────────────────────────────

// GET /api/dokumente/:dokumentId/fassungen/:fassungId/annotationen
fassungenRouter.get('/:fassungId/annotationen', async (req, res) => {
  const { fassungId } = req.params as any
  const user = req.user!
  try {
    const access = await checkFassungAccess(fassungId, user.user_id, user.roles)
    if (!access) return res.status(403).json({ error: 'Kein Zugriff' })
    const rows = await query(
      `SELECT * FROM folgen_dokument_annotationen
       WHERE fassung_id = $1 AND archiviert_am IS NULL
       ORDER BY von_pos`,
      [fassungId]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/dokumente/:dokumentId/fassungen/:fassungId/annotationen
fassungenRouter.post('/:fassungId/annotationen', async (req, res) => {
  const { fassungId, dokumentId } = req.params as any
  const { von_pos, bis_pos, text, typ } = req.body
  const user = req.user!
  if (von_pos == null || bis_pos == null || !text) {
    return res.status(400).json({ error: 'von_pos, bis_pos, text required' })
  }
  const validTypen = ['kommentar', 'frage', 'vorschlag']
  if (typ && !validTypen.includes(typ)) return res.status(400).json({ error: 'Ungültiger typ' })

  try {
    const access = await checkFassungAccess(fassungId, user.user_id, user.roles)
    if (!access) return res.status(403).json({ error: 'Kein Zugriff' })

    const row = await queryOne(
      `INSERT INTO folgen_dokument_annotationen
         (fassung_id, von_pos, bis_pos, text, typ, erstellt_von, erstellt_von_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [fassungId, von_pos, bis_pos, text, typ ?? 'kommentar', user.user_id, user.name]
    )

    await queryOne(
      `INSERT INTO folgen_dokument_audit (dokument_id, fassung_id, user_id, user_name, ereignis)
       VALUES ($1, $2, $3, $4, 'annotation_erstellt')`,
      [dokumentId, fassungId, user.user_id, user.name]
    )

    res.status(201).json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/dokumente/:dokumentId/annotationen/:id/archivieren
export const annotationenRouter = Router({ mergeParams: true })
annotationenRouter.use(authMiddleware)

annotationenRouter.post('/:id/archivieren', async (req, res) => {
  const { id } = req.params
  const user = req.user!
  try {
    const ann = await queryOne('SELECT * FROM folgen_dokument_annotationen WHERE id = $1', [id])
    if (!ann) return res.status(404).json({ error: 'Annotation nicht gefunden' })

    // Must be creator or have write access to fassung
    const access = await checkFassungAccess(ann.fassung_id, user.user_id, user.roles)
    if (!access || access === 'r') return res.status(403).json({ error: 'Kein Zugriff' })

    const updated = await queryOne(
      `UPDATE folgen_dokument_annotationen
       SET archiviert_am = NOW(), archiviert_von = $1 WHERE id = $2 RETURNING *`,
      [user.user_id, id]
    )
    res.json(updated)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

annotationenRouter.delete('/:id', async (req, res) => {
  const { id } = req.params
  const user = req.user!
  try {
    const ann = await queryOne('SELECT * FROM folgen_dokument_annotationen WHERE id = $1', [id])
    if (!ann) return res.status(404).json({ error: 'Annotation nicht gefunden' })

    const access = await checkFassungAccess(ann.fassung_id, user.user_id, user.roles)
    if (!access || access === 'r') return res.status(403).json({ error: 'Kein Zugriff' })

    await queryOne('DELETE FROM folgen_dokument_annotationen WHERE id = $1', [id])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── Audit ──────────────────────────────────────────────────────────────────────

// GET /api/dokumente/:dokumentId/fassungen/:fassungId/audit
fassungenRouter.get('/:fassungId/audit', async (req, res) => {
  const { fassungId } = req.params as any
  const user = req.user!
  try {
    const access = await checkFassungAccess(fassungId, user.user_id, user.roles)
    if (!access) return res.status(403).json({ error: 'Kein Zugriff' })
    const rows = await query(
      `SELECT * FROM folgen_dokument_audit WHERE fassung_id = $1 ORDER BY ereignis_am DESC`,
      [fassungId]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── Helpers ────────────────────────────────────────────────────────────────────

function extractPlaintext(doc: any): string {
  const parts: string[] = []
  function traverse(node: any) {
    if (!node) return
    if (node.type === 'text' && node.text) parts.push(node.text)
    if (Array.isArray(node.content)) node.content.forEach(traverse)
  }
  traverse(doc)
  return parts.join(' ')
}
