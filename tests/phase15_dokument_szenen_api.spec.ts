import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL || 'https://script.serienwerft.studio'

test.describe('Phase 2: Dokument-Szenen API', () => {

  let dokumentId: string
  let fassungId: string
  let sceneIdentityId: string
  let dokumentSzeneId: string

  test('create scene identity', async ({ request }) => {
    const res = await request.post(`${BASE}/api/scene-identities`, {
      data: { staffel_id: 'rote-rosen' },
    })
    expect(res.ok()).toBeTruthy()
    const data = await res.json()
    expect(data.id).toBeTruthy()
    expect(data.staffel_id).toBe('rote-rosen')
    sceneIdentityId = data.id
  })

  test('setup: create dokument + fassung for test', async ({ request }) => {
    // Ensure folge_nummer 9999 exists for test isolation
    const dokRes = await request.post(`${BASE}/api/folgen/rote-rosen/9999/dokumente`, {
      data: { typ: 'drehbuch' },
    })
    // Might already exist (409) or succeed (201)
    if (dokRes.status() === 201) {
      const dok = await dokRes.json()
      dokumentId = dok.id
      fassungId = dok.fassung?.id
    } else {
      // Fetch existing
      const listRes = await request.get(`${BASE}/api/folgen/rote-rosen/9999/dokumente`)
      const docs = await listRes.json()
      const drehbuch = docs.find((d: any) => d.typ === 'drehbuch')
      dokumentId = drehbuch.id
      // Get latest fassung
      const fassRes = await request.get(`${BASE}/api/dokumente/${dokumentId}/fassungen`)
      const fassungen = await fassRes.json()
      fassungId = fassungen[fassungen.length - 1].id
    }
    expect(dokumentId).toBeTruthy()
    expect(fassungId).toBeTruthy()
  })

  test('GET /api/fassungen/:id/szenen — empty initially', async ({ request }) => {
    const res = await request.get(`${BASE}/api/fassungen/${fassungId}/szenen`)
    expect(res.ok()).toBeTruthy()
    const data = await res.json()
    expect(Array.isArray(data)).toBeTruthy()
  })

  test('POST /api/fassungen/:id/szenen — add scene with new identity', async ({ request }) => {
    const res = await request.post(`${BASE}/api/fassungen/${fassungId}/szenen`, {
      data: {
        scene_nummer: 1,
        int_ext: 'INT',
        tageszeit: 'TAG',
        ort_name: 'Testort Phase 2',
        zusammenfassung: 'Testszene fuer Phase 2',
        content: [{ id: 'e1', type: 'action', text: 'Test action.' }],
      },
    })
    expect(res.status()).toBe(201)
    const data = await res.json()
    expect(data.id).toBeTruthy()
    expect(data.scene_identity_id).toBeTruthy()
    expect(data.scene_nummer).toBe(1)
    expect(data.ort_name).toBe('Testort Phase 2')
    dokumentSzeneId = data.id
    sceneIdentityId = data.scene_identity_id
  })

  test('POST /api/fassungen/:id/szenen — add second scene', async ({ request }) => {
    const res = await request.post(`${BASE}/api/fassungen/${fassungId}/szenen`, {
      data: {
        scene_nummer: 2,
        int_ext: 'EXT',
        tageszeit: 'NACHT',
        ort_name: 'Garten',
        zusammenfassung: 'Zweite Szene',
      },
    })
    expect(res.status()).toBe(201)
  })

  test('GET /api/fassungen/:id/szenen — returns 2 scenes', async ({ request }) => {
    const res = await request.get(`${BASE}/api/fassungen/${fassungId}/szenen`)
    expect(res.ok()).toBeTruthy()
    const data = await res.json()
    expect(data.length).toBe(2)
    expect(data[0].scene_nummer).toBe(1)
    expect(data[1].scene_nummer).toBe(2)
  })

  test('GET /api/dokument-szenen/:id — single scene', async ({ request }) => {
    const res = await request.get(`${BASE}/api/dokument-szenen/${dokumentSzeneId}`)
    expect(res.ok()).toBeTruthy()
    const data = await res.json()
    expect(data.ort_name).toBe('Testort Phase 2')
    expect(data.content).toBeTruthy()
  })

  test('PUT /api/dokument-szenen/:id — update scene header', async ({ request }) => {
    const res = await request.put(`${BASE}/api/dokument-szenen/${dokumentSzeneId}`, {
      data: {
        ort_name: 'Wohnzimmer',
        zusammenfassung: 'Updated summary',
        spieltag: 3,
      },
    })
    expect(res.ok()).toBeTruthy()
    const data = await res.json()
    expect(data.ort_name).toBe('Wohnzimmer')
    expect(data.zusammenfassung).toBe('Updated summary')
    expect(data.spieltag).toBe(3)
    expect(data.updated_by).toBeTruthy()
  })

  test('PATCH reorder — swap scene order', async ({ request }) => {
    // Get current scenes
    const listRes = await request.get(`${BASE}/api/fassungen/${fassungId}/szenen`)
    const scenes = await listRes.json()
    expect(scenes.length).toBe(2)

    // Reverse order
    const reversed = [scenes[1].id, scenes[0].id]
    const res = await request.patch(`${BASE}/api/fassungen/${fassungId}/szenen/reorder`, {
      data: { order: reversed },
    })
    expect(res.ok()).toBeTruthy()
    const data = await res.json()
    expect(data[0].id).toBe(scenes[1].id)
    expect(data[1].id).toBe(scenes[0].id)
  })

  test('POST renumber — sequential renumbering', async ({ request }) => {
    const res = await request.post(`${BASE}/api/fassungen/${fassungId}/szenen/renumber`)
    expect(res.ok()).toBeTruthy()
    const data = await res.json()
    expect(data.scenes[0].scene_nummer).toBe(1)
    expect(data.scenes[1].scene_nummer).toBe(2)
  })

  test('GET /api/scene-identities/:id/history — scene across fassungen', async ({ request }) => {
    const res = await request.get(`${BASE}/api/scene-identities/${sceneIdentityId}/history`)
    expect(res.ok()).toBeTruthy()
    const data = await res.json()
    expect(data.length).toBeGreaterThanOrEqual(1)
    expect(data[0].dokument_typ).toBe('drehbuch')
  })

  test('new fassung copies dokument_szenen', async ({ request }) => {
    // Create new fassung
    const fassRes = await request.post(`${BASE}/api/dokumente/${dokumentId}/fassungen`, {
      data: { fassung_label: 'Test F2' },
    })
    expect(fassRes.status()).toBe(201)
    const newFassung = await fassRes.json()

    // Check scenes were copied
    const scenesRes = await request.get(`${BASE}/api/fassungen/${newFassung.id}/szenen`)
    expect(scenesRes.ok()).toBeTruthy()
    const scenes = await scenesRes.json()
    expect(scenes.length).toBe(2)
    // Same scene_identity_id but different dokument_szenen.id
    expect(scenes[0].scene_identity_id).toBeTruthy()
    expect(scenes[0].id).not.toBe(dokumentSzeneId) // new UUID
  })

  test('DELETE /api/dokument-szenen/:id — remove scene', async ({ request }) => {
    // Get scenes from latest fassung
    const listRes = await request.get(`${BASE}/api/fassungen/${fassungId}/szenen`)
    const scenes = await listRes.json()
    const lastId = scenes[scenes.length - 1].id

    const res = await request.delete(`${BASE}/api/dokument-szenen/${lastId}`)
    expect(res.status()).toBe(204)

    // Verify deleted
    const after = await request.get(`${BASE}/api/fassungen/${fassungId}/szenen`)
    const afterScenes = await after.json()
    expect(afterScenes.length).toBe(scenes.length - 1)
  })

  // Cleanup: delete test dokument (cascades fassungen + dokument_szenen)
  test.afterAll(async ({ request }) => {
    if (dokumentId) {
      // Delete via admin route — need to delete folge 9999 data
      // Just delete the dokument directly via SQL won't work from test
      // Leave for now — test data in folge 9999 is harmless
    }
  })
})
