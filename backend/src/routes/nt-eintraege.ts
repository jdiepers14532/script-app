import { Router } from 'express'
import { pool, query, queryOne } from '../db'
import { authMiddleware } from '../auth'
import { starteFreigabeAnfrage } from './rollen-freigabe'

// KI-Trainer URL + Secret aus ENV (für manuelle Overrides)
const KI_TRAINER_URL = process.env.KI_TRAINER_URL || 'http://127.0.0.1:3013'
const KI_TRAINER_SECRET = process.env.KI_TRAINER_SECRET || ''

export const ntEintraegeRouter = Router()
ntEintraegeRouter.use(authMiddleware)

// ── Server-seitiges Suffix-Parsing (spiegelt frontend parseSuffix) ─────────────
function parseSuffixServer(text: string): { name: string; suffix: string | null } {
  const patterns: Array<{ pattern: RegExp; canonical: string }> = [
    { pattern: /(?:^|\s)\(?\s*one[-\s]?way\s*\)?$/i, canonical: '(ONE-WAY)' },
    { pattern: /(?:^|\s)\(?\s*v\.?o\.?\s*\)?$/i, canonical: '(VO)' },
    { pattern: /(?:^|\s)\(?\s*n\.?t\.?\s*\)?$/i, canonical: '(NT)' },
    { pattern: /(?:^|\s)\(?\s*(?:off|o\.s\.?)\s*\)?$/i, canonical: '(OFF)' },
  ]
  for (const { pattern, canonical } of patterns) {
    if (pattern.test(text)) {
      return { name: text.replace(pattern, '').trim(), suffix: canonical }
    }
  }
  return { name: text, suffix: null }
}

// Flacher Text aus ProseMirror-Node
function extractNodeText(node: any): string {
  if (!node) return ''
  if (node.type === 'text') return node.text ?? ''
  if (Array.isArray(node.content)) return node.content.map(extractNodeText).join('')
  return ''
}

// ── NT-Figuren aus ProseMirror-Content extrahieren ────────────────────────────
interface NtCharEntry {
  nameUpper: string
  nt_typ: 'stimme' | 'vo'
  replicaTexts: string[]
}

/**
 * Analysiert den ProseMirror-JSON-Content einer Szene und liefert NT/VO-Figuren
 * mit ihrem Replikentext zurück.
 *
 * Erkannte Fälle:
 * - Suffix (NT) → nt_typ='stimme'
 * - Suffix (VO) → nt_typ='vo'
 * - ALL-OFF: alle Auftritte einer Figur haben (OFF) → nt_typ='stimme'
 * - ONE-WAY: kein NT-Eintrag (kein Replikentext, nicht im Drehplan)
 */
export function extractNtCharacters(
  content: any,
  charFormatIds: Set<string>,
  diagFormatIds: Set<string>
): NtCharEntry[] {
  const nodes: any[] = Array.isArray(content)
    ? content
    : (content?.content ?? [])

  // name → { suffixes für alle Auftritte, Repliken für NT/VO-Auftritte }
  const charMap = new Map<string, { suffixes: string[]; replicaTexts: string[] }>()
  let currentName: string | null = null
  let currentSuffix: string | null = null
  let collectReplicas = false

  for (const node of nodes) {
    const isChar =
      (node.type === 'screenplay_element' && (node.attrs?.elementType === 'character' || node.attrs?.element_type === 'character')) ||
      (node.type === 'absatz' && charFormatIds.has(node.attrs?.format_id))

    const isDiag =
      (node.type === 'screenplay_element' && (node.attrs?.elementType === 'dialogue' || node.attrs?.element_type === 'dialogue')) ||
      (node.type === 'absatz' && diagFormatIds.has(node.attrs?.format_id))

    if (isChar) {
      const rawText = extractNodeText(node).trim()
      const { name, suffix } = parseSuffixServer(rawText)
      const nameUpper = name.toUpperCase()

      if (!charMap.has(nameUpper)) {
        charMap.set(nameUpper, { suffixes: [], replicaTexts: [] })
      }
      charMap.get(nameUpper)!.suffixes.push(suffix ?? '')

      currentName = nameUpper
      currentSuffix = suffix
      // Repliken sammeln für NT und VO (nicht ONE-WAY, nicht OFF normal)
      collectReplicas = suffix === '(NT)' || suffix === '(VO)' || suffix === '(OFF)'
    } else if (isDiag && currentName && collectReplicas) {
      const diagText = extractNodeText(node).trim()
      if (diagText) {
        charMap.get(currentName)?.replicaTexts.push(diagText)
      }
    } else if (!isChar && !isDiag) {
      // Parenthetical etc. — currentName bleibt aktiv
    }
  }

  const result: NtCharEntry[] = []

  for (const [nameUpper, data] of charMap) {
    const { suffixes, replicaTexts } = data
    const hasNt = suffixes.includes('(NT)')
    const hasVo = suffixes.includes('(VO)')
    const hasOff = suffixes.includes('(OFF)')

    if (hasVo) {
      result.push({ nameUpper, nt_typ: 'vo', replicaTexts })
    } else if (hasNt) {
      result.push({ nameUpper, nt_typ: 'stimme', replicaTexts })
    } else if (hasOff) {
      // OFF: Figur (auch teilweise) im Off — NT-Aufnahme erforderlich
      result.push({ nameUpper, nt_typ: 'stimme', replicaTexts: [] })
    }
  }

  return result
}

