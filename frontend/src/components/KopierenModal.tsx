import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import Tooltip from './Tooltip'
import { api } from '../api/client'
import { useSelectedProduction } from '../contexts'
import { useTerminologie } from '../sw-ui'

// ── Typen ─────────────────────────────────────────────────────────────────────

type PreviewItem = { label?: string; count?: number }
type Preview = Record<string, Record<string, PreviewItem>>

type SectionDef = {
  id: string
  label: string
  tooltip: string
  isList?: boolean
}
type GroupDef = {
  id: string
  label: string
  sections: SectionDef[]
}

// ── Sections-Definition ────────────────────────────────────────────────────────

const SECTION_GROUPS: GroupDef[] = [
  {
    id: 'darstellung',
    label: 'Darstellung',
    sections: [
      {
        id: 'datumsformat',
        label: 'Datumsformat',
        tooltip: 'Datumsformat für Kopf-/Fußzeilen und Exporte.\nDeutsch: TT.MM.JJJJ · Englisch: MM/DD/YYYY',
      },
      {
        id: 'scene_kuerzel',
        label: 'Szenen-Kürzel',
        tooltip: 'Einbuchstaben-Kürzel für INT/EXT und Tageszeiten in der einzeiligen Szenenübersicht.\nBeispiel: I = Innen, E = Außen, T = Tag, N = Nacht, D = Dämmerung, A = Abend',
      },
      {
        id: 'szenenfarben',
        label: 'Szenenfarben',
        tooltip: 'Farbkodierung der Szenen nach INT/EXT und Tageszeit.\nJe eine Farbe (Hintergrund + Akzentstreifen) für Hell- und Dunkel-Modus.\nStandard: Movie-Magic-Scheduling-Farben (Industrie-Standard).',
      },
      {
        id: 'ln_settings',
        label: 'Zeilennummern',
        tooltip: 'Standard-Schriftart, -Größe und -Farbe der Zeilennummern im Drehbuch-Editor.\nNutzer können diese Einstellung in ihren persönlichen Ansichts-Einstellungen individuell überschreiben.',
      },
      {
        id: 'replik_settings',
        label: 'Replikennummern',
        tooltip: 'Farbe und Modus der Replikennummerierung.\nModus "Durchgehend": eine laufende Nummer über alle Szenen (1 bis n).\nModus "Pro Szene": jede Szene beginnt bei Replik 1.',
      },
    ],
  },
  {
    id: 'terminologie',
    label: 'Terminologie',
    sections: [
      {
        id: 'treatment_label',
        label: 'Vorstufen-Label',
        tooltip: 'Bezeichnung der Schreibstufe vor dem Drehbuch, gilt nur für diese Produktion.\nOptionen: "Treatment", "Storylines" oder "Outline".',
      },
      {
        id: 'glossar',
        label: 'Glossar',
        isList: true,
        tooltip: 'Abkürzungsverzeichnis der Produktion.\nJeder Eintrag besteht aus: Kürzel (z. B. NMDP), vollständiger Name und Erklärung.\nErsetzen: alle vorhandenen Einträge werden gelöscht und durch die der Quelle ersetzt.\nDazufügen: Einträge mit bereits vorhandenem Kürzel werden übersprungen.',
      },
    ],
  },
  {
    id: 'figuren',
    label: 'Figuren & Charaktere',
    sections: [
      {
        id: 'kategorien',
        label: 'Charakter-Kategorien',
        isList: true,
        tooltip: 'Kategorien für Rollen und Komparsen, z. B. "Hauptrolle", "Nebenrolle", "Tagesrolle".\nDie Reihenfolge (Drag & Drop) wird mitübernommen.\nErsetzen: alle vorhandenen Kategorien werden gelöscht.\nDazufügen: Kategorien mit gleichem Namen werden übersprungen.',
      },
      {
        id: 'charakter_felder',
        label: 'Charakter-Felder',
        isList: true,
        tooltip: 'Eigene Profilfelder für Rollen und Motive.\nBeispiele: Alter, Backstory, Charakterbeschreibung, Dramaturgische Funktion.\nFeldbereiche: "Alle", "Nur Rollen", "Nur Komparsen", "Nur Motive".\nErsetzen: alle Felder werden gelöscht — bestehende Feldwerte in der Ziel-Produktion gehen verloren!\nDazufügen: Felder mit gleichem Name+Bereich werden übersprungen.',
      },
    ],
  },
  {
    id: 'fassungen',
    label: 'Fassungen & Revisionen',
    sections: [
      {
        id: 'labels',
        label: 'Fassungs-Labels',
        isList: true,
        tooltip: 'Namen der Fassungsstufen, z. B. "Autorenfassung", "Regie-Fassung", "Produktionsfassung".\nDas als Produktionsfassung markierte Label löst den Schloss-Mechanismus aus.\nErsetzen: alle vorhandenen Labels werden gelöscht.\nDazufügen: Labels mit gleichem Namen werden übersprungen.',
      },
      {
        id: 'colors',
        label: 'Revisions-Farben',
        isList: true,
        tooltip: 'Farbkodierung für Revisionsstände — überarbeitete Seiten werden in dieser Farbe gedruckt.\nReihenfolge = Revisions-Sequenz.\nWGA-Standard (USA/UK): Weiß → Blau → Pink → Gelb → Grün → Goldenrod → …\nDeutsche Produktionen: keine Normierung, jede Produktion wählt selbst.\nErsetzen: alle vorhandenen Farben werden gelöscht.\nDazufügen: Farben mit gleichem Namen werden übersprungen.',
      },
      {
        id: 'einstellungen',
        label: 'Revisions-Export',
        tooltip: 'Memo-Schwellwert in Zeichen: Änderungen unter dieser Zeichenanzahl erscheinen im Revisions-Export als kompakte Memo-Zeile statt als vollständiger Absatz.\nBeispiel: 100 Zeichen = Korrekturen unter einer Zeile werden zusammengefasst.',
      },
      {
        id: 'vorstopp',
        label: 'Vorstopp-Einstellungen',
        tooltip: 'Verhältnis für die automatische Stoppzeit-Berechnung.\nFormel: X Einheiten entsprechen Y Sekunden.\nBeispiel: 92 Seiten = 52 Minuten → jede Seite ≈ 34 Sek.\nEinheitenoptionen: Seiten, Zeichen ohne Leerzeichen, Zeichen mit Leerzeichen.',
      },
    ],
  },
  {
    id: 'format',
    label: 'Dokument-Format',
    sections: [
      {
        id: 'absatzformate',
        label: 'Absatzformate',
        isList: true,
        tooltip: 'Vollständiges Format-Preset für den Drehbuch-Editor.\nEnthält alle Absatzstile: Szenenüberschrift, Aktion, Dialog, Figuren-Cue, Klammer, Übergang usw.\nJeder Stil definiert: Schriftart, Größe, Einzüge, Abstände, Tastenkürzel, Enter/Tab-Folgestil.\nErsetzen: alle vorhandenen Formate werden gelöscht.\nDazufügen: Formate mit gleichem Namen werden übersprungen.',
      },
      {
        id: 'seitenformat_margins',
        label: 'Seitenformat & Ränder',
        tooltip: 'Papiergröße (A4 oder US Letter) und Seitenränder.\nRänder in mm: oben, unten, links, rechts.\nWird beim Export und in der Seitenvorschau angewendet.',
      },
      {
        id: 'kopf_fusszeilen',
        label: 'Kopf-/Fußzeilen',
        isList: true,
        tooltip: 'Standard-Kopf- und Fußzeilen für Drehbuch, Storyline und Notiz-Dokumente.\nEnthält Platzhalter-Chips: {{seitenzahl}}, {{produktion}}, {{datum}}, {{fassung}} usw.\nKonfigurierbar pro Dokument-Typ (Drehbuch / Storyline / Notiz / Alle).\nErsetzen: alle Kopf-/Fußzeilen werden überschrieben.\nDazufügen: Typen mit bereits aktiver Konfiguration werden übersprungen.',
      },
      {
        id: 'vorlagen',
        label: 'Notiz-Vorlagen',
        isList: true,
        tooltip: 'Dokument-Vorlagen für Titelseiten, Synopsis, Recap, Precap und benutzerdefinierte Typen.\nJede Vorlage enthält Platzhalter-Chips, Tabellen, Formatierungen und Seitenlayout.\nErsetzen: alle vorhandenen Vorlagen werden gelöscht.\nDazufügen: Vorlagen mit gleichem Name+Typ werden übersprungen.',
      },
      {
        id: 'stockshot_templates',
        label: 'Stockshot-Templates',
        isList: true,
        tooltip: 'Vorgefertigte Szenenvorlagen für Stockshots.\nKategorien: Ortswechsel, Zeit vergeht, Stimmungswechsel.\nJedes Template enthält: Name, Oneliner-Vorlage, Stoppzeit, INT/EXT, Stimmung, Beschreibung.\nMotiv-Verknüpfungen werden beim Kopieren entfernt — nur die Vorlage selbst wird übernommen.\nErsetzen: alle vorhandenen Templates werden gelöscht.\nDazufügen: Templates mit gleichem Name+Kategorie werden übersprungen.',
      },
    ],
  },
  {
    id: 'sonstige',
    label: 'Sonstige',
    sections: [
      {
        id: 'daily_regeln',
        label: 'Daily-Regeln',
        tooltip: 'Automatische Warnregeln für den Drehbetrieb.\nBeispiele: Mindest-Nachtbild-Anteil, maximale Drehdauer pro Einheit.\nWird im Daily-Report ausgewertet.',
      },
      {
        id: 'statistik_config',
        label: 'Statistik-Panel',
        tooltip: 'Konfiguration des Statistik-Panels in der Drehbuch-Ansicht.\nLegt fest, welche Auswertungen angezeigt werden und in welcher Reihenfolge:\nSzenen-Übersicht, Charakter-Repliken, Motiv-Auslastung, Komparsen-Bedarf usw.',
      },
    ],
  },
  {
    id: 'autorenplan',
    label: 'Autorenplan',
    sections: [
      {
        id: 'autorenplan_kategorien',
        label: 'Job-Kategorien',
        isList: true,
        tooltip: 'Job-Kategorien für den Autorenplan.\nJede Kategorie definiert: Bezeichnung, Gagen-Vorgabe, Abrechnungstyp (LSt/RG), Dauer, Präsenz-Wochen, Farbe.\nBeispiele: Storyeditor, Autor, Supervising Scripteditor, Drehbuchautor.\nVerknüpfung mit Vertragsdatenbank-Tätigkeiten bleibt erhalten.\nErsetzen: alle vorhandenen Kategorien werden gelöscht.\nDazufügen: Kategorien mit gleichem Label werden übersprungen.',
      },
    ],
  },
]

