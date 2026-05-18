import { Router, Request } from 'express'
import { pool } from '../db'
import { prodQueryOne } from '../prodDb'
import { authMiddleware } from '../auth'

const router = Router()
router.use(authMiddleware)

const VERTRAEGE_URL = process.env.VERTRAEGE_INTERNAL_URL || 'http://127.0.0.1:3003'
const INTERNAL_SECRET = process.env.PROD_INTERNAL_SECRET || 'prod-internal-2026'

function uid(req: Request): string {
  return req.user?.user_id || req.user?.name || 'unknown'
}

function uname(req: Request): string {
  return req.user?.name || req.user?.user_id || 'unknown'
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
    headers: { 'X-Internal-Secret': INTERNAL_SECRET, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Vertragsdb ${path}: ${res.status}`)
  return res.json()
}

// ── Job-Kategorien ─────────────────────────────────────────────────────────────

// GET /api/autorenplan/job-kategorien?produktion_db_id=
router.get('/job-kategorien', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  const { produktion_db_id } = req.query as Record<string, string>
  if (!produktion_db_id) return res.status(400).json({ error: 'produktion_db_id fehlt' })

  const rows = await pool.query(
    'SELECT * FROM autorenplan_job_kategorien WHERE produktion_db_id = $1 ORDER BY sortierung, erstellt_am',
    [produktion_db_id]
  )
  res.json({ job_kategorien: rows.rows })
})

// POST /api/autorenplan/job-kategorien
router.post('/job-kategorien', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  const {
    produktion_db_id, label, beschreibung, vertragsdb_taetigkeit_id,
    gage_betrag, gage_waehrung, abrechnungstyp, lst_rg, gagen,
    max_slots, slots_gleich_folgen,
    dauer_wochen, bezugseinheit, praesenz_wochen,
    erster_block_start, farbe, sortierung,
  } = req.body

  if (!produktion_db_id || !label?.trim()) {
    return res.status(400).json({ error: 'produktion_db_id und label erforderlich' })
  }

  const result = await pool.query(
    `INSERT INTO autorenplan_job_kategorien
       (produktion_db_id, label, beschreibung, vertragsdb_taetigkeit_id,
        gage_betrag, gage_waehrung, abrechnungstyp, lst_rg, gagen,
        max_slots, slots_gleich_folgen,
        dauer_wochen, bezugseinheit, praesenz_wochen,
        erster_block_start, farbe, sortierung, erstellt_von)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     RETURNING *`,
    [
      produktion_db_id, label.trim(), beschreibung || null, vertragsdb_taetigkeit_id || null,
      gage_betrag || null, gage_waehrung || 'EUR', abrechnungstyp || 'pauschal', lst_rg || 'RG',
      gagen ? JSON.stringify(gagen) : '[]',
      max_slots ?? 1, slots_gleich_folgen ?? false,
      dauer_wochen ?? 1, bezugseinheit || 'block',
      praesenz_wochen?.length ? praesenz_wochen : [1],
      erster_block_start || null, farbe || '#007AFF', sortierung ?? 0,
      uid(req),
    ]
  )
  res.json({ job_kategorie: result.rows[0] })
})

// PUT /api/autorenplan/job-kategorien/:id
router.put('/job-kategorien/:id', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  const {
    label, beschreibung, vertragsdb_taetigkeit_id,
    gage_betrag, gage_waehrung, abrechnungstyp, lst_rg, gagen,
    max_slots, slots_gleich_folgen,
    dauer_wochen, bezugseinheit, praesenz_wochen,
    erster_block_start, farbe, sortierung,
  } = req.body

  const result = await pool.query(
    `UPDATE autorenplan_job_kategorien SET
       label               = COALESCE($1, label),
       beschreibung        = $2,
       vertragsdb_taetigkeit_id = $3,
       gage_betrag         = $4,
       gage_waehrung       = COALESCE($5, gage_waehrung),
       abrechnungstyp      = COALESCE($6, abrechnungstyp),
       lst_rg              = COALESCE($7, lst_rg),
       gagen               = COALESCE($8, gagen),
       max_slots           = COALESCE($9, max_slots),
       slots_gleich_folgen = COALESCE($10, slots_gleich_folgen),
       dauer_wochen        = COALESCE($11, dauer_wochen),
       bezugseinheit       = COALESCE($12, bezugseinheit),
       praesenz_wochen     = COALESCE($13, praesenz_wochen),
       erster_block_start  = $14,
       farbe               = COALESCE($15, farbe),
       sortierung          = COALESCE($16, sortierung),
       aktualisiert_am     = NOW()
     WHERE id = $17
     RETURNING *`,
    [
      label?.trim() || null, beschreibung ?? null, vertragsdb_taetigkeit_id ?? null,
      gage_betrag ?? null, gage_waehrung || null, abrechnungstyp || null, lst_rg || null,
      gagen ? JSON.stringify(gagen) : null,
      max_slots ?? null, slots_gleich_folgen ?? null,
      dauer_wochen ?? null, bezugseinheit || null,
      praesenz_wochen?.length ? praesenz_wochen : null,
      erster_block_start || null, farbe || null, sortierung ?? null,
      req.params.id,
    ]
  )
  if (!result.rows.length) return res.status(404).json({ error: 'Nicht gefunden' })
  res.json({ job_kategorie: result.rows[0] })
})

// DELETE /api/autorenplan/job-kategorien/:id
router.delete('/job-kategorien/:id', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  await pool.query('DELETE FROM autorenplan_job_kategorien WHERE id = $1', [req.params.id])
  res.json({ ok: true })
})

// PUT /api/autorenplan/job-kategorien/sort — reorder
router.put('/job-kategorien/sort', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  const { ids } = req.body as { ids: string[] }
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids[]  erforderlich' })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (let i = 0; i < ids.length; i++) {
      await client.query(
        'UPDATE autorenplan_job_kategorien SET sortierung = $1 WHERE id = $2',
        [i, ids[i]]
      )
    }
    await client.query('COMMIT')
    res.json({ ok: true })
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
})

// ── Bloecke aus Prod-DB ────────────────────────────────────────────────────────

// GET /api/autorenplan/bloecke?produktion_db_id=
// Liefert Block-Array direkt aus Prod-DB (über prodQueryOne), aufbereitet mit
// block_nummer, folge_von, folge_bis, folgen_anzahl, dreh_von, block_label
router.get('/bloecke', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  const { produktion_db_id } = req.query as Record<string, string>
  if (!produktion_db_id) return res.status(400).json({ error: 'produktion_db_id fehlt' })

  try {
    const prod = await prodQueryOne(
      `SELECT erster_block, erste_folge, folgen_global, block_label, bloecke
       FROM productions WHERE id = $1`,
      [produktion_db_id]
    )
    if (!prod) return res.json({ bloecke: [], block_label: 'Block', erster_block: 1 })

    const bloecke = Array.isArray(prod.bloecke) ? prod.bloecke : []
    const folgenGlobal = prod.folgen_global ?? 2

    res.json({
      block_label:  prod.block_label || 'Block',
      erster_block: prod.erster_block ?? 1,
      erste_folge:  prod.erste_folge ?? 1,
      bloecke: bloecke.map((b: any, i: number) => {
        const fv = b.folge_von ?? null
        const fb = b.folge_bis ?? null
        const folgen_anzahl = fv != null && fb != null ? (fb - fv + 1) : folgenGlobal
        return {
          proddb_id:    b.id,
          block_nummer: (prod.erster_block ?? 1) + i,
          folge_von:    fv,
          folge_bis:    fb,
          folgen_anzahl,
          dreh_von:     b.dreh_von || null,
          dreh_bis:     b.dreh_bis || null,
          team_index:   b.team_index ?? null,
        }
      }),
    })
  } catch (e: any) {
    res.status(502).json({ error: 'Prod-DB nicht erreichbar', detail: e.message })
  }
})

// ── Personen-Suche & Anlegen (Proxy zu Vertragsdb) ────────────────────────────

router.get('/personen-suche', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  const { name, produktion_db_id } = req.query as Record<string, string>
  try {
    if (produktion_db_id && !name) {
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

// GET /api/autorenplan/taetigkeiten?q=&ids=
router.get('/taetigkeiten', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  const params = new URLSearchParams()
  const { q, ids } = req.query as Record<string, string>
  if (q) params.set('q', q)
  if (ids) params.set('ids', ids)
  try {
    const data = await vertragsdbGet(`/api/internal/taetigkeiten-search?${params}`)
    res.json(data)
  } catch (e: any) {
    res.status(502).json({ error: 'Vertragsdb nicht erreichbar', detail: e.message })
  }
})

// POST /api/autorenplan/taetigkeiten-anlegen
router.post('/taetigkeiten-anlegen', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  const { bezeichnung, gewerk, kategorie } = req.body
  if (!bezeichnung?.trim()) return res.status(400).json({ error: 'bezeichnung erforderlich' })
  try {
    const data = await vertragsdbPost('/api/internal/taetigkeiten-anlegen', { bezeichnung, gewerk, kategorie })
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

  if (von) { params.push(von); conditions.push(`woche_von >= $${params.length}`) }
  if (bis) {
    // Einsätze mit bis zu 8 Wochen Vorlauf berücksichtigen
    params.push(bis)
    conditions.push(`woche_von <= $${params.length}::date + interval '56 days'`)
  }

  const rows = await pool.query(
    `SELECT * FROM autorenplan_einsaetze WHERE ${conditions.join(' AND ')}
     ORDER BY job_kategorie_id, prozess_id, woche_von, erstellt_am`,
    params
  )
  res.json({ einsaetze: rows.rows })
})

// POST /api/autorenplan/einsaetze
router.post('/einsaetze', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  const {
    produktion_db_id, job_kategorie_id, prozess_id, woche_von,
    vertragsdb_person_id, platzhalter_name, person_cache_name,
    vertragsdb_taetigkeit_id, vertragsdb_vertrag_id,
    block_nummer, folge_nummer, status, kostenstelle, ist_homeoffice_override, notiz,
    von_datum, bis_datum, gage_kat, gage_kategorie_id,
  } = req.body

  if (!produktion_db_id || !woche_von || (!job_kategorie_id && !prozess_id)) {
    return res.status(400).json({ error: 'produktion_db_id, woche_von und job_kategorie_id (oder prozess_id) erforderlich' })
  }

  const result = await pool.query(
    `INSERT INTO autorenplan_einsaetze
       (produktion_db_id, job_kategorie_id, prozess_id, woche_von,
        vertragsdb_person_id, platzhalter_name, person_cache_name,
        vertragsdb_taetigkeit_id, vertragsdb_vertrag_id,
        block_nummer, folge_nummer, status, kostenstelle, ist_homeoffice_override, notiz,
        von_datum, bis_datum, gage_kat, gage_kategorie_id, erstellt_von)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
     RETURNING *`,
    [
      produktion_db_id, job_kategorie_id || null, prozess_id || null, woche_von,
      vertragsdb_person_id || null, platzhalter_name || null, person_cache_name || null,
      vertragsdb_taetigkeit_id || null, vertragsdb_vertrag_id || null,
      block_nummer || null, folge_nummer || null,
      status || 'geplant', kostenstelle || null, ist_homeoffice_override ?? null, notiz || null,
      von_datum || null, bis_datum || null, gage_kat ?? null, gage_kategorie_id || null,
      uid(req),
    ]
  )
  // Platzhalter-Namen für Auto-Vervollständigung cachen
  if (platzhalter_name?.trim()) {
    await pool.query(
      `INSERT INTO autorenplan_platzhalter_cache (name)
       VALUES ($1)
       ON CONFLICT (name) DO UPDATE
         SET used_count = autorenplan_platzhalter_cache.used_count + 1,
             last_used_at = NOW()`,
      [platzhalter_name.trim()]
    ).catch(() => {}) // Non-critical
  }

  // Status-Tracking bei Anlage mit bereits getracktem Status
  const insertedStatus: string = result.rows[0].status
  if (insertedStatus && TRACKED_STATUSES.includes(insertedStatus)) {
    await pool.query(
      `UPDATE autorenplan_einsaetze SET ${insertedStatus}_am = NOW(), ${insertedStatus}_von = $1 WHERE id = $2`,
      [uname(req), result.rows[0].id]
    ).catch(() => {})
    const fresh = await pool.query('SELECT * FROM autorenplan_einsaetze WHERE id = $1', [result.rows[0].id])
    if (fresh.rows.length) return res.json({ einsatz: fresh.rows[0] })
  }

  res.json({ einsatz: result.rows[0] })
})

const TRACKED_STATUSES = ['angefragt', 'zugesagt', 'vertrag_zurueck', 'abgesagt']

// PUT /api/autorenplan/einsaetze/:id
router.put('/einsaetze/:id', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  const {
    vertragsdb_person_id, platzhalter_name, person_cache_name,
    vertragsdb_taetigkeit_id, vertragsdb_vertrag_id,
    block_nummer, folge_nummer, status, kostenstelle, ist_homeoffice_override, notiz, woche_von,
    von_datum, bis_datum, gage_kat, gage_kategorie_id,
  } = req.body

  // Alten Status lesen, um Tracking-Änderung zu erkennen
  let oldStatus: string | null = null
  if (status && TRACKED_STATUSES.includes(status)) {
    const old = await pool.query('SELECT status FROM autorenplan_einsaetze WHERE id = $1', [req.params.id])
    oldStatus = old.rows[0]?.status ?? null
  }

  const result = await pool.query(
    `UPDATE autorenplan_einsaetze SET
       vertragsdb_person_id   = $1,
       platzhalter_name       = $2,
       person_cache_name      = $3,
       vertragsdb_taetigkeit_id = $4,
       vertragsdb_vertrag_id  = $5,
       block_nummer           = $6,
       folge_nummer           = $7,
       status                 = COALESCE($8, status),
       kostenstelle           = $9,
       ist_homeoffice_override = $10,
       notiz                  = $11,
       woche_von              = COALESCE($12, woche_von),
       von_datum              = $13,
       bis_datum              = $14,
       gage_kat               = $15,
       gage_kategorie_id      = $16,
       aktualisiert_am        = NOW()
     WHERE id = $17
     RETURNING *`,
    [
      vertragsdb_person_id ?? null, platzhalter_name ?? null, person_cache_name ?? null,
      vertragsdb_taetigkeit_id ?? null, vertragsdb_vertrag_id ?? null,
      block_nummer ?? null, folge_nummer ?? null,
      status ?? null, kostenstelle ?? null, ist_homeoffice_override ?? null,
      notiz ?? null, woche_von ?? null,
      von_datum ?? null, bis_datum ?? null, gage_kat ?? null, gage_kategorie_id || null,
      req.params.id,
    ]
  )
  if (!result.rows.length) return res.status(404).json({ error: 'Nicht gefunden' })

  if (platzhalter_name?.trim()) {
    await pool.query(
      `INSERT INTO autorenplan_platzhalter_cache (name)
       VALUES ($1)
       ON CONFLICT (name) DO UPDATE
         SET used_count = autorenplan_platzhalter_cache.used_count + 1,
             last_used_at = NOW()`,
      [platzhalter_name.trim()]
    ).catch(() => {})
  }

  // Status-Tracking: Zeitstempel + User setzen wenn Status sich ändert
  if (status && status !== oldStatus && TRACKED_STATUSES.includes(status)) {
    // Whitelist geprüft — sicher für Column-Name-Interpolation
    await pool.query(
      `UPDATE autorenplan_einsaetze SET ${status}_am = NOW(), ${status}_von = $1 WHERE id = $2`,
      [uname(req), req.params.id]
    ).catch(() => {})
    // Frischen Datensatz mit Tracking-Feldern zurückgeben
    const fresh = await pool.query('SELECT * FROM autorenplan_einsaetze WHERE id = $1', [req.params.id])
    if (fresh.rows.length) return res.json({ einsatz: fresh.rows[0] })
  }

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

  const ids = futures.rows.map((f: any) => f.id)
  const autoren = await pool.query(
    'SELECT * FROM autorenplan_future_autoren WHERE future_id = ANY($1) ORDER BY phase, erstellt_am',
    [ids]
  )
  const autorenMap: Record<string, any[]> = {}
  for (const a of autoren.rows) {
    if (!autorenMap[a.future_id]) autorenMap[a.future_id] = []
    autorenMap[a.future_id].push(a)
  }

  res.json({
    futures: futures.rows.map((f: any) => ({ ...f, autoren: autorenMap[f.id] || [] })),
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
       titel      = COALESCE($1, titel),
       schreib_von = COALESCE($2, schreib_von),
       schreib_bis = COALESCE($3, schreib_bis),
       edit_von   = $4, edit_bis = $5, notiz = $6
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
       status           = COALESCE($1, status),
       ist_homeoffice   = COALESCE($2, ist_homeoffice),
       notiz            = $3,
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

// ── Platzhalter-Cache ──────────────────────────────────────────────────────────

// GET /api/autorenplan/platzhalter-cache?q=
router.get('/platzhalter-cache', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  const { q } = req.query as Record<string, string>
  if (!q || q.trim().length < 1) return res.json({ names: [] })
  const rows = await pool.query(
    `SELECT name FROM autorenplan_platzhalter_cache
     WHERE name ILIKE $1
     ORDER BY used_count DESC, last_used_at DESC
     LIMIT 8`,
    [`%${q.trim()}%`]
  )
  res.json({ names: rows.rows.map((r: any) => r.name) })
})

// GET /api/autorenplan/platzhalter-cache/list (Admin: alle Einträge)
router.get('/platzhalter-cache/list', async (req: any, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  const roles = req.user?.roles || [req.user?.role]
  const isAdmin = ['superadmin', 'geschaeftsfuehrung', 'herstellungsleitung'].some((r: string) => roles.includes(r))
  if (!isAdmin) return res.status(403).json({ error: 'Keine Berechtigung' })
  const rows = await pool.query(
    'SELECT id, name, used_count, last_used_at FROM autorenplan_platzhalter_cache ORDER BY used_count DESC, last_used_at DESC'
  )
  res.json({ entries: rows.rows, total: rows.rowCount })
})

// DELETE /api/autorenplan/platzhalter-cache (Admin: gesamten Cache leeren)
router.delete('/platzhalter-cache', async (req: any, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  const roles = req.user?.roles || [req.user?.role]
  const isAdmin = ['superadmin', 'geschaeftsfuehrung', 'herstellungsleitung'].some((r: string) => roles.includes(r))
  if (!isAdmin) return res.status(403).json({ error: 'Keine Berechtigung' })
  const result = await pool.query('DELETE FROM autorenplan_platzhalter_cache')
  res.json({ ok: true, deleted: result.rowCount })
})

// DELETE /api/autorenplan/platzhalter-cache/:id (Admin: einzelnen Eintrag löschen)
router.delete('/platzhalter-cache/:id', async (req: any, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  const roles = req.user?.roles || [req.user?.role]
  const isAdmin = ['superadmin', 'geschaeftsfuehrung', 'herstellungsleitung'].some((r: string) => roles.includes(r))
  if (!isAdmin) return res.status(403).json({ error: 'Keine Berechtigung' })
  await pool.query('DELETE FROM autorenplan_platzhalter_cache WHERE id = $1', [req.params.id])
  res.json({ ok: true })
})

// ══════════════════════════════════════════════════════════════════════════════
// Globale Gagenkategorien (v99)
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/autorenplan/gage-kategorien
router.get('/gage-kategorien', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, label, kat_nr, sortierung FROM autorenplan_gage_kategorien ORDER BY kat_nr NULLS LAST, sortierung, erstellt_am'
    )
    res.json({ gage_kategorien: rows })
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

// POST /api/autorenplan/gage-kategorien
router.post('/gage-kategorien', async (req, res) => {
  const { label, kat_nr } = req.body
  if (!label?.trim()) return res.status(400).json({ error: 'label erforderlich' })
  try {
    const { rows } = await pool.query(
      `INSERT INTO autorenplan_gage_kategorien (label, kat_nr)
       VALUES ($1, $2) RETURNING id, label, kat_nr, sortierung`,
      [label.trim(), kat_nr ?? null]
    )
    res.status(201).json(rows[0])
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

// PUT /api/autorenplan/gage-kategorien/:id
router.put('/gage-kategorien/:id', async (req, res) => {
  const { label, kat_nr } = req.body
  try {
    const { rows } = await pool.query(
      `UPDATE autorenplan_gage_kategorien SET
         label           = COALESCE($1, label),
         kat_nr          = $2,
         aktualisiert_am = NOW()
       WHERE id = $3 RETURNING id, label, kat_nr, sortierung`,
      [label ?? null, kat_nr ?? null, req.params.id]
    )
    if (!rows[0]) return res.status(404).json({ error: 'Nicht gefunden' })
    res.json(rows[0])
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

// DELETE /api/autorenplan/gage-kategorien/:id
router.delete('/gage-kategorien/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM autorenplan_gage_kategorien WHERE id = $1', [req.params.id])
    res.status(204).send()
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

// ══════════════════════════════════════════════════════════════════════════════
// Pausenwochen (v99)
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/autorenplan/pausenwochen?produktion_db_id=X
router.get('/pausenwochen', async (req, res) => {
  const { produktion_db_id } = req.query
  if (!produktion_db_id) return res.status(400).json({ error: 'produktion_db_id erforderlich' })
  try {
    const { rows } = await pool.query(
      'SELECT * FROM autorenplan_pausenwochen WHERE produktion_db_id = $1 ORDER BY woche_von',
      [produktion_db_id]
    )
    res.json({ pausenwochen: rows })
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

// POST /api/autorenplan/pausenwochen (toggle: upsert or delete)
router.post('/pausenwochen', async (req: any, res) => {
  const { produktion_db_id, woche_von, notiz } = req.body
  if (!produktion_db_id || !woche_von) return res.status(400).json({ error: 'produktion_db_id und woche_von erforderlich' })
  try {
    const { rows } = await pool.query(
      `INSERT INTO autorenplan_pausenwochen (produktion_db_id, woche_von, notiz, erstellt_von)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (produktion_db_id, woche_von) DO UPDATE SET notiz = EXCLUDED.notiz
       RETURNING *`,
      [produktion_db_id, woche_von, notiz ?? null, req.user?.name ?? null]
    )
    res.status(201).json(rows[0])
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

// DELETE /api/autorenplan/pausenwochen/:id
router.delete('/pausenwochen/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM autorenplan_pausenwochen WHERE id = $1', [req.params.id])
    res.status(204).send()
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

export { router as autorenplanRouter }
