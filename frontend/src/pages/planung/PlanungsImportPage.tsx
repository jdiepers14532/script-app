import { useState, useRef, useCallback } from 'react'
import {
  Upload, FileText, ChevronRight, Check, X, Loader2,
  Sparkles, Link2, Plus, AlertCircle, CheckCircle,
} from 'lucide-react'
import { api } from '../../api/client'
import { useSelectedProduction } from '../../contexts'

type Quelltyp = 'A' | 'B' | 'C'
type Step = 'upload' | 'preview' | 'done'

const QUELLTYP_INFO: Record<Quelltyp, { title: string; desc: string; color: string }> = {
  A: {
    title: 'Konzept (Typ A)',
    desc: 'Konzeptdokument: extrahiert Story-Stränge mit Kurzbeschreibungen und Figurennamen.',
    color: '#AF52DE',
  },
  B: {
    title: 'Future-Prosa (Typ B)',
    desc: 'Ausformuliertes Future-Dokument: extrahiert Prosatexte nach Strang und Blocknummer.',
    color: '#007AFF',
  },
  C: {
    title: 'Future-Raster (Typ C)',
    desc: 'Tabellarisches Raster: extrahiert Beat-Kurztexte nach Strang und Blocknummer.',
    color: '#FF9500',
  },
}

// ── Preview-Item Typen ────────────────────────────────────────────────────────

interface StrangItem {
  name: string
  kurzinhalt?: string
  typ?: string
  match_strang_id: string | null
  bestehender_strang_name?: string | null
  _accepted: boolean
}

interface BeatItem {
  strang_name: string
  strang_id: string | null
  block_nummer: number
  prosa_text?: string
  beat_text?: string
  _accepted: boolean
}

type PreviewItem = StrangItem | BeatItem

function isStrangItem(item: PreviewItem): item is StrangItem {
  return 'name' in item && !('block_nummer' in item)
}

// ── Datei-Drop Zone ───────────────────────────────────────────────────────────

function DropZone({
  file,
  onFile,
}: {
  file: File | null
  onFile: (f: File) => void
}) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) onFile(f)
  }, [onFile])

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      style={{
        border: `2px dashed ${dragging ? '#007AFF' : file ? '#00C853' : 'var(--border)'}`,
        borderRadius: 12, padding: '32px 24px', textAlign: 'center',
        cursor: 'pointer', transition: 'border-color 0.15s',
        background: dragging ? 'rgba(0,122,255,0.04)' : file ? 'rgba(0,200,83,0.04)' : 'var(--bg)',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.doc,.txt"
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }}
      />
      {file ? (
        <div>
          <CheckCircle size={32} style={{ color: '#00C853', marginBottom: 8 }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{file.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            {(file.size / 1024).toFixed(0)} KB — Klicken zum Ändern
          </div>
        </div>
      ) : (
        <div>
          <Upload size={32} style={{ color: 'var(--text-muted)', marginBottom: 8 }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
            PDF, DOCX oder TXT hier ablegen
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            oder klicken zum Auswählen (max. 20 MB)
          </div>
        </div>
      )}
    </div>
  )
}

// ── Strang-Preview-Card ───────────────────────────────────────────────────────

function StrangPreviewCard({
  item,
  index,
  onChange,
}: {
  item: StrangItem
  index: number
  onChange: (idx: number, updates: Partial<StrangItem>) => void
}) {
  return (
    <div style={{
      padding: '12px 16px',
      borderBottom: '1px solid var(--border)',
      borderLeft: `3px solid ${item._accepted ? '#00C853' : item.match_strang_id ? '#007AFF' : '#AF52DE'}`,
      opacity: item._accepted ? 1 : 0.6,
      transition: 'opacity 0.15s',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              {item.name}
            </span>
            {item.match_strang_id ? (
              <span style={{
                padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                background: 'rgba(0,122,255,0.1)', color: '#007AFF',
                display: 'flex', alignItems: 'center', gap: 3,
              }}>
                <Link2 size={9} /> Fortführung
              </span>
            ) : (
              <span style={{
                padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                background: 'rgba(175,82,222,0.1)', color: '#AF52DE',
                display: 'flex', alignItems: 'center', gap: 3,
              }}>
                <Plus size={9} /> Neu
              </span>
            )}
          </div>
          {item.kurzinhalt && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.4 }}>
              {item.kurzinhalt}
            </div>
          )}
          {item.bestehender_strang_name && (
            <div style={{ fontSize: 11, color: '#007AFF', marginTop: 2 }}>
              → {item.bestehender_strang_name}
            </div>
          )}
        </div>
        <button
          onClick={() => onChange(index, { _accepted: !item._accepted })}
          style={{
            width: 30, height: 30, borderRadius: 6, border: 'none', flexShrink: 0,
            background: item._accepted ? '#00C853' : 'var(--bg)',
            color: item._accepted ? '#fff' : '#00C853',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: item._accepted ? 'none' : '0 0 0 1px #00C853 inset',
          }}
        >
          <Check size={14} />
        </button>
      </div>
    </div>
  )
}

