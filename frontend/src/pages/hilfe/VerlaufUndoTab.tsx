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
          Die Script-App schützt deinen Text auf zwei Ebenen: Erstens mit dem gewohnten <strong>Ctrl+Z / Ctrl+Y</strong> für spontane
          Korrekturen (wie jede andere Textverarbeitung), und zweitens mit einem automatischen <strong>Verlauf</strong>,
          der alle 5 Minuten eine Sicherungskopie anlegt — auch über Browser-Neustarts und Verbindungsabbrüche hinweg.
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

        <p style={{ fontSize: 12, color: C.muted, marginBottom: 12, lineHeight: 1.6 }}>
          In der Textformate-Leiste findest du außerdem Schaltflächen ↩ (Rückgängig) und ↪ (Wiederholen), die ausgegraut
          erscheinen, wenn keine weiteren Schritte mehr vorhanden sind.
        </p>

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
      {/* 2. Automatischer Verlauf */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <Section title="2. Automatischer Verlauf (Uhren-Icon)">
        <p style={{ fontSize: 12, color: C.muted, marginBottom: 16, lineHeight: 1.6 }}>
          Die App legt automatisch Sicherungskopien an — ähnlich der Versionshistorie in Google Docs.
          Du erkennst die Funktion am <strong>Uhren-Icon</strong> rechts in der Werkstufen-Leiste, direkt neben dem Speicher-Status.
        </p>

        {/* Visual: Header bar mockup */}
        <div style={{
          background: 'var(--bg-subtle)',
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          padding: '8px 14px',
          marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 12,
        }}>
          <span style={{ color: C.muted, fontSize: 11 }}>Drehbuch v1</span>
          <div style={{ flex: 1 }} />
          <span style={{ color: C.green, fontSize: 11 }}>● Gespeichert</span>
          <div style={{
            width: 24, height: 24, borderRadius: 5,
            border: `1px solid ${C.blue}`,
            background: C.blue + '15',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: C.blue, fontSize: 12,
          }}>⏱</div>
          <span style={{ fontSize: 10, color: C.muted }}>← Uhren-Icon</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          {[
            { icon: '⏱', label: 'Wann wird gespeichert?', desc: '5 Minuten nach der letzten Änderung und beim Wechsel zu einer anderen Szene' },
            { icon: '📋', label: 'Wie viele Versionen?', desc: 'Die letzten 50 Versionen je Szene — ältere werden automatisch gelöscht' },
            { icon: '🔁', label: 'Wiederherstellen?', desc: 'Klick auf einen Eintrag → "Wiederherstellen" → Inhalt der Szene wird sofort ersetzt und gespeichert' },
            { icon: '📴', label: 'Offline?', desc: 'Sicherungen werden gespeichert, sobald du wieder online bist' },
          ].map(({ icon, label, desc }) => (
            <div key={label} style={{
              background: 'var(--bg-surface)',
              border: `1px solid ${C.border}`,
              borderRadius: 8, padding: '12px 14px',
            }}>
              <div style={{ fontSize: 16, marginBottom: 6 }}>{icon}</div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{desc}</div>
            </div>
          ))}
        </div>

        <InfoBox title="Persistenz über Sitzungen hinweg" color={C.green}>
          Im Gegensatz zu Ctrl+Z bleibt der Verlauf über Seitenreloads und Browser-Neustarts erhalten.
          Wenn du gestern Abend versehentlich einen Absatz gelöscht hast und das heute merkst, findest
          du die Version trotzdem noch im Verlauf — solange nicht mehr als 50 Sicherungen darüber liegen.
        </InfoBox>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* 3. Verlauf-Panel bedienen */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <Section title="3. Das Verlauf-Panel bedienen">
        <ol style={{ paddingLeft: 20, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { step: 'Szene öffnen', desc: 'Wähle die Szene aus, deren Verlauf du sehen möchtest.' },
            { step: 'Uhren-Icon anklicken', desc: 'Das Verlauf-Panel öffnet sich rechts neben dem Editor und zeigt eine Zeitlinie.' },
            { step: 'Eintrag auswählen', desc: 'Klicke auf einen Zeitstempel, um den Eintrag zu erweitern. Du siehst eine kurze Textvorschau.' },
            { step: '"Wiederherstellen" anklicken', desc: 'Ein Bestätigungsdialog erscheint. Bestätige mit "Ja, wiederherstellen" — der aktuelle Inhalt wird ersetzt.' },
            { step: 'Weiterarbeiten', desc: 'Der wiederhergestellte Inhalt ist sofort gespeichert. Du kannst danach wieder normal schreiben.' },
          ].map(({ step, desc }, i) => (
            <li key={step} style={{ paddingLeft: 8, fontSize: 12, lineHeight: 1.6 }}>
              <strong style={{ color: C.blue }}>Schritt {i + 1}: {step}</strong>
              <br />
              <span style={{ color: C.muted }}>{desc}</span>
            </li>
          ))}
        </ol>

        <div style={{ marginTop: 20 }}>
          <WarnBox title="Achtung">
            Das Wiederherstellen überschreibt den aktuellen Szeneninhalt unwiderruflich.
            Falls du unsicher bist, kopiere den aktuellen Text erst in ein externes Dokument, bevor du wiederherstellst.
          </WarnBox>
        </div>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* 4. Übersicht: zwei Schutzebenen */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <Section title="4. Zwei Schutzebenen im Vergleich">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {['Szenario', 'Ctrl+Z', 'Verlauf (Uhren-Icon)'].map(h => (
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
                ['Fehler beim Tippen — selbe Sitzung', '✅ Sofort', '– (nicht nötig)'],
                ['Absatz gelöscht, 10 Min. her, kein Reload', '✅ Im Stack', '✅ Snapshot vorhanden'],
                ['Seite neu geladen, dann Fehler bemerkt', '❌ Stack weg', '✅ Snapshot vorhanden'],
                ['Browser-Absturz oder Stromausfall', '❌ Stack weg', '✅ Snapshot vorhanden'],
                ['Gestern gelöscht, heute bemerkt', '❌ Stack weg', '✅ Snapshot vorhanden'],
                ['Kollege hat was überschrieben', '❌ Eigener Stack', '✅ Snapshot vorhanden'],
              ].map(([scenario, undo, snap]) => (
                <tr key={scenario} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: '8px 12px', color: C.text }}>{scenario}</td>
                  <td style={{ padding: '8px 12px', color: undo.startsWith('✅') ? C.green : C.orange }}>{undo}</td>
                  <td style={{ padding: '8px 12px', color: snap.startsWith('✅') ? C.green : C.muted }}>{snap}</td>
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
        <FaqItem q="Ich sehe kein Uhren-Icon — warum?" a="Das Uhren-Icon erscheint nur bei Drehbuch- und Storyline-Szenen im neuen Werkstufen-Modell, nicht bei Legacy-Szenen. Außerdem erscheint es erst, wenn eine Szene ausgewählt ist." />
        <FaqItem q="Wie oft wird eine Sicherung angelegt?" a="Genau 5 Minuten nach der letzten Änderung — und zusätzlich beim Wechsel zu einer anderen Szene, falls seitdem nicht schon gespeichert wurde. Der Timer startet immer neu, wenn du weiter schreibst." />
        <FaqItem q="Was passiert, wenn ich offline bin?" a="Änderungen werden weiterhin lokal gespeichert (Offline-Modus). Die Sicherung im Verlauf-Panel wird erst angelegt, wenn du wieder online bist. Ctrl+Z funktioniert immer, unabhängig von der Verbindung." />
        <FaqItem q="Kann ich eine Sicherung für eine andere Szene öffnen?" a="Nein — der Verlauf ist immer an die aktuell geöffnete Szene gebunden. Wechsle zuerst zur gewünschten Szene, dann öffne das Verlauf-Panel." />
        <FaqItem q="Wird auch der Szenenkopf (Motiv, Rollen etc.) gesichert?" a="Nein — der automatische Verlauf sichert nur den Textinhalt (Drehbuch- oder Storyline-Text). Der Szenenkopf wird separat und sofort gespeichert; er benötigt keine Sicherung." />
      </Section>

    </div>
  )
}

export default VerlaufUndoTab
