// onboardingGuide.ts — Interaktiver Onboarding-Guide (Driver.js npm)
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import { getShortcutLabel } from '../shortcuts'

// ── Persistenz-Keys ───────────────────────────────────────────────────────
const LS_KEY = 'serienwerft_tour_completed'

// ── Dynamische Konfiguration (wird von App.tsx gesetzt) ───────────────────
let _treatmentLabel = 'Treatment'
export function setTreatmentLabel(label: string) {
  if (label) _treatmentLabel = label
}

// Tastatur-Labels zentral aus der Registry (shortcuts.ts) ziehen statt hartcodieren.
// Die Label-Funktionen nutzen nur isMac (Layout wird ignoriert) → Default 'qwertz' genügt.
let _layout: 'qwertz' | 'qwerty' = 'qwertz'
export function setKeyboardLayout(layout: 'qwertz' | 'qwerty') { if (layout) _layout = layout }
const _isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent)
const sc = (id: string) => getShortcutLabel(id, _layout, _isMac)
const _mod = _isMac ? '⌘' : 'Strg'
const _alt = _isMac ? '⌥' : 'Alt'

// ── findButton-Hilfsfunktion (spec-konform) ───────────────────────────────
function findButton(opts: {
  text?: string
  title?: string
  svgClassContains?: string
} = {}): HTMLElement | undefined {
  const allBtns = Array.from(document.querySelectorAll('button')) as HTMLElement[]
  return allBtns.find(btn => {
    const text = btn.textContent?.trim() ?? ''
    const title = btn.getAttribute('title') ?? ''
    const svgEl = btn.querySelector('svg')
    const svgCls = svgEl
      ? (typeof (svgEl as any).className === 'object'
          ? (svgEl as any).className.baseVal
          : svgEl.getAttribute('class') ?? '')
      : ''
    if (opts.text && !text.startsWith(opts.text)) return false
    if (opts.title && title !== opts.title) return false
    if (opts.svgClassContains && !svgCls.includes(opts.svgClassContains)) return false
    return true
  })
}

// ── Server-Persistenz ─────────────────────────────────────────────────────
export async function isTourCompleted(): Promise<boolean> {
  try {
    const res = await fetch('/api/me/settings', { credentials: 'include' })
    if (!res.ok) throw new Error('settings fetch failed')
    const data = await res.json()
    return data?.ui_settings?.onboarding_tour_completed === true
  } catch {
    return localStorage.getItem(LS_KEY) === 'true'
  }
}

export function markTourCompleted() {
  localStorage.setItem(LS_KEY, 'true')
  fetch('/api/me/settings', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ui_settings: {
        onboarding_tour_completed: true,
        onboarding_tour_completed_at: new Date().toISOString(),
      },
    }),
  }).catch(() => {/* localStorage-Fallback genügt */})
}

