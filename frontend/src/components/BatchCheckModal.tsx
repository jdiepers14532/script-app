import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Wand2, CheckSquare, Square, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { api } from '../api/client'
import Tooltip from './Tooltip'
import { useTerminologie } from '../sw-ui'

interface CheckMeta {
  label: string
  tooltip: string
  ki: boolean
  auto: boolean
}

const CHECK_META: Record<string, CheckMeta> = {
  // Szenenkopf
  'szenenkopf.pflichtfelder': {
    label: 'Pflichtfelder (I/A, Stimmung, Sz.-Nr., Motiv)', ki: false, auto: true,
    tooltip: 'Prüft ob alle Pflichtfelder im Szenenkopf ausgefüllt sind.\nFehlende Pflichtfelder blockieren den Lock.',
  },
  motiv_leer: {
    label: 'Motiv angegeben?', ki: false, auto: true,
    tooltip: 'Prüft ob das Motiv-Feld ausgefüllt ist.',
  },
  'motiv.einheitliche_schreibweise': {
    label: 'Motiv-Schreibweise einheitlich', ki: false, auto: true,
    tooltip: 'Erkennt wenn dasselbe Motiv in unterschiedlicher Schreibweise vorkommt.\nAutofix: häufigste Schreibweise übernehmen.',
  },
  duplikat_motiv: {
    label: 'Duplikat-Motiv im Block', ki: false, auto: true,
    tooltip: 'Erkennt wenn dieselbe Motivkombination bereits in einer anderen Szene der Folge vorkommt.',
  },
  // Szenennummer
  'scene.unique_szenennummer': {
    label: 'Eindeutige Szenennummer', ki: false, auto: true,
    tooltip: 'Doppelte Szenennummer in der Werkstufe blockiert den Lock.',
  },
  // Inhalt
  'scene.empty': {
    label: 'Szene hat Inhalt', ki: false, auto: true,
    tooltip: 'Warnt bei leeren Szenen.\nWechselschnitte und Stockshots sind ausgenommen (by design leer).',
  },
  // Rollen
  rollen_konsistenz: {
    label: 'Rollen-Konsistenz', ki: false, auto: true,
    tooltip: 'Vergleicht Rollen im Szenenkopf mit GROSSBUCHSTABEN-Namen im Text.',
  },
  'rolle.einheitliche_schreibweise': {
    label: 'Rollen-Schreibweise (Rollendatei)', ki: false, auto: true,
    tooltip: 'Prüft ob Rollennamen in CHARACTER-Zeilen exakt mit der Rollendatei übereinstimmen.',
  },
  fehlender_dialog: {
    label: 'Fehlender Dialog', ki: false, auto: true,
    tooltip: 'Prüft ob nach jedem Character-Element tatsächlich ein Dialog folgt.\nRolle ohne Dialog blockiert den Lock.',
  },
  // Format & Text
  sondertyp_wechselschnitt: {
    label: 'Sondertypen & Wechselschnitte', ki: false, auto: true,
    tooltip: 'Prüft ob "Wechselschnitt" markiert ist und Telefonpartner angegeben.',
  },
  doppelter_sprecher: {
    label: 'Doppelter Sprecher-Block', ki: false, auto: true,
    tooltip: 'Zwei CHARACTER-Zeilen hintereinander ohne Dialog dazwischen.',
  },
  'dialog.endet_satzzeichen': {
    label: 'Dialog endet mit Satzzeichen', ki: false, auto: true,
    tooltip: 'Prüft ob Dialog-Blöcke mit einem Satzzeichen enden (., !, ?, …).',
  },
  'text.kein_leerzeichen_start': {
    label: 'Kein führendes Leerzeichen', ki: false, auto: true,
    tooltip: 'Findet Blöcke mit ungewolltem führendem Leerzeichen.',
  },
  leere_bloecke: {
    label: 'Leere Blöcke entfernen', ki: false, auto: true,
    tooltip: 'Leere screenplay_element/absatz-Blöcke im Dokument.',
  },
  // Timing & Dramaturgie
  stoppzeit_plausibilitaet: {
    label: 'Stoppzeit-Plausibilität', ki: false, auto: false,
    tooltip: 'Vergleicht die Stoppzeit mit der geschätzten Spielzeit aus der Textlänge.',
  },
  tageszeit_sequenz: {
    label: 'Tageszeit-Sequenz', ki: false, auto: false,
    tooltip: 'Prüft ob die Tageszeit innerhalb eines Spieltags in der richtigen DK-Reihenfolge vorwärts geht.',
  },
  dramaturgischer_tag_chronologie: {
    label: 'Spieltag-Chronologie', ki: false, auto: false,
    tooltip: 'Prüft ob die Spieltag-Nummern in der richtigen Reihenfolge sind (keine Sprünge oder Rückschritte).',
  },
  spieltag_inkonsistent: {
    label: 'Dramaturgischer Tag (Spieltag)', ki: false, auto: false,
    tooltip: 'Prüft ob Spieltag-Nummern über alle Folgen korrekt sind.\nLäuft immer folgenübergreifend.',
  },
  strang_zuordnung: {
    label: 'Strang-Zuordnung', ki: false, auto: true,
    tooltip: 'Prüft ob die Szene mindestens einem Story-Strang zugeordnet ist.',
  },
  // NT & Konsistenz
  nt_replik_konsistenz: {
    label: 'NT-Replik-Konsistenz (Basis-Vergleich)', ki: false, auto: false,
    tooltip: 'Vergleicht NT-Repliken mit der eingefrorenen Basis-Werkstufe.\nFehlende Basis-Blöcke sind Blocker-Kandidaten.',
  },
  nt_verweis: {
    label: 'NT-Notiz synchronisieren', ki: false, auto: true,
    tooltip: 'Aktualisiert automatisch die NT-Zeilen in der Szenenkopf-Notiz:\nNT/VO/OFF → "NT Name", "Name im Off"\n(ONE-WAY) → "Oneway Telefonat"\nLäuft ohne Rückmeldung im Hintergrund.',
  },
  // KI
  oneliner_qualitaet: {
    label: 'Oneliner-Qualität', ki: true, auto: false,
    tooltip: '✨ KI-Feature — prüft ob der Oneliner den emotionalen Kern wiedergibt.\nVerursacht API-Kosten.',
  },
  oneliner_vorhanden: {
    label: 'Oneliner vorhanden', ki: true, auto: false,
    tooltip: '✨ KI-Feature — prüft ob ein Oneliner gesetzt ist und ob er den emotionalen Kern trifft.\nVerursacht API-Kosten pro Szene.',
  },
  spielzeit_uhrzeit: {
    label: 'Spielzeit/Uhrzeit-Schätzung', ki: true, auto: false,
    tooltip: '✨ KI-Feature — schätzt plausible Uhrzeiten für alle Szenen eines dramaturgischen Tages.\nLäuft als Batch-Check pro Spieltag, nicht pro Szene. Verursacht API-Kosten.',
  },
}