// ── Fehlende Figur automatisch anlegen + ggf. Freigabe starten ───────────────
async function autoCreateCharacterForNT(
  nameUpper: string,
  produktionId: string,
  szeneId: string,
  userId: string | null,
  userName: string | null
): Promise<string | null> {
  try {
    // Figur existiert evtl. global, aber nicht mit dieser Produktion verknüpft
    let charRow = await queryOne(
      `SELECT id FROM characters WHERE UPPER(name) = $1 LIMIT 1`,
      [nameUpper]
    )
    if (!charRow?.id) {
      // Neu anlegen — Title-Case: "HILDE" → "Hilde"
      const displayName = nameUpper
        .split(' ')
        .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ')
      charRow = await queryOne(
        `INSERT INTO characters (name, meta_json) VALUES ($1, '{}') RETURNING id`,
        [displayName]
      )
    }
    if (!charRow?.id) return null

    // Mit Produktion verknüpfen (idempotent) — inaktiv bis Freigabe erteilt
    await pool.query(
      `INSERT INTO character_productions
         (character_id, produktion_id, is_active, freigabe_status, angelegt_via, angelegt_von_user_id, angelegt_am)
       VALUES ($1, $2, FALSE, 'ausstehend', 'editor_freigabe', $3, NOW())
       ON CONFLICT (character_id, produktion_id) DO NOTHING`,
      [charRow.id, produktionId, userId]
    )

    // Freigabe-Workflow starten (setzt freigabe_status auf 'ausstehend' oder 'keine')
    await starteFreigabeAnfrage({
      characterId: charRow.id,
      produktionId,
      szeneId,
      userId,
      userName,
    })

    console.log(`[NT] Figur auto-angelegt: "${nameUpper}" (id=${charRow.id}) in Produktion ${produktionId}`)
    return charRow.id
  } catch (err) {
    console.error('[NT] autoCreateCharacterForNT Fehler:', err)
    return null
  }
}

/**
 * Auto-Upsert: wird nach jedem PUT /api/dokument-szenen/:id aufgerufen.
 * Legt NT-Einträge an, aktualisiert Replikentext, setzt veraltet=TRUE für nicht mehr NT/VO-Figuren.
 * Figuren die noch nicht existieren werden automatisch angelegt (inkl. ggf. Freigabe-Anfrage).
 */
