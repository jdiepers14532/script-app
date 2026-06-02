import { Router } from 'express'
import { pool } from '../db'
import { authMiddleware } from '../auth'
import { getStimmungen, ensureDefaultStimmungen } from './dk-access'
import { getKiSetting, callProvider, applyPromptTemplate, effectivePrompt, effectivePromptForProduction } from './ki'

const router = Router()
router.use(authMiddleware)

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractText(node: any): string {
  if (typeof node.text === 'string') return node.text
  if (Array.isArray(node.content)) return node.content.map(extractText).join(' ')
  return ''
}

function isCharacterNode(node: any): boolean {
  if (node.type === 'screenplay_element') return node.attrs?.element_type === 'character'
  if (node.type === 'absatz') return node.attrs?.format_name === 'Character'
  return false
}

function isDialogueNode(node: any): boolean {
  if (node.type === 'screenplay_element') {
    return node.attrs?.element_type === 'dialogue' || node.attrs?.element_type === 'parenthetical'
  }
  if (node.type === 'absatz') {
    return node.attrs?.format_name === 'Dialogue' || node.attrs?.format_name === 'Parenthetical'
  }
  return false
}

const NT_SUFFIX_PATTERNS = [
  { pattern: /(?:^|\s)\(?\s*one[-\s]?way\s*\)?$/i, canonical: '(ONE-WAY)' },
  { pattern: /(?:^|\s)\(?\s*v\.?o\.?\s*\)?$/i, canonical: '(VO)' },
  { pattern: /(?:^|\s)\(?\s*n\.?t\.?\s*\)?$/i, canonical: '(NT)' },
  { pattern: /(?:^|\s)\(?\s*(?:off|o\.s\.?)\s*\)?$/i, canonical: '(OFF)' },
] as const

function parseNtSuffix(text: string): { name: string; suffix: string | null } {
  for (const { pattern, canonical } of NT_SUFFIX_PATTERNS) {
    if (pattern.test(text)) return { name: text.replace(pattern, '').trim(), suffix: canonical as string }
  }
  return { name: text, suffix: null }
}

type Schwere = 'blocker' | 'warnung' | 'hinweis'
interface CheckResult {
  check_typ: string
  schwere: Schwere
  meldung: string
  meta?: any
}

// Four orthogonal axes per check:
//   enabled     — check runs at all
//   auto        — runs on autosave/batch; false = only on-demand or at lock time
//   lock_gating — production-level lock policy: blocker | warnung | off
//   autofix_mode — how a fix is presented: silent | 1klick | diff_bestaetigen | null
export type CheckConfigEntry = {
  enabled: boolean
  auto: boolean
  lock_gating: 'blocker' | 'warnung' | 'off'
  autofix_mode?: 'silent' | '1klick' | 'diff_bestaetigen' | null
}

// Default check config (all auto-checks on, KI-checks off)
const DEFAULT_CONFIG: Record<string, CheckConfigEntry> = {
  motiv_leer:                { enabled: true,  auto: true,  lock_gating: 'warnung' },
  rollen_konsistenz:         { enabled: true,  auto: true,  lock_gating: 'warnung', autofix_mode: '1klick' },
  sondertyp_wechselschnitt:  { enabled: true,  auto: true,  lock_gating: 'warnung' },
  strang_zuordnung:          { enabled: true,  auto: true,  lock_gating: 'off' },
  duplikat_motiv:            { enabled: true,  auto: true,  lock_gating: 'warnung' },
  fehlender_dialog:          { enabled: true,  auto: true,  lock_gating: 'blocker' },
  stoppzeit_plausibilitaet:  { enabled: false, auto: false, lock_gating: 'warnung' },
  spieltag_inkonsistent:     { enabled: true,  auto: false, lock_gating: 'warnung' },
  nt_verweis:                { enabled: true,  auto: true,  lock_gating: 'off' },
  // KI-Checks — immer auto:false
  oneliner_qualitaet:            { enabled: false, auto: false, lock_gating: 'off' },
  // Phase 2: Vollständiger Katalog
  'szenenkopf.pflichtfelder':        { enabled: true,  auto: true,  lock_gating: 'blocker' },
  'scene.unique_szenennummer':       { enabled: true,  auto: true,  lock_gating: 'blocker' },
  'scene.empty':                     { enabled: true,  auto: true,  lock_gating: 'warnung' },
  'motiv.einheitliche_schreibweise': { enabled: true,  auto: true,  lock_gating: 'warnung', autofix_mode: '1klick' },
  'rolle.einheitliche_schreibweise': { enabled: true,  auto: true,  lock_gating: 'warnung', autofix_mode: '1klick' },
  'dialog.endet_satzzeichen':        { enabled: true,  auto: true,  lock_gating: 'off',     autofix_mode: '1klick' },
  'text.kein_leerzeichen_start':     { enabled: true,  auto: true,  lock_gating: 'off',     autofix_mode: 'silent' },
  leere_bloecke:                     { enabled: true,  auto: true,  lock_gating: 'off',     autofix_mode: 'silent' },
  doppelter_sprecher:                { enabled: true,  auto: true,  lock_gating: 'warnung', autofix_mode: '1klick' },
  seitenzahl_im_bereich:             { enabled: false, auto: false, lock_gating: 'warnung' },
  tageszeit_sequenz:                 { enabled: true,  auto: false, lock_gating: 'warnung' },
  nt_replik_konsistenz:              { enabled: true,  auto: false, lock_gating: 'warnung' },
  dramaturgischer_tag_chronologie:   { enabled: true,  auto: false, lock_gating: 'warnung' },
  etablierungsshot_vorhanden:        { enabled: false, auto: false, lock_gating: 'off' },
  // KI-Checks Phase 3 (disabled by default — KI-Kosten)
  oneliner_vorhanden:                { enabled: false, auto: false, lock_gating: 'off',     autofix_mode: '1klick' },
  spielzeit_uhrzeit:                 { enabled: false, auto: false, lock_gating: 'warnung', autofix_mode: '1klick' },
}

