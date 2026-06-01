import { useState, useEffect, useMemo } from 'react'
import {
  AlertTriangle, CheckCircle, RefreshCw, Loader2, Check, X,
  AlertCircle, ShieldAlert, ImageOff,
} from 'lucide-react'
import { api } from '../../api/client'
import { useSelectedProduction } from '../../contexts'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Befund {
  id: string
  typ: string
  identitaet: string
  block_nummer: number | null
  beschreibung: string
  status: 'offen' | 'erledigt' | 'auto_geloest'
  erledigt_von: string | null
  erledigt_am: string | null
  geloest_vermerk: string | null
  erstellt_am: string
  character_name: string | null
}

// ── Typ-Konfiguration ─────────────────────────────────────────────────────────

const TYP_CONFIG: Record<string, { label: string; color: string; bg: string; Icon: React.ComponentType<any> }> = {
  cast_luecke: {
    label: 'Cast-Lücke',
    color: '#FF9500',
    bg: 'rgba(255,149,0,0.08)',
    Icon: AlertTriangle,
  },
  cast_ueberschuss: {
    label: 'Cast-Überschuss',
    color: '#FF3B30',
    bg: 'rgba(255,59,48,0.08)',
    Icon: AlertCircle,
  },
  freigabe_ausstehend: {
    label: 'Freigabe ausstehend',
    color: '#007AFF',
    bg: 'rgba(0,122,255,0.08)',
    Icon: ShieldAlert,
  },
  bild_obergrenze: {
    label: 'Bild-Obergrenze',
    color: '#FFCC00',
    bg: 'rgba(255,204,0,0.12)',
    Icon: ImageOff,
  },
}

function typConfig(typ: string) {
  return TYP_CONFIG[typ] ?? { label: typ, color: 'var(--text-muted)', bg: 'var(--bg)', Icon: AlertTriangle }
}

// ── BefundCard ────────────────────────────────────────────────────────────────

