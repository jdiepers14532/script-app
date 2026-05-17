import { useState, useEffect } from 'react'
import { C, Badge, Tag, TableCard, Arrow, Section, FaqItem, InfoBox, WarnBox, Connector, FieldBox } from './_shared'

function PotenzielleFehldrTab() {
  const [localSearch, setLocalSearch] = useState('')

  const FAQS: { kategorie: string; farbe: string; items: { q: string; a: React.ReactNode }[] }[] = [
    {
      kategorie: '🔐 Authentifizierung & Session',
      farbe: C.orange,
      items: [
        {
          q: '„Update on reload" in DevTools aktiviert → Einloggen schlägt fehl',
          a: (
            <>
              <p style={{ margin: '8px 0 6px' }}><strong>Ursache:</strong> Chrome DevTools → Application → Service Workers → „Update on reload" erzwingt bei jedem Seitenaufruf eine neue SW-Aktivierung. Wenn gleichzeitig die Auth-Session abgelaufen ist (HTTP 401), kann der SW-Update-Cycle die Login-Weiterleitung zu <code>auth.serienwerft.studio</code> unterbrechen.</p>
              <p style={{ margin: '6px 0 4px' }}><strong>Lösung:</strong></p>
              <ol style={{ paddingLeft: 20, margin: '4px 0 8px', lineHeight: 1.9 }}>
                <li>DevTools → Application → Service Workers → <strong>„Update on reload" deaktivieren</strong></li>
                <li>DevTools → Application → Storage → <strong>„Clear site data"</strong> klicken</li>
                <li>DevTools schließen</li>
                <li>Direkt <strong>auth.serienwerft.studio</strong> aufrufen und einloggen</li>
                <li>Dann zu <strong>script.serienwerft.studio</strong> navigieren</li>
              </ol>
              <p style={{ color: C.muted, fontSize: 12, margin: '6px 0 0', padding: '8px 10px', background: C.border + '33', borderRadius: 6 }}>
                <strong>Hinweis:</strong> „Update on reload" ist ein Entwickler-Tool und sollte im normalen Betrieb nie aktiviert sein.
              </p>
            </>
          ),
        },
        {
          q: 'Session abgelaufen — App zeigt Fehler oder leere Ansicht',
          a: (
            <>
              <p style={{ margin: '8px 0 6px' }}><strong>Ursache:</strong> Das Auth-Cookie (JWT) hat eine begrenzte Lebensdauer. Bei Inaktivität oder nach Server-Neustarts kann die Session ablaufen. Die App antwortet dann mit HTTP 401 und leitet zur Login-Seite weiter.</p>
              <p style={{ margin: '6px 0 4px' }}><strong>Lösung:</strong></p>
              <ol style={{ paddingLeft: 20, margin: '4px 0 8px', lineHeight: 1.9 }}>
                <li><strong>auth.serienwerft.studio</strong> direkt aufrufen</li>
                <li>Einloggen (Cookie wird für <code>.serienwerft.studio</code> gesetzt)</li>
                <li>Zurück zu <strong>script.serienwerft.studio</strong> navigieren</li>
              </ol>
              <p style={{ color: C.muted, fontSize: 12, margin: '6px 0 0' }}>Im Nginx-Log erkennbar als <code>GET /api/... → 401 Unauthorized</code>.</p>
            </>
          ),
        },
        {
          q: 'Login-Weiterleitung funktioniert nicht (Endlosschleife oder leere Seite)',
          a: (
            <>
              <p style={{ margin: '8px 0 6px' }}><strong>Ursache:</strong> Die <code>redirect</code>-URL enthält Sonderzeichen die nicht korrekt kodiert wurden, oder der Cookie wird durch SameSite-Einschränkungen beim Cross-Origin-Redirect nicht mitgeschickt.</p>
              <p style={{ margin: '6px 0 4px' }}><strong>Lösung:</strong></p>
              <ol style={{ paddingLeft: 20, margin: '4px 0 8px', lineHeight: 1.9 }}>
                <li>Browser-Cache leeren: <strong>Ctrl+Shift+Delete</strong></li>
                <li>Manuell <strong>auth.serienwerft.studio</strong> öffnen, einloggen</li>
                <li>Dann manuell zu <strong>script.serienwerft.studio</strong> navigieren (nicht über Redirect)</li>
                <li>Falls Problem anhält: alle Cookies für <code>.serienwerft.studio</code> löschen und neu einloggen</li>
              </ol>
            </>
          ),
        },
      ],
    },
    {
      kategorie: '⚙️ Service Worker & Cache',
      farbe: C.blue,
      items: [
        {
          q: 'App lädt sich nach jedem Reload sofort neu (Update-Loop)',
          a: (
            <>
              <p style={{ margin: '8px 0 6px' }}><strong>Ursache:</strong> Kombination aus aktiviertem „Update on reload" + kürzlich deploytem Frontend. Eine neue <code>sw.js</code> installiert sich → <code>skipWaiting()</code> → App zeigt Update-Toast → nach Klick Reload → neue SW → Schleife.</p>
              <p style={{ margin: '6px 0 4px' }}><strong>Lösung:</strong></p>
              <ol style={{ paddingLeft: 20, margin: '4px 0 8px', lineHeight: 1.9 }}>
                <li>DevTools schließen (oder „Update on reload" deaktivieren)</li>
                <li>DevTools → Application → Service Workers → <strong>Unregister</strong></li>
                <li>Hard Reload: <strong>Ctrl+Shift+R</strong></li>
              </ol>
              <p style={{ color: C.muted, fontSize: 12, margin: '6px 0 0', padding: '8px 10px', background: C.border + '33', borderRadius: 6 }}>
                <strong>Achtung:</strong> Nach Unregister im DevTools-Offline-Simulator (<code>navigator.onLine = false</code>) kann normaler Reload fehlschlagen. DevTools-Tab schließen und neuen Browser-Tab öffnen.
              </p>
            </>
          ),
        },
        {
          q: 'Veraltete Daten werden angezeigt (Stale Cache)',
          a: (
            <>
              <p style={{ margin: '8px 0 6px' }}><strong>Ursache:</strong> Die Script-App nutzt Workbox (NetworkFirst für Produktionen/Folgen, StaleWhileRevalidate für Szenen). Bei Netzwerkproblemen oder kurz nach einem Deploy können veraltete Inhalte aus dem Cache geliefert werden.</p>
              <p style={{ margin: '6px 0 4px' }}><strong>Lösung:</strong></p>
              <ol style={{ paddingLeft: 20, margin: '4px 0 8px', lineHeight: 1.9 }}>
                <li><strong>Hard Reload</strong>: Ctrl+Shift+R (umgeht Cache für diese Anfrage)</li>
                <li>DevTools → Application → Storage → <strong>Clear site data</strong></li>
                <li>Nach einem Deploy: Update-Toast erscheint automatisch → <strong>„Jetzt aktualisieren"</strong> klicken</li>
              </ol>
            </>
          ),
        },
        {
          q: 'Service Worker lässt sich nicht deinstallieren / reagiert nicht',
          a: (
            <>
              <p style={{ margin: '8px 0 6px' }}><strong>Ursache:</strong> SW ist in einem Fehlerzustand (z.B. Install-Phase hängt, Netzwerkfehler beim Precaching).</p>
              <p style={{ margin: '6px 0 4px' }}><strong>Lösung:</strong></p>
              <ol style={{ paddingLeft: 20, margin: '4px 0 8px', lineHeight: 1.9 }}>
                <li>Chrome: <code>chrome://serviceworker-internals</code> öffnen</li>
                <li>Eintrag für <code>script.serienwerft.studio</code> suchen</li>
                <li><strong>„Stop"</strong> → dann <strong>„Unregister"</strong> klicken</li>
                <li>Browser neu starten, Seite aufrufen</li>
              </ol>
              <p style={{ color: C.muted, fontSize: 12, margin: '6px 0 0' }}>Alternative: Inkognito-Fenster öffnen (kein aktiver SW) und dort einloggen.</p>
            </>
          ),
        },
        {
          q: 'Offline-Queue synchronisiert nicht nach Reconnect',
          a: (
            <>
              <p style={{ margin: '8px 0 6px' }}><strong>Ursache:</strong> Sync-Queue wurde gespeichert, aber beim Reconnect schlägt der Backend-Endpoint fehl — z.B. Session in der Zwischenzeit abgelaufen oder Backend-Neustart.</p>
              <p style={{ margin: '6px 0 4px' }}><strong>Lösung:</strong></p>
              <ol style={{ paddingLeft: 20, margin: '4px 0 8px', lineHeight: 1.9 }}>
                <li>Netzwerkstatus prüfen (grüner Punkt rechts oben im Header)</li>
                <li>Kurz warten — automatischer Retry alle 30 Sekunden</li>
                <li>Falls Session abgelaufen: neu einloggen, App verarbeitet Queue danach automatisch</li>
                <li>Bei anhaltenden Problemen: Tab offen lassen, <strong>nicht neu laden</strong> (Queue würde geleert)</li>
              </ol>
            </>
          ),
        },
      ],
    },
    {
      kategorie: '🖥 Backend & Server',
      farbe: C.red,
      items: [
        {
          q: 'API antwortet nicht (502 Bad Gateway / 503 Service Unavailable)',
          a: (
            <>
              <p style={{ margin: '8px 0 6px' }}><strong>Ursache:</strong> PM2-Prozess <code>script-backend</code> abgestürzt oder nginx erreicht Port 3014 nicht.</p>
              <p style={{ margin: '6px 0 4px' }}><strong>Diagnose & Lösung (SSH auf Server):</strong></p>
              <ol style={{ paddingLeft: 20, margin: '4px 0 8px', lineHeight: 1.9 }}>
                <li><code>pm2 status</code> → prüfen ob <code>script-backend</code> (id:31) <code>online</code></li>
                <li><code>pm2 logs script-backend --lines 50</code> → Fehlermeldungen lesen</li>
                <li><code>pm2 restart script-backend</code> falls Prozess gestoppt/fehlernd</li>
                <li><code>curl -s http://127.0.0.1:3014/api/health</code> → sollte <code>200</code> liefern</li>
                <li>Falls nginx-Problem: <code>nginx -t &amp;&amp; systemctl reload nginx</code></li>
              </ol>
            </>
          ),
        },
        {
          q: 'Hocuspocus WebSocket-Verbindung bricht ständig ab',
          a: (
            <>
              <p style={{ margin: '8px 0 6px' }}><strong>Ursache:</strong> WebSocket-Verbindungen sind anfälliger für Netzwerkunterbrechungen als HTTP. Mögliche Ursachen: Proxy-Timeout, nginx-Config, Session-Ablauf, Server-Neustart.</p>
              <p style={{ margin: '6px 0 4px' }}><strong>Lösung:</strong></p>
              <ol style={{ paddingLeft: 20, margin: '4px 0 8px', lineHeight: 1.9 }}>
                <li>Verbindungsstatus im Header prüfen (grün = verbunden)</li>
                <li>Kurz warten — automatischer Reconnect innerhalb ~10s</li>
                <li>Nginx-Config: <code>/ws/collab</code> braucht <code>proxy_read_timeout 86400s</code> + <code>Upgrade</code>-Header</li>
                <li>Server-seitig: <code>pm2 logs script-backend</code> auf WebSocket-Fehler prüfen</li>
              </ol>
            </>
          ),
        },
        {
          q: 'Migration schlägt beim Backend-Start fehl',
          a: (
            <>
              <p style={{ margin: '8px 0 6px' }}><strong>Ursache:</strong> Eine neue Migration ist inkompatibel mit dem aktuellen DB-Schema (Spalte existiert bereits, FK-Constraint verletzt o.ä.).</p>
              <p style={{ margin: '6px 0 4px' }}><strong>Lösung:</strong></p>
              <ol style={{ paddingLeft: 20, margin: '4px 0 8px', lineHeight: 1.9 }}>
                <li><code>pm2 logs script-backend --lines 100</code> → Migrations-Fehler lesen</li>
                <li>Migrations-SQL manuell prüfen: <code>psql -U script_user -d script_db</code></li>
                <li>Migration korrigieren, neues Deploy auslösen</li>
              </ol>
              <p style={{ color: C.muted, fontSize: 12, margin: '6px 0 0' }}>Migrationen laufen automatisch beim Backend-Start. Aktuelle Version: v77.</p>
            </>
          ),
        },
      ],
    },
    {
      kategorie: '🔧 Best Practices & Architektur',
      farbe: C.green,
      items: [
        {
          q: 'Ist der Auth-Ansatz (Cookie-Redirect) best practice — oder kann man das verbessern?',
          a: (
            <>
              <p style={{ margin: '8px 0 8px' }}>Der Redirect-Flow (<code>script → auth.serienwerft.studio → script</code>) ist ein Standard-Pattern für Shared-Domain Cookie-Auth und grundsätzlich solide. Folgende Punkte können verbessert werden:</p>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 4 }}>
                <thead>
                  <tr style={{ background: C.subtle }}>
                    {['Aspekt', 'Aktuell', 'Verbesserungspotenzial'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '7px 10px', borderBottom: `1px solid ${C.border}`, fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { aspekt: 'skipWaiting()', aktuell: 'Automatisch bei jedem SW-Install', besser: 'Nur auf explizite User-Aktion (Toast-Klick) — verhindert Versions-Mismatch bei mehreren offenen Tabs' },
                    { aspekt: 'Redirect-URL', aktuell: 'In URL-Parameter (sichtbar)', besser: 'Zusätzlich in sessionStorage sichern — widerstandsfähiger gegen SW-Interferenz' },
                    { aspekt: 'Token-Refresh', aktuell: 'Kein automatisches Refresh', besser: 'Silent Refresh 5min vor Ablauf — verhindert unerwarteten 401 mitten in der Arbeit' },
                    { aspekt: 'Auth-Check', aktuell: 'Nach App-Load (kurzer Flicker)', besser: 'Proaktiver Check im App-Init vor dem ersten Render' },
                  ].map((r, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: '7px 10px', fontWeight: 600 }}>{r.aspekt}</td>
                      <td style={{ padding: '7px 10px', color: C.muted }}>{r.aktuell}</td>
                      <td style={{ padding: '7px 10px', color: C.green }}>{r.besser}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ color: C.muted, fontSize: 12, margin: '10px 0 0' }}>
                Priorität: <strong>Token-Refresh</strong> hat den größten User-Impact (verhindert unerwartet Session-Ablauf). <strong>skipWaiting</strong>-Änderung ist die solideste Architektur-Verbesserung.
              </p>
            </>
          ),
        },
        {
          q: 'Warum erscheint sw.js so oft im Nginx-Access-Log?',
          a: (
            <>
              <p style={{ margin: '8px 0 6px' }}>Browser prüfen automatisch alle <strong>24 Stunden</strong> auf SW-Updates (oder bei jedem Reload wenn „Update on reload" aktiv). Workbox registriert zusätzlich einen <code>updatefound</code>-Listener.</p>
              <p style={{ margin: '6px 0 0' }}>Die häufigen <code>GET /sw.js 200</code>-Einträge im Log sind <strong>normal und kein Performance-Problem</strong> — sw.js ist nur ~7 KB und wird mit <code>Cache-Control: no-cache</code> ausgeliefert, sodass immer die aktuelle Version geprüft wird.</p>
            </>
          ),
        },
        {
          q: 'DevTools-Features, die nur Entwickler nutzen sollten',
          a: (
            <>
              <p style={{ margin: '8px 0 8px' }}>Folgende DevTools-Optionen können im normalen Betrieb Probleme verursachen:</p>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: C.subtle }}>
                    {['Feature', 'Wo', 'Effekt'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '7px 10px', borderBottom: `1px solid ${C.border}`, fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { f: 'Update on reload', wo: 'Application → Service Workers', effekt: 'Erzwingt SW-Update bei jedem Reload → potenzielle Login-Probleme' },
                    { f: 'Bypass for network', wo: 'Application → Service Workers', effekt: 'SW wird komplett umgangen, keine Offline-Funktionalität' },
                    { f: 'Offline (Network-Tab)', wo: 'Network → Throttling', effekt: 'Setzt navigator.onLine = false → nach Unregister kein Reload möglich' },
                  ].map((r, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: '7px 10px', fontWeight: 600, color: C.red }}>{r.f}</td>
                      <td style={{ padding: '7px 10px', color: C.muted, fontSize: 11 }}>{r.wo}</td>
                      <td style={{ padding: '7px 10px' }}>{r.effekt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ color: C.muted, fontSize: 12, margin: '10px 0 0' }}>Bei Problemen: DevTools schließen und Seite neu laden ist oft der schnellste Fix.</p>
            </>
          ),
        },
      ],
    },
  ]

  const lq = localSearch.trim().toLowerCase()
  const filteredFaqs = lq.length >= 2
    ? FAQS.map(kat => ({
        ...kat,
        items: kat.items.filter(item => item.q.toLowerCase().includes(lq)),
      })).filter(kat => kat.items.length > 0)
    : FAQS

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 6px' }}>Potenzielle Fehler</h1>
        <p style={{ color: C.muted, fontSize: 13, margin: '0 0 16px', lineHeight: 1.6 }}>
          Häufige Probleme und deren Lösungen — klicke auf eine Frage zum Aufklappen.
        </p>
        <div style={{ position: 'relative', maxWidth: 480 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.muted, fontSize: 13, pointerEvents: 'none' }}>🔍</span>
          <input
            type="text"
            placeholder="In diesen FAQs suchen…"
            value={localSearch}
            onChange={e => setLocalSearch(e.target.value)}
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '9px 32px 9px 32px',
              border: `1px solid ${lq.length >= 2 ? C.blue + '66' : C.border}`,
              borderRadius: 8, fontSize: 13,
              background: 'var(--bg-main)', color: C.text, outline: 'none',
              transition: 'border-color 0.15s',
            }}
          />
          {localSearch && (
            <button onClick={() => setLocalSearch('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 16, lineHeight: 1 }}>×</button>
          )}
        </div>
      </div>

      {lq.length >= 2 && filteredFaqs.length === 0 && (
        <p style={{ color: C.muted, fontSize: 13 }}>Keine Treffer für „{localSearch}".</p>
      )}

      {filteredFaqs.map(kat => (
        <section key={kat.kategorie} style={{ marginBottom: 36 }}>
          <h2 style={{
            fontSize: 11, fontWeight: 700, margin: '0 0 12px',
            paddingBottom: 8, borderBottom: `2px solid ${kat.farbe}`,
            color: kat.farbe, letterSpacing: 0.5, textTransform: 'uppercase',
          }}>
            {kat.kategorie}
          </h2>
          {kat.items.map((item, i) => (
            <FaqItem key={i} q={item.q} a={item.a} />
          ))}
        </section>
      ))}
    </div>
  )
}


export default PotenzielleFehldrTab
