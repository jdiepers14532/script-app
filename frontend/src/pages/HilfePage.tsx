import { lazy, Suspense, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import AppShell from '../components/AppShell'
import { C } from './hilfe/_shared'

// ── Lazy-geladene Tab-Inhalte (Code Splitting) ────────────────────────────────
const ErsteSchritteTab     = lazy(() => import('./hilfe/ErsteSchritteTab'))
const PwaInstallationTab   = lazy(() => import('./hilfe/PwaInstallationTab'))
const OfflineTab           = lazy(() => import('./hilfe/OfflineTab'))
const SzenenEditorTab      = lazy(() => import('./hilfe/SzenenEditorTab'))
const NummerierungTab      = lazy(() => import('./hilfe/NummerierungTab'))
const DokumentEditorHilfeTab = lazy(() => import('./hilfe/DokumentEditorHilfeTab'))
const KommentareTab        = lazy(() => import('./hilfe/KommentareTab'))
const SzenenFassungenTab   = lazy(() => import('./hilfe/SzenenFassungenTab'))
const RechtschreibungTab   = lazy(() => import('./hilfe/RechtschreibungTab'))
const ImportKomparsenTab   = lazy(() => import('./hilfe/ImportKomparsenTab'))
const SuchenErsetzenTab    = lazy(() => import('./hilfe/SuchenErsetzenTab'))
const StoryStaengeTab      = lazy(() => import('./hilfe/StoryStaengeTab'))
const SonderszenentTab     = lazy(() => import('./hilfe/SonderszenentTab'))
const WerkstufenLabelsTab  = lazy(() => import('./hilfe/WerkstufenLabelsTab'))
const VorlagenOcrTab       = lazy(() => import('./hilfe/VorlagenOcrTab'))
const ExportKopfzeilen     = lazy(() => import('./hilfe/ExportKopfzeilen'))
const DatensicherheitUserTab = lazy(() => import('./hilfe/DatensicherheitUserTab'))
const TeamWorkTab          = lazy(() => import('./hilfe/TeamWorkTab'))
const AutorenplanHilfeTab  = lazy(() => import('./hilfe/AutorenplanHilfeTab'))
const SearchResultsView    = lazy(() => import('./hilfe/SearchResultsView'))
// Admin-only
const DatenmodellTab       = lazy(() => import('./hilfe/DatenmodellTab'))
const DatensicherheitTab   = lazy(() => import('./hilfe/DatensicherheitTab'))
const PotenzielleFehldrTab = lazy(() => import('./hilfe/PotenzielleFehldrTab'))

// ── Lade-Platzhalter ──────────────────────────────────────────────────────────
function TabSpinner() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: 200, color: C.muted, fontSize: 13,
    }}>
      Lädt…
    </div>
  )
}

