/**
 * Firmenname aus auth.app — mit 1h-Cache.
 * Fallback: process.env.COMPANY_NAME oder 'Serienwerft'
 */

let _cache: { name: string; fetchedAt: number } | null = null

export async function getCompanyName(): Promise<string> {
  const now = Date.now()
  if (_cache && now - _cache.fetchedAt < 3_600_000) return _cache.name
  try {
    const r = await fetch('http://127.0.0.1:3002/api/public/company-info')
    if (r.ok) {
      const d = await r.json() as any
      const name: string = d?.company_name || process.env.COMPANY_NAME || 'Serienwerft'
      _cache = { name, fetchedAt: now }
      return name
    }
  } catch { /* ignore — Fallback */ }
  return process.env.COMPANY_NAME || 'Serienwerft'
}
