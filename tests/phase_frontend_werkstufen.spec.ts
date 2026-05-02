import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL || 'https://script.serienwerft.studio'
const API = `${BASE}/api`

// Phase 4 Tests: Frontend Werkstufen-Integration

test.describe('Phase 4: Frontend API — Werkstufen available', () => {
  const staffelId = 'd26dff66-57cf-4b32-9649-4009618fce4d'

  test('GET /api/v2/folgen returns folgen with werkstufen_count', async ({ request }) => {
    const res = await request.get(`${API}/v2/folgen?staffel_id=${staffelId}`)
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(Array.isArray(body)).toBeTruthy()
    expect(body.length).toBeGreaterThan(0)
    expect(body[0]).toHaveProperty('werkstufen_count')
  })

  test('Werkstufe scenes accessible via API', async ({ request }) => {
    // Find a folge with werkstufen
    const folgenRes = await request.get(`${API}/v2/folgen?staffel_id=${staffelId}`)
    const folgen = await folgenRes.json()
    let werkId: string | null = null

    for (const f of folgen) {
      const wsRes = await request.get(`${API}/v2/folgen/${f.id}/werkstufen`)
      const ws = await wsRes.json()
      const withScenes = ws.find((w: any) => w.szenen_count > 0)
      if (withScenes) { werkId = withScenes.id; break }
    }

    if (!werkId) return // Skip if no werkstufe with scenes

    const scenesRes = await request.get(`${API}/werkstufen/${werkId}/szenen`)
    expect(scenesRes.ok()).toBeTruthy()
    const scenes = await scenesRes.json()
    expect(Array.isArray(scenes)).toBeTruthy()
    expect(scenes.length).toBeGreaterThan(0)
    // Verify dokument_szene structure
    expect(scenes[0]).toHaveProperty('scene_identity_id')
    expect(scenes[0]).toHaveProperty('content')
  })

  test('Werkstufe scenes have format and stoppzeit fields', async ({ request }) => {
    const folgenRes = await request.get(`${API}/v2/folgen?staffel_id=${staffelId}`)
    const folgen = await folgenRes.json()
    let werkId: string | null = null

    for (const f of folgen) {
      const wsRes = await request.get(`${API}/v2/folgen/${f.id}/werkstufen`)
      const ws = await wsRes.json()
      const withScenes = ws.find((w: any) => w.szenen_count > 0)
      if (withScenes) { werkId = withScenes.id; break }
    }

    if (!werkId) return

    const scenesRes = await request.get(`${API}/werkstufen/${werkId}/szenen`)
    const scenes = await scenesRes.json()
    // format field should exist
    expect(scenes[0]).toHaveProperty('format')
    // stoppzeit_sek may be null but field should exist
    expect('stoppzeit_sek' in scenes[0]).toBeTruthy()
    // geloescht field for soft-delete
    expect('geloescht' in scenes[0]).toBeTruthy()
  })
})

test.describe('Phase 4: Stoppzeit — mm:ss update via API', () => {
  const staffelId = 'd26dff66-57cf-4b32-9649-4009618fce4d'

  test('Update stoppzeit_sek on a dokument_szene', async ({ request }) => {
    // Find a werkstufe with scenes
    const folgenRes = await request.get(`${API}/v2/folgen?staffel_id=${staffelId}`)
    const folgen = await folgenRes.json()
    let szeneId: string | null = null

    for (const f of folgen) {
      const wsRes = await request.get(`${API}/v2/folgen/${f.id}/werkstufen`)
      const ws = await wsRes.json()
      const withScenes = ws.find((w: any) => w.szenen_count > 0)
      if (withScenes) {
        const scenesRes = await request.get(`${API}/werkstufen/${withScenes.id}/szenen`)
        const scenes = await scenesRes.json()
        if (scenes.length > 0) { szeneId = scenes[0].id; break }
      }
    }

    if (!szeneId) return

    // Update stoppzeit_sek to 90 seconds (1:30)
    const res = await request.put(`${API}/dokument-szenen/${szeneId}`, {
      data: { stoppzeit_sek: 90 }
    })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.stoppzeit_sek).toBe(90)

    // Reset
    await request.put(`${API}/dokument-szenen/${szeneId}`, {
      data: { stoppzeit_sek: null }
    })
  })
})

test.describe('Phase 4: Frontend page loads', () => {
  test('Script page loads without errors', async ({ page }) => {
    const res = await page.goto(BASE)
    expect(res?.status()).toBeLessThan(500)
  })
})