function BefundCard({
  befund, onErledigt,
}: {
  befund: Befund
  onErledigt: (id: string, vermerk: string) => Promise<void>
}) {
  const [showVermerk, setShowVermerk] = useState(false)
  const [vermerk, setVermerk] = useState('')
  const [saving, setSaving] = useState(false)
  const cfg = typConfig(befund.typ)
  const isOffen = befund.status === 'offen'

  async function handleErledigen() {
    setSaving(true)
    try {
      await onErledigt(befund.id, vermerk)
    } finally {
      setSaving(false)
      setShowVermerk(false)
      setVermerk('')
    }
  }

  return (
    <div style={{
      padding: '14px 16px',
      borderBottom: '1px solid var(--border)',
      borderLeft: `3px solid ${befund.status !== 'offen' ? 'var(--border)' : cfg.color}`,
      background: befund.status !== 'offen' ? 'transparent' : cfg.bg,
      opacity: befund.status !== 'offen' ? 0.6 : 1,
      transition: 'opacity 0.2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        {/* Icon */}
        <cfg.Icon
          size={15}
          style={{
            color: befund.status !== 'offen' ? 'var(--text-muted)' : cfg.color,
            flexShrink: 0,
            marginTop: 1,
          }}
        />

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 11, fontWeight: 600,
              color: befund.status !== 'offen' ? 'var(--text-muted)' : cfg.color,
            }}>
              {cfg.label}
            </span>
            {befund.block_nummer != null && (
              <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg)', padding: '1px 6px', borderRadius: 4, border: '1px solid var(--border)' }}>
                Block {befund.block_nummer}
              </span>
            )}
            {befund.status === 'erledigt' && (
              <span style={{ fontSize: 10, color: '#00C853', display: 'flex', alignItems: 'center', gap: 3 }}>
                <Check size={10} /> Erledigt
              </span>
            )}
            {befund.status === 'auto_geloest' && (
              <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                <CheckCircle size={10} /> Auto-geschlossen
              </span>
            )}
          </div>

          <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.4, marginBottom: 4 }}>
            {befund.beschreibung}
          </div>

          {/* Vermerk (erledigt/auto) */}
          {befund.geloest_vermerk && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 4 }}>
              {befund.geloest_vermerk}
            </div>
          )}
          {befund.erledigt_von && befund.erledigt_am && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
              Erledigt von {befund.erledigt_von} · {new Date(befund.erledigt_am).toLocaleDateString('de-DE')}
            </div>
          )}

          {/* Erledigen-Inline */}
          {isOffen && showVermerk && (
            <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <input
                autoFocus
                value={vermerk}
                onChange={e => setVermerk(e.target.value)}
                placeholder="Optionaler Vermerk…"
                onKeyDown={e => { if (e.key === 'Enter') handleErledigen(); if (e.key === 'Escape') setShowVermerk(false) }}
                style={{
                  flex: 1, padding: '5px 8px', borderRadius: 6,
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  fontSize: 12, color: 'var(--text-primary)',
                }}
              />
              <button
                onClick={handleErledigen}
                disabled={saving}
                style={{
                  height: 28, paddingLeft: 10, paddingRight: 10, borderRadius: 6,
                  border: 'none', background: '#000', color: '#fff',
                  cursor: saving ? 'default' : 'pointer', fontSize: 12,
                  display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
                }}
              >
                {saving ? <Loader2 size={11} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Check size={11} />}
                OK
              </button>
              <button
                onClick={() => setShowVermerk(false)}
                style={{
                  height: 28, width: 28, borderRadius: 6,
                  border: '1px solid var(--border)', background: 'transparent',
                  color: 'var(--text-muted)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}
              >
                <X size={11} />
              </button>
            </div>
          )}
        </div>

        {/* Erledigen-Button */}
        {isOffen && !showVermerk && (
          <button
            onClick={() => setShowVermerk(true)}
            style={{
              padding: '4px 10px', borderRadius: 6, fontSize: 11,
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0,
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <Check size={11} /> Erledigen
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

type StatusFilter = 'offen' | 'erledigt' | 'auto_geloest' | 'alle'

export default function BefundePage() {
  const { selectedProduction } = useSelectedProduction()
  const [befunde, setBefunde] = useState<Befund[]>([])
  const [loading, setLoading] = useState(false)
  const [checksLoading, setChecksLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('offen')
  const [lastCheck, setLastCheck] = useState<string | null>(null)

  const prodId = selectedProduction?.id ?? null

  useEffect(() => {
    if (!prodId) { setBefunde([]); return }
    setLoading(true)
    api.getBefunde(prodId, 'alle')
      .then(setBefunde)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [prodId])

  const filtered = useMemo(() => {
    if (statusFilter === 'alle') return befunde
    return befunde.filter(b => b.status === statusFilter)
  }, [befunde, statusFilter])

  const counts = useMemo(() => ({
    offen:       befunde.filter(b => b.status === 'offen').length,
    erledigt:    befunde.filter(b => b.status === 'erledigt').length,
    auto_geloest: befunde.filter(b => b.status === 'auto_geloest').length,
  }), [befunde])

  // Typen-Aufschlüsselung der offenen Befunde
  const typCounts = useMemo(() => {
    const offene = befunde.filter(b => b.status === 'offen')
    const result: Record<string, number> = {}
    for (const b of offene) result[b.typ] = (result[b.typ] ?? 0) + 1
    return result
  }, [befunde])

  async function handleChecks() {
    if (!prodId) return
    setChecksLoading(true)
    try {
      const [castResult, freigabeResult] = await Promise.all([
        api.runCastAbgleich(prodId),
        api.runFreigabeCheck(prodId),
      ])
      // Reload all befunde
      const updated = await api.getBefunde(prodId, 'alle')
      setBefunde(updated)
      setLastCheck(new Date().toLocaleTimeString('de-DE'))
    } catch (err: any) {
      alert(err?.message || 'Fehler beim Ausführen der Checks')
    } finally {
      setChecksLoading(false)
    }
  }

  async function handleErledigt(id: string, vermerk: string) {
    const updated = await api.erledigeBefund(id, vermerk || undefined)
    setBefunde(prev => prev.map(b => b.id === id ? { ...b, ...updated } : b))
  }

  if (!prodId) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
        Keine Produktion ausgewählt.
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Toolbar */}
      <div style={{
        padding: '10px 20px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        background: 'var(--bg-surface)', flexWrap: 'wrap',
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', flex: 1, minWidth: 120 }}>
          Befund-Register
        </div>

        {/* Typ-Übersicht */}
        {Object.entries(typCounts).map(([typ, n]) => {
          const cfg = typConfig(typ)
          return (
            <div key={typ} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '3px 8px', borderRadius: 6,
              background: cfg.bg, border: `1px solid ${cfg.color}44`,
              fontSize: 11, color: cfg.color,
            }}>
              <cfg.Icon size={11} />
              {n}× {cfg.label}
            </div>
          )
        })}

        {lastCheck && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Zuletzt: {lastCheck}
          </span>
        )}

        <button
          onClick={handleChecks}
          disabled={checksLoading}
          style={{
            padding: '6px 12px', borderRadius: 6, border: 'none',
            background: '#000', color: '#fff',
            cursor: checksLoading ? 'default' : 'pointer',
            fontSize: 12, fontWeight: 500,
            display: 'flex', alignItems: 'center', gap: 6,
            opacity: checksLoading ? 0.7 : 1,
          }}
        >
          {checksLoading
            ? <Loader2 size={12} style={{ animation: 'spin 0.8s linear infinite' }} />
            : <RefreshCw size={12} />}
          Checks ausführen
        </button>
      </div>

      {/* Status-Filter Tabs */}
      <div style={{
        display: 'flex', gap: 0, borderBottom: '1px solid var(--border)',
        background: 'var(--bg)', flexShrink: 0, paddingLeft: 20,
      }}>
        {([
          { key: 'offen',        label: `Offen (${counts.offen})` },
          { key: 'erledigt',     label: `Erledigt (${counts.erledigt})` },
          { key: 'auto_geloest', label: `Auto-geschlossen (${counts.auto_geloest})` },
          { key: 'alle',         label: `Alle (${befunde.length})` },
        ] as { key: StatusFilter; label: string }[]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            style={{
              padding: '8px 16px', background: 'none', border: 'none',
              borderBottom: `2px solid ${statusFilter === tab.key ? '#000' : 'transparent'}`,
              cursor: 'pointer', fontSize: 12,
              color: statusFilter === tab.key ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: statusFilter === tab.key ? 600 : 400,
              transition: 'color 0.15s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}>
            <Loader2 size={24} style={{ animation: 'spin 0.8s linear infinite', color: 'var(--text-muted)' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{
            maxWidth: 480, margin: '64px auto', textAlign: 'center',
            color: 'var(--text-muted)', padding: '0 24px',
          }}>
            {statusFilter === 'offen'
              ? (
                <>
                  <CheckCircle size={36} style={{ opacity: 0.2, marginBottom: 16, color: '#00C853' }} />
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)' }}>
                    Keine offenen Befunde
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                    Führe „Checks ausführen" aus um den aktuellen Stand zu prüfen.
                  </div>
                </>
              ) : (
                <>
                  <AlertTriangle size={36} style={{ opacity: 0.2, marginBottom: 16 }} />
                  <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>
                    Keine Einträge in dieser Kategorie.
                  </div>
                </>
              )
            }
          </div>
        ) : (
          filtered.map(b => (
            <BefundCard
              key={b.id}
              befund={b}
              onErledigt={handleErledigt}
            />
          ))
        )}
      </div>
    </div>
  )
}
