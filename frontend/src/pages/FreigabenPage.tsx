/**
 * FreigabenPage — Zentrale Übersicht aller Rollen-/Szenen-Freigabe-Anfragen (Phase 5)
 * Route: /freigaben
 *
 * Scope:
 *   "Meine"  — offene Anfragen, bei denen der aktuelle User als Genehmiger eingetragen ist
 *   "Alle"   — DK-Ansicht: alle Anfragen der ausgewählten Produktion
 *
 * Typen: Budget (global, pre-lock) · Dispo (szenenlokal, post-lock)
 * Batch-Aktionen: mehrere Items auf einmal freigeben oder ablehnen
 */
import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import {
  CheckCircle, XCircle, Clock, Bell, ExternalLink, RefreshCw,
  Trash2, RotateCcw, Users, Layers, ChevronDown, ChevronRight,
} from 'lucide-react'
import AppShell from '../components/AppShell'
import Tooltip from '../components/Tooltip'
import { api } from '../api/client'
import { useSelectedProduction } from '../contexts'

// ── Typen ────────────────────────────────────────────────────────────────────

type GenStatus = {
  id: number
  genehmiger_id: number
  name: string
  email: string
  ist_obligatorisch: boolean
  entschieden: 'freigegeben' | 'abgelehnt' | null
  entschieden_am: string | null
}

type BudgetAnfrage = {
  id: number
  character_id: string
  rollen_name: string
  beantragt_von_user_id: string
  beantragt_von_name: string | null
  beantragt_am: string
  status: 'ausstehend' | 'freigegeben' | 'abgelehnt' | 'zurueckgezogen'
  entschieden_am: string | null
  notiz: string | null
  erneut_anfrage_notiz: string | null
  szene_id: string | null
  folge_nummer: number | null
  scene_nummer: string | null
  ort_name: string | null
  genehmiger_status: GenStatus[]
}

type DispoAnfrage = {
  id: string
  character_id: string
  rollen_name: string
  production_id: string
  scene_identity_id: string
  beantragt_von_name: string | null
  beantragt_am: string
  status: 'ausstehend' | 'freigegeben' | 'abgelehnt' | 'zurueckgezogen'
  notiz: string | null
  erneut_anfrage_notiz: string | null
  folge_nummer: number | null
  scene_nummer: string | null
  ort_name: string | null
}

// "Meine Freigaben"-Eintrag (user = genehmiger)
type MeineItem = {
  anfrage_id: string
  character_id: string
  rollen_name: string
  production_id: string
  beantragt_am: string
  notiz: string | null
  erneut_anfrage_notiz: string | null
  folge_nummer: number | null
  scene_nummer: string | null
  ort_name: string | null
  typ: 'budget' | 'dispo'
  scene_identity_id?: string
}

// ── Farben/Labels ─────────────────────────────────────────────────────────────

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

// ── Sub-Komponenten ───────────────────────────────────────────────────────────

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

