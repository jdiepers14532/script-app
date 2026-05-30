import { C, Section, FaqItem, InfoBox, WarnBox } from './_shared'

function VerlaufUndoTab() {
  return (
    <div style={{ padding: '28px 0' }}>

      {/* ── Intro ── */}
      <div style={{
        background: `linear-gradient(135deg, ${C.blue}15 0%, ${C.green}10 100%)`,
        border: `1px solid ${C.blue}33`,
        borderRadius: 12,
        padding: '24px 28px',
        marginBottom: 36,
      }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Verlauf, Rückgängig & Auto-Sicherung</div>
        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
          Die Script-App schützt deinen Text auf <strong>drei Ebenen</strong>: Erstens mit dem gewohnten <strong>Ctrl+Z / Ctrl+Y</strong> für
          spontane Korrekturen, zweitens mit einem <strong>Szenen-Verlauf</strong> (alle 5 Minuten, pro Szene)
          und drittens mit einem <strong>Dokument-Verlauf</strong> (beim Werkstufen-Wechsel oder auf Knopfdruck),
          der alle Szenen der Werkstufe auf einmal sichert — und vor jeder Wiederherstellung automatisch eine Undo-Sicherung anlegt.
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* 1. Rückgängig und Wiederholen */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <Section title="1. Rückgängig und Wiederholen (Ctrl+Z / Ctrl+Y)">
        <p style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>
          Wie in Word, Pages oder Google Docs kannst du einzelne Schreibschritte zurücknehmen.
        </p>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
          {[
            { keys: 'Ctrl + Z', label: 'Rückgängig', color: C.blue },
            { keys: 'Ctrl + Y', label: 'Wiederholen', color: C.green },
            { keys: 'Ctrl + Shift + Z', label: 'Wiederholen (alternativ)', color: C.green },
          ].map(({ keys, label, color }) => (
            <div key={keys} style={{
              border: `1px solid ${color}44`,
              borderRadius: 8,
              padding: '10px 16px',
              background: color + '0a',
              display: 'flex', flexDirection: 'column', gap: 4,
              minWidth: 160,
            }}>
              <code style={{ fontSize: 13, fontWeight: 700, color, letterSpacing: '0.02em' }}>{keys}</code>
              <span style={{ fontSize: 11, color: C.muted }}>{label}</span>
            </div>
          ))}
        </div>

        <InfoBox title="Kollaborativer Modus" color={C.blue}>
          Wenn mehrere Personen gleichzeitig an einer Werkstufe arbeiten,
          gilt ein Ctrl+Z nur für deine eigenen Eingaben — nicht für die Änderungen von Kolleginnen.
          Das ist bewusstes Design und entspricht dem Verhalten von Google Docs.
        </InfoBox>

        <div style={{ marginTop: 16 }}>
          <WarnBox title="Wichtig">
            Der Ctrl+Z-Verlauf ist <em>sitzungsbasiert</em> — er geht verloren, wenn du
            die Seite neu lädst oder den Browser schließt. Für längere Rückgriffe nutze den Verlauf (Uhren-Icon, siehe unten).
          </WarnBox>
        </div>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* 2. Das Verlauf-Panel — Toggle */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <Section title="2. Das Verlauf-Panel öffnen">
        <p style={{ fontSize: 12, color: C.muted, marginBottom: 16, lineHeight: 1.6 }}>
          Das <strong>Uhren-Icon</strong> rechts in der Werkstufen-Leiste öffnet das Verlauf-Panel.
          Oben im Panel wählst du zwischen zwei Modi:
        </p>

        {/* Toggle-Mockup */}
        <div style={{
          background: 'var(--bg-subtle)',
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 20,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {/* Simulierter Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <span style={{ fontSize: 11 }}>⏱</span>
            <strong style={{ fontSize: 13 }}>Verlauf</strong>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: C.muted }}>✕</span>
          </div>
          {/* Simulierter Toggle */}
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { label: '📄 Diese Szene', active: true },
              { label: '📚 Dokument', active: false },
            ].map(({ label, active }) => (
              <div key={label} style={{
                flex: 1, textAlign: 'center',
                padding: '5px 8px', borderRadius: 6, fontSize: 11, fontWeight: active ? 700 : 400,
                background: active ? C.border : 'transparent',
                color: active ? C.text : C.muted,
                border: `1px solid ${active ? C.border : 'transparent'}`,
              }}>{label}</div>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ background: 'var(--bg-surface)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px' }}>
            <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>📄 Diese Szene</div>
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: C.muted, lineHeight: 1.7 }}>
              <li>Sicherungen nur für die aktuell geöffnete Szene</li>
              <li>Auto alle 5 Minuten nach letzter Änderung</li>
              <li>Maximal 50 Einträge je Szene</li>
              <li>Andere Szenen bleiben beim Wiederherstellen unverändert</li>
            </ul>
          </div>
          <div style={{ background: 'var(--bg-surface)', border: `1px solid ${C.blue}33`, borderRadius: 8, padding: '14px' }}>
            <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6, color: C.blue }}>📚 Dokument</div>
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: C.muted, lineHeight: 1.7 }}>
              <li>Snapshot aller Szenen der Werkstufe</li>
              <li>Auto beim Werkstufen-Wechsel + alle 30 Minuten</li>
              <li>Manuell: „Jetzt Dokument sichern"-Button</li>
              <li>Maximal 30 Einträge je Werkstufe</li>
            </ul>
          </div>
        </div>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* 3. Szenen-Verlauf */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <Section title="3. Szenen-Verlauf nutzen">
        <ol style={{ paddingLeft: 20, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { step: 'Szene öffnen', desc: 'Wähle die Szene aus, deren Verlauf du sehen möchtest.' },
            { step: 'Uhren-Icon → Modus „Diese Szene"', desc: 'Das Panel zeigt die Verlaufseinträge der aktuellen Szene (andere Szenen sind nicht betroffen).' },
            { step: 'Eintrag auswählen', desc: 'Klicke auf einen Zeitstempel, um ihn zu erweitern. Du siehst Autor, Uhrzeit und Textvorschau.' },
            { step: '"Auf diesen Stand zurückgehen"', desc: 'Ein Bestätigungsdialog erscheint — bestätige mit „Ja, wiederherstellen". Die Szene wird sofort aktualisiert und gespeichert.' },
          ].map(({ step, desc }, i) => (
            <li key={step} style={{ paddingLeft: 8, fontSize: 12, lineHeight: 1.6 }}>
              <strong style={{ color: C.blue }}>Schritt {i + 1}: {step}</strong>
              <br />
              <span style={{ color: C.muted }}>{desc}</span>
            </li>
          ))}
        </ol>

        <div style={{ marginTop: 16 }}>
          <InfoBox title="Fremde Änderung erkannt" color={C.orange}>
            Wenn jemand anderes die Szene nach dem gewählten Sicherungspunkt bearbeitet hat, erscheint ein
            oranges Warnsymbol. Du kannst die Wiederherstellung trotzdem durchführen — die App zeigt dir, wessen Änderungen überschrieben werden.
          </InfoBox>
        </div>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* 4. Dokument-Verlauf */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <Section title="4. Dokument-Verlauf nutzen">
        <p style={{ fontSize: 12, color: C.muted, marginBottom: 16, lineHeight: 1.6 }}>
          Der Dokument-Verlauf sichert alle Szenen der Werkstufe gleichzeitig — ideal wenn du den Zustand
          des gesamten Drehbuchs zu einem bestimmten Zeitpunkt wiederherstellen möchtest.
        </p>

        <ol style={{ paddingLeft: 20, margin: 0, display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
          {[
            { step: 'Uhren-Icon → Modus „Dokument"', desc: 'Die Liste zeigt alle Dokument-Snapshots der aktuellen Werkstufe.' },
            { step: 'Manuell sichern (optional)', desc: 'Mit „Jetzt Dokument sichern" legst du sofort einen Snapshot aller Szenen an — z.B. vor einer größeren Überarbeitung.' },
            { step: 'Eintrag auswählen und erweitern', desc: 'Jeder Eintrag zeigt Zeitstempel, Typ (Auto / Manuell / Vor Wiederherstellung), Anzahl der Szenen und Autor.' },
            { step: '"Auf diesen Stand zurückgehen"', desc: 'Der aktuelle Zustand aller Szenen wird zunächst automatisch als neue Sicherung gespeichert (damit kannst du rückgängig machen). Dann werden alle Szenen mit dem Snapshot-Inhalt überschrieben.' },
            { step: 'Editor aktualisiert sich', desc: 'Die aktuell geöffnete Szene zeigt sofort den wiederhergestellten Inhalt. Alle anderen Szenen werden beim nächsten Öffnen korrekt geladen.' },
          ].map(({ step, desc }, i) => (
            <li key={step} style={{ paddingLeft: 8, fontSize: 12, lineHeight: 1.6 }}>
              <strong style={{ color: C.blue }}>Schritt {i + 1}: {step}</strong>
              <br />
              <span style={{ color: C.muted }}>{desc}</span>
            </li>
          ))}
        </ol>

        {/* Typ-Erklärung */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>Eintrags-Typen im Dokument-Verlauf</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { badge: 'Auto', color: C.muted, desc: 'Automatisch angelegt — beim Werkstufen-Wechsel oder nach 30 Minuten aktiver Arbeit.' },
              { badge: 'Manuell', color: C.blue, desc: 'Von dir per Knopfdruck angelegt — z.B. vor einer größeren Umstrukturierung.' },
              { badge: 'Vor Wiederherstellung', color: '#fb923c', desc: 'Automatisch angelegt, bevor eine Wiederherstellung durchgeführt wurde. Dient als Undo — wenn die Wiederherstellung nicht das gewünschte Ergebnis hatte, kannst du diesen Eintrag nutzen, um zum vorherigen Stand zurückzukehren.' },
            ].map(({ badge, color, desc }) => (
              <div key={badge} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{
                  flexShrink: 0, fontSize: 9, fontWeight: 700,
                  color, background: color + '20',
                  borderRadius: 3, padding: '2px 6px', letterSpacing: '0.04em',
                  textTransform: 'uppercase', marginTop: 1,
                }}>{badge}</span>
                <span style={{ fontSize: 11, color: C.muted, lineHeight: 1.6 }}>{desc}</span>
              </div>
            ))}
          </div>
        </div>

        <InfoBox title="Sicherheitsnetz: Undo für die Wiederherstellung" color={C.green}>
          Vor jeder Dokument-Wiederherstellung sichert die App automatisch den aktuellen Stand.
          Du erkennst diese Einträge am Badge <strong style={{ color: '#fb923c' }}>Vor Wiederherstellung</strong> (orange).
          Das gibt dir ein vollständiges Undo: Wenn das Ergebnis nicht stimmt, kannst du im selben Panel
          diesen Eintrag nutzen und den Stand von vor der Wiederherstellung zurückbringen.
        </InfoBox>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* 5. Drei Schutzebenen im Vergleich */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <Section title="5. Drei Schutzebenen im Vergleich">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {['Szenario', 'Ctrl+Z', 'Szenen-Verlauf', 'Dokument-Verlauf'].map(h => (
                  <th key={h} style={{
                    textAlign: 'left', padding: '8px 12px',
                    borderBottom: `2px solid ${C.border}`,
                    fontSize: 11, color: C.muted, fontWeight: 600,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ['Fehler beim Tippen — selbe Sitzung', '✅ Sofort', '– (nicht nötig)', '– (nicht nötig)'],
                ['Absatz gelöscht, 10 Min. her', '✅ Im Stack', '✅ Snapshot', '✅ falls innerhalb 30 Min.'],
                ['Seite neu geladen, dann Fehler bemerkt', '❌ Stack weg', '✅ Snapshot', '✅ Snapshot'],
                ['Browser-Absturz oder Stromausfall', '❌ Stack weg', '✅ Snapshot', '✅ Snapshot'],
                ['Gestern gelöscht, heute bemerkt', '❌ Stack weg', '✅ Snapshot', '✅ Snapshot'],
                ['Kollege hat eine Szene überschrieben', '❌ Eigener Stack', '✅ Szenen-Snapshot', '✅ Dokument-Snapshot'],
                ['Mehrere Szenen gleichzeitig zurücksetzen', '❌ Nicht möglich', '❌ Nur eine Szene', '✅ Alle Szenen'],
                ['Ganzes Drehbuch auf früheren Stand', '❌ Nicht möglich', '❌ Nur eine Szene', '✅ Dokument-Snapshot'],
              ].map(([scenario, undo, szene, dok]) => (
                <tr key={scenario} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: '8px 12px', color: C.text }}>{scenario}</td>
                  <td style={{ padding: '8px 12px', color: undo.startsWith('✅') ? C.green : C.orange }}>{undo}</td>
                  <td style={{ padding: '8px 12px', color: szene.startsWith('✅') ? C.green : szene.startsWith('❌') ? C.orange : C.muted }}>{szene}</td>
                  <td style={{ padding: '8px 12px', color: dok.startsWith('✅') ? C.green : dok.startsWith('❌') ? C.orange : C.muted }}>{dok}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* FAQ */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <Section title="Häufige Fragen">
        <FaqItem q="Ich sehe kein Uhren-Icon — warum?" a="Das Uhren-Icon erscheint nur bei Drehbuch- und Storyline-Szenen im Werkstufen-Modell, nicht bei Legacy-Szenen. Außerdem erscheint es erst, wenn eine Szene ausgewählt ist." />
        <FaqItem q="Wie oft wird der Szenen-Verlauf gespeichert?" a="Genau 5 Minuten nach der letzten Änderung — und zusätzlich beim Wechsel zu einer anderen Szene. Der Timer startet immer neu, wenn du weiter schreibst." />
        <FaqItem q="Wann wird ein Dokument-Snapshot angelegt?" a="Automatisch wenn du die Werkstufe wechselst (vorherige Werkstufe wird gesichert) sowie alle 30 Minuten während aktiver Arbeit. Du kannst auch jederzeit manuell im Dokument-Modus des Verlauf-Panels einen anlegen." />
        <FaqItem q="Was passiert genau beim Dokument-Wiederherstellen?" a="Zuerst sichert die App den aktuellen Stand aller Szenen automatisch (erkennbar am Badge 'Vor Wiederherstellung'). Danach werden alle Szenen der Werkstufe mit dem Snapshot-Inhalt überschrieben. Die aktuell geöffnete Szene wird sofort im Editor aktualisiert." />
        <FaqItem q="Kann ich eine Dokument-Wiederherstellung rückgängig machen?" a="Ja — direkt im Dokument-Verlauf. Jede Wiederherstellung erzeugt automatisch einen Eintrag 'Vor Wiederherstellung' (orange Badge). Diesen kannst du wiederherstellen, um zum Stand vor der Wiederherstellung zurückzukehren." />
        <FaqItem q="Was passiert, wenn ich offline bin?" a="Änderungen werden lokal gespeichert. Verlaufs-Snapshots (Szene und Dokument) werden erst angelegt, wenn du wieder online bist. Ctrl+Z funktioniert immer, unabhängig von der Verbindung." />
        <FaqItem q="Wird auch der Szenenkopf (Motiv, Rollen etc.) gesichert?" a="Der Szenen-Verlauf sichert nur den Textinhalt. Der Dokument-Verlauf ebenfalls nur den Textinhalt je Szene — Szenenkopf-Daten (Motiv, Rollen, Stoppzeit) werden separat und sofort gespeichert und benötigen keine Sicherung." />
        <FaqItem q="Kann ich die Intervalle (5 Min / 30 Min) anpassen?" a="Diese Einstellungen werden in den Drehbuchkoordinations-Einstellungen konfigurierbar sein. Bis dahin gelten die Standard-Intervalle." />
      </Section>

    </div>
  )
}

export default VerlaufUndoTab
