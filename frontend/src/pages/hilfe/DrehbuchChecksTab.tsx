import { C, Section, FaqItem, InfoBox, WarnBox } from './_shared'

// ── Mini-Bausteine ─────────────────────────────────────────────────────────────

function CheckCard({ icon, title, color, auto, ki, children }: {
  icon: string; title: string; color: string; auto: boolean; ki?: boolean; children: React.ReactNode
}) {
  return (
    <div style={{
      border: `1px solid ${color}44`,
      borderLeft: `4px solid ${color}`,
      borderRadius: 8,
      background: color + '07',
      padding: '14px 18px',
      marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{title}</span>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
          background: auto ? C.blue + '20' : C.gray + '20',
          border: `1px solid ${auto ? C.blue + '55' : C.gray + '44'}`,
          color: auto ? C.blue : C.gray,
        }}>
          {auto ? 'Auto' : 'Nur manuell'}
        </span>
        {ki && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
            background: C.purple + '20', border: `1px solid ${C.purple}44`, color: C.purple,
          }}>
            ✨ KI
          </span>
        )}
      </div>
      <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7 }}>{children}</div>
    </div>
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

// ── Haupt-Tab ─────────────────────────────────────────────────────────────────

export default function DrehbuchChecksTab() {
  return (
    <div>

      {/* Intro */}
      <div style={{
        background: `linear-gradient(135deg, ${C.orange}18 0%, ${C.blue}10 100%)`,
        border: `1px solid ${C.orange}33`,
        borderRadius: 12,
        padding: '20px 24px',
        marginBottom: 32,
        display: 'flex', gap: 16, alignItems: 'flex-start',
      }}>
        <div style={{ fontSize: 32, lineHeight: 1, flexShrink: 0 }}>🔍</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>
            Drehbuch-Checks — automatische Qualitätsprüfung
          </div>
          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.65 }}>
            Die Script-App prüft beim Speichern jeder Szene automatisch auf häufige Fehler:
            fehlende Motive, inkonsistente Rollen, ungekennzeichnete Sondertypen und mehr.
            Probleme erscheinen als <MockBadge count={2} /> Badge in der Szenenleiste
            und öffnen auf Klick ein Detail-Panel im Szenenkopf.
            Alle Checks sind pro Produktion in den <strong>DK-Einstellungen → Drehbuch-Checks</strong> konfigurierbar.
          </div>
        </div>
      </div>

      {/* ── 1. Die Checks im Überblick ── */}
      <Section title="1. Die Checks im Überblick">

        <CheckCard icon="🎯" title="Motiv angegeben?" color={C.blue} auto={true}>
          Prüft ob das Motiv-Feld im Szenenkopf ausgefüllt ist.
          Ein fehlendes Motiv verhindert korrekte Breakdowns und den Drehplan-Export.
          Tritt besonders häufig bei Szenen auf, die direkt nach einem Import angelegt wurden.
        </CheckCard>

        <CheckCard icon="👥" title="Rollen-Konsistenz" color={C.green} auto={true}>
          Vergleicht bidirektional:
          <ul style={{ margin: '8px 0 0 0', paddingLeft: 20, lineHeight: 1.8 }}>
            <li>
              <strong>Im Text, nicht im Szenenkopf:</strong> Ein Figurenname aus der Figurendatenbank
              erscheint in GROSSBUCHSTABEN im Szenentext, ist aber nicht in den Rollen eingetragen — wahrscheinlich vergessen.
            </li>
            <li>
              <strong>Im Szenenkopf, nicht im Text:</strong> Eine Figur ist im Szenenkopf eingetragen,
              taucht aber nirgends im Szenentext auf — möglicherweise versehentlich hinzugefügt oder nach einem Umbenennen nicht aktualisiert.
            </li>
          </ul>
          <div style={{ marginTop: 8, fontSize: 12, color: C.muted }}>
            Nur Figuren aus der Figurendatenbank dieser Produktion werden geprüft (typisch: 20–50 Namen).
          </div>
        </CheckCard>

        <CheckCard icon="📞" title="Sondertypen & Wechselschnitte" color={C.blue} auto={true}>
          Zwei Prüfungen in einem:
          <ul style={{ margin: '8px 0 0 0', paddingLeft: 20, lineHeight: 1.8 }}>
            <li>
              <strong>Sondertyp gesetzt, Partner fehlt:</strong> Die Szene ist als Wechselschnitt markiert,
              aber kein Telefonpartner ist im Szenenkopf angegeben.
            </li>
            <li>
              <strong>Stichwort im Text, Typ nicht gesetzt:</strong> Im Szenentext steht
              „WECHSELSCHNITT" oder „WS:" — der Sondertyp wurde aber vergessen zu setzen.
            </li>
          </ul>
        </CheckCard>

        <CheckCard icon="🧶" title="Strang-Zuordnung" color={C.purple} auto={true}>
          Prüft ob die Szene mindestens einem Story-Strang zugeordnet ist.
          Der Check wird nur ausgelöst, wenn für diese Produktion überhaupt Stränge angelegt wurden —
          bei Produktionen ohne Strang-Verwaltung bleibt er stumm.
          <div style={{ marginTop: 8, fontSize: 12, color: C.muted }}>
            Hinweis: Nicht jede Szene muss zwingend einem Strang gehören.
            Reine Produktionsszenen (z.B. Inserts, Übergänge) können den Hinweis ignorieren.
          </div>
        </CheckCard>

        <CheckCard icon="🔁" title="Duplikat-Motiv im Block" color={C.orange} auto={true}>
          Erkennt wenn dieselbe Motivkombination (<em>Motiv + Innen/Außen + Tageszeit</em>) bereits
          in einer anderen Szene derselben Folge vorkommt.
          Doppelte Motive entstehen oft durch Kopieren und nicht angepasstes Umbenennen.
          Absichtliche Wiederholungen (Rahmenhandlung, Prolog/Epilog) können einzeln als behoben markiert werden.
        </CheckCard>

        <CheckCard icon="⏱" title="Stoppzeit-Plausibilität" color={C.gray} auto={false}>
          Vergleicht die eingetragene Stoppzeit mit der geschätzten Spielzeit aus der Textlänge.
          <br />
          <strong>Faustregel:</strong> 1 Seite ≈ 1 Minute ≈ ca. 1.800 Zeichen.
          Eine Warnung erscheint bei mehr als Faktor 4 Abweichung (z.B. 30 Sek. Stoppzeit für 3 Seiten Text).
          <div style={{ marginTop: 8 }}>
            <strong>Nur manuell</strong> — standardmäßig deaktiviert, da die Schätzung
            stark vom Drehbuch-Stil abhängt (actionlastig vs. dialogreich).
            Gilt nur für Drehbuch-Format, nicht für Storyline.
          </div>
        </CheckCard>

        <CheckCard icon="💡" title="Oneliner-Qualität" color={C.purple} auto={false} ki={true}>
          Bewertet ob der Oneliner (Szenen-Zusammenfassung) den emotionalen Kern
          oder die dramaturgische Wendung der Szene wiedergibt — nicht nur den äußerlichen Ablauf.
          <div style={{ marginTop: 8 }}>
            <strong>✨ KI-Feature:</strong> Nutzt Mistral AI zur Analyse — daher API-Kosten.
            Wird <strong>nie</strong> beim Autosave ausgeführt, nur manuell per Kontextmenü oder Check-Panel.
            Empfohlen wenn alle Szenen konsequent mit Onelinern gepflegt werden.
          </div>
        </CheckCard>

      </Section>

      {/* ── 2. Auto vs. Manuell ── */}
      <Section title="2. Auto-Check vs. Manueller Check">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div style={{
            border: `2px solid ${C.blue}44`, borderRadius: 10,
            background: C.blue + '07', padding: '16px 20px',
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: C.blue, marginBottom: 8 }}>⚡ Auto-Check</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: C.muted, lineHeight: 1.8 }}>
              <li>Läuft nach jedem Autosave (3 s Debounce)</li>
              <li>Nicht blockierend — Speichern passiert immer</li>
              <li>Nur aktivierte Auto-Checks werden ausgeführt</li>
              <li>KI-Checks <strong>nie</strong> im Auto-Modus</li>
              <li>Ergebnis erscheint als Badge ⚠ in Szenenleiste</li>
            </ul>
          </div>
          <div style={{
            border: `2px solid ${C.gray}44`, borderRadius: 10,
            background: C.gray + '07', padding: '16px 20px',
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 8 }}>🖱 Manueller Check</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: C.muted, lineHeight: 1.8 }}>
              <li>Über Kontextmenü der Szene → <strong>Verwalten → Checks ausführen</strong></li>
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

      {/* ── 3. UI — wo erscheinen die Ergebnisse ── */}
      <Section title="3. Wo erscheinen die Ergebnisse?">

        <UiStep nr="A" label="Szenenleiste — Badge pro Szene">
          In der linken Szenenleiste erscheint neben dem Szentitel ein <MockBadge count={2} /> Badge
          sobald offene Hinweise existieren. Die Zahl zeigt die Gesamtanzahl.
          Beim Hovern erklärt ein Tooltip, dass die Szene geöffnet werden muss für Details.
        </UiStep>

        <UiStep nr="B" label="Szenenkopf — ⚠-Button">
          Im Szenenkopf (rechts neben dem Speicher-Indikator) erscheint bei offenen Hinweisen
          ein <span style={{ color: C.orange, fontWeight: 600 }}>⚠ 2</span>-Button.
          Klick darauf öffnet das Check-Panel direkt unterhalb des Szenenkopfs.
        </UiStep>

        <UiStep nr="C" label="Check-Panel — Hinweise im Detail">
          Das aufgeklappte Panel zeigt jeden Hinweis mit:
          <ul style={{ margin: '4px 0 0 0', paddingLeft: 18, fontSize: 12, color: C.muted, lineHeight: 1.8 }}>
            <li><strong>Meldungstext</strong> — konkrete Beschreibung des Problems</li>
            <li><strong>Check-Typ</strong> — z.B. „Rollen-Konsistenz", „Duplikat-Motiv"</li>
            <li><strong>✓ Als behoben markieren</strong> — entfernt den Hinweis aus der Liste (Badge sinkt)</li>
            <li><strong>Neu prüfen</strong> — führt alle Checks sofort erneut aus</li>
          </ul>
        </UiStep>

        <div style={{
          background: 'var(--bg-surface)',
          border: `1px solid ${C.border}`,
          borderRadius: 10,
          overflow: 'hidden',
          marginTop: 8,
        }}>
          <div style={{
            background: C.orange + '15',
            borderBottom: `1px solid ${C.orange}33`,
            padding: '10px 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.orange, display: 'flex', alignItems: 'center', gap: 6 }}>
              ⚠ Drehbuch-Checks · 2 Hinweise
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Neu prüfen &nbsp;✕</span>
          </div>
          {[
            { typ: 'Rollen-Konsistenz', msg: 'HANNA im Text, aber nicht in Rollen eingetragen' },
            { typ: 'Strang-Zuordnung',  msg: 'Szene ist keinem Story-Strang zugeordnet' },
          ].map((r, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '9px 16px',
              borderBottom: i === 0 ? `1px solid ${C.border}` : undefined,
              fontSize: 12,
            }}>
              <span style={{ color: C.orange, marginTop: 1 }}>⚠</span>
              <div style={{ flex: 1 }}>
                <div style={{ color: 'var(--text-primary)' }}>{r.msg}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginTop: 2 }}>{r.typ}</div>
              </div>
              <span style={{ color: C.green, fontSize: 11, flexShrink: 0, marginTop: 1 }}>✓</span>
            </div>
          ))}
        </div>

      </Section>

      {/* ── 4. DK-Einstellungen ── */}
      <Section title="4. Konfiguration in den DK-Einstellungen">
        <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.65, marginBottom: 16 }}>
          Unter <strong>DK-Einstellungen → Drehbuch-Checks</strong> kann jeder Check pro Produktion ein- oder ausgeschaltet werden.
          Zwei Spalten steuern das Verhalten:
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 16px', background: 'var(--bg-surface)' }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Aktiv</div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.65 }}>
              Der Check wird grundsätzlich ausgeführt — sowohl beim Autosave (wenn Auto aktiviert)
              als auch beim manuellen Aufruf. Deaktivieren entfernt den Check vollständig.
            </div>
          </div>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 16px', background: 'var(--bg-surface)' }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Auto</div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.65 }}>
              Bestimmt ob der Check beim Autosave mitläuft. Kann nur aktiviert werden wenn „Aktiv" gesetzt ist.
              KI-Checks haben keinen Auto-Toggle — sie sind immer nur manuell.
            </div>
          </div>
        </div>

        <InfoBox title="Einstellungen sind produktionsspezifisch" color={C.blue}>
          Jede Produktion kann eigene Check-Einstellungen haben. Wer z.B. für eine Produktion keine
          Stränge verwendet, schaltet „Strang-Zuordnung" einfach aus — ohne andere Produktionen zu beeinflussen.
        </InfoBox>

        <WarnBox title="KI-Checks und API-Kosten">
          Der Check „Oneliner-Qualität" nutzt Mistral AI. Pro manuellem Check-Aufruf für eine Szene
          werden ca. 500–1.000 Tokens verbraucht. Bei einem Batch über 50 Szenen entspricht
          das ~25.000–50.000 Tokens. Die API-Kosten trägt die Produktion — daher ist der Check
          standardmäßig deaktiviert und nie im Auto-Modus.
        </WarnBox>
      </Section>

      {/* ── 5. FAQ ── */}
      <Section title="5. Häufige Fragen">

        <FaqItem q="Blockiert ein offener Hinweis den Export?" a={
          <>Nein. Hinweise sind informativer Natur — sie blockieren weder das Speichern noch den Export.
          Beim Export gibt es eine optionale Ansicht aller Szenen mit offenen Hinweisen,
          die vor dem Download angezeigt werden kann.</>
        } />

        <FaqItem q="Verschwinden die Badges wenn ich die Fehler korrigiere?" a={
          <>Nur wenn nach der Korrektur der Check erneut läuft. Beim nächsten Autosave werden alle Auto-Checks
          automatisch neu ausgeführt und der Badge aktualisiert sich. Alternativ: im Check-Panel
          auf „Neu prüfen" klicken oder einzelne Hinweise manuell als „behoben" markieren.</>
        } />

        <FaqItem q="Was bedeutet «als behoben markieren»?" a={
          <>Der Hinweis wird in der Datenbank als behoben markiert und aus dem Panel entfernt — ohne dass
          der Check erneut läuft. Das ist sinnvoll für absichtliche Ausnahmen (z.B. eine Szene ohne Strang
          die auch keine haben soll). Beim nächsten automatischen Check-Lauf wird die Szene aber wieder
          geprüft und taucht ggf. erneut auf wenn die Bedingung noch erfüllt ist.</>
        } />

        <FaqItem q="Warum taucht die Stoppzeit-Prüfung nie auf?" a={
          <>Sie ist standardmäßig deaktiviert und nur manuell auslösbar. Zusätzlich greift sie nur bei
          Szenen im Drehbuch-Format (nicht Storyline) und erst ab 200 Zeichen Textlänge,
          damit leere Szenenköpfe nicht fälschlicherweise gewarnt werden.</>
        } />

        <FaqItem q="Funktioniert die Rollen-Konsistenz auch bei Suffixen wie (OFF) oder (NT)?" a={
          <>Ja — die Prüfung sucht im vollen Plaintext nach GROSSBUCHSTABEN-Vorkommen. Ein Eintrag
          wie „HANNA (OFF)" wird erkannt sobald „HANNA" als Großbuchstaben-Wort vorkommt.
          Der Suffix ändert nichts an der Groß-Klein-Erkennung.</>
        } />

        <FaqItem q="Werden Checks für alle Werkstufen ausgeführt?" a={
          <>Immer nur für die aktuell angezeigte Werkstufe im Editor. Das Badge in der Szenenleiste
          bezieht sich ebenfalls nur auf die aktive Werkstufe. Beim Wechsel der Werkstufe werden
          die Badges für die neue Werkstufe geladen.</>
        } />

      </Section>

    </div>
  )
}
