import { Router } from 'express'
import { pool, query, queryOne } from '../db'
import { authMiddleware, requireAnyDkAccess } from '../auth'
import { createNotification } from './notifications'

// ── Team-Work Router ──────────────────────────────────────────────────────────
// Colab-Gruppen, Werkstufen-Sessions, Sichtbarkeit, Privat-Modus

export const colabGruppenRouter = Router()
colabGruppenRouter.use(authMiddleware)

export const werkstufenSessionsRouter = Router()
werkstufenSessionsRouter.use(authMiddleware)

// ══════════════════════════════════════════════════════════════════════════════
// COLAB-GRUPPEN
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/colab-gruppen?produktion_id=X — Alle Gruppen einer Produktion
colabGruppenRouter.get('/', async (req, res) => {
  const { produktion_id } = req.query
  if (!produktion_id) return res.status(400).json({ error: 'produktion_id required' })
  try {
    const rows = await query(
      `SELECT g.*,
              (SELECT json_agg(json_build_object(
                'id', m.id, 'user_id', m.user_id, 'user_name', m.user_name,
                'hinzugefuegt_am', m.hinzugefuegt_am
              ) ORDER BY m.hinzugefuegt_am)
               FROM colab_gruppen_mitglieder m
               WHERE m.gruppe_id = g.id) AS mitglieder
       FROM colab_gruppen g
       WHERE g.produktion_id = $1
       ORDER BY g.erstellt_am`,
      [produktion_id]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/colab-gruppen — Neue Gruppe anlegen (alle Autoren dürfen das)
colabGruppenRouter.post('/', async (req, res) => {
  const { produktion_id, name, beschreibung } = req.body
  const user = req.user!
  if (!produktion_id || !name?.trim()) {
    return res.status(400).json({ error: 'produktion_id und name erforderlich' })
  }
  try {
    const row = await queryOne(
      `INSERT INTO colab_gruppen (produktion_id, name, beschreibung, erstellt_von)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [produktion_id, name.trim(), beschreibung || null, user.user_id]
    )
    res.status(201).json({ ...row, mitglieder: [] })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/colab-gruppen/:id — Gruppe umbenennen (nur Ersteller oder Admin)
colabGruppenRouter.put('/:id', async (req, res) => {
  const { id } = req.params
  const { name, beschreibung } = req.body
  const user = req.user!
  if (!name?.trim()) return res.status(400).json({ error: 'name erforderlich' })
  try {
    const gruppe = await queryOne('SELECT erstellt_von FROM colab_gruppen WHERE id = $1', [id])
    if (!gruppe) return res.status(404).json({ error: 'Gruppe nicht gefunden' })
    if (gruppe.erstellt_von !== user.user_id && user.role !== 'admin' && user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Nur der Ersteller kann die Gruppe umbenennen' })
    }
    const row = await queryOne(
      `UPDATE colab_gruppen SET name = $1, beschreibung = $2, geaendert_am = now()
       WHERE id = $3 RETURNING *`,
      [name.trim(), beschreibung ?? null, id]
    )
    if (!row) return res.status(404).json({ error: 'Gruppe nicht gefunden' })
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/colab-gruppen/:id — Gruppe löschen (nur Ersteller oder DK-Admin)
colabGruppenRouter.delete('/:id', async (req, res) => {
  const { id } = req.params
  const user = req.user!
  try {
    const gruppe = await queryOne('SELECT * FROM colab_gruppen WHERE id = $1', [id])
    if (!gruppe) return res.status(404).json({ error: 'Gruppe nicht gefunden' })
    if (gruppe.erstellt_von !== user.user_id && user.role !== 'admin' && user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Nur der Ersteller oder ein Admin kann die Gruppe löschen' })
    }
    await pool.query('DELETE FROM colab_gruppen WHERE id = $1', [id])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/colab-gruppen/:id/mitglieder — Mitglied hinzufügen
// Erlaubt: Ersteller/Admin (beliebiges Mitglied) ODER User der sich selbst hinzufügt
colabGruppenRouter.post('/:id/mitglieder', async (req, res) => {
  const { id } = req.params
  const { user_id, user_name } = req.body
  const user = req.user!
  if (!user_id || !user_name) return res.status(400).json({ error: 'user_id und user_name erforderlich' })
  try {
    const gruppe = await queryOne('SELECT erstellt_von FROM colab_gruppen WHERE id = $1', [id])
    if (!gruppe) return res.status(404).json({ error: 'Gruppe nicht gefunden' })
    const isSelf = user_id === user.user_id
    const isCreatorOrAdmin = gruppe.erstellt_von === user.user_id || user.role === 'admin' || user.role === 'superadmin'
    if (!isSelf && !isCreatorOrAdmin) {
      return res.status(403).json({ error: 'Nur der Ersteller kann andere Mitglieder hinzufügen' })
    }
    const row = await queryOne(
      `INSERT INTO colab_gruppen_mitglieder (gruppe_id, user_id, user_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (gruppe_id, user_id) DO UPDATE SET user_name = $3
       RETURNING *`,
      [id, user_id, user_name]
    )
    res.status(201).json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/colab-gruppen/:id/mitglieder/:userId — Mitglied entfernen
// Erlaubt: Ersteller, Admin, oder User der sich selbst entfernt
colabGruppenRouter.delete('/:id/mitglieder/:userId', async (req, res) => {
  const { id, userId } = req.params
  const user = req.user!
  try {
    if (userId !== user.user_id && user.role !== 'admin' && user.role !== 'superadmin') {
      const gruppe = await queryOne('SELECT erstellt_von FROM colab_gruppen WHERE id = $1', [id])
      if (!gruppe) return res.status(404).json({ error: 'Gruppe nicht gefunden' })
      if (gruppe.erstellt_von !== user.user_id) {
        return res.status(403).json({ error: 'Keine Berechtigung' })
      }
    }
    await pool.query(
      'DELETE FROM colab_gruppen_mitglieder WHERE gruppe_id = $1 AND user_id = $2',
      [id, userId]
    )
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// APP-USER SUCHE (für Mitglied-Hinzufügen)
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/colab-gruppen/app-users?q=XY — User aus Auth-Service suchen
colabGruppenRouter.get('/app-users', async (req, res) => {
  const AUTH_URL = 'http://127.0.0.1:3002'
  const INTERNAL_KEY = process.env.INTERNAL_SECRET ?? ''
  const q = (req.query.q as string ?? '').toLowerCase().trim()
  try {
    const r = await fetch(`${AUTH_URL}/api/internal/app-users/script`, {
      headers: { 'x-internal-key': INTERNAL_KEY },
    })
    if (!r.ok) return res.status(502).json({ error: 'Auth-Service nicht erreichbar' })
    const data = await r.json() as any
    const users: { id: string; username: string; email: string }[] = data.users ?? []
    const filtered = q
      ? users.filter(u => u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      : users
    res.json(filtered.slice(0, 20).map(u => ({ user_id: u.id, user_name: u.username, email: u.email })))
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// SICHTBARKEIT auf Werkstufen
// ══════════════════════════════════════════════════════════════════════════════

// PUT /api/werkstufen/:id/sichtbarkeit — Sichtbarkeit ändern
export const sichtbarkeitRouter = Router()
sichtbarkeitRouter.use(authMiddleware)

sichtbarkeitRouter.put('/:id/sichtbarkeit', async (req, res) => {
  const { id } = req.params
  const { sichtbarkeit, privat_permanent } = req.body
  const user = req.user!

  const validValues = ['privat', 'autoren', 'produktion']
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const isGroupSichtbarkeit = sichtbarkeit?.startsWith('team:') || sichtbarkeit?.startsWith('colab:')
  const isValid = validValues.includes(sichtbarkeit) || isGroupSichtbarkeit
  if (!isValid) return res.status(400).json({ error: 'Ungültige Sichtbarkeit' })

  // Validate group UUID format for team:/colab:
  let groupUuid: string | null = null
  if (isGroupSichtbarkeit) {
    groupUuid = sichtbarkeit.split(':')[1]
    if (!groupUuid || !UUID_RE.test(groupUuid)) {
      return res.status(400).json({ error: 'Ungültige Gruppen-ID' })
    }
  }

  try {
    const current = await queryOne(
      `SELECT w.sichtbarkeit, w.erstellt_von, f.produktion_id
       FROM werkstufen w JOIN folgen f ON f.id = w.folge_id
       WHERE w.id = $1`,
      [id]
    )
    if (!current) return res.status(404).json({ error: 'Werkstufe nicht gefunden' })
    if (current.erstellt_von !== user.user_id && user.role !== 'admin' && user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Nur der Ersteller kann die Sichtbarkeit ändern' })
    }

    // Cross-production guard: group must belong to the same production as the werkstufe
    if (groupUuid) {
      const group = await queryOne(
        'SELECT produktion_id FROM colab_gruppen WHERE id = $1',
        [groupUuid]
      )
      if (!group) return res.status(404).json({ error: 'Gruppe nicht gefunden' })
      if (group.produktion_id !== current.produktion_id) {
        return res.status(403).json({ error: 'Gruppe gehört zu einer anderen Produktion' })
      }
    }

    const isPrivat = sichtbarkeit === 'privat'
    const wasPrivat = current.sichtbarkeit === 'privat'

    const row = await queryOne(
      `UPDATE werkstufen SET
         sichtbarkeit = $1,
         privat_permanent = $2,
         privat_gesetzt_am = CASE WHEN $3 THEN now() ELSE privat_gesetzt_am END,
         privat_gesetzt_von = CASE WHEN $3 THEN $4 ELSE privat_gesetzt_von END,
         previous_sichtbarkeit = CASE WHEN $3 AND NOT $5 THEN $6 ELSE previous_sichtbarkeit END
       WHERE id = $7 RETURNING *`,
      [
        sichtbarkeit,
        privat_permanent ?? false,
        isPrivat && !wasPrivat,   // $3: gerade auf privat gesetzt
        user.user_id,             // $4
        wasPrivat,                // $5: war schon privat
        current.sichtbarkeit,     // $6: vorherige Sichtbarkeit speichern
        id,                       // $7
      ]
    )
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// WERKSTUFEN-SESSIONS (Heartbeat)
// ══════════════════════════════════════════════════════════════════════════════

// PUT /api/werkstufen-sessions/:werkId — Session starten oder Heartbeat senden (UPSERT)
werkstufenSessionsRouter.put('/:werkId', async (req, res) => {
  const { werkId } = req.params
  const user = req.user!
  try {
    const row = await queryOne(
      `INSERT INTO werkstufen_sessions (werkstufe_id, user_id, user_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (werkstufe_id, user_id) DO UPDATE
         SET last_active_at = now(), ended_at = NULL, user_name = $3
       RETURNING *`,
      [werkId, user.user_id, user.name ?? user.user_id]
    )
    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/werkstufen-sessions/:werkId — Session beenden (bei Unload oder manuell)
werkstufenSessionsRouter.delete('/:werkId', async (req, res) => {
  const { werkId } = req.params
  const user = req.user!
  try {
    await pool.query(
      `UPDATE werkstufen_sessions SET ended_at = now()
       WHERE werkstufe_id = $1 AND user_id = $2 AND ended_at IS NULL`,
      [werkId, user.user_id]
    )
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/werkstufen-sessions/:werkId — Aktive User für eine Werkstufe
werkstufenSessionsRouter.get('/:werkId', async (req, res) => {
  const { werkId } = req.params
  const user = req.user!
  // Aktiv = ended_at NULL + last_active_at < 15min (Session-Timeout)
  try {
    const rows = await query(
      `SELECT user_id, user_name, last_active_at, started_at
       FROM werkstufen_sessions
       WHERE werkstufe_id = $1
         AND ended_at IS NULL
         AND last_active_at > now() - INTERVAL '15 minutes'
         AND user_id != $2
       ORDER BY last_active_at DESC`,
      [werkId, user.user_id]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// PRIVAT-MODUS TOKENS (kein Auth — für Email-Links)
// ══════════════════════════════════════════════════════════════════════════════

export const privatModeTokensPublicRouter = Router()

// GET /api/privat-mode-tokens/:token — Token einlösen (kein Auth)
privatModeTokensPublicRouter.get('/:token', async (req, res) => {
  const { token } = req.params
  try {
    const row = await queryOne(
      `SELECT t.*, w.sichtbarkeit, w.previous_sichtbarkeit, w.privat_permanent
       FROM privat_mode_tokens t
       JOIN werkstufen w ON w.id = t.werkstufe_id
       WHERE t.token = $1`,
      [token]
    )
    if (!row) return res.status(404).json({ error: 'Token nicht gefunden' })
    if (row.benutzt_am) return res.status(410).json({ error: 'Token bereits benutzt' })
    if (new Date(row.ablauf_am) < new Date()) {
      return res.status(410).json({ error: 'Token abgelaufen' })
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // Token als benutzt markieren
      await client.query(
        'UPDATE privat_mode_tokens SET benutzt_am = now() WHERE id = $1',
        [row.id]
      )

      if (row.aktion === 'freigeben') {
        // Sichtbarkeit auf vorherige oder 'autoren' zurücksetzen
        const newSichtbarkeit = row.previous_sichtbarkeit || 'autoren'
        await client.query(
          `UPDATE werkstufen SET
             sichtbarkeit = $1,
             privat_gesetzt_am = NULL,
             privat_gesetzt_von = NULL,
             privat_permanent = false,
             previous_sichtbarkeit = NULL
           WHERE id = $2`,
          [newSichtbarkeit, row.werkstufe_id]
        )
        await client.query('COMMIT')
        res.json({ ok: true, aktion: 'freigeben', neue_sichtbarkeit: newSichtbarkeit })

      } else if (row.aktion === 'verlaengern') {
        // Heartbeat erneuern (als ob User aktiv war)
        await client.query(
          `UPDATE werkstufen_sessions SET last_active_at = now()
           WHERE werkstufe_id = $1 AND user_id = $2`,
          [row.werkstufe_id, row.user_id]
        )
        await client.query('COMMIT')
        res.json({ ok: true, aktion: 'verlaengern' })
      }
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN: Gruppen-Register (DK-Admin sieht alle Gruppen, kann ändern/löschen)
// Nur lesender Zugriff für User, nur DK-Admin darf mutieren
// ══════════════════════════════════════════════════════════════════════════════

export const adminColabRegisterRouter = Router()
adminColabRegisterRouter.use(authMiddleware)

const dkAny = requireAnyDkAccess()

// GET /api/admin/colab-gruppen-register?produktion_id=X
adminColabRegisterRouter.get('/', async (req, res) => {
  const { produktion_id } = req.query
  if (!produktion_id) return res.status(400).json({ error: 'produktion_id required' })
  try {
    const rows = await query(
      `SELECT g.*,
              (SELECT count(*)::int FROM colab_gruppen_mitglieder WHERE gruppe_id = g.id) AS mitglieder_count,
              (SELECT COALESCE(json_agg(json_build_object(
                'user_id', m.user_id, 'user_name', m.user_name,
                'hinzugefuegt_am', m.hinzugefuegt_am
              ) ORDER BY m.hinzugefuegt_am), '[]'::json)
               FROM colab_gruppen_mitglieder m WHERE m.gruppe_id = g.id) AS mitglieder
       FROM colab_gruppen g
       WHERE g.produktion_id = $1
       ORDER BY g.erstellt_am DESC`,
      [produktion_id]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/admin/colab-gruppen-register/:id — Admin umbenennen/beschreiben
adminColabRegisterRouter.put('/:id', dkAny, async (req, res) => {
  const { id } = req.params
  const { name, beschreibung } = req.body
  const admin = req.user!
  if (!name?.trim()) return res.status(400).json({ error: 'name erforderlich' })
  try {
    const gruppe = await queryOne('SELECT * FROM colab_gruppen WHERE id = $1', [id])
    if (!gruppe) return res.status(404).json({ error: 'Gruppe nicht gefunden' })

    const row = await queryOne(
      `UPDATE colab_gruppen SET name = $1, beschreibung = $2, geaendert_am = now()
       WHERE id = $3 RETURNING *`,
      [name.trim(), beschreibung ?? null, id]
    )

    // Notification an Ersteller, wenn Admin ≠ Ersteller
    if (gruppe.erstellt_von !== admin.user_id) {
      const adminName = (admin as any).name ?? (admin as any).username ?? admin.user_id
      await createNotification({
        user_id: gruppe.erstellt_von,
        typ: 'colab_gruppe_geaendert',
        titel: 'Deine Gruppe wurde geändert',
        nachricht: `${adminName} (DK-Admin) hat deine Gruppe „${gruppe.name}"${name.trim() !== gruppe.name ? ` umbenannt in „${name.trim()}"` : ''} bearbeitet.`,
        payload: {
          gruppe_id: id,
          alter_name: gruppe.name,
          neuer_name: name.trim(),
          admin_id: admin.user_id,
          admin_name: adminName,
        },
      })
    }

    res.json(row)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/admin/colab-gruppen-register/:id — Admin löschen
adminColabRegisterRouter.delete('/:id', dkAny, async (req, res) => {
  const { id } = req.params
  const admin = req.user!
  try {
    const gruppe = await queryOne('SELECT * FROM colab_gruppen WHERE id = $1', [id])
    if (!gruppe) return res.status(404).json({ error: 'Gruppe nicht gefunden' })

    await pool.query('DELETE FROM colab_gruppen WHERE id = $1', [id])

    // Notification an Ersteller, wenn Admin ≠ Ersteller
    if (gruppe.erstellt_von !== admin.user_id) {
      const adminName = (admin as any).name ?? (admin as any).username ?? admin.user_id
      await createNotification({
        user_id: gruppe.erstellt_von,
        typ: 'colab_gruppe_geloescht',
        titel: 'Deine Gruppe wurde gelöscht',
        nachricht: `${adminName} (DK-Admin) hat deine Gruppe „${gruppe.name}" gelöscht.`,
        payload: {
          gruppe_name: gruppe.name,
          admin_id: admin.user_id,
          admin_name: adminName,
        },
      })
    }

    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})
