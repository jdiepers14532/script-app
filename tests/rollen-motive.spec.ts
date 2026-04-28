import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL || 'https://script.serienwerft.studio'
const STAFFEL_ID = 'd26dff66-57cf-4b32-9649-4009618fce4d'

test.describe('Rollen / Komparsen / Motive (v27)', () => {

  // ── Nav-Menü ────────────────────────────────────────────────────────────────

  test('App liefert 200 und hat root-div', async ({ request }) => {
    const res = await request.get(`${BASE}/`)
    expect(res.status()).toBe(200)
    expect(await res.text()).toContain('<div id="root">')
  })

  // ── Motive API ───────────────────────────────────────────────────────────────

  test('Motiv anlegen + abrufen + löschen', async ({ request }) => {
    const create = await request.post(`${BASE}/api/staffeln/${STAFFEL_ID}/motive`, {
      data: { name: 'Test-Motiv-Playwright', motiv_nummer: '99T', typ: 'interior' },
    })
    expect(create.status()).toBe(201)
    const motiv = await create.json()
    expect(motiv.id).toBeTruthy()
    expect(motiv.name).toBe('Test-Motiv-Playwright')

    // GET list
    const list = await request.get(`${BASE}/api/staffeln/${STAFFEL_ID}/motive`)
    expect(list.status()).toBe(200)
    const motive = await list.json()
    expect(motive.some((m: any) => m.id === motiv.id)).toBe(true)

    // DELETE
    const del = await request.delete(`${BASE}/api/motive/${motiv.id}`)
    expect(del.status()).toBe(200)

    // Confirm gone
    const list2 = await request.get(`${BASE}/api/staffeln/${STAFFEL_ID}/motive`)
    const motive2 = await list2.json()
    expect(motive2.some((m: any) => m.id === motiv.id)).toBe(false)
  })

  test('Motiv aktualisieren', async ({ request }) => {
    const create = await request.post(`${BASE}/api/staffeln/${STAFFEL_ID}/motive`, {
      data: { name: 'Motiv Update Test', typ: 'interior' },
    })
    const motiv = await create.json()

    const update = await request.put(`${BASE}/api/motive/${motiv.id}`, {
      data: { typ: 'exterior' },
    })
    expect(update.status()).toBe(200)
    const updated = await update.json()
    expect(updated.typ).toBe('exterior')

    await request.delete(`${BASE}/api/motive/${motiv.id}`)
  })

  // ── Charakter-Felder API ─────────────────────────────────────────────────────

  test('Charakter-Felder auto-init + CRUD', async ({ request }) => {
    // GET triggers auto-init
    const list = await request.get(`${BASE}/api/staffeln/${STAFFEL_ID}/charakter-felder`)
    expect(list.status()).toBe(200)
    const felder = await list.json()
    expect(Array.isArray(felder)).toBe(true)

    // POST neues Feld
    const create = await request.post(`${BASE}/api/staffeln/${STAFFEL_ID}/charakter-felder`, {
      data: { name: 'Playwright-Testfeld', typ: 'text', gilt_fuer: 'alle' },
    })
    expect(create.status()).toBe(201)
    const feld = await create.json()
    expect(feld.id).toBeTruthy()
    expect(feld.name).toBe('Playwright-Testfeld')

    // PUT
    const upd = await request.put(`${BASE}/api/staffeln/${STAFFEL_ID}/charakter-felder/${feld.id}`, {
      data: { name: 'Playwright-Testfeld-Renamed' },
    })
    expect(upd.status()).toBe(200)
    expect((await upd.json()).name).toBe('Playwright-Testfeld-Renamed')

    // DELETE
    const del = await request.delete(`${BASE}/api/staffeln/${STAFFEL_ID}/charakter-felder/${feld.id}`)
    expect(del.status()).toBe(200)
  })

  test('Select-Feld mit Optionen', async ({ request }) => {
    const create = await request.post(`${BASE}/api/staffeln/${STAFFEL_ID}/charakter-felder`, {
      data: { name: 'Status-Select-Playwright', typ: 'select', optionen: ['aktiv', 'geplant', 'abgedreht'], gilt_fuer: 'rolle' },
    })
    expect(create.status()).toBe(201)
    const feld = await create.json()
    const optionen = typeof feld.optionen === 'string' ? JSON.parse(feld.optionen) : feld.optionen
    expect(optionen).toContain('aktiv')

    await request.delete(`${BASE}/api/staffeln/${STAFFEL_ID}/charakter-felder/${feld.id}`)
  })

  // ── Charakter-Fotos API ──────────────────────────────────────────────────────

  test('Charakter erstellen + Foto-Liste abrufbar', async ({ request }) => {
    const charCreate = await request.post(`${BASE}/api/characters`, {
      data: { name: 'Playwright-Foto-Test', staffel_id: STAFFEL_ID },
    })
    expect(charCreate.status()).toBe(201)
    const char = await charCreate.json()

    // Foto-Liste (leer)
    const fotos = await request.get(`${BASE}/api/characters/${char.id}/fotos`)
    expect(fotos.status()).toBe(200)
    expect(await fotos.json()).toEqual([])

    await request.delete(`${BASE}/api/characters/${char.id}`)
  })

  // ── Beziehungen API ──────────────────────────────────────────────────────────

  test('Beziehung zwischen Charakteren anlegen + löschen', async ({ request }) => {
    const c1 = await (await request.post(`${BASE}/api/characters`, {
      data: { name: 'Beziehung-A-Playwright', staffel_id: STAFFEL_ID },
    })).json()
    const c2 = await (await request.post(`${BASE}/api/characters`, {
      data: { name: 'Beziehung-B-Playwright', staffel_id: STAFFEL_ID },
    })).json()

    const rel = await request.post(`${BASE}/api/characters/${c1.id}/beziehungen`, {
      data: { related_character_id: c2.id, beziehungstyp: 'partner' },
    })
    expect(rel.status()).toBe(201)
    const relData = await rel.json()

    // GET
    const list = await request.get(`${BASE}/api/characters/${c1.id}/beziehungen`)
    expect(list.status()).toBe(200)
    const beziehungen = await list.json()
    expect(beziehungen.some((b: any) => b.related_id === c2.id)).toBe(true)

    // DELETE
    const delRel = await request.delete(`${BASE}/api/characters/${c1.id}/beziehungen/${relData.id}`)
    expect(delRel.status()).toBe(200)

    await request.delete(`${BASE}/api/characters/${c1.id}`)
    await request.delete(`${BASE}/api/characters/${c2.id}`)
  })

  // ── Feldwerte API ────────────────────────────────────────────────────────────

  test('Feldwert setzen + abrufen', async ({ request }) => {
    // Create a feld
    const feld = await (await request.post(`${BASE}/api/staffeln/${STAFFEL_ID}/charakter-felder`, {
      data: { name: 'Feldwert-Test-Playwright', typ: 'text', gilt_fuer: 'alle' },
    })).json()

    // Create a character
    const char = await (await request.post(`${BASE}/api/characters`, {
      data: { name: 'Feldwert-Char-Playwright', staffel_id: STAFFEL_ID },
    })).json()

    // Set value
    const set = await request.put(`${BASE}/api/characters/${char.id}/feldwerte/${feld.id}`, {
      data: { wert_text: 'Testeintrag Playwright' },
    })
    expect(set.status()).toBe(200)

    // Get values
    const values = await request.get(`${BASE}/api/characters/${char.id}/feldwerte`)
    expect(values.status()).toBe(200)
    const vals = await values.json()
    const found = vals.find((v: any) => v.feld_id === feld.id)
    expect(found?.wert_text).toBe('Testeintrag Playwright')

    // Cleanup
    await request.delete(`${BASE}/api/characters/${char.id}`)
    await request.delete(`${BASE}/api/staffeln/${STAFFEL_ID}/charakter-felder/${feld.id}`)
  })

  // ── Motiv-Feldwerte API ──────────────────────────────────────────────────────

  test('Motiv-Feldwert setzen + abrufen', async ({ request }) => {
    const feld = await (await request.post(`${BASE}/api/staffeln/${STAFFEL_ID}/charakter-felder`, {
      data: { name: 'Motiv-Feldwert-PW', typ: 'text', gilt_fuer: 'motiv' },
    })).json()

    const motiv = await (await request.post(`${BASE}/api/staffeln/${STAFFEL_ID}/motive`, {
      data: { name: 'Feldwert-Motiv-PW' },
    })).json()

    const set = await request.put(`${BASE}/api/motive/${motiv.id}/feldwerte/${feld.id}`, {
      data: { wert_text: 'Motiv-Wert' },
    })
    expect(set.status()).toBe(200)

    const values = await request.get(`${BASE}/api/motive/${motiv.id}/feldwerte`)
    expect(values.status()).toBe(200)
    const vals = await values.json()
    expect(vals.find((v: any) => v.feld_id === feld.id)?.wert_text).toBe('Motiv-Wert')

    await request.delete(`${BASE}/api/motive/${motiv.id}`)
    await request.delete(`${BASE}/api/staffeln/${STAFFEL_ID}/charakter-felder/${feld.id}`)
  })

  // ── app_settings figuren_label ───────────────────────────────────────────────

  test('figuren_label in app-settings vorhanden', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/app-settings`)
    expect(res.status()).toBe(200)
    const settings = await res.json()
    expect(settings).toHaveProperty('figuren_label')
  })

})
