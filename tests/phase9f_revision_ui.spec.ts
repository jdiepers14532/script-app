import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL || 'https://script.serienwerft.studio'
const STAFFEL_ID = 'd26dff66-57cf-4b32-9649-4009618fce4d'

async function createCtx(request: any) {
  const folge = 93000 + Math.floor(Math.random() * 6999)
  const stage = await (await request.post(`${BASE}/api/stages`, {
    data: { staffel_id: STAFFEL_ID, folge_nummer: folge, stage_type: 'draft' },
  })).json()
  if (!stage.id) return null
  const szene = await (await request.post(`${BASE}/api/stages/${stage.id}/szenen`, {
    data: {
      scene_nummer: 1, ort_name: 'RevUI-Test', int_ext: 'INT', tageszeit: 'TAG',
      content: [
        { id: 'b1', type: 'action', text: 'Ursprünglicher Block 1.' },
        { id: 'b2', type: 'dialogue', text: 'Ursprünglicher Dialog.' },
      ],
    },
  })).json()
  if (!szene.id) return null
  return { stageId: stage.id as number, szeneId: szene.id as number }
}

async function cleanup(request: any, szeneId: number) {
  await request.delete(`${BASE}/api/szenen/${szeneId}`)
}

test.describe('Phase 9f — Revision UI Daten', () => {

  test('Revisionen API: gibt block_index + revision_color zurück', async ({ request }) => {
    const ctx = await createCtx(request)
    if (!ctx) test.skip()
    const { stageId, szeneId } = ctx!

    // Create a revision color for the test staffelId
    const color = await (await request.post(
      `${BASE}/api/staffeln/${STAFFEL_ID}/revision-colors`,
      { data: { name: 'RevUI-Farbe', color: '#3399FF' } }
    )).json()

    // Set revision color on stage
    await request.put(`${BASE}/api/stages/${stageId}`, {
      data: { revision_color_id: color.id },
    })

    // Record content_block deltas
    await request.post(`${BASE}/api/szenen/${szeneId}/revisionen`, {
      data: {
        stage_id: stageId, field_type: 'content_block',
        block_index: 0, block_type: 'action',
        old_value: 'Ursprünglicher Block 1.', new_value: 'Geänderter Block 1.',
      },
    })
    await request.post(`${BASE}/api/szenen/${szeneId}/revisionen`, {
      data: {
        stage_id: stageId, field_type: 'content_block',
        block_index: 1, block_type: 'dialogue',
        old_value: 'Ursprünglicher Dialog.', new_value: 'Geänderter Dialog.',
      },
    })

    // GET revisionen — UI uses this to determine which blocks to mark
    const res = await request.get(`${BASE}/api/szenen/${szeneId}/revisionen?stage_id=${stageId}`)
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(data.length).toBe(2)

    const blockIndices = data.map((d: any) => d.block_index)
    expect(blockIndices).toContain(0)
    expect(blockIndices).toContain(1)

    // Should include revision_color from the join
    const withColor = data.filter((d: any) => d.revision_color !== null)
    expect(withColor.length).toBeGreaterThanOrEqual(1)
    expect(withColor[0].revision_color).toBe('#3399FF')

    // Cleanup
    await request.delete(`${BASE}/api/staffeln/${STAFFEL_ID}/revision-colors/${color.id}`)
    await cleanup(request, szeneId)
  })

  test('Revisionen: header delta liefert field_name + old/new_value', async ({ request }) => {
    const ctx = await createCtx(request)
    if (!ctx) test.skip()
    const { stageId, szeneId } = ctx!

    await request.post(`${BASE}/api/szenen/${szeneId}/revisionen`, {
      data: {
        stage_id: stageId, field_type: 'header',
        field_name: 'ort_name',
        old_value: 'RevUI-Test', new_value: 'Neues Motiv',
      },
    })

    const data = await (await request.get(`${BASE}/api/szenen/${szeneId}/revisionen`)).json()
    expect(data.length).toBe(1)
    expect(data[0].field_name).toBe('ort_name')
    expect(data[0].old_value).toBe('RevUI-Test')
    expect(data[0].new_value).toBe('Neues Motiv')

    await cleanup(request, szeneId)
  })

  test('Revisionen: stage_id Filter liefert nur Einträge dieser Stage', async ({ request }) => {
    const ctx = await createCtx(request)
    if (!ctx) test.skip()
    const { stageId, szeneId } = ctx!

    // Insert delta for the real stageId
    await request.post(`${BASE}/api/szenen/${szeneId}/revisionen`, {
      data: {
        stage_id: stageId, field_type: 'header',
        field_name: 'tageszeit', old_value: 'TAG', new_value: 'NACHT',
      },
    })

    const filtered = await (await request.get(
      `${BASE}/api/szenen/${szeneId}/revisionen?stage_id=${stageId}`
    )).json()
    expect(filtered.length).toBeGreaterThanOrEqual(1)
    expect(filtered.every((d: any) => d.stage_id === stageId)).toBe(true)

    await cleanup(request, szeneId)
  })

  test('Frontend liefert 200', async ({ request }) => {
    const res = await request.get(`${BASE}/`)
    expect(res.status()).toBe(200)
  })

})
