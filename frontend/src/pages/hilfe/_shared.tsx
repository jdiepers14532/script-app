// ── Shared Hilfe-Komponenten ────────────────────────────────────────────────
// Alle Farben, wiederverwendbare Bausteine — wird von allen Hilfe-Tabs importiert

import { useState } from 'react'

// ── Farben ────────────────────────────────────────────────────────────────────
export const C = {
  blue:    '#007AFF',
  green:   '#00C853',
  orange:  '#FF9500',
  purple:  '#AF52DE',
  red:     '#FF3B30',
  gray:    '#757575',
  border:  'var(--border)',
  surface: 'var(--bg-surface)',
  subtle:  'var(--bg-subtle)',
  text:    'var(--text-primary)',
  muted:   'var(--text-secondary)',
}

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────
export function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{
      display: 'inline-block',
      background: color + '22',
      color,
      border: `1px solid ${color}55`,
      borderRadius: 4,
      fontSize: 10,
      fontWeight: 600,
      padding: '1px 6px',
      fontFamily: 'monospace',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  )
}

export function Tag({ ok }: { ok?: boolean }) {
  return ok !== false
    ? <span style={{ color: C.green, fontSize: 11, fontWeight: 700 }}>✓</span>
    : <span style={{ color: C.orange, fontSize: 11, fontWeight: 700 }}>⚠</span>
}

export function TableCard({ title, color, fields, note }: {
  title: string
  color: string
  note?: string
  fields: { name: string; type: string; desc: string; ok?: boolean }[]
}) {
  const [copied, setCopied] = useState<string | null>(null)

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {})
    setCopied(text)
    setTimeout(() => setCopied(null), 1200)
  }

  return (
    <div style={{
      border: `2px solid ${color}`,
      borderRadius: 10,
      overflow: 'hidden',
      background: C.surface,
      fontSize: 12,
      position: 'relative',
    }}>
      {copied && (
        <div style={{
          position: 'absolute', top: 4, right: 8, background: '#00C853', color: '#fff',
          fontSize: 10, padding: '2px 8px', borderRadius: 4, pointerEvents: 'none',
          fontFamily: 'monospace', fontWeight: 600, zIndex: 10,
        }}>
          ✓ {copied}
        </div>
      )}
      <div
        title={`Klick: "${title}" kopieren`}
        onClick={() => copy(title)}
        style={{
          background: color, color: '#fff', fontWeight: 700, fontSize: 12,
          padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 6,
          letterSpacing: 0.3, cursor: 'copy',
        }}
      >
        <span style={{ fontFamily: 'monospace', opacity: 0.8 }}>TABLE</span>
        <span>{title}</span>
      </div>
      {note && (
        <div style={{ padding: '6px 12px', background: color + '18', fontSize: 11, color: C.muted, borderBottom: `1px solid ${color}33` }}>
          {note}
        </div>
      )}
      <div>
        {fields.map((f, i) => (
          <div key={f.name} style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(110px, 160px) minmax(80px, 100px) 1fr 18px',
            gap: 6,
            padding: '5px 12px',
            borderBottom: i < fields.length - 1 ? `1px solid ${C.border}` : undefined,
            alignItems: 'center',
          }}>
            <code
              title={`Klick: "${title}.${f.name}" · Strg+Klick: nur "${f.name}"`}
              onClick={(e) => copy(e.ctrlKey ? f.name : `${title}.${f.name}`)}
              style={{ fontSize: 11, color: color, fontWeight: 600, cursor: 'copy' }}
            >{f.name}</code>
            <span style={{ fontSize: 10, color: C.muted, fontFamily: 'monospace' }}>{f.type}</span>
            <span style={{ fontSize: 11, color: C.text }}>{f.desc}</span>
            {f.ok !== undefined && <Tag ok={f.ok} />}
          </div>
        ))}
      </div>
    </div>
  )
}

export function Arrow({ label }: { label?: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '4px 0', color: C.muted, fontSize: 11, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <span style={{ fontSize: 18, lineHeight: 1, color: C.gray }}>↓</span>
      {label && <span style={{ fontSize: 10 }}>{label}</span>}
    </div>
  )
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 40 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 16px 0', paddingBottom: 8, borderBottom: `2px solid ${C.border}` }}>
        {title}
      </h2>
      {children}
    </section>
  )
}

