// onboardingGuide.ts — Interaktiver Onboarding-Guide (Driver.js)
// Startet automatisch beim ersten Login; jederzeit unter /hilfe neu startbar.

const STORAGE_KEY = 'serienwerft_guide_seen'

declare const window: Window & {
  driver?: {
    js: {
      driver: (config: unknown) => {
        setSteps: (steps: unknown[]) => void
        drive: () => void
        destroy: () => void
      }
    }
  }
}

// ── findButton-Hilfsfunktion ───────────────────────────────────────────────
function findButton(strategy: {
  text?: string
  textIncludes?: string
  svgClass?: string
  svgClassContains?: string
  title?: string
  querySelector?: string
}): Element | null {
  const btns = Array.from(document.querySelectorAll('button'))
  if (strategy.text) {
    return btns.find(b => b.textContent?.trim() === strategy.text) ?? null
  }
  if (strategy.textIncludes) {
    return btns.find(b => b.textContent?.trim().includes(strategy.textIncludes!)) ?? null
  }
  if (strategy.svgClass) {
    return btns.find(b => b.querySelector(`svg.${strategy.svgClass!.replace(/ /g, '.')}`)) ?? null
  }
  if (strategy.svgClassContains) {
    return btns.find(b => {
      const svg = b.querySelector('svg')
      return svg?.getAttribute('class')?.includes(strategy.svgClassContains!)
    }) ?? null
  }
  if (strategy.title) {
    return document.querySelector(`[title="${strategy.title}"]`)
  }
  if (strategy.querySelector) {
    return document.querySelector(strategy.querySelector)
  }
  return null
}

// ── Guide-Schritte ─────────────────────────────────────────────────────────
function getSteps() {
  return [
    {
      element: 'header',
      popover: {
        title: 'Willkommen in der Script App',
        description: `Du schreibst hier Drehbücher für Rote Rosen — direkt im Browser, ohne Installation.
        <br><br>Die App hat drei Bereiche: <b>Links</b> die Szenenübersicht,
        <b>Mitte</b> dein Drehbuch, <b>Rechts</b> Verlauf &amp; Einstellungen.
        <br><br>Diese Tour dauert ca. 10 Minuten. Du kannst sie jederzeit unter <b>/hilfe</b> wiederholen.`,
        side: 'bottom',
        align: 'start',
      },
    },
    {
      element: () => Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim().startsWith('↓')) ?? null,
      popover: {
        title: 'Deine Folge auswählen',
        description: `Hier siehst du die aktuelle Folge. Klick drauf — es öffnet sich eine Liste
        aller Folgen der Staffel. Folgen mit ↓ haben bereits eine Fassung
        (z.B. <i>DB v1 · Edit 2</i> = Drehbuch Version 1, Label "Edit 2").
        <br><br><b>Tipp:</b> Du kannst nach Folgennummern suchen.`,
        side: 'bottom',
      },
    },
    {
      element: () => document.querySelector("input[placeholder='Szene suchen…']") ?? document.querySelector("input[placeholder*='Szene']") ?? null,
      popover: {
        title: 'Die Szenenübersicht',
        description: `Die linke Leiste ist deine Karte durch die Folge. Jede Zeile = eine Szene.
        <br><br>Du siehst: Szenennummer, Motiv (Drehort), Innen/Außen + Tag/Nacht,
        und kleine Icons für Warnhinweise (⚠️) oder Rolleninfos.
        <br><br>Dieses <b>Suchfeld</b> filtert Szenen nach Motiv oder Inhalt.`,
        side: 'right',
      },
    },
    {
      element: () => findButton({ title: 'Aktionen' }) ?? findButton({ svgClassContains: 'lucide-ellipsis' }),
      popover: {
        title: 'Aktionen für die ganze Folge',
        description: `Das <b>Drei-Punkte-Menü</b> oben in der Sidebar öffnet Funktionen
        für die gesamte Folge: Suchen &amp; Ersetzen (Strg+H), Stränge verwalten,
        Story-Radar, Statistiken, Stoppzeiten und mehr.
        <br><br>Das <b>+ Symbol</b> daneben fügt eine neue Szene am Ende ein.`,
        side: 'right',
      },
    },
    {
      element: () => document.querySelector('.detail-head') ?? document.querySelector('[class*="detail-head"]') ?? null,
      popover: {
        title: 'Szenen-Metadaten',
        description: `Jede Szene hat einen Kopfbereich mit allem, was Regie und Produktion brauchen:
        <br><br>
        <b>Motiv</b> = Drehort &nbsp;|&nbsp; <b>R-</b> = Rollen &nbsp;|&nbsp; <b>K-</b> = Kostüm &nbsp;|&nbsp; <b>S-</b> = Set
        <br><b>Oneliner</b> = Kurzbeschreibung &nbsp;|&nbsp; <b>Szeneninfo</b> = ausführliche Notiz
        <br><b>A/t/SP</b> = Akt, Tag, Seitenposition (automatisch)
        <br><br>Klicke in ein Feld um es zu bearbeiten.`,
        side: 'bottom',
      },
    },
    {
      element: () => findButton({ text: 'Drehbuch' }),
      popover: {
        title: 'Fassungen — dein Herzstück',
        description: `Hier wählst du <b>Dokumenttyp</b> und <b>Version</b> deiner Fassung.
        <br><br><b>Dokumenttypen:</b>
        <br>• <b>Drehbuch</b> — das eigentliche Skript mit Szenen, Dialogen, Regieanweisungen
        <br>• <b>Storyline</b> — Kurzstruktur ohne strenge Formatierung
        <br>• <b>Dokument</b> — freier Text, z.B. für Exposés oder Notizen
        <br><br>Klicke hier für das Dropdown — <b>+ Neue Drehbuch-Version</b> erstellt eine Kopie der aktuellen Fassung.`,
        side: 'bottom',
      },
    },
    {
      element: () => findButton({ title: 'Fassungs-Label zuweisen' }),
      popover: {
        title: 'Fassungs-Label — wo stehst du?',
        description: `Das Label zeigt den Status deiner Fassung und steuert die Sichtbarkeit:
        <br><br>
        <b>Autorenfassung</b> — dein erster Entwurf<br>
        <b>Edit 1 / Edit 2</b> — Überarbeitungen<br>
        <b>Endfassung</b> — Abgabe an Produktion<br>
        <b>Drehfassung</b> 🔒 — von Produktion gesperrt<br>
        <br>Als Autor kannst du Autorenfassung, Edit 1, Edit 2 und Endfassung selbst vergeben.`,
        side: 'bottom',
      },
    },
    {
      element: () => findButton({ svgClassContains: 'lucide-clock' }),
      popover: {
        title: 'Autospeichern &amp; Verlauf',
        description: `Du musst <b>nie manuell speichern</b>. Der grüne Punkt <b>✓ Gespeichert</b>
        bestätigt dir jederzeit, dass deine Arbeit sicher ist.
        <br><br>Klicke auf das <b>Uhr-Symbol</b> für den Verlauf:
        <br>• <b>Diese Szene</b> — alle Snapshots der aktuellen Szene (alle 5 Min., max. 50)
        <br>• <b>Dokument</b> — Sicherungen der ganzen Folge (bei Fassungswechsel, max. 30)
        <br><br>Klicke auf einen Snapshot → Vorschau → Wiederherstellen wenn nötig.`,
        side: 'bottom',
      },
    },
    {
      element: () => findButton({ text: 'TXT' }),
      popover: {
        title: 'Drehbuch-Elemente',
        description: `Diese Buttons setzen den Typ des aktuellen Absatzes:
        <br><br>
        <b>TXT</b> (Alt+1) Regieanweisung/Fließtext<br>
        <b>CHAR</b> (Alt+3) Charaktername — Großbuchstaben, zentriert<br>
        <b>DIA</b> (Alt+4) Dialogzeile<br>
        <b>PAR</b> (Alt+5) Spielhinweis in (Klammern)<br>
        <b>TRANS</b> (Alt+6) Übergang (z.B. SCHNITT:)<br>
        <b>SHOT</b> (Alt+7) Kameraanweisung — Großbuchstaben<br>
        <br><b>Tipp:</b> Die App erkennt den Typ meist automatisch beim Tippen!`,
        side: 'bottom',
      },
    },
    {
      element: () => document.querySelector('button.focus-toggle') ?? findButton({ svgClassContains: 'lucide-maximize' }) ?? findButton({ svgClassContains: 'lucide-minimize' }),
      popover: {
        title: 'Deine persönliche Ansicht',
        description: `Dieses Symbol schaltet in den <b>Vollbild-Modus</b> — die Sidebar verschwindet,
        du schreibst ungestört. Drücke <kbd>Escape</kbd> zum Verlassen.
        <br><br>In der <b>rechten Spalte</b> kannst du außerdem einstellen:
        <br>• <b>Hell/Dunkel</b>-Modus
        <br>• <b>Hintergrundfarbe</b> (12 Voreinstellungen + eigene Farbe)
        <br>• <b>Panelmodus</b> (beide / nur Szenenübersicht / nur Drehbuch)
        <br><br>Die Tour ist abgeschlossen! Weiter Infos findest du im <b>Handbuch unter /hilfe</b>.`,
        side: 'bottom',
        align: 'end',
      },
    },
  ]
}

