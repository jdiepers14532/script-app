import { useState, useMemo, useRef, useEffect } from 'react'
import { GitCompare, ArrowUpDown } from 'lucide-react'

interface DiffOp {
  op: '=' | '+' | '-'
  text: string
}

interface BlockEntry {
  uuid: string | null
  status: 'unchanged' | 'changed' | 'moved' | 'deleted' | 'added'
  block_json: any
  base_idx: number | null
  other_idx: number | null
  word_diff?: DiffOp[]
}

interface DiffData {
  scene_identity_id: string
  base_has_scene: boolean
  other_has_scene: boolean
  base_blocks: BlockEntry[]
  other_blocks: BlockEntry[]
}

interface Props {
  data: DiffData | null
  loading: boolean
  baseWerkLabel: string
  otherWerkLabel: string
}

function extractText(node: any): string {
  const parts: string[] = []
  const walk = (n: any) => {
    if (n.type === 'text') parts.push(n.text ?? '')
    if (n.type === 'hardBreak') parts.push(' ')
    for (const c of n.content ?? []) walk(c)
  }
  walk(node)
  return parts.join('')
}

function blockElemStyle(elemType: string): React.CSSProperties {
  switch (elemType) {
    case 'scene_heading': return { fontWeight: 700, textTransform: 'uppercase' as const }
    case 'character':     return { fontWeight: 600, textAlign: 'center' as const }
    case 'dialogue':      return { paddingLeft: 40, paddingRight: 40 }
    case 'parenthetical': return { paddingLeft: 40, paddingRight: 40, fontStyle: 'italic' as const }
    case 'transition':    return { textAlign: 'right' as const, textTransform: 'uppercase' as const, fontWeight: 600 }
    default:              return {}
  }
}

function BlockContent({ entry }: { entry: BlockEntry }) {
  const block = entry.block_json
  const elemType = block?.attrs?.element ?? ''
  const elemStyle = blockElemStyle(elemType)
  const wd = entry.status === 'changed' ? entry.word_diff : undefined

  const baseRowStyle: React.CSSProperties = {
    padding: '3px 14px',
    fontSize: 13,
    lineHeight: 1.6,
    fontFamily: 'var(--font-body, inherit)',
    position: 'relative',
    borderLeft: '3px solid transparent',
    wordBreak: 'break-word',
    ...elemStyle,
  }

  let rowStyle: React.CSSProperties = baseRowStyle
  let badge: React.ReactNode = null

  switch (entry.status) {
    case 'deleted':
      rowStyle = { ...baseRowStyle, background: 'rgba(255,59,48,0.07)', borderLeftColor: '#FF3B30',
        textDecoration: 'line-through', color: '#bb2200', opacity: 0.85 }
      break
    case 'added':
      rowStyle = { ...baseRowStyle, background: 'rgba(0,200,83,0.07)', borderLeftColor: '#00C853', color: '#006b00' }
      break
    case 'changed':
      rowStyle = { ...baseRowStyle, background: 'rgba(255,204,0,0.07)', borderLeftColor: '#FFCC00' }
      break
    case 'moved':
      rowStyle = { ...baseRowStyle, background: 'rgba(255,149,0,0.06)', borderLeftColor: '#FF9500' }
      badge = (
        <span style={{ fontSize: 10, color: '#FF9500', marginLeft: 8, verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
          <ArrowUpDown size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 2 }} />
          verschoben
        </span>
      )
      break
  }

  const text = extractText(block)

  return (
    <div style={rowStyle}>
      {wd ? (
        <>
          {wd.map((op, i) => {
            if (op.op === '=') return <span key={i}>{op.text}</span>
            if (op.op === '+') return (
              <mark key={i} style={{ background: 'rgba(0,200,83,0.32)', color: '#005c00', borderRadius: 2, padding: '0 1px' }}>
                {op.text}
              </mark>
            )
            return (
              <del key={i} style={{ background: 'rgba(255,59,48,0.18)', color: '#bb2200', borderRadius: 2, padding: '0 1px', textDecoration: 'line-through' }}>
                {op.text}
              </del>
            )
          })}
        </>
      ) : (
        text || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', opacity: 0.5 }}>‹leer›</span>
      )}
      {badge}
    </div>
  )
}

