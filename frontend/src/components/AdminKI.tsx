import { useState } from 'react'
import {
  Shield, Eye, EyeOff, RefreshCw, CheckCircle,
  FileText, Layers, Search, AlertTriangle
} from 'lucide-react'

interface Provider {
  id: string
  label: string
  initials: string
  color: string
  dsgvo: string
  dsgvoColor: string
  warn?: boolean
  meta: string
}

const PROVIDERS: Provider[] = [
  {
    id: 'ollama',
    label: 'Ollama',
    initials: 'O',
    color: '#111111',
    dsgvo: 'DSGVO-sicher · lokal',
    dsgvoColor: 'var(--sw-green)',
    meta: 'Lokal · Llama 3.1 8B',
  },
  {
    id: 'mistral',
    label: 'Mistral AI',
    initials: 'M',
    color: '#FA520F',
    dsgvo: 'DSGVO-konform · EU',
    dsgvoColor: 'var(--sw-info)',
    meta: 'mistral-medium-latest',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    initials: 'G',
    color: '#10A37F',
    dsgvo: 'Opt-In nötig · USA',
    dsgvoColor: 'var(--sw-warning-alt)',
    warn: true,
    meta: 'gpt-4o',
  },
  {
    id: 'claude',
    label: 'Claude',
    initials: 'C',
    color: '#CC785C',
    dsgvo: 'Opt-In nötig · USA',
    dsgvoColor: 'var(--sw-warning-alt)',
    warn: true,
    meta: 'claude-3-5-sonnet',
  },
]

const BREAKDOWN_PILLS = [
  { id: 'props', label: 'Props', checked: true },
  { id: 'kostuem', label: 'Kostüm', checked: true },
  { id: 'stunt', label: 'Stunt', checked: true },
  { id: 'vfx', label: 'VFX', checked: false },
  { id: 'sfx', label: 'Spezialeffekte', checked: false },
  { id: 'tiere', label: 'Tiere', checked: false },
  { id: 'fahrzeuge', label: 'Fahrzeuge', checked: true },
]

interface FunctionCard {
  id: string
  icon: typeof FileText
  title: string
  description: string
  enabled: boolean
  provider?: string
  apiConnected?: boolean
  breakdownPills?: boolean
}

