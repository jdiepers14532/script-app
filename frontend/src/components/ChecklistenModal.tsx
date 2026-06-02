import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, AlertTriangle, AlertCircle, Info, CheckCircle2 } from 'lucide-react'

interface GateFinding {
  id: number
  check_typ: string
  schwere: string
  meldung: string
  meta?: any
  scene_nummer: number | null
  szene_id: string
}

interface GateSummary {
  has_blockers: boolean
  has_warnungen: boolean
  blockers: GateFinding[]
  warnungen: GateFinding[]
  hinweise: GateFinding[]
}

interface ChecklistenModalProps {
  werkstufId: string
  targetLabel: string
  onCancel: () => void
  /** override=true wenn User trotz Warnungen bestätigt */
  onConfirm: (override: boolean) => Promise<void>
}

const CHECK_LABELS: Record<string, string> = {
  motiv_leer: 'Motiv fehlt',
  rollen_konsistenz: 'Rollen-Konsistenz',
  sondertyp_wechselschnitt: 'Wechselschnitt-Sondertyp',
  strang_zuordnung: 'Strang-Zuordnung',
  duplikat_motiv: 'Duplikat-Motiv',
  fehlender_dialog: 'Fehlender Dialog',
  stoppzeit_plausibilitaet: 'Stoppzeit-Plausibilität',
  spieltag_inkonsistent: 'Spieltag-Inkonsistenz',
  nt_verweis: 'NT-Notiz',
  oneliner_qualitaet: 'Oneliner-Qualität',
  'szenenkopf.pflichtfelder': 'Pflichtfelder',
  'scene.unique_szenennummer': 'Doppelte Szenennummer',
  'scene.empty': 'Leere Szene',
  'motiv.einheitliche_schreibweise': 'Motiv-Schreibweise',
  'rolle.einheitliche_schreibweise': 'Rollen-Schreibweise',
  'dialog.endet_satzzeichen': 'Dialog-Satzzeichen',
  'text.kein_leerzeichen_start': 'Führendes Leerzeichen',
  leere_bloecke: 'Leere Blöcke',
  doppelter_sprecher: 'Doppelter Sprecher',
  seitenzahl_im_bereich: 'Seitenzahl',
  tageszeit_sequenz: 'Tageszeit-Sequenz',
  nt_replik_konsistenz: 'NT-Replik-Konsistenz',
  dramaturgischer_tag_chronologie: 'Spieltag-Chronologie',
  etablierungsshot_vorhanden: 'Etablierungsshot',
  oneliner_vorhanden: 'Oneliner fehlt',
  spielzeit_uhrzeit: 'Spielzeit/Uhrzeit',
}

function checkLabel(typ: string): string {
  return CHECK_LABELS[typ] ?? typ
}

function FindingRow({ finding, onNavigate }: { finding: GateFinding; onNavigate: (id: string) => void }) {
  const szNum = finding.scene_nummer != null ? `Sz. ${finding.scene_nummer}` : ''
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>
          {checkLabel(finding.check_typ)}
          {szNum && (
            <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-secondary)', fontWeight: 400 }}>
              {szNum}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4, marginTop: 2 }}>
          {finding.meldung}
        </div>
        {finding.meta?.ki_hinweis && (
          <div style={{ fontSize: 11, color: '#007AFF', marginTop: 2 }}>✨ {finding.meta.ki_hinweis}</div>
        )}
      </div>
      {finding.szene_id && (
        <button
          onClick={() => onNavigate(finding.szene_id)}
          style={{
            flexShrink: 0, fontSize: 10, padding: '3px 8px',
            border: '1px solid var(--border)', borderRadius: 5,
            background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)',
            whiteSpace: 'nowrap',
          }}
        >
          Zur Szene →
        </button>
      )}
    </div>
  )
}

