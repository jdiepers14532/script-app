import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL || 'https://script.serienwerft.studio'

async function setupStageAndScene(request: any) {
  const bloeckeRes = await request.get(`${BASE}/api/staffeln/rote-rosen/bloecke`)
  const bloecke = await bloeckeRes.json()
  const blockId = bloecke[0].id

  const ep = await (await request.post(`${BASE}/api/bloecke/${blockId}/episoden`, {
    data: { episode_nummer: Math.floor(Math.random() * 50000) + 10000, arbeitstitel: 'Version Test' }
  })).json()

  const stage = await (await request.post(`${BASE}/api/episoden/${ep.id}/stages`, {
    data: { stage_type: 'draft' }
  })).json()

  const szene = await (await request.post(`${BASE}/api/stages/${stage.id}/szenen`, {
    data: { scene_nummer: 1, ort_name: 'TEST', content: [{ id: 'b1', type: 'action', text: 'Original' }] }
  })).json()

  return { ep, stage, szene }
}

test.describe('Phase 3 — Versionierung & Export', () => {
  test('Szene bearbeiten + Snapshot erstellen', async ({ request }) => {
    const { szene } = await setupStageAndScene(request)

    const res = await request.post(`${BASE}/api/szenen/${szene.id}/versionen`, {
      data: {
        content_snapshot: [{ id: 'b1', type: 'action', text: 'Version 1' }],
        change_summary: 'Erste Änderung'
      }
    })
    expect(res.status()).toBe(201)
    const version = await res.json()
    expect(version.id).toBeTruthy()
  })

  test('GET Versionen zeigt Einträge', async ({ request }) => {
    const { szene } = await setupStageAndScene(request)

    // Create 2 snapshots
    await request.post(`${BASE}/api/szenen/${szene.id}/versionen`, {
      data: { content_snapshot: [{ id: 'b1', type: 'action', text: 'v1' }] }
    })
    await request.post(`${BASE}/api/szenen/${szene.id}/versionen`, {
      data: { content_snapshot: [{ id: 'b1', type: 'action', text: 'v2' }] }
    })

    const res = await request.get(`${BASE}/api/szenen/${szene.id}/versionen`)
    expect(res.status()).toBe(200)
    const versions = await res.json()
    expect(versions.length).toBeGreaterThanOrEqual(2)
  })

  test('Version wiederherstellen', async ({ request }) => {
    const { szene } = await setupStageAndScene(request)

    const snapshot1 = [{ id: 'b1', type: 'action', text: 'Original Content' }]
    const v = await (await request.post(`${BASE}/api/szenen/${szene.id}/versionen`, {
      data: { content_snapshot: snapshot1 }
    })).json()

    // Update szene
    await request.put(`${BASE}/api/szenen/${szene.id}`, {
      data: { content: [{ id: 'b1', type: 'action', text: 'Modified Content' }] }
    })

    // Restore
    const restoreRes = await request.post(`${BASE}/api/szenen/${szene.id}/versionen/${v.id}/restore`, { data: {} })
    expect(restoreRes.status()).toBe(200)
    const result = await restoreRes.json()
    expect(result.szene).toBeTruthy()
    expect(result.szene.content[0].text).toBe('Original Content')
  })

  test('Export Fountain Content-Type', async ({ request }) => {
    const { stage, szene } = await setupStageAndScene(request)
    const res = await request.get(`${BASE}/api/stages/${stage.id}/export/fountain`)
    expect(res.status()).toBe(200)
    const contentType = res.headers()['content-type']
    expect(contentType).toContain('text/plain')
  })

  test('Export FDX Content-Type', async ({ request }) => {
    const { stage } = await setupStageAndScene(request)
    const res = await request.get(`${BASE}/api/stages/${stage.id}/export/fdx`)
    expect(res.status()).toBe(200)
    const contentType = res.headers()['content-type']
    expect(contentType).toContain('application/xml')
  })

  test('Export PDF Content-Type', async ({ request }) => {
    const { stage } = await setupStageAndScene(request)
    const res = await request.get(`${BASE}/api/stages/${stage.id}/export/pdf`)
    expect(res.status()).toBe(200)
    const contentType = res.headers()['content-type']
    expect(contentType).toContain('text/html')
  })
})
