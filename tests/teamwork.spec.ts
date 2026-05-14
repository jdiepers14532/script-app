import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL || 'https://script.serienwerft.studio'
const AUTH_BASE = 'https://auth.serienwerft.studio'
const API = `${BASE}/api`

// Shared test fixtures (same produktionId used across all script-app tests)
// Note: in folgen-v2 this is called produktion_id; in colab-gruppen it's also produktion_id
const staffelId = 'd26dff66-57cf-4b32-9649-4009618fce4d'
const produktionId = staffelId

let authCookie: string
let currentUserId: string
let testGruppeId: string
let testFolgeId: number
let testWerkId: string

// ── Auth ──────────────────────────────────────────────────────────────────────

test.beforeAll(async ({ request }) => {
  // Login with claude test account
  const loginRes = await request.post(`${AUTH_BASE}/api/auth/login`, {
    data: { email: 'noreply@serienwerft.studio', password: 'Claude2026' },
  })
  expect(loginRes.ok(), 'Login sollte erfolgreich sein').toBeTruthy()
  const cookies = loginRes.headers()['set-cookie'] ?? ''
  const match = cookies.match(/access_token=([^;]+)/)
  expect(match, 'access_token Cookie muss vorhanden sein').toBeTruthy()
  authCookie = `access_token=${match![1]}`

  // Decode JWT payload to get user ID (sub claim)
  const jwtToken = authCookie.replace('access_token=', '')
  const parts = jwtToken.split('.')
  expect(parts.length, 'JWT muss 3 Teile haben').toBe(3)
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
  currentUserId = payload.sub ?? payload.user_id ?? payload.id ?? ''
  expect(currentUserId, 'currentUserId muss aus JWT-Payload (sub) gelesen werden').toBeTruthy()

  // Ensure test folge 9999 exists (shared fixture, ON CONFLICT DO NOTHING)
  const folgeRes = await request.post(`${API}/v2/folgen`, {
    headers: { Cookie: authCookie },
    data: { produktion_id: produktionId, folge_nummer: 9999, folgen_titel: 'TeamWork Testfolge' },
  })
  const folgeBody = await folgeRes.json()
  if (folgeRes.ok()) {
    testFolgeId = folgeBody.id
  } else {
    // Folge existiert bereits — per GET holen
    const listRes = await request.get(`${API}/v2/folgen?produktion_id=${produktionId}`, {
      headers: { Cookie: authCookie },
    })
    const listBody = await listRes.json()
    const list: any[] = Array.isArray(listBody) ? listBody : (listBody.folgen ?? listBody.rows ?? [])
    const existing = list.find((f: any) => f.folge_nummer === 9999)
    expect(existing, 'Testfolge 9999 muss vorhanden sein').toBeTruthy()
    testFolgeId = existing.id
  }

  // Create a fresh test werkstufe
  const werkRes = await request.post(`${API}/v2/folgen/${testFolgeId}/werkstufen`, {
    headers: { Cookie: authCookie },
    data: { typ: 'notiz', label: 'TeamWork Test' },
  })
  expect(werkRes.status(), 'Werkstufe erstellen sollte 201 zurückgeben').toBe(201)
  testWerkId = (await werkRes.json()).id
})

function h() { return { headers: { Cookie: authCookie } } }
function hd(data: any) { return { headers: { Cookie: authCookie }, data } }

// ── 1. Colab-Gruppen CRUD ─────────────────────────────────────────────────────

