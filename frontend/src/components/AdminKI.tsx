import { useState } from 'react'
import {
  Shield, Eye, EyeOff, RefreshCw, CheckCircle,
  FileText, Layers, Search, AlertTriangle, Info, ChevronDown
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
    color: '#000000',
    dsgvo: 'DSGVO-sicher · lokal',
    dsgvoColor: 'var(--c-success)',
    meta: 'Lokal · Llama 3.1 8B',
  },
  {
    id: 'mistral',
    label: 'Mistral AI',
    initials: 'M',
    color: '#FA520F',
    dsgvo: 'DSGVO-konform · EU',
    dsgvoColor: 'var(--c-info)',
    meta: 'mistral-medium-latest',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    initials: 'G',
    color: '#10A37F',
    dsgvo: 'Opt-In nötig · USA',
    dsgvoColor: 'var(--c-warn)',
    warn: true,
    meta: 'gpt-4o',
  },
  {
    id: 'claude',
    label: 'Claude',
    initials: 'C',
    color: '#CC785C',
    dsgvo: 'Opt-In nötig · USA',
    dsgvoColor: 'var(--c-warn)',
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

  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      <div style={{ padding: '24px 32px', maxWidth: 860, margin: '0 auto' }}>
        {/* DSGVO Info Box */}
        <div style={{
          display: 'flex',
          gap: 12,
          padding: '14px 16px',
          borderRadius: 'var(--r-lg)',
          background: '#EBF4FF',
          border: '1px solid #B3D4FF',
          marginBottom: 24,
        }}>
          <Shield size={18} style={{ color: 'var(--c-info)', flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-info)', marginBottom: 4 }}>
              Datenschutz-Hinweis zu KI-Funktionen
            </div>
            <p style={{ fontSize: 12, color: '#1a4a8a', lineHeight: 1.6, margin: 0 }}>
              Drehbuch-Inhalte sind produktionskritische, sensible Daten. Lokale Modelle (Ollama) verarbeiten
              alles auf dem Server ohne externe Datenübertragung. Cloud-Anbieter (Mistral EU) arbeiten
              DSGVO-konform mit Datenverarbeitungsvertrag. Für OpenAI und Claude ist eine explizite
              Opt-in-Einwilligung aller Beteiligten erforderlich.
            </p>
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
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--c-text-2)', marginBottom: 8 }}>
                  KI-Anbieter
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {PROVIDERS.map(p => (
                    <label
                      key={p.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 12px',
                        borderRadius: 'var(--r-md)',
                        border: `1px solid ${synopsisProvider === p.id ? 'var(--c-ink)' : 'var(--c-border)'}`,
                        background: synopsisProvider === p.id ? 'var(--c-surface)' : 'transparent',
                        cursor: 'pointer',
                        transition: 'all var(--t-fast)',
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
                      {/* Logo Chip */}
                      <div style={{
                        width: 24,
                        height: 24,
                        borderRadius: 6,
                        background: p.color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontSize: 11,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}>
                        {p.initials}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 500 }}>{p.label}</span>
                          <span style={{
                            fontSize: 10,
                            padding: '1px 6px',
                            borderRadius: 'var(--r-full)',
                            background: p.dsgvoColor === 'var(--c-success)' ? '#E8FAF0' :
                              p.dsgvoColor === 'var(--c-info)' ? '#EBF4FF' : '#FFF4E5',
                            color: p.dsgvoColor,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 3,
                          }}>
                            {p.warn && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--c-warn)', display: 'inline-block' }} />}
                            {p.dsgvo}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--c-text-4)', marginTop: 1 }}>{p.meta}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* API Key */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--c-text-2)', marginBottom: 8 }}>
                  API-Key
                </label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <input
                      className="input"
                      type={showApiKey ? 'text' : 'password'}
                      defaultValue="sk-mistral-••••••••••••••••••••••••"
                      style={{ paddingRight: 80 }}
                    />
                    <div style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: 4 }}>
                      <button
                        className="btn-icon"
                        style={{ width: 26, height: 26, border: 'none', background: 'transparent' }}
                        onClick={() => setShowApiKey(v => !v)}
                      >
                        {showApiKey ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                      <button
                        className="btn-icon"
                        style={{ width: 26, height: 26, border: 'none', background: 'transparent' }}
                        title="Neu generieren"
                      >
                        <RefreshCw size={13} />
                      </button>
                    </div>
                  </div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '0 10px',
                    borderRadius: 'var(--r-md)',
                    background: '#E8FAF0',
                    border: '1px solid #A8E6C0',
                    fontSize: 12,
                    fontWeight: 500,
                    color: 'var(--c-success)',
                    whiteSpace: 'nowrap',
                  }}>
                    <CheckCircle size={12} />
                    Verbunden
                  </div>
                </div>
              </div>

              {/* Automatisierung */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--c-text-2)', marginBottom: 8 }}>
                  Automatisierung
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={auto1}
                      onChange={e => setAuto1(e.target.checked)}
                      style={{ margin: 0 }}
                    />
                    <span style={{ fontSize: 13, color: 'var(--c-text-2)' }}>
                      Synopse automatisch bei Speichern aktualisieren
                    </span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={auto2}
                      onChange={e => setAuto2(e.target.checked)}
                      style={{ margin: 0 }}
                    />
                    <span style={{ fontSize: 13, color: 'var(--c-text-2)' }}>
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
          style={{ marginTop: 16 }}
        >
          {breakdownEnabled && (
            <>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--c-text-2)', marginBottom: 8 }}>
                  KI-Anbieter
                </label>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  borderRadius: 'var(--r-md)',
                  border: '1px solid var(--c-ink)',
                  background: 'var(--c-surface)',
                }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: 6,
                    background: '#000', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, flexShrink: 0,
                  }}>O</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>Ollama</div>
                    <div style={{ fontSize: 11, color: 'var(--c-text-4)' }}>Lokal · Llama 3.1 8B</div>
                  </div>
                  <span style={{
                    marginLeft: 'auto', fontSize: 10, padding: '2px 8px',
                    borderRadius: 'var(--r-full)', background: '#E8FAF0',
                    color: 'var(--c-success)', fontWeight: 500,
                  }}>
                    DSGVO-sicher · lokal
                  </span>
                </div>
              </div>

              {/* Pills */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--c-text-2)', marginBottom: 8 }}>
                  Erkenne
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {pills.map(pill => (
                    <button
                      key={pill.id}
                      onClick={() => togglePill(pill.id)}
                      style={{
                        padding: '4px 12px',
                        borderRadius: 'var(--r-full)',
                        border: `1px solid ${pill.checked ? 'var(--c-ink)' : 'var(--c-border)'}`,
                        background: pill.checked ? 'var(--c-ink)' : 'transparent',
                        color: pill.checked ? 'var(--c-paper)' : 'var(--c-text-3)',
                        fontSize: 12,
                        fontWeight: 500,
                        cursor: 'pointer',
                        transition: 'all var(--t-fast)',
                        fontFamily: 'var(--font-sans)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      {pill.checked && <span>✓</span>}
                      {pill.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </FunctionCardComponent>

        {/* Function Card: Ähnliche Szenen (disabled) */}
        <FunctionCardComponent
          icon={Search}
          title="Ähnliche Szenen finden"
          description="Vergleicht Szenen semantisch und schlägt ähnliche Sequenzen vor — nützlich für Konsistenz-Checks."
          enabled={similarEnabled}
          onToggle={() => setSimilarEnabled(v => !v)}
          style={{ marginTop: 16 }}
        >
          {/* No content when disabled */}
        </FunctionCardComponent>

        {/* Opt-In Box */}
        <div style={{
          display: 'flex',
          gap: 12,
          padding: '14px 16px',
          borderRadius: 'var(--r-lg)',
          background: '#FFF4E5',
          border: '1px solid #FFD9A0',
          marginTop: 24,
          marginBottom: 24,
        }}>
          <AlertTriangle size={18} style={{ color: 'var(--c-warn)', flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1 }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={optInChecked}
                onChange={e => setOptInChecked(e.target.checked)}
                style={{ margin: '2px 0 0 0', flexShrink: 0 }}
              />
              <span style={{ fontSize: 13, color: '#7a4800', lineHeight: 1.6 }}>
                Ich bestätige, dass alle relevanten Mitglieder der Produktion über den Einsatz von
                Cloud-KI-Diensten außerhalb der EU (OpenAI, Claude) informiert wurden und ihr Einverständnis
                gegeben haben. Diese Bestätigung ist Voraussetzung für die Aktivierung.
              </span>
            </label>
          </div>
        </div>

        {/* Cost Overview */}
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--c-text)' }}>
            Kostenübersicht (geschätzt / Monat)
          </h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 12,
          }}>
            <CostCard label="Ollama" value="0,00 €" note="Lokal" color="var(--c-success)" />
            <CostCard label="Mistral AI" value="~18,40 €" note="API-Nutzung" color="var(--c-info)" />
            <CostCard label="Gesamt" value="500,00 €" note="Alle Aktiven" color="var(--c-text)" bold />
          </div>
        </div>
      </div>

      {/* Sticky Save Bar */}
      <div style={{
        position: 'sticky',
        bottom: 0,
        borderTop: '1px solid var(--c-border)',
        background: 'var(--c-paper)',
        padding: '12px 32px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--c-warn)', display: 'inline-block' }} />
          <span style={{ fontSize: 13, color: 'var(--c-warn)', fontWeight: 500 }}>
            {unsavedCount} ungesicherte Änderungen
          </span>
        </div>
        <button className="btn">Zurücksetzen</button>
        <button className="btn btn-primary">Speichern</button>
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
  style,
}: {
  icon: typeof FileText
  title: string
  description: string
  enabled: boolean
  onToggle: () => void
  children?: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <div style={{
      borderRadius: 'var(--r-lg)',
      border: '1px solid var(--c-border)',
      background: 'var(--c-paper)',
      overflow: 'hidden',
      ...style,
    }}>
      {/* Card Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 16px',
        borderBottom: enabled && children ? '1px solid var(--c-border-l)' : 'none',
        background: enabled ? 'var(--c-paper)' : 'var(--c-surface)',
      }}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: 'var(--r-md)',
          background: enabled ? 'var(--c-ink)' : 'var(--c-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Icon size={16} color={enabled ? '#fff' : 'var(--c-text-4)'} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2, color: enabled ? 'var(--c-text)' : 'var(--c-text-3)' }}>
            {title}
          </div>
          <div style={{ fontSize: 12, color: 'var(--c-text-4)', lineHeight: 1.4 }}>
            {description}
          </div>
        </div>
        <label className="toggle" style={{ flexShrink: 0 }}>
          <input type="checkbox" checked={enabled} onChange={onToggle} />
          <span className="toggle-slider" />
        </label>
      </div>

      {/* Card Body */}
      {enabled && children && (
        <div style={{ padding: 16 }}>
          {children}
        </div>
      )}
    </div>
  )
}

function CostCard({ label, value, note, color, bold }: { label: string; value: string; note: string; color: string; bold?: boolean }) {
  return (
    <div style={{
      padding: '12px 14px',
      borderRadius: 'var(--r-lg)',
      border: '1px solid var(--c-border)',
      background: 'var(--c-surface-2)',
    }}>
      <div style={{ fontSize: 11, color: 'var(--c-text-4)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: bold ? 700 : 600, color, marginBottom: 2 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--c-text-4)' }}>{note}</div>
    </div>
  )
}
