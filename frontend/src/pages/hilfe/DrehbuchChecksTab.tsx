import { C, Section, FaqItem, InfoBox, WarnBox } from './_shared'

// ── Mini-Bausteine ─────────────────────────────────────────────────────────────

function LockBadge({ gating }: { gating: 'blocker' | 'warnung' | 'off' }) {
  const map = {
    blocker: { bg: '#FF3B3018', border: '#FF3B3066', color: '#FF3B30', label: 'Blocker' },
    warnung: { bg: '#FFCC0018', border: '#FFCC0066', color: '#996600', label: 'Warnung' },
    off:     { bg: '#75757518', border: '#75757544', color: '#757575', label: 'Gate off' },
  }
  const s = map[gating]
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 999,
      background: s.bg, border: `1px solid ${s.border}`, color: s.color,
      whiteSpace: 'nowrap',
    }}>{s.label}</span>
  )
}

function AutofixBadge({ mode }: { mode: '1klick' | 'silent' }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 999,
      background: C.green + '18', border: `1px solid ${C.green}44`, color: C.green,
      whiteSpace: 'nowrap',
    }}>{mode === 'silent' ? '⚡ Auto-Fix' : '1-Klick-Fix'}</span>
  )
}

function CheckRow({ id, label, auto, ki, gating, autofix, children }: {
  id: string; label: string; auto: boolean; ki?: boolean
  gating: 'blocker' | 'warnung' | 'off'; autofix?: '1klick' | 'silent'; children: React.ReactNode
}) {
  const borderColor = gating === 'blocker' ? '#FF3B30' : gating === 'warnung' ? '#FFCC00' : C.gray
  return (
    <div style={{
      border: `1px solid ${borderColor}33`,
      borderLeft: `4px solid ${borderColor}`,
      borderRadius: 8, background: borderColor + '07',
      padding: '12px 16px', marginBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: C.text }}>{label}</span>
        <span style={{
          fontSize: 9, fontFamily: 'monospace', color: C.muted, background: 'var(--bg-surface)',
          border: `1px solid ${C.border}`, borderRadius: 4, padding: '1px 5px',
        }}>{id}</span>
        <LockBadge gating={gating} />
        <span style={{
          fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 999,
          background: auto ? C.blue + '18' : C.gray + '18',
          border: `1px solid ${auto ? C.blue + '55' : C.gray + '44'}`,
          color: auto ? C.blue : C.gray,
        }}>{auto ? 'Auto' : 'Nur manuell'}</span>
        {ki && (
          <span style={{
            fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 999,
            background: '#AF52DE18', border: '1px solid #AF52DE44', color: '#AF52DE',
          }}>✨ KI</span>
        )}
        {autofix && <AutofixBadge mode={autofix} />}
      </div>
      <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.65 }}>{children}</div>
    </div>
  )
}

function GroupHeader({ title, color = C.gray }: { title: string; color?: string }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color, letterSpacing: '0.06em', textTransform: 'uppercase',
      borderBottom: `2px solid ${color}33`, paddingBottom: 4, marginTop: 24, marginBottom: 12,
    }}>
      {title}
    </div>
  )
}

function MockBadge({ count }: { count: number }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 11, fontWeight: 700, color: C.orange,
      background: C.orange + '18', border: `1px solid ${C.orange}44`,
      borderRadius: 999, padding: '1px 7px',
    }}>
      ⚠ {count}
    </span>
  )
}

function UiStep({ nr, label, children }: { nr: string; label: string; children?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 14, alignItems: 'flex-start' }}>
      <div style={{
        width: 26, height: 26, borderRadius: '50%', background: C.orange + '22',
        border: `2px solid ${C.orange}55`, color: C.orange, fontSize: 12, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
      }}>{nr}</div>
      <div>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{label}</div>
        {children && <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.65, marginTop: 3 }}>{children}</div>}
      </div>
    </div>
  )
}

// ── Haupt-Tab ─────────────────────────────────────────────────────────────────

