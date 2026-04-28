import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import AppShell from '../components/AppShell'
import EntitySidebar from '../components/figuren/EntitySidebar'
import FotoGalerie from '../components/figuren/FotoGalerie'
const FeldEditor = lazy(() => import('../components/figuren/FeldEditor'))
import BeziehungsPanel from '../components/figuren/BeziehungsPanel'
import RollenprofilImportModal from '../components/RollenprofilImportModal'
import { api } from '../api/client'
import { useSelectedProduction, useAppSettings } from '../contexts'
import { Plus, X, FileUp } from 'lucide-react'

const ROLLENPROFIL_LABELS: Record<string, string> = {
  alter: 'Alter / Geburtsjahr', kurzbeschreibung: 'Kurzbeschreibung',
  geburtsort: 'Geburtsort', familienstand: 'Familienstand', eltern: 'Eltern',
  verwandte: 'Kinder / Verwandte', beruf: 'Beruf', typ: 'Typ', charakter: 'Charakter',
  aussehen: 'Aussehen / Stil', dramaturgische_funktion: 'Dramaturgische Funktion',
  staerken: 'Stärken', schwaechem: 'Schwächen', verletzungen: 'Verletzungen / Wunden',
  leidenschaften: 'Ticks / Leidenschaften', wuensche: 'Wünsche / Ziele',
  inneres_ziel: 'Was braucht die Figur wirklich', cast_anbindung: 'Anbindung an Cast',
  produktion: 'Produktion', staffel: 'Staffel', folgen_range: 'Episodenbereich',
}
const ROLLENPROFIL_ORDER = [
  'kurzbeschreibung', 'alter', 'geburtsort', 'familienstand', 'eltern', 'verwandte', 'beruf',
  'produktion', 'staffel', 'folgen_range',
  'typ', 'charakter', 'aussehen', 'dramaturgische_funktion',
  'staerken', 'schwaechem', 'verletzungen', 'leidenschaften', 'wuensche', 'inneres_ziel', 'cast_anbindung',
]

