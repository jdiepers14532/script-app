// Script-registrierte Nutzer (= Autoren) aus dem Auth-Service, mit 5-min Cache.
// Genutzt fürs per-User-Sichtbarkeits-Gate beim Tagging (p_ist_autor = User hat Script-Rolle)
// und für die Taggbare-User-Liste im Anmerkungs-Panel.
// (Spiegelt das getAppUsers-Muster aus rollen-freigabe.ts — hier gekapselt + wiederverwendbar.)

const AUTH_URL = 'http://127.0.0.1:3002'
const INTERNAL_KEY = process.env.INTERNAL_SECRET_KEY || 'SerienwerftInternalKey2026xQzP'
const TTL = 5 * 60 * 1000

export interface ScriptUser { id: string; name: string; email: string }

let cache: ScriptUser[] | null = null
let cacheTs = 0

// Vollständige, deduplizierte Liste der für die Script-App registrierten Nutzer.
export async function getScriptUsers(): Promise<ScriptUser[]> {
  const now = Date.now()
  if (cache && now - cacheTs < TTL) return cache
  try {
    const resp = await fetch(`${AUTH_URL}/api/internal/app-users/script`, {
      headers: { 'x-internal-key': INTERNAL_KEY },
    })
    if (!resp.ok) return cache ?? []
    const data = await resp.json() as any
    const users: any[] = data?.users ?? (Array.isArray(data) ? data : [])
    const map = new Map<string, ScriptUser>()
    for (const u of users) {
      const id = String(u.id)
      if (!map.has(id)) {
        map.set(id, {
          id,
          name: (u.username || '').trim() || String(u.email || '').split('@')[0] || id,
          email: u.email ?? '',
        })
      }
    }
    cache = [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'))
    cacheTs = now
    return cache
  } catch {
    return cache ?? []
  }
}

// Set der user_ids mit Script-Rolle → p_ist_autor fürs Sichtbarkeits-Prädikat.
export async function getScriptUserIds(): Promise<Set<string>> {
  const users = await getScriptUsers()
  return new Set(users.map(u => u.id))
}

export async function istAutorUser(userId: string): Promise<boolean> {
  const ids = await getScriptUserIds()
  return ids.has(String(userId))
}
