import { useState, useEffect, useCallback } from 'react'
import AppShell from '../components/AppShell'
import EntitySidebar from '../components/figuren/EntitySidebar'
import FotoGalerie from '../components/figuren/FotoGalerie'
import FeldEditor from '../components/figuren/FeldEditor'
import { api } from '../api/client'
import { useSelectedProduction } from '../App'
import { Plus, X } from 'lucide-react'

interface Motiv {
  id: string
  name: string
  motiv_nummer?: string | null
  typ: string
  meta_json: any
}

export default function MotivenPage() {
  const { selectedProduction } = useSelectedProduction()
  const staffelId = selectedProduction?.id ?? null

  const [motive, setMotive] = useState<Motiv[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = motive.find(m => m.id === selectedId) ?? null

  const [fotos, setFotos] = useState<any[]>([])
  const [fotosLoading, setFotosLoading] = useState(false)
  const [uploading, setUploading] = useState(false)

  const [felder, setFelder] = useState<any[]>([])
  const [feldwerte, setFeldwerte] = useState<any[]>([])

  const [showNewForm, setShowNewForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newNummer, setNewNummer] = useState('')
  const [newTyp, setNewTyp] = useState<'interior' | 'exterior' | 'both'>('interior')
  const [creating, setCreating] = useState(false)

  const loadMotive = useCallback(async () => {
    if (!staffelId) return
    setLoading(true)
    try { setMotive(await api.getMotive(staffelId)) }
    finally { setLoading(false) }
  }, [staffelId])

  useEffect(() => { loadMotive() }, [loadMotive])

  useEffect(() => {
    if (!staffelId) return
    api.getCharakterFelder(staffelId)
      .then(f => {
        const relevant = f.filter((x: any) => x.gilt_fuer === 'alle' || x.gilt_fuer === 'motiv')
        relevant.sort((a: any, b: any) => {
          const aOrder = a.gilt_fuer === 'motiv' ? 0 : 1
          const bOrder = b.gilt_fuer === 'motiv' ? 0 : 1
          if (aOrder !== bOrder) return aOrder - bOrder
          return a.sort_order - b.sort_order
        })
        setFelder(relevant)
      })
      .catch(() => {})
  }, [staffelId])

  useEffect(() => {
    if (!selectedId) { setFotos([]); setFeldwerte([]); return }
    setFotosLoading(true)
    Promise.all([
      api.getMotivFotos(selectedId).then(setFotos).catch(() => setFotos([])),
      api.getMotivFeldwerte(selectedId).then(setFeldwerte).catch(() => setFeldwerte([])),
    ]).finally(() => setFotosLoading(false))
  }, [selectedId])

  const handleCreate = async () => {
    if (!newName.trim() || !staffelId) return
    setCreating(true)
    try {
      const m = await api.createMotiv(staffelId, { name: newName.trim(), motiv_nummer: newNummer || null, typ: newTyp })
      await loadMotive()
      setSelectedId(m.id)
      setNewName(''); setNewNummer(''); setNewTyp('interior')
      setShowNewForm(false)
    } finally { setCreating(false) }
  }

  const handleUpload = async (file: File) => {
    if (!selectedId) return
    setUploading(true)
    try { const f = await api.uploadMotivFoto(selectedId, file); setFotos(prev => [...prev, f]) }
    finally { setUploading(false) }
  }

  const handleDeleteFoto = async (fotoId: number) => {
    if (!selectedId) return
    await api.deleteMotivFoto(selectedId, fotoId)
    setFotos(prev => prev.filter(f => f.id !== fotoId))
  }

  const handleSetPrimaer = async (fotoId: number) => {
    if (!selectedId) return
    await api.updateMotivFoto(selectedId, fotoId, { ist_primaer: true })
    setFotos(prev => prev.map(f => ({ ...f, ist_primaer: f.id === fotoId })))
  }

  const handleLabelChange = async (fotoId: number, label: string) => {
    if (!selectedId) return
    await api.updateMotivFoto(selectedId, fotoId, { label })
    setFotos(prev => prev.map(f => f.id === fotoId ? { ...f, label } : f))
  }

  const handleReorder = async (order: { id: number; sort_order: number }[]) => {
    if (!selectedId) return
    await api.reorderMotivFotos(selectedId, order)
    setFotos(prev => { const map = new Map(order.map(o => [o.id, o.sort_order])); return prev.map(f => ({ ...f, sort_order: map.get(f.id) ?? f.sort_order })) })
  }

  const handleFeldChange = async (feldId: number, wertText: string | null, wertJson: any) => {
    if (!selectedId) return
    const saved = await api.setMotivFeldwert(selectedId, feldId, { wert_text: wertText, wert_json: wertJson })
    setFeldwerte(prev => {
      const idx = prev.findIndex(v => v.feld_id === feldId)
      if (idx >= 0) return prev.map((v, i) => i === idx ? { ...v, ...saved } : v)
      return [...prev, saved]
    })
  }

  const FOTO_BASE = '/uploads/script-fotos/'
  const THUMB_BASE = '/uploads/script-fotos/thumbnails/'

  // Adapt motive to EntitySidebar shape (no rollen/komparsen_nummer → use motiv_nummer as display)
  const sidebarEntities = (motive as any[]).map(m => ({
    id: m.id,
    name: m.name,
    rollen_nummer: m.motiv_nummer ? parseInt(m.motiv_nummer) || null : null,
    is_active: true,
    primaerFoto: m.primaer_thumbnail_dateiname
      ? `${THUMB_BASE}${m.primaer_thumbnail_dateiname}`
      : m.primaer_foto_dateiname && m.primaer_media_typ === 'image'
        ? `${FOTO_BASE}${m.primaer_foto_dateiname}`
        : null,
  }))

  const TYP_LABELS: Record<string, string> = { interior: 'Innen', exterior: 'Außen', both: 'Innen/Außen' }

  return (
    <AppShell hideProductionSelector={false}>
      <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
        <EntitySidebar
          entities={sidebarEntities}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onNew={() => setShowNewForm(true)}
          loading={loading}
          numberKey="rollen_nummer"
        />

        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          {!staffelId && <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Bitte eine Produktion auswählen.</div>}

          {staffelId && !selected && !showNewForm && (
            <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
              Motiv aus der Liste auswählen oder <button onClick={() => setShowNewForm(true)} style={{ border: 'none', background: 'none', color: 'var(--text)', cursor: 'pointer', fontWeight: 600, fontSize: 14, padding: 0, textDecoration: 'underline' }}>neues anlegen</button>.
            </div>
          )}

          {showNewForm && (
            <div style={{ maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Neues Motiv</h2>
              <input
                autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                placeholder="Motiv-Bezeichnung…"
                style={{ fontSize: 14, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--text)' }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={newNummer} onChange={e => setNewNummer(e.target.value)} placeholder="Nummer (optional)"
                  style={{ flex: 1, fontSize: 13, padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--text)' }}
                />
                <select value={newTyp} onChange={e => setNewTyp(e.target.value as any)}
                  style={{ fontSize: 13, padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--text)' }}>
                  <option value="interior">Innen</option>
                  <option value="exterior">Außen</option>
                  <option value="both">Innen/Außen</option>
                </select>
              </div>
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
                    fotos={fotos} aspect="landscape"
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
                    {selected.motiv_nummer && (
                      <span style={{ fontSize: 11, padding: '2px 8px', background: 'var(--bg-subtle)', borderRadius: 12, color: 'var(--text-secondary)' }}>#{selected.motiv_nummer}</span>
                    )}
                    <span style={{ fontSize: 11, padding: '2px 8px', background: 'var(--bg-subtle)', borderRadius: 12, color: 'var(--text-secondary)' }}>{TYP_LABELS[selected.typ] ?? selected.typ}</span>
                  </div>
                </div>

                {felder.map(f => {
                  const wert = feldwerte.find(v => v.feld_id === f.id)
                  return <FeldEditor key={f.id} feld={f} wert={wert} onChange={handleFeldChange} />
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
