import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL || 'https://script.serienwerft.studio'

async function getTestSzeneId(request: any): Promise<number> {
  const bloeckeRes = await request.get(`${BASE}/api/staffeln/rote-rosen/bloecke`)
  const bloecke = await bloeckeRes.json()
  const blockId = bloecke[0].id
  const ep = await (await request.post(`${BASE}/api/bloecke/${blockId}/episoden`, {
    data: { episode_nummer: Math.floor(Math.random() * 20000) + 80000, arbeitstitel: 'Kommentar Test' }
  })).json()
  const stage = await (await request.post(`${BASE}/api/episoden/${ep.id}/stages`, {
    data: { stage_type: 'draft' }
  })).json()
  const szene = await (await request.post(`${BASE}/api/stages/${stage.id}/szenen`, {
    data: { scene_nummer: 1, ort_name: 'TEST' }
  })).json()
  return szene.id
}

test.describe('Phase 7 — Collaboration & Kommentare', () => {
  test('Kommentar anlegen → 201', async ({ request }) => {
    const szeneId = await getTestSzeneId(request)
    const res = await request.post(`${BASE}/api/szenen/${szeneId}/kommentare`, {
      data: { text: 'Test Kommentar Phase 7' }
    })
    expect(res.status()).toBe(201)
    const comment = await res.json()
    expect(comment.id).toBeTruthy()
    expect(comment.text).toBe('Test Kommentar Phase 7')
  })

  test('Kommentare laden → Array', async ({ request }) => {
    const szeneId = await getTestSzeneId(request)
    await request.post(`${BASE}/api/szenen/${szeneId}/kommentare`, {
      data: { text: 'Kommentar 1' }
    })
    await request.post(`${BASE}/api/szenen/${szeneId}/kommentare`, {
      data: { text: 'Kommentar 2' }
    })
    const res = await request.get(`${BASE}/api/szenen/${szeneId}/kommentare`)
    expect(res.status()).toBe(200)
    const comments = await res.json()
    expect(comments.length).toBeGreaterThanOrEqual(2)
  })

  test('Kommentar resolve', async ({ request }) => {
    const szeneId = await getTestSzeneId(request)
    const createRes = await request.post(`${BASE}/api/szenen/${szeneId}/kommentare`, {
      data: { text: 'Zu lösen' }
    })
    const comment = await createRes.json()

    const resolveRes = await request.patch(`${BASE}/api/kommentare/${comment.id}/resolve`, { data: {} })
    expect(resolveRes.status()).toBe(200)
    const resolved = await resolveRes.json()
    expect(resolved.resolved).toBe(true)
    expect(resolved.resolved_by).toBeTruthy()
  })

  test('@mention parsing fire-and-forget (kein Fehler)', async ({ request }) => {
    const szeneId = await getTestSzeneId(request)
    // Should not fail even if messenger not available
    const res = await request.post(`${BASE}/api/szenen/${szeneId}/kommentare`, {
      data: { text: 'Hallo @jandiepers bitte prüfen!' }
    })
    expect(res.status()).toBe(201)
  })

  test('Kommentar löschen', async ({ request }) => {
    const szeneId = await getTestSzeneId(request)
    const createRes = await request.post(`${BASE}/api/szenen/${szeneId}/kommentare`, {
      data: { text: 'Zu löschen' }
    })
    const comment = await createRes.json()

    const delRes = await request.delete(`${BASE}/api/kommentare/${comment.id}`)
    expect(delRes.status()).toBe(204)
  })
})
