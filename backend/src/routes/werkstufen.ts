import { Router } from 'express'
import { pool, query, queryOne } from '../db'
import { authMiddleware, requireRole } from '../auth'
import { applyVorlage } from './dokument-vorlagen'
import { calcPageLength } from '../utils/calcPageLength'

// ── Werkstufen Router ────────────────────────────────────────────────────────
// Mounted at /api/folgen/:folgeId/werkstufen AND /api/werkstufen
export const folgeWerkstufenRouter = Router({ mergeParams: true })
folgeWerkstufenRouter.use(authMiddleware)

export const werkstufenRouter = Router()
werkstufenRouter.use(authMiddleware)

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/folgen/:folgeId/werkstufen — all Werkstufen of a Folge
// ══════════════════════════════════════════════════════════════════════════════
folgeWerkstufenRouter.get('/', async (req, res) => {
  try {
    const folgeId = (req.params as any).folgeId
    const userId = req.user!.user_id
    const rows = await query(
      `SELECT w.*,
              (SELECT COUNT(*)::int FROM dokument_szenen ds
               WHERE ds.werkstufe_id = w.id AND ds.geloescht = false) AS szenen_count
       FROM werkstufen w
       WHERE w.folge_id = $1
         AND (
           -- autoren / produktion: für alle sichtbar
           w.sichtbarkeit IN ('autoren', 'produktion')
           -- privat: nur der User der es privat gesetzt hat
           OR (w.sichtbarkeit = 'privat' AND w.privat_gesetzt_von = $2)
           -- eigene Werkstufe: Ersteller sieht immer seine Werkstufe
           OR w.erstellt_von = $2
           -- team: oder colab: — nur wenn User Mitglied der Gruppe ist
           OR (
             (w.sichtbarkeit LIKE 'team:%' OR w.sichtbarkeit LIKE 'colab:%')
             AND SPLIT_PART(w.sichtbarkeit, ':', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             AND EXISTS (
               SELECT 1 FROM colab_gruppen_mitglieder cgm
               WHERE cgm.gruppe_id = SPLIT_PART(w.sichtbarkeit, ':', 2)::uuid
                 AND cgm.user_id = $2
             )
           )
         )
       ORDER BY w.typ, w.version_nummer`,
      [folgeId, userId]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/folgen/:folgeId/werkstufen — create new Werkstufe (copies predecessor)
// ══════════════════════════════════════════════════════════════════════════════
folgeWerkstufenRouter.post('/', async (req, res) => {
  const folgeId = parseInt((req.params as any).folgeId)
  const {
    typ, label, sichtbarkeit, vorgaenger_id,
    mode = 'full',         // 'full' | 'headers_only' | 'storyline_body_as_txt' | 'empty'
    kopiere_notizen = true, // bool — copy notiz-format scenes from predecessor
  } = req.body
  const user = req.user!

  if (!typ) return res.status(400).json({ error: 'typ required' })

  // Transform content nodes to use a specific absatzformat ID (for storyline_body_as_txt)
  function transformContentToFormat(node: any, formatId: string): any {
    if (!node || typeof node !== 'object') return node
    if (Array.isArray(node)) return node.map((n: any) => transformContentToFormat(n, formatId))
    if (node.type === 'absatz') {
      return { ...node, attrs: { ...(node.attrs || {}), format_id: formatId } }
    }
    if (node.content) {
      return { ...node, content: transformContentToFormat(node.content, formatId) }
    }
    return node
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Verify folge exists and get produktion_id (needed for TXT format lookup)
    const folge = await client.query(
      'SELECT id, produktion_id, ist_frei, sichtbarkeit_frei, sichtbarkeit_frei_colab_gruppe_id FROM folgen WHERE id = $1',
      [folgeId]
    )
    if (folge.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Folge nicht gefunden' })
    }
    const produktionId = folge.rows[0].produktion_id

    // Determine predecessor: explicit or highest version of same typ
    let predecessorId = vorgaenger_id || null
    if (!predecessorId && mode !== 'empty') {
      const prev = await client.query(
        `SELECT id FROM werkstufen
         WHERE folge_id = $1 AND typ = $2
         ORDER BY version_nummer DESC LIMIT 1`,
        [folgeId, typ]
      )
      if (prev.rows.length > 0) predecessorId = prev.rows[0].id
    }

    // Determine next version_nummer (global or per-typ depending on app setting)
    const modusRes = await client.query(`SELECT value FROM app_settings WHERE key = 'fassungs_nummerierung_modus'`)
    const numModus = modusRes.rows[0]?.value ?? 'per_typ'
    const cntRes = await client.query(
      numModus === 'global'
        ? `SELECT COALESCE(MAX(version_nummer), 0) AS m FROM werkstufen WHERE folge_id = $1`
        : `SELECT COALESCE(MAX(version_nummer), 0) AS m FROM werkstufen WHERE folge_id = $1 AND typ = $2`,
      numModus === 'global' ? [folgeId] : [folgeId, typ]
    )
    const nextVersion = (cntRes.rows[0]?.m ?? 0) + 1

    // Für freie Dokumente: initiale Sichtbarkeit aus folgens.sichtbarkeit_frei ableiten
    let initialSichtbarkeit = sichtbarkeit ?? 'autoren'
    if (folge.rows[0].ist_frei && !sichtbarkeit) {
      const fs = folge.rows[0].sichtbarkeit_frei
      const cg = folge.rows[0].sichtbarkeit_frei_colab_gruppe_id
      if (fs === 'privat') initialSichtbarkeit = 'privat'
      else if (fs === 'colab' && cg) initialSichtbarkeit = `colab:${cg}`
      else initialSichtbarkeit = 'produktion'
    }

    // Create Werkstufe
    const wsRes = await client.query(
      `INSERT INTO werkstufen (folge_id, typ, version_nummer, label, sichtbarkeit, privat_permanent, erstellt_von)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [folgeId, typ, nextVersion, label ?? null, initialSichtbarkeit,
       folge.rows[0].ist_frei && initialSichtbarkeit === 'privat', user.user_id]
    )
    const werkstufe = wsRes.rows[0]

    let copiedCount = 0

    if (predecessorId && mode !== 'empty') {
      if (mode === 'full') {
        // Copy all non-notiz scenes with full content
        const copyRes = await client.query(
          `INSERT INTO dokument_szenen
             (werkstufe_id, scene_identity_id, sort_order, scene_nummer, scene_nummer_suffix,
              format, ort_name, int_ext, tageszeit, spieltag, zusammenfassung, spielzeit,
              szeneninfo, seiten, stoppzeit_sek, dauer_min, dauer_sek, is_wechselschnitt, content, updated_by, page_length)
           SELECT $1, scene_identity_id, sort_order, scene_nummer, scene_nummer_suffix,
                  format, ort_name, int_ext, tageszeit, spieltag, zusammenfassung, spielzeit,
                  szeneninfo, seiten, stoppzeit_sek, dauer_min, dauer_sek, is_wechselschnitt, content, $2, page_length
           FROM dokument_szenen
           WHERE werkstufe_id = $3 AND geloescht = false
             AND (format IS NULL OR format != 'notiz')`,
          [werkstufe.id, user.name || user.user_id, predecessorId]
        )
        copiedCount = copyRes.rowCount ?? 0

      } else if (mode === 'headers_only') {
        // Copy scene headers, clear body content (but keep zusammenfassung/oneliner)
        const copyRes = await client.query(
          `INSERT INTO dokument_szenen
             (werkstufe_id, scene_identity_id, sort_order, scene_nummer, scene_nummer_suffix,
              format, ort_name, int_ext, tageszeit, spieltag, zusammenfassung, spielzeit,
              szeneninfo, seiten, stoppzeit_sek, dauer_min, dauer_sek, is_wechselschnitt, content, updated_by, page_length)
           SELECT $1, scene_identity_id, sort_order, scene_nummer, scene_nummer_suffix,
                  $4, ort_name, int_ext, tageszeit, spieltag, zusammenfassung, spielzeit,
                  szeneninfo, seiten, stoppzeit_sek, dauer_min, dauer_sek, is_wechselschnitt, NULL, $2, NULL
           FROM dokument_szenen
           WHERE werkstufe_id = $3 AND geloescht = false
             AND (format IS NULL OR format != 'notiz')`,
          [werkstufe.id, user.name || user.user_id, predecessorId, typ]
        )
        copiedCount = copyRes.rowCount ?? 0

      } else if (mode === 'storyline_body_as_txt') {
        // Cross-format: copy storyline body text, assign TXT absatzformat, change format → target typ
        // Find TXT absatzformat for this produktion
        const txtFmtRes = await client.query(
          `SELECT id FROM absatzformate WHERE produktion_id = $1 AND kuerzel = 'TXT' LIMIT 1`,
          [produktionId]
        )
        const txtFormatId = txtFmtRes.rows[0]?.id ?? null

        // Fetch predecessor scenes (non-notiz)
        const predScenes = await client.query(
          `SELECT scene_identity_id, sort_order, scene_nummer, scene_nummer_suffix,
                  ort_name, int_ext, tageszeit, spieltag, zusammenfassung, spielzeit,
                  szeneninfo, seiten, stoppzeit_sek, dauer_min, dauer_sek, is_wechselschnitt, content
           FROM dokument_szenen
           WHERE werkstufe_id = $1 AND geloescht = false
             AND (format IS NULL OR format != 'notiz')`,
          [predecessorId]
        )

        for (const s of predScenes.rows) {
          let transformedContent = s.content
          if (txtFormatId && s.content) {
            try {
              const parsed = typeof s.content === 'string' ? JSON.parse(s.content) : s.content
              transformedContent = transformContentToFormat(parsed, txtFormatId)
            } catch { /* keep original if parse fails */ }
          }
          await client.query(
            `INSERT INTO dokument_szenen
               (werkstufe_id, scene_identity_id, sort_order, scene_nummer, scene_nummer_suffix,
                format, ort_name, int_ext, tageszeit, spieltag, zusammenfassung, spielzeit,
                szeneninfo, seiten, stoppzeit_sek, dauer_min, dauer_sek, is_wechselschnitt, content, updated_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
            [
              werkstufe.id, s.scene_identity_id, s.sort_order, s.scene_nummer, s.scene_nummer_suffix,
              typ, s.ort_name, s.int_ext, s.tageszeit, s.spieltag, s.zusammenfassung, s.spielzeit,
              s.szeneninfo, s.seiten, s.stoppzeit_sek, s.dauer_min, s.dauer_sek, s.is_wechselschnitt,
              transformedContent ? JSON.stringify(transformedContent) : null, user.name || user.user_id,
            ]
          )
          copiedCount++
        }
      }

      // Copy scene_characters from predecessor (only for full copy)
      if (mode === 'full') {
        await client.query(
          `INSERT INTO scene_characters
             (werkstufe_id, scene_identity_id, character_id, kategorie_id,
              anzahl, spiel_typ, repliken_anzahl, header_o_t)
           SELECT $1, scene_identity_id, character_id, kategorie_id,
                  anzahl, spiel_typ, repliken_anzahl, header_o_t
           FROM scene_characters
           WHERE werkstufe_id = $2`,
          [werkstufe.id, predecessorId]
        )
      }

      // Copy notiz scenes separately if requested (always full copy)
      if (kopiere_notizen) {
        await client.query(
          `INSERT INTO dokument_szenen
             (werkstufe_id, scene_identity_id, sort_order, scene_nummer, scene_nummer_suffix,
              format, ort_name, int_ext, tageszeit, spieltag, zusammenfassung, spielzeit,
              szeneninfo, seiten, stoppzeit_sek, dauer_min, dauer_sek, is_wechselschnitt, content, updated_by, page_length)
           SELECT $1, scene_identity_id, sort_order, scene_nummer, scene_nummer_suffix,
                  format, ort_name, int_ext, tageszeit, spieltag, zusammenfassung, spielzeit,
                  szeneninfo, seiten, stoppzeit_sek, dauer_min, dauer_sek, is_wechselschnitt, content, $2, page_length
           FROM dokument_szenen
           WHERE werkstufe_id = $3 AND geloescht = false AND format = 'notiz'`,
          [werkstufe.id, user.name || user.user_id, predecessorId]
        )
      }
    }

    await client.query('COMMIT')
    res.status(201).json({ ...werkstufe, copied_scenes: copiedCount })
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: String(err) })
  } finally {
    client.release()
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/werkstufen/:id — single Werkstufe
// ══════════════════════════════════════════════════════════════════════════════
werkstufenRouter.get('/:id', async (req, res) => {
  const userId = req.user!.user_id
  try {
    const row = await queryOne(
      `SELECT w.*,
              (SELECT COUNT(*)::int FROM dokument_szenen ds
               WHERE ds.werkstufe_id = w.id AND ds.geloescht = false) AS szenen_count,
              f.produktion_id, f.folge_nummer, f.folgen_titel
       FROM werkstufen w
       JOIN folgen f ON f.id = w.folge_id
       WHERE w.id = $1
         AND (
           w.sichtbarkeit IN ('autoren', 'produktion')
           OR (w.sichtbarkeit = 'privat' AND w.privat_gesetzt_von = $2)
           OR w.erstellt_von = $2
           OR (
             (w.sichtbarkeit LIKE 'team:%' OR w.sichtbarkeit LIKE 'colab:%')
             AND SPLIT_PART(w.sichtbarkeit, ':', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             AND EXISTS (
               SELECT 1 FROM colab_gruppen_mitglieder cgm
               WHERE cgm.gruppe_id = SPLIT_PART(w.sichtbarkeit, ':', 2)::uuid
                 AND cgm.user_id = $2
             )
           )
         )`,
      [req.params.id, userId]
    )
    if (!row) return res.status(404).json({ error: 'Werkstufe nicht gefunden' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// PUT /api/werkstufen/:id — update status/sichtbarkeit/label
// When a label with is_produktionsfassung=true is set → auto-lock + auto-baseline.
// When such a label is removed → auto-unlock.
// ══════════════════════════════════════════════════════════════════════════════
werkstufenRouter.put('/:id', async (req, res) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { label, sichtbarkeit, abgegeben, bearbeitung_status, revision_color_id } = req.body
    const hasLabel = 'label' in req.body
    const labelVal = hasLabel ? (label || null) : null
    const hasRevColor = 'revision_color_id' in req.body
    const revColorVal = hasRevColor ? (revision_color_id ?? null) : null

    // When label changes: check if new label is a Produktionsfassung label
    let autoBearbeitungStatus: string | null = null
    if (hasLabel) {
      if (labelVal) {
        // Look up the stage_label by name within the same produktion
        const slRes = await client.query(
          `SELECT sl.is_produktionsfassung FROM stage_labels sl
           JOIN folgen f ON f.produktion_id = sl.produktion_id
           JOIN werkstufen w ON w.folge_id = f.id
           WHERE w.id = $1 AND sl.name = $2
           LIMIT 1`,
          [req.params.id, labelVal]
        )
        if (slRes.rows[0]?.is_produktionsfassung) {
          autoBearbeitungStatus = 'gesperrt'
        } else if (slRes.rows.length > 0) {
          // Known label but not produktionsfassung — unlock if previously gesperrt
          autoBearbeitungStatus = 'entwurf'
        }
      } else {
        // Label cleared — unlock
        autoBearbeitungStatus = 'entwurf'
      }
    }

    const effectiveBearbeitungStatus = autoBearbeitungStatus ?? bearbeitung_status ?? null

    const row = await client.query(
      `UPDATE werkstufen SET
        label = CASE WHEN $1 THEN $2 ELSE label END,
        sichtbarkeit = COALESCE($3, sichtbarkeit),
        abgegeben = COALESCE($4, abgegeben),
        bearbeitung_status = COALESCE($5, bearbeitung_status),
        revision_color_id = CASE WHEN $6 THEN $7 ELSE revision_color_id END
       WHERE id = $8 RETURNING *`,
      [hasLabel, labelVal, sichtbarkeit, abgegeben, effectiveBearbeitungStatus, hasRevColor, revColorVal, req.params.id]
    )
    if (row.rowCount === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Werkstufe nicht gefunden' }) }

    // Auto-create replik baseline when locking (only if not already set)
    if (autoBearbeitungStatus === 'gesperrt' && !row.rows[0].replik_baseline) {
      const scenes = await client.query(
        `SELECT id, replik_count FROM dokument_szenen
         WHERE werkstufe_id = $1 AND geloescht = false
         ORDER BY sort_order, scene_nummer`,
        [req.params.id]
      )
      const baseline: { scene_id: string; start: number; count: number }[] = []
      let cumulative = 0
      for (const s of scenes.rows) {
        const count = s.replik_count ?? 0
        baseline.push({ scene_id: s.id, start: cumulative, count })
        cumulative += count
      }
      await client.query(
        'UPDATE werkstufen SET replik_baseline = $1 WHERE id = $2',
        [JSON.stringify(baseline), req.params.id]
      )
      row.rows[0].replik_baseline = baseline
    }

    // Seitenzahlen-Unlock: wenn Produktionsfassung-Label entfernt → Seitenzahlen freigeben
    if (autoBearbeitungStatus === 'entwurf' && row.rows[0].seitenzahlen_gesperrt) {
      await client.query(
        `UPDATE werkstufen SET seitenzahlen_gesperrt=FALSE, gesperrt_am=NULL, gesperrt_von=NULL WHERE id=$1`,
        [req.params.id]
      )
      row.rows[0].seitenzahlen_gesperrt = false
      row.rows[0].gesperrt_am = null
      row.rows[0].gesperrt_von = null
    }

    await client.query('COMMIT')

    let finalRow = row.rows[0]

    // Seitenzahlen-Lock: finaler Recalc + Einfrieren wenn Produktionsfassung gesetzt
    if (autoBearbeitungStatus === 'gesperrt' && !finalRow.seitenzahlen_gesperrt) {
      try {
        const { recalcPageNumbers } = await import('../utils/recalcPageNumbers')
        await recalcPageNumbers(req.params.id)
        const lockRes = await pool.query(
          `UPDATE werkstufen SET seitenzahlen_gesperrt=TRUE, gesperrt_am=NOW(), gesperrt_von=$1
           WHERE id=$2 RETURNING seitenzahlen_gesperrt, gesperrt_am, gesperrt_von`,
          [req.user!.name || req.user!.user_id, req.params.id]
        )
        if (lockRes.rows[0]) finalRow = { ...finalRow, ...lockRes.rows[0] }
      } catch (e) {
        console.error('[seitenzahlen-lock] error:', e)
      }
    }

    res.json(finalRow)
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: String(err) })
  } finally {
    client.release()
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/werkstufen/:id/seitenzahlen-lock — Seitenzahlen einfrieren (herstellungsleitung/superadmin)
// ══════════════════════════════════════════════════════════════════════════════
werkstufenRouter.post('/:id/seitenzahlen-lock',
  requireRole('herstellungsleitung', 'superadmin'),
  async (req, res) => {
    try {
      const { recalcPageNumbers } = await import('../utils/recalcPageNumbers')
      await recalcPageNumbers(req.params.id)
      const row = await queryOne(
        `UPDATE werkstufen
         SET seitenzahlen_gesperrt=TRUE, gesperrt_am=NOW(), gesperrt_von=$1
         WHERE id=$2 RETURNING *`,
        [req.user!.name || req.user!.user_id, req.params.id]
      )
      if (!row) return res.status(404).json({ error: 'Werkstufe nicht gefunden' })
      res.json(row)
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  }
)

// ══════════════════════════════════════════════════════════════════════════════
// DELETE /api/werkstufen/:id/seitenzahlen-lock — Seitenzahlen entsperren (nur superadmin)
// ══════════════════════════════════════════════════════════════════════════════
werkstufenRouter.delete('/:id/seitenzahlen-lock',
  requireRole('superadmin'),
  async (req, res) => {
    try {
      const row = await queryOne(
        `UPDATE werkstufen
         SET seitenzahlen_gesperrt=FALSE, gesperrt_am=NULL, gesperrt_von=NULL
         WHERE id=$1 RETURNING *`,
        [req.params.id]
      )
      if (!row) return res.status(404).json({ error: 'Werkstufe nicht gefunden' })
      res.json(row)
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  }
)

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/werkstufen/:id/start-revision — Aktiviert Revision mit Farbe + Baseline-Snapshot
// ══════════════════════════════════════════════════════════════════════════════
werkstufenRouter.post('/:id/start-revision', async (req, res) => {
  const { revision_color_id } = req.body
  if (!revision_color_id) return res.status(400).json({ error: 'revision_color_id required' })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Set revision color on werkstufe
    const ws = await client.query(
      'UPDATE werkstufen SET revision_color_id = $1 WHERE id = $2 RETURNING *',
      [revision_color_id, req.params.id]
    )
    if (ws.rowCount === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Werkstufe nicht gefunden' }) }

    // Snapshot all active scenes as revision baseline:
    // Insert szenen_revisionen rows where old_value = new_value = current block JSON.
    // These rows will be updated on subsequent saves when blocks change.
    const scenes = await client.query(
      `SELECT id, content FROM dokument_szenen WHERE werkstufe_id = $1 AND geloescht = false AND content IS NOT NULL`,
      [req.params.id]
    )
    for (const scene of scenes.rows) {
      let blocks: any[]
      try { blocks = typeof scene.content === 'string' ? JSON.parse(scene.content) : (Array.isArray(scene.content) ? scene.content : scene.content?.content ?? []) }
      catch { blocks = [] }

      for (const block of blocks) {
        const nodeId = block?.attrs?.node_id
        if (!nodeId) continue  // nur Blöcke mit node_id snapshotten
        const blockJson = JSON.stringify(block)
        await client.query(
          `INSERT INTO szenen_revisionen (dokument_szene_id, field_type, block_uuid, block_type, old_value, new_value)
           VALUES ($1, 'content_block', $2, $3, $4, $4)
           ON CONFLICT (dokument_szene_id, block_uuid) WHERE field_type = 'content_block' AND block_uuid IS NOT NULL DO NOTHING`,
          [scene.id, nodeId, block?.type ?? 'unknown', blockJson]
        )
      }
    }

    await client.query('COMMIT')
    res.json(ws.rows[0])
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: String(err) })
  } finally {
    client.release()
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// DELETE /api/werkstufen/:id/start-revision — Beendet Revision, löscht Deltas
// ══════════════════════════════════════════════════════════════════════════════
werkstufenRouter.delete('/:id/start-revision', async (req, res) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Clear revision color
    await client.query(
      'UPDATE werkstufen SET revision_color_id = NULL WHERE id = $1',
      [req.params.id]
    )

    // Delete all szenen_revisionen for scenes in this werkstufe
    await client.query(
      `DELETE FROM szenen_revisionen sr
       USING dokument_szenen ds
       WHERE sr.dokument_szene_id = ds.id AND ds.werkstufe_id = $1`,
      [req.params.id]
    )

    await client.query('COMMIT')
    res.json({ ok: true })
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: String(err) })
  } finally {
    client.release()
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// PUT /api/werkstufen/:id/einfrieren — Revision abschließen + Werkstufe einfrieren
// Setzt eingefroren=true, ist_revisionsstufe=true, vergibt revisionsstufen_nr,
// löscht revision_color_id. Behält szenen_revisionen als historischen Nachweis.
// ══════════════════════════════════════════════════════════════════════════════
werkstufenRouter.put('/:id/einfrieren', async (req, res) => {
  const user = req.user!
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Werkstufe laden — brauchen folge_id für revisionsstufen_nr-Vergabe
    const ws = await client.query(
      `SELECT w.*, f.produktion_id
       FROM werkstufen w
       JOIN folgen f ON f.id = w.folge_id
       WHERE w.id = $1`,
      [req.params.id]
    )
    if (ws.rowCount === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Werkstufe nicht gefunden' })
    }
    if (ws.rows[0].eingefroren) {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'Werkstufe ist bereits eingefroren' })
    }

    // Nächste revisionsstufen_nr für diese Produktion ermitteln
    const nrResult = await client.query(
      `SELECT COALESCE(MAX(w2.revisionsstufen_nr), 0) + 1 AS next_nr
       FROM werkstufen w2
       JOIN folgen f2 ON f2.id = w2.folge_id
       WHERE f2.produktion_id = $1 AND w2.ist_revisionsstufe = TRUE`,
      [ws.rows[0].produktion_id]
    )
    const nextNr = nrResult.rows[0].next_nr as number

    const updated = await client.query(
      `UPDATE werkstufen SET
         eingefroren        = TRUE,
         eingefroren_am     = NOW(),
         eingefroren_von    = $1,
         ist_revisionsstufe = TRUE,
         revisionsstufen_nr = $2,
         revision_color_id  = NULL
       WHERE id = $3
       RETURNING *`,
      [user.user_id, nextNr, req.params.id]
    )

    await client.query('COMMIT')
    res.json({ ...updated.rows[0], revisionsstufen_nr: nextNr })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    res.status(500).json({ error: String(err) })
  } finally {
    client.release()
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/werkstufen/:id/diff/:otherId — Vergleich zweier Werkstufen auf Block-Ebene
// Gibt geänderte block_uuids pro Szene zurück (phase 3: scene-level diff).
// ══════════════════════════════════════════════════════════════════════════════
werkstufenRouter.get('/:id/diff/:otherId', async (req, res) => {
  try {
    const { id, otherId } = req.params

    // Alle Szenen der Basis-Werkstufe
    const baseSzenen = await query(
      `SELECT ds.id, ds.scene_identity_id, ds.content
       FROM dokument_szenen ds
       WHERE ds.werkstufe_id = $1 AND ds.geloescht = FALSE`,
      [id]
    )
    // Alle Szenen der Vergleichs-Werkstufe, indiziert nach scene_identity_id
    const cmpSzenen = await query(
      `SELECT ds.id, ds.scene_identity_id, ds.content
       FROM dokument_szenen ds
       WHERE ds.werkstufe_id = $1 AND ds.geloescht = FALSE`,
      [otherId]
    )
    const cmpMap = new Map<string, any>(cmpSzenen.map((s: any) => [s.scene_identity_id, s]))

    const result: Array<{
      scene_identity_id: string
      base_scene_id: string
      cmp_scene_id: string | null
      status: 'changed' | 'added' | 'removed'
      changed_block_uuids: string[]
    }> = []

    const toBlocks = (content: any): any[] => {
      if (!content) return []
      const raw = typeof content === 'string' ? JSON.parse(content) : content
      return Array.isArray(raw) ? raw : (raw?.content ?? [])
    }

    for (const base of baseSzenen) {
      const cmp = cmpMap.get(base.scene_identity_id)
      if (!cmp) {
        result.push({ scene_identity_id: base.scene_identity_id, base_scene_id: base.id, cmp_scene_id: null, status: 'removed', changed_block_uuids: [] })
        continue
      }
      cmpMap.delete(base.scene_identity_id)

      const baseBlocks = toBlocks(base.content)
      const cmpBlocks  = toBlocks(cmp.content)
      const baseMap = new Map<string, string>(baseBlocks.map((b: any) => [b?.attrs?.node_id, JSON.stringify(b)]).filter(([id]) => id) as any)
      const cmpMap2  = new Map<string, string>(cmpBlocks.map((b: any) => [b?.attrs?.node_id, JSON.stringify(b)]).filter(([id]) => id) as any)

      const changed: string[] = []
      for (const [nid, json] of baseMap) { if (cmpMap2.get(nid) !== json) changed.push(nid) }
      for (const [nid] of cmpMap2)       { if (!baseMap.has(nid)) changed.push(nid) }

      if (changed.length > 0 || baseBlocks.length !== cmpBlocks.length) {
        result.push({ scene_identity_id: base.scene_identity_id, base_scene_id: base.id, cmp_scene_id: cmp.id, status: 'changed', changed_block_uuids: changed })
      }
    }
    // Szenen die nur im anderen Stage existieren
    for (const [sid, cmp] of cmpMap) {
      result.push({ scene_identity_id: sid, base_scene_id: req.params.id, cmp_scene_id: cmp.id, status: 'added', changed_block_uuids: [] })
    }

    res.json({ diff: result, total_changed_scenes: result.length })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// DELETE /api/werkstufen/:id — delete Werkstufe
// ══════════════════════════════════════════════════════════════════════════════
werkstufenRouter.delete('/:id', async (req, res) => {
  const user = req.user!
  try {
    const ws = await queryOne('SELECT erstellt_von FROM werkstufen WHERE id = $1', [req.params.id])
    if (!ws) return res.status(404).json({ error: 'Werkstufe nicht gefunden' })
    if (ws.erstellt_von !== user.user_id && user.role !== 'admin' && user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Nur der Ersteller kann diese Werkstufe löschen' })
    }
    await pool.query('DELETE FROM werkstufen WHERE id = $1', [req.params.id])
    res.status(204).send()
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/werkstufen/:id/apply-vorlage — apply a dokument_vorlage template
werkstufenRouter.post('/:id/apply-vorlage', async (req, res) => {
  try {
    const { vorlage_id } = req.body
    if (!vorlage_id) return res.status(400).json({ error: 'vorlage_id required' })
    const count = await applyVorlage(req.params.id, vorlage_id, req.user!.name || req.user!.user_id)
    res.json({ ok: true, inserted: count })
  } catch (err: any) {
    res.status(500).json({ error: err.message || String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/werkstufen/:id/replik-offsets — cumulative replik offsets per scene
// Returns: { offsets: { [scene_id]: number }, total: number, baseline: {...} | null }
// ══════════════════════════════════════════════════════════════════════════════
werkstufenRouter.get('/:id/replik-offsets', async (req, res) => {
  try {
    const ws = await queryOne('SELECT id, replik_baseline FROM werkstufen WHERE id = $1', [req.params.id])
    if (!ws) return res.status(404).json({ error: 'Werkstufe nicht gefunden' })

    const scenes = await query(
      `SELECT id, replik_count FROM dokument_szenen
       WHERE werkstufe_id = $1 AND geloescht = false
       ORDER BY sort_order, scene_nummer`,
      [req.params.id]
    )

    const offsets: Record<string, number> = {}
    let cumulative = 0
    for (const s of scenes) {
      offsets[s.id] = cumulative
      cumulative += (s.replik_count ?? 0)
    }

    res.json({
      offsets,
      total: cumulative,
      baseline: ws.replik_baseline ?? null,
    })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/werkstufen/:id/replik-baseline — snapshot current replik numbers (for lock)
// ══════════════════════════════════════════════════════════════════════════════
werkstufenRouter.post('/:id/replik-baseline', async (req, res) => {
  try {
    const scenes = await query(
      `SELECT id, replik_count FROM dokument_szenen
       WHERE werkstufe_id = $1 AND geloescht = false
       ORDER BY sort_order, scene_nummer`,
      [req.params.id]
    )

    // Build baseline: ordered array of { scene_id, start, count }
    const baseline: { scene_id: string; start: number; count: number }[] = []
    let cumulative = 0
    for (const s of scenes) {
      const count = s.replik_count ?? 0
      baseline.push({ scene_id: s.id, start: cumulative, count })
      cumulative += count
    }

    const row = await queryOne(
      'UPDATE werkstufen SET replik_baseline = $1 WHERE id = $2 RETURNING id',
      [JSON.stringify(baseline), req.params.id]
    )
    if (!row) return res.status(404).json({ error: 'Werkstufe nicht gefunden' })

    res.json({ ok: true, baseline, total: cumulative })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/werkstufen/:id/flashback-szenen?q= — cross-episode scene search
// Returns scenes from all OTHER folgen of the same produktion (latest werkstufe)
// for use in the Flashback-Referenz picker
// ══════════════════════════════════════════════════════════════════════════════
werkstufenRouter.get('/:id/flashback-szenen', async (req, res) => {
  try {
    const werkId = req.params.id
    const q = (req.query.q as string | undefined)?.trim() || null

    const rows = await query(
      `WITH current_ws AS (
         SELECT w.folge_id, f.produktion_id
         FROM werkstufen w JOIN folgen f ON f.id = w.folge_id
         WHERE w.id = $1
       ),
       latest_ws AS (
         SELECT DISTINCT ON (w.folge_id)
           w.id AS werkstufe_id, w.folge_id, f.folge_nummer, w.version_nummer
         FROM werkstufen w
         JOIN folgen f ON f.id = w.folge_id
         WHERE f.produktion_id = (SELECT produktion_id FROM current_ws)
           AND w.folge_id != (SELECT folge_id FROM current_ws)
         ORDER BY w.folge_id, w.version_nummer DESC
       )
       SELECT ds.id, ds.scene_identity_id, ds.scene_nummer, ds.scene_nummer_suffix,
              ds.ort_name, ds.int_ext, ds.tageszeit,
              lw.werkstufe_id, lw.folge_id, lw.folge_nummer
       FROM dokument_szenen ds
       JOIN latest_ws lw ON lw.werkstufe_id = ds.werkstufe_id
       WHERE ds.geloescht = false
         AND ($2::text IS NULL
              OR ds.ort_name ILIKE '%' || $2 || '%'
              OR ds.scene_nummer::text LIKE '%' || $2 || '%')
       ORDER BY lw.folge_nummer, ds.sort_order, ds.scene_nummer
       LIMIT 60`,
      [werkId, q]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/werkstufen/:id/laenge — Summe aller Stoppzeiten einer Werkstufe
// ══════════════════════════════════════════════════════════════════════════════
werkstufenRouter.get('/:id/laenge', async (req, res) => {
  try {
    const werkId = req.params.id
    const row = await queryOne(
      `SELECT COALESCE(SUM(stoppzeit_sek), 0)::text AS stoppzeit_total_sek
       FROM dokument_szenen
       WHERE werkstufe_id = $1 AND geloescht = false`,
      [werkId]
    )
    const totalSek = parseInt(row?.stoppzeit_total_sek ?? '0', 10) || 0
    const formatted = totalSek > 0
      ? `${Math.floor(totalSek / 60)}:${String(totalSek % 60).padStart(2, '0')}`
      : null
    res.json({ stoppzeit_total_sek: totalSek, formatted })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// Werkstufen-Szenen Router
// Mounted at /api/werkstufen/:werkId/szenen
// ══════════════════════════════════════════════════════════════════════════════
export const werkstufenSzenenRouter = Router({ mergeParams: true })
werkstufenSzenenRouter.use(authMiddleware)

// GET /api/werkstufen/:werkId/szenen — all scenes of a Werkstufe
werkstufenSzenenRouter.get('/', async (req, res) => {
  try {
    const werkId = (req.params as any).werkId
    const rows = await query(
      `SELECT ds.*, si.folge_id AS identity_folge_id,
        (SELECT ds2.scene_nummer
         FROM dokument_szenen ds2
         JOIN werkstufen w_l ON w_l.id = ds2.werkstufe_id
         WHERE ds2.scene_identity_id = ds.flashback_referenz_id
           AND w_l.folge_id = (SELECT folge_id FROM werkstufen WHERE id = ds.flashback_referenz_werkstufe_id)
           AND ds2.geloescht = false
         ORDER BY w_l.version_nummer DESC LIMIT 1) AS flashback_referenz_scene_nummer,
        (SELECT f.folge_nummer FROM werkstufen w JOIN folgen f ON f.id = w.folge_id
         WHERE w.id = ds.flashback_referenz_werkstufe_id) AS flashback_referenz_folge_nummer,
        (SELECT string_agg(c.name, ', ' ORDER BY c.name)
         FROM scene_characters sc
         JOIN characters c ON c.id = sc.character_id
         LEFT JOIN character_kategorien ck ON ck.id = sc.kategorie_id
         WHERE sc.scene_identity_id = ds.scene_identity_id
           AND (ck.typ = 'rolle' OR ck.typ IS NULL)) AS rollen_names
       FROM dokument_szenen ds
       LEFT JOIN scene_identities si ON si.id = ds.scene_identity_id
       WHERE ds.werkstufe_id = $1 AND ds.geloescht = false
       ORDER BY ds.sort_order, ds.scene_nummer`,
      [werkId]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/werkstufen/:werkId/szenen — add new scene
werkstufenSzenenRouter.post('/', async (req, res) => {
  const werkId = (req.params as any).werkId
  const {
    scene_nummer, int_ext, tageszeit, ort_name, zusammenfassung,
    content, stoppzeit_sek, sort_order, after_scene_id, format,
    scene_identity_id,
  } = req.body
  const user = req.user!

  try {
    // Get Werkstufe to determine folge
    const ws = await queryOne(
      `SELECT w.id, w.typ, f.produktion_id, w.folge_id FROM werkstufen w
       JOIN folgen f ON f.id = w.folge_id WHERE w.id = $1`,
      [werkId]
    )
    if (!ws) return res.status(404).json({ error: 'Werkstufe nicht gefunden' })

    // Create or reuse scene_identity
    let identityId = scene_identity_id
    if (!identityId) {
      const identity = await queryOne(
        `INSERT INTO scene_identities (folge_id, created_by) VALUES ($1, $2) RETURNING id`,
        [ws.folge_id, user.user_id]
      )
      identityId = identity.id
    }

    // Determine sort_order and scene_nummer
    let finalSortOrder = sort_order ?? 0
    let finalSceneNummer = scene_nummer

    if (after_scene_id) {
      const refScene = await queryOne(
        'SELECT sort_order, scene_nummer FROM dokument_szenen WHERE id = $1',
        [after_scene_id]
      )
      if (refScene) {
        finalSortOrder = refScene.sort_order + 0.5
        finalSceneNummer = finalSceneNummer || (refScene.scene_nummer + 1)
      }
    } else if (!finalSceneNummer) {
      const maxRow = await queryOne(
        `SELECT MAX(ds.scene_nummer) AS mx
         FROM dokument_szenen ds
         JOIN scene_identities si ON si.id = ds.scene_identity_id
         WHERE ds.werkstufe_id = $1 AND ds.geloescht = false AND si.folge_id = $2`,
        [werkId, ws.folge_id]
      )
      finalSceneNummer = (maxRow?.mx ?? 0) + 1
      const maxSort = await queryOne(
        'SELECT MAX(sort_order) AS ms FROM dokument_szenen WHERE werkstufe_id = $1 AND geloescht = false',
        [werkId]
      )
      finalSortOrder = (maxSort?.ms ?? 0) + 1
    }

    const pl = calcPageLength(content || [])
    const row = await queryOne(
      `INSERT INTO dokument_szenen
         (werkstufe_id, scene_identity_id, sort_order, scene_nummer,
          format, int_ext, tageszeit, ort_name, zusammenfassung, content,
          stoppzeit_sek, updated_by, page_length)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [
        werkId, identityId, Math.round(finalSortOrder), finalSceneNummer,
        format || ws.typ || 'drehbuch',
        int_ext || 'INT', tageszeit || 'TAG', ort_name || null,
        zusammenfassung || null, JSON.stringify(content || []),
        stoppzeit_sek || null, user.name || user.user_id, pl,
      ]
    )

    // Reindex sort_orders if inserted after
    if (after_scene_id) {
      await pool.query(`
        WITH ranked AS (
          SELECT id, ROW_NUMBER() OVER (ORDER BY sort_order, scene_nummer) AS rn
          FROM dokument_szenen WHERE werkstufe_id = $1 AND geloescht = false
        )
        UPDATE dokument_szenen SET sort_order = ranked.rn
        FROM ranked WHERE dokument_szenen.id = ranked.id
      `, [werkId])
    }

    res.status(201).json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PATCH /api/werkstufen/:werkId/szenen/reorder — reorder scenes
// Akzeptiert optional nonSceneAnchors: { [id]: scene_nummer | null } für format='notiz'-Elemente
// die nach der letzten echten Szene liegen (Dialog-Ergebnis aus der Szenenübersicht).
// Für alle anderen format='notiz'-Elemente wird scene_nummer automatisch aus der Position berechnet
// (= scene_nummer der letzten echten Szene davor, oder null wenn vor allen echten Szenen).
werkstufenSzenenRouter.patch('/reorder', async (req, res) => {
  const { order, nonSceneAnchors = {} } = req.body
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be array of scene ids' })

  const werkId = (req.params as any).werkId
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Format + scene_nummer aller Rows laden um format='notiz' zu erkennen
    const { rows: meta } = await client.query(
      'SELECT id, format, scene_nummer FROM dokument_szenen WHERE werkstufe_id = $1 AND geloescht = false',
      [werkId]
    )
    const metaMap = new Map<string, { format: string; scene_nummer: number | null }>(
      meta.map(r => [String(r.id), { format: r.format, scene_nummer: r.scene_nummer }])
    )

    let lastRealSceneNummer: number | null = null
    for (let i = 0; i < order.length; i++) {
      const id = String(order[i])
      const row = metaMap.get(id)
      if (!row) continue

      if (row.format !== 'notiz') {
        // Echte Szene: nur sort_order aktualisieren, scene_nummer tracken
        await client.query(
          'UPDATE dokument_szenen SET sort_order = $1, updated_at = NOW() WHERE id = $2 AND werkstufe_id = $3',
          [i + 1, order[i], werkId]
        )
        lastRealSceneNummer = row.scene_nummer
      } else {
        // format='notiz': sort_order + scene_nummer aktualisieren
        // nonSceneAnchors überschreibt die automatische Berechnung (Dialog-Ergebnis)
        let newAnchor: number | null
        if (Object.prototype.hasOwnProperty.call(nonSceneAnchors, id)) {
          newAnchor = nonSceneAnchors[id] ?? null
        } else {
          newAnchor = lastRealSceneNummer
        }
        await client.query(
          'UPDATE dokument_szenen SET sort_order = $1, scene_nummer = $2, updated_at = NOW() WHERE id = $3 AND werkstufe_id = $4',
          [i + 1, newAnchor, order[i], werkId]
        )
      }
    }
    await client.query('COMMIT')
    const { rows } = await client.query(
      'SELECT * FROM dokument_szenen WHERE werkstufe_id = $1 AND geloescht = false ORDER BY sort_order, scene_nummer',
      [werkId]
    )
    res.json(rows)
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: String(err) })
  } finally {
    client.release()
  }
})

// POST /api/werkstufen/:werkId/szenen/renumber — sequential renumbering
// Only renumbers drehbuch/storyline scenes (format != 'notiz'); updates sort_order for all scenes.
werkstufenSzenenRouter.post('/renumber', async (req, res) => {
  const werkId = (req.params as any).werkId
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: scenes } = await client.query(
      'SELECT * FROM dokument_szenen WHERE werkstufe_id = $1 AND geloescht = false ORDER BY sort_order, scene_nummer',
      [werkId]
    )
    let sceneCounter = 1
    for (let i = 0; i < scenes.length; i++) {
      if (scenes[i].format !== 'notiz') {
        await client.query(
          'UPDATE dokument_szenen SET scene_nummer = $1, scene_nummer_suffix = NULL, sort_order = $2, updated_at = NOW() WHERE id = $3',
          [sceneCounter, i + 1, scenes[i].id]
        )
        sceneCounter++
      } else {
        await client.query(
          'UPDATE dokument_szenen SET sort_order = $1, updated_at = NOW() WHERE id = $2',
          [i + 1, scenes[i].id]
        )
      }
    }
    await client.query('COMMIT')
    const { rows } = await client.query(
      `SELECT ds.*, si.folge_id AS identity_folge_id
       FROM dokument_szenen ds
       LEFT JOIN scene_identities si ON si.id = ds.scene_identity_id
       WHERE ds.werkstufe_id = $1 AND ds.geloescht = false
       ORDER BY ds.sort_order, ds.scene_nummer`,
      [werkId]
    )
    res.json({ scenes: rows, renumbered: true })
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: String(err) })
  } finally {
    client.release()
  }
})

// GET /api/werkstufen/:werkId/szenen/vorstopp-uebersicht — bulk vorstopp per scene
werkstufenSzenenRouter.get('/vorstopp-uebersicht', async (req, res) => {
  const werkId = (req.params as any).werkId
  try {
    const szenen = await query(
      `SELECT id, scene_nummer, scene_nummer_suffix, ort_name, int_ext, tageszeit, stoppzeit_sek, scene_identity_id
       FROM dokument_szenen WHERE werkstufe_id = $1 AND geloescht = false ORDER BY sort_order, scene_nummer`,
      [werkId]
    )
    const identityIds = szenen.map((s: any) => s.scene_identity_id).filter(Boolean)
    let vorstoppMap: Record<string, Record<string, number | null>> = {}
    if (identityIds.length > 0) {
      const placeholders = identityIds.map((_: any, i: number) => `$${i + 1}`).join(',')
      const vorstoppRows = await query(
        `SELECT DISTINCT ON (scene_identity_id, stage) scene_identity_id, stage, dauer_sekunden
         FROM szenen_vorstopp WHERE scene_identity_id IN (${placeholders})
         ORDER BY scene_identity_id, stage, created_at DESC`,
        identityIds
      )
      for (const row of vorstoppRows) {
        if (!vorstoppMap[row.scene_identity_id]) vorstoppMap[row.scene_identity_id] = {}
        vorstoppMap[row.scene_identity_id][row.stage] = row.dauer_sekunden
      }
    }
    const result = szenen.map((s: any) => ({
      ...s,
      vorstopp: vorstoppMap[s.scene_identity_id] ?? {},
    }))
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/werkstufen/:a/szenen/diff/:b — diff between two Werkstufen
werkstufenSzenenRouter.get('/diff/:rightId', async (req, res) => {
  const leftId = (req.params as any).werkId
  const rightId = req.params.rightId
  try {
    const [leftWs, rightWs] = await Promise.all([
      queryOne('SELECT * FROM werkstufen WHERE id = $1', [leftId]),
      queryOne('SELECT * FROM werkstufen WHERE id = $1', [rightId]),
    ])
    if (!leftWs) return res.status(404).json({ error: 'Linke Werkstufe nicht gefunden' })
    if (!rightWs) return res.status(404).json({ error: 'Rechte Werkstufe nicht gefunden' })

    const [leftScenes, rightScenes] = await Promise.all([
      query('SELECT * FROM dokument_szenen WHERE werkstufe_id = $1 AND geloescht = false ORDER BY sort_order, scene_nummer', [leftId]),
      query('SELECT * FROM dokument_szenen WHERE werkstufe_id = $1 AND geloescht = false ORDER BY sort_order, scene_nummer', [rightId]),
    ])

    // Match by scene_identity_id
    const leftMap = new Map(leftScenes.map((s: any, i: number) => [s.scene_identity_id, { scene: s, idx: i }]))
    const rightMap = new Map(rightScenes.map((s: any, i: number) => [s.scene_identity_id, { scene: s, idx: i }]))

    const allIdentities = new Set<string>()
    for (const s of leftScenes) allIdentities.add(s.scene_identity_id)
    for (const s of rightScenes) allIdentities.add(s.scene_identity_id)

    const matches: any[] = []
    for (const id of allIdentities) {
      const left = leftMap.get(id)
      const right = rightMap.get(id)

      const changes: string[] = []
      if (!left) {
        changes.push('neu')
      } else if (!right) {
        changes.push('gestrichen')
      } else {
        const fields = ['ort_name', 'int_ext', 'tageszeit', 'zusammenfassung', 'spieltag', 'spielzeit', 'szeneninfo', 'stoppzeit_sek']
        for (const f of fields) {
          if (String(left.scene[f] ?? '') !== String(right.scene[f] ?? '')) changes.push(f)
        }
        const lc = JSON.stringify(left.scene.content || [])
        const rc = JSON.stringify(right.scene.content || [])
        if (lc !== rc) changes.push('content')
      }

      matches.push({
        scene_identity_id: id,
        left_idx: left?.idx ?? null,
        right_idx: right?.idx ?? null,
        changes,
      })
    }

    res.json({
      left: { werkstufe: leftWs, szenen: leftScenes },
      right: { werkstufe: rightWs, szenen: rightScenes },
      matches,
    })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// Werkstufen-Dokument-Snapshots (v140)
// Snapshot aller Szenen einer Werkstufe zu einem Zeitpunkt
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/werkstufen/:id/snapshots — Liste der letzten 30 Dokument-Snapshots
werkstufenRouter.get('/:id/snapshots', async (req, res) => {
  try {
    const rows = await query(
      `SELECT id, werkstufe_id, created_by, created_by_name, created_at,
              typ, szenen_count, text_preview, is_current
         FROM werkstufen_snapshots
        WHERE werkstufe_id = $1
        ORDER BY created_at DESC
        LIMIT 30`,
      [req.params.id]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/werkstufen/:id/snapshots — Dokument-Snapshot anlegen
werkstufenRouter.post('/:id/snapshots', async (req, res) => {
  try {
    const werkId = req.params.id
    const { typ = 'auto' } = req.body as { typ?: string }

    // Alle aktiven Szenen der Werkstufe laden
    const szenen = await query(
      `SELECT id, scene_nummer, scene_nummer_suffix, ort_name, content
         FROM dokument_szenen
        WHERE werkstufe_id = $1 AND geloescht = false
        ORDER BY sort_order, scene_nummer`,
      [werkId]
    )
    if (szenen.length === 0) return res.json({ ok: true, skipped: true, reason: 'no_scenes' })

    // Text-Preview aus erster Szene
    const extractPreview = (content: any): string => {
      const nodes = Array.isArray(content) ? content : (content?.content ?? [])
      const texts: string[] = []
      const visit = (n: any) => {
        if (typeof n?.text === 'string') texts.push(n.text)
        if (Array.isArray(n?.content)) n.content.forEach(visit)
      }
      nodes.forEach(visit)
      return texts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 150)
    }
    const preview = extractPreview(szenen[0].content)

    // Snapshot-Metadaten anlegen
    const snap = await queryOne(
      `INSERT INTO werkstufen_snapshots
         (werkstufe_id, created_by, created_by_name, typ, szenen_count, text_preview)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [werkId, req.user?.user_id ?? null, req.user?.name ?? null,
       typ, szenen.length, preview || null]
    )

    // Szeneninhalte einfügen
    for (const sz of szenen) {
      const sceneNr = sz.scene_nummer != null
        ? `${sz.scene_nummer}${sz.scene_nummer_suffix ?? ''}`
        : null
      await pool.query(
        `INSERT INTO werkstufen_snapshot_szenen
           (snapshot_id, szene_id, scene_nummer, scene_info, content)
         VALUES ($1, $2, $3, $4, $5)`,
        [snap!.id, sz.id, sceneNr, sz.ort_name ?? null, JSON.stringify(sz.content ?? [])]
      )
    }

    // Älteste Snapshots prunen (max 30 pro Werkstufe) — "restore"-Einträge werden mitgezählt
    await pool.query(
      `DELETE FROM werkstufen_snapshots
        WHERE werkstufe_id = $1
          AND id NOT IN (
            SELECT id FROM werkstufen_snapshots
             WHERE werkstufe_id = $1
             ORDER BY created_at DESC
             LIMIT 30
          )`,
      [werkId]
    )

    res.json(snap)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/werkstufen/:id/snapshots/:snapId — Vollinhalt eines Dokument-Snapshots
werkstufenRouter.get('/:id/snapshots/:snapId', async (req, res) => {
  try {
    const snap = await queryOne(
      `SELECT id, werkstufe_id, created_by, created_by_name, created_at, typ, szenen_count, text_preview
         FROM werkstufen_snapshots
        WHERE id = $1 AND werkstufe_id = $2`,
      [req.params.snapId, req.params.id]
    )
    if (!snap) return res.status(404).json({ error: 'Snapshot nicht gefunden' })

    const szenen = await query(
      `SELECT szene_id, scene_nummer, scene_info, content
         FROM werkstufen_snapshot_szenen
        WHERE snapshot_id = $1`,
      [req.params.snapId]
    )
    res.json({ ...snap, szenen })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/werkstufen/:id/snapshots/:snapId/restore
// 1. Sichert aktuellen Stand (typ=restore) als Sicherungspunkt
// 2. Überschreibt alle Szenen mit dem Snapshot-Inhalt
werkstufenRouter.post('/:id/snapshots/:snapId/restore', async (req, res) => {
  try {
    const werkId = req.params.id
    const snapId = req.params.snapId

    // Snapshot laden
    const snap = await queryOne(
      `SELECT ws.*, json_agg(json_build_object(
         'szene_id', wss.szene_id,
         'content', wss.content
       )) AS szenen
       FROM werkstufen_snapshots ws
       JOIN werkstufen_snapshot_szenen wss ON wss.snapshot_id = ws.id
       WHERE ws.id = $1 AND ws.werkstufe_id = $2
       GROUP BY ws.id`,
      [snapId, werkId]
    )
    if (!snap) return res.status(404).json({ error: 'Snapshot nicht gefunden' })

    const restoredSzenen: { szeneId: string; content: any }[] = snap.szenen ?? []

    // 1. Aktuellen Stand als "restore"-Sicherung speichern
    const szenenAktuell = await query(
      `SELECT id, scene_nummer, scene_nummer_suffix, ort_name, content
         FROM dokument_szenen
        WHERE werkstufe_id = $1 AND geloescht = false
        ORDER BY sort_order, scene_nummer`,
      [werkId]
    )

    if (szenenAktuell.length > 0) {
      const extractPreview = (content: any): string => {
        const nodes = Array.isArray(content) ? content : (content?.content ?? [])
        const texts: string[] = []
        const visit = (n: any) => {
          if (typeof n?.text === 'string') texts.push(n.text)
          if (Array.isArray(n?.content)) n.content.forEach(visit)
        }
        nodes.forEach(visit)
        return texts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 150)
      }

      const backupSnap = await queryOne(
        `INSERT INTO werkstufen_snapshots
           (werkstufe_id, created_by, created_by_name, typ, szenen_count, text_preview)
         VALUES ($1, $2, $3, 'restore', $4, $5)
         RETURNING *`,
        [werkId, req.user?.user_id ?? null, req.user?.name ?? null,
         szenenAktuell.length, extractPreview(szenenAktuell[0].content) || null]
      )

      for (const sz of szenenAktuell) {
        const sceneNr = sz.scene_nummer != null
          ? `${sz.scene_nummer}${sz.scene_nummer_suffix ?? ''}`
          : null
        await pool.query(
          `INSERT INTO werkstufen_snapshot_szenen
             (snapshot_id, szene_id, scene_nummer, scene_info, content)
           VALUES ($1, $2, $3, $4, $5)`,
          [backupSnap!.id, sz.id, sceneNr, sz.ort_name ?? null, JSON.stringify(sz.content ?? [])]
        )
      }
    }

    // 2. Szenen wiederherstellen (nur existierende, nicht gelöschte)
    const updated: { szeneId: string; content: any }[] = []
    for (const item of (restoredSzenen as unknown as { szene_id: string; content: any }[])) {
      const row = await queryOne(
        `UPDATE dokument_szenen
            SET content = $1, updated_at = now(), updated_by = $2
          WHERE id = $3 AND geloescht = false
          RETURNING id`,
        [JSON.stringify(item.content), req.user?.name ?? null, item.szene_id]
      )
      if (row) updated.push({ szeneId: item.szene_id, content: item.content })
    }

    // 3. is_current-Marker setzen
    await pool.query(
      'UPDATE werkstufen_snapshots SET is_current = FALSE WHERE werkstufe_id = $1',
      [werkId]
    )
    await pool.query(
      'UPDATE werkstufen_snapshots SET is_current = TRUE WHERE id = $1',
      [snapId]
    )

    // Pruning
    await pool.query(
      `DELETE FROM werkstufen_snapshots
        WHERE werkstufe_id = $1
          AND id NOT IN (
            SELECT id FROM werkstufen_snapshots
             WHERE werkstufe_id = $1
             ORDER BY created_at DESC
             LIMIT 30
          )`,
      [werkId]
    )

    res.json({ ok: true, restored_count: updated.length, szenen: updated })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})
