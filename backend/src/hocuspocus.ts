import { Server } from '@hocuspocus/server'
import { Database } from '@hocuspocus/extension-database'
import { pool } from './db'
import fetch from 'node-fetch'

/**
 * Document name format: `fassung-{fassungId}`
 * Auth: JWT cookie value passed as query param `?token=...`
 */
export function createHocuspocusServer() {
  return Server.configure({
    // No port — we attach to existing HTTP server via handleConnection
    quiet: true,

    async onAuthenticate({ token, documentName, connection }) {
      const fassungId = documentName.startsWith('fassung-')
        ? documentName.slice('fassung-'.length)
        : null

      if (!fassungId) throw new Error('Invalid document name')

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

      // Check fassung exists + sichtbarkeit
      const fassungRes = await pool.query(
        `SELECT f.*, d.erstellt_von AS dok_erstellt_von
         FROM folgen_dokument_fassungen f
         JOIN folgen_dokumente d ON d.id = f.dokument_id
         WHERE f.id = $1`,
        [fassungId]
      )
      const fassung = fassungRes.rows[0]
      if (!fassung) throw new Error('Fassung not found')

      // Override-Rollen check
      const overrideRes = await pool.query(
        `SELECT value FROM app_settings WHERE key = 'dokument_override_rollen'`
      )
      const overrideRollen: string[] = JSON.parse(overrideRes.rows[0]?.value ?? '[]')
      const userRoles: string[] = user.roles ?? []
      const isOverride = userRoles.some((r: string) => overrideRollen.includes(r))

      if (!isOverride) {
        switch (fassung.sichtbarkeit) {
          case 'privat':
            if (fassung.dok_erstellt_von !== user.user_id) throw new Error('Access denied')
            break
          case 'colab': {
            const autorRes = await pool.query(
              `SELECT rolle FROM folgen_dokument_autoren WHERE fassung_id = $1 AND user_id = $2`,
              [fassungId, user.user_id]
            )
            if (autorRes.rows[0]?.rolle !== 'autor') throw new Error('Access denied')
            break
          }
          case 'review':
          case 'produktion':
            connection.readOnly = true
            break
          case 'alle':
            connection.readOnly = true
            break
        }
      }

      if (fassung.abgegeben) connection.readOnly = true

      return {
        user_id: user.user_id,
        user_name: user.name ?? user.user_id,
        roles: userRoles,
      }
    },

    async onConnect({ documentName, context }) {
      const fassungId = documentName.startsWith('fassung-')
        ? documentName.slice('fassung-'.length)
        : null
      if (!fassungId || !context?.user_id) return

      // Write audit log
      try {
        await pool.query(
          `INSERT INTO folgen_dokument_audit (fassung_id, user_id, user_name, ereignis, details)
           SELECT id, $2, $3, 'collab_verbunden', $4
           FROM folgen_dokument_fassungen WHERE id = $1`,
          [fassungId, context.user_id, context.user_name, JSON.stringify({ via: 'hocuspocus' })]
        )
      } catch { /* non-critical */ }
    },

    async onDisconnect({ documentName, context }) {
      const fassungId = documentName.startsWith('fassung-')
        ? documentName.slice('fassung-'.length)
        : null
      if (!fassungId || !context?.user_id) return

      try {
        await pool.query(
          `INSERT INTO folgen_dokument_audit (fassung_id, user_id, user_name, ereignis)
           SELECT id, $2, $3, 'collab_getrennt'
           FROM folgen_dokument_fassungen WHERE id = $1`,
          [fassungId, context.user_id, context.user_name]
        )
      } catch { /* non-critical */ }
    },

    extensions: [
      new Database({
        async fetch({ documentName }) {
          const fassungId = documentName.startsWith('fassung-')
            ? documentName.slice('fassung-'.length)
            : null
          if (!fassungId) return null

          const res = await pool.query(
            `SELECT yjs_state FROM folgen_dokument_fassungen WHERE id = $1`,
            [fassungId]
          )
          return res.rows[0]?.yjs_state ?? null
        },

        async store({ documentName, state, document, context }) {
          const fassungId = documentName.startsWith('fassung-')
            ? documentName.slice('fassung-'.length)
            : null
          if (!fassungId) return

          await pool.query(
            `UPDATE folgen_dokument_fassungen
             SET yjs_state = $1,
                 zuletzt_geaendert_von = $2,
                 zuletzt_geaendert_am = now()
             WHERE id = $3`,
            [Buffer.from(state), context?.user_id ?? null, fassungId]
          )
        },
      }),
    ],
  })
}
