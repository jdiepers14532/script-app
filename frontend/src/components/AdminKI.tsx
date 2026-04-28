import { useState, useEffect } from 'react'
import {
  Shield, Eye, EyeOff, AlertTriangle,
  FileText, Layers, Search, CheckCircle, Upload, Zap,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface KiProvider {
  provider: string
  api_key: string | null      // '***' if set, null if empty
  is_active: boolean
  dsgvo_level: string
  tokens_in: number
  tokens_out: number
  cost_eur: string | number
}

interface KiFunction {
  id: number
  funktion: string
  provider: string
  model_name: string | null
  enabled: boolean
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PROVIDER_META: Record<string, {
  label: string; initials: string; color: string
  dsgvo: string; dsgvoColor: string; needsKey: boolean; warn?: boolean
}> = {
  ollama:  { label: 'Ollama',     initials: 'O', color: '#111111', dsgvo: 'DSGVO-sicher · lokal',    dsgvoColor: '#00C853', needsKey: false },
  mistral: { label: 'Mistral AI', initials: 'M', color: '#FA520F', dsgvo: 'DSGVO-konform · EU',       dsgvoColor: '#007AFF', needsKey: true  },
  openai:  { label: 'OpenAI',     initials: 'G', color: '#10A37F', dsgvo: 'Opt-In nötig · USA',       dsgvoColor: '#FFCC00', needsKey: true, warn: true },
  claude:  { label: 'Claude',     initials: 'C', color: '#CC785C', dsgvo: 'Opt-In nötig · USA',       dsgvoColor: '#FFCC00', needsKey: true, warn: true },
}

const MODELS_BY_PROVIDER: Record<string, string[]> = {
  ollama:  ['llama3.2', 'llama3.1', 'llama3.1:8b', 'llama3.1:70b', 'mistral', 'codellama', 'phi3'],
  mistral: ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest', 'open-mistral-7b', 'open-mixtral-8x7b', 'mistral-ocr-latest'],
  openai:  ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  claude:  ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
}

const FUNKTION_META: Record<string, { label: string; description: string; Icon: typeof FileText }> = {
  scene_summary:       { label: 'Szenen-Synopse',       description: 'Kurze Inhaltsangabe pro Szene aus Drehbuchtext.',          Icon: FileText    },
  entity_detect:       { label: 'Entity-Erkennung',     description: 'Erkennt Charaktere, Orte und Props im Drehbuch.',           Icon: Search      },
  style_check:         { label: 'Stil-Analyse',         description: 'Prüft Drehbuchdialoge auf Stil und Tonalität.',             Icon: CheckCircle },
  synopsis:            { label: 'Episode-Synopse',      description: 'Generiert eine Episoden-Synopse aus allen Szenen.',         Icon: Layers      },
  consistency_check:   { label: 'Konsistenz-Prüfung',   description: 'Prüft Widersprüche in Handlung und Figurenkonstanz.',       Icon: AlertTriangle},
  rollenprofil_import: { label: 'Rollenprofil-Import',  description: 'Intelligenter PDF-Import via Mistral OCR + Parsing.',       Icon: Upload      },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

function formatCost(v: string | number): string {
  const n = typeof v === 'string' ? parseFloat(v) : v
  return `€${n.toFixed(2).replace('.', ',')}`
}

// ── ProviderCard ──────────────────────────────────────────────────────────────

function ProviderCard({
  provider,
  onUpdated,
}: {
  provider: KiProvider
  onUpdated: (updated: KiProvider) => void
}) {
  const meta = PROVIDER_META[provider.provider] ?? {
    label: provider.provider, initials: '?', color: '#666',
    dsgvo: '', dsgvoColor: '#666', needsKey: true,
  }
  const [isActive, setIsActive] = useState(provider.is_active)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')
  const [resetting, setResetting] = useState(false)

  const save = async (extra?: Record<string, any>) => {
    setSaving(true)
    setSavedMsg('')
    try {
      const body: Record<string, any> = { is_active: isActive, ...extra }
      if (apiKeyInput.trim()) body.api_key = apiKeyInput.trim()
      const resp = await fetch(`/api/admin/ki-providers/${provider.provider}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Fehler')
      onUpdated(data)
      setApiKeyInput('')
      setSavedMsg('Gespeichert')
      setTimeout(() => setSavedMsg(''), 2000)
    } catch (err: any) {
      setSavedMsg(`Fehler: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  const resetCosts = async () => {
    setResetting(true)
    try {
      const resp = await fetch(`/api/admin/ki-providers/${provider.provider}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset_costs: true }),
      })
      const data = await resp.json()
      if (resp.ok) onUpdated(data)
    } finally {
      setResetting(false)
    }
  }

  const hasKey = provider.api_key !== null

  return (
    <div style={{
      border: `1px solid ${isActive ? 'var(--border)' : 'var(--border)'}`,
      borderRadius: 10, overflow: 'hidden',
      opacity: isActive ? 1 : 0.65,
      transition: 'opacity 0.15s',
    }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', background: 'var(--bg-subtle)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 6, flexShrink: 0,
          background: meta.color, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700,
        }}>
          {meta.initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>{meta.label}</div>
          <span style={{
            fontSize: 10, padding: '1px 6px', borderRadius: 999,
            border: `1px solid ${meta.dsgvoColor}`, color: meta.dsgvoColor,
          }}>
            {meta.dsgvo}
          </span>
        </div>
        {/* Active toggle */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)', flexShrink: 0 }}>
          <ToggleSwitch
            checked={isActive}
            onChange={v => { setIsActive(v); save({ is_active: v }) }}
          />
          {isActive ? 'Aktiv' : 'Inaktiv'}
        </label>
      </div>

      {/* Body */}
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {meta.needsKey ? (
          <div>
            <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 5 }}>
              API-Key{' '}
              {hasKey
                ? <span style={{ color: '#00C853' }}>● gespeichert</span>
                : <span style={{ color: '#FF3B30' }}>● nicht gesetzt</span>}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKeyInput}
                onChange={e => setApiKeyInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && save()}
                placeholder={hasKey ? '•••••••• (leer = unverändert)' : 'sk-…'}
                style={{
                  flex: 1, fontSize: 12, padding: '6px 10px',
                  border: '1px solid var(--border)', borderRadius: 6,
                  background: 'var(--bg)', color: 'var(--text)', fontFamily: 'monospace',
                }}
              />
              <button onClick={() => setShowKey(s => !s)}
                style={{ padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Lokal auf dem Server — kein API-Key erforderlich
          </div>
        )}

        {/* Save button */}
        {meta.needsKey && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => save()}
              disabled={saving}
              style={{
                fontSize: 12, padding: '5px 14px', border: 'none', borderRadius: 6,
                background: 'var(--text)', color: 'var(--bg)', cursor: 'pointer', fontWeight: 500,
              }}>
              {saving ? 'Speichern…' : 'Key speichern'}
            </button>
            {savedMsg && (
              <span style={{ fontSize: 11, color: savedMsg.startsWith('Fehler') ? '#FF3B30' : '#00C853' }}>
                {savedMsg}
              </span>
            )}
          </div>
        )}

        {/* Usage stats */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            <span style={{ fontWeight: 500, color: 'var(--text)' }}>{formatTokens(provider.tokens_in)}</span> in
            {' · '}
            <span style={{ fontWeight: 500, color: 'var(--text)' }}>{formatTokens(provider.tokens_out)}</span> out
            <span style={{ marginLeft: 10, fontWeight: 600, color: 'var(--text)' }}>
              {formatCost(provider.cost_eur)}
            </span>
            {meta.needsKey && <span style={{ marginLeft: 4, color: 'var(--text-secondary)' }}>geschätzt</span>}
          </div>
          {(provider.tokens_in > 0 || provider.tokens_out > 0) && (
            <button
              onClick={resetCosts}
              disabled={resetting}
              style={{ fontSize: 10, padding: '2px 8px', border: '1px solid var(--border)', borderRadius: 4, background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)' }}>
              Zurücksetzen
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── FunctionRow ───────────────────────────────────────────────────────────────

function FunctionRow({
  func,
  providers,
  onUpdated,
}: {
  func: KiFunction
  providers: KiProvider[]
  onUpdated: (updated: KiFunction) => void
}) {
  const meta = FUNKTION_META[func.funktion] ?? { label: func.funktion, description: '', Icon: Zap }
  const { Icon } = meta
  const [saving, setSaving] = useState(false)

  const save = async (changes: Partial<KiFunction>) => {
    setSaving(true)
    try {
      const resp = await fetch(`/api/admin/ki-settings/${func.funktion}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      })
      const data = await resp.json()
      if (resp.ok) onUpdated({ ...func, ...data })
    } finally {
      setSaving(false)
    }
  }

  const currentProvider = providers.find(p => p.provider === func.provider)
  const providerMeta = PROVIDER_META[func.provider]
  const models = MODELS_BY_PROVIDER[func.provider] ?? []
  const providerMissingKey = providerMeta?.needsKey && !currentProvider?.api_key
  const providerInactive = currentProvider && !currentProvider.is_active

  const handleToggle = () => save({ enabled: !func.enabled })
  const handleProvider = (p: string) => {
    const defaultModel = MODELS_BY_PROVIDER[p]?.[0] ?? ''
    save({ provider: p, model_name: defaultModel })
  }
  const handleModel = (m: string) => save({ model_name: m })

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '36px 1fr auto auto auto',
      alignItems: 'center',
      gap: 12,
      padding: '10px 0',
      borderBottom: '1px solid var(--border)',
      opacity: func.enabled ? 1 : 0.55,
    }}>
      {/* Icon */}
      <div style={{ color: func.enabled ? 'var(--text)' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={15} />
      </div>

      {/* Title + description */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
          {meta.label}
          {saving && <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>•</span>}
          {(providerMissingKey || providerInactive) && func.enabled && (
            <span title={providerMissingKey ? 'Kein API-Key für diesen Anbieter' : 'Anbieter inaktiv'}
              style={{ fontSize: 10, color: '#FFCC00', cursor: 'help' }}>⚠</span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{meta.description}</div>
      </div>

      {/* Provider select */}
      <select
        value={func.provider}
        onChange={e => handleProvider(e.target.value)}
        style={{
          fontSize: 12, padding: '5px 8px',
          border: '1px solid var(--border)', borderRadius: 6,
          background: 'var(--bg)', color: 'var(--text)',
          cursor: 'pointer',
        }}>
        {Object.entries(PROVIDER_META).map(([id, m]) => (
          <option key={id} value={id}>{m.label}</option>
        ))}
      </select>

      {/* Model select */}
      <select
        value={func.model_name ?? ''}
        onChange={e => handleModel(e.target.value)}
        style={{
          fontSize: 12, padding: '5px 8px',
          border: '1px solid var(--border)', borderRadius: 6,
          background: 'var(--bg)', color: 'var(--text)',
          cursor: 'pointer', maxWidth: 200,
        }}>
        {models.map(m => (
          <option key={m} value={m}>{m}</option>
        ))}
        {func.model_name && !models.includes(func.model_name) && (
          <option value={func.model_name}>{func.model_name}</option>
        )}
      </select>

      {/* Toggle */}
      <ToggleSwitch checked={func.enabled} onChange={handleToggle} />
    </div>
  )
}

// ── ToggleSwitch ──────────────────────────────────────────────────────────────

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ position: 'relative', display: 'inline-block', width: 36, height: 20, flexShrink: 0, cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
      <span style={{
        position: 'absolute', inset: 0,
        background: checked ? 'var(--text)' : 'var(--border)',
        borderRadius: 999, transition: '0.15s',
      }}>
        <span style={{
          position: 'absolute', height: 14, width: 14,
          left: checked ? 19 : 3, bottom: 3,
          background: 'white', borderRadius: '50%', transition: '0.15s',
        }} />
      </span>
    </label>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminKI() {
  const [providers, setProviders] = useState<KiProvider[]>([])
  const [functions, setFunctions] = useState<KiFunction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [optInChecked, setOptInChecked] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/ki-providers', { credentials: 'include' }).then(r => r.ok ? r.json() : []),
      fetch('/api/admin/ki-settings',  { credentials: 'include' }).then(r => r.ok ? r.json() : []),
    ])
      .then(([provs, funcs]) => { setProviders(provs); setFunctions(funcs) })
      .catch(err => setError(String(err)))
      .finally(() => setLoading(false))
  }, [])

  const hasNonEuActive = providers.some(
    p => (p.provider === 'openai' || p.provider === 'claude') && p.is_active
  )

  if (loading) return <div style={{ padding: '32px', fontSize: 13, color: 'var(--text-secondary)' }}>Lade KI-Konfiguration…</div>
  if (error)   return <div style={{ padding: '32px', fontSize: 13, color: '#FF3B30' }}>Fehler: {error}</div>

  return (
    <div style={{ padding: '24px 32px', maxWidth: 800 }}>

      {/* DSGVO Info */}
      <div style={{ borderLeft: '3px solid #007AFF', padding: '10px 14px', marginBottom: 28, display: 'flex', gap: 10 }}>
        <Shield size={15} style={{ color: '#007AFF', flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
          <strong style={{ color: 'var(--text)' }}>Datenschutz-Hinweis:</strong> Drehbuchinhalte sind produktionskritische Daten.
          Ollama verarbeitet lokal ohne Datenübertragung. Mistral AI arbeitet DSGVO-konform mit EU-Servern und
          Datenverarbeitungsvertrag. OpenAI und Claude erfordern eine explizite Opt-in-Einwilligung.
        </p>
      </div>

      {/* Section: Provider */}
      <h3 style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: 12 }}>
        API-Anbieter
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 32 }}>
        {(['ollama', 'mistral', 'openai', 'claude'] as const).map(p => {
          const prov = providers.find(x => x.provider === p)
          if (!prov) return null
          return (
            <ProviderCard
              key={p}
              provider={prov}
              onUpdated={updated => setProviders(prev => prev.map(x => x.provider === p ? updated : x))}
            />
          )
        })}
      </div>

      {/* Section: Functions */}
      <h3 style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: 4 }}>
        KI-Funktionen
      </h3>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, marginTop: 0 }}>
        Änderungen werden sofort gespeichert. ⚠ = Anbieter hat keinen API-Key oder ist inaktiv.
      </p>
      <div style={{ marginBottom: 32 }}>
        {functions.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '16px 0' }}>Keine KI-Funktionen gefunden.</div>
        )}
        {functions.map(f => (
          <FunctionRow
            key={f.funktion}
            func={f}
            providers={providers}
            onUpdated={updated => setFunctions(prev => prev.map(x => x.funktion === f.funktion ? updated : x))}
          />
        ))}
      </div>

      {/* Cost Overview */}
      <h3 style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: 12 }}>
        Kostenübersicht (kumuliert, geschätzt)
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: 'var(--border)', marginBottom: 28, borderRadius: 8, overflow: 'hidden' }}>
        {providers.map(p => {
          const meta = PROVIDER_META[p.provider]
          return (
            <div key={p.provider} style={{ padding: '12px 14px', background: 'var(--bg)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: meta?.color ?? '#666' }} />
                {meta?.label ?? p.provider}
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>
                {formatCost(p.cost_eur)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                {formatTokens(p.tokens_in + p.tokens_out)} Token
              </div>
            </div>
          )
        })}
      </div>

      {/* Opt-In (only if non-EU active) */}
      {hasNonEuActive && (
        <div style={{ borderLeft: '3px solid #FFCC00', padding: '10px 14px', marginBottom: 24, display: 'flex', gap: 10 }}>
          <AlertTriangle size={15} style={{ color: '#FFCC00', flexShrink: 0, marginTop: 2 }} />
          <label style={{ display: 'flex', gap: 8, cursor: 'pointer', flex: 1 }}>
            <input
              type="checkbox"
              checked={optInChecked}
              onChange={e => setOptInChecked(e.target.checked)}
              style={{ margin: '2px 0 0 0', flexShrink: 0 }}
            />
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Ich bestätige, dass alle relevanten Produktionsmitglieder über den Einsatz von Cloud-KI-Diensten
              außerhalb der EU (OpenAI, Claude) informiert wurden und ihr Einverständnis gegeben haben.
            </span>
          </label>
        </div>
      )}
    </div>
  )
}
