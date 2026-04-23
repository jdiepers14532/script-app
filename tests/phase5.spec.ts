import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL || 'https://script.serienwerft.studio'

test.describe('Phase 5 — KI-Features', () => {
  test('KI-Settings GET → 200 mit 5 Funktionen', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/ki-settings`)
    expect(res.status()).toBe(200)
    const settings = await res.json()
    expect(Array.isArray(settings)).toBe(true)
    expect(settings.length).toBeGreaterThanOrEqual(5)
    const funktionen = settings.map((s: any) => s.funktion)
    expect(funktionen).toContain('scene_summary')
    expect(funktionen).toContain('entity_detect')
    expect(funktionen).toContain('style_check')
    expect(funktionen).toContain('synopsis')
    expect(funktionen).toContain('consistency_check')
  })

  test('KI-Settings PUT → persistiert', async ({ request }) => {
    // Enable entity_detect
    const putRes = await request.put(`${BASE}/api/admin/ki-settings/entity_detect`, {
      data: { enabled: true }
    })
    expect(putRes.status()).toBe(200)
    const updated = await putRes.json()
    expect(updated.funktion).toBe('entity_detect')
    expect(updated.enabled).toBe(true)

    // Verify persistence
    const getRes = await request.get(`${BASE}/api/admin/ki-settings`)
    const all = await getRes.json()
    const entityDetect = all.find((s: any) => s.funktion === 'entity_detect')
    expect(entityDetect.enabled).toBe(true)
  })

  test('entity-detect → 200 mit entities-Array', async ({ request }) => {
    const res = await request.post(`${BASE}/api/ki/entity-detect`, {
      data: { text: 'MARIA geht ins CAFÉ ROSA und trifft JONAS.' }
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.entities)).toBe(true)
    // Should detect MARIA and JONAS at minimum via regex fallback
    const names = body.entities.map((e: any) => e.name)
    expect(names.some((n: string) => n.includes('MARIA'))).toBe(true)
  })

  test('scene-summary → 200 mit summary', async ({ request }) => {
    // Create a scene first
    const bloeckeRes = await request.get(`${BASE}/api/staffeln/rote-rosen/bloecke`)
    const bloecke = await bloeckeRes.json()
    const blockId = bloecke[0].id

    const ep = await (await request.post(`${BASE}/api/bloecke/${blockId}/episoden`, {
      data: { episode_nummer: Math.floor(Math.random() * 20000) + 70000, arbeitstitel: 'KI Test' }
    })).json()

    const stage = await (await request.post(`${BASE}/api/episoden/${ep.id}/stages`, {
      data: { stage_type: 'draft' }
    })).json()

    const szene = await (await request.post(`${BASE}/api/stages/${stage.id}/szenen`, {
      data: {
        scene_nummer: 1, ort_name: 'CAFÉ',
        content: [
          { id: 'b1', type: 'character', text: 'MARIA' },
          { id: 'b2', type: 'dialogue', text: 'Ich liebe dich.' }
        ]
      }
    })).json()

    const res = await request.post(`${BASE}/api/ki/scene-summary`, {
      data: { scene_id: szene.id }
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    // Either returns a summary or indicates KI is disabled
    expect(body.summary).toBeTruthy()
  })

  test('style-check → 200', async ({ request }) => {
    const res = await request.post(`${BASE}/api/ki/style-check`, {
      data: { stage_id: 1 }
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.issues)).toBe(true)
  })
})
