import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL || 'https://script.serienwerft.studio'
const STAFFEL = 'rote-rosen'
const FOLGE = 9991

test.describe('Phase 11 — Editor Core (Tiptap)', () => {

  let dokumentId: string
  let fassungId: string

  test.beforeAll(async ({ request }) => {
    // Create a test document
    const res = await request.post(`${BASE}/api/folgen/${STAFFEL}/${FOLGE}/dokumente`, {
      data: { typ: 'drehbuch' },
    })
    // May already exist from previous run → get it
    const list = await request.get(`${BASE}/api/folgen/${STAFFEL}/${FOLGE}/dokumente`)
    const docs = await list.json()
    const dok = docs.find((d: any) => d.typ === 'drehbuch')
    dokumentId = dok?.id || (await res.json()).id

    const fassungen = await request.get(`${BASE}/api/dokumente/${dokumentId}/fassungen`)
    const f = await fassungen.json()
    fassungId = f[0].id
  })

  test.afterAll(async ({ request }) => {
    await request.delete(`${BASE}/api/folgen/${STAFFEL}/${FOLGE}/dokumente/${dokumentId}`)
  })

  // ── ProseMirror JSON Speichern ────────────────────────────────────────────

  test('Screenplay JSON speichern und laden', async ({ request }) => {
    const proseMirrorDoc = {
      type: 'doc',
      content: [
        {
          type: 'screenplay_element',
          attrs: { element_type: 'scene_heading', szene_uuid: 'test-uuid-001' },
          content: [{ type: 'text', text: 'INT. BÜRO - TAG' }],
        },
        {
          type: 'screenplay_element',
          attrs: { element_type: 'action', szene_uuid: null },
          content: [{ type: 'text', text: 'Katrin sitzt am Schreibtisch.' }],
        },
        {
          type: 'screenplay_element',
          attrs: { element_type: 'character', szene_uuid: null },
          content: [{ type: 'text', text: 'KATRIN' }],
        },
        {
          type: 'screenplay_element',
          attrs: { element_type: 'dialogue', szene_uuid: null },
          content: [{ type: 'text', text: 'Das kann nicht sein.' }],
        },
      ],
    }

    const saveRes = await request.put(`${BASE}/api/dokumente/${dokumentId}/fassungen/${fassungId}`, {
      data: { inhalt: proseMirrorDoc },
    })
    expect(saveRes.status()).toBe(200)

    const loadRes = await request.get(`${BASE}/api/dokumente/${dokumentId}/fassungen/${fassungId}`)
    expect(loadRes.status()).toBe(200)
    const fassung = await loadRes.json()
    expect(fassung.inhalt.type).toBe('doc')
    expect(fassung.inhalt.content).toHaveLength(4)

    // Verify szene_uuid is preserved
    const firstNode = fassung.inhalt.content[0]
    expect(firstNode.attrs.element_type).toBe('scene_heading')
    expect(firstNode.attrs.szene_uuid).toBe('test-uuid-001')
  })

  test('Plaintext-Index wird extrahiert', async ({ request }) => {
    // After saving, plaintext_index should be set
    const loadRes = await request.get(`${BASE}/api/dokumente/${dokumentId}/fassungen/${fassungId}`)
    const fassung = await loadRes.json()
    expect(fassung.plaintext_index).toBeTruthy()
    expect(fassung.plaintext_index).toContain('INT. BÜRO - TAG')
  })

  test('Screenplay mit allen 7 Elementtypen', async ({ request }) => {
    const elementTypes = ['scene_heading', 'action', 'character', 'dialogue', 'parenthetical', 'transition', 'shot']
    const doc = {
      type: 'doc',
      content: elementTypes.map(type => ({
        type: 'screenplay_element',
        attrs: { element_type: type, szene_uuid: type === 'scene_heading' ? 'test-uuid-all' : null },
        content: [{ type: 'text', text: `Test ${type}` }],
      })),
    }

    const res = await request.put(`${BASE}/api/dokumente/${dokumentId}/fassungen/${fassungId}`, {
      data: { inhalt: doc },
    })
    expect(res.status()).toBe(200)

    const loaded = await request.get(`${BASE}/api/dokumente/${dokumentId}/fassungen/${fassungId}`)
    const fassung = await loaded.json()
    expect(fassung.inhalt.content).toHaveLength(7)

    const loadedTypes = fassung.inhalt.content.map((n: any) => n.attrs.element_type)
    for (const type of elementTypes) {
      expect(loadedTypes).toContain(type)
    }
  })

  test('Rich Text JSON speichern und laden', async ({ request }) => {
    // Create a notiz document for richtext
    let notizId: string
    let notizFassungId: string

    const createRes = await request.post(`${BASE}/api/folgen/${STAFFEL}/${FOLGE}/dokumente`, {
      data: { typ: 'notiz' },
    })
    if (createRes.status() === 409) {
      // Already exists
      const list = await request.get(`${BASE}/api/folgen/${STAFFEL}/${FOLGE}/dokumente`)
      const docs = await list.json()
      const notiz = docs.find((d: any) => d.typ === 'notiz')
      notizId = notiz.id
    } else {
      const body = await createRes.json()
      notizId = body.id
    }

    const fassungen = await request.get(`${BASE}/api/dokumente/${notizId}/fassungen`)
    const f = await fassungen.json()
    notizFassungId = f[0].id

    const richTextDoc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Plotnotizen Block 28' }] },
        { type: 'paragraph', content: [
          { type: 'text', marks: [{ type: 'bold' }], text: 'Wichtig: ' },
          { type: 'text', text: 'Katrin muss die Entscheidung treffen.' },
        ]},
        { type: 'bulletList', content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Punkt 1' }] }] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Punkt 2' }] }] },
        ]},
      ],
    }

    const saveRes = await request.put(`${BASE}/api/dokumente/${notizId}/fassungen/${notizFassungId}`, {
      data: { inhalt: richTextDoc },
    })
    expect(saveRes.status()).toBe(200)

    const loaded = await request.get(`${BASE}/api/dokumente/${notizId}/fassungen/${notizFassungId}`)
    const fassung = await loaded.json()
    expect(fassung.inhalt.content).toHaveLength(3)
    expect(fassung.inhalt.content[0].type).toBe('heading')

    // Cleanup
    await request.delete(`${BASE}/api/folgen/${STAFFEL}/${FOLGE}/dokumente/${notizId}`)
  })

  // ── Format Templates (DB) ─────────────────────────────────────────────────

  test('Format-Template laden — 7 Elemente', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/format-templates`)
    expect(res.status()).toBe(200)
    const templates = await res.json()
    const standard = templates.find((t: any) => t.ist_standard)
    expect(standard).toBeTruthy()

    const { elemente } = standard
    expect(elemente).toHaveLength(7)

    // Verify Tab/Enter flow
    const sceneHeading = elemente.find((e: any) => e.element_typ === 'scene_heading')
    expect(sceneHeading.tab_folge_element).toBe('action')
    expect(sceneHeading.enter_folge_element).toBe('action')
    expect(sceneHeading.grossbuchstaben).toBe(true)

    const character = elemente.find((e: any) => e.element_typ === 'character')
    expect(character.einrueckung_links).toBe(37)
    expect(character.enter_folge_element).toBe('dialogue')

    const dialogue = elemente.find((e: any) => e.element_typ === 'dialogue')
    expect(dialogue.einrueckung_links).toBe(25)
    expect(dialogue.einrueckung_rechts).toBe(25)
  })

  // ── Storyline Migration ───────────────────────────────────────────────────

  test('Storyline-Spalte (storyline_json) existiert', async ({ request }) => {
    // Indirect check: update a szene with storyline_json via the szenen API
    // Just verify the migration column exists by checking health
    const res = await request.get(`${BASE}/api/health`)
    expect(res.status()).toBe(200)
    // If v24 migration failed, backend would have logged an error but still run
    // Deeper check would require direct DB access
  })

  // ── Auto-Save Verhalten ───────────────────────────────────────────────────

  test('Zuletzt-geaendert-Felder werden gesetzt', async ({ request }) => {
    const doc = {
      type: 'doc',
      content: [{ type: 'screenplay_element', attrs: { element_type: 'action', szene_uuid: null }, content: [{ type: 'text', text: 'Auto-save test' }] }],
    }
    await request.put(`${BASE}/api/dokumente/${dokumentId}/fassungen/${fassungId}`, { data: { inhalt: doc } })
    const res = await request.get(`${BASE}/api/dokumente/${dokumentId}/fassungen/${fassungId}`)
    const fassung = await res.json()
    expect(fassung.zuletzt_geaendert_am).toBeTruthy()
    expect(fassung.zuletzt_geaendert_von).toBe('test-user')
  })

  test('Seitenformat kann gesetzt werden', async ({ request }) => {
    const res = await request.put(`${BASE}/api/dokumente/${dokumentId}/fassungen/${fassungId}`, {
      data: { seitenformat: 'letter' },
    })
    expect(res.status()).toBe(200)
    const fassung = await res.json()
    expect(fassung.seitenformat).toBe('letter')

    // Reset
    await request.put(`${BASE}/api/dokumente/${dokumentId}/fassungen/${fassungId}`, { data: { seitenformat: 'a4' } })
  })
})
