import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL || 'https://script.serienwerft.studio'

test('Health endpoint is up', async ({ request }) => {
  const res = await request.get(`${BASE}/api/health`)
  expect(res.status()).toBe(200)
})

test('Productions list endpoint returns 200 or 401', async ({ request }) => {
  const res = await request.get(`${BASE}/api/me/productions`)
  expect([200, 401]).toContain(res.status())
})

test('User settings endpoint returns 200 or 401', async ({ request }) => {
  const res = await request.get(`${BASE}/api/me/settings`)
  expect([200, 401]).toContain(res.status())
})

test('Staffeln sync endpoint exists (POST)', async ({ request }) => {
  // Without auth → 401
  const res = await request.post(`${BASE}/api/staffeln/sync`, {
    data: { production_id: '00000000-0000-0000-0000-000000000000', title: 'Test' },
  })
  expect([200, 400, 401, 403, 500]).toContain(res.status())
})
