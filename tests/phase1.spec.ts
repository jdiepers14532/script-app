import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL || 'https://script.serienwerft.studio'

test.describe('Phase 1 — Backend Foundation', () => {
  test('Health check', async ({ request }) => {
    const res = await request.get(`${BASE}/api/health`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
  })

  test('Staffeln laden', async ({ request }) => {
    const res = await request.get(`${BASE}/api/staffeln`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBeGreaterThanOrEqual(1)
  })

  test('Blöcke laden', async ({ request }) => {
    const res = await request.get(`${BASE}/api/staffeln/rote-rosen/bloecke`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBeGreaterThanOrEqual(1)
  })

  test('Episode CRUD', async ({ request }) => {
    // Create episode
    const bloeckeRes = await request.get(`${BASE}/api/staffeln/rote-rosen/bloecke`)
    const bloecke = await bloeckeRes.json()
    const blockId = bloecke[0].id

    const createRes = await request.post(`${BASE}/api/bloecke/${blockId}/episoden`, {
      data: { episode_nummer: 9999, arbeitstitel: 'Test Episode Phase 1' }
    })
    expect(createRes.status()).toBe(201)
    const episode = await createRes.json()
    expect(episode.id).toBeTruthy()

    // GET episode
    const getRes = await request.get(`${BASE}/api/episoden/${episode.id}`)
    expect(getRes.status()).toBe(200)
    const got = await getRes.json()
    expect(got.arbeitstitel).toBe('Test Episode Phase 1')

    // PUT episode
    const putRes = await request.put(`${BASE}/api/episoden/${episode.id}`, {
      data: { arbeitstitel: 'Test Episode Phase 1 Updated' }
    })
    expect(putRes.status()).toBe(200)
    const updated = await putRes.json()
    expect(updated.arbeitstitel).toBe('Test Episode Phase 1 Updated')
  })

  test('Stage anlegen', async ({ request }) => {
    const bloeckeRes = await request.get(`${BASE}/api/staffeln/rote-rosen/bloecke`)
    const bloecke = await bloeckeRes.json()
    const blockId = bloecke[0].id

    const epRes = await request.post(`${BASE}/api/bloecke/${blockId}/episoden`, {
      data: { episode_nummer: 9998, arbeitstitel: 'Stage Test Episode' }
    })
    const ep = await epRes.json()

    const stageRes = await request.post(`${BASE}/api/episoden/${ep.id}/stages`, {
      data: { stage_type: 'draft', version_nummer: 1 }
    })
    expect(stageRes.status()).toBe(201)
    const stage = await stageRes.json()
    expect(stage.id).toBeTruthy()
    expect(stage.stage_type).toBe('draft')
  })

  test('Szene anlegen und content updaten', async ({ request }) => {
    const bloeckeRes = await request.get(`${BASE}/api/staffeln/rote-rosen/bloecke`)
    const bloecke = await bloeckeRes.json()
    const blockId = bloecke[0].id

    const epRes = await request.post(`${BASE}/api/bloecke/${blockId}/episoden`, {
      data: { episode_nummer: 9997, arbeitstitel: 'Szene Test Episode' }
    })
    const ep = await epRes.json()

    const stageRes = await request.post(`${BASE}/api/episoden/${ep.id}/stages`, {
      data: { stage_type: 'draft' }
    })
    const stage = await stageRes.json()

    const szeneRes = await request.post(`${BASE}/api/stages/${stage.id}/szenen`, {
      data: {
        scene_nummer: 1,
        int_ext: 'INT',
        tageszeit: 'TAG',
        ort_name: 'CAFÉ ROSA',
        content: [{ id: 'b1', type: 'action', text: 'Test action' }]
      }
    })
    expect(szeneRes.status()).toBe(201)
    const szene = await szeneRes.json()

    const putRes = await request.put(`${BASE}/api/szenen/${szene.id}`, {
      data: { content: [{ id: 'b1', type: 'action', text: 'Updated action' }] }
    })
    expect(putRes.status()).toBe(200)
    const updated = await putRes.json()
    expect(updated.content[0].text).toBe('Updated action')
  })
})
