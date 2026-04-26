import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL || 'https://script.serienwerft.studio'
const STAFFEL_ID = 'd26dff66-57cf-4b32-9649-4009618fce4d'

async function createTestCtx(request: any) {
  const folge = 92000 + Math.floor(Math.random() * 7999)
  const stage = await (await request.post(`${BASE}/api/stages`, {
    data: { staffel_id: STAFFEL_ID, folge_nummer: folge, stage_type: 'draft' },
  })).json()
  if (!stage.id) return null
  const szene = await (await request.post(`${BASE}/api/stages/${stage.id}/szenen`, {
    data: {
      scene_nummer: 1, ort_name: 'RevTest', int_ext: 'INT',
      content: [{ id: 'a1', type: 'action', text: 'Ursprünglicher Text.' }],
    },
  })).json()
  if (!szene.id) return null
  return { stageId: stage.id as number, szeneId: szene.id as number }
}

async function cleanupCtx(request: any, szeneId: number) {
  await request.delete(`${BASE}/api/szenen/${szeneId}`)
}

test.describe('Phase 9e — Revision Backend (Delta-Tracking)', () => {

  test('GET /revisionen liefert leeres Array initial', async ({ request }) => {
    const ctx = await createTestCtx(request)
    if (!ctx) test.skip()
    const { szeneId } = ctx!

    const res = await request.get(`${BASE}/api/szenen/${szeneId}/revisionen`)
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBe(0)

    await cleanupCtx(request, szeneId)
  })

  test('Kein Delta bei normalem Stage (kein revision_color_id)', async ({ request }) => {
    const ctx = await createTestCtx(request)
    if (!ctx) test.skip()
    const { szeneId } = ctx!

    // Update szene — stage has no revision_color_id
    await request.put(`${BASE}/api/szenen/${szeneId}`, {
      data: { ort_name: 'Geändertes Motiv' },
    })

    const res = await request.get(`${BASE}/api/szenen/${szeneId}/revisionen`)
    const data = await res.json()
    // Should be empty — no revision color set on stage
    expect(data.length).toBe(0)

    await cleanupCtx(request, szeneId)
  })

  test('POST /revisionen — manuelle Delta-Einträge möglich', async ({ request }) => {
    const ctx = await createTestCtx(request)
    if (!ctx) test.skip()
    const { stageId, szeneId } = ctx!

    // Manually record a header delta
    const post = await request.post(`${BASE}/api/szenen/${szeneId}/revisionen`, {
      data: {
        stage_id: stageId,
        field_type: 'header',
        field_name: 'ort_name',
        old_value: 'Alt-Motiv',
        new_value: 'Neu-Motiv',
      },
    })
    expect(post.status()).toBe(201)
    const entry = await post.json()
    expect(entry.field_type).toBe('header')
    expect(entry.field_name).toBe('ort_name')
    expect(entry.old_value).toBe('Alt-Motiv')
    expect(entry.new_value).toBe('Neu-Motiv')

    // GET should reflect it
    const list = await (await request.get(`${BASE}/api/szenen/${szeneId}/revisionen`)).json()
    expect(list.length).toBe(1)
    expect(list[0].id).toBe(entry.id)

    await cleanupCtx(request, szeneId)
  })

  test('POST /revisionen — content_block delta', async ({ request }) => {
    const ctx = await createTestCtx(request)
    if (!ctx) test.skip()
    const { stageId, szeneId } = ctx!

    const post = await request.post(`${BASE}/api/szenen/${szeneId}/revisionen`, {
      data: {
        stage_id: stageId,
        field_type: 'content_block',
        block_index: 0,
        block_type: 'action',
        old_value: 'Alter Actiontext.',
        new_value: 'Neuer Actiontext.',
      },
    })
    expect(post.status()).toBe(201)
    const entry = await post.json()
    expect(entry.field_type).toBe('content_block')
    expect(entry.block_index).toBe(0)

    await cleanupCtx(request, szeneId)
  })

  test('POST /revisionen — ungültiger field_type → 400', async ({ request }) => {
    const ctx = await createTestCtx(request)
    if (!ctx) test.skip()
    const { stageId, szeneId } = ctx!

    const res = await request.post(`${BASE}/api/szenen/${szeneId}/revisionen`, {
      data: { stage_id: stageId, field_type: 'invalid' },
    })
    expect(res.status()).toBe(400)

    await cleanupCtx(request, szeneId)
  })

  test('GET /revisionen mit stage_id Filter', async ({ request }) => {
    const ctx = await createTestCtx(request)
    if (!ctx) test.skip()
    const { stageId, szeneId } = ctx!

    // Add delta
    await request.post(`${BASE}/api/szenen/${szeneId}/revisionen`, {
      data: {
        stage_id: stageId, field_type: 'header',
        field_name: 'tageszeit', old_value: 'TAG', new_value: 'NACHT',
      },
    })

    // Filter by stage_id
    const filtered = await (await request.get(
      `${BASE}/api/szenen/${szeneId}/revisionen?stage_id=${stageId}`
    )).json()
    expect(filtered.length).toBeGreaterThanOrEqual(1)

    // Filter by non-existing stage_id
    const empty = await (await request.get(
      `${BASE}/api/szenen/${szeneId}/revisionen?stage_id=99999`
    )).json()
    expect(empty.length).toBe(0)

    await cleanupCtx(request, szeneId)
  })

  test('Auto-Delta bei Save in Stage mit revision_color_id', async ({ request }) => {
    const ctx = await createTestCtx(request)
    if (!ctx) test.skip()
    const { stageId, szeneId } = ctx!

    // Create a temporary revision color for the UUID staffelId
    const colorRes = await (await request.post(
      `${BASE}/api/staffeln/${STAFFEL_ID}/revision-colors`,
      { data: { name: 'AutoDelta-Test-Farbe', color: '#FF0000' } }
    )).json()

    if (!colorRes.id) {
      await cleanupCtx(request, szeneId)
      test.skip()
      return
    }

    // Set revision_color_id on the stage
    const stageUpdate = await request.put(`${BASE}/api/stages/${stageId}`, {
      data: { revision_color_id: colorRes.id },
    })
    if (stageUpdate.status() !== 200) {
      await request.delete(`${BASE}/api/staffeln/${STAFFEL_ID}/revision-colors/${colorRes.id}`)
      await cleanupCtx(request, szeneId)
      test.skip()
      return
    }

    // Now update szene — should auto-record delta
    await request.put(`${BASE}/api/szenen/${szeneId}`, {
      data: { ort_name: 'AutoDelta-Motiv' },
    })

    // Wait briefly for async delta recording
    await new Promise(r => setTimeout(r, 500))

    const revisionen = await (await request.get(`${BASE}/api/szenen/${szeneId}/revisionen`)).json()
    expect(revisionen.length).toBeGreaterThanOrEqual(1)
    const headerDelta = revisionen.find((r: any) => r.field_name === 'ort_name')
    expect(headerDelta).toBeTruthy()
    expect(headerDelta.new_value).toBe('AutoDelta-Motiv')

    // Cleanup
    await request.delete(`${BASE}/api/staffeln/${STAFFEL_ID}/revision-colors/${colorRes.id}`)
    await cleanupCtx(request, szeneId)
  })

})