test.describe('1. Colab-Gruppen CRUD', () => {
  test('GET ohne produktion_id → 400', async ({ request }) => {
    const res = await request.get(`${API}/colab-gruppen`, h())
    expect(res.status()).toBe(400)
  })

  test('GET mit produktion_id → Array', async ({ request }) => {
    const res = await request.get(`${API}/colab-gruppen?produktion_id=${staffelId}`, h())
    expect(res.ok()).toBeTruthy()
    const data = await res.json()
    expect(Array.isArray(data)).toBeTruthy()
  })

  test('POST — Gruppe erstellen', async ({ request }) => {
    const res = await request.post(`${API}/colab-gruppen`, hd({
      produktion_id: staffelId,
      name: 'Playwright Test-Gruppe',
      beschreibung: 'Automatisch erstellt von Playwright',
    }))
    expect(res.status()).toBe(201)
    const data = await res.json()
    expect(data.name).toBe('Playwright Test-Gruppe')
    expect(data.produktion_id).toBe(staffelId)
    expect(data).toHaveProperty('id')
    expect(data).toHaveProperty('erstellt_von')
    expect(Array.isArray(data.mitglieder)).toBeTruthy()
    testGruppeId = data.id
  })

  test('POST ohne name → 400', async ({ request }) => {
    const res = await request.post(`${API}/colab-gruppen`, hd({ produktion_id: staffelId }))
    expect(res.status()).toBe(400)
  })

  test('GET — neue Gruppe erscheint in der Liste', async ({ request }) => {
    test.skip(!testGruppeId, 'Gruppe wurde nicht erstellt')
    const res = await request.get(`${API}/colab-gruppen?produktion_id=${staffelId}`, h())
    expect(res.ok()).toBeTruthy()
    const list = await res.json()
    const found = list.find((g: any) => g.id === testGruppeId)
    expect(found, 'Neu erstellte Gruppe muss in der Liste erscheinen').toBeTruthy()
    expect(found.name).toBe('Playwright Test-Gruppe')
    expect(found.beschreibung).toBe('Automatisch erstellt von Playwright')
  })

  test('PUT — Gruppe umbenennen', async ({ request }) => {
    test.skip(!testGruppeId, 'Gruppe wurde nicht erstellt')
    const res = await request.put(`${API}/colab-gruppen/${testGruppeId}`, hd({
      name: 'Playwright Test-Gruppe (umbenannt)',
    }))
    expect(res.ok()).toBeTruthy()
    const data = await res.json()
    expect(data.name).toBe('Playwright Test-Gruppe (umbenannt)')
  })

  test('PUT auf nicht-existierende Gruppe → 404', async ({ request }) => {
    const res = await request.put(
      `${API}/colab-gruppen/00000000-0000-0000-0000-000000000000`,
      hd({ name: 'Ghost' })
    )
    expect(res.status()).toBe(404)
  })
})

// ── 2. Mitglieder ─────────────────────────────────────────────────────────────

test.describe('2. Mitglieder', () => {
  test('POST /mitglieder ohne user_id → 400', async ({ request }) => {
    test.skip(!testGruppeId, 'Gruppe wurde nicht erstellt')
    const res = await request.post(`${API}/colab-gruppen/${testGruppeId}/mitglieder`, hd({
      user_name: 'Nur Name',
    }))
    expect(res.status()).toBe(400)
  })

  test('POST /mitglieder — Self-Join (jeder darf sich selbst hinzufügen)', async ({ request }) => {
    test.skip(!testGruppeId || !currentUserId, 'Gruppe oder User nicht vorhanden')
    const res = await request.post(`${API}/colab-gruppen/${testGruppeId}/mitglieder`, hd({
      user_id: currentUserId,
      user_name: 'Claude Test',
    }))
    expect(res.status()).toBe(201)
    const data = await res.json()
    expect(data.user_id).toBe(currentUserId)
    expect(data.gruppe_id).toBe(testGruppeId)
  })

  test('POST /mitglieder — Self-Join doppelt (ON CONFLICT → Upsert)', async ({ request }) => {
    test.skip(!testGruppeId || !currentUserId, 'Gruppe oder User nicht vorhanden')
    const res = await request.post(`${API}/colab-gruppen/${testGruppeId}/mitglieder`, hd({
      user_id: currentUserId,
      user_name: 'Claude Test Updated',
    }))
    expect(res.status()).toBe(201)
    const data = await res.json()
    expect(data.user_name).toBe('Claude Test Updated')
  })

  test('GET Gruppe — Mitglied nach Self-Join enthalten', async ({ request }) => {
    test.skip(!testGruppeId || !currentUserId, 'Gruppe oder User nicht vorhanden')
    const res = await request.get(`${API}/colab-gruppen?produktion_id=${staffelId}`, h())
    const list = await res.json()
    const gruppe = list.find((g: any) => g.id === testGruppeId)
    expect(gruppe).toBeTruthy()
    const isMember = (gruppe.mitglieder ?? []).some((m: any) => m.user_id === currentUserId)
    expect(isMember, 'User muss nach Self-Join als Mitglied erscheinen').toBeTruthy()
  })

  test('DELETE /mitglieder/:userId — Self-Remove', async ({ request }) => {
    test.skip(!testGruppeId || !currentUserId, 'Gruppe oder User nicht vorhanden')
    const res = await request.delete(
      `${API}/colab-gruppen/${testGruppeId}/mitglieder/${encodeURIComponent(currentUserId)}`,
      h()
    )
    expect(res.ok()).toBeTruthy()
    const data = await res.json()
    expect(data.ok).toBeTruthy()
  })

  test('Mitglied nicht mehr enthalten nach Self-Remove', async ({ request }) => {
    test.skip(!testGruppeId || !currentUserId, 'Gruppe oder User nicht vorhanden')
    const res = await request.get(`${API}/colab-gruppen?produktion_id=${staffelId}`, h())
    const list = await res.json()
    const gruppe = list.find((g: any) => g.id === testGruppeId)
    const isMember = (gruppe?.mitglieder ?? []).some((m: any) => m.user_id === currentUserId)
    expect(isMember, 'User sollte nach Remove nicht mehr Mitglied sein').toBeFalsy()
  })
})