const ALL_SECTION_IDS = SECTION_GROUPS.flatMap(g => g.sections.map(s => s.id))
const LIST_SECTION_IDS = new Set(
  SECTION_GROUPS.flatMap(g => g.sections.filter(s => s.isList).map(s => s.id))
)

// ── Hilfs-Komponente: Sektion-Zeile ───────────────────────────────────────────

function SectionRow({
  sec, checked, previewItem, loading, onToggle,
}: {
  sec: SectionDef
  checked: boolean
  previewItem?: PreviewItem
  loading: boolean
  onToggle: () => void
}) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '7px 12px', cursor: 'pointer',
      borderBottom: '1px solid var(--border-subtle, var(--border))',
    }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        style={{ flexShrink: 0, accentColor: 'var(--text-primary)', width: 14, height: 14, cursor: 'pointer' }}
      />
      <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{sec.label}</span>
      <span style={{
        fontSize: 11, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums',
        minWidth: 120, textAlign: 'right',
      }}>
        {loading ? '…' : previewItem?.label ?? '—'}
      </span>
      <Tooltip text={sec.tooltip}>
        <span style={{
          fontSize: 10, color: 'var(--text-muted)', border: '1px solid var(--border)',
          borderRadius: 99, padding: '1px 5px', cursor: 'default', flexShrink: 0,
        }}>?</span>
      </Tooltip>
    </label>
  )
}

