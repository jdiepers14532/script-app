import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL || 'https://script.serienwerft.studio'
const AUTH_BASE = 'https://auth.serienwerft.studio'

const produktionId = 'd26dff66-57cf-4b32-9649-4009618fce4d'
let authCookie: string

test.beforeAll(async ({ request }) => {
  const loginRes = await request.post(`${AUTH_BASE}/api/auth/login`, {
    data: { email: 'noreply@serienwerft.studio', password: 'Claude2026' },
  })
  expect(loginRes.ok()).toBeTruthy()
  const cookies = loginRes.headers()['set-cookie'] ?? ''
  const match = cookies.match(/access_token=([^;]+)/)
  expect(match).toBeTruthy()
  authCookie = `access_token=${match![1]}`
})

function h() { return { headers: { Cookie: authCookie } } }

// ══════════════════════════════════════════════════════════════════════════════
// 1. Search API — Basic
// ══════════════════════════════════════════════════════════════════════════════

test('GET /api/search returns 400 without query', async ({ request }) => {
  const res = await request.get(`${BASE}/api/search`, h())
  expect(res.status()).toBe(400)
})

test('GET /api/search returns 400 without scope', async ({ request }) => {
  const res = await request.get(`${BASE}/api/search?query=test`, h())
  expect(res.status()).toBe(400)
})

test('GET /api/search with invalid regex returns 400', async ({ request }) => {
  const res = await request.get(`${BASE}/api/search?query=[invalid&scope=alle&regex=true`, h())
  expect(res.status()).toBe(400)
  const body = await res.json()
  expect(body.error).toContain('regulaer')
})

// ══════════════════════════════════════════════════════════════════════════════
// 2. Search API — Alle Produktionen
// ══════════════════════════════════════════════════════════════════════════════

test('GET /api/search scope=alle returns results structure', async ({ request }) => {
  const res = await request.get(
    `${BASE}/api/search?query=INT&scope=alle&case_sensitive=true`,
    h()
  )
  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  expect(body).toHaveProperty('results')
  expect(body).toHaveProperty('total')
  expect(body).toHaveProperty('total_scenes')
  expect(body).toHaveProperty('locked_count')
  expect(body).toHaveProperty('fallback_count')
  expect(body).toHaveProperty('has_more')
  expect(Array.isArray(body.results)).toBe(true)
  expect(typeof body.total).toBe('number')
})