// ── 3. Sichtbarkeit ───────────────────────────────────────────────────────────

test.describe('3. Sichtbarkeit', () => {
  test('PUT — autoren', async ({ request }) => {
    test.skip(!testWerkId, 'Werkstufe nicht erstellt')
    const res = await request.put(`${API}/werkstufen/${testWerkId}/sichtbarkeit`, hd({
      sichtbarkeit: 'autoren',
    }))
    expect(res.ok()).toBeTruthy()
    const data = await res.json()
    expect(data.sichtbarkeit).toBe('autoren')
    expect(data.privat_permanent).toBeFalsy()
  })

  test('PUT — produktion', async ({ request }) => {
    test.skip(!testWerkId, 'Werkstufe nicht erstellt')
    const res = await request.put(`${API}/werkstufen/${testWerkId}/sichtbarkeit`, hd({
      sichtbarkeit: 'produktion',
    }))
    expect(res.ok()).toBeTruthy()
    expect((await res.json()).sichtbarkeit).toBe('produktion')
  })

  test('PUT — privat (mit Auto-Ablauf)', async ({ request }) => {
    test.skip(!testWerkId, 'Werkstufe nicht erstellt')
    const res = await request.put(`${API}/werkstufen/${testWerkId}/sichtbarkeit`, hd({
      sichtbarkeit: 'privat',
      privat_permanent: false,
    }))
    expect(res.ok()).toBeTruthy()
    const data = await res.json()
    expect(data.sichtbarkeit).toBe('privat')
    expect(data.privat_permanent).toBe(false)
    expect(data.privat_gesetzt_am).toBeTruthy()
    expect(data.privat_gesetzt_von).toBeTruthy()
    // previous_sichtbarkeit soll den Zustand vor privat festhalten
    expect(data.previous_sichtbarkeit).toBeTruthy()
  })

  test('PUT — privat dauerhaft (privat_permanent=true, kein Auto-Ablauf)', async ({ request }) => {
    test.skip(!testWerkId, 'Werkstufe nicht erstellt')
    // Reset to autoren first so previous_sichtbarkeit is set correctly
    await request.put(`${API}/werkstufen/${testWerkId}/sichtbarkeit`, hd({ sichtbarkeit: 'autoren' }))
    const res = await request.put(`${API}/werkstufen/${testWerkId}/sichtbarkeit`, hd({
      sichtbarkeit: 'privat',
      privat_permanent: true,
    }))
    expect(res.ok()).toBeTruthy()
    const data = await res.json()
    expect(data.sichtbarkeit).toBe('privat')
    expect(data.privat_permanent).toBe(true)
  })

  test('PUT — team:{gruppeId}', async ({ request }) => {
    test.skip(!testWerkId || !testGruppeId, 'Werkstufe oder Gruppe nicht vorhanden')
    const res = await request.put(`${API}/werkstufen/${testWerkId}/sichtbarkeit`, hd({
      sichtbarkeit: `team:${testGruppeId}`,
    }))
    expect(res.ok()).toBeTruthy()
    expect((await res.json()).sichtbarkeit).toBe(`team:${testGruppeId}`)
  })

  test('PUT — colab:{gruppeId}', async ({ request }) => {
    test.skip(!testWerkId || !testGruppeId, 'Werkstufe oder Gruppe nicht vorhanden')
    const res = await request.put(`${API}/werkstufen/${testWerkId}/sichtbarkeit`, hd({
      sichtbarkeit: `colab:${testGruppeId}`,
    }))
    expect(res.ok()).toBeTruthy()
    expect((await res.json()).sichtbarkeit).toBe(`colab:${testGruppeId}`)
  })

  test('PUT — ungültiger Wert → 400', async ({ request }) => {
    test.skip(!testWerkId, 'Werkstufe nicht erstellt')
    const res = await request.put(`${API}/werkstufen/${testWerkId}/sichtbarkeit`, hd({
      sichtbarkeit: 'geheim',
    }))
    expect(res.status()).toBe(400)
  })

  test('PUT — team: ohne UUID-Format → 400', async ({ request }) => {
    test.skip(!testWerkId, 'Werkstufe nicht erstellt')
    const res = await request.put(`${API}/werkstufen/${testWerkId}/sichtbarkeit`, hd({
      sichtbarkeit: 'team:keine-uuid',
    }))
    expect(res.status()).toBe(400)
  })

  test('PUT — team: mit nicht-existierender UUID → 404', async ({ request }) => {
    test.skip(!testWerkId, 'Werkstufe nicht erstellt')
    const res = await request.put(`${API}/werkstufen/${testWerkId}/sichtbarkeit`, hd({
      sichtbarkeit: 'team:00000000-0000-0000-0000-000000000000',
    }))
    expect(res.status()).toBe(404)
  })

  test('GET /api/werkstufen/:id — Ersteller sieht eigene Werkstufe auch bei colab:', async ({ request }) => {
    test.skip(!testWerkId || !testGruppeId, 'Werkstufe oder Gruppe nicht vorhanden')
    // Set colab visibility first
    await request.put(`${API}/werkstufen/${testWerkId}/sichtbarkeit`, hd({
      sichtbarkeit: `colab:${testGruppeId}`,
    }))
    const res = await request.get(`${API}/werkstufen/${testWerkId}`, h())
    expect(res.ok(), 'Ersteller muss eigene Werkstufe immer sehen').toBeTruthy()
    expect((await res.json()).id).toBe(testWerkId)
  })
})