// Reads the 'drehbuch_checks' JSON blob from production_app_settings and merges
// per-check with DEFAULT_CONFIG — saved overrides win, new checks get defaults.
export async function getEffectiveCheckConfig(produktionId: string): Promise<Record<string, CheckConfigEntry>> {
  const res = await pool.query(
    `SELECT value FROM production_app_settings WHERE production_id = $1 AND key = 'drehbuch_checks'`,
    [produktionId]
  )
  if (!res.rows[0]) return { ...DEFAULT_CONFIG }
  try {
    const saved = JSON.parse(res.rows[0].value) as Record<string, Partial<CheckConfigEntry>>
    const merged: Record<string, CheckConfigEntry> = {}
    // Start from DEFAULT_CONFIG entries
    for (const [key, def] of Object.entries(DEFAULT_CONFIG)) {
      merged[key] = saved[key] ? { ...def, ...saved[key] } : { ...def }
    }
    // Include any blob-only keys (future checks stored before code ships)
    for (const [key, overrides] of Object.entries(saved)) {
      if (!merged[key]) {
        merged[key] = { enabled: true, auto: true, lock_gating: 'warnung', ...overrides } as CheckConfigEntry
      }
    }
    return merged
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
           ds.scene_nummer, ds.sort_order, ds.spieltag,
           ds.zusammenfassung, ds.spielzeit, f.produktion_id,
           f.folge_nummer
    FROM dokument_szenen ds
    JOIN scene_identities si ON si.id = ds.scene_identity_id
    JOIN folgen f ON f.id = si.folge_id
    WHERE ds.id = $1 AND ds.geloescht IS NOT TRUE
  `, [szeneId])

  if (!sceneRes.rows[0]) return results
  const s = sceneRes.rows[0]
  const content: any[] = Array.isArray(s.content) ? s.content : []

  // Notiz-Dokumente haben keine Szenenstruktur — keine Checks
  if (s.format === 'notiz') return results

  const plaintext = content.map(extractText).join(' ')
  const plaintextUpper = plaintext.toUpperCase()
  // Für Rollen-Konsistenz: Absatz-Nodes ausschließen (Erwähnung ≠ Auftreten in Szene)
  const plaintextForRollen = content.filter((n: any) => n.type !== 'absatz').map(extractText).join(' ')
  const plaintextForRollenUpper = plaintextForRollen.toUpperCase()

  const cfg = await getEffectiveCheckConfig(s.produktion_id)

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

    // Nur Non-Absatz-Text prüfen: Absatz = Erwähnung/Rede über jmd., keine Szenen-Beteiligung
    const foundInText = allChars.filter((c: any) => {
      const upper = c.name.toUpperCase()
      const idx = plaintextForRollenUpper.indexOf(upper)
      if (idx === -1) return false
      const before = idx > 0 ? plaintextForRollenUpper[idx - 1] : ' '
      const after = idx + upper.length < plaintextForRollenUpper.length ? plaintextForRollenUpper[idx + upper.length] : ' '
      return /[^A-ZÄÖÜa-zäöü]/.test(before) && /[^A-ZÄÖÜa-zäöü]/.test(after)
    })
    const foundInTextIds = new Set<string>(foundInText.map((c: any) => String(c.id)))

    const missing = foundInText.filter((c: any) => !sceneCharIds.has(String(c.id)))
    const unused = sceneCharsRes.rows.filter((sc: any) => !foundInTextIds.has(String(sc.character_id)))

    if (missing.length > 0) {
      results.push({
        check_typ: 'rollen_konsistenz',
        schwere: 'warnung',
        meldung: `${missing.map((c: any) => c.name.toUpperCase()).join(', ')} im Text, aber nicht in Rollen eingetragen`,
        meta: {
          missing_chars: missing.map((c: any) => ({ id: String(c.id), name: c.name })),
          scene_identity_id: s.scene_identity_id,
        },
      })
    }
    if (unused.length > 0) {
      results.push({
        check_typ: 'rollen_konsistenz',
        schwere: 'warnung',
        meldung: `${unused.map((sc: any) => sc.name.toUpperCase()).join(', ')} in Rollen eingetragen, aber nicht im Text`,
        meta: {
          unused_chars: unused.map((sc: any) => ({ id: String(sc.character_id), name: sc.name })),
          scene_identity_id: s.scene_identity_id,
        },
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
    const strangeRes = await pool.query<any>(
      `SELECT id, name, farbe FROM straenge WHERE produktion_id = $1 AND status = 'aktiv' ORDER BY sort_order`,
      [s.produktion_id]
    )
    if (strangeRes.rows.length > 0) {
      const assignRes = await pool.query<any>(
        `SELECT COUNT(*) FROM dokument_szenen_straenge WHERE dokument_szene_id = $1`,
        [szeneId]
      )
      if (parseInt(assignRes.rows[0].count) === 0) {
        // Szenen-Charaktere für Matching laden
        const sceneCharRes = await pool.query<any>(
          `SELECT c.id, c.name FROM scene_characters sc JOIN characters c ON c.id = sc.character_id WHERE sc.scene_identity_id = $1`,
          [s.scene_identity_id]
        )
        const sceneCharNamesUpper = sceneCharRes.rows.map((r: any) => r.name.toUpperCase())
        const zusammenfassungUpper = (s.zusammenfassung ?? '').toUpperCase()

        // Strang-Vorschläge: Strang dessen Charaktere in Rollen, Text oder Zusammenfassung auftauchen
        const vorschlaege: { id: string; name: string; farbe: string }[] = []
        for (const strang of strangeRes.rows) {
          const strangCharsRes = await pool.query<any>(
            `SELECT c.name FROM strang_charaktere sc JOIN characters c ON c.id = sc.character_id WHERE sc.strang_id = $1`,
            [strang.id]
          )
          const strangCharNamesUpper = strangCharsRes.rows.map((r: any) => r.name.toUpperCase())
          const matches = strangCharNamesUpper.some((name: string) =>
            sceneCharNamesUpper.includes(name) ||
            plaintextUpper.includes(name) ||
            zusammenfassungUpper.includes(name)
          )
          if (matches) vorschlaege.push({ id: strang.id, name: strang.name, farbe: strang.farbe })
        }

        results.push({
          check_typ: 'strang_zuordnung',
          schwere: 'hinweis',
          meldung: vorschlaege.length > 0
            ? `Keine Strang-Zuordnung — Vorschlag: ${vorschlaege.map(v => v.name).join(', ')}`
            : 'Szene ist keinem Story-Strang zugeordnet',
          meta: vorschlaege.length > 0 ? { strang_vorschlaege: vorschlaege } : undefined,
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

  // ── 6. Fehlender Dialog ──────────────────────────────────────────────────
  if (run('fehlender_dialog') && s.format !== 'notiz') {
    let replikNr = 0  // lokale Replik-Nummer in dieser Szene (1-basiert, wie ReplikNumberPlugin)
    for (let i = 0; i < content.length; i++) {
      const node = content[i]
      if (!isCharacterNode(node)) continue
      replikNr++
      const charText = extractText(node).trim()
      if (!charText) {
        // Leere Rollenzeile — kein Name eingetragen (erscheint ggf. nur mit Replik-Nr.)
        results.push({
          check_typ: 'fehlender_dialog',
          schwere: 'blocker',
          meldung: `Replik ${replikNr}: Leere Rollenzeile (kein Name eingetragen)`,
          meta: { char_name: '', empty_char: true, node_index: i, replik_nr: replikNr },
        })
        continue
      }
      // Nächsten nicht-leeren Node finden
      let j = i + 1
      while (j < content.length && !extractText(content[j]).trim()) j++
      // Kein Folge-Node oder Folge-Node ist kein Dialog/Parenthetical
      if (j >= content.length || !isDialogueNode(content[j])) {
        results.push({
          check_typ: 'fehlender_dialog',
          schwere: 'blocker',
          meldung: `Replik ${replikNr} (${charText}): Rolle ohne Dialog`,
          meta: { char_name: charText, node_index: i, replik_nr: replikNr },
        })
      }
    }
  }

  // ── 7. Stoppzeit-Plausibilität ───────────────────────────────────────────
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

  // ── 8. Szenenkopf-Pflichtfelder ──────────────────────────────────────────
  if (run('szenenkopf.pflichtfelder') && s.format !== 'notiz') {
    const felder: Array<{ feld: string; label: string }> = [
      { feld: 'int_ext',      label: 'I/A (Innen/Außen)' },
      { feld: 'tageszeit',    label: 'Stimmung/Tageszeit' },
      { feld: 'scene_nummer', label: 'Szenennummer' },
      { feld: 'ort_name',     label: 'Motiv' },
    ]
    for (const { feld, label } of felder) {
      if (!(s as any)[feld]?.trim()) {
        results.push({
          check_typ: 'szenenkopf.pflichtfelder',
          schwere: 'blocker',
          meldung: `${label} fehlt`,
          meta: { feld },
        })
      }
    }
  }

  // ── 9. Eindeutige Szenennummer ───────────────────────────────────────────
  if (run('scene.unique_szenennummer') && s.scene_nummer?.trim()) {
    const dupRes = await pool.query<any>(`
      SELECT id FROM dokument_szenen
      WHERE werkstufe_id = $1 AND scene_nummer = $2 AND id != $3 AND geloescht IS NOT TRUE
    `, [s.werkstufe_id, s.scene_nummer, szeneId])
    if (dupRes.rows.length > 0) {
      results.push({
        check_typ: 'scene.unique_szenennummer',
        schwere: 'blocker',
        meldung: `Szenennummer "${s.scene_nummer}" ist in dieser Werkstufe mehrfach vergeben`,
        meta: { duplicate_ids: dupRes.rows.map((r: any) => r.id) },
      })
    }
  }

  // ── 10. Leere Szene ──────────────────────────────────────────────────────
  // Ausschluss: Wechselschnitt und Stockshot sind by design inhaltsleer
  if (run('scene.empty') && s.format !== 'notiz') {
    const SONDERTYP_LEER = ['wechselschnitt', 'stockshot']
    if (!SONDERTYP_LEER.includes(s.sondertyp)) {
      if (!plaintext.trim()) {
        results.push({
          check_typ: 'scene.empty',
          schwere: 'warnung',
          meldung: 'Szene hat keinen Inhalt',
        })
      }
    }
  }

  // ── 11. Motiv-Schreibweise ───────────────────────────────────────────────
  if (run('motiv.einheitliche_schreibweise') && s.ort_name?.trim()) {
    const motivRes = await pool.query<any>(`
      SELECT ort_name, COUNT(*) AS anzahl
      FROM dokument_szenen
      WHERE werkstufe_id = $1 AND geloescht IS NOT TRUE
        AND LOWER(ort_name) = LOWER($2) AND ort_name != $3
      GROUP BY ort_name ORDER BY anzahl DESC LIMIT 1
    `, [s.werkstufe_id, s.ort_name, s.ort_name])
    if (motivRes.rows[0]) {
      const vorschlag = motivRes.rows[0].ort_name
      results.push({
        check_typ: 'motiv.einheitliche_schreibweise',
        schwere: 'warnung',
        meldung: `Motiv "${s.ort_name}" — häufigere Schreibweise "${vorschlag}" (${motivRes.rows[0].anzahl}×)`,
        meta: { aktuell: s.ort_name, vorschlag, szene_id: szeneId },
      })
    }
  }

  // ── 12. Rollen-Schreibweise ──────────────────────────────────────────────
  if (run('rolle.einheitliche_schreibweise')) {
    const allCharsRes = await pool.query<any>(`
      SELECT c.id, c.name FROM characters c
      JOIN character_productions cp ON cp.character_id = c.id
      WHERE cp.produktion_id = $1
    `, [s.produktion_id])
    const charByUpper = new Map<string, string>(
      allCharsRes.rows.map((c: any) => [c.name.toUpperCase(), c.name as string])
    )
    const schreibweiseViolos: Array<{ gefunden: string; canonical: string }> = []
    for (const node of content) {
      if (!isCharacterNode(node)) continue
      const rawName = extractText(node).trim()
      if (!rawName) continue
      const { name } = parseNtSuffix(rawName)
      const canonical = charByUpper.get(name.toUpperCase())
      if (canonical && canonical !== name) {
        if (!schreibweiseViolos.some(v => v.gefunden === name)) {
          schreibweiseViolos.push({ gefunden: name, canonical })
        }
      }
    }
    if (schreibweiseViolos.length > 0) {
      results.push({
        check_typ: 'rolle.einheitliche_schreibweise',
        schwere: 'warnung',
        meldung: `${schreibweiseViolos.length} Rollenname${schreibweiseViolos.length !== 1 ? 'n weichen' : ' weicht'} von der Rollendatei ab`,
        meta: { violations: schreibweiseViolos },
      })
    }
  }

  // ── 13. Dialog endet mit Satzzeichen ────────────────────────────────────
  if (run('dialog.endet_satzzeichen') && s.format === 'drehbuch') {
    const SATZZEICHEN = /[.!?…\u2026"»]$/
    let replikNr = 0
    const dialogViolos: number[] = []
    for (let i = 0; i < content.length; i++) {
      if (isCharacterNode(content[i])) replikNr++
      if (isDialogueNode(content[i])) {
        const text = extractText(content[i]).trim()
        if (text && !SATZZEICHEN.test(text)) dialogViolos.push(replikNr)
      }
    }
    if (dialogViolos.length > 0) {
      results.push({
        check_typ: 'dialog.endet_satzzeichen',
        schwere: 'hinweis',
        meldung: `${dialogViolos.length} Dialog-Block${dialogViolos.length !== 1 ? 'e' : ''} ohne abschließendes Satzzeichen`,
        meta: { replik_nummern: dialogViolos },
      })
    }
  }

  // ── 14. Kein führendes Leerzeichen ───────────────────────────────────────
  if (run('text.kein_leerzeichen_start')) {
    const leerzeichenViolos: number[] = []
    for (let i = 0; i < content.length; i++) {
      const node = content[i]
      if (node.type !== 'screenplay_element' && node.type !== 'absatz') continue
      if (/^ /.test(extractText(node))) leerzeichenViolos.push(i)
    }
    if (leerzeichenViolos.length > 0) {
      results.push({
        check_typ: 'text.kein_leerzeichen_start',
        schwere: 'hinweis',
        meldung: `${leerzeichenViolos.length} Block${leerzeichenViolos.length !== 1 ? 'e' : ''} mit führendem Leerzeichen`,
        meta: { node_indices: leerzeichenViolos },
      })
    }
  }

  // ── 15. Leere Blöcke ─────────────────────────────────────────────────────
  if (run('leere_bloecke')) {
    const leereCount = content.filter((node: any) =>
      (node.type === 'screenplay_element' || node.type === 'absatz') &&
      !extractText(node).trim()
    ).length
    if (leereCount > 0) {
      results.push({
        check_typ: 'leere_bloecke',
        schwere: 'hinweis',
        meldung: `${leereCount} leere${leereCount !== 1 ? '' : 'r'} Block${leereCount !== 1 ? 'e' : ''}`,
      })
    }
  }

  // ── 16. Doppelter Sprecher ────────────────────────────────────────────────
  if (run('doppelter_sprecher')) {
    let replikNr = 0
    const doppeltViolos: Array<{ replik_a: number; replik_b: number; node_index: number }> = []
    for (let i = 0; i < content.length - 1; i++) {
      if (!isCharacterNode(content[i])) continue
      replikNr++
      // Suche nächsten nicht-leeren Node
      let j = i + 1
      while (j < content.length && !extractText(content[j]).trim()) j++
      if (j < content.length && isCharacterNode(content[j])) {
        doppeltViolos.push({ replik_a: replikNr, replik_b: replikNr + 1, node_index: i })
      }
    }
    if (doppeltViolos.length > 0) {
      results.push({
        check_typ: 'doppelter_sprecher',
        schwere: 'warnung',
        meldung: `${doppeltViolos.length} doppelter Sprecher-Block${doppeltViolos.length !== 1 ? 'e' : ''}: Replik ${doppeltViolos.map(v => `${v.replik_a}/${v.replik_b}`).join(', ')}`,
        meta: { violations: doppeltViolos },
      })
    }
  }

  // ── 17. Tageszeit-Sequenz ─────────────────────────────────────────────────
  if (run('tageszeit_sequenz') && s.tageszeit && s.spieltag != null && s.sort_order != null) {
    const stimmungen = await getStimmungen(s.produktion_id)
    const stimmungPos = new Map<string, number>(stimmungen.map((st: any) => [st.name as string, st.position as number]))
    const currentStimmungPos = stimmungPos.get(s.tageszeit)
    if (currentStimmungPos !== undefined) {
      const prevRes = await pool.query<any>(`
        SELECT id, scene_nummer, tageszeit, spieltag
        FROM dokument_szenen
        WHERE werkstufe_id = $1 AND geloescht IS NOT TRUE AND id != $2
          AND sort_order < $3 AND spieltag = $4
        ORDER BY sort_order DESC LIMIT 1
      `, [s.werkstufe_id, szeneId, s.sort_order, s.spieltag])
      if (prevRes.rows[0]) {
        const prev = prevRes.rows[0]
        const prevPos = stimmungPos.get(prev.tageszeit) ?? -1
        if (prevPos > currentStimmungPos) {
          results.push({
            check_typ: 'tageszeit_sequenz',
            schwere: 'warnung',
            meldung: `Tageszeit geht zurück: "${prev.tageszeit}" (Sz. ${prev.scene_nummer}) → "${s.tageszeit}" am selben Spieltag SP${s.spieltag}`,
            meta: { vorige_szene_id: prev.id, vorige_scene_nummer: prev.scene_nummer },
          })
        }
      }
    }
  }

  // ── 18. Dramaturgischer Tag — Chronologie ────────────────────────────────
  if (run('dramaturgischer_tag_chronologie') && s.spieltag != null && s.sort_order != null) {
    const prevDayRes = await pool.query<any>(`
      SELECT id, scene_nummer, spieltag
      FROM dokument_szenen
      WHERE werkstufe_id = $1 AND geloescht IS NOT TRUE AND id != $2
        AND sort_order < $3 AND spieltag IS NOT NULL
      ORDER BY sort_order DESC LIMIT 1
    `, [s.werkstufe_id, szeneId, s.sort_order])
    if (prevDayRes.rows[0]) {
      const prev = prevDayRes.rows[0]
      if (s.spieltag < prev.spieltag) {
        results.push({
          check_typ: 'dramaturgischer_tag_chronologie',
          schwere: 'warnung',
          meldung: `Spieltag SP${s.spieltag} liegt vor Sz. ${prev.scene_nummer} (SP${prev.spieltag})`,
          meta: { vorige_szene_id: prev.id, vorige_scene_nummer: prev.scene_nummer, vorige_spieltag: prev.spieltag },
        })
      } else if (s.spieltag > prev.spieltag + 1) {
        results.push({
          check_typ: 'dramaturgischer_tag_chronologie',
          schwere: 'warnung',
          meldung: `Spieltag-Lücke: Sz. ${prev.scene_nummer} (SP${prev.spieltag}) → SP${s.spieltag}`,
          meta: { vorige_szene_id: prev.id, vorige_scene_nummer: prev.scene_nummer, vorige_spieltag: prev.spieltag },
        })
      }
    }
  }

  // ── 19. NT-Replik-Konsistenz ─────────────────────────────────────────────
  // Liest den bereits berechneten konsistenz_status aus nt_eintraege.
  // Die Aktualisierung des Status erfolgt durch den Batch-Handler (updateNtKonsistenzForWerkstufe).
  if (run('nt_replik_konsistenz')) {
    const ntKonsRes = await pool.query<any>(`
      SELECT ne.id, ne.konsistenz_status, c.name AS char_name
      FROM nt_eintraege ne
      JOIN characters c ON c.id = ne.character_id
      WHERE ne.werkstufe_id = $1 AND ne.scene_identity_id = $2
        AND ne.veraltet = FALSE
        AND ne.konsistenz_status IN ('block_fehlt', 'text_geaendert')
    `, [s.werkstufe_id, s.scene_identity_id])
    for (const nt of ntKonsRes.rows) {
      results.push({
        check_typ: 'nt_replik_konsistenz',
        schwere: nt.konsistenz_status === 'block_fehlt' ? 'blocker' : 'warnung',
        meldung: nt.konsistenz_status === 'block_fehlt'
          ? `NT-Replik "${nt.char_name}": Basis-Block fehlt in der Arbeitsfassung`
          : `NT-Replik "${nt.char_name}": Text hat sich gegenüber der Basis geändert`,
        meta: { nt_eintrag_id: nt.id, char_name: nt.char_name, status: nt.konsistenz_status },
      })
    }
  }

  // ── 20. Oneliner vorhanden (KI-optional) ────────────────────────────────
  if (run('oneliner_vorhanden') && s.format === 'drehbuch') {
    const oneliner = (s.zusammenfassung ?? '').trim()
    if (!oneliner) {
      let kiMeta: any = undefined
      try {
        const kiSetting = await getKiSetting('oneliner_vorhanden')
        if (kiSetting?.enabled) {
          const rollen = await pool.query<any>(`
            SELECT c.name FROM scene_characters sc
            JOIN characters c ON c.id = sc.character_id
            WHERE sc.scene_identity_id = $1
          `, [s.scene_identity_id])
          const rollenText = rollen.rows.map((r: any) => r.name).join(', ') || '(keine)'
          const promptTemplate = await effectivePromptForProduction(kiSetting, s.produktion_id)
          const prompt = applyPromptTemplate(promptTemplate, {
            motiv: s.ort_name ?? '',
            int_ext: s.int_ext ?? '',
            tageszeit: s.tageszeit ?? '',
            rollen: rollenText,
            oneliner: '',
            text_auszug: plaintext.substring(0, 600),
          })
          const raw = await callProvider(kiSetting, [{ role: 'user', content: prompt }], 200)
          const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
          if (parsed.hinweis) kiMeta = { ki_hinweis: parsed.hinweis }
        }
      } catch { /* KI ist optional */ }
      results.push({
        check_typ: 'oneliner_vorhanden',
        schwere: 'hinweis',
        meldung: 'Kein Oneliner (Zusammenfassung) vorhanden',
        meta: kiMeta,
      })
    }
  }

  return results
}

// ── NT-Konsistenz-Update für Werkstufe ────────────────────────────────────────
// Repliziert die Kern-Logik des /tools/konsistenz-Endpoints (Handoff 1) für den
// Batch-Handler. Findet die zuletzt eingefrorene Basis-Werkstufe derselben Folge
// und aktualisiert konsistenz_status aller nt_eintraege der Arbeits-Werkstufe.

async function updateNtKonsistenzForWerkstufe(werkstufeId: string): Promise<void> {
  // Folge der Arbeits-Werkstufe
  const wsRes = await pool.query<any>(`SELECT folge_id FROM werkstufen WHERE id = $1`, [werkstufeId])
  if (!wsRes.rows[0]) return
  const folgeId = wsRes.rows[0].folge_id

  // Neueste eingefrorene Basis-Werkstufe derselben Folge
  const basisRes = await pool.query<any>(`
    SELECT id FROM werkstufen
    WHERE folge_id = $1 AND eingefroren = TRUE AND id != $2
    ORDER BY eingefroren_am DESC NULLS LAST LIMIT 1
  `, [folgeId, werkstufeId])
  const basisId: string | undefined = basisRes.rows[0]?.id
  if (!basisId) return  // Keine eingefrorene Basis → kein Check möglich

  // Basis-NT-Einträge indexieren
  const basisEintraege = await pool.query<any>(`
    SELECT character_id, scene_identity_id, repliken_text, repliken_node_ids
    FROM nt_eintraege WHERE werkstufe_id = $1 AND veraltet = FALSE
  `, [basisId])
  const basisMap = new Map<string, any>(
    basisEintraege.rows.map((e: any) => [`${e.character_id}::${e.scene_identity_id}`, e])
  )

  // Node-IDs der Arbeits-Werkstufe aufbauen
  const szenen = await pool.query<any>(`
    SELECT content FROM dokument_szenen WHERE werkstufe_id = $1 AND geloescht = FALSE
  `, [werkstufeId])
  const nodeIdSet = new Set<string>()
  for (const sz of szenen.rows) {
    const blocks: any[] = Array.isArray(sz.content) ? sz.content : []
    for (const block of blocks) {
      const nid = block?.attrs?.node_id
      if (nid) nodeIdSet.add(nid as string)
    }
  }

  // Konsistenz-Status pro NT-Eintrag berechnen und aktualisieren
  const arbeit = await pool.query<any>(`
    SELECT id, character_id, scene_identity_id, repliken_text, repliken_node_ids
    FROM nt_eintraege WHERE werkstufe_id = $1 AND veraltet = FALSE
  `, [werkstufeId])

  for (const eintrag of arbeit.rows) {
    const key = `${eintrag.character_id}::${eintrag.scene_identity_id}`
    const basis = basisMap.get(key)
    if (!basis) continue  // Neuer Eintrag ohne Basis → 'neu', kein Update nötig

    const basisNodeIds: string[] = basis.repliken_node_ids ?? []
    const fehlend = basisNodeIds.filter((nid: string) => !nodeIdSet.has(nid))
    const newStatus = fehlend.length > 0
      ? 'block_fehlt'
      : eintrag.repliken_text !== basis.repliken_text
        ? 'text_geaendert'
        : 'ok'

    await pool.query(
      `UPDATE nt_eintraege SET konsistenz_status = $1, aktualisiert_am = NOW() WHERE id = $2`,
      [newStatus, eintrag.id]
    )
  }
}

// ── spielzeit_uhrzeit: KI-Check auf Werkstufen-Ebene (pro dramaturgischem Tag) ─
// Löscht alte spielzeit_uhrzeit-Ergebnisse der Werkstufe, ruft KI für jeden
// spieltag auf und persistiert Vorschläge/Konflikte in szenen_check_ergebnisse.

async function runSpielzeitUhrzeitCheck(werkstufeId: string, cfg: Record<string, CheckConfigEntry>): Promise<void> {
  if (!cfg['spielzeit_uhrzeit']?.enabled) return
  const kiSetting = await getKiSetting('spielzeit_uhrzeit')
  if (!kiSetting?.enabled) return

  // Produktions- und Folgeninfos
  const wsRes = await pool.query<any>(`
    SELECT w.folge_id, f.folge_nummer, f.produktion_id, p.titel AS produktion_titel
    FROM werkstufen w
    JOIN folgen f ON f.id = w.folge_id
    JOIN produktionen p ON p.id = f.produktion_id
    WHERE w.id = $1
  `, [werkstufeId])
  if (!wsRes.rows[0]) return
  const { folge_id: _folgeId, folge_nummer, produktion_id, produktion_titel } = wsRes.rows[0]

  // Szenen dieser Werkstufe mit spieltag
  const szenenRes = await pool.query<any>(`
    SELECT id, scene_nummer, ort_name, int_ext, tageszeit, spieltag,
           zusammenfassung, spielzeit, sort_order, content
    FROM dokument_szenen
    WHERE werkstufe_id = $1 AND geloescht IS NOT TRUE AND spieltag IS NOT NULL
    ORDER BY spieltag, sort_order
  `, [werkstufeId])
  if (szenenRes.rows.length === 0) return

  // Alte spielzeit_uhrzeit-Ergebnisse für diese Werkstufe löschen
  await pool.query(
    `DELETE FROM szenen_check_ergebnisse WHERE werkstufe_id = $1 AND check_typ = 'spielzeit_uhrzeit'`,
    [werkstufeId]
  )

  // Kontext aus Nachbarfolgen (letzte/erste N Szenen der besten Werkstufe)
  const getNeighborContext = async (neighborNr: number): Promise<string> => {
    try {
      const nf = await pool.query<any>(
        `SELECT id FROM folgen WHERE produktion_id = $1 AND folge_nummer = $2`,
        [produktion_id, neighborNr]
      )
      if (!nf.rows[0]) return ''
      const wsId = await getBestWerkstufe(nf.rows[0].id)
      if (!wsId) return ''
      const ns = await pool.query<any>(`
        SELECT scene_nummer, ort_name, int_ext, tageszeit, spielzeit, zusammenfassung
        FROM dokument_szenen WHERE werkstufe_id = $1 AND geloescht IS NOT TRUE
        ORDER BY sort_order DESC LIMIT 3
      `, [wsId])
      return ns.rows.map((s: any) =>
        `Sz.${s.scene_nummer} ${s.int_ext ?? ''}. ${s.ort_name ?? ''} - ${s.tageszeit ?? ''}${s.spielzeit ? ` [ANKER: ${s.spielzeit}]` : ''}: ${s.zusammenfassung ?? ''}`.trim()
      ).reverse().join('\n')
    } catch { return '' }
  }

  const [kontextVorher, kontextNachher] = await Promise.all([
    getNeighborContext(folge_nummer - 1),
    getNeighborContext(folge_nummer + 1),
  ])

  // Szenen nach spieltag gruppieren und pro Tag einen KI-Call machen
  const tagMap = new Map<number, typeof szenenRes.rows>()
  for (const sz of szenenRes.rows) {
    if (!tagMap.has(sz.spieltag)) tagMap.set(sz.spieltag, [])
    tagMap.get(sz.spieltag)!.push(sz)
  }

  for (const [spieltag, tagSzenen] of tagMap) {
    try {
      const szenenText = tagSzenen.map((sz: any) => {
        const blocks: any[] = Array.isArray(sz.content) ? sz.content : []
        const text = blocks.map((n: any) => extractText(n)).join(' ').substring(0, 200)
        const ankerHinweis = sz.spielzeit ? `[ANKER: ${sz.spielzeit}]` : ''
        const oneliner = sz.zusammenfassung ?? text
        return `Sz.${sz.scene_nummer} ${sz.int_ext ?? ''}. ${sz.ort_name ?? ''} - ${sz.tageszeit ?? ''} ${ankerHinweis} | ${oneliner}`.trim()
      }).join('\n')

      const promptTemplate = await effectivePromptForProduction(kiSetting, produktion_id)
      const promptText = applyPromptTemplate(promptTemplate, {
        serie_name: produktion_titel ?? 'Serie',
        spieltag: String(spieltag),
        szenen_des_tages: szenenText,
        kontext_vorherige_folge: kontextVorher || '(keine)',
        kontext_naechste_folge: kontextNachher || '(keine)',
      })

      const raw = await callProvider(kiSetting, [{ role: 'user', content: promptText }], 800)
      const result = JSON.parse(raw.replace(/```json|```/g, '').trim())

      // Pro Szene ein Finding einfügen
      for (const entry of (result.szenen ?? [])) {
        const szene = tagSzenen.find((s: any) => String(s.scene_nummer) === String(entry.szenennummer))
        if (!szene) continue
        if (!entry.vorschlag_uhrzeit && !entry.konflikt_mit_ankern) continue

        const meldung = entry.konflikt_mit_ankern
          ? `Spielzeit-Anker ${szene.spielzeit} erscheint unplausibel: ${entry.begruendung ?? ''}`
          : `Spielzeit-Vorschlag ${entry.vorschlag_uhrzeit} [${entry.confidence ?? '?'}]: ${entry.begruendung ?? ''}`

        await pool.query(
          `INSERT INTO szenen_check_ergebnisse (dokument_szene_id, werkstufe_id, check_typ, schwere, meldung, meta)
           VALUES ($1, $2, 'spielzeit_uhrzeit', $3, $4, $5)`,
          [
            szene.id, werkstufeId,
            entry.konflikt_mit_ankern ? 'warnung' : 'hinweis',
            meldung,
            JSON.stringify(entry),
          ]
        )
      }
    } catch { /* KI ist optional — non-fatal */ }
  }
}

// ── Persist results ───────────────────────────────────────────────────────────

async function persistResults(szeneId: string, werkstufeId: string, results: CheckResult[]) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // spielzeit_uhrzeit-Ergebnisse werden batch-seitig verwaltet — hier nicht löschen
    await client.query(
      `DELETE FROM szenen_check_ergebnisse WHERE dokument_szene_id = $1 AND check_typ != 'spielzeit_uhrzeit'`,
      [szeneId]
    )
    for (const r of results) {
      await client.query(
        `INSERT INTO szenen_check_ergebnisse (dokument_szene_id, werkstufe_id, check_typ, schwere, meldung, meta)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [szeneId, werkstufeId, r.check_typ, r.schwere, r.meldung, r.meta ? JSON.stringify(r.meta) : null]
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
// Special key 'nt_verweis' triggers the NT-Verweis auto-fix (not a normal check)
router.post('/werkstufe/:id/batch', async (req, res) => {
  try {
    const werkstufId = req.params.id
    const rawOverride: string[] | null = Array.isArray(req.body?.checks_override) ? req.body.checks_override : null
    const runNtVerweis = !rawOverride || rawOverride.includes('nt_verweis')
    const checksOverride: string[] | null = rawOverride
      ? rawOverride.filter(k => k !== 'nt_verweis')
      : null
    const szenenRes = await pool.query<any>(
      `SELECT id FROM dokument_szenen WHERE werkstufe_id = $1 AND geloescht IS NOT TRUE`,
      [werkstufId]
    )

    // NT-Konsistenz-Status aktualisieren bevor per-Szene-Checks laufen,
    // damit nt_replik_konsistenz aktuelle Werte liest.
    const runNtKonsistenz = !checksOverride || checksOverride.includes('nt_replik_konsistenz')
    if (runNtKonsistenz) {
      await updateNtKonsistenzForWerkstufe(werkstufId).catch(() => {})
    }

    let total = 0
    for (const row of szenenRes.rows) {
      const results = await runChecks(row.id, false, checksOverride && checksOverride.length > 0 ? checksOverride : null)
      await persistResults(row.id, werkstufId, results)
      total += results.length
      if (runNtVerweis) {
        await applyNtVerweisFix(row.id).catch(() => {})
      }
    }
    // spielzeit_uhrzeit: batch-level KI-Check (nach Per-Szene-Schleife)
    const runSpielzeit = !checksOverride || checksOverride.includes('spielzeit_uhrzeit')
    if (runSpielzeit) {
      const batchCfg = await getEffectiveCheckConfig(
        // produktion_id aus erster Szene
        szenenRes.rows[0]
          ? (await pool.query<any>(
              `SELECT f.produktion_id FROM dokument_szenen ds
               JOIN scene_identities si ON si.id = ds.scene_identity_id
               JOIN folgen f ON f.id = si.folge_id WHERE ds.id = $1`,
              [szenenRes.rows[0].id]
            )).rows[0]?.produktion_id ?? ''
          : ''
      )
      await runSpielzeitUhrzeitCheck(werkstufId, batchCfg).catch(() => {})
    }

    // If spieltag_inkonsistent in checks_override (or no override), run cross-Folgen spieltag check too
    const runSpieltagCross = !checksOverride || checksOverride.includes('spieltag_inkonsistent')
    if (runSpieltagCross) {
      // Get produktion_id from werkstufe
      const prodRes = await pool.query<any>(
        `SELECT f.produktion_id FROM dokument_szenen ds
         JOIN scene_identities si ON si.id = ds.scene_identity_id
         JOIN folgen f ON f.id = si.folge_id
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

// GET /api/checks/config/:produktionId — merged check config for a production (all 4 axes)
router.get('/config/:produktionId', async (req, res) => {
  try {
    const cfg = await getEffectiveCheckConfig(req.params.produktionId)
    res.json(cfg)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/checks/szene/:id — get persisted results for a scene
router.get('/szene/:id', async (req, res) => {
  try {
    const { rows } = await pool.query<any>(
      `SELECT id, check_typ, schwere, meldung, meta, behoben, erstellt_am
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
             bool_or(schwere IN ('blocker', 'fehler')) AS has_fehler
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

// GET /api/checks/werkstufe/:id/gate-summary — persisted findings grouped by lock-gating
// Used by ChecklistenModal before applying a Produktionsfassung label.
// Does NOT re-run checks — reads from szenen_check_ergebnisse (run batch first).
router.get('/werkstufe/:id/gate-summary', async (req, res) => {
  try {
    const werkstufId = req.params.id
    const wsRes = await pool.query(
      `SELECT f.produktion_id FROM werkstufen w JOIN folgen f ON f.id = w.folge_id WHERE w.id = $1`,
      [werkstufId]
    )
    if (!wsRes.rows[0]) return res.status(404).json({ error: 'Werkstufe nicht gefunden' })
    const produktionId = wsRes.rows[0].produktion_id as string
    const cfg = await getEffectiveCheckConfig(produktionId)

    const { rows } = await pool.query<any>(`
      SELECT sce.id, sce.check_typ, sce.schwere, sce.meldung, sce.meta,
             ds.scene_nummer, sce.dokument_szene_id
      FROM szenen_check_ergebnisse sce
      JOIN dokument_szenen ds ON ds.id = sce.dokument_szene_id
      WHERE sce.werkstufe_id = $1 AND sce.behoben IS NOT TRUE
      ORDER BY ds.scene_nummer, sce.schwere DESC
    `, [werkstufId])

    const blockers: any[] = []
    const warnungen: any[] = []
    const hinweise: any[] = []

    for (const row of rows) {
      const checkCfg = cfg[row.check_typ]
      if (!checkCfg?.enabled) continue
      const gating = checkCfg.lock_gating ?? 'off'
      if (gating === 'off') continue
      const finding = {
        id: row.id, check_typ: row.check_typ, schwere: row.schwere,
        meldung: row.meldung, meta: row.meta,
        scene_nummer: row.scene_nummer, szene_id: row.dokument_szene_id,
      }
      if (gating === 'blocker' && row.schwere === 'blocker') {
        blockers.push(finding)
      } else if (gating === 'warnung') {
        warnungen.push(finding)
      } else {
        hinweise.push(finding)
      }
    }

    res.json({ has_blockers: blockers.length > 0, has_warnungen: warnungen.length > 0, blockers, warnungen, hinweise })
  } catch (err) { res.status(500).json({ error: String(err) }) }
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

// ── NT-Verweis Auto-Fix ───────────────────────────────────────────────────────
// Scannt Character-Nodes auf NT/VO/OFF/ONE-WAY-Suffixe + folgenden Dialog
// und synchronisiert die Notiz im Szenenkopf ohne User-Feedback.

async function applyNtVerweisFix(szeneId: string): Promise<{ changed: boolean; notiz: string | null }> {
  const sceneRes = await pool.query<any>(
    `SELECT id, content, format, notiz FROM dokument_szenen WHERE id = $1 AND geloescht IS NOT TRUE`,
    [szeneId]
  )
  if (!sceneRes.rows[0]) return { changed: false, notiz: null }
  const { content, format, notiz } = sceneRes.rows[0]
  if (format === 'notiz') return { changed: false, notiz }

  const nodes: any[] = Array.isArray(content) ? content : []
  const ntParts: string[] = []
  let hasOneway = false

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    if (!isCharacterNode(node)) continue
    const text = extractText(node).trim()
    if (!text) continue
    const { name, suffix } = parseNtSuffix(text)
    if (!suffix) continue
    // Nächsten nicht-leeren Node prüfen
    let j = i + 1
    while (j < nodes.length && !extractText(nodes[j]).trim()) j++
    if (j >= nodes.length || !isDialogueNode(nodes[j])) continue  // kein Dialog → nicht zählen
    if (suffix === '(NT)') ntParts.push(`NT ${name}`)
    else if (suffix === '(VO)') ntParts.push(`NT ${name} (VO)`)
    else if (suffix === '(OFF)') ntParts.push(`${name} im Off`)
    else if (suffix === '(ONE-WAY)') hasOneway = true
  }

  const currentNotiz = (notiz ?? '').trim()
  const isAutoLine = (l: string) => {
    const t = l.trim()
    return t.startsWith('NT ') || t.endsWith(' im Off') || t === 'Oneway Telefonat'
  }
  const nonAutoLines = currentNotiz.split('\n').filter((l: string) => !isAutoLine(l))
  const newAutoLines: string[] = []
  if (hasOneway) newAutoLines.push('Oneway Telefonat')
  newAutoLines.push(...ntParts)

  const newNotiz = [...newAutoLines, ...nonAutoLines].filter(Boolean).join('\n').trim() || null

  if (newNotiz === (currentNotiz || null)) return { changed: false, notiz: newNotiz }

  await pool.query(
    `UPDATE dokument_szenen SET notiz = $1 WHERE id = $2`,
    [newNotiz, szeneId]
  )
  return { changed: true, notiz: newNotiz }
}

// POST /api/checks/szene/:id/nt-verweis-fix — synchronisiert NT-Notiz-Zeilen
router.post('/szene/:id/nt-verweis-fix', async (req, res) => {
  try {
    const result = await applyNtVerweisFix(req.params.id)
    res.json({ ok: true, ...result })
  } catch (err) {
    console.error('nt-verweis-fix error:', err)
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

export { DEFAULT_CONFIG as checkDefaultConfig, router as checksRouter, runChecks }
