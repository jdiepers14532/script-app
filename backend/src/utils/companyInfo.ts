/**
 * Firmendaten aus auth.app — mit 5min-Cache.
 * Fallback: process.env.COMPANY_NAME oder 'Serienwerft'
 */

const AUTH_INTERNAL = process.env.AUTH_INTERNAL_URL ?? 'http://127.0.0.1:3002'

interface CompanyInfo {
  company_name: string;
  company_email: string;
  it_contact_email: string;
  it_contact_name: string;
  it_contact_phone: string;
}

let _infoCache: CompanyInfo | null = null
let _infoCacheAt = 0
const TTL = 5 * 60_000

export async function getCompanyInfo(): Promise<CompanyInfo> {
  if (_infoCache && Date.now() - _infoCacheAt < TTL) return _infoCache
  try {
    const r = await fetch(`${AUTH_INTERNAL}/api/public/company-info`)
    if (r.ok) {
      const d = await r.json() as Record<string, string>
      _infoCache = {
        company_name: d.company_name || process.env.COMPANY_NAME || 'Serienwerft',
        company_email: d.company_email || '',
        it_contact_email: d.it_contact_email || '',
        it_contact_name: d.it_contact_name || '',
        it_contact_phone: d.it_contact_phone || '',
      }
      _infoCacheAt = Date.now()
      return _infoCache
    }
  } catch { /* ignore — Fallback */ }
  return { company_name: process.env.COMPANY_NAME || 'Serienwerft', company_email: '', it_contact_email: '', it_contact_name: '', it_contact_phone: '' }
}

export async function getCompanyName(): Promise<string> {
  return (await getCompanyInfo()).company_name
}
