import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL || 'https://script.serienwerft.studio'

test.describe('Phase 6: Revision-System for dokument_szenen', () => {

  let dokumentSzeneId: string
  let fassungId: string

  test('setup: get dokument_szene_id from test data', async ({ request }) => {
    const dokRes = await request.get(`${BASE}/api/folgen/rote-rosen/8888/dokumente`)
    const docs = await dokRes.json()
    fassungId = docs[0].fassung_id

    const scenesRes = await request.get(`${BASE}/api/fassungen/${fassungId}/szenen`)
    const scenes = await scenesRes.json()
    dokumentSzeneId = scenes[0].id
    expect(dokumentSzeneId).toBeTruthy()
  })

  test('GET /api/dokument-szenen/:id/revisionen returns empty initially', async ({ request }) => {
    const res = await request.get(`${BASE}/api/dokument-szenen/${dokumentSzeneId}/revisionen`)
    expect(res.ok()).toBeTruthy()
    const deltas = await res.json()
    expect(Array.isArray(deltas)).toBeTruthy()
    expect(deltas.length).toBe(0)
  })

  test('POST /api/dokument-szenen/:id/revisionen creates header delta', async ({ request }) => {
    const res = await request.post(`${BASE}/api/dokument-szenen/${dokumentSzeneId}/revisionen`, {
      data: {
        fassung_id: fassungId,
        field_type: 'header',
        field_name: 'ort_name',
        old_value: 'PHASE3 TESTORT',
        new_value: 'PHASE3 TESTORT GEÄNDERT',
      },
    })
    expect(res.status()).toBe(201)
    const delta = await res.json()
    expect(delta.dokument_szene_id).toBe(dokumentSzeneId)
    expect(delta.field_type).toBe('header')
    expect(delta.field_name).toBe('ort_name')
  })

  test('POST /api/dokument-szenen/:id/revisionen creates content_block delta', async ({ request }) => {
    const res = await request.post(`${BASE}/api/dokument-szenen/${dokumentSzeneId}/revisionen`, {
      data: {
        fassung_id: fassungId,
        field_type: 'content_block',
        block_index: 0,
        block_type: 'action',
        old_value: 'old action text',
        new_value: 'new action text',
      },
    })
    expect(res.status()).toBe(201)
    const delta = await res.json()
    expect(delta.field_type).toBe('content_block')
    expect(delta.block_index).toBe(0)
  })

  test('GET /api/dokument-szenen/:id/revisionen returns created deltas', async ({ request }) => {
    const res = await request.get(`${BASE}/api/dokument-szenen/${dokumentSzeneId}/revisionen`)
    expect(res.ok()).toBeTruthy()
    const deltas = await res.json()
    expect(deltas.length).toBe(2)
    expect(deltas[0].field_type).toBe('header')
    expect(deltas[1].field_type).toBe('content_block')
  })

  test('POST invalid field_type returns 400', async ({ request }) => {
    const res = await request.post(`${BASE}/api/dokument-szenen/${dokumentSzeneId}/revisionen`, {
      data: { field_type: 'invalid' },
    })
    expect(res.status()).toBe(400)
  })

  test('POST without field_type returns 400', async ({ request }) => {
    const res = await request.post(`${BASE}/api/dokument-szenen/${dokumentSzeneId}/revisionen`, {
      data: { old_value: 'test' },
    })
    expect(res.status()).toBe(400)
  })
})
