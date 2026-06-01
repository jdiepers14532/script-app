const BASE = '/api'

// ── GET cache (TTL 2min) for preloading scenes ───────────────────────────────
const getCache = new Map<string, { data: any; ts: number }>()
const CACHE_TTL = 120_000

function getCached<T>(path: string): T | undefined {
  const entry = getCache.get(path)
  if (!entry) return undefined
  if (Date.now() - entry.ts > CACHE_TTL) { getCache.delete(path); return undefined }
  return entry.data as T
}

function setCache(path: string, data: any) {
  getCache.set(path, { data, ts: Date.now() })
  // Evict old entries periodically
  if (getCache.size > 600) {
    const now = Date.now()
    for (const [k, v] of getCache) { if (now - v.ts > CACHE_TTL) getCache.delete(k) }
  }
}

// Deduplication: if the same GET request is already in-flight, reuse it
const inflightGets = new Map<string, Promise<any>>()

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  // For GET: check cache first, then deduplicate
  if (method === 'GET') {
    const cached = getCached<T>(path)
    if (cached !== undefined) return cached
    const existing = inflightGets.get(path)
    if (existing) return existing as Promise<T>
    const p = doRequest<T>(method, path, body)
      .then(data => { setCache(path, data); return data })
      .finally(() => inflightGets.delete(path))
    inflightGets.set(path, p)
    return p
  }
  // Mutations invalidate related cache entries
  invalidateCache(path)
  return doRequest<T>(method, path, body)
}

function invalidateCache(path: string) {
  // Invalidate exact path and parent paths (e.g. PUT /dokument-szenen/X invalidates GET /dokument-szenen/X)
  getCache.delete(path)
  // Also invalidate related sub-resources
  for (const key of getCache.keys()) {
    if (key.startsWith(path) || path.startsWith(key)) getCache.delete(key)
  }
}

/** Force-clear all cache entries whose path starts with the given prefix. */
export function clearCacheByPrefix(prefix: string) {
  for (const key of getCache.keys()) {
    if (key.startsWith(prefix)) getCache.delete(key)
  }
}

/** Synchronously return cached data for a path if it exists and is fresh. */
export function peekCache<T>(path: string): T | undefined {
  return getCached<T>(path)
}

export class ApiError extends Error {
  status: number
  data: any
  constructor(status: number, data: any) {
    super(data?.error || `HTTP ${status}`)
    this.status = status
    this.data = data
  }
}

