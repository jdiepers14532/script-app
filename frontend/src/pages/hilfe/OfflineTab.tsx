import { useState, useEffect } from 'react'
import { C, Arrow, Section, FaqItem, InfoBox, WarnBox } from './_shared'

function OfflineTab() {
  return (
    <div>
      {/* Intro */}
      <div style={{
        background: `linear-gradient(135deg, ${C.blue}18 0%, ${C.green}12 100%)`,
        border: `1px solid ${C.blue}33`,
        borderRadius: 12,
        padding: '20px 24px',
        marginBottom: 32,
        display: 'flex',
        gap: 16,
        alignItems: 'flex-start',
      }}>
        <div style={{ fontSize: 32, lineHeight: 1, flexShrink: 0 }}>📶</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Die Script-App funktioniert auch offline</div>
          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
            Dank Service Worker und lokalem Cache kannst du Szenen lesen und bearbeiten — auch ohne Internetverbindung.
            Änderungen werden automatisch synchronisiert, sobald du wieder online bist.
          </div>
        </div>
      </div>

      {/* Status-Indikator */}
      <Section title="1. Der Status-Indikator">
        <p style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>
          Oben rechts in der Topbar zeigt ein farbiger Punkt jederzeit den aktuellen Verbindungsstatus an.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            {
              dot: C.green,
              label: 'Online · Synced',
              desc: 'Alles ist synchronisiert. Du arbeitest in Echtzeit mit dem Server.',
              icon: '✓',
            },
            {
              dot: '#FF9500',
              label: 'X ausstehende Änderungen',
              desc: 'Du bist online, aber einige Änderungen wurden noch nicht übertragen. Die App synchronisiert automatisch — warte kurz.',
              icon: '⏳',
            },
            {
              dot: '#FF9500',
              label: 'Synchronisiert…',
              desc: 'Die App überträgt gerade deine gespeicherten Änderungen zum Server.',
              icon: '↻',
            },
            {
              dot: C.red,
              label: 'Offline · Antippen zum Verbinden',
              desc: 'Keine Verbindung zum Server. Klicke die Pill direkt an — die App versucht automatisch, die Verbindung wiederherzustellen.',
              icon: '✗',
            },
            {
              dot: C.red,
              label: 'Verbindung wird geprüft…',
              desc: 'Der Reconnect-Check läuft: Die App prüft, ob der Server erreichbar ist, und ob ein Browser-Cache-Problem vorliegt.',
              icon: '↻',
            },
            {
              dot: C.red,
              label: 'Kein Internetzugang',
              desc: 'Kein Internetzugang auf OS-Ebene (WLAN/LAN getrennt). Die App arbeitet offline weiter und synchronisiert automatisch, wenn das Netz zurückkommt.',
              icon: '✗',
            },
            {
              dot: C.red,
              label: 'Server nicht erreichbar',
              desc: 'Das Gerät hat Internet, aber der Server antwortet nicht. Kann ein kurzer Server-Ausfall sein — nach einigen Minuten erneut versuchen.',
              icon: '!',
            },
          ].map((s, i) => (
            <div key={i} style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 14,
              padding: '12px 16px',
              border: `1px solid ${s.dot}33`,
              borderLeft: `3px solid ${s.dot}`,
              borderRadius: 8,
              background: s.dot + '0a',
            }}>
              <div style={{
                width: 10, height: 10, borderRadius: '50%',
                background: s.dot,
                flexShrink: 0, marginTop: 4,
              }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 3, fontFamily: 'monospace', color: s.dot }}>{s.label}</div>
                <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>{s.desc}</div>
              </div>
              <div style={{ fontSize: 20, lineHeight: 1, flexShrink: 0, opacity: 0.5 }}>{s.icon}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Wie Sync funktioniert */}
      <Section title="2. So funktioniert die Synchronisation">
        <p style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>
          Die App speichert Änderungen in drei Schichten — von schnell (RAM) bis dauerhaft (Server):
        </p>

        {/* Flow-Diagramm */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', maxWidth: 580 }}>

          {/* Schritt 1 */}
          <div style={{
            border: `2px solid ${C.blue}`,
            borderRadius: 10, padding: '14px 18px',
            background: C.blue + '0e',
            display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: C.blue, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, flexShrink: 0,
            }}>✏️</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>Du tippst / speicherst</div>
              <div style={{ fontSize: 12, color: C.muted }}>Die App sendet eine Anfrage an den Server.</div>
            </div>
          </div>

          <Arrow label="Server erreichbar?" />

          {/* Verzweigung */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

            {/* Online-Pfad */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              <div style={{
                textAlign: 'center', fontSize: 11, fontWeight: 700,
                color: C.green, padding: '4px 8px', background: C.green + '15',
                borderRadius: '6px 6px 0 0', border: `1px solid ${C.green}44`, borderBottom: 'none',
              }}>JA — Online</div>
              <div style={{
                border: `1px solid ${C.green}44`, borderTop: 'none',
                borderRadius: '0 0 8px 8px', padding: '12px 14px',
                background: C.green + '08', fontSize: 12, color: C.muted, lineHeight: 1.5,
              }}>
                Änderung wird direkt auf dem Server gespeichert.
                Status: <span style={{ color: C.green, fontWeight: 600 }}>Online · Synced</span>
              </div>
            </div>

            {/* Offline-Pfad */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              <div style={{
                textAlign: 'center', fontSize: 11, fontWeight: 700,
                color: C.red, padding: '4px 8px', background: C.red + '15',
                borderRadius: '6px 6px 0 0', border: `1px solid ${C.red}44`, borderBottom: 'none',
              }}>NEIN — Offline</div>
              <div style={{
                border: `1px solid ${C.red}44`, borderTop: 'none',
                borderRadius: '0 0 8px 8px', padding: '12px 14px',
                background: C.red + '08', fontSize: 12, color: C.muted, lineHeight: 1.5,
              }}>
                Anfrage landet in der <strong>lokalen Warteschlange</strong> (IndexedDB im Browser).
                Status: <span style={{ color: C.red, fontWeight: 600 }}>Offline · ausstehend</span>
              </div>
            </div>
          </div>

          <Arrow label="Verbindung kommt zurück" />

          <div style={{
            border: `2px solid ${C.green}`,
            borderRadius: 10, padding: '14px 18px',
            background: C.green + '0e',
            display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: C.green, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, flexShrink: 0,
            }}>🔄</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>Automatische Synchronisation</div>
              <div style={{ fontSize: 12, color: C.muted }}>
                Sobald das Netz zurückkommt, überträgt die App alle gespeicherten Anfragen der Reihe nach.
                Du musst nichts tun — es passiert automatisch im Hintergrund.
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* Cache-Schichten */}
      <Section title="3. Was ist offline verfügbar?">
        <p style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>
          Der Service Worker der App speichert bestimmte Inhalte automatisch zwischen. Diese Strategien sind aktiv:
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {[
            {
              color: C.blue,
              icon: '🏠',
              strategy: 'Cache First',
              label: 'App-Oberfläche (Shell)',
              desc: 'HTML, JavaScript, CSS, Schriften — immer aus dem lokalen Cache geladen. Die App startet auch komplett ohne Netz.',
            },
            {
              color: C.purple,
              icon: '📋',
              strategy: 'Network First',
              label: 'Staffeln & Episoden',
              desc: 'Zuerst wird der Server gefragt (max. 10 Sekunden). Antwortet er nicht, liefert der Cache die letzte bekannte Version.',
            },
            {
              color: C.orange,
              icon: '📝',
              strategy: 'Stale-While-Revalidate',
              label: 'Szenen',
              desc: 'Der Cache antwortet sofort (kein Warten). Im Hintergrund wird der Server gefragt und der Cache aktualisiert — für die nächste Seite ist er dann frisch.',
            },
            {
              color: C.orange,
              icon: '🎬',
              strategy: 'Stale-While-Revalidate',
              label: 'Blöcke & Folgen',
              desc: 'Die Blockliste (Folgenbereich, Drehtage) wird sofort aus dem Cache geladen und im Hintergrund aktualisiert. Offline siehst du die zuletzt geladene Blockliste — ohne Verzögerung.',
            },
            {
              color: C.orange,
              icon: '📅',
              strategy: 'Stale-While-Revalidate',
              label: 'Sendedatum & Drehzeitraum',
              desc: 'Sendetermine und Drehzeitraum aus der Produktionsdatenbank werden im Cache zwischengespeichert. Offline wird der zuletzt bekannte Wert angezeigt — er kann veraltet sein, wird aber sofort aktualisiert sobald wieder Netz besteht.',
            },
          ].map((item, i) => (
            <div key={i} style={{
              display: 'grid',
              gridTemplateColumns: '40px 1fr',
              gap: 14,
              padding: '14px 16px',
              border: `1px solid ${item.color}44`,
              borderLeft: `3px solid ${item.color}`,
              borderRadius: 8,
              background: item.color + '08',
            }}>
              <div style={{ fontSize: 22, textAlign: 'center', paddingTop: 2 }}>{item.icon}</div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{item.label}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 600, fontFamily: 'monospace',
                    background: item.color + '22', color: item.color,
                    border: `1px solid ${item.color}44`,
                    borderRadius: 4, padding: '1px 6px',
                  }}>{item.strategy}</span>
                </div>
                <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Verfügbarkeits-Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            { ok: true,  label: 'App starten & navigieren' },
            { ok: true,  label: 'Szenen lesen (aus Cache)' },
            { ok: true,  label: 'Staffeln & Episoden ansehen' },
            { ok: true,  label: 'Blöcke & Folgen (gecacht)' },
            { ok: true,  label: 'Sendedatum & Drehzeitraum (gecacht)' },
            { ok: true,  label: 'Szenen bearbeiten & speichern' },
            { ok: false, label: 'KI-Funktionen (brauchen Netz)' },
            { ok: false, label: 'Kommentare anderer sehen (live)' },
            { ok: false, label: 'Neue Produktionen laden' },
            { ok: false, label: 'Einloggen / Ausloggen' },
          ].map((item, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px',
              border: `1px solid ${item.ok ? C.green : C.border}`,
              borderRadius: 6,
              background: item.ok ? C.green + '08' : C.surface,
              fontSize: 12,
            }}>
              <span style={{
                fontSize: 14, fontWeight: 700,
                color: item.ok ? C.green : C.muted,
                flexShrink: 0,
              }}>{item.ok ? '✓' : '—'}</span>
              <span style={{ color: item.ok ? C.text : C.muted }}>{item.label}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* Datenverlust vermeiden */}
      <Section title="4. Datenverlust vermeiden">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            {
              num: '1',
              color: C.blue,
              title: 'Status-Indikator beobachten',
              desc: 'Schau vor dem Schließen des Tabs auf den farbigen Punkt oben rechts. Ist er grün und zeigt "Online · Synced", ist alles sicher übertragen.',
            },
            {
              num: '2',
              color: C.orange,
              title: 'Bei "ausstehenden Änderungen" Tab offen lassen',
              desc: 'Wenn der Indikator "X ausstehende Änderungen" oder "Synchronisiert…" anzeigt: Tab-Browser offen lassen und warten, bis grün erscheint. Nicht neu laden!',
            },
            {
              num: '3',
              color: C.purple,
              title: 'Zuletzt bearbeitete Szenen bleiben gecacht',
              desc: 'Der Browser speichert die zuletzt abgerufenen Szenen lokal. Auch wenn du offline bist, siehst du den Stand von deiner letzten Online-Sitzung.',
            },
            {
              num: '4',
              color: C.green,
              title: 'Versionshistorie als Sicherheitsnetz',
              desc: 'Bei jedem Speichern wird automatisch ein Versions-Snapshot angelegt. Auch nach einem Sync-Problem kannst du zur letzten gespeicherten Version zurück.',
            },
          ].map((tip, i) => (
            <div key={i} style={{
              display: 'flex', gap: 14,
              padding: '14px 16px',
              border: `1px solid ${tip.color}33`,
              borderRadius: 8,
              background: tip.color + '08',
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: tip.color, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 13, flexShrink: 0,
              }}>{tip.num}</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{tip.title}</div>
                <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>{tip.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Verbindung wiederherstellen */}
      <Section title="5. Verbindung wiederherstellen">
        <p style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>
          Wenn die App offline ist, muss kein Nutzer die Browser-Entwicklertools öffnen.
          Ein Klick auf die Status-Pill in der Topbar oder den Button im Offline-Modal reicht.
        </p>

        {/* Wie es funktioniert */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {[
            {
              step: '1',
              color: C.blue,
              title: 'Server-Ping',
              desc: 'Die App sendet eine Testanfrage an den Server (/api/health) mit 4 Sekunden Timeout — unabhängig davon, was navigator.onLine meldet.',
            },
            {
              step: '2a',
              color: C.green,
              title: 'Ping erfolgreich → Online',
              desc: 'Der Verbindungsstatus wird sofort auf Online gesetzt und die Warteschlange synchronisiert. Kein Neuladen nötig.',
            },
            {
              step: '2b',
              color: C.orange,
              title: 'Ping fehlgeschlagen + Service Worker vorhanden → Automatischer Reset',
              desc: 'Der Service Worker wird deregistriert und die Seite neu geladen. Typische Ursache: Browser-Entwicklertools haben den Service Worker auf Offline gesetzt (häufig bei Chrome/Edge DevTools). Nach dem Reload ist die App wieder online.',
            },
            {
              step: '2c',
              color: C.red,
              title: 'Ping fehlgeschlagen + kein Service Worker → Klare Fehlermeldung',
              desc: '"Kein Internetzugang" wenn navigator.onLine=false (WLAN/LAN getrennt). "Server nicht erreichbar" wenn das Gerät Internet hat, der Server aber nicht antwortet.',
            },
          ].map((item, i) => (
            <div key={i} style={{
              display: 'flex', gap: 14,
              padding: '14px 16px',
              border: `1px solid ${item.color}33`,
              borderRadius: 8,
              background: item.color + '08',
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: item.color, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 11, flexShrink: 0,
              }}>{item.step}</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{item.title}</div>
                <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Browser-Kompatibilität */}
        <div style={{
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          overflow: 'hidden',
          marginBottom: 16,
        }}>
          <div style={{
            padding: '10px 14px',
            background: C.subtle,
            fontWeight: 600, fontSize: 12,
            borderBottom: `1px solid ${C.border}`,
          }}>Browser-Kompatibilität</div>
          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { browser: 'Chrome / Edge', icon: '✓', color: C.green, note: 'Vollständig unterstützt. DevTools-SW-Offline-Bug wird erkannt und automatisch behoben.' },
              { browser: 'Firefox', icon: '✓', color: C.green, note: 'Vollständig unterstützt. Network-Throttling "Offline" im DevTools wird ebenfalls korrekt behandelt.' },
              { browser: 'Safari (macOS / iOS)', icon: '✓', color: C.green, note: 'Vollständig unterstützt. Safari hat keine SW-Offline-Checkbox in DevTools — der DevTools-Bug tritt hier nicht auf.' },
            ].map((b, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ color: b.color, fontWeight: 700, fontSize: 14, flexShrink: 0 }}>{b.icon}</span>
                <div>
                  <span style={{ fontWeight: 600, fontSize: 12 }}>{b.browser}</span>
                  <span style={{ fontSize: 12, color: C.muted }}> — {b.note}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bekannte Einschränkung */}
        <div style={{
          padding: '14px 16px',
          border: `1px solid ${C.orange}44`,
          borderLeft: `3px solid ${C.orange}`,
          borderRadius: 8,
          background: C.orange + '08',
        }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, color: C.orange }}>Bekannte Einschränkung</div>
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
            Fetch-Anfragen lassen sich in JavaScript nicht am Service Worker vorbeischicken — der SW interceptiert alle Netzwerkanfragen der App.
            Das bedeutet: Wenn der Server wirklich ausgefallen ist <em>und</em> gleichzeitig ein Service Worker registriert ist,
            würde der Reconnect-Click den SW fälschlicherweise deregistrieren und die Seite neu laden.
            Nach dem Reload ist kein Asset-Cache mehr vorhanden, die App lädt dann über das Netz.
            <br /><br />
            In der Praxis ist dieses Szenario (Server-Ausfall während aktiver Nutzung + SW registriert) sehr unwahrscheinlich.
            Der SW registriert sich beim nächsten Online-Reload automatisch neu.
          </div>
        </div>
      </Section>

      {/* Troubleshooting */}
      <Section title="6. Probleme beheben">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            {
              q: 'Die App zeigt "Offline", obwohl das Internet funktioniert',
              a: 'Häufigste Ursache: Der Service Worker wurde in den Browser-Entwicklertools (DevTools → Application → Service Workers) auf "Offline" gesetzt. Einfach die Status-Pill in der Topbar anklicken — die App erkennt das Problem, setzt den Service Worker zurück und lädt neu. Kein manuelles DevTools-Öffnen nötig.',
            },
            {
              q: 'Ich klicke "Verbindung wiederherstellen" und bekomme "Kein Internetzugang"',
              a: 'Das bedeutet: navigator.onLine ist false UND kein Service Worker ist registriert — es handelt sich um ein echtes Netzproblem auf OS-Ebene (WLAN/LAN). WLAN-Verbindung prüfen, Router-Neustart, oder auf mobiles Netz wechseln.',
            },
            {
              q: 'Ich klicke "Verbindung wiederherstellen" und bekomme "Server nicht erreichbar"',
              a: 'Das Gerät hat Internet (navigator.onLine=true), der Server antwortet aber nicht. Mögliche Ursachen: kurzer Server-Neustart (PM2-Restart), Wartung, oder Netzpfad-Problem. Meist nach 1–2 Minuten wieder verfügbar. Alternativ: anderen Browser testen.',
            },
            {
              q: 'Der Status bleibt "ausstehend", obwohl ich wieder online bin',
              a: 'Warte 15–30 Sekunden — die Sync läuft automatisch. Hilft das nicht, lade die Seite einmal neu (F5). Die Warteschlange bleibt erhalten und wird nach dem Neuladen fortgesetzt.',
            },
            {
              q: 'Die App lädt gar nicht (komplett weißer Bildschirm)',
              a: 'Der Service Worker wurde möglicherweise noch nicht installiert. Verbinde dich einmal mit dem Internet und öffne die App — danach steht sie offline zur Verfügung.',
            },
            {
              q: 'Ich sehe veraltete Inhalte, obwohl ich online bin',
              a: '"Stale-While-Revalidate" zeigt zuerst den Cache und aktualisiert im Hintergrund. Nach einem kurzen Moment oder einem erneuten Öffnen der Seite siehst du die neuesten Daten.',
            },
            {
              q: 'Ich möchte den Cache komplett leeren',
              a: 'Browser-Einstellungen → Datenschutz → Browserdaten löschen → "Gecachte Bilder und Dateien". Achtung: danach ist die App erst nach einer Online-Sitzung wieder offline nutzbar.',
            },
          ].map((item, i) => (
            <details key={i} style={{
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              overflow: 'hidden',
            }}>
              <summary style={{
                padding: '12px 16px',
                fontWeight: 600, fontSize: 13,
                cursor: 'pointer',
                background: C.subtle,
                listStyle: 'none',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <span style={{ color: C.orange, fontSize: 15, flexShrink: 0 }}>?</span>
                {item.q}
              </summary>
              <div style={{
                padding: '12px 16px',
                fontSize: 12, color: C.muted, lineHeight: 1.7,
                borderTop: `1px solid ${C.border}`,
              }}>
                {item.a}
              </div>
            </details>
          ))}
        </div>
      </Section>

    </div>
  )
}

export default OfflineTab