export async function autoUpsertNtEintraege(
  szeneId: string,
  content: any,
  userId: string | null = null,
  userName: string | null = null
): Promise<void> {
  try {
    // Metadaten der Szene laden
    const szene = await queryOne(
      `SELECT ds.id, ds.scene_identity_id, ds.werkstufe_id,
              w.folge_id, f.produktion_id
       FROM dokument_szenen ds
       JOIN werkstufen w ON w.id = ds.werkstufe_id
       JOIN folgen f ON f.id = w.folge_id
       WHERE ds.id = $1`,
      [szeneId]
    )
    if (!szene?.scene_identity_id || !szene?.werkstufe_id) return

    // Absatzformat-IDs für CHARACTER und DIALOGUE dieser Produktion
    const charFormats = await query(
      `SELECT id FROM absatzformate WHERE produktion_id = $1 AND LOWER(name) = 'character'`,
      [szene.produktion_id]
    )
    const diagFormats = await query(
      `SELECT id FROM absatzformate WHERE produktion_id = $1 AND LOWER(name) = 'dialogue'`,
      [szene.produktion_id]
    )
    const charFormatIds = new Set(charFormats.map((r: any) => r.id))
    const diagFormatIds = new Set(diagFormats.map((r: any) => r.id))

    // NT-Figuren aus Content extrahieren
    const ntChars = extractNtCharacters(content, charFormatIds, diagFormatIds)

    // Figuren-UUIDs per Name nachschlagen (oder anlegen)
    const upsertedCharIds: string[] = []

    for (const entry of ntChars) {
      // Figur per Name in der Produktion suchen
      let char = await queryOne(
        `SELECT c.id FROM characters c
         JOIN character_productions cp ON cp.character_id = c.id
         WHERE cp.produktion_id = $1 AND UPPER(c.name) = $2
         LIMIT 1`,
        [szene.produktion_id, entry.nameUpper]
      )
      if (!char?.id) {
        // Figur existiert nicht → automatisch anlegen
        const newId = await autoCreateCharacterForNT(
          entry.nameUpper, szene.produktion_id, szeneId, userId, userName
        )
        if (!newId) continue
        char = { id: newId }
      }

      const replikenText = entry.replicaTexts.join('\n') || null

      await pool.query(
        `INSERT INTO nt_eintraege
           (produktion_id, character_id, szene_id, scene_identity_id, werkstufe_id, folge_id, nt_typ, repliken_text, veraltet)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE)
         ON CONFLICT (character_id, scene_identity_id, werkstufe_id)
         DO UPDATE SET
           szene_id = EXCLUDED.szene_id,
           nt_typ = EXCLUDED.nt_typ,
           repliken_text = EXCLUDED.repliken_text,
           veraltet = FALSE,
           aktualisiert_am = NOW()`,
        [
          szene.produktion_id,
          char.id,
          szeneId,
          szene.scene_identity_id,
          szene.werkstufe_id,
          szene.folge_id ?? null,
          entry.nt_typ,
          replikenText,
        ]
      )
      upsertedCharIds.push(char.id)
    }

    // Figuren, die nicht mehr NT/VO sind → soft-delete (veraltet=TRUE)
    // NIEMALS hard-delete — Disposition.app verlinkt via .id
    let veralteteCharIds: string[] = []
    if (upsertedCharIds.length > 0) {
      const veraltete = await query(
        `UPDATE nt_eintraege
         SET veraltet = TRUE, aktualisiert_am = NOW()
         WHERE scene_identity_id = $1 AND werkstufe_id = $2
           AND veraltet = FALSE
           AND character_id != ALL($3::uuid[])
         RETURNING character_id`,
        [szene.scene_identity_id, szene.werkstufe_id, upsertedCharIds]
      )
      veralteteCharIds = veraltete.map((r: any) => r.character_id)
    } else {
      // Keine NT-Figuren mehr → alle veralten
      const veraltete = await query(
        `UPDATE nt_eintraege
         SET veraltet = TRUE, aktualisiert_am = NOW()
         WHERE scene_identity_id = $1 AND werkstufe_id = $2 AND veraltet = FALSE
         RETURNING character_id`,
        [szene.scene_identity_id, szene.werkstufe_id]
      )
      veralteteCharIds = veraltete.map((r: any) => r.character_id)
    }

    // Auto-Zurückziehen: Budget-Anfragen die auf diese Szene zeigen + Figur noch staged (is_active=FALSE)
    // → wenn NT-Eintrag veraltet ist die Figur nicht mehr im Szenen-Content, Anfrage wird hinfällig
    if (veralteteCharIds.length > 0) {
      await pool.query(
        `UPDATE rollen_freigabe_anfragen rfa
         SET status = 'zurueckgezogen', entschieden_am = NOW()
         FROM character_productions cp
         WHERE rfa.character_id = cp.character_id
           AND rfa.production_id = cp.produktion_id
           AND rfa.character_id = ANY($1::uuid[])
           AND rfa.production_id = $2
           AND rfa.status = 'ausstehend'
           AND cp.is_active = FALSE`,
        [veralteteCharIds, szene.produktion_id]
      )
    }
  } catch (err) {
    // Non-blocking — NT-Upsert darf Szenen-Speicherung nicht blockieren
    console.error('[NT] autoUpsert Fehler:', err)
  }
}

// ── Phase 2: Komparsen-Klassifizierung ────────────────────────────────────────

/** Extrahiert alle Action-Textpassagen, in denen charName vorkommt */
function extractActionPassagesForChar(
  content: any,
  charName: string,
  actionFormatIds: Set<string>
): string[] {
  const nodes: any[] = Array.isArray(content) ? content : (content?.content ?? [])
  const nameUpper = charName.toUpperCase()
  const stem = nameUpper.replace(/(INNEN|EN|ER|E)$/, '').slice(0, Math.max(4, nameUpper.length - 3))
  const passages: string[] = []

  for (const node of nodes) {
    const isAction =
      (node.type === 'screenplay_element' && (node.attrs?.elementType === 'action' || node.attrs?.element_type === 'action')) ||
      (node.type === 'absatz' && actionFormatIds.has(node.attrs?.format_id))
    if (!isAction) continue
    const text = extractNodeText(node).trim()
    if (!text) continue
    const textUpper = text.toUpperCase()
    if (textUpper.includes(nameUpper) || (stem.length >= 4 && textUpper.includes(stem))) {
      passages.push(text.substring(0, 300))
    }
  }
  return passages
}

/**
 * Analysiert den Content für einen Komparsen:
 * - Hat er Dialogue folgend auf seinen Character-Block? → mit_text
 * - Erscheint sein Name in einem Action-Block? → mit_spiel-Kandidat
 * - Sonst → ot
 */
