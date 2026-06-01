import { Router } from 'express'
import { pool } from '../db'
import { authMiddleware, requireRole, requireDkAccess } from '../auth'

const TIER1_ROLES = ['superadmin', 'geschaeftsfuehrung', 'herstellungsleitung']

const router = Router()
router.use(authMiddleware)

// GET /api/dk-settings/my-productions — Produktionen mit DK-Zugriff fuer aktuellen User
router.get('/my-productions', async (req: any, res) => {
  try {
    const userRoles = req.user.roles || [req.user.role]
    const isTier1 = userRoles.some((r: string) => TIER1_ROLES.includes(r))

    if (isTier1) {
      // Tier-1: alle Produktionen
      res.json({ global: true, production_ids: [] })
      return
    }

    const { rows } = await pool.query(
      `SELECT DISTINCT production_id FROM dk_settings_access
       WHERE (access_type = 'user' AND identifier = $1)
          OR (access_type = 'rolle' AND identifier = ANY($2::text[]))`,
      [req.user.user_id, userRoles]
    )
    res.json({ global: false, production_ids: rows.map((r: any) => r.production_id) })
  } catch (err) {
    console.error('dk my-productions error:', err)
    res.status(500).json({ error: 'Fehler' })
  }
})

// GET /api/dk-settings/:productionId/app-settings — produktionsspezifische Settings (merged mit global)
router.get('/:productionId/app-settings',
  requireDkAccess(req => req.params.productionId),
  async (req, res) => {
    try {
      const { productionId } = req.params
      // Global defaults
      const globalRes = await pool.query('SELECT key, value FROM app_settings')
      const settings: Record<string, string> = {}
      for (const row of globalRes.rows) settings[row.key] = row.value
      // Production overrides
      const prodRes = await pool.query(
        'SELECT key, value FROM production_app_settings WHERE production_id = $1',
        [productionId]
      )
      for (const row of prodRes.rows) settings[row.key] = row.value
      res.json(settings)
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  }
)

// PUT /api/dk-settings/:productionId/app-settings/:key — produktionsspezifisches Setting setzen
router.put('/:productionId/app-settings/:key',
  requireDkAccess(req => req.params.productionId),
  async (req, res) => {
    try {
      const { productionId, key } = req.params
      const { value } = req.body
      if (!value) return res.status(400).json({ error: 'value required' })
      const allowed = ['treatment_label', 'scene_kuerzel', 'scene_logging_stage', 'figuren_label', 'scene_env_colors', 'scene_env_colors_dark', 'statistik_modal_config', 'seitenformat', 'terminologie', 'daily_regeln', 'stockshot_suffix', 'stimmung_config', 'ln_settings', 'page_margin_mm', 'statistik_config', 'replik_settings', 'datumsformat', 'sonstige_dokumente_format', 'titelseite_meta', 'drehbuch_checks', 'synopsis_settings']
      if (!allowed.includes(key)) return res.status(400).json({ error: 'Unknown setting' })
      await pool.query(
        `INSERT INTO production_app_settings (production_id, key, value, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (production_id, key) DO UPDATE SET value = $3, updated_at = NOW()`,
        [productionId, key, value]
      )
      res.json({ key, value })
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  }
)

// ── Glossar CRUD ──────────────────────────────────────────────────────────────

// GET /api/dk-settings/:productionId/glossar
router.get('/:productionId/glossar',
  requireDkAccess(req => req.params.productionId),
  async (req, res) => {
    try {
      const pid = req.params.productionId
      // Fehlende Defaults immer nachsynchronisieren (neue Defaults landen automatisch in allen Produktionen)
      await pool.query(`
        INSERT INTO dk_glossar (production_id, kuerzel, name, erklaerung, term_en, kategorie, sort_order)
        SELECT $1, d.kuerzel, d.name, d.erklaerung, d.term_en, d.kategorie, d.sort_order
        FROM dk_glossar_defaults d
        WHERE NOT EXISTS (
          SELECT 1 FROM dk_glossar g
          WHERE g.production_id = $1 AND LOWER(g.name) = LOWER(d.name)
        )
      `, [pid])
      const { rows } = await pool.query(
        'SELECT id, kuerzel, name, erklaerung, term_en, kategorie, sort_order FROM dk_glossar WHERE production_id = $1 ORDER BY sort_order, name',
        [pid]
      )
      res.json(rows)
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  }
)

const VALID_KATEGORIEN = ['transition', 'shot', 'kuerzel', 'fachbegriff', 'sonstige',
  'dramaturgie', 'emotional_bogen', 'serien_struktur', 'format_produktion', 'app_architektur']

// POST /api/dk-settings/:productionId/glossar
router.post('/:productionId/glossar',
  requireDkAccess(req => req.params.productionId),
  async (req, res) => {
    try {
      const { kuerzel, name, erklaerung, term_en, kategorie } = req.body
      const kat = VALID_KATEGORIEN.includes(kategorie) ? kategorie : 'kuerzel'
      const { rows } = await pool.query(
        `INSERT INTO dk_glossar (production_id, kuerzel, name, erklaerung, term_en, kategorie, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM dk_glossar WHERE production_id = $1))
         RETURNING id, kuerzel, name, erklaerung, term_en, kategorie, sort_order`,
        [req.params.productionId, (kuerzel ?? '').trim(), (name ?? '').trim(), (erklaerung ?? '').trim(), (term_en ?? '').trim(), kat]
      )
      res.json(rows[0])
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  }
)

// PUT /api/dk-settings/:productionId/glossar/:id
router.put('/:productionId/glossar/:id',
  requireDkAccess(req => req.params.productionId),
  async (req, res) => {
    try {
      const { kuerzel, name, erklaerung, term_en, kategorie } = req.body
      const kat = VALID_KATEGORIEN.includes(kategorie) ? kategorie : 'kuerzel'
      const { rows } = await pool.query(
        `UPDATE dk_glossar SET kuerzel = $1, name = $2, erklaerung = $3, term_en = $4, kategorie = $5, updated_at = NOW()
         WHERE id = $6 AND production_id = $7
         RETURNING id, kuerzel, name, erklaerung, term_en, kategorie, sort_order`,
        [(kuerzel ?? '').trim(), (name ?? '').trim(), (erklaerung ?? '').trim(), (term_en ?? '').trim(), kat, req.params.id, req.params.productionId]
      )
      if (!rows[0]) return res.status(404).json({ error: 'Not found' })
      res.json(rows[0])
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  }
)

// DELETE /api/dk-settings/:productionId/glossar/:id
router.delete('/:productionId/glossar/:id',
  requireDkAccess(req => req.params.productionId),
  async (req, res) => {
    try {
      await pool.query('DELETE FROM dk_glossar WHERE id = $1 AND production_id = $2', [req.params.id, req.params.productionId])
      res.json({ ok: true })
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  }
)

// ── Stimmungen (Tageszeit) CRUD ───────────────────────────────────────────────

const DEFAULT_STIMMUNGEN = [
  { name: 'TAG',   kuerzel: 'T', position: 0 },
  { name: 'ABEND', kuerzel: 'A', position: 1 },
  { name: 'NACHT', kuerzel: 'N', position: 2 },
]

export async function getStimmungen(productionId: string) {
  const { rows } = await pool.query(
    `SELECT id, name, kuerzel, position FROM tageszeit_stimmungen
     WHERE production_id = $1 ORDER BY position ASC`,
    [productionId]
  )
  if (rows.length === 0) return DEFAULT_STIMMUNGEN.map(s => ({ ...s, id: null }))
  return rows
}

// GET /api/dk-settings/:productionId/stimmungen
router.get('/:productionId/stimmungen',
  requireDkAccess(req => req.params.productionId),
  async (req, res) => {
    try {
      res.json(await getStimmungen(req.params.productionId))
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  }
)

// POST /api/dk-settings/:productionId/stimmungen — neuen Eintrag am Anfang einfügen
router.post('/:productionId/stimmungen',
  requireDkAccess(req => req.params.productionId),
  async (req, res) => {
    try {
      const pid = req.params.productionId
      const { name, kuerzel } = req.body
      if (!name?.trim() || !kuerzel?.trim()) return res.status(400).json({ error: 'name und kuerzel erforderlich' })

      // Sicherstellen dass Defaults existieren bevor wir einfügen
      await ensureDefaultStimmungen(pid)

      // Alle vorhandenen Positionen um 1 erhöhen (neuer Eintrag kommt an Position 0)
      await pool.query(
        `UPDATE tageszeit_stimmungen SET position = position + 1 WHERE production_id = $1`,
        [pid]
      )
      const { rows } = await pool.query(
        `INSERT INTO tageszeit_stimmungen (production_id, name, kuerzel, position)
         VALUES ($1, $2, $3, 0)
         ON CONFLICT (production_id, name) DO NOTHING
         RETURNING id, name, kuerzel, position`,
        [pid, name.trim(), kuerzel.trim().substring(0, 3)]
      )
      if (!rows[0]) return res.status(409).json({ error: 'Stimmung mit diesem Namen existiert bereits' })
      res.json(rows[0])
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  }
)

// PUT /api/dk-settings/:productionId/stimmungen/reorder — [{id, position}]
router.put('/:productionId/stimmungen/reorder',
  requireDkAccess(req => req.params.productionId),
  async (req, res) => {
    try {
      const pid = req.params.productionId
      const entries: { id: number; position: number }[] = req.body
      if (!Array.isArray(entries)) return res.status(400).json({ error: 'Array erforderlich' })
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        for (const e of entries) {
          await client.query(
            `UPDATE tageszeit_stimmungen SET position = $1 WHERE id = $2 AND production_id = $3`,
            [e.position, e.id, pid]
          )
        }
        await client.query('COMMIT')
      } catch (e) {
        await client.query('ROLLBACK')
        throw e
      } finally {
        client.release()
      }
      res.json(await getStimmungen(pid))
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  }
)

// PUT /api/dk-settings/:productionId/stimmungen/:id
router.put('/:productionId/stimmungen/:id',
  requireDkAccess(req => req.params.productionId),
  async (req, res) => {
    try {
      const { name, kuerzel } = req.body
      const { rows } = await pool.query(
        `UPDATE tageszeit_stimmungen SET name = $1, kuerzel = $2
         WHERE id = $3 AND production_id = $4
         RETURNING id, name, kuerzel, position`,
        [name.trim(), kuerzel.trim().substring(0, 3), req.params.id, req.params.productionId]
      )
      if (!rows[0]) return res.status(404).json({ error: 'Nicht gefunden' })
      res.json(rows[0])
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  }
)

// DELETE /api/dk-settings/:productionId/stimmungen/:id
router.delete('/:productionId/stimmungen/:id',
  requireDkAccess(req => req.params.productionId),
  async (req, res) => {
    try {
      const pid = req.params.productionId
      const { rows } = await pool.query(
        `DELETE FROM tageszeit_stimmungen WHERE id = $1 AND production_id = $2 RETURNING position`,
        [req.params.id, pid]
      )
      if (!rows[0]) return res.status(404).json({ error: 'Nicht gefunden' })
      // Positionen neu kompaktieren
      await pool.query(
        `UPDATE tageszeit_stimmungen SET position = sub.new_pos
         FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY position) - 1 AS new_pos
               FROM tageszeit_stimmungen WHERE production_id = $1) sub
         WHERE tageszeit_stimmungen.id = sub.id AND tageszeit_stimmungen.production_id = $1`,
        [pid]
      )
      res.json(await getStimmungen(pid))
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  }
)

// ── Deskriptor-Vorlagen (FSK/JuSchG) CRUD ────────────────────────────────────

// Standard-Deskriptoren nach FSK-Inhaltsdeskriptoren-System (§14 JuSchG, seit 2021)
// Quelle: https://www.fsk.de/de/seite_inhaltsdeskriptoren.html
const DEFAULT_DESKRIPTOR_VORLAGEN = [
  { name: 'Gewaltdarstellungen',        sort_order: 0 },
  { name: 'Sexualisierte Darstellungen', sort_order: 1 },
  { name: 'Beängstigende Szenen',       sort_order: 2 },
  { name: 'Sprache (Schimpfwörter)',     sort_order: 3 },
  { name: 'Drogen, Alkohol & Tabak',    sort_order: 4 },
  { name: 'Diskriminierung',            sort_order: 5 },
  { name: 'Suizid & Selbstverletzung',  sort_order: 6 },
  { name: 'Thematisch belastend',       sort_order: 7 },
]

async function getDeskriptorVorlagen(productionId: string) {
  const { rows } = await pool.query(
    `SELECT id, name, sort_order FROM deskriptor_vorlagen
     WHERE production_id = $1 ORDER BY sort_order ASC`,
    [productionId]
  )
  if (rows.length === 0) return DEFAULT_DESKRIPTOR_VORLAGEN.map(d => ({ ...d, id: null }))
  return rows
}

async function ensureDefaultDeskriptorVorlagen(productionId: string) {
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS cnt FROM deskriptor_vorlagen WHERE production_id = $1`,
    [productionId]
  )
  if (parseInt(rows[0].cnt) > 0) return
  for (const d of DEFAULT_DESKRIPTOR_VORLAGEN) {
    await pool.query(
      `INSERT INTO deskriptor_vorlagen (production_id, name, sort_order)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [productionId, d.name, d.sort_order]
    )
  }
}

// GET /api/dk-settings/:productionId/deskriptor-vorlagen
router.get('/:productionId/deskriptor-vorlagen',
  requireDkAccess(req => req.params.productionId),
  async (req, res) => {
    try {
      await ensureDefaultDeskriptorVorlagen(req.params.productionId)
      res.json(await getDeskriptorVorlagen(req.params.productionId))
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  }
)

// POST /api/dk-settings/:productionId/deskriptor-vorlagen
router.post('/:productionId/deskriptor-vorlagen',
  requireDkAccess(req => req.params.productionId),
  async (req, res) => {
    try {
      const pid = req.params.productionId
      const { name } = req.body
      if (!name?.trim()) return res.status(400).json({ error: 'name erforderlich' })
      await ensureDefaultDeskriptorVorlagen(pid)
      const { rows } = await pool.query(
        `INSERT INTO deskriptor_vorlagen (production_id, name, sort_order)
         VALUES ($1, $2, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM deskriptor_vorlagen WHERE production_id = $1))
         ON CONFLICT (production_id, name) DO NOTHING
         RETURNING id, name, sort_order`,
        [pid, name.trim()]
      )
      if (!rows[0]) return res.status(409).json({ error: 'Deskriptor mit diesem Namen existiert bereits' })
      res.json(rows[0])
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  }
)

// PUT /api/dk-settings/:productionId/deskriptor-vorlagen/reorder — [{id, sort_order}]
router.put('/:productionId/deskriptor-vorlagen/reorder',
  requireDkAccess(req => req.params.productionId),
  async (req, res) => {
    try {
      const pid = req.params.productionId
      const entries: { id: number; sort_order: number }[] = req.body
      if (!Array.isArray(entries)) return res.status(400).json({ error: 'Array erforderlich' })
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        for (const e of entries) {
          await client.query(
            `UPDATE deskriptor_vorlagen SET sort_order = $1 WHERE id = $2 AND production_id = $3`,
            [e.sort_order, e.id, pid]
          )
        }
        await client.query('COMMIT')
      } catch (e) {
        await client.query('ROLLBACK')
        throw e
      } finally {
        client.release()
      }
      res.json(await getDeskriptorVorlagen(pid))
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  }
)

// PUT /api/dk-settings/:productionId/deskriptor-vorlagen/:id
router.put('/:productionId/deskriptor-vorlagen/:id',
  requireDkAccess(req => req.params.productionId),
  async (req, res) => {
    try {
      const { name } = req.body
      if (!name?.trim()) return res.status(400).json({ error: 'name erforderlich' })
      const { rows } = await pool.query(
        `UPDATE deskriptor_vorlagen SET name = $1
         WHERE id = $2 AND production_id = $3
         RETURNING id, name, sort_order`,
        [name.trim(), req.params.id, req.params.productionId]
      )
      if (!rows[0]) return res.status(404).json({ error: 'Nicht gefunden' })
      res.json(rows[0])
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  }
)

// DELETE /api/dk-settings/:productionId/deskriptor-vorlagen/:id
router.delete('/:productionId/deskriptor-vorlagen/:id',
  requireDkAccess(req => req.params.productionId),
  async (req, res) => {
    try {
      const pid = req.params.productionId
      const { rows } = await pool.query(
        `DELETE FROM deskriptor_vorlagen WHERE id = $1 AND production_id = $2 RETURNING sort_order`,
        [req.params.id, pid]
      )
      if (!rows[0]) return res.status(404).json({ error: 'Nicht gefunden' })
      // Positionen neu kompaktieren
      await pool.query(
        `UPDATE deskriptor_vorlagen SET sort_order = sub.new_pos
         FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY sort_order) - 1 AS new_pos
               FROM deskriptor_vorlagen WHERE production_id = $1) sub
         WHERE deskriptor_vorlagen.id = sub.id AND deskriptor_vorlagen.production_id = $1`,
        [pid]
      )
      res.json(await getDeskriptorVorlagen(pid))
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  }
)

// Hilfsfunktion: Defaults in DB schreiben wenn noch keine Einträge vorhanden
async function ensureDefaultStimmungen(productionId: string) {
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS cnt FROM tageszeit_stimmungen WHERE production_id = $1`,
    [productionId]
  )
  if (parseInt(rows[0].cnt) > 0) return
  for (const s of DEFAULT_STIMMUNGEN) {
    await pool.query(
      `INSERT INTO tageszeit_stimmungen (production_id, name, kuerzel, position)
       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [productionId, s.name, s.kuerzel, s.position]
    )
  }
}

export { ensureDefaultStimmungen }

// ── Admin: DK-Zugriffsverwaltung ──────────────────────────────────────────────

const adminRouter = Router()
adminRouter.use(authMiddleware)
adminRouter.use(requireRole('superadmin', 'geschaeftsfuehrung', 'herstellungsleitung'))

// GET /api/admin/dk-access/meta — Rollen + User aus Auth-Service
adminRouter.get('/meta', async (_req, res) => {
  try {
    const INTERNAL_KEY = process.env.INTERNAL_SECRET_KEY || 'SerienwerftInternalKey2026xQzP'
    const [usersRes, rolesRes] = await Promise.all([
      fetch('http://127.0.0.1:3002/api/internal/app-users/script', { headers: { 'x-internal-key': INTERNAL_KEY } }),
      fetch('http://127.0.0.1:3002/api/internal/app-roles/script', { headers: { 'x-internal-key': INTERNAL_KEY } }),
    ])
    if (!usersRes.ok || !rolesRes.ok) return res.status(502).json({ error: 'Auth-Service nicht erreichbar' })
    const [usersData, rolesData]: any[] = await Promise.all([usersRes.json(), rolesRes.json()])

    // Unique users (ein User kann mehrere Rollen haben → deduplizieren)
    const userMap = new Map<string, { id: string; name: string; email: string }>()
    for (const u of (usersData.users || [])) {
      if (!userMap.has(u.id)) {
        userMap.set(u.id, {
          id: u.id,
          name: (u.username || '').trim() || u.email.split('@')[0],
          email: u.email,
        })
      }
    }
    const users = [...userMap.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'))

    const ALWAYS_ACCESS = ['superadmin', 'herstellungsleitung']
    const roles = (rolesData.roles || [])
      .filter((r: any) => !ALWAYS_ACCESS.includes(r.name))
      .map((r: any) => ({ id: r.id, name: r.name }))

    res.json({ users, roles })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/admin/dk-access/:productionId
adminRouter.get('/:productionId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM dk_settings_access WHERE production_id = $1 ORDER BY access_type, identifier',
      [req.params.productionId]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/admin/dk-access/:productionId — Zugriffsliste komplett ersetzen
adminRouter.put('/:productionId', async (req: any, res) => {
  try {
    const { productionId } = req.params
    const { entries } = req.body  // [{ access_type, identifier }]
    if (!Array.isArray(entries)) return res.status(400).json({ error: 'entries array required' })

    await pool.query('DELETE FROM dk_settings_access WHERE production_id = $1', [productionId])
    for (const entry of entries) {
      if (!entry.access_type || !entry.identifier) continue
      await pool.query(
        `INSERT INTO dk_settings_access (production_id, access_type, identifier, created_by)
         VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
        [productionId, entry.access_type, entry.identifier, req.user.user_id]
      )
    }
    const { rows } = await pool.query(
      'SELECT * FROM dk_settings_access WHERE production_id = $1 ORDER BY access_type, identifier',
      [productionId]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export { router as dkSettingsRouter, adminRouter as dkAccessAdminRouter }
