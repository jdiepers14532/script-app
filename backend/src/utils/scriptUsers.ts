// Script-registrierte Nutzer (= Autoren) aus dem Auth-Service, mit 5-min Cache.
// Genutzt fürs per-User-Sichtbarkeits-Gate beim Tagging: p_ist_autor = User hat eine Script-Rolle.
// (Spiegelt das getAppUsers-Muster aus rollen-freigabe.ts — hier gekapselt + wiederverwendbar.)

const AUTH_URL = 'http://127.0.0.1:3002'
const INTERNAL_KEY = process.env.INTERNAL_SECRET_KEY || 'SerienwerftInternalKey2026xQzP'
const TTL = 5 * 60 * 1000

let cache: Set<string> | null = null
let cacheTs = 0

// Set der user_ids, die für die Script-App registriert sind (eine oder mehr Rollen).
export async function getScriptUserIds(): Promise<Set<string>> {
  const now = Date.now()
  if (cache && now - cacheTs < TTL) return cache
  try {
    const resp = await fetch(`${AUTH_URL}/api/internal/app-users/script`, {
      headers: { 'x-internal-key': INTERNAL_KEY },
    })
    if (!resp.ok) return cache ?? new Set()
    const data = await resp.json() as any
    const users: any[] = data?.users ?? (Array.isArray(data) ? data : [])
    cache = new Set(users.map(u => String(u.id)))
    cacheTs = now
    return cache
  } catch {
    return cache ?? new Set()
  }
}

// Ist der gegebene User ein Script-Autor (hat ≥1 Script-Rolle)? → p_ist_autor fürs Prädikat.
export async function istAutorUser(userId: string): Promise<boolean> {
  const ids = await getScriptUserIds()
  return ids.has(String(userId))
}