// ── 15 Guide-Schritte ─────────────────────────────────────────────────────
function buildSteps() {
  return [
    // 1 — Willkommen
    {
      element: 'header.topbar',
      popover: {
        title: '👋 Willkommen in der Serienwerft Script App',
        description: 'Diese kurze Tour (ca. 10 Minuten) zeigt dir die wichtigsten Funktionen — von der Folgenauswahl bis zum fertigen Drehbuch. Du kannst jederzeit mit „Überspringen" aussteigen und die Tour später unter /hilfe neu starten.',
        side: 'bottom' as const,
        align: 'start' as const,
      },
    },
    // 2 — Folge auswählen
    {
      element: () => findButton({ text: '●' }),
      popover: {
        title: '📺 Folge auswählen',
        description: 'Der Punkt (●) vor der Folgennummer zeigt, dass diese Folge aktiv ist. Klicke hier, um zwischen Folgen zu wechseln. Jede Folge hat ihre eigenen Szenen und Fassungen.',
        side: 'bottom' as const,
        align: 'start' as const,
      },
    },
    // 3 — Szenenübersicht
    {
      element: 'input[placeholder="Szene suchen…"]',
      popover: {
        title: '🎬 Szenenübersicht',
        description: 'In der linken Sidebar siehst du alle Szenen der Folge. Nutze die Suche, um schnell zur richtigen Szene zu springen. Szenen lassen sich per <strong>Drag &amp; Drop</strong> umsortieren. Rechtsklick auf eine Szene öffnet Schnellaktionen (Einfügen, Kopieren, Löschen).',
        side: 'right' as const,
        align: 'start' as const,
      },
    },
    // 4 — Aktionen-Menü
    {
      element: '[title="Aktionen"]',
      popover: {
        title: '··· Aktionen',
        description: 'Erweiterte Funktionen für die aktuelle Folge: <strong>Suchen &amp; Ersetzen</strong> im gesamten Dokument, <strong>Stränge verwalten</strong>, Platzhalter-Szenen anlegen, Story-Radar und Neu nummerieren.',
        side: 'bottom' as const,
        align: 'start' as const,
      },
    },
    // 5 — Scene-Editor / Szenenkopf
    {
      element: '.detail-head',
      popover: {
        title: '📋 Scene-Editor',
        description: `Jede Szene hat einen <strong>Szenenkopf</strong> mit Motivname, INT/EXT, Tageszeit, Zusammenfassung und beteiligten Rollen — ein Klick zum Bearbeiten. Darunter der Schreibbereich mit zwei Tabs: <strong>${_treatmentLabel}</strong> (freier Text) und <strong>Drehbuch</strong> (formatiertes Skript). Beide Tabs lassen sich nebeneinander öffnen.`,
        side: 'bottom' as const,
        align: 'start' as const,
      },
    },
    // 6 — Fassungen
    {
      element: () => findButton({ text: 'Drehbuch' }),
      popover: {
        title: '📄 Fassungen',
        description: 'Fassungen gelten immer für die <strong>gesamte Folge</strong>, nicht für einzelne Szenen. Klicke hier, um zwischen Fassungen zu wechseln oder eine neue zu erstellen — so bleibt die Textentwicklung von der ersten Idee bis zur Endfassung nachvollziehbar.',
        side: 'bottom' as const,
        align: 'start' as const,
      },
    },
    // 7 — Fassungs-Labels
    {
      element: '[title="Fassungs-Label zuweisen"]',
      popover: {
        title: '🏷️ Fassungs-Labels',
        description: 'Labels wie „Autorenfassung", „Edit 1" oder „Endfassung" zeigen, in welchem Arbeitsschritt sich ein Text befindet. Manche Labels (z.B. Drehfassung) sind schreibgeschützt. Verfügbare Labels werden im Bereich <strong>Drehbuchkoordination</strong> konfiguriert.',
        side: 'bottom' as const,
        align: 'start' as const,
      },
    },
    // 8 — Verlauf
    {
      element: () => findButton({ svgClassContains: 'lucide-clock' }),
      popover: {
        title: '🕐 Autospeichern &amp; Verlauf',
        description: `Die App speichert automatisch. <strong>${sc('undo')}</strong> macht die letzten Tipp-Schritte rückgängig. Der Verlauf zeigt alle <strong>Szenen-Snapshots</strong> — automatische (grau) und manuelle (blau) — sowie die Option, die gesamte <strong>Folge wiederherzustellen</strong>.`,
        side: 'left' as const,
        align: 'start' as const,
      },
    },
    // 9 — Absatzformatierungen
    {
      element: () => findButton({ text: 'TXT' }),
      popover: {
        title: '✍️ Absatzformatierungen',
        description: `Die Formatleiste gibt schnellen Zugriff auf alle Absatztypen: <strong>TXT</strong> (Szenenüberschrift), <strong>ACTI</strong> (Action), <strong>CHAR</strong> (Character), <strong>DIAL</strong> (Dialogue), <strong>PAR</strong> (Parenthetical), <strong>TRAN</strong> (Transition), <strong>SHOT</strong> (Shot). Tastenkürzel: <kbd>${_alt}+1</kbd> bis <kbd>${_alt}+7</kbd>.`,
        side: 'top' as const,
        align: 'start' as const,
      },
    },
    // 10 — Fokus-Modus
    {
      element: 'button.focus-toggle',
      popover: {
        title: '👁️ Fokus-Modus',
        description: 'Blendet alle Leisten aus und gibt dir maximalen Schreibraum. Ideal für konzentriertes Arbeiten. Einfach nochmal klicken, um alle Panels wieder einzublenden.',
        side: 'left' as const,
        align: 'start' as const,
      },
    },
    // 11 — Tastenkürzel
    {
      element: 'header.topbar',
      popover: {
        title: '⌨️ Tastenkürzel',
        description: `Schneller arbeiten mit der Tastatur:<br><br>⌨️ <strong>?</strong> öffnet die komplette Kürzel-Übersicht<br>🔎 <strong>${_mod} + K</strong> öffnet die Befehlspalette (durchsuchbar, jede Zeile zeigt ihr Kürzel)<br>🎬 <strong>${sc('scenePrev')} / ${sc('sceneNext')}</strong> wechselt die Szene, <strong>${sc('folgePrev')} / ${sc('folgeNext')}</strong> die Folge<br><br><em>Hinweis: Die Taste <strong>?</strong> funktioniert nur außerhalb von Eingabe- und Textfeldern. Die volle Liste steht auch unter /hilfe → „Tastenkürzel".</em>`,
        side: 'bottom' as const,
        align: 'start' as const,
      },
    },
    // A — Sichtbarkeit
    {
      element: () => {
        const candidates = ['Privat', 'Alle Autoren', 'Gesamte Produktion', 'Team', 'Colab']
        for (const text of candidates) {
          const btn = findButton({ text })
          if (btn) return btn
        }
        return undefined
      },
      popover: {
        title: '👥 Sichtbarkeit der Fassung',
        description: 'Hier steuerst du, wer deine Fassung sehen kann:<br><br>🔒 <strong>Privat</strong> — nur du<br>👤 <strong>Alle Autoren</strong> — alle Autoren der Produktion<br>🌐 <strong>Gesamte Produktion</strong> — alle Mitglieder<br>👥 <strong>Team</strong> — eine selbst angelegte Gruppe (Mitglieder im Team-Work-Menü einsehbar)<br><br>Tipp: Neue Fassungen sind standardmäßig auf <em>Team</em> gestellt.',
        side: 'bottom' as const,
        align: 'end' as const,
      },
    },
    // B — Format-Selector
    {
      element: () => document.querySelector('select') ?? undefined,
      popover: {
        title: '📐 Szenen-Format',
        description: 'Das Format bestimmt den Editor-Typ:<br><br>📄 <strong>Drehbuch</strong> — klassisches Skriptformat mit allen Absatztypen<br>📝 <strong>Dokument</strong> — freier Fließtext für Anmerkungen<br><br>💡 Über <strong>Fassungs-Vorlagen</strong> in der Drehbuchkoordination lassen sich Vordrucke wie Titelseiten konfigurieren.',
        side: 'bottom' as const,
        align: 'end' as const,
      },
    },
    // C — Ansichts-Einstellungen (via Avatar-Button → Ansicht)
    {
      element: 'button.avatar',
      popover: {
        title: '🎨 Ansichts-Einstellungen',
        description: `Über <strong>Avatar → Ansicht</strong> (oder <kbd>${sc('viewSettings')}</kbd>) erreichst du alle persönlichen Darstellungsoptionen:<br><br>🌓 <strong>Theme</strong> — Hell / Dunkel<br>🎨 <strong>Hintergrundfarbe</strong> — Farbpalette oder eigener Ton<br>📐 <strong>Panelmodus</strong> — Dual-View oder Einzelansicht<br>🔢 <strong>Zeilen- &amp; Repliken-Nummern</strong><br>🔤 <strong>Schriftarten &amp; -größen</strong><br>✓ <strong>Rechtschreibung &amp; Autokorrektur</strong><br><br>Diese Einstellungen sind persönlich und gelten nur für dich.`,
        side: 'left' as const,
        align: 'start' as const,
      },
    },
    // D — Benutzer-Menü (Avatar)
    {
      element: 'button.avatar',
      popover: {
        title: '👤 Dein Benutzer-Menü',
        description: 'Ein Klick auf den Avatar öffnet dein persönliches Menü:<br><br>👁 <strong>Ansicht</strong> — persönliche Darstellungsoptionen<br>📶 <strong>Offline-Modus</strong> — Datensicherung &amp; ausstehende Änderungen<br>📖 <strong>Handbuch</strong> — diese Hilfe-Seite<br>✨ <strong>Wünsche</strong> — Feedback &amp; Feature-Requests<br>🌙 <strong>Theme wechseln</strong><br>📲 <strong>App installieren / deinstallieren</strong><br>🚪 <strong>Ausloggen</strong>',
        side: 'left' as const,
        align: 'start' as const,
      },
    },
    // E — Script-Menü (App-Navigation)
    {
      element: 'button.brand-label-btn',
      popover: {
        title: '📂 Script-Menü',
        description: 'Ein Klick auf <strong>script</strong> oben links öffnet die App-Navigation:<br><br>📋 Episoden · Rollen · Komparsen · Motive<br>📊 Statistik · Besetzungsmatrix<br>📤 Export (PDF, Fountain, FDX)<br>📂 Freie Dokumente · NT-Liste · Beziehungsbaum<br><br>Admins sehen zusätzlich die <strong>Drehbuchkoordination</strong>.',
        side: 'bottom' as const,
        align: 'start' as const,
      },
    },
  ]
}