async function doRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401) {
    const redirectUrl = window.location.href
    sessionStorage.setItem('auth_redirect_after_login', redirectUrl)
    window.location.href = `https://auth.serienwerft.studio/?redirect=${encodeURIComponent(redirectUrl)}`
    return new Promise(() => {}) // halt execution while redirecting
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: res.statusText }))
    throw new ApiError(res.status, data)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export const api = {
  // Produktionen
  getProduktion: (id: string) => request<any>('GET', `/produktionen/${id}`),

  // Blöcke — live from ProdDB, returns { proddb_id, block_nummer, folge_von, folge_bis, ... }
  getBloecke: (produktionId: string) => request<any[]>('GET', `/produktionen/${produktionId}/bloecke`),

  // Folgen metadata (arbeitstitel, synopsis, air_date)
  getFolge: (produktionId: string, folgeNummer: number) =>
    request<any>('GET', `/folgen/${produktionId}/${folgeNummer}`),
  updateFolge: (produktionId: string, folgeNummer: number, data: any) =>
    request<any>('PUT', `/folgen/${produktionId}/${folgeNummer}`, data),
  getSendedatum: (produktionId: string, folgeNummer: number) =>
    request<{ datum: string; ist_ki_prognose: boolean } | null>('GET', `/folgen/${produktionId}/${folgeNummer}/sendedatum`),

  // Dokument-Szenen
  getFassungsSzenen: (fassungId: string) =>
    request<any[]>('GET', `/fassungen/${fassungId}/szenen`),
  getDokumentSzene: (id: string) => request<any>('GET', `/dokument-szenen/${id}`),
  getDokumentSzeneNav: (id: string) => request<{ szene_id: string; scene_identity_id: string; produktion_id: string; folge_nummer: number }>('GET', `/dokument-szenen/${id}/nav`),
  resolveDokumentSzene: (werkstufId: string, sceneIdentityId: string) =>
    request<any>('GET', `/dokument-szenen/resolve?werkstufe_id=${encodeURIComponent(werkstufId)}&scene_identity_id=${encodeURIComponent(sceneIdentityId)}`),
  updateDokumentSzene: (id: string, data: any) => request<any>('PUT', `/dokument-szenen/${id}`, data),
  deleteDokumentSzene: (id: string) => request<void>('DELETE', `/dokument-szenen/${id}`),
  bulkDeleteDokumentSzenen: (ids: string[]) => request<void>('DELETE', '/dokument-szenen/bulk', { ids }),
  createDokumentSzene: (fassungId: string, data: any) =>
    request<any>('POST', `/fassungen/${fassungId}/szenen`, data),
  reorderDokumentSzenen: (fassungId: string, order: string[]) =>
    request<any[]>('PATCH', `/fassungen/${fassungId}/szenen/reorder`, { order }),
  renumberDokumentSzenen: (fassungId: string) =>
    request<{ scenes: any[]; renumbered: boolean }>('POST', `/fassungen/${fassungId}/szenen/renumber`),
  getSceneIdentityHistory: (id: string) => request<any[]>('GET', `/scene-identities/${id}/history`),
  diffFassungen: (leftId: string, rightId: string) =>
    request<any>('GET', `/fassungen/${leftId}/szenen/diff/${rightId}`),
  getDokumentSzeneRevisionen: (id: string) => request<any[]>('GET', `/dokument-szenen/${id}/revisionen`),
  // Snapshots
  getSnapshots: (szeneId: string) => request<any[]>('GET', `/dokument-szenen/${szeneId}/snapshots`),
  getSnapshot: (szeneId: string, snapId: number) => request<any>('GET', `/dokument-szenen/${szeneId}/snapshots/${snapId}`),
  createSnapshot: (szeneId: string, payload: { content: any; szene_nummer?: string | null; szene_info?: string | null; text_preview?: string | null }) =>
    request<any>('POST', `/dokument-szenen/${szeneId}/snapshots`, payload),
  restoreSnapshot: (szeneId: string, snapId: number) => request<any>('POST', `/dokument-szenen/${szeneId}/snapshots/${snapId}/restore`),
  // Werkstufen-Dokument-Snapshots
  getWerkstufenSnapshots: (werkId: string) => request<any[]>('GET', `/werkstufen/${werkId}/snapshots`),
  createWerkstufenSnapshot: (werkId: string, typ: 'auto' | 'manual' | 'restore') =>
    request<any>('POST', `/werkstufen/${werkId}/snapshots`, { typ }),
  getWerkstufenSnapshot: (werkId: string, snapId: number) => request<any>('GET', `/werkstufen/${werkId}/snapshots/${snapId}`),
  restoreWerkstufenSnapshot: (werkId: string, snapId: number) =>
    request<any>('POST', `/werkstufen/${werkId}/snapshots/${snapId}/restore`),
  createDokumentSzeneRevision: (id: string, data: any) => request<any>('POST', `/dokument-szenen/${id}/revisionen`, data),
  getSceneIdentityCharacters: (id: string) => request<any[]>('GET', `/scene-identities/${id}/characters`),
  addSceneIdentityCharacter: (id: string, data: any) => request<any>('POST', `/scene-identities/${id}/characters`, data),
  removeSceneIdentityCharacter: (id: string, characterId: string) =>
    request<void>('DELETE', `/scene-identities/${id}/characters/${characterId}`),
  getSceneIdentityVorstopp: (id: string) => request<any>('GET', `/scene-identities/${id}/vorstopp`),
  addSceneIdentityVorstopp: (id: string, data: any) => request<any>('POST', `/scene-identities/${id}/vorstopp`, data),

  // Locks (keyed by produktionId + folgeNummer)
  getLock: (produktionId: string, folgeNummer: number) =>
    request<any>('GET', `/folgen/${produktionId}/${folgeNummer}/lock`),
  createLock: (produktionId: string, folgeNummer: number, opts?: { force?: boolean; begruendung?: string }) =>
    request<any>('POST', `/folgen/${produktionId}/${folgeNummer}/lock`, opts ?? {}),
  deleteLock: (produktionId: string, folgeNummer: number) =>
    request<void>('DELETE', `/folgen/${produktionId}/${folgeNummer}/lock`),
  takeoverLock: (produktionId: string, folgeNummer: number) =>
    request<any>('POST', `/folgen/${produktionId}/${folgeNummer}/lock/takeover`, {}),

  // Szenen (legacy — numeric IDs)
  getSzene: (id: number) => request<any>('GET', `/szenen/${id}`),
  updateSzene: (id: number, data: any) => request<any>('PUT', `/szenen/${id}`, data),
  getKommentare: (szeneId: number) => request<any[]>('GET', `/szenen/${szeneId}/kommentare`),
  getSceneAnnotations: (szeneId: number) => request<any[]>('GET', `/szenen/${szeneId}/annotations`),
  createSceneAnnotation: (szeneId: number, text: string) => request<any>('POST', `/szenen/${szeneId}/annotations`, { text }),
  getStage: (id: number) => request<any>('GET', `/stages/${id}`),

  // Szenen Versionen (legacy)
  getVersionen: (szeneId: number) => request<any[]>('GET', `/szenen/${szeneId}/versionen`),
  createVersion: (szeneId: number, data: any) => request<any>('POST', `/szenen/${szeneId}/versionen`, data),
  restoreVersion: (szeneId: number, versionId: number) =>
    request<any>('POST', `/szenen/${szeneId}/versionen/${versionId}/restore`, {}),

  // Entities
  getEntities: (params?: { produktion_id?: string; type?: string; q?: string }) => {
    const qs = params ? '?' + new URLSearchParams(params as any).toString() : ''
    return request<any[]>('GET', `/entities${qs}`)
  },
  createEntity: (data: any) => request<any>('POST', '/entities', data),
  updateEntity: (id: number, data: any) => request<any>('PUT', `/entities/${id}`, data),

  // Admin App-Settings (global)
  getAdminAppSettings: () => request<Record<string, string>>('GET', '/admin/app-settings'),
  updateAdminAppSetting: (key: string, value: string) =>
    request<any>('PUT', `/admin/app-settings/${encodeURIComponent(key)}`, { value }),

  // KI
  getKiSettings: () => request<any[]>('GET', '/admin/ki-settings'),
  updateKiSetting: (funktion: string, data: any) => request<any>('PUT', `/admin/ki-settings/${funktion}`, data),
  getKiProviders: () => request<any[]>('GET', '/admin/ki-providers'),
  updateKiProvider: (provider: string, data: any) => request<any>('PUT', `/admin/ki-providers/${provider}`, data),
  kiSceneSummary: (data: any) => request<any>('POST', '/ki/scene-summary', data),
  kiEntityDetect: (data: any) => request<any>('POST', '/ki/entity-detect', data),
  kiStyleCheck: (data: any) => request<any>('POST', '/ki/style-check', data),
  kiSynopsis: (data: any) => request<any>('POST', '/ki/synopsis', data),
  kiSynopsenCheck: (folge_id: number) => request<any>('GET', `/ki/synopsen/check?folge_id=${folge_id}`),
  kiSynopsenTitel: (folge_id: number) => request<any>('POST', '/ki/synopsen/titel', { folge_id }),
  kiSynopsenKurz: (folge_id: number) => request<any>('POST', '/ki/synopsen/kurz', { folge_id }),
  kiSynopsenLang: (folge_id: number) => request<any>('POST', '/ki/synopsen/lang', { folge_id }),
  kiSynopsenGeneriereAlle: (folge_id: number) => request<any>('POST', '/ki/synopsen/generiere-alle', { folge_id }),
  kiSynopsenTitelMehr: (folge_id: number, ausgeschlossene_titel: string[]) => request<any>('POST', '/ki/synopsen/titel-mehr', { folge_id, ausgeschlossene_titel }),
  getFolgenSynopsen: (folge_id: number | string) => request<any>('GET', `/v2/folgen/${folge_id}/synopsen`),
  saveFolgenSynopsen: (folge_id: number | string, data: { folgen_titel?: string | null; synopsis?: string | null; synopsis_300?: string | null; synopsis_kurzinhalt?: string | null; synopsis_presse?: string | null; synopsis_straenge?: string | null; synopsis_pressetext?: string | null; synopsis_lektor?: string | null; synopsis_deskriptoren?: string | null; synopsis_fsk?: string | null }) =>
    request<any>('PUT', `/v2/folgen/${folge_id}`, data),

  // User settings
  getSettings: () => request<any>('GET', '/me/settings'),
  updateSettings: (data: { selected_production_id?: string | null; ui_settings?: Record<string, any> }) =>
    request<any>('PUT', '/me/settings', data),


  // Import with metadata opt-in
  getOcrStatus: () => request<any>('GET', '/import/ocr-status'),
  importPreview: (file: File) => {
    const fd = new FormData(); fd.append('file', file)
    return fetch(`${BASE}/import/preview`, { method: 'POST', credentials: 'include', body: fd }).then(r => r.json())
  },
  importCommit: (file: File, params: {
    produktion_id: string; folge_nummer: number
    proddb_block_id?: string; stage_type?: string; save_metadata?: boolean
  }) => {
    const fd = new FormData(); fd.append('file', file)
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined) fd.append(k, String(v)) })
    return fetch(`${BASE}/import/commit`, { method: 'POST', credentials: 'include', body: fd }).then(r => r.json())
  },

  // Stage Labels
  getStageLabels: (produktionId: string) =>
    request<any[]>('GET', `/produktionen/${encodeURIComponent(produktionId)}/stage-labels`),
  createStageLabel: (produktionId: string, data: any) =>
    request<any>('POST', `/produktionen/${encodeURIComponent(produktionId)}/stage-labels`, data),
  updateStageLabel: (produktionId: string, labelId: number, data: any) =>
    request<any>('PUT', `/produktionen/${encodeURIComponent(produktionId)}/stage-labels/${labelId}`, data),
  deleteStageLabel: (produktionId: string, labelId: number) =>
    request<void>('DELETE', `/produktionen/${encodeURIComponent(produktionId)}/stage-labels/${labelId}`),
  reorderStageLabels: (produktionId: string, order: {id: number, sort_order: number}[]) =>
    request<any[]>('PATCH', `/produktionen/${encodeURIComponent(produktionId)}/stage-labels/reorder`, { order }),

  // Revision Colors
  getRevisionColors: (produktionId: string) =>
    request<any[]>('GET', `/produktionen/${encodeURIComponent(produktionId)}/revision-colors`),
  createRevisionColor: (produktionId: string, data: any) =>
    request<any>('POST', `/produktionen/${encodeURIComponent(produktionId)}/revision-colors`, data),
  updateRevisionColor: (produktionId: string, colorId: number, data: any) =>
    request<any>('PUT', `/produktionen/${encodeURIComponent(produktionId)}/revision-colors/${colorId}`, data),
  deleteRevisionColor: (produktionId: string, colorId: number) =>
    request<void>('DELETE', `/produktionen/${encodeURIComponent(produktionId)}/revision-colors/${colorId}`),
  reorderRevisionColors: (produktionId: string, order: {id: number, sort_order: number}[]) =>
    request<any[]>('PATCH', `/produktionen/${encodeURIComponent(produktionId)}/revision-colors/reorder`, { order }),
  revisionColorsWgaPreset: (produktionId: string) =>
    request<any[]>('POST', `/produktionen/${encodeURIComponent(produktionId)}/revision-colors/wga-preset`),

  // Globale Revisions-Farben-Presets
  getRevisionFarbenPresets: () =>
    request<any[]>('GET', `/revision-farben-presets`),
  createRevisionFarbenPreset: (data: { name: string; farben: { name: string; color: string }[] }) =>
    request<any>('POST', `/revision-farben-presets`, data),
  deleteRevisionFarbenPreset: (id: number) =>
    request<void>('DELETE', `/revision-farben-presets/${id}`),

  // Revision Einstellungen
  getRevisionEinstellungen: (produktionId: string) =>
    request<any>('GET', `/produktionen/${encodeURIComponent(produktionId)}/revision-einstellungen`),
  updateRevisionEinstellungen: (produktionId: string, data: any) =>
    request<any>('PUT', `/produktionen/${encodeURIComponent(produktionId)}/revision-einstellungen`, data),

  // Werkstufe Revision Tracking
  startRevision: (werkstufId: string, revisionColorId: number) =>
    request<any>('POST', `/werkstufen/${werkstufId}/start-revision`, { revision_color_id: revisionColorId }),
  stopRevision: (werkstufId: string) =>
    request<any>('DELETE', `/werkstufen/${werkstufId}/start-revision`),
  updateWerkstufe: (werkstufId: string, data: any) =>
    request<any>('PUT', `/werkstufen/${werkstufId}`, data),

  // Characters
  getCharacters: (produktionId: string) =>
    request<any[]>('GET', `/characters?produktion_id=${encodeURIComponent(produktionId)}`),
  createCharacter: (data: any) => request<any>('POST', '/characters', data),
  deleteCharacter: (id: string) => request<void>('DELETE', `/characters/${id}`),
  erneutAnfragen: (productionId: string, id: number, body: { notiz?: string }) =>
    request<{ ok: boolean; status: string }>('POST', `/rollen-freigabe/${productionId}/anfragen/${id}/erneut-anfragen`, body),
  updateCharacter: (id: string, data: any) => request<any>('PUT', `/characters/${id}`, data),
  getCharKategorien: (produktionId: string) =>
    request<any[]>('GET', `/produktionen/${encodeURIComponent(produktionId)}/character-kategorien`),
  createCharKategorie: (produktionId: string, data: any) =>
    request<any>('POST', `/produktionen/${encodeURIComponent(produktionId)}/character-kategorien`, data),
  updateCharKategorie: (produktionId: string, katId: number, data: any) =>
    request<any>('PUT', `/produktionen/${encodeURIComponent(produktionId)}/character-kategorien/${katId}`, data),
  deleteCharKategorie: (produktionId: string, katId: number) =>
    request<void>('DELETE', `/produktionen/${encodeURIComponent(produktionId)}/character-kategorien/${katId}`),
  reorderCharKategorien: (produktionId: string, order: {id: number, sort_order: number}[]) =>
    request<any[]>('PATCH', `/produktionen/${encodeURIComponent(produktionId)}/character-kategorien/reorder`, { order }),
  // Scene characters (legacy szene-based)
  getSceneCharacters: (szeneId: number) =>
    request<any[]>('GET', `/szenen/${szeneId}/characters`),
  addSceneCharacter: (szeneId: number, data: any) =>
    request<any>('POST', `/szenen/${szeneId}/characters`, data),
  updateSceneCharacter: (szeneId: number, characterId: string, data: any) =>
    request<any>('PUT', `/szenen/${szeneId}/characters/${characterId}`, data),
  removeSceneCharacter: (szeneId: number, characterId: string) =>
    request<void>('DELETE', `/szenen/${szeneId}/characters/${characterId}`),
  linkCharacterToProduction: (characterId: string, data: any) =>
    request<any>('POST', `/characters/${characterId}/productions`, data),

  // Revisionen (legacy szene-based)
  getSzeneRevisionen: (szeneId: number, stageId?: number) => {
    const qs = stageId ? `?stage_id=${stageId}` : ''
    return request<any[]>('GET', `/szenen/${szeneId}/revisionen${qs}`)
  },
  createSzeneRevision: (szeneId: number, data: any) =>
    request<any>('POST', `/szenen/${szeneId}/revisionen`, data),

  // Vorstopp (legacy szene-based)
  getVorstopp: (szeneId: number) =>
    request<any>('GET', `/szenen/${szeneId}/vorstopp`),
  addVorstopp: (szeneId: number, data: { stage: string; dauer_sekunden: number; methode?: string; user_name?: string }) =>
    request<any>('POST', `/szenen/${szeneId}/vorstopp`, data),
  deleteVorstopp: (szeneId: number, entryId: number) =>
    request<void>('DELETE', `/szenen/${szeneId}/vorstopp/${entryId}`),
  autoVorstopp: (szeneId: number) =>
    request<any>('POST', `/szenen/${szeneId}/vorstopp/auto`, {}),
  getVorstoppEinstellungen: (produktionId: string) =>
    request<any>('GET', `/produktionen/${encodeURIComponent(produktionId)}/vorstopp-einstellungen`),
  updateVorstoppEinstellungen: (produktionId: string, data: any) =>
    request<any>('PUT', `/produktionen/${encodeURIComponent(produktionId)}/vorstopp-einstellungen`, data),

  // Copy settings between produktionen
  copySettings: (produktionId: string, data: { source_produktion_id: string; sections: string[]; merge_mode?: boolean }) =>
    request<any>('POST', `/produktionen/${encodeURIComponent(produktionId)}/copy-settings`, data),

  copySettingsPreview: (produktionId: string, sourceId: string) =>
    request<any>('GET', `/produktionen/${encodeURIComponent(produktionId)}/copy-preview?source=${encodeURIComponent(sourceId)}`),

  // ── Dokument-Editor System ────────────────────────────────────────────────

  // Dokumente (one per type per Folge)
  getDokumente: (produktionId: string, folgeNummer: number) =>
    request<any[]>('GET', `/folgen/${encodeURIComponent(produktionId)}/${folgeNummer}/dokumente`),
  createDokument: (produktionId: string, folgeNummer: number, typ: string) =>
    request<any>('POST', `/folgen/${encodeURIComponent(produktionId)}/${folgeNummer}/dokumente`, { typ }),
  getDokument: (produktionId: string, folgeNummer: number, dokumentId: string) =>
    request<any>('GET', `/folgen/${encodeURIComponent(produktionId)}/${folgeNummer}/dokumente/${dokumentId}`),
  deleteDokument: (produktionId: string, folgeNummer: number, dokumentId: string) =>
    request<void>('DELETE', `/folgen/${encodeURIComponent(produktionId)}/${folgeNummer}/dokumente/${dokumentId}`),

  // Fassungen
  getFassungen: (dokumentId: string) =>
    request<any[]>('GET', `/dokumente/${dokumentId}/fassungen`),
  createFassung: (dokumentId: string, data: { fassung_label?: string; sichtbarkeit?: string; seitenformat?: string }) =>
    request<any>('POST', `/dokumente/${dokumentId}/fassungen`, data),
  getFassung: (dokumentId: string, fassungId: string) =>
    request<any>('GET', `/dokumente/${dokumentId}/fassungen/${fassungId}`),
  saveFassung: (dokumentId: string, fassungId: string, data: { inhalt?: any; fassung_label?: string; seitenformat?: string }) =>
    request<any>('PUT', `/dokumente/${dokumentId}/fassungen/${fassungId}`, data),
  abgabeFassung: (dokumentId: string, fassungId: string, erstelleNaechste?: boolean) =>
    request<any>('POST', `/dokumente/${dokumentId}/fassungen/${fassungId}/abgabe`, { erstelle_naechste: erstelleNaechste }),
  updateSichtbarkeit: (dokumentId: string, fassungId: string, data: { sichtbarkeit: string; colab_gruppe_id?: number; produktion_gruppe_id?: number }) =>
    request<any>('PUT', `/dokumente/${dokumentId}/fassungen/${fassungId}/sichtbarkeit`, data),

  // Autoren
  getAutoren: (dokumentId: string, fassungId: string) =>
    request<any[]>('GET', `/dokumente/${dokumentId}/fassungen/${fassungId}/autoren`),
  addAutor: (dokumentId: string, fassungId: string, data: { user_id: string; user_name?: string; rolle: 'autor' | 'reviewer'; cursor_farbe?: string }) =>
    request<any>('POST', `/dokumente/${dokumentId}/fassungen/${fassungId}/autoren`, data),
  removeAutor: (dokumentId: string, fassungId: string, userId: string) =>
    request<void>('DELETE', `/dokumente/${dokumentId}/fassungen/${fassungId}/autoren/${userId}`),

  // Annotationen
  getAnnotationen: (dokumentId: string, fassungId: string) =>
    request<any[]>('GET', `/dokumente/${dokumentId}/fassungen/${fassungId}/annotationen`),
  createAnnotation: (dokumentId: string, fassungId: string, data: { von_pos: number; bis_pos: number; text: string; typ?: string }) =>
    request<any>('POST', `/dokumente/${dokumentId}/fassungen/${fassungId}/annotationen`, data),
  archiviereAnnotation: (dokumentId: string, annotationId: string) =>
    request<any>('POST', `/dokumente/${dokumentId}/annotationen/${annotationId}/archivieren`),
  deleteAnnotation: (dokumentId: string, annotationId: string) =>
    request<void>('DELETE', `/dokumente/${dokumentId}/annotationen/${annotationId}`),

  // Audit
  getAudit: (dokumentId: string, fassungId: string) =>
    request<any[]>('GET', `/dokumente/${dokumentId}/fassungen/${fassungId}/audit`),

  // Admin: Dokument-Typen
  getDokumentTypen: (produktionId: string) =>
    request<any[]>('GET', `/admin/dokument-typen/${encodeURIComponent(produktionId)}`),
  createDokumentTyp: (produktionId: string, data: { name: string; editor_modus?: string }) =>
    request<any>('POST', `/admin/dokument-typen/${encodeURIComponent(produktionId)}`, data),
  updateDokumentTyp: (produktionId: string, id: number, data: any) =>
    request<any>('PUT', `/admin/dokument-typen/${encodeURIComponent(produktionId)}/${id}`, data),
  deleteDokumentTyp: (produktionId: string, id: number) =>
    request<void>('DELETE', `/admin/dokument-typen/${encodeURIComponent(produktionId)}/${id}`),

  // Admin: Colab-Gruppen (legacy admin endpoints — superseded by /colab-gruppen API below)
  adminGetColabGruppen: (produktionId: string) =>
    request<any[]>('GET', `/admin/colab-gruppen/${encodeURIComponent(produktionId)}`),
  adminCreateColabGruppe: (produktionId: string, data: { name: string; typ?: string }) =>
    request<any>('POST', `/admin/colab-gruppen/${encodeURIComponent(produktionId)}`, data),
  adminUpdateColabGruppe: (produktionId: string, id: number, data: any) =>
    request<any>('PUT', `/admin/colab-gruppen/${encodeURIComponent(produktionId)}/${id}`, data),
  adminDeleteColabGruppe: (produktionId: string, id: number) =>
    request<void>('DELETE', `/admin/colab-gruppen/${encodeURIComponent(produktionId)}/${id}`),
  adminAddColabMitglied: (gruppeId: number, data: { user_id: string; user_name?: string }) =>
    request<any>('POST', `/admin/colab-gruppen/${gruppeId}/mitglieder`, data),
  adminRemoveColabMitglied: (gruppeId: number, userId: string) =>
    request<void>('DELETE', `/admin/colab-gruppen/${gruppeId}/mitglieder/${userId}`),

  // Admin: Override-Rollen & Nummerierung
  getOverrideRollen: () => request<{ rollen: string[] }>('GET', '/admin/dokument-override-rollen'),
  updateOverrideRollen: (rollen: string[]) =>
    request<any>('PUT', '/admin/dokument-override-rollen', { rollen }),
  getFassungsNummerierung: () => request<{ modus: string }>('GET', '/admin/fassungs-nummerierung'),
  updateFassungsNummerierung: (modus: 'global' | 'per_typ') =>
    request<any>('PUT', '/admin/fassungs-nummerierung', { modus }),

  // Autocomplete
  autocompleteCharacters: (produktionId: string, q: string) =>
    request<{ own: any[]; cross: any[] }>('GET', `/autocomplete/characters?produktion_id=${encodeURIComponent(produktionId)}&q=${encodeURIComponent(q)}`),
  autocompleteLocations: (produktionId: string, q: string) =>
    request<{ own: any[]; cross: any[] }>('GET', `/autocomplete/locations?produktion_id=${encodeURIComponent(produktionId)}&q=${encodeURIComponent(q)}`),

  // Scene comment read-state (Messenger-App annotation badge)
  getSceneCommentCounts: (stageId: number) =>
    request<Record<number, number>>('GET', `/stages/${stageId}/szenen-comment-counts`),
  markSceneCommentsRead: (szeneId: number) =>
    request<{ ok: boolean }>('POST', `/szenen/${szeneId}/mark-comments-read`),

  // Autoren-Stoppzeit: Auto-Berechnung
  stoppzeitAuto: (szeneId: string) =>
    request<any>('POST', `/dokument-szenen/${szeneId}/stoppzeit-auto`, {}),
  stoppzeitAutoFolge: (werkstufId: string) =>
    request<{ updated: number; total: number }>('POST', `/dokument-szenen/stoppzeit-auto-folge/${werkstufId}`, {}),

  // Admin: watermark decoder
  watermarkDecode: (file: File) => {
    const fd = new FormData(); fd.append('file', file)
    return fetch(`${BASE}/admin/watermark/decode`, { method: 'POST', credentials: 'include', body: fd }).then(r => r.json())
  },
  watermarkLogs: (limit = 100) => request<any[]>('GET', `/admin/watermark/logs?limit=${limit}`),

  // ── Charakter-Fotos ────────────────────────────────────────────────────────
  getCharacterFotos: (characterId: string) =>
    request<any[]>('GET', `/characters/${characterId}/fotos`),
  uploadCharacterFoto: (characterId: string, file: File) => {
    const fd = new FormData(); fd.append('foto', file)
    return fetch(`${BASE}/characters/${characterId}/fotos`, { method: 'POST', credentials: 'include', body: fd }).then(r => r.json())
  },
  updateCharacterFoto: (characterId: string, fotoId: number, data: { label?: string; ist_primaer?: boolean }) =>
    request<any>('PUT', `/characters/${characterId}/fotos/${fotoId}`, data),
  deleteCharacterFoto: (characterId: string, fotoId: number) =>
    request<any>('DELETE', `/characters/${characterId}/fotos/${fotoId}`),
  reorderCharacterFotos: (characterId: string, order: { id: number; sort_order: number }[]) =>
    request<any[]>('PATCH', `/characters/${characterId}/fotos/reorder`, { order }),

  // ── Motive ───────────────────────────────────────────────────────────────────
  getMotive: (produktionId: string) =>
    request<any[]>('GET', `/produktionen/${encodeURIComponent(produktionId)}/motive`),
  createMotiv: (produktionId: string, data: { name: string; typ?: string; motiv_nummer?: string; ist_studio?: boolean }) =>
    request<any>('POST', `/produktionen/${encodeURIComponent(produktionId)}/motive`, data),
  updateMotiv: (motivId: string, data: { name?: string; typ?: string; motiv_nummer?: string | null; ist_studio?: boolean }) =>
    request<any>('PUT', `/motive/${motivId}`, data),
  deleteMotiv: (motivId: string) =>
    request<any>('DELETE', `/motive/${motivId}`),

  // ── Motiv Fotos ───────────────────────────────────────────────────────────────
  getMotivFotos: (motivId: string) =>
    request<any[]>('GET', `/motive/${motivId}/fotos`),
  uploadMotivFoto: (motivId: string, file: File) => {
    const fd = new FormData(); fd.append('foto', file)
    return fetch(`${BASE}/motive/${motivId}/fotos`, { method: 'POST', credentials: 'include', body: fd }).then(r => r.json())
  },
  updateMotivFoto: (motivId: string, fotoId: number, data: { label?: string; ist_primaer?: boolean }) =>
    request<any>('PUT', `/motive/${motivId}/fotos/${fotoId}`, data),
  deleteMotivFoto: (motivId: string, fotoId: number) =>
    request<any>('DELETE', `/motive/${motivId}/fotos/${fotoId}`),
  reorderMotivFotos: (motivId: string, order: { id: number; sort_order: number }[]) =>
    request<any[]>('PATCH', `/motive/${motivId}/fotos/reorder`, { order }),

  // ── Motiv Feldwerte ───────────────────────────────────────────────────────────
  getMotivFeldwerte: (motivId: string) =>
    request<any[]>('GET', `/motive/${motivId}/feldwerte`),
  setMotivFeldwert: (motivId: string, feldId: number, data: { wert_text?: string | null; wert_json?: any }) =>
    request<any>('PUT', `/motive/${motivId}/feldwerte/${feldId}`, data),

  // ── Charakter-Felder-Config ───────────────────────────────────────────────
  getCharakterFelder: (produktionId: string) =>
    request<any[]>('GET', `/produktionen/${encodeURIComponent(produktionId)}/charakter-felder`),
  createCharakterFeld: (produktionId: string, data: { name: string; typ: string; optionen?: string[]; sort_order?: number; gilt_fuer?: string }) =>
    request<any>('POST', `/produktionen/${encodeURIComponent(produktionId)}/charakter-felder`, data),
  updateCharakterFeld: (produktionId: string, feldId: number, data: any) =>
    request<any>('PUT', `/produktionen/${encodeURIComponent(produktionId)}/charakter-felder/${feldId}`, data),
  deleteCharakterFeld: (produktionId: string, feldId: number) =>
    request<any>('DELETE', `/produktionen/${encodeURIComponent(produktionId)}/charakter-felder/${feldId}`),
  reorderCharakterFelder: (produktionId: string, order: { id: number; sort_order: number }[]) =>
    request<any[]>('PATCH', `/produktionen/${encodeURIComponent(produktionId)}/charakter-felder/reorder`, { order }),
  rollenprofilFelderPreset: (produktionId: string) =>
    request<any[]>('POST', `/produktionen/${encodeURIComponent(produktionId)}/charakter-felder/rollenprofil-preset`),

  // ── Feldwerte ─────────────────────────────────────────────────────────────
  getCharacterFeldwerte: (characterId: string) =>
    request<any[]>('GET', `/characters/${characterId}/feldwerte`),
  setCharacterFeldwert: (characterId: string, feldId: number, data: { wert_text?: string | null; wert_json?: any }) =>
    request<any>('PUT', `/characters/${characterId}/feldwerte/${feldId}`, data),
  // ── Beziehungen ───────────────────────────────────────────────────────────
  getCharacterBeziehungen: (characterId: string) =>
    request<any[]>('GET', `/characters/${characterId}/beziehungen`),
  addCharacterBeziehung: (characterId: string, data: { related_character_id: string; beziehungstyp: string; label?: string }) =>
    request<any>('POST', `/characters/${characterId}/beziehungen`, data),
  deleteCharacterBeziehung: (characterId: string, relId: number) =>
    request<any>('DELETE', `/characters/${characterId}/beziehungen/${relId}`),

  // ── Charakter aktivieren ──────────────────────────────────────────────────
  aktiviereCharacter: (characterId: string, produktionId: string) =>
    request<any>('POST', `/characters/${characterId}/aktivieren`, { produktion_id: produktionId }),

  // ── DK-Settings (Drehbuchkoordination) ──────────────────────────────────
  getDkProductions: () =>
    request<{ global: boolean; production_ids: string[] }>('GET', '/dk-settings/my-productions'),
  getDkAppSettings: (productionId: string) =>
    request<Record<string, string>>('GET', `/dk-settings/${encodeURIComponent(productionId)}/app-settings`),
  updateDkAppSetting: (productionId: string, key: string, value: string) =>
    request<any>('PUT', `/dk-settings/${encodeURIComponent(productionId)}/app-settings/${encodeURIComponent(key)}`, { value }),

  // ── Deskriptor-Vorlagen (FSK/JuSchG) ─────────────────────────────────────
  getDeskriptorVorlagen: (productionId: string) =>
    request<{ id: number | null; name: string; sort_order: number }[]>('GET', `/dk-settings/${encodeURIComponent(productionId)}/deskriptor-vorlagen`),
  createDeskriptorVorlage: (productionId: string, name: string) =>
    request<any>('POST', `/dk-settings/${encodeURIComponent(productionId)}/deskriptor-vorlagen`, { name }),
  updateDeskriptorVorlage: (productionId: string, id: number, name: string) =>
    request<any>('PUT', `/dk-settings/${encodeURIComponent(productionId)}/deskriptor-vorlagen/${id}`, { name }),
  reorderDeskriptorVorlagen: (productionId: string, entries: { id: number; sort_order: number }[]) =>
    request<any>('PUT', `/dk-settings/${encodeURIComponent(productionId)}/deskriptor-vorlagen/reorder`, entries),
  deleteDeskriptorVorlage: (productionId: string, id: number) =>
    request<any>('DELETE', `/dk-settings/${encodeURIComponent(productionId)}/deskriptor-vorlagen/${id}`),

  // ── Stimmungen (Tageszeit) ────────────────────────────────────────────────
  getStimmungen: (productionId: string) =>
    request<{ id: number | null; name: string; kuerzel: string; position: number }[]>('GET', `/dk-settings/${encodeURIComponent(productionId)}/stimmungen`),
  createStimmung: (productionId: string, name: string, kuerzel: string) =>
    request<any>('POST', `/dk-settings/${encodeURIComponent(productionId)}/stimmungen`, { name, kuerzel }),
  updateStimmung: (productionId: string, id: number, name: string, kuerzel: string) =>
    request<any>('PUT', `/dk-settings/${encodeURIComponent(productionId)}/stimmungen/${id}`, { name, kuerzel }),
  reorderStimmungen: (productionId: string, entries: { id: number; position: number }[]) =>
    request<any>('PUT', `/dk-settings/${encodeURIComponent(productionId)}/stimmungen/reorder`, entries),
  deleteStimmung: (productionId: string, id: number) =>
    request<any>('DELETE', `/dk-settings/${encodeURIComponent(productionId)}/stimmungen/${id}`),

  // ── Spieltag-Check ────────────────────────────────────────────────────────
  runSpieltagCheck: (produktionId: string) =>
    request<{ ok: boolean; total_scenes: number; issues_found: number; issues: any[] }>('POST', `/checks/produktion/${encodeURIComponent(produktionId)}/spieltag`),
  getSpieltagFixScope: (produktionId: string) =>
    request<{ scenes_affected: number; folgen_affected: number; total_scenes: number; confirmed: boolean }>('POST', `/checks/produktion/${encodeURIComponent(produktionId)}/spieltag/fix`),
  applySpieltagFix: (produktionId: string) =>
    request<{ ok: boolean; scenes_corrected: number; confirmed: boolean }>('POST', `/checks/produktion/${encodeURIComponent(produktionId)}/spieltag/fix?confirm=true`),

  // ── DK-Zugriffsverwaltung (Admin) ───────────────────────────────────────
  getDkAccessMeta: () =>
    request<{ users: { id: string; name: string; email: string }[]; roles: { id: string; name: string }[] }>('GET', '/admin/dk-access/meta'),
  getDkAccess: (productionId: string) =>
    request<any[]>('GET', `/admin/dk-access/${encodeURIComponent(productionId)}`),
  updateDkAccess: (productionId: string, entries: { access_type: string; identifier: string }[]) =>
    request<any[]>('PUT', `/admin/dk-access/${encodeURIComponent(productionId)}`, { entries }),

  // ── Werkstufen-Modell (v2) ────────────────────────────────────────────────

  // Folgen v2 (merged table)
  getFolgenV2: (produktionId: string) =>
    request<any[]>('GET', `/v2/folgen?produktion_id=${encodeURIComponent(produktionId)}`),
  getFreieDokumente: (produktionId: string) =>
    request<any[]>('GET', `/v2/folgen?produktion_id=${encodeURIComponent(produktionId)}&nur_frei=true`),
  getFolgeV2: (id: number) => request<any>('GET', `/v2/folgen/${id}`),
  createFolgeV2: (data: { produktion_id: string; folge_nummer: number; folgen_titel?: string }) =>
    request<any>('POST', '/v2/folgen', data),
  createFreiesDokument: (data: { produktion_id: string; folgen_titel: string; dokument_label?: string; sichtbarkeit_frei?: string; colab_gruppe_id?: number | null }) =>
    request<any>('POST', '/v2/folgen', { ...data, ist_frei: true }),
  updateFolgeV2: (id: string | number, data: { folgen_titel?: string; synopsis?: string; dokument_label?: string; sichtbarkeit_frei?: string; colab_gruppe_id?: number | null }) =>
    request<any>('PUT', `/v2/folgen/${id}`, data),
  deleteFreiesDokument: (id: string) =>
    request<any>('DELETE', `/v2/folgen/${id}`),
  verknuepfeMitFolge: (freiDokId: string, data: { ziel_folge_id?: string; ziel_folge_nummer?: number; label_folge_sendung?: boolean }) =>
    request<any>('POST', `/v2/folgen/${freiDokId}/verknuepfe-mit-folge`, data),
  getFreieDokLabels: (produktionId: string) =>
    request<any[]>('GET', `/v2/folgen/freie-dokument-labels?produktion_id=${encodeURIComponent(produktionId)}`),
  createFreieDokLabel: (data: { produktion_id: string; label_name: string }) =>
    request<any>('POST', '/v2/folgen/freie-dokument-labels', data),
  deleteFreieDokLabel: (id: number) =>
    request<any>('DELETE', `/v2/folgen/freie-dokument-labels/${id}`),

  // Werkstufen
  getWerkstufen: (folgeId: number) =>
    request<any[]>('GET', `/v2/folgen/${folgeId}/werkstufen`),
  getWerkstufe: (id: string) => request<any>('GET', `/werkstufen/${id}`),
  createWerkstufe: (folgeId: number, data: {
    typ: string
    label?: string
    mode?: 'full' | 'headers_only' | 'storyline_body_as_txt' | 'empty'
    vorgaenger_id?: string
    kopiere_notizen?: boolean
  }) =>
    request<any>('POST', `/v2/folgen/${folgeId}/werkstufen`, data),
  deleteWerkstufe: (id: string) => request<void>('DELETE', `/werkstufen/${id}`),

  // Werkstufen-Szenen
  getWerkstufenSzenen: (werkId: string) =>
    request<any[]>('GET', `/werkstufen/${werkId}/szenen`),
  getFlashbackReferenzSzenen: (werkId: string, q?: string) =>
    request<any[]>('GET', `/werkstufen/${werkId}/flashback-szenen${q ? '?q=' + encodeURIComponent(q) : ''}`),
  getWerkstufenVorstoppUebersicht: (werkId: string) =>
    request<any[]>('GET', `/werkstufen/${werkId}/szenen/vorstopp-uebersicht`),
  createWerkstufeSzene: (werkId: string, data: any) =>
    request<any>('POST', `/werkstufen/${werkId}/szenen`, data),
  reorderWerkstufeSzenen: (werkId: string, order: (number | string)[], nonSceneAnchors?: Record<string, number | null>) =>
    request<any[]>('PATCH', `/werkstufen/${werkId}/szenen/reorder`, { order, ...(nonSceneAnchors ? { nonSceneAnchors } : {}) }),
  getExportNotizSzenen: (werkstufId: string) =>
    request<{ items: { id: string; label: string; sort_order: number }[]; blockSortOrderMin: number | null; blockSortOrderMax: number | null }>('GET', `/export/notiz-szenen?werkstufId=${werkstufId}`),
  getExportTitelseiteVorlagen: (produktionId: string) =>
    request<{ id: string; name: string }[]>('GET', `/export/titelseite-vorlagen?produktionId=${produktionId}`),
  renumberWerkstufeSzenen: (werkId: string) =>
    request<{ scenes: any[]; renumbered: boolean }>('POST', `/werkstufen/${werkId}/szenen/renumber`),
  diffWerkstufen: (leftId: string, rightId: string) =>
    request<any>('GET', `/werkstufen/${leftId}/szenen/diff/${rightId}`),
  getReplikOffsets: (werkId: string) =>
    request<{ offsets: Record<string, number>; total: number; baseline: any }>('GET', `/werkstufen/${werkId}/replik-offsets`),
  saveReplikBaseline: (werkId: string) =>
    request<{ ok: boolean; baseline: any; total: number }>('POST', `/werkstufen/${werkId}/replik-baseline`),
  lockSeitenzahlen: (werkstufenId: string) =>
    request<any>('POST', `/werkstufen/${werkstufenId}/seitenzahlen-lock`, {}),
  unlockSeitenzahlen: (werkstufenId: string) =>
    request<any>('DELETE', `/werkstufen/${werkstufenId}/seitenzahlen-lock`),
  applyVorlage: (werkId: string, vorlageId: string) =>
    request<{ ok: boolean; inserted: number }>('POST', `/werkstufen/${werkId}/apply-vorlage`, { vorlage_id: vorlageId }),

  getWerkstufeLaenge: (werkId: string) =>
    request<{ stoppzeit_total_sek: number; formatted: string | null }>('GET', `/werkstufen/${werkId}/laenge`),

  // Dokument-Vorlagen (Templates)
  getDokumentVorlagen: (produktionId: string) =>
    request<any[]>('GET', `/produktionen/${encodeURIComponent(produktionId)}/dokument-vorlagen`),
  getDokumentVorlage: (produktionId: string, id: string) =>
    request<any>('GET', `/produktionen/${encodeURIComponent(produktionId)}/dokument-vorlagen/${id}`),
  createDokumentVorlage: (produktionId: string, data: { name: string; werkstufe_id: string }) =>
    request<any>('POST', `/produktionen/${encodeURIComponent(produktionId)}/dokument-vorlagen`, data),
  createDokumentVorlageManual: (produktionId: string, data: { name: string; typ?: string; sektionen?: any[]; meta_fields?: any[]; body_content?: any; kopfzeile_content?: any; fusszeile_content?: any; kopfzeile_aktiv?: boolean; fusszeile_aktiv?: boolean; erste_seite_kein_header?: boolean; seiten_layout?: any; zeilennummerierung_unterbinden?: boolean }) =>
    request<any>('POST', `/produktionen/${encodeURIComponent(produktionId)}/dokument-vorlagen/create`, data),
  updateDokumentVorlage: (produktionId: string, id: string, data: any) =>
    request<any>('PUT', `/produktionen/${encodeURIComponent(produktionId)}/dokument-vorlagen/${id}`, data),
  deleteDokumentVorlage: (produktionId: string, id: string) =>
    request<void>('DELETE', `/produktionen/${encodeURIComponent(produktionId)}/dokument-vorlagen/${id}`),
  setVorlageAktiv: (produktionId: string, id: string) =>
    request<any>('POST', `/produktionen/${encodeURIComponent(produktionId)}/dokument-vorlagen/${id}/set-aktiv`, {}),
  unsetVorlageAktiv: (produktionId: string, id: string) =>
    request<any>('POST', `/produktionen/${encodeURIComponent(produktionId)}/dokument-vorlagen/${id}/unset-aktiv`, {}),
  setVorlageTitelseite: (produktionId: string, id: string) =>
    request<any>('POST', `/produktionen/${encodeURIComponent(produktionId)}/dokument-vorlagen/${id}/set-titelseite`, {}),
  unsetVorlageTitelseite: (produktionId: string, id: string) =>
    request<any>('POST', `/produktionen/${encodeURIComponent(produktionId)}/dokument-vorlagen/${id}/unset-titelseite`, {}),

  // ── Kopf-/Fußzeilen-Defaults ──────────────────────────────────────────────
  getKopfFusszeilen: (produktionId: string) =>
    request<any[]>('GET', `/produktionen/${encodeURIComponent(produktionId)}/kopf-fusszeilen`),
  getKopfFusszeilenTyp: (produktionId: string, typ: string) =>
    request<any | null>('GET', `/produktionen/${encodeURIComponent(produktionId)}/kopf-fusszeilen/${typ}`),
  saveKopfFusszeilenTyp: (produktionId: string, typ: string, data: any) =>
    request<any>('PUT', `/produktionen/${encodeURIComponent(produktionId)}/kopf-fusszeilen/${typ}`, data),
  deleteKopfFusszeilenTyp: (produktionId: string, typ: string) =>
    request<void>('DELETE', `/produktionen/${encodeURIComponent(produktionId)}/kopf-fusszeilen/${typ}`),
  getFolgeWerkstufen: (folgeId: string) =>
    request<any[]>('GET', `/folgen/${encodeURIComponent(folgeId)}/werkstufen`),

  // ── Absatzformate ─────────────────────────────────────────────────────────
  getAbsatzformate: (produktionId: string) =>
    request<{ formate: any[]; applied_preset_id: string | null }>('GET', `/produktionen/${encodeURIComponent(produktionId)}/absatzformate`),
  createAbsatzformat: (produktionId: string, data: any) =>
    request<any>('POST', `/produktionen/${encodeURIComponent(produktionId)}/absatzformate`, data),
  updateAbsatzformat: (produktionId: string, id: string, data: any) =>
    request<any>('PUT', `/produktionen/${encodeURIComponent(produktionId)}/absatzformate/${id}`, data),
  deleteAbsatzformat: (produktionId: string, id: string) =>
    request<void>('DELETE', `/produktionen/${encodeURIComponent(produktionId)}/absatzformate/${id}`),
  applyAbsatzformatPreset: (produktionId: string, presetId: string) =>
    request<any>('POST', `/produktionen/${encodeURIComponent(produktionId)}/absatzformate/from-preset`, { preset_id: presetId }),
  copyAbsatzformateFromProduktion: (produktionId: string, sourceId: string) =>
    request<any[]>('POST', `/produktionen/${encodeURIComponent(produktionId)}/absatzformate/from-produktion`, { source_produktion_id: sourceId }),
  getAbsatzformatPresets: () =>
    request<any[]>('GET', '/absatzformat-presets'),
  createAbsatzformatPreset: (data: { name: string; beschreibung?: string; formate: any[]; erstellt_von?: string; seitenformat?: string; page_margins?: Record<string, number>; szenen_kopf_template?: string }) =>
    request<any>('POST', '/absatzformat-presets', data),
  deleteAbsatzformatPreset: (id: string) =>
    request<void>('DELETE', `/absatzformat-presets/${id}`),
  patchAbsatzformatPreset: (id: string, data: { name?: string; beschreibung?: string; szenen_kopf_template?: string; seitenformat?: string; page_margins?: Record<string, number>; formate?: any[] }) =>
    request<any>('PATCH', `/absatzformat-presets/${id}`, data),
  duplicateAbsatzformatPreset: (id: string) =>
    request<any>('POST', `/absatzformat-presets/${id}/duplicate`),
  getMe: () =>
    request<{ user_id: string; name: string; email: string; role: string; roles: string[] }>('GET', `/me/whoami`),
  setAbsatzformatStandard: (produktionId: string, formatId: string) =>
    request<any>('POST', `/produktionen/${encodeURIComponent(produktionId)}/absatzformate/${formatId}/set-standard`),
  reorderAbsatzformate: (produktionId: string, order: { id: string; sort_order: number }[]) =>
    request<any[]>('POST', `/produktionen/${encodeURIComponent(produktionId)}/absatzformate/reorder`, { order }),

  // ── Statistik ──────────────────────────────────────────────────────────────
  getStatOverview: (werkId: string) =>
    request<any>('GET', `/statistik/overview?werkstufe_id=${werkId}`),
  getStatCharacterScenes: (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString()
    return request<any[]>('GET', `/statistik/character-scenes?${qs}`)
  },
  getStatCharacterRepliken: (werkId: string) =>
    request<any[]>('GET', `/statistik/character-repliken?werkstufe_id=${werkId}`),
  getStatCharacterPairs: (werkId: string, characterId?: string, motiv?: string) => {
    const p = new URLSearchParams({ werkstufe_id: werkId })
    if (characterId) p.set('character_id', characterId)
    if (motiv) p.set('motiv', motiv)
    return request<any[]>('GET', `/statistik/character-pairs?${p}`)
  },
  getStatBesetzungsmatrix: (produktionId: string, werkstufTyp?: string) => {
    const p = new URLSearchParams({ produktion_id: produktionId })
    if (werkstufTyp) p.set('werkstufe_typ', werkstufTyp)
    return request<any>('GET', `/statistik/besetzungsmatrix?${p}`)
  },
  getStatVersionCompare: (leftId: string, rightId: string) =>
    request<any>('GET', `/statistik/version-compare?left_id=${leftId}&right_id=${rightId}`),
  getStatMotivAuslastung: (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString()
    return request<any[]>('GET', `/statistik/motiv-auslastung?${qs}`)
  },
  getStatKomparsenBedarf: (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString()
    return request<any>('GET', `/statistik/komparsen-bedarf?${qs}`)
  },
  getStatReport: (produktionId: string, folgeIds: number[], werkstufTyp?: string) => {
    const p = new URLSearchParams({
      produktion_id: produktionId,
      folge_ids: folgeIds.join(','),
    })
    if (werkstufTyp) p.set('werkstufe_typ', werkstufTyp)
    return request<any>('GET', `/statistik/report?${p}`)
  },
  getStatVorlagen: (produktionId: string) =>
    request<any[]>('GET', `/statistik/vorlagen?produktion_id=${encodeURIComponent(produktionId)}`),
  createStatVorlage: (data: { produktion_id: string; name: string; abfrage_typ: string; parameter?: any }) =>
    request<any>('POST', '/statistik/vorlagen', data),
  updateStatVorlage: (id: number, data: any) =>
    request<any>('PUT', `/statistik/vorlagen/${id}`, data),
  deleteStatVorlage: (id: number) =>
    request<void>('DELETE', `/statistik/vorlagen/${id}`),

  // ── NT-Eintraege ───────────────────────────────────────────────────────────
  getNtStatistik: (produktionId: string, folgeIds: number[]) => {
    const p = new URLSearchParams({ produktion_id: produktionId })
    if (folgeIds.length > 0) p.set('folge_ids', folgeIds.join(','))
    return request<any>('GET', `/nt-eintraege/statistik/overview?${p}`)
  },

  // ── Suchen & Ersetzen ──────────────────────────────────────────────────────

  search: (params: {
    query: string
    scope: 'szene' | 'episode' | 'block' | 'produktion' | 'alle'
    scope_id?: string
    werkstufe_typ?: string
    content_types?: string[]
    case_sensitive?: boolean
    whole_words?: boolean
    regex?: boolean
    limit?: number
    offset?: number
    include_frei?: boolean
    include_private?: boolean
  }) => {
    const qs = new URLSearchParams()
    qs.set('query', params.query)
    qs.set('scope', params.scope)
    if (params.scope_id) qs.set('scope_id', params.scope_id)
    if (params.werkstufe_typ) qs.set('werkstufe_typ', params.werkstufe_typ)
    if (params.content_types) qs.set('content_types', params.content_types.join(','))
    if (params.case_sensitive) qs.set('case_sensitive', 'true')
    if (params.whole_words) qs.set('whole_words', 'true')
    if (params.regex) qs.set('regex', 'true')
    if (params.limit) qs.set('limit', String(params.limit))
    if (params.offset) qs.set('offset', String(params.offset))
    if (params.include_frei) qs.set('include_frei', 'true')
    if (params.include_private) qs.set('include_private', 'true')
    return request<{
      results: any[]
      total: number
      total_scenes: number
      locked_count: number
      fallback_count: number
      has_more: boolean
    }>('GET', `/search?${qs.toString()}`)
  },

  searchEntityCheck: (params: { q: string; produktion_id: string }) => {
    const qs = new URLSearchParams({ q: params.q, produktion_id: params.produktion_id })
    return request<{ type: 'rolle' | 'motiv' | 'none'; matches: any[] }>('GET', `/search/entity-check?${qs.toString()}`)
  },

  searchSzenen: (params: {
    produktion_id: string
    scope?: string
    scope_id?: string
    werkstufe_typ?: string
    rolle_ids?: string[]
    motiv_ids?: string[]
    rolle_names?: string[]
    ia?: string
    dt?: string
    freitext?: string
    include_frei?: boolean
    include_private?: boolean
  }) => {
    const qs = new URLSearchParams({ produktion_id: params.produktion_id })
    if (params.scope) qs.set('scope', params.scope)
    if (params.scope_id) qs.set('scope_id', params.scope_id)
    if (params.werkstufe_typ) qs.set('werkstufe_typ', params.werkstufe_typ)
    if (params.rolle_ids?.length) qs.set('rolle_ids', params.rolle_ids.join(','))
    if (params.motiv_ids?.length) qs.set('motiv_ids', params.motiv_ids.join(','))
    if (params.rolle_names?.length) qs.set('rolle_names', params.rolle_names.join(','))
    if (params.ia) qs.set('ia', params.ia)
    if (params.dt) qs.set('dt', params.dt)
    if (params.freitext) qs.set('freitext', params.freitext)
    if (params.include_frei) qs.set('include_frei', 'true')
    if (params.include_private) qs.set('include_private', 'true')
    return request<{ szenen: any[]; total: number }>('GET', `/search/szenen?${qs.toString()}`)
  },

  replaceRollenname: (params: { old_name: string; new_name: string; produktion_id: string }) =>
    request<{ characters_updated: number; scene_characters_updated: number; content_nodes_updated: number; total: number }>(
      'POST', '/search/replace-rollenname', params
    ),

  // ── Straenge (Story-Arcs) ──────────────────────────────────────────────────
  getStraenge: (produktionId: string) =>
    request<any[]>('GET', `/straenge?produktion_id=${encodeURIComponent(produktionId)}`),
  createStrang: (data: any) =>
    request<any>('POST', '/straenge', data),
  updateStrang: (id: string, data: any) =>
    request<any>('PUT', `/straenge/${id}`, data),
  deleteStrang: (id: string) =>
    request<any>('DELETE', `/straenge/${id}`),
  getStrangCharaktere: (id: string) =>
    request<any[]>('GET', `/straenge/${id}/charaktere`),
  addStrangCharakter: (id: string, data: { character_id: string; rolle?: string }) =>
    request<any>('POST', `/straenge/${id}/charaktere`, data),
  removeStrangCharakter: (id: string, characterId: string) =>
    request<any>('DELETE', `/straenge/${id}/charaktere/${characterId}`),
  getStrangBeats: (id: string, ebene?: string) =>
    request<any[]>('GET', `/straenge/${id}/beats${ebene ? `?ebene=${ebene}` : ''}`),
  createStrangBeat: (id: string, data: any) =>
    request<any>('POST', `/straenge/${id}/beats`, data),
  updateStrangBeat: (beatId: string, data: any) =>
    request<any>('PUT', `/straenge/beats/${beatId}`, data),
  deleteStrangBeat: (beatId: string) =>
    request<any>('DELETE', `/straenge/beats/${beatId}`),
  toggleStrangBeatAbgearbeitet: (beatId: string) =>
    request<any>('PUT', `/straenge/beats/${beatId}/abgearbeitet`),
  getSzeneStaenge: (dokumentSzeneId: string) =>
    request<any[]>('GET', `/straenge/szene/${dokumentSzeneId}`),
  addSzeneStrang: (dokumentSzeneId: string, strangId: string) =>
    request<any>('POST', `/straenge/szene/${dokumentSzeneId}`, { strang_id: strangId }),
  removeSzeneStrang: (dokumentSzeneId: string, strangId: string) =>
    request<any>('DELETE', `/straenge/szene/${dokumentSzeneId}/${strangId}`),
  bulkAddSzeneStrang: (dokSzeneIds: string[], strangId: string) =>
    request<any>('POST', '/straenge/bulk-szenen', { dokument_szene_ids: dokSzeneIds, strang_id: strangId }),
  bulkRemoveSzeneStrang: (dokSzeneIds: string[], strangId: string) =>
    request<any>('POST', '/straenge/bulk-szenen/entfernen', { dokument_szene_ids: dokSzeneIds, strang_id: strangId }),
  createPlatzhalterSzenen: (data: { werkstufe_id: string; anzahl: number; strang_id?: string }) =>
    request<any>('POST', '/straenge/platzhalter-szenen', data),
  getWerkstufeStraenge: (werkId: string) =>
    request<Record<string, any[]>>('GET', `/straenge/werkstufe/${werkId}`),
  getStrangRadar: (produktionId: string, folgeId?: number) => {
    const p = new URLSearchParams({ produktion_id: produktionId })
    if (folgeId) p.set('folge_id', String(folgeId))
    return request<any[]>('GET', `/straenge/radar?${p}`)
  },
  getStrangPacing: (produktionId: string) =>
    request<{ warnungen: any[] }>('GET', `/straenge/pacing?produktion_id=${encodeURIComponent(produktionId)}`),
  importFutureBeats: (strangId: string, data: { text: string; block_nummer?: number; ebene?: string; folge_id?: number }) =>
    request<{ created: any[]; count: number }>('POST', `/straenge/${strangId}/future-import`, data),
  rasterGenerieren: (strangId: string, folgeIds: number[]) =>
    request<{ created: any[]; count: number }>('POST', `/straenge/${strangId}/raster-generieren`, { folge_ids: folgeIds }),

  // ── Future-Board ──────────────────────────────────────────────────────────
  getBoardData: (produktionId: string) =>
    request<{ straenge: any[]; beats: any[] }>('GET', `/planung/board?produktion_id=${encodeURIComponent(produktionId)}`),
  getBeatCharaktere: (beatId: string) =>
    request<any[]>('GET', `/straenge/beats/${beatId}/charaktere`),
  addBeatCharakter: (beatId: string, data: { character_id: string; rolle?: string }) =>
    request<any>('POST', `/straenge/beats/${beatId}/charaktere`, data),
  removeBeatCharakter: (beatId: string, characterId: string) =>
    request<void>('DELETE', `/straenge/beats/${beatId}/charaktere/${characterId}`),
  beatKurztext: (produktionId: string, beatIds?: string[]) =>
    request<{ items: Array<{ beat_id: string; prosa_text: string; vorschlag_beat_text: string; fehler?: string }>; provider: string; model: string }>(
      'POST', '/planung/beats/ki-kurztext', { produktion_id: produktionId, ...(beatIds ? { beat_ids: beatIds } : {}) }
    ),
  beatKurztextCommit: (updates: Array<{ beat_id: string; beat_text: string }>) =>
    request<{ updated: number }>('POST', '/planung/beats/ki-kurztext/commit', { updates }),

  // ── Rollen-Einsatzplanung ──────────────────────────────────────────────────
  getEinsatz: (produktionId: string) =>
    request<{ eintraege: any[]; characters: any[] }>('GET', `/planung/einsatz?produktion_id=${encodeURIComponent(produktionId)}`),
  createEinsatz: (data: { produktion_id: string; character_id: string; block_von: number; block_bis: number; status?: string; notiz?: string }) =>
    request<any>('POST', '/planung/einsatz', data),
  updateEinsatz: (id: string, data: { block_von?: number; block_bis?: number; status?: string; notiz?: string }) =>
    request<any>('PUT', `/planung/einsatz/${id}`, data),
  deleteEinsatz: (id: string) =>
    request<{ ok: boolean }>('DELETE', `/planung/einsatz/${id}`),
  runCastAbgleich: (produktionId: string) =>
    request<{ befunde: any[]; summary: { luecken: number; ueberschuesse: number; gesamt: number } }>(
      'POST', `/planung/cast-abgleich?produktion_id=${encodeURIComponent(produktionId)}`
    ),
  checkCastEinsatz: (produktionId: string, characterId: string, blockNummer: number) =>
    request<{ hat_einsatz: boolean; einsatz: any | null }>(
      'GET', `/planung/cast-abgleich/check?produktion_id=${encodeURIComponent(produktionId)}&character_id=${encodeURIComponent(characterId)}&block_nummer=${blockNummer}`
    ),

  // ── Befund-Register ────────────────────────────────────────────────────────
  getBefunde: (produktionId: string, status: 'offen' | 'erledigt' | 'auto_geloest' | 'alle' = 'alle') =>
    request<any[]>('GET', `/planung/befunde?produktion_id=${encodeURIComponent(produktionId)}&status=${status}`),
  erledigeBefund: (id: string, vermerk?: string) =>
    request<any>('POST', `/planung/befunde/${id}/erledigen`, { vermerk }),
  runFreigabeCheck: (produktionId: string) =>
    request<{ befunde: any[]; summary: { freigabe: number; bilder: number; gesamt: number } }>(
      'POST', `/planung/freigabe-check?produktion_id=${encodeURIComponent(produktionId)}`
    ),

  // ── Sonderszenen: Wechselschnitt-Partner ──
  getWechselschnittPartner: (szeneId: string) =>
    request<any[]>('GET', `/dokument-szenen/${szeneId}/wechselschnitt-partner`),
  setWechselschnittPartner: (szeneId: string, partners: { partner_identity_id: string; position: number }[]) =>
    request<any[]>('PUT', `/dokument-szenen/${szeneId}/wechselschnitt-partner`, { partners }),
  bulkTageszeitPropagate: (szeneId: string, data: { tageszeit: string; increment_spieltag: boolean }) =>
    request<{ updated_count: number }>('PUT', `/dokument-szenen/${szeneId}/bulk-tageszeit-propagate`, data),
  getWechselschnittBeteiligt: (szeneId: string) =>
    request<any[]>('GET', `/dokument-szenen/${szeneId}/wechselschnitt-beteiligt`),

  // ── Sonderszenen: Stockshot-Archiv ──
  getStockshotArchiv: (produktionId: string) =>
    request<any[]>('GET', `/stockshot-archiv/${produktionId}`),
  checkStockshotArchiv: (produktionId: string, motiv: string, lichtstimmung: string) =>
    request<{ exists: boolean }>('GET', `/stockshot-archiv/${produktionId}/check?motiv=${encodeURIComponent(motiv)}&lichtstimmung=${encodeURIComponent(lichtstimmung)}`),
  createStockshotArchivEntry: (produktionId: string, data: { motiv_name: string; motiv_id?: string | null; lichtstimmung: string; quelle_folge_nr?: number | null }) =>
    request<any>('POST', `/stockshot-archiv/${produktionId}`, data),
  deleteStockshotArchivEntry: (produktionId: string, id: string) =>
    request<{ ok: boolean }>('DELETE', `/stockshot-archiv/${produktionId}/${id}`),
  importStockshotArchivFrom: (produktionId: string, sourceProduktionId: string) =>
    request<{ imported: number }>('POST', `/stockshot-archiv/${produktionId}/import-from/${sourceProduktionId}`),

  // ── Sonderszenen: Stockshot-Templates ──
  getStockshotTemplates: (produktionId: string) =>
    request<any[]>('GET', `/stockshot-templates/${produktionId}`),

  // ── Sonderszenen: Stimmungs-Validierung ──
  getStimmungCheck: (werkstufId: string) =>
    request<{ warnings: { scene_id: string; scene_nummer: number; message: string }[]; scene_count: number }>('GET', `/dokument-szenen/stimmung-check/${werkstufId}`),

  replace: (params: {
    query: string
    replacement: string
    scope: 'szene' | 'episode' | 'block' | 'produktion' | 'alle'
    scope_id?: string
    werkstufe_typ?: string
    content_types?: string[]
    case_sensitive?: boolean
    whole_words?: boolean
    regex?: boolean
    exclude_ids?: string[]
  }) => request<{
    replaced_count: number
    skipped_locked: number
    skipped_excluded: number
    affected_scenes: any[]
  }>('POST', '/search/replace', params),

  // ── Team-Work: Colab-Gruppen ───────────────────────────────────────────────
  getColabGruppen: (produktionId: string) =>
    request<any[]>('GET', `/colab-gruppen?produktion_id=${encodeURIComponent(produktionId)}`),
  createColabGruppe: (data: { produktion_id: string; name: string; beschreibung?: string }) =>
    request<any>('POST', '/colab-gruppen', data),
  updateColabGruppe: (id: string, data: { name: string; beschreibung?: string }) =>
    request<any>('PUT', `/colab-gruppen/${id}`, data),
  deleteColabGruppeById: (id: string) =>
    request<void>('DELETE', `/colab-gruppen/${id}`),
  addColabMitglied: (gruppeId: string, data: { user_id: string; user_name: string }) =>
    request<any>('POST', `/colab-gruppen/${gruppeId}/mitglieder`, data),
  removeColabMitglied: (gruppeId: string, userId: string) =>
    request<void>('DELETE', `/colab-gruppen/${gruppeId}/mitglieder/${encodeURIComponent(userId)}`),
  searchAppUsers: (q: string) =>
    request<Array<{ user_id: string; user_name: string; email: string }>>('GET', `/colab-gruppen/app-users?q=${encodeURIComponent(q)}`),

  // ── Team-Work: Werkstufen-Sessions (Heartbeat) ────────────────────────────
  sessionHeartbeat: (werkId: string) =>
    request<any>('PUT', `/werkstufen-sessions/${werkId}`, {}),
  sessionEnd: (werkId: string) =>
    request<void>('DELETE', `/werkstufen-sessions/${werkId}`),
  getSessionUsers: (werkId: string) =>
    request<Array<{ user_id: string; user_name: string; last_active_at: string }>>('GET', `/werkstufen-sessions/${werkId}`),

  // ── Admin: Colab-Gruppen-Register ────────────────────────────────────────
  getAdminColabRegister: (produktionId: string) =>
    request<any[]>('GET', `/admin/colab-gruppen-register?produktion_id=${encodeURIComponent(produktionId)}`),
  updateAdminColabGruppe: (id: string, data: { name: string; beschreibung?: string }) =>
    request<any>('PUT', `/admin/colab-gruppen-register/${id}`, data),
  deleteAdminColabGruppe: (id: string) =>
    request<void>('DELETE', `/admin/colab-gruppen-register/${id}`),

  // ── Private-Dokumente-Verwaltung (DK) ────────────────────────────────────
  getPrivateDokumente: (produktionId: string, filter: '1' | '2' | '3' = '1') =>
    request<any[]>('GET', `/dk/private-dokumente?produktion_id=${encodeURIComponent(produktionId)}&filter=${filter}`),
  changePrivatDokSichtbarkeit: (id: string, data: {
    neue_sichtbarkeit: string
    colab_gruppe_id?: string | null
    per_email_informiert: boolean
    anderweitig_bestaetigt: boolean
  }) => request<{ success: boolean; emailSent: boolean }>('POST', `/dk/private-dokumente/${id}/sichtbarkeit`, data),
  getPrivateDokSettings: () =>
    request<{ filter_2_enabled: boolean; filter_3_enabled: boolean; viewer_roles: string[] }>('GET', '/dk/private-dokumente/settings'),
  getPrivateDokAuditLog: (produktionId: string, limit = 100, offset = 0) =>
    request<any[]>('GET', `/dk/private-dokumente/audit-log?produktion_id=${encodeURIComponent(produktionId)}&limit=${limit}&offset=${offset}`),

  // ── Notifications ─────────────────────────────────────────────────────────
  getNotifications: () =>
    request<{ notifications: any[]; unread_count: number }>('GET', '/notifications'),
  markNotificationRead: (id: string) =>
    request<void>('PUT', `/notifications/${id}/read`),
  markAllNotificationsRead: () =>
    request<void>('PUT', '/notifications/read-all'),
  deleteNotification: (id: string) =>
    request<void>('DELETE', `/notifications/${id}`),

  // ── Drehbuch-Checks ───────────────────────────────────────────────────────
  runChecksAuto: (szeneId: string) =>
    request<{ ok: boolean; issues: number; results: any[] }>('POST', `/checks/szene/${szeneId}/auto`),
  runChecksManual: (szeneId: string) =>
    request<{ ok: boolean; issues: number; results: any[] }>('POST', `/checks/szene/${szeneId}/manual`),
  runChecksBatch: (werkstufId: string, opts?: { checks_override?: string[] }) =>
    request<{ ok: boolean; scenes_checked: number; total_issues: number }>('POST', `/checks/werkstufe/${werkstufId}/batch`, opts ?? {}),
  getCheckConfig: (produktionId: string) =>
    request<Record<string, { enabled: boolean; auto: boolean }>>('GET', `/checks/config/${encodeURIComponent(produktionId)}`),
  getCheckResults: (szeneId: string) =>
    request<any[]>('GET', `/checks/szene/${szeneId}`),
  getCheckBadges: (werkstufId: string) =>
    request<Record<string, { count: number; has_fehler: boolean }>>('GET', `/checks/werkstufe/${werkstufId}/badges`),
  markCheckBehoben: (checkId: string) =>
    request<{ ok: boolean }>('PATCH', `/checks/${checkId}/behoben`),
  runNtVerweisFix: (szeneId: string) =>
    request<{ ok: boolean; changed: boolean; notiz: string | null }>('POST', `/checks/szene/${szeneId}/nt-verweis-fix`),

  // ── Generic helpers ───────────────────────────────────────────────────────
  get: (path: string) => request<any>('GET', path),
  post: (path: string, body?: any) => request<any>('POST', path, body),
  put: (path: string, body?: any) => request<any>('PUT', path, body),
  delete: (path: string) => request<void>('DELETE', path),
}