function analyzeKomparseInContent(
  content: any,
  charName: string,
  headerOT: boolean,
  charFormatIds: Set<string>,
  diagFormatIds: Set<string>,
  actionFormatIds: Set<string>
): { hasDialogue: boolean; actionPassages: string[] } {
  const nodes: any[] = Array.isArray(content) ? content : (content?.content ?? [])
  const nameUpper = charName.toUpperCase()
  const stem = nameUpper.replace(/(INNEN|EN|ER|E)$/, '').slice(0, Math.max(4, nameUpper.length - 3))

  let hasDialogue = false
  let isCurrentChar = false
  const actionPassages: string[] = []

  for (const node of nodes) {
    const isChar =
      (node.type === 'screenplay_element' && (node.attrs?.elementType === 'character' || node.attrs?.element_type === 'character')) ||
      (node.type === 'absatz' && charFormatIds.has(node.attrs?.format_id))
    const isDiag =
      (node.type === 'screenplay_element' && (node.attrs?.elementType === 'dialogue' || node.attrs?.element_type === 'dialogue')) ||
      (node.type === 'absatz' && diagFormatIds.has(node.attrs?.format_id))
    const isAction =
      (node.type === 'screenplay_element' && (node.attrs?.elementType === 'action' || node.attrs?.element_type === 'action')) ||
      (node.type === 'absatz' && actionFormatIds.has(node.attrs?.format_id))

    if (isChar) {
      const rawText = extractNodeText(node).trim()
      const { name } = parseSuffixServer(rawText)
      isCurrentChar = name.toUpperCase() === nameUpper
    } else if (isDiag && isCurrentChar) {
      hasDialogue = true
    } else if (isAction) {
      isCurrentChar = false
      const text = extractNodeText(node).trim()
      if (text) {
        const textUpper = text.toUpperCase()
        if (textUpper.includes(nameUpper) || (stem.length >= 4 && textUpper.includes(stem))) {
          actionPassages.push(text.substring(0, 300))
        }
      }
    }
    // Parenthetical etc. → isCurrentChar bleibt
  }
  return { hasDialogue, actionPassages }
}

/** Einfacher Mistral-HTTP-Call ohne Import aus ki.ts (vermeidet zirkuläre Abhängigkeit) */
async function callMistralForKomparse(
  apiKey: string,
  model: string,
  charName: string,
  passages: string[]
): Promise<{ typ: 'mit_spiel' | 'ot'; evidence: string; konfidenz: number }> {
  const system =
    'Du klassifizierst Komparsen in Filmdrehbüchern auf Deutsch. ' +
    'Eine Figur hat "mit Spiel" wenn sie etwas SZENENRELEVANTES TUT: ' +
    'eine Handlung ausführt, mit einer anderen Figur interagiert oder die Szene aktiv mitgestaltet. ' +
    'Reine Anwesenheit, Atmosphäre oder bloße Nennung ist KEIN Spiel. ' +
    'Im Zweifel: lieber MIT_SPIEL (Recall vor Precision). ' +
    'Antworte NUR in diesem Format: MIT_SPIEL: <Begründung max 20 Wörter> ODER OHNE_SPIEL: <Begründung max 20 Wörter>'

  const user =
    `Figur: ${charName}\n\nAction-Texte aus dem Drehbuch (wo die Figur erwähnt wird):\n` +
    passages.map((p, i) => `[${i + 1}] "${p}"`).join('\n')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  try {
    const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        max_tokens: 80,
        temperature: 0.0,
      }),
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`Mistral HTTP ${res.status}`)
    const data = await res.json() as any
    const raw = (data.choices?.[0]?.message?.content || '').trim()

    if (/^MIT_SPIEL/i.test(raw)) {
      const evidence = raw.replace(/^MIT_SPIEL:?\s*/i, '').trim().substring(0, 150)
      return { typ: 'mit_spiel', evidence, konfidenz: 0.85 }
    }
    if (/^OHNE_SPIEL/i.test(raw)) {
      const evidence = raw.replace(/^OHNE_SPIEL:?\s*/i, '').trim().substring(0, 150)
      return { typ: 'ot', evidence, konfidenz: 0.80 }
    }
    // Unklares Antwortformat → Fallback: mit_spiel (Recall)
    return { typ: 'mit_spiel', evidence: raw.substring(0, 150), konfidenz: 0.55 }
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Phase 2: Klassifiziert alle Komparsen einer Szene als ot / mit_text / mit_spiel.
 * Wird asynchron nach PUT /api/dokument-szenen/:id aufgerufen (non-blocking).
 */
