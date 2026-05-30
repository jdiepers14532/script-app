import { useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, AlertTriangle, CheckCircle2, Wrench, RotateCcw } from 'lucide-react'
import { api } from '../api/client'

interface CheckItem {
  id: string | null
  check_typ: string
  meldung: string
}

interface CheckHinweisModalProps {
  checks: CheckItem[]
  anchorRect: DOMRect
  produktionId: string | null
  szeneId: string | number | null
  onClose: () => void
  onChecksChanged: (remaining: CheckItem[]) => void
  onRerun?: () => Promise<void>
}

const CHECK_TYPE_LABELS: Record<string, string> = {
  rollen_konsistenz: 'Rollen-Konsistenz',
  sondertyp_wechselschnitt: 'Sondertyp/Wechselschnitt',
  strang_zuordnung: 'Strang-Zuordnung',
  motiv_leer: 'Motiv',
  duplikat_motiv: 'Duplikat-Motiv',
  stoppzeit_plausibilitaet: 'Stoppzeit',
  spieltag_inkonsistent: 'Dramaturgischer Tag',
}

const MODAL_W = 318

function computeInitialPos(anchorRect: DOMRect): { x: number; y: number; openBelow: boolean } {
  const spaceBelow = window.innerHeight - anchorRect.bottom - 8
  const spaceAbove = anchorRect.top - 8
  const MODAL_H_EST = 240
  const openBelow = spaceBelow >= MODAL_H_EST || spaceBelow >= spaceAbove

  let x = anchorRect.left
  let y: number
  if (openBelow) {
    y = anchorRect.bottom + 4
  } else {
    y = anchorRect.top - MODAL_H_EST - 4
  }

  // Clamp to viewport
  x = Math.max(4, Math.min(x, window.innerWidth - MODAL_W - 4))
  y = Math.max(4, y)

  return { x, y, openBelow }
}

export default function CheckHinweisModal({
  checks,
  anchorRect,
  produktionId,
  szeneId,
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

  const markBehoben = useCallback(async (checkId: string) => {
    await api.markCheckBehoben(checkId).catch(() => {})
    const next = localChecks.filter(c => c.id !== checkId)
    setLocalChecks(next)
    onChecksChanged(next)
    if (next.length === 0) onClose()
  }, [localChecks, onChecksChanged, onClose])

  const handleSpieltagAutokorrektur = useCallback(async () => {
    if (!produktionId) return
    if (!spieltagScope) {
      setSpieltagLoading(true)
      try {
        const scope = await api.getSpieltagFixScope(produktionId)
        setSpieltagScope(scope)
      } catch {} finally {
        setSpieltagLoading(false)
      }
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
      } catch {} finally {
        setSpieltagLoading(false)
      }
    }
  }, [produktionId, spieltagScope, onRerun, onClose])

  const handleRerun = useCallback(async () => {
    if (!onRerun) return
    setRerunning(true)
    try {
      await onRerun()
    } catch {} finally {
      setRerunning(false)
    }
  }, [onRerun])

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
        <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: '#FF9500', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Drehbuch-Checks · {localChecks.length} Hinweis{localChecks.length > 1 ? 'e' : ''}
        </span>
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
      <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
        {localChecks.map((r, i) => (
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
            </div>
            {r.id && (
              <button
                title="Als behoben markieren"
                onMouseDown={e => e.stopPropagation()}
                onClick={() => markBehoben(r.id!)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', color: 'var(--sw-green, #00C853)', flexShrink: 0, lineHeight: 1 }}
              >
                <CheckCircle2 size={13} />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Spieltag Auto-Korrektur */}
      {hasSpieltagCheck && produktionId && !spieltagFixed && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {spieltagScope && (
            <div style={{
              fontSize: 11, color: 'var(--text-secondary)',
              background: 'rgba(255,149,0,0.06)',
              padding: '5px 9px', borderRadius: 5,
              border: '1px solid rgba(255,149,0,0.25)',
              lineHeight: 1.4,
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
              fontSize: 12, fontWeight: 600, border: 'none',
              background: spieltagScope ? '#FF9500' : 'var(--bg, #f5f5f5)',
              color: spieltagScope ? '#fff' : 'var(--text-primary)',
              border: spieltagScope ? 'none' : '1px solid var(--border)',
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
