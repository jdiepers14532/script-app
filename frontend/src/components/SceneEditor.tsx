import { useState, useEffect, useRef, useCallback } from 'react'
import { Lock, ChevronLeft, ChevronRight, FileDown, Edit3, Sparkles, MessageSquare } from 'lucide-react'
import { ENV_COLORS } from '../data/scenes'
import { api } from '../api/client'

interface SceneEditorProps {
  szeneId: number
  episodeId: number | null
  stageId: number | null
  panelMode?: 'both' | 'treatment' | 'script'
  onSzeneUpdated?: (updated: any) => void
}

// Map tageszeit/int_ext to env key for colors
function getEnvKey(scene: any): keyof typeof ENV_COLORS {
  const ie = (scene.int_ext ?? '').toLowerCase()
  const tz = (scene.tageszeit ?? 'TAG').toUpperCase()
  if (tz === 'NACHT') {
    if (ie === 'int') return 'n_i'
    if (ie === 'ext') return 'n_e'
    return 'n_ie'
  }
  if (tz === 'ABEND') return 'evening_i'
  if (ie === 'int') return 'd_i'
  if (ie === 'ext') return 'd_e'
  return 'd_ie'
}

export default function SceneEditor({ szeneId, episodeId, stageId, panelMode = 'both', onSzeneUpdated }: SceneEditorProps) {
  const [scene, setScene] = useState<any | null>(null)
  const [lock, setLock] = useState<any | null>(null)
  const [kommentareCount, setKommentareCount] = useState<number>(0)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load scene when szeneId changes
  useEffect(() => {
    setLoading(true)
    setError(null)
    api.getSzene(szeneId)
      .then(data => {
        setScene(data)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))

    // Load kommentare count
    api.getKommentare(szeneId)
      .then(list => setKommentareCount(Array.isArray(list) ? list.length : 0))
      .catch(() => setKommentareCount(0))
  }, [szeneId])

  // Load lock when episode changes
  useEffect(() => {
    if (!episodeId) { setLock(null); return }
    api.getLock(episodeId)
      .then(setLock)
      .catch(() => setLock(null))
  }, [episodeId])

  const handleContentChange = useCallback((content: any[]) => {
    if (!scene) return
    const updated = { ...scene, content }
    setScene(updated)
    onSzeneUpdated?.(updated)

    // Debounced auto-save
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSaving(true)
      setSaveMsg(null)
      try {
        const saved = await api.updateSzene(szeneId, { content })
        setScene(saved)
        onSzeneUpdated?.(saved)
        // Create auto-save version
        await api.createVersion(szeneId, {
          content_snapshot: content,
          change_summary: 'Auto-save',
        }).catch(() => {})
        setSaveMsg('Gespeichert')
      } catch {
        setSaveMsg('Fehler beim Speichern')
      } finally {
        setSaving(false)
        setTimeout(() => setSaveMsg(null), 2000)
      }
    }, 3000)
  }, [scene, szeneId, onSzeneUpdated])

  const handleRequestLock = async () => {
    if (!episodeId) return
    try {
      const newLock = await api.createLock(episodeId)
      setLock(newLock)
    } catch (e: any) {
      alert('Lock konnte nicht angefordert werden: ' + e.message)
    }
  }

  if (loading) {
    return (
      <div className="detail" style={{ padding: 32, color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center' }}>
        Lädt Szene…
      </div>
    )
  }

  if (error || !scene) {
    return (
      <div className="detail" style={{ padding: 32, color: 'var(--sw-danger)', fontSize: 13 }}>
        {error ?? 'Szene nicht gefunden'}
      </div>
    )
  }

  const envKey = getEnvKey(scene)
  const envColor = ENV_COLORS[envKey]
  const stripeColor = envColor.stripe
  const panelsClass = panelMode === 'script' ? 'panels mode-script'
    : panelMode === 'treatment' ? 'panels mode-treatment'
    : 'panels'

  const contentTextelemente: any[] = Array.isArray(scene.content) ? scene.content : []
  const sceneIsLocked = !!lock
  const lockIsOwn = lock && (lock.user_id === 'test-user' || lock.user_name === 'Ich')

  return (
    <div className="detail">
      {/* Sticky head */}
      <div className="detail-head">
        <div className="scene-title-bar">
          <button className="nav-arrow" title="Vorherige Szene" disabled>
            <ChevronLeft size={13} />
          </button>
          <button className="nav-arrow" title="Nächste Szene" disabled>
            <ChevronRight size={13} />
          </button>
          <span className="scene-big">SZ {scene.scene_nummer}</span>
          <span className="scene-title">{scene.ort_name}</span>
          <span className="spacer" />
          {saving && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Speichert…</span>}
          {saveMsg && !saving && <span style={{ fontSize: 11, color: saveMsg === 'Gespeichert' ? 'var(--sw-green)' : 'var(--sw-danger)' }}>{saveMsg}</span>}
          {kommentareCount > 0 && (
            <button className="btn ghost" title="Kommentare">
              <MessageSquare size={12} />
              {kommentareCount}
            </button>
          )}
          {sceneIsLocked ? (
            <button className="btn lock held">
              <Lock size={12} />
              Gelockt
            </button>
          ) : (
            <button className="btn ghost" onClick={handleRequestLock} title="Lock anfordern">
              <Lock size={12} />
              Locken
            </button>
          )}
          <button className="btn ghost" onClick={() => stageId && api.exportPdf(stageId).then(r => r.blob()).then(b => {
            const url = URL.createObjectURL(b)
            window.open(url, '_blank')
          })}>
            <FileDown size={12} />
            PDF
          </button>
          <button className="btn primary">
            <Edit3 size={12} />
            Bearbeiten
          </button>
        </div>
      </div>

      {/* Meta card */}
      <div className="meta-card" style={{ '--stripe': stripeColor } as React.CSSProperties}>
        <div className="metarow">
          <div className="cell">
            <span className="lbl">Int/Ext</span>
            <span className="val">{scene.int_ext}</span>
          </div>
          <div className="cell">
            <span className="lbl">Motiv</span>
            <span className="val">{scene.ort_name}</span>
          </div>
          <div className="cell">
            <span className="lbl">Tageszeit</span>
            <span className="val">{scene.tageszeit}</span>
          </div>
          {scene.dauer_min && (
            <div className="cell">
              <span className="lbl">Dauer</span>
              <span className="val">{scene.dauer_min} min</span>
            </div>
          )}
        </div>
        {scene.zusammenfassung && (
          <div className="desc-row">
            <div className="lbl">Zusammenfassung</div>
            <div className="desc">{scene.zusammenfassung}</div>
          </div>
        )}
      </div>

      {/* Lock banner */}
      {sceneIsLocked && (
        <div className={`lock-banner${lockIsOwn ? ' mine' : ''}`}>
          <div className="lb-avatar">{lock.user_id?.slice(0, 2).toUpperCase() ?? 'LK'}</div>
          <div>
            <div className="lb-title">Gelockt von {lock.user_name || lock.user_id}</div>
            <div className="lb-sub">{lock.lock_type === 'contract' ? 'Contract-Lock' : 'Exklusiv-Lock'}</div>
          </div>
          <span className="lb-spacer" />
          {lockIsOwn ? (
            <span className="chip-ok">Mein Lock</span>
          ) : (
            <button className="btn ghost" onClick={handleRequestLock} title="Lock übernehmen">Übernehmen</button>
          )}
        </div>
      )}

      {/* Panels */}
      <div className={panelsClass}>
        {panelMode !== 'script' && (
          <div className="panel">
            <div className="phead">
              <span className="title">Treatment</span>
              <span className="vchip draft">Entwurf</span>
              <span className="spacer" />
              <button className="btn-sm">
                <Edit3 size={11} />
                Bearbeiten
              </button>
            </div>
            <div className="pbody">
              <div className="treatment-body">
                {scene.zusammenfassung ? (
                  <p>{scene.zusammenfassung}</p>
                ) : (
                  <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Noch kein Treatment vorhanden.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {panelMode !== 'treatment' && (
          <div className="panel">
            <div className="phead">
              <span className="title">Drehbuch</span>
              <span className="vchip wip">In Arbeit</span>
              <span className="spacer" />
              <button className="btn-sm">
                <Sparkles size={11} />
                KI
              </button>
            </div>
            <div className="pbody">
              <div className="script-body">
                {contentTextelemente.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 12 }}>
                    Noch kein Inhalt vorhanden.
                  </div>
                ) : (
                  contentTextelemente.map((te: any, i: number) => (
                    <div
                      key={te.id ?? i}
                      className={te.type ?? 'action'}
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={e => {
                        const newText = e.currentTarget.textContent ?? ''
                        if (newText !== te.text) {
                          const newTextelemente = contentTextelemente.map((t: any, bi: number) =>
                            bi === i ? { ...t, text: newText } : t
                          )
                          handleContentChange(newTextelemente)
                        }
                      }}
                    >
                      {te.text}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
