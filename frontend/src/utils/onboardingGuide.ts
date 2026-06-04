// onboardingGuide.ts — Interaktiver Onboarding-Guide (Driver.js npm)
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'

// ── Persistenz-Keys ───────────────────────────────────────────────────────
const LS_KEY = 'serienwerft_tour_completed'

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

// ── 13 Guide-Schritte ─────────────────────────────────────────────────────
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
        description: 'In der linken Sidebar siehst du alle Szenen der Folge. Nutze die Suche, um schnell zu einer bestimmten Szene zu springen. Ein Klick auf eine Szene öffnet sie im Editor.',
        side: 'right' as const,
        align: 'start' as const,
      },
    },
    // 4 — Aktionen-Menü
    {
      element: '[title="Aktionen"]',
      popover: {
        title: '⚙️ Aktionen',
        description: 'Hier findest du erweiterte Funktionen: Suchen &amp; Ersetzen im gesamten Dokument, Strang-Zuordnung, Platzhalter, Story-Radar und die Neunummerierung von Szenen.',
        side: 'bottom' as const,
        align: 'start' as const,
      },
    },
    // 5 — Szenen-Metadaten
    {
      element: '.detail-head',
      popover: {
        title: '📋 Szenen-Metadaten',
        description: 'Jede Szene hat einen Kopfbereich mit Ort, Tageszeit und Strang. Diese Informationen sind die Basis für spätere Auswertungen und den Drehplan — also sorgfältig ausfüllen!',
        side: 'bottom' as const,
        align: 'start' as const,
      },
    },
    // 6 — Fassungen
    {
      element: () => findButton({ text: 'Drehbuch' }),
      popover: {
        title: '📄 Fassungen erstellen',
        description: 'Jede Szene kann mehrere Fassungen haben. Klicke hier, um zwischen Fassungen zu wechseln oder eine neue Fassung zu erstellen. So bleibt die Entwicklung deines Textes nachvollziehbar.',
        side: 'bottom' as const,
        align: 'start' as const,
      },
    },
    // 7 — Fassungs-Labels
    {
      element: '[title="Fassungs-Label zuweisen"]',
      popover: {
        title: '🏷️ Fassungs-Labels',
        description: 'Labels wie „Autorenfassung", „Edit 1" oder „Endfassung" helfen dem Team zu verstehen, in welchem Stadium sich ein Text befindet. Manche Labels (z.B. Drehfassung) sind schreibgeschützt.',
        side: 'bottom' as const,
        align: 'start' as const,
      },
    },
    // 8 — Verlauf
    {
      element: () => findButton({ svgClassContains: 'lucide-clock' }),
      popover: {
        title: '🕐 Autospeichern &amp; Verlauf',
        description: 'Die App speichert deinen Text automatisch. Im Verlauf siehst du alle gespeicherten Versionen — automatische (grau) und manuelle (orange). Du kannst jederzeit zu einer früheren Version zurückkehren.',
        side: 'left' as const,
        align: 'start' as const,
      },
    },
    // 9 — Drehbuch-Elemente
    {
      element: () => findButton({ text: 'TXT' }),
      popover: {
        title: '✍️ Drehbuch-Elemente',
        description: 'Die Formatleiste gibt dir schnellen Zugriff auf alle Absatztypen: TXT (Text), ANM (Anmerkung), DIA (Dialog), REG (Regieanweisung) und mehr. Shortcuts: Alt+1 bis Alt+0.',
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
        description: 'Hier steuerst du, wer deine Fassung sehen kann:<br><br>🔒 <strong>Privat</strong> — nur du<br>👤 <strong>Alle Autoren</strong> — alle Autoren der Produktion<br>🌐 <strong>Gesamte Produktion</strong> — alle Mitglieder inkl. Produktion<br>👥 <strong>Team / Colab</strong> — ausgewählte Gruppen<br><br>Tipp: Neue Fassungen sind standardmäßig Privat — erst wenn du fertig bist, auf „Alle Autoren" stellen.',
        side: 'bottom' as const,
        align: 'end' as const,
      },
    },
    // B — Format-Selector
    {
      element: () => document.querySelector('select') ?? undefined,
      popover: {
        title: '📐 Szenen-Format',
        description: 'Das Format bestimmt Editor-Typ und verfügbare Absatzformate:<br><br>📄 <strong>Drehbuch</strong> — klassisches Format mit allen Drehbuch-Elementen<br>📊 <strong>Storyline</strong> — vereinfachtes Format für Handlungsbögen<br>📝 <strong>Notiz</strong> — freies Textformat für Anmerkungen<br><br>⚠️ Das Format kann geändert werden, aber Absatzformate werden dabei umgewandelt.',
        side: 'bottom' as const,
        align: 'end' as const,
      },
    },
    // C — Ansichts-Einstellungen (via Avatar-Button)
    {
      element: 'button.avatar',
      popover: {
        title: '🎨 Ansichts-Einstellungen',
        description: 'Hier passt du die Oberfläche persönlich an (erreichbar über Avatar-Menü → „Ansicht"):<br><br>🌓 <strong>Theme</strong> — Hell / Dunkel<br>🎨 <strong>Hintergrundfarbe</strong> — 12 Farben oder individueller Farbton<br>📐 <strong>Panelmodus</strong> — Anzahl sichtbarer Panels<br>🔢 <strong>Zeilennummern</strong> — ein/aus<br>🔤 <strong>Schriftarten &amp; -größen</strong> — Interface und Drehbuch-Text separat<br><br>Diese Einstellungen sind persönlich und gelten nur für dich.',
        side: 'left' as const,
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
  if (!ignoreCompleted) {
    markTourCompleted()
  }
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
