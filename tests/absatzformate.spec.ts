import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL || 'https://script.serienwerft.studio'
const AUTH_BASE = 'https://auth.serienwerft.studio'

// Known production ID (same as used in other test files)
const produktionId = 'd26dff66-57cf-4b32-9649-4009618fce4d'
let presetId: string
let authCookie: string

// ══════════════════════════════════════════════════════════════════════════════
// Auth: Login with claude test account
// ══════════════════════════════════════════════════════════════════════════════

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
function hd(data: any) { return { headers: { Cookie: authCookie }, data } }

// ══════════════════════════════════════════════════════════════════════════════
// 1. Presets API
// ══════════════════════════════════════════════════════════════════════════════

test('GET /api/absatzformat-presets returns system presets', async ({ request }) => {
  const res = await request.get(`${BASE}/api/absatzformat-presets`, h())
  expect(res.ok()).toBeTruthy()
  const data = await res.json()
  expect(Array.isArray(data)).toBeTruthy()
  expect(data.length).toBeGreaterThanOrEqual(4)

  const names = data.map((p: any) => p.name)
  expect(names).toContain('Serienwerft Daily-Standard')
  expect(names).toContain('US Screenplay (Hollywood)')
  expect(names).toContain('BBC TV Drama')
  expect(names).toContain('ARD/ZDF Fernsehfilm')

  for (const p of data.filter((x: any) => x.ist_system)) {
    expect(p.ist_system).toBe(true)
  }

  presetId = data.find((p: any) => p.name === 'Serienwerft Daily-Standard').id
})

test('GET /api/absatzformat-presets/:id returns single preset with formate', async ({ request }) => {
  test.skip(!presetId, 'No preset found')
  const res = await request.get(`${BASE}/api/absatzformat-presets/${presetId}`, h())
  expect(res.ok()).toBeTruthy()
  const data = await res.json()
  expect(data.name).toBe('Serienwerft Daily-Standard')
  expect(Array.isArray(data.formate)).toBeTruthy()
  expect(data.formate.length).toBe(11)
})

test('Serienwerft Daily-Standard preset has correct format structure', async ({ request }) => {
  test.skip(!presetId, 'No preset found')
  const res = await request.get(`${BASE}/api/absatzformat-presets/${presetId}`, h())
  const data = await res.json()

  const names = data.formate.map((f: any) => f.name)
  expect(names).toContain('Szenenueberschrift')
  expect(names).toContain('Action')
  expect(names).toContain('Character')
  expect(names).toContain('Dialogue')
  expect(names).toContain('Parenthetical')
  expect(names).toContain('Transition')
  expect(names).toContain('Shot')
  expect(names).toContain('Haupttext')
  expect(names).toContain('Status Quo')
  expect(names).toContain('Anmerkung')
  expect(names).toContain('Strang-Marker')

  const action = data.formate.find((f: any) => f.name === 'Action')
  expect(action.enter_next).toBe('Action')
  expect(action.tab_next).toBe('Character')
  expect(action.kategorie).toBe('drehbuch')
  expect(action.ist_standard).toBe(true)

  const statusQuo = data.formate.find((f: any) => f.name === 'Status Quo')
  expect(statusQuo.textbaustein).toBe('Status Quo:')
  expect(statusQuo.italic).toBe(true)
  expect(statusQuo.kategorie).toBe('storyline')
})

// ══════════════════════════════════════════════════════════════════════════════
// 2. Absatzformate CRUD (per Produktion)
// ══════════════════════════════════════════════════════════════════════════════

test('POST from-preset applies preset', async ({ request }) => {
  test.skip(!presetId, 'No preset found')
  const res = await request.post(
    `${BASE}/api/produktionen/${produktionId}/absatzformate/from-preset`,
    hd({ preset_id: presetId })
  )
  expect(res.status()).toBe(201)
  const data = await res.json()
  expect(Array.isArray(data)).toBeTruthy()
  expect(data.length).toBe(11)

  const action = data.find((f: any) => f.name === 'Action')
  expect(action).toBeTruthy()
  expect(action.enter_next_format).toBeTruthy()
  expect(action.tab_next_format).toBeTruthy()

  const character = data.find((f: any) => f.name === 'Character')
  expect(action.tab_next_format).toBe(character.id)
  expect(action.enter_next_format).toBe(action.id)
})

