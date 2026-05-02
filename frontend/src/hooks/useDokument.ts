import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../api/client'

export interface DokumentMeta {
  id: string
  typ: string
  staffel_id: string
  folge_nummer: number
  erstellt_von: string
  erstellt_am: string
  fassung_id?: string
  fassung_nummer?: number
  fassung_label?: string
  sichtbarkeit?: string
  abgegeben?: boolean
  zuletzt_geaendert_am?: string
  zuletzt_geaendert_von?: string
}

export interface FassungMeta {
  id: string
  dokument_id: string
  fassung_nummer: number
  fassung_label: string | null
  sichtbarkeit: string
  abgegeben: boolean
  abgegeben_am: string | null
  abgegeben_von: string | null
  erstellt_von: string
  erstellt_am: string
  zuletzt_geaendert_am: string | null
  zuletzt_geaendert_von: string | null
  seitenformat: string
  format_template_id: number | null
  colab_gruppe_id: number | null
  _access?: 'rw' | 'review' | 'r' | null
}

export interface FassungWithInhalt extends FassungMeta {
  inhalt: any  // ProseMirror JSON
  plaintext_index: string | null
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export function useDokument(staffelId: string | null, folgeNummer: number | null) {
  const [dokumente, setDokumente] = useState<DokumentMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!staffelId || !folgeNummer) return
    setLoading(true)
    setError(null)
    try {
      const rows = await api.getDokumente(staffelId, folgeNummer)
      setDokumente(rows)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [staffelId, folgeNummer])

  useEffect(() => { load() }, [load])

  const createDokument = useCallback(async (typ: string) => {
    if (!staffelId || !folgeNummer) return null
    const result = await api.createDokument(staffelId, folgeNummer, typ)
    await load()
    return result
  }, [staffelId, folgeNummer, load])

  return { dokumente, loading, error, reload: load, createDokument }
}

export function useFassung(dokumentId: string | null) {
  const [fassungen, setFassungen] = useState<FassungMeta[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!dokumentId) { setFassungen([]); return }
    setLoading(true)
    try {
      const rows = await api.getFassungen(dokumentId)
      setFassungen(rows)
    } catch { setFassungen([]) }
    finally { setLoading(false) }
  }, [dokumentId])

  useEffect(() => { load() }, [load])

  return { fassungen, loading, reload: load }
}

// ── Werkstufen-Modell (v2) ──────────────────────────────────────────────────

export interface WerkstufeMeta {
  id: string
  folge_id: number
  typ: string
  version_nummer: number
  label: string | null
  bearbeitung_status: string
  erstellt_von: string | null
  erstellt_am: string
  szenen_count: number
  staffel_id?: string
  folge_nummer?: number
}

export function useWerkstufe(folgeId: number | null) {
  const [werkstufen, setWerkstufen] = useState<WerkstufeMeta[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!folgeId) { setWerkstufen([]); return }
    setLoading(true)
    try {
      const rows = await api.getWerkstufen(folgeId)
      setWerkstufen(rows)
    } catch { setWerkstufen([]) }
    finally { setLoading(false) }
  }, [folgeId])

  useEffect(() => { load() }, [load])

  const createWerkstufe = useCallback(async (typ: string, label?: string) => {
    if (!folgeId) return null
    const result = await api.createWerkstufe(folgeId, { typ, label })
    await load()
    return result
  }, [folgeId, load])

  return { werkstufen, loading, reload: load, createWerkstufe }
}

export function formatStoppzeit(sek: number | null | undefined): string {
  if (!sek && sek !== 0) return ''
  const m = Math.floor(sek / 60)
  const s = sek % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function isInhaltEmpty(inhalt: any): boolean {
  if (!inhalt) return true
  if (typeof inhalt === 'object' && Object.keys(inhalt).length === 0) return true
  if (inhalt.type === 'doc' && Array.isArray(inhalt.content)) {
    return inhalt.content.every((n: any) =>
      n.type === 'paragraph' && (!n.content || n.content.length === 0)
    )
  }
  return false
}

function composeSzenenToDoc(szenen: any[], editorType: 'screenplay' | 'richtext'): any {
  const nodes: any[] = []
  for (const sz of szenen) {
    if (!sz.content) continue
    const content = Array.isArray(sz.content) ? sz.content : (sz.content?.content ?? [])
    for (const node of content) {
      nodes.push(node)
    }
  }
  if (nodes.length === 0) return null
  return { type: 'doc', content: nodes }
}

export function useFassungContent(dokumentId: string | null, fassungId: string | null) {
  const [fassung, setFassung] = useState<FassungWithInhalt | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [loading, setLoading] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!dokumentId || !fassungId) { setFassung(null); return }
    setLoading(true)
    api.getFassung(dokumentId, fassungId)
      .then(async (data) => {
        // If inhalt is empty, compose from dokument_szenen content
        if (isInhaltEmpty(data.inhalt)) {
          try {
            const szenen = await api.getFassungsSzenen(fassungId)
            if (szenen.length > 0) {
              const composed = composeSzenenToDoc(szenen, 'screenplay')
              if (composed) {
                data = { ...data, inhalt: composed }
              }
            }
          } catch { /* ignore, show empty */ }
        }
        setFassung(data)
      })
      .catch(() => setFassung(null))
      .finally(() => setLoading(false))
  }, [dokumentId, fassungId])

  const save = useCallback(async (inhalt: any, label?: string) => {
    if (!dokumentId || !fassungId) return
    setSaveStatus('saving')
    try {
      const updated = await api.saveFassung(dokumentId, fassungId, { inhalt, fassung_label: label })
      setFassung(prev => prev ? { ...prev, ...updated } : updated)
      setSaveStatus('saved')
    } catch {
      setSaveStatus('error')
    }
  }, [dokumentId, fassungId])

  // Debounced auto-save
  const scheduleSave = useCallback((inhalt: any) => {
    setSaveStatus('saving')
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => save(inhalt), 1500)
  }, [save])

  // Cleanup
  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }, [])

  return { fassung, loading, saveStatus, save, scheduleSave }
}
