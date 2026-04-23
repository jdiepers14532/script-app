import { SCENES, ENV_COLORS, BREAKDOWN_CATEGORIES } from '../data/scenes'
import { Lock, ChevronLeft, ChevronRight, FileDown, Edit3, Sparkles } from 'lucide-react'

interface SceneEditorProps {
  sceneId: number
  panelMode?: 'both' | 'treatment' | 'script'
}

export default function SceneEditor({ sceneId, panelMode = 'both' }: SceneEditorProps) {
  const scene = SCENES.find(s => s.id === sceneId)
  const sceneIndex = SCENES.findIndex(s => s.id === sceneId)

  if (!scene) {
    return (
      <div style={{ padding: 32, color: 'var(--text-secondary)', textAlign: 'center', fontSize: 13 }}>
        Keine Szene ausgewählt
      </div>
    )
  }

  const envColor = ENV_COLORS[scene.env]
  const panelsClass = panelMode === 'script' ? 'panels mode-script'
    : panelMode === 'treatment' ? 'panels mode-treatment'
    : 'panels'

  const stripeColor = envColor.stripe

  return (
    <div className="detail">
      {/* Sticky head */}
      <div className="detail-head">
        {/* Scene title bar */}
        <div className="scene-title-bar">
          <button className="nav-arrow" title="Vorherige Szene" disabled={sceneIndex <= 0}>
            <ChevronLeft size={13} />
          </button>
          <button className="nav-arrow" title="Nächste Szene" disabled={sceneIndex >= SCENES.length - 1}>
            <ChevronRight size={13} />
          </button>
          <span className="scene-big">SZ {scene.nummer}</span>
          <span className="scene-title">{scene.motiv}</span>
          <span className="spacer" />
          {scene.locked && (
            <button className="btn lock held">
              <Lock size={12} />
              Gelockt
            </button>
          )}
          <button className="btn ghost">
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
            <span className="val">{scene.intExt}</span>
          </div>
          <div className="cell">
            <span className="lbl">Motiv</span>
            <span className="val">{scene.motiv.split('–')[0].trim()}</span>
          </div>
          <div className="cell">
            <span className="lbl">Tageszeit</span>
            <span className="val">{scene.tageszeit}</span>
          </div>
          <div className="cell">
            <span className="lbl">Stage</span>
            <span className="val">{scene.stageNr}</span>
          </div>
          <div className="cell">
            <span className="lbl">Seiten</span>
            <span className="val">{scene.seiten}</span>
          </div>
          <div className="cell">
            <span className="lbl">Dauer</span>
            <span className="val">{scene.dauer}</span>
          </div>
          <div className="cell">
            <span className="lbl">Einst.</span>
            <span className="val">—</span>
          </div>
        </div>
        {scene.synopsis && (
          <div className="desc-row">
            <div className="lbl">Treatment</div>
            <div className="desc">{scene.synopsis}</div>
          </div>
        )}
      </div>

      {/* Lock banner */}
      {scene.locked && (
        <div className="lock-banner mine">
          <div className="lb-avatar">JD</div>
          <div>
            <div className="lb-title">Gelockt von JD</div>
            <div className="lb-sub">Jan Diepers · seit 14:32 Uhr</div>
          </div>
          <span className="lb-spacer" />
          <span className="chip-ok">Mein Lock</span>
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
                {scene.synopsis ? (
                  <p>{scene.synopsis}</p>
                ) : (
                  <>
                    <p>Eva kann nicht schlafen. Die Nacht ist lang und die Gedanken lassen ihr keine Ruhe. Sie steht auf, schleicht sich in die Küche.</p>
                    <p>Jonas folgt ihr nach einer Weile. Er findet sie am Fenster stehend, den Blick auf die dunkle Straße gerichtet. Ein Gespräch beginnt, das alles verändern wird.</p>
                    <p>Die beiden reden zum ersten Mal seit Wochen wirklich miteinander. Alte Wunden öffnen sich, aber auch neue Möglichkeiten werden sichtbar.</p>
                  </>
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
                <div className="heading">INT. SCHLAFZIMMER EVA – NACHT</div>
                <div className="action">Eva liegt wach. Die Decke starrt sie an. Die digitale Uhr zeigt 3:17.</div>
                <div className="character">EVA</div>
                <div className="parenthetical">(flüsternd, für sich)</div>
                <div className="dialogue">Das kann doch nicht alles sein.</div>
                <div className="action">Sie steht auf. Schleicht aus dem Zimmer.</div>
                <div className="heading">INT. KÜCHE – DURCHGEHEND</div>
                <div className="action">Eva steht am Fenster, hält eine Tasse Tee. Die Straße ist leer.</div>
                <div className="action">Jonas erscheint in der Tür. Er hat sie gehört.</div>
                <div className="character">JONAS</div>
                <div className="dialogue">Schon wieder nicht schlafen können?</div>
                <div className="character">EVA</div>
                <div className="parenthetical">(dreht sich um)</div>
                <div className="dialogue">Ich muss dir etwas sagen.</div>
                <div className="transition">SCHNITT AUF:</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// suppress unused import
const _unused = BREAKDOWN_CATEGORIES
void _unused