// ── 4. Werkstufen-Sessions (Heartbeat) ────────────────────────────────────────

test.describe('4. Werkstufen-Sessions (Heartbeat)', () => {
  test('PUT — Session starten (UPSERT)', async ({ request }) => {
    test.skip(!testWerkId, 'Werkstufe nicht erstellt')
    const res = await request.put(`${API}/werkstufen-sessions/${testWerkId}`, h())
    expect(res.ok()).toBeTruthy()
    const data = await res.json()
    expect(data.werkstufe_id).toBe(testWerkId)
    expect(data).toHaveProperty('last_active_at')
    expect(data).toHaveProperty('user_id')
  })

  test('PUT — Heartbeat (zweiter UPSERT erneuert last_active_at)', async ({ request }) => {
    test.skip(!testWerkId, 'Werkstufe nicht erstellt')
    const res = await request.put(`${API}/werkstufen-sessions/${testWerkId}`, h())
    expect(res.ok()).toBeTruthy()
    expect((await res.json()).werkstufe_id).toBe(testWerkId)
  })

  test('GET — eigene Session nicht in aktiver Liste (excludes self)', async ({ request }) => {
    test.skip(!testWerkId, 'Werkstufe nicht erstellt')
    const res = await request.get(`${API}/werkstufen-sessions/${testWerkId}`, h())
    expect(res.ok()).toBeTruthy()
    const data = await res.json()
    expect(Array.isArray(data)).toBeTruthy()
    // Own session is excluded (AND user_id != $2)
    if (currentUserId) {
      const hasSelf = data.some((s: any) => s.user_id === currentUserId)
      expect(hasSelf, 'Eigene Session darf nicht in der aktiven Liste stehen').toBeFalsy()
    }
  })

  test('DELETE — Session beenden', async ({ request }) => {
    test.skip(!testWerkId, 'Werkstufe nicht erstellt')
    const res = await request.delete(`${API}/werkstufen-sessions/${testWerkId}`, h())
    expect(res.ok()).toBeTruthy()
    expect((await res.json()).ok).toBeTruthy()
  })
})

// ── 5. App-User Suche ─────────────────────────────────────────────────────────

