import { useState } from 'react'
import { ChevronDown, Plus, Lock, Users, Globe, Eye } from 'lucide-react'
import type { WerkstufeMeta } from '../../hooks/useDokument'
import Tooltip from '../Tooltip'
import { api } from '../../api/client'

const SICHTBARKEIT_ICONS: Record<string, React.ReactNode> = {
  privat: <Lock size={11} />,
  team:   <Users size={11} />,
  alle:   <Globe size={11} />,
  colab:  <Users size={11} />,
}

const SICHTBARKEIT_COLORS: Record<string, string> = {
  privat: '#FF9500',
  team:   '#007AFF',
  alle:   '#00C853',
  colab:  '#AF52DE',
}

const TYP_LABELS: Record<string, string> = {
  drehbuch: 'Drehbuch',
  storyline: 'Storyline',
  notiz: 'Notiz',
  abstrakt: 'Abstrakt',
}

interface Props {
  selectedWerk: WerkstufeMeta | null
  werkstufen: WerkstufeMeta[]
  staffelId: string
  folgeNummer: number
  folgeId: number | null
  onSelectWerkstufe: (id: string) => void
  onCreateWerkstufe: (typ: string) => void
  onReloadWerkstufen: () => void
}

export default function EditorPanelHeader({
  selectedWerk, werkstufen, staffelId, folgeNummer, folgeId,
  onSelectWerkstufe, onCreateWerkstufe, onReloadWerkstufen,
}: Props) {
  const [showMenu, setShowMenu] = useState(false)

  // Group werkstufen by typ
  const grouped = new Map<string, WerkstufeMeta[]>()
  for (const w of werkstufen) {
    const list = grouped.get(w.typ) || []
    list.push(w)
    grouped.set(w.typ, list)
  }

  const typLabel = selectedWerk ? (TYP_LABELS[selectedWerk.typ] ?? selectedWerk.typ) : 'Typ wählen'
  const versionLabel = selectedWerk ? `V${selectedWerk.version_nummer}` : ''
  const sichtbarkeit = selectedWerk?.sichtbarkeit ?? 'team'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0, flexWrap: 'wrap' }}>

      {/* Werkstufen-Selector */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setShowMenu(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}
        >
          {typLabel}
          <ChevronDown size={11} style={{ color: 'var(--text-muted)' }} />
        </button>
        {showMenu && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => setShowMenu(false)} />
            <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 99, marginTop: 4, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--shadow-xl)', minWidth: 220, padding: '4px 0' }}>
              {Array.from(grouped.entries()).map(([typ, versions]) => (
                <div key={typ}>
                  <div style={{ padding: '5px 12px', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {TYP_LABELS[typ] ?? typ}
                  </div>
                  {versions.sort((a, b) => b.version_nummer - a.version_nummer).map(w => (
                    <button
                      key={w.id}
                      onClick={() => { onSelectWerkstufe(w.id); setShowMenu(false) }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                        padding: '7px 12px 7px 20px', fontSize: 12,
                        background: w.id === selectedWerk?.id ? 'var(--bg-active)' : 'transparent',
                        border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                        color: 'var(--text-primary)', fontWeight: w.id === selectedWerk?.id ? 600 : 400,
                      }}
                    >
                      V{w.version_nummer}
                      {w.label && <span style={{ color: 'var(--text-secondary)' }}>{w.label}</span>}
                      <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>
                        {w.szenen_count} Sz.
                      </span>
                      {w.abgegeben && <span style={{ fontSize: 9, background: 'var(--bg-subtle)', padding: '1px 4px', borderRadius: 3, color: 'var(--text-muted)' }}>Abg.</span>}
                    </button>
                  ))}
                </div>
              ))}

              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

              {/* New werkstufe options */}
              {['drehbuch', 'storyline', 'notiz'].map(typ => (
                <button
                  key={typ}
                  onClick={() => { onCreateWerkstufe(typ); setShowMenu(false) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '7px 12px', fontSize: 12, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--sw-info)', fontFamily: 'inherit' }}
                >
                  <Plus size={11} /> Neue {TYP_LABELS[typ] ?? typ}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Version badge */}
      {selectedWerk && (
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
          {versionLabel}
        </span>
      )}

      {/* Sichtbarkeits-Badge */}
      {selectedWerk && (
        <Tooltip text={`Sichtbarkeit: ${sichtbarkeit}${selectedWerk.abgegeben ? ' · Abgegeben' : ''}`}>
          <span
            style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '3px 7px',
              border: `1px solid ${SICHTBARKEIT_COLORS[sichtbarkeit] ?? '#ccc'}`,
              borderRadius: 999, fontSize: 11, fontWeight: 500,
              color: SICHTBARKEIT_COLORS[sichtbarkeit] ?? '#ccc',
            }}
          >
            {SICHTBARKEIT_ICONS[sichtbarkeit]}
            {sichtbarkeit}
          </span>
        </Tooltip>
      )}

      <div style={{ flex: 1 }} />
    </div>
  )
}
