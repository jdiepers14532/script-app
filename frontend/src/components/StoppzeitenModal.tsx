import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { api } from '../api/client'

const STAGES = [
  { key: 'drehbuch',     label: 'Drehbuch' },
  { key: 'vorbereitung', label: 'Vorbereitung' },
  { key: 'dreh',         label: 'Dreh' },
  { key: 'schnitt',      label: 'Schnitt' },
] as const

function fmtSek(sek: number | null | undefined): string {
  if (sek == null) return '—'
  const m = Math.floor(sek / 60)
  const s = sek % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function sumSek(rows: any[], field: string): number {
  return rows.reduce((acc, r) => acc + (Number(r[field]) || 0), 0)
}

interface Props {
  open: boolean
  onClose: () => void
  werkstufId: string
}

export default function StoppzeitenModal({ open, onClose, werkstufId }: Props) {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    api.getWerkstufenVorstoppUebersicht(werkstufId)
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [open, werkstufId])

  if (!open) return null

  const totalAktuell = sumSek(rows, 'stoppzeit_sek')
  const stageTotals = STAGES.map(({ key }) =>
    rows.reduce((acc, r) => acc + (Number(r.vorstopp?.[key]) || 0), 0)
  )

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.45)', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--bg-primary)', borderRadius: 12, width: '90vw', maxWidth: 860,
        maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 40px rgba(0,0,0,0.3)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Stoppzeiten-Übersicht</span>
          <button className="iconbtn" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
          {loading ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Lade…
            </div>
          ) : rows.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Keine Szenen vorhanden.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)', position: 'sticky', top: 0 }}>
                  <th style={TH}>SZ</th>
                  <th style={{ ...TH, textAlign: 'left', minWidth: 140 }}>Motiv</th>
                  <th style={{ ...TH, color: 'var(--color-info)' }}>Aktuell</th>
                  {STAGES.map(s => (
                    <th key={s.key} style={TH}>{s.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const label = `${row.scene_nummer}${row.scene_nummer_suffix || ''}`
                  const motiv = [row.ort_name, row.int_ext, row.tageszeit].filter(Boolean).join(' · ')
                  const odd = i % 2 === 1
                  return (
                    <tr key={row.id} style={{ background: odd ? 'var(--bg-secondary)' : undefined }}>
                      <td style={TD}>{label}</td>
                      <td style={{ ...TD, textAlign: 'left', color: 'var(--text-muted)' }}>{motiv || '—'}</td>
                      <td style={{ ...TD, color: 'var(--color-info)', fontWeight: 600 }}>
                        {fmtSek(row.stoppzeit_sek)}
                      </td>
                      {STAGES.map(s => (
                        <td key={s.key} style={TD}>
                          {fmtSek(row.vorstopp?.[s.key])}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                  <td style={TD} colSpan={2}>Gesamt</td>
                  <td style={{ ...TD, color: 'var(--color-info)', fontWeight: 700 }}>
                    {fmtSek(totalAktuell)}
                  </td>
                  {stageTotals.map((total, i) => (
                    <td key={i} style={TD}>{total > 0 ? fmtSek(total) : '—'}</td>
                  ))}
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

const TH: React.CSSProperties = {
  padding: '8px 12px',
  fontWeight: 600,
  fontSize: 11,
  textAlign: 'center',
  borderBottom: '1px solid var(--border)',
  whiteSpace: 'nowrap',
}

const TD: React.CSSProperties = {
  padding: '6px 12px',
  textAlign: 'center',
  borderBottom: '1px solid var(--border)',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
}
