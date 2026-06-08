import { useState, useEffect, useCallback } from 'react'

export interface Production {
  id: string
  title: string
  staffelnummer: number | null
  projektnummer: string | null
  is_active: boolean
  logo_filename: string | null
  buero_adresse:  string | null
  telefon:        string | null
  sender:         string | null
  drehzeitraum:   string | null
  autoren:        string | null
}

export function productionLabel(p: Production, staffelLabel = 'Staffel'): string {
  if (p.staffelnummer) return `${p.title} ${staffelLabel} ${p.staffelnummer}`
  return p.title
}

export function useProduction() {
  const [productions, setProductions] = useState<Production[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Öffentliche Token-Seiten (kein Login): keinen Auth-Redirect auslösen,
    // sonst werden externe Empfänger (z.B. Verteiler-Portal /v/:token) auf die
    // Login-Seite geworfen statt die Public-Seite zu sehen.
    const PUBLIC_ROUTE_PREFIXES = ['/v/', '/freigabe/', '/privat-mode-token/']
    const isPublicRoute = PUBLIC_ROUTE_PREFIXES.some(p => window.location.pathname.startsWith(p))
    Promise.all([
      fetch('/api/me/productions', { credentials: 'include' }).then(r => {
        if (r.status === 401) {
          if (isPublicRoute) return []
          const redirectUrl = window.location.href
          sessionStorage.setItem('auth_redirect_after_login', redirectUrl)
          window.location.href = `https://auth.serienwerft.studio/?redirect=${encodeURIComponent(redirectUrl)}`
          return []
        }
        return r.json()
      }),
      fetch('/api/me/settings', { credentials: 'include' }).then(r => {
        if (r.status === 401) return {} as any
        return r.json()
      }),
    ])
      .then(([prods, settings]) => {
        if (!Array.isArray(prods)) {
          setProductions([])
          return
        }
        setProductions(prods)
        const savedId = settings?.selected_production_id
        const valid = savedId && prods.find((p: Production) => p.id === savedId)
        if (valid) {
          setSelectedId(savedId)
        } else if (prods.length > 0) {
          const firstActive = prods.find((p: Production) => p.is_active) || prods[0]
          setSelectedId(firstActive.id)
          // Do NOT auto-persist the fallback — it would race with an explicit
          // user selection made immediately after load and could overwrite it.
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const selectProduction = useCallback((id: string) => {
    setSelectedId(id)
    persistSelection(id)
  }, [])

  return {
    productions,
    selectedId,
    selectedProduction: productions.find(p => p.id === selectedId) || null,
    selectProduction,
    loading,
  }
}

function persistSelection(id: string) {
  fetch('/api/me/settings', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ selected_production_id: id }),
  }).catch(console.error)
}
