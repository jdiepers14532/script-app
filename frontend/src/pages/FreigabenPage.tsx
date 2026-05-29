/**
 * FreigabenPage — Zentrale Übersicht aller Rollen-Freigabe-Anfragen
 * Route: /freigaben
 * Zugang: DK (full) + Produktion/Herstellungsleitung (read-only)
 */
import { useState, useEffect, useCallback } from 'react'
import { CheckCircle, XCircle, Clock, Bell, ExternalLink, RefreshCw, Trash2 } from 'lucide-react'
import AppShell from '../components/AppShell'
import Tooltip from '../components/Tooltip'
import { api } from '../api/client'
import { useSelectedProduction } from '../contexts'

type GenStatus = {
  id: number
  genehmiger_id: number
  name: string
  email: string
  ist_obligatorisch: boolean
  entschieden: 'freigegeben' | 'abgelehnt' | null
  entschieden_am: string | null
}

type Anfrage = {
  id: number
  character_id: number
  rollen_name: string
  beantragt_von_user_id: string
  beantragt_am: string
  status: 'ausstehend' | 'freigegeben' | 'abgelehnt' | 'zurueckgezogen'
  entschieden_am: string | null
  notiz: string | null
  genehmiger_status: GenStatus[]
}

const STATUS_COLORS: Record<string, string> = {
  ausstehend: '#FFCC00',
  freigegeben: '#00C853',
  abgelehnt: '#FF3B30',
  zurueckgezogen: '#757575',
}
const STATUS_LABELS: Record<string, string> = {
  ausstehend: 'Ausstehend',
  freigegeben: 'Freigegeben',
  abgelehnt: 'Abgelehnt',
  zurueckgezogen: 'Zurückgezogen',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 99,
      fontSize: 11, fontWeight: 600,
      background: STATUS_COLORS[status] ? `${STATUS_COLORS[status]}22` : '#f5f5f5',
      color: STATUS_COLORS[status] ?? '#757575',
    }}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

function GenIcon({ g }: { g: GenStatus }) {
  if (g.entschieden === 'freigegeben') return (
    <Tooltip text={`${g.name} · Freigegeben${g.entschieden_am ? ` · ${new Date(g.entschieden_am).toLocaleDateString('de-DE')}` : ''}`}>
      <CheckCircle size={15} color="#00C853" />
    </Tooltip>
  )
  if (g.entschieden === 'abgelehnt') return (
    <Tooltip text={`${g.name} · Abgelehnt${g.entschieden_am ? ` · ${new Date(g.entschieden_am).toLocaleDateString('de-DE')}` : ''}`}>
      <XCircle size={15} color="#FF3B30" />
    </Tooltip>
  )
  return (
    <Tooltip text={`${g.name} · Ausstehend${g.ist_obligatorisch ? ' (obligatorisch)' : ' (optional)'}`}>
      <Clock size={15} color={g.ist_obligatorisch ? '#FFCC00' : '#bbb'} />
    </Tooltip>
  )
}

