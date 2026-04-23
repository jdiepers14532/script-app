const BASE = '/api'

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
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
  getBloecke: (staffelId: string) => request<any[]>('GET', `/staffeln/${staffelId}/bloecke`),

  // Episoden
  getEpisoden: (blockId: number) => request<any[]>('GET', `/bloecke/${blockId}/episoden`),
  getEpisode: (id: number) => request<any>('GET', `/episoden/${id}`),
  createEpisode: (blockId: number, data: any) => request<any>('POST', `/bloecke/${blockId}/episoden`, data),
  updateEpisode: (id: number, data: any) => request<any>('PUT', `/episoden/${id}`, data),

  // Stages
  getStages: (episodeId: number) => request<any[]>('GET', `/episoden/${episodeId}/stages`),
  createStage: (episodeId: number, data: any) => request<any>('POST', `/episoden/${episodeId}/stages`, data),
  updateStage: (id: number, data: any) => request<any>('PUT', `/stages/${id}`, data),

  // Szenen
  getSzenen: (stageId: number) => request<any[]>('GET', `/stages/${stageId}/szenen`),
  getSzene: (id: number) => request<any>('GET', `/szenen/${id}`),
  createSzene: (stageId: number, data: any) => request<any>('POST', `/stages/${stageId}/szenen`, data),
  updateSzene: (id: number, data: any) => request<any>('PUT', `/szenen/${id}`, data),
  deleteSzene: (id: number) => request<void>('DELETE', `/szenen/${id}`),

  // Locks
  getLock: (episodeId: number) => request<any>('GET', `/episoden/${episodeId}/lock`),
  createLock: (episodeId: number, data?: any) => request<any>('POST', `/episoden/${episodeId}/lock`, data || {}),
  deleteLock: (episodeId: number) => request<void>('DELETE', `/episoden/${episodeId}/lock`),
  takeoverLock: (episodeId: number) => request<any>('POST', `/episoden/${episodeId}/lock/takeover`, {}),

  // Szenen Versionen
  getVersionen: (szeneId: number) => request<any[]>('GET', `/szenen/${szeneId}/versionen`),
  createVersion: (szeneId: number, data: any) => request<any>('POST', `/szenen/${szeneId}/versionen`, data),
  restoreVersion: (szeneId: number, versionId: number) => request<any>('POST', `/szenen/${szeneId}/versionen/${versionId}/restore`, {}),

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

  // Export
  exportPdf: (stageId: number) => fetch(`${BASE}/stages/${stageId}/export/pdf`, { credentials: 'include' }),
  exportFountain: (stageId: number) => fetch(`${BASE}/stages/${stageId}/export/fountain`, { credentials: 'include' }),
  exportFdx: (stageId: number) => fetch(`${BASE}/stages/${stageId}/export/fdx`, { credentials: 'include' }),
  exportDrehplan: (stageId: number) => request<any[]>('GET', `/stages/${stageId}/drehplan-export`),
}
