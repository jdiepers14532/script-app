import { useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, AlertTriangle, CheckCircle2, Wrench, RotateCcw, UserPlus } from 'lucide-react'
import { api } from '../api/client'

interface CheckItem {
  id: string | null
  check_typ: string
  meldung: string
  meta?: any
}

interface CheckHinweisModalProps {
  checks: CheckItem[]
  anchorRect: DOMRect
  produktionId: string | null
  szeneId: string | number | null
  sceneNummer?: number | null
  onClose: () => void
  onChecksChanged: (remaining: CheckItem[]) => void
  onRerun?: () => Promise<void>
}

const CHECK_TYPE_LABELS: Record<string, string> = {
  rollen_konsistenz: 'Rollen-Konsistenz',
  rollen_grossbuchstaben: 'Rollen in Großbuchstaben',
  sondertyp_wechselschnitt: 'Sondertyp/Wechselschnitt',
  strang_zuordnung: 'Strang-Zuordnung',
  motiv_leer: 'Motiv',
  duplikat_motiv: 'Duplikat-Motiv',
  fehlender_dialog: 'Fehlender Dialog',
  stoppzeit_plausibilitaet: 'Stoppzeit',
  spieltag_inkonsistent: 'Dramaturgischer Tag',
}

const MODAL_W = 330

function computeInitialPos(anchorRect: DOMRect): { x: number; y: number } {
  const spaceBelow = window.innerHeight - anchorRect.bottom - 8
  const spaceAbove = anchorRect.top - 8
  const MODAL_H_EST = 260
  const openBelow = spaceBelow >= MODAL_H_EST || spaceBelow >= spaceAbove

  let x = anchorRect.left
  let y: number
  if (openBelow) {
    y = anchorRect.bottom + 4
  } else {
    y = anchorRect.top - MODAL_H_EST - 4
  }

  x = Math.max(4, Math.min(x, window.innerWidth - MODAL_W - 4))
  y = Math.max(4, y)

  return { x, y }
}

