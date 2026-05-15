import { Server } from '@hocuspocus/server'
import { Database } from '@hocuspocus/extension-database'
import { pool } from './db'
import fetch from 'node-fetch'
import { recalcSceneStats } from './utils/recalcRepliken'
import { calcPageLength } from './utils/calcPageLength'

/**
 * Document name format: `szene-{dokumentSzeneId}` — per-scene collaboration on Werkstufen
 * Auth: JWT cookie value passed as query param `?token=...`
 */

function parseDocName(documentName: string): { type: 'szene'; id: string } | null {
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

      // Szene-based collaboration via Werkstufe
      const szeneRes = await pool.query(
        `SELECT ds.*, w.bearbeitung_status, w.abgegeben AS werk_abgegeben
         FROM dokument_szenen ds
         JOIN werkstufen w ON w.id = ds.werkstufe_id
         WHERE ds.id = $1`,
        [parsed.id]
      )
      const szene = szeneRes.rows[0]
      if (!szene) throw new Error('Szene not found')

      if (!isOverride) {
        if (szene.bearbeitung_status === 'abgeschlossen' || szene.bearbeitung_status === 'gesperrt') {
          connection.readOnly = true
        }
      }
      if (szene.werk_abgegeben) connection.readOnly = true

      return {
        user_id: user.user_id,
        user_name: user.name ?? user.user_id,
        roles: userRoles,
      }
    },

    async onConnect(_ctx) {},
    async onDisconnect(_ctx) {},

    extensions: [
      new Database({
        async fetch({ documentName }) {
          const parsed = parseDocName(documentName)
          if (!parsed) return null
          const res = await pool.query(
            `SELECT yjs_state FROM dokument_szenen WHERE id = $1`,
            [parsed.id]
          )
          return res.rows[0]?.yjs_state ?? null
        },

        async store({ documentName, state, context }) {
          const parsed = parseDocName(documentName)
          if (!parsed) return

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
        },
      }),
    ],
  })
}