export default function FreigabenPage() {
  const { selectedId: selectedProductionId } = useSelectedProduction()
  const [anfragen, setAnfragen] = useState<Anfrage[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('ausstehend')
  const [actionLoading, setActionLoading] = useState<number | null>(null)
  const [ablehnNotiz, setAblehnNotiz] = useState<{ id: number; text: string } | null>(null)

  const load = useCallback(async () => {
    if (!selectedProductionId) return
    setLoading(true)
    try {
      const data = await api.get(`/rollen-freigabe/${selectedProductionId}/anfragen`)
      setAnfragen(data)
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [selectedProductionId])

  useEffect(() => { load() }, [load])

  const filtered = anfragen.filter(a =>
    statusFilter === 'alle' ? true : a.status === statusFilter
  )

  const counts = {
    ausstehend: anfragen.filter(a => a.status === 'ausstehend').length,
    freigegeben: anfragen.filter(a => a.status === 'freigegeben').length,
    abgelehnt: anfragen.filter(a => a.status === 'abgelehnt').length,
    alle: anfragen.length,
  }

  async function handleFreigeben(id: number) {
    if (!selectedProductionId) return
    setActionLoading(id)
    try {
      await api.post(`/rollen-freigabe/${selectedProductionId}/anfragen/${id}/freigeben`, {})
      await load()
    } finally { setActionLoading(null) }
  }

  async function handleAblehnen(id: number) {
    if (!selectedProductionId) return
    setActionLoading(id)
    try {
      await api.post(`/rollen-freigabe/${selectedProductionId}/anfragen/${id}/ablehnen`, {
        notiz: ablehnNotiz?.id === id ? ablehnNotiz.text : null,
      })
      setAblehnNotiz(null)
      await load()
    } finally { setActionLoading(null) }
  }

  async function handleErinnerung(id: number) {
    if (!selectedProductionId) return
    setActionLoading(id)
    try {
      await api.post(`/rollen-freigabe/${selectedProductionId}/anfragen/${id}/erinnerung`, {})
    } finally { setActionLoading(null) }
  }

  async function handleZurueckziehen(id: number) {
    if (!selectedProductionId) return
    if (!confirm('Anfrage zurückziehen? Die Rolle bleibt ohne Freigabe-Status.')) return
    setActionLoading(id)
    try {
      await api.post(`/rollen-freigabe/${selectedProductionId}/anfragen/${id}/zurueckziehen`, {})
      await load()
    } finally { setActionLoading(null) }
  }

  async function handleRolleLoeschen(anfrage: Anfrage) {
    if (!confirm(`Rolle „${anfrage.rollen_name}" endgültig löschen? Diese Aktion kann nicht rückgängig gemacht werden.`)) return
    setActionLoading(anfrage.id)
    try {
      await api.deleteCharacter(String(anfrage.character_id))
      await load()
    } finally { setActionLoading(null) }
  }

  return (
    <AppShell title="Freigaben">
      <div style={{ padding: '24px 24px 80px', maxWidth: 960, margin: '0 auto' }}>

        {/* Header + Stats */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Rollen-Freigaben</h1>
          <button
            onClick={load}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#757575', padding: 6 }}
          >
            <RefreshCw size={16} />
          </button>
        </div>

        {/* Stat-Kacheln */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          {(['ausstehend', 'freigegeben', 'abgelehnt', 'alle'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              style={{
                padding: '10px 16px', borderRadius: 8, cursor: 'pointer',
                border: statusFilter === s ? '2px solid #000' : '2px solid #e0e0e0',
                background: statusFilter === s ? '#000' : '#fff',
                color: statusFilter === s ? '#fff' : '#333',
                fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              {s === 'ausstehend' && <Clock size={14} />}
              {s === 'freigegeben' && <CheckCircle size={14} />}
              {s === 'abgelehnt' && <XCircle size={14} />}
              {s.charAt(0).toUpperCase() + s.slice(1)}
              <span style={{
                background: statusFilter === s ? 'rgba(255,255,255,0.2)' : '#f0f0f0',
                borderRadius: 99, padding: '1px 7px', fontSize: 12,
              }}>
                {counts[s as keyof typeof counts]}
              </span>
            </button>
          ))}
        </div>

        {/* Tabelle */}
        {loading ? (
          <div style={{ color: '#757575', fontSize: 14 }}>Lade...</div>
        ) : filtered.length === 0 ? (
          <div style={{ color: '#757575', fontSize: 14, textAlign: 'center', padding: 40 }}>
            Keine {statusFilter !== 'alle' ? STATUS_LABELS[statusFilter] : ''} Anfragen
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(a => (
              <div
                key={a.id}
                style={{
                  background: '#fff', borderRadius: 10,
                  border: '1px solid #e0e0e0', padding: '14px 16px',
                  borderLeft: `3px solid ${STATUS_COLORS[a.status] ?? '#e0e0e0'}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  {/* Rollenname */}
                  <span style={{ fontWeight: 700, fontSize: 15, flex: '0 0 auto' }}>
                    {a.rollen_name}
                  </span>

                  <StatusBadge status={a.status} />

                  {/* Genehmiger-Icons */}
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    {(a.genehmiger_status ?? []).map(g => (
                      <GenIcon key={g.id} g={g} />
                    ))}
                  </div>

                  {/* Datum */}
                  <span style={{ fontSize: 12, color: '#757575', marginLeft: 'auto' }}>
                    {new Date(a.beantragt_am).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                  </span>
                </div>

                {/* Notiz */}
                {a.notiz && (
                  <div style={{ fontSize: 12, color: '#FF3B30', marginTop: 6 }}>
                    Ablehnungsgrund: {a.notiz}
                  </div>
                )}

                {/* Ablehnen-Notiz-Input */}
                {ablehnNotiz?.id === a.id && (
                  <div style={{ marginTop: 10 }}>
                    <input
                      value={ablehnNotiz.text}
                      onChange={e => setAblehnNotiz({ id: a.id, text: e.target.value })}
                      placeholder="Ablehnungsgrund (optional)"
                      style={{
                        width: '100%', padding: '8px 12px', borderRadius: 6,
                        border: '1px solid #e0e0e0', fontSize: 13,
                      }}
                    />
                  </div>
                )}

                {/* Aktionen */}
                {a.status === 'ausstehend' && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => handleFreigeben(a.id)}
                      disabled={actionLoading === a.id}
                      style={{
                        padding: '6px 14px', borderRadius: 6, border: 'none',
                        background: '#000', color: '#fff', fontSize: 12,
                        fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      <CheckCircle size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                      Freigeben
                    </button>

                    {ablehnNotiz?.id === a.id ? (
                      <button
                        onClick={() => handleAblehnen(a.id)}
                        disabled={actionLoading === a.id}
                        style={{
                          padding: '6px 14px', borderRadius: 6, border: 'none',
                          background: '#FF3B30', color: '#fff', fontSize: 12,
                          fontWeight: 600, cursor: 'pointer',
                        }}
                      >
                        Ablehnen bestätigen
                      </button>
                    ) : (
                      <button
                        onClick={() => setAblehnNotiz({ id: a.id, text: '' })}
                        style={{
                          padding: '6px 14px', borderRadius: 6, fontSize: 12,
                          border: '1px solid #e0e0e0', background: '#fff',
                          color: '#333', cursor: 'pointer', fontWeight: 600,
                        }}
                      >
                        <XCircle size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                        Ablehnen
                      </button>
                    )}

                    <Tooltip text="Erinnerung an alle ausstehenden Genehmiger senden">
                      <button
                        onClick={() => handleErinnerung(a.id)}
                        disabled={actionLoading === a.id}
                        style={{
                          padding: '6px 10px', borderRadius: 6, fontSize: 12,
                          border: '1px solid #e0e0e0', background: '#fff',
                          color: '#757575', cursor: 'pointer',
                        }}
                      >
                        <Bell size={12} />
                      </button>
                    </Tooltip>

                    <Tooltip text="Anfrage zurückziehen">
                      <button
                        onClick={() => handleZurueckziehen(a.id)}
                        style={{
                          padding: '6px 10px', borderRadius: 6, fontSize: 12,
                          border: '1px solid #e0e0e0', background: '#fff',
                          color: '#757575', cursor: 'pointer',
                        }}
                      >
                        Zurückziehen
                      </button>
                    </Tooltip>
                  </div>
                )}

                {/* Link zur Rollendatenbank + Löschen (bei abgelehnt) */}
                <div style={{ marginTop: 8, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <a
                    href={`/rollen?id=${a.character_id}`}
                    style={{ fontSize: 12, color: '#007AFF', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    <ExternalLink size={11} />
                    In Rollendatenbank öffnen
                  </a>
                  {a.status === 'abgelehnt' && (
                    <Tooltip text="Abgelehnte Rolle endgültig aus dem System entfernen">
                      <button
                        onClick={() => handleRolleLoeschen(a)}
                        disabled={actionLoading === a.id}
                        style={{
                          padding: '3px 8px', borderRadius: 5, fontSize: 12,
                          border: '1px solid #FF3B30', background: 'transparent',
                          color: '#FF3B30', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
                        }}
                      >
                        <Trash2 size={11} /> Rolle löschen
                      </button>
                    </Tooltip>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
