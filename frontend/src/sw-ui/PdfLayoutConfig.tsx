/**
 * PdfLayoutConfig — wiederverwendbare Konfig-UI für das PDF-Layout/-Struktur.
 *
 * Extrahiert aus ExportDrawer (script-app), damit Ad-hoc-Export UND
 * Verteiler-PDF-Export-Profil dieselbe Maske teilen (Profil = Single Source
 * of Truth, Vorlage/Override-Hierarchie). Kontrolliert via value/onChange.
 *
 * Bewusst NICHT enthalten (instanz-/kontextgebunden): konkrete Werkstufe,
 * Szenenfilter, Dateiname, Wasserzeichen, Job-Ausführung. Die Live-Vorschau
 * läuft beim Konsumenten über den echten Backend-Renderer.
 *
 * Sektionen sind per `show`-Flags zuschaltbar — der Ad-hoc-Export blendet die
 * Profil-Extras (Lesezeichen-Detail, Nummerierung) aus, der Profil-Editor zeigt
 * sie.
 */
import { useRef, useState } from 'react'
import {
  FileText, GripVertical, BarChart2, Table2, List, Shield, Settings, BookOpen,
} from 'lucide-react'

export type PdfStructureItemType =
  | 'titelseite' | 'statistik' | 'onliner' | 'synopse' | 'fsk' | 'notiz' | 'custom'

export interface PdfStructureItem {
  key: string
  type: PdfStructureItemType
  label: string
  enabled: boolean
  zone: 'pre' | 'post'
  /** zeigt ein Zahnrad → onConfigureItem(key) */
  configurable?: boolean
  /** grün markiert, wenn bereits konfiguriert */
  configured?: boolean
}

export type PdfOrientation = 'portrait' | 'landscape'
export type KzFzModus = 'standard' | 'kz' | 'fz' | 'keine'
export type LesezeichenEbene = 'szene' | 'akt_szene' | 'strang_szene'

export interface PdfLayoutValue {
  items: PdfStructureItem[]
  szenenAktiv: boolean
  bookmarks: boolean
  orientation: PdfOrientation
  kzFzModus: KzFzModus
  fzText: string
  // Profil-Extras (optional)
  lesezeichenEbene?: LesezeichenEbene
  lesezeichenLabel?: string
  titelblatt?: boolean
  szenenNummerierung?: boolean
  seitenNummerierung?: boolean
}

export interface PdfLayoutConfigSections {
  structure?: boolean
  bookmarks?: boolean
  /** Lesezeichen-Ebene + -Label (Profil) */
  bookmarksDetail?: boolean
  pageLayout?: boolean
  headerFooter?: boolean
  /** Titelblatt + Szenen-/Seiten-Nummerierung (Profil) */
  numbering?: boolean
}

export interface PdfLayoutConfigProps {
  value: PdfLayoutValue
  onChange: (next: PdfLayoutValue) => void
  /** Beschriftung im Szenen-Block (z. B. Werkstufen-Label) */
  sceneLabel?: string
  /** Klick aufs Zahnrad eines konfigurierbaren Items */
  onConfigureItem?: (key: string) => void
  /** Welche Sektionen gezeigt werden. Default: alles außer den Profil-Extras. */
  show?: PdfLayoutConfigSections
}

const SEC: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, display: 'block',
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '5px 8px', fontSize: 11, border: '1px solid var(--border)',
  borderRadius: 6, background: 'var(--bg-canvas)', color: 'var(--text-primary)',
  fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
}
const segBtn = (active: boolean): React.CSSProperties => ({
  flex: 1, padding: '6px 9px', borderRadius: 6, fontSize: 11,
  border: `1px solid ${active ? '#007AFF' : 'var(--border)'}`,
  background: active ? 'rgba(0,122,255,0.08)' : 'transparent',
  color: active ? '#007AFF' : 'var(--text-primary)',
  cursor: 'pointer', fontFamily: 'inherit', fontWeight: active ? 600 : 400,
})