// ── Guide starten ──────────────────────────────────────────────────────────
export function startGuide() {
  // Driver.js muss über CDN geladen sein (IIFE → window.driver.js.driver)
  const driverFn = (window as any)?.driver?.js?.driver
  if (typeof driverFn !== 'function') {
    console.warn('[Onboarding] Driver.js nicht geladen — CDN-Script fehlt?')
    return
  }

  const driverObj = driverFn({
    showProgress: true,
    allowClose: true,
    overlayOpacity: 0.6,
    smoothScroll: true,
    nextBtnText: 'Weiter →',
    prevBtnText: '← Zurück',
    doneBtnText: 'Fertig',
    onDestroyStarted: () => {
      localStorage.setItem(STORAGE_KEY, 'true')
      driverObj.destroy()
    },
  })

  const steps = getSteps()
  // Nur Schritte einbeziehen, bei denen das Element im DOM vorhanden ist
  const validSteps = steps.filter(step => {
    if (typeof step.element === 'string') return !!document.querySelector(step.element)
    if (typeof step.element === 'function') return !!step.element()
    return true
  })

  if (validSteps.length === 0) {
    console.warn('[Onboarding] Keine Guide-Elemente im DOM gefunden — bitte zuerst eine Folge öffnen.')
    return
  }

  driverObj.setSteps(validSteps)
  driverObj.drive()
  localStorage.setItem(STORAGE_KEY, 'true')
}

// ── Automatischer Erst-Start ───────────────────────────────────────────────
export function checkAndStartGuide() {
  if (localStorage.getItem(STORAGE_KEY)) return
  // Warten bis App vollständig gerendert ist
  setTimeout(() => {
    startGuide()
  }, 1500)
}