export async function autoClassifySceneKomparsen(
  szeneId: string,
  content: any,
  _userId: string | null = null
): Promise<void> {
  try {
    // 1. Szenen-Metadaten laden
    const szene = await queryOne(
      `SELECT ds.id, ds.scene_identity_id, ds.werkstufe_id,
              w.folge_id, f.produktion_id
       FROM dokument_szenen ds
       JOIN werkstufen w ON w.id = ds.werkstufe_id
       JOIN folgen f ON f.id = w.folge_id
       WHERE ds.id = $1`,
      [szeneId]
    )
    if (!szene?.scene_identity_id || !szene?.werkstufe_id) return

    // 2. Komparsen dieser Szene + Werkstufe laden (via character_kategorien.typ = 'komparse')
    const komparsen = await query(
      `SELECT sc.id AS sc_id, sc.character_id, sc.header_o_t, sc.spiel_typ_quelle,
              c.name AS char_name
       FROM scene_characters sc
       JOIN characters c ON c.id = sc.character_id
       JOIN character_productions cp ON cp.character_id = sc.character_id AND cp.produktion_id = $3
       LEFT JOIN character_kategorien ck ON ck.id = cp.kategorie_id
       WHERE sc.scene_identity_id = $1 AND sc.werkstufe_id = $2
         AND ck.typ = 'komparse'`,
      [szene.scene_identity_id, szene.werkstufe_id, szene.produktion_id]
    )
    if (komparsen.length === 0) return

    // 3. Absatzformat-IDs für CHARACTER, DIALOGUE und ACTION
    const [charFormats, diagFormats, actionFormats] = await Promise.all([
      query(`SELECT id FROM absatzformate WHERE produktion_id = $1 AND LOWER(name) = 'character'`, [szene.produktion_id]),
      query(`SELECT id FROM absatzformate WHERE produktion_id = $1 AND LOWER(name) = 'dialogue'`, [szene.produktion_id]),
      query(`SELECT id FROM absatzformate WHERE produktion_id = $1 AND LOWER(name) = 'action'`, [szene.produktion_id]),
    ])
    const charFormatIds = new Set(charFormats.map((r: any) => r.id))
    const diagFormatIds = new Set(diagFormats.map((r: any) => r.id))
    const actionFormatIds = new Set(actionFormats.map((r: any) => r.id))

    // 4. KI-Setting laden (nur wenn Kandidaten für Mistral vorhanden)
    let kiSetting: any = null
    const hasMitSpielerKandidaten = komparsen.some((k: any) => {
      const { hasDialogue, actionPassages } = analyzeKomparseInContent(
        content, k.char_name, k.header_o_t, charFormatIds, diagFormatIds, actionFormatIds
      )
      return !hasDialogue && !k.header_o_t && actionPassages.length > 0
    })
    if (hasMitSpielerKandidaten) {
      kiSetting = await queryOne(
        `SELECT ks.enabled, ks.provider, ks.model_name, kp.api_key
         FROM ki_settings ks
         LEFT JOIN ki_providers kp ON kp.provider = ks.provider AND kp.is_active = TRUE
         WHERE ks.funktion = 'komparse_spiel_disambiguation'`,
        []
      )
    }

    // 5. Jeden Komparsen klassifizieren und upserten
    for (const k of komparsen) {
      const { hasDialogue, actionPassages } = analyzeKomparseInContent(
        content, k.char_name, k.header_o_t, charFormatIds, diagFormatIds, actionFormatIds
      )

      let typ_erkannt: 'ot' | 'mit_text' | 'mit_spiel'
      let konfidenz: number
      let quelle: 'regel' | 'mistral'
      let evidence_text: string | null = null
      let verifiziert = false

      if (hasDialogue) {
        // Dialogue-Node vorhanden → deterministisch mit_text
        typ_erkannt = 'mit_text'
        konfidenz = 1.0
        quelle = 'regel'
        verifiziert = true
      } else if (k.header_o_t) {
        // Explizit als o.T. im Szenenkopf markiert, kein Dialogue → ot
        typ_erkannt = 'ot'
        konfidenz = 1.0
        quelle = 'regel'
        verifiziert = true
      } else if (actionPassages.length > 0) {
        // In Action-Text erwähnt → Kandidat für mit_spiel
        if (kiSetting?.enabled && kiSetting?.provider === 'mistral' && kiSetting?.api_key) {
          try {
            const res = await callMistralForKomparse(kiSetting.api_key, kiSetting.model_name, k.char_name, actionPassages)
            typ_erkannt = res.typ
            konfidenz = res.konfidenz
            evidence_text = res.evidence
            quelle = 'mistral'
            verifiziert = false
          } catch (err) {
            // Mistral nicht erreichbar → heuristischer Fallback (Recall)
            console.error('[KomparseKlass] Mistral Fehler, Fallback:', err)
            typ_erkannt = 'mit_spiel'
            konfidenz = 0.60
            quelle = 'regel'
            evidence_text = actionPassages[0]?.substring(0, 150) ?? null
            verifiziert = false
          }
        } else {
          // KI deaktiviert oder kein Key → heuristisch: mit_spiel (Recall > Precision)
          typ_erkannt = 'mit_spiel'
          konfidenz = 0.65
          quelle = 'regel'
          evidence_text = actionPassages[0]?.substring(0, 150) ?? null
          verifiziert = false
        }
      } else {
        // Weder Dialogue noch Action-Erwähnung → ot
        typ_erkannt = 'ot'
        konfidenz = 0.90
        quelle = 'regel'
        verifiziert = false
      }

      // Upsert in komparse_klassifizierung
      // Manuell gesetzte Einträge (quelle='manuell') werden NICHT überschrieben
      await pool.query(
        `INSERT INTO komparse_klassifizierung
           (character_id, scene_identity_id, werkstufe_id, typ_erkannt, evidence_text, konfidenz, quelle, verifiziert)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (character_id, scene_identity_id, werkstufe_id) DO UPDATE SET
           typ_erkannt    = CASE WHEN komparse_klassifizierung.quelle = 'manuell' THEN komparse_klassifizierung.typ_erkannt ELSE EXCLUDED.typ_erkannt END,
           evidence_text  = CASE WHEN komparse_klassifizierung.quelle = 'manuell' THEN komparse_klassifizierung.evidence_text ELSE EXCLUDED.evidence_text END,
           konfidenz      = CASE WHEN komparse_klassifizierung.quelle = 'manuell' THEN komparse_klassifizierung.konfidenz ELSE EXCLUDED.konfidenz END,
           quelle         = CASE WHEN komparse_klassifizierung.quelle = 'manuell' THEN 'manuell' ELSE EXCLUDED.quelle END,
           verifiziert    = CASE WHEN komparse_klassifizierung.quelle = 'manuell' THEN komparse_klassifizierung.verifiziert ELSE EXCLUDED.verifiziert END,
           erstellt_am    = CASE WHEN komparse_klassifizierung.quelle = 'manuell' THEN komparse_klassifizierung.erstellt_am ELSE NOW() END`,
        [k.character_id, szene.scene_identity_id, szene.werkstufe_id, typ_erkannt, evidence_text, konfidenz, quelle, verifiziert]
      )

      // scene_characters.spiel_typ + spiel_typ_quelle aktualisieren,
      // sofern noch nicht manuell gesetzt (Präzedenz: manuell > scan > header)
      if (k.spiel_typ_quelle !== 'manuell') {
        const spiel_typ_map: Record<string, string> = { ot: 'o.t.', mit_text: 'text', mit_spiel: 'spiel' }
        const neue_spiel_typ = spiel_typ_map[typ_erkannt]
        if (neue_spiel_typ) {
          await pool.query(
            `UPDATE scene_characters SET spiel_typ = $1, spiel_typ_quelle = 'scan'
             WHERE id = $2`,
            [neue_spiel_typ, k.sc_id]
          )
        }
      }
    }

    console.log(`[KomparseKlass] ${komparsen.length} Komparsen klassifiziert für Szene ${szeneId}`)
  } catch (err) {
    // Non-blocking — darf Speicherung nicht blockieren
    console.error('[KomparseKlass] autoClassifySceneKomparsen Fehler:', err)
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/komparse-klassifizierung?produktion_id=X[&scene_identity_id=Y][&werkstufe_id=Z][&nur_unverifiziert=true]
// ══════════════════════════════════════════════════════════════════════════════
ntEintraegeRouter.get('/komparse-klassifizierung', async (req, res) => {
  try {
    const { produktion_id, scene_identity_id, werkstufe_id, nur_unverifiziert, character_id } = req.query as Record<string, string>
    if (!produktion_id) return res.status(400).json({ error: 'produktion_id erforderlich' })

    const conditions: string[] = [
      `cp.produktion_id = $1`,
      `ck.typ = 'komparse'`,
    ]
    const params: any[] = [produktion_id]
    let pi = 2

    if (scene_identity_id) { conditions.push(`kk.scene_identity_id = $${pi++}`); params.push(scene_identity_id) }
    if (werkstufe_id) { conditions.push(`kk.werkstufe_id = $${pi++}`); params.push(werkstufe_id) }
    if (character_id) { conditions.push(`kk.character_id = $${pi++}`); params.push(character_id) }
    if (nur_unverifiziert === 'true') { conditions.push(`kk.verifiziert = FALSE`) }

    const rows = await query(
      `SELECT
         kk.id, kk.character_id, kk.scene_identity_id, kk.werkstufe_id,
         kk.typ_erkannt, kk.evidence_text, kk.konfidenz, kk.quelle,
         kk.verifiziert, kk.verifiziert_von_user_id, kk.verifiziert_am, kk.erstellt_am,
         c.name AS character_name,
         cp.komparsen_nummer,
         ck.name AS kategorie_name,
         ds.scene_nummer, ds.ort_name, ds.int_ext, ds.tageszeit,
         f.folge_nummer
       FROM komparse_klassifizierung kk
       JOIN characters c ON c.id = kk.character_id
       JOIN character_productions cp ON cp.character_id = kk.character_id AND cp.produktion_id = $1
       LEFT JOIN character_kategorien ck ON ck.id = cp.kategorie_id
       LEFT JOIN dokument_szenen ds ON ds.scene_identity_id = kk.scene_identity_id AND ds.werkstufe_id = kk.werkstufe_id
       LEFT JOIN werkstufen w ON w.id = kk.werkstufe_id
       LEFT JOIN folgen f ON f.id = w.folge_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY f.folge_nummer NULLS LAST, ds.scene_nummer NULLS LAST, c.name`,
      params
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// PATCH /api/komparse-klassifizierung/:id — manuelles Override (DK / Besetzung)
// Setzt quelle='manuell', verifiziert=TRUE, löst KI-Trainer-Event aus.
// ══════════════════════════════════════════════════════════════════════════════
ntEintraegeRouter.patch('/komparse-klassifizierung/:id', async (req, res) => {
  try {
    const { typ_erkannt, evidence_text } = req.body
    if (!typ_erkannt || !['ot', 'mit_text', 'mit_spiel'].includes(typ_erkannt)) {
      return res.status(400).json({ error: 'typ_erkannt muss ot | mit_text | mit_spiel sein' })
    }
    const userId = (req as any).user?.user_id ?? null
    const userName = (req as any).user?.name ?? null

    const row = await queryOne(
      `UPDATE komparse_klassifizierung SET
         typ_erkannt           = $1,
         evidence_text         = COALESCE($2, evidence_text),
         quelle                = 'manuell',
         verifiziert           = TRUE,
         verifiziert_von_user_id = $3,
         verifiziert_am        = NOW()
       WHERE id = $4 RETURNING *`,
      [typ_erkannt, evidence_text ?? null, userId, req.params.id]
    )
    if (!row) return res.status(404).json({ error: 'Klassifizierung nicht gefunden' })

    // scene_characters.spiel_typ und spiel_typ_quelle='manuell' synchronisieren
    const spiel_typ_map: Record<string, string> = { ot: 'o.t.', mit_text: 'text', mit_spiel: 'spiel' }
    const neue_spiel_typ = spiel_typ_map[typ_erkannt]
    if (neue_spiel_typ) {
      await pool.query(
        `UPDATE scene_characters SET spiel_typ = $1, spiel_typ_quelle = 'manuell'
         WHERE scene_identity_id = $2 AND werkstufe_id = $3 AND character_id = $4`,
        [neue_spiel_typ, row.scene_identity_id, row.werkstufe_id, row.character_id]
      )
    }

    // KI-Trainer-Event (fire-and-forget)
    if (KI_TRAINER_SECRET) {
      fetch(`${KI_TRAINER_URL}/api/training-events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-KI-Trainer-Secret': KI_TRAINER_SECRET },
        body: JSON.stringify({
          app: 'script',
          task: 'komparse_spiel_disambiguation',
          input: row.evidence_text ?? '',
          label: typ_erkannt,
          confidence: 1.0,
          is_correction: true,
          source_id: String(row.id),
        }),
      }).catch(() => {})
    }

    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/nt-eintraege?produktion_id=X[&folge_id=Y][&nt_typ=Z][&veraltet=false]
// ══════════════════════════════════════════════════════════════════════════════
ntEintraegeRouter.get('/', async (req, res) => {
  try {
    const { produktion_id, folge_id, nt_typ, veraltet, szene_id } = req.query as Record<string, string>
    if (!produktion_id) return res.status(400).json({ error: 'produktion_id erforderlich' })

    const conditions: string[] = ['ne.produktion_id = $1']
    const params: any[] = [produktion_id]
    let pi = 2

    if (folge_id) { conditions.push(`ne.folge_id = $${pi++}`); params.push(Number(folge_id)) }
    if (nt_typ) { conditions.push(`ne.nt_typ = $${pi++}`); params.push(nt_typ) }
    if (szene_id) { conditions.push(`ne.szene_id = $${pi++}`); params.push(szene_id) }

    // Default: nur aktive (nicht veraltete) Einträge
    const zeigVeraltet = veraltet === 'true'
    if (!zeigVeraltet) { conditions.push(`ne.veraltet = FALSE`) }

    const rows = await query(
      `SELECT
         ne.id, ne.character_id, ne.szene_id, ne.scene_identity_id, ne.werkstufe_id,
         ne.folge_id, ne.nt_typ, ne.repliken_text, ne.notiz, ne.veraltet,
         ne.erstellt_am, ne.aktualisiert_am,
         c.name AS character_name,
         cp.rollen_nummer, cp.komparsen_nummer,
         f.folge_nummer,
         ds.scene_nummer, ds.ort_name, ds.int_ext, ds.tageszeit
       FROM nt_eintraege ne
       LEFT JOIN characters c ON c.id = ne.character_id
       LEFT JOIN character_productions cp ON cp.character_id = ne.character_id AND cp.produktion_id = ne.produktion_id
       LEFT JOIN folgen f ON f.id = ne.folge_id
       LEFT JOIN dokument_szenen ds ON ds.id = ne.szene_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY f.folge_nummer NULLS LAST, c.name, ne.aktualisiert_am DESC`,
      params
    )

    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/nt-eintraege/:id — einzelner Eintrag
// ══════════════════════════════════════════════════════════════════════════════
ntEintraegeRouter.get('/:id', async (req, res) => {
  try {
    const row = await queryOne(
      `SELECT ne.*, c.name AS character_name, f.folge_nummer,
              ds.scene_nummer, ds.ort_name
       FROM nt_eintraege ne
       LEFT JOIN characters c ON c.id = ne.character_id
       LEFT JOIN folgen f ON f.id = ne.folge_id
       LEFT JOIN dokument_szenen ds ON ds.id = ne.szene_id
       WHERE ne.id = $1`,
      [req.params.id]
    )
    if (!row) return res.status(404).json({ error: 'NT-Eintrag nicht gefunden' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// PATCH /api/nt-eintraege/:id — Notiz oder nt_typ manuell ändern
// ══════════════════════════════════════════════════════════════════════════════
ntEintraegeRouter.patch('/:id', async (req, res) => {
  try {
    const { notiz, nt_typ } = req.body
    const sets: string[] = ['aktualisiert_am = NOW()']
    const params: any[] = []
    let pi = 1

    if (notiz !== undefined) { sets.push(`notiz = $${pi++}`); params.push(notiz) }
    if (nt_typ !== undefined) { sets.push(`nt_typ = $${pi++}`); params.push(nt_typ) }

    params.push(req.params.id)
    const row = await queryOne(
      `UPDATE nt_eintraege SET ${sets.join(', ')} WHERE id = $${pi} RETURNING *`,
      params
    )
    if (!row) return res.status(404).json({ error: 'NT-Eintrag nicht gefunden' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/nt-eintraege/statistik?produktion_id=X&folge_ids=1,2,3
// ══════════════════════════════════════════════════════════════════════════════
ntEintraegeRouter.get('/statistik/overview', async (req, res) => {
  try {
    const { produktion_id, folge_ids } = req.query as Record<string, string>
    if (!produktion_id) return res.status(400).json({ error: 'produktion_id erforderlich' })

    const folgeIdList = folge_ids ? folge_ids.split(',').map(Number).filter(Boolean) : []
    const folgeFilter = folgeIdList.length > 0 ? `AND ne.folge_id = ANY($2::int[])` : ''
    const params: any[] = [produktion_id, ...(folgeIdList.length ? [folgeIdList] : [])]

    // Gesamtzahlen
    const totals = await queryOne(
      `SELECT
         COUNT(*) FILTER (WHERE NOT veraltet) AS gesamt,
         COUNT(*) FILTER (WHERE nt_typ = 'stimme' AND NOT veraltet) AS stimme,
         COUNT(*) FILTER (WHERE nt_typ = 'telefon' AND NOT veraltet) AS telefon,
         COUNT(*) FILTER (WHERE nt_typ = 'vo' AND NOT veraltet) AS vo,
         COUNT(DISTINCT character_id) FILTER (WHERE NOT veraltet) AS figuren_count,
         COUNT(DISTINCT scene_identity_id) FILTER (WHERE NOT veraltet) AS szenen_count
       FROM nt_eintraege ne
       WHERE ne.produktion_id = $1 ${folgeFilter}`,
      params
    )

    // Pro Figur
    const preFiguren = await query(
      `SELECT
         c.id, c.name, cp.rollen_nummer,
         COUNT(*) FILTER (WHERE NOT ne.veraltet) AS szenen_count,
         array_agg(DISTINCT ne.nt_typ) FILTER (WHERE NOT ne.veraltet) AS typen
       FROM nt_eintraege ne
       JOIN characters c ON c.id = ne.character_id
       LEFT JOIN character_productions cp ON cp.character_id = ne.character_id AND cp.produktion_id = ne.produktion_id
       WHERE ne.produktion_id = $1 ${folgeFilter}
       GROUP BY c.id, c.name, cp.rollen_nummer
       ORDER BY c.name`,
      params
    )

    res.json({ totals, figuren: preFiguren })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})