function TypBadge({ typ }: { typ: 'budget' | 'dispo' }) {
  return (
    <Tooltip text={typ === 'budget' ? 'Budget-Freigabe: gilt global für die Produktion' : 'Dispo-Freigabe: gilt nur für diese Szene'}>
      <span style={{
        display: 'inline-block', padding: '2px 7px', borderRadius: 4,
        fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
        background: typ === 'budget' ? '#007AFF18' : '#00C85318',
        color: typ === 'budget' ? '#007AFF' : '#00A844',
        cursor: 'default',
      }}>
        {typ === 'budget' ? 'Budget · global' : 'Dispo · Szene'}
      </span>
    </Tooltip>
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

// ── Hauptkomponente ───────────────────────────────────────────────────────────

export default function FreigabenPage() {
  const { selectedId: selectedProductionId } = useSelectedProduction()

  // Scope: meine (genehmiger) oder alle (DK)
  const [scope, setScope] = useState<'meine' | 'alle'>('alle')

  // "Alle"-Zustand
  const [budgetAnfragen, setBudgetAnfragen] = useState<BudgetAnfrage[]>([])
  const [dispoAnfragen, setDispoAnfragen] = useState<DispoAnfrage[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('ausstehend')
  const [typFilter, setTypFilter] = useState<'budget' | 'dispo' | 'alle'>('alle')

  // "Meine"-Zustand
  const [meineItems, setMeineItems] = useState<MeineItem[]>([])

  const [loading, setLoading] = useState(true)

  // Aktionen
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [ablehnNotiz, setAblehnNotiz] = useState<{ key: string; text: string } | null>(null)
  const [erneutAnfragen, setErneutAnfragen] = useState<{ key: string; text: string } | null>(null)
  const [erinnerungSent, setErinnerungSent] = useState<Set<string>>(new Set())

  // Batch
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [batchLoading, setBatchLoading] = useState(false)

  // Folge-Expand-State für gruppierte Liste
  const [expandedFolgen, setExpandedFolgen] = useState<Set<string>>(new Set())

  // ── Laden ──────────────────────────────────────────────────────────────────

  const loadAlle = useCallback(async () => {
    if (!selectedProductionId) return
    setLoading(true)
    try {
      const [budget, dispo] = await Promise.all([
        api.get(`/rollen-freigabe/${selectedProductionId}/anfragen`),
        api.get(`/rollen-freigabe/${selectedProductionId}/szenen-anfragen`).catch(() => []),
      ])
      setBudgetAnfragen(budget ?? [])
      setDispoAnfragen(Array.isArray(dispo) ? dispo : [])
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [selectedProductionId])

  const loadMeine = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get('/freigaben/meine')
      setMeineItems([
        ...(data?.budget ?? []),
        ...(data?.dispo ?? []),
      ])
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (scope === 'alle') { loadAlle() } else { loadMeine() }
  }, [scope, loadAlle, loadMeine])

  // Auf Produktionswechsel neu laden
  useEffect(() => { if (scope === 'alle') loadAlle() }, [selectedProductionId]) // eslint-disable-line

  // Batch-Selektion leeren wenn Scope/Produktion wechselt
  useEffect(() => { setSelected(new Set()) }, [scope, selectedProductionId])

  // ── Gefilterte Listen ──────────────────────────────────────────────────────

  const filteredBudget = useMemo(() =>
    budgetAnfragen.filter(a =>
      (statusFilter === 'alle' || a.status === statusFilter) &&
      (typFilter === 'alle' || typFilter === 'budget')
    ), [budgetAnfragen, statusFilter, typFilter]
  )

  const filteredDispo = useMemo(() =>
    dispoAnfragen.filter(a =>
      (statusFilter === 'alle' || a.status === statusFilter) &&
      (typFilter === 'alle' || typFilter === 'dispo')
    ), [dispoAnfragen, statusFilter, typFilter]
  )

  const counts = useMemo(() => ({
    ausstehend: budgetAnfragen.filter(a => a.status === 'ausstehend').length + dispoAnfragen.filter(a => a.status === 'ausstehend').length,
    abgelehnt: budgetAnfragen.filter(a => a.status === 'abgelehnt').length + dispoAnfragen.filter(a => a.status === 'abgelehnt').length,
    freigegeben: budgetAnfragen.filter(a => a.status === 'freigegeben').length + dispoAnfragen.filter(a => a.status === 'freigegeben').length,
    alle: budgetAnfragen.length + dispoAnfragen.length,
  }), [budgetAnfragen, dispoAnfragen])

  // ── Aktionen Budget ────────────────────────────────────────────────────────

  async function handleBudgetFreigeben(id: number) {
    if (!selectedProductionId) return
    setActionLoading(`b-${id}`)
    try {
      await api.post(`/rollen-freigabe/${selectedProductionId}/anfragen/${id}/freigeben`, {})
      await loadAlle()
    } finally { setActionLoading(null) }
  }

  async function handleBudgetAblehnen(id: number) {
    if (!selectedProductionId) return
    setActionLoading(`b-${id}`)
    try {
      await api.post(`/rollen-freigabe/${selectedProductionId}/anfragen/${id}/ablehnen`, {
        notiz: ablehnNotiz?.key === `b-${id}` ? ablehnNotiz.text : null,
      })
      setAblehnNotiz(null)
      await loadAlle()
    } finally { setActionLoading(null) }
  }

  async function handleBudgetErinnerung(id: number) {
    if (!selectedProductionId) return
    setActionLoading(`b-${id}`)
    try {
      await api.post(`/rollen-freigabe/${selectedProductionId}/anfragen/${id}/erinnerung`, {})
      const k = `b-${id}`
      setErinnerungSent(prev => new Set([...prev, k]))
      setTimeout(() => setErinnerungSent(prev => { const s = new Set(prev); s.delete(k); return s }), 3000)
    } finally { setActionLoading(null) }
  }

  async function handleBudgetErneutAnfragen(id: number) {
    if (!selectedProductionId) return
    setActionLoading(`b-${id}`)
    try {
      await api.erneutAnfragen(selectedProductionId, id, {
        notiz: erneutAnfragen?.key === `b-${id}` ? erneutAnfragen.text : undefined,
      })
      setErneutAnfragen(null)
      await loadAlle()
    } finally { setActionLoading(null) }
  }

  async function handleRolleLoeschen(a: BudgetAnfrage) {
    if (!confirm(`Rolle „${a.rollen_name}" endgültig löschen?`)) return
    setActionLoading(`b-${a.id}`)
    try {
      await api.deleteCharacter(String(a.character_id))
      await loadAlle()
    } finally { setActionLoading(null) }
  }

  // ── Aktionen Dispo ─────────────────────────────────────────────────────────

  async function handleDispoFreigeben(id: string) {
    if (!selectedProductionId) return
    setActionLoading(`d-${id}`)
    try {
      await api.post(`/rollen-freigabe/${selectedProductionId}/szenen-anfragen/${id}/freigeben`, {})
      await loadAlle()
    } finally { setActionLoading(null) }
  }

  async function handleDispoAblehnen(id: string) {
    if (!selectedProductionId) return
    setActionLoading(`d-${id}`)
    try {
      await api.post(`/rollen-freigabe/${selectedProductionId}/szenen-anfragen/${id}/ablehnen`, {
        notiz: ablehnNotiz?.key === `d-${id}` ? ablehnNotiz.text : null,
      })
      setAblehnNotiz(null)
      await loadAlle()
    } finally { setActionLoading(null) }
  }

  // ── Batch (Meine-Ansicht) ──────────────────────────────────────────────────

  function toggleSelect(key: string) {
    setSelected(prev => {
      const s = new Set(prev)
      if (s.has(key)) s.delete(key); else s.add(key)
      return s
    })
  }

  function selectAll() {
    const keys = meineItems.map(i => `${i.typ}-${i.anfrage_id}`)
    setSelected(new Set(keys))
  }

  function clearSelect() { setSelected(new Set()) }

  async function batchFreigeben() {
    const items = meineItems
      .filter(i => selected.has(`${i.typ}-${i.anfrage_id}`))
      .map(i => ({ typ: i.typ, anfrage_id: i.anfrage_id, entscheidung: 'freigeben' as const }))
    if (items.length === 0) return
    setBatchLoading(true)
    try {
      await api.post('/freigaben/batch-entscheiden', { items })
      setSelected(new Set())
      await loadMeine()
    } finally { setBatchLoading(false) }
  }

  async function batchAblehnen() {
    const items = meineItems
      .filter(i => selected.has(`${i.typ}-${i.anfrage_id}`))
      .map(i => ({ typ: i.typ, anfrage_id: i.anfrage_id, entscheidung: 'ablehnen' as const }))
    if (items.length === 0) return
    if (!confirm(`${items.length} Anfrage(n) ablehnen?`)) return
    setBatchLoading(true)
    try {
      await api.post('/freigaben/batch-entscheiden', { items })
      setSelected(new Set())
      await loadMeine()
    } finally { setBatchLoading(false) }
  }

  // ── Hilfsfunktionen ────────────────────────────────────────────────────────

  function getAblehner(a: BudgetAnfrage): GenStatus | null {
    return (a.genehmiger_status ?? []).find(g => g.entschieden === 'abgelehnt') ?? null
  }

  const reload = () => scope === 'alle' ? loadAlle() : loadMeine()

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <AppShell title="Freigaben">
      <div style={{ padding: '24px 24px 80px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Freigaben</h1>

          {/* Scope-Toggle */}
          <div style={{ display: 'flex', borderRadius: 8, border: '1px solid #e0e0e0', overflow: 'hidden', marginLeft: 8 }}>
            <button
              onClick={() => setScope('meine')}
              style={{
                padding: '7px 14px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
                background: scope === 'meine' ? '#000' : '#fff',
                color: scope === 'meine' ? '#fff' : '#555',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <Users size={13} /> Meine
            </button>
            <button
              onClick={() => setScope('alle')}
              style={{
                padding: '7px 14px', border: 'none', borderLeft: '1px solid #e0e0e0', cursor: 'pointer', fontSize: 13, fontWeight: 500,
                background: scope === 'alle' ? '#000' : '#fff',
                color: scope === 'alle' ? '#fff' : '#555',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <Layers size={13} /> Alle (DK)
            </button>
          </div>

          <button
            onClick={reload}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#757575', padding: 6, borderRadius: 6 }}
          >
            <RefreshCw size={16} />
          </button>
        </div>

        {/* ── Meine-Ansicht ────────────────────────────────────────────────── */}
        {scope === 'meine' && (
          <MeineAnsicht
            items={meineItems}
            loading={loading}
            selected={selected}
            batchLoading={batchLoading}
            onToggleSelect={toggleSelect}
            onSelectAll={selectAll}
            onClearSelect={clearSelect}
            onBatchFreigeben={batchFreigeben}
            onBatchAblehnen={batchAblehnen}
          />
        )}

        {/* ── Alle-Ansicht (DK) ────────────────────────────────────────────── */}
        {scope === 'alle' && (
          <>
            {/* Stat-Kacheln */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
              {(['ausstehend', 'abgelehnt', 'freigegeben', 'alle'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  style={{
                    padding: '9px 14px', borderRadius: 8, cursor: 'pointer', minHeight: 44,
                    border: statusFilter === s ? '2px solid #000' : '2px solid #e0e0e0',
                    background: statusFilter === s ? '#000' : '#fff',
                    color: statusFilter === s ? '#fff' : '#333',
                    fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  {s === 'ausstehend' && <Clock size={13} />}
                  {s === 'abgelehnt' && <XCircle size={13} />}
                  {s === 'freigegeben' && <CheckCircle size={13} />}
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                  <span style={{ background: statusFilter === s ? 'rgba(255,255,255,0.2)' : '#f0f0f0', borderRadius: 99, padding: '1px 7px', fontSize: 11 }}>
                    {counts[s as keyof typeof counts]}
                  </span>
                </button>
              ))}
            </div>

            {/* Typ-Filter */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
              {(['alle', 'budget', 'dispo'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTypFilter(t)}
                  style={{
                    padding: '5px 12px', borderRadius: 6, cursor: 'pointer', minHeight: 36,
                    border: `1px solid ${typFilter === t ? '#000' : '#e0e0e0'}`,
                    background: typFilter === t ? '#000' : 'transparent',
                    color: typFilter === t ? '#fff' : '#555',
                    fontSize: 12, fontWeight: 500,
                  }}
                >
                  {t === 'alle' ? 'Alle Typen' : t === 'budget' ? 'Budget' : 'Dispo'}
                </button>
              ))}
            </div>

            {loading ? (
              <div style={{ color: '#757575', fontSize: 14 }}>Lade...</div>
            ) : (
              <>
                {/* Budget-Anfragen */}
                {(typFilter === 'alle' || typFilter === 'budget') && (
                  <AnfragenSection
                    title="Budget-Freigaben"
                    typ="budget"
                    empty={filteredBudget.length === 0}
                    statusFilter={statusFilter}
                  >
                    {filteredBudget.map(a => {
                      const ablehner = getAblehner(a)
                      const bKey = `b-${a.id}`
                      return (
                        <AnfrageCard
                          key={bKey}
                          name={a.rollen_name}
                          status={a.status}
                          typ="budget"
                          date={a.beantragt_am}
                          kontext={`${a.beantragt_von_name ? `Von ${a.beantragt_von_name}` : ''} ${a.folge_nummer != null ? `· Folge ${a.folge_nummer}` : ''} ${a.scene_nummer ? `· Sz. ${a.scene_nummer}` : ''} ${a.ort_name ? `· ${a.ort_name}` : ''}`.trim()}
                          genIcons={(a.genehmiger_status ?? []).map(g => <GenIcon key={g.id} g={g} />)}
                          ablehnerInfo={ablehner ? `Abgelehnt von ${ablehner.name}${ablehner.entschieden_am ? ` am ${new Date(ablehner.entschieden_am).toLocaleDateString('de-DE')}` : ''}${a.notiz ? ` · "${a.notiz}"` : ''}` : (a.status === 'abgelehnt' && a.notiz ? `Ablehnungsgrund: ${a.notiz}` : null)}
                          ablehnNotizKey={bKey}
                          ablehnNotiz={ablehnNotiz}
                          onAblehnNotizChange={text => setAblehnNotiz({ key: bKey, text })}
                          erneutKey={bKey}
                          erneutAnfragen={erneutAnfragen}
                          onErneutChange={text => setErneutAnfragen({ key: bKey, text })}
                          erinnerungSent={erinnerungSent.has(bKey)}
                          isLoading={actionLoading === bKey}
                          onFreigeben={a.status === 'ausstehend' ? () => handleBudgetFreigeben(a.id) : undefined}
                          onAblehnInit={a.status === 'ausstehend' ? () => setAblehnNotiz({ key: bKey, text: '' }) : undefined}
                          onAblehnConfirm={a.status === 'ausstehend' ? () => handleBudgetAblehnen(a.id) : undefined}
                          onErinnerung={a.status === 'ausstehend' ? () => handleBudgetErinnerung(a.id) : undefined}
                          onErneutInit={a.status === 'abgelehnt' ? () => setErneutAnfragen({ key: bKey, text: '' }) : undefined}
                          onErneutConfirm={a.status === 'abgelehnt' ? () => handleBudgetErneutAnfragen(a.id) : undefined}
                          onLoeschen={a.status === 'abgelehnt' ? () => handleRolleLoeschen(a) : undefined}
                          linkHref={`/rollen?id=${a.character_id}`}
                        />
                      )
                    })}
                  </AnfragenSection>
                )}

                {/* Dispo-Anfragen */}
                {(typFilter === 'alle' || typFilter === 'dispo') && (
                  <AnfragenSection
                    title="Dispo-Freigaben"
                    typ="dispo"
                    empty={filteredDispo.length === 0}
                    statusFilter={statusFilter}
                  >
                    {filteredDispo.map(a => {
                      const dKey = `d-${a.id}`
                      return (
                        <AnfrageCard
                          key={dKey}
                          name={a.rollen_name}
                          status={a.status}
                          typ="dispo"
                          date={a.beantragt_am}
                          kontext={`${a.beantragt_von_name ? `Von ${a.beantragt_von_name}` : ''} ${a.folge_nummer != null ? `· Folge ${a.folge_nummer}` : ''} ${a.scene_nummer ? `· Sz. ${a.scene_nummer}` : ''} ${a.ort_name ? `· ${a.ort_name}` : ''}`.trim()}
                          genIcons={[]}
                          ablehnerInfo={a.status === 'abgelehnt' && a.notiz ? `Ablehnungsgrund: ${a.notiz}` : null}
                          ablehnNotizKey={dKey}
                          ablehnNotiz={ablehnNotiz}
                          onAblehnNotizChange={text => setAblehnNotiz({ key: dKey, text })}
                          erneutKey={dKey}
                          erneutAnfragen={null}
                          onErneutChange={() => {}}
                          erinnerungSent={false}
                          isLoading={actionLoading === dKey}
                          onFreigeben={a.status === 'ausstehend' ? () => handleDispoFreigeben(a.id) : undefined}
                          onAblehnInit={a.status === 'ausstehend' ? () => setAblehnNotiz({ key: dKey, text: '' }) : undefined}
                          onAblehnConfirm={a.status === 'ausstehend' ? () => handleDispoAblehnen(a.id) : undefined}
                        />
                      )
                    })}
                  </AnfragenSection>
                )}
              </>
            )}
          </>
        )}
      </div>
    </AppShell>
  )
}

// ── AnfragenSection ───────────────────────────────────────────────────────────

function AnfragenSection({ title, typ, empty, statusFilter, children }: {
  title: string; typ: 'budget' | 'dispo'; empty: boolean; statusFilter: string;
  children?: ReactNode
}) {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <div style={{ marginBottom: 28 }}>
      <button
        onClick={() => setCollapsed(c => !c)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 10,
        }}
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        <span style={{ fontSize: 14, fontWeight: 700, color: '#111' }}>{title}</span>
        <TypBadge typ={typ} />
      </button>
      {!collapsed && (
        empty ? (
          <div style={{ color: '#757575', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>
            Keine {statusFilter !== 'alle' ? (STATUS_LABELS[statusFilter] ?? '') + ' ' : ''}{title}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
        )
      )}
    </div>
  )
}

// ── AnfrageCard ───────────────────────────────────────────────────────────────

interface AnfrageCardProps {
  name: string
  status: string
  typ: 'budget' | 'dispo'
  date: string
  kontext: string
  genIcons: ReactNode[]
  ablehnerInfo: string | null
  ablehnNotizKey: string
  ablehnNotiz: { key: string; text: string } | null
  onAblehnNotizChange: (text: string) => void
  erneutKey: string
  erneutAnfragen: { key: string; text: string } | null
  onErneutChange: (text: string) => void
  erinnerungSent: boolean
  isLoading: boolean
  onFreigeben?: () => void
  onAblehnInit?: () => void
  onAblehnConfirm?: () => void
  onErinnerung?: () => void
  onErneutInit?: () => void
  onErneutConfirm?: () => void
  onLoeschen?: () => void
  linkHref?: string
}

function AnfrageCard(props: AnfrageCardProps) {
  const {
    name, status, typ, date, kontext, genIcons, ablehnerInfo,
    ablehnNotizKey, ablehnNotiz, onAblehnNotizChange,
    erneutKey, erneutAnfragen, onErneutChange,
    erinnerungSent, isLoading,
    onFreigeben, onAblehnInit, onAblehnConfirm,
    onErinnerung, onErneutInit, onErneutConfirm, onLoeschen,
    linkHref,
  } = props
  const isAblehnOpen = ablehnNotiz?.key === ablehnNotizKey
  const isErneutOpen = erneutAnfragen?.key === erneutKey

  return (
    <div style={{
      background: '#fff', borderRadius: 10,
      border: '1px solid #e0e0e0', padding: '14px 16px',
      borderLeft: `3px solid ${STATUS_COLORS[status] ?? '#e0e0e0'}`,
    }}>
      {/* Kopfzeile */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>{name}</span>
        <StatusBadge status={status} />
        <TypBadge typ={typ} />
        {genIcons.length > 0 && (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>{genIcons}</div>
        )}
        <span style={{ fontSize: 12, color: '#757575', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
          {new Date(date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })}
        </span>
      </div>

      {/* Kontext */}
      {kontext && (
        <div style={{ fontSize: 12, color: '#555', marginTop: 5 }}>{kontext}</div>
      )}

      {/* Ablehnungsinfo */}
      {ablehnerInfo && (
        <div style={{ marginTop: 8, padding: '7px 10px', borderRadius: 5, background: '#fff0f0', fontSize: 12, color: '#FF3B30' }}>
          {ablehnerInfo}
        </div>
      )}

      {/* Ablehnen-Notiz */}
      {isAblehnOpen && (
        <input
          value={ablehnNotiz!.text}
          onChange={e => onAblehnNotizChange(e.target.value)}
          placeholder="Ablehnungsgrund (optional)"
          style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #e0e0e0', fontSize: 13, boxSizing: 'border-box', marginTop: 10 }}
        />
      )}

      {/* Erneut-Anfragen-Notiz */}
      {isErneutOpen && (
        <textarea
          value={erneutAnfragen!.text}
          onChange={e => onErneutChange(e.target.value)}
          placeholder="Hinweis an die Genehmiger (optional)"
          rows={2}
          style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #FFCC00', fontSize: 13, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', marginTop: 10 }}
        />
      )}

      {/* Aktionen — ausstehend */}
      {status === 'ausstehend' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {onFreigeben && (
            <button
              onClick={onFreigeben}
              disabled={isLoading}
              style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: '#000', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', minHeight: 34, display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <CheckCircle size={12} /> Freigeben
            </button>
          )}
          {isAblehnOpen ? (
            onAblehnConfirm && (
              <button onClick={onAblehnConfirm} disabled={isLoading} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: '#FF3B30', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', minHeight: 34 }}>
                Ablehnen bestätigen
              </button>
            )
          ) : (
            onAblehnInit && (
              <button onClick={onAblehnInit} style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, border: '1px solid #e0e0e0', background: '#fff', color: '#333', cursor: 'pointer', fontWeight: 600, minHeight: 34, display: 'flex', alignItems: 'center', gap: 4 }}>
                <XCircle size={12} /> Ablehnen
              </button>
            )
          )}
          {onErinnerung && (
            <Tooltip text="Erinnerung senden">
              <button
                onClick={onErinnerung}
                disabled={isLoading}
                style={{ padding: '6px 10px', borderRadius: 6, fontSize: 12, border: `1px solid ${erinnerungSent ? '#00C853' : '#e0e0e0'}`, background: erinnerungSent ? '#f0fff4' : '#fff', color: erinnerungSent ? '#00C853' : '#757575', cursor: 'pointer', minHeight: 34, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {erinnerungSent ? <><CheckCircle size={12} /> Gesendet</> : <Bell size={12} />}
              </button>
            </Tooltip>
          )}
        </div>
      )}

      {/* Aktionen — abgelehnt */}
      {status === 'abgelehnt' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {isErneutOpen ? (
            onErneutConfirm && (
              <button onClick={onErneutConfirm} disabled={isLoading} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: '#FFCC00', color: '#000', fontSize: 12, fontWeight: 600, cursor: 'pointer', minHeight: 34, display: 'flex', alignItems: 'center', gap: 4 }}>
                <RotateCcw size={12} /> Erneut anfragen bestätigen
              </button>
            )
          ) : (
            onErneutInit && (
              <button onClick={onErneutInit} style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, border: '1px solid #FFCC00', background: '#fff', color: '#333', cursor: 'pointer', fontWeight: 600, minHeight: 34, display: 'flex', alignItems: 'center', gap: 4 }}>
                <RotateCcw size={12} /> Erneut anfragen
              </button>
            )
          )}
          {onLoeschen && (
            <Tooltip text="Abgelehnte Rolle endgültig entfernen">
              <button onClick={onLoeschen} disabled={isLoading} style={{ padding: '6px 8px', borderRadius: 5, fontSize: 12, border: '1px solid #FF3B30', background: 'transparent', color: '#FF3B30', cursor: 'pointer', minHeight: 34, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Trash2 size={11} /> Rolle löschen
              </button>
            </Tooltip>
          )}
        </div>
      )}

      {/* Link */}
      {linkHref && (
        <div style={{ marginTop: 8 }}>
          <a href={linkHref} style={{ fontSize: 12, color: '#007AFF', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <ExternalLink size={11} /> In Rollendatenbank öffnen
          </a>
        </div>
      )}
    </div>
  )
}

// ── MeineAnsicht ──────────────────────────────────────────────────────────────

function MeineAnsicht({ items, loading, selected, batchLoading, onToggleSelect, onSelectAll, onClearSelect, onBatchFreigeben, onBatchAblehnen }: {
  items: MeineItem[]
  loading: boolean
  selected: Set<string>
  batchLoading: boolean
  onToggleSelect: (key: string) => void
  onSelectAll: () => void
  onClearSelect: () => void
  onBatchFreigeben: () => void
  onBatchAblehnen: () => void
}) {
  if (loading) return <div style={{ color: '#757575', fontSize: 14 }}>Lade...</div>

  if (items.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0', color: '#757575', fontSize: 14 }}>
        <div style={{ marginBottom: 12 }}><CheckCircle size={32} color="#00C853" /></div>
        <div>Keine offenen Freigaben — alles erledigt.</div>
      </div>
    )
  }

  const hasSelected = selected.size > 0

  return (
    <div>
      {/* Batch-Toolbar */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: '#555' }}>{items.length} offene Anfrage(n)</span>
        <button onClick={onSelectAll} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #e0e0e0', background: '#fff', fontSize: 12, cursor: 'pointer', color: '#333' }}>
          Alle auswählen
        </button>
        {hasSelected && (
          <>
            <button onClick={onClearSelect} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #e0e0e0', background: '#fff', fontSize: 12, cursor: 'pointer', color: '#333' }}>
              Auswahl aufheben
            </button>
            <button
              onClick={onBatchFreigeben}
              disabled={batchLoading}
              style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: '#000', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', minHeight: 34, display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <CheckCircle size={12} /> {selected.size} freigeben
            </button>
            <button
              onClick={onBatchAblehnen}
              disabled={batchLoading}
              style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: '#FF3B30', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', minHeight: 34, display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <XCircle size={12} /> {selected.size} ablehnen
            </button>
          </>
        )}
      </div>

      {/* Gruppiert nach Folge */}
      {(() => {
        const byFolge = new Map<string, MeineItem[]>()
        for (const item of items) {
          const key = item.folge_nummer != null ? `Folge ${item.folge_nummer}` : 'Ohne Folge'
          if (!byFolge.has(key)) byFolge.set(key, [])
          byFolge.get(key)!.push(item)
        }
        return Array.from(byFolge.entries()).map(([folgeLabel, folgeItems]) => (
          <div key={folgeLabel} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {folgeLabel}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {folgeItems.map(item => {
                const key = `${item.typ}-${item.anfrage_id}`
                const isSelected = selected.has(key)
                return (
                  <div
                    key={key}
                    onClick={() => onToggleSelect(key)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      background: isSelected ? '#f0f7ff' : '#fff',
                      borderRadius: 8, border: `1px solid ${isSelected ? '#007AFF' : '#e0e0e0'}`,
                      padding: '10px 14px', cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    {/* Checkbox */}
                    <div style={{
                      width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                      border: `2px solid ${isSelected ? '#007AFF' : '#ccc'}`,
                      background: isSelected ? '#007AFF' : '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {isSelected && <CheckCircle size={11} color="#fff" strokeWidth={3} />}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{item.rollen_name}</span>
                        <TypBadge typ={item.typ} />
                      </div>
                      {(item.scene_nummer || item.ort_name) && (
                        <div style={{ fontSize: 12, color: '#757575', marginTop: 2 }}>
                          {item.scene_nummer && `Sz. ${item.scene_nummer}`}{item.ort_name && ` · ${item.ort_name}`}
                        </div>
                      )}
                      {item.erneut_anfrage_notiz && (
                        <div style={{ fontSize: 12, color: '#FFCC00', marginTop: 3 }}>
                          Hinweis: {item.erneut_anfrage_notiz}
                        </div>
                      )}
                    </div>

                    <div style={{ fontSize: 11, color: '#aaa', whiteSpace: 'nowrap' }}>
                      {new Date(item.beantragt_am).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))
      })()}
    </div>
  )
}
