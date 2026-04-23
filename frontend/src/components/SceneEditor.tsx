import { SCENES, ENV_COLORS } from '../data/scenes'
import { Lock, Clock, Users, Tag, MapPin, Sun, Moon, Sunset } from 'lucide-react'

interface SceneEditorProps {
  sceneId: number
}

const DAYTIME_ICONS: Record<string, typeof Sun> = {
  TAG: Sun,
  ABEND: Sunset,
  NACHT: Moon,
}

export default function SceneEditor({ sceneId }: SceneEditorProps) {
  const scene = SCENES.find(s => s.id === sceneId)

  if (!scene) {
    return (
      <div style={{ padding: 32, color: 'var(--c-text-4)', textAlign: 'center' }}>
        Keine Szene ausgewählt
      </div>
    )
  }

  const envColor = ENV_COLORS[scene.env]
  const DaytimeIcon = DAYTIME_ICONS[scene.tageszeit] || Sun

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
    }}>
      {/* Scene Meta Header */}
      <div style={{
        padding: '14px 20px 12px',
        borderBottom: '1px solid var(--c-border)',
        background: 'var(--c-paper)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          {/* Color Badge */}
          <div style={{
            width: 40,
            height: 40,
            borderRadius: 'var(--r-lg)',
            background: envColor.bg,
            border: `3px solid ${envColor.stripe}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <span style={{
              fontSize: 13,
              fontWeight: 700,
              color: envColor.textDark ? '#fff' : 'var(--c-text)',
              fontFamily: 'var(--font-mono)',
            }}>
              {scene.nummer}
            </span>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{
                fontSize: 10,
                fontWeight: 600,
                padding: '2px 6px',
                borderRadius: 'var(--r-sm)',
                background: 'var(--c-surface)',
                color: 'var(--c-text-3)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}>
                {scene.intExt}
              </span>
              <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--c-text)' }}>
                {scene.motiv}
              </h2>
              {scene.locked && (
                <Lock
                  size={13}
                  style={{ color: scene.contract ? 'var(--c-info)' : 'var(--c-text-4)' }}
                />
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <MetaChip icon={<DaytimeIcon size={12} />} label={scene.tageszeit} />
              <MetaChip icon={<MapPin size={12} />} label={scene.stageNr} />
              <MetaChip icon={<Tag size={12} />} label={`${scene.seiten} S.`} />
              <MetaChip icon={<Clock size={12} />} label={scene.dauer} />
              <MetaChip icon={<Users size={12} />} label="3 Rollen" />
            </div>
          </div>
        </div>
      </div>

      {/* Content Area: Treatment + Drehbuch side by side */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        flex: 1,
        overflow: 'hidden',
      }}>
        {/* Treatment Panel */}
        <div style={{
          borderRight: '1px solid var(--c-border)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '8px 16px',
            borderBottom: '1px solid var(--c-border-l)',
            background: 'var(--c-surface-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Treatment
            </span>
            <span className="stage-chip stage-treatment" style={{ fontSize: 10 }}>Treatment</span>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
            {scene.synopsis ? (
              <p style={{
                fontSize: 13,
                color: 'var(--c-text-2)',
                lineHeight: 1.7,
                fontStyle: 'italic',
              }}>
                {scene.synopsis}
              </p>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--c-text-4)', fontStyle: 'italic' }}>
                Kein Treatment vorhanden.
              </p>
            )}

            {/* Placeholder content to fill space */}
            <div style={{ marginTop: 16 }}>
              <div style={{
                height: 12,
                background: 'var(--c-border-l)',
                borderRadius: 4,
                marginBottom: 8,
                width: '85%',
              }} />
              <div style={{
                height: 12,
                background: 'var(--c-border-l)',
                borderRadius: 4,
                marginBottom: 8,
                width: '70%',
              }} />
              <div style={{
                height: 12,
                background: 'var(--c-border-l)',
                borderRadius: 4,
                marginBottom: 8,
                width: '90%',
              }} />
            </div>
          </div>
        </div>

        {/* Drehbuch Panel */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '8px 16px',
            borderBottom: '1px solid var(--c-border-l)',
            background: 'var(--c-surface-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Drehbuch
            </span>
            <span className="stage-chip stage-drehbuch" style={{ fontSize: 10 }}>Drehbuch</span>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
              <div style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: 12, marginBottom: 8, color: 'var(--c-text)' }}>
                INT. {scene.motiv} – {scene.tageszeit}
              </div>
              {scene.synopsis && (
                <p style={{ fontSize: 12, color: 'var(--c-text-2)', lineHeight: 1.6, marginBottom: 12 }}>
                  {scene.synopsis}
                </p>
              )}
              {/* Script skeleton */}
              {['FIGUR A', 'Ich weiß es nicht.', 'FIGUR B', '(leise)', 'Du musst es herausfinden.'].map((line, i) => (
                <div key={i} style={{
                  marginBottom: 4,
                  color: i === 3 ? 'var(--c-text-4)' : 'var(--c-text-2)',
                  textAlign: i === 0 || i === 2 ? 'center' : i === 3 ? 'center' : 'left',
                  fontStyle: i === 3 ? 'italic' : undefined,
                  marginLeft: i === 4 ? 40 : undefined,
                  marginRight: i === 4 ? 40 : undefined,
                  fontWeight: i === 0 || i === 2 ? 600 : 400,
                  textTransform: i === 0 || i === 2 ? 'uppercase' : undefined,
                  fontSize: i === 3 ? 11 : 12,
                }}>
                  {line}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MetaChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '3px 8px',
      borderRadius: 'var(--r-full)',
      background: 'var(--c-surface)',
      border: '1px solid var(--c-border)',
      fontSize: 11,
      color: 'var(--c-text-3)',
    }}>
      {icon}
      {label}
    </div>
  )
}
