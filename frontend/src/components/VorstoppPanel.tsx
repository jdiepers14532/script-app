import { useState, useEffect, useRef } from 'react'
import { Zap } from 'lucide-react'
import { api } from '../api/client'

const STAGES = [
  { key: 'drehbuch',     label: 'Drehbuch' },
  { key: 'vorbereitung', label: 'Vorbereitung' },
  { key: 'dreh',         label: 'Dreh' },
  { key: 'schnitt',      label: 'Schnitt' },
] as const

type StageKey = typeof STAGES[number]['key']

function fmtSek(sek: number | null | undefined): string {
  if (sek == null) return '—'
  const m = Math.floor(sek / 60)
  const s = sek % 60
  return m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`
}

interface Props {
  szeneId: number
  produktionId?: string | null
}

export default function VorstoppPanel({ szeneId, produktionId: _produktionId }: Props) {
  const [latest, setLatest] = useState<Partial<Record<StageKey, any>>>({})
  const [loading, setLoading] = useState(true)
  const [autoLoading, setAutoLoading] = useState(false)
  const [editStage, setEditStage] = useState<StageKey | null>(null)
  const [editVal, setEditVal] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const load = () => {
    setLoading(true)
    api.getVorstopp(szeneId)
      .then(data => setLatest(data.latest_per_stage ?? {}))
      .catch(() => setLatest({}))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [szeneId])

  useEffect(() => {
    if (editStage) inputRef.current?.focus()
  }, [editStage])

  const startEdit = (key: StageKey) => {
    const existing = latest[key]
    setEditVal(existing ? String(existing.dauer_sekunden) : '')
    setEditStage(key)
  }

  const commitEdit = async (key: StageKey) => {
    const sek = parseInt(editVal, 10)
    setEditStage(null)
    if (!editVal.trim() || isNaN(sek) || sek < 0) return
    try {
      await api.addVorstopp(szeneId, { stage: key, dauer_sekunden: sek, methode: 'manuell' })
      load()
    } catch {}
  }

  const handleAuto = async () => {
    setAutoLoading(true)
    try {
      await api.autoVorstopp(szeneId)
      load()
    } catch {} finally {
      setAutoLoading(false)
    }
  }

  return (
    <div className="vorstopp-bar">
      <span className="vorstopp-label">Vorstopp</span>
      <div className="vorstopp-stages">
        {STAGES.map(({ key, label }) => {
          const entry = latest[key]
          const isEditing = editStage === key
          return (
            <div
              key={key}
              className={`vorstopp-cell${entry ? ' has-value' : ''}`}
              onClick={() => !isEditing && startEdit(key)}
              title={`${label} manuell setzen`}
            >
              <span className="vs-label">{label}</span>
              {isEditing ? (
                <input
                  ref={inputRef}
                  className="vs-input"
                  value={editVal}
                  placeholder="Sek."
                  onChange={e => setEditVal(e.target.value)}
                  onBlur={() => commitEdit(key)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitEdit(key)
                    if (e.key === 'Escape') setEditStage(null)
                  }}
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span className="vs-val">
                  {loading ? '…' : fmtSek(entry?.dauer_sekunden)}
                </span>
              )}
            </div>
          )
        })}
      </div>
      <button
        className="vorstopp-auto-btn"
        onClick={handleAuto}
        disabled={autoLoading}
        title="Vorstopp aus Seiten-Zahl berechnen"
      >
        <Zap size={11} />
        {autoLoading ? '…' : 'Auto'}
      </button>
    </div>
  )
}