const GROUPS: { label: string; keys: string[] }[] = [
  { label: 'Szenenkopf', keys: ['szenenkopf.pflichtfelder', 'motiv_leer', 'motiv.einheitliche_schreibweise', 'scene.unique_szenennummer', 'duplikat_motiv'] },
  { label: 'Inhalt & Rollen', keys: ['scene.empty', 'rollen_konsistenz', 'rolle.einheitliche_schreibweise', 'fehlender_dialog'] },
  { label: 'Format & Text', keys: ['sondertyp_wechselschnitt', 'doppelter_sprecher', 'dialog.endet_satzzeichen', 'text.kein_leerzeichen_start', 'leere_bloecke'] },
  { label: 'Timing & Dramaturgie', keys: ['stoppzeit_plausibilitaet', 'tageszeit_sequenz', 'dramaturgischer_tag_chronologie', 'spieltag_inkonsistent', 'strang_zuordnung'] },
  { label: 'NT & Konsistenz', keys: ['nt_replik_konsistenz', 'nt_verweis'] },
  { label: 'KI', keys: ['oneliner_qualitaet', 'oneliner_vorhanden', 'spielzeit_uhrzeit'] },
]

interface BatchCheckModalProps {
  werkstufId: string
  produktionId: string
  onClose: () => void
  onDone?: () => void
}

