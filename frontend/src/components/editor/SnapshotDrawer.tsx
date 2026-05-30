import { useState, useEffect, useCallback } from 'react'
import { Clock, RotateCcw, X, ChevronDown, ChevronUp, AlertTriangle, Shield, FileText, Layers, Plus } from 'lucide-react'
import { api } from '../../api/client'
import { useTweaks } from '../../contexts'

interface Snapshot {
  id: number
  created_by: string | null
  created_by_name: string | null
  created_at: string
  szene_nummer: string | null
  szene_info: string | null
  text_preview: string | null
  is_current: boolean
}

interface WerkSnapshot {
  id: number
  werkstufe_id: string
  created_by: string | null
  created_by_name: string | null
  created_at: string
  typ: 'auto' | 'manual' | 'restore'
  szenen_count: number
  text_preview: string | null
  is_current: boolean
}

interface Props {
  szeneId: string
  werkstufenId?: string | null
  szeneNummer?: string | null
  szeneInfo?: string | null
  sceneUpdatedAt?: string | null
  sceneUpdatedBy?: string | null
  onRestore: (content: any) => void
  onDocRestore: (szenen: { szeneId: string; content: any }[]) => void
  onClose: () => void
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'gerade eben'
  const m = Math.floor(s / 60)
  if (m < 60) return `vor ${m} Min.`
  const h = Math.floor(m / 60)
  if (h < 24) return `vor ${h} Std.`
  const d = Math.floor(h / 24)
  if (d < 7) return `vor ${d} Tag${d > 1 ? 'en' : ''}`
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function formatAbsolute(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function SnapshotDrawer({
  szeneId, werkstufenId, szeneNummer, szeneInfo, sceneUpdatedAt, sceneUpdatedBy,
  onRestore, onDocRestore, onClose,
}: Props) {
  const { tweaks } = useTweaks()
  const isDark = tweaks.theme === 'dark'

  const INV = isDark ? {
    bg:      '#f4f4f5',
    bg2:     '#e4e4e7',
    bg3:     '#d4d4d8',
    text:    '#18181b',
    muted:   '#52525b',
    border:  '#d4d4d8',
    green:   '#16a34a',
    orange:  '#c2410c',
    red:     '#dc2626',
    cyan:    '#0891b2',
    shadow:  'rgba(0,0,0,0.08)',
  } : {
    bg:      '#18181b',
    bg2:     '#27272a',
    bg3:     '#3f3f46',
    text:    '#f4f4f5',
    muted:   '#a1a1aa',
    border:  '#3f3f46',
    green:   '#4ade80',
    orange:  '#fb923c',
    red:     '#f87171',
    cyan:    '#22d3ee',
    shadow:  'rgba(0,0,0,0.4)',
  }

  // Toggle: 'szene' | 'dokument'
  const [mode, setMode] = useState<'szene' | 'dokument'>('szene')

  // ── Szenen-Snapshots ──────────────────────────────────────────────────────
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [loadingSnaps, setLoadingSnaps] = useState(true)
  const [restoring, setRestoring] = useState<number | null>(null)
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const loadSnapshots = useCallback(async () => {
    setLoadingSnaps(true)
    try {
      const list = await api.getSnapshots(szeneId)
      setSnapshots(Array.isArray(list) ? list : [])
    } catch {
      setSnapshots([])
    } finally {
      setLoadingSnaps(false)
    }
  }, [szeneId])

  useEffect(() => { if (mode === 'szene') loadSnapshots() }, [mode, loadSnapshots])

  const hasConflict = (snap: Snapshot): boolean => {
    if (!sceneUpdatedAt || !sceneUpdatedBy) return false
    const sceneTs = new Date(sceneUpdatedAt).getTime()
    const snapTs = new Date(snap.created_at).getTime()
    return sceneTs > snapTs && sceneUpdatedBy !== snap.created_by_name
  }

  const handleRestore = async (snapId: number) => {
    setRestoring(snapId)
    try {
      const full = await api.getSnapshot(szeneId, snapId)
      if (full?.content) onRestore(full.content)
    } catch (err) {
      console.error('Restore fehlgeschlagen:', err)
    } finally {
      setRestoring(null)
      setConfirmId(null)
    }
  }

  // ── Dokument-Snapshots ────────────────────────────────────────────────────
  const [werkSnaps, setWerkSnaps] = useState<WerkSnapshot[]>([])
  const [loadingWerk, setLoadingWerk] = useState(false)
  const [werkExpandedId, setWerkExpandedId] = useState<number | null>(null)
  const [werkConfirmId, setWerkConfirmId] = useState<number | null>(null)
  const [werkRestoring, setWerkRestoring] = useState<number | null>(null)
  const [manualSaving, setManualSaving] = useState(false)

  const loadWerkSnaps = useCallback(async () => {
    if (!werkstufenId) return
    setLoadingWerk(true)
    try {
      const list = await api.getWerkstufenSnapshots(werkstufenId)
      setWerkSnaps(Array.isArray(list) ? list : [])
    } catch {
      setWerkSnaps([])
    } finally {
      setLoadingWerk(false)
    }
  }, [werkstufenId])

  useEffect(() => { if (mode === 'dokument') loadWerkSnaps() }, [mode, loadWerkSnaps])

  const handleManualSave = async () => {
    if (!werkstufenId) return
    setManualSaving(true)
    try {
      await api.createWerkstufenSnapshot(werkstufenId, 'manual')
      await loadWerkSnaps()
    } catch (err) {
      console.error('Manueller Snapshot fehlgeschlagen:', err)
    } finally {
      setManualSaving(false)
    }
  }

  const handleDocRestore = async (snapId: number) => {
    if (!werkstufenId) return
    setWerkRestoring(snapId)
    try {
      const result = await api.restoreWerkstufenSnapshot(werkstufenId, snapId)
      if (result?.szenen) {
        onDocRestore(result.szenen)
        await loadWerkSnaps()
      }
    } catch (err) {
      console.error('Dokument-Restore fehlgeschlagen:', err)
    } finally {
      setWerkRestoring(null)
      setWerkConfirmId(null)
    }
  }

  const typLabel = (typ: WerkSnapshot['typ']) => {
    if (typ === 'manual') return { label: 'Manuell', color: INV.cyan }
    if (typ === 'restore') return { label: 'Vor Wiederherstellung', color: INV.orange }
    return { label: 'Auto', color: INV.muted }
  }

  const headerLabel = szeneNummer
    ? `Sz. ${szeneNummer}${szeneInfo ? ` — ${szeneInfo}` : ''}`
    : 'Verlauf'

  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, bottom: 0,
      width: 320, zIndex: 200,
      background: INV.bg,
      borderLeft: `1px solid ${INV.border}`,
      display: 'flex', flexDirection: 'column',
      boxShadow: `-6px 0 24px ${INV.shadow}`,
      color: INV.text,
    }}>

      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '11px 14px',
        borderBottom: `1px solid ${INV.border}`,
        flexShrink: 0,
      }}>
        <Clock size={14} style={{ color: INV.muted, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.2 }}>Verlauf</div>
          {szeneNummer && (
            <div style={{ fontSize: 10, color: INV.muted, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {headerLabel}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: INV.muted, padding: '3px', display: 'flex', alignItems: 'center', borderRadius: 4 }}
        >
          <X size={14} />
        </button>
      </div>

      {/* ── Toggle ── */}
      <div style={{
        display: 'flex',
        padding: '8px 14px',
        gap: 6,
        borderBottom: `1px solid ${INV.border}`,
        flexShrink: 0,
      }}>
        <button
          onClick={() => setMode('szene')}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            padding: '5px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
            fontSize: 11, fontFamily: 'inherit', fontWeight: mode === 'szene' ? 700 : 400,
            background: mode === 'szene' ? INV.bg3 : 'transparent',
            color: mode === 'szene' ? INV.text : INV.muted,
          }}
        >
          <FileText size={11} />
          Diese Szene
        </button>
        <button
          onClick={() => setMode('dokument')}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            padding: '5px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
            fontSize: 11, fontFamily: 'inherit', fontWeight: mode === 'dokument' ? 700 : 400,
            background: mode === 'dokument' ? INV.bg3 : 'transparent',
            color: mode === 'dokument' ? INV.text : INV.muted,
          }}
        >
          <Layers size={11} />
          Dokument
        </button>
      </div>

      {/* ── Scope-Banner ── */}
      <div style={{
        padding: '7px 14px',
        fontSize: 11, lineHeight: 1.5,
        borderBottom: `1px solid ${INV.border}`,
        background: INV.bg2,
        flexShrink: 0,
        display: 'flex', alignItems: 'flex-start', gap: 7,
      }}>
        <Shield size={12} style={{ color: INV.green, flexShrink: 0, marginTop: 1 }} />
        {mode === 'szene' ? (
          <div>
            <span style={{ color: INV.green, fontWeight: 600 }}>Nur diese Szene</span>
            <span style={{ color: INV.muted }}> — andere Szenen bleiben unverändert. Auto-Sicherung alle 5 Min. · max. 50.</span>
          </div>
        ) : (
          <div>
            <span style={{ color: INV.green, fontWeight: 600 }}>Gesamtes Dokument</span>
            <span style={{ color: INV.muted }}> — alle Szenen der Werkstufe. Auto-Sicherung bei Werkstufen-Wechsel. · max. 30.</span>
          </div>
        )}
      </div>

      {/* ── Inhalt ── */}
      {mode === 'szene' ? (
        // ══════════════════════════════════════════════════════════
        // SZENEN-MODUS
        // ══════════════════════════════════════════════════════════
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadingSnaps ? (
            <div style={{ padding: 24, fontSize: 12, color: INV.muted, textAlign: 'center' }}>Lädt…</div>
          ) : snapshots.length === 0 ? (
            <div style={{ padding: 24, fontSize: 12, color: INV.muted, textAlign: 'center', lineHeight: 1.6 }}>
              Noch keine Sicherungen vorhanden.<br />
              Die erste wird nach 5 Minuten Schreiben angelegt.
            </div>
          ) : (
            snapshots.map((snap, i) => {
              const isExpanded = expandedId === snap.id
              const isConfirming = confirmId === snap.id
              const isRestoring = restoring === snap.id
              const isCurrent = snap.is_current
              const anyIsCurrent = snapshots.some(s => s.is_current)
              const isLatest = i === 0 && !anyIsCurrent
              const conflict = hasConflict(snap)
              const authorName = snap.created_by_name || '—'

              return (
                <div
                  key={snap.id}
                  style={{
                    borderBottom: `1px solid ${INV.border}`,
                    background: isCurrent ? `${INV.cyan}15` : isLatest ? `${INV.green}12` : undefined,
                  }}
                >
                  <div
                    style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 8 }}
                    onClick={() => setExpandedId(isExpanded ? null : snap.id)}
                  >
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%', marginTop: 4, flexShrink: 0,
                      background: isCurrent ? INV.cyan : isLatest ? INV.green : conflict ? INV.orange : INV.bg3,
                      boxShadow: conflict ? `0 0 0 2px ${INV.orange}44` : undefined,
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, fontWeight: (isLatest || isCurrent) ? 700 : 500, color: INV.text }}>
                          {formatRelative(snap.created_at)}
                        </span>
                        {isLatest && (
                          <span style={{ fontSize: 9, fontWeight: 700, color: INV.green, background: `${INV.green}20`, borderRadius: 3, padding: '1px 5px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Aktuell</span>
                        )}
                        {isCurrent && (
                          <span style={{ fontSize: 9, fontWeight: 700, color: INV.cyan, background: `${INV.cyan}20`, borderRadius: 3, padding: '1px 5px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Aktueller Stand</span>
                        )}
                        {conflict && (
                          <span style={{ fontSize: 9, fontWeight: 700, color: INV.orange, background: `${INV.orange}20`, borderRadius: 3, padding: '1px 5px', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 3 }}>
                            <AlertTriangle size={8} /> Fremde Änderung
                          </span>
                        )}
                        <div style={{ flex: 1 }} />
                        {isExpanded ? <ChevronUp size={11} style={{ color: INV.muted }} /> : <ChevronDown size={11} style={{ color: INV.muted }} />}
                      </div>
                      <div style={{ fontSize: 10, color: INV.muted, marginTop: 2 }}>
                        {authorName} · {formatAbsolute(snap.created_at)}
                      </div>
                      {snap.text_preview && !isExpanded && (
                        <div style={{ fontSize: 10, color: INV.muted, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: 'italic' }}>
                          „{snap.text_preview}"
                        </div>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{ padding: '0 14px 14px 30px' }}>
                      {snap.text_preview && (
                        <div style={{ fontSize: 11, color: INV.muted, marginBottom: 12, background: INV.bg2, borderRadius: 6, padding: '7px 10px', lineHeight: 1.6, fontStyle: 'italic', borderLeft: `3px solid ${INV.bg3}` }}>
                          „{snap.text_preview}…"
                        </div>
                      )}
                      {conflict && (
                        <div style={{ background: `${INV.orange}15`, border: `1px solid ${INV.orange}44`, borderRadius: 6, padding: '8px 10px', marginBottom: 12, fontSize: 11, lineHeight: 1.5, display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                          <AlertTriangle size={12} style={{ color: INV.orange, flexShrink: 0, marginTop: 1 }} />
                          <div style={{ color: INV.text }}>
                            <strong style={{ color: INV.orange }}>Achtung:</strong>{' '}
                            <strong>{sceneUpdatedBy}</strong> hat diese Szene nach dieser Sicherung bearbeitet.
                            Wiederherstellen überschreibt diese Änderungen.
                          </div>
                        </div>
                      )}
                      {!isConfirming ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmId(snap.id) }}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, border: `1px solid ${INV.border}`, background: INV.bg2, color: INV.text, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', fontWeight: 500 }}
                        >
                          <RotateCcw size={11} />
                          Auf diesen Stand zurückgehen
                        </button>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: conflict ? INV.orange : INV.text }}>
                            {conflict
                              ? `Änderungen von ${sceneUpdatedBy} werden überschrieben. Trotzdem?`
                              : 'Aktuellen Inhalt durch diesen Stand ersetzen?'}
                          </div>
                          <div style={{ display: 'flex', gap: 7 }}>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleRestore(snap.id) }}
                              disabled={isRestoring}
                              style={{ padding: '5px 12px', borderRadius: 5, border: 'none', background: conflict ? INV.orange : INV.green, color: '#fff', cursor: isRestoring ? 'default' : 'pointer', fontSize: 12, fontFamily: 'inherit', fontWeight: 600, opacity: isRestoring ? 0.6 : 1 }}
                            >
                              {isRestoring ? 'Stellt her…' : 'Ja, wiederherstellen'}
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setConfirmId(null) }}
                              style={{ padding: '5px 12px', borderRadius: 5, border: `1px solid ${INV.border}`, background: 'transparent', color: INV.text, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}
                            >
                              Abbrechen
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      ) : (
        // ══════════════════════════════════════════════════════════
        // DOKUMENT-MODUS
        // ══════════════════════════════════════════════════════════
        <>
          {/* Manuell sichern */}
          <div style={{ padding: '8px 14px', borderBottom: `1px solid ${INV.border}`, flexShrink: 0 }}>
            <button
              onClick={handleManualSave}
              disabled={manualSaving || !werkstufenId}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '6px 10px', borderRadius: 6,
                border: `1px solid ${INV.border}`,
                background: INV.bg2, color: INV.text,
                cursor: manualSaving || !werkstufenId ? 'default' : 'pointer',
                fontSize: 11, fontFamily: 'inherit', fontWeight: 500,
                opacity: manualSaving || !werkstufenId ? 0.5 : 1,
              }}
            >
              <Plus size={11} />
              {manualSaving ? 'Wird gesichert…' : 'Jetzt Dokument sichern'}
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loadingWerk ? (
              <div style={{ padding: 24, fontSize: 12, color: INV.muted, textAlign: 'center' }}>Lädt…</div>
            ) : !werkstufenId ? (
              <div style={{ padding: 24, fontSize: 12, color: INV.muted, textAlign: 'center', lineHeight: 1.6 }}>
                Keine Werkstufe ausgewählt.
              </div>
            ) : werkSnaps.length === 0 ? (
              <div style={{ padding: 24, fontSize: 12, color: INV.muted, textAlign: 'center', lineHeight: 1.6 }}>
                Noch keine Dokument-Sicherungen vorhanden.<br />
                Erste Sicherung beim Wechsel der Werkstufe oder manuell anlegen.
              </div>
            ) : (
              werkSnaps.map((snap, i) => {
                const isExpanded = werkExpandedId === snap.id
                const isConfirming = werkConfirmId === snap.id
                const isRestoring = werkRestoring === snap.id
                const isCurrent = snap.is_current
                const anyIsCurrent = werkSnaps.some(s => s.is_current)
                const isLatest = i === 0 && !anyIsCurrent
                const { label: typLbl, color: typColor } = typLabel(snap.typ)
                const authorName = snap.created_by_name || '—'

                return (
                  <div
                    key={snap.id}
                    style={{
                      borderBottom: `1px solid ${INV.border}`,
                      background: isCurrent ? `${INV.cyan}15` : isLatest ? `${INV.green}12` : undefined,
                    }}
                  >
                    <div
                      style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 8 }}
                      onClick={() => setWerkExpandedId(isExpanded ? null : snap.id)}
                    >
                      <div style={{
                        width: 8, height: 8, borderRadius: '50%', marginTop: 4, flexShrink: 0,
                        background: isCurrent ? INV.cyan : isLatest ? INV.green : snap.typ === 'restore' ? INV.orange : INV.bg3,
                      }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 12, fontWeight: (isLatest || isCurrent) ? 700 : 500, color: INV.text }}>
                            {formatRelative(snap.created_at)}
                          </span>
                          <span style={{ fontSize: 9, fontWeight: 700, color: typColor, background: `${typColor}20`, borderRadius: 3, padding: '1px 5px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                            {typLbl}
                          </span>
                          {isLatest && !isCurrent && (
                            <span style={{ fontSize: 9, fontWeight: 700, color: INV.green, background: `${INV.green}20`, borderRadius: 3, padding: '1px 5px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Aktuell</span>
                          )}
                          {isCurrent && (
                            <span style={{ fontSize: 9, fontWeight: 700, color: INV.cyan, background: `${INV.cyan}20`, borderRadius: 3, padding: '1px 5px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Aktueller Stand</span>
                          )}
                          <div style={{ flex: 1 }} />
                          {isExpanded ? <ChevronUp size={11} style={{ color: INV.muted }} /> : <ChevronDown size={11} style={{ color: INV.muted }} />}
                        </div>
                        <div style={{ fontSize: 10, color: INV.muted, marginTop: 2 }}>
                          {authorName} · {formatAbsolute(snap.created_at)} · {snap.szenen_count} Sz.
                        </div>
                        {snap.text_preview && !isExpanded && (
                          <div style={{ fontSize: 10, color: INV.muted, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: 'italic' }}>
                            „{snap.text_preview}"
                          </div>
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div style={{ padding: '0 14px 14px 30px' }}>
                        {snap.text_preview && (
                          <div style={{ fontSize: 11, color: INV.muted, marginBottom: 10, background: INV.bg2, borderRadius: 6, padding: '7px 10px', lineHeight: 1.6, fontStyle: 'italic', borderLeft: `3px solid ${INV.bg3}` }}>
                            „{snap.text_preview}…"
                          </div>
                        )}

                        {snap.typ === 'restore' && (
                          <div style={{ background: `${INV.orange}15`, border: `1px solid ${INV.orange}44`, borderRadius: 6, padding: '7px 10px', marginBottom: 10, fontSize: 11, lineHeight: 1.5, color: INV.text }}>
                            Automatische Sicherung vor einer Wiederherstellung — kann als Undo verwendet werden.
                          </div>
                        )}

                        {!isConfirming ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); setWerkConfirmId(snap.id) }}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, border: `1px solid ${INV.border}`, background: INV.bg2, color: INV.text, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', fontWeight: 500 }}
                          >
                            <RotateCcw size={11} />
                            Auf diesen Stand zurückgehen
                          </button>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: INV.text }}>
                              Alle {snap.szenen_count} Szenen werden überschrieben. Aktueller Stand wird vorher gesichert.
                            </div>
                            <div style={{ display: 'flex', gap: 7 }}>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDocRestore(snap.id) }}
                                disabled={isRestoring}
                                style={{ padding: '5px 12px', borderRadius: 5, border: 'none', background: INV.green, color: '#fff', cursor: isRestoring ? 'default' : 'pointer', fontSize: 12, fontFamily: 'inherit', fontWeight: 600, opacity: isRestoring ? 0.6 : 1 }}
                              >
                                {isRestoring ? 'Stellt her…' : 'Ja, Dokument wiederherstellen'}
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setWerkConfirmId(null) }}
                                style={{ padding: '5px 12px', borderRadius: 5, border: `1px solid ${INV.border}`, background: 'transparent', color: INV.text, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}
                              >
                                Abbrechen
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </>
      )}

      {/* ── Footer-Legende ── */}
      <div style={{
        padding: '7px 14px',
        borderTop: `1px solid ${INV.border}`,
        flexShrink: 0,
        display: 'flex', gap: 10, fontSize: 10, color: INV.muted, flexWrap: 'wrap',
      }}>
        {mode === 'szene' ? (
          <>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: INV.green, display: 'inline-block' }} />
              Aktuellste
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <AlertTriangle size={9} style={{ color: INV.orange }} />
              Fremde Änderung
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: INV.cyan, display: 'inline-block' }} />
              Wiederhergestellt
            </span>
          </>
        ) : (
          <>
            <span style={{ color: INV.cyan, fontWeight: 600 }}>Cyan</span>
            <span>= Wiederhergestellt</span>
            <span style={{ color: INV.orange, fontWeight: 600 }}>Orange</span>
            <span>= Vor Restore (Undo)</span>
          </>
        )}
      </div>
    </div>
  )
}