test('GET absatzformate returns all formats', async ({ request }) => {
  const res = await request.get(`${BASE}/api/produktionen/${produktionId}/absatzformate`, h())
  expect(res.ok()).toBeTruthy()
  const data = await res.json()
  expect(data.length).toBe(11)

  const sorted = [...data].sort((a: any, b: any) => a.sort_order - b.sort_order)
  expect(sorted[0].name).toBe('Szenenueberschrift')
})

let createdFormatId: string

test('POST absatzformate creates new format', async ({ request }) => {
  const res = await request.post(
    `${BASE}/api/produktionen/${produktionId}/absatzformate`,
    hd({
      name: 'Test-Format',
      kuerzel: 'TST',
      kategorie: 'storyline',
      font_family: 'Arial',
      font_size: 14,
      bold: true,
      italic: false,
      uppercase: false,
      text_align: 'center',
      margin_left: 1.0,
      margin_right: 1.0,
      textbaustein: 'Test:',
      sort_order: 99,
    })
  )
  expect(res.status()).toBe(201)
  const data = await res.json()
  expect(data.name).toBe('Test-Format')
  expect(data.kuerzel).toBe('TST')
  expect(data.font_family).toBe('Arial')
  expect(data.font_size).toBe(14)
  expect(data.bold).toBe(true)
  expect(data.text_align).toBe('center')
  expect(data.margin_left).toBe(1.0)
  expect(data.textbaustein).toBe('Test:')
  expect(data.kategorie).toBe('storyline')
  createdFormatId = data.id
})

test('POST duplicate name returns 409 conflict', async ({ request }) => {
  const res = await request.post(
    `${BASE}/api/produktionen/${produktionId}/absatzformate`,
    hd({ name: 'Test-Format' })
  )
  expect(res.status()).toBe(409)
})

test('PUT absatzformate updates format', async ({ request }) => {
  test.skip(!createdFormatId, 'No format created')
  const res = await request.put(
    `${BASE}/api/produktionen/${produktionId}/absatzformate/${createdFormatId}`,
    hd({ name: 'Test-Format-Updated', kuerzel: 'TSU', font_size: 16, italic: true, textbaustein: null })
  )
  expect(res.ok()).toBeTruthy()
  const data = await res.json()
  expect(data.name).toBe('Test-Format-Updated')
  expect(data.kuerzel).toBe('TSU')
  expect(data.font_size).toBe(16)
  expect(data.italic).toBe(true)
  expect(data.textbaustein).toBeNull()
})

test('PUT with enter_next_format sets flow reference', async ({ request }) => {
  test.skip(!createdFormatId, 'No format created')
  const listRes = await request.get(`${BASE}/api/produktionen/${produktionId}/absatzformate`, h())
  const formats = await listRes.json()
  const haupttext = formats.find((f: any) => f.name === 'Haupttext')
  test.skip(!haupttext, 'Haupttext format not found')

  const res = await request.put(
    `${BASE}/api/produktionen/${produktionId}/absatzformate/${createdFormatId}`,
    hd({ enter_next_format: haupttext.id })
  )
  expect(res.ok()).toBeTruthy()
  const data = await res.json()
  expect(data.enter_next_format).toBe(haupttext.id)
})

test('DELETE absatzformate removes format', async ({ request }) => {
  test.skip(!createdFormatId, 'No format created')
  const res = await request.delete(
    `${BASE}/api/produktionen/${produktionId}/absatzformate/${createdFormatId}`, h()
  )
  expect(res.status()).toBe(204)

  const listRes = await request.get(`${BASE}/api/produktionen/${produktionId}/absatzformate`, h())
  const data = await listRes.json()
  expect(data.find((f: any) => f.id === createdFormatId)).toBeUndefined()
})