// ── Navigation ────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: 'erste-schritte',       label: 'Erste Schritte',            icon: '🚀',
    keywords: 'start anfang einführung schnellstart übersicht willkommen neu' },
  { id: 'pwa-installation',     label: 'App installieren',          icon: '📲',
    keywords: 'pwa installieren install browser chrome safari ios android desktop homescreen icon update deinstall' },
  { id: 'offline',              label: 'Offline-Modus',             icon: '📶',
    keywords: 'offline sync netzwerk verbindung queue warteschlange reconnect datenverlust autosave kein internet' },
  { id: 'szenen-editor',        label: 'Szenenübersicht & Editor',  icon: '🖊️',
    keywords: 'szene editor szenenleiste liste drehbuch schreiben bearbeiten scrollen shortcut layout arbeitsfenster' },
  { id: 'nummerierung',         label: 'Szenen & Nummerierung',     icon: '🔢',
    keywords: 'nummer nummerierung szene a b c suffix wga lock vergabe automatisch manuell' },
  { id: 'dokument-editor',      label: 'Dokument-Editor',           icon: '📝',
    keywords: 'dokument editor treatment synopsis recap precap titelseite notiz tiptap rich text' },
  { id: 'kommentare',           label: 'Kommentare',                icon: '💬',
    keywords: 'kommentar kommentieren messenger antwort annotation badge ungelesen' },
  { id: 'szenen-fassungen',     label: 'Szenen & Fassungen',        icon: '🔀',
    keywords: 'fassung version werkstufe stage status drehbuch vorbereitung dreh schnitt kopieren' },
  { id: 'rechtschreibung',      label: 'Rechtschreibung',           icon: '✍️',
    keywords: 'rechtschreibung spellcheck sprache deutsch englisch duden korrektur unterstrichen rot' },
  { id: 'import-komparsen',     label: 'Import & Komparsen',        icon: '🎬',
    keywords: 'import komparsen fountain fdx final draft hochladen upload csv excel mapping' },
  { id: 'suchen-ersetzen',      label: 'Suchen & Ersetzen',         icon: '🔍',
    keywords: 'suchen ersetzen replace find regex gross klein wort ganze phrase ctrl h' },
  { id: 'story-straenge',       label: 'Story-Stränge',             icon: '🧶',
    keywords: 'story strang arc handlung plot linie radar pacing beat farbe' },
  { id: 'sonderszenen',         label: 'Sonderszenen',              icon: '🎭',
    keywords: 'sonderszene stockshot wechselschnitt flashback rückblende stimmung archiv' },
  { id: 'werkstufen-labels',    label: 'Werkstufen & Labels',       icon: '🏷️',
    keywords: 'werkstufe label status entwurf freigegeben gesperrt team work kollaboration' },
  { id: 'vorlagen-ocr',         label: 'Vorlagen & OCR',            icon: '📄',
    keywords: 'vorlage template ocr mistral erkennen scan pdf einscannen' },
  { id: 'export-kopfzeilen',    label: 'Export & Kopf-/Fußzeilen',  icon: '📤',
    keywords: 'export pdf fountain fdx kopfzeile fusszeile wasserzeichen drucken herunterladen' },
  { id: 'datensicherheit-user', label: 'Datensicherheit',           icon: '🛡️',
    keywords: 'datensicherheit backup autosave sync sicherheit verlust daten' },
  { id: 'team-work',            label: 'Team-Work',                 icon: '👥',
    keywords: 'team work gruppe kollaboration autoren privat modus sichtbarkeit session' },
  { id: 'autorenplan',          label: 'Autorenplan',               icon: '📅',
    keywords: 'autorenplan autor plan kalender woche einsatz future terminplanung' },
  // Admin-only
  { id: 'datenmodell',          label: 'Datenmodell',               icon: '🗄️', adminOnly: true,
    keywords: 'datenbank tabelle schema migration sql postgresql technisch architektur' },
  { id: 'datensicherheit',      label: 'Datensicherheit (Technik)', icon: '🔒', adminOnly: true,
    keywords: 'technisch architektur backend server postgresql yjs websocket hocuspocus' },
  { id: 'potenzielle-fehler',   label: 'Potenzielle Fehler',        icon: '⚠️', adminOnly: true,
    keywords: 'fehler error problem bug service worker sw session login 401 cache offline loop backend server 502 503 devtools update reload cookie auth' },
]