// ── Haupt-Modal ───────────────────────────────────────────────────────────────

export default function KopierenModal({
  produktionId,
  onCopied,
  onClose,
}: {
  produktionId: string
  onCopied: () => void
  onClose: () => void
}) {
  const { productions, selectedProduction } = useSelectedProduction()
  const { t } = useTerminologie()

  const [sourceId, setSourceId] = useState('')
  const [search, setSearch] = useState('')
  const [dropOpen, setDropOpen] = useState(false)
  const [selected, setSelected] = useState<string[]>(ALL_SECTION_IDS)
  const [mergeMode, setMergeMode] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [copying, setCopying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(SECTION_GROUPS.map(g => g.id)))

  // Produktions-Dropdown
  const label = (p: any) => {
    const title = p.staffelnummer != null ? `${p.title} ${t('staffel')} ${p.staffelnummer}` : p.title
    return p.projektnummer ? `${p.projektnummer} · ${title}` : title
  }
  const sourceLabel = productions.find(p => p.id === sourceId)
  const othersActive   = productions.filter(p => p.id !== produktionId && p.is_active  && (!search || label(p).toLowerCase().includes(search.toLowerCase())))
  const othersInactive = productions.filter(p => p.id !== produktionId && !p.is_active && (!search || label(p).toLowerCase().includes(search.toLowerCase())))

  // Async Preview laden wenn source gewählt
  useEffect(() => {
    if (!sourceId) { setPreview(null); return }
    setPreviewLoading(true)
    setPreview(null)
    api.copySettingsPreview(produktionId, sourceId)
      .then(setPreview)
      .catch(() => setPreview(null))
      .finally(() => setPreviewLoading(false))
  }, [sourceId, produktionId])

  const toggleSection = (id: string) =>
    setSelected(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id])

  const toggleGroup = (groupId: string) => {
    const groupSecs = SECTION_GROUPS.find(g => g.id === groupId)?.sections.map(s => s.id) ?? []
    const allOn = groupSecs.every(id => selected.includes(id))
    if (allOn) setSelected(prev => prev.filter(id => !groupSecs.includes(id)))
    else setSelected(prev => [...new Set([...prev, ...groupSecs])])
  }

  const toggleAll = (on: boolean) =>
    setSelected(on ? [...ALL_SECTION_IDS] : [])

  const toggleGroupAccordion = (id: string) =>
    setOpenGroups(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })

  const executeCopy = useCallback(async () => {
    if (!sourceId || !selected.length) return
    setCopying(true)
    setError(null)
    try {
      await api.copySettings(produktionId, {
        source_produktion_id: sourceId,
        sections: selected,
        merge_mode: mergeMode,
      })
      onCopied()
      onClose()
    } catch (err: any) {
      setError(err.message ?? 'Fehler beim Kopieren')
      setConfirm(false)
    } finally {
      setCopying(false)
    }
  }, [sourceId, selected, mergeMode, produktionId, onCopied, onClose])

  const hasListSections = selected.some(id => LIST_SECTION_IDS.has(id))
  const allOn = ALL_SECTION_IDS.every(id => selected.includes(id))
  const noneOn = selected.length === 0

  const targetLabel = selectedProduction
    ? [selectedProduction.projektnummer, selectedProduction.title, selectedProduction.staffelnummer != null ? `${t('staffel')} ${selectedProduction.staffelnummer}` : null].filter(Boolean).join(' · ')
    : ''

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(2px)',
      }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--bg-surface)', borderRadius: 14,
        boxShadow: '0 24px 60px rgba(0,0,0,0.3)',
        width: 580, maxWidth: '95vw', maxHeight: '90vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Von Produktion kopieren</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
              Einstellungen einer anderen Produktion in <strong>{targetLabel}</strong> übernehmen
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)', padding: '0 4px', lineHeight: 1 }}>×</button>
        </div>

        {/* Scrollbarer Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Quelle */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Quelle</div>
            <div style={{ position: 'relative' }}>
              <input
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)',
                  background: 'var(--bg-surface)', color: 'var(--text-primary)',
                  fontSize: 13, fontFamily: 'inherit', outline: 'none',
                }}
                placeholder="Produktion suchen…"
                value={sourceId ? label(sourceLabel!) : search}
                onChange={e => { setSearch(e.target.value); setSourceId(''); setDropOpen(true) }}
                onFocus={() => setDropOpen(true)}
                onBlur={() => setTimeout(() => setDropOpen(false), 150)}
              />
              {dropOpen && (othersActive.length > 0 || othersInactive.length > 0) && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                  background: 'var(--bg-surface)', border: '1px solid var(--border)',
                  borderRadius: 8, marginTop: 2, maxHeight: 200, overflowY: 'auto',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                }}>
                  {othersActive.length > 0 && (
                    <div style={{ padding: '5px 12px 2px', fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Aktiv</div>
                  )}
                  {othersActive.map(p => (
                    <div key={p.id}
                      onMouseDown={() => { setSourceId(p.id); setSearch(''); setDropOpen(false) }}
                      style={{ padding: '7px 12px', cursor: 'pointer', fontSize: 13, background: sourceId === p.id ? 'var(--bg-subtle)' : undefined }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-subtle)')}
                      onMouseLeave={e => (e.currentTarget.style.background = sourceId === p.id ? 'var(--bg-subtle)' : '')}
                    >{label(p)}</div>
                  ))}
                  {othersInactive.length > 0 && (
                    <div style={{ padding: '7px 12px 2px', fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', borderTop: othersActive.length > 0 ? '1px solid var(--border)' : undefined }}>Inaktiv</div>
                  )}
                  {othersInactive.map(p => (
                    <div key={p.id}
                      onMouseDown={() => { setSourceId(p.id); setSearch(''); setDropOpen(false) }}
                      style={{ padding: '7px 12px', cursor: 'pointer', fontSize: 13, opacity: 0.7, background: sourceId === p.id ? 'var(--bg-subtle)' : undefined }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-subtle)')}
                      onMouseLeave={e => (e.currentTarget.style.background = sourceId === p.id ? 'var(--bg-subtle)' : '')}
                    >{label(p)}</div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Auswahl-Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', flex: 1 }}>Bereiche</div>
            <button onClick={() => toggleAll(!allOn)}
              style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)' }}>
              {allOn ? 'Nichts' : 'Alle'}
            </button>
          </div>

          {/* Gruppen */}
          {SECTION_GROUPS.map(group => {
            const groupSecs = group.sections
            const allGroupOn = groupSecs.every(s => selected.includes(s.id))
            const someGroupOn = groupSecs.some(s => selected.includes(s.id))
            const isOpen = openGroups.has(group.id)
            const groupPreview = preview?.[group.id]

            return (
              <div key={group.id} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                {/* Gruppen-Header */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '9px 12px', background: 'var(--bg-subtle)',
                  cursor: 'pointer', userSelect: 'none',
                }}
                  onClick={() => toggleGroupAccordion(group.id)}
                >
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 12, textAlign: 'center', flexShrink: 0 }}>{isOpen ? '▾' : '▸'}</span>
                  <input
                    type="checkbox"
                    checked={allGroupOn}
                    ref={el => { if (el) el.indeterminate = !allGroupOn && someGroupOn }}
                    onChange={e => { e.stopPropagation(); toggleGroup(group.id) }}
                    onClick={e => e.stopPropagation()}
                    style={{ flexShrink: 0, accentColor: 'var(--text-primary)', width: 14, height: 14, cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{group.label}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {groupSecs.filter(s => selected.includes(s.id)).length}/{groupSecs.length}
                  </span>
                </div>
                {/* Sektion-Zeilen */}
                {isOpen && groupSecs.map(sec => (
                  <SectionRow
                    key={sec.id}
                    sec={sec}
                    checked={selected.includes(sec.id)}
                    previewItem={groupPreview?.[sec.id]}
                    loading={previewLoading}
                    onToggle={() => toggleSection(sec.id)}
                  />
                ))}
              </div>
            )
          })}

          {/* Modus */}
          {hasListSections && (
            <div style={{ padding: '10px 14px', background: 'var(--bg-subtle)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Modus für Listen</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {([
                  { val: false, label: 'Ersetzen', sub: 'Bestehende Einträge werden gelöscht' },
                  { val: true,  label: 'Dazufügen', sub: 'Duplikate werden übersprungen' },
                ] as const).map(opt => (
                  <label key={String(opt.val)} style={{ flex: 1, cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', borderRadius: 7, border: `1px solid ${mergeMode === opt.val ? 'var(--text-primary)' : 'var(--border)'}`, background: mergeMode === opt.val ? 'var(--bg-surface)' : 'transparent' }}>
                    <input type="radio" name="mergeMode" checked={mergeMode === opt.val} onChange={() => setMergeMode(opt.val)} style={{ marginTop: 2, accentColor: 'var(--text-primary)' }} />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{opt.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1 }}>{opt.sub}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {error && (
            <div style={{ fontSize: 12, color: '#FF3B30', padding: '8px 12px', background: 'rgba(255,59,48,0.06)', borderRadius: 7, border: '1px solid rgba(255,59,48,0.25)' }}>
              {error}
            </div>
          )}

          {confirm ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 12, color: 'var(--text-primary)', padding: '10px 14px', background: 'rgba(255,59,48,0.06)', borderRadius: 8, border: '1px solid rgba(255,59,48,0.3)', lineHeight: 1.6 }}>
                <strong>Bestätigen:</strong> {selected.length} Bereich{selected.length > 1 ? 'e' : ''} von <strong>{sourceLabel ? label(sourceLabel) : '—'}</strong>{' '}
                {mergeMode ? 'werden zu' : 'ersetzen die Einstellungen von'} <strong>{targetLabel}</strong> {mergeMode ? 'hinzugefügt' : ''}.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={executeCopy}
                  disabled={copying}
                  style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: 'none', background: '#FF3B30', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  {copying ? 'Wird kopiert…' : 'Ja, jetzt kopieren'}
                </button>
                <button
                  onClick={() => setConfirm(false)}
                  disabled={copying}
                  style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Abbrechen
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={onClose}
                style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Abbrechen
              </button>
              <button
                onClick={() => setConfirm(true)}
                disabled={!sourceId || noneOn}
                style={{
                  padding: '9px 20px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600,
                  cursor: sourceId && !noneOn ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
                  background: sourceId && !noneOn ? 'var(--text-primary)' : 'var(--bg-subtle)',
                  color: sourceId && !noneOn ? 'var(--text-inverse, #fff)' : 'var(--text-muted)',
                }}
              >
                Einstellungen kopieren…
              </button>
            </div>
          )}
        </div>

      </div>
    </div>,
    document.body
  )
}
