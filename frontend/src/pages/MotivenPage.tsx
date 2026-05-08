import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import AppShell from '../components/AppShell'
import EntitySidebar from '../components/figuren/EntitySidebar'
import FotoGalerie from '../components/figuren/FotoGalerie'
const FeldEditor = lazy(() => import('../components/figuren/FeldEditor'))
import { api } from '../api/client'
import { useSelectedProduction } from '../contexts'
import { Plus, X } from 'lucide-react'

const TYP_LABELS: Record<string, string> = {
  interior: 'INT',
  exterior: 'EXT',
  mixed:    'INT+EXT',
}

const TYP_OPTIONS = [
  { value: 'interior', label: 'Innen (INT)' },
  { value: 'exterior', label: 'Außen (EXT)' },
  { value: 'mixed',    label: 'Innen + Außen (INT+EXT)' },
]

const FOTO_BASE  = '/uploads/script-fotos/'
const THUMB_BASE = '/uploads/script-fotos/thumbnails/'

export default function MotivenPage() {
  const { selectedProduction } = useSelectedProduction()
  const produktionId = selectedProduction?.id ?? null
  const [searchParams, setSearchParams] = useSearchParams()

  const [motive, setMotive] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('id'))
  const selected = motive.find(m => m.id === selectedId) ?? null

  const [fotos, setFotos] = useState<any[]>([])
  const [fotosLoading, setFotosLoading] = useState(false)
  const [uploading, setUploading] = useState(false)

  const [felder, setFelder] = useState<any[]>([])
  const [feldwerte, setFeldwerte] = useState<any[]>([])

  const [showNewForm, setShowNewForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  const [editName, setEditName] = useState('')
  const [editTyp, setEditTyp] = useState('interior')
  const [editNummer, setEditNummer] = useState('')
  const [editIstStudio, setEditIstStudio] = useState(true)
  const [editFiktAdresse, setEditFiktAdresse] = useState('')
  const [saving, setSaving] = useState(false)

  const loadMotive = useCallback(async () => {
    if (!produktionId) return
    setLoading(true)
    try {
      setMotive(await api.getMotive(produktionId))
    } finally {
      setLoading(false)
    }
  }, [produktionId])

  useEffect(() => { loadMotive() }, [loadMotive])

  useEffect(() => {
    if (!produktionId) return
    api.getCharakterFelder(produktionId)
      .then(f => setFelder(f.filter((x: any) => x.gilt_fuer === 'alle' || x.gilt_fuer === 'motiv')))
      .catch(() => {})
  }, [produktionId])

  useEffect(() => {
    if (!selectedId) { setFotos([]); setFeldwerte([]); setEditFiktAdresse(''); return }
    setFotosLoading(true)
    Promise.all([
      api.getMotivFotos(selectedId).then(setFotos).catch(() => setFotos([])),
      api.getMotivFeldwerte(selectedId).then(werte => {
        setFeldwerte(werte)
        const fiktFeld = felder.find(f => f.name === 'Fiktionale Adresse in der Geschichte')
        if (fiktFeld) {
          const w = werte.find((v: any) => v.feld_id === fiktFeld.id)
          setEditFiktAdresse(w?.wert_text ?? '')
        }
      }).catch(() => setFeldwerte([])),
    ]).finally(() => setFotosLoading(false))
  }, [selectedId])

  // Sync edit fields when selection changes
  useEffect(() => {
    if (selected) {
      setEditName(selected.name)
      setEditTyp(selected.typ ?? 'interior')
      setEditNummer(selected.motiv_nummer ?? '')
      setEditIstStudio(selected.ist_studio ?? true)
    }
  }, [selected?.id])

  const handleSelect = (id: string) => {
    setSelectedId(id)
    setSearchParams({ id })
    setShowNewForm(false)
  }

  const handleCreate = async () => {
    if (!newName.trim() || !produktionId) return
    setCreating(true)
    try {
      const m = await api.createMotiv(produktionId, { name: newName.trim() })
      await loadMotive()
      setSelectedId(m.id)
      setSearchParams({ id: m.id })
      setNewName('')
      setShowNewForm(false)
    } finally {
      setCreating(false)
    }
  }

  const handleSave = async () => {
    if (!selectedId || !editName.trim()) return
    setSaving(true)
    try {
      const updated = await api.updateMotiv(selectedId, {
        name: editName.trim(),
        typ: editTyp,
        motiv_nummer: editNummer.trim() || null,
        ist_studio: editIstStudio,
      })
      setMotive(prev => prev.map(m => m.id === selectedId ? { ...m, ...updated } : m))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedId || !confirm('Motiv wirklich löschen? Alle Fotos und Feldwerte werden entfernt.')) return
    await api.deleteMotiv(selectedId)
    setSelectedId(null)
    setSearchParams({})
    await loadMotive()
  }

  const handleUpload = async (file: File) => {
    if (!selectedId) return
    setUploading(true)
    try {
      const foto = await api.uploadMotivFoto(selectedId, file)
      setFotos(prev => [...prev, foto])
    } finally {
      setUploading(false)
    }
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
    loadMotive() // refresh thumbnail in sidebar
  }

  const handleLabelChange = async (fotoId: number, label: string) => {
    if (!selectedId) return
    await api.updateMotivFoto(selectedId, fotoId, { label })
    setFotos(prev => prev.map(f => f.id === fotoId ? { ...f, label } : f))
  }

  const handleReorder = async (order: { id: number; sort_order: number }[]) => {
    if (!selectedId) return
    await api.reorderMotivFotos(selectedId, order)
    setFotos(prev => {
      const map = new Map(order.map(o => [o.id, o.sort_order]))
      return prev.map(f => ({ ...f, sort_order: map.get(f.id) ?? f.sort_order }))
    })
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

  const motivEntities = motive.map((m: any) => ({
    ...m,
    badge: `${TYP_LABELS[m.typ] ?? m.typ}${m.ist_studio === false ? ' · A.D.' : ''}`,
    primaerFoto: m.primaer_thumbnail_dateiname
      ? `${THUMB_BASE}${m.primaer_thumbnail_dateiname}`
      : m.primaer_foto_dateiname && m.primaer_media_typ === 'image'
        ? `${FOTO_BASE}${m.primaer_foto_dateiname}`
        : null,
  }))

  const isDirty = selected && (
    editName !== selected.name ||
    editTyp !== (selected.typ ?? 'interior') ||
    editNummer !== (selected.motiv_nummer ?? '') ||
    editIstStudio !== (selected.ist_studio ?? true)
  )

  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
    textTransform: 'uppercase', letterSpacing: '0.05em',
  }
  const inputStyle: React.CSSProperties = {
    fontSize: 14, padding: '6px 10px', border: '1px solid var(--border)',
    borderRadius: 8, background: 'var(--bg)', color: 'var(--text)',
  }

  return (
    <AppShell hideProductionSelector={false}>
      <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
        <EntitySidebar
          entities={motivEntities}
          selectedId={selectedId}
          onSelect={handleSelect}
          onNew={() => { setShowNewForm(true); setSelectedId(null); setSearchParams({}) }}
          loading={loading}
        />

        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          {!produktionId && (
            <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Bitte eine Produktion auswählen.</div>
          )}

          {produktionId && !selected && !showNewForm && (
            <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
              Motiv aus der Liste auswählen oder{' '}
              <button
                onClick={() => setShowNewForm(true)}
                style={{ border: 'none', background: 'none', color: 'var(--text)', cursor: 'pointer', fontWeight: 600, fontSize: 14, padding: 0, textDecoration: 'underline' }}
              >
                neues anlegen
              </button>.
            </div>
          )}

          {showNewForm && (
            <div style={{ maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Neues Motiv</h2>
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                placeholder="Name…"
                style={{ fontSize: 14, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--text)' }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim() || creating}
                  style={{ fontSize: 13, padding: '7px 16px', background: 'var(--text)', color: 'var(--bg)', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <Plus size={13} /> {creating ? 'Anlegen…' : 'Anlegen'}
                </button>
                <button
                  onClick={() => setShowNewForm(false)}
                  style={{ fontSize: 13, padding: '7px 12px', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', background: 'transparent', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <X size={13} /> Abbrechen
                </button>
              </div>
            </div>
          )}

          {selected && (
            <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
              {/* Left: Fotos */}
              <div style={{ flexShrink: 0 }}>
                {!fotosLoading && (
                  <FotoGalerie
                    fotos={fotos}
                    aspect="landscape"
                    onUpload={handleUpload}
                    onDelete={handleDeleteFoto}
                    onSetPrimaer={handleSetPrimaer}
                    onLabelChange={handleLabelChange}
                    onReorder={handleReorder}
                    uploading={uploading}
                  />
                )}
              </div>

              {/* Right: Stammdaten + Felder */}
              <div style={{ flex: 1, minWidth: 280, display: 'flex', flexDirection: 'column', gap: 24 }}>
                {/* Stammdaten */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 12, alignItems: 'end' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <label style={labelStyle}>Name</label>
                      <input value={editName} onChange={e => setEditName(e.target.value)} style={{ ...inputStyle, fontSize: 16, fontWeight: 600 }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <label style={labelStyle}>Nr.</label>
                      <input value={editNummer} onChange={e => setEditNummer(e.target.value)} placeholder="—" style={inputStyle} />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 20, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div>
                      <label style={{ ...labelStyle, display: 'block', marginBottom: 6 }}>Typ</label>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {TYP_OPTIONS.map(opt => (
                          <button
                            key={opt.value}
                            onClick={() => setEditTyp(opt.value)}
                            style={{
                              fontSize: 12, padding: '4px 12px', borderRadius: 6, cursor: 'pointer',
                              border: '1px solid',
                              borderColor: editTyp === opt.value ? 'var(--text)' : 'var(--border)',
                              background: editTyp === opt.value ? 'var(--text)' : 'transparent',
                              color: editTyp === opt.value ? 'var(--bg)' : 'var(--text)',
                            }}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label style={{ ...labelStyle, display: 'block', marginBottom: 6 }}>Drehort</label>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => setEditIstStudio(true)}
                          style={{
                            fontSize: 12, padding: '4px 12px', borderRadius: 6, cursor: 'pointer',
                            border: '1px solid',
                            borderColor: editIstStudio ? 'var(--text)' : 'var(--border)',
                            background: editIstStudio ? 'var(--text)' : 'transparent',
                            color: editIstStudio ? 'var(--bg)' : 'var(--text)',
                          }}
                        >
                          Studio
                        </button>
                        <button
                          onClick={() => setEditIstStudio(false)}
                          style={{
                            fontSize: 12, padding: '4px 12px', borderRadius: 6, cursor: 'pointer',
                            border: '1px solid',
                            borderColor: !editIstStudio ? 'var(--text)' : 'var(--border)',
                            background: !editIstStudio ? 'var(--text)' : 'transparent',
                            color: !editIstStudio ? 'var(--bg)' : 'var(--text)',
                          }}
                        >
                          Außendreh
                        </button>
                      </div>
                    </div>
                    {felder.some(f => f.name === 'Fiktionale Adresse in der Geschichte') && (
                      <div style={{ flex: 1, minWidth: 180 }}>
                        <label style={{ ...labelStyle, display: 'block', marginBottom: 6 }}>Fiktionale Adresse</label>
                        <input
                          value={editFiktAdresse}
                          onChange={e => setEditFiktAdresse(e.target.value)}
                          onBlur={async () => {
                            const f = felder.find(f => f.name === 'Fiktionale Adresse in der Geschichte')
                            if (f) await handleFeldChange(f.id, editFiktAdresse || null, null)
                          }}
                          placeholder="z. B. Musterstraße 12, Roseheim"
                          style={inputStyle}
                        />
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
                    <button
                      onClick={handleSave}
                      disabled={!isDirty || saving || !editName.trim()}
                      style={{
                        fontSize: 12, padding: '6px 14px', borderRadius: 7, cursor: isDirty ? 'pointer' : 'default',
                        border: '1px solid var(--border)',
                        background: isDirty ? 'var(--text)' : 'var(--bg-subtle)',
                        color: isDirty ? 'var(--bg)' : 'var(--text-secondary)',
                        transition: 'all 0.15s',
                      }}
                    >
                      {saving ? 'Speichern…' : 'Speichern'}
                    </button>
                    <button
                      onClick={handleDelete}
                      style={{ fontSize: 12, padding: '6px 14px', background: 'transparent', color: '#FF3B30', border: '1px solid #FF3B30', borderRadius: 7, cursor: 'pointer' }}
                    >
                      Löschen
                    </button>
                  </div>
                </div>

                {/* Custom Felder (Fiktionale Adresse is shown inline above) */}
                {felder.some(f => f.name !== 'Fiktionale Adresse in der Geschichte') && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px 28px', alignItems: 'start' }}>
                    {felder.filter(f => f.name !== 'Fiktionale Adresse in der Geschichte').map(f => {
                      const wert = feldwerte.find(v => v.feld_id === f.id)
                      return (
                        <div key={f.id} style={f.typ === 'richtext' ? { gridColumn: '1 / -1' } : {}}>
                          <Suspense fallback={null}>
                            <FeldEditor feld={f} wert={wert} onChange={handleFeldChange} />
                          </Suspense>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
