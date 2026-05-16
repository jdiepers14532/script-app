import { Router, Request } from 'express'
import { pool } from '../db'
import { authMiddleware } from '../auth'

const router = Router()
router.use(authMiddleware)

const VERTRAEGE_URL = process.env.VERTRAEGE_INTERNAL_URL || 'http://127.0.0.1:3003'
const INTERNAL_SECRET = process.env.PROD_INTERNAL_SECRET || 'prod-internal-2026'

function uid(req: Request): string {
  return req.user?.user_id || req.user?.name || 'unknown'
}

const DEFAULT_BUCHPROZESS_CONFIG = {
  wochen_typ: 'kalender',
  prozesse: [
    {
      id: 'storyline',
      label: 'Storyline',
      kostenstelle: '605119',
      dauer_wochen: 1,
      max_slots: 5,
      praesenz_wochen: [],
      vertragsdb_taetigkeit_ids: [155, 272, 268],
      werkstufen_typ: 'storyline',
      farbe: '#007AFF',
      sortierung: 1,
    },
    {
      id: 'storyedit',
      label: 'Storyedit',
      kostenstelle: '605111',
      dauer_wochen: 3,
      max_slots: 3,
      praesenz_wochen: [1],
      vertragsdb_taetigkeit_ids: [162, 158, 235],
      werkstufen_typ: 'storyline',
      farbe: '#FF9500',
      sortierung: 2,
    },
    {
      id: 'drehbuch',
      label: 'Drehbuch',
      kostenstelle: '605110',
      dauer_wochen: 1,
      max_slots: 5,
      praesenz_wochen: [],
      vertragsdb_taetigkeit_ids: [269, 155],
      werkstufen_typ: 'drehbuch',
      farbe: '#00C853',
      sortierung: 3,
    },
    {
      id: 'scriptedit',
      label: 'Scriptedit',
      kostenstelle: '605122',
      dauer_wochen: 2,
      max_slots: 2,
      praesenz_wochen: [],
      vertragsdb_taetigkeit_ids: [159, 160, 309],
      werkstufen_typ: 'drehbuch',
      farbe: '#AF52DE',
      sortierung: 4,
    },
  ],
}

// ── Helper: call vertragsdb internal API ──────────────────────────────────────
async function vertragsdbGet(path: string): Promise<any> {
  const res = await fetch(`${VERTRAEGE_URL}${path}`, {
    headers: { 'X-Internal-Secret': INTERNAL_SECRET },
  })
  if (!res.ok) throw new Error(`Vertragsdb ${path}: ${res.status}`)
  return res.json()
}

async function vertragsdbPost(path: string, body: object): Promise<any> {
  const res = await fetch(`${VERTRAEGE_URL}${path}`, {
    method: 'POST',
    headers: {
      'X-Internal-Secret': INTERNAL_SECRET,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Vertragsdb ${path}: ${res.status}`)
  return res.json()
}

// ── Buchprozess-Konfiguration ──────────────────────────────────────────────────

// GET /api/autorenplan/config?produktion_db_id=
router.get('/config', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  const { produktion_db_id } = req.query as Record<string, string>
  if (!produktion_db_id) return res.status(400).json({ error: 'produktion_db_id fehlt' })

  const row = await pool.query(
    "SELECT value FROM production_app_settings WHERE production_id = $1 AND key = 'buchprozess_config'",
    [produktion_db_id]
  )
  const config = row.rows[0] ? JSON.parse(row.rows[0].value) : DEFAULT_BUCHPROZESS_CONFIG
  res.json({ config })
})

// PUT /api/autorenplan/config?produktion_db_id=
router.put('/config', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  const { produktion_db_id } = req.query as Record<string, string>
  if (!produktion_db_id) return res.status(400).json({ error: 'produktion_db_id fehlt' })
  const config = req.body
  await pool.query(
    `INSERT INTO production_app_settings (production_id, key, value, updated_at)
     VALUES ($1, 'buchprozess_config', $2, NOW())
     ON CONFLICT (production_id, key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [produktion_db_id, JSON.stringify(config)]
  )
  res.json({ ok: true })
})

// ── Personen-Suche (Proxy zu Vertragsdb) ──────────────────────────────────────

// GET /api/autorenplan/personen-suche?name=&produktion_db_id=
router.get('/personen-suche', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  const { name, produktion_db_id } = req.query as Record<string, string>
  try {
    if (produktion_db_id && !name) {
      // Personen mit Verträgen für diese Produktion
      const data = await vertragsdbGet(
        `/api/internal/personen?produktion_db_id=${encodeURIComponent(produktion_db_id)}&rolle=arbeitnehmer`
      )
      return res.json(data)
    }
    if (!name || name.trim().length < 2) return res.json({ personen: [] })
    const data = await vertragsdbGet(
      `/api/internal/personen-search?name=${encodeURIComponent(name)}`
    )
    res.json(data)
  } catch (e: any) {
    res.status(502).json({ error: 'Vertragsdb nicht erreichbar', detail: e.message })
  }
})

// POST /api/autorenplan/personen-anlegen
router.post('/personen-anlegen', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  const { name, rufname, email } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'name erforderlich' })
  try {
    const data = await vertragsdbPost('/api/internal/personen-anlegen', { name, rufname, email })
    res.json(data)
  } catch (e: any) {
    res.status(502).json({ error: 'Vertragsdb nicht erreichbar', detail: e.message })
  }
})

