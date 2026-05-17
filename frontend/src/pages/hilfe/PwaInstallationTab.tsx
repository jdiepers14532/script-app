import { useState, useEffect } from 'react'
import { C, Badge, Tag, TableCard, Arrow, Section, FaqItem, InfoBox, WarnBox, Connector, FieldBox } from './_shared'

function PwaInstallationTab() {
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [openHint, setOpenHint] = useState<number | null>(null)

  return (
    <div style={{ padding: '28px 0' }}>

      {/* Intro */}
      <div style={{
        background: `linear-gradient(135deg, ${C.blue}18 0%, ${C.green}12 100%)`,
        border: `1px solid ${C.blue}33`,
        borderRadius: 12, padding: '20px 24px', marginBottom: 32,
        display: 'flex', gap: 16, alignItems: 'flex-start',
      }}>
        <div style={{ fontSize: 32, lineHeight: 1, flexShrink: 0 }}>📲</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>
            Script-App als App auf deinem Gerät installieren
          </div>
          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
            Als Progressive Web App (PWA) kannst du die Script-App wie eine native App
            auf deinem Desktop, Taskbar oder Home-Screen installieren — ohne App-Store,
            direkt aus dem Browser. Sie startet schneller, läuft offline und sieht aus wie eine echte App.
          </div>
        </div>
      </div>

      {/* Was ist PWA */}
      <Section title="1. Was bedeutet 'App installieren'?">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
          {[
            { icon: '🚀', title: 'Schneller Start', desc: 'App-Shell wird lokal gecacht — kein weißes Laden-Fenster beim Öffnen.' },
            { icon: '📴', title: 'Offline-Fähig', desc: 'Szenen aus dem letzten Online-Besuch bleiben lesbar, auch ohne Internet.' },
            { icon: '🖥️', title: 'Wie eine native App', desc: 'Eigenes Fenster, eigene Taskbar-Kachel — kein Browser-Chrome drumherum.' },
          ].map(item => (
            <div key={item.title} style={{
              padding: '14px', borderRadius: 8,
              border: `1px solid ${C.border}`, background: C.surface,
            }}>
              <div style={{ fontSize: 22, marginBottom: 8 }}>{item.icon}</div>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{item.title}</div>
              <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{item.desc}</div>
            </div>
          ))}
        </div>
        <div style={{
          padding: '10px 14px', borderRadius: 8,
          border: `1px solid ${C.orange}44`, background: `${C.orange}0A`,
          fontSize: 12, color: C.muted, lineHeight: 1.5,
        }}>
          <strong style={{ color: C.orange }}>Kein App-Store nötig.</strong>{' '}
          Die Installation erfolgt direkt aus dem Browser — auf Windows, macOS, Android und iOS.
          Du brauchst kein Administrator-Recht.
        </div>
      </Section>

      {/* Installation */}
      <Section title="2. Installation — so geht's">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Chrome/Edge */}
          <div style={{ padding: '14px 16px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 20 }}>🌐</span>
              <span style={{ fontWeight: 700, fontSize: 13 }}>Chrome / Edge (Windows & macOS) — Empfohlen</span>
              <span style={{
                marginLeft: 'auto', background: `${C.green}22`, color: C.green,
                fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
              }}>Vollständig unterstützt</span>
            </div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
              <strong style={{ color: C.text }}>Option A (automatisch):</strong> Im Benutzer-Menü oben rechts → "Offline-Version installieren" anklicken.
              <br />
              <strong style={{ color: C.text }}>Option B (manuell):</strong> In der Adressleiste das Symbol{' '}
              <code style={{ background: C.subtle, padding: '1px 4px', borderRadius: 3 }}>⊕</code> anklicken → "Script-App installieren".
              <br />
              <strong style={{ color: C.text }}>Option C:</strong> Browser-Menü (⋮) → "App installieren" oder "Script-App installieren".
            </div>
          </div>

          {/* Safari macOS */}
          <div style={{ padding: '14px 16px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 20 }}>🍎</span>
              <span style={{ fontWeight: 700, fontSize: 13 }}>Safari (macOS)</span>
              <span style={{
                marginLeft: 'auto', background: `${C.orange}22`, color: C.orange,
                fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
              }}>Eingeschränkt</span>
            </div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
              Datei-Menü → "Zum Dock hinzufügen…" (macOS Sonoma+).
              <br />
              <span style={{ color: C.orange }}>
                Einschränkung: Safari auf macOS unterstützt keinen automatischen Install-Button — der Button im
                Benutzer-Menü erscheint deshalb nicht. Die manuelle Methode oben ist der Weg.
              </span>
            </div>
          </div>

          {/* iOS */}
          <div style={{ padding: '14px 16px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 20 }}>📱</span>
              <span style={{ fontWeight: 700, fontSize: 13 }}>Safari (iOS / iPadOS)</span>
              <span style={{
                marginLeft: 'auto', background: `${C.orange}22`, color: C.orange,
                fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
              }}>Manuell</span>
            </div>
            <ol style={{ fontSize: 12, color: C.muted, lineHeight: 1.8, margin: 0, paddingLeft: 18 }}>
              <li>Antippen: <strong>Teilen</strong> <span style={{ fontSize: 14 }}>⎙</span> in der Safari-Menüleiste</li>
              <li><strong>Zum Home-Bildschirm hinzufügen</strong> wählen</li>
              <li>Namen bestätigen → <strong>Hinzufügen</strong></li>
            </ol>
            <div style={{ fontSize: 11, color: C.orange, marginTop: 8 }}>
              Nur Safari unterstützt PWAs auf iOS. Chrome/Firefox auf iOS können die App nicht installieren.
            </div>
          </div>

          {/* Firefox */}
          <div style={{ padding: '14px 16px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 20 }}>🦊</span>
              <span style={{ fontWeight: 700, fontSize: 13 }}>Firefox (Desktop)</span>
              <span style={{
                marginLeft: 'auto', background: `${C.gray}22`, color: C.gray,
                fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
              }}>Nicht unterstützt</span>
            </div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
              Firefox Desktop unterstützt PWA-Installation nicht nativ. Der Benutzer-Menü-Button
              erscheint daher nicht. Für die beste Erfahrung: Chrome oder Edge verwenden.
            </div>
          </div>

        </div>
      </Section>

      {/* Deinstallation */}
      <Section title="3. Deinstallation — was passiert">
        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7, marginBottom: 16 }}>
          Wenn du "Offline-Version deinstallieren" im Benutzer-Menü klickst, passiert Folgendes automatisch:
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {[
            { icon: '🔌', title: 'Service Worker deregistriert', desc: 'Der Hintergrunddienst, der Caching und Offline-Zugriff ermöglicht, wird entfernt.' },
            { icon: '🗑️', title: 'Lokale Caches geleert', desc: 'Alle zwischengespeicherten Dateien (App-Shell, API-Daten) werden gelöscht.' },
            { icon: '🔐', title: 'Auth-Daten bleiben (Standard)', desc: 'Du bleibst eingeloggt. Optional kannst du auch Registrierungsdaten (Einstellungen, Theme) löschen.' },
          ].map(item => (
            <div key={item.title} style={{
              display: 'flex', gap: 12, padding: '10px 14px',
              borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface,
            }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{item.icon}</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 2 }}>{item.title}</div>
                <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Wichtiger Hinweis: Icon */}
        <div style={{
          padding: '12px 14px', borderRadius: 8,
          border: `1px solid ${C.blue}44`, background: `${C.blue}08`,
          fontSize: 12, lineHeight: 1.6,
        }}>
          <strong style={{ color: C.blue }}>Das App-Icon bleibt erhalten — das ist gewollt.</strong>
          <p style={{ margin: '6px 0 0', color: C.muted }}>
            Das Desktop- oder Home-Screen-Icon ist nur eine Verknüpfung zur URL — kein eigenständiges Programm.
            Nach der Deinstallation öffnet ein Klick auf das Icon die App wieder normal im Browser.
            Wenn du die Offline-Version wieder möchtest, klicke einfach erneut auf "Offline-Version installieren".
            Du musst das Icon <em>nicht</em> löschen — aber du kannst es, wenn du möchtest.
          </p>
        </div>

        {/* Icon manuell entfernen */}
        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8, color: C.muted }}>
            Icon manuell entfernen (optional):
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { browser: 'Chrome / Edge (Desktop)', steps: 'Einstellungen → Apps → Script-App → Deinstallieren. Oder: Menü im App-Fenster → "Script-App deinstallieren".' },
              { browser: 'Safari (macOS)', steps: 'Rechtsklick auf das Dock-Icon → Optionen → "Aus dem Dock entfernen". Oder: Datei → Schließen.' },
              { browser: 'iOS / iPadOS', steps: 'Langes Drücken auf das Icon → "App entfernen" → "Lesezeichen löschen".' },
              { browser: 'Android', steps: 'Langes Drücken auf das Icon → "Deinstallieren" oder Gerät-Einstellungen → Apps.' },
            ].map((item, i) => (
              <div key={i} style={{
                padding: '8px 12px', borderRadius: 7,
                border: `1px solid ${C.border}`, fontSize: 11, color: C.muted,
              }}>
                <strong style={{ color: C.text }}>{item.browser}: </strong>{item.steps}
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* Updates */}
      <Section title="4. Updates — wie funktionieren sie">
        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7, marginBottom: 16 }}>
          PWA-Updates passieren <strong>nicht automatisch im Hintergrund</strong> (bewusste Entscheidung —
          wir wollen kein plötzliches Neuladen mitten in der Arbeit).
        </div>

        {/* Update-Flow Diagramm */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 0,
          marginBottom: 20, fontSize: 11, overflowX: 'auto',
        }}>
          {[
            { icon: '🚀', label: 'Admin deployt neue Version' },
            { arrow: true },
            { icon: '🔄', label: 'Neuer SW lädt im Hintergrund' },
            { arrow: true },
            { icon: '💬', label: 'Toast erscheint: "Neue Version"' },
            { arrow: true },
            { icon: '✅', label: 'User klickt "Aktualisieren" → Reload' },
          ].map((step, i) => (
            'arrow' in step ? (
              <div key={i} style={{ color: C.border, fontSize: 18, padding: '0 4px', flexShrink: 0 }}>→</div>
            ) : (
              <div key={i} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 6, padding: '10px 12px', borderRadius: 8,
                border: `1px solid ${C.border}`, background: C.surface,
                flexShrink: 0, minWidth: 100, textAlign: 'center',
              }}>
                <span style={{ fontSize: 20 }}>{step.icon}</span>
                <span style={{ color: C.muted, lineHeight: 1.4 }}>{step.label}</span>
              </div>
            )
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            {
              q: 'Was ist der Update-Toast?',
              a: 'Ein kleiner Hinweis unten rechts: "Neue Version verfügbar". Mit "Jetzt aktualisieren" wird der neue Service Worker aktiviert und die Seite neu geladen. Mit "Später" verschwindet der Hinweis bis zum nächsten Neustart.',
            },
            {
              q: 'Was passiert wenn ich auf "Später" klicke?',
              a: 'Du arbeitest weiter mit der alten Version. Beim nächsten Öffnen der App erscheint der Toast wieder — oder du lädst die Seite manuell neu.',
            },
            {
              q: 'Admin kann Update erzwingen',
              a: 'Administratoren können in den Admin-Einstellungen → App / PWA einen "Update-Befehl" setzen. Beim nächsten Öffnen der App wird dann der neue SW aktiviert und die Seite automatisch neu geladen.',
            },
          ].map((item, i) => (
            <div key={i} style={{
              borderRadius: 8, border: `1px solid ${C.border}`, overflow: 'hidden',
            }}>
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                style={{
                  width: '100%', display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', padding: '10px 14px', background: C.surface,
                  border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  color: C.text, textAlign: 'left',
                }}
              >
                {item.q}
                <span style={{ color: C.muted, fontSize: 16 }}>{openFaq === i ? '−' : '+'}</span>
              </button>
              {openFaq === i && (
                <div style={{
                  padding: '10px 14px', fontSize: 12, color: C.muted,
                  lineHeight: 1.6, borderTop: `1px solid ${C.border}`,
                  background: C.subtle,
                }}>
                  {item.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* Browser-Kompatibilität Tabelle */}
      <Section title="5. Browser-Kompatibilität">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${C.border}` }}>
                {['Browser / Platform', 'Installieren', 'Offline', 'Update-Toast', 'Admin-Steuerung', 'Anmerkung'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontWeight: 600, color: C.text, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { browser: 'Chrome (Desktop)', install: '✅ Auto-Button', offline: '✅', toast: '✅', admin: '✅', note: 'Beste Erfahrung' },
                { browser: 'Edge (Desktop)', install: '✅ Auto-Button', offline: '✅', toast: '✅', admin: '✅', note: 'Wie Chrome' },
                { browser: 'Safari (macOS)', install: '⚠️ Manuell (Dock)', offline: '⚠️ Eingeschränkt', toast: '✅', admin: '⚠️ Nur Reload', note: 'Sonoma+ für Dock-Install' },
                { browser: 'Safari (iOS)', install: '⚠️ Manuell (Teilen)', offline: '✅', toast: '✅', admin: '⚠️ Nur Reload', note: 'Nur Safari, kein Chrome/FF' },
                { browser: 'Chrome (Android)', install: '✅ Auto-Button', offline: '✅', toast: '✅', admin: '✅', note: '' },
                { browser: 'Firefox (Desktop)', install: '❌ Kein Support', offline: '—', toast: '—', admin: '—', note: 'Add-on nötig' },
              ].map((row, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? 'transparent' : C.subtle }}>
                  <td style={{ padding: '8px 10px', fontWeight: 600 }}>{row.browser}</td>
                  <td style={{ padding: '8px 10px', color: C.muted }}>{row.install}</td>
                  <td style={{ padding: '8px 10px', color: C.muted }}>{row.offline}</td>
                  <td style={{ padding: '8px 10px', color: C.muted }}>{row.toast}</td>
                  <td style={{ padding: '8px 10px', color: C.muted }}>{row.admin}</td>
                  <td style={{ padding: '8px 10px', color: C.muted, fontSize: 11 }}>{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* FAQ */}
      <Section title="6. Häufige Fragen">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            {
              q: 'Was passiert wenn ich das Icon nicht lösche nach der Deinstallation?',
              a: 'Gar nichts Schlimmes. Das Icon öffnet die App weiterhin — nur als normale Website im Browser, ohne Service Worker. Möchtest du die Offline-Version wieder, klicke einfach auf "Offline-Version installieren" im Benutzer-Menü. Das Icon funktioniert danach wieder als PWA-Verknüpfung.',
            },
            {
              q: 'Muss ich mich nach der Deinstallation neu einloggen?',
              a: 'Nein — Auth-Daten (der Login-Cookie) bleiben erhalten, es sei denn du aktivierst explizit die Checkbox "Auch Registrierungsdaten löschen".',
            },
            {
              q: 'Warum erscheint kein "Installieren"-Button?',
              a: 'Mögliche Gründe: (1) Du verwendest Firefox Desktop — dort kein PWA-Support. (2) Du verwendest Safari auf macOS/iOS — dort kein automatisches Browser-Prompt. (3) Die App ist bereits installiert. (4) Du hast das Install-Prompt vor kurzem abgelehnt — der Browser zeigt es dann erst nach einigen Tagen wieder.',
            },
            {
              q: 'Werden meine Daten lokal gespeichert?',
              a: 'Ja — Szeneninhalte aus dem letzten Online-Besuch werden im Browser-Cache gespeichert (via Service Worker). Diese Daten sind gerätespezifisch, nicht serverseitig. Bei der Deinstallation werden sie gelöscht.',
            },
            {
              q: 'Kann ein Admin die App auf meinem Gerät deinstallieren?',
              a: 'Admin kann einen Deinstallations-Befehl setzen, der beim nächsten Öffnen der App ausgeführt wird. Das entfernt Service Worker und Cache — aber nicht das App-Icon vom Desktop. Das kann nur der User selbst tun.',
            },
            {
              q: 'Was ist der Unterschied zwischen "App schließen" und "App deinstallieren"?',
              a: '"App schließen" beendet nur das Fenster — der Service Worker läuft weiterhin im Hintergrund (für Offline-Cache). "App deinstallieren" entfernt den Service Worker und alle Caches dauerhaft. Danach ist die App nur noch eine normale Website.',
            },
          ].map((item, i) => (
            <div key={i} style={{ borderRadius: 8, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
              <button
                onClick={() => setOpenHint(openHint === i ? null : i)}
                style={{
                  width: '100%', display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', padding: '10px 14px', background: C.surface,
                  border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  color: C.text, textAlign: 'left', gap: 8,
                }}
              >
                <span>{item.q}</span>
                <span style={{ color: C.muted, fontSize: 16, flexShrink: 0 }}>{openHint === i ? '−' : '+'}</span>
              </button>
              {openHint === i && (
                <div style={{
                  padding: '10px 14px', fontSize: 12, color: C.muted,
                  lineHeight: 1.6, borderTop: `1px solid ${C.border}`, background: C.subtle,
                }}>
                  {item.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>

    </div>
  )
}

export default PwaInstallationTab