test('GET /api/search scope=alle with common word returns results', async ({ request }) => {
  const res = await request.get(
    `${BASE}/api/search?query=und&scope=alle`,
    h()
  )
  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  // 'und' should exist in German scripts
  if (body.total > 0) {
    const first = body.results[0]
    expect(first).toHaveProperty('dokument_szene_id')
    expect(first).toHaveProperty('scene_nummer')
    expect(first).toHaveProperty('snippet')
    expect(first).toHaveProperty('werkstufe_typ')
    expect(first).toHaveProperty('is_locked')
    expect(first).toHaveProperty('is_fallback')
    expect(first.snippet).toBeTruthy()
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// 3. Search API — Produktion Scope
// ══════════════════════════════════════════════════════════════════════════════

test('GET /api/search scope=produktion filters by production', async ({ request }) => {
  const res = await request.get(
    `${BASE}/api/search?query=.&scope=produktion&scope_id=${produktionId}&regex=true&limit=5`,
    h()
  )
  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  expect(body.total).toBeGreaterThanOrEqual(0)
})

// ══════════════════════════════════════════════════════════════════════════════
// 4. Search Options — Case Sensitivity
// ══════════════════════════════════════════════════════════════════════════════

test('case_sensitive=true distinguishes case', async ({ request }) => {
  const lower = await request.get(
    `${BASE}/api/search?query=int&scope=alle&case_sensitive=false&limit=5`,
    h()
  )
  const upper = await request.get(
    `${BASE}/api/search?query=INT&scope=alle&case_sensitive=true&limit=5`,
    h()
  )
  expect(lower.ok()).toBeTruthy()
  expect(upper.ok()).toBeTruthy()
  // Case insensitive should find >= case sensitive results
  const lBody = await lower.json()
  const uBody = await upper.json()
  expect(lBody.total).toBeGreaterThanOrEqual(uBody.total)
})

// ══════════════════════════════════════════════════════════════════════════════
// 5. Search Options — Whole Words
// ══════════════════════════════════════════════════════════════════════════════

test('whole_words=true limits results', async ({ request }) => {
  const partial = await request.get(
    `${BASE}/api/search?query=Tag&scope=alle&whole_words=false&limit=5`,
    h()
  )
  const whole = await request.get(
    `${BASE}/api/search?query=Tag&scope=alle&whole_words=true&limit=5`,
    h()
  )
  expect(partial.ok()).toBeTruthy()
  expect(whole.ok()).toBeTruthy()
  const pBody = await partial.json()
  const wBody = await whole.json()
  expect(pBody.total).toBeGreaterThanOrEqual(wBody.total)
})

// ══════════════════════════════════════════════════════════════════════════════
// 6. Replace API — Validation
// ══════════════════════════════════════════════════════════════════════════════

test('POST /api/search/replace returns 400 without required params', async ({ request }) => {
  const res = await request.post(`${BASE}/api/search/replace`, {
    headers: { Cookie: authCookie },
    data: { query: 'test' },
  })
  expect(res.status()).toBe(400)
})

test('POST /api/search/replace returns 400 with invalid regex', async ({ request }) => {
  const res = await request.post(`${BASE}/api/search/replace`, {
    headers: { Cookie: authCookie },
    data: {
      query: '[invalid',
      replacement: 'x',
      scope: 'alle',
      regex: true,
    },
  })
  expect(res.status()).toBe(400)
})

// ══════════════════════════════════════════════════════════════════════════════
// 7. Replace API — Dry run with unlikely match
// ══════════════════════════════════════════════════════════════════════════════

test('POST /api/search/replace with no matches returns 0', async ({ request }) => {
  const res = await request.post(`${BASE}/api/search/replace`, {
    headers: { Cookie: authCookie },
    data: {
      query: 'XYZZY_NO_MATCH_12345',
      replacement: 'replaced',
      scope: 'alle',
    },
  })
  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  expect(body.replaced_count).toBe(0)
  expect(body.skipped_locked).toBe(0)
  expect(body.skipped_excluded).toBe(0)
  expect(body.affected_scenes).toEqual([])
})

// ══════════════════════════════════════════════════════════════════════════════
// 8. Content Type Filter
// ══════════════════════════════════════════════════════════════════════════════

test('content_types filter restricts search', async ({ request }) => {
  const all = await request.get(
    `${BASE}/api/search?query=.&scope=alle&regex=true&limit=5`,
    h()
  )
  const drehbuchOnly = await request.get(
    `${BASE}/api/search?query=.&scope=alle&regex=true&limit=5&content_types=drehbuch`,
    h()
  )
  expect(all.ok()).toBeTruthy()
  expect(drehbuchOnly.ok()).toBeTruthy()
  const aBody = await all.json()
  const dBody = await drehbuchOnly.json()
  expect(aBody.total).toBeGreaterThanOrEqual(dBody.total)
})

// ══════════════════════════════════════════════════════════════════════════════
// 9. Pagination
// ══════════════════════════════════════════════════════════════════════════════

test('limit and offset work for pagination', async ({ request }) => {
  const page1 = await request.get(
    `${BASE}/api/search?query=.&scope=alle&regex=true&limit=2&offset=0`,
    h()
  )
  const page2 = await request.get(
    `${BASE}/api/search?query=.&scope=alle&regex=true&limit=2&offset=2`,
    h()
  )
  expect(page1.ok()).toBeTruthy()
  expect(page2.ok()).toBeTruthy()
  const p1 = await page1.json()
  const p2 = await page2.json()
  expect(p1.results.length).toBeLessThanOrEqual(2)
  expect(p2.results.length).toBeLessThanOrEqual(2)
  // Pages should have different match positions or scene ids
  if (p1.results.length > 0 && p2.results.length > 0) {
    const r1 = p1.results[0]
    const r2 = p2.results[0]
    const isDifferent = r1.dokument_szene_id !== r2.dokument_szene_id
      || r1.match_position !== r2.match_position
    expect(isDifferent).toBe(true)
  }
})