function RollenprofilAnzeige({ data }: { data: Record<string, string> }) {
  const [expanded, setExpanded] = useState(false)
  const fields = ROLLENPROFIL_ORDER.filter(k => data[k]?.trim())
  if (fields.length === 0) return null
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <button
        onClick={() => setExpanded(e => !e)}
        style={{ width: '100%', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-subtle)', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
        Rollenprofil
        <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {fields.map(key => (
            <div key={key} style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8, fontSize: 13 }}>
              <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{ROLLENPROFIL_LABELS[key] || key}</span>
              <span style={{ whiteSpace: 'pre-wrap' }}>{data[key]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function RollenPage() {
  const { selectedProduction } = useSelectedProduction()
  const { figurenLabel } = useAppSettings()
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
  const [beziehungen, setBeziehungen] = useState<any[]>([])

  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [showNewForm, setShowNewForm] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)

  const loadCharacters = useCallback(async () => {
    if (!staffelId) return
    setLoading(true)
    try {
      const all = await api.getCharacters(staffelId)
      setCharacters(all.filter((c: any) => c.kategorie_typ === 'rolle' || c.kategorie_typ === null))
    } finally {
      setLoading(false)
    }
  }, [staffelId])

  useEffect(() => { loadCharacters() }, [loadCharacters])

  useEffect(() => {
    if (!staffelId) return
    api.getCharakterFelder(staffelId).catch(() => {})
    api.getCharakterFelder(staffelId)
      .then(f => setFelder(f.filter((x: any) => x.gilt_fuer === 'alle' || x.gilt_fuer === 'rolle')))
      .catch(() => {})
  }, [staffelId])

  useEffect(() => {
    if (!selectedId) { setFotos([]); setFeldwerte([]); setBeziehungen([]); return }
    setFotosLoading(true)
    Promise.all([
      api.getCharacterFotos(selectedId).then(setFotos).catch(() => setFotos([])),
      api.getCharacterFeldwerte(selectedId).then(setFeldwerte).catch(() => setFeldwerte([])),
      api.getCharacterBeziehungen(selectedId).then(setBeziehungen).catch(() => setBeziehungen([])),
    ]).finally(() => setFotosLoading(false))
  }, [selectedId])

  const handleSelect = (id: string) => {
    setSelectedId(id)
    setSearchParams({ id })
  }

  const handleNew = () => setShowNewForm(true)

  const handleImportSuccess = async (characterId: string, name: string) => {
    setShowImportModal(false)
    await loadCharacters()
    setSelectedId(characterId)
    setSearchParams({ id: characterId })
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
    try {
      const foto = await api.uploadCharacterFoto(selectedId, file)
      setFotos(prev => [...prev, foto])
    } finally {
      setUploading(false)
    }
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
    setFotos(prev => {
      const map = new Map(order.map(o => [o.id, o.sort_order]))
      return prev.map(f => ({ ...f, sort_order: map.get(f.id) ?? f.sort_order }))
    })
  }

  const handleFeldChange = async (feldId: number, wertText: string | null, wertJson: any) => {
    if (!selectedId) return
    const saved = await api.setCharacterFeldwert(selectedId, feldId, { wert_text: wertText, wert_json: wertJson })
    setFeldwerte(prev => {
      const exists = prev.findIndex(v => v.feld_id === feldId)
      if (exists >= 0) return prev.map((v, i) => i === exists ? { ...v, ...saved } : v)
      return [...prev, saved]
    })
  }

  const handleAddBeziehung = async (relatedId: string, beziehungstyp: string, label?: string) => {
    if (!selectedId) return
    const row = await api.addCharacterBeziehung(selectedId, { related_character_id: relatedId, beziehungstyp, label })
    setBeziehungen(prev => [...prev, row])
  }

  const handleDeleteBeziehung = async (relId: number) => {
    if (!selectedId) return
    await api.deleteCharacterBeziehung(selectedId, relId)
    setBeziehungen(prev => prev.filter(b => b.id !== relId))
  }

  const handleCharacterSearch = async (q: string) => {
    if (!staffelId) return []
    const all = await api.getCharacters(staffelId)
    return all.filter((c: any) => c.name.toLowerCase().includes(q.toLowerCase()) && c.id !== selectedId)
      .map((c: any) => ({ id: c.id, name: c.name }))
  }

  const FOTO_BASE = '/uploads/script-fotos/'
  const THUMB_BASE = '/uploads/script-fotos/thumbnails/'

  const rollenCharacters = characters
    .filter(c => c.kategorie_typ === 'rolle' || !c.kategorie_typ)
    .map((c: any) => ({
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
        {/* Sidebar */}
        <EntitySidebar
          entities={rollenCharacters}
          selectedId={selectedId}
          onSelect={handleSelect}
          onNew={handleNew}
          onAktivieren={handleAktivieren}
          loading={loading}
          numberKey="rollen_nummer"
        />

        {/* Main content */}
        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          {!staffelId && (
            <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Bitte eine Produktion auswählen.</div>
          )}

          {staffelId && !selected && !showNewForm && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
                {figurenLabel} aus der Liste auswählen oder <button onClick={handleNew} style={{ border: 'none', background: 'none', color: 'var(--text)', cursor: 'pointer', fontWeight: 600, fontSize: 14, padding: 0, textDecoration: 'underline' }}>neue anlegen</button>.
              </div>
              <button
                onClick={() => setShowImportModal(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '8px 16px', border: '1px solid var(--border)', borderRadius: 8, background: 'transparent', color: 'var(--text)', cursor: 'pointer', width: 'fit-content' }}>
                <FileUp size={14} />
                Rollenprofil importieren (PDF)
              </button>
            </div>
          )}

          {/* New form */}
          {showNewForm && (
            <div style={{ maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Neue {figurenLabel.slice(0, -1)}</h2>
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
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

          {/* Detail view */}
          {selected && (
            <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
              {/* Left: Foto */}
              <div style={{ flexShrink: 0 }}>
                {!fotosLoading && (
                  <FotoGalerie
                    fotos={fotos}
                    aspect="portrait"
                    onUpload={handleUpload}
                    onDelete={handleDeleteFoto}
                    onSetPrimaer={handleSetPrimaer}
                    onLabelChange={handleLabelChange}
                    onReorder={handleReorder}
                    uploading={uploading}
                  />
                )}
              </div>

              {/* Right: Info + Felder */}
              <div style={{ flex: 1, minWidth: 280, display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Name + Status */}
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 4px' }}>{selected.name}</h2>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {selected.rollen_nummer && (
                      <span style={{ fontSize: 11, padding: '2px 8px', background: 'var(--bg-subtle)', borderRadius: 12, color: 'var(--text-secondary)' }}>
                        #{selected.rollen_nummer}
                      </span>
                    )}
                    {selected.kategorie_name && (
                      <span style={{ fontSize: 11, padding: '2px 8px', background: 'var(--bg-subtle)', borderRadius: 12, color: 'var(--text-secondary)' }}>
                        {selected.kategorie_name}
                      </span>
                    )}
                    {selected.is_active === false && (
                      <span style={{ fontSize: 11, padding: '2px 8px', background: 'var(--bg-subtle)', borderRadius: 12, color: 'var(--text-secondary)' }}>
                        Inaktiv
                      </span>
                    )}
                  </div>
                </div>

                {/* Rollenprofil (importierte Daten) */}
                {selected.meta_json?.rollenprofil && Object.keys(selected.meta_json.rollenprofil).length > 0 && (
                  <RollenprofilAnzeige data={selected.meta_json.rollenprofil} />
                )}

                {/* Felder — zweispaltig, character_ref neben Beziehungen */}
                {(() => {
                  const charRefFelder = felder.filter(f => f.typ === 'character_ref')
                  const regularFelder = felder.filter(f => f.typ !== 'character_ref')
                  const firstCharRefOrder = charRefFelder.length > 0
                    ? Math.min(...charRefFelder.map(f => f.sort_order))
                    : Infinity
                  const lastCharRefOrder = charRefFelder.length > 0
                    ? Math.max(...charRefFelder.map(f => f.sort_order))
                    : -Infinity
                  const preFelder = regularFelder.filter(f => f.sort_order < firstCharRefOrder)
                  const postFelder = regularFelder.filter(f => f.sort_order > lastCharRefOrder)

                  const grid2col = (fields: any[]) => (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px 28px', alignItems: 'start' }}>
                      {fields.map(f => {
                        const wert = feldwerte.find(v => v.feld_id === f.id)
                        return (
                          <div key={f.id} style={f.typ === 'richtext' ? { gridColumn: '1 / -1' } : {}}>
                            <Suspense fallback={null}><FeldEditor feld={f} wert={wert} onChange={handleFeldChange} onCharacterSearch={handleCharacterSearch} characterId={selectedId ?? undefined} /></Suspense>
                          </div>
                        )
                      })}
                    </div>
                  )

                  return (
                    <>
                      {preFelder.length > 0 && grid2col(preFelder)}

                      {/* character_ref Felder + Beziehungen nebeneinander */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px 28px', alignItems: 'start' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                          {charRefFelder.map(f => {
                            const wert = feldwerte.find(v => v.feld_id === f.id)
                            return <Suspense key={f.id} fallback={null}><FeldEditor feld={f} wert={wert} onChange={handleFeldChange} onCharacterSearch={handleCharacterSearch} characterId={selectedId ?? undefined} /></Suspense>
                          })}
                        </div>
                        <BeziehungsPanel
                          beziehungen={beziehungen}
                          characterId={selectedId!}
                          targetRoute="/rollen"
                          onAdd={handleAddBeziehung}
                          onDelete={handleDeleteBeziehung}
                          onSearchCharacters={handleCharacterSearch}
                        />
                      </div>

                      {postFelder.length > 0 && grid2col(postFelder)}
                    </>
                  )
                })()}
              </div>
            </div>
          )}
        </div>
      </div>
      {showImportModal && staffelId && (
        <RollenprofilImportModal
          staffelId={staffelId}
          onClose={() => setShowImportModal(false)}
          onSuccess={handleImportSuccess}
        />
      )}
    </AppShell>
  )
}