// ── Haupt-Komponente ──────────────────────────────────────────────────────────
function HilfePage() {
  const [activeSection, setActiveSection] = useState<string>('erste-schritte')
  const [isAdmin, setIsAdmin] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    fetch('/api/me/whoami', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        const role = d?.rolle ?? d?.role ?? ''
        setIsAdmin(['superadmin', 'admin', 'geschaeftsfuehrung', 'herstellungsleitung'].includes(role))
      })
      .catch(() => {})
  }, [])

  const sq = searchQuery.trim().toLowerCase()
  const isSearching = sq.length >= 2
  const searchResults = isSearching
    ? NAV_ITEMS.filter(item =>
        (!('adminOnly' in item && item.adminOnly) || isAdmin) &&
        (item.label + ' ' + item.keywords).toLowerCase().includes(sq)
      )
    : []

  // Arrow key navigation (deaktiviert beim Suchen)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) return
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return
      if (isSearching) return
      const visibleItems = NAV_ITEMS.filter(item => !('adminOnly' in item && item.adminOnly) || isAdmin)
      const idx = visibleItems.findIndex(item => item.id === activeSection)
      if (idx === -1) return
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowUp') && idx > 0) setActiveSection(visibleItems[idx - 1].id)
      if ((e.key === 'ArrowRight' || e.key === 'ArrowDown') && idx < visibleItems.length - 1) setActiveSection(visibleItems[idx + 1].id)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeSection, isSearching, isAdmin])

  function renderTab() {
    switch (activeSection) {
      case 'erste-schritte':     return <ErsteSchritteTab />
      case 'pwa-installation':   return <PwaInstallationTab />
      case 'offline':            return <OfflineTab />
      case 'szenen-editor':      return <SzenenEditorTab />
      case 'nummerierung':       return <NummerierungTab />
      case 'dokument-editor':    return <DokumentEditorHilfeTab />
      case 'kommentare':         return <KommentareTab />
      case 'szenen-fassungen':   return <SzenenFassungenTab />
      case 'rechtschreibung':    return <RechtschreibungTab />
      case 'import-komparsen':   return <ImportKomparsenTab />
      case 'suchen-ersetzen':    return <SuchenErsetzenTab />
      case 'story-straenge':     return <StoryStaengeTab />
      case 'sonderszenen':       return <SonderszenentTab />
      case 'werkstufen-labels':  return <WerkstufenLabelsTab />
      case 'vorlagen-ocr':       return <VorlagenOcrTab />
      case 'export-kopfzeilen':  return <ExportKopfzeilen />
      case 'datensicherheit-user': return <DatensicherheitUserTab />
      case 'team-work':          return <TeamWorkTab />
      case 'autorenplan':        return <AutorenplanHilfeTab />
      case 'datenmodell':        return <DatenmodellTab />
      case 'datensicherheit':    return <DatensicherheitTab />
      case 'potenzielle-fehler': return <PotenzielleFehldrTab />
      default:                   return null
    }
  }

  return (
    <AppShell hideProductionSelector>
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Side Navigation ── */}
        <nav style={{
          width: 230, flexShrink: 0,
          borderRight: `1px solid ${C.border}`,
          background: C.surface,
          overflowY: 'auto',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: '20px 16px 10px' }}>
            <button
              onClick={() => {
                if ((window.history.state?.idx ?? 0) > 0) {
                  navigate(-1)
                } else {
                  navigate('/')
                }
              }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'none', border: 'none', cursor: 'pointer',
                color: C.muted, fontSize: 12, padding: '0 0 12px 0',
              }}
            >
              ← Zurück
            </button>
            <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0, lineHeight: 1.3 }}>Handbuch</h1>
            <p style={{ color: C.muted, fontSize: 11, margin: '4px 0 10px' }}>Script-App Dokumentation</p>

            {/* ── Volltext-Suche ── */}
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)',
                color: C.muted, fontSize: 12, pointerEvents: 'none',
              }}>🔍</span>
              <input
                type="text"
                placeholder="Handbuch durchsuchen…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '7px 26px 7px 28px',
                  border: `1px solid ${isSearching ? C.blue + '66' : C.border}`,
                  borderRadius: 7, fontSize: 11,
                  background: 'var(--bg-main)', color: C.text,
                  outline: 'none', transition: 'border-color 0.15s',
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{
                    position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: C.muted, fontSize: 14, padding: '0 2px', lineHeight: 1,
                  }}
                >×</button>
              )}
            </div>
          </div>

          <div style={{ padding: '4px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {NAV_ITEMS.filter(item => !('adminOnly' in item && item.adminOnly) || isAdmin).map((item, idx, arr) => {
              const prevItem = arr[idx - 1]
              const showSeparator = 'adminOnly' in item && item.adminOnly && prevItem && !('adminOnly' in prevItem && prevItem.adminOnly)
              const matchesSearch = isSearching && (item.label + ' ' + item.keywords).toLowerCase().includes(sq)
              const dimmed = isSearching && !matchesSearch
              return (
                <div key={item.id}>
                  {showSeparator && (
                    <div style={{ margin: '8px 12px 6px', borderTop: `1px solid ${C.border}` }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        Admin
                      </span>
                    </div>
                  )}
                  <button
                    onClick={() => { setActiveSection(item.id); setSearchQuery('') }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 12px',
                      border: 'none', borderRadius: 8,
                      background: !isSearching && activeSection === item.id
                        ? C.blue + '15'
                        : matchesSearch ? C.blue + '0d' : 'transparent',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: !isSearching && activeSection === item.id ? 700 : matchesSearch ? 600 : 400,
                      color: dimmed ? C.muted : !isSearching && activeSection === item.id ? C.text : C.muted,
                      textAlign: 'left',
                      width: '100%',
                      transition: 'background 0.15s, color 0.15s, opacity 0.15s',
                      borderLeft: !isSearching && activeSection === item.id
                        ? `3px solid ${C.blue}`
                        : matchesSearch ? `3px solid ${C.blue}55` : '3px solid transparent',
                      opacity: dimmed ? 0.4 : 1,
                    }}
                  >
                    <span style={{ fontSize: 14, flexShrink: 0, width: 20, textAlign: 'center' }}>{item.icon}</span>
                    {item.label}
                  </button>
                </div>
              )
            })}
          </div>
        </nav>

        {/* ── Content Area ── */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '32px 40px',
          maxWidth: 880,
          boxSizing: 'border-box',
        }}>
          <Suspense fallback={<TabSpinner />}>
            {isSearching ? (
              <SearchResultsView
                query={sq}
                results={searchResults}
                onNavigate={(id) => { setActiveSection(id); setSearchQuery('') }}
              />
            ) : (
              renderTab()
            )}
          </Suspense>
        </div>

      </div>
    </AppShell>
  )
}

export default HilfePage
