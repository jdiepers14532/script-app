import { C, Section, InfoBox, WarnBox } from './_shared'

function ErsteSchritteTab() {
  const Step = ({ num, title, children }: { num: number; title: string; children: React.ReactNode }) => (
    <div style={{
      display: 'flex', gap: 20, marginBottom: 28,
    }}>
      <div style={{
        flexShrink: 0,
        width: 36, height: 36,
        borderRadius: '50%',
        background: C.blue,
        color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: 15,
      }}>
        {num}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: C.text }}>{title}</div>
        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7 }}>{children}</div>
      </div>
    </div>
  )

  const Shortcut = ({ keys }: { keys: string }) => (
    <kbd style={{
      display: 'inline-block',
      background: C.subtle,
      border: `1px solid ${C.border}`,
      borderRadius: 4,
      padding: '1px 6px',
      fontSize: 11,
      fontFamily: 'monospace',
      color: C.text,
      marginLeft: 4,
    }}>{keys}</kbd>
  )

  return (
    <div style={{ padding: '28px 0' }}>

      {/* ── Intro ── */}
      <div style={{
        background: `linear-gradient(135deg, ${C.blue}15 0%, ${C.green}12 100%)`,
        border: `1px solid ${C.blue}33`,
        borderRadius: 12,
        padding: '24px 28px',
        marginBottom: 36,
      }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Willkommen in der Script-App</div>
        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
          Die Script-App ist das zentrale Werkzeug für Autorinnen und Autoren von Rote Rosen —
          vom ersten Storyline-Entwurf bis zur abgegebenen Produktionsfassung.
          Diese Seite zeigt, wie man in wenigen Schritten startet.
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      <Section title="Schnellstart — In 5 Schritten zur ersten Szene">

        <Step num={1} title="Episode öffnen">
          Auf der Startseite die gewünschte <strong>Episode</strong> aus der Liste wählen und anklicken.
          Alternativ oben links die Produktions- und Episodenauswahl nutzen.
          Die aktuelle Episode ist immer in der Kopfleiste sichtbar.
        </Step>

        <Step num={2} title="Fassung auswählen">
          Nach dem Öffnen einer Episode erscheint eine Übersicht aller vorhandenen Fassungen
          (Storyline, Drehbuch V1, Produktionsfassung…). Die gewünschte Fassung anklicken.
          Noch keine Fassung vorhanden? Über <strong>„+ Neue Fassung"</strong> anlegen.
        </Step>

        <Step num={3} title="Szene auswählen oder anlegen">
          In der <strong>Szenenleiste links</strong> alle Szenen der Fassung sehen.
          Eine Szene anklicken, um sie zu öffnen.
          Neue Szene anlegen: Schaltfläche <strong>„+ Szene"</strong> am Ende der Liste,
          oder Rechtsklick in der Liste → <em>„Szene davor/danach einfügen"</em>.
        </Step>

        <Step num={4} title="Szenenkopf ausfüllen">
          Im <strong>Szenenkopf</strong> (oben rechts) stehen die wichtigsten Angaben zur Szene:
          Motivname, INT/EXT, Tageszeit, Zusammenfassung, beteiligte Rollen.
          Diese Felder lassen sich jederzeit bearbeiten — ein Klick genügt.
        </Step>

        <Step num={5} title="Text schreiben">
          Im <strong>Schreibbereich</strong> darunter den Szenentext eingeben.
          Der Editor speichert automatisch.
          Zwischen Storyline- und Drehbuch-Ansicht über die Tabs oben im Schreibbereich wechseln.
          <br /><br />
          Nützliche Tastenkürzel im Drehbuch-Editor:
          <ul style={{ marginTop: 8, paddingLeft: 20, lineHeight: 2 }}>
            <li><strong>Tab</strong> — zum nächsten Elementtyp (z.B. Aktion → Dialog)</li>
            <li><strong>Enter</strong> — neues Element in der Standardfolge anlegen</li>
            <li><Shortcut keys="Alt+Z" /> — Fokus-Modus (blendet Analysen-Bereich aus)</li>
            <li><Shortcut keys="Ctrl+H" /> — Suchen &amp; Ersetzen öffnen</li>
          </ul>
        </Step>

        <InfoBox title="Automatisches Speichern" color={C.green}>
          Alle Änderungen werden automatisch gespeichert — kein manuelles Speichern nötig.
          Der Verbindungsstatus ist oben rechts sichtbar (grün = verbunden, gelb = zwischengespeichert).
          Auch ohne Internetverbindung kann weiter geschrieben werden — die Änderungen werden
          beim nächsten Verbindungsaufbau automatisch synchronisiert.
        </InfoBox>

      </Section>

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      <Section title="Das Arbeitsfenster auf einen Blick">

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 16,
          marginBottom: 24,
        }}>
          {[
            {
              color: C.blue,
              icon: '☰',
              title: 'Szenenleiste (links)',
              items: [
                'Alle Szenen der Fassung',
                'Klick → Szene öffnen',
                'Drag & Drop → Reihenfolge ändern',
                'Rechtsklick → Szene einfügen, kopieren, löschen',
                'Farbbadge → ungelesene Kommentare',
              ],
            },
            {
              color: C.green,
              icon: '✏',
              title: 'Schreibbereich (Mitte)',
              items: [
                'Szenenkopf: alle Metadaten',
                'Storyline-Tab: freier Text',
                'Drehbuch-Tab: Drehbuchformat',
                'Beide Tabs nebeneinander möglich',
                'Inline-Kommentare per Auswahl',
              ],
            },
            {
              color: C.purple,
              icon: '◈',
              title: 'Analysen (rechts)',
              items: [
                'Vorstopp (Spielzeit der Szene)',
                'Rollen & Komparsen der Szene',
                'Story-Stränge',
                'Mit Fokus-Modus ausblendbar',
              ],
            },
          ].map(col => (
            <div key={col.title} style={{
              border: `1px solid ${col.color}33`,
              borderRadius: 10,
              overflow: 'hidden',
            }}>
              <div style={{
                background: col.color,
                color: '#fff',
                padding: '10px 14px',
                fontWeight: 700,
                fontSize: 12,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{ fontSize: 16 }}>{col.icon}</span>
                {col.title}
              </div>
              <ul style={{ margin: 0, padding: '12px 14px 12px 28px', fontSize: 11, color: C.muted, lineHeight: 1.9 }}>
                {col.items.map(item => <li key={item}>{item}</li>)}
              </ul>
            </div>
          ))}
        </div>

      </Section>

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      <Section title="Häufige erste Fragen">

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {[
            {
              q: 'Wie wechsle ich die Episode?',
              a: 'Oben links in der Kopfleiste auf den Episodennamen klicken — ein Dropdown mit allen Episoden der Produktion öffnet sich.',
            },
            {
              q: 'Wie lege ich eine neue Fassung an?',
              a: 'In der Episodenansicht auf „+ Neue Fassung" klicken. Typ wählen (Storyline, Drehbuch, Notiz) und Namen vergeben.',
            },
            {
              q: 'Kann ich die App auf dem Handy nutzen?',
              a: 'Ja. Die App kann als PWA installiert werden: Im Browser auf „App installieren" (iOS: Teilen-Symbol → Zum Home-Bildschirm) tippen. Mehr dazu im Tab „App installieren".',
            },
            {
              q: 'Funktioniert die App auch ohne Internet?',
              a: 'Ja, mit eingeschränktem Funktionsumfang. Bereits geöffnete Inhalte sind verfügbar, Änderungen werden lokal gespeichert und beim nächsten Verbindungsaufbau synchronisiert.',
            },
            {
              q: 'Wie exportiere ich ein Drehbuch als PDF?',
              a: 'In der Episoden- oder Fassungsansicht auf den Export-Button (Pfeil-nach-unten-Symbol) klicken. Format wählen (PDF, Fountain, FDX) und herunterladen.',
            },
            {
              q: 'Wo finde ich alle Fassungen einer Episode?',
              a: 'Im Tab „Szenen & Fassungen" gibt es eine Übersicht. Alternativ: In der Episode auf den Tab-Reiter „Fassungen" klicken.',
            },
          ].map(item => (
            <div key={item.q} style={{
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              padding: '14px 16px',
              background: C.surface,
            }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: C.text, marginBottom: 6 }}>{item.q}</div>
              <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.65 }}>{item.a}</div>
            </div>
          ))}
        </div>

      </Section>

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      <Section title="Wo finde ich was?">
        <p style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>
          Alle Themen sind im Handbuch links verfügbar. Hier ein Überblick der wichtigsten:
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { icon: '📲', label: 'App installieren (PWA)', id: 'pwa-installation', desc: 'Auf Handy, Tablet oder Desktop installieren' },
            { icon: '📶', label: 'Offline-Modus', id: 'offline', desc: 'Arbeiten ohne Internetverbindung' },
            { icon: '🖊️', label: 'Szenenübersicht & Editor', id: 'szenen-editor', desc: 'Alle Funktionen des Arbeitsfensters' },
            { icon: '🔀', label: 'Szenen & Fassungen', id: 'szenen-fassungen', desc: 'Fassungen anlegen, kopieren, vergleichen' },
            { icon: '📝', label: 'Dokument-Editor', id: 'dokument-editor', desc: 'Notizen, Synopsen, Titelseiten' },
            { icon: '📤', label: 'Export & Kopf-/Fußzeilen', id: 'export-kopfzeilen', desc: 'PDF, Fountain, FDX exportieren' },
            { icon: '🔍', label: 'Suchen & Ersetzen', id: 'suchen-ersetzen', desc: 'Text in Szenen suchen und ersetzen' },
            { icon: '👥', label: 'Team-Work', id: 'team-work', desc: 'Gleichzeitig mit dem Team arbeiten' },
          ].map(item => (
            <div key={item.id} style={{
              display: 'flex', gap: 12, alignItems: 'flex-start',
              border: `1px solid ${C.border}`,
              borderRadius: 8, padding: '12px 14px',
              background: C.surface,
            }}>
              <span style={{ fontSize: 20, flexShrink: 0, lineHeight: 1.2 }}>{item.icon}</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 12, color: C.text }}>{item.label}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <WarnBox title="Fragen oder Probleme?">
          Bei technischen Problemen zunächst den Tab <strong>„Potenzielle Fehler"</strong> (nur für Admins sichtbar) prüfen.
          Für inhaltliche Fragen zur Bedienung steht das gesamte Handbuch zur Verfügung.
        </WarnBox>

      </Section>

    </div>
  )
}

export default ErsteSchritteTab