export default function AdminKI() {
  const [showApiKey, setShowApiKey] = useState(false)
  const [unsavedCount] = useState(3)
  const [synopsisEnabled, setSynopsisEnabled] = useState(true)
  const [breakdownEnabled, setBreakdownEnabled] = useState(true)
  const [similarEnabled, setSimilarEnabled] = useState(false)
  const [synopsisProvider, setSynopsisProvider] = useState('mistral')
  const [optInChecked, setOptInChecked] = useState(false)
  const [auto1, setAuto1] = useState(true)
  const [auto2, setAuto2] = useState(false)
  const [pills, setPills] = useState(BREAKDOWN_PILLS)

  const togglePill = (id: string) => {
    setPills(p => p.map(pill => pill.id === id ? { ...pill, checked: !pill.checked } : pill))
  }

  // suppress unused warning
  const _f: FunctionCard | null = null
  void _f

  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      <div style={{ padding: '24px 32px', maxWidth: 760, margin: '0 auto' }}>

        {/* DSGVO Info Box */}
        <div style={{
          borderLeft: '3px solid var(--sw-info)',
          padding: '12px 16px',
          marginBottom: 28,
        }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <Shield size={16} style={{ color: 'var(--sw-info)', flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>
                Datenschutz-Hinweis zu KI-Funktionen
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                Drehbuch-Inhalte sind produktionskritische, sensible Daten. Lokale Modelle (Ollama) verarbeiten
                alles auf dem Server ohne externe Datenübertragung. Cloud-Anbieter (Mistral EU) arbeiten
                DSGVO-konform mit Datenverarbeitungsvertrag. Für OpenAI und Claude ist eine explizite
                Opt-in-Einwilligung aller Beteiligten erforderlich.
              </p>
            </div>
          </div>
        </div>

        {/* Function Card: Szenen-Synopse */}
        <FunctionCardComponent
          icon={FileText}
          title="Szenen-Synopse"
          description="Generiert automatisch eine kurze Inhaltsangabe pro Szene auf Basis des Drehbuch-Texts."
          enabled={synopsisEnabled}
          onToggle={() => setSynopsisEnabled(v => !v)}
        >
          {synopsisEnabled && (
            <>
              {/* Provider Selection */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  KI-Anbieter
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {PROVIDERS.map(p => (
                    <label
                      key={p.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 12px', cursor: 'pointer',
                        border: 'none',
                        borderLeft: `2px solid ${synopsisProvider === p.id ? 'var(--text-primary)' : 'transparent'}`,
                        background: synopsisProvider === p.id ? 'var(--bg-subtle)' : 'transparent',
                      }}
                    >
                      <input
                        type="radio"
                        name="synopsisProvider"
                        value={p.id}
                        checked={synopsisProvider === p.id}
                        onChange={() => setSynopsisProvider(p.id)}
                        style={{ margin: 0, flexShrink: 0 }}
                      />
                      <div style={{
                        width: 22, height: 22, borderRadius: 4,
                        background: p.color,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontSize: 10, fontWeight: 700, flexShrink: 0,
                      }}>
                        {p.initials}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 500 }}>{p.label}</span>
                          <span style={{
                            fontSize: 10, padding: '1px 6px',
                            borderRadius: 999,
                            background: 'transparent',
                            color: p.dsgvoColor,
                            border: `1px solid ${p.dsgvoColor}`,
                          }}>
                            {p.dsgvo}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{p.meta}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* API Key */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  API-Key
                </label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      defaultValue="sk-mistral-••••••••••••••••••••••••"
                      style={{
                        width: '100%', padding: '7px 70px 7px 10px',
                        border: '1px solid var(--border)', borderRadius: 6,
                        font: 'inherit', fontSize: 13, background: 'var(--input-bg)', color: 'var(--text-primary)',
                        outline: 'none',
                      }}
                    />
                    <div style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: 2 }}>
                      <button
                        style={{ width: 26, height: 26, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', display: 'grid', placeItems: 'center' }}
                        onClick={() => setShowApiKey(v => !v)}
                      >
                        {showApiKey ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                      <button
                        style={{ width: 26, height: 26, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', display: 'grid', placeItems: 'center' }}
                        title="Neu generieren"
                      >
                        <RefreshCw size={13} />
                      </button>
                    </div>
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '0 10px', fontSize: 12, fontWeight: 500,
                    color: 'var(--sw-green)', whiteSpace: 'nowrap',
                  }}>
                    <CheckCircle size={12} />
                    Verbunden
                  </div>
                </div>
              </div>

              {/* Automatisierung */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  Automatisierung
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={auto1} onChange={e => setAuto1(e.target.checked)} style={{ margin: 0 }} />
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      Synopse automatisch bei Speichern aktualisieren
                    </span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={auto2} onChange={e => setAuto2(e.target.checked)} style={{ margin: 0 }} />
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      Batch-Verarbeitung aller Szenen bei Versions-Milestone
                    </span>
                  </label>
                </div>
              </div>
            </>
          )}
        </FunctionCardComponent>

        {/* Function Card: Breakdown-Vorschläge */}
        <FunctionCardComponent
          icon={Layers}
          title="Breakdown-Vorschläge"
          description="Erkennt automatisch Props, Kostüme, Fahrzeuge und weitere Breakdown-Elemente im Drehbuchtext."
          enabled={breakdownEnabled}
          onToggle={() => setBreakdownEnabled(v => !v)}
        >
          {breakdownEnabled && (
            <>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  KI-Anbieter
                </label>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px',
                  borderLeft: '2px solid var(--text-primary)',
                  background: 'var(--bg-subtle)',
                }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: 4,
                    background: '#111', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700, flexShrink: 0,
                  }}>O</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>Ollama</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Lokal · Llama 3.1 8B</div>
                  </div>
                  <span style={{
                    marginLeft: 'auto', fontSize: 10, padding: '1px 6px',
                    borderRadius: 999,
                    border: '1px solid var(--sw-green)',
                    color: 'var(--sw-green)', fontWeight: 500,
                  }}>
                    DSGVO-sicher · lokal
                  </span>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  Erkenne
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {pills.map(pill => (
                    <button
                      key={pill.id}
                      onClick={() => togglePill(pill.id)}
                      style={{
                        padding: '4px 12px',
                        borderRadius: 999,
                        border: `1px solid ${pill.checked ? 'var(--text-primary)' : 'var(--border)'}`,
                        background: pill.checked ? 'var(--btn-primary-bg)' : 'transparent',
                        color: pill.checked ? 'var(--btn-primary-color)' : 'var(--text-secondary)',
                        fontSize: 12, fontWeight: 500,
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        fontFamily: 'var(--font-sans)',
                      }}
                    >
                      {pill.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </FunctionCardComponent>

        {/* Function Card: Ähnliche Szenen */}
        <FunctionCardComponent
          icon={Search}
          title="Ähnliche Szenen finden"
          description="Vergleicht Szenen semantisch und schlägt ähnliche Sequenzen vor — nützlich für Konsistenz-Checks."
          enabled={similarEnabled}
          onToggle={() => setSimilarEnabled(v => !v)}
        >
          {null}
        </FunctionCardComponent>

        {/* Opt-In Box */}
        <div style={{
          borderLeft: '3px solid var(--sw-warning-alt)',
          padding: '12px 16px',
          marginTop: 28,
          marginBottom: 28,
        }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <AlertTriangle size={16} style={{ color: 'var(--sw-warning-alt)', flexShrink: 0, marginTop: 1 }} />
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', flex: 1 }}>
              <input
                type="checkbox"
                checked={optInChecked}
                onChange={e => setOptInChecked(e.target.checked)}
                style={{ margin: '2px 0 0 0', flexShrink: 0 }}
              />
              <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Ich bestätige, dass alle relevanten Mitglieder der Produktion über den Einsatz von
                Cloud-KI-Diensten außerhalb der EU (OpenAI, Claude) informiert wurden und ihr Einverständnis
                gegeben haben.
              </span>
            </label>
          </div>
        </div>

        {/* Cost Overview */}
        <div style={{ marginBottom: 28 }}>
          <h3 style={{ fontSize: 12, fontWeight: 500, marginBottom: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Kostenübersicht (geschätzt / Monat)
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1, background: 'var(--border)' }}>
            <CostCard label="Ollama" value="0,00 €" note="Lokal" color="var(--sw-green)" />
            <CostCard label="Mistral AI" value="~18,40 €" note="API-Nutzung" color="var(--sw-info)" />
            <CostCard label="Gesamt" value="500,00 €" note="Alle Aktiven" color="var(--text-primary)" bold />
          </div>
        </div>
      </div>

      {/* Sticky Save Bar */}
      <div style={{
        position: 'sticky', bottom: 0,
        borderTop: '1px solid var(--border)',
        background: 'var(--bg-page)',
        padding: '10px 32px',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--sw-warning-alt)', display: 'inline-block' }} />
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {unsavedCount} ungesicherte Änderungen
          </span>
        </div>
        <button
          style={{ padding: '6px 12px', fontSize: 12, fontWeight: 500, border: 'none', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
        >
          Zurücksetzen
        </button>
        <button
          style={{ padding: '7px 16px', fontSize: 13, fontWeight: 500, border: 'none', borderRadius: 6, background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-color)', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
        >
          Speichern
        </button>
      </div>
    </div>
  )
}

function FunctionCardComponent({
  icon: Icon,
  title,
  description,
  enabled,
  onToggle,
  children,
}: {
  icon: typeof FileText
  title: string
  description: string
  enabled: boolean
  onToggle: () => void
  children?: React.ReactNode
}) {
  return (
    <div style={{
      borderBottom: '1px solid var(--border)',
      background: 'transparent',
      overflow: 'hidden',
      marginBottom: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0' }}>
        <div style={{ color: enabled ? 'var(--text-primary)' : 'var(--text-muted)', flexShrink: 0 }}>
          <Icon size={16} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2, color: enabled ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
            {title}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            {description}
          </div>
        </div>
        {/* Toggle */}
        <label style={{ position: 'relative', display: 'inline-block', width: 36, height: 20, flexShrink: 0 }}>
          <input type="checkbox" checked={enabled} onChange={onToggle} style={{ opacity: 0, width: 0, height: 0 }} />
          <span
            style={{
              position: 'absolute', cursor: 'pointer',
              top: 0, left: 0, right: 0, bottom: 0,
              background: enabled ? 'var(--text-primary)' : 'var(--border)',
              borderRadius: 999, transition: '0.15s',
            }}
          >
            <span style={{
              position: 'absolute', height: 14, width: 14,
              left: enabled ? 19 : 3, bottom: 3,
              background: 'white', borderRadius: '50%', transition: '0.15s',
            }} />
          </span>
        </label>
      </div>

      {enabled && children && (
        <div style={{ paddingBottom: 16 }}>
          {children}
        </div>
      )}
    </div>
  )
}

function CostCard({ label, value, note, color, bold }: { label: string; value: string; note: string; color: string; bold?: boolean }) {
  return (
    <div style={{ padding: '12px 14px', background: 'var(--bg-page)' }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: bold ? 600 : 500, color, marginBottom: 2 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{note}</div>
    </div>
  )
}
