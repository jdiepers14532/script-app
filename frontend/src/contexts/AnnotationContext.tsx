// AnnotationContext — Daten + CRUD für die Anmerkungen EINER Szene (werkstufeId, sceneIdentityId),
// plus die activeAnmerkungId-Brücke zwischen Editor-Decorations und AnnotationPanel (Handoff 2 §6).
// Scoped pro EditorPanel; lädt bei Szenen-/Werkstufen-Wechsel neu.
import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react'
import type { DecoAnker, Selektor } from '../utils/anchorResolve'

export interface AnmerkungAnker {
  id: string
  werkstufe_id: string | null
  scene_identity_id: string | null
  store: 'content' | 'kopffeld' | null
  node_id: string | null
  feldname: string | null
  selektor: Selektor | null
  anker_status: string
  konfidenz: number | null
  position: { start: number; end: number } | null
}
export interface AnmerkungData {
  id: string
  anker_id: string
  quelle: string
  kategorie: string | null
  status: 'offen' | 'in_arbeit' | 'uebernommen' | 'abgelehnt'
  body: any
  erstellt_von: string
  erstellt_am: string
  aufgeloest_von: string | null
  aufgeloest_am: string | null
  aufloesung: string | null
}
export interface AnmerkungItem { anmerkung: AnmerkungData; anker: AnmerkungAnker }

interface Me { user_id: string; roles: string[] }

interface AnnotationCtx {
  items: AnmerkungItem[]
  loading: boolean
  me: Me | null
  istAutor: boolean
  canResolve: boolean       // istAutor && Werkstufe editierbar
  activeAnmerkungId: string | null
  setActiveAnmerkungId: (id: string | null) => void
  decoAnker: DecoAnker[]     // content-Anker der Szene (für Editor-Decorations)
  kopffeldItems: (feldname: string) => AnmerkungItem[]
  reload: () => void
  createContent: (p: { node_id: string | null; selektor: Selektor; quelle: string; kategorie?: string; body: any }) => Promise<void>
  createKopffeld: (p: { feldname: string; quelle: string; kategorie?: string; body: any }) => Promise<void>
  patchStatus: (id: string, status: string, aufloesung?: string) => Promise<void>
  addKommentar: (id: string, body: any) => Promise<void>
  getKommentare: (id: string) => Promise<any[]>
  addTags: (id: string, userIds: string[]) => Promise<void>
  getTaggbareUser: () => Promise<{ id: string; name: string }[]>
}

const Ctx = createContext<AnnotationCtx | null>(null)
export function useAnnotations() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAnnotations must be used within AnnotationProvider')
  return c
}
// Optionaler Zugriff: null außerhalb eines Providers (z.B. UniversalEditor ohne Anmerkungen).
export function useAnnotationsOptional() {
  return useContext(Ctx)
}

async function jfetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, {
    credentials: 'include',
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts?.headers ?? {}) },
  })
  if (!res.ok) throw new Error(`${res.status}`)
  const txt = await res.text()
  return txt ? JSON.parse(txt) : null
}

