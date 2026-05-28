import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL || 'https://script.serienwerft.studio'
const AUTH_BASE = 'https://auth.serienwerft.studio'
const API = `${BASE}/api`

// Known test production (used consistently across all test files)
const produktionId = 'd26dff66-57cf-4b32-9649-4009618fce4d'

let authCookie: string
let testFolgeId: number
let testWerkId: string

// ══════════════════════════════════════════════════════════════════════════════
// Auth + Setup
// ══════════════════════════════════════════════════════════════════════════════

test.beforeAll(async ({ request }) => {
  // Login
  const loginRes = await request.post(`${AUTH_BASE}/api/auth/login`, {
    data: { email: 'noreply@serienwerft.studio', password: 'Claude2026' },
  })
  expect(loginRes.ok()).toBeTruthy()
  const cookies = loginRes.headers()['set-cookie'] ?? ''
  const match = cookies.match(/access_token=([^;]+)/)
  expect(match).toBeTruthy()
  authCookie = `access_token=${match![1]}`

  // Get existing test folge 9999 (created by other test suites) or create it
  const listRes = await request.get(`${API}/v2/folgen?produktion_id=${produktionId}`, {
    headers: { Cookie: authCookie },
  })
  expect(listRes.ok()).toBeTruthy()
  const list = await listRes.json()
  expect(Array.isArray(list)).toBeTruthy()
  let testFolge = list.find((f: any) => f.folge_nummer === 9999)
  if (!testFolge) {
    const createRes = await request.post(`${API}/v2/folgen`, {
      headers: { Cookie: authCookie },
      data: { produktion_id: produktionId, folge_nummer: 9999, folgen_titel: 'Testfolge Seitenzahlen-Lock' },
    })
    expect(createRes.ok()).toBeTruthy()
    testFolge = await createRes.json()
  }
  testFolgeId = testFolge.id

  // Create a fresh test werkstufe for lock tests
  const wsRes = await request.post(`${API}/v2/folgen/${testFolgeId}/werkstufen`, {
    headers: { Cookie: authCookie },
    data: { typ: 'drehbuch', label: 'Lock-Test-Werkstufe' },
  })
  expect(wsRes.ok()).toBeTruthy()
  const ws = await wsRes.json()
  testWerkId = ws.id
})

test.afterAll(async ({ request }) => {
  // Cleanup: delete test werkstufe
  if (testWerkId) {
    await request.delete(`${API}/werkstufen/${testWerkId}`, {
      headers: { Cookie: authCookie },
    })
  }
})

function h() { return { headers: { Cookie: authCookie } } }

// ══════════════════════════════════════════════════════════════════════════════
// 1. Initialzustand
// ══════════════════════════════════════════════════════════════════════════════

test('Neue Werkstufe hat seitenzahlen_gesperrt=false', async ({ request }) => {
  test.skip(!testWerkId, 'No test werkstufe')
  const res = await request.get(`${API}/werkstufen/${testWerkId}`, h())
  expect(res.ok()).toBeTruthy()
  const ws = await res.json()
  expect(ws.seitenzahlen_gesperrt).toBeFalsy()
  expect(ws.gesperrt_am).toBeNull()
  expect(ws.gesperrt_von).toBeNull()
})

// ══════════════════════════════════════════════════════════════════════════════
// 2. POST seitenzahlen-lock — Sperren
// ══════════════════════════════════════════════════════════════════════════════

test('POST /werkstufen/:id/seitenzahlen-lock sperrt die Seitenzahlen', async ({ request }) => {
  test.skip(!testWerkId, 'No test werkstufe')
  const res = await request.post(`${API}/werkstufen/${testWerkId}/seitenzahlen-lock`, h())
  expect(res.ok()).toBeTruthy()
  const ws = await res.json()
  expect(ws.seitenzahlen_gesperrt).toBe(true)
  expect(ws.gesperrt_am).toBeTruthy()
  expect(ws.gesperrt_von).toBeTruthy()
})

test('GET nach Lock zeigt seitenzahlen_gesperrt=true', async ({ request }) => {
  test.skip(!testWerkId, 'No test werkstufe')
  const res = await request.get(`${API}/werkstufen/${testWerkId}`, h())
  expect(res.ok()).toBeTruthy()
  const ws = await res.json()
  expect(ws.seitenzahlen_gesperrt).toBe(true)
  expect(ws.gesperrt_am).toBeTruthy()
})

test('POST seitenzahlen-lock auf bereits gesperrte Werkstufe ist idempotent', async ({ request }) => {
  test.skip(!testWerkId, 'No test werkstufe')
  const res = await request.post(`${API}/werkstufen/${testWerkId}/seitenzahlen-lock`, h())
  expect(res.ok()).toBeTruthy()
  const ws = await res.json()
  expect(ws.seitenzahlen_gesperrt).toBe(true)
})

