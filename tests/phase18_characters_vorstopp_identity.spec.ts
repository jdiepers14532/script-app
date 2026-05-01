import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL || 'https://script.serienwerft.studio'

/**
 * Phase 5: Characters + Vorstopp via scene_identity_id
 *
 * Tests that the new scene-identity-based endpoints for characters and vorstopp
 * work correctly alongside the old szene_id-based endpoints.
 */

test.describe('Phase 5: Characters + Vorstopp via scene_identity_id', () => {

  let sceneIdentityId: string
  let characterId: string

  test('setup: get scene_identity_id from Phase 3 test data', async ({ request }) => {
    const dokRes = await request.get(`${BASE}/api/folgen/rote-rosen/8888/dokumente`)
    expect(dokRes.ok()).toBeTruthy()
    const docs = await dokRes.json()
    const fassungId = docs[0].fassung_id

    const scenesRes = await request.get(`${BASE}/api/fassungen/${fassungId}/szenen`)
    expect(scenesRes.ok()).toBeTruthy()
    const scenes = await scenesRes.json()
    expect(scenes.length).toBe(2)
    sceneIdentityId = scenes[0].scene_identity_id
    expect(sceneIdentityId).toBeTruthy()
  })

  test('setup: create a test character', async ({ request }) => {
    const res = await request.post(`${BASE}/api/characters`, {
      data: { name: 'PHASE5 TESTCHAR', staffel_id: 'rote-rosen' },
    })
    expect(res.ok()).toBeTruthy()
    const char = await res.json()
    characterId = char.id
    expect(characterId).toBeTruthy()
  })

  test('GET /api/scene-identities/:id/characters returns empty initially', async ({ request }) => {
    const res = await request.get(`${BASE}/api/scene-identities/${sceneIdentityId}/characters`)
    expect(res.ok()).toBeTruthy()
    const chars = await res.json()
    // Filter out any characters that may have been added during import
    const testChars = chars.filter((c: any) => c.name === 'PHASE5 TESTCHAR')
    expect(testChars.length).toBe(0)
  })

  test('POST /api/scene-identities/:id/characters adds character', async ({ request }) => {
    const res = await request.post(`${BASE}/api/scene-identities/${sceneIdentityId}/characters`, {
      data: { character_id: characterId },
    })
    expect(res.status()).toBe(201)
    const sc = await res.json()
    expect(sc.scene_identity_id).toBe(sceneIdentityId)
    expect(sc.character_id).toBe(characterId)
  })

  test('GET /api/scene-identities/:id/characters shows added character', async ({ request }) => {
    const res = await request.get(`${BASE}/api/scene-identities/${sceneIdentityId}/characters`)
    expect(res.ok()).toBeTruthy()
    const chars = await res.json()
    const found = chars.find((c: any) => c.character_id === characterId)
    expect(found).toBeTruthy()
    expect(found.name).toBe('PHASE5 TESTCHAR')
  })

  test('POST duplicate character is idempotent (upsert)', async ({ request }) => {
    const res = await request.post(`${BASE}/api/scene-identities/${sceneIdentityId}/characters`, {
      data: { character_id: characterId, anzahl: 3 },
    })
    expect(res.status()).toBe(201)
    const sc = await res.json()
    expect(sc.anzahl).toBe(3)
  })

  test('DELETE /api/scene-identities/:id/characters/:characterId removes character', async ({ request }) => {
    const res = await request.delete(`${BASE}/api/scene-identities/${sceneIdentityId}/characters/${characterId}`)
    expect(res.ok()).toBeTruthy()

    // Verify removed
    const listRes = await request.get(`${BASE}/api/scene-identities/${sceneIdentityId}/characters`)
    const chars = await listRes.json()
    const found = chars.find((c: any) => c.character_id === characterId)
    expect(found).toBeFalsy()
  })

  test('GET /api/scene-identities/:id/vorstopp returns empty initially', async ({ request }) => {
    const res = await request.get(`${BASE}/api/scene-identities/${sceneIdentityId}/vorstopp`)
    expect(res.ok()).toBeTruthy()
    const data = await res.json()
    expect(data.all).toBeDefined()
    expect(data.latest_per_stage).toBeDefined()
    expect(data.all.length).toBe(0)
  })

  test('POST /api/scene-identities/:id/vorstopp adds entry', async ({ request }) => {
    const res = await request.post(`${BASE}/api/scene-identities/${sceneIdentityId}/vorstopp`, {
      data: { stage: 'drehbuch', dauer_sekunden: 45, methode: 'manuell' },
    })
    expect(res.status()).toBe(201)
    const entry = await res.json()
    expect(entry.scene_identity_id).toBe(sceneIdentityId)
    expect(entry.stage).toBe('drehbuch')
    expect(entry.dauer_sekunden).toBe(45)
  })

  test('GET /api/scene-identities/:id/vorstopp shows entry', async ({ request }) => {
    const res = await request.get(`${BASE}/api/scene-identities/${sceneIdentityId}/vorstopp`)
    expect(res.ok()).toBeTruthy()
    const data = await res.json()
    expect(data.all.length).toBeGreaterThanOrEqual(1)
    expect(data.latest_per_stage.drehbuch).toBeTruthy()
    expect(data.latest_per_stage.drehbuch.dauer_sekunden).toBe(45)
  })

  test('POST invalid stage returns 400', async ({ request }) => {
    const res = await request.post(`${BASE}/api/scene-identities/${sceneIdentityId}/vorstopp`, {
      data: { stage: 'invalid', dauer_sekunden: 10 },
    })
    expect(res.status()).toBe(400)
  })

  test('cleanup: delete test character', async ({ request }) => {
    await request.delete(`${BASE}/api/characters/${characterId}`)
  })
})