// GET /api/autorenplan/taetigkeiten?q=&produktion_db_id=&ids=
router.get('/taetigkeiten', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  const params = new URLSearchParams()
  const { q, produktion_db_id, ids } = req.query as Record<string, string>
  if (q) params.set('q', q)
  if (produktion_db_id) params.set('produktion_db_id', produktion_db_id)
  if (ids) params.set('ids', ids)
  try {
    const data = await vertragsdbGet(`/api/internal/taetigkeiten-search?${params}`)
    res.json(data)
  } catch (e: any) {
    res.status(502).json({ error: 'Vertragsdb nicht erreichbar', detail: e.message })
  }
})

// ── Einsätze ───────────────────────────────────────────────────────────────────

// GET /api/autorenplan/einsaetze?produktion_db_id=&von=&bis=
router.get('/einsaetze', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  const { produktion_db_id, von, bis } = req.query as Record<string, string>
  if (!produktion_db_id) return res.status(400).json({ error: 'produktion_db_id fehlt' })

  const conditions = ['produktion_db_id = $1']
  const params: any[] = [produktion_db_id]

  if (von) {
    params.push(von)
    conditions.push(`woche_von >= $${params.length}`)
  }
  if (bis) {
    const config = await pool.query(
      "SELECT value FROM production_app_settings WHERE production_id = $1 AND key = 'buchprozess_config'",
      [produktion_db_id]
    )
    const cfg = config.rows[0] ? JSON.parse(config.rows[0].value) : DEFAULT_BUCHPROZESS_CONFIG
    const maxDauer = Math.max(...cfg.prozesse.map((p: any) => p.dauer_wochen || 1))
    // Einsätze die in den Sichtbereich fallen (woche_von + max_dauer Wochen)
    params.push(bis)
    conditions.push(`woche_von <= $${params.length}::date + interval '${maxDauer * 7} days'`)
  }

  const where = conditions.join(' AND ')
  const rows = await pool.query(
    `SELECT * FROM autorenplan_einsaetze WHERE ${where} ORDER BY prozess_id, woche_von`,
    params
  )
  res.json({ einsaetze: rows.rows })
})

