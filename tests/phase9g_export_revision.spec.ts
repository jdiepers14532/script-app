import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL || 'https://script.serienwerft.studio'
const STAFFEL_ID = 'd26dff66-57cf-4b32-9649-4009618fce4d'

async function createCtx(request: any) {
  const folge = 94000 + Math.floor(Math.random() * 5999)
  const stage = await (await request.post(`${BASE}/api/stages`, {
    data: { staffel_id: STAFFEL_ID, folge_nummer: folge, stage_type: 'revision' },
  })).json()
  if (!stage.id) return null

  const szene1 = await (await request.post(`${BASE}/api/stages/${stage.id}/szenen`, {
    data: {
      scene_nummer: 1, ort_name: 'ExportRevTest-1', int_ext: 'INT',
      content: [{ id: 'c1', type: 'action', text: 'Action Block.' }],
    },
  })).json()
  const szene2 = await (await request.post(`${BASE}/api/stages/${stage.id}/szenen`, {
    data: {
      scene_nummer: 2, ort_name: 'ExportRevTest-2', int_ext: 'EXT',
      content: [],
    },
  })).json()
  if (!szene1.id || !szene2.id) return null
  return { stageId: stage.id as number, szeneIds: [szene1.id, szene2.id] as number[] }
}

async function cleanup(request: any, szeneIds: number[]) {
  for (const id of szeneIds) await request.delete(`${BASE}/api/szenen/${id}`)
}

test.describe('Phase 9g — Export Revision Summary', () => {

  test('revision-summary: leere Stage → keine Änderungen', async ({ request }) => {
    const ctx = await createCtx(request)
    if (!ctx) test.skip()
    const { stageId, szeneIds } = ctx!

    const res = await request.get(`${BASE}/api/stages/${stageId}/export/revision-summary`)
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(data).toHaveProperty('changed_scenes')
    expect(data).toHaveProperty('replacement_pages')
    expect(data).toHaveProperty('memo_entries')
    expect(data.changed_scenes.length).toBe(0)
    expect(data.replacement_pages.length).toBe(0)

    await cleanup(request, szeneIds)
  })

  test('revision-summary: content_block delta → replacement_pages', async ({ request }) => {
    const ctx = await createCtx(request)
    if (!ctx) test.skip()
    const { stageId, szeneIds } = ctx!

    // Add content_block delta for szene 1
    await request.post(`${BASE}/api/szenen/${szeneIds[0]}/revisionen`, {
      data: {
        stage_id: stageId, field_type: 'content_block',
        block_index: 0, block_type: 'action',
        old_value: 'Action Block.', new_value: 'Geänderter Block.',
      },
    })

    const res = await request.get(`${BASE}/api/stages/${stageId}/export/revision-summary`)
    expect(res.status()).toBe(200)
    const data = await res.json()

    expect(data.changed_scenes.length).toBe(1)
    expect(data.changed_scenes[0].scene_nummer).toBe(1)
    expect(data.changed_scenes[0].has_content_change).toBe(true)

    expect(data.replacement_pages.length).toBe(1)
    expect(data.replacement_pages[0].scene_nummer).toBe(1)

    await cleanup(request, szeneIds)
  })

  test('revision-summary: kurze header-Änderung → memo_entries', async ({ request }) => {
    const ctx = await createCtx(request)
    if (!ctx) test.skip()
    const { stageId, szeneIds } = ctx!

    // Short header change (below memo threshold)
    await request.post(`${BASE}/api/szenen/${szeneIds[0]}/revisionen`, {
      data: {
        stage_id: stageId, field_type: 'header',
        field_name: 'tageszeit', old_value: 'TAG', new_value: 'NACHT',
      },
    })

    const res = await request.get(`${BASE}/api/stages/${stageId}/export/revision-summary`)
    const data = await res.json()

    // "TAG" vs "NACHT" = 5 chars, well below default threshold of 100
    expect(data.memo_entries.length).toBeGreaterThanOrEqual(1)
    const entry = data.memo_entries.find((e: any) => e.field_name === 'tageszeit')
    expect(entry).toBeTruthy()
    expect(entry.old_value).toBe('TAG')
    expect(entry.new_value).toBe('NACHT')

    await cleanup(request, szeneIds)
  })

  test('revision-summary: mit revision_color → liefert color info', async ({ request }) => {
    const ctx = await createCtx(request)
    if (!ctx) test.skip()
    const { stageId, szeneIds } = ctx!

    // Create temp color
    const color = await (await request.post(
      `${BASE}/api/staffeln/${STAFFEL_ID}/revision-colors`,
      { data: { name: 'ExportTest-Farbe', color: '#AABBCC' } }
    )).json()

    // Set on stage
    await request.put(`${BASE}/api/stages/${stageId}`, {
      data: { revision_color_id: color.id },
    })

    const res = await request.get(`${BASE}/api/stages/${stageId}/export/revision-summary`)
    const data = await res.json()
    expect(data.revision_color).toBeTruthy()
    expect(data.revision_color.color).toBe('#AABBCC')
    expect(data.revision_color.name).toBe('ExportTest-Farbe')

    // Cleanup
    await request.delete(`${BASE}/api/staffeln/${STAFFEL_ID}/revision-colors/${color.id}`)
    await cleanup(request, szeneIds)
  })

  test('revision-summary: nicht gefundene Stage → 404', async ({ request }) => {
    const res = await request.get(`${BASE}/api/stages/99999/export/revision-summary`)
    expect(res.status()).toBe(404)
  })

  test('bestehende Exports (PDF/fountain/fdx) weiterhin funktionsfähig', async ({ request }) => {
    const ctx = await createCtx(request)
    if (!ctx) test.skip()
    const { stageId, szeneIds } = ctx!

    const pdf = await request.get(`${BASE}/api/stages/${stageId}/export/pdf`)
    expect(pdf.status()).toBe(200)

    const fountain = await request.get(`${BASE}/api/stages/${stageId}/export/fountain`)
    expect(fountain.status()).toBe(200)

    const fdx = await request.get(`${BASE}/api/stages/${stageId}/export/fdx`)
    expect(fdx.status()).toBe(200)

    await cleanup(request, szeneIds)
  })

})