// ══════════════════════════════════════════════════════════════════════════════
// 3. Copy from Production
// ══════════════════════════════════════════════════════════════════════════════

test('POST from-produktion copies formats', async ({ request }) => {
  const res = await request.post(
    `${BASE}/api/produktionen/${produktionId}/absatzformate/from-produktion`,
    hd({ source_produktion_id: produktionId })
  )
  expect(res.status()).toBe(201)
  const data = await res.json()
  expect(data.length).toBeGreaterThan(0)

  const action = data.find((f: any) => f.name === 'Action')
  if (action?.enter_next_format) {
    const refFormat = data.find((f: any) => f.id === action.enter_next_format)
    expect(refFormat).toBeTruthy()
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// 4. Custom Preset CRUD
// ══════════════════════════════════════════════════════════════════════════════

let customPresetId: string

test('POST absatzformat-presets creates custom preset', async ({ request }) => {
  const res = await request.post(`${BASE}/api/absatzformat-presets`, hd({
    name: 'Playwright-Test-Preset',
    beschreibung: 'Automatisch generiert fuer Tests',
    formate: [
      { name: 'TestA', kuerzel: 'TA', kategorie: 'drehbuch', font_family: 'Courier', font_size: 12, enter_next: 'TestB' },
      { name: 'TestB', kuerzel: 'TB', kategorie: 'drehbuch', font_family: 'Courier', font_size: 12, enter_next: 'TestA' },
    ],
    erstellt_von: 'playwright',
  }))
  expect(res.status()).toBe(201)
  const data = await res.json()
  expect(data.name).toBe('Playwright-Test-Preset')
  expect(data.ist_system).toBe(false)
  expect(data.formate.length).toBe(2)
  customPresetId = data.id
})

test('POST duplicate preset name returns 409', async ({ request }) => {
  const res = await request.post(`${BASE}/api/absatzformat-presets`, hd({
    name: 'Playwright-Test-Preset', formate: []
  }))
  expect(res.status()).toBe(409)
})

test('DELETE absatzformat-presets deletes custom preset', async ({ request }) => {
  test.skip(!customPresetId, 'No custom preset')
  const res = await request.delete(`${BASE}/api/absatzformat-presets/${customPresetId}`, h())
  expect(res.status()).toBe(204)
})

test('DELETE system preset returns 404 (cannot delete)', async ({ request }) => {
  test.skip(!presetId, 'No preset')
  const res = await request.delete(`${BASE}/api/absatzformat-presets/${presetId}`, h())
  expect(res.status()).toBe(404)
})

// ══════════════════════════════════════════════════════════════════════════════
// 5. Edge Cases / Validation
// ══════════════════════════════════════════════════════════════════════════════

test('POST without name returns 400', async ({ request }) => {
  const res = await request.post(
    `${BASE}/api/produktionen/${produktionId}/absatzformate`,
    hd({ kuerzel: 'X' })
  )
  expect(res.status()).toBe(400)
})

test('POST from-preset with invalid preset_id returns 404', async ({ request }) => {
  const res = await request.post(
    `${BASE}/api/produktionen/${produktionId}/absatzformate/from-preset`,
    hd({ preset_id: '00000000-0000-0000-0000-000000000000' })
  )
  expect(res.status()).toBe(404)
})

test('PUT non-existent format returns 404', async ({ request }) => {
  const res = await request.put(
    `${BASE}/api/produktionen/${produktionId}/absatzformate/00000000-0000-0000-0000-000000000000`,
    hd({ name: 'Ghost' })
  )
  expect(res.status()).toBe(404)
})

test('DELETE non-existent format returns 404', async ({ request }) => {
  const res = await request.delete(
    `${BASE}/api/produktionen/${produktionId}/absatzformate/00000000-0000-0000-0000-000000000000`, h()
  )
  expect(res.status()).toBe(404)
})