// POST /api/autorenplan/einsaetze
router.post('/einsaetze', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  const {
    produktion_db_id, prozess_id, woche_von,
    vertragsdb_person_id, platzhalter_name, person_cache_name,
    vertragsdb_taetigkeit_id, vertragsdb_vertrag_id,
    block_nummer, status, kostenstelle, ist_homeoffice_override, notiz,
  } = req.body

  if (!produktion_db_id || !prozess_id || !woche_von) {
    return res.status(400).json({ error: 'produktion_db_id, prozess_id, woche_von erforderlich' })
  }

  const result = await pool.query(
    `INSERT INTO autorenplan_einsaetze
       (produktion_db_id, prozess_id, woche_von,
        vertragsdb_person_id, platzhalter_name, person_cache_name,
        vertragsdb_taetigkeit_id, vertragsdb_vertrag_id,
        block_nummer, status, kostenstelle, ist_homeoffice_override, notiz,
        erstellt_von)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [
      produktion_db_id, prozess_id, woche_von,
      vertragsdb_person_id || null, platzhalter_name || null, person_cache_name || null,
      vertragsdb_taetigkeit_id || null, vertragsdb_vertrag_id || null,
      block_nummer || null, status || 'geplant', kostenstelle || null,
      ist_homeoffice_override ?? null, notiz || null,
      uid(req),
    ]
  )
  res.json({ einsatz: result.rows[0] })
})

// PUT /api/autorenplan/einsaetze/:id
router.put('/einsaetze/:id', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  const { id } = req.params
  const {
    vertragsdb_person_id, platzhalter_name, person_cache_name,
    vertragsdb_taetigkeit_id, vertragsdb_vertrag_id,
    block_nummer, status, kostenstelle, ist_homeoffice_override, notiz, woche_von,
  } = req.body

  const result = await pool.query(
    `UPDATE autorenplan_einsaetze SET
       vertragsdb_person_id = $1,
       platzhalter_name = $2,
       person_cache_name = $3,
       vertragsdb_taetigkeit_id = $4,
       vertragsdb_vertrag_id = $5,
       block_nummer = $6,
       status = COALESCE($7, status),
       kostenstelle = $8,
       ist_homeoffice_override = $9,
       notiz = $10,
       woche_von = COALESCE($11, woche_von),
       aktualisiert_am = NOW()
     WHERE id = $12
     RETURNING *`,
    [
      vertragsdb_person_id ?? null, platzhalter_name ?? null, person_cache_name ?? null,
      vertragsdb_taetigkeit_id ?? null, vertragsdb_vertrag_id ?? null,
      block_nummer ?? null, status ?? null, kostenstelle ?? null,
      ist_homeoffice_override ?? null, notiz ?? null,
      woche_von ?? null, id,
    ]
  )
  if (!result.rows.length) return res.status(404).json({ error: 'Nicht gefunden' })
  res.json({ einsatz: result.rows[0] })
})

// DELETE /api/autorenplan/einsaetze/:id
router.delete('/einsaetze/:id', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  await pool.query('DELETE FROM autorenplan_einsaetze WHERE id = $1', [req.params.id])
  res.json({ ok: true })
})

// ── Zusatzpersonal ─────────────────────────────────────────────────────────────

router.get('/einsaetze/:id/zusatz', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  const rows = await pool.query(
    'SELECT * FROM autorenplan_zusatz WHERE einsatz_id = $1 ORDER BY erstellt_am',
    [req.params.id]
  )
  res.json({ zusatz: rows.rows })
})

router.post('/einsaetze/:id/zusatz', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  const {
    vertragsdb_person_id, platzhalter_name, person_cache_name,
    woche_von, woche_bis, beschreibung, status, notiz,
  } = req.body
  if (!beschreibung?.trim()) return res.status(400).json({ error: 'beschreibung erforderlich' })
  const result = await pool.query(
    `INSERT INTO autorenplan_zusatz
       (einsatz_id, vertragsdb_person_id, platzhalter_name, person_cache_name,
        woche_von, woche_bis, beschreibung, status, notiz, erstellt_von)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [
      req.params.id,
      vertragsdb_person_id || null, platzhalter_name || null, person_cache_name || null,
      woche_von || null, woche_bis || null, beschreibung,
      status || 'geplant', notiz || null, uid(req),
    ]
  )
  res.json({ zusatz: result.rows[0] })
})

router.delete('/zusatz/:id', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  await pool.query('DELETE FROM autorenplan_zusatz WHERE id = $1', [req.params.id])
  res.json({ ok: true })
})

// ── Wochennotizen ──────────────────────────────────────────────────────────────

router.get('/wochen-notizen', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  const { produktion_db_id, von, bis } = req.query as Record<string, string>
  if (!produktion_db_id) return res.status(400).json({ error: 'produktion_db_id fehlt' })

  const conditions = ['produktion_db_id = $1']
  const params: any[] = [produktion_db_id]
  if (von) { params.push(von); conditions.push(`woche_von >= $${params.length}`) }
  if (bis) { params.push(bis); conditions.push(`woche_von <= $${params.length}`) }

  const rows = await pool.query(
    `SELECT * FROM autorenplan_wochen_notizen WHERE ${conditions.join(' AND ')} ORDER BY woche_von`,
    params
  )
  res.json({ notizen: rows.rows })
})