export function AnnotationProvider({
  werkstufeId, sceneIdentityId, canEdit, children,
}: {
  werkstufeId: string | null
  sceneIdentityId: string | null
  canEdit: boolean
  children: ReactNode
}) {
  const [items, setItems] = useState<AnmerkungItem[]>([])
  const [loading, setLoading] = useState(false)
  const [me, setMe] = useState<Me | null>(null)
  const [activeAnmerkungId, setActiveAnmerkungId] = useState<string | null>(null)
  const taggbareCache = useRef<{ id: string; name: string }[] | null>(null)

  useEffect(() => {
    jfetch('/api/me/whoami')
      .then(d => setMe({ user_id: d.user_id, roles: d.roles ?? [] }))
      .catch(() => setMe(null))
  }, [])

  const reload = useCallback(() => {
    if (!werkstufeId) { setItems([]); return }
    setLoading(true)
    jfetch(`/api/anmerkungen?werkstufe_id=${encodeURIComponent(werkstufeId)}`)
      .then(d => {
        const all: AnmerkungItem[] = d?.items ?? []
        // Auf die aktuelle Szene filtern (Panel ist szenen-skopiert)
        setItems(sceneIdentityId
          ? all.filter(it => it.anker.scene_identity_id === sceneIdentityId)
          : all)
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [werkstufeId, sceneIdentityId])

  useEffect(() => { reload() }, [reload])
  // Szenenwechsel: aktive Karte zurücksetzen
  useEffect(() => { setActiveAnmerkungId(null) }, [sceneIdentityId, werkstufeId])

  // Cross-Komponenten-Sync: SceneEditor-Kopffeld-Anmerkungen leben außerhalb dieses Providers.
  // Ein window-Event hält Panel (hier) und Kopffeld-Badges in Sync (Mutationen feuern es).
  useEffect(() => {
    const onChanged = (e: Event) => {
      const wid = (e as CustomEvent).detail?.werkstufeId
      if (!wid || wid === werkstufeId) reload()
    }
    window.addEventListener('sw-anmerkungen-changed', onChanged)
    return () => window.removeEventListener('sw-anmerkungen-changed', onChanged)
  }, [werkstufeId, reload])

  const istAutor = (me?.roles?.length ?? 0) > 0
  const canResolve = istAutor && canEdit

  const decoAnker: DecoAnker[] = useMemo(() => items
    .filter(it => it.anker.store === 'content')
    .map(it => ({
      anmerkung_id: it.anmerkung.id,
      store: it.anker.store,
      node_id: it.anker.node_id,
      feldname: it.anker.feldname,
      selektor: it.anker.selektor,
      status: it.anmerkung.status,
      quelle: it.anmerkung.quelle,
    })), [items])

  const kopffeldItems = useCallback((feldname: string) =>
    items.filter(it => it.anker.store === 'kopffeld' && it.anker.feldname === feldname), [items])

  const notifyChanged = useCallback(() => {
    window.dispatchEvent(new CustomEvent('sw-anmerkungen-changed', { detail: { werkstufeId } }))
  }, [werkstufeId])

  const createContent = useCallback(async (p: { node_id: string | null; selektor: Selektor; quelle: string; kategorie?: string; body: any }) => {
    if (!werkstufeId || !sceneIdentityId) return
    // Weg B: scene_identity_id ist der Pflicht-Scope (aus dem Provider); node_id optionaler Hinweis,
    // block_index lebt im selektor.
    await jfetch('/api/anmerkungen', {
      method: 'POST',
      body: JSON.stringify({
        werkstufe_id: werkstufeId, scene_identity_id: sceneIdentityId,
        store: 'content', node_id: p.node_id ?? null, selektor: p.selektor,
        quelle: p.quelle, kategorie: p.kategorie, body: p.body,
      }),
    })
    notifyChanged()
  }, [werkstufeId, sceneIdentityId, notifyChanged])

  const createKopffeld = useCallback(async (p: { feldname: string; quelle: string; kategorie?: string; body: any }) => {
    if (!werkstufeId || !sceneIdentityId) return
    await jfetch('/api/anmerkungen', {
      method: 'POST',
      body: JSON.stringify({
        werkstufe_id: werkstufeId, scene_identity_id: sceneIdentityId,
        store: 'kopffeld', feldname: p.feldname,
        quelle: p.quelle, kategorie: p.kategorie, body: p.body,
      }),
    })
    notifyChanged()
  }, [werkstufeId, sceneIdentityId, notifyChanged])

  const patchStatus = useCallback(async (id: string, status: string, aufloesung?: string) => {
    await jfetch(`/api/anmerkungen/${id}/status`, {
      method: 'PATCH', body: JSON.stringify({ status, aufloesung }),
    })
    notifyChanged()
  }, [notifyChanged])

  const addKommentar = useCallback(async (id: string, body: any) => {
    await jfetch(`/api/anmerkungen/${id}/kommentare`, { method: 'POST', body: JSON.stringify({ body }) })
  }, [])

  const getKommentare = useCallback(async (id: string) =>
    jfetch(`/api/anmerkungen/${id}/kommentare`).catch(() => []), [])

  const addTags = useCallback(async (id: string, userIds: string[]) => {
    await jfetch(`/api/anmerkungen/${id}/tags`, { method: 'POST', body: JSON.stringify({ user_ids: userIds }) })
  }, [])

  const getTaggbareUser = useCallback(async () => {
    if (taggbareCache.current) return taggbareCache.current
    const list = await jfetch('/api/anmerkungen/taggbare-user').catch(() => [])
    taggbareCache.current = list ?? []
    return taggbareCache.current!
  }, [])

  const value: AnnotationCtx = {
    items, loading, me, istAutor, canResolve,
    activeAnmerkungId, setActiveAnmerkungId, decoAnker, kopffeldItems,
    reload, createContent, createKopffeld, patchStatus, addKommentar, getKommentare, addTags, getTaggbareUser,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