// ── FAQ-Akkordeon ─────────────────────────────────────────────────────────────
export function FaqItem({ q, a }: { q: string; a: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{
      border: `1px solid ${open ? C.blue + '55' : C.border}`,
      borderRadius: 8, marginBottom: 8, overflow: 'hidden', background: C.surface,
      transition: 'border-color 0.2s',
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          width: '100%', padding: '13px 16px', background: 'none', border: 'none',
          cursor: 'pointer', textAlign: 'left', gap: 12,
          color: C.text, fontSize: 13, fontWeight: 600, lineHeight: 1.45,
        }}
      >
        <span>{q}</span>
        <span style={{
          flexShrink: 0, color: open ? C.blue : C.muted, fontSize: 14, marginTop: 1,
          display: 'inline-block', transition: 'transform 0.2s, color 0.15s',
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
        }}>▾</span>
      </button>
      {open && (
        <div style={{
          padding: '4px 16px 16px', borderTop: `1px solid ${C.border}`,
          fontSize: 13, color: C.text, lineHeight: 1.65, background: C.subtle,
        }}>
          {a}
        </div>
      )}
    </div>
  )
}

// ── Connector ─────────────────────────────────────────────────────────────────
export function Connector({ direction = 'down', label, color = C.muted }: { direction?: 'down' | 'right' | 'left-right'; label?: string; color?: string }) {
  if (direction === 'right') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 0', color }}>
        <span style={{ fontSize: 18, lineHeight: 1 }}>→</span>
        {label && <span style={{ fontSize: 10 }}>{label}</span>}
      </div>
    )
  }
  if (direction === 'left-right') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 0', color }}>
        <span style={{ fontSize: 18, lineHeight: 1 }}>↔</span>
        {label && <span style={{ fontSize: 10 }}>{label}</span>}
      </div>
    )
  }
  return <Arrow label={label} />
}

// ── Kleine Inline-Box ──────────────────────────────────────────────────────
export function FieldBox({ name, type, pk, fk, nullable, deprecated }: {
  name: string; type: string; pk?: boolean; fk?: boolean; nullable?: boolean; deprecated?: boolean
}) {
  return (
    <div style={{
      display: 'flex', gap: 6, alignItems: 'baseline', padding: '3px 0',
      opacity: deprecated ? 0.5 : 1,
    }}>
      <code style={{ fontSize: 11, fontWeight: pk ? 700 : 500, color: pk ? C.blue : fk ? C.purple : C.text }}>
        {name}
      </code>
      <span style={{ fontSize: 9, fontFamily: 'monospace', color: C.muted, textTransform: 'uppercase' }}>{type}</span>
      {pk && <Badge color={C.blue}>PK</Badge>}
      {fk && <Badge color={C.purple}>FK</Badge>}
      {nullable && <span style={{ fontSize: 9, color: C.orange }}>NULL</span>}
      {deprecated && <Badge color={C.red}>DEPRECATED</Badge>}
    </div>
  )
}

// ── Warn-Box ───────────────────────────────────────────────────────────────
export function WarnBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      border: `1px solid ${C.orange}55`,
      borderLeft: `4px solid ${C.orange}`,
      borderRadius: 8,
      padding: '12px 16px',
      background: C.orange + '0a',
      marginTop: 12,
      marginBottom: 12,
    }}>
      <div style={{ fontWeight: 700, fontSize: 12, color: C.orange, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.7 }}>{children}</div>
    </div>
  )
}

// ── Info-Box ───────────────────────────────────────────────────────────────
export function InfoBox({ title, children, color = C.blue }: { title: string; children: React.ReactNode; color?: string }) {
  return (
    <div style={{
      border: `1px solid ${color}33`,
      borderLeft: `4px solid ${color}`,
      borderRadius: 8,
      padding: '12px 16px',
      background: color + '08',
      marginTop: 12,
      marginBottom: 12,
    }}>
      <div style={{ fontWeight: 700, fontSize: 12, color, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.7 }}>{children}</div>
    </div>
  )
}