router.post('/wochen-notizen', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  const { produktion_db_id, woche_von, typ, text } = req.body
  if (!produktion_db_id || !woche_von || !text?.trim()) {
    return res.status(400).json({ error: 'produktion_db_id, woche_von, text erforderlich' })
  }
  const result = await pool.query(
    `INSERT INTO autorenplan_wochen_notizen (produktion_db_id, woche_von, typ, text, erstellt_von)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [produktion_db_id, woche_von, typ || 'allgemein', text, uid(req)]
  )
  res.json({ notiz: result.rows[0] })
})

router.put('/wochen-notizen/:id', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  const { typ, text } = req.body
  const result = await pool.query(
    `UPDATE autorenplan_wochen_notizen SET typ = COALESCE($1, typ), text = COALESCE($2, text)
     WHERE id = $3 RETURNING *`,
    [typ || null, text || null, req.params.id]
  )
  if (!result.rows.length) return res.status(404).json({ error: 'Nicht gefunden' })
  res.json({ notiz: result.rows[0] })
})

router.delete('/wochen-notizen/:id', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  await pool.query('DELETE FROM autorenplan_wochen_notizen WHERE id = $1', [req.params.id])
  res.json({ ok: true })
})

// ── Futures ────────────────────────────────────────────────────────────────────

router.get('/futures', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  const { produktion_db_id } = req.query as Record<string, string>
  if (!produktion_db_id) return res.status(400).json({ error: 'produktion_db_id fehlt' })

  const futures = await pool.query(
    'SELECT * FROM autorenplan_futures WHERE produktion_db_id = $1 ORDER BY schreib_von, sortierung',
    [produktion_db_id]
  )
  if (!futures.rows.length) return res.json({ futures: [] })

  const ids = futures.rows.map(f => f.id)
  const autoren = await pool.query(
    `SELECT * FROM autorenplan_future_autoren WHERE future_id = ANY($1) ORDER BY phase, erstellt_am`,
    [ids]
  )
  const autorenMap: Record<string, any[]> = {}
  for (const a of autoren.rows) {
    if (!autorenMap[a.future_id]) autorenMap[a.future_id] = []
    autorenMap[a.future_id].push(a)
  }

  res.json({
    futures: futures.rows.map(f => ({ ...f, autoren: autorenMap[f.id] || [] })),
  })
})

router.post('/futures', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  const { produktion_db_id, titel, schreib_von, schreib_bis, edit_von, edit_bis, notiz } = req.body
  if (!produktion_db_id || !titel?.trim() || !schreib_von || !schreib_bis) {
    return res.status(400).json({ error: 'produktion_db_id, titel, schreib_von, schreib_bis erforderlich' })
  }
  const result = await pool.query(
    `INSERT INTO autorenplan_futures
       (produktion_db_id, titel, schreib_von, schreib_bis, edit_von, edit_bis, notiz, erstellt_von)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [produktion_db_id, titel, schreib_von, schreib_bis, edit_von || null, edit_bis || null, notiz || null, uid(req)]
  )
  res.json({ future: { ...result.rows[0], autoren: [] } })
})

router.put('/futures/:id', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  const { titel, schreib_von, schreib_bis, edit_von, edit_bis, notiz } = req.body
  const result = await pool.query(
    `UPDATE autorenplan_futures SET
       titel = COALESCE($1, titel),
       schreib_von = COALESCE($2, schreib_von),
       schreib_bis = COALESCE($3, schreib_bis),
       edit_von = $4, edit_bis = $5, notiz = $6
     WHERE id = $7 RETURNING *`,
    [titel || null, schreib_von || null, schreib_bis || null,
     edit_von || null, edit_bis || null, notiz || null, req.params.id]
  )
  if (!result.rows.length) return res.status(404).json({ error: 'Nicht gefunden' })
  res.json({ future: result.rows[0] })
})

router.delete('/futures/:id', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  await pool.query('DELETE FROM autorenplan_futures WHERE id = $1', [req.params.id])
  res.json({ ok: true })
})

// Future-Autoren
router.post('/futures/:id/autoren', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  const {
    vertragsdb_person_id, platzhalter_name, person_cache_name,
    phase, ist_homeoffice, status, notiz,
  } = req.body
  const result = await pool.query(
    `INSERT INTO autorenplan_future_autoren
       (future_id, vertragsdb_person_id, platzhalter_name, person_cache_name,
        phase, ist_homeoffice, status, notiz)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [
      req.params.id,
      vertragsdb_person_id || null, platzhalter_name || null, person_cache_name || null,
      phase || 'schreiben', ist_homeoffice ?? false, status || 'geplant', notiz || null,
    ]
  )
  res.json({ autor: result.rows[0] })
})

router.put('/futures/autoren/:id', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  const { status, ist_homeoffice, notiz, person_cache_name } = req.body
  const result = await pool.query(
    `UPDATE autorenplan_future_autoren SET
       status = COALESCE($1, status),
       ist_homeoffice = COALESCE($2, ist_homeoffice),
       notiz = $3,
       person_cache_name = COALESCE($4, person_cache_name)
     WHERE id = $5 RETURNING *`,
    [status || null, ist_homeoffice ?? null, notiz ?? null, person_cache_name || null, req.params.id]
  )
  if (!result.rows.length) return res.status(404).json({ error: 'Nicht gefunden' })
  res.json({ autor: result.rows[0] })
})

router.delete('/futures/autoren/:id', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  await pool.query('DELETE FROM autorenplan_future_autoren WHERE id = $1', [req.params.id])
  res.json({ ok: true })
})

export { router as autorenplanRouter }
