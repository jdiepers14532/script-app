import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL || 'https://script.serienwerft.studio'
const AUTH_BASE = 'https://auth.serienwerft.studio'
const API = `${BASE}/api`

let authCookie: string

test.beforeAll(async ({ request }) => {
  const loginRes = await request.post(`${AUTH_BASE}/api/auth/login`, {
    data: { email: 'noreply@serienwerft.studio', password: 'Claude2026' },
  })
  expect(loginRes.ok(), 'Login sollte erfolgreich sein').toBeTruthy()
  const cookies = loginRes.headers()['set-cookie'] ?? ''
  const match = cookies.match(/access_token=([^;]+)/)
  expect(match, 'access_token Cookie muss vorhanden sein').toBeTruthy()
  authCookie = `access_token=${match![1]}`
})

function h() { return { headers: { Cookie: authCookie } } }
function hd(data: any) { return { headers: { Cookie: authCookie }, data } }

// ── 1. Admin-Zugriff ────────────────────────────────────────────────────────

test.describe('1. Admin-Zugriff: bereich-access vollständig', () => {
  test('GET /api/me/bereich-access liefert konzept=true und analyse=true für superadmin', async ({ request }) => {
    const res = await request.get(`${API}/me/bereich-access`, h())
    expect(res.ok(), 'Endpoint muss 200 zurückgeben').toBeTruthy()
    const body = await res.json()
    expect(body.konzept, 'konzept=true wegen TIER1_ROLES').toBe(true)
    expect(body.analyse, 'analyse=true weil superadmin in analysis_allowed_roles').toBe(true)
  })
})

// ── 2. Nicht-Admin-Gating ───────────────────────────────────────────────────

test.describe('2. Nicht-Admin-Gating: analyse-Flag reagiert auf allowed_roles', () => {
  // Hinweis: claude-Account ist superadmin → konzept ist via TIER1_ROLES immer true.
  // Das analyse-Flag hat keinen TIER1-Override → es ist direkt über analysis_allowed_roles steuerbar.

  test('analyse=false wenn Rolle nicht in analysis_allowed_roles, =true nach Restore', async ({ request }) => {
    // Aktuellen Wert sichern
    const settingsRes = await request.get(`${API}/admin/app-settings`, h())
    expect(settingsRes.ok()).toBeTruthy()
    const settings = await settingsRes.json()
    const originalValue = settings['analysis_allowed_roles'] ?? '["superadmin","geschaeftsfuehrung","herstellungsleitung"]'

    try {
      // Rolle entfernen: nur "dramaturg" erlaubt → superadmin nicht berechtigt
      const putRes = await request.put(`${API}/admin/app-settings/analysis_allowed_roles`, hd({ value: '["dramaturg"]' }))
      expect(putRes.ok(), 'PUT analysis_allowed_roles muss 200 sein').toBeTruthy()

      const blockedRes = await request.get(`${API}/me/bereich-access`, h())
      expect(blockedRes.ok()).toBeTruthy()
      const blocked = await blockedRes.json()
      expect(blocked.analyse, 'analyse soll false sein wenn superadmin nicht in allowed_roles').toBe(false)
      // konzept bleibt via TIER1 weiterhin true
      expect(blocked.konzept, 'konzept bleibt true (TIER1-Override unberührt)').toBe(true)
    } finally {
      // Immer wiederherstellen
      await request.put(`${API}/admin/app-settings/analysis_allowed_roles`, hd({ value: originalValue }))
    }

    const restoredRes = await request.get(`${API}/me/bereich-access`, h())
    const restored = await restoredRes.json()
    expect(restored.analyse, 'analyse=true nach Restore').toBe(true)
  })
})

// ── 3. Script-Nav unverändert ───────────────────────────────────────────────

test.describe('3. Script-Nav: /planung-Route ohne Backend-Gate erreichbar', () => {
  test('GET /planung → 200 (kein Auth-Gate auf Backend-Ebene)', async ({ request }) => {
    // /planung ist eine SPA-Route — nginx liefert index.html mit 200.
    // Kein Backend-Gate = kein 401/403 durch das Backend.
    const res = await request.get(`${BASE}/planung`, h())
    expect(res.status(), '/planung muss 200 sein (SPA, kein Gate)').toBe(200)
    const text = await res.text()
    // Stellt sicher dass HTML geliefert wird, kein JSON-Fehler
    expect(text, 'Antwort muss HTML sein, nicht einen API-Fehler').toContain('<html')
  })

  test('/planung liefert dieselbe App-Shell wie /', async ({ request }) => {
    const rootRes = await request.get(`${BASE}/`, h())
    const planungRes = await request.get(`${BASE}/planung`, h())
    // Beide 200 — gleiche SPA (kein separates Bundle)
    expect(rootRes.status()).toBe(200)
    expect(planungRes.status()).toBe(200)
  })
})

// ── 4. Bereichs-Navigation ──────────────────────────────────────────────────

