import { useState } from 'react'
import { SCENES, ENV_COLORS } from '../data/scenes'
import { Lock, Sun, Moon, Sunset } from 'lucide-react'

interface SceneEditorProps {
  sceneId: number
}

const DAYTIME_ICONS: Record<string, typeof Sun> = {
  TAG: Sun,
  ABEND: Sunset,
  NACHT: Moon,
}

export default function SceneEditor({ sceneId }: SceneEditorProps) {
  const [activeTab, setActiveTab] = useState<'treatment' | 'drehbuch'>('drehbuch')
  const scene = SCENES.find(s => s.id === sceneId)

  if (!scene) {
    return (
      <div style={{ padding: 32, color: 'var(--c-text-3)', textAlign: 'center', fontSize: 13 }}>
        Keine Szene ausgewählt
      </div>
    )
  }

  const envColor = ENV_COLORS[scene.env]

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
    }}>
      {/* Scene Header — einzeilig, minimal */}
      <div style={{
        padding: '0 20px',
        borderBottom: '1px solid var(--c-line)',
        background: 'var(--c-paper)',
        flexShrink: 0,
        height: 38,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span style={{
          fontSize: 12,
          color: 'var(--c-text-3)',
          fontFamily: 'var(--font-script)',
          fontWeight: 600,
        }}>
          SZ {scene.nummer}
        </span>
        <span style={{ fontSize: 12, color: 'var(--c-line)' }}>·</span>
        <span style={{ fontSize: 12, color: 'var(--c-text-2)', fontWeight: 500 }}>
          {scene.motiv}
        </span>
        <span style={{ fontSize: 12, color: 'var(--c-line)' }}>·</span>
        <span style={{ fontSize: 12, color: 'var(--c-text-3)', fontFamily: 'var(--font-script)' }}>
          {scene.intExt}
        </span>
        <span style={{ fontSize: 12, color: 'var(--c-line)' }}>·</span>
        <span style={{ fontSize: 12, color: 'var(--c-text-3)' }}>{scene.stageNr}</span>
        <span style={{ fontSize: 12, color: 'var(--c-line)' }}>·</span>
        <span style={{ fontSize: 12, color: 'var(--c-text-3)' }}>{scene.seiten} S.</span>

        {scene.locked && (
          <>
            <span style={{ fontSize: 12, color: 'var(--c-line)' }}>·</span>
            <Lock size={11} style={{ color: 'var(--c-muted)' }} />
          </>
        )}

        <div style={{ flex: 1 }} />

        {/* Tabs */}
        <button
          onClick={() => setActiveTab('treatment')}
          className="btn-text"
          style={{
            fontSize: 12,
            color: activeTab === 'treatment' ? 'var(--c-text)' : 'var(--c-text-3)',
            fontWeight: activeTab === 'treatment' ? 500 : 400,
            borderBottom: activeTab === 'treatment' ? '1px solid var(--c-ink)' : '1px solid transparent',
            padding: '4px 0',
          }}
        >
          Treatment
        </button>
        <button
          onClick={() => setActiveTab('drehbuch')}
          className="btn-text"
          style={{
            fontSize: 12,
            color: activeTab === 'drehbuch' ? 'var(--c-text)' : 'var(--c-text-3)',
            fontWeight: activeTab === 'drehbuch' ? 500 : 400,
            borderBottom: activeTab === 'drehbuch' ? '1px solid var(--c-ink)' : '1px solid transparent',
            padding: '4px 0',
          }}
        >
          Drehbuch
        </button>
      </div>

      {/* Content Area */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {activeTab === 'treatment' ? (
          <div style={{ padding: '20px 24px' }}>
            {scene.synopsis ? (
              <p style={{
                fontSize: 13,
                color: 'var(--c-text-2)',
                lineHeight: 1.8,
                fontStyle: 'italic',
                margin: 0,
              }}>
                {scene.synopsis}
              </p>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--c-text-3)', fontStyle: 'italic', margin: 0 }}>
                Kein Treatment vorhanden.
              </p>
            )}
          </div>
        ) : (
          <div style={{
            padding: '24px',
            display: 'flex',
            justifyContent: 'center',
          }}>
            <div style={{
              width: '100%',
              maxWidth: 580,
              background: 'var(--c-canvas)',
              border: '1px solid var(--c-line)',
              padding: '32px 48px',
              minHeight: 400,
            }}>
              {/* Scene slug */}
              <div style={{
                fontFamily: 'var(--font-script)',
                fontWeight: 700,
                textTransform: 'uppercase',
                fontSize: 13,
                marginBottom: 16,
                color: 'var(--c-text)',
              }}>
                {scene.intExt}. {scene.motiv} – {scene.tageszeit}
              </div>

              {scene.synopsis && (
                <p style={{
                  fontFamily: 'var(--font-script)',
                  fontSize: 13,
                  color: 'var(--c-text-2)',
                  lineHeight: 1.7,
                  marginBottom: 16,
                  margin: '0 0 16px 0',
                }}>
                  {scene.synopsis}
                </p>
              )}

              {/* Script skeleton */}
              {(['FIGUR A', 'Ich weiß es nicht.', 'FIGUR B', '(leise)', 'Du musst es herausfinden.'] as string[]).map((line, i) => (
                <div key={i} style={{
                  fontFamily: 'var(--font-script)',
                  fontSize: 13,
                  lineHeight: 1.7,
                  marginBottom: 4,
                  color: i === 3 ? 'var(--c-text-3)' : 'var(--c-text-2)',
                  textAlign: i === 0 || i === 2 ? 'center' : i === 3 ? 'center' : 'left',
                  fontStyle: i === 3 ? 'italic' : undefined,
                  marginLeft: i === 4 ? '15%' : undefined,
                  marginRight: i === 4 ? '15%' : undefined,
                  fontWeight: i === 0 || i === 2 ? 700 : 400,
                  textTransform: i === 0 || i === 2 ? 'uppercase' : undefined,
                }}>
                  {line}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
