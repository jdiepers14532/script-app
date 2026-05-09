import { Server } from '@hocuspocus/server'
import { Database } from '@hocuspocus/extension-database'
import { pool } from './db'
import fetch from 'node-fetch'
import { recalcSceneStats } from './utils/recalcRepliken'
import { calcPageLength } from './utils/calcPageLength'

/**
 * Document name formats:
 *   `fassung-{fassungId}` — legacy: full-document collaboration on Fassungen
 *   `szene-{dokumentSzeneId}` — new: per-scene collaboration on Werkstufen
 * Auth: JWT cookie value passed as query param `?token=...`
 */

function parseDocName(documentName: string): { type: 'fassung'; id: string } | { type: 'szene'; id: string } | null {
  if (documentName.startsWith('fassung-')) return { type: 'fassung', id: documentName.slice('fassung-'.length) }
  if (documentName.startsWith('szene-')) return { type: 'szene', id: documentName.slice('szene-'.length) }
  return null
}

export function createHocuspocusServer() {
  return Server.configure({
    quiet: true,

    async onAuthenticate({ token, documentName, connection }) {
      const parsed = parseDocName(documentName)
      if (!parsed) throw new Error('Invalid document name')

      // Playwright test mode: bypass auth
      if (process.env.PLAYWRIGHT_TEST_MODE === 'true') {
        connection.readOnly = false
        return { user_id: 'test-user', user_name: 'Test User', roles: ['superadmin'] }
      }

      if (!token) throw new Error('No auth token')

      // Validate JWT via auth service
      let user: any
      try {
        const res = await (fetch as any)('http://127.0.0.1:3002/api/internal/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: `access_token=${token}` },
          body: JSON.stringify({ application: 'script' }),
        })
        if (!res.ok) throw new Error('Auth service error')
        user = await res.json()
      } catch {
        throw new Error('Unauthorized')
      }

      // Override-Rollen check
      const overrideRes = await pool.query(
        `SELECT value FROM app_settings WHERE key = 'dokument_override_rollen'`
      )
      const overrideRollen: string[] = JSON.parse(overrideRes.rows[0]?.value ?? '[]')
      const userRoles: string[] = user.roles ?? []
      const isOverride = userRoles.some((r: string) => overrideRollen.includes(r))

      if (parsed.type === 'fassung') {
        // Legacy: Fassung-based collaboration
        const fassungRes = await pool.query(
          `SELECT f.*, d.erstellt_von AS dok_erstellt_von
           FROM folgen_dokument_fassungen f
           JOIN folgen_dokumente d ON d.id = f.dokument_id
           WHERE f.id = $1`,
          [parsed.id]
        )
        const fassung = fassungRes.rows[0]
        if (!fassung) throw new Error('Fassung not found')

        if (!isOverride) {
          switch (fassung.sichtbarkeit) {
            case 'privat':
              if (fassung.dok_erstellt_von !== user.user_id) throw new Error('Access denied')
              break
            case 'colab': {
              const autorRes = await pool.query(
                `SELECT rolle FROM folgen_dokument_autoren WHERE fassung_id = $1 AND user_id = $2`,
                [parsed.id, user.user_id]
              )
              if (autorRes.rows[0]?.rolle !== 'autor') throw new Error('Access denied')
              break
            }
            case 'review':
            case 'produktion':
            case 'alle':
              connection.readOnly = true
              break
          }
        }
        if (fassung.abgegeben) connection.readOnly = true
      } else {
        // New: Szene-based collaboration via Werkstufe
        const szeneRes = await pool.query(
          `SELECT ds.*, w.bearbeitung_status, w.abgegeben AS werk_abgegeben
           FROM dokument_szenen ds
           JOIN werkstufen w ON w.id = ds.werkstufe_id
           WHERE ds.id = $1`,
          [parsed.id]
        )
        const szene = szeneRes.rows[0]
        if (!szene) throw new Error('Szene not found')

        // bearbeitung_status controls write access
        if (!isOverride) {
          if (szene.bearbeitung_status === 'abgeschlossen' || szene.bearbeitung_status === 'gesperrt') {
            connection.readOnly = true
          }
        }
        if (szene.werk_abgegeben) connection.readOnly = true
      }

      return {
        user_id: user.user_id,
        user_name: user.name ?? user.user_id,
        roles: userRoles,
      }
    },

    async onConnect({ documentName, context }) {
      const parsed = parseDocName(documentName)
      if (!parsed || !context?.user_id) return

      if (parsed.type === 'fassung') {
        try {
          await pool.query(
            `INSERT INTO folgen_dokument_audit (fassung_id, user_id, user_name, ereignis, details)
             SELECT id, $2, $3, 'collab_verbunden', $4
             FROM folgen_dokument_fassungen WHERE id = $1`,
            [parsed.id, context.user_id, context.user_name, JSON.stringify({ via: 'hocuspocus' })]
          )
        } catch { /* non-critical */ }
      }
      // Szene-based: no audit log for now
    },

    async onDisconnect({ documentName, context }) {
      const parsed = parseDocName(documentName)
      if (!parsed || !context?.user_id) return

      if (parsed.type === 'fassung') {
        try {
          await pool.query(
            `INSERT INTO folgen_dokument_audit (fassung_id, user_id, user_name, ereignis)
             SELECT id, $2, $3, 'collab_getrennt'
             FROM folgen_dokument_fassungen WHERE id = $1`,
            [parsed.id, context.user_id, context.user_name]
          )
        } catch { /* non-critical */ }
      }
    },

    extensions: [
      new Database({
        async fetch({ documentName }) {
          const parsed = parseDocName(documentName)
          if (!parsed) return null

          if (parsed.type === 'fassung') {
            const res = await pool.query(
              `SELECT yjs_state FROM folgen_dokument_fassungen WHERE id = $1`,
              [parsed.id]
            )
            return res.rows[0]?.yjs_state ?? null
          } else {
            const res = await pool.query(
              `SELECT yjs_state FROM dokument_szenen WHERE id = $1`,
              [parsed.id]
            )
            return res.rows[0]?.yjs_state ?? null
          }
        },

        async store({ documentName, state, context }) {
          const parsed = parseDocName(documentName)
          if (!parsed) return

          if (parsed.type === 'fassung') {
            await pool.query(
              `UPDATE folgen_dokument_fassungen
               SET yjs_state = $1,
                   zuletzt_geaendert_von = $2,
                   zuletzt_geaendert_am = now()
               WHERE id = $3`,
              [Buffer.from(state), context?.user_id ?? null, parsed.id]
            )
          } else {
            await pool.query(
              `UPDATE dokument_szenen
               SET yjs_state = $1,
                   updated_by = $2,
                   updated_at = now()
               WHERE id = $3`,
              [Buffer.from(state), context?.user_id ?? null, parsed.id]
            )

            // Recalc repliken/spiel_typ + page_length after Yjs content persist
            try {
              const dsRow = await pool.query(
                `SELECT werkstufe_id, scene_identity_id, content FROM dokument_szenen WHERE id = $1`,
                [parsed.id]
              )
              const ds = dsRow.rows[0]
              if (ds?.content) {
                const pl = calcPageLength(ds.content)
                await pool.query(
                  `UPDATE dokument_szenen SET page_length = $1 WHERE id = $2`,
                  [pl, parsed.id]
                )
              }
              if (ds?.werkstufe_id && ds?.scene_identity_id && ds?.content) {
                recalcSceneStats(ds.werkstufe_id, ds.scene_identity_id, ds.content).catch(() => {})
              }
            } catch { /* non-critical */ }
          }
        },
      }),
    ],
  })
}
