import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL || 'https://script.serienwerft.studio'

test.describe('Phase 4 — Entity Links & Cross-App', () => {
  test('Entity anlegen', async ({ request }) => {
    const res = await request.post(`${BASE}/api/entities`, {
      data: { entity_type: 'charakter', name: 'Maria König Test', staffel_id: 'rote-rosen' }
    })
    expect(res.status()).toBe(201)
    const entity = await res.json()
    expect(entity.id).toBeTruthy()
    expect(entity.entity_type).toBe('charakter')
  })

  test('Entity Autocomplete findet sie', async ({ request }) => {
    // Create an entity first
    await request.post(`${BASE}/api/entities`, {
      data: { entity_type: 'location', name: 'Café Rosa Phase4Test', staffel_id: 'rote-rosen' }
    })

    const res = await request.get(`${BASE}/api/entities?q=Phase4Test&staffel_id=rote-rosen`)
    expect(res.status()).toBe(200)
    const entities = await res.json()
    expect(entities.length).toBeGreaterThanOrEqual(1)
    expect(entities[0].name).toContain('Phase4Test')
  })

  test('Entity aktualisieren', async ({ request }) => {
    const createRes = await request.post(`${BASE}/api/entities`, {
      data: { entity_type: 'prop', name: 'Test Prop Update' }
    })
    const entity = await createRes.json()

    const updateRes = await request.put(`${BASE}/api/entities/${entity.id}`, {
      data: { name: 'Updated Prop Name' }
    })
    expect(updateRes.status()).toBe(200)
    const updated = await updateRes.json()
    expect(updated.name).toBe('Updated Prop Name')
  })

  test('Drehplan-Export korrekte Struktur', async ({ request }) => {
    // Setup
    const bloeckeRes = await request.get(`${BASE}/api/staffeln/rote-rosen/bloecke`)
    const bloecke = await bloeckeRes.json()
    const blockId = bloecke[0].id

    const ep = await (await request.post(`${BASE}/api/bloecke/${blockId}/episoden`, {
      data: { episode_nummer: Math.floor(Math.random() * 40000) + 5000, arbeitstitel: 'Drehplan Test' }
    })).json()

    const stage = await (await request.post(`${BASE}/api/episoden/${ep.id}/stages`, {
      data: { stage_type: 'draft' }
    })).json()

    await request.post(`${BASE}/api/stages/${stage.id}/szenen`, {
      data: {
        scene_nummer: 1,
        int_ext: 'INT',
        ort_name: 'CAFÉ',
        tageszeit: 'TAG',
        dauer_min: 3,
        content: [
          { id: 'b1', type: 'character', text: 'MARIA' },
          { id: 'b2', type: 'dialogue', text: 'Hallo' }
        ]
      }
    })

    const res = await request.get(`${BASE}/api/stages/${stage.id}/drehplan-export`)
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)
    expect(data[0].scene_number).toBe(1)
    expect(data[0].int_ext).toBe('INT')
    expect(data[0].ort_name).toBe('CAFÉ')
    expect(data[0].charaktere).toContain('MARIA')
  })

  test('Episode Besetzung', async ({ request }) => {
    const bloeckeRes = await request.get(`${BASE}/api/staffeln/rote-rosen/bloecke`)
    const bloecke = await bloeckeRes.json()
    const blockId = bloecke[0].id

    const ep = await (await request.post(`${BASE}/api/bloecke/${blockId}/episoden`, {
      data: { episode_nummer: Math.floor(Math.random() * 40000) + 50000, arbeitstitel: 'Besetzung Test' }
    })).json()

    const stage = await (await request.post(`${BASE}/api/episoden/${ep.id}/stages`, {
      data: { stage_type: 'final' }
    })).json()

    await request.post(`${BASE}/api/stages/${stage.id}/szenen`, {
      data: {
        scene_nummer: 1,
        content: [{ id: 'c1', type: 'character', text: 'JONAS' }]
      }
    })

    const res = await request.get(`${BASE}/api/episoden/${ep.id}/besetzung`)
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(data.charaktere).toContain('JONAS')
  })

  test('Episode Synopsis', async ({ request }) => {
    const bloeckeRes = await request.get(`${BASE}/api/staffeln/rote-rosen/bloecke`)
    const bloecke = await bloeckeRes.json()
    const blockId = bloecke[0].id

    const ep = await (await request.post(`${BASE}/api/bloecke/${blockId}/episoden`, {
      data: { episode_nummer: Math.floor(Math.random() * 40000) + 60000, arbeitstitel: 'Synopsis Test', synopsis: 'Eine kurze Zusammenfassung' }
    })).json()

    const res = await request.get(`${BASE}/api/episoden/${ep.id}/synopsis`)
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(data.arbeitstitel).toBe('Synopsis Test')
    expect(data.synopsis).toBe('Eine kurze Zusammenfassung')
  })
})
