import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL || 'https://script.serienwerft.studio'

async function getTestEpisodeId(request: any): Promise<number> {
  const bloeckeRes = await request.get(`${BASE}/api/staffeln/rote-rosen/bloecke`)
  const bloecke = await bloeckeRes.json()
  const blockId = bloecke[0].id
  const epRes = await request.post(`${BASE}/api/bloecke/${blockId}/episoden`, {
    data: { episode_nummer: Math.floor(Math.random() * 90000) + 1000, arbeitstitel: 'Lock Test' }
  })
  const ep = await epRes.json()
  return ep.id
}

test.describe('Phase 2 — Lock System', () => {
  test('Lock anfordern', async ({ request }) => {
    const epId = await getTestEpisodeId(request)
    const res = await request.post(`${BASE}/api/episoden/${epId}/lock`, { data: {} })
    expect(res.status()).toBe(201)
    const lock = await res.json()
    expect(lock.lock_type).toBe('exclusive')
    expect(lock.expires_at).toBeTruthy()
  })

  test('Doppelter Lock → 409', async ({ request }) => {
    const epId = await getTestEpisodeId(request)
    await request.post(`${BASE}/api/episoden/${epId}/lock`, { data: {} })
    const res2 = await request.post(`${BASE}/api/episoden/${epId}/lock`, { data: {} })
    expect(res2.status()).toBe(409)
    const body = await res2.json()
    expect(body.error).toBeTruthy()
  })

  test('Lock freigeben', async ({ request }) => {
    const epId = await getTestEpisodeId(request)
    await request.post(`${BASE}/api/episoden/${epId}/lock`, { data: {} })
    const delRes = await request.delete(`${BASE}/api/episoden/${epId}/lock`)
    expect(delRes.status()).toBe(204)
    // Lock should be gone
    const getRes = await request.get(`${BASE}/api/episoden/${epId}/lock`)
    expect(getRes.status()).toBe(404)
  })

  test('Takeover als Admin', async ({ request }) => {
    const epId = await getTestEpisodeId(request)
    await request.post(`${BASE}/api/episoden/${epId}/lock`, { data: {} })
    const takeRes = await request.post(`${BASE}/api/episoden/${epId}/lock/takeover`, { data: {} })
    expect(takeRes.status()).toBe(200)
    const lock = await takeRes.json()
    expect(lock.user_id).toBe('test-user')
  })

  test('Contract-Webhook lock', async ({ request }) => {
    const epId = await getTestEpisodeId(request)
    const res = await request.post(`${BASE}/api/locks/contract-update`, {
      data: {
        episode_id: epId,
        action: 'lock',
        contract_ref: 'VDB-12345',
        user_id: 'vertraege-system',
        user_name: 'Vertragsdatenbank'
      }
    })
    expect(res.status()).toBe(201)
    const lock = await res.json()
    expect(lock.lock_type).toBe('contract')
    expect(lock.contract_ref).toBe('VDB-12345')
  })

  test('Lock-Status abrufen', async ({ request }) => {
    const epId = await getTestEpisodeId(request)
    await request.post(`${BASE}/api/episoden/${epId}/lock`, { data: {} })
    const res = await request.get(`${BASE}/api/episoden/${epId}/lock`)
    expect(res.status()).toBe(200)
    const lock = await res.json()
    expect(lock.episode_id).toBe(epId)
  })
})
