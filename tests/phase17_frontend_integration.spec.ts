import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL || 'https://script.serienwerft.studio'

/**
 * Phase 4: Frontend Integration Tests
 *
 * Verifies that the frontend correctly loads scenes from both
 * old (stages/szenen) and new (dokument_szenen) systems,
 * and that the dual-write import from Phase 3 created valid data
 * accessible via both API paths.
 */

test.describe('Phase 4: Frontend Integration', () => {

  // Use the dual-write test data from Phase 3 (folge 8888)
  let stageId: number
  let fassungId: string

  test('setup: get stage and fassung for folge 8888', async ({ request }) => {
    // Get old-system stage
    const stagesRes = await request.get(`${BASE}/api/stages?staffel_id=rote-rosen&folge_nummer=8888`)
    expect(stagesRes.ok()).toBeTruthy()
    const stages = await stagesRes.json()
    expect(stages.length).toBeGreaterThanOrEqual(1)
    stageId = stages[0].id

    // Get new-system fassung (flat response: each row has fassung_id)
    const dokRes = await request.get(`${BASE}/api/folgen/rote-rosen/8888/dokumente`)
    expect(dokRes.ok()).toBeTruthy()
    const docs = await dokRes.json()
    expect(docs.length).toBeGreaterThanOrEqual(1)
    expect(docs[0].fassung_id).toBeTruthy()
    fassungId = docs[0].fassung_id
  })

  test('old system: GET /api/stages/:id/szenen returns scenes', async ({ request }) => {
    const res = await request.get(`${BASE}/api/stages/${stageId}/szenen`)
    expect(res.ok()).toBeTruthy()
    const scenes = await res.json()
    expect(scenes.length).toBe(2)
    expect(scenes[0].ort_name).toBe('PHASE3 TESTORT')
    expect(scenes[1].ort_name).toBe('PHASE3 GARTEN')
    // Old system returns numeric IDs
    expect(typeof scenes[0].id).toBe('number')
  })

  test('new system: GET /api/fassungen/:id/szenen returns scenes', async ({ request }) => {
    const res = await request.get(`${BASE}/api/fassungen/${fassungId}/szenen`)
    expect(res.ok()).toBeTruthy()
    const scenes = await res.json()
    expect(scenes.length).toBe(2)
    expect(scenes[0].ort_name).toBe('PHASE3 TESTORT')
    expect(scenes[1].ort_name).toBe('PHASE3 GARTEN')
    // New system returns UUID string IDs
    expect(typeof scenes[0].id).toBe('string')
    expect(scenes[0].id.length).toBe(36) // UUID format
    expect(scenes[0].scene_identity_id).toBeTruthy()
  })

  test('new system: GET /api/dokument-szenen/:id returns scene detail', async ({ request }) => {
    // Get scenes first
    const scenesRes = await request.get(`${BASE}/api/fassungen/${fassungId}/szenen`)
    const scenes = await scenesRes.json()
    const sceneId = scenes[0].id

    const res = await request.get(`${BASE}/api/dokument-szenen/${sceneId}`)
    expect(res.ok()).toBeTruthy()
    const detail = await res.json()
    expect(detail.id).toBe(sceneId)
    expect(detail.ort_name).toBe('PHASE3 TESTORT')
    expect(detail.int_ext).toBe('INT')
    expect(detail.tageszeit).toBe('TAG')
    expect(detail.content).toBeTruthy()
  })

  test('new system: PUT /api/dokument-szenen/:id updates scene', async ({ request }) => {
    const scenesRes = await request.get(`${BASE}/api/fassungen/${fassungId}/szenen`)
    const scenes = await scenesRes.json()
    const sceneId = scenes[0].id

    const res = await request.put(`${BASE}/api/dokument-szenen/${sceneId}`, {
      data: { zusammenfassung: 'Phase4 Test Update' },
    })
    expect(res.ok()).toBeTruthy()
    const updated = await res.json()
    expect(updated.zusammenfassung).toBe('Phase4 Test Update')

    // Verify it persisted
    const verifyRes = await request.get(`${BASE}/api/dokument-szenen/${sceneId}`)
    const verified = await verifyRes.json()
    expect(verified.zusammenfassung).toBe('Phase4 Test Update')

    // Clean up
    await request.put(`${BASE}/api/dokument-szenen/${sceneId}`, {
      data: { zusammenfassung: null },
    })
  })

  test('both systems have same scene count', async ({ request }) => {
    const oldRes = await request.get(`${BASE}/api/stages/${stageId}/szenen`)
    const oldScenes = await oldRes.json()

    const newRes = await request.get(`${BASE}/api/fassungen/${fassungId}/szenen`)
    const newScenes = await newRes.json()

    expect(oldScenes.length).toBe(newScenes.length)
  })

  test('both systems have matching ort_name values', async ({ request }) => {
    const oldRes = await request.get(`${BASE}/api/stages/${stageId}/szenen`)
    const oldScenes = await oldRes.json()

    const newRes = await request.get(`${BASE}/api/fassungen/${fassungId}/szenen`)
    const newScenes = await newRes.json()

    const oldNames = oldScenes.map((s: any) => s.ort_name).sort()
    const newNames = newScenes.map((s: any) => s.ort_name).sort()
    expect(oldNames).toEqual(newNames)
  })

  test('scene identity history is accessible', async ({ request }) => {
    const scenesRes = await request.get(`${BASE}/api/fassungen/${fassungId}/szenen`)
    const scenes = await scenesRes.json()
    const identityId = scenes[0].scene_identity_id

    const res = await request.get(`${BASE}/api/scene-identities/${identityId}/history`)
    expect(res.ok()).toBeTruthy()
    const history = await res.json()
    expect(history.length).toBeGreaterThanOrEqual(1)
    expect(history[0].ort_name).toBe('PHASE3 TESTORT')
  })

  test('new system: reorder works', async ({ request }) => {
    const scenesRes = await request.get(`${BASE}/api/fassungen/${fassungId}/szenen`)
    const scenes = await scenesRes.json()
    expect(scenes.length).toBe(2)

    // Reverse order
    const reversed = [scenes[1].id, scenes[0].id]
    const res = await request.patch(`${BASE}/api/fassungen/${fassungId}/szenen/reorder`, {
      data: { order: reversed },
    })
    expect(res.ok()).toBeTruthy()
    const reordered = await res.json()
    expect(reordered[0].id).toBe(scenes[1].id)
    expect(reordered[1].id).toBe(scenes[0].id)

    // Restore original order
    await request.patch(`${BASE}/api/fassungen/${fassungId}/szenen/reorder`, {
      data: { order: [scenes[0].id, scenes[1].id] },
    })
  })
})