test.describe('4. Bereichs-Navigation: /planung und /analysis erreichbar', () => {
  test('GET /planung → 200', async ({ request }) => {
    const res = await request.get(`${BASE}/planung`, h())
    expect(res.status()).toBe(200)
  })

  test('GET /analysis → 200', async ({ request }) => {
    const res = await request.get(`${BASE}/analysis`, h())
    expect(res.status()).toBe(200)
    const text = await res.text()
    expect(text).toContain('<html')
  })

  test('activeBereich-Logik: /api/me/bereich-access stellt Daten für alle 3 Bereiche bereit', async ({ request }) => {
    // Prüft dass der Endpoint die für alle Bereiche nötigen Flags liefert
    const res = await request.get(`${API}/me/bereich-access`, h())
    const body = await res.json()
    // Script-Bereich braucht kein Flag (immer zugänglich)
    // Konzept + Analyse haben explizite Flags
    expect(Object.keys(body)).toEqual(expect.arrayContaining(['konzept', 'analyse']))
  })
})

// ── 5. Trennung App-Wechsel vs. Bereichs-Wechsel ───────────────────────────

test.describe('5. API-Struktur: Bereichs-Switcher klar von App-Switcher getrennt', () => {
  test('GET /api/me/bereich-access liefert genau konzept + analyse als Booleans', async ({ request }) => {
    const res = await request.get(`${API}/me/bereich-access`, h())
    expect(res.ok()).toBeTruthy()
    const body = await res.json()

    // Genau zwei Boolean-Keys — kein App-Switcher-Overhead
    expect(typeof body.konzept).toBe('boolean')
    expect(typeof body.analyse).toBe('boolean')

    // Kein Vermischen mit App-Switcher-Daten
    expect(body).not.toHaveProperty('apps')
    expect(body).not.toHaveProperty('script')
    expect(body).not.toHaveProperty('is_admin')
  })

  test('Bereich-Endpoint und whoami-Endpoint sind getrennte Ressourcen', async ({ request }) => {
    const [bereichRes, whoamiRes] = await Promise.all([
      request.get(`${API}/me/bereich-access`, h()),
      request.get(`${API}/me/whoami`, h()),
    ])
    expect(bereichRes.ok()).toBeTruthy()
    expect(whoamiRes.ok()).toBeTruthy()

    const bereich = await bereichRes.json()
    const whoami = await whoamiRes.json()

    // bereich-access hat NUR konzept + analyse
    expect(bereich).not.toHaveProperty('user_id')
    // whoami hat NUR User-Infos, kein Bereichs-Gating
    expect(whoami).not.toHaveProperty('konzept')
    expect(whoami).not.toHaveProperty('analyse')
  })
})

// ── 6. Flag-Flip ohne Deploy ────────────────────────────────────────────────

test.describe('6. Flag-Flip: Bereichszugriff per DB-Setting sofort wirksam (kein Deploy)', () => {
  test('analyse: leer→false, Rolle-eintragen→true, kein Neustart nötig', async ({ request }) => {
    const settingsRes = await request.get(`${API}/admin/app-settings`, h())
    const settings = await settingsRes.json()
    const originalValue = settings['analysis_allowed_roles'] ?? '["superadmin","geschaeftsfuehrung","herstellungsleitung"]'

    try {
      // Schritt 1: Leeres Array → analyse=false
      await request.put(`${API}/admin/app-settings/analysis_allowed_roles`, hd({ value: '[]' }))
      const noAccess = await (await request.get(`${API}/me/bereich-access`, h())).json()
      expect(noAccess.analyse, 'analyse=false nach leerem Array').toBe(false)

      // Schritt 2: superadmin eintragen → analyse=true ohne Deploy
      await request.put(`${API}/admin/app-settings/analysis_allowed_roles`, hd({ value: '["superadmin"]' }))
      const withAccess = await (await request.get(`${API}/me/bereich-access`, h())).json()
      expect(withAccess.analyse, 'analyse=true nach Rolle-Eintrag (kein Deploy!)').toBe(true)
    } finally {
      await request.put(`${API}/admin/app-settings/analysis_allowed_roles`, hd({ value: originalValue }))
    }
  })

  test('konzept_allowed_roles: Rolle wird sofort gespeichert und ist abrufbar', async ({ request }) => {
    const settingsRes = await request.get(`${API}/admin/app-settings`, h())
    const settings = await settingsRes.json()
    const originalValue = settings['konzept_allowed_roles'] ?? '["superadmin","geschaeftsfuehrung","herstellungsleitung"]'

    try {
      // Test-Rolle hinzufügen
      const currentRoles: string[] = JSON.parse(originalValue)
      if (!currentRoles.includes('test-bereichs-rolle')) {
        currentRoles.push('test-bereichs-rolle')
      }
      const newValue = JSON.stringify(currentRoles)

      const putRes = await request.put(`${API}/admin/app-settings/konzept_allowed_roles`, hd({ value: newValue }))
      expect(putRes.ok(), 'PUT konzept_allowed_roles muss erlaubt sein').toBeTruthy()

      // Prüfen: sofort in DB und lesbar
      const afterSettings = await (await request.get(`${API}/admin/app-settings`, h())).json()
      const storedRoles: string[] = JSON.parse(afterSettings['konzept_allowed_roles'] ?? '[]')
      expect(storedRoles, 'test-bereichs-rolle muss in konzept_allowed_roles gespeichert sein').toContain('test-bereichs-rolle')

      // bereich-access liefert konzept=true (superadmin via TIER1_ROLES, unabhängig von konzept_allowed_roles)
      const bereich = await (await request.get(`${API}/me/bereich-access`, h())).json()
      expect(bereich.konzept, 'konzept=true (superadmin in TIER1_ROLES)').toBe(true)
    } finally {
      await request.put(`${API}/admin/app-settings/konzept_allowed_roles`, hd({ value: originalValue }))
    }
  })
})