function itemIcon(item: PdfStructureItem) {
  const ok = !!item.configured
  switch (item.type) {
    case 'statistik': return <BarChart2 size={11} style={{ color: ok ? '#00C853' : 'var(--text-muted)', flexShrink: 0 }} />
    case 'onliner':   return <Table2 size={11} style={{ color: ok ? '#00C853' : 'var(--text-muted)', flexShrink: 0 }} />
    case 'synopse':   return <List size={11} style={{ color: ok ? '#00C853' : 'var(--text-muted)', flexShrink: 0 }} />
    case 'fsk':       return <Shield size={11} style={{ color: item.enabled ? '#FF9500' : 'var(--text-muted)', flexShrink: 0 }} />
    case 'titelseite':return <FileText size={11} style={{ color: '#007AFF', flexShrink: 0 }} />
    default:          return <FileText size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
  }
}

function ItemRow({ item, onToggle, onDragStart, onConfigure }: {
  item: PdfStructureItem
  onToggle: () => void
  onDragStart: () => void
  onConfigure?: () => void
}) {
  const needsConfig  = !!item.configurable
  const isConfigured = !!item.configured
  return (
    <div
      draggable
      onDragStart={onDragStart}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px',
        borderRadius: 5, cursor: 'grab', opacity: item.enabled ? 1 : 0.4, transition: 'opacity 0.15s',
      }}
    >
      <GripVertical size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      <input
        type="checkbox" checked={item.enabled}
        onChange={() => {
          // Unkonfiguriertes Element zuerst konfigurieren statt nur aktivieren
          if (needsConfig && !isConfigured && !item.enabled && onConfigure) onConfigure()
          else onToggle()
        }}
        style={{ cursor: 'pointer', accentColor: '#007AFF', width: 12, height: 12, flexShrink: 0 }}
      />
      {itemIcon(item)}
      <span style={{ flex: 1, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>
        {item.label}
      </span>
      {needsConfig && onConfigure && (
        <button
          onClick={e => { e.stopPropagation(); onConfigure() }}
          style={{
            display: 'flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 4, fontSize: 10,
            border: `1px solid ${isConfigured ? '#00C853' : 'var(--border)'}`,
            background: isConfigured ? 'rgba(0,200,83,0.08)' : 'transparent',
            color: isConfigured ? '#00C853' : 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <Settings size={9} />{isConfigured ? 'konfiguriert' : 'Konfigurieren'}
        </button>
      )}
    </div>
  )
}

/**
 * Drop-Zone auf MODUL-Ebene (stabile Komponenten-Identität) — sonst würde ein
 * Re-Render durch onDragOver/setDragOver die gezogene Zeile neu mounten und den
 * laufenden HTML5-Drag abbrechen.
 */
function StructureZone({
  zone, items, label, active, onDragOverZone, onLeave, onDropZone,
  onToggle, onItemDragStart, onConfigureItem,
}: {
  zone: 'pre' | 'post'
  items: PdfStructureItem[]
  label: string
  active: boolean
  onDragOverZone: (zone: 'pre' | 'post') => void
  onLeave: () => void
  onDropZone: (zone: 'pre' | 'post') => void
  onToggle: (key: string) => void
  onItemDragStart: (key: string) => void
  onConfigureItem?: (key: string) => void
}) {
  return (
    <div
      onDragOver={e => { e.preventDefault(); onDragOverZone(zone) }}
      onDragLeave={onLeave}
      onDrop={() => onDropZone(zone)}
      style={{
        minHeight: 36, borderRadius: 8, padding: '6px 0',
        border: `1.5px dashed ${active ? '#007AFF' : 'var(--border)'}`,
        background: active ? 'rgba(0,122,255,0.04)' : 'transparent',
        marginBottom: zone === 'pre' ? 6 : 0, transition: 'border-color 0.1s, background 0.1s',
      }}
    >
      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, padding: '2px 8px 4px', opacity: 0.7 }}>
        {label}
      </div>
      {items.map(item => (
        <ItemRow
          key={item.key} item={item}
          onToggle={() => onToggle(item.key)}
          onDragStart={() => onItemDragStart(item.key)}
          onConfigure={onConfigureItem ? () => onConfigureItem(item.key) : undefined}
        />
      ))}
      {items.length === 0 && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '4px 8px', fontStyle: 'italic' }}>
          Element hierher ziehen
        </div>
      )}
    </div>
  )
}