export default function BatchCheckModal({ werkstufId, produktionId, onClose, onDone }: BatchCheckModalProps) {
  const { t } = useTerminologie()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loadingConfig, setLoadingConfig] = useState(true)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{ scenes_checked: number; total_issues: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Load DK-Settings config as defaults
  useEffect(() => {
    api.getCheckConfig(produktionId)
      .then(cfg => {
        const enabled = new Set(
          Object.entries(cfg)
            .filter(([, v]) => v.enabled)
            .map(([k]) => k)
        )
        setSelected(enabled)
      })
      .catch(() => {
        // Fallback: select all non-KI checks
        setSelected(new Set(Object.keys(CHECK_META).filter(k => !CHECK_META[k].ki)))
      })
      .finally(() => setLoadingConfig(false))
  }, [produktionId])

  const toggle = useCallback((key: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }, [])

  const selectAll = useCallback(() => setSelected(new Set(Object.keys(CHECK_META))), [])
  const selectNone = useCallback(() => setSelected(new Set()), [])

  const handleRun = useCallback(async () => {
    if (selected.size === 0) return
    setRunning(true)
    setError(null)
    try {
      const res = await api.runChecksBatch(werkstufId, { checks_override: [...selected] })
      setResult(res)
      onDone?.()
    } catch (e: any) {
      setError(e?.message ?? 'Fehler beim Ausführen der Checks')
    } finally {
      setRunning(false)
    }
  }, [werkstufId, selected, onDone])

  const content = (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 99990,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--bg-surface, #fff)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        boxShadow: '0 16px 48px rgba(0,0,0,0.22)',
        width: 400,
        maxWidth: 'calc(100vw - 32px)',
        maxHeight: 'calc(100vh - 48px)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <Wand2 size={16} style={{ color: 'var(--sw-green, #00C853)', flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{t('drehbuch', 'c')}-Checks ausführen</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', color: 'var(--text-muted)', lineHeight: 1 }}>
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {loadingConfig ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 12 }}>Einstellungen laden…</div>
          ) : result ? (
            /* Result view */
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '16px 0' }}>
              {result.total_issues === 0 ? (
                <>
                  <CheckCircle2 size={40} style={{ color: 'var(--sw-green, #00C853)' }} />
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Alles in Ordnung</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{result.scenes_checked} Szenen geprüft — keine Hinweise</div>
                  </div>
                </>
              ) : (
                <>
                  <AlertTriangle size={40} style={{ color: '#FF9500' }} />
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
                      {result.total_issues} Hinweis{result.total_issues > 1 ? 'e' : ''} gefunden
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {result.scenes_checked} Szenen geprüft — Hinweise in der Szenenübersicht sichtbar (⚠ Symbol)
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            /* Check selection */
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {selected.size} von {Object.keys(CHECK_META).length} ausgewählt
                </span>
                <span style={{ fontSize: 11, display: 'flex', gap: 8 }}>
                  <button onClick={selectAll} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sw-info, #007AFF)', padding: 0, fontSize: 11 }}>Alle</button>
                  <button onClick={selectNone} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, fontSize: 11 }}>Keine</button>
                </span>
              </div>

              {GROUPS.map(group => {
                const visibleKeys = group.keys.filter(k => CHECK_META[k])
                if (visibleKeys.length === 0) return null
                return (
                  <div key={group.label} style={{ marginBottom: 12 }}>
                    <div style={{
                      fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em',
                      color: 'var(--text-muted)', marginBottom: 4, paddingLeft: 2,
                    }}>
                      {group.label}
                    </div>
                    {visibleKeys.map(key => {
                      const meta = CHECK_META[key]
                      const on = selected.has(key)
                      return (
                        <Tooltip key={key} text={meta.tooltip} placement="right">
                          <div
                            onClick={() => toggle(key)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 8,
                              padding: '6px 8px', borderRadius: 6, cursor: 'pointer',
                              background: on ? 'rgba(0,200,83,0.06)' : 'transparent',
                              border: `1px solid ${on ? 'rgba(0,200,83,0.25)' : 'transparent'}`,
                              marginBottom: 2, transition: 'background 0.12s',
                            }}
                          >
                            {on
                              ? <CheckSquare size={14} style={{ color: 'var(--sw-green, #00C853)', flexShrink: 0 }} />
                              : <Square size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                            }
                            <span style={{ flex: 1, fontSize: 12, color: on ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                              {meta.label}
                            </span>
                            {meta.ki && (
                              <span style={{ fontSize: 9, color: '#AF52DE', fontWeight: 600, padding: '1px 5px', background: 'rgba(175,82,222,0.08)', borderRadius: 4, flexShrink: 0 }}>KI</span>
                            )}
                          </div>
                        </Tooltip>
                      )
                    })}
                  </div>
                )
              })}
            </>
          )}

          {error && (
            <div style={{ marginTop: 8, padding: '8px 10px', background: 'rgba(255,59,48,0.08)', borderRadius: 6, border: '1px solid rgba(255,59,48,0.2)', fontSize: 12, color: 'var(--sw-danger, #FF3B30)' }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ borderTop: '1px solid var(--border)', padding: '10px 16px', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {result ? (
            <button
              onClick={onClose}
              style={{ padding: '7px 16px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 13 }}
            >
              Schließen
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                disabled={running}
                style={{ padding: '7px 16px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 13, opacity: running ? 0.5 : 1 }}
              >
                Abbrechen
              </button>
              <button
                onClick={handleRun}
                disabled={running || selected.size === 0 || loadingConfig}
                style={{
                  padding: '7px 16px', borderRadius: 7, border: 'none',
                  background: selected.size === 0 ? 'var(--border)' : 'var(--sw-green, #00C853)',
                  color: selected.size === 0 ? 'var(--text-muted)' : '#fff',
                  cursor: selected.size === 0 || running ? 'not-allowed' : 'pointer',
                  fontSize: 13, fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 6,
                  opacity: running ? 0.7 : 1,
                  transition: 'background 0.15s',
                }}
              >
                {running && <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />}
                {running ? 'Prüfe…' : `${selected.size > 0 ? selected.size : ''} Check${selected.size !== 1 ? 's' : ''} ausführen`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )

  return createPortal(content, document.body)
}
