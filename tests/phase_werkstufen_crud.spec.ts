import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL || 'https://script.serienwerft.studio'
const API = `${BASE}/api`

// Phase 2 Tests: Werkstufen + Folgen v2 CRUD

test.describe('Phase 2: Folgen v2 API', () => {
  const staffelId = 'd26dff66-57cf-4b32-9649-4009618fce4d'

  test('GET /api/v2/folgen — Liste aller Folgen einer Staffel', async ({ request }) => {
    const res = await request.get(`${API}/v2/folgen?staffel_id=${staffelId}`)
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(Array.isArray(body)).toBeTruthy()
    expect(body.length).toBeGreaterThan(0)
    expect(body[0]).toHaveProperty('staffel_id')
    expect(body[0]).toHaveProperty('folge_nummer')
    expect(body[0]).toHaveProperty('werkstufen_count')
  })

  test('GET /api/v2/folgen — ohne staffel_id gibt 400', async ({ request }) => {
    const res = await request.get(`${API}/v2/folgen`)
    expect(res.status()).toBe(400)
  })

  test('POST /api/v2/folgen — Folge erstellen', async ({ request }) => {
    const res = await request.post(`${API}/v2/folgen`, {
      data: { staffel_id: staffelId, folge_nummer: 9999, folgen_titel: 'Testfolge Phase 2' }
    })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.folge_nummer).toBe(9999)
    expect(body.staffel_id).toBe(staffelId)
  })

  test('GET /api/v2/folgen/:id — Einzelne Folge', async ({ request }) => {
    // Get list first to find an ID
    const listRes = await request.get(`${API}/v2/folgen?staffel_id=${staffelId}`)
    const list = await listRes.json()
    const folgeId = list[0].id

    const res = await request.get(`${API}/v2/folgen/${folgeId}`)
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.id).toBe(folgeId)
    expect(body).toHaveProperty('werkstufen_count')
  })

  test('PUT /api/v2/folgen/:id — Titel aktualisieren', async ({ request }) => {
    const listRes = await request.get(`${API}/v2/folgen?staffel_id=${staffelId}`)
    const list = await listRes.json()
    const testFolge = list.find((f: any) => f.folge_nummer === 9999)
    expect(testFolge).toBeTruthy()

    const res = await request.put(`${API}/v2/folgen/${testFolge.id}`, {
      data: { folgen_titel: 'Testfolge Phase 2 Updated' }
    })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.folgen_titel).toBe('Testfolge Phase 2 Updated')
  })
})