export default function DrehbuchChecksTab() {
  return (
    <div>

      {/* Intro */}
      <div style={{
        background: `linear-gradient(135deg, ${C.orange}18 0%, ${C.blue}10 100%)`,
        border: `1px solid ${C.orange}33`, borderRadius: 12,
        padding: '20px 24px', marginBottom: 32, display: 'flex', gap: 16, alignItems: 'flex-start',
      }}>
        <div style={{ fontSize: 32, lineHeight: 1, flexShrink: 0 }}>🔍</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>
            Drehbuch-Checks — automatische Qualitätsprüfung
          </div>
          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.65 }}>
            Die Script-App prüft beim Speichern jeder Szene automatisch auf 27 Qualitätskriterien.
            Ergebnisse erscheinen als <MockBadge count={2} /> Badge in der Szenenleiste.
            Beim Setzen eines Produktionsfassung-Labels öffnet sich das <strong>Check-Gate</strong>:
            ein Modal, das alle offenen Findings gruppiert und den Lock ggf. verhindert.
            Alle Checks sind pro Produktion in den <strong>DK-Einstellungen → Drehbuch-Checks</strong> konfigurierbar.
          </div>
        </div>
      </div>

      {/* ── 1. Alle 27 Checks ── */}
      <Section title="1. Alle Checks im Überblick">

        <div style={{ fontSize: 12, color: C.muted, marginBottom: 12, lineHeight: 1.6 }}>
          Jeder Check zeigt: Standard-Lock-Gate-Verhalten (
          <LockBadge gating="blocker" />{' '}
          <LockBadge gating="warnung" />{' '}
          <LockBadge gating="off" />
          ), Auto-Verhalten sowie ggf. Autofix-Typ.
          Alle Werte sind in den DK-Einstellungen pro Produktion überschreibbar.
        </div>

        <GroupHeader title="Szenenkopf" color={C.blue} />

        <CheckRow id="szenenkopf.pflichtfelder" label="Pflichtfelder" auto={true} gating="blocker">
          Prüft ob alle Pflichtfelder im Szenenkopf ausgefüllt sind: Tageszeit, INT/EXT, Motiv.
          Fehlt eines dieser Felder, ist die Szene für den Export und den Drehplan nicht vollständig verwertbar.
          Standardmäßig als <strong>Blocker</strong> konfiguriert — verhindert das Setzen des Produktionsfassung-Labels.
        </CheckRow>

        <CheckRow id="motiv_leer" label="Motiv fehlt" auto={true} gating="warnung">
          Prüft ob das Motiv-Feld im Szenenkopf ausgefüllt ist.
          Ein fehlendes Motiv verhindert korrekte Breakdowns und den Drehplan-Export.
          Tritt besonders häufig bei Szenen auf, die direkt nach einem Import angelegt wurden.
        </CheckRow>

        <CheckRow id="fehlender_dialog" label="Fehlender Dialog" auto={true} gating="blocker">
          Spielszenen (Drehbuch-Format) ohne jede Dialog-Zeile. Solche Szenen sind meist Tipp-Fehler
          (leerer Szenenkopf ohne Inhalt) oder vergessene Szenen.
          Als <strong>Blocker</strong> konfiguriert.
        </CheckRow>

        <CheckRow id="scene.unique_szenennummer" label="Doppelte Szenennummer" auto={true} gating="blocker">
          Prüft ob eine Szenennummer innerhalb der Werkstufe doppelt vergeben wurde.
          Doppelte Nummern entstehen beim Kopieren von Szenen ohne anschließende Korrektur.
          Als <strong>Blocker</strong> konfiguriert — doppelte Nummern korrumpieren alle nummernbasierten Exporte.
        </CheckRow>

        <CheckRow id="scene.empty" label="Leere Szene" auto={true} gating="warnung">
          Szene hat weder Text noch Dialog-Inhalte. Kann eine Arbeitsszene sein die noch gefüllt wird,
          oder ein versehentlich angelegtes Duplikat.
        </CheckRow>

        <GroupHeader title="Inhalt & Rollen" color={C.green} />

        <CheckRow id="rollen_konsistenz" label="Rollen-Konsistenz" auto={true} gating="warnung" autofix="1klick">
          Bidirektionaler Abgleich zwischen Szenentext und Rollen-Feld im Szenenkopf:
          Eine eingetragene Rolle, die im Text <strong>gar nicht erwähnt</strong> wird — oder eine Figur,
          die strukturell im Text auftritt, aber nicht im Szenenkopf steht.
          <strong>Groß-/Kleinschreibung spielt keine Rolle</strong> — es zählt allein, ob die Figur erwähnt
          wird (die alte GROSSBUCHSTABEN-Konvention ist dafür nicht mehr nötig).
          Der 1-Klick-Fix trägt fehlende Rollen automatisch nach.
          <div style={{ marginTop: 6, fontSize: 11, color: C.muted }}>
            Nur Figuren aus der Figurendatenbank dieser Produktion werden geprüft.
          </div>
        </CheckRow>

        <CheckRow id="rollen_grossbuchstaben" label="Rollen in Großbuchstaben" auto={false} gating="off">
          Optionaler Stil-Check für die alte Konvention, Figurennamen im Text in GROSSBUCHSTABEN zu schreiben.
          Meldet eingetragene Rollen, die zwar erwähnt werden, aber nirgends in Großbuchstaben stehen.
          <strong> Standardmäßig deaktiviert</strong> — nur aktivieren, wenn die Produktion diese Schreibweise verlangt.
        </CheckRow>

        <CheckRow id="sondertyp_wechselschnitt" label="Wechselschnitt-Sondertyp" auto={true} gating="warnung">
          Erkennt zwei Inkonsistenzen: (A) Sondertyp „Wechselschnitt" gesetzt, aber kein
          WS-Partner im Szenenkopf angegeben. (B) Stichwort „WECHSELSCHNITT" oder „WS:" im Text,
          Sondertyp aber nicht gesetzt.
        </CheckRow>

        <CheckRow id="strang_zuordnung" label="Strang-Zuordnung" auto={true} gating="off">
          Prüft ob die Szene mindestens einem Story-Strang zugeordnet ist.
          Bleibt stumm wenn für diese Produktion keine Stränge angelegt wurden.
          Standard-Gate ist „off" — reine Produktionsszenen (Inserts, Übergänge) brauchen keinen Strang.
        </CheckRow>

        <CheckRow id="duplikat_motiv" label="Duplikat-Motiv im Block" auto={true} gating="warnung">
          Erkennt wenn dieselbe Motivkombination (Motiv + INT/EXT + Tageszeit) bereits
          in einer anderen Szene der gleichen Folge vorkommt.
          Absichtliche Wiederholungen können einzeln als „behoben" markiert werden.
        </CheckRow>

        <CheckRow id="etablierungsshot_vorhanden" label="Etablierungsshot" auto={false} gating="off">
          Prüft ob die erste Szene in einer neuen Location (neues Motiv, neue Tageszeit) mindestens
          eine Establishing-Shot-Notation enthält. Standardmäßig deaktiviert und nur manuell auslösbar —
          die Beurteilung ist stark produktionsstilabhängig.
        </CheckRow>

        <CheckRow id="oneliner_vorhanden" label="Oneliner fehlt" auto={false} gating="off" ki={true}>
          KI-Check: Prüft ob ein Oneliner gesetzt ist und ob er zum emotionalen Kern der Szene passt.
          Standardmäßig deaktiviert (KI-Kosten). Nur manuell auslösbar.
          Der KI-Prompt ist in den DK-Einstellungen pro Produktion anpassbar.
        </CheckRow>

        <GroupHeader title="Format & Text" color={C.orange} />

        <CheckRow id="leere_bloecke" label="Leere Blöcke" auto={true} gating="off" autofix="silent">
          Erkennt leere Absatz-Nodes oder Leerzeilen ohne Inhalt. Werden beim Auto-Fix lautlos entfernt.
        </CheckRow>

        <CheckRow id="doppelter_sprecher" label="Doppelter Sprecher" auto={true} gating="warnung" autofix="1klick">
          Zwei aufeinanderfolgende Dialog-Blöcke desselben Sprechers ohne dazwischenliegenden Aktions-Block.
          Meist ein Schnittfehler aus dem Editor. Der 1-Klick-Fix fügt einen leeren Aktions-Block ein.
        </CheckRow>

        <CheckRow id="dialog.endet_satzzeichen" label="Dialog-Satzzeichen" auto={true} gating="off" autofix="1klick">
          Dialogzeilen die nicht mit einem Satzzeichen enden (Punkt, Ausrufe- oder Fragezeichen, Ellipse).
          Betrifft nur Drehbuch-Format. Der 1-Klick-Fix ergänzt fehlende Satzzeichen.
        </CheckRow>

        <CheckRow id="text.kein_leerzeichen_start" label="Führendes Leerzeichen" auto={true} gating="off" autofix="silent">
          Text-Nodes die mit einem Leerzeichen beginnen. Der Auto-Fix entfernt sie lautlos.
        </CheckRow>

        <CheckRow id="motiv.einheitliche_schreibweise" label="Motiv-Schreibweise" auto={true} gating="warnung" autofix="1klick">
          Dasselbe Motiv erscheint in mehreren Szenen mit unterschiedlicher Schreibweise
          (z.B. „Krankenhaus / Station" vs. „Krankenhaus/Station").
          Der 1-Klick-Fix normalisiert auf die häufigste Variante.
        </CheckRow>

        <CheckRow id="rolle.einheitliche_schreibweise" label="Rollen-Schreibweise" auto={true} gating="warnung" autofix="1klick">
          Figurenname im Szenenkopf weicht von der Canonical-Schreibweise in der Figurendatenbank ab.
          Der 1-Klick-Fix ersetzt auf die offizielle Schreibweise.
        </CheckRow>

        <GroupHeader title="Timing & Dramaturgie" color="#FF9500" />

        <CheckRow id="tageszeit_sequenz" label="Tageszeit-Sequenz" auto={false} gating="warnung">
          Prüft ob die Tageszeiten innerhalb eines dramaturgischen Tages eine plausible Reihenfolge
          ergeben (MORGEN → TAG → ABEND → NACHT). Sprünge (z.B. NACHT nach MORGEN ohne Schnitt)
          werden als Warnung markiert. Nur manuell auslösbar, da kreative Zeitsprünge legitim sind.
        </CheckRow>

        <CheckRow id="stoppzeit_plausibilitaet" label="Stoppzeit-Plausibilität" auto={false} gating="warnung">
          Vergleicht die eingetragene Stoppzeit mit der Textlänge.{' '}
          <strong>Faustregel:</strong> 1 Seite ≈ 1 Minute ≈ 1.800 Zeichen.
          Warnung ab Faktor 4 Abweichung. Standardmäßig deaktiviert — die Schätzung
          ist stark stilabhängig (actionlastig vs. dialogreich). Nur Drehbuch-Format.
        </CheckRow>

        <CheckRow id="seitenzahl_im_bereich" label="Seitenzahl" auto={false} gating="warnung">
          Prüft ob die Stoppzeit-basierten Seitenzahlen im konfigurierten Bereich liegen.
          Standardmäßig deaktiviert. Nur manuell auslösbar.
        </CheckRow>

        <CheckRow id="dramaturgischer_tag_chronologie" label="Spieltag-Chronologie" auto={false} gating="warnung">
          Prüft ob die Spieltag-Nummern innerhalb der Folge in aufsteigender Reihenfolge vergeben sind.
          Rückblenden (mit gesetztem Flashback-Sondertyp) werden ausgenommen.
          Nur manuell auslösbar.
        </CheckRow>

        <GroupHeader title="NT & Konsistenz" color={C.blue} />

        <CheckRow id="nt_verweis" label="NT-Notiz" auto={true} gating="off">
          Erkennt „NT:" oder „(NT" im Szenentext — Hinweise die für den Nachtrag bestimmt
          waren und versehentlich im finalen Text geblieben sind.
          Standard-Gate ist „off", da manche Produktionen NT-Notizen bewusst im Text führen.
        </CheckRow>

        <CheckRow id="spieltag_inkonsistent" label="Spieltag-Inkonsistenz" auto={false} gating="warnung">
          Prüft ob Szenen derselben Szenen-Identität (gleicher Location-Block) unterschiedliche
          Spieltag-Nummern tragen. Nur manuell auslösbar.
        </CheckRow>

        <CheckRow id="nt_replik_konsistenz" label="NT-Replik-Konsistenz" auto={false} gating="warnung">
          Vergleicht NT-Repliken (in Klammern nach Figur) zwischen verschiedenen Szenen derselben Figur.
          Inkonsistente NT-Angaben deuten auf vergessene Aktualisierungen hin. Nur manuell.
        </CheckRow>

        <GroupHeader title="KI-gestützte Checks" color="#AF52DE" />

        <WarnBox title="KI-Checks und API-Kosten">
          Die folgenden Checks nutzen Mistral AI. Pro manuellem Check werden ca. 500–1.500 Tokens
          verbraucht. Beim Batch über 50 Szenen entspricht das 25.000–75.000 Tokens.
          Beide KI-Checks sind standardmäßig deaktiviert und laufen <strong>nie</strong> im Auto-Modus.
          Der Prompt ist in den DK-Einstellungen pro Produktion anpassbar.
        </WarnBox>

        <CheckRow id="oneliner_qualitaet" label="Oneliner-Qualität" auto={false} gating="off" ki={true}>
          Bewertet ob der Oneliner (Szenen-Zusammenfassung) den emotionalen Kern oder die
          dramaturgische Wendung wiedergibt — nicht nur den äußerlichen Ablauf.
          Empfohlen wenn alle Szenen konsequent mit Onelinern gepflegt werden.
        </CheckRow>

        <CheckRow id="spielzeit_uhrzeit" label="Spielzeit/Uhrzeit-Schätzung" auto={false} gating="warnung" ki={true} autofix="1klick">
          Batch-Level-Check: Schätzt für alle Szenen eines dramaturgischen Tages plausible Uhrzeiten (HH:MM)
          und trägt sie in das Spielzeit-Feld ein. Wird einmalig pro Batch ausgeführt,
          nicht pro Szene. Der 1-Klick-Fix trägt die KI-Schätzung als Spielzeit ein.
        </CheckRow>

      </Section>

      {/* ── 2. Auto vs. Manuell ── */}
      <Section title="2. Auto-Check vs. Manueller Check">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div style={{ border: `2px solid ${C.blue}44`, borderRadius: 10, background: C.blue + '07', padding: '16px 20px' }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: C.blue, marginBottom: 8 }}>⚡ Auto-Check</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: C.muted, lineHeight: 1.8 }}>
              <li>Läuft nach jedem Autosave (3 s Debounce)</li>
              <li>Nicht blockierend — Speichern passiert immer</li>
              <li>Nur aktivierte Auto-Checks werden ausgeführt</li>
              <li>KI-Checks <strong>nie</strong> im Auto-Modus</li>
              <li>Ergebnis erscheint als Badge ⚠ in Szenenleiste</li>
            </ul>
          </div>
          <div style={{ border: `2px solid ${C.gray}44`, borderRadius: 10, background: C.gray + '07', padding: '16px 20px' }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 8 }}>🖱 Manueller Check</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: C.muted, lineHeight: 1.8 }}>
              <li>Über Kontextmenü → <strong>Verwalten → Checks ausführen</strong></li>
              <li>Oder im Check-Panel → <strong>Neu prüfen</strong></li>
              <li>Führt alle aktiven Checks aus — inkl. KI-Checks</li>
              <li>Batch: Alle Szenen einer Werkstufe auf einmal</li>
            </ul>
          </div>
        </div>

        <InfoBox title="Wann laufen Auto-Checks?" color={C.blue}>
          Autosave greift nach 3 Sekunden Tippstop im Editor. Danach wird gespeichert
          und unmittelbar danach (im Hintergrund, ohne UI-Blockierung) werden die Auto-Checks ausgeführt.
          Das Badge in der Szenenleiste aktualisiert sich live — kein Reload nötig.
        </InfoBox>
      </Section>

      {/* ── 3. Ergebnisse im UI ── */}
      <Section title="3. Wo erscheinen die Ergebnisse?">

        <UiStep nr="A" label="Szenenleiste — Badge pro Szene">
          In der linken Szenenleiste erscheint neben dem Szenentitel ein <MockBadge count={2} /> Badge
          sobald offene Hinweise existieren. Die Zahl zeigt die Gesamtanzahl.
        </UiStep>

        <UiStep nr="B" label="Szenenkopf — ⚠-Button">
          Im Szenenkopf erscheint bei offenen Hinweisen ein{' '}
          <span style={{ color: C.orange, fontWeight: 600 }}>⚠ 2</span>-Button.
          Klick darauf öffnet das Check-Panel direkt unterhalb des Szenenkopfs.
        </UiStep>

        <UiStep nr="C" label="Check-Panel — Hinweise im Detail">
          Das aufgeklappte Panel zeigt jeden Hinweis mit Meldungstext, Check-Typ,
          „✓ Als behoben markieren"-Button und „Neu prüfen"-Knopf.
        </UiStep>

        <UiStep nr="D" label="Check-Gate-Modal — beim Setzen des Produktionsfassung-Labels">
          Beim Setzen eines Fassungs-Labels das als Produktionsfassung konfiguriert ist,
          öffnet sich automatisch das Check-Gate-Modal (Abschnitt 4).
        </UiStep>

      </Section>

      {/* ── 4. Check-Gate ── */}
      <Section title="4. Check-Gate — Validierung vor dem Lock">

        <div style={{
          background: `linear-gradient(135deg, #FF3B3010 0%, #FFCC0010 100%)`,
          border: `1px solid #FF3B3033`, borderRadius: 12,
          padding: '16px 20px', marginBottom: 20,
        }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
            🔒 Was ist das Check-Gate?
          </div>
          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.65 }}>
            Wenn eine Werkstufe das <strong>Produktionsfassung-Label</strong> erhält (z.B. „Abgabe Redaktion"),
            wird die Werkstufe gesperrt und kann danach nicht mehr bearbeitet werden.
            Das Check-Gate schützt vor voreiligem Sperren: es öffnet ein Modal mit allen offenen
            Check-Ergebnissen aus der Datenbank (kein neuer Check-Lauf) — gruppiert nach Schwere.
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
          <div style={{
            border: '2px solid #FF3B3066', borderRadius: 10, background: '#FF3B3008',
            padding: '14px 16px',
          }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: '#FF3B30', marginBottom: 6 }}>
              🚫 Blocker
            </div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
              Lock wird <strong>verhindert</strong>. Fehler müssen behoben werden,
              bevor das Label gesetzt werden kann. Kein Override möglich.
            </div>
          </div>
          <div style={{
            border: '2px solid #FFCC0066', borderRadius: 10, background: '#FFCC0008',
            padding: '14px 16px',
          }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: '#996600', marginBottom: 6 }}>
              ⚠ Warnungen
            </div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
              Lock <strong>möglich</strong>, aber nur mit bewusstem Override.
              Der Button „Trotzdem sperren" wird angezeigt — eine explizite Entscheidung
              wird protokolliert.
            </div>
          </div>
          <div style={{
            border: `2px solid ${C.gray}44`, borderRadius: 10, background: C.gray + '07',
            padding: '14px 16px',
          }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: C.text, marginBottom: 6 }}>
              ℹ Hinweise
            </div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
              Rein informativ. Lock wird nicht beeinflusst.
              Zeigt den Stand der Checks zum Zeitpunkt des Setzens.
            </div>
          </div>
        </div>

        {/* Mock-Modal */}
        <div style={{
          border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden',
          boxShadow: '0 4px 20px rgba(0,0,0,0.12)', maxWidth: 520, margin: '0 auto',
        }}>
          <div style={{
            padding: '14px 18px 10px', borderBottom: `1px solid ${C.border}`,
            background: 'var(--bg)',
          }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Check-Gate: Label „Abgabe Redaktion"</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Qualitätsprüfung vor dem Sperren der Werkstufe</div>
          </div>
          <div style={{ padding: '14px 18px', background: 'var(--bg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: '#FF3B30' }}>●</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#FF3B30', textTransform: 'uppercase' }}>
                Blocker (1) — Lock blockiert
              </span>
            </div>
            <div style={{ borderLeft: '3px solid #FF3B30', paddingLeft: 12, marginBottom: 14 }}>
              <div style={{ fontSize: 12, padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontWeight: 500 }}>Pflichtfelder <span style={{ color: C.muted, fontSize: 11 }}>Sz. 3</span></div>
                <div style={{ fontSize: 11, color: C.muted }}>Szenenkopf: Tageszeit fehlt</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: '#996600' }}>⚠</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#996600', textTransform: 'uppercase' }}>
                Warnungen (2)
              </span>
            </div>
            <div style={{ borderLeft: '3px solid #FFCC00', paddingLeft: 12 }}>
              <div style={{ fontSize: 12, padding: '5px 0', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontWeight: 500 }}>Rollen-Konsistenz <span style={{ color: C.muted, fontSize: 11 }}>Sz. 7</span></div>
                <div style={{ fontSize: 11, color: C.muted }}>HANNA im Text, nicht in Rollen eingetragen</div>
              </div>
              <div style={{ fontSize: 12, padding: '5px 0' }}>
                <div style={{ fontWeight: 500 }}>Motiv-Schreibweise <span style={{ color: C.muted, fontSize: 11 }}>Sz. 12</span></div>
                <div style={{ fontSize: 11, color: C.muted }}>„Krankenhaus/Station" vs. „Krankenhaus / Station"</div>
              </div>
            </div>
          </div>
          <div style={{
            padding: '10px 18px', borderTop: `1px solid ${C.border}`,
            display: 'flex', justifyContent: 'flex-end', gap: 8, background: 'var(--bg)',
          }}>
            <button style={{
              fontSize: 12, padding: '6px 14px', border: `1px solid ${C.border}`,
              borderRadius: 7, background: 'transparent', color: C.muted, cursor: 'default',
            }}>Abbrechen</button>
            <button style={{
              fontSize: 12, padding: '6px 14px', border: '1px solid #FF3B30',
              borderRadius: 7, background: 'transparent', color: '#FF3B30', cursor: 'default', opacity: 0.5,
            }}>Sperren (deaktiviert bei Blocker)</button>
          </div>
        </div>

        <InfoBox title="Kein neuer Check-Lauf beim Gate" color={C.blue} style={{ marginTop: 20 }}>
          Das Check-Gate liest nur die in der Datenbank gespeicherten Ergebnisse aus dem letzten
          Check-Lauf — es führt keinen neuen Check aus. Daher empfiehlt es sich, vor dem
          Setzen des Produktionsfassung-Labels einen manuellen Batch-Check auszuführen,
          damit das Gate auf aktuellem Stand ist.
        </InfoBox>

        <InfoBox title="Gate-Fehler sind nicht-fatal" color={C.orange} style={{ marginTop: 8 }}>
          Wenn der Gate-Check selbst fehlschlägt (z.B. Datenbankfehler), wird der Lock-Vorgang
          durchgelassen. Das Gate soll absichern — aber nicht im Fehlerfall blockieren.
        </InfoBox>

      </Section>

      {/* ── 5. Konfiguration ── */}
      <Section title="5. Konfiguration in den DK-Einstellungen">

        <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.65, marginBottom: 16 }}>
          Unter <strong>DK-Einstellungen → Drehbuch-Checks</strong> kann jeder Check pro Produktion
          auf vier Achsen konfiguriert werden:
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 16px', background: 'var(--bg-surface)' }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>✓ Aktiv</div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.65 }}>
              Der Check wird grundsätzlich ausgeführt. Deaktivieren schaltet ihn vollständig aus —
              auch beim manuellen Check und im Check-Gate.
            </div>
          </div>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 16px', background: 'var(--bg-surface)' }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>⚡ Auto</div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.65 }}>
              Bestimmt ob der Check beim Autosave mitläuft. Kann nur gesetzt werden
              wenn „Aktiv" aktiv ist. KI-Checks haben keinen Auto-Toggle.
            </div>
          </div>
          <div style={{ border: `2px solid #FF3B3033`, borderRadius: 8, padding: '14px 16px', background: '#FF3B3007' }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>🔒 Lock-Gate</div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.65 }}>
              Bestimmt das Verhalten im Check-Gate-Modal:
              <br />• <strong style={{ color: '#FF3B30' }}>Blocker</strong> — Lock verhindert
              <br />• <strong style={{ color: '#996600' }}>Warnung</strong> — Lock mit Override möglich
              <br />• <strong style={{ color: C.gray }}>off</strong> — Gate ignoriert diesen Check
            </div>
          </div>
          <div style={{ border: `1px solid ${C.green}33`, borderRadius: 8, padding: '14px 16px', background: C.green + '07' }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>⚙ Autofix</div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.65 }}>
              Zeigt an ob ein automatischer Fix verfügbar ist:
              <br />• <strong style={{ color: C.green }}>1-Klick-Fix</strong> — sichtbarer Button im Check-Panel
              <br />• <strong style={{ color: C.green }}>Auto-Fix</strong> — wird lautlos beim nächsten Save angewendet
              <br />Nicht konfigurierbar — ist im Check hinterlegt.
            </div>
          </div>
        </div>

        <InfoBox title="Einstellungen sind produktionsspezifisch" color={C.blue}>
          Jede Produktion hat eigene Check-Einstellungen. Produktionen ohne Strang-Verwaltung
          schalten „Strang-Zuordnung" einfach aus — ohne andere Produktionen zu beeinflussen.
          Für KI-Checks kann der Prompt pro Produktion überschrieben werden
          (Feld unterhalb des Check-Eintrags in den DK-Einstellungen).
        </InfoBox>

      </Section>

      {/* ── 6. FAQ ── */}
      <Section title="6. Häufige Fragen">

        <FaqItem q="Blockiert ein offener Check den Export?" a={
          <>Nein. Checks sind informativ — sie blockieren weder das Speichern noch den normalen Export.
          Nur das Setzen eines Produktionsfassung-Labels wird durch das Check-Gate validiert (Abschnitt 4).</>
        } />

        <FaqItem q="Was passiert wenn das Check-Gate Blocker findet?" a={
          <>Der Label-Vorgang wird abgebrochen — die Werkstufe bleibt unverändert.
          Das Modal zeigt welche Szenen betroffen sind und bietet „Zur Szene →"-Links
          zur direkten Navigation. Die Fehler müssen zuerst behoben und danach
          ein neuer Check-Lauf ausgeführt werden.</>
        } />

        <FaqItem q="Kann ich Warnungen im Check-Gate ignorieren?" a={
          <>Ja. Wenn nur Warnungen (keine Blocker) offen sind, erscheint der Button „Trotzdem sperren".
          Damit wird der Lock mit einem Override-Flag durchgeführt — das System protokolliert,
          dass Warnungen bewusst akzeptiert wurden.</>
        } />

        <FaqItem q="Warum sieht das Gate-Modal veraltete Ergebnisse?" a={
          <>Das Gate liest nur gespeicherte Ergebnisse aus dem letzten Check-Lauf.
          Vor dem Setzen eines Produktionsfassung-Labels empfiehlt sich ein manueller
          Batch-Check über alle Szenen der Werkstufe, um aktuelle Ergebnisse zu haben.</>
        } />

        <FaqItem q="Verschwinden die Badges wenn ich den Fehler korrigiere?" a={
          <>Nur wenn nach der Korrektur der Check erneut läuft. Beim nächsten Autosave werden
          alle Auto-Checks neu ausgeführt und der Badge aktualisiert sich. Alternativ:
          im Check-Panel auf „Neu prüfen" oder einzelne Hinweise manuell als „behoben" markieren.</>
        } />

        <FaqItem q="Was bedeutet «als behoben markieren»?" a={
          <>Der Hinweis wird als behoben markiert und aus dem Panel entfernt ohne dass der Check erneut läuft.
          Sinnvoll für absichtliche Ausnahmen (z.B. Szene ohne Strang die auch keine haben soll).
          Beim nächsten automatischen Check-Lauf wird die Szene aber wieder geprüft.</>
        } />

        <FaqItem q="Werden Checks für alle Werkstufen ausgeführt?" a={
          <>Immer nur für die aktuell angezeigte Werkstufe im Editor. Das Badge und das Check-Gate
          beziehen sich ebenfalls nur auf die aktive Werkstufe.</>
        } />

        <FaqItem q="Warum läuft der Spielzeit/Uhrzeit-Check nicht für eine einzelne Szene?" a={
          <>Der spielzeit_uhrzeit-Check ist ein Batch-Level-Check — er analysiert alle Szenen
          eines dramaturgischen Tages zusammen, um konsistente Uhrzeiten zu schätzen.
          Er kann nur über den Batch-Check für eine ganze Werkstufe ausgeführt werden.</>
        } />

      </Section>

    </div>
  )
}