test.describe('5. App-User Suche', () => {
  test('GET /app-users — gibt User-Liste zurück', async ({ request }) => {
    const res = await request.get(`${API}/colab-gruppen/app-users`, h())
    expect(res.ok()).toBeTruthy()
    const data = await res.json()
    expect(Array.isArray(data)).toBeTruthy()
    if (data.length > 0) {
      expect(data[0]).toHaveProperty('user_id')
      expect(data[0]).toHaveProperty('user_name')
      expect(data[0]).toHaveProperty('email')
    }
  })

  test('GET /app-users?q=xyz — gibt Array zurück (kann leer sein)', async ({ request }) => {
    const res = await request.get(`${API}/colab-gruppen/app-users?q=xyz`, h())
    expect(res.ok()).toBeTruthy()
    const data = await res.json()
    expect(Array.isArray(data)).toBeTruthy()
  })

  test('GET /app-users mit Query — Ergebnis kleiner gleich Gesamtliste', async ({ request }) => {
    const allRes = await request.get(`${API}/colab-gruppen/app-users`, h())
    const allData = await allRes.json()
    // A non-matching query should return fewer or equal results
    const filteredRes = await request.get(`${API}/colab-gruppen/app-users?q=zzzznonexistent`, h())
    expect(filteredRes.ok()).toBeTruthy()
    const filteredData = await filteredRes.json()
    expect(Array.isArray(filteredData)).toBeTruthy()
    expect(filteredData.length).toBeLessThanOrEqual(allData.length)
  })

  test('GET /app-users — maximal 20 Ergebnisse', async ({ request }) => {
    const res = await request.get(`${API}/colab-gruppen/app-users`, h())
    expect(res.ok()).toBeTruthy()
    const data = await res.json()
    expect(data.length).toBeLessThanOrEqual(20)
  })

  test('GET /app-users ohne Auth → 401', async ({ request }) => {
    const res = await request.get(`${API}/colab-gruppen/app-users`)
    expect(res.status()).toBe(401)
  })
})

// ── 6. Security ───────────────────────────────────────────────────────────────

test.describe('6. Security', () => {
  test('PUT /sichtbarkeit ohne Auth → 401', async ({ request }) => {
    test.skip(!testWerkId, 'Werkstufe nicht erstellt')
    const res = await request.put(`${API}/werkstufen/${testWerkId}/sichtbarkeit`, {
      data: { sichtbarkeit: 'autoren' },
    })
    expect(res.status()).toBe(401)
  })

  test('POST /colab-gruppen ohne Auth → 401', async ({ request }) => {
    const res = await request.post(`${API}/colab-gruppen`, {
      data: { produktion_id: staffelId, name: 'Unbefugt' },
    })
    expect(res.status()).toBe(401)
  })

  test('POST /mitglieder ohne Auth → 401', async ({ request }) => {
    test.skip(!testGruppeId, 'Gruppe nicht vorhanden')
    const res = await request.post(`${API}/colab-gruppen/${testGruppeId}/mitglieder`, {
      data: { user_id: 'x', user_name: 'x' },
    })
    expect(res.status()).toBe(401)
  })

  test('PUT /colab-gruppen ohne Auth → 401', async ({ request }) => {
    test.skip(!testGruppeId, 'Gruppe nicht vorhanden')
    const res = await request.put(`${API}/colab-gruppen/${testGruppeId}`, {
      data: { name: 'Hacker' },
    })
    expect(res.status()).toBe(401)
  })

  test('DELETE /colab-gruppen ohne Auth → 401', async ({ request }) => {
    test.skip(!testGruppeId, 'Gruppe nicht vorhanden')
    const res = await request.delete(`${API}/colab-gruppen/${testGruppeId}`)
    expect(res.status()).toBe(401)
  })

  test('DELETE /werkstufen ohne Auth → 401', async ({ request }) => {
    test.skip(!testWerkId, 'Werkstufe nicht erstellt')
    const res = await request.delete(`${API}/werkstufen/${testWerkId}`)
    expect(res.status()).toBe(401)
  })
})

// ── Cleanup ───────────────────────────────────────────────────────────────────

test.afterAll(async ({ request }) => {
  if (testWerkId) {
    await request.delete(`${API}/werkstufen/${testWerkId}`, h())
  }
  if (testGruppeId) {
    await request.delete(`${API}/colab-gruppen/${testGruppeId}`, h())
  }
})