// ── Beat-Preview-Card ─────────────────────────────────────────────────────────

function BeatPreviewCard({
  item,
  index,
  quelltyp,
  onChange,
}: {
  item: BeatItem
  index: number
  quelltyp: 'B' | 'C'
  onChange: (idx: number, updates: Partial<BeatItem>) => void
}) {
  const textKey = quelltyp === 'B' ? 'prosa_text' : 'beat_text'
  const text = quelltyp === 'B' ? item.prosa_text : item.beat_text

  return (
    <div style={{
      padding: '12px 16px',
      borderBottom: '1px solid var(--border)',
      borderLeft: `3px solid ${item._accepted ? '#00C853' : item.strang_id ? '#007AFF' : 'var(--border)'}`,
      opacity: item._accepted ? 1 : 0.65,
      transition: 'opacity 0.15s',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
              Block {item.block_nummer}
            </span>
            <span style={{
              fontSize: 11, color: item.strang_id ? '#007AFF' : '#FF3B30',
              display: 'flex', alignItems: 'center', gap: 3,
            }}>
              {item.strang_id ? <Link2 size={9} /> : <AlertCircle size={9} />}
              {item.strang_name}
              {!item.strang_id && ' (nicht zugeordnet)'}
            </span>
          </div>
          <textarea
            value={text || ''}
            onChange={e => onChange(index, { [textKey]: e.target.value } as any)}
            rows={quelltyp === 'B' ? 3 : 2}
            style={{
              width: '100%', padding: '6px 9px', borderRadius: 6,
              border: '1px solid var(--border)', background: 'var(--bg)',
              fontSize: 12, color: 'var(--text-primary)', resize: 'vertical',
              fontFamily: 'inherit', boxSizing: 'border-box',
            }}
          />
        </div>
        <button
          onClick={() => onChange(index, { _accepted: !item._accepted })}
          disabled={!item.strang_id}
          title={!item.strang_id ? 'Kein passender Strang gefunden' : ''}
          style={{
            width: 30, height: 30, borderRadius: 6, border: 'none', flexShrink: 0,
            background: item._accepted ? '#00C853' : !item.strang_id ? 'var(--border)' : 'var(--bg)',
            color: item._accepted ? '#fff' : !item.strang_id ? 'var(--text-muted)' : '#00C853',
            cursor: !item.strang_id ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: item._accepted || !item.strang_id ? 'none' : '0 0 0 1px #00C853 inset',
          }}
        >
          <Check size={14} />
        </button>
      </div>
    </div>
  )
}

// ── Hauptseite ────────────────────────────────────────────────────────────────

export default function PlanungsImportPage() {
  const { selectedProduction } = useSelectedProduction()
  const [step, setStep] = useState<Step>('upload')
  const [quelltyp, setQuelltyp] = useState<Quelltyp>('A')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  // Preview state
  const [items, setItems] = useState<PreviewItem[]>([])
  const [providerInfo, setProviderInfo] = useState({ provider: '', model: '', text_preview: '' })
  const [charaktere, setCharaktere] = useState<{ name: string }[]>([])

  // Done state
  const [doneResult, setDoneResult] = useState<any>(null)

  function updateItem(idx: number, updates: Partial<PreviewItem>) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...updates } as PreviewItem : it))
  }

  async function handlePreview() {
    if (!file || !selectedProduction) return
    setLoading(true)
    setErr('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('quelltyp', quelltyp)
      fd.append('produktion_id', selectedProduction.id)

      const result = await api.konzeptImportPreview(fd)
      if (result.error) throw new Error(result.error)

      setProviderInfo({
        provider: result.provider || '',
        model: result.model || '',
        text_preview: result.text_preview || '',
      })

      if (quelltyp === 'A') {
        const straenge: StrangItem[] = (result.straenge || []).map((s: any) => ({
          ...s,
          _accepted: true,
        }))
        setItems(straenge)
        setCharaktere(result.charaktere || [])
      } else {
        const beatItems: BeatItem[] = (result.items || []).map((it: any) => ({
          ...it,
          _accepted: !!it.strang_id,
        }))
        setItems(beatItems)
        setCharaktere([])
      }

      setStep('preview')
    } catch (e: any) {
      setErr(e.message || 'Fehler beim Extrahieren')
    } finally {
      setLoading(false)
    }
  }

  async function handleCommit() {
    if (!selectedProduction) return
    setLoading(true)
    setErr('')
    try {
      const accepted = items.filter(it => it._accepted)

      let commitData: any[]
      if (quelltyp === 'A') {
        commitData = (accepted as StrangItem[]).map(s => ({
          name: s.name,
          kurzinhalt: s.kurzinhalt,
          typ: s.typ,
          match_strang_id: s.match_strang_id,
          charaktere: charaktere,
        }))
      } else {
        commitData = (accepted as BeatItem[]).map(it => ({
          strang_id: it.strang_id,
          strang_name: it.strang_name,
          block_nummer: it.block_nummer,
          prosa_text: it.prosa_text,
          beat_text: it.beat_text,
        }))
      }

      const result = await api.konzeptImportCommit({
        quelltyp,
        produktion_id: selectedProduction.id,
        data: commitData,
        auto_version: true,
      })

      setDoneResult(result)
      setStep('done')
    } catch (e: any) {
      setErr(e.message || 'Fehler beim Importieren')
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    setStep('upload')
    setFile(null)
    setItems([])
    setCharaktere([])
    setDoneResult(null)
    setErr('')
  }

  if (!selectedProduction) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
        Bitte eine Produktion auswählen.
      </div>
    )
  }

  const acceptedCount = items.filter(it => it._accepted).length
  const totalCount = items.length

  // ── Step: Done ──────────────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <div style={{ maxWidth: 480, textAlign: 'center' }}>
          <CheckCircle size={48} style={{ color: '#00C853', marginBottom: 16 }} />
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Import abgeschlossen</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 24 }}>
            {doneResult?.created > 0 && <div>{doneResult.created} Einträge neu angelegt</div>}
            {doneResult?.updated > 0 && <div>{doneResult.updated} Einträge aktualisiert</div>}
            {doneResult?.skipped > 0 && <div>{doneResult.skipped} Einträge übersprungen</div>}
            {doneResult?.version_id && (
              <div style={{ marginTop: 8, color: '#00C853' }}>
                Automatischer Snapshot angelegt.
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button
              onClick={reset}
              style={{
                padding: '9px 20px', borderRadius: 8, border: '1px solid var(--border)',
                background: 'transparent', cursor: 'pointer', fontSize: 14,
              }}
            >
              Weiteren Import
            </button>
            <button
              onClick={() => window.location.hash = '#/planung/board'}
              style={{
                padding: '9px 20px', borderRadius: 8, border: 'none',
                background: '#000', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 500,
              }}
            >
              Zum Future-Board
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Step: Preview ───────────────────────────────────────────────────────────
  if (step === 'preview') {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{
          padding: '12px 24px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
          background: 'var(--bg-surface)',
        }}>
          <Sparkles size={16} style={{ color: '#007AFF' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              KI-Extraktion: {QUELLTYP_INFO[quelltyp].title}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
              {providerInfo.provider} · {providerInfo.model} · {totalCount} Einträge extrahiert
            </div>
          </div>

          {/* Fortschritt */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#00C853' }}>
              {acceptedCount} / {totalCount} angenommen
            </span>
            <div style={{ width: 80, height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 2, background: '#00C853',
                width: `${totalCount > 0 ? (acceptedCount / totalCount) * 100 : 0}%`,
                transition: 'width 0.2s',
              }} />
            </div>
          </div>

          {/* Alle annehmen/ablehnen */}
          <button
            onClick={() => setItems(prev => prev.map(it => ({ ...it, _accepted: true })))}
            style={{
              padding: '5px 12px', borderRadius: 6, fontSize: 12,
              border: '1px solid var(--border)', background: 'var(--bg)',
              cursor: 'pointer', color: 'var(--text-primary)',
            }}
          >
            Alle annehmen
          </button>
        </div>

        {/* Item-Liste */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {quelltyp === 'A' ? (
            <>
              {(items as StrangItem[]).map((item, idx) => (
                <StrangPreviewCard key={idx} item={item} index={idx} onChange={updateItem} />
              ))}
              {charaktere.length > 0 && (
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                    Erkannte Figuren ({charaktere.length}) — werden bei Commit angelegt falls noch nicht vorhanden:
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {charaktere.map((c, i) => (
                      <span key={i} style={{
                        padding: '2px 8px', borderRadius: 4, fontSize: 11,
                        background: 'var(--bg)', border: '1px solid var(--border)',
                        color: 'var(--text-muted)',
                      }}>
                        {c.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            (items as BeatItem[]).map((item, idx) => (
              <BeatPreviewCard
                key={idx}
                item={item}
                index={idx}
                quelltyp={quelltyp as 'B' | 'C'}
                onChange={updateItem}
              />
            ))
          )}

          {items.length === 0 && (
            <div style={{
              padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13,
            }}>
              <AlertCircle size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
              <div>Keine Einträge extrahiert. Prüfe, ob das Dokument den richtigen Typ hat.</div>
            </div>
          )}
        </div>

        {/* Footer */}
        {err && (
          <div style={{ padding: '8px 24px', background: 'rgba(255,59,48,0.08)', borderTop: '1px solid rgba(255,59,48,0.2)', fontSize: 12, color: '#FF3B30' }}>
            {err}
          </div>
        )}
        <div style={{
          padding: '12px 24px', borderTop: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0, background: 'var(--bg-surface)',
        }}>
          <button
            onClick={reset}
            style={{
              padding: '7px 16px', borderRadius: 6, border: '1px solid var(--border)',
              background: 'transparent', cursor: 'pointer', fontSize: 13,
            }}
          >
            Zurück
          </button>
          <button
            onClick={handleCommit}
            disabled={loading || acceptedCount === 0}
            style={{
              padding: '7px 20px', borderRadius: 6, border: 'none',
              background: acceptedCount === 0 ? 'var(--border)' : '#000',
              color: acceptedCount === 0 ? 'var(--text-muted)' : '#fff',
              cursor: acceptedCount === 0 || loading ? 'default' : 'pointer',
              fontSize: 13, fontWeight: 500,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {loading && <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} />}
            {acceptedCount} Einträge importieren
          </button>
        </div>
      </div>
    )
  }

  // ── Step: Upload ────────────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '32px 40px' }}>
      <div style={{ maxWidth: 600 }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Dokument-Import</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Importiere ein Konzept- oder Future-Dokument. Die KI extrahiert die relevanten Daten,
            du prüfst im nächsten Schritt jeden Eintrag vor dem Speichern.
          </div>
        </div>

        {/* Quelltyp-Auswahl */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 8 }}>
            Dokumenttyp
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(['A', 'B', 'C'] as Quelltyp[]).map(qt => {
              const info = QUELLTYP_INFO[qt]
              const active = quelltyp === qt
              return (
                <div
                  key={qt}
                  onClick={() => setQuelltyp(qt)}
                  style={{
                    padding: '12px 16px', borderRadius: 10, cursor: 'pointer',
                    border: `2px solid ${active ? info.color : 'var(--border)'}`,
                    background: active ? `${info.color}08` : 'var(--bg-surface)',
                    transition: 'border-color 0.15s, background 0.15s',
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                  }}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                    background: active ? info.color : 'var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700, color: '#fff',
                  }}>
                    {qt}
                  </div>
                  <div>
                    <div style={{
                      fontSize: 13, fontWeight: 600,
                      color: active ? info.color : 'var(--text-primary)',
                    }}>
                      {info.title}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.4 }}>
                      {info.desc}
                    </div>
                  </div>
                  {active && (
                    <ChevronRight size={14} style={{ color: info.color, marginLeft: 'auto', flexShrink: 0, marginTop: 6 }} />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* File-Upload */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 8 }}>
            Datei
          </div>
          <DropZone file={file} onFile={setFile} />
        </div>

        {err && (
          <div style={{
            padding: '10px 14px', borderRadius: 8, marginBottom: 16,
            background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.2)',
            fontSize: 12, color: '#FF3B30', display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <AlertCircle size={14} />
            {err}
          </div>
        )}

        <button
          onClick={handlePreview}
          disabled={!file || loading}
          style={{
            width: '100%', padding: '11px', borderRadius: 10, border: 'none',
            background: !file || loading ? 'var(--border)' : '#000',
            color: !file || loading ? 'var(--text-muted)' : '#fff',
            cursor: !file || loading ? 'default' : 'pointer',
            fontSize: 14, fontWeight: 500,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {loading
            ? <><Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} /> Extrahiere…</>
            : <><FileText size={16} /> Dokument analysieren</>
          }
        </button>
      </div>
    </div>
  )
}