export default function ChecklistenModal({ werkstufId, targetLabel, onCancel, onConfirm }: ChecklistenModalProps) {
  const [summary, setSummary] = useState<GateSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [confirming, setConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/checks/werkstufe/${werkstufId}/gate-summary`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { setSummary(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [werkstufId])

  const handleNavigate = (szeneId: string) => {
    // Schließt das Modal und dispatcht ein NavigationsEvent.
    // ScriptPage kann optional auf 'check-gate-navigate' hören.
    window.dispatchEvent(new CustomEvent('check-gate-navigate', { detail: { szeneId } }))
    onCancel()
  }

  const handleConfirm = async (override: boolean) => {
    setConfirming(true)
    setConfirmError(null)
    try {
      await onConfirm(override)
    } catch (err: any) {
      setConfirmError(err.message || 'Fehler beim Anwenden des Labels')
      setConfirming(false)
    }
  }

  const hasBlockers = summary?.has_blockers ?? false
  const hasWarnungen = summary?.has_warnungen ?? false
  const totalIssues = (summary?.blockers.length ?? 0) + (summary?.warnungen.length ?? 0)

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} onClick={onCancel} />
      <div style={{
        position: 'relative', background: 'var(--bg)', borderRadius: 12, boxShadow: '0 8px 40px rgba(0,0,0,0.3)',
        width: 520, maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 64px)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Check-Gate: Label „{targetLabel}"</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              Qualitätsprüfung vor dem Sperren der Werkstufe
            </div>
          </div>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
          {loading ? (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', padding: '24px 0' }}>
              Checks werden geladen…
            </div>
          ) : !summary ? (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', padding: '24px 0' }}>
              Keine Check-Ergebnisse vorhanden — zuerst einen Batch-Check ausführen.
            </div>
          ) : totalIssues === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', color: '#00C853' }}>
              <CheckCircle2 size={18} />
              <span style={{ fontSize: 13, fontWeight: 500 }}>Alle Checks bestanden — Label kann angewendet werden.</span>
            </div>
          ) : (
            <>
              {/* Blockers */}
              {summary.blockers.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <AlertCircle size={14} style={{ color: '#FF3B30', flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#FF3B30', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Blocker ({summary.blockers.length}) — Lock blockiert
                    </span>
                  </div>
                  <div style={{ borderLeft: '3px solid #FF3B30', paddingLeft: 12 }}>
                    {summary.blockers.map((f, i) => (
                      <FindingRow key={`b${i}`} finding={f} onNavigate={handleNavigate} />
                    ))}
                  </div>
                  <p style={{ fontSize: 11, color: '#FF3B30', margin: '8px 0 0', lineHeight: 1.5 }}>
                    Diese Fehler müssen behoben werden, bevor das Label angewendet werden kann.
                  </p>
                </div>
              )}

              {/* Warnungen */}
              {summary.warnungen.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <AlertTriangle size={14} style={{ color: '#FFCC00', flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#FFCC00', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Warnungen ({summary.warnungen.length})
                    </span>
                  </div>
                  <div style={{ borderLeft: '3px solid #FFCC00', paddingLeft: 12 }}>
                    {summary.warnungen.map((f, i) => (
                      <FindingRow key={`w${i}`} finding={f} onNavigate={handleNavigate} />
                    ))}
                  </div>
                </div>
              )}

              {/* Hinweise */}
              {summary.hinweise.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <Info size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Hinweise ({summary.hinweise.length})
                    </span>
                  </div>
                  <div style={{ borderLeft: '3px solid var(--border)', paddingLeft: 12 }}>
                    {summary.hinweise.map((f, i) => (
                      <FindingRow key={`h${i}`} finding={f} onNavigate={handleNavigate} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {confirmError && (
            <div style={{ width: '100%', fontSize: 11, color: '#FF3B30' }}>{confirmError}</div>
          )}
          <div style={{ flex: 1 }}>
            {hasBlockers && (
              <span style={{ fontSize: 11, color: '#FF3B30' }}>Fehler beheben, um fortzufahren</span>
            )}
            {!hasBlockers && hasWarnungen && (
              <span style={{ fontSize: 11, color: '#FFCC00' }}>Es gibt offene Warnungen</span>
            )}
          </div>
          <button
            onClick={onCancel}
            style={{ fontSize: 12, padding: '7px 14px', border: '1px solid var(--border)', borderRadius: 7, background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)' }}
          >
            Abbrechen
          </button>
          {!loading && !hasBlockers && hasWarnungen && (
            <button
              onClick={() => handleConfirm(true)}
              disabled={confirming}
              style={{
                fontSize: 12, padding: '7px 14px', border: '1px solid #FFCC00', borderRadius: 7,
                background: 'transparent', cursor: 'pointer', color: '#FFCC00', fontWeight: 500,
              }}
            >
              {confirming ? 'Wird angewendet…' : 'Trotzdem sperren'}
            </button>
          )}
          {!loading && !hasBlockers && !hasWarnungen && (
            <button
              onClick={() => handleConfirm(false)}
              disabled={confirming}
              style={{
                fontSize: 12, padding: '7px 14px', border: 'none', borderRadius: 7,
                background: '#00C853', cursor: 'pointer', color: '#fff', fontWeight: 600,
              }}
            >
              {confirming ? 'Wird angewendet…' : `Label „${targetLabel}" anwenden`}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
