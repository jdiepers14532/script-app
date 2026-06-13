/**
 * breakdown-app — Emitter (Handoff Phase 3, 3.2).
 *
 * Feuert nach erfolgreicher Veröffentlichung einer Werkstufe einen Webhook an die
 * breakdown-app (fire-and-forget, Muster notifyKiTrainer). Diff serverseitig gegen die
 * zuletzt published Werkstufe derselben Folge; bei fehlender Vorgänger-Fassung: alles added.
 */
import { pool } from '../db'

type SceneRow = { scene_identity_id: string; spieltag: number | null; zusammenfassung: string | null }

async function charsByScene(werkstufeId: string): Promise<Map<string, Set<string>>> {
  const r = await pool.query(
    `SELECT scene_identity_id, character_id FROM scene_characters WHERE werkstufe_id = $1`,
    [werkstufeId]
  )
  const m = new Map<string, Set<string>>()
  for (const row of r.rows) {
    const s = m.get(row.scene_identity_id) || new Set<string>()
    s.add(row.character_id)
    m.set(row.scene_identity_id, s)
  }
  return m
}

/**
 * Berechnet den Diff und sendet den Webhook. Wirft NIE (fire-and-forget).
 */
export async function emitBreakdownWebhook(opts: {
  werkstufeId: string
  folgeId: string
  produktionId: string | null
  folgeNummer: number | string | null
}): Promise<void> {
  const BREAKDOWN_URL = process.env.BREAKDOWN_URL
  const secret = process.env.BREAKDOWN_INTERNAL_SECRET
  if (!BREAKDOWN_URL || !secret) return // nicht konfiguriert → still aus

  try {
    // Szenen der aktuellen Werkstufe
    const curRes = await pool.query<SceneRow>(
      `SELECT scene_identity_id, spieltag, zusammenfassung FROM dokument_szenen WHERE werkstufe_id = $1`,
      [opts.werkstufeId]
    )
    const cur = curRes.rows
    const curById = new Map(cur.map(s => [s.scene_identity_id, s]))

    // Zuletzt published Werkstufe DERSELBEN Folge (außer der gerade veröffentlichten)
    const prevWsRes = await pool.query(
      `SELECT id FROM werkstufen
       WHERE folge_id = $1 AND published = true AND id <> $2
       ORDER BY published_am DESC NULLS LAST LIMIT 1`,
      [opts.folgeId, opts.werkstufeId]
    )
    const prevWsId: string | null = prevWsRes.rows[0]?.id ?? null

    const added_scenes: any[] = []
    const removed_scenes: string[] = []
    const changed_scenes: any[] = []
    const spieltag_shifted: any[] = []

    if (!prevWsId) {
      // Keine Vorgänger-Fassung → alles added
      for (const s of cur) {
        added_scenes.push({
          scene_identity_id: s.scene_identity_id,
          spieltag: s.spieltag,
          characters: [],
          oneliner: s.zusammenfassung,
        })
      }
    } else {
      const prevRes = await pool.query<SceneRow>(
        `SELECT scene_identity_id, spieltag, zusammenfassung FROM dokument_szenen WHERE werkstufe_id = $1`,
        [prevWsId]
      )
      const prevById = new Map(prevRes.rows.map(s => [s.scene_identity_id, s]))
      const curChars = await charsByScene(opts.werkstufeId)
      const prevChars = await charsByScene(prevWsId)

      // added + spieltag_shifted + changed (Besetzungs-Diff)
      for (const s of cur) {
        const prev = prevById.get(s.scene_identity_id)
        if (!prev) {
          added_scenes.push({
            scene_identity_id: s.scene_identity_id,
            spieltag: s.spieltag,
            characters: Array.from(curChars.get(s.scene_identity_id) || []),
            oneliner: s.zusammenfassung,
          })
          continue
        }
        if ((prev.spieltag ?? null) !== (s.spieltag ?? null)) {
          spieltag_shifted.push({ scene_identity_id: s.scene_identity_id, alt: prev.spieltag ?? null, neu: s.spieltag ?? null })
        }
        const cset = curChars.get(s.scene_identity_id) || new Set<string>()
        const pset = prevChars.get(s.scene_identity_id) || new Set<string>()
        const characters_added = [...cset].filter(c => !pset.has(c))
        const characters_removed = [...pset].filter(c => !cset.has(c))
        if (characters_added.length || characters_removed.length) {
          changed_scenes.push({ scene_identity_id: s.scene_identity_id, characters_added, characters_removed })
        }
      }
      // removed
      for (const s of prevById.keys()) {
        if (!curById.has(s)) removed_scenes.push(s)
      }
    }

    const payload = {
      episode_id: opts.folgeId,
      staffel_id: opts.produktionId ?? 'default',
      werkstufe_id: opts.werkstufeId,
      event: 'published',
      added_scenes,
      removed_scenes,
      changed_scenes,
      spieltag_shifted,
    }

    await fetch(`${BREAKDOWN_URL}/api/webhooks/script-change`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Breakdown-Secret': secret },
      body: JSON.stringify(payload),
    })
  } catch (err) {
    // Fire-and-forget: Veröffentlichung darf nie an der Breakdown-Meldung scheitern.
    console.error('[breakdownEmitter] Webhook fehlgeschlagen:', err)
  }
}
