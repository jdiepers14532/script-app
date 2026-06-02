import { Server } from '@hocuspocus/server'
import { Database } from '@hocuspocus/extension-database'
import { pool } from './db'
import fetch from 'node-fetch'
import * as Y from 'yjs'
import { randomUUID } from 'crypto'
import { recalcSceneStats, updateReplikCount } from './utils/recalcRepliken'
import { calcPageLength } from './utils/calcPageLength'
import { autoUpsertNtEintraege } from './routes/nt-eintraege'

// ── Yjs XmlFragment → ProseMirror-JSON (für NT-Scan) ─────────────────────────
function convertXmlNodes(fragment: Y.XmlFragment | Y.XmlElement): any[] {
  return (fragment.toArray() as Array<Y.XmlElement | Y.XmlText>).flatMap(item => {
    if (item instanceof Y.XmlText) {
      return (item.toDelta() as Array<{ insert: any; attributes?: Record<string, any> }>)
        .flatMap(op => {
          if (typeof op.insert !== 'string' || !op.insert) return []
          const node: any = { type: 'text', text: op.insert }
          if (op.attributes) {
            const marks = Object.entries(op.attributes)
              .filter(([, v]) => v !== null && v !== false)
              .map(([k, v]) => (v === true ? { type: k } : { type: k, attrs: v as any }))
            if (marks.length) node.marks = marks
          }
          return [node]
        })
    }
    if (item instanceof Y.XmlElement) {
      const type = item.nodeName
      if (!type) return []
      const attrs = item.getAttributes() as Record<string, any>
      const children = convertXmlNodes(item)
      const node: any = { type }
      if (Object.keys(attrs).length) node.attrs = attrs
      if (children.length) node.content = children
      return [node]
    }
    return []
  })
}

function yjsDocToContent(doc: Y.Doc): any {
  try {
    const fragment = doc.getXmlFragment('default')
    return { type: 'doc', content: convertXmlNodes(fragment) }
  } catch {
    return null
  }
}

// ── node_id-Schutz für Hocuspocus-Store ──────────────────────────────────────
// Yjs XmlElement-Attribute enthalten keine node_ids wenn der Yjs-State vor der
// node_id-Einführung gespeichert wurde. Beim nächsten Store würde yjsDocToContent
// Blöcke ohne node_id liefern und das DB-Backfill überschreiben.
// Diese Funktion liest die vorhandenen DB-node_ids und injiziert sie positions-
// basiert in die freshBlocks. Nach dem ersten Client-Reconnect übernimmt
// appendTransaction (NodeIdExtension) und Yjs hat die korrekten node_ids — dann
// ist diese Funktion ein No-Op (alle Blöcke haben bereits node_ids).
async function preserveOrInjectNodeIds(szeneId: string, freshBlocks: any[]): Promise<any[]> {
  // Fast-path: alle Blöcke haben bereits node_id — nichts zu tun
  if (freshBlocks.every(b => b?.attrs?.node_id)) return freshBlocks

  // DB-Content lesen um Backfill-node_ids zu erhalten
  const res = await pool.query('SELECT content FROM dokument_szenen WHERE id = $1', [szeneId])
  const raw = res.rows[0]?.content
  const existingBlocks: any[] = Array.isArray(raw) ? raw : (raw?.content ?? [])

  // Positions-Map: Index → node_id (nur für Blöcke die eine node_id haben)
  const idByPos = new Map<number, string>()
  existingBlocks.forEach((b: any, i: number) => {
    const id = b?.attrs?.node_id
    if (id) idByPos.set(i, id)
  })

  return freshBlocks.map((block: any, i: number) => {
    if (!block || typeof block !== 'object') return block
    if (block?.attrs?.node_id) return block  // schon vorhanden — unberührt
    const nodeId = idByPos.get(i) ?? randomUUID()
    return { ...block, attrs: { ...(block.attrs ?? {}), node_id: nodeId } }
  })
}

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

        async store({ documentName, state, document, context }) {
          const parsed = parseDocName(documentName)
          if (!parsed) return

          // Content aus Yjs-Dokument extrahieren (aktueller Stand, nicht DB-Cache)
          let freshContent = yjsDocToContent(document as unknown as Y.Doc)

          // node_id-Schutz: Yjs-State vor der node_id-Einführung enthält keine node_id-Attribute.
          // preserveOrInjectNodeIds stellt sicher, dass das Backfill nicht überschrieben wird.
          // Ist nach dem ersten Client-Reconnect (appendTransaction) ein No-Op.
          if (freshContent) {
            const rawBlocks: any[] = Array.isArray(freshContent.content) ? freshContent.content : []
            const mergedBlocks = await preserveOrInjectNodeIds(parsed.id, rawBlocks)
            freshContent = { ...freshContent, content: mergedBlocks }
          }

          // yjs_state + content synchron schreiben (content wird von applyNtVerweisFix & allen
          // anderen Checks aus der DB gelesen — muss immer aktuell sein)
          await pool.query(
            `UPDATE dokument_szenen
             SET yjs_state = $1,
                 content   = COALESCE($2, content),
                 updated_by = $3,
                 updated_at = now()
             WHERE id = $4`,
            [
              Buffer.from(state),
              freshContent ? JSON.stringify(freshContent) : null,
              context?.user_id ?? null,
              parsed.id,
            ]
          )

          // Recalc repliken/spiel_typ + page_length after Yjs content persist
          try {
            // page_length + replik_count aus frischem Content (falls verfügbar) oder DB-Fallback
            let contentForStats = freshContent
            let werkstufe_id: string | null = null
            let scene_identity_id: string | null = null

            if (!contentForStats) {
              // Fallback: content aus DB lesen
              const dsRow = await pool.query(
                `SELECT werkstufe_id, scene_identity_id, content FROM dokument_szenen WHERE id = $1`,
                [parsed.id]
              )
              const ds = dsRow.rows[0]
              contentForStats = ds?.content ?? null
              werkstufe_id = ds?.werkstufe_id ?? null
              scene_identity_id = ds?.scene_identity_id ?? null
            } else {
              const dsRow = await pool.query(
                `SELECT werkstufe_id, scene_identity_id FROM dokument_szenen WHERE id = $1`,
                [parsed.id]
              )
              werkstufe_id = dsRow.rows[0]?.werkstufe_id ?? null
              scene_identity_id = dsRow.rows[0]?.scene_identity_id ?? null
            }

            if (contentForStats) {
              const pl = calcPageLength(contentForStats)
              await pool.query(
                `UPDATE dokument_szenen SET page_length = $1 WHERE id = $2`,
                [pl, parsed.id]
              )
              const contentForCount = Array.isArray(contentForStats) ? { content: contentForStats } : contentForStats
              updateReplikCount(parsed.id, contentForCount).catch(() => {})
            }
            if (werkstufe_id && scene_identity_id && contentForStats) {
              recalcSceneStats(werkstufe_id, scene_identity_id, contentForStats).catch(() => {})
            }
            // NT-Upsert immer mit frischem Yjs-Content (nicht DB-Cache!)
            if (freshContent) {
              autoUpsertNtEintraege(
                parsed.id,
                freshContent,
                context?.user_id ?? null,
                context?.user_name ?? null
              ).catch(() => {})
            }
          } catch { /* non-critical */ }
        },
      }),
    ],
  })
}