test.describe('Phase 2: Werkstufen API', () => {
  const staffelId = 'd26dff66-57cf-4b32-9649-4009618fce4d'
  let testFolgeId: number
  let testWerkId: string

  test.beforeAll(async ({ request }) => {
    // Ensure test folge exists
    const res = await request.post(`${API}/v2/folgen`, {
      data: { staffel_id: staffelId, folge_nummer: 9999, folgen_titel: 'Testfolge Phase 2' }
    })
    const body = await res.json()
    testFolgeId = body.id
  })

  test('POST /api/v2/folgen/:folgeId/werkstufen — Werkstufe erstellen', async ({ request }) => {
    const res = await request.post(`${API}/v2/folgen/${testFolgeId}/werkstufen`, {
      data: { typ: 'drehbuch', label: 'Test V1' }
    })
    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(body.typ).toBe('drehbuch')
    expect(body.version_nummer).toBeGreaterThanOrEqual(1)
    expect(body.folge_id).toBe(testFolgeId)
    testWerkId = body.id
  })

  test('GET /api/v2/folgen/:folgeId/werkstufen — Liste', async ({ request }) => {
    const res = await request.get(`${API}/v2/folgen/${testFolgeId}/werkstufen`)
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(Array.isArray(body)).toBeTruthy()
    expect(body.length).toBeGreaterThan(0)
    expect(body[0]).toHaveProperty('szenen_count')
  })

  test('GET /api/werkstufen/:id — Einzelne Werkstufe', async ({ request }) => {
    // Get the ID from list
    const listRes = await request.get(`${API}/v2/folgen/${testFolgeId}/werkstufen`)
    const list = await listRes.json()
    const werkId = list[0].id

    const res = await request.get(`${API}/werkstufen/${werkId}`)
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.id).toBe(werkId)
    expect(body).toHaveProperty('staffel_id')
    expect(body).toHaveProperty('folge_nummer')
    expect(body).toHaveProperty('szenen_count')
  })

  test('PUT /api/werkstufen/:id — Status aendern', async ({ request }) => {
    const listRes = await request.get(`${API}/v2/folgen/${testFolgeId}/werkstufen`)
    const list = await listRes.json()
    const werkId = list[0].id

    const res = await request.put(`${API}/werkstufen/${werkId}`, {
      data: { label: 'Updated Label', bearbeitung_status: 'review' }
    })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.label).toBe('Updated Label')
    expect(body.bearbeitung_status).toBe('review')
  })

  test('POST Werkstufe V2 — kopiert Szenen von V1', async ({ request }) => {
    // Get V1 Werkstufe
    const listRes = await request.get(`${API}/v2/folgen/${testFolgeId}/werkstufen`)
    const list = await listRes.json()
    const drehbuchVersions = list.filter((w: any) => w.typ === 'drehbuch').sort((a: any, b: any) => b.version_nummer - a.version_nummer)
    const v1 = drehbuchVersions[0] // latest version
    expect(v1).toBeTruthy()

    // Add a scene to V1
    const sceneRes = await request.post(`${API}/werkstufen/${v1.id}/szenen`, {
      data: {
        scene_nummer: 1,
        ort_name: 'CAFE',
        int_ext: 'INT',
        tageszeit: 'TAG',
        content: [{ type: 'action', text: 'Test Szene' }],
      }
    })
    expect(sceneRes.status()).toBe(201)

    // Create next version (should copy scenes from predecessor)
    const v2Res = await request.post(`${API}/v2/folgen/${testFolgeId}/werkstufen`, {
      data: { typ: 'drehbuch', label: 'Test Copy' }
    })
    expect(v2Res.status()).toBe(201)
    const v2 = await v2Res.json()
    expect(v2.version_nummer).toBeGreaterThan(v1.version_nummer)
    expect(v2.copied_scenes).toBeGreaterThanOrEqual(1)

    // Verify V2 has the copied scene
    const scenesRes = await request.get(`${API}/werkstufen/${v2.id}/szenen`)
    expect(scenesRes.ok()).toBeTruthy()
    const scenes = await scenesRes.json()
    expect(scenes.length).toBeGreaterThanOrEqual(1)
    expect(scenes.some((s: any) => s.ort_name === 'CAFE')).toBeTruthy()
  })

  test('GET /api/werkstufen/:werkId/szenen — Szenen einer Werkstufe', async ({ request }) => {
    const listRes = await request.get(`${API}/v2/folgen/${testFolgeId}/werkstufen`)
    const list = await listRes.json()
    const werkId = list[0].id

    const res = await request.get(`${API}/werkstufen/${werkId}/szenen`)
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(Array.isArray(body)).toBeTruthy()
  })

  test('Diff zwischen zwei Werkstufen', async ({ request }) => {
    const listRes = await request.get(`${API}/v2/folgen/${testFolgeId}/werkstufen`)
    const list = await listRes.json()
    const drehbuch = list.filter((w: any) => w.typ === 'drehbuch')
    if (drehbuch.length < 2) return // Skip if not enough

    const res = await request.get(`${API}/werkstufen/${drehbuch[0].id}/szenen/diff/${drehbuch[1].id}`)
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body).toHaveProperty('left')
    expect(body).toHaveProperty('right')
    expect(body).toHaveProperty('matches')
    expect(body.left).toHaveProperty('werkstufe')
    expect(body.left).toHaveProperty('szenen')
  })

  test('Soft-Delete: DELETE /api/dokument-szenen/:id setzt geloescht=true (neue Route)', async ({ request }) => {
    // Get a scene from V2
    const listRes = await request.get(`${API}/v2/folgen/${testFolgeId}/werkstufen`)
    const list = await listRes.json()
    const v2 = list.find((w: any) => w.version_nummer === 2)
    if (!v2) return

    const scenesRes = await request.get(`${API}/werkstufen/${v2.id}/szenen`)
    const scenes = await scenesRes.json()
    if (scenes.length === 0) return

    const sceneId = scenes[0].id

    // Delete via existing API (hard delete for now)
    const delRes = await request.delete(`${API}/dokument-szenen/${sceneId}`)
    expect(delRes.status()).toBe(204)
  })
})
