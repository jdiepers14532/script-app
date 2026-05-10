const BASE = '/api'

// ── Short-lived GET cache (TTL 30s) for preloading adjacent scenes ──────────
const getCache = new Map<string, { data: any; ts: number }>()
const CACHE_TTL = 30_000

function getCached<T>(path: string): T | undefined {
  const entry = getCache.get(path)
  if (!entry) return undefined
  if (Date.now() - entry.ts > CACHE_TTL) { getCache.delete(path); return undefined }
  return entry.data as T
}

function setCache(path: string, data: any) {
  getCache.set(path, { data, ts: Date.now() })
  // Evict old entries periodically
  if (getCache.size > 200) {
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

async function doRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401) {
    const redirectUrl = encodeURIComponent(window.location.href)
    window.location.href = `https://auth.serienwerft.studio/?redirect=${redirectUrl}`
    return new Promise(() => {}) // halt execution while redirecting
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `HTTP ${res.status}`)
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
  resolveDokumentSzene: (werkstufId: string, sceneIdentityId: string) =>
    request<any>('GET', `/dokument-szenen/resolve?werkstufe_id=${encodeURIComponent(werkstufId)}&scene_identity_id=${encodeURIComponent(sceneIdentityId)}`),
  updateDokumentSzene: (id: string, data: any) => request<any>('PUT', `/dokument-szenen/${id}`, data),
  deleteDokumentSzene: (id: string) => request<void>('DELETE', `/dokument-szenen/${id}`),
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
  createLock: (produktionId: string, folgeNummer: number) =>
    request<any>('POST', `/folgen/${produktionId}/${folgeNummer}/lock`, {}),
  deleteLock: (produktionId: string, folgeNummer: number) =>
    request<void>('DELETE', `/folgen/${produktionId}/${folgeNummer}/lock`),
  takeoverLock: (produktionId: string, folgeNummer: number) =>
    request<any>('POST', `/folgen/${produktionId}/${folgeNummer}/lock/takeover`, {}),

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

  // KI
  getKiSettings: () => request<any[]>('GET', '/admin/ki-settings'),
  updateKiSetting: (funktion: string, data: any) => request<any>('PUT', `/admin/ki-settings/${funktion}`, data),
  getKiProviders: () => request<any[]>('GET', '/admin/ki-providers'),
  updateKiProvider: (provider: string, data: any) => request<any>('PUT', `/admin/ki-providers/${provider}`, data),
  kiSceneSummary: (data: any) => request<any>('POST', '/ki/scene-summary', data),
  kiEntityDetect: (data: any) => request<any>('POST', '/ki/entity-detect', data),
  kiStyleCheck: (data: any) => request<any>('POST', '/ki/style-check', data),
  kiSynopsis: (data: any) => request<any>('POST', '/ki/synopsis', data),

  // User settings
  getSettings: () => request<any>('GET', '/me/settings'),
  updateSettings: (data: { selected_production_id?: string | null; ui_settings?: Record<string, any> }) =>
    request<any>('PUT', '/me/settings', data),

  // Werkstufe-based exports
  exportWerkstufePdf: (werkId: string) => fetch(`${BASE}/stages/werkstufe/${werkId}/export/pdf`, { credentials: 'include' }),
  exportWerkstufeFountain: (werkId: string) => fetch(`${BASE}/stages/werkstufe/${werkId}/export/fountain`, { credentials: 'include' }),
  exportWerkstufeFdx: (werkId: string) => fetch(`${BASE}/stages/werkstufe/${werkId}/export/fdx`, { credentials: 'include' }),

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

  // Revision Einstellungen
  getRevisionEinstellungen: (produktionId: string) =>
    request<any>('GET', `/produktionen/${encodeURIComponent(produktionId)}/revision-einstellungen`),
  updateRevisionEinstellungen: (produktionId: string, data: any) =>
    request<any>('PUT', `/produktionen/${encodeURIComponent(produktionId)}/revision-einstellungen`, data),

  // Characters
  getCharacters: (produktionId: string) =>
    request<any[]>('GET', `/characters?produktion_id=${encodeURIComponent(produktionId)}`),
  createCharacter: (data: any) => request<any>('POST', '/characters', data),
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
  copySettings: (produktionId: string, data: { source_produktion_id: string; sections: string[] }) =>
    request<any>('POST', `/produktionen/${encodeURIComponent(produktionId)}/copy-settings`, data),

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

  // Admin: Colab-Gruppen
  getColabGruppen: (produktionId: string) =>
    request<any[]>('GET', `/admin/colab-gruppen/${encodeURIComponent(produktionId)}`),
  createColabGruppe: (produktionId: string, data: { name: string; typ?: string }) =>
    request<any>('POST', `/admin/colab-gruppen/${encodeURIComponent(produktionId)}`, data),
  updateColabGruppe: (produktionId: string, id: number, data: any) =>
    request<any>('PUT', `/admin/colab-gruppen/${encodeURIComponent(produktionId)}/${id}`, data),
  deleteColabGruppe: (produktionId: string, id: number) =>
    request<void>('DELETE', `/admin/colab-gruppen/${encodeURIComponent(produktionId)}/${id}`),
  addColabMitglied: (gruppeId: number, data: { user_id: string; user_name?: string }) =>
    request<any>('POST', `/admin/colab-gruppen/${gruppeId}/mitglieder`, data),
  removeColabMitglied: (gruppeId: number, userId: string) =>
    request<void>('DELETE', `/admin/colab-gruppen/${gruppeId}/mitglieder/${userId}`),

  // Admin: Format-Templates
  getFormatTemplates: () => request<any[]>('GET', '/admin/format-templates'),
  updateFormatElemente: (templateId: number, elemente: any[]) =>
    request<any[]>('PUT', `/admin/format-templates/${templateId}/elemente`, { elemente }),

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

  // Scene comment read-state (Messenger-App annotation badge) (legacy)
  getSceneCommentCounts: (stageId: number) =>
    request<Record<number, number>>('GET', `/stages/${stageId}/szenen-comment-counts`),
  markSceneCommentsRead: (szeneId: number) =>
    request<{ ok: boolean }>('POST', `/szenen/${szeneId}/mark-comments-read`),

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

  // ── DK-Zugriffsverwaltung (Admin) ───────────────────────────────────────
  getDkAccess: (productionId: string) =>
    request<any[]>('GET', `/admin/dk-access/${encodeURIComponent(productionId)}`),
  updateDkAccess: (productionId: string, entries: { access_type: string; identifier: string }[]) =>
    request<any[]>('PUT', `/admin/dk-access/${encodeURIComponent(productionId)}`, { entries }),

  // ── Werkstufen-Modell (v2) ────────────────────────────────────────────────

  // Folgen v2 (merged table)
  getFolgenV2: (produktionId: string) =>
    request<any[]>('GET', `/v2/folgen?produktion_id=${encodeURIComponent(produktionId)}`),
  getFolgeV2: (id: number) => request<any>('GET', `/v2/folgen/${id}`),
  createFolgeV2: (data: { produktion_id: string; folge_nummer: number; folgen_titel?: string }) =>
    request<any>('POST', '/v2/folgen', data),
  updateFolgeV2: (id: number, data: { folgen_titel?: string }) =>
    request<any>('PUT', `/v2/folgen/${id}`, data),

  // Werkstufen
  getWerkstufen: (folgeId: number) =>
    request<any[]>('GET', `/v2/folgen/${folgeId}/werkstufen`),
  getWerkstufe: (id: string) => request<any>('GET', `/werkstufen/${id}`),
  createWerkstufe: (folgeId: number, data: { typ: string; label?: string }) =>
    request<any>('POST', `/v2/folgen/${folgeId}/werkstufen`, data),
  updateWerkstufe: (id: string, data: { label?: string; bearbeitung_status?: string }) =>
    request<any>('PUT', `/werkstufen/${id}`, data),
  deleteWerkstufe: (id: string) => request<void>('DELETE', `/werkstufen/${id}`),

  // Werkstufen-Szenen
  getWerkstufenSzenen: (werkId: string) =>
    request<any[]>('GET', `/werkstufen/${werkId}/szenen`),
  createWerkstufeSzene: (werkId: string, data: any) =>
    request<any>('POST', `/werkstufen/${werkId}/szenen`, data),
  reorderWerkstufeSzenen: (werkId: string, order: string[]) =>
    request<any[]>('PATCH', `/werkstufen/${werkId}/szenen/reorder`, { order }),
  renumberWerkstufeSzenen: (werkId: string) =>
    request<{ scenes: any[]; renumbered: boolean }>('POST', `/werkstufen/${werkId}/szenen/renumber`),
  diffWerkstufen: (leftId: string, rightId: string) =>
    request<any>('GET', `/werkstufen/${leftId}/szenen/diff/${rightId}`),
  getReplikOffsets: (werkId: string) =>
    request<{ offsets: Record<string, number>; total: number; baseline: any }>('GET', `/werkstufen/${werkId}/replik-offsets`),
  saveReplikBaseline: (werkId: string) =>
    request<{ ok: boolean; baseline: any; total: number }>('POST', `/werkstufen/${werkId}/replik-baseline`),
  applyVorlage: (werkId: string, vorlageId: string) =>
    request<{ ok: boolean; inserted: number }>('POST', `/werkstufen/${werkId}/apply-vorlage`, { vorlage_id: vorlageId }),

  // Dokument-Vorlagen (Templates)
  getDokumentVorlagen: (produktionId: string) =>
    request<any[]>('GET', `/produktionen/${encodeURIComponent(produktionId)}/dokument-vorlagen`),
  getDokumentVorlage: (produktionId: string, id: string) =>
    request<any>('GET', `/produktionen/${encodeURIComponent(produktionId)}/dokument-vorlagen/${id}`),
  createDokumentVorlage: (produktionId: string, data: { name: string; werkstufe_id: string }) =>
    request<any>('POST', `/produktionen/${encodeURIComponent(produktionId)}/dokument-vorlagen`, data),
  createDokumentVorlageManual: (produktionId: string, data: { name: string; typ?: string; sektionen?: any[]; meta_fields?: any[] }) =>
    request<any>('POST', `/produktionen/${encodeURIComponent(produktionId)}/dokument-vorlagen/create`, data),
  updateDokumentVorlage: (produktionId: string, id: string, data: any) =>
    request<any>('PUT', `/produktionen/${encodeURIComponent(produktionId)}/dokument-vorlagen/${id}`, data),
  deleteDokumentVorlage: (produktionId: string, id: string) =>
    request<void>('DELETE', `/produktionen/${encodeURIComponent(produktionId)}/dokument-vorlagen/${id}`),

  // ── Absatzformate ─────────────────────────────────────────────────────────
  getAbsatzformate: (produktionId: string) =>
    request<any[]>('GET', `/produktionen/${encodeURIComponent(produktionId)}/absatzformate`),
  createAbsatzformat: (produktionId: string, data: any) =>
    request<any>('POST', `/produktionen/${encodeURIComponent(produktionId)}/absatzformate`, data),
  updateAbsatzformat: (produktionId: string, id: string, data: any) =>
    request<any>('PUT', `/produktionen/${encodeURIComponent(produktionId)}/absatzformate/${id}`, data),
  deleteAbsatzformat: (produktionId: string, id: string) =>
    request<void>('DELETE', `/produktionen/${encodeURIComponent(produktionId)}/absatzformate/${id}`),
  applyAbsatzformatPreset: (produktionId: string, presetId: string) =>
    request<any[]>('POST', `/produktionen/${encodeURIComponent(produktionId)}/absatzformate/from-preset`, { preset_id: presetId }),
  copyAbsatzformateFromProduktion: (produktionId: string, sourceId: string) =>
    request<any[]>('POST', `/produktionen/${encodeURIComponent(produktionId)}/absatzformate/from-produktion`, { source_produktion_id: sourceId }),
  getAbsatzformatPresets: () =>
    request<any[]>('GET', '/absatzformat-presets'),
  createAbsatzformatPreset: (data: { name: string; beschreibung?: string; formate: any[]; erstellt_von?: string }) =>
    request<any>('POST', '/absatzformat-presets', data),
  deleteAbsatzformatPreset: (id: string) =>
    request<void>('DELETE', `/absatzformat-presets/${id}`),
  migrateAbsatzformatContent: (produktionId: string) =>
    request<{ migrated_scenes: number; total_scenes: number }>('POST', `/produktionen/${encodeURIComponent(produktionId)}/absatzformate/migrate-content`),

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
    return request<{
      results: any[]
      total: number
      total_scenes: number
      locked_count: number
      fallback_count: number
      has_more: boolean
    }>('GET', `/search?${qs.toString()}`)
  },

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
  importFutureBeats: (strangId: string, data: { text: string; block_label?: string; ebene?: string; folge_id?: number }) =>
    request<{ created: any[]; count: number }>('POST', `/straenge/${strangId}/future-import`, data),
  rasterGenerieren: (strangId: string, folgeIds: number[]) =>
    request<{ created: any[]; count: number }>('POST', `/straenge/${strangId}/raster-generieren`, { folge_ids: folgeIds }),

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
}