// ── Tour starten ───────────────────────────────────────────────────────────
// ignoreCompleted: true → immer starten (z.B. von /hilfe aus)
export function startGuide(ignoreCompleted = false) {
  const steps = buildSteps()

  // Nur Schritte mit vorhandenem DOM-Element
  const validSteps = steps.filter(step => {
    if (typeof step.element === 'string') return !!document.querySelector(step.element)
    if (typeof step.element === 'function') return !!(step.element as () => Element | undefined)()
    return false
  })

  if (validSteps.length === 0) return

  const driverObj = driver({
    showProgress: true,
    animate: true,
    allowClose: true,
    overlayOpacity: 0.6,
    smoothScroll: true,
    nextBtnText: 'Weiter →',
    prevBtnText: '← Zurück',
    doneBtnText: 'Fertig ✓',
    steps: validSteps as any,
    onDestroyStarted: () => {
      markTourCompleted()
      driverObj.destroy()
    },
  })

  driverObj.drive()
}

// ── Auto-Start beim ersten Login ───────────────────────────────────────────
// Aufrufen nach Auth + Settings-Load; wartet auf Editor im DOM.
export async function checkAndStartTour() {
  const completed = await isTourCompleted()
  if (completed) return

  // Warten bis Editor-Elemente im DOM sind
  let attempts = 0
  const tryStart = () => {
    attempts++
    const editorReady = !!(
      document.querySelector('header.topbar') &&
      document.querySelector('.tiptap, .detail-head')
    )
    if (editorReady) {
      setTimeout(() => startGuide(), 800)
    } else if (attempts < 20) {
      setTimeout(tryStart, 500)
    }
  }
  setTimeout(tryStart, 1000)
}
