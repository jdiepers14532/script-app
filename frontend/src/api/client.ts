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
  getStaffeln: () => request<any[]>('GET', '/staffeln'),
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
}