export default function CheckHinweisModal({
  checks,
  anchorRect,
  produktionId,
  szeneId,
  sceneNummer,
  onClose,
  onChecksChanged,
  onRerun,
}: CheckHinweisModalProps) {
  const [localChecks, setLocalChecks] = useState<CheckItem[]>(checks)
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null)
  const [spieltagScope, setSpieltagScope] = useState<{ scenes_affected: number; folgen_affected: number } | null>(null)
  const [spieltagLoading, setSpieltagLoading] = useState(false)
  const [spieltagFixed, setSpieltagFixed] = useState(false)
  const [rerunning, setRerunning] = useState(false)
  const [fixingIds, setFixingIds] = useState<Set<string>>(new Set())
  const dragRef = useRef<{ dragging: boolean; ox: number; oy: number }>({ dragging: false, ox: 0, oy: 0 })

  const initialPos = useRef(computeInitialPos(anchorRect))
  const currentPos = dragPos ?? { x: initialPos.current.x, y: initialPos.current.y }

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const start = dragPos ?? { x: initialPos.current.x, y: initialPos.current.y }
    dragRef.current = { dragging: true, ox: e.clientX - start.x, oy: e.clientY - start.y }
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current.dragging) return
      setDragPos({
        x: Math.max(0, Math.min(ev.clientX - dragRef.current.ox, window.innerWidth - MODAL_W - 4)),
        y: Math.max(0, ev.clientY - dragRef.current.oy),
      })
    }
    const onUp = () => {
      dragRef.current.dragging = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [dragPos])

  const removeCheck = useCallback((checkId: string | null, afterFix?: boolean) => {
    const next = localChecks.filter(c => c.id !== checkId)
    setLocalChecks(next)
    onChecksChanged(next)
    if (next.length === 0 && !afterFix) onClose()
  }, [localChecks, onChecksChanged, onClose])

  const markBehoben = useCallback(async (checkId: string) => {
    await api.markCheckBehoben(checkId).catch(() => {})
    removeCheck(checkId)
  }, [removeCheck])

  const handleRerun = useCallback(async () => {
    if (!onRerun) return
    setRerunning(true)
    try { await onRerun() } catch {} finally { setRerunning(false) }
  }, [onRerun])

  // ── Rollen nachtragen ─────────────────────────────────────────────────────
  const handleRollenNachtragen = useCallback(async (check: CheckItem) => {
    if (!check.meta?.missing_chars?.length || !check.meta?.scene_identity_id) return
    const key = check.id ?? 'rollen'
    setFixingIds(prev => new Set(prev).add(key))
    try {
      for (const char of check.meta.missing_chars) {
        await api.addSceneIdentityCharacter(check.meta.scene_identity_id, { character_id: char.id }).catch(() => {})
      }
      // Als behoben markieren und neu prüfen
      if (check.id) await api.markCheckBehoben(check.id).catch(() => {})
      removeCheck(check.id, true)
      if (onRerun) {
        setRerunning(true)
        await onRerun().catch(() => {})
        setRerunning(false)
      }
    } finally {
      setFixingIds(prev => { const n = new Set(prev); n.delete(key); return n })
    }
  }, [removeCheck, onRerun])

  // ── Strang übernehmen ─────────────────────────────────────────────────────
  const handleStrangUebernehmen = useCallback(async (check: CheckItem, strangId: string) => {
    if (!szeneId) return
    const key = check.id ?? 'strang'
    setFixingIds(prev => new Set(prev).add(key))
    try {
      await api.addSzeneStrang(String(szeneId), strangId).catch(() => {})
      if (check.id) await api.markCheckBehoben(check.id).catch(() => {})
      removeCheck(check.id, true)
      if (onRerun) {
        setRerunning(true)
        await onRerun().catch(() => {})
        setRerunning(false)
      }
    } finally {
      setFixingIds(prev => { const n = new Set(prev); n.delete(key); return n })
    }
  }, [szeneId, removeCheck, onRerun])

  // ── Spieltag ──────────────────────────────────────────────────────────────
  const handleSpieltagAutokorrektur = useCallback(async () => {
    if (!produktionId) return
    if (!spieltagScope) {
      setSpieltagLoading(true)
      try {
        const scope = await api.getSpieltagFixScope(produktionId)
        setSpieltagScope(scope)
      } catch {} finally { setSpieltagLoading(false) }
    } else {
      setSpieltagLoading(true)
      try {
        await api.applySpieltagFix(produktionId)
        setSpieltagFixed(true)
        if (onRerun) {
          setRerunning(true)
          await onRerun().catch(() => {})
          setRerunning(false)
        }
        setTimeout(onClose, 1400)
      } catch {} finally { setSpieltagLoading(false) }
    }
  }, [produktionId, spieltagScope, onRerun, onClose])

  const hasSpieltagCheck = localChecks.some(c => c.check_typ === 'spieltag_inkonsistent')

  const content = (
    <div
      style={{
        position: 'fixed',
        left: currentPos.x,
        top: currentPos.y,
        width: MODAL_W,
        zIndex: 99998,
        background: 'var(--bg-surface, #fff)',
        border: '1px solid var(--border, #e0e0e0)',
        borderRadius: 8,
        boxShadow: '0 8px 32px rgba(0,0,0,0.22)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        userSelect: 'none',
      }}
      onMouseDown={e => e.stopPropagation()}
    >
      {/* Header — grab to drag */}
      <div
        onMouseDown={handleDragStart}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 8px 7px 12px',
          background: 'rgba(255,149,0,0.08)',
          borderBottom: '1px solid var(--border)',
          cursor: 'grab',
        }}
      >
        <AlertTriangle size={13} style={{ color: '#FF9500', flexShrink: 0 }} />
        {sceneNummer != null && (
          <span style={{ fontSize: 10, color: 'var(--text-muted)', marginRight: 2 }}>
            Sz.{String(sceneNummer).padStart(2, '0')} ·
          </span>
        )}
        <span style={{ fontSize: 11, fontWeight: 600, color: '#FF9500', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Drehbuch-Checks · {localChecks.length} Hinweis{localChecks.length > 1 ? 'e' : ''}
        </span>
        <div style={{ flex: 1 }} />
        {onRerun && (
          <button
            title="Checks neu ausführen"
            onMouseDown={e => e.stopPropagation()}
            onClick={handleRerun}
            disabled={rerunning}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', color: 'var(--text-muted)', lineHeight: 1, opacity: rerunning ? 0.4 : 1 }}
          >
            <RotateCcw size={12} />
          </button>
        )}
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', color: 'var(--text-muted)', lineHeight: 1 }}
        >
          <X size={13} />
        </button>
      </div>

      {/* Check items */}
      <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
        {localChecks.map((r, i) => {
          const isFix = fixingIds.has(r.id ?? '')
          const hasMissingChars = r.check_typ === 'rollen_konsistenz' && r.meta?.missing_chars?.length > 0
          const hasStrangVorschlaege = r.check_typ === 'strang_zuordnung' && r.meta?.strang_vorschlaege?.length > 0

          return (
            <div
              key={r.id ?? i}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 8,
                background: 'var(--bg, #f5f5f5)',
                border: '1px solid var(--border)',
                borderRadius: 6, padding: '6px 10px',
              }}
            >
              <span style={{ fontSize: 10, color: '#FF9500', marginTop: 1, flexShrink: 0 }}>⚠</span>
              <div style={{ flex: 1, minWidth: 0, userSelect: 'text' }}>
                <div style={{ fontSize: 11, color: 'var(--text-primary)', wordBreak: 'break-word', lineHeight: 1.4 }}>{r.meldung}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                  {CHECK_TYPE_LABELS[r.check_typ] ?? r.check_typ}
                </div>

                {/* Rollen nachtragen */}
                {hasMissingChars && (
                  <button
                    onMouseDown={e => e.stopPropagation()}
                    onClick={() => handleRollenNachtragen(r)}
                    disabled={isFix}
                    style={{
                      marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '3px 8px', borderRadius: 5, fontSize: 10, fontWeight: 600, cursor: isFix ? 'wait' : 'pointer',
                      background: 'rgba(0,122,255,0.08)', border: '1px solid rgba(0,122,255,0.3)',
                      color: 'var(--sw-info, #007AFF)', opacity: isFix ? 0.5 : 1,
                    }}
                  >
                    <UserPlus size={10} />
                    {isFix ? '…' : 'Rollen nachtragen'}
                  </button>
                )}

                {/* Strang-Vorschläge */}
                {hasStrangVorschlaege && (
                  <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {r.meta.strang_vorschlaege.map((v: { id: string; name: string; farbe: string }) => (
                      <button
                        key={v.id}
                        onMouseDown={e => e.stopPropagation()}
                        onClick={() => handleStrangUebernehmen(r, v.id)}
                        disabled={isFix}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '2px 8px', borderRadius: 5, fontSize: 10, fontWeight: 600,
                          cursor: isFix ? 'wait' : 'pointer', opacity: isFix ? 0.5 : 1,
                          background: `${v.farbe}18`, border: `1px solid ${v.farbe}55`,
                          color: v.farbe,
                        }}
                      >
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: v.farbe, flexShrink: 0 }} />
                        {v.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {r.id && (
                <button
                  title="Als behoben markieren"
                  onMouseDown={e => e.stopPropagation()}
                  onClick={() => markBehoben(r.id!)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', color: 'var(--sw-green, #00C853)', flexShrink: 0, lineHeight: 1, marginTop: 1 }}
                >
                  <CheckCircle2 size={13} />
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Spieltag Auto-Korrektur */}
      {hasSpieltagCheck && produktionId && !spieltagFixed && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {spieltagScope && (
            <div style={{
              fontSize: 11, color: 'var(--text-secondary)',
              background: 'rgba(255,149,0,0.06)', padding: '5px 9px', borderRadius: 5,
              border: '1px solid rgba(255,149,0,0.25)', lineHeight: 1.4,
            }}>
              <strong>{spieltagScope.scenes_affected}</strong> Szenen in <strong>{spieltagScope.folgen_affected}</strong> Folge{spieltagScope.folgen_affected !== 1 ? 'n' : ''} werden angepasst
            </div>
          )}
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={handleSpieltagAutokorrektur}
            disabled={spieltagLoading}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '6px 10px', borderRadius: 6, cursor: spieltagLoading ? 'wait' : 'pointer',
              fontSize: 12, fontWeight: 600, border: spieltagScope ? 'none' : '1px solid var(--border)',
              background: spieltagScope ? '#FF9500' : 'var(--bg, #f5f5f5)',
              color: spieltagScope ? '#fff' : 'var(--text-primary)',
              opacity: spieltagLoading ? 0.6 : 1,
              transition: 'background 0.15s',
            } as React.CSSProperties}
          >
            <Wrench size={13} />
            {spieltagLoading ? '…' : spieltagScope ? 'Bestätigen — Spieltage korrigieren' : 'Auto-Korrektur: Spieltage'}
          </button>
        </div>
      )}

      {spieltagFixed && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '8px 12px', textAlign: 'center', fontSize: 12, color: 'var(--sw-green, #00C853)', fontWeight: 600 }}>
          ✓ Spieltage wurden korrigiert
        </div>
      )}
    </div>
  )

  return createPortal(content, document.body)
}