export function PdfLayoutConfig({ value, onChange, sceneLabel, onConfigureItem, show }: PdfLayoutConfigProps) {
  const s: Required<PdfLayoutConfigSections> = {
    structure: true, bookmarks: true, pageLayout: true, headerFooter: true,
    bookmarksDetail: false, numbering: false, ...(show || {}),
  }
  const set = (patch: Partial<PdfLayoutValue>) => onChange({ ...value, ...patch })

  const dragKeyRef = useRef<string | null>(null)
  const [dragOverZone, setDragOverZone] = useState<'pre' | 'post' | null>(null)

  const preItems  = value.items.filter(i => i.zone === 'pre')
  const postItems = value.items.filter(i => i.zone === 'post')

  const toggleItem = (key: string) =>
    set({ items: value.items.map(i => i.key === key ? { ...i, enabled: !i.enabled } : i) })
  const setAll = (enabled: boolean) =>
    set({ items: value.items.map(i => ({ ...i, enabled })) })

  const dropToZone = (zone: 'pre' | 'post') => {
    setDragOverZone(null)
    const key = dragKeyRef.current
    dragKeyRef.current = null
    if (!key) return
    const item = value.items.find(i => i.key === key)
    if (!item || item.zone === zone) return
    // Aus der Liste nehmen und ans Ende der Zielzone hängen (wie ExportDrawer)
    const rest = value.items.filter(i => i.key !== key)
    set({ items: [...rest, { ...item, zone }] })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ── Dokumentstruktur ── */}
      {s.structure && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ ...SEC, marginBottom: 0 }}>Dokumentstruktur</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => setAll(true)} style={{ fontSize: 10, padding: '1px 7px', borderRadius: 4, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontFamily: 'inherit' }}>Alle</button>
              <button onClick={() => setAll(false)} style={{ fontSize: 10, padding: '1px 7px', borderRadius: 4, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontFamily: 'inherit' }}>Keine</button>
            </div>
          </div>

          <StructureZone
            zone="pre" items={preItems} label="VOR Szenen" active={dragOverZone === 'pre'}
            onDragOverZone={setDragOverZone} onLeave={() => setDragOverZone(null)} onDropZone={dropToZone}
            onToggle={toggleItem} onItemDragStart={k => { dragKeyRef.current = k }} onConfigureItem={onConfigureItem}
          />

          {/* Szenen-Block */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, marginBottom: 6,
            background: value.szenenAktiv ? 'rgba(0,122,255,0.06)' : 'var(--bg-subtle)',
            border: `1px solid ${value.szenenAktiv ? 'rgba(0,122,255,0.3)' : 'var(--border)'}`,
          }}>
            <input type="checkbox" checked={value.szenenAktiv} onChange={e => set({ szenenAktiv: e.target.checked })}
              style={{ cursor: 'pointer', accentColor: '#007AFF', width: 14, height: 14, flexShrink: 0 }} />
            <FileText size={13} style={{ color: value.szenenAktiv ? '#007AFF' : 'var(--text-muted)', flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: value.szenenAktiv ? 'var(--text-primary)' : 'var(--text-muted)', flex: 1 }}>Szenen</span>
            {sceneLabel && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{sceneLabel}</span>}
          </div>

          <StructureZone
            zone="post" items={postItems} label="NACH Szenen" active={dragOverZone === 'post'}
            onDragOverZone={setDragOverZone} onLeave={() => setDragOverZone(null)} onDropZone={dropToZone}
            onToggle={toggleItem} onItemDragStart={k => { dragKeyRef.current = k }} onConfigureItem={onConfigureItem}
          />

          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.4 }}>
            Elemente per Drag &amp; Drop zwischen den Zonen verschieben.
          </div>
        </div>
      )}

      {/* ── PDF-Lesezeichen ── */}
      {s.bookmarks && (
        <div>
          <span style={SEC}>PDF-Lesezeichen</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--text-primary)', userSelect: 'none' }}>
            <input type="checkbox" checked={value.bookmarks} onChange={e => set({ bookmarks: e.target.checked })}
              style={{ cursor: 'pointer', accentColor: '#007AFF', width: 13, height: 13 }} />
            <BookOpen size={12} style={{ color: value.bookmarks ? '#007AFF' : 'var(--text-muted)' }} />
            PDF-Lesezeichen / Inhaltsverzeichnis
          </label>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3, marginLeft: 21 }}>
            Erzeugt anklickbare Bookmarks im PDF-Reader
          </div>
          {s.bookmarksDetail && value.bookmarks && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <div style={{ flex: 1 }}>
                <span style={{ ...SEC, marginBottom: 4 }}>Ebene</span>
                <select style={inputStyle} value={value.lesezeichenEbene ?? 'szene'} onChange={e => set({ lesezeichenEbene: e.target.value as LesezeichenEbene })}>
                  <option value="szene">Szene</option>
                  <option value="akt_szene">Akt + Szene</option>
                  <option value="strang_szene">Strang + Szene</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <span style={{ ...SEC, marginBottom: 4 }}>Label</span>
                <input style={inputStyle} value={value.lesezeichenLabel ?? ''} placeholder="{szenennr} – {motiv}"
                  onChange={e => set({ lesezeichenLabel: e.target.value })} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Seitenlayout ── */}
      {s.pageLayout && (
        <div>
          <span style={SEC}>Seitenlayout</span>
          <div style={{ display: 'flex', gap: 5 }}>
            {(['portrait', 'landscape'] as const).map(ori => (
              <button key={ori} onClick={() => set({ orientation: ori })} style={segBtn(value.orientation === ori)}>
                {ori === 'portrait' ? '↕ Hochformat' : '↔ Querformat'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Kopf-/Fußzeile ── */}
      {s.headerFooter && (
        <div>
          <span style={SEC}>Kopf-/Fußzeile</span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 6 }}>
            {([
              { val: 'standard', label: 'Standard' },
              { val: 'kz', label: 'Nur KZ' },
              { val: 'fz', label: 'Nur FZ' },
              { val: 'keine', label: 'Keine' },
            ] as const).map(opt => (
              <button key={opt.val} onClick={() => set({ kzFzModus: opt.val })}
                style={{ ...segBtn(value.kzFzModus === opt.val), flex: undefined, padding: '5px 8px' }}>
                {opt.label}
              </button>
            ))}
          </div>
          {value.kzFzModus === 'standard' && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>KZ + FZ gemäß DK-Einstellungen</div>
          )}
          {value.kzFzModus === 'fz' && (
            <textarea value={value.fzText} onChange={e => set({ fzText: e.target.value })}
              placeholder="Fußzeilen-Text (leer = Fußzeile ohne Inhalt)" rows={2}
              style={{ ...inputStyle, resize: 'vertical' }} />
          )}
        </div>
      )}

      {/* ── Nummerierung (Profil) — Titelblatt läuft über das Struktur-Element „Titelseite" ── */}
      {s.numbering && (
        <div>
          <span style={SEC}>Nummerierung</span>
          {([
            { k: 'szenenNummerierung' as const, label: 'Szenen-Nummerierung' },
            { k: 'seitenNummerierung' as const, label: 'Seiten-Nummerierung' },
          ]).map(({ k, label }) => (
            <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--text-primary)', padding: '3px 0', userSelect: 'none' }}>
              <input type="checkbox" checked={!!value[k]} onChange={e => set({ [k]: e.target.checked } as Partial<PdfLayoutValue>)}
                style={{ cursor: 'pointer', accentColor: '#007AFF', width: 13, height: 13 }} />
              {label}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

export default PdfLayoutConfig
