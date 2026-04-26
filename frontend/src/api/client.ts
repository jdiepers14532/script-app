const BASE = '/api'

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
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
  // Staffeln
  getStaffel: (id: string) => request<any>('GET', `/staffeln/${id}`),

  // Blöcke — live from ProdDB, returns { proddb_id, block_nummer, folge_von, folge_bis, ... }
  getBloecke: (staffelId: string) => request<any[]>('GET', `/staffeln/${staffelId}/bloecke`),

  // Folgen metadata (arbeitstitel, synopsis, air_date)
  getFolge: (staffelId: string, folgeNummer: number) =>
    request<any>('GET', `/folgen/${staffelId}/${folgeNummer}`),
  updateFolge: (staffelId: string, folgeNummer: number, data: any) =>
    request<any>('PUT', `/folgen/${staffelId}/${folgeNummer}`, data),

  // Stages
  getStages: (staffelId: string, folgeNummer: number) =>
    request<any[]>('GET', `/stages?staffel_id=${encodeURIComponent(staffelId)}&folge_nummer=${folgeNummer}`),
  createStage: (staffelId: string, folgeNummer: number, proddbBlockId: string | null, data: any) =>
    request<any>('POST', '/stages', { staffel_id: staffelId, folge_nummer: folgeNummer, proddb_block_id: proddbBlockId, ...data }),
  updateStage: (id: number, data: any) => request<any>('PUT', `/stages/${id}`, data),

  // Szenen
  getSzenen: (stageId: number) => request<any[]>('GET', `/stages/${stageId}/szenen`),
  getSzene: (id: number) => request<any>('GET', `/szenen/${id}`),
  createSzene: (stageId: number, data: any) => request<any>('POST', `/stages/${stageId}/szenen`, data),
  updateSzene: (id: number, data: any) => request<any>('PUT', `/szenen/${id}`, data),
  deleteSzene: (id: number) => request<void>('DELETE', `/szenen/${id}`),

  // Locks (keyed by staffelId + folgeNummer)
  getLock: (staffelId: string, folgeNummer: number) =>
    request<any>('GET', `/folgen/${staffelId}/${folgeNummer}/lock`),
  createLock: (staffelId: string, folgeNummer: number) =>
    request<any>('POST', `/folgen/${staffelId}/${folgeNummer}/lock`, {}),
  deleteLock: (staffelId: string, folgeNummer: number) =>
    request<void>('DELETE', `/folgen/${staffelId}/${folgeNummer}/lock`),
  takeoverLock: (staffelId: string, folgeNummer: number) =>
    request<any>('POST', `/folgen/${staffelId}/${folgeNummer}/lock/takeover`, {}),

  // Szenen Versionen
  getVersionen: (szeneId: number) => request<any[]>('GET', `/szenen/${szeneId}/versionen`),
  createVersion: (szeneId: number, data: any) => request<any>('POST', `/szenen/${szeneId}/versionen`, data),
  restoreVersion: (szeneId: number, versionId: number) =>
    request<any>('POST', `/szenen/${szeneId}/versionen/${versionId}/restore`, {}),

  // Entities
  getEntities: (params?: { staffel_id?: string; type?: string; q?: string }) => {
    const qs = params ? '?' + new URLSearchParams(params as any).toString() : ''
    return request<any[]>('GET', `/entities${qs}`)
  },
  createEntity: (data: any) => request<any>('POST', '/entities', data),
  updateEntity: (id: number, data: any) => request<any>('PUT', `/entities/${id}`, data),

  // KI
  getKiSettings: () => request<any[]>('GET', '/admin/ki-settings'),
  updateKiSetting: (funktion: string, data: any) => request<any>('PUT', `/admin/ki-settings/${funktion}`, data),
  kiSceneSummary: (data: any) => request<any>('POST', '/ki/scene-summary', data),
  kiEntityDetect: (data: any) => request<any>('POST', '/ki/entity-detect', data),
  kiStyleCheck: (data: any) => request<any>('POST', '/ki/style-check', data),
  kiSynopsis: (data: any) => request<any>('POST', '/ki/synopsis', data),

  // Kommentare
  getKommentare: (szeneId: number) => request<any[]>('GET', `/szenen/${szeneId}/kommentare`),
  createKommentar: (szeneId: number, data: any) => request<any>('POST', `/szenen/${szeneId}/kommentare`, data),
  resolveKommentar: (id: number) => request<any>('PATCH', `/kommentare/${id}/resolve`, {}),
  deleteKommentar: (id: number) => request<void>('DELETE', `/kommentare/${id}`),

  // User settings
  getSettings: () => request<any>('GET', '/me/settings'),
  updateSettings: (data: { selected_production_id?: string | null; ui_settings?: Record<string, any> }) =>
    request<any>('PUT', '/me/settings', data),

  // Export
  exportPdf: (stageId: number) => fetch(`${BASE}/stages/${stageId}/export/pdf`, { credentials: 'include' }),
  exportFountain: (stageId: number) => fetch(`${BASE}/stages/${stageId}/export/fountain`, { credentials: 'include' }),
  exportFdx: (stageId: number) => fetch(`${BASE}/stages/${stageId}/export/fdx`, { credentials: 'include' }),
  exportDrehplan: (stageId: number) => request<any[]>('GET', `/stages/${stageId}/drehplan-export`),
  exportRevisionSummary: (stageId: number) => request<any>('GET', `/stages/${stageId}/export/revision-summary`),

  // Import with metadata opt-in
  importPreview: (file: File) => {
    const fd = new FormData(); fd.append('file', file)
    return fetch(`${BASE}/import/preview`, { method: 'POST', credentials: 'include', body: fd }).then(r => r.json())
  },
  importCommit: (file: File, params: {
    staffel_id: string; folge_nummer: number
    proddb_block_id?: string; stage_type?: string; save_metadata?: boolean
  }) => {
    const fd = new FormData(); fd.append('file', file)
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined) fd.append(k, String(v)) })
    return fetch(`${BASE}/import/commit`, { method: 'POST', credentials: 'include', body: fd }).then(r => r.json())
  },

  // Stage Labels
  getStageLabels: (staffelId: string) =>
    request<any[]>('GET', `/staffeln/${encodeURIComponent(staffelId)}/stage-labels`),
  createStageLabel: (staffelId: string, data: any) =>
    request<any>('POST', `/staffeln/${encodeURIComponent(staffelId)}/stage-labels`, data),
  updateStageLabel: (staffelId: string, labelId: number, data: any) =>
    request<any>('PUT', `/staffeln/${encodeURIComponent(staffelId)}/stage-labels/${labelId}`, data),
  deleteStageLabel: (staffelId: string, labelId: number) =>
    request<void>('DELETE', `/staffeln/${encodeURIComponent(staffelId)}/stage-labels/${labelId}`),
  reorderStageLabels: (staffelId: string, order: {id: number, sort_order: number}[]) =>
    request<any[]>('PATCH', `/staffeln/${encodeURIComponent(staffelId)}/stage-labels/reorder`, { order }),

  // Revision Colors
  getRevisionColors: (staffelId: string) =>
    request<any[]>('GET', `/staffeln/${encodeURIComponent(staffelId)}/revision-colors`),
  createRevisionColor: (staffelId: string, data: any) =>
    request<any>('POST', `/staffeln/${encodeURIComponent(staffelId)}/revision-colors`, data),
  updateRevisionColor: (staffelId: string, colorId: number, data: any) =>
    request<any>('PUT', `/staffeln/${encodeURIComponent(staffelId)}/revision-colors/${colorId}`, data),
  deleteRevisionColor: (staffelId: string, colorId: number) =>
    request<void>('DELETE', `/staffeln/${encodeURIComponent(staffelId)}/revision-colors/${colorId}`),
  reorderRevisionColors: (staffelId: string, order: {id: number, sort_order: number}[]) =>
    request<any[]>('PATCH', `/staffeln/${encodeURIComponent(staffelId)}/revision-colors/reorder`, { order }),

  // Revision Einstellungen
  getRevisionEinstellungen: (staffelId: string) =>
    request<any>('GET', `/staffeln/${encodeURIComponent(staffelId)}/revision-einstellungen`),
  updateRevisionEinstellungen: (staffelId: string, data: any) =>
    request<any>('PUT', `/staffeln/${encodeURIComponent(staffelId)}/revision-einstellungen`, data),

  // Characters
  getCharacters: (staffelId: string) =>
    request<any[]>('GET', `/characters?staffel_id=${encodeURIComponent(staffelId)}`),
  createCharacter: (data: any) => request<any>('POST', '/characters', data),
  updateCharacter: (id: string, data: any) => request<any>('PUT', `/characters/${id}`, data),
  getCharKategorien: (staffelId: string) =>
    request<any[]>('GET', `/staffeln/${encodeURIComponent(staffelId)}/character-kategorien`),
  createCharKategorie: (staffelId: string, data: any) =>
    request<any>('POST', `/staffeln/${encodeURIComponent(staffelId)}/character-kategorien`, data),
  updateCharKategorie: (staffelId: string, katId: number, data: any) =>
    request<any>('PUT', `/staffeln/${encodeURIComponent(staffelId)}/character-kategorien/${katId}`, data),
  deleteCharKategorie: (staffelId: string, katId: number) =>
    request<void>('DELETE', `/staffeln/${encodeURIComponent(staffelId)}/character-kategorien/${katId}`),
  reorderCharKategorien: (staffelId: string, order: {id: number, sort_order: number}[]) =>
    request<any[]>('PATCH', `/staffeln/${encodeURIComponent(staffelId)}/character-kategorien/reorder`, { order }),
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

  // Revisionen
  getSzeneRevisionen: (szeneId: number, stageId?: number) => {
    const qs = stageId ? `?stage_id=${stageId}` : ''
    return request<any[]>('GET', `/szenen/${szeneId}/revisionen${qs}`)
  },
  createSzeneRevision: (szeneId: number, data: any) =>
    request<any>('POST', `/szenen/${szeneId}/revisionen`, data),

  // Vorstopp
  getVorstopp: (szeneId: number) =>
    request<any>('GET', `/szenen/${szeneId}/vorstopp`),
  addVorstopp: (szeneId: number, data: { stage: string; dauer_sekunden: number; methode?: string; user_name?: string }) =>
    request<any>('POST', `/szenen/${szeneId}/vorstopp`, data),
  deleteVorstopp: (szeneId: number, entryId: number) =>
    request<void>('DELETE', `/szenen/${szeneId}/vorstopp/${entryId}`),
  autoVorstopp: (szeneId: number) =>
    request<any>('POST', `/szenen/${szeneId}/vorstopp/auto`, {}),
  getVorstoppEinstellungen: (staffelId: string) =>
    request<any>('GET', `/staffeln/${encodeURIComponent(staffelId)}/vorstopp-einstellungen`),
  updateVorstoppEinstellungen: (staffelId: string, data: any) =>
    request<any>('PUT', `/staffeln/${encodeURIComponent(staffelId)}/vorstopp-einstellungen`, data),

  // Copy settings between staffeln
  copySettings: (staffelId: string, data: { source_staffel_id: string; sections: string[] }) =>
    request<any>('POST', `/staffeln/${encodeURIComponent(staffelId)}/copy-settings`, data),

  // Admin: watermark decoder
  watermarkDecode: (file: File) => {
    const fd = new FormData(); fd.append('file', file)
    return fetch(`${BASE}/admin/watermark/decode`, { method: 'POST', credentials: 'include', body: fd }).then(r => r.json())
  },
  watermarkLogs: (limit = 100) => request<any[]>('GET', `/admin/watermark/logs?limit=${limit}`),
}
