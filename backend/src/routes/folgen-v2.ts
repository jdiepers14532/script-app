import { Router } from 'express'
import { query, queryOne } from '../db'
import { authMiddleware } from '../auth'

const PROD_DB_URL  = process.env.PROD_DB_URL  ?? 'http://127.0.0.1:3005'
const INTERNAL_KEY = process.env.PRODUKTION_INTERNAL_SECRET ?? 'prod-internal-2026'

// ── Folgen v2 Router ─────────────────────────────────────────────────────────
// Mounted at /api/v2/folgen — reads from merged `folgen` table
export const folgenV2Router = Router()
folgenV2Router.use(authMiddleware)

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/v2/folgen/air-date?produktion_id=X&folge_nr=N
// Liefert das echte Sendedatum aus der Produktionsdatenbank (broadcast_events)
folgenV2Router.get('/air-date', async (req, res) => {
  try {
    const { produktion_id, folge_nr } = req.query
    if (!produktion_id || !folge_nr) return res.json({ air_date: null })

    const prod = await queryOne(
      'SELECT produktion_db_id FROM produktionen WHERE id = $1',
      [produktion_id]
    )
    if (!prod?.produktion_db_id) return res.json({ air_date: null })

    const r = await fetch(
      `${PROD_DB_URL}/api/internal/productions/${prod.produktion_db_id}/air-date?folge_nr=${encodeURIComponent(String(folge_nr))}`,
      { headers: { 'x-internal-key': INTERNAL_KEY }, signal: AbortSignal.timeout(3000) }
    )
    if (!r.ok) return res.json({ air_date: null })
    const d = await r.json() as any
    res.json({ air_date: d?.air_date ?? null })
  } catch (err) {
    res.json({ air_date: null })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/v2/folgen/block?produktion_id=X&folge_nr=N
// Berechnet den Block-Namen aus den Produktionsdaten (bloecke-Array)
folgenV2Router.get('/block', async (req, res) => {
  try {
    const { produktion_id, folge_nr } = req.query
    if (!produktion_id || !folge_nr) return res.json({ block: null })

    const prod = await queryOne(
      'SELECT produktion_db_id FROM produktionen WHERE id = $1',
      [produktion_id]
    )
    if (!prod?.produktion_db_id) return res.json({ block: null })

    const r = await fetch(
      `${PROD_DB_URL}/api/internal/productions/${prod.produktion_db_id}/script-context`,
      { headers: { 'x-internal-key': INTERNAL_KEY }, signal: AbortSignal.timeout(3000) }
    )
    if (!r.ok) return res.json({ block: null })
    const d = await r.json() as any

    const fn = Number(folge_nr)
    const bloecke: any[] = Array.isArray(d?.bloecke) ? d.bloecke : []
    let block: string | null = null
    for (let i = 0; i < bloecke.length; i++) {
      const b = bloecke[i]
      if (b.folge_von != null && b.folge_bis != null && fn >= b.folge_von && fn <= b.folge_bis) {
        block = b.bezeichnung || `${d?.block_label ?? 'Block'} ${(d?.erster_block ?? 1) + i}`
        break
      }
    }
    res.json({ block })
  } catch {
    res.json({ block: null })
  }
})

// GET /api/v2/folgen?produktion_id=X[&nur_frei=true] — Folgen einer Produktion
// nur_frei=true → nur freie Dokumente; ohne → nur normale Folgen
// ══════════════════════════════════════════════════════════════════════════════
folgenV2Router.get('/', async (req, res) => {
  try {
    const { produktion_id, nur_frei } = req.query
    if (!produktion_id) return res.status(400).json({ error: 'produktion_id required' })

    const nurFrei = nur_frei === 'true'
    const user = req.user!

    let rows: any[]
    if (nurFrei) {
      // Freie Dokumente: dauerhaft_privat → nur eigene sehen (außer superadmin)
      rows = await query(
        `SELECT f.*,
                (SELECT COUNT(*)::int FROM werkstufen w WHERE w.folge_id = f.id) AS werkstufen_count
         FROM folgen f
         WHERE f.produktion_id = $1
           AND f.ist_frei = true
           AND (
             f.sichtbarkeit_frei != 'dauerhaft_privat'
             OR f.ersteller_user_id = $2
             OR $3 = ANY(ARRAY['superadmin'])
           )
         ORDER BY f.erstellt_am DESC NULLS LAST`,
        [produktion_id, user.user_id, user.role ?? '']
      )
    } else {
      rows = await query(
        `SELECT f.*,
                (SELECT COUNT(*)::int FROM werkstufen w WHERE w.folge_id = f.id) AS werkstufen_count
         FROM folgen f
         WHERE f.produktion_id = $1
           AND f.ist_frei = false
         ORDER BY f.folge_nummer`,
        [produktion_id]
      )
    }
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/v2/folgen/:id — single Folge
// ══════════════════════════════════════════════════════════════════════════════
folgenV2Router.get('/:id', async (req, res) => {
  try {
    const row = await queryOne(
      `SELECT f.*,
              (SELECT COUNT(*)::int FROM werkstufen w WHERE w.folge_id = f.id) AS werkstufen_count
       FROM folgen f
       WHERE f.id = $1`,
      [req.params.id]
    )
    if (!row) return res.status(404).json({ error: 'Folge nicht gefunden' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/v2/folgen — Folge oder freies Dokument anlegen
// Normale Folge: { produktion_id, folge_nummer }
// Freies Dokument: { produktion_id, ist_frei: true, folgen_titel, dokument_label?, sichtbarkeit_frei? }
// ══════════════════════════════════════════════════════════════════════════════
folgenV2Router.post('/', async (req, res) => {
  const { produktion_id, folge_nummer, folgen_titel, ist_frei, dokument_label, sichtbarkeit_frei } = req.body
  const user = req.user!

  if (!produktion_id) return res.status(400).json({ error: 'produktion_id required' })

  if (ist_frei) {
    // Freies Dokument — kein folge_nummer
    if (!folgen_titel?.trim()) return res.status(400).json({ error: 'folgen_titel required für freie Dokumente' })
    const label = dokument_label ?? 'sonstiges'
    const validLabels = ['schattenbuch', 'casting_szene', 'spin_off', 'sonstiges']
    if (!validLabels.includes(label)) return res.status(400).json({ error: `Ungültiges dokument_label: ${label}` })
    const sicht = sichtbarkeit_frei ?? 'team'
    const validSicht = ['dauerhaft_privat', 'team', 'alle']
    if (!validSicht.includes(sicht)) return res.status(400).json({ error: `Ungültige sichtbarkeit_frei: ${sicht}` })

    try {
      const row = await queryOne(
        `INSERT INTO folgen
           (produktion_id, folgen_titel, ist_frei, dokument_label, sichtbarkeit_frei, ersteller_user_id, erstellt_von)
         VALUES ($1, $2, true, $3, $4, $5, $5)
         RETURNING *`,
        [produktion_id, folgen_titel.trim(), label, sicht, user.user_id]
      )
      return res.status(201).json(row)
    } catch (err) {
      return res.status(500).json({ error: String(err) })
    }
  }

  // Normale Folge
  if (!folge_nummer) return res.status(400).json({ error: 'produktion_id und folge_nummer required' })

  try {
    const row = await queryOne(
      `INSERT INTO folgen (produktion_id, folge_nummer, folgen_titel, erstellt_von)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (produktion_id, folge_nummer) DO NOTHING
       RETURNING *`,
      [produktion_id, folge_nummer, folgen_titel ?? null, user.user_id]
    )
    if (!row) {
      // Already exists — return existing
      const existing = await queryOne(
        'SELECT * FROM folgen WHERE produktion_id = $1 AND folge_nummer = $2',
        [produktion_id, folge_nummer]
      )
      return res.json(existing)
    }

    res.status(201).json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// PUT /api/v2/folgen/:id — update Folge / freies Dokument
// Normale Folge: folgen_titel, synopsis
// Freies Dokument: + dokument_label, sichtbarkeit_frei
// ══════════════════════════════════════════════════════════════════════════════
folgenV2Router.put('/:id', async (req, res) => {
  const { folgen_titel, synopsis, dokument_label, sichtbarkeit_frei } = req.body
  const user = req.user!
  try {
    const existing = await queryOne('SELECT * FROM folgen WHERE id = $1', [req.params.id])
    if (!existing) return res.status(404).json({ error: 'Folge nicht gefunden' })

    // Für dauerhaft_privat-Dokumente: nur Ersteller oder Superadmin darf bearbeiten
    if (existing.ist_frei && existing.sichtbarkeit_frei === 'dauerhaft_privat') {
      if (existing.ersteller_user_id !== user.user_id && user.role !== 'superadmin') {
        return res.status(404).json({ error: 'Nicht gefunden' })
      }
    }

    // Validierung Label + Sichtbarkeit wenn gesetzt
    if (dokument_label) {
      const validLabels = ['schattenbuch', 'casting_szene', 'spin_off', 'sonstiges']
      if (!validLabels.includes(dokument_label)) return res.status(400).json({ error: `Ungültiges dokument_label` })
    }
    if (sichtbarkeit_frei) {
      const validSicht = ['dauerhaft_privat', 'team', 'alle']
      if (!validSicht.includes(sichtbarkeit_frei)) return res.status(400).json({ error: `Ungültige sichtbarkeit_frei` })
    }

    const row = await queryOne(
      `UPDATE folgen SET
        folgen_titel     = COALESCE($1, folgen_titel),
        synopsis         = COALESCE($2, synopsis),
        dokument_label   = COALESCE($3, dokument_label),
        sichtbarkeit_frei = COALESCE($4, sichtbarkeit_frei)
       WHERE id = $5 RETURNING *`,
      [folgen_titel ?? null, synopsis ?? null, dokument_label ?? null, sichtbarkeit_frei ?? null, req.params.id]
    )
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// DELETE /api/v2/folgen/:id — nur für freie Dokumente
// ══════════════════════════════════════════════════════════════════════════════
folgenV2Router.delete('/:id', async (req, res) => {
  const user = req.user!
  try {
    const existing = await queryOne('SELECT * FROM folgen WHERE id = $1', [req.params.id])
    if (!existing) return res.status(404).json({ error: 'Nicht gefunden' })
    if (!existing.ist_frei) return res.status(400).json({ error: 'Nur freie Dokumente können gelöscht werden' })

    // Nur Ersteller oder Superadmin
    if (existing.ersteller_user_id !== user.user_id && user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Keine Berechtigung' })
    }

    // Werkstufen + Dokument-Szenen löschen (cascaded via FK wenn möglich, sonst manuell)
    await query(
      `DELETE FROM dokument_szenen WHERE werkstufe_id IN (SELECT id FROM werkstufen WHERE folge_id = $1)`,
      [req.params.id]
    )
    await query('DELETE FROM werkstufen WHERE folge_id = $1', [req.params.id])
    await query('DELETE FROM folgen WHERE id = $1', [req.params.id])

    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/v2/folgen/:id/verknuepfe-mit-folge
// Kopiert Inhalt des freien Dokuments in eine Werkstufe der Zielfolge
// Body: { ziel_folge_id, label_folge_sendung?: boolean }
// ══════════════════════════════════════════════════════════════════════════════
folgenV2Router.post('/:id/verknuepfe-mit-folge', async (req, res) => {
  const user = req.user!
  const { ziel_folge_id, label_folge_sendung } = req.body
  if (!ziel_folge_id) return res.status(400).json({ error: 'ziel_folge_id required' })

  try {
    const quelle = await queryOne('SELECT * FROM folgen WHERE id = $1 AND ist_frei = true', [req.params.id])
    if (!quelle) return res.status(404).json({ error: 'Freies Dokument nicht gefunden' })

    const ziel = await queryOne('SELECT * FROM folgen WHERE id = $1 AND ist_frei = false', [ziel_folge_id])
    if (!ziel) return res.status(404).json({ error: 'Zielfolge nicht gefunden' })

    // Neueste Werkstufe des freien Dokuments finden
    const quellWerkstufe = await queryOne(
      `SELECT * FROM werkstufen WHERE folge_id = $1 ORDER BY version_nummer DESC LIMIT 1`,
      [req.params.id]
    )
    if (!quellWerkstufe) return res.status(400).json({ error: 'Freies Dokument hat keine Werkstufe' })

    // Nächste Versionsnummer für die Zielfolge
    const maxVer = await queryOne(
      `SELECT COALESCE(MAX(version_nummer), 0) AS mx FROM werkstufen WHERE folge_id = $1`,
      [ziel_folge_id]
    )
    const neueVersion = (maxVer?.mx ?? 0) + 1

    // Neue Werkstufe auf der Zielfolge anlegen
    const neueWerkstufe = await queryOne(
      `INSERT INTO werkstufen (folge_id, typ, version_nummer, label, erstellt_von)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [ziel_folge_id, quellWerkstufe.typ ?? 'drehbuch', neueVersion,
       quelle.folgen_titel ?? 'Übernommen aus freiem Dokument', user.user_id]
    )

    // Szenen kopieren
    const szenen = await query(
      `SELECT ds.*, si.sz_nummer, si.motiv_id, si.innen_aussen, si.tag_nacht
       FROM dokument_szenen ds
       JOIN scene_identities si ON si.id = ds.scene_identity_id
       WHERE ds.werkstufe_id = $1
       ORDER BY ds.sort_order, ds.id`,
      [quellWerkstufe.id]
    )

    for (const sz of szenen) {
      // Neue scene_identity in der Zielproduktion anlegen
      const neueSi = await queryOne(
        `INSERT INTO scene_identities
           (folge_id, sz_nummer, motiv_id, innen_aussen, tag_nacht)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [ziel_folge_id, sz.sz_nummer, sz.motiv_id, sz.innen_aussen, sz.tag_nacht]
      )
      await query(
        `INSERT INTO dokument_szenen
           (werkstufe_id, scene_identity_id, content, sort_order, format, stoppzeit_sek)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [neueWerkstufe!.id, neueSi!.id, sz.content, sz.sort_order, sz.format, sz.stoppzeit_sek]
      )
    }

    // Optional: Label "folge_sendung" auf Zielfolge
    if (label_folge_sendung) {
      await query(
        `UPDATE folgen SET dokument_label = 'folge_sendung' WHERE id = $1`,
        [ziel_folge_id]
      )
    }

    res.json({ werkstufe: neueWerkstufe, szenen_kopiert: szenen.length })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})