// ══════════════════════════════════════════════════════════════════════════════
// 3. DELETE seitenzahlen-lock — Entsperren
// ══════════════════════════════════════════════════════════════════════════════

test('DELETE /werkstufen/:id/seitenzahlen-lock entsperrt die Seitenzahlen', async ({ request }) => {
  test.skip(!testWerkId, 'No test werkstufe')
  const res = await request.delete(`${API}/werkstufen/${testWerkId}/seitenzahlen-lock`, h())
  expect(res.ok()).toBeTruthy()
  const ws = await res.json()
  expect(ws.seitenzahlen_gesperrt).toBe(false)
  expect(ws.gesperrt_am).toBeNull()
  expect(ws.gesperrt_von).toBeNull()
})

test('GET nach Unlock zeigt seitenzahlen_gesperrt=false', async ({ request }) => {
  test.skip(!testWerkId, 'No test werkstufe')
  const res = await request.get(`${API}/werkstufen/${testWerkId}`, h())
  expect(res.ok()).toBeTruthy()
  const ws = await res.json()
  expect(ws.seitenzahlen_gesperrt).toBeFalsy()
  expect(ws.gesperrt_am).toBeNull()
})

// ══════════════════════════════════════════════════════════════════════════════
// 4. Auth-Schutz
// ══════════════════════════════════════════════════════════════════════════════

test('POST seitenzahlen-lock ohne Auth gibt 401', async ({ request }) => {
  test.skip(!testWerkId, 'No test werkstufe')
  const res = await request.post(`${API}/werkstufen/${testWerkId}/seitenzahlen-lock`)
  expect(res.status()).toBe(401)
})

test('DELETE seitenzahlen-lock ohne Auth gibt 401', async ({ request }) => {
  test.skip(!testWerkId, 'No test werkstufe')
  const res = await request.delete(`${API}/werkstufen/${testWerkId}/seitenzahlen-lock`)
  expect(res.status()).toBe(401)
})

test('POST seitenzahlen-lock auf nicht-existente Werkstufe gibt 404', async ({ request }) => {
  const res = await request.post(
    `${API}/werkstufen/00000000-0000-0000-0000-000000000000/seitenzahlen-lock`,
    h()
  )
  expect(res.status()).toBe(404)
})

test('DELETE seitenzahlen-lock auf nicht-existente Werkstufe gibt 404', async ({ request }) => {
  const res = await request.delete(
    `${API}/werkstufen/00000000-0000-0000-0000-000000000000/seitenzahlen-lock`,
    h()
  )
  expect(res.status()).toBe(404)
})

// ══════════════════════════════════════════════════════════════════════════════
// 5. Lock/Unlock-Zyklus vollständig
// ══════════════════════════════════════════════════════════════════════════════

test('Lock → Unlock → Lock Zyklus funktioniert korrekt', async ({ request }) => {
  test.skip(!testWerkId, 'No test werkstufe')

  // Lock
  const lock1 = await request.post(`${API}/werkstufen/${testWerkId}/seitenzahlen-lock`, h())
  expect(lock1.ok()).toBeTruthy()
  expect((await lock1.json()).seitenzahlen_gesperrt).toBe(true)

  // Unlock
  const unlock = await request.delete(`${API}/werkstufen/${testWerkId}/seitenzahlen-lock`, h())
  expect(unlock.ok()).toBeTruthy()
  expect((await unlock.json()).seitenzahlen_gesperrt).toBe(false)

  // Lock again
  const lock2 = await request.post(`${API}/werkstufen/${testWerkId}/seitenzahlen-lock`, h())
  expect(lock2.ok()).toBeTruthy()
  expect((await lock2.json()).seitenzahlen_gesperrt).toBe(true)

  // Cleanup: unlock for afterAll
  await request.delete(`${API}/werkstufen/${testWerkId}/seitenzahlen-lock`, h())
})

// ══════════════════════════════════════════════════════════════════════════════
// 6. WerkstufeMeta enthält Lock-Felder in der Liste
// ══════════════════════════════════════════════════════════════════════════════

test('Werkstufen-Liste enthält seitenzahlen_gesperrt Feld', async ({ request }) => {
  test.skip(!testFolgeId, 'No test folge')
  const res = await request.get(`${API}/v2/folgen/${testFolgeId}/werkstufen`, h())  // folgeId = integer
  expect(res.ok()).toBeTruthy()
  const list = await res.json()
  expect(Array.isArray(list)).toBeTruthy()
  if (list.length > 0) {
    // Field should exist (may be null/false for unlocked)
    expect('seitenzahlen_gesperrt' in list[0]).toBeTruthy()
  }
})
