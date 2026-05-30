import { Router } from 'express'
import { pool } from '../db'
import { authMiddleware } from '../auth'
import { getStimmungen, ensureDefaultStimmungen } from './dk-access'

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
  spieltag_inkonsistent:     { enabled: true,  auto: false },
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

async function runChecks(szeneId: string, onlyAuto: boolean, checksOverride?: string[] | null): Promise<CheckResult[]> {
  const results: CheckResult[] = []

  // Load scene + production info
  const sceneRes = await pool.query<any>(`
    SELECT ds.id, ds.scene_identity_id, ds.werkstufe_id, ds.ort_name, ds.int_ext,
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
  // If checksOverride provided → only run listed checks (ignores DK-Settings enabled/auto)
  const run = (key: string) => {
    if (checksOverride) return checksOverride.includes(key)
    return cfg[key]?.enabled && (!onlyAuto || cfg[key]?.auto)
  }

  // ── 1. Motiv leer ────────────────────────────────────────────────────────
  if (run('motiv_leer')) {
    if (!s.ort_name?.trim()) {
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
  if (run('duplikat_motiv') && s.ort_name?.trim() && s.folge_nummer != null) {
    const dupRes = await pool.query<any>(`
      SELECT ds.scene_nummer
      FROM dokument_szenen ds
      JOIN werkstufen w ON w.id = ds.werkstufe_id
      JOIN folgen f ON f.id = w.folge_id
      WHERE ds.werkstufe_id = $1
        AND f.folge_nummer = $2
        AND ds.ort_name = $3
        AND ds.int_ext IS NOT DISTINCT FROM $4
        AND ds.tageszeit IS NOT DISTINCT FROM $5
        AND ds.id != $6
        AND ds.geloescht IS NOT TRUE
    `, [s.werkstufe_id, s.folge_nummer, s.ort_name, s.int_ext, s.tageszeit, szeneId])

    if (dupRes.rows.length > 0) {
      const nrs = dupRes.rows.map((r: any) => r.scene_nummer).filter(Boolean).join(', ')
      const motif = `${(s.int_ext ?? '?').toUpperCase()}. ${s.ort_name} - ${s.tageszeit ?? '?'}`
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

// POST /api/checks/werkstufe/:id/batch — run checks for all scenes in a werkstufe
// Body: { checks_override?: string[] } — if provided, only run those check types
router.post('/werkstufe/:id/batch', async (req, res) => {
  try {
    const werkstufId = req.params.id
    const checksOverride: string[] | null = Array.isArray(req.body?.checks_override) ? req.body.checks_override : null
    const szenenRes = await pool.query<any>(
      `SELECT id FROM dokument_szenen WHERE werkstufe_id = $1 AND geloescht IS NOT TRUE`,
      [werkstufId]
    )
    let total = 0
    for (const row of szenenRes.rows) {
      const results = await runChecks(row.id, false, checksOverride)
      await persistResults(row.id, werkstufId, results)
      total += results.length
    }
    // If spieltag_inkonsistent in checks_override (or no override), run cross-Folgen spieltag check too
    const runSpieltagCross = !checksOverride || checksOverride.includes('spieltag_inkonsistent')
    if (runSpieltagCross) {
      // Get produktion_id from werkstufe
      const prodRes = await pool.query<any>(
        `SELECT si.produktion_id FROM dokument_szenen ds
         JOIN scene_identities si ON si.id = ds.scene_identity_id
         WHERE ds.werkstufe_id = $1 LIMIT 1`,
        [werkstufId]
      )
      if (prodRes.rows[0]) {
        try {
          await runSpieltagCheck(prodRes.rows[0].produktion_id)
        } catch { /* non-fatal */ }
      }
    }
    res.json({ ok: true, scenes_checked: szenenRes.rows.length, total_issues: total })
  } catch (err) {
    console.error('checks batch error:', err)
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/checks/config/:produktionId — merged check config for a production
router.get('/config/:produktionId', async (req, res) => {
  try {
    const cfg = await getCheckConfig(req.params.produktionId)
    res.json(cfg)
  } catch (err) {
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

// ── Spieltag-Check (cross-Folgen) ─────────────────────────────────────────────
// Lädt alle Folgen einer Produktion, nimmt die beste Werkstufe pro Folge,
// und prüft ob spieltag-Werte mit der konfigurierten Stimmungs-Reihenfolge übereinstimmen.

async function getBestWerkstufe(folgeId: number): Promise<string | null> {
  // Beste Werkstufe: drehbuch > storyline > andere, dann höchste version_nummer
  const { rows } = await pool.query<any>(`
    SELECT id FROM werkstufen
    WHERE folge_id = $1 AND abgegeben IS NOT TRUE
    ORDER BY
      CASE typ WHEN 'drehbuch' THEN 0 WHEN 'storyline' THEN 1 ELSE 2 END,
      version_nummer DESC
    LIMIT 1
  `, [folgeId])
  return rows[0]?.id ?? null
}

async function runSpieltagCheck(produktionId: string): Promise<{
  issues: Array<{ szene_id: string; werkstufe_id: string; meldung: string; expected: number | null; actual: number | null }>
  total_scenes: number
}> {
  const stimmungen = await getStimmungen(produktionId)
  const maxPosition = stimmungen.length > 0 ? Math.max(...stimmungen.map((s: any) => s.position)) : 2
  const lastStimmungName = stimmungen.find((s: any) => s.position === maxPosition)?.name ?? 'NACHT'

  // Alle Folgen der Produktion
  const { rows: folgen } = await pool.query<any>(
    `SELECT f.id, f.folge_nummer FROM folgen f
     JOIN produktionen p ON p.id = f.produktion_id
     WHERE p.id = $1 ORDER BY f.folge_nummer ASC`,
    [produktionId]
  )

  // Szenen aller besten Werkstufen sammeln
  const allSzenen: any[] = []
  for (const folge of folgen) {
    const wsId = await getBestWerkstufe(folge.id)
    if (!wsId) continue
    const { rows: szenen } = await pool.query<any>(`
      SELECT id, werkstufe_id, scene_nummer, tageszeit, spieltag, sort_order
      FROM dokument_szenen
      WHERE werkstufe_id = $1 AND geloescht IS NOT TRUE
      ORDER BY sort_order ASC
    `, [wsId])
    for (const s of szenen) allSzenen.push({ ...s, folge_nummer: folge.folge_nummer })
  }

  const issues: Array<{ szene_id: string; werkstufe_id: string; meldung: string; expected: number | null; actual: number | null }> = []
  let expectedSpieltag: number | null = null

  for (let i = 0; i < allSzenen.length; i++) {
    const curr = allSzenen[i]
    const prev = i > 0 ? allSzenen[i - 1] : null

    if (i === 0) {
      // Erste Szene: spieltag sollte 1 sein (oder gesetzt sein)
      expectedSpieltag = curr.spieltag ?? 1
    } else if (prev) {
      const prevIsLast = prev.tageszeit === lastStimmungName
      const currIsFirst = curr.tageszeit !== lastStimmungName
      const isNewDay = prevIsLast && currIsFirst

      // Stimmungs-Position-basierte Logik für Grenzfälle
      const prevPos = stimmungen.find((s: any) => s.name === prev.tageszeit)?.position ?? 0
      const currPos = stimmungen.find((s: any) => s.name === curr.tageszeit)?.position ?? 0
      const positionBasedNewDay = prevPos >= maxPosition && currPos < maxPosition

      if (isNewDay || positionBasedNewDay) {
        expectedSpieltag = (expectedSpieltag ?? 1) + 1
      }
    }

    if (curr.spieltag != null && expectedSpieltag != null && curr.spieltag !== expectedSpieltag) {
      const prevInfo = prev ? `Sz.${prev.scene_nummer} (${prev.tageszeit ?? '?'}) → ` : ''
      issues.push({
        szene_id: curr.id,
        werkstufe_id: curr.werkstufe_id,
        meldung: `Spieltag SP${expectedSpieltag} erwartet — hat SP${curr.spieltag}. ${prevInfo}Sz.${curr.scene_nummer} (${curr.tageszeit ?? '?'})`,
        expected: expectedSpieltag,
        actual: curr.spieltag,
      })
    }

    // expectedSpieltag an tatsächlichem Wert ausrichten um Folgefehler zu vermeiden
    if (curr.spieltag != null) expectedSpieltag = curr.spieltag
  }

  return { issues, total_scenes: allSzenen.length }
}

// POST /api/checks/produktion/:pid/spieltag — Cross-Folgen Spieltag-Check
router.post('/produktion/:pid/spieltag', async (req: any, res) => {
  try {
    const { pid } = req.params
    const { issues, total_scenes } = await runSpieltagCheck(pid)

    // Ergebnisse persistieren
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      // Alte spieltag-Ergebnisse für diese Produktion löschen
      await client.query(`
        DELETE FROM szenen_check_ergebnisse
        WHERE check_typ = 'spieltag_inkonsistent'
          AND dokument_szene_id IN (
            SELECT ds.id FROM dokument_szenen ds
            JOIN werkstufen w ON w.id = ds.werkstufe_id
            JOIN folgen f ON f.id = w.folge_id
            JOIN produktionen p ON p.id = f.produktion_id
            WHERE p.id = $1
          )
      `, [pid])
      for (const issue of issues) {
        await client.query(
          `INSERT INTO szenen_check_ergebnisse (dokument_szene_id, werkstufe_id, check_typ, schwere, meldung)
           VALUES ($1, $2, 'spieltag_inkonsistent', 'hinweis', $3)`,
          [issue.szene_id, issue.werkstufe_id, issue.meldung]
        )
      }
      await client.query('COMMIT')
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    } finally {
      client.release()
    }

    res.json({ ok: true, total_scenes, issues_found: issues.length, issues })
  } catch (err) {
    console.error('spieltag-check error:', err)
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/checks/produktion/:pid/spieltag/fix — Auto-Korrektur mit Bestätigung
router.post('/produktion/:pid/spieltag/fix', async (req: any, res) => {
  try {
    const { pid } = req.params
    const confirm = req.query.confirm === 'true'

    const stimmungen = await getStimmungen(pid)
    const maxPosition = stimmungen.length > 0 ? Math.max(...stimmungen.map((s: any) => s.position)) : 2
    const lastStimmungName = stimmungen.find((s: any) => s.name === stimmungen.find((x: any) => x.position === maxPosition)?.name)?.name ?? 'NACHT'

    const { rows: folgen } = await pool.query<any>(
      `SELECT f.id, f.folge_nummer FROM folgen f
       JOIN produktionen p ON p.id = f.produktion_id
       WHERE p.id = $1 ORDER BY f.folge_nummer ASC`,
      [pid]
    )

    const allSzenen: any[] = []
    for (const folge of folgen) {
      const wsId = await getBestWerkstufe(folge.id)
      if (!wsId) continue
      const { rows } = await pool.query<any>(`
        SELECT id, werkstufe_id, tageszeit, spieltag, sort_order, scene_nummer
        FROM dokument_szenen
        WHERE werkstufe_id = $1 AND geloescht IS NOT TRUE
        ORDER BY sort_order ASC
      `, [wsId])
      for (const s of rows) allSzenen.push({ ...s, folge_nummer: folge.folge_nummer })
    }

    // Korrekten Spieltag berechnen
    const corrections: Array<{ id: string; werkstufe_id: string; new_spieltag: number }> = []
    let expectedSpieltag = 1

    for (let i = 0; i < allSzenen.length; i++) {
      const curr = allSzenen[i]
      const prev = i > 0 ? allSzenen[i - 1] : null

      if (i === 0) {
        expectedSpieltag = curr.spieltag ?? 1
      } else if (prev) {
        const prevPos = stimmungen.find((s: any) => s.name === prev.tageszeit)?.position ?? 0
        const currPos = stimmungen.find((s: any) => s.name === curr.tageszeit)?.position ?? 0
        if (prevPos >= maxPosition && currPos < maxPosition) {
          expectedSpieltag++
        }
      }

      if (curr.spieltag != null && curr.spieltag !== expectedSpieltag) {
        corrections.push({ id: curr.id, werkstufe_id: curr.werkstufe_id, new_spieltag: expectedSpieltag })
      }
    }

    if (!confirm) {
      // Nur Scope zurückgeben
      const folgenAffected = new Set(corrections.map(c => c.werkstufe_id)).size
      return res.json({
        scenes_affected: corrections.length,
        folgen_affected: folgenAffected,
        total_scenes: allSzenen.length,
        confirmed: false,
      })
    }

    // Korrekturen anwenden
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      for (const c of corrections) {
        await client.query(
          `UPDATE dokument_szenen SET spieltag = $1 WHERE id = $2`,
          [c.new_spieltag, c.id]
        )
      }
      // Check-Ergebnisse löschen
      await client.query(`
        DELETE FROM szenen_check_ergebnisse
        WHERE check_typ = 'spieltag_inkonsistent'
          AND dokument_szene_id = ANY($1::uuid[])
      `, [corrections.map(c => c.id)])
      await client.query('COMMIT')
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    } finally {
      client.release()
    }

    res.json({ ok: true, scenes_corrected: corrections.length, confirmed: true })
  } catch (err) {
    console.error('spieltag-fix error:', err)
    res.status(500).json({ error: String(err) })
  }
})

export { DEFAULT_CONFIG as checkDefaultConfig, router as checksRouter }
