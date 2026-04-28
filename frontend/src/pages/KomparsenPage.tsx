import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import AppShell from '../components/AppShell'
import EntitySidebar from '../components/figuren/EntitySidebar'
import FotoGalerie from '../components/figuren/FotoGalerie'
const FeldEditor = lazy(() => import('../components/figuren/FeldEditor'))
import { api } from '../api/client'
import { useSelectedProduction } from '../App'
import { Plus, X } from 'lucide-react'

export default function KomparsenPage() {
  const { selectedProduction } = useSelectedProduction()
  const staffelId = selectedProduction?.id ?? null
  const [searchParams, setSearchParams] = useSearchParams()

  const [characters, setCharacters] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('id'))
  const selected = characters.find(c => c.id === selectedId) ?? null

  const [fotos, setFotos] = useState<any[]>([])
  const [fotosLoading, setFotosLoading] = useState(false)
  const [uploading, setUploading] = useState(false)

  const [felder, setFelder] = useState<any[]>([])
  const [feldwerte, setFeldwerte] = useState<any[]>([])

  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [showNewForm, setShowNewForm] = useState(false)

  const loadCharacters = useCallback(async () => {
    if (!staffelId) return
    setLoading(true)
    try {
      const all = await api.getCharacters(staffelId)
      setCharacters(all.filter((c: any) => c.kategorie_typ === 'komparse'))
    } finally {
      setLoading(false)
    }
  }, [staffelId])

  useEffect(() => { loadCharacters() }, [loadCharacters])

  useEffect(() => {
    if (!staffelId) return
    api.getCharakterFelder(staffelId)
      .then(f => setFelder(f.filter((x: any) => x.gilt_fuer === 'alle' || x.gilt_fuer === 'komparse')))
      .catch(() => {})
  }, [staffelId])

  useEffect(() => {
    if (!selectedId) { setFotos([]); setFeldwerte([]); return }
    setFotosLoading(true)
    Promise.all([
      api.getCharacterFotos(selectedId).then(setFotos).catch(() => setFotos([])),
      api.getCharacterFeldwerte(selectedId).then(setFeldwerte).catch(() => setFeldwerte([])),
    ]).finally(() => setFotosLoading(false))
  }, [selectedId])

  const handleSelect = (id: string) => {
    setSelectedId(id)
    setSearchParams({ id })
  }

  const handleCreate = async () => {
    if (!newName.trim() || !staffelId) return
    setCreating(true)
    try {
      const char = await api.createCharacter({ name: newName.trim(), staffel_id: staffelId })
      await loadCharacters()
      setSelectedId(char.id)
      setNewName('')
      setShowNewForm(false)
    } finally {
      setCreating(false)
    }
  }

  const handleAktivieren = async (id: string) => {
    if (!staffelId) return
    await api.aktiviereCharacter(id, staffelId)
    await loadCharacters()
  }

  const handleUpload = async (file: File) => {
    if (!selectedId) return
    setUploading(true)
    try { const foto = await api.uploadCharacterFoto(selectedId, file); setFotos(prev => [...prev, foto]) }
    finally { setUploading(false) }
  }

  const handleDeleteFoto = async (fotoId: number) => {
    if (!selectedId) return
    await api.deleteCharacterFoto(selectedId, fotoId)
    setFotos(prev => prev.filter(f => f.id !== fotoId))
  }

  const handleSetPrimaer = async (fotoId: number) => {
    if (!selectedId) return
    await api.updateCharacterFoto(selectedId, fotoId, { ist_primaer: true })
    setFotos(prev => prev.map(f => ({ ...f, ist_primaer: f.id === fotoId })))
  }

  const handleLabelChange = async (fotoId: number, label: string) => {
    if (!selectedId) return
    await api.updateCharacterFoto(selectedId, fotoId, { label })
    setFotos(prev => prev.map(f => f.id === fotoId ? { ...f, label } : f))
  }

  const handleReorder = async (order: { id: number; sort_order: number }[]) => {
    if (!selectedId) return
    await api.reorderCharacterFotos(selectedId, order)
    setFotos(prev => { const map = new Map(order.map(o => [o.id, o.sort_order])); return prev.map(f => ({ ...f, sort_order: map.get(f.id) ?? f.sort_order })) })
  }

  const handleFeldChange = async (feldId: number, wertText: string | null, wertJson: any) => {
    if (!selectedId) return
    const saved = await api.setCharacterFeldwert(selectedId, feldId, { wert_text: wertText, wert_json: wertJson })
    setFeldwerte(prev => {
      const idx = prev.findIndex(v => v.feld_id === feldId)
      if (idx >= 0) return prev.map((v, i) => i === idx ? { ...v, ...saved } : v)
      return [...prev, saved]
    })
  }

  const FOTO_BASE = '/uploads/script-fotos/'
  const THUMB_BASE = '/uploads/script-fotos/thumbnails/'

  const sidebarCharacters = characters.map((c: any) => ({
    ...c,
    primaerFoto: c.primaer_thumbnail_dateiname
      ? `${THUMB_BASE}${c.primaer_thumbnail_dateiname}`
      : c.primaer_foto_dateiname && c.primaer_media_typ === 'image'
        ? `${FOTO_BASE}${c.primaer_foto_dateiname}`
        : null,
  }))

  return (
    <AppShell hideProductionSelector={false}>
      <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
        <EntitySidebar
          entities={sidebarCharacters}
          selectedId={selectedId}
          onSelect={handleSelect}
          onNew={() => setShowNewForm(true)}
          onAktivieren={handleAktivieren}
          loading={loading}
          numberKey="komparsen_nummer"
        />

        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          {!staffelId && <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Bitte eine Produktion auswählen.</div>}

          {staffelId && !selected && !showNewForm && (
            <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
              Komparse aus der Liste auswählen oder <button onClick={() => setShowNewForm(true)} style={{ border: 'none', background: 'none', color: 'var(--text)', cursor: 'pointer', fontWeight: 600, fontSize: 14, padding: 0, textDecoration: 'underline' }}>neuen anlegen</button>.
            </div>
          )}

          {showNewForm && (
            <div style={{ maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Neuer Komparse</h2>
              <input
                autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                placeholder="Name…"
                style={{ fontSize: 14, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--text)' }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleCreate} disabled={!newName.trim() || creating}
                  style={{ fontSize: 13, padding: '7px 16px', background: 'var(--text)', color: 'var(--bg)', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Plus size={13} /> {creating ? 'Anlegen…' : 'Anlegen'}
                </button>
                <button onClick={() => setShowNewForm(false)}
                  style={{ fontSize: 13, padding: '7px 12px', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', background: 'transparent', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <X size={13} /> Abbrechen
                </button>
              </div>
            </div>
          )}

          {selected && (
            <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
              <div style={{ flexShrink: 0 }}>
                {!fotosLoading && (
                  <FotoGalerie
                    fotos={fotos} aspect="portrait"
                    onUpload={handleUpload} onDelete={handleDeleteFoto}
                    onSetPrimaer={handleSetPrimaer} onLabelChange={handleLabelChange}
                    onReorder={handleReorder} uploading={uploading}
                  />
                )}
              </div>

              <div style={{ flex: 1, minWidth: 280, display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 4px' }}>{selected.name}</h2>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {selected.komparsen_nummer && (
                      <span style={{ fontSize: 11, padding: '2px 8px', background: 'var(--bg-subtle)', borderRadius: 12, color: 'var(--text-secondary)' }}>#{selected.komparsen_nummer}</span>
                    )}
                    {selected.kategorie_name && (
                      <span style={{ fontSize: 11, padding: '2px 8px', background: 'var(--bg-subtle)', borderRadius: 12, color: 'var(--text-secondary)' }}>{selected.kategorie_name}</span>
                    )}
                  </div>
                </div>

                {felder.map(f => {
                  const wert = feldwerte.find(v => v.feld_id === f.id)
                  return <Suspense key={f.id} fallback={null}><FeldEditor feld={f} wert={wert} onChange={handleFeldChange} characterId={selectedId ?? undefined} /></Suspense>
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