export default function DiffView({ data, loading, baseWerkLabel, otherWerkLabel }: Props) {
  const [mode, setMode] = useState<'redline' | 'parallel'>('redline')
  const leftRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)

  // Synchronized scrolling for parallel mode
  useEffect(() => {
    if (mode !== 'parallel') return
    const left = leftRef.current
    const right = rightRef.current
    if (!left || !right) return
    let busy = false
    const onLeft  = () => { if (!busy) { busy = true; right.scrollTop = left.scrollTop;  busy = false } }
    const onRight = () => { if (!busy) { busy = true; left.scrollTop  = right.scrollTop; busy = false } }
    left.addEventListener('scroll', onLeft)
    right.addEventListener('scroll', onRight)
    return () => { left.removeEventListener('scroll', onLeft); right.removeEventListener('scroll', onRight) }
  }, [mode])

  // Build merged sequence for Redline view:
  // Iterate other_blocks in order; before each anchor, insert deleted base_blocks
  // that fall between the previous anchor and this one.
  const mergedBlocks = useMemo<BlockEntry[]>(() => {
    if (!data) return []
    const { base_blocks, other_blocks } = data
    const deletedBase = [...base_blocks.filter(b => b.status === 'deleted')]
      .sort((a, b) => (a.base_idx ?? 0) - (b.base_idx ?? 0))

    const result: BlockEntry[] = []
    let prevAnchorBaseIdx = -1

    for (const ob of other_blocks) {
      if (ob.base_idx !== null) {
        for (const del of deletedBase) {
          const di = del.base_idx ?? 0
          if (di > prevAnchorBaseIdx && di < ob.base_idx) result.push(del)
        }
        prevAnchorBaseIdx = ob.base_idx
      }
      result.push(ob)
    }
    // Remaining deletions after last anchor
    for (const del of deletedBase) {
      if ((del.base_idx ?? 0) > prevAnchorBaseIdx) result.push(del)
    }
    return result
  }, [data])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 13, gap: 8 }}>
        <GitCompare size={16} style={{ opacity: 0.5 }} />
        Lade Diff…
      </div>
    )
  }

  if (!data) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 13, gap: 8 }}>
        <GitCompare size={16} style={{ opacity: 0.3 }} />
        Szene auswählen zum Vergleichen
      </div>
    )
  }

  const { base_blocks, other_blocks } = data
  const unchanged = (b: BlockEntry) => b.status === 'unchanged'
  const hasChanges = !base_blocks.every(unchanged) || !other_blocks.every(unchanged)

  const btnStyle = (active: boolean): React.CSSProperties => ({
    padding: '3px 10px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
    fontFamily: 'inherit', border: 'none',
    background: active ? '#007AFF' : 'var(--bg-surface)',
    color: active ? '#fff' : 'var(--text-primary)',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Toolbar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px',
        borderBottom: '1px solid var(--border)', background: 'var(--bg-subtle)',
        flexShrink: 0, flexWrap: 'wrap',
      }}>
        <button style={btnStyle(mode === 'redline')} onClick={() => setMode('redline')}>Redline</button>
        <button style={btnStyle(mode === 'parallel')} onClick={() => setMode('parallel')}>Parallel</button>

        {!hasChanges && (
          <span style={{ fontSize: 11, color: '#00C853', marginLeft: 6 }}>✓ Keine Unterschiede</span>
        )}

        {/* Legende */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, fontSize: 10, color: 'var(--text-muted)', alignItems: 'center', flexWrap: 'wrap' }}>
          <span>
            <mark style={{ background: 'rgba(0,200,83,0.32)', borderRadius: 2, padding: '0 3px', color: '#005c00' }}>eingefügt</mark>
          </span>
          <span>
            <del style={{ background: 'rgba(255,59,48,0.18)', color: '#bb2200', borderRadius: 2, padding: '0 3px' }}>gelöscht</del>
          </span>
          <span style={{ borderLeft: '2px solid #FF9500', paddingLeft: 4 }}>verschoben</span>
        </div>
      </div>

      {mode === 'redline' ? (
        // ── Redline: merged inline view ──
        <div style={{ flex: 1, overflow: 'auto', padding: '6px 0' }}>
          {mergedBlocks.length === 0
            ? <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>Keine Blöcke</div>
            : mergedBlocks.map((entry, i) => (
              <BlockContent key={`${entry.uuid ?? i}-${entry.status}-${i}`} entry={entry} />
            ))
          }
        </div>
      ) : (
        // ── Parallel: side-by-side ──
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Left: base */}
          <div ref={leftRef} style={{ flex: 1, overflow: 'auto', borderRight: '1px solid var(--border)' }}>
            <div style={{
              padding: '3px 14px', fontSize: 11, color: 'var(--text-muted)',
              borderBottom: '1px solid var(--border)',
              position: 'sticky', top: 0, background: 'var(--bg-subtle)', zIndex: 1,
            }}>
              {baseWerkLabel}
            </div>
            {base_blocks.length === 0
              ? <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: 12 }}>Szene nicht vorhanden</div>
              : base_blocks.map((entry, i) => (
                <BlockContent key={`base-${entry.uuid ?? i}-${entry.status}`} entry={entry} />
              ))
            }
          </div>
          {/* Right: other */}
          <div ref={rightRef} style={{ flex: 1, overflow: 'auto' }}>
            <div style={{
              padding: '3px 14px', fontSize: 11, color: 'var(--text-muted)',
              borderBottom: '1px solid var(--border)',
              position: 'sticky', top: 0, background: 'var(--bg-subtle)', zIndex: 1,
            }}>
              {otherWerkLabel}
            </div>
            {other_blocks.length === 0
              ? <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: 12 }}>Szene nicht vorhanden</div>
              : other_blocks.map((entry, i) => (
                <BlockContent key={`other-${entry.uuid ?? i}-${entry.status}`} entry={entry} />
              ))
            }
          </div>
        </div>
      )}

      {/*
        PHASE B (NOT IMPLEMENTED — FUTURE):
        Accept/Reject einzelner Änderungen aus dem Diff-Modus.
        Voraussetzung: Ziel-Werkstufe darf NICHT eingefroren sein (FROZEN-Guard in dokument-szenen.ts beachten).
        Technisch: Diff-Op auf editor.commands anwenden.
        Build-vs-Buy: Tiptap Pro "track changes" ($149/mo) vs. Custom ProseMirror-Transforms.
        API: POST /api/werkstufen/:id/apply-diff-op { scene_identity_id, block_uuid, op: 'accept'|'reject' }
      */}
    </div>
  )
}