/**
 * Preload scene data for adjacent scenes (prev/next) so switching feels instant.
 * Fires all relevant GET requests in the background — results land in the cache.
 */
export function preloadScene(szeneId: string, sceneIdentityId?: string | null, werkstufId?: string | null) {
  const swallow = (p: Promise<any>) => p.catch(() => {})
  // Main scene data
  if (werkstufId && sceneIdentityId) {
    swallow(api.resolveDokumentSzene(werkstufId, sceneIdentityId))
  } else {
    swallow(api.getDokumentSzene(szeneId))
  }
  // Characters + Vorstopp (need scene_identity_id)
  if (sceneIdentityId) {
    swallow(api.getSceneIdentityCharacters(sceneIdentityId))
    swallow(api.getSceneIdentityVorstopp(sceneIdentityId))
  }
  // Revisionen
  swallow(api.getDokumentSzeneRevisionen(szeneId))
  // Sondertyp + Story-Straenge (szeneId === data.id in new system)
  swallow(api.getWechselschnittPartner(szeneId))
  swallow(api.getWechselschnittBeteiligt(szeneId))
  swallow(api.getSzeneStaenge(szeneId))
}

/**
 * Preload main scene data for all scenes in a Folge.
 * Fires getDokumentSzene for each scene, throttled to 10 concurrent requests.
 * Runs entirely in the background — errors are silently ignored.
 */
export async function preloadAllScenes(szenen: Array<{ id: string }>) {
  const CONCURRENCY = 10
  const swallow = (p: Promise<any>) => p.catch(() => {})
  for (let i = 0; i < szenen.length; i += CONCURRENCY) {
    const batch = szenen.slice(i, i + CONCURRENCY)
    await Promise.all(batch.map(s => swallow(api.getDokumentSzene(s.id))))
  }
}
