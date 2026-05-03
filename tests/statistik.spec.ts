import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL || 'https://script.serienwerft.studio'

let staffelId: string
let werkId: string

test.beforeAll(async ({ request }) => {
  // Get productions (contains staffel IDs)
  const prodRes = await request.get(`${BASE}/api/me/productions`)
  if (!prodRes.ok()) {
    // Fallback: direct DB check via statistik overview with known werkstufe
    // This means we can't get staffelId dynamically. Use overview endpoint with a known UUID.
    // Skip beforeAll setup — tests that need werkId will be skipped
    return
  }
  const prods = await prodRes.json()
  if (!prods?.length) return
  staffelId = prods[0].id

  // Find folgen
  const folgen = await request.get(`${BASE}/api/v2/folgen?staffel_id=${staffelId}`)
  if (!folgen.ok()) return
  const folgenList = await folgen.json()
  if (!folgenList?.length) return

  // Get werkstufen
  const ws = await request.get(`${BASE}/api/v2/folgen/${folgenList[0].id}/werkstufen`)
  if (!ws.ok()) return
  const wsList = await ws.json()
  if (wsList?.length > 0) werkId = wsList[0].id
})

test('GET /api/statistik/overview returns valid structure', async ({ request }) => {
  test.skip(!werkId, 'No werkstufe found')
  const res = await request.get(`${BASE}/api/statistik/overview?werkstufe_id=${werkId}`)
  expect(res.ok()).toBeTruthy()
  const data = await res.json()
  expect(data).toHaveProperty('scenes')
  expect(data).toHaveProperty('characters')
  expect(data).toHaveProperty('repliken')
  expect(data).toHaveProperty('stoppzeit_sek')
  expect(typeof data.scenes.total).toBe('number')
})

test('GET /api/statistik/character-repliken returns array', async ({ request }) => {
  test.skip(!werkId, 'No werkstufe found')
  const res = await request.get(`${BASE}/api/statistik/character-repliken?werkstufe_id=${werkId}`)
  expect(res.ok()).toBeTruthy()
  expect(Array.isArray(await res.json())).toBeTruthy()
})

test('GET /api/statistik/character-scenes requires parameter', async ({ request }) => {
  const res = await request.get(`${BASE}/api/statistik/character-scenes`)
  // Should be 400 (missing param) or 401 (no auth) — both are non-200
  expect(res.ok()).toBeFalsy()
})

test('GET /api/statistik/character-scenes with werkstufe_id', async ({ request }) => {
  test.skip(!werkId, 'No werkstufe found')
  const res = await request.get(`${BASE}/api/statistik/character-scenes?werkstufe_id=${werkId}`)
  expect(res.ok()).toBeTruthy()
  expect(Array.isArray(await res.json())).toBeTruthy()
})

test('GET /api/statistik/character-pairs', async ({ request }) => {
  test.skip(!werkId, 'No werkstufe found')
  const res = await request.get(`${BASE}/api/statistik/character-pairs?werkstufe_id=${werkId}`)
  expect(res.ok()).toBeTruthy()
  expect(Array.isArray(await res.json())).toBeTruthy()
})

test('GET /api/statistik/besetzungsmatrix', async ({ request }) => {
  test.skip(!staffelId, 'No staffel found')
  const res = await request.get(`${BASE}/api/statistik/besetzungsmatrix?staffel_id=${staffelId}`)
  expect(res.ok()).toBeTruthy()
  const data = await res.json()
  expect(data).toHaveProperty('cells')
  expect(data).toHaveProperty('folgen')
  expect(data).toHaveProperty('kategorien')
})

test('GET /api/statistik/version-compare requires both IDs', async ({ request }) => {
  test.skip(!werkId, 'No werkstufe found')
  const res = await request.get(`${BASE}/api/statistik/version-compare?left_id=${werkId}`)
  expect(res.status()).toBe(400)
})

test('GET /api/statistik/motiv-auslastung', async ({ request }) => {
  test.skip(!werkId, 'No werkstufe found')
  const res = await request.get(`${BASE}/api/statistik/motiv-auslastung?werkstufe_id=${werkId}`)
  expect(res.ok()).toBeTruthy()
  expect(Array.isArray(await res.json())).toBeTruthy()
})

test('GET /api/statistik/komparsen-bedarf', async ({ request }) => {
  test.skip(!werkId, 'No werkstufe found')
  const res = await request.get(`${BASE}/api/statistik/komparsen-bedarf?werkstufe_id=${werkId}`)
  expect(res.ok()).toBeTruthy()
  const data = await res.json()
  expect(data).toHaveProperty('details')
  expect(data).toHaveProperty('summary')
})

test('Vorlagen CRUD lifecycle', async ({ request }) => {
  test.skip(!staffelId, 'No staffel found')

  // Create
  const create = await request.post(`${BASE}/api/statistik/vorlagen`, {
    data: { staffel_id: staffelId, name: 'Test-Vorlage', abfrage_typ: 'character-repliken', parameter: {} },
  })
  expect(create.ok()).toBeTruthy()
  const created = await create.json()
  expect(created.name).toBe('Test-Vorlage')

  // List
  const list = await request.get(`${BASE}/api/statistik/vorlagen?staffel_id=${staffelId}`)
  expect(list.ok()).toBeTruthy()
  const vorlagen = await list.json()
  expect(vorlagen.some((v: any) => v.id === created.id)).toBeTruthy()

  // Update
  const update = await request.put(`${BASE}/api/statistik/vorlagen/${created.id}`, {
    data: { name: 'Renamed' },
  })
  expect(update.ok()).toBeTruthy()
  expect((await update.json()).name).toBe('Renamed')

  // Delete
  const del = await request.delete(`${BASE}/api/statistik/vorlagen/${created.id}`)
  expect(del.status()).toBe(204)
})

test('Frontend /statistik loads', async ({ request }) => {
  const res = await request.get(`${BASE}/statistik`)
  expect(res.ok()).toBeTruthy()
  expect(await res.text()).toContain('</html>')
})

test('Frontend /besetzung loads', async ({ request }) => {
  const res = await request.get(`${BASE}/besetzung`)
  expect(res.ok()).toBeTruthy()
  expect(await res.text()).toContain('</html>')
})
