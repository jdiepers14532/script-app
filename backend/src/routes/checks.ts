import { Router } from 'express'
import { pool } from '../db'
import { authMiddleware } from '../auth'

const router = Router()
router.use(authMiddleware)

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractText(node: any): string {
  if (typeof node.text === 'string') return node.text
  if (Array.isArray(node.content)) return node.content.map(extractText).join(' ')
  return ''
}

type Schwere = 'hinweis' | 'fehler'
interface CheckResult {
  check_typ: string
  schwere: Schwere
  meldung: string
}

// Default check config (all auto-checks on, KI-checks off)
const DEFAULT_CONFIG: Record<string, { enabled: boolean; auto: boolean }> = {
  motiv_leer:                { enabled: true,  auto: true  },
  rollen_konsistenz:         { enabled: true,  auto: true  },
  sondertyp_wechselschnitt:  { enabled: true,  auto: true  },
  strang_zuordnung:          { enabled: true,  auto: true  },
  duplikat_motiv:            { enabled: true,  auto: true  },
  stoppzeit_plausibilitaet:  { enabled: false, auto: false },
  // KI-Checks — immer auto:false
  oneliner_qualitaet:        { enabled: false, auto: false },
}

async function getCheckConfig(produktionId: string) {
  const res = await pool.query(
    `SELECT value FROM production_app_settings WHERE production_id = $1 AND key = 'drehbuch_checks'`,
    [produktionId]
  )
  if (!res.rows[0]) return { ...DEFAULT_CONFIG }
  try {
    const saved = JSON.parse(res.rows[0].value)
    // Merge with defaults so new checks get their defaults
    return { ...DEFAULT_CONFIG, ...saved }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

// ── Core check runner ─────────────────────────────────────────────────────────

async function runChecks(szeneId: string, onlyAuto: boolean): Promise<CheckResult[]> {
  const results: CheckResult[] = []

  // Load scene + production info
  const sceneRes = await pool.query<any>(`
    SELECT ds.id, ds.scene_identity_id, ds.werkstufe_id, ds.motiv, ds.int_ext,
           ds.tageszeit, ds.stoppzeit_sek, ds.sondertyp, ds.content, ds.format,
           ds.scene_nummer, si.produktion_id,
           (SELECT f.folge_nummer
            FROM werkstufen w JOIN folgen f ON f.id = w.folge_id
            WHERE w.id = ds.werkstufe_id LIMIT 1) AS folge_nummer
    FROM dokument_szenen ds
    JOIN scene_identities si ON si.id = ds.scene_identity_id
    WHERE ds.id = $1 AND ds.geloescht IS NOT TRUE
  `, [szeneId])

  if (!sceneRes.rows[0]) return results
  const s = sceneRes.rows[0]
  const content: any[] = Array.isArray(s.content) ? s.content : []
  const plaintext = content.map(extractText).join(' ')
  const plaintextUpper = plaintext.toUpperCase()

  const cfg = await getCheckConfig(s.produktion_id)

  // Helper: should this check run?
  const run = (key: string) =>
    cfg[key]?.enabled && (!onlyAuto || cfg[key]?.auto)

  // ── 1. Motiv leer ────────────────────────────────────────────────────────
  if (run('motiv_leer')) {
    if (!s.motiv?.trim()) {
      results.push({ check_typ: 'motiv_leer', schwere: 'hinweis', meldung: 'Kein Motiv angegeben' })
    }
  }

  // ── 2. Rollen-Konsistenz ─────────────────────────────────────────────────
  if (run('rollen_konsistenz')) {
    const [charsRes, sceneCharsRes] = await Promise.all([
      pool.query<any>(`
        SELECT c.id, c.name
        FROM characters c
        JOIN character_productions cp ON cp.character_id = c.id
        WHERE cp.produktion_id = $1
      `, [s.produktion_id]),
      pool.query<any>(`
        SELECT sc.character_id, c.name
        FROM scene_characters sc
        JOIN characters c ON c.id = sc.character_id
        WHERE sc.scene_identity_id = $1
      `, [s.scene_identity_id]),
    ])

    const allChars = charsRes.rows
    const sceneCharIds = new Set<string>(sceneCharsRes.rows.map((r: any) => String(r.character_id)))

    // Check which production characters appear UPPERCASE in text
    const foundInText = allChars.filter((c: any) => {
      const upper = c.name.toUpperCase()
      const idx = plaintextUpper.indexOf(upper)
      if (idx === -1) return false
      // Word-boundary: char before and after must be non-letter
      const before = idx > 0 ? plaintextUpper[idx - 1] : ' '
      const after = idx + upper.length < plaintextUpper.length ? plaintextUpper[idx + upper.length] : ' '
      return /[^A-ZÄÖÜa-zäöü]/.test(before) && /[^A-ZÄÖÜa-zäöü]/.test(after)
    })
    const foundInTextIds = new Set<string>(foundInText.map((c: any) => String(c.id)))

    const missing = foundInText.filter((c: any) => !sceneCharIds.has(String(c.id)))
    const unused = sceneCharsRes.rows.filter((sc: any) => !foundInTextIds.has(String(sc.character_id)))

    if (missing.length > 0) {
      results.push({
        check_typ: 'rollen_konsistenz',
        schwere: 'hinweis',
        meldung: `${missing.map((c: any) => c.name.toUpperCase()).join(', ')} im Text, aber nicht in Rollen eingetragen`,
      })
    }
    if (unused.length > 0) {
      results.push({
        check_typ: 'rollen_konsistenz',
        schwere: 'hinweis',
        meldung: `${unused.map((sc: any) => sc.name.toUpperCase()).join(', ')} in Rollen eingetragen, aber nicht im Text`,
      })
    }
  }

  // ── 3. Sondertyp / Wechselschnitt ───────────────────────────────────────
  if (run('sondertyp_wechselschnitt')) {
    if (s.sondertyp === 'wechselschnitt') {
      const partRes = await pool.query<any>(
        `SELECT COUNT(*) FROM wechselschnitt_partner WHERE dokument_szene_id = $1`,
        [szeneId]
      )
      if (parseInt(partRes.rows[0].count) === 0) {
        results.push({
          check_typ: 'sondertyp_wechselschnitt',
          schwere: 'hinweis',
          meldung: 'Wechselschnitt: kein Telefonpartner angegeben',
        })
      }
    } else if (!s.sondertyp) {
      // "WECHSELSCHNITT" or "WS:" in text but sondertyp not set
      if (plaintextUpper.includes('WECHSELSCHNITT') || plaintext.includes('WS:')) {
        results.push({
          check_typ: 'sondertyp_wechselschnitt',
          schwere: 'hinweis',
          meldung: 'Text enthält "WECHSELSCHNITT" — Sondertyp nicht gesetzt',
        })
      }
    }
  }

  // ── 4. Strang-Zuordnung ──────────────────────────────────────────────────
  if (run('strang_zuordnung')) {
    const strangCountRes = await pool.query<any>(
      `SELECT COUNT(*) FROM straenge WHERE produktion_id = $1`,
      [s.produktion_id]
    )
    if (parseInt(strangCountRes.rows[0].count) > 0) {
      const assignRes = await pool.query<any>(
        `SELECT COUNT(*) FROM dokument_szenen_straenge WHERE dokument_szene_id = $1`,
        [szeneId]
      )
      if (parseInt(assignRes.rows[0].count) === 0) {
        results.push({
          check_typ: 'strang_zuordnung',
          schwere: 'hinweis',
          meldung: 'Szene ist keinem Story-Strang zugeordnet',
        })
      }
    }
  }

  // ── 5. Duplikat-Motiv ────────────────────────────────────────────────────
  if (run('duplikat_motiv') && s.motiv?.trim() && s.folge_nummer != null) {
    const dupRes = await pool.query<any>(`
      SELECT ds.scene_nummer
      FROM dokument_szenen ds
      JOIN werkstufen w ON w.id = ds.werkstufe_id
      JOIN folgen f ON f.id = w.folge_id
      WHERE ds.werkstufe_id = $1
        AND f.folge_nummer = $2
        AND ds.motiv = $3
        AND ds.int_ext IS NOT DISTINCT FROM $4
        AND ds.tageszeit IS NOT DISTINCT FROM $5
        AND ds.id != $6
        AND ds.geloescht IS NOT TRUE
    `, [s.werkstufe_id, s.folge_nummer, s.motiv, s.int_ext, s.tageszeit, szeneId])

    if (dupRes.rows.length > 0) {
      const nrs = dupRes.rows.map((r: any) => r.scene_nummer).filter(Boolean).join(', ')
      const motif = `${(s.int_ext ?? '?').toUpperCase()}. ${s.motiv} - ${s.tageszeit ?? '?'}`
      results.push({
        check_typ: 'duplikat_motiv',
        schwere: 'hinweis',
        meldung: `Motiv "${motif}" auch in Sz. ${nrs || '?'} dieser Folge`,
      })
    }
  }

  // ── 6. Stoppzeit-Plausibilität ───────────────────────────────────────────
  if (run('stoppzeit_plausibilitaet') && s.format === 'drehbuch' && s.stoppzeit_sek != null) {
    const textLen = plaintext.replace(/\s+/g, ' ').trim().length
    if (textLen > 200) {
      const estimatedSek = (textLen / 1800) * 60
      const ratio = s.stoppzeit_sek / estimatedSek
      if (ratio < 0.25 || ratio > 4) {
        const actual = Math.round(s.stoppzeit_sek / 60)
        const estimated = Math.round(estimatedSek / 60)
        results.push({
          check_typ: 'stoppzeit_plausibilitaet',
          schwere: 'hinweis',
          meldung: `Stoppzeit ${actual} Min. scheint unplausibel für ~${estimated} Min. Textlänge`,
        })
      }
    }
  }

  return results
}

// ── Persist results ───────────────────────────────────────────────────────────

async function persistResults(szeneId: string, werkstufeId: string, results: CheckResult[]) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `DELETE FROM szenen_check_ergebnisse WHERE dokument_szene_id = $1`,
      [szeneId]
    )
    for (const r of results) {
      await client.query(
        `INSERT INTO szenen_check_ergebnisse (dokument_szene_id, werkstufe_id, check_typ, schwere, meldung)
         VALUES ($1, $2, $3, $4, $5)`,
        [szeneId, werkstufeId, r.check_typ, r.schwere, r.meldung]
      )
    }
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

// ── Endpoints ─────────────────────────────────────────────────────────────────

// POST /api/checks/szene/:id/auto — triggered by autosave
router.post('/szene/:id/auto', async (req, res) => {
  try {
    const szeneId = req.params.id
    const results = await runChecks(szeneId, true)

    // Get werkstufe_id for persistence
    const ws = await pool.query<any>(
      `SELECT werkstufe_id FROM dokument_szenen WHERE id = $1`,
      [szeneId]
    )
    if (ws.rows[0]) {
      await persistResults(szeneId, ws.rows[0].werkstufe_id, results)
    }
    res.json({ ok: true, issues: results.length, results })
  } catch (err) {
    console.error('checks auto error:', err)
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/checks/szene/:id/manual — triggered manually (all enabled checks incl. KI)
router.post('/szene/:id/manual', async (req, res) => {
  try {
    const szeneId = req.params.id
    const results = await runChecks(szeneId, false)

    const ws = await pool.query<any>(
      `SELECT werkstufe_id FROM dokument_szenen WHERE id = $1`,
      [szeneId]
    )
    if (ws.rows[0]) {
      await persistResults(szeneId, ws.rows[0].werkstufe_id, results)
    }
    res.json({ ok: true, issues: results.length, results })
  } catch (err) {
    console.error('checks manual error:', err)
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/checks/werkstufe/:id/batch — run auto-checks for all scenes in a werkstufe
router.post('/werkstufe/:id/batch', async (req, res) => {
  try {
    const werkstufId = req.params.id
    const szenenRes = await pool.query<any>(
      `SELECT id FROM dokument_szenen WHERE werkstufe_id = $1 AND geloescht IS NOT TRUE`,
      [werkstufId]
    )
    let total = 0
    for (const row of szenenRes.rows) {
      const results = await runChecks(row.id, false)
      await persistResults(row.id, werkstufId, results)
      total += results.length
    }
    res.json({ ok: true, scenes_checked: szenenRes.rows.length, total_issues: total })
  } catch (err) {
    console.error('checks batch error:', err)
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/checks/szene/:id — get persisted results for a scene
router.get('/szene/:id', async (req, res) => {
  try {
    const { rows } = await pool.query<any>(
      `SELECT id, check_typ, schwere, meldung, behoben, erstellt_am
       FROM szenen_check_ergebnisse
       WHERE dokument_szene_id = $1
       ORDER BY schwere DESC, check_typ`,
      [req.params.id]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/checks/werkstufe/:id/badges — badge counts per scene for SceneList
router.get('/werkstufe/:id/badges', async (req, res) => {
  try {
    const { rows } = await pool.query<any>(`
      SELECT dokument_szene_id AS szene_id, COUNT(*) AS issue_count,
             bool_or(schwere = 'fehler') AS has_fehler
      FROM szenen_check_ergebnisse
      WHERE werkstufe_id = $1 AND behoben = FALSE
      GROUP BY dokument_szene_id
    `, [req.params.id])
    // Return as { [szene_id]: { count, has_fehler, messages } }
    const badges: Record<string, { count: number; has_fehler: boolean }> = {}
    for (const r of rows) {
      badges[r.szene_id] = { count: parseInt(r.issue_count), has_fehler: r.has_fehler }
    }
    res.json(badges)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PATCH /api/checks/:id/behoben — mark a single check result as resolved
router.patch('/:id/behoben', async (req, res) => {
  try {
    await pool.query(
      `UPDATE szenen_check_ergebnisse SET behoben = TRUE WHERE id = $1`,
      [req.params.id]
    )
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export { DEFAULT_CONFIG as checkDefaultConfig, router as checksRouter }
