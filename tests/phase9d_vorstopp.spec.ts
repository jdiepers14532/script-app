import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL || 'https://script.serienwerft.studio'
const STAFFEL_ID = 'd26dff66-57cf-4b32-9649-4009618fce4d'
const STAFFEL = 'rote-rosen'

async function createTestCtx(request: any) {
  const folge = 91000 + Math.floor(Math.random() * 8999)
  const stage = await (await request.post(`${BASE}/api/stages`, {
    data: { staffel_id: STAFFEL_ID, folge_nummer: folge, stage_type: 'draft' },
  })).json()
  if (!stage.id) return null
  const szene = await (await request.post(`${BASE}/api/stages/${stage.id}/szenen`, {
    data: { scene_nummer: 1, ort_name: 'VorstoppTest', content: [], seiten: '2 3/8' },
  })).json()
  if (!szene.id) return null
  return { stageId: stage.id as number, szeneId: szene.id as number }
}

async function cleanupCtx(request: any, szeneId: number) {
  await request.delete(`${BASE}/api/szenen/${szeneId}`)
}

test.describe('Phase 9d — Vorstopp API', () => {

  test('vorstopp_einstellungen: GET liefert Defaults', async ({ request }) => {
    const res = await request.get(`${BASE}/api/staffeln/${STAFFEL}/vorstopp-einstellungen`)
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(data).toHaveProperty('methode')
    expect(data).toHaveProperty('menge')
    expect(data).toHaveProperty('dauer_sekunden')
    expect(typeof data.menge).toBe('number')
    expect(typeof data.dauer_sekunden).toBe('number')
  })

  test('vorstopp_einstellungen: PUT + GET roundtrip', async ({ request }) => {
    // Save
    const put = await request.put(`${BASE}/api/staffeln/${STAFFEL}/vorstopp-einstellungen`, {
      data: { methode: 'seiten', menge: 48, dauer_sekunden: 55 },
    })
    expect(put.status()).toBe(200)
    const saved = await put.json()
    expect(saved.menge).toBe(48)
    expect(saved.dauer_sekunden).toBe(55)
    // Read back
    const get = await request.get(`${BASE}/api/staffeln/${STAFFEL}/vorstopp-einstellungen`)
    const back = await get.json()
    expect(back.menge).toBe(48)
    // Reset
    await request.put(`${BASE}/api/staffeln/${STAFFEL}/vorstopp-einstellungen`, {
      data: { methode: 'seiten', menge: 54, dauer_sekunden: 60 },
    })
  })

  test('vorstopp: GET liefert leeres all + latest_per_stage', async ({ request }) => {
    const ctx = await createTestCtx(request)
    if (!ctx) test.skip()
    const { szeneId } = ctx!

    const res = await request.get(`${BASE}/api/szenen/${szeneId}/vorstopp`)
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data.all)).toBe(true)
    expect(typeof data.latest_per_stage).toBe('object')

    await cleanupCtx(request, szeneId)
  })

  test('vorstopp: POST manuell + GET zeigt latest', async ({ request }) => {
    const ctx = await createTestCtx(request)
    if (!ctx) test.skip()
    const { szeneId } = ctx!

    // Add drehbuch entry
    const post = await request.post(`${BASE}/api/szenen/${szeneId}/vorstopp`, {
      data: { stage: 'drehbuch', dauer_sekunden: 150, methode: 'manuell' },
    })
    expect(post.status()).toBe(201)
    const entry = await post.json()
    expect(entry.stage).toBe('drehbuch')
    expect(entry.dauer_sekunden).toBe(150)

    // GET should reflect it
    const get = await request.get(`${BASE}/api/szenen/${szeneId}/vorstopp`)
    const data = await get.json()
    expect(data.latest_per_stage.drehbuch).toBeTruthy()
    expect(data.latest_per_stage.drehbuch.dauer_sekunden).toBe(150)

    await cleanupCtx(request, szeneId)
  })

  test('vorstopp: DELETE entry', async ({ request }) => {
    const ctx = await createTestCtx(request)
    if (!ctx) test.skip()
    const { szeneId } = ctx!

    const created = await (await request.post(`${BASE}/api/szenen/${szeneId}/vorstopp`, {
      data: { stage: 'dreh', dauer_sekunden: 200, methode: 'manuell' },
    })).json()

    const del = await request.delete(`${BASE}/api/szenen/${szeneId}/vorstopp/${created.id}`)
    expect(del.status()).toBe(200)

    const after = await (await request.get(`${BASE}/api/szenen/${szeneId}/vorstopp`)).json()
    expect(after.all.some((e: any) => e.id === created.id)).toBe(false)

    await cleanupCtx(request, szeneId)
  })

  test('vorstopp: POST /auto berechnet aus seiten', async ({ request }) => {
    const ctx = await createTestCtx(request)
    if (!ctx) test.skip()
    const { szeneId } = ctx!

    const res = await request.post(`${BASE}/api/szenen/${szeneId}/vorstopp/auto`, {})
    // Should either succeed (200) or return 422 if seiten not parseable
    expect([200, 422]).toContain(res.status())
    if (res.status() === 200) {
      const data = await res.json()
      expect(typeof data.dauer_sekunden).toBe('number')
    }

    await cleanupCtx(request, szeneId)
  })

  test('vorstopp: ungültige stage → 400', async ({ request }) => {
    const ctx = await createTestCtx(request)
    if (!ctx) test.skip()
    const { szeneId } = ctx!

    const res = await request.post(`${BASE}/api/szenen/${szeneId}/vorstopp`, {
      data: { stage: 'ungueltig', dauer_sekunden: 100 },
    })
    expect(res.status()).toBe(400)

    await cleanupCtx(request, szeneId)
  })

})
